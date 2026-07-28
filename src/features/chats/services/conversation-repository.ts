import * as fs from "node:fs/promises";
import * as path from "node:path";
import { claudeArchiveDir, claudeProjectsDir } from "../../../core/paths";
import { atomicWriteText, pathExists } from "../../../shared/fs-utils";
import { ConversationMeta, MessageRecord, RawJsonlRecord, RenderedMessage } from "../domain/conversation";
import { isAiTitle, isCustomTitle, isMessage, isRealMessage, isSummary, parseJsonlText } from "../domain/jsonl-parser";

interface ScanOptions {
  hideEmpty: boolean;
  includeArchived: boolean;
}

const ARCHIVE_FOLDER_NAME = "_archive";

/** Enough of the head to catch the opening messages and the first `cwd`. */
const HEAD_BYTES = 64 * 1024;
/**
 * Enough of the tail to catch the latest `ai-title` / `custom-title` record.
 * Claude Code re-emits those as the conversation grows and the last one sits
 * near EOF, so scanning only the head would show a stale (or missing) title.
 */
const TAIL_BYTES = 256 * 1024;

export class ConversationRepository {
  async scan(options: ScanOptions): Promise<ConversationMeta[]> {
    const root = claudeProjectsDir();
    if (!(await pathExists(root))) return [];

    const projects = await fs.readdir(root, { withFileTypes: true });
    const results: ConversationMeta[] = [];

    for (const entry of projects) {
      if (!entry.isDirectory()) continue;
      const isArchive = entry.name === ARCHIVE_FOLDER_NAME;
      if (isArchive) {
        if (!options.includeArchived) continue;
        await this.scanArchive(path.join(root, entry.name), results, options);
        continue;
      }
      await this.scanProject(path.join(root, entry.name), entry.name, false, results, options);
    }
    return results;
  }

  private async scanArchive(archiveRoot: string, out: ConversationMeta[], options: ScanOptions): Promise<void> {
    const entries = await fs.readdir(archiveRoot, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      await this.scanProject(path.join(archiveRoot, e.name), e.name, true, out, options);
    }
  }

  private async scanProject(
    projectDir: string,
    projectFolder: string,
    archived: boolean,
    out: ConversationMeta[],
    options: ScanOptions,
  ): Promise<void> {
    let files: string[];
    try {
      files = (await fs.readdir(projectDir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return;
    }
    for (const f of files) {
      const meta = await this.readMeta(path.join(projectDir, f), projectFolder, archived);
      if (!meta) continue;
      if (options.hideEmpty && meta.realMessageCount === 0) continue;
      out.push(meta);
    }
  }

  async readMeta(filePath: string, projectFolder: string, archived: boolean): Promise<ConversationMeta | undefined> {
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return undefined;
    }

    const text = await readFirstChunk(filePath, HEAD_BYTES);
    const records = parseJsonlText(text);

    let summary: { summary: string; leafUuid: string } | undefined;
    let firstMessageAt: string | undefined;
    let realMessageCount = 0;
    const userTexts: string[] = [];
    let cwd: string | undefined;

    for (const r of records) {
      if (cwd === undefined && typeof r["cwd"] === "string") {
        cwd = r["cwd"];
      }
      if (isSummary(r)) {
        summary = { summary: r.summary, leafUuid: r.leafUuid };
        continue;
      }
      if (isMessage(r)) {
        if (firstMessageAt === undefined && typeof r.timestamp === "string") {
          firstMessageAt = r.timestamp;
        }
        if (isRealMessage(r)) {
          realMessageCount++;
          if (r.type === "user" && userTexts.length < 5) {
            userTexts.push(extractText(r));
          }
        }
      }
    }

    // Title records are appended over the life of the session, so the head alone
    // is not enough — scan head then tail in file order and let the last one win.
    const tailText = await readTailChunk(filePath, stat.size);
    const tailRecords = tailText === undefined ? [] : parseJsonlText(tailText);

    let aiTitle: string | undefined;
    let customTitle: string | undefined;
    for (const r of [...records, ...tailRecords]) {
      if (isAiTitle(r)) {
        const t = (r["aiTitle"] as string).trim();
        if (t.length > 0) aiTitle = t;
      } else if (isCustomTitle(r)) {
        const t = (r["customTitle"] as string).trim();
        if (t.length > 0) customTitle = t;
      }
    }

    // A big attachment blob early in the file can push the first cwd-bearing
    // record past the head window; the tail almost always still carries one.
    if (cwd === undefined) {
      for (const r of tailRecords) {
        if (typeof r["cwd"] === "string") {
          cwd = r["cwd"] as string;
          break;
        }
      }
    }

    const conversationId = path.basename(filePath, ".jsonl");

    return {
      filePath,
      fileName: path.basename(filePath),
      projectFolder,
      projectDisplayName: humanizeProjectFolder(projectFolder),
      conversationId,
      cwd,
      title: customTitle ?? aiTitle ?? summary?.summary ?? deriveTitle(userTexts) ?? "(empty conversation)",
      hasSummary: summary !== undefined,
      leafUuid: summary?.leafUuid,
      firstMessageAt,
      lastModifiedAt: stat.mtime.toISOString(),
      realMessageCount,
      archived,
      sizeBytes: stat.size,
    };
  }

  async readAllRecords(filePath: string): Promise<RawJsonlRecord[]> {
    const text = await fs.readFile(filePath, "utf8");
    return parseJsonlText(text);
  }

  async writeAllRecords(filePath: string, records: RawJsonlRecord[]): Promise<void> {
    const text = records.map((r) => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : "");
    await atomicWriteText(filePath, text);
  }

  async readMessages(filePath: string): Promise<RenderedMessage[]> {
    const records = await this.readAllRecords(filePath);
    const out: RenderedMessage[] = [];
    for (const r of records) {
      if (!isRealMessage(r)) continue;
      const msg = r as MessageRecord;
      out.push({
        role: msg.message.role,
        uuid: msg.uuid,
        timestamp: msg.timestamp,
        text: extractText(msg),
        raw: msg,
      });
    }
    return out;
  }

  archiveDestFor(meta: ConversationMeta): string {
    return path.join(claudeArchiveDir(), meta.projectFolder, meta.fileName);
  }

  restoreDestFor(meta: ConversationMeta): string {
    return path.join(claudeProjectsDir(), meta.projectFolder, meta.fileName);
  }
}

function extractText(record: MessageRecord): string {
  const content = record.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const chunk of content) {
    if (chunk && typeof chunk === "object") {
      const c = chunk as Record<string, unknown>;
      if (typeof c["text"] === "string") parts.push(c["text"] as string);
    } else if (typeof chunk === "string") {
      parts.push(chunk);
    }
  }
  return parts.join("\n").trim();
}

