import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAUDE_MARK_SVG } from "../../src/shared/icons";
import type { ConversationMeta, MessageRecord } from "../../src/features/chats/domain/conversation";
import { buildViewerHtml, cleanViewerPrefs, DEFAULT_VIEWER_PREFS, toItems, toTurns } from "../../src/features/chats/ui/viewer/viewer-html";

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
  filePath: "C:/x/abc.jsonl", fileName: "abc.jsonl", projectFolder: "C--x", projectDisplayName: "x", conversationId: "abc",
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

test("the page: newest exchange first, bubbles with icon avatars, the work folded into one line", () => {
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
  const order = [...html.matchAll(/<article class="msg unit (\w+)"|<details class="work">/g)].map((m) => m[1] ?? "work");
  assert.deepEqual(order, ["you", "claude", "you", "work", "claude"]);
  assert.ok(html.indexOf("second question") < html.indexOf("hello there"), "the newest exchange comes first");
  assert.ok(html.includes("1 update, 2 tool calls · Read, Edit"));
  assert.ok(html.includes(CLAUDE_MARK_SVG));
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
  assert.ok(html.includes('<p dir="auto">please read</p>'));
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
  assert.equal(DEFAULT_VIEWER_PREFS.direction, "auto");
  assert.deepEqual(cleanViewerPrefs({ direction: "rtl", hideWork: true, hideThinking: "yes", extra: 1 }), {
    ...DEFAULT_VIEWER_PREFS, direction: "rtl", hideWork: true,
  });
  assert.equal(cleanViewerPrefs({ direction: "sideways" }).direction, "auto");
});
