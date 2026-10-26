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
    // On is a normal state, not a warning: no colored background.
    this.item.text = `${applied ? "$(arrow-swap)" : "$(arrow-right)"} RTL`;
    this.item.tooltip = applied
      ? `Benefit RTL: ${describeMode(mode)}. Click to turn it off. Reopen the Claude Code chat to apply.`
      : "Benefit RTL: off. Click to turn it on. Reopen the Claude Code chat to apply.";
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
