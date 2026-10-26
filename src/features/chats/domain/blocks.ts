import { MessageRecord, RawJsonlRecord } from "./conversation";

export type BlockKind = "text" | "thinking" | "tool";

export interface ContentBlock {
  kind: BlockKind;
  text: string;
}

export function extractBlocks(message: MessageRecord): ContentBlock[] {
  const content = message.message?.content;
  if (!content) return [];

  if (typeof content === "string") {
    return content.trim() ? [{ kind: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];

  const blocks: ContentBlock[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const type = item["type"];

    if (type === "text" && typeof item["text"] === "string") {
      blocks.push({ kind: "text", text: item["text"] as string });
    } else if (type === "thinking") {
      const thinking = typeof item["thinking"] === "string" ? (item["thinking"] as string) : "";
      blocks.push({ kind: "thinking", text: thinking });
    } else if (type === "tool_use") {
      const name = typeof item["name"] === "string" ? (item["name"] as string) : "unknown";
      const input = item["input"] !== undefined ? JSON.stringify(item["input"], null, 2) : "";
      blocks.push({ kind: "tool", text: `[Tool: ${name}]\n${input}` });
    } else if (type === "tool_result") {
      const inner = item["content"];
      let text = "";
      if (typeof inner === "string") {
        text = inner;
      } else if (Array.isArray(inner)) {
        text = inner
          .map((c) => (c && typeof c === "object" && typeof (c as Record<string, unknown>)["text"] === "string"
            ? ((c as Record<string, unknown>)["text"] as string)
            : ""))
          .filter(Boolean)
          .join("\n");
      }
      blocks.push({ kind: "tool", text: `[Tool result]\n${text}` });
    }
  }
  return blocks;
}

export function formatModelName(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  let id = modelId;
  const dateSuffix = /^(.*?)-(\d{8})$/.exec(id);
  if (dateSuffix) id = dateSuffix[1];
  const tri = /^claude-([a-z]+)-(\d+)-(\d+)$/i.exec(id);
  if (tri) {
    const family = tri[1].charAt(0).toUpperCase() + tri[1].slice(1).toLowerCase();
    return `${family} ${tri[2]}.${tri[3]}`;
  }
  return id.replace(/^claude-/i, "").replace(/-/g, " ");
}

export interface UsageSnapshot {
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  model: string | undefined;
}

/**
 * The context window every conversation is measured against. Claude Code does
 * not record the window's size, and a guess per model was wrong as often as
 * not, so the meters use one size.
 */
export const CONTEXT_WINDOW = 1_000_000;

/** The usage of the last assistant reply. Replies with no usage at all (Claude Code's synthetic ones) are skipped. */
export function readLastUsage(records: RawJsonlRecord[]): UsageSnapshot | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.type !== "assistant") continue;
    const msg = (r as RawJsonlRecord)["message"];
    if (!msg || typeof msg !== "object") continue;
    const usage = (msg as Record<string, unknown>)["usage"];
    if (!usage || typeof usage !== "object") continue;
    const u = usage as Record<string, unknown>;
    const snapshot: UsageSnapshot = {
      inputTokens: toNumber(u["input_tokens"]),
      cacheReadInputTokens: toNumber(u["cache_read_input_tokens"]),
      cacheCreationInputTokens: toNumber(u["cache_creation_input_tokens"]),
      model: typeof (msg as Record<string, unknown>)["model"] === "string"
        ? ((msg as Record<string, unknown>)["model"] as string)
        : undefined,
    };
    if (contextTokens(snapshot) > 0) return snapshot;
  }
  return undefined;
}

/** How much of the context window the reply had in front of it. */
export function contextTokens(u: UsageSnapshot): number {
  return u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
