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

  private cssBody(): Promise<string> {
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

  async apply(assets: ClaudeAssets, opts: InjectOptions): Promise<void> {
    const cssBody = await this.cssBody();
    const jsBody = await this.jsBody(opts);

    await patchFile(assets.cssFile, CSS_MARKERS, cssBody);
    await patchFile(assets.jsFile, JS_MARKERS, jsBody);

    logger.info("rtl", `Patched ${path.basename(assets.cssFile)} and ${path.basename(assets.jsFile)} (mode=${opts.mode}).`);
  }

  async remove(assets: ClaudeAssets): Promise<void> {
    await stripFile(assets.cssFile, CSS_MARKERS);
    await stripFile(assets.jsFile, JS_MARKERS);
    logger.info("rtl", "Removed sentinel blocks from Claude Code assets.");
  }

  async isApplied(assets: ClaudeAssets): Promise<boolean> {
    const css = await readTextSafe(assets.cssFile);
    return !!css && css.includes(CSS_MARKERS.startMarker);
  }
}

async function patchFile(file: string, markers: { startMarker: string; endMarker: string }, body: string): Promise<void> {
  const existing = (await readTextSafe(file)) ?? "";
  const next = applySentinelBlock(existing, markers, body);
  if (next === existing) return;
  await atomicWriteText(file, next);
}

async function stripFile(file: string, markers: { startMarker: string; endMarker: string }): Promise<void> {
  const existing = await readTextSafe(file);
  if (existing === undefined) return;
  const next = stripSentinelBlock(existing, markers);
  if (next === existing) return;
  await atomicWriteText(file, next);
}

function sanitizeFont(value: string): string {
  return value.replace(/["\\]/g, "");
}
