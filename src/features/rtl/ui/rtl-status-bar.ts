import * as vscode from "vscode";
import { RtlMode } from "../../../core/config-manager";
import { describeMode } from "../services/rtl-mode-state";

export class RtlStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.item.command = "benefit.rtl.toggle";
    this.item.tooltip = "Benefit: toggle RTL mode for Claude Code";
  }

  render(mode: RtlMode, applied: boolean): void {
    const indicator = applied ? "$(arrow-left)" : "$(arrow-right)";
    this.item.text = `${indicator} RTL: ${describeMode(mode)}`;
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
