/**
 * A code block a model writes is not always code: often it holds Hebrew text
 * to copy, a prompt or a message. Such a block reads better right to left with
 * wrapped lines. Real code that only carries a Hebrew string or comment stays
 * code, so the block counts as text by the share of its letters that are Hebrew.
 *
 * The RTL shim in Claude Code's chat (features/rtl/assets/rtl-shim.js) holds a
 * copy of this rule in plain JS; keep the two the same.
 */

/** Language tags a model gives prose in a code block (an empty tag included). */
const TEXT_LANGUAGES = new Set(["", "text", "txt", "plain", "plaintext", "markdown", "md", "prompt"]);

/** Hebrew share needed: low for a text tag, high for a code language. */
export const TEXT_BLOCK_SHARE = { text: 0.3, code: 0.6 } as const;

export function isHebrewTextBlock(content: string, language: string): boolean {
  const hebrew = content.match(/[א-ת]/g)?.length ?? 0;
  if (!hebrew) return false;
  const latin = content.match(/[A-Za-z]/g)?.length ?? 0;
  const share = hebrew / (hebrew + latin);
  const lang = language.trim().split(/\s+/)[0].toLowerCase();
  return share >= (TEXT_LANGUAGES.has(lang) ? TEXT_BLOCK_SHARE.text : TEXT_BLOCK_SHARE.code);
}
