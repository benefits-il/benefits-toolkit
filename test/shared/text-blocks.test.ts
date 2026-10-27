import assert from "node:assert/strict";
import { test } from "node:test";
import { isHebrewTextBlock } from "../../src/shared/text-blocks";

const PROMPT = "אתה עוזר הוראה בקורס Benefits. כתוב מערך שיעור לשיעור 4, באורך 90 דקות, לקבוצה שכבר מכירה את Claude ואת ChatGPT.";

test("a Hebrew prompt in a code block is text, with or without a text tag", () => {
  assert.equal(isHebrewTextBlock(PROMPT, ""), true);
  assert.equal(isHebrewTextBlock(PROMPT, "text"), true);
  assert.equal(isHebrewTextBlock(PROMPT, "Markdown"), true);
});

test("code that only carries a Hebrew string stays code", () => {
  const code = 'export const label = "שלום";\nexport function greet(name: string): string {\n  return `${label} ${name}`;\n}';
  assert.equal(isHebrewTextBlock(code, "ts"), false);
  assert.equal(isHebrewTextBlock(code, ""), false);
});

test("a block without Hebrew is never text", () => {
  assert.equal(isHebrewTextBlock("npm run build", ""), false);
  assert.equal(isHebrewTextBlock("", "text"), false);
});

test("a code tag needs a mostly Hebrew block", () => {
  const mixed = "שלום עולם, זה טקסט ארוך בעברית with some English words in it";
  assert.equal(isHebrewTextBlock(mixed, "text"), true);
  assert.equal(isHebrewTextBlock(mixed, "python"), false);
  assert.equal(isHebrewTextBlock(PROMPT, "python"), true);
});
