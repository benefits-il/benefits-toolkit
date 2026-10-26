import MarkdownIt from "markdown-it";
import { BENEFITS_URL } from "../../../../shared/brand-bar";
import { CLAUDE_MARK_SVG, icon } from "../../../../shared/icons";
import type { ResolvedTheme } from "../../../../shared/theme-resolve";
import { BrandFonts, escapeHtml, renderWebviewPage } from "../../../../shared/webview-theme";
import { CONTEXT_WINDOW, ContentBlock, contextTokens, extractBlocks, formatModelName, readLastUsage } from "../../domain/blocks";
import { ConversationMeta, MessageRecord, RawJsonlRecord } from "../../domain/conversation";
import { safeDecode } from "../../services/link-resolver";
import { VIEWER_CSS, VIEWER_SCRIPT } from "./viewer-assets";

/** Reading direction and Display filters: one set for every open viewer. */
export interface ViewerPrefs {
  /** "auto": every paragraph takes the direction of its own text. */
  direction: "auto" | "ltr" | "rtl";
  /** Hide the folded work between your message and Claude's answer. */
  hideWork: boolean;
  hideThinking: boolean;
}

export const DEFAULT_VIEWER_PREFS: ViewerPrefs = {
  direction: "auto",
  hideWork: false,
  hideThinking: false,
};

/** Prefs from storage or from a page, checked field by field. */
export function cleanViewerPrefs(raw: unknown): ViewerPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    direction: r.direction === "rtl" || r.direction === "ltr" ? r.direction : "auto",
    hideWork: r.hideWork === true,
    hideThinking: r.hideThinking === true,
  };
}

/** Viewer buttons that can be switched off (benefit.chats.*). */
export interface ViewerFlags {
  codeCopy: boolean;
  mdHe: boolean;
}

export interface ViewerInput {
  meta: ConversationMeta;
  records: RawJsonlRecord[];
  theme: ResolvedTheme;
  fonts: BrandFonts | null;
  prefs: ViewerPrefs;
  flags: ViewerFlags;
  /** The project's window color, when one is known: Claude's bubbles take it. */
  projectColor: string | null;
}

// `html: false` escapes any raw HTML in the message instead of emitting it, so
// this is XSS-safe without a sanitizer, which matters because the webview has
// no CSP (a strict nonce CSP breaks acquireVsCodeApi). markdown-it's default
// validateLink already rejects javascript:/data: URLs. `breaks: true` keeps
// plain-text chat messages readable.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Fuzzy linkify treats bare filenames as domains (".ts" and ".md" are real
// country TLDs), so "extension.ts" became http://extension.ts. Only explicit
// http(s)://, www. and mailto: are auto-linked; file paths are links only
// when Claude writes a real markdown link.
md.linkify.set({ fuzzyLink: false });

// Every anchor gets the decoded destination as a tooltip (the visible text is
// often just "file.ts:42") and as data-raw for the click handler. Decoding
// happens once here: markdown-it percent-encodes destinations, and decoding
// again at click time would corrupt paths containing a literal "%".
const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const raw = safeDecode(token.attrGet("href") ?? "");
  token.attrSet("title", raw);
  token.attrSet("data-raw", raw);
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Hebrew and English share conversations, often in one message: every
// paragraph, list and heading takes the direction of its own first words. The
// page's direction switch can force one direction over all of them.
for (const rule of ["paragraph_open", "bullet_list_open", "ordered_list_open", "list_item_open", "heading_open", "blockquote_open", "th_open", "td_open"]) {
  const defaultRule = md.renderer.rules[rule] ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet("dir", "auto");
    return defaultRule(tokens, idx, options, env, self);
  };
}

