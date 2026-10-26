import * as vscode from "vscode";
import { readConfig } from "../../../core/config-manager";
import type { AlertAssets, SoundSlot } from "./alert-assets";
import type { ProjectPrefsStore } from "./project-prefs-store";
import { playPreview } from "./sound-player";

/** The sounds this window's project actually plays: its own, else the defaults. */
export function effectiveSounds(prefs: ProjectPrefsStore): Record<SoundSlot, string> {
  const cfg = readConfig().sounds;
  const folder = vscode.workspace.workspaceFolders?.find((f) => f.uri.scheme === "file");
  const own = folder ? prefs.sounds(folder.uri.fsPath) : {};
  return { stop: own.stop ?? cfg.stopSound, notification: own.notification ?? cfg.notificationSound };
}

/** "Test sounds": both of them, finished then needs input, as this project hears them. */
export async function playProjectSounds(assets: AlertAssets, prefs: ProjectPrefsStore): Promise<void> {
  const sounds = effectiveSounds(prefs);
  await playPreview(assets.bundledAssetPath(sounds.stop));
  setTimeout(() => {
    playPreview(assets.bundledAssetPath(sounds.notification)).catch(() => undefined);
  }, 1200);
}
