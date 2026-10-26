import * as vscode from "vscode";
import { ResolvedTheme, resolveTheme } from "../shared/theme-resolve";
import { affects, readConfig } from "./config-manager";

export function editorTheme(kind: vscode.ColorThemeKind = vscode.window.activeColorTheme.kind): ResolvedTheme {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return "light";
    case vscode.ColorThemeKind.HighContrast:
      return "hc-dark";
    case vscode.ColorThemeKind.HighContrastLight:
      return "hc-light";
    default:
      return "dark";
  }
}

/** The theme the toolkit draws right now (Appearance resolved against the editor). */
export function currentTheme(): ResolvedTheme {
  return resolveTheme(readConfig().appearance.theme, editorTheme());
}

/** Fires with the new resolved theme when the editor's theme or the preference changes. */
export function onThemeChanged(handler: (theme: ResolvedTheme) => void): vscode.Disposable {
  let last = currentTheme();
  const check = () => {
    const next = currentTheme();
    if (next === last) return;
    last = next;
    handler(next);
  };
  const subs = [
    vscode.window.onDidChangeActiveColorTheme(check),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (affects(e, "appearance.theme")) check();
    }),
  ];
  return { dispose: () => subs.forEach((s) => s.dispose()) };
}
