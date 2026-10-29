# Benefit's Toolkit popup (Windows, WPF). Started detached by dispatch.ps1
# (or by the extension's "Test popup") with the path of a JSON job file in
# state/popups:
#   { agent, title, subtitle, kind, color, text, theme, cli, folder, seconds, stay, position }
# One process shows every card. The first one started becomes the host (a
# named mutex); a later one leaves its job in state/popups for the host and
# exits once the host has taken it. The host:
# - shows each alert as a card in the toolkit's theme: a tile with the mark of
#   the agent that finished (Claude, Cursor or Antigravity, from
#   marks/<agent>.png), the project name and the status, framed in the
#   project's color. A job without a mark gets the older tile: the project's
#   color with a check (finished) or a bell (needs input);
# - brings a card in from the screen edge with a small spring, then flashes its
#   frame once;
# - keeps one card per window (same folder, same editor): another alert from
#   it raises the counter on the mark, flashes the frame again and restarts
#   the timer;
# - stacks the cards from the corner (top right, or bottom right with
#   position "bottomRight"), or from wherever the user last dropped one
#   (state/popup-place.json; the extension's "Back to corner" deletes it);
# - closes a card after `seconds` (hovering pauses), or with "stay" shrinks it
#   to a pill that waits for a click;
# - exits when no card is left.
# Cards never take focus by themselves. A click runs "<cli> <folder>", which
# brings that project's editor window to the front; a drag only moves the
# card. The x just closes it (on a pill, the x shows on hover).
#   -RenderTo <png>: draw one card into an image and exit, without showing it
#   (for checking the design; the job file is kept). Extra job fields pick
#   the state: count (the counter), pill (true), flash (true: mid-flash).
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less UTF-8
# scripts as ANSI.
param([string]$JobFile, [string]$RenderTo = "")

$ErrorActionPreference = "Stop"
$stateDir = Split-Path -Parent (Split-Path -Parent $JobFile)
$inboxDir = Join-Path $stateDir "popups"
$placeFile = Join-Path $stateDir "popup-place.json"
$isHost = $false
$mutex = $null

function Write-PopupLog([string]$message) {
    try {
        Add-Content -LiteralPath (Join-Path $stateDir "dispatch.log") -Value ("{0:yyyy-MM-dd HH:mm:ss} [popup] {1}" -f (Get-Date), $message) -Encoding UTF8
    } catch {}
}

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

# Sizes, in WPF units. The window is larger than the card: the margin holds
# the shadow and the flash ring, and its transparent pixels let clicks through.
$CardW = 300; $CardH = 64; $PillH = 30
$Margin = 22
$WinW = $CardW + 2 * $Margin; $WinH = $CardH + 2 * $Margin
$Edge = 16; $Gap = 10; $MaxCards = 5

# Motion, in milliseconds. Keys are @(time, value, easing into it).
$EnterMs = 700
$FadeKeys = @(@(0, 0), @(80, 1, "lin"))
$PulseMs = 820
$RingSpread = @(@(0, 0), @(820, 18, "out"))
$RingAlpha = @(@(0, 1), @(820, 0, "out"))
$FlashWidth = @(@(0, 0), @(140, 3, "out"), @(520, 0, "inout"))
$WashAlpha = @(@(0, 0), @(120, 0.2, "out"), @(620, 0, "inout"))
$PopScale = @(@(0, 1), @(150, 1.4, "out"), @(420, 1, "inout"))
$MoveMs = 280; $MorphMs = 280; $LeaveMs = 160

# The spring: from just past the screen edge, 18 past the spot, back with a
# small bounce. $s is the side it comes from (1 right, -1 left).
function Get-EnterKeys([double]$d, [double]$s) {
    return @(@(0, $d), @(320, (-18 * $s), "out"), @(480, (6 * $s), "inout"), @(600, (-2 * $s), "inout"), @(700, 0, "inout"))
}

