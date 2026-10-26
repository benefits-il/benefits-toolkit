import * as vscode from "vscode";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { pathExists } from "../../../shared/fs-utils";
import { openInMdHe } from "../../chats/services/md-he-launcher";
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
            `Benefit: browser not found at "${browserPath}". Fix benefit.htmlOpen.browserPath, or clear it to use the system default browser.`,
          );
          return;
        }

        const { cmd, args } = resolveBrowserLaunch(browserPath, target.fsPath);
        await runDetached(cmd, args);
      } catch (err) {
        logger.error("htmlOpen", "openInBrowser failed", err);
        vscode.window.showErrorMessage(`Benefit: opening in browser failed. ${(err as Error).message}`);
      }
    }),
  );

  disposables.push(
    // A Markdown file in md-he: the editor's text when it is open (unsaved
    // changes included), else the file on disk.
    vscode.commands.registerCommand("benefit.mdHe.openFile", async (uri?: vscode.Uri) => {
      try {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target || target.scheme !== "file") {
          vscode.window.showInformationMessage("Benefit: no Markdown file to open.");
          return;
        }
        const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === target.toString());
        const text = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
        if (!text.trim()) {
          vscode.window.showInformationMessage("Benefit: this file is empty.");
          return;
        }
        const result = await openInMdHe(text);
        if (result === "clipboard") {
          vscode.window.showInformationMessage("Benefit: the file is too long for a link. It is on the clipboard: press Paste in md-he.");
        }
      } catch (err) {
        logger.error("htmlOpen", "openInMdHe failed", err);
        vscode.window.showErrorMessage(`Benefit: opening in md-he failed. ${(err as Error).message}`);
      }
    }),
  );

  ctx.subscriptions.push(...disposables);
  return disposables;
}
