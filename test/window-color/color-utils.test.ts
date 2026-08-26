import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCustomizations,
  foregroundFor,
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
  assert.equal(foregroundFor("#3c0366"), "#ffffff");
  assert.equal(foregroundFor("#2e6fb0"), "#ffffff");
  assert.equal(foregroundFor("#fcb700"), "#15202b");
  assert.equal(foregroundFor("#ffffff"), "#15202b");
  assert.equal(foregroundFor("#000000"), "#ffffff");
});

test("buildCustomizations sets exactly the managed keys", () => {
  const custom = buildCustomizations("#c24a4a");
  assert.deepEqual(Object.keys(custom).sort(), [...MANAGED_KEYS].sort());
  assert.equal(custom["titleBar.activeBackground"], "#c24a4a");
  assert.equal(custom["titleBar.inactiveBackground"], "#c24a4a");
  assert.equal(custom["titleBar.inactiveForeground"], `${custom["titleBar.activeForeground"]}99`);
  assert.equal(custom["activityBar.inactiveForeground"], `${custom["activityBar.foreground"]}66`);
});

test("every preset is a normalized hex", () => {
  for (const preset of PRESET_PALETTE) {
    assert.equal(normalizeHex(preset.hex), preset.hex, preset.name);
  }
});
