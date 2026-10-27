import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const scripts = join(__dirname, "..", "..", "src", "features", "alerts", "assets", "scripts");
const files = ["win/dispatch.ps1", "win/popup.ps1", "mac/dispatch.js", "mac/popup.js", "linux/dispatch.sh"];

test("the hook and popup scripts are ASCII-only (Windows PowerShell 5.1 reads them as ANSI)", () => {
  for (const f of files) {
    const at = [...readFileSync(join(scripts, f))].findIndex((b) => b > 0x7f);
    assert.equal(at, -1, `${f} has a non-ASCII byte at ${at}`);
  }
});

test("the Mac popup avoids what breaks on Intel Macs", () => {
  const js = readFileSync(join(scripts, "mac", "popup.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!js.includes("registerSubclass"), "no ObjC subclasses (BOOL differs between Intel and Apple Silicon)");
  assert.ok(!/setAlignment\((?!ALIGN_NATURAL)/.test(js), "only the natural alignment, the one value both share");
});

test("the dispatchers pass the popup the theme, the text color and the kind", () => {
  for (const f of ["win/dispatch.ps1", "mac/dispatch.js"]) {
    const s = readFileSync(join(scripts, f), "utf8");
    for (const field of ["kind", "text", "theme"]) assert.ok(new RegExp(`\\b${field}\\s*[:=]`).test(s), `${f} lacks ${field}`);
    assert.ok(s.includes("colorText"), `${f} does not read the record's colorText`);
  }
});

test("the dispatchers tell the popup which agent finished, and stay quiet for Cursor's copy of Claude's hooks", () => {
  for (const f of ["win/dispatch.ps1", "mac/dispatch.js"]) {
    const s = readFileSync(join(scripts, f), "utf8");
    assert.ok(/\bagent\s*[:=]\s*\$?[Aa]gent\b/.test(s), `${f} does not pass the agent`);
    assert.ok(s.includes("CURSOR_TRANSCRIPT_PATH") && s.includes("cursor_version"), `${f} does not spot Cursor running Claude's hooks`);
    assert.ok(s.includes("aborted") && s.includes("fullyIdle"), `${f} alerts on stopped or unfinished turns`);
  }
});

test("the popup's corner travels from config.json to both popups, top right unless set otherwise", () => {
  for (const f of ["win/dispatch.ps1", "mac/dispatch.js"]) {
    const s = readFileSync(join(scripts, f), "utf8");
    assert.ok(/position\s*[:=]/.test(s) && s.includes("bottomRight") && s.includes("topRight"), `${f} does not pass the position`);
  }
  for (const f of ["win/popup.ps1", "mac/popup.js"]) {
    assert.ok(readFileSync(join(scripts, f), "utf8").includes("bottomRight"), `${f} ignores the position`);
  }
});

test("every agent has a popup mark", () => {
  for (const f of ["claude.png", "cursor-dark.png", "cursor-light.png", "antigravity.png"]) {
    assert.ok(readFileSync(join(scripts, "marks", f)).subarray(1, 4).toString() === "PNG", `${f} is missing or not a PNG`);
  }
});
