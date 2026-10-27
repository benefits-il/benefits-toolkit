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
import { buildViewerHtml, cleanViewerPrefs, ViewerFlags, ViewerPrefs } from "./viewer/viewer-html";

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
  projectColor(meta: ConversationMeta): Promise<string | null>;
}

type ActionName = "rename" | "archive" | "restore" | "delete" | "exportFull" | "reveal";

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
      return;
    }

    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, tabTitle(meta.title), vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: panelResourceRoots(this.ctx.extensionUri),
    });
    panel.iconPath = new vscode.ThemeIcon("comment-discussion");
    const entry: OpenViewer = { panel, meta };
    this.viewers.set(meta.filePath, entry);

    panel.onDidChangeViewState(() => this.syncActive());
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
    const records = await this.repo.records(meta);
    panel.title = tabTitle(meta.title);
    panel.webview.html = buildViewerHtml({
      meta,
      records,
      theme: currentTheme(),
      fonts: brandFontUris(panel.webview, this.ctx.extensionUri),
      prefs: this.prefs(),
      flags: readViewerFlags(),
      projectColor: await this.actions.projectColor(meta).catch(() => null),
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
