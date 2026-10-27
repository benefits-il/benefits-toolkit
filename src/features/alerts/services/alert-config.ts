import type { BenefitConfig, PopupPosition } from "../../../core/config-manager";

/**
 * ~/.benefits-toolkit/config.json: the settings the dispatcher needs, mirrored
 * from VS Code settings by the extension (a hook can't read those itself).
 */
export interface AlertConfigFile {
  version: 1;
  sounds: { enabled: boolean; done: string; waiting: string };
  /**
   * stay: up until clicked. position: the screen corner. Dispatchers from
   * before them read them as false and the bottom right.
   */
  popup: { enabled: boolean; onDone: boolean; onWaiting: boolean; seconds: number; stay: boolean; position: PopupPosition };
}

export const POPUP_SECONDS_MIN = 3;
export const POPUP_SECONDS_MAX = 60;

export function buildAlertConfig(cfg: Pick<BenefitConfig, "sounds" | "popup">): AlertConfigFile {
  const seconds = Number.isFinite(cfg.popup.seconds) ? cfg.popup.seconds : 8;
  return {
    version: 1,
    sounds: {
      enabled: cfg.sounds.enabled,
      done: cfg.sounds.stopSound,
      waiting: cfg.sounds.notificationSound,
    },
    popup: {
      enabled: cfg.popup.enabled,
      onDone: cfg.popup.onDone,
      onWaiting: cfg.popup.onWaiting,
      seconds: Math.min(POPUP_SECONDS_MAX, Math.max(POPUP_SECONDS_MIN, Math.round(seconds))),
      stay: cfg.popup.stayUntilClicked === true,
      position: cfg.popup.position === "bottomRight" ? "bottomRight" : "topRight",
    },
  };
}

/**
 * Linux has no popup and no per-project sounds; its sh dispatcher just
 * sources this. Sound ids are pool filenames, so they are safe to quote.
 */
export function buildLinuxSoundsEnv(config: AlertConfigFile): string {
  const q = (s: string) => `'${s.replace(/'/g, "")}'`;
  return [
    `ENABLED=${config.sounds.enabled ? 1 : 0}`,
    `DONE=${q(config.sounds.done)}`,
    `WAITING=${q(config.sounds.waiting)}`,
    "",
  ].join("\n");
}

/** -1 / 0 / 1 for dotted numeric versions ("0.7.0" vs "0.10.2"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
