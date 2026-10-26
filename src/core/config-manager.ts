import * as vscode from "vscode";
import { isThemePreference, ThemePreference } from "../shared/theme-resolve";

const ROOT_SECTION = "benefit";

export type RtlMode = "off" | "active" | "always" | "auto";
export type ChatsGroupBy = "date" | "project" | "flat";
export type ChatsSortOrder = "newest" | "oldest";
export type ChatsScope = "currentWorkspace" | "all";

export interface BenefitConfig {
  appearance: {
    /** Auto follows the editor; high contrast in the editor always wins. */
    theme: ThemePreference;
  };
  rtl: {
    enabled: boolean;
    mode: RtlMode;
    textFont: string;
    codeFont: string;
    claudeCodePathOverride: string;
  };
  sounds: {
    enabled: boolean;
    /** Filename (within the bundled sound pool) to play when Claude finishes. */
    stopSound: string;
    /** Filename (within the bundled sound pool) to play when Claude needs you. */
    notificationSound: string;
    cleanupOnDeactivate: boolean;
    /** A new project gets a "finished" sound no other project uses. */
    autoAssign: boolean;
  };
  popup: {
    enabled: boolean;
    /** Pop up when the agent finishes a reply. */
    onDone: boolean;
    /** Pop up when the agent is waiting for you (permission, question). */
    onWaiting: boolean;
    /** How long the popup stays up (hovering pauses the countdown). */
    seconds: number;
    /** Keep the popup up until it is clicked or closed; `seconds` is not used then. */
    stayUntilClicked: boolean;
  };
  chats: {
    enabled: boolean;
    scope: ChatsScope;
    groupBy: ChatsGroupBy;
    sortOrder: ChatsSortOrder;
    showArchived: boolean;
    hideEmpty: boolean;
    confirmDelete: boolean;
    showStatusBarRename: boolean;
    /** Copy button on every code block in the conversation viewer. */
    codeCopyButtons: boolean;
    /** Per-message "Open in md-he" button in the conversation viewer. */
    mdHeButton: boolean;
  };
  windowColor: {
    enabled: boolean;
    /** A new project gets a window color no other project uses. */
    autoAssign: boolean;
  };
  htmlOpen: {
    enabled: boolean;
    /** Full path to a browser executable; empty = system default browser. */
    browserPath: string;
    /** The Benefits button that opens a Markdown file in md-he. */
    mdHe: boolean;
  };
}

function raw(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(ROOT_SECTION);
}

function readWith<T>(key: string, fallback: T): T {
  const value = raw().get<T>(key);
  return value === undefined ? fallback : value;
}

export function readConfig(): BenefitConfig {
  const theme = readWith<unknown>("appearance.theme", "auto");
  return {
    appearance: {
      theme: isThemePreference(theme) ? theme : "auto",
    },
    rtl: {
      enabled: readWith("rtl.enabled", true),
      mode: readWith<RtlMode>("rtl.mode", "active"),
      textFont: readWith("rtl.textFont", ""),
      codeFont: readWith("rtl.codeFont", ""),
      claudeCodePathOverride: readWith("rtl.claudeCodePathOverride", ""),
    },
    sounds: {
      enabled: readWith("sounds.enabled", true),
      stopSound: readWith("sounds.stopSound", "stop-default.wav"),
      notificationSound: readWith("sounds.notificationSound", "notify-default.wav"),
      cleanupOnDeactivate: readWith("sounds.cleanupOnDeactivate", false),
      autoAssign: readWith("sounds.autoAssign", true),
    },
    popup: {
      enabled: readWith("popup.enabled", true),
      onDone: readWith("popup.onDone", true),
      onWaiting: readWith("popup.onWaiting", true),
      seconds: readWith("popup.seconds", 8),
      stayUntilClicked: readWith("popup.stayUntilClicked", false),
    },
    chats: {
      enabled: readWith("chats.enabled", true),
      scope: readWith<ChatsScope>("chats.scope", "currentWorkspace"),
      groupBy: readWith<ChatsGroupBy>("chats.groupBy", "date"),
      sortOrder: readWith<ChatsSortOrder>("chats.sortOrder", "newest"),
      showArchived: readWith("chats.showArchived", false),
      hideEmpty: readWith("chats.hideEmpty", true),
      confirmDelete: readWith("chats.confirmDelete", true),
      showStatusBarRename: readWith("chats.showStatusBarRename", true),
      codeCopyButtons: readWith("chats.codeCopyButtons", true),
      mdHeButton: readWith("chats.mdHeButton", true),
    },
    windowColor: {
      enabled: readWith("windowColor.enabled", true),
      autoAssign: readWith("windowColor.autoAssign", true),
    },
    htmlOpen: {
      enabled: readWith("htmlOpen.enabled", true),
      browserPath: readWith("htmlOpen.browserPath", ""),
      mdHe: readWith("htmlOpen.mdHe", true),
    },
  };
}

/** Read any boolean benefit.* setting by key, e.g. "chats.enabled". */
export function readFlag(key: string, fallback = true): boolean {
  return readWith(key, fallback);
}

export async function updateConfig(key: string, value: unknown, target = vscode.ConfigurationTarget.Global): Promise<void> {
  await raw().update(key, value, target);
}

/**
 * Update a setting where the effective value actually changes.
 *
 * Writing to Global unconditionally is a trap for view toggles: if the key also
 * has a workspace value, the workspace value keeps winning and the toggle looks
 * dead — it flips the global setting forever while the UI never moves. So write
 * to Workspace when a workspace value exists, Global otherwise.
 */
export async function updateConfigEffective(key: string, value: unknown): Promise<void> {
  const cfg = raw();
  const target =
    cfg.inspect(key)?.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await cfg.update(key, value, target);
}

export function onConfigChanged(handler: (cfg: BenefitConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(ROOT_SECTION)) {
      handler(readConfig());
    }
  });
}

export function affects(event: vscode.ConfigurationChangeEvent, key: string): boolean {
  return event.affectsConfiguration(`${ROOT_SECTION}.${key}`);
}
