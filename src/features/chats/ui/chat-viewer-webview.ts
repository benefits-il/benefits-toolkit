import * as vscode from "vscode";
import { ConversationMeta } from "../domain/conversation";
import { ConversationRepository } from "../services/conversation-repository";
import { MarkdownExporter } from "../services/export-markdown";

const VIEW_TYPE = "benefit.chatViewer";

export class ChatViewerService {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    _ctx: vscode.ExtensionContext,
    private readonly repo: ConversationRepository,
    private readonly exporter: MarkdownExporter,
  ) {
    void _ctx;
  }

  async open(meta: ConversationMeta): Promise<void> {
    const existing = this.panels.get(meta.filePath);
    if (existing) {
      existing.reveal();
      await this.render(existing, meta);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      meta.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
      },
    );
    panel.iconPath = new vscode.ThemeIcon("comment-discussion");
    this.panels.set(meta.filePath, panel);
    panel.onDidDispose(() => this.panels.delete(meta.filePath));

    await this.render(panel, meta);
  }

  refreshOpen(filePath: string): void {
    const panel = this.panels.get(filePath);
    if (!panel) return;
    void this.render(panel, undefined, filePath);
  }

  closeAll(): void {
    for (const p of this.panels.values()) p.dispose();
    this.panels.clear();
  }

  private async render(panel: vscode.WebviewPanel, meta?: ConversationMeta, filePath?: string): Promise<void> {
    const path = meta?.filePath ?? filePath;
    if (!path) return;
    const usedMeta = meta ?? (await this.repo.readMeta(path, "", false));
    if (!usedMeta) return;
    const md = await this.exporter.render(usedMeta);
    panel.title = usedMeta.title;
    panel.webview.html = renderHtml(usedMeta, md);
  }
}

function renderHtml(meta: ConversationMeta, markdown: string): string {
  const blocks = splitIntoBlocks(markdown);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<style>
  body {
    font-family: var(--vscode-editor-font-family, system-ui);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 24px;
    max-width: 900px;
    margin: 0 auto;
    line-height: 1.55;
  }
  h1 { margin-top: 0; font-size: 1.6rem; }
  h2 { margin-top: 1.8em; font-size: 1.05rem; color: var(--vscode-descriptionForeground); font-weight: 600; }
  hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 1.4em 0; }
  .bubble { padding: 12px 14px; border-radius: 8px; margin: 0.6em 0 1.4em; white-space: pre-wrap; word-wrap: break-word; }
  .bubble.user { background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08)); border-inline-start: 3px solid var(--vscode-charts-blue, #4a9eff); }
  .bubble.assistant { background: var(--vscode-input-background, rgba(127,127,127,0.05)); border-inline-start: 3px solid var(--vscode-charts-green, #4ad186); }
  .meta { color: var(--vscode-descriptionForeground); font-size: 0.85rem; margin-bottom: 1em; }
  pre { background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.12)); padding: 10px; border-radius: 4px; overflow-x: auto; }
  code { font-family: var(--vscode-editor-font-family, monospace); }
  a { color: var(--vscode-textLink-foreground); }
</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="meta">
    Project: ${escapeHtml(meta.projectDisplayName)} ·
    ${meta.realMessageCount} message(s) ·
    Modified ${escapeHtml(meta.lastModifiedAt)}
  </div>
  ${blocks.map(renderBlock).join("\n")}
</body>
</html>`;
}

interface Block {
  speaker: string;
  timestamp: string;
  body: string;
}

function splitIntoBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let current: Block | undefined;
  for (const line of lines) {
    const headingMatch = /^##\s+(You|Claude)\s+—\s+(.+)$/.exec(line);
    if (headingMatch) {
      if (current) blocks.push(current);
      current = { speaker: headingMatch[1], timestamp: headingMatch[2], body: "" };
      continue;
    }
    if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function renderBlock(b: Block): string {
  const role = b.speaker === "You" ? "user" : "assistant";
  return `
<div class="bubble ${role}">
  <div class="meta">${escapeHtml(b.speaker)} · ${escapeHtml(b.timestamp)}</div>
  ${renderBody(b.body)}
</div>`;
}

function renderBody(body: string): string {
  const trimmed = body.trim();
  const html = escapeHtml(trimmed);
  const withCode = html.replace(/```([^`]+?)```/g, (_, code: string) => `<pre><code>${code}</code></pre>`);
  return `<div>${withCode.replace(/\n/g, "<br>")}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
