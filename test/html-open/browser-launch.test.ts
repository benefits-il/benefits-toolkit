import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBrowserLaunch } from "../../src/features/html-open/services/browser-launch";

const isWindows = process.platform === "win32";

test("resolveBrowserLaunch uses the browser path as the command", () => {
  const launch = resolveBrowserLaunch("/usr/bin/firefox", "/home/ben/page.html");
  assert.equal(launch.cmd, "/usr/bin/firefox");
  assert.equal(launch.args.length, 1);
});

test("resolveBrowserLaunch passes the file as a file:// URL", () => {
  const path = isWindows ? "C:\\site\\index.html" : "/site/index.html";
  const launch = resolveBrowserLaunch("chrome", path);
  assert.match(launch.args[0], /^file:\/\/\//);
  assert.match(launch.args[0], /index\.html$/);
});

test("resolveBrowserLaunch encodes spaces in the path", () => {
  const path = isWindows ? "C:\\my site\\index.html" : "/my site/index.html";
  const launch = resolveBrowserLaunch("chrome", path);
  assert.ok(launch.args[0].includes("my%20site"));
  assert.ok(!launch.args[0].includes(" "));
});
