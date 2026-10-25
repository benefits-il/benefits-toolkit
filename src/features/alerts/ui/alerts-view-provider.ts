import * as vscode from "vscode";
import { onConfigChanged, readConfig, updateConfig } from "../../../core/config-manager";
import { logger } from "../../../core/logger";
import { currentPlatform } from "../../../shared/platform-detector";
import { AlertAssets, SoundChoice, SoundSlot } from "../services/alert-assets";
import { POPUP_SECONDS_MAX, POPUP_SECONDS_MIN } from "../services/alert-config";
import { HookInstaller } from "../services/hook-installer";
import { onProjectPrefsChanged, ProjectPrefsStore, ProjectSoundOverrides } from "../services/project-prefs-store";
import { DISPLAY_NAME_MAX } from "../services/project-registry";
import { playPreview } from "../services/sound-player";

interface PanelState {
  soundsEnabled: boolean;
  popupEnabled: boolean;
  popupOnDone: boolean;
  popupOnWaiting: boolean;
  popupSeconds: number;
  popupSupported: boolean;
  installed: boolean;
  sounds: SoundChoice[];
  defaults: Record<SoundSlot, string>;
  /**
   * The window's (first) project: folder name, the name the user gave its
   * popup (if any) and its own sounds; null with no folder open.
   */
  project: { name: string; customName: string | null; overrides: ProjectSoundOverrides } | null;
}

const SLOT_CONFIG_KEY: Record<SoundSlot, string> = {
  stop: "sounds.stopSound",
  notification: "sounds.notificationSound",
};

/** Boolean settings the panel may flip. */
const FLAG_KEYS = new Set(["sounds.enabled", "popup.enabled", "popup.onDone", "popup.onWaiting"]);

/**
 * The "Alerts" panel in the benefit-sidebar: sounds (default, or this
 * project's own) and the desktop popup, with the name it shows for this project. Registered unconditionally so the
 * switches are reachable while alerts are off. The hooks themselves are the
 * alerts feature's job; this is UI + settings.
 */
