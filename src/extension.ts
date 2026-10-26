import * as vscode from "vscode";
import { logger } from "./core/logger";
import { FeatureRegistry } from "./core/feature-registry";
import { onConfigChanged } from "./core/config-manager";
import { createRtlFeature } from "./features/rtl/rtl-feature";
import { createAlertsFeature } from "./features/alerts/alerts-feature";
import { createChatsFeature } from "./features/chats/chats-feature";
import { createWindowColorFeature, stashWindowColorIfOff } from "./features/window-color/window-color-feature";
import { createHtmlOpenFeature } from "./features/html-open/html-open-feature";
import { ProjectDefaults } from "./features/project-defaults/project-defaults";
import { SidebarViewProvider } from "./features/sidebar/sidebar-view-provider";
import { registerSidebarCommands } from "./features/sidebar/sidebar-commands";

let registry: FeatureRegistry | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  logger.info("extension", "Activating Benefit's Toolkit...");

  registry = new FeatureRegistry(ctx);
  registry.register(createRtlFeature(ctx));
  registry.register(createAlertsFeature(ctx));
  registry.register(createChatsFeature(ctx));
  registry.register(createWindowColorFeature(ctx));
  registry.register(createHtmlOpenFeature(ctx));

  // The sidebar is always there, outside the enabled-gated feature
  // lifecycle: its Settings tab is where every feature is turned back on.
  const sidebar = new SidebarViewProvider(ctx);
  ctx.subscriptions.push(
    // Kept alive while hidden: the list is there at once, and "Show in list" or
    // "Toolkit Settings" never posts to a page that is still loading.
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ...registerSidebarCommands(sidebar),
  );

  await registry.syncFromConfig();
  await stashWindowColorIfOff(ctx);
  // A new project's own color and sound; it checks its switches each time.
  ctx.subscriptions.push(new ProjectDefaults(ctx));

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
