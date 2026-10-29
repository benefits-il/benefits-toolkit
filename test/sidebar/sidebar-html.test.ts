import assert from "node:assert/strict";
import { test } from "node:test";
import { BENEFITS_LOGO_SVG, BENEFITS_SLOGAN_HTML, BENEFITS_TAGLINE_HTML } from "../../src/shared/brand-bar";
import { SETTINGS_PAGES, WRITABLE_SETTINGS } from "../../src/features/sidebar/settings-catalog";
import { sidebarHtml } from "../../src/features/sidebar/sidebar-html";
import { PRESET_PALETTE } from "../../src/features/window-color/services/color-utils";

const fonts = { rubikLatin: "r-l.woff2", rubikHebrew: "r-h.woff2", varelaLatin: "v-l.woff2", varelaHebrew: "v-h.woff2" };
const html = sidebarHtml(fonts, "dark");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test("every element the script looks up by id exists in the markup", () => {
  for (const m of html.matchAll(/(?<!\$)\$\('([\w-]+)'\)/g)) assert.ok(ids.has(m[1]), `the script uses #${m[1]}, which the markup lacks`);
  // The per-page ids the script builds from the page list.
  for (const p of SETTINGS_PAGES.filter((x) => x.switchKey)) {
    for (const prefix of ["fs-", "off-", "chip-"]) assert.ok(ids.has(prefix + p.id), `no #${prefix}${p.id}`);
  }
});

test("every control names a setting the page may write, and every such setting has a control", () => {
  const named = new Set([...html.matchAll(/data-set(?:-value)?="([\w.]+)"/g)].map((m) => m[1]));
  for (const key of named) assert.ok(key in WRITABLE_SETTINGS, `a control writes ${key}, which is not allowed`);
  for (const key of Object.keys(WRITABLE_SETTINGS)) assert.ok(named.has(key), `${key} has no control`);
});

test("Settings lists every page, and every page has its markup", () => {
  for (const p of SETTINGS_PAGES) {
    assert.ok(html.includes(`data-open-page="${p.id}"`), `${p.id} is not on the home list`);
    assert.ok(html.includes(`data-page="${p.id}"`), `${p.id} has no page`);
  }
});

test("Window colors offers every preset as a named radio", () => {
  for (const p of PRESET_PALETTE) assert.ok(html.includes(`data-hex="${p.hex}"`), `${p.name} is missing`);
  assert.equal([...html.matchAll(/class="swatch"/g)].length, PRESET_PALETTE.length);
});

test("the page carries the theme and loads the bundled fonts, no remote ones", () => {
  assert.ok(html.includes('<html lang="en" data-theme="dark">'));
  assert.ok(sidebarHtml(fonts, "light").includes('data-theme="light"'));
  for (const url of Object.values(fonts)) assert.ok(html.includes(`url('${url}')`), `missing ${url}`);
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html));
  assert.ok(!sidebarHtml(null, "dark").includes("@font-face"));
});

test("every theme has its tokens, high contrast included", () => {
  for (const theme of ["light", "hc-dark", "hc-light"]) assert.ok(html.includes(`:root[data-theme="${theme}"]`), `no ${theme} tokens`);
});

test("Benefits sits at the foot: the real logo, the slogan and the tagline", () => {
  const brand = html.slice(html.indexOf('<div class="brand"'));
  assert.ok(brand.includes(BENEFITS_LOGO_SVG));
  assert.ok(brand.includes(`<small>${BENEFITS_SLOGAN_HTML}</small>`));
  assert.ok(brand.includes(`<p>${BENEFITS_TAGLINE_HTML}</p>`));
  // The fold button sits beside the link, not inside it, and folding is a setting the page may write.
  assert.ok(/<\/a>\s*<button class="fold" type="button" id="brand-fold"/.test(brand));
  assert.ok(html.includes("appearance.brandFolded"));
});

test("the theme is chosen on the Appearance page; the header has no theme button", () => {
  assert.ok(!html.includes('id="theme-btn"'));
  assert.ok(html.includes('data-set-value="appearance.theme"'));
});

test("the Popup page picks the screen corner", () => {
  assert.ok(html.includes('data-set-value="popup.position" data-value="topRight"'));
  assert.ok(html.includes('data-set-value="popup.position" data-value="bottomRight"'));
});

test("the Popup page sends a dragged popup back to the corner and shows the pill a staying popup becomes", () => {
  assert.ok(html.includes('id="popup-corner"') && html.includes(">Back to corner<"));
  assert.ok(html.includes("type: 'popupToCorner'"));
  assert.ok(html.includes("state.popupPlaced"));
  assert.ok(html.includes('id="pv-pill"'));
  // The seconds stay: with Stay until clicked they are the full-size time.
  assert.ok(html.includes("Full size for (seconds)"));
});

test("no em or en dashes in what the page says", () => {
  const text = html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<style>[\s\S]*?<\/style>/, "");
  assert.ok(!/[–—]/.test(text));
});
