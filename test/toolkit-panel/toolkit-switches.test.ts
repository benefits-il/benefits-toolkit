import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { TOOLKIT_SWITCHES } from "../../src/features/toolkit-panel/toolkit-switches";

interface SettingSchema {
  type?: string;
  default?: unknown;
}

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as {
  contributes: { configuration: { properties: Record<string, SettingSchema> } };
};
const settings = manifest.contributes.configuration.properties;

test("every Toolkit switch is a declared boolean setting that defaults to on", () => {
  for (const s of TOOLKIT_SWITCHES) {
    const schema = settings[`benefit.${s.key}`];
    assert.ok(schema, `benefit.${s.key} is not declared in package.json`);
    assert.equal(schema.type, "boolean", `benefit.${s.key} is not a boolean`);
    assert.equal(schema.default, true, `benefit.${s.key} should default to true`);
  }
});

test("every feature's enabled setting has a Toolkit switch", () => {
  const enabledKeys = Object.keys(settings)
    .filter((k) => k.endsWith(".enabled"))
    .map((k) => k.slice("benefit.".length));
  const switchKeys = new Set(TOOLKIT_SWITCHES.map((s) => s.key));
  for (const key of enabledKeys) {
    assert.ok(switchKeys.has(key), `${key} has no switch in the Toolkit panel`);
  }
});

test("child switches point at a parent that comes before them", () => {
  TOOLKIT_SWITCHES.forEach((s, idx) => {
    if (!s.parent) return;
    const parentIdx = TOOLKIT_SWITCHES.findIndex((p) => p.key === s.parent);
    assert.ok(parentIdx !== -1 && parentIdx < idx, `${s.key} has a missing or later parent`);
  });
});
