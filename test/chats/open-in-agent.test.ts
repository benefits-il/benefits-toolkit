import assert from "node:assert/strict";
import { test } from "node:test";
import { openInAgentCommand, openInAgentTarget, OpenInAgentContext } from "../../src/features/chats/services/open-in-agent";

const here: OpenInAgentContext = { editor: "claude", claudeCode: true, folders: ["c:\\work\\repo"], caseInsensitive: true };
const claude = (projectFolder: string, extra: { archived?: boolean } = {}) => ({ source: "claude" as const, projectFolder, cwd: undefined, archived: false, ...extra });
const cursor = (cwd: string | undefined) => ({ source: "cursor" as const, projectFolder: "x", cwd, archived: false });

test("a Claude Code conversation opens in Claude Code only from its own folder's window", () => {
  assert.equal(openInAgentTarget(claude("C--work-repo"), here), "claude", "the encoded folder, any case");
  assert.equal(openInAgentTarget(claude("c--work-repo-packages-web"), here), null, "a subfolder's session is not found by Claude Code");
  assert.equal(openInAgentTarget(claude("c--work"), here), null, "nor a parent's");
  assert.equal(openInAgentTarget(claude("d--elsewhere"), here), null, "nor another project's");
  assert.equal(openInAgentTarget(claude("c--work-repo", { archived: true }), here), null, "an archived file left the project folder");
  assert.equal(openInAgentTarget(claude("c--work-repo"), { ...here, claudeCode: false }), null, "no Claude Code, no button");
  assert.equal(openInAgentTarget(claude("c--work-repo"), { ...here, folders: [] }), null, "no folder open");
  assert.equal(openInAgentTarget(claude("C--work-repo"), { ...here, caseInsensitive: false }), null, "case counts off Windows");
});

test("a Cursor conversation opens only inside Cursor, from its own folder's window", () => {
  const inCursor = { ...here, editor: "cursor" as const };
  assert.equal(openInAgentTarget(cursor("C:\\Work\\Repo\\"), inCursor), "cursor");
  assert.equal(openInAgentTarget(cursor("c:/work/repo"), inCursor), "cursor", "either slash");
  assert.equal(openInAgentTarget(cursor("c:\\work\\repo\\sub"), inCursor), null, "another folder");
  assert.equal(openInAgentTarget(cursor(undefined), inCursor), null, "a folder Cursor's slug did not resolve");
  assert.equal(openInAgentTarget(cursor("c:\\work\\repo"), here), null, "not in VS Code");
  assert.equal(openInAgentTarget(cursor("c:\\work\\repo"), { ...here, editor: "antigravity" }), null, "not in Antigravity");
});

test("Antigravity's conversations never get a button", () => {
  const meta = { source: "antigravity" as const, projectFolder: "c--work-repo", cwd: "c:\\work\\repo", archived: false };
  assert.equal(openInAgentTarget(meta, { ...here, editor: "antigravity" }), null);
});

test("the commands: Claude Code as a full editor tab, Cursor in a new editor tab", () => {
  assert.deepEqual(openInAgentCommand("claude", "abc"), ["claude-vscode.editor.open", "abc", undefined, undefined, undefined, true]);
  assert.deepEqual(openInAgentCommand("cursor", "abc"), ["composer.openComposer", "abc", { view: "editor", openInNewTab: true }]);
});
