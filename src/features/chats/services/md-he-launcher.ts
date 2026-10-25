import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { readConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { atomicWriteText, pathExists } from "../../../shared/fs-utils";
import { resolveBrowserLaunch, runDetached } from "../../html-open/services/browser-launch";
import { buildMdHeUrl, buildRedirectPage, MD_HE_MAX_URL_LENGTH, MD_HE_URL } from "./md-he-link";

const REDIRECT_DIR = path.join(os.tmpdir(), "benefits-toolkit");
const REDIRECT_PREFIX = "md-he-";
const REDIRECT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** "opened": md-he got the message in its URL. "clipboard": too long, pasted by hand. */
export type MdHeOpenResult = "opened" | "clipboard";

/**
 * Open a message in md-he (benefits-il.dev/md-he) in the user's browser,
 * through a small local redirect page (see buildRedirectPage). Honors
 * benefit.htmlOpen.browserPath like the HTML Open feature does.
 */
export async function openInMdHe(markdown: string): Promise<MdHeOpenResult> {
  const url = buildMdHeUrl(markdown);
  if (url.length > MD_HE_MAX_URL_LENGTH) {
    await vscode.env.clipboard.writeText(markdown);
    await vscode.env.openExternal(vscode.Uri.parse(MD_HE_URL));
    return "clipboard";
  }

  void pruneOldRedirects();
  const file = path.join(REDIRECT_DIR, `${REDIRECT_PREFIX}${Date.now()}.html`);
  await atomicWriteText(file, buildRedirectPage(url));
  await openLocalPage(file);
  return "opened";
}

async function openLocalPage(file: string): Promise<void> {
  const { browserPath } = readConfig().htmlOpen;
  if (browserPath && (await pathExists(browserPath))) {
    const { cmd, args } = resolveBrowserLaunch(browserPath, file);
    await runDetached(cmd, args);
    return;
  }
  await vscode.env.openExternal(vscode.Uri.file(file));
}

async function pruneOldRedirects(): Promise<void> {
  try {
    const cutoff = Date.now() - REDIRECT_MAX_AGE_MS;
    for (const name of await fs.readdir(REDIRECT_DIR)) {
      if (!name.startsWith(REDIRECT_PREFIX)) continue;
      const file = path.join(REDIRECT_DIR, name);
      const stat = await fs.stat(file);
      if (stat.mtimeMs < cutoff) await fs.unlink(file);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    logger.warn("chats", "Pruning old md-he redirect pages failed", err);
  }
}
