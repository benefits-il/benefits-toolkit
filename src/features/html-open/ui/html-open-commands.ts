import * as vscode from "vscode";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { pathExists } from "../../../shared/fs-utils";
import { resolveBrowserLaunch, runDetached } from "../services/browser-launch";

export function registerHtmlOpenCommands(ctx: vscode.ExtensionContext): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand("benefit.html.openInBrowser", async (uri?: vscode.Uri) => {
      try {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target || target.scheme !== "file") {
          vscode.window.showInformationMessage("Benefit: no HTML file to open.");
          return;
        }

        const { browserPath } = readConfig().htmlOpen;
        if (!browserPath) {
          await vscode.env.openExternal(target);
          return;
        }

        if (!(await pathExists(browserPath))) {
          vscode.window.showErrorMessage(
            `Benefit: browser not found at "${browserPath}" — fix benefit.htmlOpen.browserPath, or clear it to use the system default browser.`,
          );
          return;
        }

        const { cmd, args } = resolveBrowserLaunch(browserPath, target.fsPath);
        await runDetached(cmd, args);
      } catch (err) {
        logger.error("htmlOpen", "openInBrowser failed", err);
        vscode.window.showErrorMessage(`Benefit: opening in browser failed — ${(err as Error).message}`);
      }
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
