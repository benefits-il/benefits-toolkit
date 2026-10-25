import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDispatchCommand,
  HOOK_MARKER,
  isDispatchCommand,
  isLegacyCommand,
  isManagedCommand,
} from "../../src/features/alerts/services/hook-command";

const WIN_BIN = "C:\\Users\\ben\\.benefits-toolkit\\bin";
const MAC_BIN = "/Users/ben/.benefits-toolkit/bin";

test("the Windows command contains no $ (Git Bash would expand it)", () => {
  for (const kind of ["done", "waiting"] as const) {
    const cmd = buildDispatchCommand(WIN_BIN, "claude", kind, "win32");
    assert.ok(!cmd.includes("$"), cmd);
    assert.ok(cmd.includes(`-File "${WIN_BIN}\\dispatch.ps1" claude ${kind}`), cmd);
  }
});

test("the macOS command runs the JXA dispatcher, shell-quoted", () => {
  const cmd = buildDispatchCommand("/Users/o'brien/.benefits-toolkit/bin", "claude", "done", "darwin");
  assert.equal(cmd, `osascript -l JavaScript '/Users/o'\\''brien/.benefits-toolkit/bin/dispatch.js' claude done`);
});

test("new commands carry no legacy marker, so an older toolkit leaves them alone", () => {
  for (const platform of ["win32", "darwin", "linux"] as const) {
    const bin = platform === "win32" ? WIN_BIN : MAC_BIN;
    const cmd = buildDispatchCommand(bin, "claude", "done", platform);
    assert.ok(!cmd.includes(HOOK_MARKER), cmd);
    assert.ok(!isLegacyCommand(cmd), cmd);
    assert.ok(isDispatchCommand(cmd), cmd);
    assert.ok(isManagedCommand(cmd), cmd);
  }
});

test("pre-0.7 commands are recognized as legacy and managed", () => {
  const legacy = [
    'powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\\Users\\ben\\.claude\\sounds\\benefit\\play.ps1" "C:\\Users\\ben\\.claude\\sounds\\benefit\\stop.wav"',
    `afplay '/Users/ben/.claude/sounds/benefit/stop.wav' # ${HOOK_MARKER}`,
    `(paplay '/home/ben/.claude/sounds/benefit/notify.wav' || aplay -q '/home/ben/.claude/sounds/benefit/notify.wav') # ${HOOK_MARKER}`,
  ];
  for (const cmd of legacy) {
    assert.ok(isLegacyCommand(cmd), cmd);
    assert.ok(isManagedCommand(cmd), cmd);
    assert.ok(!isDispatchCommand(cmd), cmd);
  }
});

test("other tools' hooks are never treated as ours", () => {
  for (const cmd of ["node ~/.claude/plugins/agent-ping/cli.js done", "echo hi", ""]) {
    assert.ok(!isManagedCommand(cmd), cmd);
  }
});
