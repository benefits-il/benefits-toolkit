import { createHash } from "node:crypto";
import type { ResolvedTheme } from "../../../shared/theme-resolve";

/**
 * What the alert dispatcher knows about an open project. Each editor window
 * writes one record per workspace folder into ~/.benefits-toolkit/projects;
 * the dispatcher (a hook, with no line to the extension) reads them to pick
 * the popup's name and color, the project's sound, and whether to stay quiet
 * because the user is already looking at that window.
 */
export interface ProjectRecord {
  folder: string;
  name: string;
  /** Window color (#rrggbb) from the Colors feature, if one is set. */
  color: string | null;
  /**
   * A readable text color on `color` (foregroundFor), worked out once here so
   * the popup draws exactly what the title bar does. Missing in older records.
   */
  colorText?: string | null;
  /** The toolkit's theme in that window (Appearance resolved); the popup's card follows it. */
  theme?: ResolvedTheme;
  /** Per-project sound overrides (pool filenames); missing = global default. */
  sounds: { done?: string; waiting?: string };
  /** The editor's command-line launcher; "<cli> <folder>" focuses the window. */
  cli: string | null;
  /** Which editor wrote the record (vscode, cursor, antigravity, ...). */
  editor: string;
  /** Extension host pid: a "focused" flag from a dead window is ignored. */
  pid: number;
  focused: boolean;
  updatedAt: string;
}

/**
 * Canonical form for comparing folders: forward slashes, no trailing slash,
 * lowercase. The dispatchers (dispatch.ps1 / dispatch.js) apply the same rule
 * to the hook's cwd; keep the three in sync.
 */
export function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Longest popup name we keep; the popup trims anything wider with an ellipsis anyway. */
export const DISPLAY_NAME_MAX = 60;

/**
 * A user-typed popup name, tidied: control characters dropped, whitespace
 * collapsed, capped at DISPLAY_NAME_MAX. Empty means "no custom name".
 */
export function cleanDisplayName(raw: string): string | undefined {
  const name = [...raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()]
    .slice(0, DISPLAY_NAME_MAX)
    .join("")
    .trim();
  return name || undefined;
}

/** Stable file name for a folder's record. */
export function projectKey(folder: string): string {
  return createHash("sha1").update(normalizeFolder(folder)).digest("hex").slice(0, 16);
}

/**
 * The record whose folder contains `cwd` (an agent may run in a subfolder);
 * the deepest match wins. Mirrors the dispatchers' lookup.
 */
export function findProject(records: ProjectRecord[], cwd: string): ProjectRecord | undefined {
  const target = normalizeFolder(cwd);
  if (!target) return undefined;
  let best: ProjectRecord | undefined;
  let bestLength = -1;
  for (const r of records) {
    const folder = normalizeFolder(r.folder);
    if (!folder) continue;
    const inside = target === folder || target.startsWith(`${folder}/`);
    if (inside && folder.length > bestLength) {
      best = r;
      bestLength = folder.length;
    }
  }
  return best;
}
