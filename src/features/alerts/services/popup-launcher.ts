import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { toolkitBinDir, toolkitHome } from "../../../core/paths";
import { atomicWriteText } from "../../../shared/fs-utils";
import type { HookPlatform } from "./hook-command";

/** What popup.ps1 / popup.js show; same shape the dispatchers write. */
export interface PopupJob {
  title: string;
  subtitle: string;
  color: string;
  cli: string | null;
  folder: string | null;
  seconds: number;
}

/**
 * Run a popup script to the end. A failing script must say why: the hooks
 * send its output to /dev/null, so the test button is where an error shows.
 */
function runPopupScript(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });
    proc.once("error", reject);
    // "exit", not "close": a window the click opened may inherit the pipe.
    proc.once("exit", (code) => {
      proc.stderr?.destroy();
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(cmd)} exited with code ${code}`));
    });
  });
}

/**
 * Show a popup straight from the extension ("Test popup"), through the same
 * script the hooks use, so the test shows exactly what a real alert looks like.
 * Resolves when the popup is gone; rejects with the script's error.
 */
export async function showPopup(job: PopupJob, platform: HookPlatform): Promise<void> {
  if (platform === "linux") throw new Error("Popups aren't available on Linux yet; sounds work as before.");
  const jobFile = path.join(toolkitHome(), "state", "popups", `${randomUUID()}.json`);
  await atomicWriteText(jobFile, JSON.stringify(job));
  if (platform === "win32") {
    await runPopupScript("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-WindowStyle",
      "Hidden",
      "-File",
      path.join(toolkitBinDir(), "popup.ps1"),
      jobFile,
    ]);
    return;
  }
  await runPopupScript("osascript", ["-l", "JavaScript", path.join(toolkitBinDir(), "popup.js"), jobFile]);
}
