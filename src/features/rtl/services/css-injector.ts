import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { applySentinelBlock, atomicWriteText, readTextSafe, stripSentinelBlock } from "../../../shared/fs-utils";
import { RtlMode } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { ClaudeAssets } from "./claude-asset-locator";

const CSS_MARKERS = {
  startMarker: "/* BENEFIT-RTL-START */",
  endMarker: "/* BENEFIT-RTL-END */",
};

const JS_MARKERS = {
  startMarker: "/* BENEFIT-RTL-SHIM-START */",
  endMarker: "/* BENEFIT-RTL-SHIM-END */",
};

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
    const cssBody = await this.cssBody();
    const cssChanged = await patchFile(assets.cssFile, CSS_MARKERS, cssBody);

    // The shim is injected in EVERY mode (including "always"): it adds the
    // `benefit-rtl-on` class to <body> and re-asserts it via MutationObserver
    // if Claude Code re-renders. This is the robust fallback that the old
    // "always = pure CSS, no shim" path lacked.
    const jsBody = await this.jsBody(opts);
    const jsChanged = await patchFile(assets.jsFile, JS_MARKERS, jsBody);

    if (cssChanged || jsChanged) {
      logger.info("rtl", `Patched ${path.basename(assets.cssFile)} (mode=${opts.mode}).`);
    }
    return cssChanged || jsChanged;
  }

  /** Returns true if either asset file was actually changed by this removal. */
  async remove(assets: ClaudeAssets): Promise<boolean> {
    const cssChanged = await stripFile(assets.cssFile, CSS_MARKERS);
    const jsChanged = await stripFile(assets.jsFile, JS_MARKERS);
    if (cssChanged || jsChanged) {
      logger.info("rtl", "Removed sentinel blocks from Claude Code assets.");
    }
    return cssChanged || jsChanged;
  }

  async isApplied(assets: ClaudeAssets): Promise<boolean> {
    const css = await readTextSafe(assets.cssFile);
    return !!css && css.includes(CSS_MARKERS.startMarker);
  }
}

async function patchFile(file: string, markers: { startMarker: string; endMarker: string }, body: string): Promise<boolean> {
  const existing = (await readTextSafe(file)) ?? "";
  const next = applySentinelBlock(existing, markers, body);
  if (next === existing) return false;
  await atomicWriteText(file, next);
  return true;
}

async function stripFile(file: string, markers: { startMarker: string; endMarker: string }): Promise<boolean> {
  const existing = await readTextSafe(file);
  if (existing === undefined) return false;
  const next = stripSentinelBlock(existing, markers);
  if (next === existing) return false;
  await atomicWriteText(file, next);
  return true;
}

function sanitizeFont(value: string): string {
  return value.replace(/["\\]/g, "");
}
