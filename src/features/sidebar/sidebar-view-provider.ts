import * as vscode from "vscode";
import { onConfigChanged, readConfig, updateConfig, updateConfigEffective } from "../../core/config-manager";
import { logger } from "../../core/logger";
import { currentTheme, onThemeChanged } from "../../core/theme";
import { AGENT_NAMES, editorAgent } from "../../shared/agents";
import { BENEFITS_URL } from "../../shared/brand-bar";
import { currentPlatform } from "../../shared/platform-detector";
import { brandFontUris, panelResourceRoots } from "../../shared/webview-fonts";
import { AgentHookTarget } from "../alerts/services/agent-hooks";
import { AlertAssets, SoundSlot } from "../alerts/services/alert-assets";
import { CURSOR_SETTINGS_COMMAND } from "../alerts/services/native-alerts";
import { HookInstaller } from "../alerts/services/hook-installer";
import { onProjectPrefsChanged, ProjectPrefsStore } from "../alerts/services/project-prefs-store";
import { playPreview } from "../alerts/services/sound-player";
import { playProjectSounds } from "../alerts/services/sound-test";
import type { ChatsController } from "../chats/chats-controller";
import { chatsHub } from "../chats/chats-hub";
import { NEW_CHAT_COMMANDS, newChatAgent } from "../chats/services/new-chat";
import { installedFonts } from "../rtl/services/font-catalog";
import { lastOnMode, setMode, switchRtlOff, switchRtlOn } from "../rtl/services/rtl-mode-state";
import { foregroundFor, normalizeHex } from "../window-color/services/color-utils";
import { WindowColorService } from "../window-color/services/window-color-service";
import { checkSetting, PageId, SETTINGS_PAGES, WRITABLE_SETTINGS } from "./settings-catalog";
import { SidebarChats, sidebarHtml, SidebarState } from "./sidebar-html";

const SLOTS: readonly SoundSlot[] = ["stop", "notification"];
const SLOT_CONFIG_KEY: Record<SoundSlot, string> = { stop: "sounds.stopSound", notification: "sounds.notificationSound" };
const CHAT_ACTIONS = ["open", "rename", "archive", "restore", "delete", "export"] as const;
type ChatAction = (typeof CHAT_ACTIONS)[number];

interface SidebarMessage {
  type?: string;
  key?: string;
  value?: unknown;
  scope?: string;
  slot?: string;
  hex?: string;
  action?: string;
  id?: string;
}

