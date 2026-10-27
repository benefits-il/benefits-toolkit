import type { ResolvedTheme } from "./theme-resolve";

/**
 * The Benefits look for every webview the toolkit draws (the sidebar and the
 * conversation viewer): "Graphite", a dark gray with green only in the
 * accents, Stamp's yellow on the active and primary controls, and a cream
 * light mode. High contrast hands every color back to the editor.
 *
 * The page carries the resolved theme on <html data-theme>, so the choice in
 * Appearance (auto, light, dark) applies here whatever the editor's theme is.
 * Free of the vscode API so tests can render a page.
 */

/** Webview URIs of the bundled font files (media/fonts). */
export interface BrandFonts {
  rubikLatin: string;
  rubikHebrew: string;
  varelaLatin: string;
  varelaHebrew: string;
}

export interface WebviewPage {
  /** null: no bundled fonts, fall back to the editor's UI font. */
  fonts: BrandFonts | null;
  theme: ResolvedTheme;
  title: string;
  /** The page's own CSS, after the shared rules. */
  css: string;
  body: string;
  /** Runs after the shared helpers: `vscode`, `post`, `$` and `$$` are defined. */
  script: string;
}

// Google Fonts' own subset ranges, so Hebrew text only pulls the Hebrew file.
export const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
export const HEBREW_RANGE = "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F";

function fontFaces(fonts: BrandFonts | null): string {
  if (!fonts) return "";
  const face = (family: string, url: string, range: string, weight: string) =>
    `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url('${url}') format('woff2'); unicode-range: ${range}; }`;
  return [
    face("Rubik", fonts.rubikHebrew, HEBREW_RANGE, "300 900"),
    face("Rubik", fonts.rubikLatin, LATIN_RANGE, "300 900"),
    face("Varela Round", fonts.varelaHebrew, HEBREW_RANGE, "400"),
    face("Varela Round", fonts.varelaLatin, LATIN_RANGE, "400"),
  ].join("\n");
}

