import * as vscode from "vscode";
import { logger } from "./logger";

export interface Feature {
  readonly id: string;
  isEnabled(): boolean;
  activate(ctx: vscode.ExtensionContext): Promise<void> | void;
  deactivate(): Promise<void> | void;
}

export class FeatureRegistry implements vscode.Disposable {
  private readonly active = new Map<string, Feature>();
  private readonly all = new Map<string, Feature>();

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  register(feature: Feature): void {
    this.all.set(feature.id, feature);
  }

  async syncFromConfig(): Promise<void> {
    for (const feature of this.all.values()) {
      const wantOn = feature.isEnabled();
      const isOn = this.active.has(feature.id);

      if (wantOn && !isOn) {
        try {
          await feature.activate(this.ctx);
          this.active.set(feature.id, feature);
          logger.info("registry", `Activated feature: ${feature.id}`);
        } catch (err) {
          logger.error("registry", `Failed to activate feature: ${feature.id}`, err);
        }
      } else if (!wantOn && isOn) {
        try {
          await feature.deactivate();
          this.active.delete(feature.id);
          logger.info("registry", `Deactivated feature: ${feature.id}`);
        } catch (err) {
          logger.error("registry", `Failed to deactivate feature: ${feature.id}`, err);
        }
      }
    }
  }

  async dispose(): Promise<void> {
    for (const [id, feature] of this.active) {
      try {
        await feature.deactivate();
      } catch (err) {
        logger.warn("registry", `Error while deactivating ${id} during dispose`, err);
      }
    }
    this.active.clear();
  }
}
