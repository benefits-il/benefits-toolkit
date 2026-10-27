import assert from "node:assert/strict";
import { test } from "node:test";
import { newestFirst } from "../../src/features/rtl/services/claude-asset-locator";

test("Claude Code folders sort by version number, not as text", () => {
  assert.deepEqual(
    newestFirst(["anthropic.claude-code-2.1.99-win32-x64", "anthropic.claude-code-2.1.100-win32-x64", "anthropic.claude-code-2.0.310-win32-x64"]),
    ["anthropic.claude-code-2.1.100-win32-x64", "anthropic.claude-code-2.1.99-win32-x64", "anthropic.claude-code-2.0.310-win32-x64"],
  );
});

test("folders without a platform suffix, and a single folder, still work", () => {
  assert.deepEqual(newestFirst(["anthropic.claude-code-1.9.0", "anthropic.claude-code-1.10.0"]), ["anthropic.claude-code-1.10.0", "anthropic.claude-code-1.9.0"]);
  assert.deepEqual(newestFirst(["anthropic.claude-code-2.1.310-win32-x64"]), ["anthropic.claude-code-2.1.310-win32-x64"]);
  assert.deepEqual(newestFirst([]), []);
});
