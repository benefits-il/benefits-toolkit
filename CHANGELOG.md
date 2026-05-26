# Changelog

## 0.0.2 — Conversation viewer enhancements

The conversation viewer (the panel that opens when you click a conversation in the sidebar) now ships with the full feature set I had been maintaining as a private patch:

- **Accordion messages** — every message collapses into a single-line preview bar; the bottom-most message is the only one expanded on open.
- **Per-message Copy buttons** — top-right of the collapsed bar and bottom of the expanded card. Flashes a check icon on success.
- **Header Collapse All / Expand All toggle** — single icon button that flips state based on whether anything is expanded.
- **Floating Scroll-to-Bottom button** — circular Anthropic-peach `#CC785C` button at the bottom-right; appears only when not near the bottom.
- **Context-window indicator** — `N / window (X.X%)` with tiered color (green / yellow / orange / red), a 200K marker on 1M windows, and a clearly visible gray empty track in every theme. Reads the real `usage` snapshot from the last assistant message; falls back to `chars/4` with a ⚠ flag when no `usage` exists.
- **Tabler-icon face-lift** — header buttons (settings gear, RTL toggle, collapse chevrons, download) are icon-only with proper hover tooltips. Header gets `backdrop-filter: blur(10px)`. Message cards have generous radii and a soft shadow. Role labels become pill chips.
- **Claude · Model chip** — assistant messages show the model parsed from `message.model` (e.g. `Claude · Opus 4.7`) in Anthropic peach. Accent border matches.
- **Thinking-block rendering** — `message.content` is walked into typed blocks (`text` / `thinking` / `tool`). Thinking blocks render in a dashed-border card with a brain-icon chip; the `Hide thinking blocks` setting hides both the block and any message that's thinking-only.
- **Settings dropdown (gear)** — four checkboxes: Hide empty / Hide tool-only / Hide short narration (<200 chars assistant text-only) / Hide thinking. Persisted in `localStorage`.
- **Viewer RTL toggle** — separate per-viewer toggle (not the Claude-Code-wide RTL). Uses logical CSS properties so the scroll button, accent border, and collapsed-bar copy icon all mirror correctly.
- **Filter-aware Markdown export** — `Save as Markdown` builds the markdown client-side from currently-visible elements. What you see is what you save.
- **Book icons** — `🕮` (Unicode BOOK, non-emoji) in the tab title and a Tabler `book` SVG in the in-viewer header.

## 0.0.1 — Initial release

First combined release of three features under one extension.

**RTL**
- Three modes: `active` (toggle button in chat header), `always`, `auto` (per-message direction detection).
- Patches Claude Code's `webview/index.css` and `webview/index.js` with sentinel-bracketed blocks so removal is clean.
- Status bar indicator shows the current mode.
- Optional custom text and code fonts.

**Sounds**
- Two variant sets bundled per slot (Stop / Notification); pick a variant via setting or via `Benefit: Choose Sound Variants` Quick Pick (with audio preview).
- Installs Claude Code hooks into `~/.claude/settings.json`, tagged so uninstall is surgical.
- Cross-platform playback: Windows (PowerShell SoundPlayer), macOS (afplay), Linux (paplay/aplay).

**Chats**
- Activity bar sidebar listing all conversations under `~/.claude/projects/`.
- Rename, archive (`_archive` folder), restore, delete, search, export to Markdown, view in a custom webview.
- Group by date / project / flat; sort newest or oldest; toggle archived visibility.
- Live refresh via file watcher.
- Status bar quick action to rename the most recent conversation.

**Inspired by** community extensions credited in the README; no code from those extensions is bundled here.
