import * as vscode from "vscode";
import type { ChatsController } from "./chats-controller";

const changed = new vscode.EventEmitter<void>();
let current: ChatsController | undefined;

/**
 * Where the sidebar finds the conversations feature. The sidebar is always
 * there (it is how a feature that is off comes back); the controller exists
 * only while Conversations is on, so the feature registers it here.
 */
export const chatsHub = {
  get controller(): ChatsController | undefined {
    return current;
  },
  set(controller: ChatsController | undefined): void {
    current = controller;
    changed.fire();
  },
  /** The feature turned on or off. */
  onDidChange: changed.event,
};
