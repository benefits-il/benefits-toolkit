import * as vscode from "vscode";
import { readConfig, updateConfigEffective } from "../../core/config-manager";
import { ThemePreference } from "../../shared/theme-resolve";
import { isPageId, SidebarViewProvider } from "./sidebar-view-provider";

const THEME_ITEMS: { label: string; description: string; value: ThemePreference }[] = [
  { label: "Auto", description: "Follow the editor", value: "auto" },
  { label: "Light", description: "Cream", value: "light" },
  { label: "Dark", description: "Graphite", value: "dark" },
];

export function registerSidebarCommands(provider: SidebarViewProvider): vscode.Disposable[] {
  return [
    // "Benefit: Toolkit Settings"; a notification may name a page, e.g. { page: "sounds" }.
    vscode.commands.registerCommand("benefit.settings.open", (arg?: { page?: unknown } | string) => {
      const page = typeof arg === "string" ? arg : arg?.page;
      return provider.navigate("settings", isPageId(page) ? page : null);
    }),
    vscode.commands.registerCommand("benefit.settings.close", () => provider.navigate("chats")),
    vscode.commands.registerCommand("benefit.appearance.chooseTheme", async () => {
      const current = readConfig().appearance.theme;
      const picked = await vscode.window.showQuickPick(
        THEME_ITEMS.map((i) => ({ ...i, description: i.value === current ? `${i.description} (current)` : i.description })),
        { title: "Benefit: Theme", placeHolder: "The sidebar, the conversation viewer and the desktop popup" },
      );
      if (picked) await updateConfigEffective("appearance.theme", picked.value);
    }),
  ];
}
