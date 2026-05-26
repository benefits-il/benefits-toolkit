import * as vscode from "vscode";
import { claudeProjectsDir } from "../../../core/paths";
import { logger } from "../../../core/logger";

const DEBOUNCE_MS = 350;

export class ChatFileWatcher implements vscode.Disposable {
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly emitter = new vscode.EventEmitter<void>();
  private timer: NodeJS.Timeout | undefined;

  constructor() {
    const pattern = new vscode.RelativePattern(claudeProjectsDir(), "**/*.jsonl");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidCreate(() => this.schedule("create"));
    this.watcher.onDidChange(() => this.schedule("change"));
    this.watcher.onDidDelete(() => this.schedule("delete"));
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
    this.watcher.dispose();
    this.emitter.dispose();
  }
}
