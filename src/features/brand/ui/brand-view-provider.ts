import * as vscode from "vscode";
import { BENEFITS_URL, BRAND_CLICK_SCRIPT, brandBarCss, brandBarHtml } from "../../../shared/brand-bar";

/**
 * The "Benefits" strip at the very top of the benefit-sidebar: just the course
 * brand bar. A view of its own (with a small initialSize in package.json) so it
 * sits above every other panel without pushing their content around.
 */
export class BrandViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "benefit.brandView";

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === "openBrand") {
        void vscode.env.openExternal(vscode.Uri.parse(BENEFITS_URL));
      }
    });
  }

  private html(): string {
    // No CSP meta: matches the other webviews in this extension. A strict
    // script-src nonce blocks VS Code's injected acquireVsCodeApi bootstrap.
    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; padding: 8px 12px; }
${brandBarCss()}
</style>
</head>
<body>
  ${brandBarHtml("panel")}
<script>
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);
${BRAND_CLICK_SCRIPT}
</script>
</body>
</html>`;
  }
}
