import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface BrowserLaunch {
  cmd: string;
  args: string[];
}

/**
 * Build the spawn command for opening a local file in a specific browser.
 * The file is passed as a file:// URL — every major browser (Chrome, Edge,
 * Firefox) accepts it as a positional argument, and it sidesteps quoting
 * issues with spaces in Windows paths.
 */
export function resolveBrowserLaunch(browserPath: string, fileFsPath: string): BrowserLaunch {
  return {
    cmd: browserPath,
    args: [pathToFileURL(fileFsPath).href],
  };
}

export function runDetached(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Same shape as the sounds player: a normal background child of the
    // long-lived extension host, unref'd so it never blocks host shutdown.
    const proc = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    proc.once("error", reject);
    proc.once("spawn", () => {
      proc.unref();
      resolve();
    });
  });
}
