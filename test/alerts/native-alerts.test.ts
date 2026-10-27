import assert from "node:assert/strict";
import { test } from "node:test";
import { isAntigravityQuiet, quietAntigravity, restoreAntigravity } from "../../src/features/alerts/services/native-alert-settings";

test("Antigravity: both of its alerts go off, the rest of its settings stay", () => {
  const config = { userSettings: { enableSoundsForSpecialEvents: true, artifactReviewMode: "ALWAYS" }, other: 1 };
  const { next, saved } = quietAntigravity(config);
  assert.deepEqual(next, {
    userSettings: { enableSoundsForSpecialEvents: false, artifactReviewMode: "ALWAYS", enableNotificationsForSpecialEvents: false },
    other: 1,
  });
  assert.deepEqual(saved, { enableNotificationsForSpecialEvents: null, enableSoundsForSpecialEvents: true });
  assert.ok(isAntigravityQuiet(next));
  assert.ok(!isAntigravityQuiet(config));
});

test("Antigravity: switching back puts each setting as it was, absent ones removed", () => {
  const config = { userSettings: { enableSoundsForSpecialEvents: true, artifactReviewMode: "ALWAYS" } };
  const { next, saved } = quietAntigravity(config);
  assert.deepEqual(restoreAntigravity(next, saved), config);
});

test("Antigravity: a config with no userSettings gets them", () => {
  const { next } = quietAntigravity({});
  assert.deepEqual(next, { userSettings: { enableNotificationsForSpecialEvents: false, enableSoundsForSpecialEvents: false } });
});
