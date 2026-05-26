import * as vscode from "vscode";
import * as path from "node:path";
import { ConversationMeta, MessageRecord, RawJsonlRecord } from "../domain/conversation";
import { ConversationRepository } from "../services/conversation-repository";
import { atomicWriteText, ensureDir } from "../../../shared/fs-utils";
import { extractBlocks, formatModelName, readLastUsage } from "../domain/blocks";
import { logger } from "../../../core/logger";

const VIEW_TYPE = "benefit.chatViewer";

export class ChatViewerService {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    _ctx: vscode.ExtensionContext,
    private readonly repo: ConversationRepository,
  ) {
    void _ctx;
  }

  async open(meta: ConversationMeta): Promise<void> {
    const existing = this.panels.get(meta.filePath);
    if (existing) {
      existing.reveal();
      await this.renderInto(existing, meta);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `🕮 ${truncate(meta.title, 24)}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    panel.iconPath = new vscode.ThemeIcon("comment-discussion");
    this.panels.set(meta.filePath, panel);
    panel.onDidDispose(() => this.panels.delete(meta.filePath));

    panel.webview.onDidReceiveMessage(async (message: { command?: string; content?: string }) => {
      if (message?.command === "saveAsMarkdownPrepared" && typeof message.content === "string") {
        await this.saveMarkdown(meta, message.content);
      }
    });

    await this.renderInto(panel, meta);
  }

  refreshOpen(filePath: string): void {
    const panel = this.panels.get(filePath);
    if (!panel) return;
    void this.renderRefreshed(panel, filePath);
  }

  closeAll(): void {
    for (const p of this.panels.values()) p.dispose();
    this.panels.clear();
  }

  private async renderInto(panel: vscode.WebviewPanel, meta: ConversationMeta): Promise<void> {
    const records = await this.repo.readAllRecords(meta.filePath);
    panel.title = `🕮 ${truncate(meta.title, 24)}`;
    panel.webview.html = buildHtml(meta, records);
  }

  private async renderRefreshed(panel: vscode.WebviewPanel, filePath: string): Promise<void> {
    const meta = await this.repo.readMeta(filePath, "", false);
    if (!meta) return;
    await this.renderInto(panel, meta);
  }

  private async saveMarkdown(meta: ConversationMeta, content: string): Promise<void> {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const safeName = sanitizeFileName(meta.title) || meta.conversationId;
    const defaultUri = wsRoot
      ? vscode.Uri.joinPath(wsRoot, `${safeName}.md`)
      : vscode.Uri.file(path.join(require("os").homedir(), "Documents", `${safeName}.md`));

    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Markdown: ["md"] },
      saveLabel: "Save as Markdown",
    });
    if (!uri) return;

    try {
      await ensureDir(path.dirname(uri.fsPath));
      await atomicWriteText(uri.fsPath, content);
      const open = await vscode.window.showInformationMessage(`Saved to ${uri.fsPath}`, "Open");
      if (open === "Open") {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (err) {
      logger.error("chats", "saveAsMarkdownPrepared failed", err);
      vscode.window.showErrorMessage(`Save failed: ${(err as Error).message}`);
    }
  }
}

interface ConversationStats {
  ctxText: string;
  ctxTooltip: string;
  tierClass: string;
  pct: number;
  marker200kPct: number;
  isEstimate: boolean;
  windowSize: number;
}

function buildHtml(meta: ConversationMeta, records: RawJsonlRecord[]): string {
  const realMessages = records.filter(isRealMessage) as MessageRecord[];
  const stats = computeContextStats(records, realMessages);
  const messagesHtml = realMessages
    .map((m, idx) => renderMessage(m, idx === realMessages.length - 1))
    .join("\n");

  return TEMPLATE
    .replace("{{TITLE}}", escapeHtml(meta.title))
    .replace("{{CTX_TOOLTIP}}", escapeHtml(stats.ctxTooltip))
    .replace("{{CTX_WARN_HTML}}", stats.isEstimate
      ? '<span class="ctx-warn" title="No usage data in JSONL — showing rough chars/4 estimate">⚠</span>'
      : "")
    .replace("{{CTX_TEXT}}", escapeHtml(stats.ctxText))
    .replace("{{TIER_CLASS}}", stats.tierClass)
    .replace("{{PCT}}", String(stats.pct))
    .replace("{{MARKER_HTML}}", stats.windowSize === 1_000_000
      ? `<div class="context-bar-200k" style="left:${stats.marker200kPct}%" title="200K boundary"></div>`
      : "")
    .replace("{{MESSAGES_HTML}}", messagesHtml || '<div class="empty-state">No messages in this conversation</div>');
}

function isRealMessage(record: RawJsonlRecord): boolean {
  if (record.type !== "user" && record.type !== "assistant") return false;
  if ((record as Record<string, unknown>)["isSidechain"] === true) return false;
  return typeof (record as Record<string, unknown>)["uuid"] === "string";
}

function computeContextStats(allRecords: RawJsonlRecord[], realMessages: MessageRecord[]): ConversationStats {
  const usage = readLastUsage(allRecords);
  let tokensUsed = 0;
  let isEstimate = false;
  let lastModel: string | undefined;

  if (usage) {
    tokensUsed = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
    lastModel = usage.model;
  } else {
    isEstimate = true;
    const allText = realMessages.map((m) => joinedText(m)).join("\n");
    tokensUsed = Math.round(allText.length / 4);
  }

  const windowSize = /haiku/i.test(lastModel ?? "") ? 200_000 : 1_000_000;
  const pct = Math.min(100, (tokensUsed / windowSize) * 100);
  const marker200kPct = (200_000 / windowSize) * 100;
  const tierClass = pct >= 95 ? "tier-crit" : pct >= 80 ? "tier-high" : pct >= 50 ? "tier-warn" : "tier-ok";

  const ctxText = `${isEstimate ? "~" : ""}${formatTokens(tokensUsed)} / ${formatTokens(windowSize)} (${pct.toFixed(1)}%)`;
  const ctxTooltip = `${lastModel ?? "unknown model"} · used ${tokensUsed.toLocaleString()} tokens of ${windowSize.toLocaleString()} window${isEstimate ? " · estimate (no usage data in JSONL)" : ""}`;

  return { ctxText, ctxTooltip, tierClass, pct, marker200kPct, isEstimate, windowSize };
}

function joinedText(message: MessageRecord): string {
  const blocks = extractBlocks(message);
  return blocks.map((b) => b.text).join("\n");
}

function formatTokens(n: number): string {
  if (n === 1_000_000) return "1M";
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function renderMessage(message: MessageRecord, isLast: boolean): string {
  const role = message.type;
  const blocks = extractBlocks(message);

  const hasText = blocks.some((b) => b.kind === "text" && b.text.trim() !== "");
  const hasThinking = blocks.some((b) => b.kind === "thinking");
  const hasTool = blocks.some((b) => b.kind === "tool" && b.text.trim() !== "");
  const isEmpty = !hasText && !hasThinking && !hasTool;
  const isToolsOnly = !hasText && !hasThinking && hasTool;
  const isThinkingOnly = !hasText && hasThinking && !hasTool;

  let roleLabel: string;
  if (role === "user") {
    roleLabel = "User";
  } else {
    const modelRaw = (message.message as Record<string, unknown>)?.["model"];
    const modelName = typeof modelRaw === "string" ? formatModelName(modelRaw) : undefined;
    roleLabel = modelName ? `Claude · ${modelName}` : "Claude";
  }

  const visibleText = blocks.filter((b) => b.kind === "text").map((b) => b.text).join("\n\n");
  const previewSource = visibleText.replace(/\s+/g, " ").trim();
  const previewText = previewSource.length > 80 ? `${previewSource.slice(0, 80)}…` : previewSource;

  const isNarration =
    role === "assistant" &&
    hasText &&
    !hasTool &&
    !hasThinking &&
    visibleText.trim().length < 200;

  const bodyHtml = blocks.map((b) => {
    if (b.kind === "thinking") {
      const filled = b.text && b.text.trim() !== "";
      const textPart = filled
        ? `<div class="thinking-text">${escapeHtml(b.text)}</div>`
        : `<div class="thinking-text thinking-text-empty">(thinking content not stored — only the cryptographic signature is preserved in Claude Code logs)</div>`;
      return `<div class="content-block content-block-thinking">
        <div class="thinking-chip"><svg><use href="#icon-brain"/></svg><span>Thinking</span></div>
        ${textPart}
      </div>`;
    }
    if (b.kind === "tool") {
      return `<div class="content-block content-block-tool">${escapeHtml(b.text)}</div>`;
    }
    return `<div class="content-block content-block-text">${escapeHtml(b.text)}</div>`;
  }).join("");

  const collapsedClass = isLast ? "" : " collapsed";
  return `
    <div class="message ${role}${collapsedClass}" data-empty="${isEmpty}" data-tools-only="${isToolsOnly}" data-thinking-only="${isThinkingOnly}" data-narration="${isNarration}">
      <div class="message-header" onclick="toggleMessage(this)">
        <span class="chevron"></span>
        <span class="message-role ${role}">${escapeHtml(roleLabel)}</span>
        <span class="message-preview">${escapeHtml(previewText)}</span>
        <button class="copy-button copy-collapsed" onclick="event.stopPropagation(); copyMessage(this);" title="Copy message"><svg><use href="#icon-copy"/></svg></button>
      </div>
      <div class="message-content">
        <div class="message-text">${bodyHtml}</div>
        <div class="message-actions">
          <button class="copy-button copy-expanded" onclick="copyMessage(this)" title="Copy message"><svg><use href="#icon-copy"/></svg></button>
        </div>
      </div>
    </div>`;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

function sanitizeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}}</title>
  <style>
    :root {
      --cc-radius-sm: 6px;
      --cc-radius-md: 12px;
      --cc-radius-lg: 20px;
      --cc-radius-pill: 999px;
      --cc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.06);
      --cc-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.10);
      --cc-shadow-pop: 0 8px 24px rgba(0, 0, 0, 0.18);
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 0;
      margin: 0;
      line-height: 1.6;
    }

    .header {
      position: sticky;
      top: 0;
      background-color: var(--vscode-editorGroupHeader-tabsBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      z-index: 100;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }

    .header-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .readonly-badge {
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 10px;
      border-radius: var(--cc-radius-pill);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    @media (max-width: 600px) {
      .header { padding: 12px 16px; }
      .header-title { font-size: 14px; flex-basis: 100%; }
      .readonly-badge { font-size: 10px; padding: 1px 6px; }
    }

    .messages-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }

    .message {
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 0;
      user-select: none;
    }

    .message-header:hover {
      background-color: var(--vscode-list-hoverBackground);
      border-radius: var(--cc-radius-sm);
    }

    .chevron {
      font-size: 10px;
      width: 12px;
      flex-shrink: 0;
      color: var(--vscode-descriptionForeground);
    }

    .message.collapsed .chevron::before { content: '\\25B8'; }
    .message:not(.collapsed) .chevron::before { content: '\\25BE'; }

    .message-preview {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      opacity: 0.75;
    }
    .message:not(.collapsed) .message-preview { display: none; }
    .message.collapsed .message-content { display: none; }

    .message-content {
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: var(--cc-radius-md);
      padding: 18px 20px;
      box-shadow: var(--cc-shadow-sm);
    }
    .message.user .message-content { border-inline-start: 4px solid var(--vscode-textLink-foreground); }
    .message.assistant .message-content { border-inline-start: 4px solid #CC785C; }

    .message-text { display: block; white-space: pre-wrap; word-wrap: break-word; }

    .message-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-editorWidget-border);
    }

    .message-role {
      padding: 2px 10px;
      border-radius: var(--cc-radius-pill);
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .message-role.user {
      background-color: color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent);
      color: var(--vscode-textLink-foreground);
    }
    .message-role.assistant {
      background-color: color-mix(in srgb, #CC785C 20%, transparent);
      color: #CC785C;
    }

    .copy-button {
      background-color: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      border: 1px solid var(--vscode-editorWidget-border);
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-family: var(--vscode-font-family);
      transition: background-color 0.15s ease;
    }
    .copy-button.copy-collapsed {
      margin-inline-start: auto;
      flex-shrink: 0;
      background: transparent;
      border-color: transparent;
      opacity: 0.6;
      padding: 4px 6px;
    }
    .copy-button.copy-collapsed:hover {
      opacity: 1;
      background-color: var(--vscode-toolbar-hoverBackground, var(--vscode-button-hoverBackground));
    }
    .copy-button svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
      vertical-align: middle;
    }
    .copy-button:hover { background-color: var(--vscode-button-hoverBackground); }
    .copy-button.copied {
      background-color: var(--vscode-notebookStatusSuccessIcon-foreground);
      color: var(--vscode-editor-background);
      border-color: var(--vscode-notebookStatusSuccessIcon-foreground);
    }

    .header-actions { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }

    .icon-btn {
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid transparent;
      border-radius: var(--cc-radius-pill);
      cursor: pointer;
      padding: 0;
      transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .icon-btn:hover { background-color: var(--vscode-toolbar-hoverBackground, var(--vscode-button-hoverBackground)); }
    .icon-btn:active { transform: translateY(1px); }
    .icon-btn.is-active {
      background-color: var(--vscode-toolbar-activeBackground, var(--vscode-button-background));
      border-color: var(--vscode-focusBorder);
    }
    .icon-btn svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .dropdown { position: relative; display: inline-flex; }
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      inset-inline-end: 0;
      min-width: 220px;
      background-color: var(--vscode-menu-background, var(--vscode-editorWidget-background));
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border));
      border-radius: var(--cc-radius-md);
      padding: 6px;
      box-shadow: var(--cc-shadow-pop);
      z-index: 200;
    }
    .dropdown-menu[hidden] { display: none; }
    .dropdown-menu label {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--cc-radius-sm);
      font-size: 12.5px;
      cursor: pointer;
      user-select: none;
    }
    .dropdown-menu label:hover { background-color: var(--vscode-list-hoverBackground); }
    .dropdown-menu input[type="checkbox"] { accent-color: var(--vscode-focusBorder); cursor: pointer; }

    body.hide-empty .message[data-empty="true"] { display: none; }
    body.hide-tools .message[data-tools-only="true"] { display: none; }
    body.hide-narration .message[data-narration="true"] { display: none; }
    body.hide-thinking .content-block-thinking { display: none; }
    body.hide-thinking .message[data-thinking-only="true"] { display: none; }

    .context-indicator { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-shrink: 0; }
    .context-indicator .ctx-text { font-variant-numeric: tabular-nums; color: var(--vscode-descriptionForeground); }
    .context-indicator .ctx-warn { color: #d29922; cursor: help; }

    .context-bar {
      position: relative;
      width: 140px;
      height: 7px;
      background-color: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
      border-radius: var(--cc-radius-pill);
      overflow: hidden;
    }
    .context-bar-fill { height: 100%; transition: width 0.3s ease; }
    .context-bar-fill.tier-ok    { background-color: #3fb950; }
    .context-bar-fill.tier-warn  { background-color: #d29922; }
    .context-bar-fill.tier-high  { background-color: #db6d28; }
    .context-bar-fill.tier-crit  { background-color: #f85149; }

    .context-bar-200k {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 1px;
      background-color: var(--vscode-foreground);
      opacity: 0.5;
    }

    .scroll-to-bottom {
      position: fixed;
      bottom: 24px;
      inset-inline-end: 24px;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background-color: #CC785C;
      color: #ffffff;
      border: none;
      cursor: pointer;
      line-height: 1;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(204, 120, 92, 0.45), 0 2px 6px rgba(0, 0, 0, 0.18);
      z-index: 99;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    }
    .scroll-to-bottom:hover { background-color: #b86a4f; }
    .scroll-to-bottom:active { transform: translateY(1px); }
    .scroll-to-bottom svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .scroll-to-bottom.visible { display: flex; }

    .content-block { display: block; white-space: pre-wrap; word-wrap: break-word; }
    .content-block + .content-block { margin-top: 14px; }

    .content-block-thinking {
      border: 1.5px dashed var(--vscode-editorWidget-border);
      background-color: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
      border-radius: var(--cc-radius-md);
      padding: 12px 14px;
      font-style: italic;
      color: var(--vscode-descriptionForeground);
      opacity: 0.92;
    }
    .thinking-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px 2px 8px;
      border-radius: var(--cc-radius-pill);
      background-color: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
      letter-spacing: 0.03em;
      margin-bottom: 8px;
    }
    .thinking-chip svg {
      width: 13px; height: 13px;
      stroke: currentColor; fill: none; stroke-width: 1.75;
      stroke-linecap: round; stroke-linejoin: round;
    }
    .thinking-text { display: block; white-space: pre-wrap; word-wrap: break-word; }
    .thinking-text-empty { font-size: 11.5px; opacity: 0.6; font-style: normal; }

    .content-block-tool {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85em;
      background-color: color-mix(in srgb, var(--vscode-foreground) 3%, transparent);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: var(--cc-radius-sm);
      padding: 10px 12px;
      opacity: 0.85;
    }

    .title-icon {
      width: 18px; height: 18px;
      stroke: currentColor; fill: none; stroke-width: 1.75;
      stroke-linecap: round; stroke-linejoin: round;
      flex-shrink: 0; opacity: 0.85;
    }

    code {
      background-color: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 3px;
      padding: 2px 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .empty-state { text-align: center; padding: 48px 24px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <svg style="display:none" aria-hidden="true">
    <symbol id="icon-copy" viewBox="0 0 24 24"><path d="M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z"/><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2"/></symbol>
    <symbol id="icon-check" viewBox="0 0 24 24"><path d="M5 12l5 5l10 -10"/></symbol>
    <symbol id="icon-x" viewBox="0 0 24 24"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></symbol>
    <symbol id="icon-chevrons-down" viewBox="0 0 24 24"><path d="M7 7l5 5l5 -5"/><path d="M7 13l5 5l5 -5"/></symbol>
    <symbol id="icon-chevrons-up" viewBox="0 0 24 24"><path d="M7 11l5 -5l5 5"/><path d="M7 17l5 -5l5 5"/></symbol>
    <symbol id="icon-download" viewBox="0 0 24 24"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/></symbol>
    <symbol id="icon-settings" viewBox="0 0 24 24"><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></symbol>
    <symbol id="icon-language" viewBox="0 0 24 24"><path d="M4 5h7"/><path d="M9 3v2c0 4.418 -2.239 8 -5 8"/><path d="M5 9c0 2.144 2.952 3.908 6.7 4"/><path d="M12 20l4 -9l4 9"/><path d="M19.1 18h-6.2"/></symbol>
    <symbol id="icon-arrow-down" viewBox="0 0 24 24"><path d="M12 5l0 14"/><path d="M18 13l-6 6"/><path d="M6 13l6 6"/></symbol>
    <symbol id="icon-book" viewBox="0 0 24 24"><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/></symbol>
    <symbol id="icon-brain" viewBox="0 0 24 24"><path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/></symbol>
  </svg>

  <div class="header">
    <div class="header-title">
      <svg class="title-icon" aria-hidden="true"><use href="#icon-book"/></svg>
      <span>{{TITLE}}</span>
      <span class="readonly-badge">Read Only</span>
    </div>
    <div class="context-indicator" title="{{CTX_TOOLTIP}}">
      {{CTX_WARN_HTML}}
      <span class="ctx-text">{{CTX_TEXT}}</span>
      <div class="context-bar">
        <div class="context-bar-fill {{TIER_CLASS}}" style="width:{{PCT}}%"></div>
        {{MARKER_HTML}}
      </div>
    </div>
    <div class="header-actions">
      <div class="dropdown">
        <button class="icon-btn" id="settings-btn" type="button" onclick="toggleSettings(event)" title="View settings" aria-haspopup="true">
          <svg><use href="#icon-settings"/></svg>
        </button>
        <div class="dropdown-menu" id="settings-menu" hidden>
          <label><input type="checkbox" id="opt-hide-empty" onchange="onSettingChange()"><span>Hide empty messages</span></label>
          <label><input type="checkbox" id="opt-hide-tools" onchange="onSettingChange()"><span>Hide tool-only messages</span></label>
          <label><input type="checkbox" id="opt-hide-narration" onchange="onSettingChange()"><span>Hide short narration texts</span></label>
          <label><input type="checkbox" id="opt-hide-thinking" onchange="onSettingChange()"><span>Hide thinking blocks</span></label>
        </div>
      </div>
      <button class="icon-btn" id="rtl-btn" type="button" onclick="toggleRtl()" title="Toggle RTL/LTR direction">
        <svg><use href="#icon-language"/></svg>
      </button>
      <button class="icon-btn" id="collapse-all-btn" type="button" onclick="toggleCollapseAll()" title="Collapse all">
        <svg><use href="#icon-chevrons-up"/></svg>
      </button>
      <button class="icon-btn" type="button" onclick="saveAsMarkdown()" title="Save as Markdown">
        <svg><use href="#icon-download"/></svg>
      </button>
    </div>
  </div>

  <div class="messages-container">
    {{MESSAGES_HTML}}
  </div>

  <button class="scroll-to-bottom" id="scroll-bottom-btn" onclick="scrollToBottom()" title="Scroll to bottom">
    <svg><use href="#icon-arrow-down"/></svg>
  </button>

  <script>
    const vscode = acquireVsCodeApi();
    const VIEWER_STATE_KEY = 'benefit-chats-viewer-state';

    function loadViewerState() {
      const defaults = { rtl: false, hideEmpty: false, hideTools: false, hideNarration: false, hideThinking: false };
      try {
        const raw = localStorage.getItem(VIEWER_STATE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
          rtl: !!parsed.rtl,
          hideEmpty: !!parsed.hideEmpty,
          hideTools: !!parsed.hideTools,
          hideNarration: !!parsed.hideNarration,
          hideThinking: !!parsed.hideThinking
        };
      } catch (e) {
        return defaults;
      }
    }

    function saveViewerState(state) {
      try { localStorage.setItem(VIEWER_STATE_KEY, JSON.stringify(state)); }
      catch (e) { /* ignore quota errors */ }
    }

    function applyViewerState(state) {
      document.body.dir = state.rtl ? 'rtl' : 'ltr';
      document.body.classList.toggle('hide-empty', state.hideEmpty);
      document.body.classList.toggle('hide-tools', state.hideTools);
      document.body.classList.toggle('hide-narration', state.hideNarration);
      document.body.classList.toggle('hide-thinking', state.hideThinking);
      const rtlBtn = document.getElementById('rtl-btn');
      if (rtlBtn) rtlBtn.classList.toggle('is-active', state.rtl);
      const optEmpty = document.getElementById('opt-hide-empty');
      const optTools = document.getElementById('opt-hide-tools');
      const optNarration = document.getElementById('opt-hide-narration');
      const optThinking = document.getElementById('opt-hide-thinking');
      if (optEmpty) optEmpty.checked = state.hideEmpty;
      if (optTools) optTools.checked = state.hideTools;
      if (optNarration) optNarration.checked = state.hideNarration;
      if (optThinking) optThinking.checked = state.hideThinking;
    }

    let viewerState = loadViewerState();

    function onSettingChange() {
      const optEmpty = document.getElementById('opt-hide-empty');
      const optTools = document.getElementById('opt-hide-tools');
      const optNarration = document.getElementById('opt-hide-narration');
      const optThinking = document.getElementById('opt-hide-thinking');
      viewerState.hideEmpty = !!(optEmpty && optEmpty.checked);
      viewerState.hideTools = !!(optTools && optTools.checked);
      viewerState.hideNarration = !!(optNarration && optNarration.checked);
      viewerState.hideThinking = !!(optThinking && optThinking.checked);
      saveViewerState(viewerState);
      applyViewerState(viewerState);
    }

    function toggleRtl() {
      viewerState.rtl = !viewerState.rtl;
      saveViewerState(viewerState);
      applyViewerState(viewerState);
    }

    function toggleSettings(event) {
      if (event) event.stopPropagation();
      const menu = document.getElementById('settings-menu');
      if (!menu) return;
      menu.hidden = !menu.hidden;
    }

    document.addEventListener('click', function (e) {
      const menu = document.getElementById('settings-menu');
      const btn = document.getElementById('settings-btn');
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
      menu.hidden = true;
    });

    function isElementVisible(el) {
      return el && window.getComputedStyle(el).display !== 'none';
    }

    function collectVisibleBlockTexts(messageEl) {
      const blocks = messageEl.querySelectorAll('.content-block');
      const parts = [];
      blocks.forEach(function (block) {
        if (!isElementVisible(block)) return;
        if (block.classList.contains('content-block-thinking')) {
          const txt = block.querySelector('.thinking-text');
          if (txt) parts.push({ kind: 'thinking', text: txt.textContent });
        } else if (block.classList.contains('content-block-tool')) {
          parts.push({ kind: 'tool', text: block.textContent });
        } else {
          parts.push({ kind: 'text', text: block.textContent });
        }
      });
      return parts;
    }

    function buildMarkdown() {
      const titleEl = document.querySelector('.header-title span:not(.readonly-badge)');
      const docTitle = titleEl ? titleEl.textContent.trim() : 'Conversation';
      const lines = ['# ' + docTitle, ''];
      const messages = document.querySelectorAll('.message');
      messages.forEach(function (msg) {
        if (!isElementVisible(msg)) return;
        const roleEl = msg.querySelector('.message-role');
        const role = roleEl ? roleEl.textContent.trim() : '';
        const parts = collectVisibleBlockTexts(msg);
        if (parts.length === 0) return;
        lines.push('## ' + role, '');
        parts.forEach(function (part) {
          if (part.kind === 'thinking') {
            lines.push('> **💭 Thinking**');
            lines.push('>');
            part.text.split('\\n').forEach(function (l) { lines.push('> ' + l); });
            lines.push('');
          } else if (part.kind === 'tool') {
            lines.push('\\u0060\\u0060\\u0060');
            lines.push(part.text);
            lines.push('\\u0060\\u0060\\u0060');
            lines.push('');
          } else {
            lines.push(part.text);
            lines.push('');
          }
        });
      });
      return lines.join('\\n');
    }

    function saveAsMarkdown() {
      const content = buildMarkdown();
      vscode.postMessage({ command: 'saveAsMarkdownPrepared', content: content });
    }

    function toggleMessage(headerEl) {
      headerEl.parentElement.classList.toggle('collapsed');
      syncCollapseAllLabel();
    }

    function copyMessage(btn) {
      const messageEl = btn.closest('.message');
      let text = '';
      if (messageEl) {
        const parts = collectVisibleBlockTexts(messageEl);
        text = parts.map(function (p) {
          return p.kind === 'thinking' ? '[Thinking]\\n' + p.text : p.text;
        }).join('\\n\\n');
        if (!text) {
          const fallbackEl = messageEl.querySelector('.message-text');
          text = fallbackEl ? fallbackEl.textContent : '';
        }
      }
      const originalHtml = btn.innerHTML;
      navigator.clipboard.writeText(text).then(function () {
        btn.innerHTML = '<svg><use href="#icon-check"/></svg>';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.innerHTML = originalHtml;
          btn.classList.remove('copied');
        }, 1500);
      }).catch(function (err) {
        console.error('Copy failed:', err);
        btn.innerHTML = '<svg><use href="#icon-x"/></svg>';
        setTimeout(function () { btn.innerHTML = originalHtml; }, 1500);
      });
    }

    function toggleCollapseAll() {
      const messages = document.querySelectorAll('.message');
      const anyExpanded = Array.from(messages).some(function (m) { return !m.classList.contains('collapsed'); });
      messages.forEach(function (m) {
        if (anyExpanded) m.classList.add('collapsed');
        else m.classList.remove('collapsed');
      });
      syncCollapseAllLabel();
    }

    function syncCollapseAllLabel() {
      const btn = document.getElementById('collapse-all-btn');
      if (!btn) return;
      const messages = document.querySelectorAll('.message');
      const anyExpanded = Array.from(messages).some(function (m) { return !m.classList.contains('collapsed'); });
      const iconId = anyExpanded ? '#icon-chevrons-up' : '#icon-chevrons-down';
      btn.innerHTML = '<svg><use href="' + iconId + '"/></svg>';
      btn.title = anyExpanded ? 'Collapse all' : 'Expand all';
    }

    function scrollToBottom() {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }

    const scrollBtn = document.getElementById('scroll-bottom-btn');
    function updateScrollBtn() {
      if (!scrollBtn) return;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
      scrollBtn.classList.toggle('visible', !nearBottom);
    }
    window.addEventListener('scroll', updateScrollBtn, { passive: true });
    window.addEventListener('resize', updateScrollBtn);

    applyViewerState(viewerState);
    updateScrollBtn();
    syncCollapseAllLabel();
  </script>
</body>
</html>`;
