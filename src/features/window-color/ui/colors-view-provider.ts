import * as vscode from "vscode";
import { logger } from "../../../core/logger";
import { normalizeHex, PRESET_PALETTE } from "../services/color-utils";
import { WindowColorService } from "../services/window-color-service";

interface PanelState {
  hasWorkspace: boolean;
  currentColor: string | undefined;
  palette: { name: string; hex: string }[];
}

/**
 * The "Colors" panel in the benefit-sidebar — visual twin of the Sounds panel.
 * Shows the preset palette as real swatches (something QuickPick can't do),
 * plus a custom hex input and Clear. All real work delegates to
 * WindowColorService; this is just UI + wiring.
 */
export class ColorsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "benefit.colorsView";

  private view: vscode.WebviewView | undefined;
  private readonly service: WindowColorService;

  constructor(ctx: vscode.ExtensionContext) {
    this.service = new WindowColorService(ctx);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();

    view.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.postState();
    });
    // The applied color lives in workbench.colorCustomizations (not benefit.*),
    // so watch that key to keep the selected swatch in sync with outside edits.
    const sub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("workbench.colorCustomizations")) void this.postState();
    });
    view.onDidDispose(() => sub.dispose());

    void this.postState();
  }

  private postState(): void {
    if (!this.view) return;
    const state: PanelState = {
      hasWorkspace: vscode.workspace.workspaceFolders !== undefined,
      currentColor: this.service.getCurrentColor(),
      palette: [...PRESET_PALETTE],
    };
    void this.view.webview.postMessage({ type: "state", state });
  }

  private async onMessage(msg: { type: string; hex?: string }): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
          this.postState();
          break;
        case "pick": {
          const hex = typeof msg.hex === "string" ? normalizeHex(msg.hex) : undefined;
          if (hex) await this.service.apply(hex);
          break;
        }
        case "clear":
          await this.service.clear();
          break;
      }
    } catch (err) {
      logger.error("windowColor", `Colors panel action '${msg.type}' failed`, err);
      vscode.window.showErrorMessage(`Benefit colors: ${(err as Error).message}`);
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
    border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;
  }
  .card-title { font-weight: 600; margin-bottom: 4px; }
  .sub { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 2px 0 10px; }

  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .swatch {
    aspect-ratio: 1; border-radius: 6px; cursor: pointer; border: 2px solid transparent;
    padding: 0; position: relative; min-width: 0;
  }
  .swatch:hover { filter: brightness(1.15); }
  .swatch.selected { border-color: var(--vscode-focusBorder); }
  .swatch.selected::after {
    content: ""; position: absolute; inset: 30%;
    border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg) translate(-15%, -15%);
    border-radius: 1px; box-shadow: 0 0 2px rgba(0,0,0,0.6);
  }

  .customrow { display: flex; gap: 8px; margin-top: 10px; }
  .hex {
    flex: 1; min-width: 0; padding: 5px 8px; border-radius: 6px; font: inherit;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
  }
  .hex:focus { outline: 1px solid var(--vscode-focusBorder); }
  .hex.invalid { border-color: var(--vscode-inputValidation-errorBorder, #be1100); }

  .btn {
    padding: 6px 10px; border-radius: 6px; border: 0; cursor: pointer; font: inherit;
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
  }
  .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn:hover { filter: brightness(1.1); }
  .btn.block { width: 100%; margin-top: 10px; }

  .status { display: flex; align-items: center; gap: 8px; font-size: 0.9em; margin-top: 10px; }
  .dot { width: 12px; height: 12px; border-radius: 3px; flex: none; border: 1px solid rgba(128,128,128,0.4); }
  .warn { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .hidden { display: none; }
</style>
</head>
<body>
  <div class="card">
    <div class="card-title">Window Color</div>
    <div class="sub">Color this window's title, activity and status bars so you can tell projects apart.</div>
    <div id="no-workspace" class="warn hidden">Open a folder or workspace to set a window color.</div>
    <div id="controls">
      <div class="grid" id="grid"></div>
      <div class="customrow">
        <input class="hex" id="hex-input" placeholder="#a1b2c3" spellcheck="false" />
        <button class="btn primary" id="apply-btn">Apply</button>
      </div>
      <button class="btn block" id="clear-btn">Clear window color</button>
      <div class="status"><span class="dot" id="current-dot"></span><span id="current-text">No color set</span></div>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);

  let state = { hasWorkspace: true, currentColor: undefined, palette: [] };

  function renderGrid() {
    const grid = document.getElementById('grid');
    grid.textContent = '';
    state.palette.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (p.hex === state.currentColor ? ' selected' : '');
      b.style.background = p.hex;
      b.title = p.name + ' ' + p.hex;
      b.addEventListener('click', () => post({ type: 'pick', hex: p.hex }));
      grid.appendChild(b);
    });
  }

  function render() {
    document.getElementById('no-workspace').classList.toggle('hidden', state.hasWorkspace);
    document.getElementById('controls').classList.toggle('hidden', !state.hasWorkspace);
    renderGrid();
    const dot = document.getElementById('current-dot');
    const text = document.getElementById('current-text');
    if (state.currentColor) {
      dot.style.background = state.currentColor;
      text.textContent = 'Current: ' + state.currentColor;
    } else {
      dot.style.background = 'transparent';
      text.textContent = 'No color set';
    }
  }

  const hexInput = document.getElementById('hex-input');
  function applyCustom() {
    const value = hexInput.value.trim();
    const valid = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
    hexInput.classList.toggle('invalid', !valid && value !== '');
    if (!valid) return;
    post({ type: 'pick', hex: value });
    hexInput.value = '';
  }
  document.getElementById('apply-btn').addEventListener('click', applyCustom);
  hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCustom(); });
  hexInput.addEventListener('input', () => hexInput.classList.remove('invalid'));
  document.getElementById('clear-btn').addEventListener('click', () => post({ type: 'clear' }));

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') { state = e.data.state; render(); }
  });
  post({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
