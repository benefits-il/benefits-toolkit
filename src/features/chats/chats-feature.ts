import * as vscode from "vscode";
import { affects, readConfig } from "../../core/config-manager";
import type { Feature } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { ArchiveService } from "./services/archive-service";
import { ChatFileWatcher } from "./services/chat-file-watcher";
import { ConversationRepository } from "./services/conversation-repository";
import { MarkdownExporter } from "./services/export-markdown";
import { RenameService } from "./services/rename-service";
import { registerChatCommands } from "./ui/chat-commands";
import { ChatStatusBar } from "./ui/chat-status-bar";
import { ChatTreeProvider } from "./ui/chat-tree-provider";
import { ChatViewerService } from "./ui/chat-viewer-webview";

export function createChatsFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];
  let provider: ChatTreeProvider | undefined;
  let viewer: ChatViewerService | undefined;
  let statusBar: ChatStatusBar | undefined;

  return {
    id: "chats",
    isEnabled(): boolean {
      return readConfig().chats.enabled;
    },
    async activate(): Promise<void> {
      const repo = new ConversationRepository();
      const rename = new RenameService(repo);
      const archive = new ArchiveService(repo);
      const exporter = new MarkdownExporter(repo);

      provider = new ChatTreeProvider(repo);
      viewer = new ChatViewerService(ctx, repo);
      statusBar = new ChatStatusBar();
      statusBar.setVisible(readConfig().chats.showStatusBarRename);

      const treeView = vscode.window.createTreeView("benefit.chatsView", {
        treeDataProvider: provider,
        showCollapseAll: true,
      });
      disposables.push(treeView, statusBar);

      const watcher = new ChatFileWatcher();
      disposables.push(watcher);
      disposables.push(watcher.onDidChange(() => provider?.refresh()));

      disposables.push(
        ...registerChatCommands(ctx, {
          provider,
          repo,
          rename,
          archive,
          exporter,
          viewer,
        }),
      );

      disposables.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
          if (!provider || !statusBar) return;
          if (affects(e, "chats.showStatusBarRename")) {
            statusBar.setVisible(readConfig().chats.showStatusBarRename);
          }
          if (
            affects(e, "chats.scope") ||
            affects(e, "chats.groupBy") ||
            affects(e, "chats.sortOrder") ||
            affects(e, "chats.showArchived") ||
            affects(e, "chats.hideEmpty")
          ) {
            provider.refresh();
          }
        }),
      );

      // Re-scope the list when the user switches the open folder/workspace.
      disposables.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => provider?.refresh()),
      );

      logger.info("chats", "Feature activated.");
    },
    async deactivate(): Promise<void> {
      viewer?.closeAll();
      for (const d of disposables) {
        try { d.dispose(); } catch { /* ignore */ }
      }
      disposables = [];
      provider = undefined;
      viewer = undefined;
      statusBar = undefined;
    },
  };
}
