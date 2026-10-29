import * as fs from "node:fs";
import { popupPlaceFile } from "../../../core/paths";

/**
 * The spot the user dragged the popup to. popup.ps1 / popup.js write it when
 * a card is dropped and stack later cards from there; deleting it sends them
 * back to the corner (a running popup notices within a quarter second).
 */
export function hasPopupPlace(): boolean {
  return fs.existsSync(popupPlaceFile());
}

export async function clearPopupPlace(): Promise<void> {
  await fs.promises.rm(popupPlaceFile(), { force: true });
}

/** Calls back when a spot appears or goes; polls, since the file may not exist yet. */
export function watchPopupPlace(onChange: () => void): { dispose(): void } {
  const file = popupPlaceFile();
  let had = hasPopupPlace();
  const listener = () => {
    const has = hasPopupPlace();
    if (has !== had) {
      had = has;
      onChange();
    }
  };
  fs.watchFile(file, { interval: 1500, persistent: false }, listener);
  return { dispose: () => fs.unwatchFile(file, listener) };
}
