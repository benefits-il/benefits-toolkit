import * as fs from "node:fs/promises";
import * as path from "node:path";
import { claudeArchiveDir, claudeProjectsDir } from "../../../core/paths";
import { atomicWriteText, pathExists } from "../../../shared/fs-utils";
import { ConversationMeta, MessageRecord, RawJsonlRecord, RenderedMessage } from "../domain/conversation";
import { isMessage, isRealMessage, isSummary, parseJsonlText } from "../domain/jsonl-parser";

interface ScanOptions {
  hideEmpty: boolean;
  includeArchived: boolean;
}

const ARCHIVE_FOLDER_NAME = "_archive";

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

    const text = await readFirstChunk(filePath, 64 * 1024);
    const records = parseJsonlText(text);

    let summary: { summary: string; leafUuid: string } | undefined;
    let firstMessageAt: string | undefined;
    let realMessageCount = 0;
    let userPreview: string | undefined;
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
          if (!userPreview && r.type === "user") {
            userPreview = extractText(r).slice(0, 80);
          }
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
      title: summary?.summary ?? userPreview ?? "(empty conversation)",
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
