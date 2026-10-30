import type { AgentId } from "../../../shared/agents";
import { ConversationMeta } from "../domain/conversation";
import { encodeProjectFolder } from "./conversation-repository";

/**
 * Opening a conversation in its agent's own chat, in an editor tab. Two
 * agents can open one conversation by its id:
 * - Claude Code: claude-vscode.editor.open(sessionId, prompt, column, group,
 *   fullEditor). fullEditor keeps it a tab and leaves the user's preferred
 *   location alone (without it Claude Code switches that to "panel"). An open
 *   tab of the session is focused instead of a second one.
 * - Cursor: composer.openComposer(composerId, { view: "editor", openInNewTab }).
 *   The transcript's folder name is the composer id. openInNewTab keeps the
 *   chat already in the pane where it is.
 * Antigravity switches conversations only from its own language server (no
 * command, no URL), so its conversations have no button.
 */
export type OpenableAgent = "claude" | "cursor";

/** What the button, the menu item and the viewer say: "Open in Claude Code". */
export const OPEN_IN_AGENT_NAMES: Readonly<Record<OpenableAgent, string>> = {
  claude: "Claude Code",
  cursor: "Cursor",
};

export const CLAUDE_CODE_EXTENSION = "anthropic.claude-code";

export interface OpenInAgentContext {
  /** The agent built into this editor (editorAgent): only Cursor opens Cursor's chats. */
  editor: AgentId;
  /** Claude Code is installed in this editor. */
  claudeCode: boolean;
  /** This window's folders. */
  folders: string[];
  caseInsensitive: boolean;
}

/**
 * Where this window can open the conversation's own chat, or null.
 *
 * Only this window's own conversations: Claude Code looks for a session in
 * the open folders' project directories only (not a subfolder's, not another
 * project's), and a Cursor chat opened from another folder would run its
 * tools in this one. An archived conversation's file has left its project
 * directory, so Claude Code cannot find it either.
 */
export function openInAgentTarget(meta: Pick<ConversationMeta, "source" | "projectFolder" | "cwd" | "archived">, ctx: OpenInAgentContext): OpenableAgent | null {
  if (meta.archived || ctx.folders.length === 0) return null;
  const same = (a: string, b: string) => (ctx.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (meta.source === "claude") {
    return ctx.claudeCode && ctx.folders.some((f) => same(encodeProjectFolder(f), meta.projectFolder)) ? "claude" : null;
  }
  if (meta.source === "cursor") {
    if (ctx.editor !== "cursor" || !meta.cwd) return null;
    const norm = (p: string) => p.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
    const cwd = norm(meta.cwd);
    return ctx.folders.some((f) => same(norm(f), cwd)) ? "cursor" : null;
  }
  return null;
}

/** The command, and its arguments, that opens the conversation `id` in the agent's chat. */
export function openInAgentCommand(agent: OpenableAgent, id: string): [string, ...unknown[]] {
  return agent === "claude"
    ? ["claude-vscode.editor.open", id, undefined, undefined, undefined, true]
    : ["composer.openComposer", id, { view: "editor", openInNewTab: true }];
}
