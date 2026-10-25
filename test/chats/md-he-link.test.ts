import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import {
  buildMdHeUrl,
  buildRedirectPage,
  encodeMarkdownPayload,
  MD_HE_URL,
} from "../../src/features/chats/services/md-he-link";

const SAMPLE = [
  "# כותרת בעברית",
  "",
  "טקסט עם **הדגשה** ו-`inline code`.",
  "",
  "```ts",
  "const total = items.reduce((sum, x) => sum + x.price, 0);",
  "```",
  "",
  "Mixed: Hebrew + English, $& and $' stay literal.",
].join("\n");

function decode(payload: string): string {
  return inflateRawSync(Buffer.from(payload, "base64url")).toString("utf8");
}

test("encodeMarkdownPayload round-trips Hebrew, code fences and $ patterns", () => {
  assert.equal(decode(encodeMarkdownPayload(SAMPLE)), SAMPLE);
});

test("encodeMarkdownPayload uses only the base64url alphabet", () => {
  assert.match(encodeMarkdownPayload(SAMPLE), /^[A-Za-z0-9_-]+$/);
});

test("buildMdHeUrl points at md-he with the payload in the #md= hash", () => {
  const url = buildMdHeUrl(SAMPLE);
  assert.ok(url.startsWith(`${MD_HE_URL}#md=`));
  assert.equal(decode(url.slice(`${MD_HE_URL}#md=`.length)), SAMPLE);
});

test("buildMdHeUrl compresses repetitive text well below its raw size", () => {
  const long = SAMPLE.repeat(200);
  assert.ok(buildMdHeUrl(long).length < Buffer.byteLength(long, "utf8") / 4);
});

test("buildRedirectPage forwards to the exact URL", () => {
  const url = buildMdHeUrl(SAMPLE);
  const page = buildRedirectPage(url);
  assert.ok(page.includes(`location.replace(${JSON.stringify(url)})`));
});

test("buildRedirectPage cannot be broken out of its script element", () => {
  const page = buildRedirectPage("https://example.com/#</script><img src=x onerror=alert(1)>");
  assert.equal(page.match(/<\/script>/g)?.length, 1);
  assert.ok(!page.includes("<img"));
});
