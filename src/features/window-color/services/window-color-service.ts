import * as vscode from "vscode";
import { logger } from "../../../core/logger";
import { buildCustomizations, MANAGED_KEYS } from "./color-utils";

const COLOR_KEY = "colorCustomizations";
const NATIVE_HINT_FLAG = "windowColor.nativeTitleBarHintShown";

/**
 * Writes/clears the managed window color via VS Code's own configuration API
 * (ConfigurationTarget.Workspace). VS Code persists that into
 * .vscode/settings.json (or the .code-workspace file for multi-root) and is
 * JSONC-safe — comments and formatting survive, which is why this service
 * never touches the file directly (shared/json-merge.ts uses plain JSON.parse).
 */
export class WindowColorService {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  /** The currently applied background, if this feature set one in this workspace. */
  getCurrentColor(): string | undefined {
    const current = this.readWorkspaceValue();
    const value = current["titleBar.activeBackground"];
    return typeof value === "string" ? value : undefined;
  }

  async apply(hex: string): Promise<void> {
    if (!this.guardWorkspace()) return;
    const merged = { ...this.readWorkspaceValue(), ...buildCustomizations(hex) };
    await this.write(merged);
    logger.info("windowColor", `Applied window color ${hex}.`);
    await this.maybeHintNativeTitleBar();
  }

  async clear(): Promise<void> {
    if (!this.guardWorkspace()) return;
    const current = this.readWorkspaceValue();
    if (!MANAGED_KEYS.some((key) => key in current)) {
      vscode.window.showInformationMessage("Benefit: no window color is set for this workspace.");
      return;
    }
    const remaining = { ...current };
    for (const key of MANAGED_KEYS) delete remaining[key];
    await this.write(Object.keys(remaining).length > 0 ? remaining : undefined);
    logger.info("windowColor", "Cleared window color.");
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
      "Benefit: window.titleBarStyle is 'native', so the title bar itself won't be colored — the activity bar and status bar still are.",
    );
  }
}
