# Benefit's Toolkit popup (Windows, WPF). Started detached by dispatch.ps1
# (or by the extension's "Test popup") with the path of a JSON job file:
#   { title, subtitle, color, cli, folder, seconds }
# A small card in the project's color, bottom-right, stacked under any
# popups already showing. It never takes focus by itself; clicking it runs
# "<cli> <folder>", which brings that project's editor window to the front.
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8
# scripts as ANSI.
param([string]$JobFile)

$ErrorActionPreference = "Stop"
$stateDir = Split-Path -Parent (Split-Path -Parent $JobFile)
$slotFile = $null
try {
    $job = Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
    Remove-Item -LiteralPath $JobFile -Force -ErrorAction SilentlyContinue

    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
    Add-Type -Namespace BenefitToolkit -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int processId);'

    # Stack position: the lowest slot no live popup holds.
    $slotsDir = Join-Path $stateDir "popup-slots"
    New-Item -ItemType Directory -Force -Path $slotsDir | Out-Null
    $slot = 0
    for (; $slot -lt 4; $slot++) {
        $candidate = Join-Path $slotsDir "$slot"
        if (-not (Test-Path -LiteralPath $candidate)) { break }
        $owner = 0
        [void][int]::TryParse(((Get-Content -LiteralPath $candidate -Raw) -as [string]).Trim(), [ref]$owner)
        if (-not ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue))) { break }
    }
    if ($slot -ge 4) { $slot = 3 }
    $slotFile = Join-Path $slotsDir "$slot"
    Set-Content -LiteralPath $slotFile -Value $PID -Encoding ASCII

    # Colors: the card is the window color; text is dark or light by luminance
    # (same threshold as foregroundFor() in color-utils.ts).
    $hex = [string]$job.color
    if ($hex -notmatch '^#[0-9a-fA-F]{6}$') { $hex = "#047857" }
    $r = [Convert]::ToInt32($hex.Substring(1, 2), 16) / 255.0
    $g = [Convert]::ToInt32($hex.Substring(3, 2), 16) / 255.0
    $b = [Convert]::ToInt32($hex.Substring(5, 2), 16) / 255.0
    $luminance = 0.2126 * $r + 0.7152 * $g + 0.0722 * $b
    $fgHex = if ($luminance -gt 0.45) { "#15202B" } else { "#FFFFFF" }
    $converter = New-Object System.Windows.Media.BrushConverter
    $bgBrush = $converter.ConvertFromString($hex)
    $fgBrush = $converter.ConvertFromString($fgHex)

    $width = 320
    $height = 84
    [xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False" ResizeMode="NoResize"
        Width="$width" Height="$height" FontFamily="Segoe UI">
  <Border x:Name="Card" CornerRadius="12" Margin="10" Padding="16,10,8,10" Cursor="Hand">
    <Border.Effect><DropShadowEffect BlurRadius="16" ShadowDepth="2" Opacity="0.35"/></Border.Effect>
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="*"/>
        <ColumnDefinition Width="Auto"/>
      </Grid.ColumnDefinitions>
      <StackPanel x:Name="Texts" Grid.Column="0" VerticalAlignment="Center">
        <TextBlock x:Name="TitleText" FontSize="15" FontWeight="Bold" TextTrimming="CharacterEllipsis"/>
        <TextBlock x:Name="SubtitleText" FontSize="12.5" Margin="0,2,0,0" Opacity="0.85" TextTrimming="CharacterEllipsis"/>
      </StackPanel>
      <Button x:Name="CloseButton" Grid.Column="1" Width="24" Height="24" VerticalAlignment="Top"
              Background="Transparent" BorderThickness="0" FontSize="15" Cursor="Arrow" Focusable="False" Padding="0"/>
    </Grid>
  </Border>
</Window>
"@
    $window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
    $card = $window.FindName("Card")
    $titleText = $window.FindName("TitleText")
    $subtitleText = $window.FindName("SubtitleText")
    $closeButton = $window.FindName("CloseButton")

    $card.Background = $bgBrush
    $titleText.Foreground = $fgBrush
    $subtitleText.Foreground = $fgBrush
    $closeButton.Foreground = $fgBrush
    $closeButton.Content = [string][char]0x00D7
    $titleText.Text = [string]$job.title
    $subtitleText.Text = [string]$job.subtitle
    # Hebrew (or Arabic) project names read right to left; the subtitle
    # follows so both lines align.
    $rtlPattern = "[" + [char]0x0590 + "-" + [char]0x05FF + [char]0x0600 + "-" + [char]0x06FF + "]"
    if ([string]$job.title -match $rtlPattern) { $window.FindName("Texts").FlowDirection = "RightToLeft" }

    $workArea = [System.Windows.SystemParameters]::WorkArea
    $window.Left = $workArea.Right - $width - 6
    $window.Top = $workArea.Bottom - ($height * ($slot + 1)) - 6

    # Countdown, paused while the mouse is over the card.
    $script:remaining = [double]$job.seconds
    if ($script:remaining -le 0) { $script:remaining = 8 }
    $script:hovering = $false
    $timer = New-Object System.Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(250)
    $timer.Add_Tick({
        if (-not $script:hovering) {
            $script:remaining -= 0.25
            if ($script:remaining -le 0) { $window.Close() }
        }
    })
    $window.Add_MouseEnter({ $script:hovering = $true })
    $window.Add_MouseLeave({ $script:hovering = $false })

    $closeButton.Add_Click({ $window.Close() })
    $card.Add_MouseLeftButtonUp({
        try {
            $cli = [string]$job.cli
            $folder = [string]$job.folder
            if ($cli -and $folder -and (Test-Path -LiteralPath $cli)) {
                # The click made this process the foreground one; pass that
                # right on so the editor may raise its window.
                [void][BenefitToolkit.Native]::AllowSetForegroundWindow(-1)
                Start-Process -FilePath $cli -ArgumentList ('"' + $folder + '"') -WindowStyle Hidden
            }
        } catch {}
        $window.Close()
    })
    $window.Add_Closed({
        $timer.Stop()
        if ($slotFile) { Remove-Item -LiteralPath $slotFile -Force -ErrorAction SilentlyContinue }
    })

    $timer.Start()
    $app = New-Object System.Windows.Application
    $app.ShutdownMode = "OnMainWindowClose"
    [void]$app.Run($window)
} catch {
    try {
        Add-Content -LiteralPath (Join-Path $stateDir "dispatch.log") -Value ("{0:yyyy-MM-dd HH:mm:ss} [popup] {1}" -f (Get-Date), $_.Exception.Message) -Encoding UTF8
    } catch {}
    if ($slotFile) { Remove-Item -LiteralPath $slotFile -Force -ErrorAction SilentlyContinue }
}
