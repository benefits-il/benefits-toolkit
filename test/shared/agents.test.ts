import assert from "node:assert/strict";
import { test } from "node:test";
import { editorAgent } from "../../src/shared/agents";
import { sidebarHtml } from "../../src/features/sidebar/sidebar-html";
import { NEW_CHAT_COMMANDS, newChatAgent } from "../../src/features/chats/services/new-chat";

test("each editor's own agent comes from its URL scheme", () => {
  assert.equal(editorAgent("cursor"), "cursor");
  assert.equal(editorAgent("antigravity"), "antigravity");
  assert.equal(editorAgent("antigravity-ide"), "antigravity");
  assert.equal(editorAgent("vscode"), "claude");
  assert.equal(editorAgent("vscode-insiders"), "claude");
});

test("New chat goes to the editor's own agent, or to Claude Code when chosen", () => {
  assert.equal(newChatAgent("cursor", "editor"), "cursor");
  assert.equal(newChatAgent("cursor", "claudeCode"), "claude");
  assert.equal(newChatAgent("claude", "editor"), "claude");
  assert.equal(NEW_CHAT_COMMANDS.antigravity, "antigravity.startNewConversation");
});

test("the header has New chat with the editor's mark; only Cursor shows Cursor's own-alert row", () => {
  const vscodeHtml = sidebarHtml(null, "dark");
  const cursorHtml = sidebarHtml(null, "dark", "cursor");
  assert.ok(/id="new-chat" hidden><i class="mark mark-claude"/.test(vscodeHtml));
  assert.ok(/id="new-chat" hidden><i class="mark mark-cursor"/.test(cursorHtml));
  assert.ok(cursorHtml.includes('<div class="own-row"><label'), "Cursor's row is shown in Cursor");
  assert.ok(vscodeHtml.includes('<div class="own-row" hidden><label'), "and hidden elsewhere");
  // The button sits inside the row block, before the row's line.
  assert.ok(/data-set="agents.cursorOwnAlertsOff" \/><\/label><div class="btn-row"><button class="btn" type="button" id="open-cursor-settings">/.test(cursorHtml));
});

test("the popup preview shows the editor's agent", () => {
  assert.ok(sidebarHtml(null, "dark").includes("<small>Claude finished</small>"));
  const cursor = sidebarHtml(null, "dark", "cursor");
  assert.ok(cursor.includes('id="pv-tile"><i class="mark mark-cursor"'));
  assert.ok(cursor.includes("<small>Cursor finished</small>"));
});
