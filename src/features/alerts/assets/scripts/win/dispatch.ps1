# Benefit's Toolkit alert dispatcher (Windows).
# Installed to ~/.benefits-toolkit/bin by the extension and run by agent hooks:
#   powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File dispatch.ps1 <agent> <kind>
#     agent: claude | cursor | antigravity      kind: done | waiting
# Reads the hook's JSON from stdin, finds the project the agent ran in (the
# records the editor windows keep in ../projects), shows the popup (detached,
# so the hook returns right away) and plays the sound. It never fails the
# hook: errors go to ../state/dispatch.log and the script exits 0.
param([string]$Agent = "claude", [string]$Kind = "done")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $root "state"

function Read-JsonFile([string]$path) {
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}

# Same rule as normalizeFolder() in project-registry.ts.
function Normalize-Folder([string]$p) {
    if (-not $p) { return "" }
    return $p.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
}

function Write-Log([string]$message) {
    try {
        $log = Join-Path $stateDir "dispatch.log"
        if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 200KB) { Remove-Item -LiteralPath $log -Force }
        Add-Content -LiteralPath $log -Value ("{0:yyyy-MM-dd HH:mm:ss} [{1} {2}] {3}" -f (Get-Date), $Agent, $Kind, $message) -Encoding UTF8
    } catch {}
}

