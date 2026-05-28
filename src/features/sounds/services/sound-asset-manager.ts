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

export class SoundAssetManager {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  bundledAssetPath(slot: SoundSlot, variant: SoundVariant): string {
    return path.join(this.ctx.extensionPath, "dist", "assets", "sounds", ASSET_FILES[slot][variant]);
  }

  installedPath(slot: SoundSlot): string {
    return path.join(claudeSoundsDir(), INSTALLED_NAMES[slot]);
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
    // Legacy per-directory artifacts from the previous bus-based mechanism.
    for (const name of ["play.js", ".event"]) {
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
