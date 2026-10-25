import * as vscode from "vscode";
import { updateConfig } from "../../../core/config-manager";
import { AlertAssets, SoundSlot } from "./alert-assets";
import { playPreview } from "./sound-player";

interface SoundItem extends vscode.QuickPickItem {
  id: string;
}

const SLOT_TITLES: Record<SoundSlot, string> = {
  stop: "Stop sound (Claude finished writing)",
  notification: "Notification sound (Claude needs your input)",
};

const SLOT_CONFIG_KEY: Record<SoundSlot, string> = {
  stop: "sounds.stopSound",
  notification: "sounds.notificationSound",
};

/** QuickPick over the whole bundled sound pool, with per-row preview. */
export class SoundPicker {
  constructor(private readonly assets: AlertAssets) {}

  async pickFor(slot: SoundSlot, current: string): Promise<string | undefined> {
    const sounds = await this.assets.listSounds();
    const items: SoundItem[] = sounds.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.id === current ? "(current)" : undefined,
      buttons: [{ iconPath: new vscode.ThemeIcon("play"), tooltip: "Preview" }],
    }));

    const qp = vscode.window.createQuickPick<SoundItem>();
    qp.title = SLOT_TITLES[slot];
    qp.placeholder = "Choose a sound (click ▶ to preview)";
    qp.items = items;
    qp.activeItems = items.filter((i) => i.id === current);
    qp.matchOnDescription = true;

    return new Promise<string | undefined>((resolve) => {
      qp.onDidTriggerItemButton(async (e) => {
        try {
          await playPreview(this.assets.bundledAssetPath(e.item.id));
        } catch (err) {
          vscode.window.showWarningMessage(`Preview failed: ${(err as Error).message}`);
        }
      });
      qp.onDidAccept(() => {
        const picked = qp.activeItems[0]?.id;
        qp.hide();
        resolve(picked);
      });
      qp.onDidHide(() => {
        qp.dispose();
        resolve(undefined);
      });
      qp.show();
    });
  }

  async pickAndSave(slot: SoundSlot, current: string): Promise<string | undefined> {
    const picked = await this.pickFor(slot, current);
    if (picked && picked !== current) {
      await updateConfig(SLOT_CONFIG_KEY[slot], picked);
    }
    return picked;
  }
}