/** Graphite: hue 150, saturation 3%, base lightness 10.5%, close to the editor's own grays. Each surface is a step up from the field. */
export const THEME_TOKENS_CSS = `
  :root {
    color-scheme: dark;
    /* The editor's font variable comes with a fallback: an undefined var() would void the whole stack. */
    --head: 'Rubik', var(--vscode-font-family, system-ui), system-ui, sans-serif;
    --body: 'Varela Round', 'Rubik', var(--vscode-font-family, system-ui), system-ui, sans-serif;
    --mono: var(--vscode-editor-font-family, Consolas, monospace);
    --pill: 999px; --card-r: 14px; --row-r: 10px;

    --page: hsl(150 3% 10.5%);
    --chrome: hsl(150 3% 12.5%);
    --panel: hsl(150 3% 12%);
    --surface: hsl(150 3% 17.5%);
    --hover: hsl(150 3% 20.5%);
    --input: hsl(150 3% 15.5%);
    --selected: hsl(150 8% 19.5%);
    --line: hsl(150 3% 70% / 0.12);
    --text: #F6F4EA;
    --muted: #A9B3AE;
    --accent: #8FD3B3;
    --dot: #6EE7B7;
    --on: #10B981;
    --on-knob: #FFFFFF;
    --stamp-bg: #FCD34D; --stamp-text: #1A1405; --stamp-line: transparent; --stamp-shadow: 0 3px 0 0 #A16207;
    --focus: #FCD34D;
    --danger: #FDA4AF;
    --warning: #FCD34D;
    --reading-bg: hsl(150 3% 13.5%);
    --reading-line: hsl(150 3% 70% / 0.10);
    --code: hsl(150 3% 9%);
    --code-text: #E8EFEA;
    --card-shadow: 0 10px 26px rgba(0, 0, 0, 0.25);
    --pop-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
    --mark-bg: #FCD34D; --mark-text: #1A1405;

    --tile-appearance: hsl(150 10% 60% / 0.14); --tile-appearance-fg: #D6DED9;
    --tile-windowColor: rgba(147, 197, 253, 0.14); --tile-windowColor-fg: #BFDBFE;
    --tile-sounds: rgba(252, 211, 77, 0.14); --tile-sounds-fg: #FDE68A;
    --tile-popup: rgba(196, 181, 253, 0.14); --tile-popup-fg: #DDD6FE;
    --tile-chats: rgba(110, 231, 183, 0.13); --tile-chats-fg: #A7F3D0;
    --tile-agents: rgba(253, 186, 116, 0.14); --tile-agents-fg: #FED7AA;
    --tile-rtl: rgba(94, 234, 212, 0.13); --tile-rtl-fg: #99F6E4;
    --tile-htmlOpen: rgba(253, 164, 175, 0.14); --tile-htmlOpen-fg: #FECDD3;
    --tile-diagnostics: hsl(150 10% 60% / 0.10); --tile-diagnostics-fg: #A9B3AE;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --page: #F7F3E3; --chrome: #FFFBEB; --panel: #FFFDF6; --surface: #FFFFFF; --hover: #FEF3C7; --input: #FFFFFF;
    --selected: #EAF5EE; --line: #EFE4BE;
    --text: #14231C; --muted: #55635C; --accent: #047857; --dot: #047857; --on: #047857;
    --stamp-line: #14231C; --stamp-shadow: 0 3px 0 0 #14231C;
    --focus: #047857; --danger: #9F1239; --warning: #92400E;
    --reading-bg: #FFFFFF; --reading-line: #EFE4BE; --code: #F4F1E6; --code-text: #14231C;
    --card-shadow: 0 8px 22px rgba(20, 35, 28, 0.06);
    --pop-shadow: 0 18px 44px rgba(20, 35, 28, 0.16);

    --tile-appearance: #EEF1EF; --tile-appearance-fg: #334155;
    --tile-windowColor: #E0F2FE; --tile-windowColor-fg: #0369A1;
    --tile-sounds: #FEF3C7; --tile-sounds-fg: #92400E;
    --tile-popup: #EDE9FE; --tile-popup-fg: #6D28D9;
    --tile-chats: #D1FAE5; --tile-chats-fg: #047857;
    --tile-agents: #FFEDD5; --tile-agents-fg: #C2410C;
    --tile-rtl: #CCFBF1; --tile-rtl-fg: #0F766E;
    --tile-htmlOpen: #FFE4E6; --tile-htmlOpen-fg: #BE123C;
    --tile-diagnostics: #EEF1EF; --tile-diagnostics-fg: #55635C;
  }
  /* High contrast: the editor's own colors, everywhere. */
  :root[data-theme="hc-dark"], :root[data-theme="hc-light"] {
    --page: var(--vscode-editor-background); --chrome: var(--vscode-editor-background);
    --panel: var(--vscode-editor-background); --surface: var(--vscode-editor-background);
    --hover: var(--vscode-list-hoverBackground, var(--vscode-editor-background));
    --input: var(--vscode-input-background);
    --selected: var(--vscode-list-activeSelectionBackground);
    --line: var(--vscode-contrastBorder, var(--vscode-editor-foreground));
    --text: var(--vscode-editor-foreground); --muted: var(--vscode-editor-foreground);
    --accent: var(--vscode-textLink-foreground); --dot: var(--vscode-focusBorder);
    --on: var(--vscode-button-background); --on-knob: var(--vscode-button-foreground);
    --stamp-bg: var(--vscode-button-background); --stamp-text: var(--vscode-button-foreground);
    --stamp-line: var(--vscode-contrastBorder, transparent); --stamp-shadow: none;
    --focus: var(--vscode-focusBorder);
    --danger: var(--vscode-errorForeground); --warning: var(--vscode-editorWarning-foreground, var(--vscode-editor-foreground));
    --reading-bg: var(--vscode-editor-background); --reading-line: var(--vscode-contrastBorder, var(--vscode-editor-foreground));
    --code: var(--vscode-editor-background); --code-text: var(--vscode-editor-foreground);
    --card-shadow: none; --pop-shadow: none;
    --mark-bg: var(--vscode-editor-findMatchHighlightBackground, Highlight); --mark-text: var(--vscode-editor-foreground);
  }
  :root[data-theme="hc-dark"] { color-scheme: dark; }
  :root[data-theme="hc-light"] { color-scheme: light; }
  :root[data-theme^="hc"] [class*="tile"] { background: transparent !important; color: var(--text) !important; outline: 1px solid var(--line); }
`;

