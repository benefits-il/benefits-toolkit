# Changelog

## 0.1.9 — Sounds panel: previews are actually audible

The real reason the panel's Play / Test produced nothing: previews were spawned with `detached: true`, and a detached child process on Windows is created without the interactive audio session — so PowerShell/MediaPlayer ran (exit 0) but reached no speakers, while the Claude-Code-spawned hook stayed audible. Spawn the preview as a normal background child of the extension host instead (with `windowsHide`), and it plays. (Verified end-to-end: every click was already reaching the extension; only the audio session was missing.)

## 0.1.6 — Sounds panel CSP + view order

- Dropped the panel's strict `script-src 'nonce-…'` CSP (it would block VS Code's injected `acquireVsCodeApi` bootstrap) to match the working chat-viewer webview.
- Order: "Claude Chats" on top, "Sounds" below it.

- **Sounds panel buttons did nothing.** The panel set a strict CSP (`script-src 'nonce-…'`) which blocked VS Code's injected `acquireVsCodeApi` bootstrap, so the whole webview script threw on the first line and no control worked. Dropped the CSP meta to match the working chat-viewer webview — Play / Test / Reinstall / toggles now respond.
- **Order:** "Claude Chats" is back on top, "Sounds" below it.

## 0.1.5 — Sounds control panel + cleaner conversation titles

**Sounds control panel.** A new **Sounds** view in the sidebar (next to Claude Chats) — toggle sounds on/off, switch each event (finish / asks-you) between its Default and Alternative variant, preview each with a Play button, and Test/Reinstall. It's always available (even when sounds are off, so the switch is reachable). Turning sounds off from here now removes the hooks (an explicit "disable" uninstalls; a window reload still leaves them in place).

**Conversation viewer fixes.**
- Fixed the header showing the literal `{{TITLE}}` instead of the conversation name — the placeholder appears twice in the template and only the first was being substituted (`String.replace` replaces one match; now `replaceAll`).
- Removed the confusing `Read Only` badge from the header.

**Cleaner conversation titles.** Almost no conversation has a Claude-generated `summary`, so titles fall back to the first user message — which was often just an `@file` reference, a `/slash-command` wrapper, or an `<ide_opened_file>` tag. Titles are now derived by stripping that injected noise and using the first real human text (or a `/command` label as last resort), across both the sidebar list and the viewer header.

## 0.1.4 — Sound hooks: run via a launcher script (bash ate the $variables)

The 0.1.3 MediaPlayer command worked when tested via cmd, but was still silent in real use. Cause: **Claude Code runs hooks through bash (Git Bash on Windows)**, and the inline `-Command "... $m ... $n ..."` had its `$m`/`$n` expanded away by bash before PowerShell ever saw it — PowerShell then got a mangled script and failed to parse (exit 1, silent). Verified by running the exact hook command through bash.

(The previous SoundPlayer command had no `$`, so bash left it intact — it was silent for the *other* reason, winmm device routing. Two independent bugs stacked.)

**Fix.** The PowerShell — with all its `$variables` — now lives in a `play.ps1` launcher written next to the WAVs. The hook command contains **no `$`**: `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "…\play.ps1" "…\stop.wav"`. PowerShell reads the script directly via `-File`, so bash never touches the variables. `install()` writes the launcher; `ensureInstalled()` re-creates it if missing; uninstall removes it. The in-extension preview still plays inline (it spawns PowerShell directly, with no shell in between).

## 0.1.3 — Sound hooks: play via MediaPlayer (SoundPlayer was silent)

Fixes "the command runs but I hear nothing" on a machine whose speakers and other VS Code sounds work fine.

**Root cause.** The hook played WAVs with `System.Media.SoundPlayer.PlaySync()`, which goes through the legacy winmm/waveOut mapper. On some machines that mapper targets a different "preferred" device than the modern WASAPI default that VS Code and every other app use — so `PlaySync()` returns success (exit 0) while reaching no audible output. Confirmed on a real machine: SoundPlayer = silent, WPF `MediaPlayer` (Media Foundation, follows the true default render device) = audible, same file, same process.

**Fix.** Both the hook command and the in-extension preview now play through `System.Windows.Media.MediaPlayer`. The hidden PowerShell process polls `NaturalDuration` so it lives exactly as long as the clip then exits (Play() is async). `ensureInstalled` already treats the old SoundPlayer command as stale, so the healer rewrites existing installs to the new command automatically.

## 0.1.2 — Sound hooks: continuous self-heal (stop getting clobbered)

Fixes the recurring "the finish sound stopped working again" on machines where it kept coming back.

**Root cause.** The Stop/Notification hooks live in `~/.claude/settings.json` — a file Claude Code *also* owns. Every time you approve a new permission, Claude Code rewrites the whole file from its in-memory snapshot, which silently drops the hooks this extension added out-of-band. On a machine whose permission allowlist grows constantly (hundreds of entries), the hooks get clobbered over and over; on a machine with a stable allowlist the file is never rewritten, so the same hooks survive forever — which is why "it never breaks on my other computer."

The 0.1.0/0.1.1 self-heal only ran **on activation**, so once the hooks were clobbered mid-session they stayed gone until the window reloaded.

**Fix.** New `HookHealer` watches `~/.claude/settings.json` and re-applies the managed hooks (idempotently, debounced ~0.8s) within a second of *any* external change. `ensureInstalled` only writes when something is actually missing or stale, so re-applying after our own write is a read-only no-op and never loops. Explicit **Uninstall** pauses the healer so it doesn't fight you; **Install** resumes it.

## 0.1.1 — Sound hooks: drop the broken bus, fire PowerShell directly

- Removed the experimental hidden-webview audio bus (a node launcher wrote events to a `.event` file, the extension watched it, and an `<audio>` element in a hidden webview was supposed to play them — the playback layer was silent).
- The Stop/Notification hook now fires `powershell -NoProfile -WindowStyle Hidden -Command "(New-Object Media.SoundPlayer '<wav>').PlaySync()"` directly from Claude Code's hook runner. Same approach as the standalone `claude-sound-hooks` reference installer, verified to reach the speakers on Windows.
- `ensureInstalled` reconciles the old `node play.js` command shape as stale and rewrites it to the new powershell form on activation; `cleanupLegacyArtifacts` removes the orphaned `play.js`, `.event`, and per-slot `.log` files.
- Removed the `benefit.audioView` sidebar view, `audio-view-provider.ts`, and `sound-event-bus.ts` — all unused now.

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
