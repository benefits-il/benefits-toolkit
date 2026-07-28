import { pathExists } from "../../../shared/fs-utils";
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
import { buildPlayCommand, isManagedCommand } from "./sound-player";
import { SoundAssetManager, SoundSlot } from "./sound-asset-manager";

// Stop = Claude finished. The three notification events are every way current
// Claude Code (>=2.1.x) waits for you: "Notification" only fires for idle (60s)
// nudges; interactive permission prompts, plan-mode approval (ExitPlanMode),
// and AskUserQuestion all fire "PermissionRequest"; "Elicitation" covers MCP
// form/URL elicitation prompts.
const SLOT_EVENTS: Record<SoundSlot, HookEventName[]> = {
  stop: ["Stop"],
  notification: ["Notification", "PermissionRequest", "Elicitation"],
};

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

function purgeManagedHooks(hooks: HooksShape): HooksShape {
  const cleaned: HooksShape = {};
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    const nextMatchers: HookMatcher[] = [];
    for (const m of matchers) {
      if (!isHookMatcher(m)) {
        nextMatchers.push(m as HookMatcher);
        continue;
      }
      const filteredHooks = m.hooks.filter((h) => !(isHookEntry(h) && isManagedCommand(h.command)));
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

function appendManagedHook(hooks: HooksShape, event: HookEventName, command: string): void {
  const list = hooks[event] ?? [];
  list.push({
    matcher: "",
    hooks: [{ type: "command", command }],
  });
  hooks[event] = list;
}

function managedCommandFor(hooks: HooksShape, event: HookEventName): string | undefined {
  const matchers = hooks[event];
  if (!Array.isArray(matchers)) return undefined;
  for (const m of matchers) {
    if (!isHookMatcher(m)) continue;
    for (const h of m.hooks) {
      if (isHookEntry(h) && isManagedCommand(h.command)) return h.command;
    }
  }
  return undefined;
}

export class HookInstaller {
  constructor(private readonly assets: SoundAssetManager) {}

  async install(stopId: string, notificationId: string): Promise<void> {
    const installed = await this.assets.installAll(stopId, notificationId);
    // The hook command invokes this launcher via -File; it must exist on disk.
    await this.assets.installLauncher();

    const settings = await readSettings();
    const hooks = purgeManagedHooks(getHooks(settings));

    for (const event of SLOT_EVENTS.stop) {
      appendManagedHook(hooks, event, buildPlayCommand(installed.stop));
    }
    for (const event of SLOT_EVENTS.notification) {
      appendManagedHook(hooks, event, buildPlayCommand(installed.notification));
    }

    setHooks(settings, hooks);
    await writeSettings(settings);

    // Drop artifacts from older mechanisms (file-based .ps1 hooks + their log)
    // so the install dir reflects only the current inline-command approach.
    await this.assets.cleanupLegacyArtifacts();
  }

  /**
   * Idempotent reconcile used on activation. (Re)installs only when the managed
   * hooks are missing, point at stale commands (e.g. an older .ps1-based build),
   * or the sound files are gone. This is what makes sounds self-heal after a
   * Claude Code update or a settings reset wipes the hooks. Returns true if it
   * (re)installed.
   */
  async ensureInstalled(stopId: string, notificationId: string): Promise<boolean> {
    // Resolve through the same fallback install() uses, so a configured sound
    // that no longer exists in the pool doesn't make this check permanently
    // stale (which would reinstall on every heal).
    const stopPath = this.assets.installedPath("stop", await this.assets.resolveId("stop", stopId));
    const notificationPath = this.assets.installedPath(
      "notification",
      await this.assets.resolveId("notification", notificationId),
    );
    const expectedStop = buildPlayCommand(stopPath);
    const expectedNotification = buildPlayCommand(notificationPath);

    const settings = await readSettings();
    const hooks = getHooks(settings);
    // Every event of every slot must already carry the exact managed command.
    // A settings.json from an older build (Stop + Notification only) is missing
    // PermissionRequest/Elicitation, so this reports stale and the upgrade
    // self-applies on first activation via the HookHealer.
    const expectedFor: Record<SoundSlot, string> = {
      stop: expectedStop,
      notification: expectedNotification,
    };
    let hooksCurrent = true;
    for (const [slot, events] of Object.entries(SLOT_EVENTS) as [SoundSlot, HookEventName[]][]) {
      for (const event of events) {
        if (managedCommandFor(hooks, event) !== expectedFor[slot]) {
          hooksCurrent = false;
        }
      }
    }

    const launcher = this.assets.launcherPath();
    const artifactsExist =
      (await pathExists(stopPath)) &&
      (await pathExists(notificationPath)) &&
      (await pathExists(launcher));

    if (hooksCurrent && artifactsExist) {
      return false;
    }

    await this.install(stopId, notificationId);
    return true;
  }

  async uninstall(): Promise<void> {
    const settings = await readSettings();
    const hooks = purgeManagedHooks(getHooks(settings));
    setHooks(settings, hooks);
    await writeSettings(settings);
    await this.assets.removeInstalled();
  }

  async isInstalled(): Promise<boolean> {
    const settings = await readSettings();
    const hooks = getHooks(settings);
    for (const event of Object.values(SLOT_EVENTS).flat()) {
      const matchers = hooks[event];
      if (!Array.isArray(matchers)) continue;
      for (const m of matchers) {
        if (!isHookMatcher(m)) continue;
        if (m.hooks.some((h) => isHookEntry(h) && isManagedCommand(h.command))) {
          return true;
        }
      }
    }
    return false;
  }
}
