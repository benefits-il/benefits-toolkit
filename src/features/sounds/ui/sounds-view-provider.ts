import * as vscode from "vscode";
import { readConfig, updateConfig, onConfigChanged } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { HookInstaller } from "../services/hook-installer";
import { SoundAssetManager, SoundChoice, SoundSlot } from "../services/sound-asset-manager";
import { playPreview } from "../services/sound-player";

interface PanelState {
  enabled: boolean;
  installed: boolean;
  sounds: SoundChoice[];
  stopSound: string;
  notificationSound: string;
}

const SLOT_CONFIG_KEY: Record<SoundSlot, string> = {
  stop: "sounds.stopSound",
  notification: "sounds.notificationSound",
};

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
    // feature reinstalling after a sound change, etc.).
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
    let sounds: SoundChoice[] = [];
    try {
      sounds = await this.assets.listSounds();
    } catch {
      sounds = [];
    }
    const state: PanelState = {
      enabled: cfg.enabled,
      installed,
      sounds,
      stopSound: cfg.stopSound,
      notificationSound: cfg.notificationSound,
    };
    void this.view.webview.postMessage({ type: "state", state });
  }

  private async onMessage(msg: { type: string; slot?: SoundSlot; id?: string; value?: boolean }): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
          await this.postState();
          break;
        case "setEnabled":
          // Toggling the config drives the feature: ON activates it (the healer
          // installs + maintains the hooks); OFF deactivates it with reason
          // "disable", which uninstalls the hooks.
          await updateConfig("sounds.enabled", !!msg.value);
          break;
        case "select":
          if (msg.slot && msg.id) {
            await updateConfig(SLOT_CONFIG_KEY[msg.slot], msg.id);
            // The sounds feature's config listener reinstalls the hooks with the
            // new sound when installed.
          }
          break;
        case "preview":
          if (msg.id) {
            await playPreview(this.assets.bundledAssetPath(msg.id));
          }
          break;
        case "test": {
          const cfg = readConfig().sounds;
          await playPreview(this.assets.bundledAssetPath(cfg.stopSound));
          setTimeout(() => {
            void playPreview(this.assets.bundledAssetPath(cfg.notificationSound));
          }, 1200);
          break;
        }
        case "reinstall": {
          const cfg = readConfig().sounds;
          await this.installer.install(cfg.stopSound, cfg.notificationSound);
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
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .label { font-weight: 600; }
  .sub { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 2px 0 8px; }
  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    border-radius: 8px; padding: 10px 12px; margin-bottom: var(--gap);
  }
  .card.disabled { opacity: 0.5; pointer-events: none; }
  .card-title { font-weight: 600; margin-bottom: 8px; }

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

  /* sound list */
  .list {
    max-height: 220px; overflow-y: auto; border-radius: 6px;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  .item {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.12));
  }
  .item:last-child { border-bottom: 0; }
  .item:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.12)); }
  .item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .item .radio {
    width: 14px; height: 14px; flex: none; border-radius: 50%;
    border: 1.5px solid var(--vscode-foreground); position: relative; opacity: 0.6;
  }
  .item.selected .radio { border-color: currentColor; opacity: 1; }
  .item.selected .radio::after {
    content: ""; position: absolute; inset: 3px; border-radius: 50%; background: currentColor;
  }
  .item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .bang {
    flex: none; width: 16px; height: 16px; border-radius: 50%; font-size: 11px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center; cursor: help;
    background: var(--vscode-inputValidation-warningBackground, #6b5400);
    color: var(--vscode-inputValidation-warningForeground, #fff);
    border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
  }
  .item .play {
    flex: none; width: 24px; height: 24px; border-radius: 5px; cursor: pointer; border: 0;
    background: transparent; color: inherit; display: inline-flex; align-items: center; justify-content: center;
  }
  .item .play:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.25)); }
  .item .play svg { width: 11px; height: 11px; fill: currentColor; }

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
  <div class="card">
    <div class="row">
      <span class="label">Sounds</span>
      <label class="switch"><input type="checkbox" id="enabled" /><span class="slider"></span></label>
    </div>
    <div class="sub">Play a sound when Claude finishes or needs you.</div>
  </div>

  <div id="body">
    <div class="card" id="card-stop">
      <div class="card-title">When Claude finishes</div>
      <div class="list" id="list-stop"></div>
    </div>

    <div class="card" id="card-notification">
      <div class="card-title">When Claude asks / needs you</div>
      <div class="sub">Questions, permission prompts, plan approval, idle.</div>
      <div class="list" id="list-notification"></div>
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
  const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

  document.getElementById('enabled').addEventListener('change', (e) => {
    post({ type: 'setEnabled', value: e.target.checked });
  });
  document.getElementById('test-btn').addEventListener('click', () => post({ type: 'test' }));
  document.getElementById('reinstall-btn').addEventListener('click', () => post({ type: 'reinstall' }));

  let state = { enabled: true, installed: false, sounds: [], stopSound: '', notificationSound: '' };

  const OTHER_LABEL = { stop: 'When Claude asks', notification: 'When Claude finishes' };

  function renderList(slot) {
    const selected = slot === 'stop' ? state.stopSound : state.notificationSound;
    const otherSel = slot === 'stop' ? state.notificationSound : state.stopSound;
    const host = document.getElementById('list-' + slot);
    host.textContent = '';
    state.sounds.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'item' + (s.id === selected ? ' selected' : '');

      const radio = document.createElement('span');
      radio.className = 'radio';
      item.appendChild(radio);

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.label;
      item.appendChild(name);

      if (s.id === otherSel) {
        const bang = document.createElement('span');
        bang.className = 'bang';
        bang.textContent = '!';
        bang.title = 'Already selected for "' + OTHER_LABEL[slot] + '"';
        item.appendChild(bang);
      }

      const play = document.createElement('button');
      play.className = 'play';
      play.title = 'Preview';
      play.innerHTML = PLAY_SVG;
      play.addEventListener('click', (e) => {
        e.stopPropagation();
        post({ type: 'preview', id: s.id });
      });
      item.appendChild(play);

      item.addEventListener('click', () => post({ type: 'select', slot, id: s.id }));
      host.appendChild(item);
    });
  }

  function render() {
    document.getElementById('enabled').checked = state.enabled;
    document.getElementById('card-stop').classList.toggle('disabled', !state.enabled);
    document.getElementById('card-notification').classList.toggle('disabled', !state.enabled);
    renderList('stop');
    renderList('notification');
    const on = state.enabled && state.installed;
    document.getElementById('status-dot').className = 'dot ' + (on ? 'on' : 'off');
    document.getElementById('status-text').textContent = !state.enabled
      ? 'Disabled'
      : (state.installed ? 'Installed — hooks active' : 'Not installed yet');
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
