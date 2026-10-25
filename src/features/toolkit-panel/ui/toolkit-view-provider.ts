import * as vscode from "vscode";
import { onConfigChanged, readFlag, updateConfigEffective } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { BENEFITS_URL, BRAND_CLICK_SCRIPT, brandBarCss, brandBarHtml } from "../../../shared/brand-bar";
import { TOOLKIT_SWITCHES, ToolkitSwitch } from "../toolkit-switches";

interface SwitchState extends ToolkitSwitch {
  value: boolean;
}

/**
 * The "Toolkit" panel in the benefit-sidebar: one switch per feature, so
 * everything can be turned off (and back on) from our own UI. Registered
 * unconditionally — it is how a hidden, disabled feature comes back.
 */
export class ToolkitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "benefit.toolkitView";

  private view: vscode.WebviewView | undefined;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();

    view.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) this.postState();
    });
    const sub = onConfigChanged(() => this.postState());
    view.onDidDispose(() => sub.dispose());

    this.postState();
  }

  private postState(): void {
    if (!this.view) return;
    const switches: SwitchState[] = TOOLKIT_SWITCHES.map((s) => ({ ...s, value: readFlag(s.key) }));
    void this.view.webview.postMessage({ type: "state", switches });
  }

  private async onMessage(msg: { type: string; key?: string; value?: boolean }): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
          this.postState();
          break;
        case "set":
          // Only keys the panel itself offers — the webview never names
          // arbitrary settings.
          if (msg.key && TOOLKIT_SWITCHES.some((s) => s.key === msg.key)) {
            await updateConfigEffective(msg.key, !!msg.value);
          }
          break;
        case "openBrand":
          await vscode.env.openExternal(vscode.Uri.parse(BENEFITS_URL));
          break;
      }
    } catch (err) {
      logger.error("toolkit", `Toolkit panel action '${msg.type}' failed`, err);
      vscode.window.showErrorMessage(`Benefit: ${(err as Error).message}`);
    } finally {
      setTimeout(() => this.postState(), 150);
    }
  }

  private html(): string {
    // No CSP meta: matches the other webviews in this extension. A strict
    // script-src nonce blocks VS Code's injected acquireVsCodeApi bootstrap.
    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body {
    margin: 0; padding: 14px 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    border-radius: 8px; padding: 4px 12px;
  }
  .intro { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 0 0 10px; }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.12));
  }
  .row:last-child { border-bottom: 0; }
  .row.child { padding-inline-start: 16px; }
  .row.inert { opacity: 0.5; pointer-events: none; }
  .text { min-width: 0; }
  .label { font-weight: 600; }
  .row.child .label { font-weight: 400; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; }

  /* toggle switch (same as the Sounds panel) */
  .switch { position: relative; width: 38px; height: 22px; flex: none; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; inset: 0; cursor: pointer; border-radius: 22px;
    background: var(--vscode-input-background); border: 1px solid var(--vscode-checkbox-border, rgba(128,128,128,0.4));
    transition: background 0.15s;
  }
  .slider::before {
    content: ""; position: absolute; height: 16px; width: 16px; left: 2px; top: 2px;
    border-radius: 50%; background: var(--vscode-foreground); transition: transform 0.15s;
  }
  .switch input:checked + .slider { background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  .switch input:checked + .slider::before { transform: translateX(16px); background: var(--vscode-button-foreground); }
  .switch input:focus-visible + .slider { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
${brandBarCss()}
</style>
</head>
<body>
  <p class="intro">Turn any part of the toolkit on or off. A feature that is off disappears from the sidebar until you turn it back on here.</p>
  <div class="card" id="list"></div>
  ${brandBarHtml("panel")}

<script>
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);

  function render(switches) {
    const values = {};
    switches.forEach((s) => { values[s.key] = s.value; });
    const list = document.getElementById('list');
    list.textContent = '';
    switches.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'row' + (s.parent ? ' child' : '') + (s.parent && !values[s.parent] ? ' inert' : '');

      const text = document.createElement('div');
      text.className = 'text';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = s.label;
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = s.hint;
      text.appendChild(label);
      text.appendChild(hint);

      const sw = document.createElement('label');
      sw.className = 'switch';
      sw.title = s.value ? 'On' : 'Off';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = s.value;
      input.setAttribute('aria-label', s.label);
      input.addEventListener('change', () => post({ type: 'set', key: s.key, value: input.checked }));
      const slider = document.createElement('span');
      slider.className = 'slider';
      sw.appendChild(input);
      sw.appendChild(slider);

      row.appendChild(text);
      row.appendChild(sw);
      list.appendChild(row);
    });
  }
${BRAND_CLICK_SCRIPT}

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') render(e.data.switches);
  });
  post({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
