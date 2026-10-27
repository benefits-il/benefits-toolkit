import type { AgentId } from "../../../shared/agents";

/** What the sidebar's New chat button opens: this editor's own agent, or Claude Code. */
export type NewChatOpens = "editor" | "claudeCode";

/**
 * The command that starts a new conversation with each agent: Claude Code's
 * own, Cursor's "New Chat Tab" and Antigravity's new conversation.
 */
export const NEW_CHAT_COMMANDS: Readonly<Record<AgentId, string>> = {
  claude: "claude-vscode.newConversation",
  cursor: "composer.createNewComposerTab",
  antigravity: "antigravity.startNewConversation",
};

/** The agent a new chat goes to, in an editor whose own agent is `editor`. */
export function newChatAgent(editor: AgentId, opens: NewChatOpens): AgentId {
  return opens === "claudeCode" ? "claude" : editor;
}
