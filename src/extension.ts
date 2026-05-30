import * as vscode from "vscode";
import { logger } from "./core/logger";
import { FeatureRegistry } from "./core/feature-registry";
import { onConfigChanged } from "./core/config-manager";
import { createRtlFeature } from "./features/rtl/rtl-feature";
import { createSoundsFeature } from "./features/sounds/sounds-feature";
import { createChatsFeature } from "./features/chats/chats-feature";
import { SoundsViewProvider } from "./features/sounds/ui/sounds-view-provider";

let registry: FeatureRegistry | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  logger.info("extension", "Activating Benefit's Toolkit...");

  registry = new FeatureRegistry(ctx);
  registry.register(createRtlFeature(ctx));
  registry.register(createSoundsFeature(ctx));
  registry.register(createChatsFeature(ctx));

  // The Sounds control panel is always available (even when sounds are off, so
  // the Enabled switch is reachable), so it lives outside the enabled-gated
  // feature lifecycle.
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SoundsViewProvider.viewType,
      new SoundsViewProvider(ctx),
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
