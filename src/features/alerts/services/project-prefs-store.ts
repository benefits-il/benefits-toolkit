import * as vscode from "vscode";
import type { SoundSlot } from "./alert-assets";
import { cleanDisplayName, projectKey } from "./project-registry";

const SOUNDS_KEY = "alerts.projectSounds";
const NAMES_KEY = "alerts.projectNames";

/** A project's own sounds; a missing slot falls back to the global default. */
export type ProjectSoundOverrides = Partial<Record<SoundSlot, string>>;

// Shared across instances: Toolkit Settings writes, the registry writer
// (inside the alerts feature) mirrors the change into the project's record.
const changed = new vscode.EventEmitter<void>();
export const onProjectPrefsChanged = changed.event;

/**
 * Per-project alert preferences (own sounds, the name the popup shows), kept
 * in the extension's global state rather than in .vscode/settings.json: a
 * personal preference shouldn't land in a file that may be committed with
 * the project.
 */
export class ProjectPrefsStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private read<T>(stateKey: string): Record<string, T> {
    return this.ctx.globalState.get<Record<string, T>>(stateKey) ?? {};
  }

  /** Store (or with undefined, drop) one project's entry under stateKey. */
  private async write<T>(stateKey: string, folder: string, value: T | undefined): Promise<void> {
    const all = { ...this.read<T>(stateKey) };
    const key = projectKey(folder);
    if (value === undefined) delete all[key];
    else all[key] = value;
    await this.ctx.globalState.update(stateKey, all);
    changed.fire();
  }

  sounds(folder: string): ProjectSoundOverrides {
    return this.read<ProjectSoundOverrides>(SOUNDS_KEY)[projectKey(folder)] ?? {};
  }

  /** Every project's own "finished" sound, so a new project can get one nobody uses. */
  allStopSounds(): string[] {
    return Object.values(this.read<ProjectSoundOverrides>(SOUNDS_KEY))
      .map((s) => s.stop)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }

  /** Set (or with undefined, clear) a project's sound for one slot. */
  async setSound(folder: string, slot: SoundSlot, id: string | undefined): Promise<void> {
    const next: ProjectSoundOverrides = { ...this.sounds(folder) };
    if (id) next[slot] = id;
    else delete next[slot];
    await this.write(SOUNDS_KEY, folder, Object.keys(next).length > 0 ? next : undefined);
  }

  /** The name the user gave this project for its popup, if any. */
  name(folder: string): string | undefined {
    return this.read<string>(NAMES_KEY)[projectKey(folder)];
  }

  /** Set the popup name; blank (or undefined) goes back to the folder name. */
  async setName(folder: string, raw: string | undefined): Promise<void> {
    await this.write(NAMES_KEY, folder, raw === undefined ? undefined : cleanDisplayName(raw));
  }

  /** What the popup shows for this folder: the custom name, else `fallback`. */
  displayName(folder: string, fallback: string): string {
    return this.name(folder) ?? fallback;
  }
}
