import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationMeta, MessageRecord } from "../../src/features/chats/domain/conversation";
import { buildViewerHtml, cleanViewerPrefs, DEFAULT_VIEWER_PREFS, openInButton, toItems, toTurns, viewerParts } from "../../src/features/chats/ui/viewer/viewer-html";

let n = 0;
function msg(type: "user" | "assistant", content: unknown): MessageRecord {
  n++;
  return { type, uuid: `u${n}`, parentUuid: null, timestamp: `2026-10-26T12:${String(n).padStart(2, "0")}:00.000Z`, message: { role: type, content } };
}
const text = (t: string) => [{ type: "text", text: t }];
const tool = (name: string) => [{ type: "tool_use", name, input: { a: 1 } }];
const result = () => [{ type: "tool_result", content: "ok" }];
const thinking = () => [{ type: "thinking", thinking: "hmm" }];

const meta: ConversationMeta = {
  source: "claude", filePath: "C:/x/abc.jsonl", fileName: "abc.jsonl", projectFolder: "C--x", projectDisplayName: "x", conversationId: "abc",
  cwd: "C:/x", title: "A </script><script>alert(1)</script> title", hasSummary: false, leafUuid: undefined,
  firstMessageAt: "2026-10-26T12:00:00.000Z", lastModifiedAt: "2026-10-26T13:00:00.000Z", contextTokens: undefined, realMessageCount: 6, archived: false, sizeBytes: 100,
};

test("tool calls, results and thinking between two messages fold into one steps row", () => {
  const items = toItems([
    msg("user", text("do it")),
    msg("assistant", thinking()),
    msg("assistant", tool("Read")),
    msg("user", result()),
    msg("assistant", tool("Edit")),
    msg("user", result()),
    msg("assistant", text("done")),
  ]);
  assert.deepEqual(items.map((i) => i.kind), ["message", "steps", "message"]);
  assert.equal(items[1].kind === "steps" && items[1].messages.length, 5);
});

test("an exchange: your message, the work on the way, and the last thing Claude wrote as the answer", () => {
  const turns = toTurns([
    msg("assistant", text("before anyone spoke")),
    msg("user", text("do it")),
    msg("assistant", text("looking")),
    msg("assistant", tool("Read")),
    msg("user", result()),
    msg("assistant", text("done")),
    msg("user", text("thanks")),
  ]);
  assert.equal(turns.length, 3);
  assert.equal(turns[0].user, null);
  const second = turns[1];
  assert.deepEqual(second.work.map((i) => i.kind), ["message", "steps"]);
  assert.equal(second.answer && second.answer.message.content[0].text, "done");
  assert.equal(turns[2].answer, null);
});

test("the page: oldest exchange at the top, cards with icons in their headers, all closed but the latest answer", () => {
  const records = [
    msg("user", text("hello there")),
    msg("assistant", text("let me look")),
    msg("assistant", tool("Read")),
    msg("user", result()),
    msg("assistant", tool("Edit")),
    msg("assistant", text("**hi**")),
    msg("user", text("second question")),
    msg("assistant", text("second answer")),
  ];
  const html = buildViewerHtml({ meta, records, theme: "dark", fonts: null, prefs: DEFAULT_VIEWER_PREFS, flags: { codeCopy: true, mdHe: true }, projectColor: "#1f8a8a" });
  const order = [...html.matchAll(/<article class="msg unit (\w+)( collapsed)?"|<details class="work"/g)].map((m) => (m[1] ? m[1] + (m[2] ? " closed" : " open") : "work"));
  assert.deepEqual(order, ["you closed", "work", "claude closed", "you closed", "claude open"]);
  assert.ok(html.indexOf("hello there") < html.indexOf("second question"), "the newest exchange comes last");
  assert.ok(html.includes('id="to-latest"') && html.includes("openAtLatest()"), "the page opens at the newest message");
  assert.ok(html.includes("1 update, 2 tool calls · Read, Edit"));
  assert.ok(html.includes('<span class="avatar avatar-claude" aria-hidden="true"><i class="mark mark-claude"'), "Claude's mark on a wash of its color");
  assert.ok(html.includes('<span class="avatar" aria-hidden="true"><svg'), "your icon");
  assert.ok(html.includes('class="chev"'), "a chevron on every header");
  assert.ok(html.includes("--proj:#1f8a8a"));
  assert.ok(!/>Y<\/|>C<\//.test(html), "no letter avatars");
  assert.ok(html.includes("<strong>hi</strong>"));
});

test("text attached to your message folds; your own words and a slash command stay", () => {
  const records = [
    msg("user", text('<pasted_content id="1">a long handoff</pasted_content id="1">please read')),
    msg("user", [{ type: "text", text: "<system-reminder>be nice</system-reminder>" }, { type: "text", text: "<command-name>/clear</command-name><command-message>clear</command-message>" }]),
  ];
  const html = buildViewerHtml({ meta, records, theme: "dark", fonts: null, prefs: DEFAULT_VIEWER_PREFS, flags: { codeCopy: true, mdHe: true }, projectColor: null });
  assert.ok(html.includes("Pasted text"));
  assert.ok(html.includes("Attached: system-reminder"));
  assert.ok(html.includes("<code>/clear</code>"));
  assert.ok(html.includes('<p>please read</p>'));
  assert.ok(!html.includes("&lt;pasted_content"), "the tag itself never shows");
});

test("every element the viewer script looks up exists", () => {
  const html = buildViewerHtml({ meta, records: [msg("user", text("x"))], theme: "light", fonts: null, prefs: DEFAULT_VIEWER_PREFS, flags: { codeCopy: false, mdHe: false }, projectColor: null });
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?<!\$)\$\('([\w-]+)'\)/g)) assert.ok(ids.has(m[1]), `the script uses #${m[1]}, which the markup lacks`);
  assert.ok(html.includes('data-theme="light"'));
});

