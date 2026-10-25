# Benefit's Toolkit

**Part of [Benefits](https://benefits-il.dev/)** **·** the course that teaches you to work right with AI.
<br>הכלי הזה הוא חלק מ-Benefits **·** הקורס שמלמד לעבוד נכון עם בינה מלאכותית

Quality-of-life tools for [Claude Code](https://github.com/anthropics/claude-code) inside VS Code, bundled into a single extension.

Five features in one place:

- **RTL** — Right-to-left support in the Claude Code chat (Active / Always / Auto modes), for Hebrew, Arabic, Persian.
- **Sounds** — Audio notification when Claude finishes a message or asks for your input. Pick any sound from a shared library for each event; reused sounds are flagged so you can keep the two distinct.
- **Chats** — A sidebar list of your past Claude Code conversations. Rename, archive, restore, search, export to Markdown, view inline — with file links in the viewer that open the file right in VS Code, a Copy button on every code block, and an "Open in md-he" button that opens any message at [benefits-il.dev/md-he](https://benefits-il.dev/md-he/) for comfortable reading.
- **Colors** — Give each VS Code window its own color (title, activity and status bars), so five open projects stop looking identical. Pick from the Colors panel or a custom hex.
- **HTML Open** — One-click "Open in External Browser" for HTML files: a button in the editor title bar and an Explorer right-click entry. Uses the system default browser, or set `benefit.htmlOpen.browserPath` to force a specific one (e.g. Chrome).

Every feature can be switched off (and back on) from the **Toolkit** panel at the bottom of the sidebar.

## Install

From the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=benakiva.benefits-toolkit) — search for "Benefit's Toolkit" in the Extensions view, or:

```
code --install-extension benakiva.benefits-toolkit
```

Offline / pre-release builds can be installed from the packaged `.vsix` on the [GitHub releases page](https://github.com/benefits-il/benefits-toolkit/releases).

After installing, look for the activity bar icon — it opens the **Claude Chats** sidebar.

## Configuration

All settings live under `benefit.*`. Each feature has an `enabled` toggle so you can disable individual features without uninstalling the extension — the **Toolkit** panel shows them all as switches. The two viewer buttons have their own switches: `benefit.chats.codeCopyButtons` and `benefit.chats.mdHeButton`.

## Status

This is a fresh release built by Ben Akiva. Tested primarily on Windows.

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
