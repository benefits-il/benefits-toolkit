import assert from "node:assert/strict";
import { test } from "node:test";
import * as path from "node:path";
import {
  isWebLink,
  parseFileLink,
  resolveCandidates,
  safeDecode,
} from "../../src/features/chats/services/link-resolver";

test("isWebLink matches http/https/mailto only", () => {
  assert.equal(isWebLink("https://example.com/a#section"), true);
  assert.equal(isWebLink("http://x"), true);
  assert.equal(isWebLink("mailto:a@b.com"), true);
  assert.equal(isWebLink("src/file.ts#L42"), false);
  assert.equal(isWebLink("c:\\Users\\x\\file.ts"), false);
});

test("parseFileLink extracts line fragments", () => {
  assert.deepEqual(parseFileLink("src/a.ts"), { path: "src/a.ts" });
  assert.deepEqual(parseFileLink("src/a.ts#L42"), { path: "src/a.ts", startLine: 42, endLine: undefined });
  assert.deepEqual(parseFileLink("src/a.ts#L42-L51"), { path: "src/a.ts", startLine: 42, endLine: 51 });
  assert.deepEqual(parseFileLink("src/a.ts#L42-51"), { path: "src/a.ts", startLine: 42, endLine: 51 });
  assert.deepEqual(parseFileLink("src/a.ts#L51-L42"), { path: "src/a.ts", startLine: 42, endLine: 51 });
  assert.deepEqual(parseFileLink("README.md#usage"), { path: "README.md" });
});

test("resolveCandidates: windows-absolute and UNC stay as-is", () => {
  assert.deepEqual(
    resolveCandidates("c:\\repo\\a.ts", "c:\\other", ["c:\\ws"]),
    [path.normalize("c:\\repo\\a.ts")],
  );
  assert.deepEqual(
    resolveCandidates("\\\\server\\share\\a.ts", undefined, []),
    [path.normalize("\\\\server\\share\\a.ts")],
  );
});

test("resolveCandidates: relative resolves against cwd then roots, deduped", () => {
  const out = resolveCandidates("src/a.ts", "c:\\proj", ["c:\\proj", "c:\\ws2"]);
  assert.deepEqual(out, [path.resolve("c:\\proj", "src/a.ts"), path.resolve("c:\\ws2", "src/a.ts")]);
});

test("resolveCandidates: no cwd falls back to roots; ./ is stripped", () => {
  const out = resolveCandidates("./src/a.ts", undefined, ["c:\\ws"]);
  assert.deepEqual(out, [path.resolve("c:\\ws", "src/a.ts")]);
  assert.deepEqual(resolveCandidates("", "c:\\proj", ["c:\\ws"]), []);
});

test("resolveCandidates: posix leading slash tries as-is plus joins", () => {
  const out = resolveCandidates("/src/a.ts", "c:\\proj", ["c:\\ws"]);
  assert.ok(out.includes(path.join("c:\\proj", "/src/a.ts")));
  assert.ok(out.includes(path.join("c:\\ws", "/src/a.ts")));
});

test("safeDecode decodes percent-encoding and survives invalid input", () => {
  assert.equal(safeDecode("c%3A%5CUsers%5Cx"), "c:\\Users\\x");
  assert.equal(safeDecode("a%20b.ts"), "a b.ts");
  assert.equal(safeDecode("100%ZZ"), "100%ZZ");
});
