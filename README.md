# Benefit's Toolkit

Quality-of-life tools for [Claude Code](https://github.com/anthropics/claude-code) inside VS Code, bundled into a single extension.

Three features in one place:

- **RTL** — Right-to-left support in the Claude Code chat (Active / Always / Auto modes), for Hebrew, Arabic, Persian.
- **Sounds** — Audio notification when Claude finishes a message or asks for your input. Two variants per slot — pick what you like.
- **Chats** — A sidebar list of your past Claude Code conversations. Rename, archive, restore, search, export to Markdown, view inline.

## Install

Until the marketplace listing is ready, install the packaged `.vsix` directly:

```
code --install-extension benefits-toolkit-<version>.vsix
```

After installing, look for the activity bar icon — it opens the **Claude Chats** sidebar.

## Configuration

All settings live under `benefit.*`. Each feature has an `enabled` toggle so you can disable individual features without uninstalling the extension.

## Status

This is a fresh release built by Ben Akiva. Tested primarily on Windows.

## Inspired by

This toolkit was inspired by the experience of using these community extensions in parallel:

- [Claude Code RTL](https://marketplace.visualstudio.com/items?itemName=yechielby.claude-code-rtl) by Yechiel Brand
- [Claude Chats](https://marketplace.visualstudio.com/items?itemName=alexzanfir.claude-chats) by Alex Zanfir
- [claude-sound-hooks](https://github.com/) — Claude Code hooks for audio notifications

No code from those extensions is included here — this is a clean-room rewrite.

## License

MIT © Ben Akiva