/** The controls every page shares: pills, the yellow stamp, switches, menus, toasts. */
export const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; padding: 0;
    background: var(--panel); color: var(--text);
    font: 13px/1.5 var(--head);
  }
  button, input, select, textarea { font: inherit; color: inherit; }
  h1, h2, h3, p { margin: 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  :focus { outline: none; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  [hidden], .hidden { display: none !important; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .ico { width: 16px; height: 16px; flex: none; display: block; }
  .muted { color: var(--muted); }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 30px; padding: 4px 14px; border-radius: var(--pill); cursor: pointer; white-space: nowrap;
    background: transparent; color: var(--text); border: 1px solid var(--line);
    font: 500 12px var(--head);
  }
  .btn:hover { background: var(--hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn .ico { width: 14px; height: 14px; }
  .btn.primary, .stamp {
    background: var(--stamp-bg); color: var(--stamp-text); border: 1.5px solid var(--stamp-line);
    box-shadow: var(--stamp-shadow); font-weight: 600;
  }
  .btn.primary:hover { filter: brightness(1.05); }
  .btn.danger { color: var(--danger); }
  .icon-btn {
    width: 30px; height: 30px; flex: none; padding: 0; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; color: var(--text); border: 1px solid transparent; border-radius: var(--pill);
  }
  .icon-btn:hover { background: var(--hover); }
  .icon-btn.framed { border-color: var(--line); background: var(--input); }
  .icon-btn .ico { width: 16px; height: 16px; }
  .link {
    background: none; border: 0; padding: 0; cursor: pointer; color: var(--accent);
    font: 500 12px var(--head);
  }
  .link:hover { text-decoration: underline; }

  /* segmented control: a pill track, the active part is the yellow stamp */
  .seg {
    display: inline-flex; gap: 2px; padding: 2px;
    background: var(--input); border: 1px solid var(--line); border-radius: var(--pill);
  }
  .seg button {
    min-height: 26px; padding: 3px 12px; border-radius: var(--pill); cursor: pointer;
    background: transparent; border: 1.5px solid transparent; color: var(--text);
    font: 500 12px var(--head);
  }
  .seg button.glyph { padding: 3px 9px; }
  .seg button.glyph .ico { width: 15px; height: 15px; }
  .seg button[aria-pressed="true"], .seg button[aria-selected="true"] {
    background: var(--stamp-bg); color: var(--stamp-text); border-color: var(--stamp-line);
    box-shadow: var(--stamp-shadow); font-weight: 600;
  }

  .field, select.field {
    width: 100%; min-width: 0; min-height: 32px; padding: 5px 12px;
    background: var(--input); color: var(--text);
    border: 1px solid var(--line); border-radius: 10px;
  }
  .field::placeholder { color: var(--muted); opacity: 0.85; }
  .field:focus-visible { outline: 2px solid var(--focus); outline-offset: 0; }
  .field.invalid { border-color: var(--danger); }

  /* switch: a checkbox with role="switch" */
  .switch {
    appearance: none; -webkit-appearance: none; margin: 0; flex: none; cursor: pointer; position: relative;
    width: 32px; height: 18px; padding: 2px; border-radius: var(--pill);
    background: var(--line); border: 1px solid var(--muted);
  }
  .switch::before {
    content: ""; display: block; width: 12px; height: 12px; border-radius: 50%;
    background: var(--text); transition: transform 0.15s;
  }
  .switch:checked { background: var(--on); border-color: var(--on); }
  .switch:checked::before { transform: translateX(14px); background: var(--on-knob); }
  .switch:disabled { opacity: 0.5; cursor: not-allowed; }

  /* a popover menu (row right-click, More, Display) */
  .menu {
    position: fixed; z-index: 50; min-width: 200px; max-width: calc(100vw - 16px); padding: 6px;
    background: var(--chrome); color: var(--text);
    border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--pop-shadow);
  }
  .menu button, .menu label {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 32px; padding: 5px 10px;
    border: 0; border-radius: 8px; background: transparent; color: var(--text); cursor: pointer; text-align: start;
    font: 400 12.5px var(--head);
  }
  .menu button:hover, .menu button:focus-visible, .menu label:hover { background: var(--hover); outline: none; }
  .menu button .ico { width: 15px; height: 15px; color: var(--muted); }
  .menu button.danger, .menu button.danger .ico { color: var(--danger); }
  .menu label .switch { margin-inline-start: auto; }
  .menu hr { border: 0; border-top: 1px solid var(--line); margin: 5px 4px; }
  .menu .menu-note { padding: 4px 10px 6px; color: var(--muted); font-size: 11.5px; }

  .toast {
    position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 60;
    padding: 8px 16px; border-radius: var(--pill);
    background: var(--surface); color: var(--text); border: 1px solid var(--line); box-shadow: var(--pop-shadow);
    font: 500 12px var(--head); pointer-events: none; opacity: 0; transition: opacity 0.15s;
  }
  .toast.visible { opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
`;

/** The page's shared helpers: the vscode API, post, $ and $$, and the theme message. */
const BASE_SCRIPT = `
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'theme') document.documentElement.dataset.theme = e.data.theme;
  });
`;

/**
 * A whole page. No CSP meta, like every webview in this extension: a strict
 * script-src nonce blocks VS Code's injected acquireVsCodeApi bootstrap.
 */
export function renderWebviewPage({ fonts, theme, title, css, body, script }: WebviewPage): string {
  return /* html */ `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${fontFaces(fonts)}
${THEME_TOKENS_CSS}
${BASE_CSS}
${css}
</style>
</head>
<body>
${body}
<script>
${BASE_SCRIPT}
${script}
</script>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
