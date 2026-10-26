import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCustomizations,
  contrastRatio,
  DARK_FOREGROUND,
  foregroundFor,
  LIGHT_FOREGROUND,
  MANAGED_KEYS,
  normalizeHex,
  PRESET_PALETTE,
} from "../../src/features/window-color/services/color-utils";

test("normalizeHex accepts 6-digit, 3-digit, with/without #, mixed case", () => {
  assert.equal(normalizeHex("#FCB700"), "#fcb700");
  assert.equal(normalizeHex("3c0366"), "#3c0366");
  assert.equal(normalizeHex(" #abc "), "#aabbcc");
  assert.equal(normalizeHex("f00"), "#ff0000");
});

test("normalizeHex rejects invalid input", () => {
  assert.equal(normalizeHex(""), undefined);
  assert.equal(normalizeHex("#12345"), undefined);
  assert.equal(normalizeHex("red"), undefined);
  assert.equal(normalizeHex("#gggggg"), undefined);
});

test("foregroundFor picks white on dark and dark on light backgrounds", () => {
  assert.equal(foregroundFor("#3c0366"), LIGHT_FOREGROUND);
  assert.equal(foregroundFor("#2e6fb0"), LIGHT_FOREGROUND);
  assert.equal(foregroundFor("#fcb700"), DARK_FOREGROUND);
  assert.equal(foregroundFor("#ffffff"), DARK_FOREGROUND);
  assert.equal(foregroundFor("#000000"), LIGHT_FOREGROUND);
});

test("the text color is always the one with more contrast (pastels no longer get white at 2:1)", () => {
  for (const hex of [...PRESET_PALETTE.map((p) => p.hex), "#38bdf8", "#fb7185", "#a78bfa", "#ec4899", "#1f8a8a"]) {
    const fg = foregroundFor(hex);
    const other = fg === LIGHT_FOREGROUND ? DARK_FOREGROUND : LIGHT_FOREGROUND;
    assert.ok(contrastRatio(hex, fg) >= contrastRatio(hex, other), `${hex} got the weaker text color`);
  }
  assert.equal(foregroundFor("#38bdf8"), DARK_FOREGROUND, "sky");
  assert.equal(foregroundFor("#fb7185"), DARK_FOREGROUND, "coral");
});

test("buildCustomizations sets exactly the managed keys", () => {
  const custom = buildCustomizations("#c24a4a");
  assert.deepEqual(Object.keys(custom).sort(), [...MANAGED_KEYS].sort());
  assert.equal(custom["titleBar.activeBackground"], "#c24a4a");
  assert.equal(custom["titleBar.inactiveBackground"], "#c24a4a");
  assert.equal(custom["titleBar.inactiveForeground"], `${custom["titleBar.activeForeground"]}99`);
  assert.equal(custom["activityBar.inactiveForeground"], `${custom["activityBar.foreground"]}66`);
});

test("the palette: 38 distinct, normalized presets; the original ten kept as Mid", () => {
  assert.equal(PRESET_PALETTE.length, 38);
  for (const preset of PRESET_PALETTE) assert.equal(normalizeHex(preset.hex), preset.hex, preset.name);
  assert.equal(new Set(PRESET_PALETTE.map((p) => p.hex)).size, 38);
  assert.equal(new Set(PRESET_PALETTE.map((p) => p.name)).size, 38);
  const mid = PRESET_PALETTE.filter((p) => p.group === "mid").map((p) => p.hex);
  assert.deepEqual(mid, ["#c24a4a", "#c9772b", "#b8860b", "#3e8c50", "#1f8a8a", "#2e6fb0", "#4b5aa7", "#7c4da0", "#b04a8c", "#55616e"]);
});
