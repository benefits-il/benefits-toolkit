import { spawn } from "node:child_process";
import { isWindows, isMac, isLinux } from "../../../shared/platform-detector";

/**
 * Inner PowerShell script that plays a sound via WPF's MediaPlayer.
 *
 * We deliberately do NOT use System.Media.SoundPlayer: it plays through the
 * legacy winmm/waveOut mapper, which on some machines targets a different
 * "preferred" device than the modern WASAPI default that VS Code and every
 * other app use — so PlaySync() returns success (exit 0) while reaching no
 * audible device. MediaPlayer (Media Foundation) follows the real default
 * render device, so it actually plays. We poll NaturalDuration so the hidden
 * process lives exactly as long as the clip (Play() is async), then exits.
 * Windows PowerShell runs STA by default, which MediaPlayer requires. The
 * hooks play the same way, from dispatch.ps1.
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

/** Play a sound from the extension (panel previews, "Test both"). */
export async function playPreview(soundPath: string): Promise<void> {
  if (isWindows()) {
    // Passed as a single argv element to spawn, so no extra shell escaping is needed.
    await runChild("powershell", [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      winPlayInner(soundPath),
    ]);
    return;
  }
  if (isMac()) {
    await runChild("afplay", [soundPath]);
    return;
  }
  if (isLinux()) {
    try {
      await runChild("paplay", [soundPath]);
    } catch {
      await runChild("aplay", ["-q", soundPath]);
    }
    return;
  }
  throw new Error("Unsupported platform for preview playback.");
}

export function runChild(cmd: string, args: string[]): Promise<void> {
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
