import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAlertConfig,
  buildLinuxSoundsEnv,
  compareVersions,
} from "../../src/features/alerts/services/alert-config";

const BASE = {
  sounds: { enabled: true, stopSound: "stop-default.wav", notificationSound: "notify-default.wav", cleanupOnDeactivate: false },
  popup: { enabled: true, onDone: true, onWaiting: false, seconds: 8 },
};

test("buildAlertConfig maps the slots to done / waiting", () => {
  const c = buildAlertConfig(BASE);
  assert.deepEqual(c.sounds, { enabled: true, done: "stop-default.wav", waiting: "notify-default.wav" });
  assert.deepEqual(c.popup, { enabled: true, onDone: true, onWaiting: false, seconds: 8 });
  assert.equal(c.version, 1);
});

test("buildAlertConfig clamps the popup duration", () => {
  assert.equal(buildAlertConfig({ ...BASE, popup: { ...BASE.popup, seconds: 1 } }).popup.seconds, 3);
  assert.equal(buildAlertConfig({ ...BASE, popup: { ...BASE.popup, seconds: 600 } }).popup.seconds, 60);
  assert.equal(buildAlertConfig({ ...BASE, popup: { ...BASE.popup, seconds: Number.NaN } }).popup.seconds, 8);
});

test("buildLinuxSoundsEnv is sourceable and quote-safe", () => {
  const env = buildLinuxSoundsEnv(buildAlertConfig({
    ...BASE,
    sounds: { ...BASE.sounds, stopSound: "it's.wav" },
  }));
  assert.match(env, /^ENABLED=1$/m);
  assert.match(env, /^DONE='its\.wav'$/m);
  assert.match(env, /^WAITING='notify-default\.wav'$/m);
});

test("compareVersions orders dotted versions numerically", () => {
  assert.equal(compareVersions("0.7.0", "0.7.0"), 0);
  assert.equal(compareVersions("0.7.0", "0.10.0"), -1);
  assert.equal(compareVersions("1.0", "0.99.9"), 1);
  assert.equal(compareVersions("0.7", "0.7.1"), -1);
});
