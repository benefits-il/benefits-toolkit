import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { toolkitProjectsDir } from "../../../core/paths";
import { logger } from "../../../core/logger";
import { currentTheme, onThemeChanged } from "../../../core/theme";
import { atomicWriteText } from "../../../shared/fs-utils";
import { foregroundFor, normalizeHex } from "../../window-color/services/color-utils";
import { WindowColorService } from "../../window-color/services/window-color-service";
import { findEditorCli } from "./editor-cli";
import type { HookPlatform } from "./hook-command";
import { projectKey, ProjectRecord } from "./project-registry";
import { onProjectPrefsChanged, ProjectPrefsStore } from "./project-prefs-store";

function listDirSync(dir: string): string[] | undefined {
  try {
    return fs.readdirSync(dir);
  } catch {
    return undefined;
  }
}

/**
 * Keeps this window's project records in ~/.benefits-toolkit/projects current:
 * name (the user's own, else the folder's), window color, the project's own
 * sounds, how to bring the window back, and whether it is focused right now
 * (so the dispatcher stays quiet while the user is already looking at it).
 */
export class ProjectRegistryWriter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  /** Last content written per record key, without the timestamp. */
  private readonly written = new Map<string, string>();
  private readonly cli: string | null;
  private readonly colors: WindowColorService;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    ctx: vscode.ExtensionContext,
    private readonly prefs: ProjectPrefsStore,
    platform: HookPlatform,
  ) {
    this.colors = new WindowColorService(ctx);
    this.cli = findEditorCli(vscode.env.appRoot, platform, listDirSync) ?? null;
    if (!this.cli) logger.warn("alerts", `No editor launcher found under ${vscode.env.appRoot}; popup clicks won't switch windows.`);
  }

  start(): void {
    this.disposables.push(
      vscode.window.onDidChangeWindowState(() => this.sync()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.sync()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("workbench.colorCustomizations")) this.sync();
      }),
      onProjectPrefsChanged(() => this.sync()),
      // The popup's card follows the toolkit's theme.
      onThemeChanged(() => this.sync()),
    );
    this.sync();
  }

  /** Rewrite the records (serialized; focus changes come in bursts). */
  sync(focused: boolean = vscode.window.state.focused): Promise<void> {
    this.queue = this.queue.then(() => this.write(focused)).catch((err) => {
      logger.warn("alerts", "Updating the project records failed", err);
    });
    return this.queue;
  }

  /** On shutdown: leave the records, but never as "focused". */
  async close(): Promise<void> {
    for (const d of this.disposables.splice(0)) d.dispose();
    await this.sync(false);
  }

  dispose(): void {
    for (const d of this.disposables.splice(0)) d.dispose();
  }

  private async write(focused: boolean): Promise<void> {
    const dir = toolkitProjectsDir();
    // A hand-edited color may not be #rrggbb: the popup falls back to green then.
    const color = normalizeHex(this.colors.getCurrentColor() ?? "") ?? null;
    const colorText = color ? foregroundFor(color) : null;
    const theme = currentTheme();
    const keep = new Set<string>();
    for (const wf of vscode.workspace.workspaceFolders ?? []) {
      if (wf.uri.scheme !== "file") continue;
      const folder = wf.uri.fsPath;
      const key = projectKey(folder);
      keep.add(key);
      const own = this.prefs.sounds(folder);
      const record: ProjectRecord = {
        folder,
        name: this.prefs.displayName(folder, wf.name),
        color,
        colorText,
        theme,
        sounds: { done: own.stop, waiting: own.notification },
        cli: this.cli,
        editor: vscode.env.uriScheme,
        pid: process.pid,
        focused,
        updatedAt: "",
      };
      const fingerprint = JSON.stringify(record);
      if (this.written.get(key) === fingerprint) continue;
      record.updatedAt = new Date().toISOString();
      await atomicWriteText(path.join(dir, `${key}.json`), JSON.stringify(record, null, 2) + "\n");
      this.written.set(key, fingerprint);
    }
    // Folders this window no longer has: drop the records it wrote, unless
    // another window has taken them over since.
    for (const key of [...this.written.keys()]) {
      if (keep.has(key)) continue;
      this.written.delete(key);
      const file = path.join(dir, `${key}.json`);
      try {
        const current = JSON.parse(await fs.promises.readFile(file, "utf8")) as ProjectRecord;
        if (current.pid === process.pid) await fs.promises.unlink(file);
      } catch {
        // already gone
      }
    }
  }
}
