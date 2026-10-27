import type { ChatsGroupBy, ChatsSortOrder } from "../../../core/config-manager";
import { CONTEXT_WINDOW } from "../domain/blocks";
import { ConversationMeta } from "../domain/conversation";
import { encodeProjectFolder } from "./conversation-repository";

/** A heading in the list and the conversations under it, in display order. */
export interface ChatGroup {
  key: string;
  label: string;
  items: ConversationMeta[];
}

/**
 * The conversations that belong to the folders open in this window.
 * Primary match is the JSONL `cwd`; falls back to the encoded project-folder
 * name for older files that predate `cwd`.
 *
 * Matching is by containment in either direction, not equality: Claude Code is
 * routinely started from a subfolder of the open workspace (or the workspace is
 * a subfolder of where Claude Code ran), and exact equality made those
 * conversations invisible. With no folder open, "this project" is empty by
 * definition.
 */
export function inWorkspace(list: ConversationMeta[], folders: string[], caseInsensitive: boolean): ConversationMeta[] {
  if (folders.length === 0) return [];
  const norm = (p: string) => {
    const s = p.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
    return caseInsensitive ? s.toLowerCase() : s;
  };
  const normWs = folders.map(norm);
  const encWs = folders.map((p) => encodeProjectFolder(p).toLowerCase());

  return list.filter((m) => {
    if (m.cwd) {
      const c = norm(m.cwd);
      // The trailing separator stops "/benefits" matching "/benefits-repos".
      return normWs.some((w) => c === w || c.startsWith(w + "/") || w.startsWith(c + "/"));
    }
    const pf = m.projectFolder.toLowerCase();
    return encWs.some((e) => pf === e || pf.startsWith(e + "-") || e.startsWith(pf + "-"));
  });
}

export function sortConversations(list: ConversationMeta[], order: ChatsSortOrder): ConversationMeta[] {
  const copy = list.slice();
  copy.sort((a, b) => a.lastModifiedAt.localeCompare(b.lastModifiedAt));
  if (order === "newest") copy.reverse();
  return copy;
}

/** Sorted conversations under their headings: by date (Today, Yesterday...), by project, or none. */
export function groupConversations(sorted: ConversationMeta[], grouping: ChatsGroupBy, now: Date = new Date()): ChatGroup[] {
  if (grouping === "flat") return sorted.length ? [{ key: "all", label: "", items: sorted }] : [];

  const buckets = new Map<string, { label: string; sortKey: string; items: ConversationMeta[] }>();
  for (const m of sorted) {
    const { key, label, sortKey } = m.archived
      ? { key: "archived", label: "Archived", sortKey: "" }
      : grouping === "date"
        ? dateBucket(m, now)
        : { key: `p:${m.projectFolder}`, label: m.projectDisplayName, sortKey: m.projectDisplayName.toLowerCase() };
    const bucket = buckets.get(key) ?? { label, sortKey, items: [] };
    bucket.items.push(m);
    buckets.set(key, bucket);
  }

  const groups = Array.from(buckets.entries()).map(([key, b]) => ({ key, label: b.label, sortKey: b.sortKey, items: b.items }));
  // Dates: newest bucket first (sort keys sort backwards); projects: A to Z.
  // Archived always comes last.
  groups.sort((a, b) => {
    if (a.key === "archived") return 1;
    if (b.key === "archived") return -1;
    return grouping === "date" ? b.sortKey.localeCompare(a.sortKey) : a.sortKey.localeCompare(b.sortKey);
  });
  return groups.map(({ key, label, items }) => ({ key, label, items }));
}

function dateBucket(meta: ConversationMeta, now: Date): { key: string; label: string; sortKey: string } {
  const d = new Date(meta.lastModifiedAt);
  // Rounded: a day the clocks change on is 23 or 25 hours long.
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);

  if (days <= 0) return { key: "today", label: "Today", sortKey: "9-today" };
  if (days === 1) return { key: "yesterday", label: "Yesterday", sortKey: "8-yesterday" };
  if (days < 7) return { key: "this-week", label: "Earlier this week", sortKey: "7-week" };
  if (days < 31) return { key: "this-month", label: "This month", sortKey: "6-month" };

  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { key: `month-${ym}`, label: d.toLocaleString("en-US", { year: "numeric", month: "long" }), sortKey: `0-${ym}` };
}

// "Today" must mean the user's today: local calendar days, not UTC ones,
// which put every conversation after 21:00/22:00 (UTC+2/+3) into "Yesterday".
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * "now", "42m", "3h", "2d", "2mo", "1y": the time column of a row, at most
 * four characters wide (the row shows the exact date on hover). It runs inside
 * the sidebar's page too, so it uses nothing from outside.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30.44);
  return months < 12 ? `${Math.max(1, months)}mo` : `${Math.floor(months / 12)}y`;
}

/** How full the conversation's context window is, 0 to 100, one decimal; null without usage. */
export function contextPercent(meta: ConversationMeta): number | null {
  if (meta.contextTokens === undefined) return null;
  return Math.min(100, Math.round((meta.contextTokens / CONTEXT_WINDOW) * 1000) / 10);
}
