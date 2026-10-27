import assert from "node:assert/strict";
import { test } from "node:test";
import {
  antigravityRecords,
  cleanAntigravityUserText,
  parseAntigravitySummaries,
} from "../../src/features/chats/services/antigravity-conversations";
import {
  cleanCursorUserText,
  cursorRecords,
  cursorSlug,
  cursorTitle,
  parseCursorTimestamp,
} from "../../src/features/chats/services/cursor-conversations";

test("Cursor's folder slug: every run of other characters is one dash", () => {
  assert.equal(cursorSlug("c:\\Users\\darta\\Desktop\\automations"), "c-Users-darta-Desktop-automations");
  assert.equal(cursorSlug("/Users/ben/My Project (2)/"), "Users-ben-My-Project-2");
});

test("Cursor's <timestamp> reads as a UTC time", () => {
  assert.equal(parseCursorTimestamp("Tuesday, Oct 27, 2026, 12:54 PM (UTC+2)"), "2026-10-27T10:54:00.000Z");
  assert.equal(parseCursorTimestamp("Monday, Jan 5, 2026, 12:05 AM (UTC-5)"), "2026-01-05T05:05:00.000Z");
  assert.equal(parseCursorTimestamp("not a time"), undefined);
});

test("your Cursor message: the query unwrapped, attachments first so the viewer folds them", () => {
  const raw = "<timestamp>Tuesday, Oct 27, 2026, 12:54 PM (UTC+2)</timestamp>\n<attached_files>\n<file>a.ts</file>\n</attached_files>\n<user_query>\nfix it\n</user_query>";
  const { text, time } = cleanCursorUserText(raw);
  assert.equal(time, "2026-10-27T10:54:00.000Z");
  assert.ok(text.startsWith("<attached_files>"));
  assert.ok(text.endsWith("fix it"));
  assert.ok(!text.includes("timestamp") && !text.includes("user_query"));
});

test("a Cursor title is your own words, else the file you pointed at", () => {
  assert.equal(cursorTitle(["<attached_files>x</attached_files>\nwhy does it fail?"]), "why does it fail?");
  assert.equal(cursorTitle(["<attached_files>x</attached_files> @c:\\a\\terminals\\9.txt:7-24", "and now?"]), "and now?");
  assert.equal(cursorTitle(["@c:\\a\\terminals\\9.txt:7-24"]), "9.txt:7-24");
  assert.equal(cursorTitle([]), undefined);
});

test("a Cursor transcript becomes Claude Code-shaped records", () => {
  const lines = [
    { role: "user", message: { content: [{ type: "text", text: "<timestamp>Tuesday, Oct 27, 2026, 12:54 PM (UTC+2)</timestamp>\n<user_query>\nhi\n</user_query>" }] } },
    { role: "assistant", message: { content: [{ type: "text", text: "Hi" }] } },
    { type: "turn_ended", status: "success" },
  ];
  const records = cursorRecords(lines, "abc", "2026-10-27T10:00:00.000Z", "2026-10-27T10:55:00.000Z");
  assert.deepEqual(records.map((r) => [r.type, r.uuid, r.timestamp]), [
    ["user", "abc:0", "2026-10-27T10:54:00.000Z"],
    ["assistant", "abc:1", "2026-10-27T10:55:00.000Z"],
  ]);
  assert.deepEqual(records[0].message.content, [{ type: "text", text: "hi" }]);
  assert.equal(records[1].parentUuid, "abc:0");
});

test("Antigravity steps: your request, the model's thinking, text and tool calls, and the tools' output", () => {
  const steps = [
    { type: "USER_INPUT", created_at: "2026-10-27T10:49:08Z", content: "<USER_REQUEST>\nsay hi\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nlocal time\n</ADDITIONAL_METADATA>" },
    { type: "PLANNER_RESPONSE", created_at: "2026-10-27T10:49:09Z", thinking: "hmm", tool_calls: '[{"name":"read_file","args":{"Path":"a.md"}}]' },
    { type: "GENERIC", created_at: "2026-10-27T10:49:10Z", content: "file text" },
    { type: "PLANNER_RESPONSE", created_at: "2026-10-27T10:49:11Z", content: "Hi!" },
  ];
  const records = antigravityRecords(steps, "id1");
  assert.deepEqual(records.map((r) => r.type), ["user", "assistant", "user", "assistant"]);
  assert.deepEqual(records[0].message.content, [{ type: "text", text: "<ADDITIONAL_METADATA>\nlocal time\n</ADDITIONAL_METADATA>\n\nsay hi" }]);
  assert.deepEqual(records[1].message.content, [{ type: "thinking", thinking: "hmm" }, { type: "tool_use", name: "read_file", input: { Path: "a.md" } }]);
  assert.deepEqual(records[2].message.content, [{ type: "tool_result", content: "file text" }]);
  assert.equal(records[3].timestamp, "2026-10-27T10:49:11Z");
  assert.equal(cleanAntigravityUserText("<USER_REQUEST>\nonly\n</USER_REQUEST>"), "only");
});

// A tiny protobuf writer, enough to build a summaries file.
function varint(n: number): Buffer {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
}
function field(no: number, value: Buffer | string | number): Buffer {
  if (typeof value === "number") return Buffer.concat([varint(no * 8), varint(value)]);
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return Buffer.concat([varint(no * 8 + 2), varint(bytes.length), bytes]);
}

test("Antigravity's summaries file gives each conversation its title and folder", () => {
  const id = "ce829e40-0f7d-40ef-928c-312e8953071d";
  const summary = Buffer.concat([
    field(1, "Simple Greeting"),
    field(2, 2),
    field(9, Buffer.concat([field(1, "file:///c:/Users/darta/Desktop/AI/benefits"), field(4, "main")])),
  ]);
  const noFolder = Buffer.concat([field(1, "f085b183-d55b-40cf-9074-69db07d414a0"), field(2, field(1, "Loose task"))]);
  const file = Buffer.concat([field(1, Buffer.concat([field(1, id), field(2, summary)])), field(1, noFolder), field(1, Buffer.from([0xff, 0xff]))]);
  const map = parseAntigravitySummaries(file);
  assert.equal(map.get(id)?.title, "Simple Greeting");
  assert.ok(map.get(id)?.folder?.replace(/\\/g, "/").toLowerCase().endsWith("users/darta/desktop/ai/benefits"));
  assert.deepEqual(map.get("f085b183-d55b-40cf-9074-69db07d414a0"), { title: "Loose task", folder: undefined });
  assert.equal(parseAntigravitySummaries(Buffer.from("not protobuf at all")).size, 0);
});
