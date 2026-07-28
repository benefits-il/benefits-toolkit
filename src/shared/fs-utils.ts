import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readTextSafe(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export async function atomicWriteText(file: string, content: string): Promise<void> {
  const dir = path.dirname(file);
  await ensureDir(dir);
  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}

/**
 * Append one JSON record as a line to a JSONL file, without rewriting it.
 *
 * Rewriting a whole transcript is unsafe: Claude Code may be appending to the
 * same file live, and a full rewrite would drop whatever it wrote meanwhile.
 * Appending is the same thing Claude Code itself does. If the file does not end
 * with a newline (interrupted write), one is inserted first so the new record
 * never merges into the previous line.
 */
export async function appendJsonlLine(file: string, record: unknown): Promise<void> {
  const handle = await fs.open(file, "r+");
  try {
    const { size } = await handle.stat();
    let prefix = "";
    if (size > 0) {
      const tail = Buffer.alloc(1);
      await handle.read(tail, 0, 1, size - 1);
      if (tail[0] !== 0x0a) prefix = "\n";
    }
    await handle.write(prefix + JSON.stringify(record) + "\n", size, "utf8");
  } finally {
    await handle.close();
  }
}

export interface SentinelBlock {
  startMarker: string;
  endMarker: string;
}

export function stripSentinelBlock(content: string, markers: SentinelBlock): string {
  const { startMarker, endMarker } = markers;
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return content;
  const endIdx = content.indexOf(endMarker, startIdx);
  if (endIdx === -1) return content;
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + endMarker.length);
  return (before.replace(/\s+$/, "") + "\n" + after.replace(/^\s+/, "")).trimEnd() + "\n";
}

export function applySentinelBlock(content: string, markers: SentinelBlock, body: string): string {
  const stripped = stripSentinelBlock(content, markers).trimEnd();
  const sep = stripped.length > 0 ? "\n\n" : "";
  return `${stripped}${sep}${markers.startMarker}\n${body.trim()}\n${markers.endMarker}\n`;
}

export function tempPath(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${crypto.randomBytes(4).toString("hex")}`);
}
