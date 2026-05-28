import { spawn } from "node:child_process";
import { isWindows, isMac, isLinux } from "../../../shared/platform-detector";

export const HOOK_MARKER = "BENEFIT_MANAGED_HOOK";

export function buildPlayCommand(soundPath: string): string {
  if (isWindows()) {
    // PowerShell's Media.SoundPlayer.PlaySync() is what actually reaches the
    // user's speakers when fired by Claude Code's hook runner — matches the
    // approach in the claude-sound-hooks reference installer.
    const escaped = soundPath.replace(/'/g, "''");
    return `powershell -NoProfile -WindowStyle Hidden -Command "(New-Object Media.SoundPlayer '${escaped}').PlaySync()"`;
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
  // powershell command, the legacy node/play.js launcher, the older .ps1
  // hooks, and the macOS/Linux marker form). Broad on purpose so a build that
  // changes the invocation can still purge its older shape on upgrade.
  return cmd.includes(HOOK_MARKER) || /sounds[\\/]benefit[\\/]/i.test(cmd);
}

export async function playPreview(soundPath: string): Promise<void> {
  if (isWindows()) {
    const escaped = soundPath.replace(/'/g, "''");
    await runDetached("powershell", [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      `(New-Object Media.SoundPlayer '${escaped}').PlaySync()`,
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
    const proc = spawn(cmd, args, { detached: true, stdio: "ignore" });
    proc.once("error", reject);
    proc.once("spawn", () => {
      proc.unref();
      resolve();
    });
  });
}
