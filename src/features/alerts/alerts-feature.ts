import * as vscode from "vscode";
import { affects, readConfig } from "../../core/config-manager";
import type { Feature, DeactivateReason } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { editorAgent } from "../../shared/agents";
import { currentPlatform } from "../../shared/platform-detector";
import { AgentHookTarget, HookedAgent } from "./services/agent-hooks";
import { AlertAssets } from "./services/alert-assets";
import { HookInstaller } from "./services/hook-installer";
import { HookHealer } from "./services/hook-healer";
import { NativeAlerts } from "./services/native-alerts";
import { ProjectRegistryWriter } from "./services/project-registry-writer";
import { ProjectPrefsStore } from "./services/project-prefs-store";
import { registerAlertsCommands } from "./ui/alerts-commands";

const HOOKED_AGENTS: readonly HookedAgent[] = ["cursor", "antigravity"];

/**
 * Alerts: a sound and/or a desktop popup when an agent finishes or needs you.
 * Claude Code's hooks, and the hooks of Cursor's and Antigravity's own agents,
 * run a small dispatcher script from ~/.benefits-toolkit; this feature keeps
 * that folder (scripts, sound pool, config.json, one record per open project)
 * and the hooks themselves in shape.
 */
export function createAlertsFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];
  let installer: HookInstaller | undefined;
  let registry: ProjectRegistryWriter | undefined;
  let agentTargets: AgentHookTarget[] = [];
  let native: NativeAlerts | undefined;
  const inCursor = editorAgent(vscode.env.uriScheme) === "cursor";

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

      const prefs = new ProjectPrefsStore(ctx);
      registry = new ProjectRegistryWriter(ctx, prefs, platform);
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

      // Continuous self-heal. The hooks live in ~/.claude/settings.json, which
      // Claude Code rewrites whenever a permission is approved — dropping our
      // hooks. The healer re-applies them now AND on every change to that file.
      const healer = new HookHealer(installer);

      disposables = registerAlertsCommands(ctx, { installer, assets, healer, prefs, platform });
      disposables.push(healer, registry);

      try {
        await healer.start();
      } catch (err) {
        logger.error("alerts", "Hook healer failed to start", err);
      }

      // Cursor's and Antigravity's agents: a hook in each one's own hooks
      // file, while its switch is on and the agent is installed. Their files
      // are healed the same way, in case the editor or the user rewrites them.
      agentTargets = HOOKED_AGENTS.map((agent) => new AgentHookTarget(agent, platform));
      for (const target of agentTargets) {
        const agentHealer = new HookHealer({ ensureInstalled: () => target.ensure(readConfig().agents[target.agent]) }, target.file);
        disposables.push(agentHealer);
        agentHealer.start().catch((err) => logger.warn("alerts", `The ${target.agent} hook could not be set up`, err));
      }

      // "Benefits alert only": Cursor's and Antigravity's own alerts off.
      native = new NativeAlerts(ctx.globalState);
      const applyNative = () => {
        const agents = readConfig().agents;
        native?.antigravity(agents.antigravityOwnAlertsOff).catch((err) => logger.warn("alerts", "Changing Antigravity's own alerts failed", err));
        native?.cursor(agents.cursorOwnAlertsOff, inCursor).catch((err) => logger.warn("alerts", "Changing Cursor's chime failed", err));
      };
      applyNative();

      // The dispatcher reads its settings from config.json, so a changed
      // sound or popup switch only rewrites that file, never the hooks.
      disposables.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
          if (affects(e, "agents.cursorOwnAlertsOff") || affects(e, "agents.antigravityOwnAlertsOff")) applyNative();
          for (const target of agentTargets) {
            if (!affects(e, `agents.${target.agent}`)) continue;
            target.ensure(readConfig().agents[target.agent]).catch((err) => logger.warn("alerts", `Updating the ${target.agent} hook failed`, err));
          }
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
        for (const target of agentTargets) {
          await target.ensure(false).catch((err) => logger.warn("alerts", `Removing the ${target.agent} hook failed`, err));
        }
        // With the toolkit's alerts gone, the editors' own come back.
        await native?.antigravity(false).catch((err) => logger.warn("alerts", "Restoring Antigravity's own alerts failed", err));
        await native?.cursor(false, inCursor).catch((err) => logger.warn("alerts", "Restoring Cursor's chime failed", err));
      }
      installer = undefined;
      agentTargets = [];
      native = undefined;
    },
  };
}
