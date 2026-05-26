import * as vscode from "vscode";

const CHANNEL_NAME = "Benefit's Toolkit";

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel(CHANNEL_NAME);
  }
  return channel;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function write(level: string, scope: string, message: string, err?: unknown): void {
  const head = `[${timestamp()}] [${level}] [${scope}]`;
  const ch = getChannel();
  ch.appendLine(`${head} ${message}`);
  if (err !== undefined) {
    const detail = err instanceof Error ? `${err.stack ?? err.message}` : String(err);
    ch.appendLine(`${head} ↳ ${detail}`);
  }
}

export const logger = {
  info(scope: string, message: string): void {
    write("INFO ", scope, message);
  },
  warn(scope: string, message: string, err?: unknown): void {
    write("WARN ", scope, message, err);
  },
  error(scope: string, message: string, err?: unknown): void {
    write("ERROR", scope, message, err);
  },
  show(): void {
    getChannel().show(true);
  },
  dispose(): void {
    channel?.dispose();
    channel = undefined;
  },
};
