import * as vscode from "vscode";
import { logger } from "../../../core/logger";
import { normalizeHex, PRESET_PALETTE } from "../services/color-utils";
import { WindowColorService } from "../services/window-color-service";

interface ColorPickItem extends vscode.QuickPickItem {
  action: "preset" | "custom" | "clear";
  hex?: string;
}

export function registerWindowColorCommands(
  ctx: vscode.ExtensionContext,
  service: WindowColorService,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand("benefit.windowColor.pick", async () => {
      try {
        const current = service.getCurrentColor();
        const items: ColorPickItem[] = PRESET_PALETTE.map((preset) => ({
          action: "preset",
          hex: preset.hex,
          label: preset.name,
          description: preset.hex === current ? `${preset.hex} (current)` : preset.hex,
        }));
        items.push(
          { action: "custom", label: "", kind: vscode.QuickPickItemKind.Separator },
          { action: "custom", label: "Custom…", description: "Enter a hex color" },
          { action: "clear", label: "Clear window color", description: "Remove the color from this workspace" },
        );

        const picked = await vscode.window.showQuickPick(items, {
          title: "Benefit: Window Color",
          placeHolder: "Pick a color for this window (title, activity and status bars)",
        });
        if (!picked) return;

        if (picked.action === "clear") {
          await service.clear();
          return;
        }

        let hex = picked.hex;
        if (picked.action === "custom") {
          const input = await vscode.window.showInputBox({
            title: "Benefit: Custom Window Color",
            prompt: "Hex color, e.g. #fcb700 or 3c0366",
            value: current,
            validateInput: (value) =>
              normalizeHex(value) === undefined ? "Enter a 3- or 6-digit hex color." : undefined,
          });
          if (input === undefined) return;
          hex = normalizeHex(input);
        }
        if (!hex) return;

        await service.apply(hex);
      } catch (err) {
        logger.error("windowColor", "pick failed", err);
        vscode.window.showErrorMessage(`Benefit: setting window color failed — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand("benefit.windowColor.clear", async () => {
      try {
        await service.clear();
      } catch (err) {
        logger.error("windowColor", "clear failed", err);
        vscode.window.showErrorMessage(`Benefit: clearing window color failed — ${(err as Error).message}`);
      }
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
