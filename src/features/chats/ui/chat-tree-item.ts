import * as vscode from "vscode";
import { ConversationMeta } from "../domain/conversation";

export type ChatNode = GroupNode | ConversationNode;

export class GroupNode extends vscode.TreeItem {
  readonly kind = "group" as const;
  constructor(
    label: string,
    public readonly key: string,
    public readonly conversations: ConversationMeta[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "group";
    this.description = `${conversations.length}`;
    this.id = `group:${key}`;
  }
}

export class ConversationNode extends vscode.TreeItem {
  readonly kind = "conversation" as const;
  constructor(public readonly meta: ConversationMeta) {
    super(meta.title, vscode.TreeItemCollapsibleState.None);
    this.id = `conv:${meta.filePath}`;
    this.tooltip = buildTooltip(meta);
    this.description = describe(meta);
    this.contextValue = meta.archived ? "archived-conversation" : "conversation";
    this.iconPath = new vscode.ThemeIcon(meta.archived ? "archive" : "comment-discussion");
    this.command = {
      command: "benefit.chats.view",
      title: "View Conversation",
      arguments: [this],
    };
  }
}

function describe(meta: ConversationMeta): string {
  const date = new Date(meta.lastModifiedAt);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function buildTooltip(meta: ConversationMeta): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${escape(meta.title)}**\n\n`);
  md.appendMarkdown(`- Project: \`${escape(meta.projectDisplayName)}\`\n`);
  md.appendMarkdown(`- Messages: ${meta.realMessageCount}\n`);
  md.appendMarkdown(`- Modified: ${escape(meta.lastModifiedAt)}\n`);
  if (meta.archived) md.appendMarkdown(`- Status: archived\n`);
  md.isTrusted = false;
  return md;
}

function escape(s: string): string {
  return s.replace(/[\\`*_{}\[\]()#+\-!>]/g, (m) => `\\${m}`);
}