function projectFolders(): vscode.WorkspaceFolder[] {
  return (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file");
}

/**
 * The toolkit's sidebar: one webview with Chats and Settings. Registered
 * unconditionally, since Settings is how a feature that is off comes back.
 * The page only asks; this side checks every request and carries it out.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "benefit.sidebar";

  private view: vscode.WebviewView | undefined;
  private readonly assets: AlertAssets;
  private readonly prefs: ProjectPrefsStore;
  private readonly colors: WindowColorService;
  /** Where to go once the page is ready (a command ran before the view existed). */
  private pending: { tab: "chats" | "settings"; page?: PageId | null } | undefined;
  /** A conversation to select in the list once the page is ready ("Show in list"). */
  private pendingReveal: string | undefined;
  private controllerSubs: vscode.Disposable[] = [];
  private chatsShown = false;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.assets = new AlertAssets(ctx);
    this.prefs = new ProjectPrefsStore(ctx);
    this.colors = new WindowColorService(ctx);
  }

  /** Show the sidebar on a tab (and maybe a Settings page): commands and notifications use this. */
  async navigate(tab: "chats" | "settings", page?: PageId | null): Promise<void> {
    this.pending = { tab, page };
    await vscode.commands.executeCommand(`${SidebarViewProvider.viewType}.focus`);
    if (this.view) this.flushPending();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: panelResourceRoots(this.ctx.extensionUri) };
    view.webview.html = sidebarHtml(brandFontUris(view.webview, this.ctx.extensionUri), currentTheme(), editorAgent(vscode.env.uriScheme));
    view.webview.onDidReceiveMessage((msg: SidebarMessage) => void this.onMessage(msg));

    const subs = [
      onConfigChanged(() => void this.postState()),
      onThemeChanged(() => void this.postState()),
      onProjectPrefsChanged(() => void this.postState()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()),
      // The window color lives in workbench.colorCustomizations, not benefit.*.
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("workbench.colorCustomizations")) void this.postState();
      }),
      chatsHub.onDidChange(() => this.watchController()),
    ];
    this.watchController();
    view.onDidDispose(() => {
      subs.forEach((s) => s.dispose());
      this.controllerSubs.forEach((s) => s.dispose());
      this.controllerSubs = [];
      this.view = undefined;
    });
  }

  /** Follow the conversations feature: its list, the viewer in focus, "Show in list". */
  private watchController(): void {
    this.controllerSubs.forEach((s) => s.dispose());
    this.controllerSubs = [];
    const c = chatsHub.controller;
    if (c) {
      this.controllerSubs.push(
        c.onDidChange(() => void this.postChats()),
        c.viewer.onDidChangeActive(() => void this.postChats()),
        c.onDidReveal((id) => {
          // The view may still be loading (first time in this window): reveal once it is ready.
          this.pendingReveal = id;
          this.flushPending();
        }),
      );
    }
    this.chatsShown = false;
    void this.postChats();
  }

  private flushPending(): void {
    if (!this.view) return;
    if (this.pending) {
      void this.view.webview.postMessage({ type: "navigate", tab: this.pending.tab, page: this.pending.page ?? null });
      this.pending = undefined;
    }
    if (this.pendingReveal) {
      void this.view.webview.postMessage({ type: "reveal", id: this.pendingReveal });
      this.pendingReveal = undefined;
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) return;
    const cfg = readConfig();
    const platform = currentPlatform();
    let installed = false;
    if (platform !== "unsupported") {
      try {
        installed = await new HookInstaller(this.assets, platform, () => undefined).isInstalled();
      } catch {
        installed = false;
      }
    }
    const agents: SidebarState["agents"] = { cursor: { present: false, hooked: false }, antigravity: { present: false, hooked: false } };
    if (platform !== "unsupported") {
      for (const agent of ["cursor", "antigravity"] as const) {
        const target = new AgentHookTarget(agent, platform);
        agents[agent] = {
          present: await target.present(),
          hooked: await target.isInstalled().catch(() => false),
        };
      }
    }
    const sounds = await this.assets.listSounds().catch(() => []);
    const folders = projectFolders();
    const folder = folders[0];
    const raw = vscode.workspace.getConfiguration("benefit");
    const values: Record<string, boolean | string | number> = {};
    for (const key of Object.keys(WRITABLE_SETTINGS)) {
      const v = raw.get<unknown>(key);
      if (typeof v === "boolean" || typeof v === "string" || typeof v === "number") values[key] = v;
    }
    values["appearance.theme"] = cfg.appearance.theme;
    // The mode list has no "off": that is the main switch.
    if (values["rtl.mode"] === "off") values["rtl.mode"] = lastOnMode(this.ctx.globalState);
    // A hand-edited color may not be #rrggbb: shown as no color then.
    const hex = normalizeHex(this.colors.getCurrentColor() ?? "");

    const state: SidebarState = {
      theme: currentTheme(),
      values,
      platform: { alerts: platform !== "unsupported", popup: platform === "win32" || platform === "darwin" },
      project: folder
        ? {
            folderName: folder.name,
            folderCount: folders.length,
            popupName: this.prefs.name(folder.uri.fsPath) ?? null,
            color: hex ? { hex, text: foregroundFor(hex) } : null,
            stashedColor: this.colors.getStashedColor() ?? null,
          }
        : null,
      sounds: {
        labels: Object.fromEntries(sounds.map((s) => [s.id, s.label])),
        defaults: { stop: cfg.sounds.stopSound, notification: cfg.sounds.notificationSound },
        overrides: folder ? this.prefs.sounds(folder.uri.fsPath) : {},
      },
      hooks: { wanted: cfg.sounds.enabled || cfg.popup.enabled, installed },
      agents,
      fonts: await installedFonts(),
    };
    void this.view.webview.postMessage({ type: "state", state });
  }

  private async postChats(): Promise<void> {
    if (!this.view) return;
    const controller = chatsHub.controller;
    const base = { active: controller?.viewer.activePath() ?? null, projectName: projectFolders()[0]?.name ?? null };
    if (!controller) {
      this.post({ type: "chats", chats: { ...base, list: null } satisfies SidebarChats });
      return;
    }
    // The first time, show the loading state; after that, keep the old list until the new one is in.
    if (!this.chatsShown) this.post({ type: "chats", chats: { ...base, list: null } satisfies SidebarChats });
    const list = await controller.list();
    if (chatsHub.controller !== controller) return;
    this.chatsShown = true;
    this.post({ type: "chats", chats: { ...base, list } satisfies SidebarChats });
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  private async onMessage(msg: SidebarMessage): Promise<void> {
    const slot = SLOTS.find((s) => s === msg.slot);
    const folder = projectFolders()[0];
    try {
      switch (msg.type) {
        case "ready":
          await this.postState();
          this.chatsShown = false;
          await this.postChats();
          this.flushPending();
          return;
        case "set":
          if (typeof msg.key === "string") await this.set(msg.key, msg.value);
          return;
        case "setPopupName":
          // The registry writer hears the change and rewrites the record the
          // dispatcher reads, so the next popup already shows the new name.
          if (folder) await this.prefs.setName(folder.uri.fsPath, String(msg.value ?? ""));
          return;
        case "setSound":
          if (slot) await this.setSound(slot, msg.scope === "project", msg.id);
          return;
        case "previewSound": {
          if (!slot) return;
          const defaults = readConfig().sounds;
          const own = msg.scope === "project" && folder ? this.prefs.sounds(folder.uri.fsPath)[slot] : undefined;
          await playPreview(this.assets.bundledAssetPath(own ?? (slot === "stop" ? defaults.stopSound : defaults.notificationSound)));
          return;
        }
        case "testSounds":
          await playProjectSounds(this.assets, this.prefs);
          return;
        case "testPopup":
          await vscode.commands.executeCommand("benefit.popup.test");
          return;
        case "pickColor": {
          const hex = typeof msg.hex === "string" ? normalizeHex(msg.hex) : undefined;
          if (hex && readConfig().windowColor.enabled) await this.colors.apply(hex);
          return;
        }
        case "clearColor":
          await this.colors.clear();
          await this.postState();
          return;
        case "reconnect":
          await vscode.commands.executeCommand("benefit.sounds.install");
          setTimeout(() => void this.postState(), 900);
          return;
        case "disconnect":
          await vscode.commands.executeCommand("benefit.sounds.uninstall");
          setTimeout(() => void this.postState(), 900);
          return;
        case "showLog":
          logger.show();
          return;
        case "openBrand":
          await vscode.env.openExternal(vscode.Uri.parse(BENEFITS_URL));
          return;
        case "newChat":
          await this.startNewChat();
          return;
        case "openCursorSettings":
          await vscode.commands.executeCommand(CURSOR_SETTINGS_COMMAND);
          return;
        case "openFolder":
          await vscode.commands.executeCommand("workbench.action.files.openFolder");
          return;
        case "refreshChats":
          chatsHub.controller?.refresh();
          return;
        case "chat":
          await this.chatAction(msg.action, msg.id);
          return;
      }
    } catch (err) {
      logger.error("sidebar", `Sidebar action '${msg.type}' failed`, err);
      vscode.window.showErrorMessage(`Benefit: ${(err as Error).message}`);
    }
  }

  /** New chat: this editor's own agent, or Claude Code when the setting says so. */
  private async startNewChat(): Promise<void> {
    const agent = newChatAgent(editorAgent(vscode.env.uriScheme), readConfig().chats.newChatOpens);
    const command = NEW_CHAT_COMMANDS[agent];
    if (!(await vscode.commands.getCommands(true)).includes(command)) {
      const name = agent === "claude" ? "Claude Code" : `${AGENT_NAMES[agent]} Agent`;
      vscode.window.showWarningMessage(`Benefit: ${name} is not available in this editor.`);
      return;
    }
    await vscode.commands.executeCommand(command);
  }

  /** A setting the page changed: only keys and values the catalog allows. */
  private async set(key: string, raw: unknown): Promise<void> {
    const value = checkSetting(key, raw);
    if (value === undefined) {
      logger.warn("sidebar", `Refused a setting the page may not write: ${key}`);
      return;
    }
    // RTL off means off everywhere: the mode goes off with it, and turning it
    // on returns to the mode used last.
    if (key === "rtl.enabled") {
      await updateConfigEffective(key, value);
      if (value) await switchRtlOn(this.ctx.globalState);
      else await switchRtlOff(this.ctx.globalState);
      return;
    }
    if (key === "rtl.mode") {
      await setMode(value as "active" | "always" | "auto", this.ctx.globalState);
      return;
    }
    await updateConfigEffective(key, value);
  }

  /**
   * A sound clicked in the page's list: play it and keep it. For a project, ""
   * means "Same as all projects". Only sounds the toolkit ships are accepted.
   */
  private async setSound(slot: SoundSlot, forProject: boolean, raw: unknown): Promise<void> {
    if (typeof raw !== "string") return;
    const sounds = await this.assets.listSounds();
    const defaults = readConfig().sounds;
    const defaultId = slot === "stop" ? defaults.stopSound : defaults.notificationSound;
    const id = raw === "" && forProject ? "" : sounds.find((s) => s.id === raw)?.id;
    if (id === undefined) return;
    await playPreview(this.assets.bundledAssetPath(id || defaultId)).catch((err) => logger.warn("sidebar", "Sound preview failed", err));
    if (forProject) {
      const folder = projectFolders()[0];
      if (folder) await this.prefs.setSound(folder.uri.fsPath, slot, id || undefined);
      return;
    }
    if (id !== defaultId) await updateConfig(SLOT_CONFIG_KEY[slot], id);
  }

  private async chatAction(action: unknown, id: unknown): Promise<void> {
    const controller: ChatsController | undefined = chatsHub.controller;
    if (!controller || typeof id !== "string" || !CHAT_ACTIONS.includes(action as ChatAction)) return;
    // Only conversations the list holds: the page never names arbitrary files.
    const meta = controller.find(id);
    if (!meta) return;
    switch (action as ChatAction) {
      case "open": return controller.open(meta);
      case "rename": return controller.rename(meta);
      case "archive": return controller.archive(meta);
      case "restore": return controller.restore(meta);
      case "delete": return controller.delete(meta);
      case "export": return controller.exportFull(meta);
    }
  }
}

export function isPageId(value: unknown): value is PageId {
  return SETTINGS_PAGES.some((p) => p.id === value);
}
