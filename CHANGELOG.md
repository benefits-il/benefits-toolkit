# Changelog

## 0.1.0 — Bug-fix pass: all three features made reliable

Fixes the three reported problems and the recurring "it worked, then it didn't" pattern. The root cause across RTL and Sounds was the same: the toolkit patches *external state* (Claude Code's webview files / the global `settings.json`) that gets reset, with no self-healing.

**RTL — now actually renders**
- The patch is **no longer stripped on every window reload/shutdown**. It was being removed on deactivate and re-applied on the next startup, so Claude Code's webview always loaded the *unpatched* CSS first — RTL never showed without a manual reload. The patch now persists across restarts and is only removed when you actually turn the feature off (`Feature.deactivate` now receives a `"disable"` vs `"shutdown"` reason).
- The **JS shim is injected in every mode**, including `always` (it was previously stripped in `always`, leaving no fallback if the CSS scope transform was imperfect). The fragile `always`-mode regex rewrite of the stylesheet is gone; one scoped stylesheet plus the shim's `MutationObserver` drives it.
- After a patch is *freshly* written, a one-time **"Reload Window"** prompt appears so the open chat picks up the change.

**Sounds — self-healing + audible**
- Hooks are now **auto-reconciled on activation**: if they're missing or stale (e.g. an older `.ps1`-based install, or wiped by a Claude Code update / settings reset) they're transparently re-installed. No more manually re-running the install command.
- Standardized on the inline, reliable `Media.SoundPlayer … PlaySync()` command and **removed orphan `play-*.ps1` / log artifacts** left by the previous detached-player approach (which started but wasn't reliably audible).

**Chats — scoped to the current window**
- The sidebar now lists **only the conversations for the folder open in this window** (matched by each conversation's recorded `cwd`, falling back to the encoded project-folder name). New `benefit.chats.scope` setting (`currentWorkspace` default / `all`) and a **Toggle Scope** title-bar button + "Show All Projects" welcome link. Re-scopes automatically when you switch folders.

## 0.0.5 — Toggling RTL no longer reshuffles chat-header buttons

- Added an LTR override for the chat header (`[class*="header_"][class*="aqhumA"]`) so its flex children (timeline buttons, dot indicators) keep their order when RTL is enabled. Without this override, the header inherited `direction: rtl` from its parent `root_` and visually reversed the icon row.
- Added LTR overrides for sessionsButtonText, timeline dots (success/failure/progress/warning), inputContainer/inputWrapper, selectionAttachment, attachmentInfo/Text, secondaryLine, authUrl, and thinking-block containers (thinking_, thinkingContent_, thinkingContainer_, thinkingHeader_, spinnerRow_, timelineMessage:has(thinking_)) — matching the full LTR exclusion list needed for stable chat UX.

## 0.0.4 — RTL button now lives inside the chat layout

- The toggle button is injected into Claude Code's chat header (`[class*="header_"]`) when one is present. When Claude Code doesn't render a header (active session on startup), the button falls back to a slim wrapper that sits **above** the input box — never floating over existing controls.

## 0.0.3 — RTL toggle is now a floating button

- Replaced the DOM-injected header button (which depended on Claude Code class names that changed between versions) with a fixed-position floating button anchored to `document.body`. Survives Claude Code refactors and always renders in the top corner of the chat panel.

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
