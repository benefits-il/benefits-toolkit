import assert from "node:assert/strict";
import { test } from "node:test";
import { isThemePreference, resolveTheme } from "../../src/shared/theme-resolve";

test("auto follows the editor; light and dark override it", () => {
  assert.equal(resolveTheme("auto", "dark"), "dark");
  assert.equal(resolveTheme("auto", "light"), "light");
  assert.equal(resolveTheme("light", "dark"), "light");
  assert.equal(resolveTheme("dark", "light"), "dark");
});

test("high contrast in the editor always wins", () => {
  assert.equal(resolveTheme("light", "hc-dark"), "hc-dark");
  assert.equal(resolveTheme("dark", "hc-light"), "hc-light");
});

test("only the three preferences are accepted", () => {
  assert.ok(isThemePreference("auto"));
  assert.ok(!isThemePreference("hc-dark"));
  assert.ok(!isThemePreference(undefined));
});
