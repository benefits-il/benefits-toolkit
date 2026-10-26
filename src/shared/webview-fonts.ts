import * as vscode from "vscode";
import type { BrandFonts } from "./webview-theme";

/** Where the panels may load files from: the bundled fonts live under media/. */
export function panelResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(extensionUri, "media")];
}

/**
 * The course fonts (Rubik, Varela Round) as webview URIs. They ship inside the
 * extension (media/fonts, SIL OFL) so the sidebar never calls out to a font
 * CDN; the view must allow panelResourceRoots().
 */
export function brandFontUris(webview: vscode.Webview, extensionUri: vscode.Uri): BrandFonts {
  const uri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "fonts", file)).toString();
  return {
    rubikLatin: uri("rubik-latin.woff2"),
    rubikHebrew: uri("rubik-hebrew.woff2"),
    varelaLatin: uri("varela-round-latin.woff2"),
    varelaHebrew: uri("varela-round-hebrew.woff2"),
  };
}
