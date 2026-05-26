import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { ConversationMeta } from "../domain/conversation";
import { ConversationRepository } from "./conversation-repository";
import { atomicWriteText, ensureDir } from "../../../shared/fs-utils";

export class MarkdownExporter {
  constructor(private readonly repo: ConversationRepository) {}

  async exportToFile(meta: ConversationMeta, dest: string): Promise<string> {
    const markdown = await this.render(meta);
    await ensureDir(path.dirname(dest));
    await atomicWriteText(dest, markdown);
    return dest;
  }

  async render(meta: ConversationMeta): Promise<string> {
    const messages = await this.repo.readMessages(meta.filePath);
    const lines: string[] = [];
    lines.push(`# ${meta.title}`);
    lines.push("");
    lines.push(`- Project: \`${meta.projectDisplayName}\``);
    lines.push(`- Conversation ID: \`${meta.conversationId}\``);
    if (meta.firstMessageAt) lines.push(`- Started: \`${meta.firstMessageAt}\``);
    lines.push(`- Modified: \`${meta.lastModifiedAt}\``);
    lines.push(`- Messages: ${meta.realMessageCount}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (const m of messages) {
      const speaker = m.role === "user" ? "You" : "Claude";
      lines.push(`## ${speaker} — ${formatTimestamp(m.timestamp)}`);
      lines.push("");
      lines.push(m.text || "_(no text content)_");
      lines.push("");
    }
    return lines.join("\n");
  }

  async suggestDest(meta: ConversationMeta): Promise<vscode.Uri | undefined> {
    const safe = meta.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || meta.conversationId;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = wsRoot
      ? vscode.Uri.joinPath(wsRoot, `${safe}.md`)
      : vscode.Uri.file(path.join(require("os").homedir(), "Documents", `${safe}.md`));
    return vscode.window.showSaveDialog({
      defaultUri,
      filters: { Markdown: ["md"] },
      saveLabel: "Export conversation",
    });
  }
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export async function readMarkdown(file: string): Promise<string> {
  return fs.readFile(file, "utf8");
}
