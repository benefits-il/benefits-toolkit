import * as vscode from "vscode";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { HookInstaller } from "../services/hook-installer";
import { HookHealer } from "../services/hook-healer";
import { SoundAssetManager } from "../services/sound-asset-manager";
import { VariantPicker } from "../services/variant-picker";
import { playPreview } from "../services/sound-player";

export function registerSoundsCommands(
  ctx: vscode.ExtensionContext,
  installer: HookInstaller,
  assets: SoundAssetManager,
  picker: VariantPicker,
  healer: HookHealer,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand("benefit.sounds.install", async () => {
      const cfg = readConfig().sounds;
      try {
        healer.resume();
        await installer.install(cfg.stopVariant, cfg.notificationVariant);
        vscode.window.showInformationMessage(
          "Benefit: sound hooks installed. They'll play next time Claude finishes a message or asks for input.",
        );
      } catch (err) {
        logger.error("sounds", "install failed", err);
        vscode.window.showErrorMessage(`Benefit: sound install failed — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.sounds.uninstall", async () => {
      try {
        // Stop the healer first, otherwise it would immediately put the hooks
        // back when it sees settings.json change.
        healer.pause();
        await installer.uninstall();
        vscode.window.showInformationMessage("Benefit: sound hooks removed.");
      } catch (err) {
        logger.error("sounds", "uninstall failed", err);
        vscode.window.showErrorMessage(`Benefit: sound uninstall failed — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.sounds.chooseSounds", async () => {
      const cfg = readConfig().sounds;
      const stop = await picker.pickAndSave("stop", cfg.stopVariant);
      if (stop === undefined) return;
      const after = readConfig().sounds;
      await picker.pickAndSave("notification", after.notificationVariant);

      if (await installer.isInstalled()) {
        const finalCfg = readConfig().sounds;
        await installer.install(finalCfg.stopVariant, finalCfg.notificationVariant);
        vscode.window.showInformationMessage("Benefit: sound hooks updated with new variants.");
      }
    }),

    vscode.commands.registerCommand("benefit.sounds.test", async () => {
      const cfg = readConfig().sounds;
      try {
        await playPreview(assets.bundledAssetPath("stop", cfg.stopVariant));
        setTimeout(() => {
          void playPreview(assets.bundledAssetPath("notification", cfg.notificationVariant));
        }, 1200);
      } catch (err) {
        vscode.window.showWarningMessage(`Benefit: preview failed — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.sounds.status", async () => {
      const installed = await installer.isInstalled();
      const cfg = readConfig().sounds;
      const msg = installed
        ? `Benefit sounds: INSTALLED (Stop=${cfg.stopVariant}, Notification=${cfg.notificationVariant}).`
        : "Benefit sounds: not installed. Run 'Benefit: Sounds: Install Hooks' to enable.";
      vscode.window.showInformationMessage(msg);
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
