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
