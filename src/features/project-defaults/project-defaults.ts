import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { readConfig } from "../../core/config-manager";
import { logger } from "../../core/logger";
import { claudeProjectsDir, toolkitProjectsDir } from "../../core/paths";
import { AlertAssets } from "../alerts/services/alert-assets";
import { ProjectPrefsStore } from "../alerts/services/project-prefs-store";
import { projectKey } from "../alerts/services/project-registry";
import { readProjectRecords } from "../alerts/services/project-records-reader";
import { encodeProjectFolder } from "../chats/services/conversation-repository";
import { WindowColorService } from "../window-color/services/window-color-service";
import { pickFreeColor, pickFreeSound } from "./pick-defaults";

// Projects already given a color or a sound, once each: clearing one later stays cleared.
const COLOR_DONE_KEY = "defaults.colorAssigned";
const SOUND_DONE_KEY = "defaults.soundAssigned";

/**
 * Gives a project its own window color and its own "finished" sound, ones no
 * other project uses, the first time this window sees it as a project: a
 * folder with at least one Claude Code conversation. Each part has its own
 * switch and runs only while its feature is on. "Needs input" stays the one
 * shared sound, so it always means the same thing.
 */
export class ProjectDefaults implements vscode.Disposable {
  private readonly subs: vscode.Disposable[];
  private readonly colors: WindowColorService;
  private readonly prefs: ProjectPrefsStore;
  private readonly assets: AlertAssets;
  private running = false;
  private readonly startTimer: ReturnType<typeof setTimeout>;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.colors = new WindowColorService(ctx);
    this.prefs = new ProjectPrefsStore(ctx);
    this.assets = new AlertAssets(ctx);
    // A first conversation starts while the window is open: coming back to
    // the window (or changing folders) checks again, until it is done.
    this.subs = [
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.check()),
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) void this.check();
      }),
    ];
    // After the features have settled (Window colors may be restoring a color).
    this.startTimer = setTimeout(() => void this.check(), 3000);
  }

  async check(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.assign();
    } catch (err) {
      logger.warn("defaults", "Giving this project its own color or sound failed", err);
    } finally {
      this.running = false;
    }
  }

  private async assign(): Promise<void> {
    const folder = (vscode.workspace.workspaceFolders ?? []).find((f) => f.uri.scheme === "file")?.uri.fsPath;
    if (!folder) return;
    const key = projectKey(folder);
    const cfg = readConfig();
    const colorDone = this.ctx.globalState.get<string[]>(COLOR_DONE_KEY) ?? [];
    const soundDone = this.ctx.globalState.get<string[]>(SOUND_DONE_KEY) ?? [];
    const wantColor = cfg.windowColor.enabled && cfg.windowColor.autoAssign && !colorDone.includes(key);
    const wantSound = cfg.sounds.enabled && cfg.sounds.autoAssign && !soundDone.includes(key);
    if (!wantColor && !wantSound) return;
    if (!(await hasConversation(folder))) return;

    const others = (await readProjectRecords(toolkitProjectsDir())).filter((r) => projectKey(r.folder) !== key);

    if (wantColor) {
      // A color set by hand (or put away while off) is the project's already.
      if (!this.colors.getCurrentColor() && !this.colors.getStashedColor()) {
        const hex = pickFreeColor(others.map((r) => r.color));
        if (hex) {
          await this.colors.apply(hex);
          logger.info("defaults", `Gave ${path.basename(folder)} the window color ${hex}.`);
        }
      }
      await this.ctx.globalState.update(COLOR_DONE_KEY, [...colorDone, key]);
    }

    if (wantSound) {
      if (!this.prefs.sounds(folder).stop) {
        const pool = (await this.assets.listSounds()).map((s) => s.id);
        const used = [
          ...others.map((r) => r.sounds?.done),
          ...this.prefs.allStopSounds(),
          cfg.sounds.stopSound,
          cfg.sounds.notificationSound,
        ];
        const id = pickFreeSound(pool, used);
        if (id) {
          await this.prefs.setSound(folder, "stop", id);
          logger.info("defaults", `Gave ${path.basename(folder)} the finished sound ${id}.`);
        }
      }
      await this.ctx.globalState.update(SOUND_DONE_KEY, [...soundDone, key]);
    }
  }

  dispose(): void {
    clearTimeout(this.startTimer);
    this.subs.forEach((s) => s.dispose());
  }
}

/** Whether Claude Code has kept a conversation for this folder. */
async function hasConversation(folder: string): Promise<boolean> {
  try {
    const names = await fs.readdir(path.join(claudeProjectsDir(), encodeProjectFolder(folder)));
    return names.some((n) => n.endsWith(".jsonl"));
  } catch {
    return false;
  }
}
