import * as vscode from "vscode";
import { ChatsScope, readConfig } from "../../core/config-manager";
import { logger } from "../../core/logger";
import { toolkitProjectsDir } from "../../core/paths";
import { AgentId, AGENT_NAMES, editorAgent } from "../../shared/agents";
import { isWindows } from "../../shared/platform-detector";
import { findProject } from "../alerts/services/project-registry";
import { readProjectRecords } from "../alerts/services/project-records-reader";
import { WindowColorService } from "../window-color/services/window-color-service";
import { ConversationMeta } from "./domain/conversation";
import { ArchiveService } from "./services/archive-service";
import { contextPercent, groupConversations, inWorkspace, sortConversations } from "./services/chat-list";
import { ConversationRepository } from "./services/conversation-repository";
import { MarkdownExporter } from "./services/export-markdown";
import { CLAUDE_CODE_EXTENSION, OpenableAgent, openInAgentCommand, openInAgentTarget, OPEN_IN_AGENT_NAMES } from "./services/open-in-agent";
import { RenameService } from "./services/rename-service";
import { ChatViewerService } from "./ui/chat-viewer-webview";

/** One row of the sidebar list. `id` is the conversation file: the identity every action uses. */
export interface ChatRow {
  id: string;
  /** Whose conversation: the row carries that agent's mark. */
  agent: AgentId;
  /** Another agent's conversation: open and save only, never rename, archive or delete. */
  readOnly: boolean;
  title: string;
  project: string;
  /** The project's window color, when a window has recorded one. */
  color: string | null;
  /** How full the context window is, 0 to 100; null when the file has no usage. */
  context: number | null;
  /** ISO time of the last change; the page turns it into "42m", "2d". */
  modified: string;
  archived: boolean;
  /** The agent whose own chat can open this conversation here (the row's button); null for none. */
  openIn: OpenableAgent | null;
}

export interface ChatListSnapshot {
  status: "ready" | "noFolder" | "error";
  scope: ChatsScope;
  groups: { label: string; rows: ChatRow[] }[];
  total: number;
}

function workspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file").map((f) => f.uri.fsPath);
}

/** Where this window can open a conversation's own chat; null for none, or with the setting off. */
export function openInAgentHere(meta: ConversationMeta): OpenableAgent | null {
  if (!readConfig().chats.openInAgentButton) return null;
  return openInAgentTarget(meta, {
    editor: editorAgent(vscode.env.uriScheme),
    claudeCode: vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION) !== undefined,
    folders: workspaceFolders(),
    caseInsensitive: isWindows(),
  });
}

/**
 * The conversations feature behind the sidebar's Chats tab, the palette
 * commands and the viewer: one list, one set of actions, whoever asks.
 */
export class ChatsController implements vscode.Disposable {
  readonly viewer: ChatViewerService;
  private readonly changed = new vscode.EventEmitter<void>();
  /** The list may differ now: files changed, a setting moved, an action ran. */
  readonly onDidChange = this.changed.event;
  private readonly revealed = new vscode.EventEmitter<string>();
  /** "Show in list" from a viewer: the sidebar selects that conversation. */
  readonly onDidReveal = this.revealed.event;

  private snapshot: Promise<ChatListSnapshot> | undefined;
  /** Every conversation the last list held (all scopes), by file. */
  private known = new Map<string, ConversationMeta>();
  private readonly colors: WindowColorService;

  constructor(
    ctx: vscode.ExtensionContext,
    private readonly repo: ConversationRepository,
    private readonly renamer: RenameService,
    private readonly archiver: ArchiveService,
    private readonly exporter: MarkdownExporter,
  ) {
    this.colors = new WindowColorService(ctx);
    // 0.8.0 builds before this one kept exact message counts here.
    void ctx.globalState.update("chats.messageCounts", undefined);
    this.viewer = new ChatViewerService(ctx, repo, {
      rename: (m) => this.rename(m),
      archive: (m) => this.archive(m),
      restore: (m) => this.restore(m),
      delete: (m) => this.delete(m),
      exportFull: (m) => this.exportFull(m),
      revealInList: (m) => this.revealInList(m),
      openInAgent: (m) => this.openInAgent(m),
      openInTarget: (m) => openInAgentHere(m),
      projectColor: async (m) => (await this.colorLookup(workspaceFolders()))(m),
    });
  }

