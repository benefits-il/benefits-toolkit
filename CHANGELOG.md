# Changelog

## 0.7.0 — A popup that takes you back, and a sound per project

**A desktop popup when Claude finishes or needs you (Windows and macOS).** A small card in the project's window color and name slides into the corner of the screen. Click it and that project's VS Code window comes to the front; the x just closes it. It never shows while you're already in that window, so it only interrupts when you're elsewhere. Several projects finishing at once stack up to four cards. Hovering pauses the countdown, and Claude Code's one-minute idle reminder gets no popup, since the "finished" one already said it. Switches: `benefit.popup.enabled`, `benefit.popup.onDone`, `benefit.popup.onWaiting`, plus `benefit.popup.seconds` (default 8). The Alerts panel has a **Test popup** button.

**A different sound for each project.** The Sounds panel is now **Alerts**. Its sound lists switch between *All projects* (the default) and *This project*, so five open windows can sound five different ways. A project's own sounds are kept in the extension's storage, not in `.vscode/settings.json`, which you might commit.

*How it works now.* Claude Code's hooks used to play a fixed sound file. They now run a small dispatcher from `~/.benefits-toolkit/bin`, which reads the hook's working folder, finds the project among the records each open window keeps in `~/.benefits-toolkit/projects` (name, color, own sounds, focused or not), then shows the popup and plays the sound. Settings are mirrored to `~/.benefits-toolkit/config.json`, so changing a sound no longer rewrites `~/.claude/settings.json` at all. Folders with Hebrew names work.

*Upgrading with several windows open.* A window still running an older toolkit keeps putting its old hooks back. Instead of fighting it (which would rewrite `settings.json` every second), the new version leaves those hooks in place but silences them, and asks you once to reload that window. Claude Code reads hooks when a session starts: restart running Claude sessions to get the popup.

## 0.6.1 — Benefits at the top

**The Benefits strip moved to the very top of the sidebar.** It used to sit at the bottom of the Toolkit panel, below everything else; it now has a small view of its own, first in the sidebar, above the chats list. The tagline's long dash became a bold middle dot (·), here, in the viewer, in the README, on the landing page and on md-he.

## 0.6.0 — Copy code, read in md-he, switch anything off

**A Copy button on every code block in the conversation viewer.** Claude Code's own chat has one; our viewer didn't, so copying a snippet meant dragging a selection across a scrolling block. Hover any code block (fenced or indented) and a Copy button appears in its corner; it copies the raw code, exactly as Claude wrote it. Switch: `benefit.chats.codeCopyButtons`.

**"Open in md-he" on every message.** A new button next to Copy opens the message's markdown at [benefits-il.dev/md-he](https://benefits-il.dev/md-he/), the Hebrew-first Markdown reader, for comfortable reading. The message travels compressed in the URL's `#` fragment, so it never reaches a server, and it goes through a tiny local redirect page so long messages don't hit the OS shell's URL length limit. Only the message's text goes over; thinking and tool output stay behind. A message too large even for that is copied to the clipboard and md-he opens ready for Paste. Respects `benefit.htmlOpen.browserPath`. Switch: `benefit.chats.mdHeButton`.

**The Toolkit panel: every feature has an off switch you can see.** A new panel at the bottom of the sidebar lists every feature (and the two viewer buttons) as a switch. A feature that is off now disappears from the UI instead of half-working: the Chats list and the Colors panel hide, and the "Open in External Browser" button leaves `.html` files. Turn it back on from the same panel.

