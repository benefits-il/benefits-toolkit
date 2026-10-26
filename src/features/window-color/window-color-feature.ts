import * as vscode from "vscode";
import { readConfig } from "../../core/config-manager";
import type { DeactivateReason, Feature } from "../../core/feature-registry";
import { logger } from "../../core/logger";
import { registerWindowColorCommands } from "./ui/window-color-commands";
import { WindowColorService } from "./services/window-color-service";

export function createWindowColorFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];
  const service = new WindowColorService(ctx);

  return {
    id: "windowColor",
    isEnabled(): boolean {
      return readConfig().windowColor.enabled;
    },
    async activate(): Promise<void> {
      disposables = registerWindowColorCommands(ctx, service);
      // Back on: the color put away when it was turned off returns.
      try {
        await service.unstash();
      } catch (err) {
        logger.warn("windowColor", "Restoring the window color failed", err);
      }
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
      // Off removes the color from the window and remembers it. A window
      // reload ("shutdown") leaves it exactly as it is.
      if (reason === "disable") {
        try {
          await service.stash();
        } catch (err) {
          logger.warn("windowColor", "Putting the window color away failed", err);
        }
      }
    },
  };
}

/**
 * A window that opens with the feature already off may still carry a color
 * from before it was turned off (it was off in another window): put it away
 * here too, so Off means the same in every project.
 */
export async function stashWindowColorIfOff(ctx: vscode.ExtensionContext): Promise<void> {
  if (readConfig().windowColor.enabled) return;
  try {
    await new WindowColorService(ctx).stash();
  } catch (err) {
    logger.warn("windowColor", "Putting the window color away failed", err);
  }
}
