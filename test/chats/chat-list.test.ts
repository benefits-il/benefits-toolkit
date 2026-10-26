import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationMeta } from "../../src/features/chats/domain/conversation";
import { groupConversations, inWorkspace, relativeTime, sortConversations } from "../../src/features/chats/services/chat-list";

function conv(id: string, modified: string, extra: Partial<ConversationMeta> = {}): ConversationMeta {
  return {
    filePath: `/c/${id}.jsonl`, fileName: `${id}.jsonl`, projectFolder: "c--repo", projectDisplayName: "repo", conversationId: id,
    cwd: "C:\\work\\repo", title: id, hasSummary: false, leafUuid: undefined, firstMessageAt: modified,
    lastModifiedAt: modified, contextTokens: undefined, realMessageCount: 3, archived: false, sizeBytes: 10, ...extra,
  };
}

test("a conversation belongs to this window when either folder contains the other", () => {
  const list = [
    conv("same", "2026-10-26T10:00:00Z", { cwd: "C:\\work\\repo" }),
    conv("sub", "2026-10-26T10:00:00Z", { cwd: "C:\\work\\repo\\packages\\web" }),
    conv("parent", "2026-10-26T10:00:00Z", { cwd: "C:\\work" }),
    conv("sibling", "2026-10-26T10:00:00Z", { cwd: "C:\\work\\repo-two" }),
    conv("other", "2026-10-26T10:00:00Z", { cwd: "D:\\elsewhere" }),
  ];
  assert.deepEqual(inWorkspace(list, ["c:\\Work\\Repo"], true).map((m) => m.title), ["same", "sub", "parent"]);
  assert.deepEqual(inWorkspace(list, [], true), [], "no folder open, no project");
});

test("files without a cwd fall back to Claude Code's encoded folder name", () => {
  const old = conv("old", "2026-10-26T10:00:00Z", { cwd: undefined, projectFolder: "C--work-repo" });
  assert.equal(inWorkspace([old], ["C:\\work\\repo"], true).length, 1);
});

test("date groups use local days, newest first, archived last", () => {
  const now = new Date(2026, 9, 26, 9, 0);
  const at = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString();
  const sorted = sortConversations(
    [
      conv("late-yesterday", at(25, 23)),
      conv("today", at(26, 0)),
      conv("week", at(22, 12)),
      conv("month", at(5, 12)),
      conv("old", new Date(2026, 6, 1).toISOString()),
      conv("archived", at(26, 1), { archived: true }),
    ],
    "newest",
  );
  const groups = groupConversations(sorted, "date", now);
  assert.deepEqual(groups.map((g) => g.label), ["Today", "Yesterday", "Earlier this week", "This month", "July 2026", "Archived"]);
  assert.deepEqual(groups[0].items.map((m) => m.title), ["today"]);
});

test("project groups run A to Z; none is a single unlabeled group", () => {
  const list = [conv("b1", "2026-10-26T10:00:00Z", { projectFolder: "b", projectDisplayName: "beta" }), conv("a1", "2026-10-25T10:00:00Z", { projectFolder: "a", projectDisplayName: "Alpha" })];
  assert.deepEqual(groupConversations(list, "project").map((g) => g.label), ["Alpha", "beta"]);
  const flat = groupConversations(list, "flat");
  assert.equal(flat.length, 1);
  assert.equal(flat[0].label, "");
});

test("the row's time is short and relative", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  assert.equal(relativeTime("2026-10-26T11:59:40Z", now), "now");
  assert.equal(relativeTime("2026-10-26T11:18:00Z", now), "42m");
  assert.equal(relativeTime("2026-10-26T09:00:00Z", now), "3h");
  assert.equal(relativeTime("2026-10-24T12:00:00Z", now), "2d");
  assert.equal(relativeTime("2026-08-01T12:00:00Z", now), "Aug 1");
});
