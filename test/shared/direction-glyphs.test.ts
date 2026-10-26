import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { glyphMarkup, LETTER_B, LETTER_BET } from "../../src/shared/direction-glyphs";

const root = path.join(__dirname, "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

test("the B is the same outline as the activity bar mark", () => {
  const mark = [...read("media/activity-icon.svg").matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.deepEqual([...LETTER_B.paths], mark);
});

test("the bet draws inside the 24 box, with no transform", () => {
  assert.equal(LETTER_BET.transform, undefined);
  const numbers = LETTER_BET.paths.join(" ").match(/-?\d+(\.\d+)?/g)!.map(Number);
  assert.ok(numbers.every((n) => n >= 0 && n <= 24));
  assert.ok(!glyphMarkup(LETTER_BET).includes("<g"));
  assert.ok(glyphMarkup(LETTER_B).startsWith(`<g transform="${LETTER_B.transform}">`));
});

test("the shim takes the glyphs as data and still compiles once they are in", () => {
  const shim = read("src/features/rtl/assets/rtl-shim.js");
  assert.ok(shim.includes("var GLYPHS = __BENEFIT_RTL_GLYPHS__;"));
  assert.ok(!shim.includes("innerHTML"), "the switch is built node by node");
  const filled = shim.replace(/__BENEFIT_RTL_GLYPHS__/g, () => JSON.stringify({ b: LETTER_B, bet: LETTER_BET }));
  assert.doesNotThrow(() => new Function(filled));
});
