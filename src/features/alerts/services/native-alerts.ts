import * as path from "node:path";
import * as vscode from "vscode";
import { antigravityRoot, homeDir } from "../../../core/paths";
import { logger } from "../../../core/logger";
import { pathExists } from "../../../shared/fs-utils";
import { readJsonObject, writeJsonObject } from "../../../shared/json-merge";
import { CURSOR_CHIME_KEY, isAntigravityQuiet, quietAntigravity, restoreAntigravity, SavedValues } from "./native-alert-settings";

export { CURSOR_SETTINGS_COMMAND } from "./native-alert-settings";

/**
 * Cursor and Antigravity alert by themselves when their agent finishes, in
 * the same corner as the Benefits popup. "Benefits alert only" turns theirs
 * off, and switching it off puts back what was there:
 * - Antigravity: its "Enable Notifications/Sounds for Agent" settings, kept in
 *   ~/.gemini/config/config.json under userSettings.
 * - Cursor: its chime (a regular setting). Its system notification is kept
 *   inside Cursor, where no extension can reach it, so the page links to
 *   Cursor Settings instead.
 */

const SAVED_KEY = { antigravity: "nativeAlerts.antigravity.saved", cursor: "nativeAlerts.cursor.saved" } as const;

export function antigravityConfigFile(): string {
  return path.join(homeDir(), ".gemini", "config", "config.json");
}

export class NativeAlerts {
  constructor(private readonly state: vscode.Memento) {}

  /**
   * Antigravity's own alerts off (quiet) or back as they were. Writes only on
   * a change, and never a config.json that is not valid JSON.
   */
  async antigravity(quiet: boolean): Promise<void> {
    const file = antigravityConfigFile();
    const saved = this.state.get<SavedValues>(SAVED_KEY.antigravity);
    if (quiet) {
      if (!(await pathExists(antigravityRoot()))) return;
      const config = await readJsonObject(file);
      if (isAntigravityQuiet(config) && saved) return;
      const { next, saved: before } = quietAntigravity(config);
      // A second turn-off keeps the first record of what was there.
      if (!saved) await this.state.update(SAVED_KEY.antigravity, before);
      await writeJsonObject(file, next);
      logger.info("alerts", "Antigravity's own notification and sound turned off.");
      return;
    }
    if (!saved) return;
    if (await pathExists(file)) await writeJsonObject(file, restoreAntigravity(await readJsonObject(file), saved));
    await this.state.update(SAVED_KEY.antigravity, undefined);
    logger.info("alerts", "Antigravity's own notification and sound put back.");
  }

  /** Cursor's chime off (quiet) or back; only inside Cursor, which owns the setting. */
  async cursor(quiet: boolean, inCursor: boolean): Promise<void> {
    if (!inCursor) return;
    const config = vscode.workspace.getConfiguration();
    const saved = this.state.get<SavedValues>(SAVED_KEY.cursor);
    if (quiet) {
      if (saved) return;
      const before = config.inspect(CURSOR_CHIME_KEY)?.globalValue;
      await this.state.update(SAVED_KEY.cursor, { [CURSOR_CHIME_KEY]: before === undefined ? null : before });
      await config.update(CURSOR_CHIME_KEY, false, vscode.ConfigurationTarget.Global);
      return;
    }
    if (!saved) return;
    const before = saved[CURSOR_CHIME_KEY];
    await config.update(CURSOR_CHIME_KEY, before === null ? undefined : before, vscode.ConfigurationTarget.Global);
    await this.state.update(SAVED_KEY.cursor, undefined);
  }
}
