import * as vscode from "vscode";
import type { SoundSlot } from "./alert-assets";
import { projectKey } from "./project-registry";

const STATE_KEY = "alerts.projectSounds";

/** A project's own sounds; a missing slot falls back to the global default. */
export type ProjectSoundOverrides = Partial<Record<SoundSlot, string>>;

// Shared across instances: the Alerts panel writes, the registry writer
// (inside the alerts feature) mirrors the change into the project's record.
const changed = new vscode.EventEmitter<void>();
export const onProjectSoundsChanged = changed.event;

/**
 * Per-project sound choices, kept in the extension's global state rather than
 * in .vscode/settings.json: a personal preference shouldn't land in a file
 * that may be committed with the project.
 */
export class ProjectSoundStore {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private all(): Record<string, ProjectSoundOverrides> {
    return this.ctx.globalState.get<Record<string, ProjectSoundOverrides>>(STATE_KEY) ?? {};
  }

  get(folder: string): ProjectSoundOverrides {
    return this.all()[projectKey(folder)] ?? {};
  }

  /** Set (or with undefined, clear) a project's sound for one slot. */
  async set(folder: string, slot: SoundSlot, id: string | undefined): Promise<void> {
    const all = { ...this.all() };
    const key = projectKey(folder);
    const next: ProjectSoundOverrides = { ...all[key] };
    if (id) next[slot] = id;
    else delete next[slot];
    if (Object.keys(next).length > 0) all[key] = next;
    else delete all[key];
    await this.ctx.globalState.update(STATE_KEY, all);
    changed.fire();
  }
}
