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

const SLOT_TO_EVENT: Record<SoundSlot, HookEventName> = {
  stop: "Stop",
  notification: "Notification",
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

  async install(stopVariant: import("../../../core/config-manager").SoundVariant, notificationVariant: import("../../../core/config-manager").SoundVariant): Promise<void> {
    const installed = await this.assets.installAll(stopVariant, notificationVariant);

    const settings = await readSettings();
    const hooks = purgeManagedHooks(getHooks(settings));

    appendManagedHook(hooks, "Stop", buildPlayCommand(installed.stop));
    appendManagedHook(hooks, "Notification", buildPlayCommand(installed.notification));

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
  async ensureInstalled(
    stopVariant: import("../../../core/config-manager").SoundVariant,
    notificationVariant: import("../../../core/config-manager").SoundVariant,
  ): Promise<boolean> {
    const expectedStop = buildPlayCommand(this.assets.installedPath("stop"));
    const expectedNotification = buildPlayCommand(this.assets.installedPath("notification"));

    const settings = await readSettings();
    const hooks = getHooks(settings);
    const currentStop = managedCommandFor(hooks, "Stop");
    const currentNotification = managedCommandFor(hooks, "Notification");

    const wavsExist =
      (await pathExists(this.assets.installedPath("stop"))) &&
      (await pathExists(this.assets.installedPath("notification")));

    if (currentStop === expectedStop && currentNotification === expectedNotification && wavsExist) {
      return false;
    }

    await this.install(stopVariant, notificationVariant);
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
    for (const event of Object.keys(SLOT_TO_EVENT).map((s) => SLOT_TO_EVENT[s as SoundSlot])) {
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