test("a title cannot break out of the page script", () => {
  const html = buildViewerHtml({ meta, records: [], theme: "dark", fonts: null, prefs: DEFAULT_VIEWER_PREFS, flags: { codeCopy: true, mdHe: true }, projectColor: null });
  assert.equal(html.split("<script>alert(1)").length, 1);
});

test("viewer prefs from storage or a page are checked field by field", () => {
  assert.deepEqual(cleanViewerPrefs(undefined), DEFAULT_VIEWER_PREFS);
  assert.equal(DEFAULT_VIEWER_PREFS.direction, "ltr");
  assert.deepEqual(cleanViewerPrefs({ direction: "rtl", hideWork: true, hideThinking: "yes", extra: 1 }), {
    ...DEFAULT_VIEWER_PREFS, direction: "rtl", hideWork: true,
  });
  assert.equal(cleanViewerPrefs({ direction: "sideways" }).direction, "ltr");
  assert.equal(cleanViewerPrefs({ direction: "auto" }).direction, "ltr", "an Auto kept by an earlier build");
});

test("another agent's conversation: its name and mark, no context bar, no rename, archive or delete", () => {
  const records = [msg("user", text("hi")), msg("assistant", text("Hi there"))];
  const html = buildViewerHtml({ meta: { ...meta, source: "cursor" }, records, theme: "dark", fonts: null, prefs: DEFAULT_VIEWER_PREFS, flags: { codeCopy: true, mdHe: true }, projectColor: null });
  assert.ok(html.includes('<i class="mark mark-cursor"'));
  assert.ok(html.includes('data-who="Cursor"'));
  assert.ok(html.includes("Hide Cursor's work"));
  assert.ok(!html.includes('class="context"'), "no context bar: Cursor records no usage");
  for (const action of ["rename", "archive", "delete"]) assert.ok(!html.includes(`data-action="${action}"`), `no ${action}`);
  assert.ok(html.includes('data-action="exportFull"'));
});

test("the header's Open in button: the agent's mark and name, hidden when this window cannot open it", () => {
  const records = [msg("user", text("hi")), msg("assistant", text("hello"))];
  const html = buildViewerHtml({ meta, records, theme: "dark", fonts: null, prefs: DEFAULT_VIEWER_PREFS, flags: { codeCopy: true, mdHe: true }, projectColor: null, openIn: "claude" });
  assert.ok(html.includes('id="open-in" title="Open in Claude Code">'), "shown, with its name");
  assert.ok(html.includes('<i class="mark mark-claude" aria-hidden="true"></i><span>Open in Claude Code</span>'));
  assert.ok(openInButton("cursor").includes("mark-cursor") && openInButton("cursor").includes("Open in Cursor"));
  assert.ok(openInButton(null).includes('id="open-in" title="" hidden>'), "kept in the page, hidden, so a setting can bring it back");
});

test("new messages: the earlier exchanges keep their fingerprint, so the open page keeps them as they are", () => {
  const first = [msg("user", text("one")), msg("assistant", text("answer one")), msg("user", text("two")), msg("assistant", text("answer two"))];
  const before = viewerParts({ meta, records: first }).turns;
  const after = viewerParts({ meta, records: [...first, msg("user", text("three")), msg("assistant", text("answer three"))] }).turns;
  assert.equal(after.length, 3);
  assert.equal(after[0].h, before[0].h, "an exchange that did not change");
  assert.notEqual(after[1].h, before[1].h, "the answer that was the latest closes now");
  assert.ok(after[2].html.startsWith(`<section class="turn" data-h="${after[2].h}">`));
  assert.deepEqual(viewerParts({ meta, records: first }).turns, before, "the same file renders the same");
  assert.ok(/<article class="msg unit you collapsed" data-key="u\d+"/.test(after[0].html), "each card carries its message's id");
});
