import * as vscode from "vscode";
import { readConfig } from "../../core/config-manager";
import type { Feature } from "../../core/feature-registry";
import { registerWindowColorCommands } from "./ui/window-color-commands";
import { WindowColorService } from "./services/window-color-service";

export function createWindowColorFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];

  return {
    id: "windowColor",
    isEnabled(): boolean {
      return readConfig().windowColor.enabled;
    },
    activate(): void {
      const service = new WindowColorService(ctx);
      disposables = registerWindowColorCommands(ctx, service);
    },
    deactivate(): void {
      // Commands only. The applied color is user-chosen data written through
      // the official settings API — not external state we patched — so neither
      // "disable" nor "shutdown" removes it; the Clear command is the removal
      // path.
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      disposables = [];
    },
  };
}
