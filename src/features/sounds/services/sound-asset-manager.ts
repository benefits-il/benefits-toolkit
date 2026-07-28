import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { claudeSoundsDir } from "../../../core/paths";
import { ensureDir, pathExists } from "../../../shared/fs-utils";

export type SoundSlot = "stop" | "notification";

/** Audio file extensions we treat as selectable sounds in the pool. */
const SOUND_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".m4a", ".aiff", ".flac"]);

/** Base name (no extension) of the file copied into the install dir per slot. */
const INSTALLED_BASE: Record<SoundSlot, string> = {
  stop: "stop",
  notification: "notify",
};

/**
 * Pool sound used when the configured one is gone (renamed/removed from the
 * bundle, or a settings value carried over from an older release). Without this
 * the copy step throws ENOENT and the whole hook install fails, killing sounds
 * entirely instead of degrading to the shipped default.
 */
const DEFAULT_SOUND: Record<SoundSlot, string> = {
  stop: "stop-default.wav",
  notification: "notify-default.wav",
};

const LAUNCHER_NAME = "play.ps1";

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

// The hook command must contain NO '$' — Claude Code runs hooks through bash
// (Git Bash on Windows), which would expand $m/$n before PowerShell ever sees
// them, silently breaking the command. So the PowerShell (with its $variables)
// lives in this launcher file, which PowerShell reads directly via -File; the
// hook command only passes the sound path as a plain argument. Plays via
// MediaPlayer (Media Foundation) — which also handles mp3, not just wav — because
// SoundPlayer's winmm path is silent on some machines.
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

  /** Directory holding the bundled sound pool (copied here by esbuild). */
  private bundledDir(): string {
    return path.join(this.ctx.extensionPath, "dist", "assets", "sounds");
  }

  /** Absolute path to a bundled pool sound by its id (filename). */
  bundledAssetPath(id: string): string {
    return path.join(this.bundledDir(), id);
  }

  /** All selectable sounds in the bundled pool, sorted by label. */
  async listSounds(): Promise<SoundChoice[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.bundledDir());
    } catch {
      return [];
    }
    return entries
      .filter((f) => SOUND_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .map((id) => ({ id, label: labelFor(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** The first bundled sound whose id matches, or undefined. */
  async hasSound(id: string): Promise<boolean> {
    return pathExists(this.bundledAssetPath(id));
  }

  /**
   * The pool id actually used for a slot: the requested one when it exists,
   * otherwise the slot default. Deterministic, so callers that need the
   * installed path up front (HookInstaller.ensureInstalled) resolve to the same
   * id that install() will copy.
   */
  async resolveId(slot: SoundSlot, id: string): Promise<string> {
    if (id && (await this.hasSound(id))) return id;
    return DEFAULT_SOUND[slot];
  }

  /** Installed path for a slot, preserving the chosen sound's extension. */
  installedPath(slot: SoundSlot, id: string): string {
    const ext = path.extname(id) || ".wav";
    return path.join(claudeSoundsDir(), INSTALLED_BASE[slot] + ext);
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

  /** Remove any previously-installed file for a slot (regardless of extension). */
  private async removeSlot(slot: SoundSlot): Promise<void> {
    const dir = claudeSoundsDir();
    if (!(await pathExists(dir))) return;
    const base = INSTALLED_BASE[slot];
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const noExt = name.replace(/\.[^.]+$/, "");
      if (noExt !== base) continue;
      if (!SOUND_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
      try {
        await fs.unlink(path.join(dir, name));
      } catch {
        // best-effort
      }
    }
  }

  /** Copy a pool sound into the stable install dir for a slot. Returns its path. */
  async install(slot: SoundSlot, id: string): Promise<string> {
    const resolved = await this.resolveId(slot, id);
    const src = this.bundledAssetPath(resolved);
    const dst = this.installedPath(slot, resolved);
    await ensureDir(path.dirname(dst));
    // Drop any stale file for this slot first (e.g. switching mp3 -> wav) so the
    // dir never holds two competing stop.* / notify.* files.
    await this.removeSlot(slot);
    await fs.copyFile(src, dst);
    return dst;
  }

  async installAll(stopId: string, notificationId: string): Promise<{ stop: string; notification: string }> {
    return {
      stop: await this.install("stop", stopId),
      notification: await this.install("notification", notificationId),
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
    // Remove the installed sound for each slot (any extension), plus the
    // launcher and legacy per-directory artifacts from older mechanisms.
    await this.removeSlot("stop");
    await this.removeSlot("notification");
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
