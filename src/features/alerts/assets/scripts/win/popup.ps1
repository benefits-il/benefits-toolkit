# Benefit's Toolkit popup (Windows, WPF). Started detached by dispatch.ps1
# (or by the extension's "Test popup") with the path of a JSON job file:
#   { agent, title, subtitle, kind, color, text, theme, cli, folder, seconds, stay, position }
# A small card in the toolkit's theme, top-right (or bottom-right with
# position "bottomRight", where Windows shows its own notifications), stacked
# away from the corner past any popups already showing: a tile with the mark of the agent that finished (Claude,
# Cursor or Antigravity, from marks/<agent>.png), the project name, and the
# status, framed in the project's color. A job without a mark gets the older
# tile: the project's color with a check (finished) or a bell (needs input).
# It never takes focus by itself; clicking it runs
# "<cli> <folder>", which brings that project's editor window to the front.
# The x just closes it. With "stay" it waits for one of the two.
#   -RenderTo <png>: draw the card into an image and exit, without showing it
#   (for checking the design; the job file is kept).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8
# scripts as ANSI.
param([string]$JobFile, [string]$RenderTo = "")

$ErrorActionPreference = "Stop"
$stateDir = Split-Path -Parent (Split-Path -Parent $JobFile)
$slotFile = $null

# WCAG relative luminance of #rrggbb, for the fallback text color below.
function Get-Luminance([string]$hex) {
    $sum = 0.0
    $weights = @(0.2126, 0.7152, 0.0722)
    for ($i = 0; $i -lt 3; $i++) {
        $c = [Convert]::ToInt32($hex.Substring(1 + 2 * $i, 2), 16) / 255.0
        $lin = if ($c -le 0.03928) { $c / 12.92 } else { [Math]::Pow(($c + 0.055) / 1.055, 2.4) }
        $sum += $weights[$i] * $lin
    }
    return $sum
}

