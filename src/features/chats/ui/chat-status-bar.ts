import * as vscode from "vscode";

export class ChatStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private active = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
    this.item.command = "benefit.chats.statusBarRename";
    this.item.tooltip = "Rename the active Claude Code conversation";
    this.item.text = "$(edit) Rename Chat";
  }

  setVisible(visible: boolean): void {
    if (visible && !this.active) {
      this.item.show();
      this.active = true;
    } else if (!visible && this.active) {
      this.item.hide();
      this.active = false;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
