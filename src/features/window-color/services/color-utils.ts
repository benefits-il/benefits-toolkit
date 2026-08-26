export interface PresetColor {
  name: string;
  hex: string;
}

/** Mid-tone presets: distinct from each other and readable with a derived foreground. */
export const PRESET_PALETTE: readonly PresetColor[] = [
  { name: "Red", hex: "#c24a4a" },
  { name: "Orange", hex: "#c9772b" },
  { name: "Gold", hex: "#b8860b" },
  { name: "Green", hex: "#3e8c50" },
  { name: "Teal", hex: "#1f8a8a" },
  { name: "Blue", hex: "#2e6fb0" },
  { name: "Indigo", hex: "#4b5aa7" },
  { name: "Purple", hex: "#7c4da0" },
  { name: "Magenta", hex: "#b04a8c" },
  { name: "Slate", hex: "#55616e" },
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

const DARK_FOREGROUND = "#15202b";
const LIGHT_FOREGROUND = "#ffffff";

/** Normalize user hex input to lowercase #rrggbb; undefined if not a valid color. */
export function normalizeHex(input: string): string | undefined {
  const trimmed = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(trimmed)) return `#${trimmed}`;
  if (/^[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed.split("").map((c) => c + c).join("")}`;
  }
  return undefined;
}

/**
 * Pick a readable foreground for the given #rrggbb background using WCAG
 * relative luminance, so the color set works under light and dark themes alike.
 */
export function foregroundFor(hex: string): string {
  const r = channel(hex.slice(1, 3));
  const g = channel(hex.slice(3, 5));
  const b = channel(hex.slice(5, 7));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? DARK_FOREGROUND : LIGHT_FOREGROUND;
}

function channel(hexPair: string): number {
  const srgb = parseInt(hexPair, 16) / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/** Build the full managed key → color map for a normalized #rrggbb background. */
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