try {
    $job = Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $RenderTo) { Remove-Item -LiteralPath $JobFile -Force -ErrorAction SilentlyContinue }

    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
    Add-Type -Namespace BenefitToolkit -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int processId);'

    # Stack position: the lowest slot no live popup holds.
    $slot = 0
    if (-not $RenderTo) {
        $slotsDir = Join-Path $stateDir "popup-slots"
        New-Item -ItemType Directory -Force -Path $slotsDir | Out-Null
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
    }

    # The card's colors: the toolkit's theme (Graphite dark gray, cream light,
    # or high contrast). Same tokens as the sidebar. The frame takes the
    # project's color, except in high contrast.
    $themes = @{
        "dark"     = @{ bg = "#1F2120"; tile = "#2C302E"; line = "#363A38"; text = "#F6F4EA"; muted = "#A9B3AE"; done = "#8FD3B3"; waiting = "#FCD34D"; shadow = 0.45 }
        "light"    = @{ bg = "#FFFDF6"; tile = "#F1ECDD"; line = "#E6D9AE"; text = "#14231C"; muted = "#55635C"; done = "#047857"; waiting = "#92400E"; shadow = 0.18 }
        "hc-dark"  = @{ bg = "#000000"; tile = "#000000"; line = "#FFFFFF"; text = "#FFFFFF"; muted = "#FFFFFF"; done = "#FFFFFF"; waiting = "#FFFFFF"; shadow = 0 }
        "hc-light" = @{ bg = "#FFFFFF"; tile = "#FFFFFF"; line = "#000000"; text = "#000000"; muted = "#000000"; done = "#000000"; waiting = "#000000"; shadow = 0 }
    }
    $theme = $themes[[string]$job.theme]
    if (-not $theme) { $theme = $themes["dark"] }
    $waiting = ([string]$job.kind -eq "waiting")

    # The tile: the project's color, its icon in the text color the extension
    # worked out (white or near-black, whichever reads better). Older jobs have
    # no text color: work it out the same way here.
    $hex = [string]$job.color
    if ($hex -notmatch '^#[0-9a-fA-F]{6}$') { $hex = "#047857" }
    $tileText = [string]$job.text
    if ($tileText -notmatch '^#[0-9a-fA-F]{6}$') {
        $l = Get-Luminance $hex
        $whiteContrast = 1.05 / ($l + 0.05)
        $darkContrast = ($l + 0.05) / ((Get-Luminance "#15202B") + 0.05)
        $tileText = if ($whiteContrast -ge $darkContrast) { "#FFFFFF" } else { "#15202B" }
    }
    $converter = New-Object System.Windows.Media.BrushConverter
    $brush = { param($c) $converter.ConvertFromString($c) }

    # Tabler icons on a 24 grid: check for finished, bell for needs input.
    $checkPath = "M5,12 L10,17 L20,7"
    $bellPath = "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6 M9 17v1a3 3 0 0 0 6 0v-1"

    $width = 320
    $height = 84
    [xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False" ResizeMode="NoResize"
        Width="$width" Height="$height" FontFamily="Segoe UI">
  <Border x:Name="Card" CornerRadius="10" Margin="10" Padding="11" BorderThickness="2" Cursor="Hand">
    <Border.Effect><DropShadowEffect x:Name="Shadow" BlurRadius="18" ShadowDepth="3" Direction="270"/></Border.Effect>
    <Grid>
      <Grid.ColumnDefinitions>
        <ColumnDefinition Width="Auto"/>
        <ColumnDefinition Width="*"/>
        <ColumnDefinition Width="Auto"/>
      </Grid.ColumnDefinitions>
      <Border x:Name="Tile" Grid.Column="0" Width="34" Height="34" CornerRadius="8" VerticalAlignment="Center">
        <Grid>
          <Image x:Name="TileMark" Width="20" Height="20" RenderOptions.BitmapScalingMode="HighQuality" Visibility="Collapsed"/>
          <Viewbox x:Name="GlyphBox" Width="18" Height="18">
            <Canvas Width="24" Height="24">
              <Path x:Name="Glyph" StrokeThickness="2" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
            </Canvas>
          </Viewbox>
        </Grid>
      </Border>
      <StackPanel x:Name="Texts" Grid.Column="1" Margin="10,0,6,0" VerticalAlignment="Center">
        <TextBlock x:Name="TitleText" FontSize="13" FontWeight="SemiBold" TextTrimming="CharacterEllipsis"/>
        <TextBlock x:Name="SubtitleText" FontSize="11" Margin="0,1,0,0" TextTrimming="CharacterEllipsis"/>
      </StackPanel>
      <Button x:Name="CloseButton" Grid.Column="2" Width="24" Height="24" VerticalAlignment="Top" Margin="0,-6,-6,0"
              Cursor="Arrow" Focusable="False" ToolTip="Close">
        <Button.Template>
          <ControlTemplate TargetType="Button">
            <Border Background="Transparent"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
          </ControlTemplate>
        </Button.Template>
        <Viewbox Width="12" Height="12">
          <Canvas Width="24" Height="24">
            <Path x:Name="CloseGlyph" Data="M18,6 L6,18 M6,6 L18,18" StrokeThickness="2" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
          </Canvas>
        </Viewbox>
      </Button>
    </Grid>
  </Border>
</Window>
"@
    $window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
    $card = $window.FindName("Card")
    $tile = $window.FindName("Tile")
    $glyph = $window.FindName("Glyph")
    $titleText = $window.FindName("TitleText")
    $subtitleText = $window.FindName("SubtitleText")
    $closeButton = $window.FindName("CloseButton")
    $shadow = $window.FindName("Shadow")

    $card.Background = & $brush $theme.bg
    $highContrast = ([string]$job.theme).StartsWith("hc")
    $card.BorderBrush = & $brush $(if ($highContrast) { $theme.line } else { $hex })
    $shadow.Opacity = $theme.shadow
    $tile.Background = & $brush $hex
    $glyph.Stroke = & $brush $tileText
    $glyph.Data = [System.Windows.Media.Geometry]::Parse($(if ($waiting) { $bellPath } else { $checkPath }))
    # The agent's mark fills the tile, on a quiet surface, so who finished
    # shows at a glance; the project's color stays in the frame. Cursor's
    # one-color cube comes in the card's text color.
    $agent = [string]$job.agent
    if ($agent -match '^[a-z]+$') {
        $markName = if ($agent -eq "cursor") { if ([string]$job.theme -match "light") { "cursor-light.png" } else { "cursor-dark.png" } } else { "$agent.png" }
        $markFile = Join-Path (Join-Path $PSScriptRoot "marks") $markName
        if (Test-Path -LiteralPath $markFile) {
            $mark = New-Object System.Windows.Media.Imaging.BitmapImage
            $mark.BeginInit()
            $mark.UriSource = New-Object System.Uri($markFile)
            $mark.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
            $mark.EndInit()
            $tileMark = $window.FindName("TileMark")
            $tileMark.Source = $mark
            $tileMark.Visibility = "Visible"
            $window.FindName("GlyphBox").Visibility = "Collapsed"
            $tile.Background = & $brush $theme.tile
            if ($highContrast) { $tile.BorderBrush = & $brush $theme.line; $tile.BorderThickness = 1 }
        }
    }
    $titleText.Foreground = & $brush $theme.text
    $subtitleText.Foreground = & $brush $(if ($waiting) { $theme.waiting } else { $theme.done })
    $window.FindName("CloseGlyph").Stroke = & $brush $theme.muted
    $titleText.Text = [string]$job.title
    $subtitleText.Text = [string]$job.subtitle
    # Hebrew (or Arabic) project names read right to left; the subtitle
    # follows so both lines align.
    $rtlPattern = "[" + [char]0x0590 + "-" + [char]0x05FF + [char]0x0600 + "-" + [char]0x06FF + "]"
    if ([string]$job.title -match $rtlPattern) { $window.FindName("Texts").FlowDirection = "RightToLeft" }

    if ($RenderTo) {
        # Draw the card on a desktop-like backdrop, twice the size, and stop.
        $window.Content = $null
        $stage = New-Object System.Windows.Controls.Grid
        $stage.Background = & $brush "#5B6670"
        [void]$stage.Children.Add($card)
        $stage.Measure((New-Object System.Windows.Size($width, $height)))
        $stage.Arrange((New-Object System.Windows.Rect(0, 0, $width, $height)))
        $stage.UpdateLayout()
        $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(($width * 2), ($height * 2), 192, 192, [System.Windows.Media.PixelFormats]::Pbgra32)
        $bitmap.Render($stage)
        $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
        $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
        $out = [System.IO.File]::Create($RenderTo)
        try { $encoder.Save($out) } finally { $out.Dispose() }
        exit 0
    }

    $workArea = [System.Windows.SystemParameters]::WorkArea
    $window.Left = $workArea.Right - $width - 6
    if ($job.position -eq "bottomRight") {
        $window.Top = $workArea.Bottom - ($height * ($slot + 1)) - 6
    } else {
        $window.Top = $workArea.Top + ($height * $slot) + 6
    }

    # Gentle entrance: fades in while sliding a few pixels in from the right,
    # and fades out the same way. With Windows animations turned off
    # (Settings, Accessibility, Animation effects) it only fades.
    $motion = [System.Windows.SystemParameters]::ClientAreaAnimation
    $slide = New-Object System.Windows.Media.TranslateTransform
    $card.RenderTransform = $slide
    $easeOut = New-Object System.Windows.Media.Animation.CubicEase
    $easeOut.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
    $easeIn = New-Object System.Windows.Media.Animation.CubicEase
    $easeIn.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseIn
    function New-Tween([double]$from, [double]$to, [int]$ms, $ease) {
        $tween = New-Object System.Windows.Media.Animation.DoubleAnimation($from, $to, (New-Object System.Windows.Duration ([TimeSpan]::FromMilliseconds($ms))))
        $tween.EasingFunction = $ease
        return $tween
    }
    $window.Opacity = 0
    if ($motion) { $slide.X = 12 }
    $window.Add_ContentRendered({
        $window.BeginAnimation([System.Windows.Window]::OpacityProperty, (New-Tween 0 1 220 $easeOut))
        if ($motion) { $slide.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, (New-Tween 12 0 280 $easeOut)) }
    })
    $script:closing = $false
    $closePopup = {
        if ($script:closing) { return }
        $script:closing = $true
        $timer.Stop()
        $fadeOut = New-Tween $window.Opacity 0 160 $easeIn
        $fadeOut.Add_Completed({ $window.Close() })
        $window.BeginAnimation([System.Windows.Window]::OpacityProperty, $fadeOut)
        if ($motion) { $slide.BeginAnimation([System.Windows.Media.TranslateTransform]::XProperty, (New-Tween $slide.X 8 160 $easeIn)) }
    }

    # Countdown, paused while the mouse is over the card. "stay" has none:
    # the card waits for a click on it or on the x.
    $stay = ($job.stay -eq $true)
    $script:remaining = [double]$job.seconds
    if ($script:remaining -le 0) { $script:remaining = 8 }
    $script:hovering = $false
    $timer = New-Object System.Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(250)
    $timer.Add_Tick({
        if (-not $script:hovering -and -not $stay) {
            $script:remaining -= 0.25
            if ($script:remaining -le 0) { & $closePopup }
        }
    })
    $window.Add_MouseEnter({ $script:hovering = $true })
    $window.Add_MouseLeave({ $script:hovering = $false })

    $closeButton.Add_Click({ & $closePopup })
    $card.Add_MouseLeftButtonUp({
        if ($script:closing) { return }
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
        & $closePopup
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
    if ($RenderTo) { Write-Error $_.Exception.Message; exit 1 }
}
