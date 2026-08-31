import * as vscode from "vscode";
import { readConfig } from "../../core/config-manager";
import type { Feature } from "../../core/feature-registry";
import { registerHtmlOpenCommands } from "./ui/html-open-commands";

export function createHtmlOpenFeature(ctx: vscode.ExtensionContext): Feature {
  let disposables: vscode.Disposable[] = [];

  return {
    id: "htmlOpen",
    isEnabled(): boolean {
      return readConfig().htmlOpen.enabled;
    },
    activate(): void {
      disposables = registerHtmlOpenCommands(ctx);
    },
    deactivate(): void {
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
