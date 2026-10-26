import assert from "node:assert/strict";
import { test } from "node:test";
import { BENEFITS_LOGO_SVG, BENEFITS_SLOGAN, BENEFITS_TAGLINE, BENEFITS_TAGLINE_HTML } from "../../src/shared/brand-bar";

test("the logo is the embedded Benefits SVG, not the build placeholder", () => {
  assert.ok(BENEFITS_LOGO_SVG.startsWith("<svg"));
  assert.ok(BENEFITS_LOGO_SVG.includes('fill="#047857"'));
  assert.ok(!BENEFITS_LOGO_SVG.includes("__BENEFITS_LOGO_SVG__"));
});

test("the slogan and the tagline are verbatim and in English, joined by middle dots, not dashes", () => {
  assert.equal(BENEFITS_SLOGAN, "AI that finally fits · Ben Akiva");
  assert.equal(BENEFITS_TAGLINE, "This tool is part of Benefits · the course that teaches you to work right with AI");
  for (const s of [BENEFITS_SLOGAN, BENEFITS_TAGLINE]) {
    assert.ok(!/[—–]/.test(s));
    assert.ok(!/[\u0590-\u05FF]/.test(s), "no Hebrew in the banner");
  }
});

test("the tagline markup makes the middle dot bold", () => {
  const [lead, tail] = BENEFITS_TAGLINE.split(" · ");
  assert.equal(BENEFITS_TAGLINE_HTML, `${lead} <b class="benefits-dot">·</b> ${tail}`);
});
