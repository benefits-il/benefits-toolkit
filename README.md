# Benefit's Toolkit

**Part of [Benefits](https://benefits-il.dev/)** **·** the course that teaches you to work right with AI.
<br>הכלי הזה הוא חלק מ-Benefits **·** הקורס שמלמד לעבוד נכון עם בינה מלאכותית

Quality-of-life tools for [Claude Code](https://github.com/anthropics/claude-code) inside VS Code, bundled into a single extension.

Five features in one place:

- **RTL** — Right-to-left support in the Claude Code chat (Active / Always / Auto modes), for Hebrew, Arabic, Persian.
- **Alerts** — Know when Claude is done without watching it:
  - **Sounds** when Claude finishes a message or asks for your input. Pick any sound from a shared library for each event, as a default for all projects or just for this one, so each window can sound different.
  - **Popup** (Windows and macOS): a small card in the project's window color and name (the folder's, or one you type in the Alerts panel). Click it to jump straight back to that window. It never shows while you're already in that window.
- **Chats** — A sidebar list of your past Claude Code conversations. Rename, archive, restore, search, export to Markdown, view inline — with file links in the viewer that open the file right in VS Code, a Copy button on every code block, and an "Open in md-he" button that opens any message at [benefits-il.dev/md-he](https://benefits-il.dev/md-he/) for comfortable reading.
- **Colors** — Give each VS Code window its own color (title, activity and status bars), so five open projects stop looking identical. Pick from the Colors panel or a custom hex.
- **HTML Open** — One-click "Open in External Browser" for HTML files: a button in the editor title bar and an Explorer right-click entry. Uses the system default browser, or set `benefit.htmlOpen.browserPath` to force a specific one (e.g. Chrome).

Every feature can be switched off (and back on) from the **Toolkit** panel at the bottom of the sidebar, including the popup and each of its two triggers.

## Install

From the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=benakiva.benefits-toolkit) — search for "Benefit's Toolkit" in the Extensions view, or:

```
code --install-extension benakiva.benefits-toolkit
```

Offline / pre-release builds can be installed from the packaged `.vsix` on the [GitHub releases page](https://github.com/benefits-il/benefits-toolkit/releases).

After installing, look for the activity bar icon — it opens the **Claude Chats** sidebar.

## Configuration

All settings live under `benefit.*`. Each feature has an `enabled` toggle so you can disable individual features without uninstalling the extension — the **Toolkit** panel shows them all as switches. The two viewer buttons have their own switches: `benefit.chats.codeCopyButtons` and `benefit.chats.mdHeButton`.

## How alerts work

Claude Code's hooks (in `~/.claude/settings.json`) run a small dispatcher script from `~/.benefits-toolkit/bin`. Every open VS Code window keeps a record of its project in `~/.benefits-toolkit/projects`, with its name, window color, its own sounds and whether it's focused right now. The dispatcher uses those records to pick the sound and the popup. Settings are mirrored to `~/.benefits-toolkit/config.json`, so changing a sound never touches `settings.json`. Claude Code reads hooks when a session starts, so a session that was already running picks up a change only after a restart.

## Status

This is a fresh release built by Ben Akiva. Tested primarily on Windows. On Linux, alerts are sound-only (the default sounds, no popup).

## Inspired by

This toolkit was inspired by the experience of using these community extensions in parallel:

- [Claude Code RTL](https://marketplace.visualstudio.com/items?itemName=yechielby.claude-code-rtl) by Yechiel Brand
- [Claude Chats](https://marketplace.visualstudio.com/items?itemName=alexzanfir.claude-chats) by Alex Zanfir
- [claude-sound-hooks](https://github.com/) — Claude Code hooks for audio notifications

No code from those extensions is included here — this is a clean-room rewrite.

## Sound credits

The bundled notification/finish sounds are royalty-free effects from [Pixabay](https://pixabay.com/sound-effects/) (Pixabay Content License — free for commercial use, no attribution required) and [Mixkit](https://mixkit.co/free-sound-effects/) (Mixkit License — free for commercial projects, no attribution required). Credits are kept here as a courtesy to the creators (e.g. *universfield*, *dragon-studio*, *soundshelfstudio*, *phoenix_connection_brazil*).

## License

MIT © Ben Akiva
