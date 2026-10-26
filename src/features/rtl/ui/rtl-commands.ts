import * as vscode from "vscode";
import { RtlMode, readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { ClaudeAssetLocator } from "../services/claude-asset-locator";
import { RtlAssetPatcher } from "../services/css-injector";
import { describeMode, setMode, switchRtlOff, switchRtlOn } from "../services/rtl-mode-state";

interface Deps {
  locator: ClaudeAssetLocator;
  patcher: RtlAssetPatcher;
  reconcile: () => Promise<void>;
}

export function registerRtlCommands(ctx: vscode.ExtensionContext, deps: Deps): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  async function setAndReconcile(mode: RtlMode): Promise<void> {
    if (mode === "off") await switchRtlOff(ctx.globalState);
    else await setMode(mode, ctx.globalState);
    await deps.reconcile();
    vscode.window.showInformationMessage(`Benefit: RTL ${describeMode(readConfig().rtl.mode)}.`);
  }

  disposables.push(
    // Off, or back to the mode used last (the manual toggle the first time).
    vscode.commands.registerCommand("benefit.rtl.toggle", async () => {
      if (readConfig().rtl.mode === "off") {
        await switchRtlOn(ctx.globalState);
        await deps.reconcile();
        vscode.window.showInformationMessage(`Benefit: RTL ${describeMode(readConfig().rtl.mode)}.`);
      } else {
        await setAndReconcile("off");
      }
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
        logger.warn("rtl", "Status check failed: Claude Code not found.");
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
