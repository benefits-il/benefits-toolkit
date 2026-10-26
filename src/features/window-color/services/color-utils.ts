export type PresetGroup = "benefits" | "deep" | "mid" | "soft";

export interface PresetColor {
  name: string;
  hex: string;
  group: PresetGroup;
}

/** The course's own colors, the first row of the palette. */
const BENEFITS: readonly [string, string][] = [
  ["Benefits green", "#047857"],
  ["Sunshine", "#fcd34d"],
  ["Coral", "#fb7185"],
  ["Lavender", "#a78bfa"],
  ["Leaf", "#84cc16"],
  ["Sky", "#38bdf8"],
  ["Aqua", "#2dd4bf"],
  ["Pink", "#ec4899"],
];

/**
 * Ten hues in three tones. Mid is the original palette, unchanged, so every
 * window colored before still matches its preset; Deep is Mid mixed about
 * 35% toward black, Soft about 55% toward white.
 */
const HUES: readonly { name: string; deep: string; mid: string; soft: string }[] = [
  { name: "Red", deep: "#7e3030", mid: "#c24a4a", soft: "#e4aeae" },
  { name: "Orange", deep: "#834d1c", mid: "#c9772b", soft: "#e7c2a0" },
  { name: "Gold", deep: "#785707", mid: "#b8860b", soft: "#dfc991" },
  { name: "Green", deep: "#285b34", mid: "#3e8c50", soft: "#a8cbb0" },
  { name: "Teal", deep: "#145a5a", mid: "#1f8a8a", soft: "#9acaca" },
  { name: "Blue", deep: "#1e4872", mid: "#2e6fb0", soft: "#a1bedb" },
  { name: "Indigo", deep: "#313b6d", mid: "#4b5aa7", soft: "#aeb5d7" },
  { name: "Purple", deep: "#513268", mid: "#7c4da0", soft: "#c4afd4" },
  { name: "Magenta", deep: "#72305b", mid: "#b04a8c", soft: "#dbaecb" },
  { name: "Slate", deep: "#373f48", mid: "#55616e", soft: "#b2b8be" },
];

/** Every preset, row by row: Benefits, then Deep, Mid and Soft. */
export const PRESET_PALETTE: readonly PresetColor[] = [
  ...BENEFITS.map(([name, hex]) => ({ name, hex, group: "benefits" as const })),
  ...HUES.map((h) => ({ name: `${h.name}, deep`, hex: h.deep, group: "deep" as const })),
  ...HUES.map((h) => ({ name: h.name, hex: h.mid, group: "mid" as const })),
  ...HUES.map((h) => ({ name: `${h.name}, soft`, hex: h.soft, group: "soft" as const })),
];

/**
 * The exact workbench.colorCustomizations keys this feature owns. Apply sets
 * all of them; Clear deletes exactly these and nothing else, so a user's
 * unrelated customizations (including theme-scoped "[Theme]" blocks) survive.
 */
export const MANAGED_KEYS: readonly string[] = [
  "titleBar.activeBackground",
  "titleBar.activeForeground",
  "titleBar.inactiveBackground",
  "titleBar.inactiveForeground",
  "activityBar.background",
  "activityBar.foreground",
  "activityBar.inactiveForeground",
  "statusBar.background",
  "statusBar.foreground",
];

export const DARK_FOREGROUND = "#15202b";
export const LIGHT_FOREGROUND = "#ffffff";

/** Normalize user hex input to lowercase #rrggbb; undefined if not a valid color. */
export function normalizeHex(input: string): string | undefined {
  const trimmed = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(trimmed)) return `#${trimmed}`;
  if (/^[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed.split("").map((c) => c + c).join("")}`;
  }
  return undefined;
}

/** WCAG relative luminance of a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const r = channel(hex.slice(1, 3));
  const g = channel(hex.slice(3, 5));
  const b = channel(hex.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The text color for a #rrggbb background: white or near-black, whichever
 * contrasts more. The title bar, the Settings preview and the popup all use
 * this one answer (the popup gets it through the project record and the job).
 */
export function foregroundFor(hex: string): string {
  return contrastRatio(hex, LIGHT_FOREGROUND) >= contrastRatio(hex, DARK_FOREGROUND) ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

function channel(hexPair: string): number {
  const srgb = parseInt(hexPair, 16) / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/** Build the full managed key to color map for a normalized #rrggbb background. */
export function buildCustomizations(hex: string): Record<string, string> {
  const fg = foregroundFor(hex);
  return {
    "titleBar.activeBackground": hex,
    "titleBar.activeForeground": fg,
    // Inactive keeps the same background on purpose: the whole point is
    // telling five unfocused windows apart, so identity must survive blur.
    "titleBar.inactiveBackground": hex,
    "titleBar.inactiveForeground": `${fg}99`,
    "activityBar.background": hex,
    "activityBar.foreground": fg,
    "activityBar.inactiveForeground": `${fg}66`,
    "statusBar.background": hex,
    "statusBar.foreground": fg,
  };
}
