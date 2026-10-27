type Json = Record<string, unknown>;

/**
 * The editors' own alert settings that "Benefits alert only" turns off, and
 * the pure JSON changes behind it (native-alerts.ts applies them).
 */

/** Antigravity's own alert settings, in config.json's userSettings. */
export const ANTIGRAVITY_ALERT_KEYS = ["enableNotificationsForSpecialEvents", "enableSoundsForSpecialEvents"] as const;

/** Cursor's chime when its agent finishes. */
export const CURSOR_CHIME_KEY = "cursor.composer.shouldChimeAfterChatFinishes";

/** The command that opens Cursor Settings. */
export const CURSOR_SETTINGS_COMMAND = "aiSettings.action.open";

/** What a setting held before we turned it off; null: it was not set. */
export type SavedValues = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Antigravity's config with its alerts off, and what they were before. */
export function quietAntigravity(config: Json): { next: Json; saved: SavedValues } {
  const user = isObject(config.userSettings) ? config.userSettings : {};
  const saved: SavedValues = {};
  for (const key of ANTIGRAVITY_ALERT_KEYS) saved[key] = key in user ? user[key] : null;
  const next = { ...user };
  for (const key of ANTIGRAVITY_ALERT_KEYS) next[key] = false;
  return { next: { ...config, userSettings: next }, saved };
}

/** Antigravity's config with its alerts as they were before quietAntigravity. */
export function restoreAntigravity(config: Json, saved: SavedValues): Json {
  const user = isObject(config.userSettings) ? { ...config.userSettings } : {};
  for (const key of ANTIGRAVITY_ALERT_KEYS) {
    if (!(key in saved)) continue;
    if (saved[key] === null) delete user[key];
    else user[key] = saved[key];
  }
  return { ...config, userSettings: user };
}

/** True when both of Antigravity's alerts are off. */
export function isAntigravityQuiet(config: Json): boolean {
  const user = isObject(config.userSettings) ? config.userSettings : {};
  return ANTIGRAVITY_ALERT_KEYS.every((key) => user[key] === false);
}
