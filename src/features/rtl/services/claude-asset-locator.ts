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

/**
 * Claude Code folders, newest version first. While an update installs, the old
 * and new folders sit side by side; a text sort put 2.1.99 above 2.1.100 and
 * patched the folder VS Code was about to stop using.
 */
export function newestFirst(folderNames: readonly string[]): string[] {
  const version = (name: string): number[] =>
    (/claude-code-(\d+(?:\.\d+)*)/.exec(name)?.[1] ?? "").split(".").filter(Boolean).map(Number);
  const compare = (a: number[], b: number[]): number => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };
  return [...folderNames].sort((a, b) => compare(version(b), version(a)) || b.localeCompare(a));
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
    const candidates = newestFirst(
      entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((name) => name.startsWith("anthropic.claude-code")),
    );

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
