import * as vscode from "vscode";
import { ChatsGroupBy, ChatsScope, ChatsSortOrder, readConfig } from "../../../core/config-manager";
import { isWindows } from "../../../shared/platform-detector";
import { ConversationMeta } from "../domain/conversation";
import { ConversationRepository, encodeProjectFolder } from "../services/conversation-repository";
import { ChatNode, ConversationNode, GroupNode } from "./chat-tree-item";

export class ChatTreeProvider implements vscode.TreeDataProvider<ChatNode> {
  private readonly emitter = new vscode.EventEmitter<ChatNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  private cache: ConversationMeta[] = [];
  private loaded = false;

  constructor(private readonly repo: ConversationRepository) {}

  refresh(): void {
    this.loaded = false;
    this.cache = [];
    this.emitter.fire(undefined);
  }

  invalidate(): void {
    this.loaded = false;
    this.emitter.fire(undefined);
  }

  async getChildren(element?: ChatNode): Promise<ChatNode[]> {
    await this.ensureLoaded();
    if (!element) return this.rootGroups();
    if (element.kind === "group") return element.conversations.map((m) => new ConversationNode(m));
    return [];
  }

  getTreeItem(element: ChatNode): vscode.TreeItem {
    return element;
  }

  findConversationByPath(filePath: string): ConversationMeta | undefined {
    return this.cache.find((m) => m.filePath === filePath);
  }

  allConversations(): ConversationMeta[] {
    return this.cache.slice();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const cfg = readConfig().chats;
    const all = await this.repo.scan({
      hideEmpty: cfg.hideEmpty,
      includeArchived: cfg.showArchived,
    });
    this.cache = applyScope(all, cfg.scope);
    this.loaded = true;
  }

  private rootGroups(): ChatNode[] {
    const cfg = readConfig().chats;
    const sorted = sortConversations(this.cache, cfg.sortOrder);
    if (sorted.length === 0) return [];
    return groupConversations(sorted, cfg.groupBy);
  }
}

/**
 * Restrict the list to conversations belonging to the folder open in this window.
 * Primary match is the JSONL `cwd`; falls back to the encoded project-folder name
 * for older files that predate `cwd`.
 *
 * Matching is by containment in either direction, not equality: Claude Code is
 * routinely started from a subfolder of the open workspace (or the workspace is
 * a subfolder of where Claude Code ran), and exact equality made those
 * conversations invisible. With no folder open, "this project" is empty by
 * definition — returning the full list there made the toggle look inert.
 */
function applyScope(list: ConversationMeta[], scope: ChatsScope): ConversationMeta[] {
  if (scope === "all") return list;
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) return [];

  const fsPaths = folders.map((f) => f.uri.fsPath);
  const normWs = fsPaths.map(normalizePath);
  const encWs = fsPaths.map((p) => encodeProjectFolder(p).toLowerCase());

  return list.filter((m) => {
    if (m.cwd) {
      const c = normalizePath(m.cwd);
      // The trailing separator stops "…/benefits" matching "…/benefits-repos".
      return normWs.some((w) => c === w || c.startsWith(w + "/") || w.startsWith(c + "/"));
    }
    const pf = m.projectFolder.toLowerCase();
    return encWs.some((e) => pf === e || pf.startsWith(e + "-") || e.startsWith(pf + "-"));
  });
}

function normalizePath(p: string): string {
  const s = p.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
  return isWindows() ? s.toLowerCase() : s;
}

function sortConversations(list: ConversationMeta[], order: ChatsSortOrder): ConversationMeta[] {
  const copy = list.slice();
  copy.sort((a, b) => a.lastModifiedAt.localeCompare(b.lastModifiedAt));
  if (order === "newest") copy.reverse();
  return copy;
}

function groupConversations(list: ConversationMeta[], grouping: ChatsGroupBy): ChatNode[] {
  if (grouping === "flat") {
    return list.map((m) => new ConversationNode(m));
  }

  const buckets = new Map<string, { label: string; sortKey: string; items: ConversationMeta[] }>();
  for (const m of list) {
    const { key, label, sortKey } = grouping === "date" ? dateBucket(m) : projectBucket(m);
    const bucket = buckets.get(key) ?? { label, sortKey, items: [] };
    bucket.items.push(m);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => b[1].sortKey.localeCompare(a[1].sortKey))
    .map(([key, bucket]) => new GroupNode(bucket.label, key, bucket.items));
}

function dateBucket(meta: ConversationMeta): { key: string; label: string; sortKey: string } {
  const d = new Date(meta.lastModifiedAt);
  const now = new Date();
  const sameDay = sameLocalDay(d, now);
  const ms = now.getTime() - d.getTime();
  const days = ms / (1000 * 60 * 60 * 24);

  if (sameDay) return { key: "today", label: "Today", sortKey: "9-today" };
  if (days < 2) return { key: "yesterday", label: "Yesterday", sortKey: "8-yesterday" };
  if (days < 7) return { key: "this-week", label: "Earlier this week", sortKey: "7-week" };
  if (days < 31) return { key: "this-month", label: "This month", sortKey: "6-month" };

  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { key: `month-${ym}`, label: ymLabel(d), sortKey: `0-${ym}` };
}

function projectBucket(meta: ConversationMeta): { key: string; label: string; sortKey: string } {
  return { key: meta.projectFolder, label: meta.projectDisplayName, sortKey: meta.projectDisplayName };
}

function ymLabel(d: Date): string {
  return d.toLocaleString(undefined, { year: "numeric", month: "long" });
}

// "Today" must mean the user's today. Comparing UTC days put every conversation
// from after 21:00/22:00 local (UTC+2/+3) into "Yesterday" — and everything from
// the small hours of the real yesterday into "Today".
function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
