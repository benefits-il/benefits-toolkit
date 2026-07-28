import { MessageRecord, RawJsonlRecord, SummaryRecord } from "./conversation";

export function parseJsonlText(text: string): RawJsonlRecord[] {
  const out: RawJsonlRecord[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) !== 0x0a) continue;
    pushIfJson(text.slice(start, i), out);
    start = i + 1;
  }
  if (start < text.length) {
    pushIfJson(text.slice(start), out);
  }
  return out;
}

function pushIfJson(raw: string, out: RawJsonlRecord[]): void {
  const trimmed = raw.replace(/\r$/, "").trim();
  if (trimmed.length === 0) return;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      out.push(parsed as RawJsonlRecord);
    }
  } catch {
    /* swallow malformed line */
  }
}

export function isSummary(record: RawJsonlRecord): record is SummaryRecord {
  return record.type === "summary" && typeof record["summary"] === "string" && typeof record["leafUuid"] === "string";
}

/**
 * Claude Code's own generated session title. Re-emitted whenever it regenerates
 * the title, so the LAST one in the file wins.
 */
export function isAiTitle(record: RawJsonlRecord): boolean {
  return record.type === "ai-title" && typeof record["aiTitle"] === "string";
}

/** A title the user set (rename). Overrides the generated one. */
export function isCustomTitle(record: RawJsonlRecord): boolean {
  return record.type === "custom-title" && typeof record["customTitle"] === "string";
}

export function isMessage(record: RawJsonlRecord): record is MessageRecord {
  return (record.type === "user" || record.type === "assistant") && typeof record["uuid"] === "string";
}

export function isRealMessage(record: RawJsonlRecord): boolean {
  if (!isMessage(record)) return false;
  if (record.isSidechain === true) return false;
  return true;
}

export function stringifyRecord(record: RawJsonlRecord): string {
  return JSON.stringify(record);
}

export function recordsToText(records: RawJsonlRecord[]): string {
  return records.map(stringifyRecord).join("\n") + (records.length > 0 ? "\n" : "");
}
