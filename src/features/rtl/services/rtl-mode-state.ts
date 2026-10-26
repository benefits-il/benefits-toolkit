import type * as vscode from "vscode";
import { RtlMode, readConfig, updateConfig } from "../../../core/config-manager";

/** The last mode other than off: what turning RTL back on returns to. */
const LAST_MODE_KEY = "rtl.lastMode";

export function currentMode(): RtlMode {
  return readConfig().rtl.mode;
}

export async function setMode(mode: RtlMode, state?: vscode.Memento): Promise<void> {
  if (state && mode !== "off") await state.update(LAST_MODE_KEY, mode);
  await updateConfig("rtl.mode", mode);
}

/** The mode RTL comes back on in: the last one used, else the manual toggle. */
export function lastOnMode(state: vscode.Memento): RtlMode {
  const mode = state.get<RtlMode>(LAST_MODE_KEY);
  return mode === "always" || mode === "auto" || mode === "active" ? mode : "active";
}

/** RTL off: remember the mode in use (it may have been set by hand), then off. */
export async function switchRtlOff(state: vscode.Memento): Promise<void> {
  const mode = currentMode();
  if (mode === "off") return;
  await state.update(LAST_MODE_KEY, mode);
  await updateConfig("rtl.mode", "off");
}

/** RTL on: back to the mode used last. */
export async function switchRtlOn(state: vscode.Memento): Promise<void> {
  if (currentMode() === "off") await setMode(lastOnMode(state), state);
}

export function describeMode(mode: RtlMode): string {
  switch (mode) {
    case "off": return "off";
    case "active": return "manual toggle";
    case "always": return "always on";
    case "auto": return "detect each message";
  }
}
