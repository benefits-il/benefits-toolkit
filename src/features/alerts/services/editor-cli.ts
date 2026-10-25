import * as path from "node:path";
import type { HookPlatform } from "./hook-command";

/** Launcher names, best first, for editors built on VS Code. */
const KNOWN_CLIS = ["code", "cursor", "antigravity", "code-insiders", "windsurf"];

/**
 * Folders that may hold the editor's command-line launcher, relative to
 * vscode.env.appRoot (<install>/.../resources/app). Real layouts:
 * Cursor puts it in appRoot/bin, Antigravity in <install>/bin
 * (appRoot/../../bin), and VS Code, which nests a commit folder, in
 * <install>/bin as well (appRoot/../../../bin). macOS bundles use appRoot/bin.
 */
export function cliSearchDirs(appRoot: string, platform: HookPlatform): string[] {
  const p = platform === "win32" ? path.win32 : path.posix;
  return [p.join(appRoot, "bin"), p.join(appRoot, "..", "..", "bin"), p.join(appRoot, "..", "..", "..", "bin")];
}

/**
 * The launcher that brings this editor's window for a folder to the front
 * ("<cli> <folder>" focuses the window that already has it open), or
 * undefined. `listDir` returns a folder's entries, or undefined if missing.
 */
export function findEditorCli(
  appRoot: string,
  platform: HookPlatform,
  listDir: (dir: string) => string[] | undefined,
): string | undefined {
  const p = platform === "win32" ? path.win32 : path.posix;
  for (const dir of cliSearchDirs(appRoot, platform)) {
    const entries = listDir(dir);
    if (!entries) continue;
    const launchers = entries.filter((name) => {
      if (name.includes("tunnel")) return false;
      return platform === "win32" ? name.toLowerCase().endsWith(".cmd") : !name.includes(".");
    });
    const base = (name: string) => name.replace(/\.cmd$/i, "").toLowerCase();
    const known = KNOWN_CLIS.map((k) => launchers.find((name) => base(name) === k)).find(Boolean);
    const pick = known ?? launchers[0];
    if (pick) return p.join(dir, pick);
  }
  return undefined;
}