// Every code block gets a Copy button under the code, inside the block.
const COPY_CODE = `<button class="mini code-copy" type="button" data-act="code">${icon("copy")}<span>Copy code</span></button>`;
for (const rule of ["fence", "code_block"] as const) {
  const defaultRule =
    md.renderer.rules[rule] ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules[rule] = (tokens, idx, options, env, self) =>
    `<div class="code-wrap">${defaultRule(tokens, idx, options, env, self)}${COPY_CODE}</div>`;
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function dateTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${MONTH_DAY.format(d)} · ${TIME.format(d)}`;
}

function time(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
}

function isRealMessage(record: RawJsonlRecord): boolean {
  if (record.type !== "user" && record.type !== "assistant") return false;
  if ((record as Record<string, unknown>)["isSidechain"] === true) return false;
  return typeof (record as Record<string, unknown>)["uuid"] === "string";
}

interface ContextStats {
  pct: number;
  used: string;
  window: string;
  tier: "ok" | "warn" | "high" | "crit";
  estimate: boolean;
  model: string | undefined;
  tooltip: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function contextStats(records: RawJsonlRecord[], messages: MessageRecord[]): ContextStats {
  const usage = readLastUsage(records);
  const estimate = !usage;
  const tokens = usage
    ? contextTokens(usage)
    : Math.round(messages.map((m) => extractBlocks(m).map((b) => b.text).join("\n")).join("\n").length / 4);
  const windowSize = CONTEXT_WINDOW;
  const pct = Math.min(100, (tokens / windowSize) * 100);
  const model = formatModelName(usage?.model);
  return {
    pct,
    used: formatTokens(tokens),
    window: formatTokens(windowSize),
    tier: pct >= 95 ? "crit" : pct >= 80 ? "high" : pct >= 50 ? "warn" : "ok",
    estimate,
    model,
    tooltip: estimate
      ? "Estimated from the text length: this conversation has no usage data."
      : `${tokens.toLocaleString("en-US")} of ${windowSize.toLocaleString("en-US")} tokens${model ? ` · ${model}` : ""}`,
  };
}

/**
 * A message with text (yours or Claude's), or the steps between two of them.
 * Claude Code writes every tool call, tool result and thinking as its own
 * record; a run of them becomes one steps item ("5 tool calls · Edit, Bash").
 */
export type ViewerItem = { kind: "message"; message: MessageRecord } | { kind: "steps"; messages: MessageRecord[] };

export function toItems(messages: MessageRecord[]): ViewerItem[] {
  const items: ViewerItem[] = [];
  for (const message of messages) {
    const hasText = extractBlocks(message).some((b) => b.kind === "text" && b.text.trim() !== "");
    if (hasText) {
      items.push({ kind: "message", message });
      continue;
    }
    const last = items[items.length - 1];
    if (last?.kind === "steps") last.messages.push(message);
    else items.push({ kind: "steps", messages: [message] });
  }
  return items;
}

/**
 * One exchange: your message, what Claude did on the way, and Claude's
 * answer, the last thing it wrote before your next message. The work is
 * everything else: its running notes, tool calls, results and thinking.
 */
export interface Turn {
  user: MessageRecord | null;
  work: ViewerItem[];
  answer: MessageRecord | null;
}

export function toTurns(messages: MessageRecord[]): Turn[] {
  const groups: { user: MessageRecord | null; items: ViewerItem[] }[] = [];
  for (const item of toItems(messages)) {
    if (item.kind === "message" && item.message.type === "user") {
      groups.push({ user: item.message, items: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ user: null, items: [] });
    groups[groups.length - 1].items.push(item);
  }
  return groups.map(({ user, items }) => {
    let at = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === "message") {
        at = i;
        break;
      }
    }
    const answer = at >= 0 ? (items[at] as { kind: "message"; message: MessageRecord }).message : null;
    return { user, work: items.filter((_, i) => i !== at), answer };
  });
}

function renderBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "thinking") {
        const text = b.text.trim() ? escapeHtml(b.text) : "Thinking was not stored. Claude Code keeps only its signature.";
        return `<details class="block thinking"><summary>${icon("brain")}Thinking</summary><div class="thinking-text">${text}</div></details>`;
      }
      if (b.kind === "tool") {
        const [first, ...rest] = b.text.split("\n");
        return `<details class="block tool"><summary>${icon("tool")}${escapeHtml(toolSummary(first))}</summary><div class="tool-text">${escapeHtml(rest.join("\n") || first)}</div></details>`;
      }
      // data-md keeps the markdown source, so Copy and Save export the
      // original text rather than the rendered plain text.
      return `<div class="block text" data-md="${escapeHtml(b.text)}" dir="auto">${md.render(b.text)}</div>`;
    })
    .join("");
}

/**
 * Text Claude Code or the editor attaches to your message (<system-reminder>,
 * <ide_opened_file>, a browser's instructions): one or more tagged blocks at
 * the start of a text part. They fold away; only your own words stay in the
 * bubble. A slash command shows as the command itself.
 */
const LEADING_TAG = /^\s*<([a-z][\w-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1(?:\s[^>]*)?>/i;

function splitAttachments(blocks: ContentBlock[]): { own: ContentBlock[]; attached: { tag: string; text: string }[] } {
  const own: ContentBlock[] = [];
  const attached: { tag: string; text: string }[] = [];
  for (const b of blocks) {
    if (b.kind !== "text") {
      own.push(b);
      continue;
    }
    let rest = b.text;
    let m: RegExpExecArray | null;
    while ((m = LEADING_TAG.exec(rest))) {
      const tag = m[1].toLowerCase();
      const inner = m[2].trim();
      // A slash command is your own words: its name and arguments stay; the
      // message tag only repeats the name.
      if (tag === "command-name" || tag === "command-args") {
        if (inner) own.push({ kind: "text", text: tag === "command-name" ? "`" + inner + "`" : inner });
      } else if (tag !== "command-message") {
        attached.push({ tag, text: inner });
      }
      rest = rest.slice(m[0].length);
    }
    if (rest.trim()) own.push({ kind: "text", text: rest.trim() });
  }
  return { own, attached };
}

function renderAttachments(attached: { tag: string; text: string }[]): string {
  return attached
    .map((a) =>
      a.tag === "pasted_content"
        ? `<details class="block attach pasted"><summary>${icon("fileText")}Pasted text</summary><div class="tool-text">${escapeHtml(a.text)}</div></details>`
        : `<details class="block attach"><summary>${icon("fileText")}Attached: ${escapeHtml(a.tag)}</summary><div class="tool-text">${escapeHtml(a.text)}</div></details>`,
    )
    .join("");
}

function preview(blocks: ContentBlock[]): string {
  const flat = blocks.filter((b) => b.kind === "text").map((b) => b.text).join(" ").replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

interface Speech {
  who: "you" | "claude";
  message: MessageRecord;
  body: string;
  blocks: ContentBlock[];
}

/** A message in a bubble, with the speaker's avatar beside it. */
function article({ who, message, body, blocks }: Speech): string {
  const claude = who === "claude";
  const name = claude ? "Claude" : "You";
  const modelRaw = (message.message as Record<string, unknown>)?.["model"];
  const model = claude && typeof modelRaw === "string" ? formatModelName(modelRaw) : undefined;
  return `
    <article class="msg unit ${who}" data-who="${name}" data-when="${escapeHtml(dateTime(message.timestamp))}">
      <span class="avatar" aria-hidden="true">${claude ? CLAUDE_MARK_SVG : icon("user")}</span>
      <div class="speech">
        <div class="msg-head">
          <button class="msg-toggle" type="button" aria-expanded="true">
            <strong class="who"${model ? ` title="${escapeHtml(model)}"` : ""}>${name}</strong>
            <time datetime="${escapeHtml(message.timestamp)}" title="${escapeHtml(dateTime(message.timestamp))}">${escapeHtml(time(message.timestamp))}</time>
            <span class="preview" dir="auto">${escapeHtml(preview(blocks))}</span>
          </button>
          <span class="actions">
            <button class="mini" type="button" data-act="copy">${icon("copy")}<span>Copy</span></button>
            <button class="mini mdhe" type="button" data-act="mdhe" title="Open in md-he">${icon("externalLink")}<span>md-he</span></button>
          </span>
        </div>
        <div class="msg-body">${body || '<p class="muted">Empty message</p>'}</div>
      </div>
    </article>`;
}

/** "[Tool: Read]" becomes "Read"; "[Tool result]" stays "Tool result". */
function toolSummary(firstLine: string): string {
  const m = /^\[Tool: (.+)\]$/.exec(firstLine.trim());
  if (m) return m[1];
  return firstLine.trim() === "[Tool result]" ? "Tool result" : firstLine.trim() || "Tool";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a run of blocks did: "3 tool calls, thinking" and the tools' names. */
function describeSteps(blocks: ContentBlock[]): { label: string; names: string[] } {
  const calls = blocks.filter((b) => b.kind === "tool" && b.text.startsWith("[Tool: ")).map((b) => toolSummary(b.text.split("\n")[0]));
  const thinking = blocks.some((b) => b.kind === "thinking");
  const results = blocks.some((b) => b.kind === "tool");
  const parts = [calls.length ? plural(calls.length, "tool call", "tool calls") : results ? "Tool results" : "", thinking ? "thinking" : ""].filter(Boolean);
  const label = parts.join(", ");
  return { label: label ? label.charAt(0).toUpperCase() + label.slice(1) : "Empty steps", names: [...new Set(calls)] };
}

function names(list: string[]): string {
  return list.length ? ` · ${list.slice(0, 4).join(", ")}${list.length > 4 ? ", …" : ""}` : "";
}

/**
 * Claude's work between your message and its answer, folded into one quiet
 * line: "12 updates, 31 tool calls · Read, Edit, Bash". Open, it shows the
 * running notes and each run of steps, each folded again.
 */
function renderWork(items: ViewerItem[], extra: ContentBlock[], answerAt: string | undefined): string {
  if (items.length === 0 && extra.length === 0) return "";
  const all: ContentBlock[] = [];
  let updates = 0;
  const parts = items.map((item) => {
    if (item.kind === "message") {
      updates++;
      const blocks = extractBlocks(item.message);
      all.push(...blocks);
      return `<div class="note unit" data-who="Claude" data-when="${escapeHtml(dateTime(item.message.timestamp))}">${renderBlocks(blocks)}</div>`;
    }
    const blocks = item.messages.flatMap((m) => extractBlocks(m));
    all.push(...blocks);
    const { label, names: tools } = describeSteps(blocks);
    return `<details class="step unit" data-who="${escapeHtml(label)}" data-when="${escapeHtml(dateTime(item.messages[0].timestamp))}"><summary>${icon(blocks.some((b) => b.kind === "tool") ? "tool" : "brain")}<span>${escapeHtml(label)}${escapeHtml(names(tools))}</span></summary><div class="step-body">${renderBlocks(blocks)}</div></details>`;
  });
  if (extra.length) {
    all.push(...extra);
    const { label, names: tools } = describeSteps(extra);
    parts.push(`<details class="step unit" data-who="${escapeHtml(label)}" data-when="${escapeHtml(dateTime(answerAt))}"><summary>${icon(extra.some((b) => b.kind === "tool") ? "tool" : "brain")}<span>${escapeHtml(label)}${escapeHtml(names(tools))}</span></summary><div class="step-body">${renderBlocks(extra)}</div></details>`);
  }
  const { names: tools } = describeSteps(all);
  const calls = all.filter((b) => b.kind === "tool" && b.text.startsWith("[Tool: ")).length;
  const summary = [updates ? plural(updates, "update", "updates") : "", calls ? plural(calls, "tool call", "tool calls") : ""].filter(Boolean).join(", ") || "Thinking";
  return `<details class="work"><summary>${icon("chevronRight")}<span>${escapeHtml(summary + names(tools))}</span></summary><div class="work-body">${parts.join("")}</div></details>`;
}

function renderTurn(turn: Turn): string {
  let you = "";
  if (turn.user) {
    const { own, attached } = splitAttachments(extractBlocks(turn.user));
    you = article({ who: "you", message: turn.user, body: renderAttachments(attached) + renderBlocks(own), blocks: own });
  }
  // The answer's bubble holds its text; its thinking or tool calls join the work.
  const answerBlocks = turn.answer ? extractBlocks(turn.answer) : [];
  const text = answerBlocks.filter((b) => b.kind === "text");
  const work = renderWork(turn.work, answerBlocks.filter((b) => b.kind !== "text"), turn.answer?.timestamp);
  const answer = turn.answer ? article({ who: "claude", message: turn.answer, body: renderBlocks(text), blocks: text }) : "";
  return `<section class="turn">${you}${work}${answer}</section>`;
}

/** JSON inside a <script>: no "</script>" can close it early. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Claude's bubbles take the project's color; without one, the Benefits green. */
const DEFAULT_BUBBLE = "#10B981";

export function buildViewerHtml(input: ViewerInput): string {
  const { meta, records, prefs, flags } = input;
  const messages = records.filter(isRealMessage) as MessageRecord[];
  const stats = contextStats(records, messages);
  // Newest exchange first: the end of a conversation is what you open it for.
  // Inside an exchange, top to bottom: your message, the work, the answer.
  const turnsHtml = toTurns(messages).reverse().map(renderTurn).join("\n");
  const started = dateTime(meta.firstMessageAt ?? messages[0]?.timestamp);
  const projectColor = input.projectColor && /^#[0-9a-f]{6}$/i.test(input.projectColor) ? input.projectColor : null;
  const color = projectColor ? ` style="--c:${projectColor}"` : "";

  const body = `
<div class="viewer" style="--proj:${projectColor ?? DEFAULT_BUBBLE}">
  <header class="vhead">
    <div class="eyebrow"><i class="pdot"${color}></i><span>${escapeHtml(meta.projectDisplayName)}</span><span class="kind">Conversation</span></div>
    <div class="heading-row">
      <h1 dir="auto">${escapeHtml(meta.title)}</h1>
      <button class="btn" type="button" id="more" aria-haspopup="menu" aria-expanded="false"><span>More</span>${icon("dots")}</button>
    </div>
    <div class="meta">
      ${started ? `<span>${escapeHtml(started)}</span>` : ""}
      <span>${messages.length} ${messages.length === 1 ? "message" : "messages"}</span>
      ${stats.model ? `<span>${escapeHtml(`Claude ${stats.model}`)}</span>` : ""}
    </div>
    <div class="tools">
      <div class="find" role="search">
        ${icon("search")}
        <input id="find" type="search" placeholder="Find in conversation" aria-label="Find in conversation" spellcheck="false" autocomplete="off" />
        <span class="count" id="find-count" aria-live="polite"></span>
        <button class="icon-btn" type="button" id="prev" aria-label="Previous match" disabled>${icon("arrowUp")}</button>
        <button class="icon-btn" type="button" id="next" aria-label="Next match" disabled>${icon("arrowDown")}</button>
      </div>
      <div class="seg" role="group" aria-label="Text direction">
        <button type="button" data-dir="auto" aria-pressed="true" title="Each paragraph follows its own language">Auto</button>
        <button type="button" data-dir="ltr" aria-pressed="false">LTR</button>
        <button type="button" data-dir="rtl" aria-pressed="false">RTL</button>
      </div>
      <button class="btn" type="button" id="display" aria-haspopup="true" aria-expanded="false">${icon("adjustments")}<span>Display</span></button>
      <button class="btn" type="button" id="collapse">${icon("chevronsUp")}<span>Collapse all</span></button>
    </div>
    <div class="context" title="${escapeHtml(stats.tooltip)}">
      <span>Context<strong>${Math.round(stats.pct)}%</strong></span>
      <div class="bar"><i class="tier-${stats.tier}" style="width:${stats.pct.toFixed(1)}%"></i></div>
      <span>${stats.estimate ? '<span class="est">Estimated</span> · ' : ""}${stats.used} / ${stats.window}</span>
    </div>
    <div class="hidden-matches" id="hidden-matches" hidden><span id="hidden-count"></span> in hidden parts. <button class="link" type="button" id="show-hidden">Show them</button></div>
  </header>
  <main class="messages" id="messages">
    <div class="column">
${turnsHtml || '<div class="empty-state">No messages in this conversation.</div>'}
    </div>
  </main>
  <footer class="vfoot">
    <span>Read-only conversation</span>
    <a href="${BENEFITS_URL}">Part of Benefits${icon("externalLink")}</a>
  </footer>
</div>
<button class="icon-btn framed to-oldest" type="button" id="to-oldest" title="Go to the oldest message" aria-label="Go to the oldest message" hidden>${icon("arrowDown")}</button>
<div class="menu" id="more-menu" role="menu" aria-label="Conversation actions" hidden>
  <button type="button" role="menuitem" data-action="rename">${icon("pencil")}Rename</button>
  <hr />
  <button type="button" role="menuitem" data-action="exportFull">${icon("download")}Save full conversation</button>
  <button type="button" role="menuitem" data-action="exportVisible">${icon("download")}Save visible messages</button>
  <hr />
  ${meta.archived
    ? `<button type="button" role="menuitem" data-action="restore">${icon("restore")}Restore from archive</button>`
    : `<button type="button" role="menuitem" data-action="archive">${icon("archive")}Archive</button>`}
  <button type="button" role="menuitem" data-action="reveal">${icon("list")}Show in list</button>
  <hr />
  <button type="button" role="menuitem" class="danger" data-action="delete">${icon("trash")}Delete</button>
</div>
<div class="menu" id="display-menu" aria-label="Display" hidden>
  <label>Hide Claude's work<input type="checkbox" class="switch" role="switch" data-pref="hideWork" /></label>
  <label>Hide thinking<input type="checkbox" class="switch" role="switch" data-pref="hideThinking" /></label>
  <p class="menu-note">Applies to every conversation viewer.</p>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const script = `
  const INITIAL = ${scriptJson({ prefs, title: meta.title })};
  document.body.classList.toggle('no-code-copy', ${!flags.codeCopy});
  document.body.classList.toggle('no-mdhe', ${!flags.mdHe});
${VIEWER_SCRIPT}`;

  return renderWebviewPage({ fonts: input.fonts, theme: input.theme, title: meta.title, css: VIEWER_CSS, body, script });
}
