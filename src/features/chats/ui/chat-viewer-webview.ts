import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { currentTheme, onThemeChanged } from "../../../core/theme";
import { atomicWriteText, ensureDir } from "../../../shared/fs-utils";
import { brandFontUris, panelResourceRoots } from "../../../shared/webview-fonts";
import { ConversationMeta } from "../domain/conversation";
import { ConversationRepository } from "../services/conversation-repository";
import { isWebLink, parseFileLink, resolveCandidates } from "../services/link-resolver";
import { openInMdHe } from "../services/md-he-launcher";
import type { OpenableAgent } from "../services/open-in-agent";
import { buildViewerHtml, cleanViewerPrefs, openInButton, ViewerFlags, viewerParts, ViewerPrefs } from "./viewer/viewer-html";

const VIEW_TYPE = "benefit.chatViewer";
/** Reading direction and Display filters, shared by every viewer. */
// v2: the bubbles changed the switches (Auto direction, Hide Claude's work); earlier builds' prefs are left behind.
const PREFS_KEY = "chats.viewerPrefs.v2";

/** What a viewer's More menu does; the conversations controller carries it out. */
export interface ViewerActions {
  rename(meta: ConversationMeta): Promise<void>;
  archive(meta: ConversationMeta): Promise<void>;
  restore(meta: ConversationMeta): Promise<void>;
  delete(meta: ConversationMeta): Promise<void>;
  exportFull(meta: ConversationMeta): Promise<void>;
  revealInList(meta: ConversationMeta): Promise<void>;
  /** The conversation in its agent's own chat (the header's button). */
  openInAgent(meta: ConversationMeta): Promise<void>;
  /** Whose chat can open it from this window; null hides the button. */
  openInTarget(meta: ConversationMeta): OpenableAgent | null;
  projectColor(meta: ConversationMeta): Promise<string | null>;
}

type ActionName = "rename" | "archive" | "restore" | "delete" | "exportFull" | "reveal" | "openInAgent";

interface ViewerMessage {
  type?: string;
  action?: string;
  content?: string;
  href?: string;
  prefs?: unknown;
}

interface OpenViewer {
  panel: vscode.WebviewPanel;
  /** The freshest meta: a rename or a move re-reads it. */
  meta: ConversationMeta;
  /** The file's size and time when the page was last filled; a different one means new messages. */
  stamp: string;
  /** The file changed while the tab was hidden: it updates when shown. */
  stale: boolean;
  /** An update is running; `again` asks for one more after it. */
  busy: boolean;
  again: boolean;
}

/** A file's size and time of change, to tell whether it grew; "" once it is gone. */
async function stampOf(filePath: string): Promise<string> {
  try {
    const s = await fs.promises.stat(filePath);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return "";
  }
}

function readViewerFlags(): ViewerFlags {
  const cfg = readConfig().chats;
  return { codeCopy: cfg.codeCopyButtons, mdHe: cfg.mdHeButton };
}

function tabTitle(title: string): string {
  return title.length <= 28 ? title : `${title.slice(0, 27)}…`;
}

