import * as vscode from "vscode";
import { affects, readConfig } from "../../core/config-manager";
import type { Feature } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { ChatsController } from "./chats-controller";
import { chatsHub } from "./chats-hub";
import { ArchiveService } from "./services/archive-service";
import { ChatFileWatcher } from "./services/chat-file-watcher";
import { ConversationRepository } from "./services/conversation-repository";
import { MarkdownExporter } from "./services/export-markdown";
import { RenameService } from "./services/rename-service";
import { registerChatCommands } from "./ui/chat-commands";
import { ChatStatusBar } from "./ui/chat-status-bar";

/** Settings that change which conversations the list holds or how it is ordered. */
const LIST_KEYS = ["chats.scope", "chats.groupBy", "chats.sortOrder", "chats.showArchived", "chats.hideEmpty"];

export function createChatsFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];

  return {
    id: "chats",
    isEnabled(): boolean {
      return readConfig().chats.enabled;
    },
    activate(): void {
      const repo = new ConversationRepository();
      const controller = new ChatsController(ctx, repo, new RenameService(), new ArchiveService(repo), new MarkdownExporter(repo));
      const statusBar = new ChatStatusBar();
      statusBar.setVisible(readConfig().chats.showStatusBarRename);
      const watcher = new ChatFileWatcher();

      disposables.push(
        controller,
        statusBar,
        watcher,
        watcher.onDidChange(() => controller.refresh()),
        ...registerChatCommands(controller),
        vscode.workspace.onDidChangeConfiguration((e) => {
          if (affects(e, "chats.showStatusBarRename")) statusBar.setVisible(readConfig().chats.showStatusBarRename);
          if (affects(e, "chats.codeCopyButtons") || affects(e, "chats.mdHeButton")) controller.viewer.applyFlags();
          if (LIST_KEYS.some((k) => affects(e, k)) || affects(e, "agents")) controller.refresh();
          // Project colors in the list follow the windows' colors.
          if (e.affectsConfiguration("workbench.colorCustomizations")) controller.refresh();
        }),
        // Re-scope the list when the user switches the open folder/workspace.
        vscode.workspace.onDidChangeWorkspaceFolders(() => controller.refresh()),
      );
      chatsHub.set(controller);
      logger.info("chats", "Feature activated.");
    },
    deactivate(): void {
      chatsHub.set(undefined);
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      disposables = [];
    },
  };
}
