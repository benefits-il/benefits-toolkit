import { claudeSettingsFile } from "../../../core/paths";
import { ensureDir } from "../../../shared/fs-utils";
import { readJsonObject, writeJsonObject } from "../../../shared/json-merge";
import * as path from "node:path";

export interface HookEntry {
  type: "command";
  command: string;
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

export type HookEventName = "Stop" | "Notification";

export interface HooksShape {
  [eventName: string]: HookMatcher[];
}

export async function readSettings(): Promise<Record<string, unknown>> {
  return readJsonObject(claudeSettingsFile());
}

export async function writeSettings(data: Record<string, unknown>): Promise<void> {
  await ensureDir(path.dirname(claudeSettingsFile()));
  await writeJsonObject(claudeSettingsFile(), data);
}

export function getHooks(data: Record<string, unknown>): HooksShape {
  const raw = data["hooks"];
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as HooksShape;
  }
  return {};
}

export function setHooks(data: Record<string, unknown>, hooks: HooksShape): void {
  if (Object.keys(hooks).length === 0) {
    delete data["hooks"];
  } else {
    data["hooks"] = hooks;
  }
}