/** The read-only conversation viewer: one editor tab per conversation. */
export class ChatViewerService implements vscode.Disposable {
  private readonly viewers = new Map<string, OpenViewer>();
  private readonly activeChanged = new vscode.EventEmitter<string | undefined>();
  /** The conversation in the focused viewer tab changed (or none is focused). */
  readonly onDidChangeActive = this.activeChanged.event;
  private active: string | undefined;
  private readonly themeSub: vscode.Disposable;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly repo: ConversationRepository,
    private readonly actions: ViewerActions,
  ) {
    this.themeSub = onThemeChanged((theme) => this.broadcast({ type: "theme", theme }));
  }

  /** The conversation file in the viewer tab that has focus, if any. */
  activePath(): string | undefined {
    return this.active;
  }

  async open(meta: ConversationMeta): Promise<void> {
    const existing = this.viewers.get(meta.filePath);
    if (existing) {
      existing.panel.reveal();
      void this.updateIfChanged(existing);
      return;
    }

    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, tabTitle(meta.title), this.column(), {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: panelResourceRoots(this.ctx.extensionUri),
    });
    panel.iconPath = new vscode.ThemeIcon("comment-discussion");
    const entry: OpenViewer = { panel, meta, stamp: "", stale: false, busy: false, again: false };
    this.viewers.set(meta.filePath, entry);

    panel.onDidChangeViewState(() => {
      this.syncActive();
      if (panel.visible && entry.stale) void this.update(entry);
    });
    panel.onDidDispose(() => {
      for (const [key, value] of this.viewers) if (value === entry) this.viewers.delete(key);
      this.syncActive();
    });
    panel.webview.onDidReceiveMessage((msg: ViewerMessage) => void this.onMessage(entry, msg));

    await this.render(entry);
    this.syncActive();
  }

  /** Re-read and re-render an open conversation (after a rename). */
  refreshOpen(filePath: string): void {
    const entry = this.viewers.get(filePath);
    if (!entry) return;
    void (async () => {
      const meta = await this.repo.readMeta(filePath, entry.meta.projectFolder, entry.meta.archived);
      if (!meta) return;
      entry.meta = meta;
      await this.render(entry);
    })();
  }

  /**
   * Conversation files changed on disk (the agent wrote more): every open
   * viewer whose file grew takes the new messages in place. A hidden tab
   * waits until it is shown.
   */
  refreshChanged(): void {
    for (const entry of this.viewers.values()) void this.updateIfChanged(entry);
  }

  /** The setting or Claude Code's presence changed: each header's button follows. */
  syncOpenIn(): void {
    for (const entry of this.viewers.values()) {
      void entry.panel.webview.postMessage({ type: "openIn", button: openInButton(this.actions.openInTarget(entry.meta)) });
    }
  }

  private async updateIfChanged(entry: OpenViewer): Promise<void> {
    const stamp = await stampOf(entry.meta.filePath);
    if (!stamp || stamp === entry.stamp) return;
    if (entry.panel.visible) await this.update(entry);
    else entry.stale = true;
  }

  /** New messages into an open page, without reloading it: its scroll, open cards and search stay. */
  private async update(entry: OpenViewer): Promise<void> {
    if (entry.busy) {
      entry.again = true;
      return;
    }
    entry.busy = true;
    try {
      do {
        entry.again = false;
        entry.stale = false;
        const stamp = await stampOf(entry.meta.filePath);
        if (!stamp) return;
        // Claude Code's files carry the title and the usage; the others' list data stays.
        if (entry.meta.source === "claude") {
          const meta = await this.repo.readMeta(entry.meta.filePath, entry.meta.projectFolder, entry.meta.archived);
          if (meta) entry.meta = meta;
        }
        const records = await this.repo.records(entry.meta);
        entry.stamp = stamp;
        entry.panel.title = tabTitle(entry.meta.title);
        await entry.panel.webview.postMessage({ type: "update", parts: viewerParts({ meta: entry.meta, records }) });
      } while (entry.again);
    } catch (err) {
      logger.warn("chats", "Updating an open conversation failed", err);
    } finally {
      entry.busy = false;
    }
  }

  /** The conversation file moved (archive, restore): keep its viewer on the new file. */
  async retarget(oldPath: string, newPath: string): Promise<void> {
    const entry = this.viewers.get(oldPath);
    if (!entry || oldPath === newPath) return;
    const meta = await this.repo.readMeta(newPath, entry.meta.projectFolder, !entry.meta.archived);
    this.viewers.delete(oldPath);
    if (!meta) {
      entry.panel.dispose();
      return;
    }
    entry.meta = meta;
    this.viewers.set(newPath, entry);
    await this.render(entry);
    this.syncActive();
  }

  close(filePath: string): void {
    this.viewers.get(filePath)?.panel.dispose();
  }

  closeAll(): void {
    for (const { panel } of [...this.viewers.values()]) panel.dispose();
    this.viewers.clear();
  }

  /** Push the current button switches to every open viewer, without a re-render. */
  applyFlags(): void {
    this.broadcast({ type: "flags", ...readViewerFlags() });
  }

  dispose(): void {
    this.closeAll();
    this.themeSub.dispose();
    this.activeChanged.dispose();
  }

  /**
   * Where a new viewer tab goes. Beside: the group the viewers already use,
   * or else a split next to the editor (with nothing open there is nothing
   * to sit beside, so the group in use). Active: the group in use.
   */
  private column(): vscode.ViewColumn {
    if (readConfig().chats.viewerOpens === "active") return vscode.ViewColumn.Active;
    for (const { panel } of this.viewers.values()) if (panel.viewColumn !== undefined) return panel.viewColumn;
    const anyOpen = vscode.window.tabGroups.all.some((g) => g.tabs.length > 0);
    return anyOpen ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active;
  }

  private prefs(): ViewerPrefs {
    return cleanViewerPrefs(this.ctx.globalState.get(PREFS_KEY));
  }

  private broadcast(message: unknown, except?: OpenViewer): void {
    for (const entry of this.viewers.values()) {
      if (entry !== except) void entry.panel.webview.postMessage(message);
    }
  }

  private syncActive(): void {
    let next: string | undefined;
    for (const [key, { panel }] of this.viewers) if (panel.active) next = key;
    if (next === this.active) return;
    this.active = next;
    this.activeChanged.fire(next);
  }

  private async render(entry: OpenViewer): Promise<void> {
    const { panel, meta } = entry;
    const stamp = await stampOf(meta.filePath);
    const records = await this.repo.records(meta);
    entry.stamp = stamp;
    entry.stale = false;
    panel.title = tabTitle(meta.title);
    panel.webview.html = buildViewerHtml({
      meta,
      records,
      theme: currentTheme(),
      fonts: brandFontUris(panel.webview, this.ctx.extensionUri),
      prefs: this.prefs(),
      flags: readViewerFlags(),
      projectColor: await this.actions.projectColor(meta).catch(() => null),
      openIn: this.actions.openInTarget(meta),
    });
  }

  private async onMessage(entry: OpenViewer, msg: ViewerMessage): Promise<void> {
    try {
      switch (msg.type) {
        case "prefs": {
          const prefs = cleanViewerPrefs(msg.prefs);
          await this.ctx.globalState.update(PREFS_KEY, prefs);
          this.broadcast({ type: "prefs", prefs }, entry);
          return;
        }
        case "openLink":
          if (typeof msg.href === "string") await this.openLink(entry, msg.href);
          return;
        case "mdhe":
          if (typeof msg.content === "string") await this.openMdHe(entry, msg.content);
          return;
        case "exportVisible":
          if (typeof msg.content === "string") await this.saveMarkdown(entry.meta, msg.content);
          return;
        case "action":
          await this.runAction(entry.meta, msg.action as ActionName);
          return;
      }
    } catch (err) {
      logger.error("chats", `Viewer action '${msg.type}' failed`, err);
      vscode.window.showErrorMessage(`Benefit: ${(err as Error).message}`);
    }
  }

  private async runAction(meta: ConversationMeta, action: ActionName): Promise<void> {
    switch (action) {
      case "rename": return this.actions.rename(meta);
      case "archive": return this.actions.archive(meta);
      case "restore": return this.actions.restore(meta);
      case "delete": return this.actions.delete(meta);
      case "exportFull": return this.actions.exportFull(meta);
      case "reveal": return this.actions.revealInList(meta);
      case "openInAgent": return this.actions.openInAgent(meta);
    }
  }

  /** "Save visible messages": the page built the Markdown from what it shows. */
  private async saveMarkdown(meta: ConversationMeta, content: string): Promise<void> {
    const safeName = meta.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || meta.conversationId;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = wsRoot
      ? vscode.Uri.joinPath(wsRoot, `${safeName}.md`)
      : vscode.Uri.file(path.join(os.homedir(), "Documents", `${safeName}.md`));
    const uri = await vscode.window.showSaveDialog({ defaultUri, filters: { Markdown: ["md"] }, saveLabel: "Save visible messages" });
    if (!uri) return;
    await ensureDir(path.dirname(uri.fsPath));
    await atomicWriteText(uri.fsPath, content);
    const open = await vscode.window.showInformationMessage(`Saved to ${uri.fsPath}`, "Open");
    if (open === "Open") await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  }

  private async openLink(entry: OpenViewer, href: string): Promise<void> {
    try {
      if (isWebLink(href)) {
        await vscode.env.openExternal(vscode.Uri.parse(href));
        return;
      }
      const { path: linkPath, startLine, endLine } = parseFileLink(href);
      const roots = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
      for (const candidate of resolveCandidates(linkPath, entry.meta.cwd, roots)) {
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(candidate);
        } catch {
          continue;
        }
        const uri = vscode.Uri.file(candidate);
        if (stat.isDirectory()) {
          await vscode.commands.executeCommand("revealInExplorer", uri);
          return;
        }
        const doc = await vscode.workspace.openTextDocument(uri);
        const start = Math.min(startLine ?? 1, doc.lineCount) - 1;
        const end = Math.min(endLine ?? startLine ?? 1, doc.lineCount) - 1;
        await vscode.window.showTextDocument(doc, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
          selection:
            startLine !== undefined ? new vscode.Range(new vscode.Position(start, 0), doc.lineAt(end).range.end) : undefined,
        });
        return;
      }
    } catch (err) {
      logger.warn("chats", `openLink failed for ${href}`, err);
    }
    // Not resolvable (or opening failed): never a silent dead click. Hand the
    // user the raw path instead.
    await vscode.env.clipboard.writeText(href);
    void entry.panel.webview.postMessage({ type: "toast", text: "Path copied" });
  }

  private async openMdHe(entry: OpenViewer, content: string): Promise<void> {
    try {
      const result = await openInMdHe(content);
      const text = result === "clipboard" ? "Copied. Press Paste in md-he." : "Opening in md-he";
      void entry.panel.webview.postMessage({ type: "toast", text });
    } catch (err) {
      logger.error("chats", "openInMdHe failed", err);
      vscode.window.showErrorMessage(`Benefit: opening in md-he failed. ${(err as Error).message}`);
    }
  }
}
