import * as vscode from "vscode";

const ROOT_SECTION = "benefit";

export type RtlMode = "off" | "active" | "always" | "auto";
export type SoundVariant = "default" | "alt";
export type ChatsGroupBy = "date" | "project" | "flat";
export type ChatsSortOrder = "newest" | "oldest";

export interface BenefitConfig {
  rtl: {
    enabled: boolean;
    mode: RtlMode;
    textFont: string;
    codeFont: string;
    claudeCodePathOverride: string;
  };
  sounds: {
    enabled: boolean;
    stopVariant: SoundVariant;
    notificationVariant: SoundVariant;
    cleanupOnDeactivate: boolean;
  };
  chats: {
    enabled: boolean;
    groupBy: ChatsGroupBy;
    sortOrder: ChatsSortOrder;
    showArchived: boolean;
    hideEmpty: boolean;
    confirmDelete: boolean;
    showStatusBarRename: boolean;
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
  return {
    rtl: {
      enabled: readWith("rtl.enabled", true),
      mode: readWith<RtlMode>("rtl.mode", "off"),
      textFont: readWith("rtl.textFont", ""),
      codeFont: readWith("rtl.codeFont", ""),
      claudeCodePathOverride: readWith("rtl.claudeCodePathOverride", ""),
    },
    sounds: {
      enabled: readWith("sounds.enabled", true),
      stopVariant: readWith<SoundVariant>("sounds.stopVariant", "default"),
      notificationVariant: readWith<SoundVariant>("sounds.notificationVariant", "default"),
      cleanupOnDeactivate: readWith("sounds.cleanupOnDeactivate", false),
    },
    chats: {
      enabled: readWith("chats.enabled", true),
      groupBy: readWith<ChatsGroupBy>("chats.groupBy", "date"),
      sortOrder: readWith<ChatsSortOrder>("chats.sortOrder", "newest"),
      showArchived: readWith("chats.showArchived", false),
      hideEmpty: readWith("chats.hideEmpty", true),
      confirmDelete: readWith("chats.confirmDelete", true),
      showStatusBarRename: readWith("chats.showStatusBarRename", true),
    },
  };
}

export async function updateConfig(key: string, value: unknown, target = vscode.ConfigurationTarget.Global): Promise<void> {
  await raw().update(key, value, target);
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