function Get-Eased([string]$kind, [double]$t) {
    switch ($kind) {
        "lin" { return $t }
        "inout" { return 0.5 - [Math]::Cos([Math]::PI * $t) / 2 }
        default { return 1 - [Math]::Pow(1 - $t, 3) }
    }
}
function Get-Track($keys, [double]$ms) {
    if ($ms -le $keys[0][0]) { return [double]$keys[0][1] }
    for ($i = 1; $i -lt $keys.Count; $i++) {
        $k0 = $keys[$i - 1]; $k1 = $keys[$i]
        if ($ms -le $k1[0]) { return $k0[1] + ($k1[1] - $k0[1]) * (Get-Eased ([string]$k1[2]) (($ms - $k0[0]) / ($k1[0] - $k0[0]))) }
    }
    return [double]$keys[$keys.Count - 1][1]
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

# Tabler icons on a 24 grid: check for finished, bell for needs input.
$checkPath = "M5,12 L10,17 L20,7"
$bellPath = "M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6 M9 17v1a3 3 0 0 0 6 0v-1"
$rtlPattern = "[" + [char]0x0590 + "-" + [char]0x05FF + [char]0x0600 + "-" + [char]0x06FF + "]"

$cardXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False" ResizeMode="NoResize"
        Width="$WinW" Height="$WinH" FontFamily="Segoe UI">
  <Grid x:Name="Root">
    <Border x:Name="Ring" BorderThickness="2" CornerRadius="10" Opacity="0" IsHitTestVisible="False"
            HorizontalAlignment="Right" VerticalAlignment="Top" Width="$CardW" Height="$CardH" Margin="$Margin"/>
    <Border x:Name="Card" CornerRadius="10" BorderThickness="2" Cursor="Hand"
            HorizontalAlignment="Right" VerticalAlignment="Top" Width="$CardW" Height="$CardH" Margin="$Margin">
      <Border.Effect><DropShadowEffect x:Name="Shadow" BlurRadius="18" ShadowDepth="3" Direction="270"/></Border.Effect>
      <Grid ClipToBounds="True">
        <Border x:Name="Wash" CornerRadius="8" Opacity="0" IsHitTestVisible="False"/>
        <Grid x:Name="Full" Width="$($CardW - 4)" HorizontalAlignment="Left">
          <Grid Margin="11">
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="Auto"/>
              <ColumnDefinition Width="*"/>
              <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>
            <Grid Grid.Column="0" Width="34" Height="34" VerticalAlignment="Center">
              <Border x:Name="Tile" CornerRadius="8">
                <Grid>
                  <Image x:Name="TileMark" Width="20" Height="20" RenderOptions.BitmapScalingMode="HighQuality" Visibility="Collapsed"/>
                  <Viewbox x:Name="GlyphBox" Width="18" Height="18">
                    <Canvas Width="24" Height="24">
                      <Path x:Name="Glyph" StrokeThickness="2" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
                    </Canvas>
                  </Viewbox>
                </Grid>
              </Border>
              <Border x:Name="Badge" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-7,-8,0" MinWidth="19" Height="19"
                      CornerRadius="9.5" BorderThickness="2" Padding="4,0" Visibility="Collapsed" RenderTransformOrigin="0.5,0.5">
                <Border.RenderTransform><ScaleTransform x:Name="BadgeScale"/></Border.RenderTransform>
                <TextBlock x:Name="BadgeText" FontSize="10" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
            </Grid>
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
        </Grid>
        <StackPanel x:Name="PillPanel" Orientation="Horizontal" Margin="6,0,9,0" HorizontalAlignment="Left" VerticalAlignment="Center"
                    Opacity="0" Visibility="Collapsed">
          <Image x:Name="PillMark" Width="16" Height="16" VerticalAlignment="Center" RenderOptions.BitmapScalingMode="HighQuality"/>
          <TextBlock x:Name="PillName" Margin="7,0,0,0" FontSize="12" FontWeight="SemiBold" MaxWidth="130" TextTrimming="CharacterEllipsis" VerticalAlignment="Center"/>
          <Border x:Name="PillCount" Margin="7,0,0,0" MinWidth="16" Height="16" CornerRadius="8" Padding="4,0" VerticalAlignment="Center"
                  Visibility="Collapsed" RenderTransformOrigin="0.5,0.5">
            <Border.RenderTransform><ScaleTransform x:Name="PillCountScale"/></Border.RenderTransform>
            <TextBlock x:Name="PillCountText" FontSize="10" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/>
          </Border>
          <Grid Margin="7,0,0,0" Width="12" Height="12" VerticalAlignment="Center">
            <Viewbox x:Name="PillStatusBox">
              <Canvas Width="24" Height="24">
                <Path x:Name="PillStatus" StrokeThickness="2.6" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
              </Canvas>
            </Viewbox>
            <Viewbox x:Name="PillCloseBox" Visibility="Collapsed">
              <Canvas Width="24" Height="24">
                <Path x:Name="PillClose" Data="M18,6 L6,18 M6,6 L18,18" StrokeThickness="2.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
              </Canvas>
            </Viewbox>
          </Grid>
        </StackPanel>
        <Border x:Name="Flash" CornerRadius="8" BorderThickness="0" IsHitTestVisible="False"/>
      </Grid>
    </Border>
  </Grid>
</Window>
"@
$cardParts = @("Root", "Ring", "Card", "Shadow", "Wash", "Full", "Tile", "TileMark", "GlyphBox", "Glyph", "Badge", "BadgeScale", "BadgeText",
    "Texts", "TitleText", "SubtitleText", "CloseButton", "CloseGlyph", "PillPanel", "PillMark", "PillName", "PillCount", "PillCountScale",
    "PillCountText", "PillStatusBox", "PillStatus", "PillCloseBox", "PillClose", "Flash")

function New-CardWindow {
    [xml]$xaml = $cardXaml
    $window = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
    $c = @{ Window = $window }
    foreach ($name in $cardParts) { $c[$name] = $window.FindName($name) }
    $c.Count = 1; $c.IsPill = $false; $c.Phase = "enter"
    $c.W = [double]$CardW; $c.H = [double]$CardH; $c.Radius = 10.0; $c.Rs = 0.0
    $c.Side = 1; $c.Down = $true; $c.AnchorX = 0.0; $c.AnchorY = 0.0; $c.Tx = 0.0; $c.Ty = 0.0
    $c.MoveT0 = $null; $c.MorphT0 = $null; $c.PulseT0 = $null; $c.BumpT0 = $null
    $c.Hover = $false; $c.Dragging = $false; $c.Press = $null
    return $c
}

function Get-Brush([string]$color) { return $script:converter.ConvertFromString($color) }

# Fill a card from a job: colors, mark, texts, counter.
function Set-CardJob($c, $job) {
    $c.Job = $job
    $c.Stay = ($job.stay -eq $true)
    $seconds = [double]$job.seconds
    if ($seconds -le 0) { $seconds = 8 }
    $c.Remaining = $seconds * 1000
    $theme = $themes[[string]$job.theme]
    if (-not $theme) { $theme = $themes["dark"] }
    $highContrast = ([string]$job.theme).StartsWith("hc")
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
    $frame = Get-Brush $(if ($highContrast) { $theme.line } else { $hex })
    $c.Card.Background = Get-Brush $theme.bg
    $c.Card.BorderBrush = $frame
    $c.Ring.BorderBrush = $frame
    $c.Flash.BorderBrush = $frame
    $c.Wash.Background = $frame
    $c.Shadow.Opacity = $theme.shadow
    $c.Tile.Background = Get-Brush $hex
    $c.Tile.BorderThickness = 0
    $c.Glyph.Stroke = Get-Brush $tileText
    $c.Glyph.Data = [System.Windows.Media.Geometry]::Parse($(if ($waiting) { $bellPath } else { $checkPath }))
    $c.TileMark.Visibility = "Collapsed"
    $c.GlyphBox.Visibility = "Visible"
    $c.PillMark.Source = $null
    $c.PillMark.Visibility = "Collapsed"
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
            $c.TileMark.Source = $mark
            $c.TileMark.Visibility = "Visible"
            $c.GlyphBox.Visibility = "Collapsed"
            $c.PillMark.Source = $mark
            $c.PillMark.Visibility = "Visible"
            $c.Tile.Background = Get-Brush $theme.tile
            if ($highContrast) { $c.Tile.BorderBrush = Get-Brush $theme.line; $c.Tile.BorderThickness = 1 }
        }
    }
    $text = Get-Brush $theme.text
    $status = Get-Brush $(if ($waiting) { $theme.waiting } else { $theme.done })
    $c.TitleText.Foreground = $text
    $c.SubtitleText.Foreground = $status
    $c.CloseGlyph.Stroke = Get-Brush $theme.muted
    $c.TitleText.Text = [string]$job.title
    $c.SubtitleText.Text = [string]$job.subtitle
    $c.PillName.Foreground = $text
    $c.PillName.Text = [string]$job.title
    $c.PillStatus.Stroke = $status
    $c.PillStatus.Data = [System.Windows.Media.Geometry]::Parse($(if ($waiting) { $bellPath } else { $checkPath }))
    $c.PillClose.Stroke = Get-Brush $theme.muted
    # The counter: the project's color with its readable text, cut out of
    # the card by a ring in the card's own color.
    foreach ($b in @($c.Badge, $c.PillCount)) { $b.Background = $frame }
    $c.Badge.BorderBrush = Get-Brush $theme.bg
    $countText = Get-Brush $(if ($highContrast) { $theme.bg } else { $tileText })
    $c.BadgeText.Foreground = $countText
    $c.PillCountText.Foreground = $countText
    $c.BadgeText.Text = [string]$c.Count
    $c.PillCountText.Text = [string]$c.Count
    $many = if ($c.Count -gt 1) { "Visible" } else { "Collapsed" }
    $c.Badge.Visibility = $many
    $c.PillCount.Visibility = $many
    # Hebrew (or Arabic) project names read right to left; the subtitle
    # follows so both lines align.
    $c.Texts.FlowDirection = if ([string]$job.title -match $rtlPattern) { "RightToLeft" } else { "LeftToRight" }
}

