import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  antigravityHooksFile,
  antigravityRoot,
  cursorHooksFile,
  cursorRoot,
  toolkitBinDir,
} from "../../../core/paths";
import { ensureDir, pathExists, readTextSafe } from "../../../shared/fs-utils";
import { readJsonObject, writeJsonObject } from "../../../shared/json-merge";
import { buildDispatchCommand, dispatcherFile, HookPlatform, isDispatchCommand, WIN_POWERSHELL_FILE } from "./hook-command";

type Json = Record<string, unknown>;

/** The agents besides Claude Code whose own hooks run the dispatcher. */
export type HookedAgent = "cursor" | "antigravity";

/** Our entry's name in Antigravity's hooks.json, which keys each hook set by its owner's name. */
export const ANTIGRAVITY_HOOK_NAME = "benefits-toolkit";

/** Antigravity stops a hook after this many seconds; the dispatcher plays a sound of a few. */
export const ANTIGRAVITY_HOOK_TIMEOUT = 15;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOurs(entry: unknown): boolean {
  return isObject(entry) && typeof entry.command === "string" && isDispatchCommand(entry.command);
}

// ---- Cursor: ~/.cursor/hooks.json is { version: 1, hooks: { stop: [ { command } ] } }.

/** The file without the dispatcher, wherever it was; the user's own hooks stay as they were. */
export function withoutCursorHook(data: Json): Json {
  if (!isObject(data.hooks)) return { ...data };
  const hooks: Json = {};
  for (const [event, list] of Object.entries(data.hooks)) {
    if (!Array.isArray(list)) {
      hooks[event] = list;
      continue;
    }
    const kept = list.filter((h) => !isOurs(h));
    // An event left empty by us goes; one the user left empty stays.
    if (kept.length > 0 || kept.length === list.length) hooks[event] = kept;
  }
  return { ...data, hooks };
}

/** The file with the dispatcher on "stop", after the user's own stop hooks. */
export function withCursorHook(data: Json, command: string): Json {
  const next = withoutCursorHook(data);
  const hooks = isObject(next.hooks) ? { ...next.hooks } : {};
  hooks.stop = [...(Array.isArray(hooks.stop) ? hooks.stop : []), { command }];
  return { ...next, version: typeof next.version === "number" ? next.version : 1, hooks };
}

/** True when the dispatcher runs on "stop" with exactly this command, and nowhere else. */
export function hasCursorHook(data: Json, command: string): boolean {
  if (!isObject(data.hooks)) return false;
  const ours: { event: string; command: string }[] = [];
  for (const [event, list] of Object.entries(data.hooks)) {
    if (!Array.isArray(list)) continue;
    for (const h of list) if (isOurs(h)) ours.push({ event, command: (h as Json).command as string });
  }
  return ours.length === 1 && ours[0].event === "stop" && ours[0].command === command;
}

// ---- Antigravity: ~/.gemini/config/hooks.json is { "<owner>": { Stop: [ { type, command, timeout } ] } }.

// A path cmd.exe passes on as is and PowerShell reads as one argument.
const PLAIN_PATH = /^[\p{L}\p{N}_.:\\-]+$/u;

/**
 * The dispatcher command for Antigravity. On Windows, Antigravity hands the
 * command to cmd.exe with every double quote escaped, so PowerShell gets the
 * quotes as part of the path and refuses it ("Illegal characters in path").
 * The path therefore goes in bare: in full when nothing in it needs quoting,
 * otherwise relative to the hooks folder, which is where Antigravity runs
 * its hooks.
 */
export function buildAntigravityCommand(binDir: string, hooksDir: string, platform: HookPlatform): string {
  if (platform !== "win32") return buildDispatchCommand(binDir, "antigravity", "done", platform);
  const full = dispatcherFile(binDir, platform);
  const file = PLAIN_PATH.test(full) ? full : path.win32.relative(hooksDir, full);
  return `${WIN_POWERSHELL_FILE} ${file} antigravity done`;
}