**Part of Benefits.** The conversation viewer and the Toolkit panel carry the Benefits brand bar (the same one as md-he), linking to the course at [benefits-il.dev](https://benefits-il.dev/). The README, the Marketplace description and the landing page say so too.

*Fixed: messages containing `$&` or `$'` rendered wrong in the viewer.* The page was assembled with `String.replace` and a plain replacement string, where `$&` and friends are substitution patterns, so a message mentioning them came out mangled. Every placeholder now uses a function replacer.

## 0.5.1 — Open HTML files in your real browser

**One click from an HTML file to Chrome.** A fifth feature. VS Code's built-in preview opens HTML in the integrated Simple Browser — a cramped iframe when what you usually want is your actual browser with its devtools. Every `.html`/`.htm` file now gets an "Open in External Browser" button in the editor title bar and an entry in the Explorer right-click menu. By default the file opens in the system default browser; set `benefit.htmlOpen.browserPath` to a browser executable (e.g. `chrome.exe`) to force a specific one — the file is handed over as a `file://` URL, so paths with spaces and relative assets (CSS/JS/images next to the file) just work. A wrong `browserPath` produces a clear error naming the setting instead of failing silently. Gated by `benefit.htmlOpen.enabled` like every other feature. Also available as a command: `Benefit: Open in External Browser`.

*(0.5.0 shipped the same feature; 0.5.1 adds this changelog entry.)*

## 0.4.0 — Window colors, clickable chat links, 15 new sounds

**Window Colors — tell five open windows apart.** A fourth feature. The new **Colors** panel in the sidebar shows a grid of ten real color swatches (plus a custom hex field and Clear); one click colors this window's title bar, activity bar and status bar — including while the window is unfocused, which is the whole point of having several open. The foreground is derived automatically from the background's luminance, so every color is readable in light and dark themes. The color is written per-workspace through VS Code's own configuration API (`workbench.colorCustomizations`, Workspace target), so `.vscode/settings.json` keeps its comments and only the nine managed keys are ever touched — Clear removes exactly those and nothing else. Also available as commands: `Benefit: Window Color: Pick` / `Clear`.

**File links in the conversation viewer now open the file.** Clicking a file link did nothing — a webview swallows anchor navigation, and nothing listened. Links are now routed to the extension host, which resolves the path (against the conversation's recorded working directory, then the open workspace folders), opens the file beside the chat, and jumps to the line for `#L42` / `#L42-L51` fragments. A path that can't be resolved is copied to the clipboard with a "Path copied" toast — never a silent dead click. Every link shows its full destination in a hover tooltip, and web links open in the external browser.

*Root cause of the "opens a browser on a filename" bug.* markdown-it's fuzzy linkify treats bare text that looks like a domain as a link — and `.ts` and `.md` are real country TLDs, so plain prose mentioning `extension.ts` became `http://extension.ts` and clicking tried to leave for the web. Fuzzy linkify is now off: only explicit `http(s)://` / `www.` / `mailto:` text auto-links, and file paths are links only when Claude writes an actual markdown link.

**Sound library 17 → 32.** Fifteen new effects (Pixabay + Mixkit — intro chime, marimba, retro-game, sci-fi confirm, whooshes, blips and more), all selectable for either event from the Sounds panel.

## 0.3.1 — Timestamps no longer split against Hebrew titles

**A Hebrew conversation title swallowed its own timestamp.** The tree row renders the label and the description inside one bidi paragraph, so the digits in `12d ago` — European numerals, which take their direction from what surrounds them — resolved into the Hebrew run. The number stuck to the end of the title and the unit drifted to the other side of the row, reading as `…וקטגוריזציה12` on one side and `d ago` on the other. Both runs are now wrapped in `FSI`/`PDI` isolates (U+2068/U+2069) so each resolves on its own regardless of the other's direction, and a `·` separator makes the boundary between title and time explicit.

## 0.3.0 — The waiting sound actually fires + real conversation titles

**No sound when Claude asks / waits.**

*Root cause.* The extension installed a `Notification` hook and assumed that covered "Claude needs you". It does not. In Claude Code 2.1.x the `Notification` hook fires only for idle nudges (the 60-second reminder), remote-agent events, and MCP-elicitation completion — never for an interactive prompt. Interactive permission prompts, plan-mode approval (ExitPlanMode) and AskUserQuestion all dispatch a different hook, `PermissionRequest`; MCP form/URL elicitation dispatches `Elicitation`. So the Stop sound worked and the waiting sound never once played.

*Fix.* The notification sound is now installed on all three events — `Notification`, `PermissionRequest`, `Elicitation` — sharing one command. A sound-only hook is safe in the permission path: it prints nothing, so it returns no decision and the prompt appears exactly as before. The staleness check requires the managed command under all four events, so existing installs (Stop + Notification only) are detected as stale and repaired by the existing hook healer on first activation — no manual reinstall.

Also: if the configured sound file is missing from the bundled pool, the install now falls back to the default sound for that slot instead of failing the whole hook install with ENOENT.

**Real conversation titles.**

*Root cause.* Titles came from a `summary` record, and modern transcripts don't have one — so almost every conversation fell back to its first user message, which is usually boilerplate Claude Code injected: "Caveat: The messages below were generated by the user…" or "Base directory for this skill: …". Claude Code has stored the real title for a while now in `ai-title` records (re-emitted as the conversation grows, so the *last* one is current) and user renames in `custom-title` records — both near the end of the file, outside the 64 KB head chunk the scanner read.

*Fix.* The scanner now also reads a 256 KB tail chunk and takes the last `custom-title`, else the last `ai-title`, else the old `summary`, else the cleaned first-message fallback (which now skips those two boilerplate leads). The tail read also rescues a `cwd` when a large attachment pushed the first `cwd`-bearing record past the head window. Measured over 144 local transcripts: 114 junk titles → 0.

**Rename is now cross-compatible with Claude Code.** Renaming wrote a `{"type":"summary"}` record by rewriting the whole `.jsonl` — invisible to Claude Code's own session list, and a rewrite can clobber lines the CLI appends to a live session. Rename now *appends* a single `custom-title` line (the same thing Claude Code does), so it is safe against a live writer and the new name shows up in Claude Code's session picker too.

**Scope filter ("This project") did nothing.** Four separate bugs:

- Matching a conversation's `cwd` against the workspace used exact equality, so any session started from a subfolder of the open folder (or a workspace inside the session's folder) never matched. Now matches by containment either way, with a separator guard so `…/benefits` doesn't swallow `…/benefits-repos`.
- With no folder open, both scope states returned the full list — the button visibly did nothing. "This project" is now empty there, and the view's welcome text offers **Show All Projects** / **Open Folder**.
- The toggle always wrote to the Global settings target. If the key also had a workspace value, that value kept winning and the toggle stayed inert forever. All four Chats toggles now write to whichever target actually changes the effective value.
- The title-bar button looked identical in both states. It is now two mutually-exclusive buttons whose icon and tooltip show the current scope (`$(filter-filled)` = this project, `$(filter)` = all projects).

**Markdown in the conversation viewer.** Messages were shown as raw text — headings, lists, tables and code fences all appeared as literal markup. They are rendered now (markdown-it with `html:false`, so raw HTML in a message is escaped rather than executed). Tool output and thinking blocks stay verbatim. Copy and "Save as Markdown" still emit the original markdown source, not the flattened text, and code blocks stay left-to-right when the viewer is flipped to RTL.

**Newest message first.** The viewer opened at the oldest message with the newest one collapsed at the bottom of a long scroll. It now lists newest-first with the newest message expanded. Exported markdown stays chronological.

**Date buckets follow local time.** Today/Yesterday grouping in the sidebar compared UTC days, so in UTC+2/+3 everything after ~21:00 landed under "Yesterday".

## 0.2.0 — Sound library + RTL on by default

**Sound library.** The Sounds panel is no longer limited to a Default/Alternative pair. There's now a shared pool of sounds (the 4 originals plus 13 new effects), and each event picks any sound from the full list:

- Two categories — **When Claude finishes** (Stop) and **When Claude asks / needs you** (Notification) — each shows the whole pool with a per-row preview ▶.
- If a sound is already chosen for the *other* category, it's flagged in this one with a small **`!`** badge whose tooltip reads "Already selected for …". Reusing the same sound is still allowed — the badge is just a heads-up.
- New config keys `benefit.sounds.stopSound` / `benefit.sounds.notificationSound` hold a filename from the pool. (They replace the old `stopVariant` / `notificationVariant`; existing installs fall back to the default sounds and can re-pick from the panel.)
- mp3 and wav are both supported — the new effects ship as mp3 (≈10× smaller than wav) and play on both Windows (MediaPlayer) and macOS (`afplay`).

**RTL on by default.** `benefit.rtl.mode` now defaults to `active` instead of `off`, so a fresh install shows the RTL toggle and applies RTL without a trip to Settings. (Existing installs keep whatever value they already saved.)

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
