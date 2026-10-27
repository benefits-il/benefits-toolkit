import * as vscode from "vscode";
import { antigravityBrainDir, claudeProjectsDir, cursorProjectsDir } from "../../../core/paths";
import { logger } from "../../../core/logger";

const DEBOUNCE_MS = 350;

/** Where each agent writes its conversations. */
const PATTERNS: [() => string, string][] = [
  [claudeProjectsDir, "**/*.jsonl"],
  [cursorProjectsDir, "*/agent-transcripts/*/*.jsonl"],
  [antigravityBrainDir, "*/.system_generated/logs/transcript_full.jsonl"],
];

export class ChatFileWatcher implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[];
  private readonly emitter = new vscode.EventEmitter<void>();
  private timer: NodeJS.Timeout | undefined;

  constructor() {
    this.watchers = PATTERNS.map(([dir, glob]) => {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir(), glob));
      watcher.onDidCreate(() => this.schedule("create"));
      watcher.onDidChange(() => this.schedule("change"));
      watcher.onDidDelete(() => this.schedule("delete"));
      return watcher;
    });
  }

  get onDidChange(): vscode.Event<void> {
    return this.emitter.event;
  }

  private schedule(kind: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      logger.info("chats-watcher", `Triggered refresh after ${kind}.`);
      this.emitter.fire();
    }, DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const w of this.watchers) w.dispose();
    this.emitter.dispose();
  }
}
