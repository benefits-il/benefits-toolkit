import * as path from "node:path";
import type { AgentId } from "../../../shared/agents";

/**
 * Marker the pre-0.7 macOS/Linux hook commands carried. New commands are
 * identified by the dispatcher path instead: an older toolkit still running
 * in another window purges every command with this marker, so carrying it
 * would make that window delete our hooks on every heal.
 */
export const HOOK_MARKER = "BENEFIT_MANAGED_HOOK";

export type AlertAgent = AgentId;
export type AlertKind = "done" | "waiting";
export type HookPlatform = "win32" | "darwin" | "linux";

const DISPATCHER_NAME: Record<HookPlatform, string> = {
  win32: "dispatch.ps1",
  darwin: "dispatch.js",
  linux: "dispatch.sh",
};

export function dispatcherFile(binDir: string, platform: HookPlatform): string {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  return join(binDir, DISPATCHER_NAME[platform]);
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** How every Windows hook starts PowerShell; the dispatcher's path follows. */
export const WIN_POWERSHELL_FILE = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File";

/**
 * The hook command an agent runs: the dispatcher plus who is calling and why.
 * It names no sound and no project; the dispatcher reads those from the
 * toolkit home, so changing a sound never rewrites settings.json.
 *
 * Windows: Claude Code runs hooks through bash (Git Bash), which expands any
 * "$" before PowerShell sees it, so the command must contain none; all
 * PowerShell logic lives in the -File script.
 */
export function buildDispatchCommand(
  binDir: string,
  agent: AlertAgent,
  kind: AlertKind,
  platform: HookPlatform,
): string {
  const file = dispatcherFile(binDir, platform);
  switch (platform) {
    case "win32":
      return `${WIN_POWERSHELL_FILE} "${file}" ${agent} ${kind}`;
    case "darwin":
      return `osascript -l JavaScript ${shellQuote(file)} ${agent} ${kind}`;
    case "linux":
      return `sh ${shellQuote(file)} ${agent} ${kind}`;
  }
}

/** A command written by a pre-0.7 toolkit (sound file in ~/.claude/sounds/benefit). */
export function isLegacyCommand(cmd: string): boolean {
  if (typeof cmd !== "string") return false;
  return cmd.includes(HOOK_MARKER) || /sounds[\\/]benefit[\\/]/i.test(cmd);
}

/** A command that runs this toolkit's dispatcher. */
export function isDispatchCommand(cmd: string): boolean {
  if (typeof cmd !== "string") return false;
  return /\.benefits-toolkit[\\/]bin[\\/]dispatch\.(ps1|js|sh)/i.test(cmd);
}

/** Any hook command this toolkit owns, current or legacy. */
export function isManagedCommand(cmd: string): boolean {
  return isDispatchCommand(cmd) || isLegacyCommand(cmd);
}
