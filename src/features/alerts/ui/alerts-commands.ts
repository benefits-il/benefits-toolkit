import * as fs from "node:fs";
import * as vscode from "vscode";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { currentTheme } from "../../../core/theme";
import { foregroundFor, normalizeHex } from "../../window-color/services/color-utils";
import { WindowColorService } from "../../window-color/services/window-color-service";
import { AlertAssets } from "../services/alert-assets";
import { findEditorCli } from "../services/editor-cli";
import type { HookPlatform } from "../services/hook-command";
import { HookHealer } from "../services/hook-healer";
import { HookInstaller } from "../services/hook-installer";
import { ProjectPrefsStore } from "../services/project-prefs-store";
import { DEFAULT_POPUP_COLOR, showPopup } from "../services/popup-launcher";
import { playProjectSounds } from "../services/sound-test";

export interface AlertsServices {
  installer: HookInstaller;
  assets: AlertAssets;
  healer: HookHealer;
  prefs: ProjectPrefsStore;
  platform: HookPlatform;
}

function listDirSync(dir: string): string[] | undefined {
  try {
    return fs.readdirSync(dir);
  } catch {
    return undefined;
  }
}

export function registerAlertsCommands(
  ctx: vscode.ExtensionContext,
  { installer, assets, healer, prefs, platform }: AlertsServices,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand("benefit.sounds.install", async () => {
      try {
        healer.resume();
        await installer.install();
        vscode.window.showInformationMessage(
          "Benefit: alert hooks installed. New Claude sessions will use them (restart a running session to pick them up).",
        );
      } catch (err) {
        logger.error("alerts", "install failed", err);
        vscode.window.showErrorMessage(`Benefit: hook install failed. ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.sounds.uninstall", async () => {
      try {
        // Stop the healer first, otherwise it would immediately put the hooks
        // back when it sees settings.json change.
        healer.pause();
        await installer.uninstall();
        vscode.window.showInformationMessage("Benefit: alert hooks removed.");
      } catch (err) {
        logger.error("alerts", "uninstall failed", err);
        vscode.window.showErrorMessage(`Benefit: hook uninstall failed. ${(err as Error).message}`);
      }
    }),

    // The sounds are chosen on the sidebar's Sounds page, where each one plays
    // as it is clicked; the feature's config listener mirrors the choice into
    // config.json, which the dispatcher reads on every alert.
    vscode.commands.registerCommand("benefit.sounds.chooseSounds", () =>
      vscode.commands.executeCommand("benefit.settings.open", "sounds"),
    ),

    // This project's own sounds where it has them, like a real alert.
    vscode.commands.registerCommand("benefit.sounds.test", async () => {
      try {
        await playProjectSounds(assets, prefs);
      } catch (err) {
        vscode.window.showWarningMessage(`Benefit: preview failed. ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.sounds.status", async () => {
      const installed = await installer.isInstalled();
      const cfg = readConfig();
      const msg = installed
        ? `Benefit alerts: hooks INSTALLED. Sounds ${cfg.sounds.enabled ? "on" : "off"} (finished=${cfg.sounds.stopSound}, needs you=${cfg.sounds.notificationSound}); popup ${cfg.popup.enabled ? "on" : "off"}.`
        : "Benefit alerts: hooks not installed. Run 'Benefit: Sounds: Install Hooks' to enable.";
      vscode.window.showInformationMessage(msg);
    }),

    // The popup this window would get, shown now: same name and color as
    // the record the dispatcher reads for the (first) project folder.
    vscode.commands.registerCommand("benefit.popup.test", async () => {
      try {
        const folder = vscode.workspace.workspaceFolders?.find((f) => f.uri.scheme === "file");
        const color = normalizeHex(new WindowColorService(ctx).getCurrentColor() ?? "") ?? DEFAULT_POPUP_COLOR;
        await showPopup(
          {
            title: folder ? prefs.displayName(folder.uri.fsPath, folder.name) : "Benefit's Toolkit",
            subtitle: "Claude finished",
            kind: "done",
            color,
            text: foregroundFor(color),
            theme: currentTheme(),
            cli: findEditorCli(vscode.env.appRoot, platform, listDirSync) ?? null,
            folder: folder?.uri.fsPath ?? null,
            seconds: readConfig().popup.seconds,
            stay: readConfig().popup.stayUntilClicked,
          },
          platform,
        );
      } catch (err) {
        logger.error("alerts", "test popup failed", err);
        vscode.window.showErrorMessage(`Benefit: test popup failed. ${(err as Error).message}`);
      }
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
