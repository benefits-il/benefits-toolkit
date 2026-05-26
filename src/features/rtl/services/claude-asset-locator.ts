import * as path from "node:path";
import * as fs from "node:fs/promises";
import { vscodeExtensionsDir } from "../../../core/paths";
import { pathExists } from "../../../shared/fs-utils";

export interface ClaudeAssets {
  rootDir: string;
  cssFile: string;
  jsFile: string;
  versionLabel: string;
}

export class ClaudeAssetLocator {
  constructor(private readonly overridePath: string = "") {}

  async locate(): Promise<ClaudeAssets | undefined> {
    const candidate = this.overridePath.trim().length > 0
      ? await this.tryDir(this.overridePath.trim())
      : await this.findInstalledClaude();
    return candidate;
  }

  private async findInstalledClaude(): Promise<ClaudeAssets | undefined> {
    const extDir = vscodeExtensionsDir();
    if (!(await pathExists(extDir))) return undefined;

    const entries = await fs.readdir(extDir, { withFileTypes: true });
    const candidates = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => name.startsWith("anthropic.claude-code"))
      .sort()
      .reverse();

    for (const name of candidates) {
      const result = await this.tryDir(path.join(extDir, name));
      if (result) return result;
    }
    return undefined;
  }

  private async tryDir(root: string): Promise<ClaudeAssets | undefined> {
    const cssFile = path.join(root, "webview", "index.css");
    const jsFile = path.join(root, "webview", "index.js");
    if (!(await pathExists(cssFile)) || !(await pathExists(jsFile))) {
      return undefined;
    }
    return {
      rootDir: root,
      cssFile,
      jsFile,
      versionLabel: path.basename(root),
    };
  }
}
