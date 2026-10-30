# Benefit's Toolkit

**Part of [Benefits](https://benefits-il.dev/)** **·** the course that teaches you to work right with AI.
<br>*AI that finally fits · Ben Akiva*

Quality-of-life tools for [Claude Code](https://github.com/anthropics/claude-code) and for the agents built into Cursor and Antigravity, bundled into a single extension that runs in VS Code, Cursor and Antigravity.

Five features in one place:

- **RTL** — Right-to-left support in the Claude Code chat (Active / Always / Auto modes), for Hebrew, Arabic, Persian. A code block of Hebrew text, such as a prompt to copy, reads right to left and wraps its lines; real code stays left to right.
- **Alerts** — Know when the agent is done without watching it:
  - **Sounds** when Claude finishes a message or asks for your input, and when Cursor's or Antigravity's agent finishes. Pick any sound from a shared library for each event, hearing each one as you click it, as a default for all projects or just for this one. A new project gets a "finished" sound no other project uses, so each window sounds different.
  - **Popup** (Windows and macOS): a small card framed in the project's window color, with its name (the folder's, or one you type in Settings). It springs in from the screen edge and flashes its frame once. Click it to jump straight back to that window; drag it anywhere and later popups show there too. More alerts from the same window raise a counter on its card instead of stacking new ones. It never shows while you're already in that window, and it can stay until you click it, shrunk to a small pill after the usual seconds.
- **Chats**: a sidebar list of your past conversations with Claude Code, Cursor's agent and Antigravity's agent, each with its time and a small ring for how full its context is. Rename, archive, restore, search, export to Markdown, and a viewer that reads like a closed thread: every message in a card marked by its speaker, closed to its first lines until you open it, with only the latest answer open, and Claude's tool calls and notes folded into one line. It has find in the conversation, a left-to-right or right-to-left switch for Hebrew, file links that open the file right in the editor, a Copy button on every code block, and an "Open in md-he" button that opens any message at [benefits-il.dev/md-he](https://benefits-il.dev/md-he/) for comfortable reading. An open conversation takes in new messages as the agent writes them. A button on a hovered row (and in the viewer) opens the conversation in its agent's own chat, in an editor tab.
- **Colors**: give each editor window its own color (title, activity and status bars), so five open projects stop looking identical. A new project gets a color no other project uses; pick another of the 38 in Settings, or type a hex.
- **Open in browser**: a Benefits button on HTML files, in the editor title bar and the Explorer's right-click menu, opens them in your browser. The same button on Markdown files opens them in [md-he](https://benefits-il.dev/md-he/). Uses the system default browser, or set `benefit.htmlOpen.browserPath` to force a specific one (e.g. Chrome).

The sidebar has two tabs: **Chats**, your conversations, and **Settings**, one page per feature. Every feature can be switched off (and back on) in Settings, including the popup and each of its two triggers. The sidebar, the viewer and the popup follow one theme: Auto (the editor's), Light or Dark. In a narrow sidebar the words turn into icons.

## Works in

Every feature works in all three editors. What changes is which agent it serves.

| Feature | VS Code | Cursor | Antigravity | Agents |
|---|:-:|:-:|:-:|---|
| Conversation list and viewer | ✓ | ✓ | ✓ | All three agents |
| Sound and popup when the agent finishes | ✓ | ✓ | ✓ | All three agents |
| New chat button | ✓ | ✓ | ✓ | The editor's agent, or Claude Code |
| Open in the agent's own chat | ✓ | ✓ | ✓ | Claude Code; Cursor's agent inside Cursor |
| Window colors | ✓ | ✓ | ✓ | Any agent |
| Open in browser and md-he | ✓ | ✓ | ✓ | Any agent |
| Right-to-left chat | ✓ | ✓ | ✓ | Claude Code |
| Alert when the agent needs input | ✓ | ✓ | ✓ | Claude Code |

- Cursor and Antigravity conversations open for reading, and you can save them as Markdown.
- Open in the agent's own chat works for this window's own conversations: Claude Code's wherever Claude Code is installed, and Cursor's inside Cursor. Antigravity's agent cannot open a conversation by its id, so its conversations have no button.
- Right-to-left works in Claude Code's chat, in each of the editors. Cursor's and Antigravity's agents don't get it in their own chat; their conversations read right to left in the toolkit's viewer.
- In Cursor and Antigravity you can also turn off the editor's own alerts, so only the Benefits alert remains.
- Claude Code features need the Claude Code extension in that editor.

## Install

- **VS Code**: from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=benakiva.benefits-toolkit). Search for "Benefit's Toolkit" in the Extensions view.
- **Cursor and Antigravity**: from [Open VSX](https://open-vsx.org/extension/benakiva/benefits-toolkit). Search for "Benefit's Toolkit" in the Extensions view.

Or from the terminal (in Cursor, use `cursor` instead of `code`):

```
code --install-extension benakiva.benefits-toolkit
```

Offline / pre-release builds can be installed from the packaged `.vsix` on the [GitHub releases page](https://github.com/benefits-il/benefits-toolkit/releases).

After installing, look for the activity bar icon — it opens the **Benefit's Toolkit** sidebar.

## Configuration

All settings live under `benefit.*`. Each feature has an `enabled` toggle so you can disable individual features without uninstalling the extension — the **Settings** tab shows them all as switches. The two viewer buttons have their own switches: `benefit.chats.codeCopyButtons` and `benefit.chats.mdHeButton`.

## How alerts work

Claude Code's hooks (in `~/.claude/settings.json`) run a small dispatcher script from `~/.benefits-toolkit/bin`. Every open VS Code window keeps a record of its project in `~/.benefits-toolkit/projects`, with its name, window color, its own sounds and whether it's focused right now. The dispatcher uses those records to pick the sound and the popup. One popup process shows every card: it takes the jobs the dispatcher leaves in `~/.benefits-toolkit/state/popups`, and keeps the spot you dragged it to in `state/popup-place.json`. Settings are mirrored to `~/.benefits-toolkit/config.json`, so changing a sound never touches `settings.json`. Claude Code reads hooks when a session starts, so a session that was already running picks up a change only after a restart.

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
