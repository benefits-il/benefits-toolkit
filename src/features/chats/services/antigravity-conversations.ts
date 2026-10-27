import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { antigravityBrainDir, antigravityRoot } from "../../../core/paths";
import { pathExists } from "../../../shared/fs-utils";
import { ConversationMeta, MessageRecord, RawJsonlRecord } from "../domain/conversation";
import { parseJsonlText } from "../domain/jsonl-parser";
import { encodeProjectFolder } from "./conversation-repository";

/**
 * Antigravity's own agent writes each conversation as one step per line:
 *   ~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript_full.jsonl
 * { step_index, source, type, status, created_at, content, thinking, tool_calls }.
 * USER_INPUT is your message (wrapped in <USER_REQUEST>), PLANNER_RESPONSE the
 * model's turn (text, thinking, a JSON list of tool calls), anything else a
 * step's output. Older conversations have only binary files and are skipped.
 *
 * The title and the folder are not in the transcript; Antigravity keeps them
 * in agyhub_summaries_proto.pb (see readSummaries).
 */

const TRANSCRIPT = path.join(".system_generated", "logs", "transcript_full.jsonl");

export interface AntigravitySummary {
  title?: string;
  /** The workspace folder, as a file path. */
  folder?: string;
}

// ---- A protobuf reader with no schema: just enough to walk fields.

interface PbField {
  field: number;
  /** A length-delimited value (string or nested message); numbers are skipped. */
  bytes?: Buffer;
}

function readVarint(buf: Buffer, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  for (;;) {
    if (at >= buf.length) throw new Error("truncated");
    const byte = buf[at++];
    value += (byte & 0x7f) * 2 ** shift;
    if (!(byte & 0x80)) return [value, at];
    shift += 7;
    if (shift > 63) throw new Error("varint too long");
  }
}

function readFields(buf: Buffer): PbField[] {
  const out: PbField[] = [];
  let at = 0;
  while (at < buf.length) {
    let key: number;
    [key, at] = readVarint(buf, at);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (field === 0) throw new Error("bad field");
    if (wire === 0) [, at] = readVarint(buf, at);
    else if (wire === 1) at += 8;
    else if (wire === 5) at += 4;
    else if (wire === 2) {
      let length: number;
      [length, at] = readVarint(buf, at);
      if (at + length > buf.length) throw new Error("truncated");
      out.push({ field, bytes: buf.subarray(at, at + length) });
      at += length;
      continue;
    } else throw new Error(`wire type ${wire}`);
    out.push({ field });
  }
  return out;
}

function child(fields: PbField[], field: number): Buffer | undefined {
  return fields.find((f) => f.field === field && f.bytes)?.bytes;
}

function fileUriToPath(uri: string): string | undefined {
  try {
    return uri.startsWith("file:") ? fileURLToPath(uri) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * agyhub_summaries_proto.pb: one entry per conversation (field 1), holding the
 * id (1) and a summary (2) with the title (2.1) and the workspace (2.9.1, a
 * file URI). Undocumented, so anything that does not read that way is left
 * out rather than guessed at.
 */
export function parseAntigravitySummaries(buf: Buffer): Map<string, AntigravitySummary> {
  const out = new Map<string, AntigravitySummary>();
  let entries: PbField[];
  try {
    entries = readFields(buf);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.field !== 1 || !entry.bytes) continue;
    try {
      const fields = readFields(entry.bytes);
      const id = child(fields, 1)?.toString("utf8");
      const summary = child(fields, 2);
      if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !summary) continue;
      const info = readFields(summary);
      const title = child(info, 1)?.toString("utf8").trim();
      const workspace = child(info, 9);
      const uri = workspace ? child(readFields(workspace), 1)?.toString("utf8") : undefined;
      out.set(id, { title: title || undefined, folder: uri ? fileUriToPath(uri) : undefined });
    } catch {
      // one unreadable entry; the rest still count
    }
  }
  return out;
}

/** Your request without the wrapper; the metadata Antigravity adds leads, so the viewer folds it. */
export function cleanAntigravityUserText(raw: string): string {
  const requests: string[] = [];
  const rest = raw.replace(/<USER_REQUEST>([\s\S]*?)(?:<\/USER_REQUEST>|$)/g, (_, inner: string) => {
    requests.push(inner.trim());
    return "";
  });
  return [rest.trim(), ...requests].filter(Boolean).join("\n\n");
}

