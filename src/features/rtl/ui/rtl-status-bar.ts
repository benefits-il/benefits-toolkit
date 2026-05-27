import * as vscode from "vscode";
import { RtlMode } from "../../../core/config-manager";
import { describeMode } from "../services/rtl-mode-state";

export class RtlStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.item.command = "benefit.rtl.toggle";
  }

  render(mode: RtlMode, applied: boolean): void {
    const icon = applied ? "$(arrow-swap)" : "$(arrow-right)";
    this.item.text = `${icon} RTL`;
    this.item.tooltip = applied
      ? `Benefit RTL: ${describeMode(mode)} (click to disable). Close & reopen Claude Code chat to refresh.`
      : `Benefit RTL: off (click to enable). Close & reopen Claude Code chat to apply.`;
    this.item.backgroundColor = applied
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
