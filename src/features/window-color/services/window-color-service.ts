import * as vscode from "vscode";
import { logger } from "../../../core/logger";
import { projectKey } from "../../alerts/services/project-registry";
import { buildCustomizations, MANAGED_KEYS, normalizeHex } from "./color-utils";

const COLOR_KEY = "colorCustomizations";
const NATIVE_HINT_FLAG = "windowColor.nativeTitleBarHintShown";
/** Colors put away while the feature is off, by workspace. */
const STASH_KEY = "windowColor.stashed";

/**
 * Writes/clears the managed window color via VS Code's own configuration API
 * (ConfigurationTarget.Workspace). VS Code persists that into
 * .vscode/settings.json (or the .code-workspace file for multi-root) and is
 * JSONC-safe: comments and formatting survive, which is why this service
 * never touches the file directly (shared/json-merge.ts uses plain JSON.parse).
 *
 * Off means off: turning the feature off removes the color from the window and
 * remembers it here; turning it on puts it back. Clear forgets it either way.
 */
export class WindowColorService {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  /** The currently applied background, if this feature set one in this workspace. */
  getCurrentColor(): string | undefined {
    const current = this.readWorkspaceValue();
    const value = current["titleBar.activeBackground"];
    return typeof value === "string" ? value : undefined;
  }

  /** The color put away while the feature is off, if any. */
  getStashedColor(): string | undefined {
    const key = this.workspaceKey();
    return key ? this.readStash()[key] : undefined;
  }

  async apply(hex: string): Promise<void> {
    if (!this.guardWorkspace()) return;
    const merged = { ...this.readWorkspaceValue(), ...buildCustomizations(hex) };
    await this.write(merged);
    logger.info("windowColor", `Applied window color ${hex}.`);
    await this.maybeHintNativeTitleBar();
  }

  /** Remove the color and forget it (also the one put away while off). */
  async clear(): Promise<void> {
    if (!this.guardWorkspace()) return;
    await this.writeStash(undefined);
    await this.removeManagedKeys();
    logger.info("windowColor", "Cleared window color.");
  }

  /** Feature turned off: take the color off the window, remember it. */
  async stash(): Promise<void> {
    if (!vscode.workspace.workspaceFolders) return;
    const hex = normalizeHex(this.getCurrentColor() ?? "");
    if (!hex) return;
    await this.writeStash(hex);
    await this.removeManagedKeys();
    logger.info("windowColor", `Put away window color ${hex} while the feature is off.`);
  }

  /** Feature turned on: put the remembered color back. */
  async unstash(): Promise<void> {
    const hex = this.getStashedColor();
    if (!hex || !vscode.workspace.workspaceFolders) return;
    await this.writeStash(undefined);
    if (!this.getCurrentColor()) await this.apply(hex);
  }

  private async removeManagedKeys(): Promise<void> {
    const current = this.readWorkspaceValue();
    if (!MANAGED_KEYS.some((key) => key in current)) return;
    const remaining = { ...current };
    for (const key of MANAGED_KEYS) delete remaining[key];
    await this.write(Object.keys(remaining).length > 0 ? remaining : undefined);
  }

  /** The workspace file, or the first folder: where colorCustomizations is written. */
  private workspaceKey(): string | undefined {
    const where = vscode.workspace.workspaceFile?.scheme === "file"
      ? vscode.workspace.workspaceFile.fsPath
      : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return where ? projectKey(where) : undefined;
  }

  private readStash(): Record<string, string> {
    return this.ctx.globalState.get<Record<string, string>>(STASH_KEY) ?? {};
  }

  private async writeStash(hex: string | undefined): Promise<void> {
    const key = this.workspaceKey();
    if (!key) return;
    const all = { ...this.readStash() };
    if (hex) all[key] = hex;
    else delete all[key];
    await this.ctx.globalState.update(STASH_KEY, all);
  }

  private guardWorkspace(): boolean {
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showWarningMessage("Benefit: open a folder or workspace to set a window color.");
      return false;
    }
    return true;
  }

  private readWorkspaceValue(): Record<string, unknown> {
    const value = vscode.workspace
      .getConfiguration("workbench")
      .inspect<Record<string, unknown>>(COLOR_KEY)?.workspaceValue;
    if (value === undefined) return {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      logger.warn("windowColor", "workbench.colorCustomizations workspace value is not an object; treating as empty.");
      return {};
    }
    return { ...value };
  }

  private async write(value: Record<string, unknown> | undefined): Promise<void> {
    await vscode.workspace
      .getConfiguration("workbench")
      .update(COLOR_KEY, value, vscode.ConfigurationTarget.Workspace);
  }

  private async maybeHintNativeTitleBar(): Promise<void> {
    if (this.ctx.globalState.get<boolean>(NATIVE_HINT_FLAG)) return;
    const style = vscode.workspace.getConfiguration("window").get<string>("titleBarStyle");
    if (style !== "native") return;
    await this.ctx.globalState.update(NATIVE_HINT_FLAG, true);
    vscode.window.showInformationMessage(
      "Benefit: window.titleBarStyle is 'native', so the title bar itself is not colored. The activity bar and status bar are.",
    );
  }
}