interface ToolCall {
  name?: unknown;
  args?: unknown;
}

function toolCalls(raw: unknown): ToolCall[] {
  if (Array.isArray(raw)) return raw as ToolCall[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ToolCall[]) : [];
  } catch {
    return [];
  }
}

/** The steps as Claude Code-shaped records (see cursorRecords): messages, thinking, tool calls and their output. */
export function antigravityRecords(steps: RawJsonlRecord[], id: string): MessageRecord[] {
  const out: MessageRecord[] = [];
  const push = (role: "user" | "assistant", timestamp: string, content: unknown[]) => {
    out.push({
      type: role,
      uuid: `${id}:${out.length}`,
      parentUuid: out.length ? `${id}:${out.length - 1}` : null,
      timestamp,
      sessionId: id,
      message: { role, content },
    });
  };
  for (const step of steps) {
    const time = typeof step["created_at"] === "string" ? (step["created_at"] as string) : "";
    const text = typeof step["content"] === "string" ? (step["content"] as string) : "";
    const type = step["type"];
    if (type === "USER_INPUT") {
      push("user", time, [{ type: "text", text: cleanAntigravityUserText(text) }]);
    } else if (type === "PLANNER_RESPONSE") {
      const content: unknown[] = [];
      if (typeof step["thinking"] === "string" && step["thinking"]) content.push({ type: "thinking", thinking: step["thinking"] });
      if (text.trim()) content.push({ type: "text", text });
      for (const call of toolCalls(step["tool_calls"])) {
        content.push({ type: "tool_use", name: typeof call.name === "string" ? call.name : "tool", input: call.args ?? {} });
      }
      if (content.length) push("assistant", time, content);
    } else if (text) {
      push("user", time, [{ type: "tool_result", content: text }]);
    }
  }
  return out;
}

function firstRequest(records: MessageRecord[]): string | undefined {
  const user = records.find((r) => r.type === "user" && Array.isArray(r.message.content) && (r.message.content[0] as { type?: string })?.type === "text");
  const text = (user?.message.content as { text?: string }[] | undefined)?.[0]?.text ?? "";
  const own = text.replace(/<([A-Z_]+)>[\s\S]*?<\/\1>/g, " ").replace(/\s+/g, " ").trim();
  return own ? own.slice(0, 100) : undefined;
}

export class AntigravityConversations {
  /** Every Antigravity agent conversation that has a readable transcript, as list metadata. */
  async scan(hideEmpty: boolean): Promise<ConversationMeta[]> {
    const brain = antigravityBrainDir();
    if (!(await pathExists(brain))) return [];
    const summaries = await this.summaries();
    const out: ConversationMeta[] = [];
    for (const entry of await fs.readdir(brain, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join(brain, entry.name, TRANSCRIPT);
      let stat: import("node:fs").Stats;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }
      const records = await this.records(filePath);
      if (hideEmpty && records.length === 0) continue;
      const summary = summaries.get(entry.name) ?? {};
      const cwd = summary.folder;
      out.push({
        source: "antigravity",
        filePath,
        fileName: path.basename(filePath),
        projectFolder: cwd ? encodeProjectFolder(cwd) : "antigravity",
        projectDisplayName: cwd ? path.basename(cwd) : "No folder",
        conversationId: entry.name,
        cwd,
        title: summary.title ?? firstRequest(records) ?? "(empty conversation)",
        hasSummary: false,
        leafUuid: undefined,
        firstMessageAt: records[0]?.timestamp,
        lastModifiedAt: stat.mtime.toISOString(),
        realMessageCount: records.length,
        contextTokens: undefined,
        archived: false,
        sizeBytes: stat.size,
      });
    }
    return out;
  }

  /** The conversation folder's name is its id. */
  async records(filePath: string): Promise<MessageRecord[]> {
    const id = path.basename(path.dirname(path.dirname(path.dirname(filePath))));
    return antigravityRecords(parseJsonlText(await fs.readFile(filePath, "utf8")), id);
  }

  private async summaries(): Promise<Map<string, AntigravitySummary>> {
    try {
      return parseAntigravitySummaries(await fs.readFile(path.join(antigravityRoot(), "agyhub_summaries_proto.pb")));
    } catch {
      return new Map();
    }
  }
}
