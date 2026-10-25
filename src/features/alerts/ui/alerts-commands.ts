import * as fs from "node:fs";
import * as vscode from "vscode";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { WindowColorService } from "../../window-color/services/window-color-service";
import { AlertAssets } from "../services/alert-assets";
import { findEditorCli } from "../services/editor-cli";
import type { HookPlatform } from "../services/hook-command";
import { HookHealer } from "../services/hook-healer";
import { HookInstaller } from "../services/hook-installer";
import { showPopup } from "../services/popup-launcher";
import { playPreview } from "../services/sound-player";
import { SoundPicker } from "../services/variant-picker";

export interface AlertsServices {
  installer: HookInstaller;
  assets: AlertAssets;
  picker: SoundPicker;
  healer: HookHealer;
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
  { installer, assets, picker, healer, platform }: AlertsServices,
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
        vscode.window.showErrorMessage(`Benefit: hook install failed — ${(err as Error).message}`);
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
        vscode.window.showErrorMessage(`Benefit: hook uninstall failed — ${(err as Error).message}`);
      }
    }),

    // Picks the default sounds; the feature's config listener mirrors them
    // into config.json, which the dispatcher reads on every alert.
    vscode.commands.registerCommand("benefit.sounds.chooseSounds", async () => {
      const cfg = readConfig().sounds;
      const stop = await picker.pickAndSave("stop", cfg.stopSound);
      if (stop === undefined) return;
      await picker.pickAndSave("notification", readConfig().sounds.notificationSound);
    }),

    vscode.commands.registerCommand("benefit.sounds.test", async () => {
      const cfg = readConfig().sounds;
      try {
        await playPreview(assets.bundledAssetPath(cfg.stopSound));
        setTimeout(() => {
          void playPreview(assets.bundledAssetPath(cfg.notificationSound));
        }, 1200);
      } catch (err) {
        vscode.window.showWarningMessage(`Benefit: preview failed — ${(err as Error).message}`);
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

    // The popup this window would get, shown now.
    vscode.commands.registerCommand("benefit.popup.test", async () => {
      try {
        const folder = vscode.workspace.workspaceFolders?.[0];
        await showPopup(
          {
            title: vscode.workspace.name ?? folder?.name ?? "Benefit's Toolkit",
            subtitle: "Claude finished",
            color: new WindowColorService(ctx).getCurrentColor() ?? "#047857",
            cli: findEditorCli(vscode.env.appRoot, platform, listDirSync) ?? null,
            folder: folder?.uri.fsPath ?? null,
            seconds: readConfig().popup.seconds,
          },
          platform,
        );
      } catch (err) {
        logger.error("alerts", "test popup failed", err);
        vscode.window.showErrorMessage(`Benefit: test popup failed — ${(err as Error).message}`);
      }
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