try {
    New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

    # 1. The hook's input. UTF-8 explicitly: folder names may be Hebrew.
    $data = $null
    if ([Console]::IsInputRedirected) {
        $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
        $raw = $reader.ReadToEnd()
        if ($raw.Trim()) { $data = $raw | ConvertFrom-Json }
    }
    $folder = $null
    if ($data) {
        if ($data.cwd) { $folder = [string]$data.cwd }
        elseif ($data.workspace_roots) { $folder = [string](@($data.workspace_roots)[0]) }
        elseif ($data.workspacePaths) { $folder = [string](@($data.workspacePaths)[0]) }
    }
    # Editors may write a Windows folder as a URI path ("/c:/Users/...").
    if ($folder -match '^/[A-Za-z]:') { $folder = $folder.Substring(1) }

    # Cursor also runs Claude Code's hooks for its own agent (its "third-party
    # configs" option). Its own hook, "cursor done", reports that turn, so the
    # copy that arrives as "claude" stays quiet. Only Cursor sets these two.
    if ($Agent -eq "claude" -and ($env:CURSOR_TRANSCRIPT_PATH -or ($data -and $data.cursor_version))) { exit 0 }
    # A turn the user stopped needs no alert; Antigravity also reports steps
    # before its agent is done.
    if ($Agent -eq "cursor" -and $data -and ($data.status -eq "aborted")) { exit 0 }
    if ($Agent -eq "antigravity" -and $data -and ($data.fullyIdle -eq $false)) { exit 0 }

    $configPath = Join-Path $root "config.json"
    if (-not (Test-Path -LiteralPath $configPath)) { exit 0 }
    $config = Read-JsonFile $configPath

    # 2. One alert per project and kind within 3 seconds, however many hooks
    #    fired for it (e.g. an editor that also runs Claude Code's hooks).
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $keyBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes((Normalize-Folder $folder) + "|" + $Kind))
    $stamp = Join-Path $stateDir ("last-" + (-join ($keyBytes | ForEach-Object { $_.ToString("x2") })))
    if ((Test-Path -LiteralPath $stamp) -and ((Get-Date) - (Get-Item -LiteralPath $stamp).LastWriteTime).TotalSeconds -lt 3) { exit 0 }
    Set-Content -LiteralPath $stamp -Value "" -Encoding UTF8

    # 3. The project: the record whose folder contains the agent's folder
    #    (deepest match wins), same as findProject() in project-registry.ts.
    $project = $null
    $target = Normalize-Folder $folder
    $projectsDir = Join-Path $root "projects"
    if ($target -and (Test-Path -LiteralPath $projectsDir)) {
        $bestLength = -1
        foreach ($file in Get-ChildItem -LiteralPath $projectsDir -Filter "*.json") {
            try {
                $record = Read-JsonFile $file.FullName
                $recordFolder = Normalize-Folder ([string]$record.folder)
                if (-not $recordFolder) { continue }
                $inside = ($target -eq $recordFolder) -or $target.StartsWith($recordFolder + "/")
                if ($inside -and $recordFolder.Length -gt $bestLength) { $project = $record; $bestLength = $recordFolder.Length }
            } catch {}
        }
    }

    # 4. Popup, unless the user is already in that project's window. Claude
    #    Code's idle reminder (a Notification a minute after a reply) gets no
    #    popup: the "finished" popup already said it.
    $isIdleReminder = $data -and ($data.hook_event_name -eq "Notification") -and (($data.notification_type -eq "idle_prompt") -or ([string]$data.message -match "waiting for your input"))
    $wantPopup = $config.popup.enabled -and (-not $isIdleReminder) -and ((($Kind -eq "done") -and $config.popup.onDone) -or (($Kind -eq "waiting") -and $config.popup.onWaiting))
    $focused = $false
    if ($project -and $project.focused -and $project.pid) {
        $focused = [bool](Get-Process -Id ([int]$project.pid) -ErrorAction SilentlyContinue)
    }
    if ($wantPopup -and -not $focused) {
        $labels = @{ claude = "Claude"; cursor = "Cursor"; antigravity = "Antigravity" }
        $agentLabel = if ($labels.ContainsKey($Agent)) { $labels[$Agent] } else { $Agent }
        $name = if ($project -and $project.name) { [string]$project.name } elseif ($folder) { Split-Path -Leaf $folder } else { $agentLabel }
        # The record carries the text color and the theme the extension worked
        # out; older records lack them, and popup.ps1 falls back on its own.
        $job = [ordered]@{
            agent    = $Agent
            title    = $name
            subtitle = if ($Kind -eq "waiting") { "$agentLabel needs input" } else { "$agentLabel finished" }
            kind     = $Kind
            color    = if ($project -and $project.color) { [string]$project.color } else { "#047857" }
            text     = if ($project -and $project.colorText) { [string]$project.colorText } else { $null }
            theme    = if ($project -and $project.theme) { [string]$project.theme } else { "dark" }
            cli      = if ($project) { $project.cli } else { $null }
            folder   = if ($project) { [string]$project.folder } else { $folder }
            seconds  = $config.popup.seconds
            stay     = ($config.popup.stay -eq $true)
            # Top right unless chosen otherwise: the editors' own notifications
            # take the bottom right.
            position = if ($config.popup.position -eq "bottomRight") { "bottomRight" } else { "topRight" }
        }
        $jobsDir = Join-Path $stateDir "popups"
        New-Item -ItemType Directory -Force -Path $jobsDir | Out-Null
        $jobFile = Join-Path $jobsDir ([guid]::NewGuid().ToString() + ".json")
        [System.IO.File]::WriteAllText($jobFile, ($job | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
        $popupScript = Join-Path $PSScriptRoot "popup.ps1"
        Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-WindowStyle", "Hidden",
            "-File", ('"' + $popupScript + '"'), ('"' + $jobFile + '"')
        )
    }

    # 5. Sound: the project's own, else the default. MediaPlayer, not
    #    SoundPlayer: SoundPlayer's winmm route is silent on some machines.
    if ($config.sounds.enabled) {
        $soundId = $null
        if ($project -and $project.sounds) { $soundId = $project.sounds.$Kind }
        if (-not $soundId) { $soundId = $config.sounds.$Kind }
        $soundFile = if ($soundId) { Join-Path (Join-Path $root "sounds") ([string]$soundId) } else { $null }
        if ($soundFile -and (Test-Path -LiteralPath $soundFile)) {
            Add-Type -AssemblyName PresentationCore
            $player = New-Object System.Windows.Media.MediaPlayer
            $player.Open([uri]("file:///" + $soundFile.Replace('\', '/')))
            $n = 0
            while (-not $player.NaturalDuration.HasTimeSpan -and $n -lt 50) { Start-Sleep -Milliseconds 40; $n++ }
            $player.Play()
            if ($player.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$player.NaturalDuration.TimeSpan.TotalMilliseconds + 300) } else { Start-Sleep -Seconds 4 }
        }
    }
} catch {
    Write-Log $_.Exception.Message
}
exit 0
