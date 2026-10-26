/** What the user picked in Appearance: follow the editor, or force one. */
export type ThemePreference = "auto" | "light" | "dark";

/** What the sidebar, the viewer and the popup actually draw. */
export type ResolvedTheme = "light" | "dark" | "hc-dark" | "hc-light";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["auto", "light", "dark"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * High contrast always wins: someone who turned it on in the editor needs it
 * everywhere, whatever the toolkit's own preference says.
 */
export function resolveTheme(preference: ThemePreference, editor: ResolvedTheme): ResolvedTheme {
  if (editor === "hc-dark" || editor === "hc-light") return editor;
  return preference === "auto" ? editor : preference;
}
