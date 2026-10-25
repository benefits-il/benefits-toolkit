import * as vscode from "vscode";
import { logger } from "./core/logger";
import { FeatureRegistry } from "./core/feature-registry";
import { onConfigChanged } from "./core/config-manager";
import { createRtlFeature } from "./features/rtl/rtl-feature";
import { createAlertsFeature } from "./features/alerts/alerts-feature";
import { createChatsFeature } from "./features/chats/chats-feature";
import { createWindowColorFeature } from "./features/window-color/window-color-feature";
import { createHtmlOpenFeature } from "./features/html-open/html-open-feature";
import { AlertsViewProvider } from "./features/alerts/ui/alerts-view-provider";
import { ColorsViewProvider } from "./features/window-color/ui/colors-view-provider";
import { ToolkitViewProvider } from "./features/toolkit-panel/ui/toolkit-view-provider";
import { BrandViewProvider } from "./features/brand/ui/brand-view-provider";

let registry: FeatureRegistry | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  logger.info("extension", "Activating Benefit's Toolkit...");

  registry = new FeatureRegistry(ctx);
  registry.register(createRtlFeature(ctx));
  registry.register(createAlertsFeature(ctx));
  registry.register(createChatsFeature(ctx));
  registry.register(createWindowColorFeature(ctx));
  registry.register(createHtmlOpenFeature(ctx));

  // The Alerts panel is always available (even when sounds and popup are off, so
  // its switches are reachable), so it lives outside the enabled-gated
  // feature lifecycle. The Toolkit panel likewise: it is where every feature
  // is turned back on.
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BrandViewProvider.viewType,
      new BrandViewProvider(),
    ),
    vscode.window.registerWebviewViewProvider(
      ToolkitViewProvider.viewType,
      new ToolkitViewProvider(),
    ),
    vscode.window.registerWebviewViewProvider(
      AlertsViewProvider.viewType,
      new AlertsViewProvider(ctx),
    ),
    vscode.window.registerWebviewViewProvider(
      ColorsViewProvider.viewType,
      new ColorsViewProvider(ctx),
    ),
  );

  await registry.syncFromConfig();

  ctx.subscriptions.push(
    onConfigChanged(() => {
      void registry?.syncFromConfig();
    }),
    { dispose: () => logger.dispose() },
  );

  logger.info("extension", "Benefit's Toolkit ready.");
}

export async function deactivate(): Promise<void> {
  await registry?.dispose();
  registry = undefined;
}
