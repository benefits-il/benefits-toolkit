import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BENEFITS_LOGO_SVG,
  BENEFITS_TAGLINE,
  BENEFITS_URL,
  brandBarHtml,
} from "../../src/shared/brand-bar";

test("the logo is the embedded Benefits SVG, not the build placeholder", () => {
  assert.ok(BENEFITS_LOGO_SVG.startsWith("<svg"));
  assert.ok(BENEFITS_LOGO_SVG.includes('fill="#047857"'));
  assert.ok(!BENEFITS_LOGO_SVG.includes("__BENEFITS_LOGO_SVG__"));
});

test("both variants carry the tagline, the logo and the course link", () => {
  const [lead, tail] = BENEFITS_TAGLINE.split(" · ");
  for (const variant of ["panel", "viewer"] as const) {
    const html = brandBarHtml(variant);
    assert.ok(html.includes(`benefits-bar--${variant}`));
    assert.ok(html.includes(`${lead} <b class="benefits-dot">·</b> ${tail}`));
    assert.ok(html.includes(BENEFITS_LOGO_SVG));
    assert.ok(html.includes(`href="${BENEFITS_URL}"`));
  }
});

test("the tagline joins its halves with a middle dot, not a dash", () => {
  assert.equal(BENEFITS_TAGLINE.split(" · ").length, 2);
  assert.ok(!BENEFITS_TAGLINE.includes("—"));
});

test("the brand markup has no template-literal hazards for the viewer TEMPLATE", () => {
  const html = brandBarHtml("viewer");
  assert.ok(!html.includes("`"));
  assert.ok(!html.includes("${"));
  assert.ok(!html.includes("{{"));
});
