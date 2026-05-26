import * as vscode from "vscode";
import { SoundVariant, updateConfig } from "../../../core/config-manager";
import { SoundAssetManager, SoundSlot } from "./sound-asset-manager";
import { playPreview } from "./sound-player";

interface VariantItem extends vscode.QuickPickItem {
  variant: SoundVariant;
}

const VARIANT_LABELS: Record<SoundVariant, string> = {
  default: "Default",
  alt: "Alternative",
};

const SLOT_TITLES: Record<SoundSlot, string> = {
  stop: "Stop sound (Claude finished writing)",
  notification: "Notification sound (Claude needs your input)",
};

export class VariantPicker {
  constructor(private readonly assets: SoundAssetManager) {}

  async pickFor(slot: SoundSlot, current: SoundVariant): Promise<SoundVariant | undefined> {
    const items: VariantItem[] = (Object.keys(VARIANT_LABELS) as SoundVariant[]).map((v) => ({
      variant: v,
      label: VARIANT_LABELS[v],
      description: v === current ? "(current)" : undefined,
      detail: "Open the row's Play icon to preview.",
      buttons: [{ iconPath: new vscode.ThemeIcon("play"), tooltip: "Preview" }],
    }));

    const qp = vscode.window.createQuickPick<VariantItem>();
    qp.title = SLOT_TITLES[slot];
    qp.placeholder = "Choose a sound variant";
    qp.items = items;
    qp.activeItems = items.filter((i) => i.variant === current);
    qp.matchOnDescription = true;

    return new Promise<SoundVariant | undefined>((resolve) => {
      qp.onDidTriggerItemButton(async (e) => {
        const wavPath = this.assets.bundledAssetPath(slot, e.item.variant);
        try {
          await playPreview(wavPath);
        } catch (err) {
          vscode.window.showWarningMessage(`Preview failed: ${(err as Error).message}`);
        }
      });
      qp.onDidAccept(() => {
        const picked = qp.activeItems[0]?.variant;
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

  async pickAndSave(slot: SoundSlot, current: SoundVariant): Promise<SoundVariant | undefined> {
    const picked = await this.pickFor(slot, current);
    if (picked && picked !== current) {
      const key = slot === "stop" ? "sounds.stopVariant" : "sounds.notificationVariant";
      await updateConfig(key, picked);
    }
    return picked;
  }
}
