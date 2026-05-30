import * as vscode from "vscode";
import { readConfig, updateConfig, onConfigChanged, SoundVariant } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { HookInstaller } from "../services/hook-installer";
import { SoundAssetManager, SoundSlot } from "../services/sound-asset-manager";
import { playPreview } from "../services/sound-player";

interface PanelState {
  enabled: boolean;
  stopVariant: SoundVariant;
  notificationVariant: SoundVariant;
  installed: boolean;
}

/**
 * The "Sounds" control panel in the benefit-sidebar. Registered unconditionally
 * (even when sounds are disabled) so the Enabled switch is always reachable.
 * All real work delegates to the existing services — this is just UI + wiring.
 */
export class SoundsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "benefit.soundsView";

  private view: vscode.WebviewView | undefined;
  private readonly assets: SoundAssetManager;
  private readonly installer: HookInstaller;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.assets = new SoundAssetManager(ctx);
    this.installer = new HookInstaller(this.assets);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.ctx.extensionUri] };
    view.webview.html = this.html();

    view.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.postState();
    });
    // Keep the panel in sync when config changes elsewhere (settings UI, the
    // feature reinstalling after a variant change, etc.).
    const sub = onConfigChanged(() => void this.postState());
    view.onDidDispose(() => sub.dispose());

    void this.postState();
  }

  private async postState(): Promise<void> {
    if (!this.view) return;
    const cfg = readConfig().sounds;
    let installed = false;
    try {
      installed = await this.installer.isInstalled();
    } catch {
      installed = false;
    }
    const state: PanelState = {
      enabled: cfg.enabled,
      stopVariant: cfg.stopVariant,
      notificationVariant: cfg.notificationVariant,
      installed,
    };
    void this.view.webview.postMessage({ type: "state", state });
  }

  private async onMessage(msg: { type: string; slot?: SoundSlot; variant?: SoundVariant; value?: boolean }): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
          await this.postState();
          break;
        case "setEnabled":
          // Toggling the config drives the feature: ON activates it (the healer
          // installs + maintains the hooks); OFF deactivates it with reason
          // "disable", which uninstalls the hooks. No work needed here beyond
          // flipping the flag.
          await updateConfig("sounds.enabled", !!msg.value);
          break;
        case "setVariant":
          if (msg.slot && msg.variant) {
            const key = msg.slot === "stop" ? "sounds.stopVariant" : "sounds.notificationVariant";
            await updateConfig(key, msg.variant);
            // The sounds feature's config listener reinstalls the hooks with the
            // new variant when installed.
          }
          break;
        case "preview":
          if (msg.slot && msg.variant) {
            await playPreview(this.assets.bundledAssetPath(msg.slot, msg.variant));
          }
          break;
        case "test": {
          const cfg = readConfig().sounds;
          await playPreview(this.assets.bundledAssetPath("stop", cfg.stopVariant));
          setTimeout(() => {
            void playPreview(this.assets.bundledAssetPath("notification", cfg.notificationVariant));
          }, 1200);
          break;
        }
        case "reinstall": {
          const cfg = readConfig().sounds;
          await this.installer.install(cfg.stopVariant, cfg.notificationVariant);
          break;
        }
      }
    } catch (err) {
      logger.error("sounds", `Sounds panel action '${msg.type}' failed`, err);
      vscode.window.showErrorMessage(`Benefit sounds: ${(err as Error).message}`);
    } finally {
      // Reflect the new state. Two passes: a quick one for config-only changes,
      // and a later one to catch the installed/uninstalled status after the
      // feature (re)installs hooks in response to an enable/disable.
      setTimeout(() => void this.postState(), 150);
      setTimeout(() => void this.postState(), 900);
    }
  }

  private html(): string {
    // No CSP meta: matches the working chat-viewer webview in this extension. A
    // strict script-src nonce blocks VS Code's injected acquireVsCodeApi
    // bootstrap, which kills the whole script.
    return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  :root { --gap: 14px; }
  body {
    margin: 0; padding: 14px 12px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
  }
  .section { margin-bottom: var(--gap); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .label { font-weight: 600; }
  .sub { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 2px 0 8px; }
  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    border-radius: 8px; padding: 10px 12px; margin-bottom: var(--gap);
  }
  .card.disabled { opacity: 0.5; pointer-events: none; }

  /* toggle switch */
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

  /* segmented control */
  .seg { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid var(--vscode-button-secondaryBackground, rgba(128,128,128,0.4)); }
  .seg button {
    flex: 1; padding: 6px 8px; border: 0; cursor: pointer; font: inherit;
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .seg button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .seg button:hover:not(.active) { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }

  .controls { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .play {
    flex: none; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; border: 0;
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
    color: var(--vscode-foreground); display: inline-flex; align-items: center; justify-content: center;
  }
  .play:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.3)); }
  .play svg { width: 13px; height: 13px; fill: currentColor; }

  .status { display: flex; align-items: center; gap: 8px; font-size: 0.9em; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .dot.on { background: var(--vscode-testing-iconPassed, #3fb950); }
  .dot.off { background: var(--vscode-descriptionForeground); }
  .btnrow { display: flex; gap: 8px; margin-top: 10px; }
  .btn {
    flex: 1; padding: 6px 10px; border-radius: 6px; border: 0; cursor: pointer; font: inherit;
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
  }
  .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn:hover { filter: brightness(1.1); }
</style>
</head>
<body>
  <div class="section card">
    <div class="row">
      <span class="label">Sounds</span>
      <label class="switch"><input type="checkbox" id="enabled" /><span class="slider"></span></label>
    </div>
    <div class="sub" id="enabled-sub">Play a sound when Claude finishes or needs you.</div>
  </div>

  <div id="body">
    <div class="card" id="card-stop">
      <div class="label">When Claude finishes</div>
      <div class="controls">
        <div class="seg" data-slot="stop">
          <button data-variant="default">Default</button>
          <button data-variant="alt">Alternative</button>
        </div>
        <button class="play" data-slot="stop" title="Preview"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
      </div>
    </div>

    <div class="card" id="card-notify">
      <div class="label">When Claude asks</div>
      <div class="controls">
        <div class="seg" data-slot="notification">
          <button data-variant="default">Default</button>
          <button data-variant="alt">Alternative</button>
        </div>
        <button class="play" data-slot="notification" title="Preview"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
      </div>
    </div>

    <div class="card">
      <div class="status"><span class="dot off" id="status-dot"></span><span id="status-text">…</span></div>
      <div class="btnrow">
        <button class="btn" id="test-btn">Test both</button>
        <button class="btn primary" id="reinstall-btn">Reinstall</button>
      </div>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);

  document.getElementById('enabled').addEventListener('change', (e) => {
    post({ type: 'setEnabled', value: e.target.checked });
  });
  document.querySelectorAll('.seg').forEach((seg) => {
    const slot = seg.dataset.slot;
    seg.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => post({ type: 'setVariant', slot, variant: b.dataset.variant }));
    });
  });
  document.querySelectorAll('.play').forEach((b) => {
    b.addEventListener('click', () => post({ type: 'preview', slot: b.dataset.slot, variant: currentVariant(b.dataset.slot) }));
  });
  document.getElementById('test-btn').addEventListener('click', () => post({ type: 'test' }));
  document.getElementById('reinstall-btn').addEventListener('click', () => post({ type: 'reinstall' }));

  let state = { enabled: true, stopVariant: 'default', notificationVariant: 'default', installed: false };
  const currentVariant = (slot) => slot === 'stop' ? state.stopVariant : state.notificationVariant;

  function render() {
    document.getElementById('enabled').checked = state.enabled;
    document.getElementById('body').classList.toggle('disabled-soft', !state.enabled);
    document.getElementById('card-stop').classList.toggle('disabled', !state.enabled);
    document.getElementById('card-notify').classList.toggle('disabled', !state.enabled);
    setSeg('stop', state.stopVariant);
    setSeg('notification', state.notificationVariant);
    const on = state.enabled && state.installed;
    document.getElementById('status-dot').className = 'dot ' + (on ? 'on' : 'off');
    document.getElementById('status-text').textContent = !state.enabled
      ? 'Disabled'
      : (state.installed ? 'Installed — hooks active' : 'Not installed yet');
  }
  function setSeg(slot, variant) {
    document.querySelectorAll('.seg[data-slot="' + slot + '"] button').forEach((b) => {
      b.classList.toggle('active', b.dataset.variant === variant);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'state') { state = e.data.state; render(); }
  });
  post({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
