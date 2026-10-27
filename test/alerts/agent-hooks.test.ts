import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANTIGRAVITY_HOOK_NAME,
  buildAntigravityCommand,
  hasAntigravityHook,
  hasCursorHook,
  withAntigravityHook,
  withCursorHook,
  withoutAntigravityHook,
  withoutCursorHook,
} from "../../src/features/alerts/services/agent-hooks";
import { buildDispatchCommand, isDispatchCommand } from "../../src/features/alerts/services/hook-command";

const BIN = "C:\\Users\\ben\\.benefits-toolkit\\bin";
const CURSOR = buildDispatchCommand(BIN, "cursor", "done", "win32");
const AGY_HOOKS = "C:\\Users\\ben\\.gemini\\config";
const AGY = buildAntigravityCommand(BIN, AGY_HOOKS, "win32");

test("Cursor: our stop hook joins the user's own and keeps the rest of the file", () => {
  const user = { version: 1, hooks: { stop: [{ command: "./mine.sh" }], afterFileEdit: [{ command: "./fmt.sh" }] }, extra: true };
  const next = withCursorHook(user, CURSOR);
  assert.deepEqual(next, {
    version: 1,
    hooks: { stop: [{ command: "./mine.sh" }, { command: CURSOR }], afterFileEdit: [{ command: "./fmt.sh" }] },
    extra: true,
  });
  assert.ok(hasCursorHook(next, CURSOR));
  assert.deepEqual(withCursorHook(next, CURSOR), next, "adding twice changes nothing");
});

test("Cursor: a new file gets version 1; an old command is replaced, not doubled", () => {
  const fresh = withCursorHook({}, CURSOR);
  assert.deepEqual(fresh, { version: 1, hooks: { stop: [{ command: CURSOR }] } });
  const old = { version: 1, hooks: { stop: [{ command: buildDispatchCommand("D:\\old\\.benefits-toolkit\\bin", "cursor", "done", "win32") }] } };
  assert.ok(!hasCursorHook(old, CURSOR));
  assert.deepEqual(withCursorHook(old, CURSOR), fresh);
});

test("Cursor: removing takes out only ours, and leaves an event the user left empty", () => {
  const file = { version: 1, hooks: { stop: [{ command: "./mine.sh" }, { command: CURSOR }], beforeShellExecution: [] } };
  assert.deepEqual(withoutCursorHook(file), { version: 1, hooks: { stop: [{ command: "./mine.sh" }], beforeShellExecution: [] } });
  assert.deepEqual(withoutCursorHook({ version: 1, hooks: { stop: [{ command: CURSOR }] } }), { version: 1, hooks: {} });
});

test("Antigravity: our entry sits under its own name, beside the user's", () => {
  const user = { "my-hooks": { Stop: [{ type: "command", command: "echo hi", timeout: 5 }] } };
  const next = withAntigravityHook(user, AGY);
  assert.deepEqual(next["my-hooks"], user["my-hooks"]);
  assert.ok(hasAntigravityHook(next, AGY));
  assert.deepEqual(withAntigravityHook(next, AGY), next, "adding twice changes nothing");
  assert.deepEqual(withoutAntigravityHook(next), user);
  assert.ok(!hasAntigravityHook({ [ANTIGRAVITY_HOOK_NAME]: { Stop: [{ type: "command", command: "other" }] } }, AGY));
});

test("the agents' hook commands run the dispatcher as that agent", () => {
  assert.ok(CURSOR.endsWith("dispatch.ps1\" cursor done"), CURSOR);
  assert.ok(AGY.endsWith("dispatch.ps1 antigravity done"), AGY);
  assert.ok(!CURSOR.includes("$") && !AGY.includes("$"));
});

test("Antigravity on Windows: the dispatcher path carries no quotes, which Antigravity would escape", () => {
  assert.equal(AGY, `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ${BIN}\\dispatch.ps1 antigravity done`);
  // A home folder with a space: relative to the hooks folder, where Antigravity runs its hooks.
  const spaced = buildAntigravityCommand("C:\\Users\\Ben Akiva\\.benefits-toolkit\\bin", "C:\\Users\\Ben Akiva\\.gemini\\config", "win32");
  assert.equal(spaced, "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ..\\..\\.benefits-toolkit\\bin\\dispatch.ps1 antigravity done");
  for (const cmd of [AGY, spaced]) assert.ok(!cmd.includes('"') && isDispatchCommand(cmd), cmd);
  // A Hebrew user name needs no quoting either.
  const hebrew = "C:\\Users\\\u05D1\u05DF\\.benefits-toolkit\\bin";
  assert.ok(buildAntigravityCommand(hebrew, "C:\\Users\\\u05D1\u05DF\\.gemini\\config", "win32").includes(`-File ${hebrew}\\dispatch.ps1 `));
  // The old, quoted command is replaced by the healer.
  const quoted = withAntigravityHook({}, buildDispatchCommand(BIN, "antigravity", "done", "win32"));
  assert.ok(!hasAntigravityHook(quoted, AGY));
  assert.ok(hasAntigravityHook(withAntigravityHook(quoted, AGY), AGY));
});

test("Antigravity on macOS keeps the shell-quoted command", () => {
  assert.equal(
    buildAntigravityCommand("/Users/ben/.benefits-toolkit/bin", "/Users/ben/.gemini/config", "darwin"),
    buildDispatchCommand("/Users/ben/.benefits-toolkit/bin", "antigravity", "done", "darwin"),
  );
});
