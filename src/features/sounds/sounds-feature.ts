import * as vscode from "vscode";
import { affects, readConfig } from "../../core/config-manager";
import type { Feature, DeactivateReason } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { HookInstaller } from "./services/hook-installer";
import { HookHealer } from "./services/hook-healer";
import { SoundAssetManager } from "./services/sound-asset-manager";
import { VariantPicker } from "./services/variant-picker";
import { registerSoundsCommands } from "./ui/sounds-commands";

export function createSoundsFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];
  let installer: HookInstaller | undefined;

  return {
    id: "sounds",
    isEnabled(): boolean {
      return readConfig().sounds.enabled;
    },
    async activate(): Promise<void> {
      const assets = new SoundAssetManager(ctx);
      installer = new HookInstaller(assets);
      const picker = new VariantPicker(assets);

      // Continuous self-heal. The hooks live in ~/.claude/settings.json, which
      // Claude Code rewrites whenever a permission is approved — dropping our
      // hooks. The healer re-applies them now AND on every change to that file,
      // so a mid-session clobber no longer kills sounds until the next reload.
      const healer = new HookHealer(installer, () => {
        const s = readConfig().sounds;
        return { stop: s.stopVariant, notification: s.notificationVariant };
      });

      disposables = registerSoundsCommands(ctx, installer, assets, picker, healer);
      disposables.push(healer);

      try {
        await healer.start();
      } catch (err) {
        logger.error("sounds", "Hook healer failed to start", err);
      }

      disposables.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
          if (!installer) return;
          const variantChanged =
            affects(e, "sounds.stopVariant") || affects(e, "sounds.notificationVariant");
          if (!variantChanged) return;
          if (!(await installer.isInstalled())) return;
          const cfg = readConfig().sounds;
          try {
            await installer.install(cfg.stopVariant, cfg.notificationVariant);
            logger.info("sounds", "Re-installed hooks after variant config change.");
          } catch (err) {
            logger.error("sounds", "Auto re-install failed", err);
          }
        }),
      );
    },
    async deactivate(reason: DeactivateReason): Promise<void> {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      disposables = [];

      // On an explicit "disable" (user turned sounds off — e.g. via the Sounds
      // panel), remove the hooks; that's the intent. On "shutdown" (window
      // reload) leave them so sounds survive the restart, unless the user opted
      // into cleanup. The healer was disposed above, so uninstall won't be
      // immediately re-healed.
      const cfg = readConfig().sounds;
      if ((reason === "disable" || cfg.cleanupOnDeactivate) && installer) {
        try {
          await installer.uninstall();
        } catch (err) {
          logger.warn("sounds", "Uninstall on deactivate failed", err);
        }
      }
      installer = undefined;
    },
  };
}
