import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BenefitConfig } from "../../../core/config-manager";
import {
  claudeSoundsDir,
  toolkitBinDir,
  toolkitConfigFile,
  toolkitHome,
  toolkitSoundsDir,
} from "../../../core/paths";
import { atomicWriteText, ensureDir, pathExists, readTextSafe } from "../../../shared/fs-utils";
import { buildAlertConfig, buildLinuxSoundsEnv, compareVersions } from "./alert-config";
import { dispatcherFile, HookPlatform } from "./hook-command";

export type SoundSlot = "stop" | "notification";

/** Audio file extensions we treat as selectable sounds in the pool. */
const SOUND_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".m4a", ".aiff", ".flac"]);

/**
 * Pool sound used when the configured one is gone (renamed/removed from the
 * bundle, or a settings value carried over from an older release).
 */
const DEFAULT_SOUND: Record<SoundSlot, string> = {
  stop: "stop-default.wav",
  notification: "notify-default.wav",
};

/** The dispatcher scripts each platform needs in ~/.benefits-toolkit/bin. */
const SCRIPTS: Record<HookPlatform, { dir: string; files: string[] }> = {
  win32: { dir: "win", files: ["dispatch.ps1", "popup.ps1"] },
  darwin: { dir: "mac", files: ["dispatch.js", "popup.js"] },
  linux: { dir: "linux", files: ["dispatch.sh"] },
};

const VERSION_FILE = "VERSION";

/** The agents' marks the popups draw (PNG: neither popup renders SVG), in bin/marks. */
const MARKS_DIR = "marks";

/**
 * Stand-ins for the pre-0.7 install (~/.claude/sounds/benefit): a play.ps1
 * that does nothing and silent slot sounds. Only written while an older
 * toolkit in another window keeps restoring its own hooks (see HookInstaller):
 * its hooks then run, but stay silent, so nothing plays twice.
 */
const LEGACY_PLAY_STUB =
  "# Benefit's Toolkit 0.7+ plays sounds through ~/.benefits-toolkit/bin/dispatch.ps1.\n" +
  "# This stub stays silent; reload any VS Code window still running an older toolkit.\n" +
  "exit 0\n";

/** A valid WAV header with no samples: plays as silence. */
function silentWav(): Buffer {
  const b = Buffer.alloc(44);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16); // fmt chunk size
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(8000, 24); // sample rate
  b.writeUInt32LE(16000, 28); // byte rate
  b.writeUInt16LE(2, 32); // block align
  b.writeUInt16LE(16, 34); // bits per sample
  b.write("data", 36, "ascii");
  b.writeUInt32LE(0, 40);
  return b;
}

export interface SoundChoice {
  /** Filename within the pool, e.g. "notification-bell.mp3". Used as the id. */
  id: string;
  /** Human-friendly label derived from the filename, e.g. "Notification Bell". */
  label: string;
}