export class AlertsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "benefit.soundsView";

  private view: vscode.WebviewView | undefined;
  private readonly assets: AlertAssets;
  private readonly store: ProjectPrefsStore;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.assets = new AlertAssets(ctx);
    this.store = new ProjectPrefsStore(ctx);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.ctx.extensionUri] };
    view.webview.html = this.html();

    view.webview.onDidReceiveMessage((msg) => void this.onMessage(msg));
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.postState();
    });
    const subs = [
      onConfigChanged(() => void this.postState()),
      onProjectPrefsChanged(() => void this.postState()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.postState()),
    ];
    view.onDidDispose(() => subs.forEach((s) => s.dispose()));

    void this.postState();
  }

  private projectFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.find((f) => f.uri.scheme === "file");
  }

  private async postState(): Promise<void> {
    if (!this.view) return;
    const cfg = readConfig();
    const platform = currentPlatform();
    let installed = false;
    if (platform !== "unsupported") {
      try {
        installed = await new HookInstaller(this.assets, platform, () => undefined).isInstalled();
      } catch {
        installed = false;
      }
    }
    const folder = this.projectFolder();
    const state: PanelState = {
      soundsEnabled: cfg.sounds.enabled,
      popupEnabled: cfg.popup.enabled,
      popupOnDone: cfg.popup.onDone,
      popupOnWaiting: cfg.popup.onWaiting,
      popupSeconds: cfg.popup.seconds,
      popupSupported: platform === "win32" || platform === "darwin",
      installed,
      sounds: await this.assets.listSounds().catch(() => []),
      defaults: { stop: cfg.sounds.stopSound, notification: cfg.sounds.notificationSound },
      project: folder
        ? {
            name: folder.name,
            customName: this.store.name(folder.uri.fsPath) ?? null,
            overrides: this.store.sounds(folder.uri.fsPath),
          }
        : null,
    };
    void this.view.webview.postMessage({ type: "state", state });
  }

  private async onMessage(msg: {
    type: string;
    key?: string;
    value?: unknown;
    slot?: SoundSlot;
    id?: string | null;
    scope?: "default" | "project";
  }): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
          await this.postState();
          break;
        case "setFlag":
          // Turning both sounds and popup off deactivates the alerts feature,
          // which removes the hooks; turning either back on reinstalls them.
          if (msg.key && FLAG_KEYS.has(msg.key)) await updateConfig(msg.key, !!msg.value);
          break;
        case "setSeconds": {
          const n = Math.round(Number(msg.value));
          if (Number.isFinite(n)) {
            await updateConfig("popup.seconds", Math.min(POPUP_SECONDS_MAX, Math.max(POPUP_SECONDS_MIN, n)));
          }
          break;
        }
        case "setName": {
          // The registry writer hears the change and rewrites the record the
          // dispatcher reads, so the next popup already shows the new name.
          const folder = this.projectFolder();
          if (folder) await this.store.setName(folder.uri.fsPath, String(msg.value ?? ""));
          break;
        }
        case "select":
          if (!msg.slot) break;
          if (msg.scope === "project") {
            const folder = this.projectFolder();
            if (folder) await this.store.setSound(folder.uri.fsPath, msg.slot, msg.id ?? undefined);
          } else if (msg.id) {
            await updateConfig(SLOT_CONFIG_KEY[msg.slot], msg.id);
          }
          break;
        case "preview":
          if (msg.id) await playPreview(this.assets.bundledAssetPath(msg.id));
          break;
        case "testSounds":
          await vscode.commands.executeCommand("benefit.sounds.test");
          break;
        case "testPopup":
          await vscode.commands.executeCommand("benefit.popup.test");
          break;
        case "reinstall":
          await vscode.commands.executeCommand("benefit.sounds.install");
          break;
      }
    } catch (err) {
      logger.error("alerts", `Alerts panel action '${msg.type}' failed`, err);
      vscode.window.showErrorMessage(`Benefit alerts: ${(err as Error).message}`);
    } finally {
      // Two passes: a quick one for settings, a later one for the hooks'
      // installed status after the feature reacts to an on/off change.
      setTimeout(() => void this.postState(), 150);
      setTimeout(() => void this.postState(), 900);
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
  .disabled { opacity: 0.5; pointer-events: none; }
  .card-title { font-weight: 600; margin: 10px 0 6px; }
  .hidden { display: none !important; }

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

  /* default / this project */
  .scope { display: flex; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35)); border-radius: 6px; overflow: hidden; margin: 4px 0 2px; }
  .scope button {
    flex: 1; min-width: 0; padding: 5px 8px; border: 0; cursor: pointer; font: inherit;
    background: transparent; color: var(--vscode-foreground);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .scope button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .scope-note { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 6px 0 0; }

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
  .item.follow .name { font-style: italic; }
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

  .check { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
  .check input { accent-color: var(--vscode-focusBorder); margin: 0; }
  .seconds { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .seconds input {
    width: 56px; padding: 3px 6px; border-radius: 4px; font: inherit;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
  }

  .name-input {
    width: 100%; box-sizing: border-box; padding: 4px 8px; border-radius: 4px; font: inherit;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
  }
  .name-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .name-input::placeholder { color: var(--vscode-input-placeholderForeground); }
  .linkbtn {
    border: 0; padding: 0; background: none; cursor: pointer; font: inherit;
    color: var(--vscode-textLink-foreground); text-decoration: underline;
  }

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
      <label class="switch"><input type="checkbox" id="sounds-enabled" /><span class="slider"></span></label>
    </div>
    <div class="sub">Play a sound when Claude finishes or needs you.</div>
    <div id="sounds-body">
      <div class="scope hidden" id="scope">
        <button type="button" id="scope-default">All projects</button>
        <button type="button" id="scope-project"></button>
      </div>
      <div class="scope-note hidden" id="scope-note"></div>
      <div class="card-title">When Claude finishes</div>
      <div class="list" id="list-stop"></div>
      <div class="card-title">When Claude needs you</div>
      <div class="sub">Questions, permission prompts, plan approval, idle.</div>
      <div class="list" id="list-notification"></div>
    </div>
  </div>

  <div class="card" id="popup-card">
    <div class="row">
      <span class="label">Popup</span>
      <label class="switch"><input type="checkbox" id="popup-enabled" /><span class="slider"></span></label>
    </div>
    <div class="sub" id="popup-sub">A small window in the project's color and name. Click it to jump back to that window. Not shown while you're already in it.</div>
    <div id="popup-body">
      <label class="check"><input type="checkbox" id="popup-done" /> When Claude finishes</label>
      <label class="check"><input type="checkbox" id="popup-waiting" /> When Claude needs you</label>
      <div class="seconds"><span>Stays for</span><input type="number" id="popup-seconds" min="${POPUP_SECONDS_MIN}" max="${POPUP_SECONDS_MAX}" /><span>seconds</span></div>
      <div class="hidden" id="name-block">
        <div class="card-title"><label for="name-input">Name on this project's popup</label></div>
        <input class="name-input" id="name-input" maxlength="${DISPLAY_NAME_MAX}" spellcheck="false" dir="auto" autocomplete="off" />
        <div class="scope-note" id="name-note"></div>
      </div>
      <div class="btnrow"><button class="btn" id="test-popup-btn">Test popup</button></div>
    </div>
  </div>

  <div class="card">
    <div class="status"><span class="dot off" id="status-dot"></span><span id="status-text">…</span></div>
    <div class="btnrow">
      <button class="btn" id="test-btn">Test sounds</button>
      <button class="btn primary" id="reinstall-btn">Reinstall</button>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const post = (m) => vscode.postMessage(m);
  const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const $ = (id) => document.getElementById(id);

  let state = null;
  let scope = (vscode.getState() || {}).scope === 'project' ? 'project' : 'default';

  $('sounds-enabled').addEventListener('change', (e) => post({ type: 'setFlag', key: 'sounds.enabled', value: e.target.checked }));
  $('popup-enabled').addEventListener('change', (e) => post({ type: 'setFlag', key: 'popup.enabled', value: e.target.checked }));
  $('popup-done').addEventListener('change', (e) => post({ type: 'setFlag', key: 'popup.onDone', value: e.target.checked }));
  $('popup-waiting').addEventListener('change', (e) => post({ type: 'setFlag', key: 'popup.onWaiting', value: e.target.checked }));
  $('popup-seconds').addEventListener('change', (e) => post({ type: 'setSeconds', value: e.target.value }));
  $('test-popup-btn').addEventListener('click', () => post({ type: 'testPopup' }));
  $('test-btn').addEventListener('click', () => post({ type: 'testSounds' }));
  $('reinstall-btn').addEventListener('click', () => post({ type: 'reinstall' }));
  $('scope-default').addEventListener('click', () => setScope('default'));
  $('scope-project').addEventListener('click', () => setScope('project'));

  // The popup's name for this project: saved on Enter or when the field loses
  // focus; Escape puts the saved one back; empty means the folder name.
  const nameInput = $('name-input');
  nameInput.addEventListener('change', () => {
    if (!state || !state.project) return;
    const value = nameInput.value.trim();
    if (value === (state.project.customName || '')) return;
    state.project.customName = value || null;
    post({ type: 'setName', value });
    renderName();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
    if (e.key === 'Escape' && state && state.project) {
      nameInput.value = state.project.customName || '';
      nameInput.blur();
    }
  });

  function renderName() {
    const pr = state.project;
    $('name-block').classList.toggle('hidden', !pr);
    if (!pr) return;
    if (document.activeElement !== nameInput) nameInput.value = pr.customName || '';
    nameInput.placeholder = pr.name;
    const note = $('name-note');
    note.textContent = '';
    if (pr.customName) {
      const reset = document.createElement('button');
      reset.className = 'linkbtn';
      reset.textContent = 'Use the folder name';
      reset.addEventListener('click', () => {
        nameInput.value = '';
        state.project.customName = null;
        post({ type: 'setName', value: '' });
        renderName();
      });
      note.append('Instead of the folder name, ' + pr.name + '. ', reset);
    } else {
      note.textContent = 'Empty: the folder name, ' + pr.name + '. Kept on this computer only.';
    }
  }

  function setScope(next) {
    scope = next;
    vscode.setState({ scope });
    render();
  }

  const OTHER = { stop: 'notification', notification: 'stop' };
  const SLOT_LABEL = { stop: 'When Claude finishes', notification: 'When Claude needs you' };

  function labelOf(id) {
    const s = state.sounds.find((x) => x.id === id);
    return s ? s.label : id;
  }
  // The sound that actually plays for a slot in the current scope.
  function effective(slot) {
    if (scope === 'project' && state.project && state.project.overrides[slot]) return state.project.overrides[slot];
    return state.defaults[slot];
  }

  function makeItem(text, selected, onSelect, previewId, extraClass) {
    const item = document.createElement('div');
    item.className = 'item' + (selected ? ' selected' : '') + (extraClass ? ' ' + extraClass : '');
    const radio = document.createElement('span');
    radio.className = 'radio';
    item.appendChild(radio);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = text;
    item.appendChild(name);
    const play = document.createElement('button');
    play.className = 'play';
    play.title = 'Preview';
    play.innerHTML = PLAY_SVG;
    play.addEventListener('click', (e) => { e.stopPropagation(); post({ type: 'preview', id: previewId }); });
    item.appendChild(play);
    item.addEventListener('click', onSelect);
    return item;
  }

  function renderList(slot) {
    const host = $('list-' + slot);
    host.textContent = '';
    const projectMode = scope === 'project' && state.project;
    const own = projectMode ? state.project.overrides[slot] : undefined;
    const selected = projectMode ? own : state.defaults[slot];
    const otherEffective = effective(OTHER[slot]);

    if (projectMode) {
      host.appendChild(makeItem(
        'Same as all projects (' + labelOf(state.defaults[slot]) + ')',
        !own,
        () => post({ type: 'select', scope: 'project', slot, id: null }),
        state.defaults[slot],
        'follow',
      ));
    }
    state.sounds.forEach((s) => {
      const item = makeItem(s.label, s.id === selected,
        () => post({ type: 'select', scope: projectMode ? 'project' : 'default', slot, id: s.id }), s.id);
      if (s.id === otherEffective) {
        const bang = document.createElement('span');
        bang.className = 'bang';
        bang.textContent = '!';
        bang.title = 'Already used for "' + SLOT_LABEL[OTHER[slot]] + '"';
        item.insertBefore(bang, item.lastChild);
      }
      host.appendChild(item);
    });
  }

  function render() {
    if (!state) return;
    if (!state.project && scope === 'project') scope = 'default';
    $('sounds-enabled').checked = state.soundsEnabled;
    $('sounds-body').classList.toggle('disabled', !state.soundsEnabled);
    $('scope').classList.toggle('hidden', !state.project);
    if (state.project) {
      $('scope-project').textContent = 'This project: ' + state.project.name;
      $('scope-project').title = 'Sounds for ' + state.project.name + ' only';
    }
    $('scope-default').classList.toggle('active', scope === 'default');
    $('scope-project').classList.toggle('active', scope === 'project');
    const note = $('scope-note');
    note.classList.toggle('hidden', !(scope === 'project' && state.project));
    if (state.project) note.textContent = 'Sounds for ' + state.project.name + ' only. Other projects keep their own or the default.';
    renderList('stop');
    renderList('notification');

    $('popup-card').classList.toggle('hidden', !state.popupSupported);
    $('popup-enabled').checked = state.popupEnabled;
    $('popup-body').classList.toggle('disabled', !state.popupEnabled);
    $('popup-done').checked = state.popupOnDone;
    $('popup-waiting').checked = state.popupOnWaiting;
    if (document.activeElement !== $('popup-seconds')) $('popup-seconds').value = state.popupSeconds;
    renderName();

    const active = state.soundsEnabled || state.popupEnabled;
    const on = active && state.installed;
    $('status-dot').className = 'dot ' + (on ? 'on' : 'off');
    $('status-text').textContent = !active
      ? 'Sounds and popup are off'
      : (state.installed ? 'Hooks installed and active' : 'Hooks not installed yet');
    $('reinstall-btn').classList.toggle('disabled', !active);
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
