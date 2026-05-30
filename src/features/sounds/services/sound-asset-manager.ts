import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { claudeSoundsDir } from "../../../core/paths";
import { SoundVariant } from "../../../core/config-manager";
import { ensureDir, pathExists } from "../../../shared/fs-utils";

export type SoundSlot = "stop" | "notification";

const ASSET_FILES: Record<SoundSlot, Record<SoundVariant, string>> = {
  stop: {
    default: "stop-default.wav",
    alt: "stop-alt.wav",
  },
  notification: {
    default: "notify-default.wav",
    alt: "notify-alt.wav",
  },
};

const INSTALLED_NAMES: Record<SoundSlot, string> = {
  stop: "stop.wav",
  notification: "notify.wav",
};

const LAUNCHER_NAME = "play.ps1";

// The hook command must contain NO '$' — Claude Code runs hooks through bash
// (Git Bash on Windows), which would expand $m/$n before PowerShell ever sees
// them, silently breaking the command. So the PowerShell (with its $variables)
// lives in this launcher file, which PowerShell reads directly via -File; the
// hook command only passes the wav path as a plain argument. Plays via
// MediaPlayer (Media Foundation) because SoundPlayer's winmm path is silent on
// some machines.
const PLAY_PS1 = `param([string]$Path)
Add-Type -AssemblyName PresentationCore
$m = New-Object System.Windows.Media.MediaPlayer
$m.Open([uri]("file:///" + $Path.Replace('\\','/')))
$n = 0
while (-not $m.NaturalDuration.HasTimeSpan -and $n -lt 50) { Start-Sleep -Milliseconds 40; $n++ }
$m.Play()
if ($m.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$m.NaturalDuration.TimeSpan.TotalMilliseconds + 300) } else { Start-Sleep -Seconds 4 }
`;

export class SoundAssetManager {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  bundledAssetPath(slot: SoundSlot, variant: SoundVariant): string {
    return path.join(this.ctx.extensionPath, "dist", "assets", "sounds", ASSET_FILES[slot][variant]);
  }

  installedPath(slot: SoundSlot): string {
    return path.join(claudeSoundsDir(), INSTALLED_NAMES[slot]);
  }

  launcherPath(): string {
    return path.join(claudeSoundsDir(), LAUNCHER_NAME);
  }

  async installLauncher(): Promise<string> {
    const dst = this.launcherPath();
    await ensureDir(path.dirname(dst));
    await fs.writeFile(dst, PLAY_PS1, "utf8");
    return dst;
  }

  async install(slot: SoundSlot, variant: SoundVariant): Promise<string> {
    const src = this.bundledAssetPath(slot, variant);
    const dst = this.installedPath(slot);
    await ensureDir(path.dirname(dst));
    await fs.copyFile(src, dst);
    return dst;
  }

  async installAll(stop: SoundVariant, notification: SoundVariant): Promise<{ stop: string; notification: string }> {
    return {
      stop: await this.install("stop", stop),
      notification: await this.install("notification", notification),
    };
  }

  async cleanupLegacyArtifacts(): Promise<void> {
    const dir = claudeSoundsDir();
    // Older builds: file-based per-slot .ps1 hooks, shared logs, the node
    // launcher (`play.js`) + its `.event` bus file and per-slot logs. All
    // unused now that the hook fires PowerShell directly; safe to remove.
    const legacy = [
      "play-stop.ps1",
      "play-notify.ps1",
      "benefit-hook.log",
      "stop.ps1",
      "notify.ps1",
      "play.js",
      ".event",
    ];
    for (const name of legacy) {
      try {
        await fs.unlink(path.join(dir, name));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          // best-effort cleanup — never block install on a leftover file
        }
      }
    }
  }

  async removeInstalled(): Promise<void> {
    const dir = claudeSoundsDir();
    if (!(await pathExists(dir))) return;
    for (const wavName of Object.values(INSTALLED_NAMES)) {
      // Remove the WAV (hard error on anything but missing), plus its sidecar
      // .ps1/.log/.js artifacts (best-effort).
      try {
        await fs.unlink(path.join(dir, wavName));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      const base = wavName.replace(/\.wav$/i, "");
      for (const ext of [".ps1", ".log"]) {
        try {
          await fs.unlink(path.join(dir, base + ext));
        } catch {
          // best-effort
        }
      }
    }
    // The MediaPlayer launcher, plus legacy per-directory artifacts from the
    // previous bus-based mechanism.
    for (const name of [LAUNCHER_NAME, "play.js", ".event"]) {
      try {
        await fs.unlink(path.join(dir, name));
      } catch {
        // best-effort
      }
    }
    try {
      await fs.rmdir(dir);
    } catch {
      // not empty or already gone — ignore.
    }
  }
}
