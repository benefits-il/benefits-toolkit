import { toolkitBinDir } from "../../../core/paths";
import { AlertAssets } from "./alert-assets";
import {
  AlertKind,
  buildDispatchCommand,
  HookPlatform,
  isDispatchCommand,
  isLegacyCommand,
} from "./hook-command";
import {
  getHooks,
  HookEntry,
  HookEventName,
  HookMatcher,
  HooksShape,
  readSettings,
  setHooks,
  writeSettings,
} from "./settings-json-editor";

// Stop = Claude finished. The three "waiting" events are every way current
// Claude Code (>=2.1.x) waits for you: "Notification" fires for idle (60s)
// nudges; interactive permission prompts, plan-mode approval (ExitPlanMode),
// and AskUserQuestion all fire "PermissionRequest"; "Elicitation" covers MCP
// form/URL elicitation prompts.
const EVENT_KIND: Record<HookEventName, AlertKind> = {
  Stop: "done",
  Notification: "waiting",
  PermissionRequest: "waiting",
  Elicitation: "waiting",
};
const EVENTS = Object.keys(EVENT_KIND) as HookEventName[];

/**
 * Old hooks reappearing this soon after we removed them means an older
 * toolkit, still running in another window, put them back.
 */
const LEGACY_RETURN_WINDOW_MS = 60_000;

function isHookEntry(value: unknown): value is HookEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as HookEntry).type === "command" &&
    typeof (value as HookEntry).command === "string"
  );
}

function isHookMatcher(value: unknown): value is HookMatcher {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as HookMatcher).hooks)
  );
}

function commandsFor(hooks: HooksShape, event: string): string[] {
  const matchers = hooks[event];
  if (!Array.isArray(matchers)) return [];
  return matchers.flatMap((m) => (isHookMatcher(m) ? m.hooks.filter(isHookEntry).map((h) => h.command) : []));
}

function purgeHooks(hooks: HooksShape, shouldPurge: (cmd: string) => boolean): HooksShape {
  const cleaned: HooksShape = {};
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    const nextMatchers: HookMatcher[] = [];
    for (const m of matchers) {
      if (!isHookMatcher(m)) {
        nextMatchers.push(m as HookMatcher);
        continue;
      }
      const filteredHooks = m.hooks.filter((h) => !(isHookEntry(h) && shouldPurge(h.command)));
      if (filteredHooks.length > 0) {
        nextMatchers.push({ ...m, hooks: filteredHooks });
      }
    }
    if (nextMatchers.length > 0) {
      cleaned[event] = nextMatchers;
    }
  }
  return cleaned;
}

/**
 * Claude Code's hooks in ~/.claude/settings.json: one dispatcher command per
 * event. The dispatcher reads sounds and popup settings from the toolkit home,
 * so this file only changes when the hooks themselves are missing.
 */
export class HookInstaller {
  private lastLegacyPurgeAt = 0;
  private toleratingLegacy = false;

  constructor(
    private readonly assets: AlertAssets,
    private readonly platform: HookPlatform,
    /** Called once when an older toolkit window is detected. */
    private readonly onOlderToolkitWindow: () => void,
  ) {}

  private expectedCommand(event: HookEventName): string {
    return buildDispatchCommand(toolkitBinDir(), "claude", EVENT_KIND[event], this.platform);
  }

  async install(): Promise<void> {
    await this.assets.installRuntime(this.platform);
    const settings = await readSettings();
    const before = getHooks(settings);
    const hadLegacy = Object.keys(before).some((e) => commandsFor(before, e).some(isLegacyCommand));
    const hooks = purgeHooks(
      before,
      (cmd) => isDispatchCommand(cmd) || (!this.toleratingLegacy && isLegacyCommand(cmd)),
    );
    for (const event of EVENTS) {
      const list = hooks[event] ?? [];
      list.push({ matcher: "", hooks: [{ type: "command", command: this.expectedCommand(event) }] });
      hooks[event] = list;
    }
    setHooks(settings, hooks);
    await writeSettings(settings);
    if (hadLegacy && !this.toleratingLegacy) this.lastLegacyPurgeAt = Date.now();
  }

  /**
   * Idempotent reconcile, run on activation and by the HookHealer after every
   * change to settings.json. Writes only when a hook is missing or stale, and
   * returns whether it did.
   *
   * Upgrading from a pre-0.7 toolkit: its hooks (which play a fixed sound
   * file) are removed. If they come right back, an older toolkit in another
   * window restored them; fighting it would rewrite settings.json back and
   * forth every second. Instead they are left in place but silenced, and
   * the user is asked once to reload that window.
   */
  async ensureInstalled(): Promise<boolean> {
    const hooks = getHooks(await readSettings());
    const hasLegacy = Object.keys(hooks).some((e) => commandsFor(hooks, e).some(isLegacyCommand));

    if (hasLegacy && !this.toleratingLegacy && Date.now() - this.lastLegacyPurgeAt < LEGACY_RETURN_WINDOW_MS) {
      this.toleratingLegacy = true;
      this.onOlderToolkitWindow();
    }
    // The older toolkit rewrites its launcher whenever it reinstalls, so
    // silence it again on every heal while it is around.
    if (hasLegacy && this.toleratingLegacy) await this.assets.neutralizeLegacy();

    const current = EVENTS.every((event) => {
      const ours = commandsFor(hooks, event).filter(isDispatchCommand);
      return ours.length === 1 && ours[0] === this.expectedCommand(event);
    });
    const purgeLegacy = hasLegacy && !this.toleratingLegacy;
    if (current && !purgeLegacy && (await this.assets.dispatcherInstalled(this.platform))) {
      return false;
    }
    await this.install();
    return true;
  }

  async uninstall(): Promise<void> {
    const settings = await readSettings();
    setHooks(settings, purgeHooks(getHooks(settings), (cmd) => isDispatchCommand(cmd) || isLegacyCommand(cmd)));
    await writeSettings(settings);
  }

  async isInstalled(): Promise<boolean> {
    const hooks = getHooks(await readSettings());
    return EVENTS.some((event) => commandsFor(hooks, event).some(isDispatchCommand));
  }
}
