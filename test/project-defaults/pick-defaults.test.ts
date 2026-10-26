import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOR_ORDER, pickFreeColor, pickFreeSound } from "../../src/features/project-defaults/pick-defaults";
import { PRESET_PALETTE } from "../../src/features/window-color/services/color-utils";

test("new projects take every preset once, the vivid row first", () => {
  assert.equal(COLOR_ORDER.length, PRESET_PALETTE.length);
  assert.equal(new Set(COLOR_ORDER).size, PRESET_PALETTE.length);
  assert.equal(pickFreeColor([]), PRESET_PALETTE.find((p) => p.group === "mid")!.hex);
});

test("a color another project has is skipped, whatever its case", () => {
  const first = COLOR_ORDER[0];
  assert.equal(pickFreeColor([first.toUpperCase(), null, undefined]), COLOR_ORDER[1]);
  assert.equal(pickFreeColor(COLOR_ORDER), undefined);
});

test("a sound nobody uses comes first; when all are taken, the least used", () => {
  const pool = ["a.wav", "b.wav", "c.wav"];
  assert.equal(pickFreeSound(pool, ["a.wav", undefined]), "b.wav");
  assert.equal(pickFreeSound(pool, ["a.wav", "b.wav", "c.wav", "a.wav", "c.wav"]), "b.wav");
  assert.equal(pickFreeSound([], []), undefined);
});
