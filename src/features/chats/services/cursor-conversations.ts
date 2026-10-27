import * as fs from "node:fs/promises";
import * as path from "node:path";
import { cursorProjectsDir } from "../../../core/paths";
import { pathExists } from "../../../shared/fs-utils";
import { ConversationMeta, MessageRecord, RawJsonlRecord } from "../domain/conversation";
import { parseJsonlText } from "../domain/jsonl-parser";
import { encodeProjectFolder } from "./conversation-repository";

/**
 * Cursor's own agent keeps one transcript per conversation:
 *   ~/.cursor/projects/<folder slug>/agent-transcripts/<id>/<id>.jsonl
 * Each line is { role, message: { content: [{ type: "text", text }] } }, plus a
 * { type: "turn_ended" } line after each reply. There are no timestamps and no
 * working folder: the time comes from the <timestamp> Cursor puts in your
 * messages, the folder from the slug.
 */

/** Cursor's folder slug: every run of other characters becomes one dash. */
export function cursorSlug(folder: string): string {
  return folder.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Tuesday, Oct 27, 2026, 12:54 PM (UTC+2)" as an ISO time; undefined if it reads otherwise. */
export function parseCursorTimestamp(text: string): string | undefined {
  const m = /([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})\s*(AM|PM)?\s*\(UTC([+-]\d{1,2})(?::?(\d{2}))?\)/.exec(text);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return undefined;
  let hour = Number(m[4]) % 12;
  if (m[6]?.toUpperCase() === "PM") hour += 12;
  if (!m[6]) hour = Number(m[4]);
  const sign = m[7].startsWith("-") ? -1 : 1;
  const offsetMinutes = sign * (Math.abs(Number(m[7])) * 60 + Number(m[8] ?? 0));
  const utc = Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5])) - offsetMinutes * 60_000;
  return new Date(utc).toISOString();
}

/**
 * Your message as Cursor stored it, made to read like one: the <timestamp>
 * goes, <user_query> is unwrapped, and what Cursor attached (<attached_files>,
 * terminal selections) leads, so the viewer folds it away like Claude Code's.
 */
export function cleanCursorUserText(raw: string): { text: string; time: string | undefined } {
  let time: string | undefined;
  let text = raw.replace(/<timestamp>([\s\S]*?)<\/timestamp>/gi, (_, inner: string) => {
    time ??= parseCursorTimestamp(inner);
    return "";
  });
  const queries: string[] = [];
  text = text.replace(/<user_query>([\s\S]*?)<\/user_query>/gi, (_, inner: string) => {
    queries.push(inner.trim());
    return "";
  });
  const rest = text.trim();
  return { text: [rest, ...queries].filter(Boolean).join("\n\n"), time };
}

/**
 * A title from your first messages: your own words, without what Cursor
 * attached or a leading @file reference. Falls back on that reference when
 * the messages are nothing else.
 */
export function cursorTitle(userTexts: string[]): string | undefined {
  let reference: string | undefined;
  for (const text of userTexts) {
    const words = text
      .replace(/<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const ref = /^@(\S+)/.exec(words);
    if (ref) reference ??= ref[1].split(/[\\/]/).pop();
    const own = words.replace(/^(?:@\S+\s*)+/, "").trim();
    if (own.length >= 2) return own.slice(0, 100);
  }
  return reference;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && typeof (c as Record<string, unknown>).text === "string" ? (c as Record<string, string>).text : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * The transcript as Claude Code-shaped records, so the viewer, the export and
 * the counts read it like any other conversation. A message without a time of
 * its own takes the last one seen; replies after the last of your messages
 * take the file's time.
 */
export function cursorRecords(lines: RawJsonlRecord[], id: string, startedAt: string, modifiedAt: string): MessageRecord[] {
  const out: MessageRecord[] = [];
  let time = startedAt;
  let lastUser = -1;
  for (const line of lines) {
    const role = line["role"];
    if (role !== "user" && role !== "assistant") continue;
    const message = line["message"] as Record<string, unknown> | undefined;
    let content = message?.content;
    if (role === "user") {
      const cleaned = cleanCursorUserText(textOf(content));
      if (cleaned.time) time = cleaned.time;
      content = [{ type: "text", text: cleaned.text }];
      lastUser = out.length;
    } else if (typeof content === "string") {
      content = [{ type: "text", text: content }];
    }
    out.push({
      type: role,
      uuid: `${id}:${out.length}`,
      parentUuid: out.length ? `${id}:${out.length - 1}` : null,
      timestamp: time,
      sessionId: id,
      message: { role, content },
    });
  }
  for (let i = lastUser + 1; i < out.length; i++) out[i].timestamp = modifiedAt;
  return out;
}

/** Where a transcript's folder slug points, among the folders the toolkit knows of. */
function resolveSlug(slug: string, folders: string[]): string | undefined {
  const want = slug.toLowerCase();
  return folders.find((f) => cursorSlug(f).toLowerCase() === want);
}

/** A slug no known folder matches, shortened for display: the part after the user's home. */
function slugLabel(slug: string): string {
  if (/^\d+$/.test(slug) || slug === "empty-window") return "No folder";
  return slug.replace(/^[a-z]-Users-[^-]+-/i, "").replace(/^Desktop-/i, "") || slug;
}

export class CursorConversations {
  /** Every Cursor agent conversation, as list metadata. `folders` resolve the slugs to real folders. */
  async scan(folders: string[], hideEmpty: boolean): Promise<ConversationMeta[]> {
    const root = cursorProjectsDir();
    if (!(await pathExists(root))) return [];
    const out: ConversationMeta[] = [];
    for (const project of await fs.readdir(root, { withFileTypes: true })) {
      if (!project.isDirectory()) continue;
      const transcripts = path.join(root, project.name, "agent-transcripts");
      let ids: string[];
      try {
        ids = await fs.readdir(transcripts);
      } catch {
        continue;
      }
      const cwd = resolveSlug(project.name, folders);
      for (const id of ids) {
        const meta = await this.readMeta(path.join(transcripts, id, `${id}.jsonl`), project.name, cwd);
        if (!meta || (hideEmpty && meta.realMessageCount === 0)) continue;
        out.push(meta);
      }
    }
    return out;
  }

  private async readMeta(filePath: string, slug: string, cwd: string | undefined): Promise<ConversationMeta | undefined> {
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return undefined;
    }
    // Cursor's transcripts hold text only (no tool output), so reading the whole file is cheap.
    const records = await this.records(filePath);
    const userTexts = records.filter((r) => r.type === "user").slice(0, 5).map((r) => textOf(r.message.content));
    const id = path.basename(filePath, ".jsonl");
    return {
      source: "cursor",
      filePath,
      fileName: path.basename(filePath),
      projectFolder: cwd ? encodeProjectFolder(cwd) : slug,
      projectDisplayName: cwd ? path.basename(cwd) : slugLabel(slug),
      conversationId: id,
      cwd,
      title: cursorTitle(userTexts) ?? "(empty conversation)",
      hasSummary: false,
      leafUuid: undefined,
      firstMessageAt: records[0]?.timestamp,
      lastModifiedAt: stat.mtime.toISOString(),
      realMessageCount: records.length,
      contextTokens: undefined,
      archived: false,
      sizeBytes: stat.size,
    };
  }

  async records(filePath: string): Promise<MessageRecord[]> {
    const [text, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    const started = (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
    return cursorRecords(parseJsonlText(text), path.basename(filePath, ".jsonl"), started, stat.mtime.toISOString());
  }
}
