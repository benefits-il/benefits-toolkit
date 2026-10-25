import * as vscode from "vscode";
import { affects, readConfig } from "../../core/config-manager";
import type { Feature, DeactivateReason } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { currentPlatform } from "../../shared/platform-detector";
import { AlertAssets } from "./services/alert-assets";
import { HookInstaller } from "./services/hook-installer";
import { HookHealer } from "./services/hook-healer";
import { ProjectRegistryWriter } from "./services/project-registry-writer";
import { ProjectSoundStore } from "./services/project-sound-store";
import { SoundPicker } from "./services/variant-picker";
import { registerAlertsCommands } from "./ui/alerts-commands";

/**
 * Alerts: a sound and/or a desktop popup when Claude finishes or needs you.
 * Claude Code's hooks run a small dispatcher script from ~/.benefits-toolkit;
 * this feature keeps that folder (scripts, sound pool, config.json, one record
 * per open project) and the hooks themselves in shape.
 */
export function createAlertsFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];
  let installer: HookInstaller | undefined;
  let registry: ProjectRegistryWriter | undefined;

  return {
    id: "alerts",
    isEnabled(): boolean {
      const cfg = readConfig();
      return cfg.sounds.enabled || cfg.popup.enabled;
    },
    async activate(): Promise<void> {
      const platform = currentPlatform();
      if (platform === "unsupported") {
        logger.warn("alerts", `Alerts are not supported on ${process.platform}.`);
        return;
      }
      const assets = new AlertAssets(ctx);
      await assets.installRuntime(platform);
      await assets.writeConfig(readConfig());

      const store = new ProjectSoundStore(ctx);
      registry = new ProjectRegistryWriter(ctx, store, platform);
      registry.start();

      let warned = false;
      installer = new HookInstaller(assets, platform, () => {
        if (warned) return;
        warned = true;
        logger.warn("alerts", "An older Benefit's Toolkit in another window keeps restoring its hooks.");
        void vscode.window.showWarningMessage(
          "Benefit's Toolkit: another VS Code window is still running an older version of this extension. " +
            "Reload that window (Developer: Reload Window) to finish the upgrade; until then its old sound hooks stay silent.",
        );
      });
      const picker = new SoundPicker(assets);

      // Continuous self-heal. The hooks live in ~/.claude/settings.json, which
      // Claude Code rewrites whenever a permission is approved — dropping our
      // hooks. The healer re-applies them now AND on every change to that file.
      const healer = new HookHealer(installer);

      disposables = registerAlertsCommands(ctx, { installer, assets, picker, healer, platform });
      disposables.push(healer, registry);

      try {
        await healer.start();
      } catch (err) {
        logger.error("alerts", "Hook healer failed to start", err);
      }

      // The dispatcher reads its settings from config.json, so a changed
      // sound or popup switch only rewrites that file, never the hooks.
      disposables.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
          if (!affects(e, "sounds") && !affects(e, "popup")) return;
          try {
            await assets.writeConfig(readConfig());
          } catch (err) {
            logger.error("alerts", "Writing config.json failed", err);
          }
        }),
      );
    },
    async deactivate(reason: DeactivateReason): Promise<void> {
      await registry?.close();
      registry = undefined;
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      disposables = [];

      // On an explicit "disable" (both sounds and popup turned off), remove the
      // hooks; that's the intent. On "shutdown" (window reload) leave them so
      // alerts survive the restart, unless the user opted into cleanup. The
      // healer was disposed above, so uninstall won't be immediately re-healed.
      const cfg = readConfig().sounds;
      if ((reason === "disable" || cfg.cleanupOnDeactivate) && installer) {
        try {
          await installer.uninstall();
        } catch (err) {
          logger.warn("alerts", "Uninstall on deactivate failed", err);
        }
      }
      installer = undefined;
    },
  };
}