  /** Forget the cached list and tell the listeners. */
  refresh(): void {
    this.snapshot = undefined;
    this.changed.fire();
  }

  list(): Promise<ChatListSnapshot> {
    if (!this.snapshot) {
      this.snapshot = this.build().catch((err) => {
        logger.error("chats", "Reading conversations failed", err);
        return { status: "error" as const, scope: readConfig().chats.scope, groups: [], total: 0 };
      });
    }
    return this.snapshot;
  }

  find(id: string): ConversationMeta | undefined {
    return this.known.get(id);
  }

  private async build(): Promise<ChatListSnapshot> {
    const config = readConfig();
    const cfg = config.chats;
    const folders = workspaceFolders();
    const records = await readProjectRecords(toolkitProjectsDir());
    const all = await this.repo.scan({
      hideEmpty: cfg.hideEmpty,
      includeArchived: cfg.showArchived,
      agents: config.agents,
      folders: [...folders, ...records.map((r) => r.folder)],
    });
    this.known = new Map(all.map((m) => [m.filePath, m]));
    if (cfg.scope === "currentWorkspace" && folders.length === 0) {
      return { status: "noFolder", scope: cfg.scope, groups: [], total: 0 };
    }

    const scoped = cfg.scope === "all" ? all : inWorkspace(all, folders, isWindows());
    const sorted = sortConversations(scoped, cfg.sortOrder);
    const colorOf = await this.colorLookup(folders);
    const groups = groupConversations(sorted, cfg.groupBy).map((g) => ({
      label: g.label,
      rows: g.items.map((m) => ({
        id: m.filePath,
        agent: m.source,
        readOnly: m.source !== "claude",
        title: m.title,
        project: m.projectDisplayName,
        color: colorOf(m),
        context: contextPercent(m),
        modified: m.lastModifiedAt,
        archived: m.archived,
        openIn: openInAgentHere(m),
      })),
    }));
    return { status: "ready", scope: cfg.scope, groups, total: sorted.length };
  }

  /** This window's color for its own conversations; the project records for the rest. */
  private async colorLookup(folders: string[]): Promise<(m: ConversationMeta) => string | null> {
    const records = await readProjectRecords(toolkitProjectsDir());
    const own = this.colors.getCurrentColor() ?? null;
    return (m) => {
      if (own && inWorkspace([m], folders, isWindows()).length) return own;
      if (!m.cwd) return null;
      return findProject(records, m.cwd)?.color ?? null;
    };
  }

  /** The Claude Code conversation running in this window's project: the most recent one there, whatever the list's scope. */
  async liveConversation(): Promise<ConversationMeta | undefined> {
    const cfg = readConfig().chats;
    const all = await this.repo.scan({ hideEmpty: cfg.hideEmpty, includeArchived: false });
    return sortConversations(inWorkspace(all, workspaceFolders(), isWindows()), "newest")[0];
  }

