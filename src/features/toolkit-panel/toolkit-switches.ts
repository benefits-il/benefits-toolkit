/**
 * Every on/off switch the Toolkit panel shows. Each one is a boolean
 * benefit.* setting (default true); the FeatureRegistry already reacts to
 * those at runtime, so flipping a switch is all it takes.
 */
export interface ToolkitSwitch {
  /** Setting key under "benefit." (e.g. "chats.enabled"). */
  key: string;
  label: string;
  hint: string;
  /** Key of the switch this one belongs to: shown indented, inert while the parent is off. */
  parent?: string;
}

export const TOOLKIT_SWITCHES: readonly ToolkitSwitch[] = [
  {
    key: "chats.enabled",
    label: "Chats list",
    hint: "Your past conversations in the sidebar, with a viewer.",
  },
  {
    key: "chats.codeCopyButtons",
    label: "Copy button on code blocks",
    hint: "In the conversation viewer.",
    parent: "chats.enabled",
  },
  {
    key: "chats.mdHeButton",
    label: "\"Open in md-he\" button",
    hint: "Read any message comfortably at benefits-il.dev/md-he.",
    parent: "chats.enabled",
  },
  {
    key: "sounds.enabled",
    label: "Sounds",
    hint: "A sound when Claude finishes or needs you.",
  },
  {
    key: "rtl.enabled",
    label: "RTL in Claude Code chat",
    hint: "Right-to-left support for Hebrew, Arabic and Persian.",
  },
  {
    key: "windowColor.enabled",
    label: "Window colors",
    hint: "Color each window so projects are easy to tell apart.",
  },
  {
    key: "htmlOpen.enabled",
    label: "Open HTML in browser",
    hint: "A button on .html files that opens them in your real browser.",
  },
];
