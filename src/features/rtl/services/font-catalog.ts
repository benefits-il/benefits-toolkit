import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/**
 * The fonts the RTL page offers. RTL only names a font inside Claude Code's
 * chat, so a font must be on the computer to show. Bundled fonts come with
 * the toolkit and are copied next to Claude Code's stylesheet; the rest are
 * found by their file names in the system's font folders.
 */
export interface FontChoice {
  name: string;
  bundled?: boolean;
  /** Lowercase file-name prefixes that mean the font is installed. */
  files?: string[];
}

export const TEXT_FONTS: readonly FontChoice[] = [
  { name: "Rubik", bundled: true },
  { name: "Varela Round", bundled: true },
  { name: "Segoe UI", files: ["segoeui."] },
  { name: "Arial", files: ["arial."] },
  { name: "Arial Hebrew", files: ["arialhb."] },
  { name: "Tahoma", files: ["tahoma."] },
  { name: "David", files: ["david."] },
  { name: "Miriam", files: ["mriam."] },
  { name: "Gisha", files: ["gisha."] },
  { name: "Heebo", files: ["heebo"] },
  { name: "Assistant", files: ["assistant"] },
  { name: "Alef", files: ["alef-", "alef."] },
  { name: "Noto Sans Hebrew", files: ["notosanshebrew"] },
];

export const CODE_FONTS: readonly FontChoice[] = [
  { name: "Cascadia Code", files: ["cascadiacode"] },
  { name: "Cascadia Mono", files: ["cascadiamono"] },
  { name: "Consolas", files: ["consola."] },
  { name: "Courier New", files: ["cour.", "courier new"] },
  { name: "Fira Code", files: ["firacode"] },
  { name: "JetBrains Mono", files: ["jetbrainsmono"] },
  { name: "Menlo", files: ["menlo."] },
  { name: "SF Mono", files: ["sfmono", "sf-mono"] },
  { name: "Monaco", files: ["monaco."] },
];

/** The font names (of both lists) whose files are among `fileNames`; bundled ones always. */
export function availableFonts(fileNames: readonly string[]): string[] {
  const lower = fileNames.map((f) => f.toLowerCase());
  return [...TEXT_FONTS, ...CODE_FONTS]
    .filter((f) => f.bundled || f.files?.some((prefix) => lower.some((n) => n.startsWith(prefix))))
    .map((f) => f.name);
}

function fontDirs(platform: NodeJS.Platform): string[] {
  const home = os.homedir();
  if (platform === "win32") {
    const windir = process.env.WINDIR ?? "C:\\Windows";
    const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return [path.join(windir, "Fonts"), path.join(local, "Microsoft", "Windows", "Fonts")];
  }
  if (platform === "darwin") {
    return ["/System/Library/Fonts", "/System/Library/Fonts/Supplemental", "/Library/Fonts", path.join(home, "Library", "Fonts")];
  }
  return ["/usr/share/fonts", "/usr/local/share/fonts", path.join(home, ".local", "share", "fonts"), path.join(home, ".fonts")];
}

/** File names in the font folders, two levels deep (Linux keeps fonts in subfolders). */
async function fontFiles(dirs: string[]): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (depth > 0) await walk(path.join(dir, e.name), depth - 1);
      } else {
        out.push(e.name);
      }
    }
  };
  for (const d of dirs) await walk(d, 2);
  return out;
}

let cached: Promise<string[]> | undefined;

/** The fonts of the RTL lists on this computer, read once per session. */
export function installedFonts(): Promise<string[]> {
  cached ??= fontFiles(fontDirs(process.platform)).then(availableFonts, () => availableFonts([]));
  return cached;
}