  /** A Quick Pick over the current list, for palette commands run without a conversation. */
  async pickConversation(placeHolder: string): Promise<ConversationMeta | undefined> {
    const snap = await this.list();
    const items = snap.groups.flatMap((g) =>
      g.rows.map((r) => ({
        label: r.title,
        description: r.agent === "claude" ? r.project : `${r.project} · ${AGENT_NAMES[r.agent]}`,
        detail: r.context === null ? undefined : `Context ${Math.round(r.context)}%`,
        id: r.id,
      })),
    );
    if (items.length === 0) {
      vscode.window.showInformationMessage("Benefit: no conversations in this list.");
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
    return picked ? this.find(picked.id) : undefined;
  }

  async open(meta: ConversationMeta): Promise<void> {
    await this.viewer.open(meta);
  }

  /** The conversation in its agent's own chat, in an editor tab: Claude Code's, or Cursor's inside Cursor. */
  async openInAgent(meta: ConversationMeta): Promise<void> {
    const agent = openInAgentHere(meta);
    if (!agent) {
      vscode.window.showInformationMessage(`Benefit: this conversation cannot open in ${AGENT_NAMES[meta.source]}'s chat from this window.`);
      return;
    }
    const [command, ...args] = openInAgentCommand(agent, meta.conversationId);
    try {
      await vscode.commands.executeCommand(command, ...args);
    } catch (err) {
      logger.error("chats", `Opening in ${OPEN_IN_AGENT_NAMES[agent]} failed`, err);
      vscode.window.showErrorMessage(`Benefit: could not open the conversation in ${OPEN_IN_AGENT_NAMES[agent]}: ${(err as Error).message}`);
    }
  }

  /** Cursor's and Antigravity's files belong to them: the toolkit only reads them. */
  private refuseReadOnly(meta: ConversationMeta, verb: string): boolean {
    if (meta.source === "claude") return false;
    vscode.window.showInformationMessage(`Benefit: ${AGENT_NAMES[meta.source]} conversations are read-only. ${verb} works on Claude Code conversations.`);
    return true;
  }

  async rename(meta: ConversationMeta): Promise<void> {
    if (this.refuseReadOnly(meta, "Rename")) return;
    const next = await vscode.window.showInputBox({
      title: "Rename conversation",
      value: meta.title,
      prompt: "New title",
      valueSelection: [0, meta.title.length],
      validateInput: (v) => (v.trim() ? undefined : "Enter a title."),
    });
    if (next === undefined || next.trim() === meta.title) return;
    try {
      await this.renamer.rename(meta.filePath, next);
      this.refresh();
      this.viewer.refreshOpen(meta.filePath);
    } catch (err) {
      logger.error("chats", "rename failed", err);
      vscode.window.showErrorMessage(`Rename failed: ${(err as Error).message}`);
    }
  }

  async archive(meta: ConversationMeta): Promise<void> {
    if (this.refuseReadOnly(meta, "Archive")) return;
    await this.move(meta, () => this.archiver.archive(meta), "Archive");
  }

  async restore(meta: ConversationMeta): Promise<void> {
    if (this.refuseReadOnly(meta, "Restore")) return;
    await this.move(meta, () => this.archiver.restore(meta), "Restore");
  }

  private async move(meta: ConversationMeta, run: () => Promise<string>, verb: string): Promise<void> {
    try {
      const dest = await run();
      this.refresh();
      await this.viewer.retarget(meta.filePath, dest);
    } catch (err) {
      logger.error("chats", `${verb} failed`, err);
      vscode.window.showErrorMessage(`${verb} failed: ${(err as Error).message}`);
    }
  }

  async delete(meta: ConversationMeta): Promise<void> {
    if (this.refuseReadOnly(meta, "Delete")) return;
    if (readConfig().chats.confirmDelete) {
      const choice = await vscode.window.showWarningMessage(
        `Delete "${meta.title}"?`,
        { modal: true, detail: "Deletes the conversation file from disk. This cannot be undone." },
        "Delete",
      );
      if (choice !== "Delete") return;
    }
    try {
      await this.archiver.delete(meta);
      this.viewer.close(meta.filePath);
      this.refresh();
    } catch (err) {
      logger.error("chats", "delete failed", err);
      vscode.window.showErrorMessage(`Delete failed: ${(err as Error).message}`);
    }
  }

  /** The whole conversation, chronological, with timestamps. */
  async exportFull(meta: ConversationMeta): Promise<void> {
    const dest = await this.exporter.suggestDest(meta);
    if (!dest) return;
    try {
      await this.exporter.exportToFile(meta, dest.fsPath);
      const open = await vscode.window.showInformationMessage(`Saved to ${dest.fsPath}`, "Open");
      if (open === "Open") await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(dest));
    } catch (err) {
      logger.error("chats", "export failed", err);
      vscode.window.showErrorMessage(`Export failed: ${(err as Error).message}`);
    }
  }

  async revealInList(meta: ConversationMeta): Promise<void> {
    await vscode.commands.executeCommand("benefit.sidebar.focus");
    this.revealed.fire(meta.filePath);
  }

  dispose(): void {
    this.viewer.dispose();
    this.changed.dispose();
    this.revealed.dispose();
  }
}
