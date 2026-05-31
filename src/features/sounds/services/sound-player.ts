import { spawn } from "node:child_process";
import * as path from "node:path";
import { isWindows, isMac, isLinux } from "../../../shared/platform-detector";

export const HOOK_MARKER = "BENEFIT_MANAGED_HOOK";

/**
 * Inner PowerShell script that plays a WAV via WPF's MediaPlayer.
 *
 * We deliberately do NOT use System.Media.SoundPlayer: it plays through the
 * legacy winmm/waveOut mapper, which on some machines targets a different
 * "preferred" device than the modern WASAPI default that VS Code and every
 * other app use — so PlaySync() returns success (exit 0) while reaching no
 * audible device. MediaPlayer (Media Foundation) follows the real default
 * render device, so it actually plays. We poll NaturalDuration so the hidden
 * process lives exactly as long as the clip (Play() is async), then exits.
 * Windows PowerShell runs STA by default, which MediaPlayer requires.
 */
function winPlayInner(soundPath: string): string {
  const uri = ("file:///" + soundPath.replace(/\\/g, "/")).replace(/'/g, "''");
  return (
    "Add-Type -AssemblyName PresentationCore; " +
    "$m=New-Object System.Windows.Media.MediaPlayer; " +
    `$m.Open([uri]'${uri}'); ` +
    "$n=0; while(-not $m.NaturalDuration.HasTimeSpan -and $n -lt 50){Start-Sleep -Milliseconds 40; $n++}; " +
    "$m.Play(); " +
    "if($m.NaturalDuration.HasTimeSpan){Start-Sleep -Milliseconds ([int]$m.NaturalDuration.TimeSpan.TotalMilliseconds + 300)}else{Start-Sleep -Seconds 4}"
  );
}

export function buildPlayCommand(soundPath: string): string {
  if (isWindows()) {
    // Claude Code runs hooks through bash (Git Bash), which would expand any
    // '$' in an inline -Command before PowerShell sees it. So we invoke the
    // play.ps1 launcher (which holds all the $variables) via -File and pass the
    // wav path as a plain argument — the command itself contains no '$'.
    const launcher = path.join(path.dirname(soundPath), "play.ps1");
    return `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}" "${soundPath}"`;
  }
  if (isMac()) {
    return `afplay '${soundPath.replace(/'/g, "'\\''")}' # ${HOOK_MARKER}`;
  }
  if (isLinux()) {
    const safe = soundPath.replace(/'/g, "'\\''");
    return `(paplay '${safe}' || aplay -q '${safe}') # ${HOOK_MARKER}`;
  }
  return `# ${HOOK_MARKER} unsupported platform`;
}

export function isManagedCommand(cmd: string): boolean {
  if (typeof cmd !== "string") return false;
  // Match anything that references our managed sounds dir (covers the current
  // MediaPlayer command, the previous SoundPlayer command, the legacy
  // node/play.js launcher, the older .ps1 hooks, and the macOS/Linux marker
  // form). Broad on purpose so a build that changes the invocation can still
  // purge its older shape on upgrade — and so ensureInstalled treats an older
  // command as stale and rewrites it to the current one.
  return cmd.includes(HOOK_MARKER) || /sounds[\\/]benefit[\\/]/i.test(cmd);
}

export async function playPreview(soundPath: string): Promise<void> {
  if (isWindows()) {
    // Same MediaPlayer path as the hook (see winPlayInner). Passed as a single
    // argv element to spawn, so no extra shell escaping is needed.
    await runDetached("powershell", [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      winPlayInner(soundPath),
    ]);
    return;
  }
  if (isMac()) {
    await runDetached("afplay", [soundPath]);
    return;
  }
  if (isLinux()) {
    try {
      await runDetached("paplay", [soundPath]);
    } catch {
      await runDetached("aplay", ["-q", soundPath]);
    }
    return;
  }
  throw new Error("Unsupported platform for preview playback.");
}

function runDetached(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // NOT detached: a detached child on Windows can be created without the
    // interactive audio session, so MediaPlayer runs but is silent. A normal
    // background child of the (long-lived) extension host plays audibly. We
    // unref so it never blocks host shutdown.
    const proc = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    proc.once("error", reject);
    proc.once("spawn", () => {
      proc.unref();
      resolve();
    });
  });
}