export function withoutAntigravityHook(data: Json): Json {
  const next: Json = {};
  for (const [name, entry] of Object.entries(data)) if (name !== ANTIGRAVITY_HOOK_NAME) next[name] = entry;
  return next;
}

export function withAntigravityHook(data: Json, command: string): Json {
  return {
    ...withoutAntigravityHook(data),
    [ANTIGRAVITY_HOOK_NAME]: { Stop: [{ type: "command", command, timeout: ANTIGRAVITY_HOOK_TIMEOUT }] },
  };
}

export function hasAntigravityHook(data: Json, command: string): boolean {
  const entry = data[ANTIGRAVITY_HOOK_NAME];
  if (!isObject(entry) || Object.keys(entry).length !== 1 || !Array.isArray(entry.Stop) || entry.Stop.length !== 1) return false;
  const hook = entry.Stop[0];
  return isObject(hook) && hook.type === "command" && hook.command === command && hook.timeout === ANTIGRAVITY_HOOK_TIMEOUT;
}

/** Nothing left but an empty frame: the file can go. */
function isEmpty(agent: HookedAgent, data: Json): boolean {
  if (agent === "antigravity") return Object.keys(data).length === 0;
  const others = Object.keys(data).filter((k) => k !== "version" && k !== "hooks");
  return others.length === 0 && (!isObject(data.hooks) || Object.keys(data.hooks).length === 0);
}

interface TargetSpec {
  /** The agent's own folder: no folder, no agent on this computer. */
  home: () => string;
  file: () => string;
  command: (platform: HookPlatform) => string;
  add: (data: Json, command: string) => Json;
  remove: (data: Json) => Json;
  has: (data: Json, command: string) => boolean;
}

const SPECS: Record<HookedAgent, TargetSpec> = {
  cursor: {
    home: cursorRoot,
    file: cursorHooksFile,
    command: (platform) => buildDispatchCommand(toolkitBinDir(), "cursor", "done", platform),
    add: withCursorHook,
    remove: withoutCursorHook,
    has: hasCursorHook,
  },
  antigravity: {
    home: antigravityRoot,
    file: antigravityHooksFile,
    command: (platform) => buildAntigravityCommand(toolkitBinDir(), path.dirname(antigravityHooksFile()), platform),
    add: withAntigravityHook,
    remove: withoutAntigravityHook,
    has: hasAntigravityHook,
  },
};

/**
 * The dispatcher hook in another agent's own hooks file: Cursor's agent and
 * Antigravity's agent finish a turn, the dispatcher alerts with their name and
 * mark. Only the "finished" alert: neither agent has a hook for "needs input".
 */
export class AgentHookTarget {
  constructor(
    readonly agent: HookedAgent,
    private readonly platform: HookPlatform,
  ) {}

  /** The file the hooks live in; the healer watches it. */
  get file(): string {
    return SPECS[this.agent].file();
  }

  private command(): string {
    return SPECS[this.agent].command(this.platform);
  }

  /** Whether the agent is installed on this computer. */
  present(): Promise<boolean> {
    return pathExists(SPECS[this.agent].home());
  }

  async isInstalled(): Promise<boolean> {
    return SPECS[this.agent].has(await readJsonObject(this.file), this.command());
  }

  /**
   * Put the hook in (want, and the agent is here) or take it out, writing only
   * when the file has to change. Returns whether it did. A file that is not
   * valid JSON is never touched: readJsonObject throws instead.
   */
  async ensure(want: boolean): Promise<boolean> {
    const spec = SPECS[this.agent];
    const file = this.file;
    const data = await readJsonObject(file);
    const command = this.command();
    if (want && (await this.present())) {
      if (spec.has(data, command)) return false;
      await ensureDir(path.dirname(file));
      await writeJsonObject(file, spec.add(data, command));
      return true;
    }
    if ((await readTextSafe(file)) === undefined) return false;
    const cleaned = spec.remove(data);
    if (JSON.stringify(cleaned) === JSON.stringify(data)) return false;
    if (isEmpty(this.agent, cleaned)) await fs.rm(file, { force: true });
    else await writeJsonObject(file, cleaned);
    return true;
  }
}
