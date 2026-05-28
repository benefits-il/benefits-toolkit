import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  applySentinelBlock,
  atomicWriteText,
  pathExists,
  readTextSafe,
  SentinelBlock,
  stripSentinelBlock,
} from "../../../shared/fs-utils";
import { RtlMode } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { ClaudeAssets } from "./claude-asset-locator";

const CSS_MARKERS: SentinelBlock = {
  startMarker: "/* BENEFIT-RTL-START */",
  endMarker: "/* BENEFIT-RTL-END */",
};

const JS_MARKERS: SentinelBlock = {
  startMarker: "/* BENEFIT-RTL-SHIM-START */",
  endMarker: "/* BENEFIT-RTL-SHIM-END */",
};

// Some Claude Code builds ship a universal rule that hard-forces LTR and defeats
// RTL. claude-code-rtl removes it; we do the same. No-op when the rule is absent
// (as in 2.1.152), but kept for forward compatibility.
const BIDI_OVERRIDE_RULE = "*{direction:ltr;unicode-bidi:bidi-override}";

// Our own backup of the unpatched asset, kept PER CC-version folder. A Claude Code
// update lands in a new extension folder, so this backup is always the clean
// original of the current version — never a stale older build. It is the recovery
// source if a write ever truncates the live file.
const BACKUP_SUFFIX = ".benefit-bak";

export interface InjectOptions {
  mode: Exclude<RtlMode, "off">;
  textFont: string;
  codeFont: string;
}

export class RtlAssetPatcher {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  private async cssBody(): Promise<string> {
    // Always ship the single scoped stylesheet (rules under `.benefit-rtl-on`).
    // The JS shim is responsible for putting that class on <body> per mode — a
    // robust, class-driven path that doesn't depend on rewriting selectors.
    const file = path.join(this.ctx.extensionPath, "dist", "assets", "rtl", "rtl-overrides.css");
    return fs.readFile(file, "utf8");
  }

  private async jsBody(opts: InjectOptions): Promise<string> {
    const file = path.join(this.ctx.extensionPath, "dist", "assets", "rtl", "rtl-shim.js");
    const template = await fs.readFile(file, "utf8");
    return template
      .replace(/__BENEFIT_RTL_MODE__/g, opts.mode)
      .replace(/__BENEFIT_RTL_TEXT__/g, sanitizeFont(opts.textFont))
      .replace(/__BENEFIT_RTL_CODE__/g, sanitizeFont(opts.codeFont));
  }

  /** Returns true if either asset file was actually changed by this apply. */
  async apply(assets: ClaudeAssets, opts: InjectOptions): Promise<boolean> {
    const cssChanged = await patchFile(assets.cssFile, CSS_MARKERS, await this.cssBody(), { stripBidi: true });

    // The shim is injected in EVERY mode (including "always"): it adds the
    // `benefit-rtl-on` class to <body> and re-asserts it via MutationObserver
    // if Claude Code re-renders. This is the robust fallback that the old
    // "always = pure CSS, no shim" path lacked.
    const jsChanged = await patchFile(assets.jsFile, JS_MARKERS, await this.jsBody(opts));

    if (cssChanged || jsChanged) {
      logger.info("rtl", `Patched ${path.basename(assets.cssFile)} (mode=${opts.mode}).`);
    }
    return cssChanged || jsChanged;
  }

  /** Returns true if either asset file was actually changed by this removal. */
  async remove(assets: ClaudeAssets): Promise<boolean> {
    const cssChanged = await restoreOrStrip(assets.cssFile, CSS_MARKERS);
    const jsChanged = await restoreOrStrip(assets.jsFile, JS_MARKERS);
    if (cssChanged || jsChanged) {
      logger.info("rtl", "Restored Claude Code assets to their unpatched state.");
    }
    return cssChanged || jsChanged;
  }

  async isApplied(assets: ClaudeAssets): Promise<boolean> {
    const css = await readTextSafe(assets.cssFile);
    return !!css && css.includes(CSS_MARKERS.startMarker);
  }
}

async function fileSize(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return -1;
  }
}

/**
 * Establish (or repair) the clean per-folder backup before we touch the live
 * file. On first patch we capture a copy with our sentinel block stripped, so a
 * later restore returns Claude Code to a genuinely unpatched state. If the live
 * file is already materially smaller than the backup, it was truncated/corrupted
 * (the exact failure that once produced a black screen) — restore it first so we
 * never read a partial file and append onto it.
 */
async function ensureCleanBaseline(file: string, markers: SentinelBlock): Promise<void> {
  const backup = file + BACKUP_SUFFIX;
  if (!(await pathExists(backup))) {
    const live = await readTextSafe(file);
    if (live === undefined) return;
    await atomicWriteText(backup, stripSentinelBlock(live, markers));
    return;
  }
  const backupSize = await fileSize(backup);
  const liveSize = await fileSize(file);
  if (liveSize >= 0 && backupSize > 0 && liveSize < backupSize * 0.9) {
    logger.warn(
      "rtl",
      `${path.basename(file)} looks truncated (${liveSize} < ${backupSize} bytes); restoring from backup before patching.`,
    );
    await fs.copyFile(backup, file);
  }
}

/** Post-write integrity gate: never leave a file shorter than what we wrote. */
async function verifyIntegrity(file: string, written: string): Promise<void> {
  const expected = Buffer.byteLength(written, "utf8");
  const actual = await fileSize(file);
  if (actual < expected) {
    const backup = file + BACKUP_SUFFIX;
    if (await pathExists(backup)) {
      await fs.copyFile(backup, file);
    }
    throw new Error(
      `RTL: integrity check failed for ${path.basename(file)} (on disk ${actual} < expected ${expected} bytes); restored from backup.`,
    );
  }
}

async function patchFile(
  file: string,
  markers: SentinelBlock,
  body: string,
  opts?: { stripBidi?: boolean },
): Promise<boolean> {
  await ensureCleanBaseline(file, markers);

  const original = (await readTextSafe(file)) ?? "";
  let base = original;
  if (opts?.stripBidi && base.includes(BIDI_OVERRIDE_RULE)) {
    base = base.split(BIDI_OVERRIDE_RULE).join("");
  }

  const next = applySentinelBlock(base, markers, body);
  if (next === original) return false;

  await atomicWriteText(file, next);
  await verifyIntegrity(file, next);
  return true;
}

/**
 * Prefer restoring the clean backup (returns Claude Code byte-for-byte to its
 * unpatched state); fall back to stripping only our sentinel block when no
 * backup exists.
 */
async function restoreOrStrip(file: string, markers: SentinelBlock): Promise<boolean> {
  const existing = await readTextSafe(file);
  if (existing === undefined) return false;

  const backup = file + BACKUP_SUFFIX;
  if (await pathExists(backup)) {
    const clean = await fs.readFile(backup, "utf8");
    if (clean === existing) return false;
    await atomicWriteText(file, clean);
    await verifyIntegrity(file, clean);
    return true;
  }

  if (!existing.includes(markers.startMarker)) return false;
  const next = stripSentinelBlock(existing, markers);
  if (next === existing) return false;
  await atomicWriteText(file, next);
  return true;
}

function sanitizeFont(value: string): string {
  return value.replace(/["\\]/g, "");
}
