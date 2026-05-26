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

  async removeInstalled(): Promise<void> {
    const dir = claudeSoundsDir();
    if (!(await pathExists(dir))) return;
    for (const file of Object.values(INSTALLED_NAMES)) {
      const p = path.join(dir, file);
      try {
        await fs.unlink(p);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
    try {
      await fs.rmdir(dir);
    } catch {
      // not empty or already gone — ignore.
    }
  }
}
