import type { IconName } from "../../shared/icons";
import { THEME_PREFERENCES } from "../../shared/theme-resolve";

export type PageId = "appearance" | "windowColor" | "sounds" | "popup" | "chats" | "agents" | "rtl" | "htmlOpen" | "diagnostics";

/** One row of the Settings home list, and the page it opens. */
export interface SettingsPage {
  id: PageId;
  title: string;
  summary: string;
  icon: IconName;
  /** The feature's on/off setting (under "benefit."), shown at the top of its page. */
  switchKey?: string;
  /** The label of that switch. */
  switchLabel?: string;
}

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  { id: "appearance", title: "Appearance", summary: "Auto, light or dark", icon: "contrast" },
  { id: "windowColor", title: "Window colors", summary: "One color per project window", icon: "palette", switchKey: "windowColor.enabled", switchLabel: "Enable window colors" },
  { id: "sounds", title: "Sounds", summary: "When an agent finishes or waits", icon: "volume", switchKey: "sounds.enabled", switchLabel: "Enable sounds" },
  { id: "popup", title: "Desktop popup", summary: "Desktop alert with project name", icon: "bell", switchKey: "popup.enabled", switchLabel: "Enable desktop popup" },
  { id: "chats", title: "Conversations", summary: "Chat list and viewer", icon: "messages", switchKey: "chats.enabled", switchLabel: "Enable conversations" },
  { id: "agents", title: "Cursor and Antigravity", summary: "Their own agents: alerts and chats", icon: "robot" },
  { id: "rtl", title: "RTL in Claude Code", summary: "Right-to-left in the Claude chat", icon: "letterBet", switchKey: "rtl.enabled", switchLabel: "Enable RTL" },
  { id: "htmlOpen", title: "Open in browser", summary: "HTML files, and Markdown in md-he", icon: "browser", switchKey: "htmlOpen.enabled", switchLabel: "Enable Open in browser" },
  { id: "diagnostics", title: "Troubleshooting", summary: "Hooks and connection", icon: "plug" },
];

export type SettingSpec =
  | { kind: "boolean" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "string"; max: number }
  | { kind: "number"; min: number; max: number };

const BOOL: SettingSpec = { kind: "boolean" };
const PATH: SettingSpec = { kind: "string", max: 500 };

/**
 * Every setting (under "benefit.") the sidebar may write, and what it accepts.
 * The sound choices are not here: the page names a sound, and the extension
 * checks it against the sounds it ships. The Claude Code folder override is not
 * here either: it stays in settings.json, out of reach of a stray click.
 */
export const WRITABLE_SETTINGS: Readonly<Record<string, SettingSpec>> = {
  "appearance.theme": { kind: "enum", values: THEME_PREFERENCES },
  "appearance.brandFolded": BOOL,
  "windowColor.enabled": BOOL,
  "windowColor.autoAssign": BOOL,
  "sounds.enabled": BOOL,
  "sounds.autoAssign": BOOL,
  "sounds.cleanupOnDeactivate": BOOL,
  "popup.enabled": BOOL,
  "popup.onDone": BOOL,
  "popup.onWaiting": BOOL,
  "popup.seconds": { kind: "number", min: 3, max: 60 },
  "popup.stayUntilClicked": BOOL,
  "popup.position": { kind: "enum", values: ["topRight", "bottomRight"] },
  "chats.enabled": BOOL,
  "chats.scope": { kind: "enum", values: ["currentWorkspace", "all"] },
  "chats.groupBy": { kind: "enum", values: ["date", "project", "flat"] },
  "chats.sortOrder": { kind: "enum", values: ["newest", "oldest"] },
  "chats.showArchived": BOOL,
  "chats.hideEmpty": BOOL,
  "chats.confirmDelete": BOOL,
  "chats.showStatusBarRename": BOOL,
  "chats.codeCopyButtons": BOOL,
  "chats.mdHeButton": BOOL,
  "chats.newChatButton": BOOL,
  "chats.newChatOpens": { kind: "enum", values: ["editor", "claudeCode"] },
  "chats.openInAgentButton": BOOL,
  "chats.viewerOpens": { kind: "enum", values: ["beside", "active"] },
  "agents.cursor": BOOL,
  "agents.antigravity": BOOL,
  "agents.cursorOwnAlertsOff": BOOL,
  "agents.antigravityOwnAlertsOff": BOOL,
  "rtl.enabled": BOOL,
  "rtl.mode": { kind: "enum", values: ["active", "always", "auto"] },
  "rtl.textFont": { kind: "string", max: 200 },
  "rtl.codeFont": { kind: "string", max: 200 },
  "htmlOpen.enabled": BOOL,
  "htmlOpen.mdHe": BOOL,
  "htmlOpen.browserPath": PATH,
};

/** The value to write for a key the page sent, or undefined when the page asked for something it may not. */
export function checkSetting(key: string, value: unknown): boolean | string | number | undefined {
  const spec = Object.prototype.hasOwnProperty.call(WRITABLE_SETTINGS, key) ? WRITABLE_SETTINGS[key] : undefined;
  if (!spec) return undefined;
  switch (spec.kind) {
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? value : undefined;
    case "string":
      return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, spec.max) : undefined;
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
      return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, Math.round(n))) : undefined;
    }
  }
}
