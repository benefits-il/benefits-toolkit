import * as vscode from "vscode";
import { ChatsGroupBy, ChatsSortOrder, readConfig } from "../../../core/config-manager";
import { ConversationMeta } from "../domain/conversation";
import { ConversationRepository } from "../services/conversation-repository";
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
    this.cache = await this.repo.scan({
      hideEmpty: cfg.hideEmpty,
      includeArchived: cfg.showArchived,
    });
    this.loaded = true;
  }

  private rootGroups(): ChatNode[] {
    const cfg = readConfig().chats;
    const sorted = sortConversations(this.cache, cfg.sortOrder);
    if (sorted.length === 0) return [];
    return groupConversations(sorted, cfg.groupBy);
  }
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
  const sameDay = sameUtcDay(d, now);
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

function sameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
