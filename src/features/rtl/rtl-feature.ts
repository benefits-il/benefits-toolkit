import * as vscode from "vscode";
import { affects, readConfig } from "../../core/config-manager";
import type { Feature } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { ClaudeAssetLocator } from "./services/claude-asset-locator";
import { RtlAssetPatcher } from "./services/css-injector";
import { registerRtlCommands } from "./ui/rtl-commands";
import { RtlStatusBar } from "./ui/rtl-status-bar";

export function createRtlFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];
  let statusBar: RtlStatusBar | undefined;
  let locator: ClaudeAssetLocator | undefined;
  let patcher: RtlAssetPatcher | undefined;

  async function reconcile(): Promise<void> {
    if (!locator || !patcher) return;
    const cfg = readConfig().rtl;
    const assets = await locator.locate();

    if (!assets) {
      logger.warn("rtl", "Claude Code not found — skipping RTL patch.");
      statusBar?.render(cfg.mode, false);
      return;
    }

    if (cfg.mode === "off") {
      await patcher.remove(assets);
      statusBar?.render(cfg.mode, false);
      return;
    }

    await patcher.apply(assets, {
      mode: cfg.mode,
      textFont: cfg.textFont,
      codeFont: cfg.codeFont,
    });
    statusBar?.render(cfg.mode, true);
  }

  return {
    id: "rtl",
    isEnabled(): boolean {
      return readConfig().rtl.enabled;
    },
    async activate(): Promise<void> {
      const cfg = readConfig().rtl;
      locator = new ClaudeAssetLocator(cfg.claudeCodePathOverride);
      patcher = new RtlAssetPatcher(ctx);
      statusBar = new RtlStatusBar();
      disposables.push(statusBar);

      disposables.push(
        ...registerRtlCommands(ctx, {
          locator,
          patcher,
          reconcile,
        }),
      );

      disposables.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
          if (!locator || !patcher) return;
          const touchedLocator = affects(e, "rtl.claudeCodePathOverride");
          if (touchedLocator) {
            locator = new ClaudeAssetLocator(readConfig().rtl.claudeCodePathOverride);
          }
          if (
            touchedLocator ||
            affects(e, "rtl.mode") ||
            affects(e, "rtl.textFont") ||
            affects(e, "rtl.codeFont")
          ) {
            await reconcile();
          }
        }),
      );

      try {
        await reconcile();
      } catch (err) {
        logger.error("rtl", "Initial reconcile failed", err);
      }
    },
    async deactivate(): Promise<void> {
      if (locator && patcher) {
        const assets = await locator.locate();
        if (assets) {
          try {
            await patcher.remove(assets);
          } catch (err) {
            logger.warn("rtl", "Failed to remove RTL patch during deactivate", err);
          }
        }
      }
      for (const d of disposables) {
        try { d.dispose(); } catch { /* ignore */ }
      }
      disposables = [];
      statusBar = undefined;
      locator = undefined;
      patcher = undefined;
    },
  };
}
