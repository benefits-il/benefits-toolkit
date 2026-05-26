import * as vscode from "vscode";
import { ChatsGroupBy, ChatsSortOrder, readConfig, updateConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { ConversationMeta } from "../domain/conversation";
import { ArchiveService } from "../services/archive-service";
import { ConversationRepository } from "../services/conversation-repository";
import { MarkdownExporter } from "../services/export-markdown";
import { RenameService } from "../services/rename-service";
import { ChatTreeProvider } from "./chat-tree-provider";
import { ConversationNode } from "./chat-tree-item";
import { ChatViewerService } from "./chat-viewer-webview";

export interface ChatCommandDeps {
  provider: ChatTreeProvider;
  repo: ConversationRepository;
  rename: RenameService;
  archive: ArchiveService;
  exporter: MarkdownExporter;
  viewer: ChatViewerService;
}

export function registerChatCommands(ctx: vscode.ExtensionContext, deps: ChatCommandDeps): vscode.Disposable[] {
  const out: vscode.Disposable[] = [];

  out.push(
    vscode.commands.registerCommand("benefit.chats.refresh", () => {
      deps.provider.refresh();
    }),

    vscode.commands.registerCommand("benefit.chats.view", async (node?: ConversationNode | ConversationMeta) => {
      const meta = pickMeta(node);
      if (!meta) return;
      await deps.viewer.open(meta);
    }),

    vscode.commands.registerCommand("benefit.chats.rename", async (node?: ConversationNode | ConversationMeta) => {
      const meta = pickMeta(node);
      if (!meta) return;
      await runRename(deps, meta);
    }),

    vscode.commands.registerCommand("benefit.chats.statusBarRename", async () => {
      const active = pickActiveConversation(deps.provider);
      if (!active) {
        vscode.window.showInformationMessage("Benefit: no active Claude Code conversation to rename right now.");
        return;
      }
      await runRename(deps, active);
    }),

    vscode.commands.registerCommand("benefit.chats.archive", async (node?: ConversationNode | ConversationMeta) => {
      const meta = pickMeta(node);
      if (!meta) return;
      try {
        await deps.archive.archive(meta);
        deps.provider.refresh();
      } catch (err) {
        logger.error("chats", "archive failed", err);
        vscode.window.showErrorMessage(`Archive failed: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.chats.restore", async (node?: ConversationNode | ConversationMeta) => {
      const meta = pickMeta(node);
      if (!meta) return;
      try {
        await deps.archive.restore(meta);
        deps.provider.refresh();
      } catch (err) {
        logger.error("chats", "restore failed", err);
        vscode.window.showErrorMessage(`Restore failed: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.chats.delete", async (node?: ConversationNode | ConversationMeta) => {
      const meta = pickMeta(node);
      if (!meta) return;
      const cfg = readConfig().chats;
      if (cfg.confirmDelete) {
        const choice = await vscode.window.showWarningMessage(
          `Delete conversation "${meta.title}"? This cannot be undone.`,
          { modal: true },
          "Delete",
        );
        if (choice !== "Delete") return;
      }
      try {
        await deps.archive.delete(meta);
        deps.provider.refresh();
      } catch (err) {
        logger.error("chats", "delete failed", err);
        vscode.window.showErrorMessage(`Delete failed: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.chats.export", async (node?: ConversationNode | ConversationMeta) => {
      const meta = pickMeta(node);
      if (!meta) return;
      const dest = await deps.exporter.suggestDest(meta);
      if (!dest) return;
      try {
        await deps.exporter.exportToFile(meta, dest.fsPath);
        const open = await vscode.window.showInformationMessage(`Exported to ${dest.fsPath}`, "Open");
        if (open === "Open") {
          const doc = await vscode.workspace.openTextDocument(dest);
          await vscode.window.showTextDocument(doc);
        }
      } catch (err) {
        logger.error("chats", "export failed", err);
        vscode.window.showErrorMessage(`Export failed: ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.chats.search", async () => {
      const all = deps.provider.allConversations();
      const items = all.map((m) => ({
        label: m.title,
        description: m.projectDisplayName,
        detail: `${m.realMessageCount} message(s) · ${m.lastModifiedAt}`,
        meta: m,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Search conversations",
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (picked) {
        await deps.viewer.open(picked.meta);
      }
    }),

    vscode.commands.registerCommand("benefit.chats.toggleSort", async () => {
      const current = readConfig().chats.sortOrder;
      const next: ChatsSortOrder = current === "newest" ? "oldest" : "newest";
      await updateConfig("chats.sortOrder", next);
      deps.provider.invalidate();
    }),

    vscode.commands.registerCommand("benefit.chats.toggleGroupBy", async () => {
      const order: ChatsGroupBy[] = ["date", "project", "flat"];
      const current = readConfig().chats.groupBy;
      const next = order[(order.indexOf(current) + 1) % order.length];
      await updateConfig("chats.groupBy", next);
      vscode.window.showInformationMessage(`Benefit Chats: group by ${next}.`);
      deps.provider.invalidate();
    }),

    vscode.commands.registerCommand("benefit.chats.toggleArchived", async () => {
      const current = readConfig().chats.showArchived;
      await updateConfig("chats.showArchived", !current);
      deps.provider.refresh();
    }),
  );

  ctx.subscriptions.push(...out);
  return out;
}

async function runRename(deps: ChatCommandDeps, meta: ConversationMeta): Promise<void> {
  const next = await vscode.window.showInputBox({
    title: "Rename conversation",
    value: meta.title,
    prompt: "New title",
    valueSelection: [0, meta.title.length],
  });
  if (next === undefined || next.trim() === meta.title) return;
  try {
    await deps.rename.rename(meta.filePath, next);
    deps.provider.refresh();
    deps.viewer.refreshOpen(meta.filePath);
  } catch (err) {
    logger.error("chats", "rename failed", err);
    vscode.window.showErrorMessage(`Rename failed: ${(err as Error).message}`);
  }
}

function pickMeta(node?: ConversationNode | ConversationMeta): ConversationMeta | undefined {
  if (!node) return undefined;
  if ((node as ConversationNode).kind === "conversation") {
    return (node as ConversationNode).meta;
  }
  return node as ConversationMeta;
}

function pickActiveConversation(provider: ChatTreeProvider): ConversationMeta | undefined {
  const all = provider.allConversations();
  if (all.length === 0) return undefined;
  const sorted = all.slice().sort((a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt));
  return sorted[0];
}
