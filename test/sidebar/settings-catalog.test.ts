import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkSetting, SETTINGS_PAGES, WRITABLE_SETTINGS } from "../../src/features/sidebar/settings-catalog";

interface SettingSchema {
  type?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as {
  contributes: { configuration: { properties: Record<string, SettingSchema> } };
};
const settings = manifest.contributes.configuration.properties;
/** Set through the extension's own sound picker, not written by the page. */
// Not written through data-set: the sounds go through the sound list, which the
// extension checks; the Claude Code folder override stays in settings.json only.
const PICKED = ["sounds.stopSound", "sounds.notificationSound", "rtl.claudeCodePathOverride"];

test("every feature's on/off setting is a page's main switch", () => {
  const enabledKeys = Object.keys(settings).filter((k) => k.endsWith(".enabled")).map((k) => k.slice("benefit.".length));
  const switches = new Set(SETTINGS_PAGES.map((p) => p.switchKey).filter(Boolean));
  for (const key of enabledKeys) assert.ok(switches.has(key), `${key} has no switch in Settings`);
});

test("every main switch is a declared boolean that defaults to on", () => {
  for (const p of SETTINGS_PAGES) {
    if (!p.switchKey) continue;
    const schema = settings[`benefit.${p.switchKey}`];
    assert.ok(schema, `benefit.${p.switchKey} is not declared`);
    assert.equal(schema.type, "boolean");
    assert.equal(schema.default, true);
  }
});

test("every setting has a home in the sidebar", () => {
  for (const full of Object.keys(settings)) {
    const key = full.slice("benefit.".length);
    assert.ok(key in WRITABLE_SETTINGS || PICKED.includes(key), `${key} cannot be changed from the sidebar`);
  }
});

test("what the page may write matches the declared settings", () => {
  for (const [key, spec] of Object.entries(WRITABLE_SETTINGS)) {
    const schema = settings[`benefit.${key}`];
    assert.ok(schema, `benefit.${key} is not declared`);
    if (spec.kind === "boolean") assert.equal(schema.type, "boolean", key);
    if (spec.kind === "string") assert.equal(schema.type, "string", key);
    if (spec.kind === "number") {
      assert.equal(schema.type, "number", key);
      assert.equal(schema.minimum, spec.min, key);
      assert.equal(schema.maximum, spec.max, key);
    }
    if (spec.kind === "enum") for (const v of spec.values) assert.ok(schema.enum?.includes(v), `${key} does not allow ${v}`);
  }
});

test("checkSetting refuses keys and values the page may not send", () => {
  assert.equal(checkSetting("workbench.colorTheme", "Dark"), undefined);
  assert.equal(checkSetting("__proto__", true), undefined);
  assert.equal(checkSetting("chats.enabled", "true"), undefined);
  assert.equal(checkSetting("chats.scope", "everything"), undefined);
  assert.equal(checkSetting("rtl.mode", "off"), undefined, "off is the main switch, not a mode");
  assert.equal(checkSetting("popup.seconds", "soon"), undefined);
});

test("checkSetting tidies values it accepts", () => {
  assert.equal(checkSetting("chats.enabled", false), false);
  assert.equal(checkSetting("appearance.theme", "dark"), "dark");
  assert.equal(checkSetting("popup.seconds", 600), 60);
  assert.equal(checkSetting("popup.seconds", "2"), 3);
  assert.equal(checkSetting("popup.seconds", 7.6), 8);
  assert.equal(checkSetting("htmlOpen.browserPath", "  C:\\chrome.exe\n "), "C:\\chrome.exe");
  assert.equal(checkSetting("rtl.textFont", "x".repeat(400))?.toString().length, 200);
});