// Claude Code injects synthetic content into user messages (slash-command
// wrappers, IDE context, system reminders) and conversations often open with a
// bare @file reference or path. Almost no conversation has a real `summary`, so
// the title falls back to the first user message — strip that noise so the
// fallback reads like a human title instead of "<command-name>/md-format…".
const INJECTED_TAGS =
  "ide_opened_file|system-reminder|command-message|command-name|command-args|command-contents|local-command-stdout|local-command-stderr";

function cleanTitleText(raw: string): string {
  let t = raw;
  // Remove injected blocks (tag + their content).
  t = t.replace(new RegExp(`<(${INJECTED_TAGS})>[\\s\\S]*?</\\1>`, "gi"), " ");
  // Remove any stray open/close tags of the injected kinds.
  t = t.replace(/<\/?(?:ide_opened_file|system-reminder|command-[a-z-]+|local-command-[a-z]+)[^>]*>/gi, " ");
  // Drop a run of leading @file refs / bare path tokens (the message's real text follows).
  t = t.replace(/^(?:\s*(?:@\S+|[A-Za-z]:[\\/]\S+|\/[^\s]+\.\w+))+/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Best human-readable title from the first few user messages: the first one that
 * still has real text after cleaning, else a slash-command label (e.g. "/md-format")
 * if that's all the conversation was.
 */
function deriveTitle(userTexts: string[]): string | undefined {
  let slashCmd: string | undefined;
  for (const raw of userTexts) {
    if (slashCmd === undefined) {
      const m = raw.match(/<command-name>\s*(\/[^<\s]+)/i);
      if (m) slashCmd = m[1];
    }
    const cleaned = cleanTitleText(raw);
    if (cleaned.length < 3) continue;
    // Boilerplate Claude Code / skill preambles that carry no meaning as a title.
    if (/^Caveat: The messages below/i.test(cleaned)) continue;
    if (/^Base directory for this skill:/i.test(cleaned)) continue;
    return cleaned.slice(0, 100);
  }
  return slashCmd;
}

async function readFirstChunk(file: string, maxBytes: number): Promise<string> {
  const handle = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
    return buf.slice(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Last TAIL_BYTES of the file, starting at a line boundary. Returns undefined
 * when the head read already covered the whole file.
 */
async function readTailChunk(file: string, fileSize: number): Promise<string | undefined> {
  if (fileSize <= HEAD_BYTES) return undefined;
  const offset = Math.max(0, fileSize - TAIL_BYTES);
  const length = fileSize - offset;
  let text: string;
  const handle = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, offset);
    text = buf.slice(0, bytesRead).toString("utf8");
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
  if (offset > 0) {
    // The chunk starts mid-line (and possibly mid-UTF-8-sequence); drop it.
    const nl = text.indexOf("\n");
    if (nl === -1) return undefined;
    text = text.slice(nl + 1);
  }
  return text;
}

function humanizeProjectFolder(folder: string): string {
  return folder
    .replace(/^C--/i, "")
    .replace(/^c--/i, "")
    .replace(/--/g, "/")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reproduces Claude Code's project-folder encoding: every character that is not
 * alphanumeric becomes a single dash. e.g.
 *   c:\Users\darta\Desktop\projects\benefits-toolkit
 *     -> c--Users-darta-Desktop-projects-benefits-toolkit
 * Used as a fallback to scope conversations by workspace when a JSONL has no `cwd`.
 */
export function encodeProjectFolder(fsPath: string): string {
  return fsPath.replace(/[^a-zA-Z0-9]/g, "-");
}
