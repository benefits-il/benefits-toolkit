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

test("one popup process shows every card: the first becomes the host, later ones hand their job over", () => {
  const ps = readFileSync(join(scripts, "win", "popup.ps1"), "utf8");
  assert.ok(ps.includes("Local\\BenefitToolkitPopupHost"), "popup.ps1 has no host mutex");
  assert.ok(/Test-Path -LiteralPath \$JobFile\)\)\s*\{\s*exit 0/.test(ps), "popup.ps1 does not exit once the host took its job");
  const js = readFileSync(join(scripts, "mac", "popup.js"), "utf8");
  assert.ok(js.includes("/popup-host'") && js.includes("kill -0"), "popup.js has no host lock with a stale check");
  assert.ok(js.includes("fileExistsAtPath(jobPath)"), "popup.js does not exit once the host took its job");
  for (const [f, s] of [["win/popup.ps1", ps], ["mac/popup.js", js]]) {
    assert.ok(s.includes("popups"), `${f} does not read the job folder`);
    assert.ok(s.includes("popup-place.json"), `${f} does not keep the dropped spot where Back to corner deletes it`);
  }
});

test("the popups merge alerts from one window, shrink staying cards to a pill and only move on a drag", () => {
  for (const f of ["win/popup.ps1", "mac/popup.js"]) {
    const s = readFileSync(join(scripts, f), "utf8");
    // Same window = same folder in the same editor.
    assert.ok(/folder[\s\S]{0,200}\|[\s\S]{0,80}cli/.test(s), `${f} does not key cards by folder and editor`);
    assert.ok(/[Pp]ill/.test(s) && /[Ss]tay/.test(s), `${f} has no pill for staying cards`);
    assert.ok(/[Dd]ropped/.test(s), `${f} has no drop`);
    // The chosen motion: the spring in from the edge, then one flash.
    assert.ok(s.includes("-18 * $s") || s.includes("-18 * s"), `${f} lacks the spring's overshoot`);
    assert.ok(s.includes("820"), `${f} lacks the flash`);
  }
  // Clicks on the Mac popup are read on mouse up now, so a drag can be told apart.
  assert.ok(readFileSync(join(scripts, "mac", "popup.js"), "utf8").includes("LEFT_MOUSE_UP"));
});

test("every agent has a popup mark", () => {
  for (const f of ["claude.png", "cursor-dark.png", "cursor-light.png", "antigravity.png"]) {
    assert.ok(readFileSync(join(scripts, "marks", f)).subarray(1, 4).toString() === "PNG", `${f} is missing or not a PNG`);
  }
});
