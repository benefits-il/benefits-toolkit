# Changelog

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
