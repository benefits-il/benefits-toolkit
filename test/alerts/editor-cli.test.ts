import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { findEditorCli } from "../../src/features/alerts/services/editor-cli";

/** A fake file system: folder -> entries, keyed by normalized path. */
function fakeFs(tree: Record<string, string[]>, p: typeof path.win32 | typeof path.posix) {
  const normalized = new Map(Object.entries(tree).map(([k, v]) => [p.normalize(k), v]));
  return (dir: string) => normalized.get(p.normalize(dir));
}

test("VS Code on Windows: <install>/bin/code.cmd, above the commit folder", () => {
  const install = "C:\\Programs\\Microsoft VS Code";
  const list = fakeFs({ [`${install}\\bin`]: ["code", "code-tunnel.exe", "code.cmd", "copilot-shim"] }, path.win32);
  assert.equal(
    findEditorCli(`${install}\\e646868227\\resources\\app`, "win32", list),
    `${install}\\bin\\code.cmd`,
  );
});

test("Cursor on Windows: resources/app/bin/cursor.cmd", () => {
  const appRoot = "C:\\Programs\\cursor\\resources\\app";
  const list = fakeFs({ [`${appRoot}\\bin`]: ["code-tunnel.exe", "cursor", "cursor-tunnel.exe", "cursor.cmd"] }, path.win32);
  assert.equal(findEditorCli(appRoot, "win32", list), `${appRoot}\\bin\\cursor.cmd`);
});

test("Antigravity on Windows: <install>/bin/antigravity.cmd", () => {
  const list = fakeFs({ "C:\\Programs\\Antigravity\\bin": ["antigravity", "antigravity.cmd"] }, path.win32);
  assert.equal(
    findEditorCli("C:\\Programs\\Antigravity\\resources\\app", "win32", list),
    "C:\\Programs\\Antigravity\\bin\\antigravity.cmd",
  );
});

test("VS Code on macOS: the app bundle's bin/code script", () => {
  const appRoot = "/Applications/Visual Studio Code.app/Contents/Resources/app";
  const list = fakeFs({ [`${appRoot}/bin`]: ["code", "code-tunnel"] }, path.posix);
  assert.equal(findEditorCli(appRoot, "darwin", list), `${appRoot}/bin/code`);
});

test("no launcher anywhere gives undefined", () => {
  assert.equal(findEditorCli("C:\\x\\resources\\app", "win32", () => undefined), undefined);
  const onlyTunnel = fakeFs({ "C:\\x\\resources\\app\\bin": ["code-tunnel.exe"] }, path.win32);
  assert.equal(findEditorCli("C:\\x\\resources\\app", "win32", onlyTunnel), undefined);
});
