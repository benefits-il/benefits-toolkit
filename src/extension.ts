import * as vscode from "vscode";
import { logger } from "./core/logger";
import { FeatureRegistry } from "./core/feature-registry";
import { onConfigChanged } from "./core/config-manager";
import { createRtlFeature } from "./features/rtl/rtl-feature";
import { createSoundsFeature } from "./features/sounds/sounds-feature";
import { createChatsFeature } from "./features/chats/chats-feature";

let registry: FeatureRegistry | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  logger.info("extension", "Activating Benefit's Toolkit...");

  registry = new FeatureRegistry(ctx);
  registry.register(createRtlFeature(ctx));
  registry.register(createSoundsFeature(ctx));
  registry.register(createChatsFeature(ctx));

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
