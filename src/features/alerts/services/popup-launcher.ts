import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { toolkitBinDir, toolkitHome } from "../../../core/paths";
import { atomicWriteText } from "../../../shared/fs-utils";
import type { HookPlatform } from "./hook-command";
import { runChild } from "./sound-player";

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
 * Show a popup straight from the extension ("Test popup"), through the same
 * script the hooks use, so the test shows exactly what a real alert looks like.
 */
export async function showPopup(job: PopupJob, platform: HookPlatform): Promise<void> {
  if (platform === "linux") throw new Error("Popups aren't available on Linux yet; sounds work as before.");
  const jobFile = path.join(toolkitHome(), "state", "popups", `${randomUUID()}.json`);
  await atomicWriteText(jobFile, JSON.stringify(job));
  if (platform === "win32") {
    await runChild("powershell", [
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
  await runChild("osascript", ["-l", "JavaScript", path.join(toolkitBinDir(), "popup.js"), jobFile]);
}
