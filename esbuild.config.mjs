import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes("--watch");
const isProduction = process.argv.includes("--production");

const buildOptions = {
  entryPoints: [path.join(__dirname, "src/extension.ts")],
  bundle: true,
  outfile: path.join(__dirname, "dist/extension.js"),
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: "info",
};

async function copyAssets() {
  const distAssets = path.join(__dirname, "dist", "assets");
  if (existsSync(distAssets)) {
    await rm(distAssets, { recursive: true, force: true });
  }
  await mkdir(distAssets, { recursive: true });

  const featureAssets = [
    ["features/sounds/assets", "sounds"],
    ["features/rtl/assets", "rtl"],
    ["features/chats/assets", "chats"],
  ];

  for (const [src, dst] of featureAssets) {
    const fullSrc = path.join(__dirname, "src", src);
    const fullDst = path.join(distAssets, dst);
    if (existsSync(fullSrc)) {
      await cp(fullSrc, fullDst, { recursive: true });
    }
  }
}

async function run() {
  await copyAssets();

  if (isWatch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("[benefit] esbuild watching for changes...");
  } else {
    await build(buildOptions);
    console.log(`[benefit] build complete (${isProduction ? "production" : "development"}).`);
  }
}

run().catch((err) => {
  console.error("[benefit] build failed:", err);
  process.exit(1);
});
