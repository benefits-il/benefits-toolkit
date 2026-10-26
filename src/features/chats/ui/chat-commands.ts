import * as vscode from "vscode";
import { ChatsGroupBy, ChatsScope, ChatsSortOrder, readConfig, updateConfigEffective } from "../../../core/config-manager";
import type { ChatsController } from "../chats-controller";
import type { ConversationMeta } from "../domain/conversation";

/** What a command may be called with: a conversation, its file (the id), or nothing (then a Quick Pick asks). */
type ConversationArg = ConversationMeta | string | undefined;

export function registerChatCommands(controller: ChatsController): vscode.Disposable[] {
  /** The conversation a command is about; from the palette, the user picks one. */
  async function resolve(arg: ConversationArg, placeHolder: string): Promise<ConversationMeta | undefined> {
    if (typeof arg === "string") {
      // The list may not have been read yet in this window.
      if (!controller.find(arg)) await controller.list();
      return controller.find(arg);
    }
    if (arg && typeof arg === "object" && typeof arg.filePath === "string") return arg;
    return controller.pickConversation(placeHolder);
  }

  function action(id: string, placeHolder: string, run: (meta: ConversationMeta) => Promise<void>): vscode.Disposable {
    return vscode.commands.registerCommand(id, async (arg?: ConversationArg) => {
      const meta = await resolve(arg, placeHolder);
      if (meta) await run(meta);
    });
  }

  return [
    vscode.commands.registerCommand("benefit.chats.refresh", () => controller.refresh()),
    action("benefit.chats.view", "Open a conversation", (m) => controller.open(m)),
    action("benefit.chats.search", "Search conversations", (m) => controller.open(m)),
    action("benefit.chats.rename", "Rename a conversation", (m) => controller.rename(m)),
    action("benefit.chats.archive", "Archive a conversation", (m) => controller.archive(m)),
    action("benefit.chats.restore", "Restore a conversation", (m) => controller.restore(m)),
    action("benefit.chats.delete", "Delete a conversation", (m) => controller.delete(m)),
    action("benefit.chats.export", "Save a conversation as Markdown", (m) => controller.exportFull(m)),

    // The conversation running in this window's project, never another
    // project's, whatever the list's scope.
    vscode.commands.registerCommand("benefit.chats.statusBarRename", async () => {
      const live = await controller.liveConversation();
      if (!live) {
        vscode.window.showInformationMessage("Benefit: no Claude Code conversation in this project yet.");
        return;
      }
      await controller.rename(live);
    }),

    vscode.commands.registerCommand("benefit.chats.toggleSort", async () => {
      const next: ChatsSortOrder = readConfig().chats.sortOrder === "newest" ? "oldest" : "newest";
      await updateConfigEffective("chats.sortOrder", next);
    }),
    vscode.commands.registerCommand("benefit.chats.toggleGroupBy", async () => {
      const order: ChatsGroupBy[] = ["date", "project", "flat"];
      const current = readConfig().chats.groupBy;
      await updateConfigEffective("chats.groupBy", order[(order.indexOf(current) + 1) % order.length]);
    }),
    vscode.commands.registerCommand("benefit.chats.toggleArchived", async () => {
      await updateConfigEffective("chats.showArchived", !readConfig().chats.showArchived);
    }),
    vscode.commands.registerCommand("benefit.chats.toggleScope", async () => {
      const next: ChatsScope = readConfig().chats.scope === "currentWorkspace" ? "all" : "currentWorkspace";
      await updateConfigEffective("chats.scope", next);
    }),
  ];
}