# --- Screens. Forms reports pixels, WPF works in its own units. ---
function Get-PxPerUnit { return [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width / [System.Windows.SystemParameters]::PrimaryScreenWidth }
function Get-ScreenAt([double]$x, [double]$y) {
    $k = Get-PxPerUnit
    $p = [System.Drawing.Point]::new([int]($x * $k), [int]($y * $k))
    foreach ($s in [System.Windows.Forms.Screen]::AllScreens) { if ($s.Bounds.Contains($p)) { return $s } }
    return $null
}
function ConvertTo-UnitRect($r) {
    $k = Get-PxPerUnit
    return [System.Windows.Rect]::new($r.X / $k, $r.Y / $k, $r.Width / $k, $r.Height / $k)
}
function Get-Mouse {
    $k = Get-PxPerUnit
    $p = [System.Windows.Forms.Cursor]::Position
    return [System.Windows.Point]::new($p.X / $k, $p.Y / $k)
}

# --- Where the stack starts: the dropped spot, else the corner. ---
function Read-Place {
    try {
        if (Test-Path -LiteralPath $placeFile) {
            $p = Get-Content -LiteralPath $placeFile -Raw | ConvertFrom-Json
            return @{ x = [double]$p.x; y = [double]$p.y; side = $(if ($p.side -eq "left") { -1 } else { 1 }); down = ($p.vdir -ne "up") }
        }
    } catch {}
    return $null
}
function Save-Place($p) {
    $json = [ordered]@{ x = [Math]::Round($p.x, 1); y = [Math]::Round($p.y, 1); side = $(if ($p.side -lt 0) { "left" } else { "right" }); vdir = $(if ($p.down) { "down" } else { "up" }) } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($placeFile, $json, (New-Object System.Text.UTF8Encoding $false))
}
# A spot on a screen that is gone (a monitor unplugged) falls back to the
# corner; the file stays, for when the screen is back.
function Get-Anchor {
    $p = $script:place
    if ($p -and (Get-ScreenAt ($p.x + $CardW / 2) ($p.y + $CardH / 2))) { return $p }
    $wa = [System.Windows.SystemParameters]::WorkArea
    $x = $wa.Right - $Edge - $CardW
    if ($script:position -eq "bottomRight") { return @{ x = $x; y = $wa.Bottom - $Edge - $CardH; side = 1; down = $false } }
    return @{ x = $x; y = $wa.Top + $Edge; side = 1; down = $true }
}

# A card is pinned to one corner of its window (the stack's side): its
# anchor is that corner on the screen, so it keeps its place while it
# shrinks to a pill or grows back.
function Set-CardSide($c, [int]$side, [bool]$down) {
    if ($c.Side -ne $side -or $c.Down -ne $down) {
        $left = if ($c.Side -gt 0) { $c.AnchorX - $c.W } else { $c.AnchorX }
        $top = if ($c.Down) { $c.AnchorY } else { $c.AnchorY - $c.H }
        $c.Side = $side; $c.Down = $down
        $c.AnchorX = if ($side -gt 0) { $left + $c.W } else { $left }
        $c.AnchorY = if ($down) { $top } else { $top + $c.H }
        $c.MoveT0 = $null
    }
    $h = if ($side -gt 0) { "Right" } else { "Left" }
    $v = if ($down) { "Top" } else { "Bottom" }
    foreach ($e in @($c.Card, $c.Ring)) { $e.HorizontalAlignment = $h; $e.VerticalAlignment = $v }
}
function Set-WindowPlace($c) {
    $left = if ($c.Side -gt 0) { $c.AnchorX + $Margin - $WinW } else { $c.AnchorX - $Margin }
    $top = if ($c.Down) { $c.AnchorY - $Margin } else { $c.AnchorY + $Margin - $WinH }
    $left += $c.Tx; $top += $c.Ty
    if ($c.Window.Left -ne $left) { $c.Window.Left = $left }
    if ($c.Window.Top -ne $top) { $c.Window.Top = $top }
}
function Set-CardShape($c) {
    $c.Card.Width = $c.W; $c.Card.Height = $c.H
    $c.Card.CornerRadius = [System.Windows.CornerRadius]::new($c.Radius)
    $inner = [System.Windows.CornerRadius]::new([Math]::Max(0, $c.Radius - 2))
    $c.Wash.CornerRadius = $inner
    $c.Flash.CornerRadius = $inner
    $c.Ring.Width = $c.W + 2 * $c.Rs; $c.Ring.Height = $c.H + 2 * $c.Rs
    $c.Ring.Margin = [System.Windows.Thickness]::new($Margin - $c.Rs)
    $c.Ring.CornerRadius = [System.Windows.CornerRadius]::new($c.Radius + $c.Rs)
}
function Get-TargetH($c) { if ($c.IsPill) { return $PillH } else { return $CardH } }

# Every card to its place in the stack; cards already showing glide there.
function Set-Layout($instant) {
    $a = Get-Anchor
    $off = 0.0
    foreach ($c in @($script:cards)) {
        if ($c.Phase -eq "leave") { continue }
        $h = Get-TargetH $c
        if (-not $c.Dragging) { Set-CardSide $c $a.side $a.down }
        $tx = if ($a.side -gt 0) { $a.x + $CardW } else { $a.x }
        $ty = if ($a.down) { $a.y + $off } else { $a.y + $CardH - $off }
        $off += $h + $Gap
        if ($c.Dragging) { continue }
        if ([object]::ReferenceEquals($c, $instant) -or -not $script:motion) {
            $c.AnchorX = $tx; $c.AnchorY = $ty; $c.MoveT0 = $null
            Set-WindowPlace $c
        } elseif ([Math]::Abs($c.AnchorX - $tx) -gt 0.5 -or [Math]::Abs($c.AnchorY - $ty) -gt 0.5) {
            $c.FromX = $c.AnchorX; $c.FromY = $c.AnchorY; $c.ToX = $tx; $c.ToY = $ty; $c.MoveT0 = $script:now
        }
    }
    Start-Frames
}

# --- Card life ---
function Start-Enter($c) {
    $c.Phase = "enter"
    # The clock starts once the window has drawn (ContentRendered): a new
    # window takes a few hundred milliseconds to get there, and the spring
    # would be half over before it is seen.
    $c.T0 = $null
    $c.EnterMs = $EnterMs
    $c.Fade = $FadeKeys
    $s = $c.Side
    $left = if ($s -gt 0) { $c.AnchorX - $c.W } else { $c.AnchorX }
    $top = if ($c.Down) { $c.AnchorY } else { $c.AnchorY - $c.H }
    $own = Get-ScreenAt ($left + $c.W / 2) ($top + $c.H / 2)
    if (-not $script:motion) {
        # Animations off in Windows: fade in, no travel.
        $c.Keys = @(@(0, 0), @(1, 0))
        $c.EnterMs = 220
        $c.Fade = @(@(0, 0), @(220, 1, "out"))
    } elseif ($own) {
        $b = ConvertTo-UnitRect $own.Bounds
        $d = if ($s -gt 0) { $b.Right - $left + $Margin } else { -($left + $c.W - $b.Left + $Margin) }
        # Another screen just past that edge would show the card on its way
        # in: come in from closer instead.
        $edgeX = if ($s -gt 0) { $b.Right + 4 } else { $b.Left - 4 }
        if (Get-ScreenAt $edgeX ($top + $c.H / 2)) {
            $d = 40 * $s
            $c.Fade = @(@(0, 0), @(200, 1, "out"))
        }
        $c.Keys = Get-EnterKeys $d $s
    } else {
        $c.Keys = Get-EnterKeys (40 * $s) $s
    }
    $c.Tx = Get-Track $c.Keys 0
    $c.Window.Opacity = 0
    Set-WindowPlace $c
    Start-Frames
}
function Start-Pulse($c) { $c.PulseT0 = $script:now; Start-Frames }
function Start-Morph($c, [double]$w, [double]$h, [bool]$toPill) {
    $c.IsPill = $toPill
    $c.MorphFromW = $c.W; $c.MorphFromH = $c.H; $c.MorphToW = $w; $c.MorphToH = $h
    $c.MorphFromR = $c.Radius; $c.MorphToR = $(if ($toPill) { 15.0 } else { 10.0 })
    $c.Full.IsHitTestVisible = -not $toPill
    $c.Full.Visibility = "Visible"
    $c.PillPanel.Visibility = "Visible"
    $c.MorphT0 = $script:now
    if (-not $script:motion) { Step-Morph $c ($script:now + $MorphMs) }
    Set-Layout $null
}
function Start-Pill($c) {
    $c.PillPanel.Visibility = "Visible"
    $c.PillPanel.Measure([System.Windows.Size]::new([double]::PositiveInfinity, [double]::PositiveInfinity))
    $w = [Math]::Min(240, [Math]::Ceiling($c.PillPanel.DesiredSize.Width) + 4)
    $c.Remaining = [double]::PositiveInfinity
    Start-Morph $c $w $PillH $true
}
function Start-Leave($c) {
    if ($c.Phase -eq "leave") { return }
    $c.Phase = "leave"
    $c.L0 = $script:now
    $c.Op0 = $c.Window.Opacity
    $c.Tx0 = $c.Tx
    Set-Layout $null
}
function Open-Card($c) {
    try {
        $cli = [string]$c.Job.cli
        $folder = [string]$c.Job.folder
        if ($cli -and $folder -and (Test-Path -LiteralPath $cli)) {
            # The click made this process the foreground one; pass that
            # right on so the editor may raise its window.
            [void][BenefitToolkit.Native]::AllowSetForegroundWindow(-1)
            Start-Process -FilePath $cli -ArgumentList ('"' + $folder + '"') -WindowStyle Hidden
        }
    } catch { Write-PopupLog $_.Exception.Message }
    Start-Leave $c
}
function Update-Hover($c) {
    $x = $c.IsPill -and $c.Hover
    $c.PillStatusBox.Visibility = if ($x) { "Collapsed" } else { "Visible" }
    $c.PillCloseBox.Visibility = if ($x) { "Visible" } else { "Collapsed" }
}

# Dropped: this card stays where it is, the stack gathers around it, and the
# spot is kept for the next alerts.
function Set-Dropped($c) {
    $left = if ($c.Side -gt 0) { $c.AnchorX - $c.W } else { $c.AnchorX }
    $top = if ($c.Down) { $c.AnchorY } else { $c.AnchorY - $c.H }
    $vl = [System.Windows.SystemParameters]::VirtualScreenLeft
    $vt = [System.Windows.SystemParameters]::VirtualScreenTop
    $left = [Math]::Max($vl, [Math]::Min($vl + [System.Windows.SystemParameters]::VirtualScreenWidth - $c.W, $left))
    $top = [Math]::Max($vt, [Math]::Min($vt + [System.Windows.SystemParameters]::VirtualScreenHeight - $c.H, $top))
    $screen = Get-ScreenAt ($left + $c.W / 2) ($top + $c.H / 2)
    $wa = if ($screen) { ConvertTo-UnitRect $screen.WorkingArea } else { [System.Windows.SystemParameters]::WorkArea }
    $side = if ($left + $c.W / 2 -lt $wa.Left + $wa.Width / 2) { -1 } else { 1 }
    $down = ($top + $c.H / 2) -lt ($wa.Top + $wa.Height / 2)
    $off = 0.0
    foreach ($x in @($script:cards)) {
        if ([object]::ReferenceEquals($x, $c)) { break }
        if ($x.Phase -ne "leave") { $off += (Get-TargetH $x) + $Gap }
    }
    $ax = if ($side -gt 0) { $left + $c.W - $CardW } else { $left }
    $ay = if ($down) { $top - $off } else { $top + $c.H - $CardH + $off }
    $script:place = @{ x = $ax; y = $ay; side = $side; down = $down }
    try { Save-Place $script:place } catch { Write-PopupLog $_.Exception.Message }
    $c.Side = $side; $c.Down = $down
    $c.AnchorX = if ($side -gt 0) { $left + $c.W } else { $left }
    $c.AnchorY = if ($down) { $top } else { $top + $c.H }
    Set-CardSide $c $side $down
    Set-WindowPlace $c
    Set-Layout $null
}

# --- One frame of a card. Returns true while it still moves. ---
function Step-Morph($c, [double]$now) {
    $m = [Math]::Min(1, ($now - $c.MorphT0) / $MorphMs)
    $k = Get-Eased "out" $m
    $c.W = $c.MorphFromW + ($c.MorphToW - $c.MorphFromW) * $k
    $c.H = $c.MorphFromH + ($c.MorphToH - $c.MorphFromH) * $k
    $c.Radius = $c.MorphFromR + ($c.MorphToR - $c.MorphFromR) * $k
    $out = [Math]::Max(0, 1 - $m / 0.43)
    $in = [Math]::Min(1, [Math]::Max(0, ($m - 0.46) / 0.54))
    if ($c.IsPill) { $c.Full.Opacity = $out; $c.PillPanel.Opacity = $in } else { $c.PillPanel.Opacity = $out; $c.Full.Opacity = $in }
    if ($m -ge 1) {
        $c.MorphT0 = $null
        $c.Full.Visibility = if ($c.IsPill) { "Collapsed" } else { "Visible" }
        $c.PillPanel.Visibility = if ($c.IsPill) { "Visible" } else { "Collapsed" }
        Update-Hover $c
    }
    Set-CardShape $c
}
function Step-Card($c, [double]$now) {
    $busy = $false
    if ($c.Phase -eq "enter" -and $null -eq $c.T0) { return $true }
    if ($c.Phase -eq "enter") {
        $e = $now - $c.T0
        $c.Tx = Get-Track $c.Keys $e
        $c.Window.Opacity = Get-Track $c.Fade $e
        if ($e -ge $c.EnterMs) {
            $c.Phase = "shown"; $c.Tx = 0.0; $c.Window.Opacity = 1
            Start-Pulse $c
        }
        $busy = $true
    }
    if ($null -ne $c.MoveT0) {
        $m = [Math]::Min(1, ($now - $c.MoveT0) / $MoveMs)
        $k = Get-Eased "out" $m
        $c.AnchorX = $c.FromX + ($c.ToX - $c.FromX) * $k
        $c.AnchorY = $c.FromY + ($c.ToY - $c.FromY) * $k
        if ($m -ge 1) { $c.MoveT0 = $null }
        $busy = $true
    }
    if ($null -ne $c.MorphT0) { Step-Morph $c $now; $busy = $true }
    if ($null -ne $c.PulseT0) {
        $p = $now - $c.PulseT0
        if ($p -ge $PulseMs) {
            $c.PulseT0 = $null; $c.Rs = 0.0
            $c.Ring.Opacity = 0; $c.Wash.Opacity = 0
            $c.Flash.BorderThickness = [System.Windows.Thickness]::new(0)
        } else {
            # With animations off the ring stays still; the frame and tint still flash.
            if ($script:motion) { $c.Rs = Get-Track $RingSpread $p; $c.Ring.Opacity = Get-Track $RingAlpha $p }
            $c.Flash.BorderThickness = [System.Windows.Thickness]::new((Get-Track $FlashWidth $p))
            $c.Wash.Opacity = Get-Track $WashAlpha $p
            $busy = $true
        }
        Set-CardShape $c
    }
    if ($null -ne $c.BumpT0) {
        $b = $now - $c.BumpT0
        $scale = if ($script:motion) { Get-Track $PopScale $b } else { 1 }
        if ($b -ge 420) { $scale = 1; $c.BumpT0 = $null } else { $busy = $true }
        foreach ($t in @($c.BadgeScale, $c.PillCountScale)) { $t.ScaleX = $scale; $t.ScaleY = $scale }
    }
    if ($c.Phase -eq "leave") {
        $l = [Math]::Min(1, ($now - $c.L0) / $LeaveMs)
        $c.Window.Opacity = $c.Op0 * (1 - $l * $l)
        if ($script:motion) { $c.Tx = $c.Tx0 + (8 * $c.Side - $c.Tx0) * $l * $l }
        if ($l -ge 1) {
            $c.Window.Close()
            $script:cards.Remove($c)
            if ($script:cards.Count -eq 0) { $script:idleSince = $now }
            return $false
        }
        $busy = $true
    }
    Set-WindowPlace $c
    return $busy
}

# Frames run only while something moves; a card that just waits costs nothing.
$script:framing = $false
$onFrame = {
    try {
        $script:now = $script:watch.Elapsed.TotalMilliseconds
        $busy = $false
        foreach ($c in @($script:cards)) { if (Step-Card $c $script:now) { $busy = $true } }
        if (-not $busy) { Stop-Frames }
    } catch {
        Write-PopupLog $_.Exception.Message
        Stop-Frames
    }
}
$frameHandler = [System.EventHandler]$onFrame
function Start-Frames {
    if ($script:framing -or $RenderTo) { return }
    $script:framing = $true
    [System.Windows.Media.CompositionTarget]::add_Rendering($frameHandler)
}
function Stop-Frames {
    if (-not $script:framing) { return }
    $script:framing = $false
    [System.Windows.Media.CompositionTarget]::remove_Rendering($frameHandler)
}

# --- Mouse: a click opens, a drag moves, the x closes. ---
$onDown = {
    param($sender, $e)
    $c = $sender.Tag
    if ($c.Phase -eq "leave") { return }
    $m = Get-Mouse
    $c.Press = @{ X = $m.X; Y = $m.Y; AX = $c.AnchorX; AY = $c.AnchorY }
    [void]$sender.CaptureMouse()
}
$onMove = {
    param($sender, $e)
    $c = $sender.Tag
    if (-not $c.Press) { return }
    $m = Get-Mouse
    $dx = $m.X - $c.Press.X
    $dy = $m.Y - $c.Press.Y
    if (-not $c.Dragging) {
        if ([Math]::Sqrt($dx * $dx + $dy * $dy) -lt 4) { return }
        $c.Dragging = $true
        if ($null -ne $c.MoveT0) { $c.Press.AX = $c.AnchorX; $c.Press.AY = $c.AnchorY; $c.MoveT0 = $null }
        if ($c.Phase -eq "enter") { $c.Phase = "shown"; $c.Tx = 0.0; $c.Window.Opacity = 1; Start-Pulse $c }
    }
    $c.AnchorX = $c.Press.AX + $dx
    $c.AnchorY = $c.Press.AY + $dy
    Set-WindowPlace $c
}
$onUp = {
    param($sender, $e)
    $c = $sender.Tag
    if (-not $c.Press) { return }
    $c.Press = $null
    $sender.ReleaseMouseCapture()
    if ($c.Dragging) {
        $c.Dragging = $false
        Set-Dropped $c
        return
    }
    if ($c.IsPill -and $e.GetPosition($sender).X -gt $c.W - 24) { Start-Leave $c; return }
    Open-Card $c
}
$onEnter = { param($sender, $e) $c = $sender.Tag; $c.Hover = $true; Update-Hover $c }
$onLeave = { param($sender, $e) $c = $sender.Tag; $c.Hover = $false; Update-Hover $c }
$onClose = { param($sender, $e) Start-Leave $sender.Tag }
$onRendered = {
    param($sender, $e)
    $c = $sender.Tag
    if ($c.Phase -eq "enter" -and $null -eq $c.T0) { $c.T0 = $script:watch.Elapsed.TotalMilliseconds; Start-Frames }
}

function New-Card($job, [string]$key) {
    $c = New-CardWindow
    $c.Key = $key
    Set-CardJob $c $job
    $c.Card.Tag = $c
    $c.CloseButton.Tag = $c
    $c.Window.Tag = $c
    $c.Window.Add_ContentRendered($onRendered)
    $c.Card.Add_MouseLeftButtonDown($onDown)
    $c.Card.Add_MouseMove($onMove)
    $c.Card.Add_MouseLeftButtonUp($onUp)
    $c.Card.Add_MouseEnter($onEnter)
    $c.Card.Add_MouseLeave($onLeave)
    $c.CloseButton.Add_Click($onClose)
    return $c
}

# Same window = same folder in the same editor: the click leads to it.
function Get-AlertKey($job) {
    $folder = ([string]$job.folder).Replace('\', '/').TrimEnd('/').ToLowerInvariant()
    if (-not $folder) { $folder = "title:" + [string]$job.title }
    return $folder + "|" + ([string]$job.cli).ToLowerInvariant()
}

function Add-Alert($job) {
    $script:position = if ($job.position -eq "bottomRight") { "bottomRight" } else { "topRight" }
    $key = Get-AlertKey $job
    foreach ($c in @($script:cards)) {
        if ($c.Key -eq $key -and $c.Phase -ne "leave") {
            $c.Count++
            Set-CardJob $c $job
            if ($c.IsPill) { Start-Morph $c $CardW $CardH $false }
            if ($c.Phase -eq "shown") { Start-Pulse $c }
            $c.BumpT0 = $script:now
            Start-Frames
            return
        }
    }
    $c = New-Card $job $key
    [void]$script:cards.Add($c)
    $live = @($script:cards | Where-Object { $_.Phase -ne "leave" })
    if ($live.Count -gt $MaxCards) { Start-Leave $live[0] }
    Set-Layout $c
    Start-Enter $c
    $c.Window.Show()
}

# Jobs waiting in state/popups, oldest first. A file still being written is
# left for the next round; a stale one (from a crash) is dropped.
function Receive-Jobs {
    if (-not (Test-Path -LiteralPath $inboxDir)) { return }
    foreach ($f in @(Get-ChildItem -LiteralPath $inboxDir -Filter "*.json" | Sort-Object LastWriteTime)) {
        $age = ((Get-Date) - $f.LastWriteTime).TotalSeconds
        $job = $null
        try { $job = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { if ($age -lt 3) { continue } }
        Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
        if ($job -and $age -lt 60) {
            try { Add-Alert $job } catch { Write-PopupLog $_.Exception.Message }
        }
    }
}

$onTick = {
    try {
        $script:now = $script:watch.Elapsed.TotalMilliseconds
        $dt = $script:now - $script:lastTick
        $script:lastTick = $script:now
        Receive-Jobs
        # "Back to corner" in Settings deletes the spot.
        if ($script:place -and -not (Test-Path -LiteralPath $placeFile)) { $script:place = $null; Set-Layout $null }
        foreach ($c in @($script:cards)) {
            if ($c.Phase -ne "shown" -or $c.IsPill -or $c.Hover -or $c.Dragging) { continue }
            $c.Remaining -= $dt
            if ($c.Remaining -le 0) { if ($c.Stay) { Start-Pill $c } else { Start-Leave $c } }
        }
        if ($script:cards.Count -gt 0) { $script:idleSince = $script:now }
        elseif ($script:now - $script:idleSince -gt 1500 -and -not @(Get-ChildItem -LiteralPath $inboxDir -Filter "*.json" -ErrorAction SilentlyContinue).Count) {
            $script:timer.Stop()
            $script:app.Shutdown()
        }
    } catch { Write-PopupLog $_.Exception.Message }
}

function Import-Wpf {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing
    Add-Type -Namespace BenefitToolkit -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int processId);'
    $script:converter = New-Object System.Windows.Media.BrushConverter
}

try {
    if ($RenderTo) {
        Import-Wpf
        # One card in the state the job asks for, on a desktop-like backdrop,
        # twice the size.
        $job = Get-Content -LiteralPath $JobFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $c = New-CardWindow
        if ([int]$job.count -gt 1) { $c.Count = [int]$job.count }
        Set-CardJob $c $job
        if ($job.pill -eq $true) {
            $c.PillPanel.Visibility = "Visible"
            $c.PillPanel.Measure([System.Windows.Size]::new([double]::PositiveInfinity, [double]::PositiveInfinity))
            $c.W = [Math]::Min(240, [Math]::Ceiling($c.PillPanel.DesiredSize.Width) + 4); $c.H = $PillH; $c.Radius = 15.0
            $c.IsPill = $true; $c.Full.Visibility = "Collapsed"; $c.PillPanel.Opacity = 1
            $c.Hover = ($job.hover -eq $true); Update-Hover $c
        }
        if ($job.flash -eq $true) {
            $c.Rs = 7.0; $c.Ring.Opacity = 0.6; $c.Wash.Opacity = 0.16
            $c.Flash.BorderThickness = [System.Windows.Thickness]::new(3)
        }
        Set-CardShape $c
        $root = $c.Root
        $c.Window.Content = $null
        $stage = New-Object System.Windows.Controls.Grid
        $stage.Background = Get-Brush "#5B6670"
        [void]$stage.Children.Add($root)
        $stage.Measure([System.Windows.Size]::new($WinW, $WinH))
        $stage.Arrange([System.Windows.Rect]::new(0, 0, $WinW, $WinH))
        $stage.UpdateLayout()
        $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(($WinW * 2), ($WinH * 2), 192, 192, [System.Windows.Media.PixelFormats]::Pbgra32)
        $bitmap.Render($stage)
        $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
        $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
        $out = [System.IO.File]::Create($RenderTo)
        try { $encoder.Save($out) } finally { $out.Dispose() }
        exit 0
    }

    # Become the host, or leave the job to the one already running: wait
    # until it has taken the job (gone from state/popups), or until it quits
    # and the mutex is free. Before loading WPF, so a process that only hands
    # its job over stays cheap.
    $mutex = New-Object System.Threading.Mutex($false, "Local\BenefitToolkitPopupHost")
    $deadline = (Get-Date).AddSeconds(5)
    while (-not $isHost) {
        try {
            $isHost = $mutex.WaitOne(100)
        } catch {
            if (($_.Exception -is [System.Threading.AbandonedMutexException]) -or ($_.Exception.InnerException -is [System.Threading.AbandonedMutexException])) { $isHost = $true } else { throw }
        }
        if ($isHost) { break }
        if (-not (Test-Path -LiteralPath $JobFile)) { exit 0 }
        if ((Get-Date) -gt $deadline) { exit 0 }
    }

    Import-Wpf
    $script:cards = New-Object System.Collections.ArrayList
    $script:place = Read-Place
    $script:position = "topRight"
    $script:motion = [System.Windows.SystemParameters]::ClientAreaAnimation
    $script:watch = [System.Diagnostics.Stopwatch]::StartNew()
    $script:now = 0.0
    $script:lastTick = 0.0
    $script:idleSince = 0.0
    $script:app = New-Object System.Windows.Application
    $script:app.ShutdownMode = "OnExplicitShutdown"
    $script:app.Add_DispatcherUnhandledException({ param($sender, $e) Write-PopupLog $e.Exception.Message; $e.Handled = $true })
    $script:timer = New-Object System.Windows.Threading.DispatcherTimer
    $script:timer.Interval = [TimeSpan]::FromMilliseconds(250)
    $script:timer.Add_Tick($onTick)
    $script:app.Add_Startup({ & $onTick; $script:timer.Start() })
    [void]$script:app.Run()
} catch {
    Write-PopupLog $_.Exception.Message
    if ($RenderTo) { Write-Error $_.Exception.Message; exit 1 }
} finally {
    if ($isHost -and $mutex) { try { $mutex.ReleaseMutex() } catch {} }
}
