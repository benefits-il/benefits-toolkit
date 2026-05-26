import * as vscode from "vscode";
import { RtlMode, readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { ClaudeAssetLocator } from "../services/claude-asset-locator";
import { RtlAssetPatcher } from "../services/css-injector";
import { describeMode, setMode } from "../services/rtl-mode-state";

interface Deps {
  locator: ClaudeAssetLocator;
  patcher: RtlAssetPatcher;
  reconcile: () => Promise<void>;
}

export function registerRtlCommands(ctx: vscode.ExtensionContext, deps: Deps): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  async function setAndReconcile(mode: RtlMode): Promise<void> {
    await setMode(mode);
    await deps.reconcile();
    vscode.window.showInformationMessage(`Benefit: RTL ${describeMode(mode)}.`);
  }

  disposables.push(
    vscode.commands.registerCommand("benefit.rtl.toggle", async () => {
      const current = readConfig().rtl.mode;
      const next: RtlMode = current === "off" ? "always" : "off";
      await setAndReconcile(next);
    }),

    vscode.commands.registerCommand("benefit.rtl.enableActive", () => setAndReconcile("active")),
    vscode.commands.registerCommand("benefit.rtl.enableAlways", () => setAndReconcile("always")),
    vscode.commands.registerCommand("benefit.rtl.enableAuto", () => setAndReconcile("auto")),
    vscode.commands.registerCommand("benefit.rtl.disable", () => setAndReconcile("off")),

    vscode.commands.registerCommand("benefit.rtl.status", async () => {
      const cfg = readConfig().rtl;
      const assets = await deps.locator.locate();
      if (!assets) {
        vscode.window.showWarningMessage("Benefit RTL: could not locate Claude Code installation.");
        logger.warn("rtl", "Status check failed — Claude Code not found.");
        return;
      }
      const applied = await deps.patcher.isApplied(assets);
      vscode.window.showInformationMessage(
        `Benefit RTL: mode=${describeMode(cfg.mode)}, applied=${applied ? "yes" : "no"}, Claude version=${assets.versionLabel}.`,
      );
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
