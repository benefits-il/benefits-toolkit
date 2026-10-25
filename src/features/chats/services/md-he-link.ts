import { deflateRawSync } from "node:zlib";

export const MD_HE_URL = "https://benefits-il.dev/md-he/";

/**
 * md-he reads the hash on load: #md=<base64url(deflate-raw(utf8 markdown))>.
 * The hash never reaches the server, and deflate-raw is what the browser's
 * native DecompressionStream("deflate-raw") inflates, so neither side needs a
 * compression library.
 */
export const MD_HE_HASH_KEY = "md";

/**
 * Past this URL length the launcher hands the message over through the
 * clipboard instead. Chromium accepts URLs up to 2 MB; this leaves headroom.
 */
export const MD_HE_MAX_URL_LENGTH = 1_500_000;

export function encodeMarkdownPayload(markdown: string): string {
  return deflateRawSync(Buffer.from(markdown, "utf8"), { level: 9 }).toString("base64url");
}

export function buildMdHeUrl(markdown: string): string {
  return `${MD_HE_URL}#${MD_HE_HASH_KEY}=${encodeMarkdownPayload(markdown)}`;
}

/**
 * A local page that immediately forwards the browser to `url`. Opening this
 * file instead of the URL itself keeps a long #md= payload off the OS shell's
 * command line, whose URL length limits are far below the browser's.
 */
export function buildRedirectPage(url: string): string {
  // JSON.stringify gives a valid JS string literal; escaping "<" keeps a
  // "</script>" inside the URL from closing the script element early.
  const literal = JSON.stringify(url).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Opening md-he</title></head>
<body><script>location.replace(${literal});</script></body></html>
`;
}