/** "notification-bell.mp3" -> "Notification Bell" */
function labelFor(id: string): string {
  const base = id.replace(/\.[^.]+$/, "");
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Everything the alert dispatcher reads from disk: the sound pool, the
 * dispatcher scripts and config.json, all under ~/.benefits-toolkit.
 */
export class AlertAssets {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  /** Directory holding the bundled sound pool (copied here by esbuild). */
  private bundledSoundsDir(): string {
    return path.join(this.ctx.extensionPath, "dist", "assets", "sounds");
  }

  private bundledScriptsDir(platform: HookPlatform): string {
    return path.join(this.ctx.extensionPath, "dist", "assets", "alerts", SCRIPTS[platform].dir);
  }

  private bundledMarksDir(): string {
    return path.join(this.ctx.extensionPath, "dist", "assets", "alerts", MARKS_DIR);
  }

  /** Absolute path to a bundled pool sound by its id (filename). */
  bundledAssetPath(id: string): string {
    return path.join(this.bundledSoundsDir(), id);
  }

  /** All selectable sounds in the bundled pool, sorted by label. */
  async listSounds(): Promise<SoundChoice[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.bundledSoundsDir());
    } catch {
      return [];
    }
    return entries
      .filter((f) => SOUND_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map((id) => ({ id, label: labelFor(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async hasSound(id: string): Promise<boolean> {
    return pathExists(this.bundledAssetPath(id));
  }

  /** The requested pool id when it exists, otherwise the slot default. */
  async resolveId(slot: SoundSlot, id: string | undefined): Promise<string> {
    if (id && (await this.hasSound(id))) return id;
    return DEFAULT_SOUND[slot];
  }

  /** Copy the sound pool and this platform's dispatcher into the toolkit home. */
  async installRuntime(platform: HookPlatform): Promise<void> {
    await this.installSounds();
    await this.installScripts(platform);
  }

  async dispatcherInstalled(platform: HookPlatform): Promise<boolean> {
    return pathExists(dispatcherFile(toolkitBinDir(), platform));
  }

  /** Mirror the alert settings into config.json (and sounds.env for Linux). */
  async writeConfig(cfg: BenefitConfig): Promise<void> {
    const config = buildAlertConfig({
      sounds: {
        ...cfg.sounds,
        stopSound: await this.resolveId("stop", cfg.sounds.stopSound),
        notificationSound: await this.resolveId("notification", cfg.sounds.notificationSound),
      },
      popup: cfg.popup,
    });
    await atomicWriteText(toolkitConfigFile(), JSON.stringify(config, null, 2) + "\n");
    await atomicWriteText(path.join(toolkitHome(), "sounds.env"), buildLinuxSoundsEnv(config));
  }

  /** Silence the pre-0.7 install; see LEGACY_PLAY_STUB. */
  async neutralizeLegacy(): Promise<void> {
    const dir = claudeSoundsDir();
    if (!(await pathExists(dir))) return;
    const launcher = path.join(dir, "play.ps1");
    if ((await pathExists(launcher)) && (await readTextSafe(launcher)) !== LEGACY_PLAY_STUB) {
      await fs.writeFile(launcher, LEGACY_PLAY_STUB, "utf8");
    }
    const silent = silentWav();
    for (const name of await fs.readdir(dir)) {
      const base = name.replace(/\.[^.]+$/, "");
      if (base !== "stop" && base !== "notify") continue;
      if (!SOUND_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
      const file = path.join(dir, name);
      if ((await fs.stat(file)).size !== silent.length) await fs.writeFile(file, silent);
    }
  }

  private async installSounds(): Promise<void> {
    const dest = toolkitSoundsDir();
    await ensureDir(dest);
    for (const { id } of await this.listSounds()) {
      const src = this.bundledAssetPath(id);
      const dst = path.join(dest, id);
      const [srcStat, dstStat] = await Promise.all([fs.stat(src), fs.stat(dst).catch(() => undefined)]);
      if (!dstStat || dstStat.size !== srcStat.size) await fs.copyFile(src, dst);
    }
  }

  /**
   * Copy the dispatcher scripts, unless a newer toolkit (e.g. in another
   * editor) already installed its own: two versions must not take turns
   * overwriting each other.
   */
  private async installScripts(platform: HookPlatform): Promise<void> {
    const bin = toolkitBinDir();
    await ensureDir(bin);
    const own = String(this.ctx.extension.packageJSON.version ?? "0.0.0");
    const installed = (await readTextSafe(path.join(bin, VERSION_FILE)))?.trim();
    const { files } = SCRIPTS[platform];
    const present = await Promise.all(files.map((f) => pathExists(path.join(bin, f))));
    if (installed && compareVersions(installed, own) > 0 && present.every(Boolean)) return;
    for (const f of files) {
      await fs.copyFile(path.join(this.bundledScriptsDir(platform), f), path.join(bin, f));
    }
    // Linux has no popup, so no marks.
    if (platform !== "linux") {
      await ensureDir(path.join(bin, MARKS_DIR));
      for (const f of await fs.readdir(this.bundledMarksDir())) {
        await fs.copyFile(path.join(this.bundledMarksDir(), f), path.join(bin, MARKS_DIR, f));
      }
    }
    await atomicWriteText(path.join(bin, VERSION_FILE), own + "\n");
  }
}
