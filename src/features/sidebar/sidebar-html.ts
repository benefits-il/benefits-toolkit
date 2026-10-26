import { BENEFITS_LOGO_SVG, BENEFITS_SLOGAN, BENEFITS_TAGLINE_HTML, BENEFITS_URL } from "../../shared/brand-bar";
import { icon, iconMap } from "../../shared/icons";
import type { ResolvedTheme } from "../../shared/theme-resolve";
import { BrandFonts, escapeHtml, renderWebviewPage } from "../../shared/webview-theme";
import type { SoundSlot } from "../alerts/services/alert-assets";
import { DISPLAY_NAME_MAX } from "../alerts/services/project-registry";
import type { ChatListSnapshot } from "../chats/chats-controller";
import { CODE_FONTS, TEXT_FONTS } from "../rtl/services/font-catalog";
import { foregroundFor, PRESET_PALETTE, PresetColor } from "../window-color/services/color-utils";
import { PageId, SETTINGS_PAGES, SettingsPage } from "./settings-catalog";
import { SIDEBAR_CSS, SIDEBAR_SCRIPT } from "./sidebar-assets";

/** Everything Settings shows; posted as { type: "state", state }. */
export interface SidebarState {
  theme: ResolvedTheme;
  /** Every setting the page writes (WRITABLE_SETTINGS), by key. */
  values: Record<string, boolean | string | number>;
  platform: { alerts: boolean; popup: boolean };
  /** The window's (first) project; null with no folder open. */
  project: {
    folderName: string;
    folderCount: number;
    popupName: string | null;
    /** The window color now, and a readable text color on it. */
    color: { hex: string; text: string } | null;
    /** The color put away while Window colors is off. */
    stashedColor: string | null;
  } | null;
  sounds: {
    labels: Record<string, string>;
    defaults: Record<SoundSlot, string>;
    /** This project's own sounds; a missing slot follows the default. */
    overrides: Partial<Record<SoundSlot, string>>;
  };
  /** Hooks: wanted (sounds or popup on) and whether they are installed. */
  hooks: { wanted: boolean; installed: boolean };
  /** The fonts of the RTL lists that this computer has. */
  fonts: string[];
}

/** The Chats tab; posted as { type: "chats", chats }. A null list is still loading. */
export interface SidebarChats {
  list: ChatListSnapshot | null;
  /** The conversation in the focused viewer tab. */
  active: string | null;
  /** This window's folder name, for the list's heading. */
  projectName: string | null;
}

/** The plain UI copy the script shows (the rest sits in the markup). */
const COPY = {
  offTitle: "Conversations are off",
  offBody: "Files on disk are not affected.",
  emptyTitle: "No conversations",
  emptyBody: "Claude Code conversations in this project appear here.",
  noFolderTitle: "No folder open",
  noFolderBody: "Open a folder, or show all projects.",
  errorTitle: "Could not read conversations",
  errorBody: "Check the Claude Code folder and try again.",
  noMatchTitle: "No results",
  noMatchBody: "Try a different search, or all projects.",
  scopeAll: "Used by projects without their own sounds.",
  scopeProject: "This project only. Inherit uses the defaults.",
};

const ICONS = iconMap(["sun", "moon", "chevronDown", "messages", "folder", "alertTriangle", "search", "pencil", "archive", "restore", "download", "trash", "play", "volume", "check"]);

function switchRow(key: string, label: string, hint = "", main = false): string {
  return `<label class="srow${main ? " main" : ""}"><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ""}</span><input type="checkbox" class="switch" role="switch" data-set="${key}" /></label>`;
}

/**
 * A dropdown in the menus' style: the button shows the choice, the list under
 * it writes the setting and closes. Options marked data-font are fonts this
 * computer may not have; the page hides the ones it lacks.
 */
function selectRow(key: string, label: string, options: [string, string][], fonts = false): string {
  const id = `dd-${key.replace(/\./g, "-")}`;
  const items = options
    .map(([v, l]) => `<button type="button" role="menuitemradio" aria-checked="false" data-set-value="${key}" data-value="${escapeHtml(v)}"${fonts && v ? ` data-font="${escapeHtml(v)}"` : ""}>${escapeHtml(l)}<span class="check">${icon("check")}</span></button>`)
    .join("");
  return `<div class="frow"><span class="flabel" id="${id}-label">${label}</span><button class="dd" type="button" id="${id}" data-dd="${id}-menu" aria-haspopup="menu" aria-expanded="false" aria-labelledby="${id}-label ${id}"><span class="v"></span>${icon("chevronDown")}</button><div class="menu dd-menu" id="${id}-menu" role="menu" aria-labelledby="${id}-label" hidden>${items}</div></div>`;
}

function textRow(key: string, label: string, placeholder: string): string {
  return `<label class="frow">${label}<input class="field" type="text" data-set="${key}" placeholder="${placeholder}" spellcheck="false" autocomplete="off" /></label>`;
}

function hint(text: string, id = ""): string {
  return `<p class="hint"${id ? ` id="${id}"` : ""}>${text}</p>`;
}

/** A feature page: back link, title, the feature's switch on top, then its options. */
function page(p: SettingsPage, content: string, beforeOptions = ""): string {
  const head = `<button class="back" type="button">${icon("chevronLeft")}All settings</button><h2 id="h-${p.id}">${p.title}</h2>`;
  const body = p.switchKey
    ? `${switchRow(p.switchKey, p.switchLabel ?? p.title, "", true)}<p class="off-note" id="off-${p.id}" hidden>Off. Settings are kept.</p>${beforeOptions}<fieldset id="fs-${p.id}">${content}</fieldset>`
    : beforeOptions + content;
  return `<section class="page" data-page="${p.id}" aria-labelledby="h-${p.id}" hidden>${head}${body}</section>`;
}

function swatch(p: PresetColor): string {
  return `<button class="swatch" type="button" role="radio" aria-checked="false" data-hex="${p.hex}" title="${escapeHtml(p.name)} · ${p.hex}" aria-label="${escapeHtml(p.name)}" style="--sw:${p.hex};--sw-text:${foregroundFor(p.hex)}">${icon("check")}</button>`;
}

const PAGE_CONTENT: Record<PageId, () => string> = {
  appearance: () =>
    selectRow("appearance.theme", "Theme", [["auto", "Auto, follow the editor"], ["light", "Light"], ["dark", "Dark"]]) +
    hint("Applies to the sidebar, viewer and desktop popup.") +
    `<p class="hint" id="hc-note" hidden>High contrast is on in the editor, so its colors are used.</p>`,

  windowColor: () => `
    <p class="hint" id="color-no-folder" hidden>Open a folder to give it a color.</p>
    <div id="color-body">
      <p class="section-label">Benefits colors</p>
      <div class="swatches benefits" role="radiogroup" aria-label="Benefits colors">${PRESET_PALETTE.filter((p) => p.group === "benefits").map(swatch).join("")}</div>
      <p class="section-label">Deep, mid and soft</p>
      <div class="swatches" role="radiogroup" aria-label="Deep, mid and soft">${PRESET_PALETTE.filter((p) => p.group !== "benefits").map(swatch).join("")}</div>
      <p class="section-label">Custom</p>
      <div class="custom">
        <input type="color" id="color-native" value="#047857" aria-label="Pick any color" />
        <input class="field" id="hex-input" placeholder="#a1b2c3" spellcheck="false" autocomplete="off" aria-label="Hex color" />
        <button class="btn primary" type="button" id="hex-apply">Apply</button>
      </div>
    </div>
    ${hint("Off hides the color and keeps it saved. Clear deletes this project's color.")}
    ${switchRow("windowColor.autoAssign", "Give new projects their own color", "A color no other project uses, the first time a project has a Claude Code conversation.")}`,

  sounds: () => `
    <div class="seg sound-scope" role="group" aria-label="Which sounds">
      <button type="button" id="scope-default" aria-pressed="true">All projects</button>
      <button type="button" id="scope-project" aria-pressed="false">This project</button>
    </div>
    <p class="hint" id="sound-hint"></p>
    <p class="slot-label">When Claude finishes</p>
    <div class="picker-row"><button class="picker" type="button" id="pick-stop" data-pick="stop" aria-haspopup="menu" aria-expanded="false" title="Choose a sound"></button><button class="icon-btn framed" type="button" data-play="stop" aria-label="Play" title="Play">${icon("play")}</button></div>
    <p class="slot-label">When Claude needs input</p>
    <div class="picker-row"><button class="picker" type="button" id="pick-notification" data-pick="notification" aria-haspopup="menu" aria-expanded="false" title="Choose a sound"></button><button class="icon-btn framed" type="button" data-play="notification" aria-label="Play" title="Play">${icon("play")}</button></div>
    ${hint("Click a sound in the list to hear it and choose it. The list stays open until you click outside it.")}
    <div class="btn-row"><button class="btn" type="button" id="test-sounds">${icon("volume")}Test sounds</button></div>
    ${switchRow("sounds.autoAssign", "Give new projects their own sound", "A finished sound no other project uses, the first time a project has a Claude Code conversation. Needs input stays shared.")}`,

  popup: () => `
    <p class="hint" id="popup-unsupported" hidden>The popup works on Windows and macOS. Here, alerts are sound only.</p>
    ${switchRow("popup.onDone", "When Claude finishes")}
    ${switchRow("popup.onWaiting", "When Claude needs input")}
    ${switchRow("popup.stayUntilClicked", "Stay until clicked", "The popup waits for a click on it or on its x.")}
    <label class="frow" id="popup-seconds">Visible for (seconds)<input class="field" type="number" min="3" max="60" data-set="popup.seconds" /></label>
    <div id="popup-name-row">
      <label class="frow">This project: popup name<input class="field" id="popup-name" maxlength="${DISPLAY_NAME_MAX}" dir="auto" spellcheck="false" autocomplete="off" /></label>
      ${hint("Empty uses the folder name. Stored on this computer.")}
    </div>
    <div class="popup-preview" aria-hidden="true">
      <span class="ptile" id="pv-tile">${icon("check")}</span>
      <span class="pcopy"><strong id="pv-title" dir="auto"></strong><small>Claude finished</small></span>
      <span class="px">${icon("x")}</span>
    </div>
    <div class="btn-row"><button class="btn primary" type="button" id="test-popup">${icon("bell")}Test popup</button></div>
    ${hint("Not shown while this window is focused. Hovering pauses the timer. A click brings this window to the front.")}`,

  chats: () =>
    `<p class="section-label">List</p>` +
    selectRow("chats.scope", "Show", [["currentWorkspace", "This project"], ["all", "All projects"]]) +
    selectRow("chats.groupBy", "Group by", [["date", "Date"], ["project", "Project"], ["flat", "None"]]) +
    selectRow("chats.sortOrder", "Sort", [["newest", "Newest first"], ["oldest", "Oldest first"]]) +
    switchRow("chats.showArchived", "Show archived") +
    switchRow("chats.hideEmpty", "Hide empty conversations") +
    switchRow("chats.confirmDelete", "Confirm before deleting") +
    switchRow("chats.showStatusBarRename", "Rename in the status bar", "Renames this project's latest conversation.") +
    `<p class="section-label">Viewer</p>` +
    switchRow("chats.codeCopyButtons", "Copy button on code blocks") +
    switchRow("chats.mdHeButton", "md-he button on messages"),

  rtl: () =>
    hint("Applies to the Claude Code chat panel. The viewer has its own direction switch.") +
    selectRow("rtl.mode", "Direction mode", [["active", "Manual toggle"], ["always", "Always RTL"], ["auto", "Detect each message"]]) +
    selectRow("rtl.textFont", "Chat text font", [["", "Claude Code default"], ...TEXT_FONTS.map((f): [string, string] => [f.name, f.name])], true) +
    selectRow("rtl.codeFont", "Code font", [["", "Editor default"], ...CODE_FONTS.map((f): [string, string] => [f.name, f.name])], true) +
    hint("The lists show the fonts on this computer, plus Rubik and Varela Round, which come with the toolkit.") +
    hint("Reopen the Claude Code chat to apply a change."),

  htmlOpen: () =>
    hint("Adds a Benefits button to HTML files, in the editor's title bar and the Explorer's right-click menu, that opens them in a browser.") +
    switchRow("htmlOpen.mdHe", "md-he button on Markdown files", "The same button on .md files opens them in md-he.") +
    textRow("htmlOpen.browserPath", "Browser executable", "System default browser") +
    hint("Used for both buttons and for md-he in the conversation viewer."),

  diagnostics: () => `
    <div class="status" id="hooks-status"><i></i><span id="hooks-text"></span></div>
    ${hint("Hooks load when a Claude session starts. Restart open sessions after reconnecting.")}
    <div class="btn-row">
      <button class="btn primary" type="button" id="reconnect">${icon("refresh")}Reconnect</button>
      <button class="btn" type="button" id="disconnect">Disconnect</button>
      <button class="btn" type="button" id="show-log">${icon("fileText")}Show log</button>
    </div>
    ${switchRow("sounds.cleanupOnDeactivate", "Remove hooks on shutdown", "Takes the hooks out of Claude Code's settings when the extension stops.")}`,
};

/** Shown above Window colors' options: the color now (or kept while off) and Clear, which works either way. */
const COLOR_NOW = `<div class="current-color" id="current-color" hidden><i id="current-swatch"></i><span id="current-text"></span><button class="link" type="button" id="clear-color">Clear</button></div>`;

function featureRow(p: SettingsPage): string {
  return `<button class="feature-row" type="button" data-open-page="${p.id}">
      <span class="tile" style="background:var(--tile-${p.id});color:var(--tile-${p.id}-fg)">${icon(p.icon)}</span>
      <span class="copy"><strong>${p.title}</strong><small>${p.summary}</small></span>
      ${p.switchKey ? `<span class="off-chip" id="chip-${p.id}" hidden>Off</span>` : ""}
      ${icon("chevronRight")}
    </button>`;
}

function body(): string {
  return `
<div class="side">
  <div class="side-head">
    <div class="seg tabs" role="tablist" aria-label="Benefit's Toolkit">
      <button type="button" role="tab" id="tab-chats" aria-selected="true" aria-controls="screen-chats">Chats</button>
      <button type="button" role="tab" id="tab-settings" aria-selected="false" aria-controls="screen-settings">Settings</button>
    </div>
    <button class="icon-btn framed" type="button" id="theme-btn"></button>
  </div>
  <div class="side-body" id="body">
    <section id="screen-chats" role="tabpanel" aria-labelledby="tab-chats">
      <div id="chat-tools">
        <div class="search">${icon("search")}<input id="search" type="search" placeholder="Search conversations" aria-label="Search conversations" spellcheck="false" autocomplete="off" /></div>
        <div class="seg scope" role="group" aria-label="Which conversations">
          <button type="button" data-scope="currentWorkspace" aria-pressed="true">This project</button>
          <button type="button" data-scope="all" aria-pressed="false">All projects</button>
        </div>
        <div class="list-tools">
          <span class="name" id="list-name"></span>
          <button class="icon-btn" type="button" id="list-options" aria-label="List options" title="List options" aria-haspopup="menu" aria-expanded="false">${icon("dots")}</button>
          <button class="icon-btn" type="button" id="refresh" aria-label="Refresh" title="Refresh">${icon("refresh")}</button>
        </div>
      </div>
      <div id="chat-list" role="listbox" aria-label="Conversations" tabindex="0"></div>
    </section>
    <section id="screen-settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
      <div id="settings-home">
        <div class="project-card" id="project-card" hidden><strong><i class="pdot" id="project-dot"></i><span id="project-name"></span></strong><span id="project-line"></span></div>
        <p class="hint" id="project-multi" hidden></p>
        <p class="hint" id="no-folder-note" hidden>No folder open. Project settings need one.</p>
        <nav aria-label="Settings pages">${SETTINGS_PAGES.map(featureRow).join("")}</nav>
      </div>
      ${SETTINGS_PAGES.map((p) => page(p, PAGE_CONTENT[p.id](), p.id === "windowColor" ? COLOR_NOW : "")).join("\n")}
    </section>
  </div>
  <a class="brand" id="brand" href="${BENEFITS_URL}">
    <span class="top"><span class="logo" aria-hidden="true">${BENEFITS_LOGO_SVG}</span><span class="lock"><strong>Benefits</strong><small>${BENEFITS_SLOGAN}</small></span>${icon("externalLink")}</span>
    <p>${BENEFITS_TAGLINE_HTML}</p>
  </a>
</div>
<div class="menu" id="list-menu" role="menu" aria-label="List options" hidden>
  <p class="menu-label">Group by</p>
  ${[["date", "Date"], ["project", "Project"], ["flat", "None"]].map(([v, l]) => `<button type="button" role="menuitemradio" aria-checked="false" data-set-value="chats.groupBy" data-value="${v}">${l}<span class="check">${icon("check")}</span></button>`).join("")}
  <p class="menu-label">Sort</p>
  ${[["newest", "Newest first"], ["oldest", "Oldest first"]].map(([v, l]) => `<button type="button" role="menuitemradio" aria-checked="false" data-set-value="chats.sortOrder" data-value="${v}">${l}<span class="check">${icon("check")}</span></button>`).join("")}
  <hr />
  <label>Show archived<input type="checkbox" class="switch" role="switch" data-set="chats.showArchived" /></label>
  <label>Hide empty conversations<input type="checkbox" class="switch" role="switch" data-set="chats.hideEmpty" /></label>
</div>
<div class="menu" id="row-menu" role="menu" aria-label="Conversation" hidden></div>
<div class="menu sound-menu" id="sound-menu" role="menu" aria-label="Sounds" hidden></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

function script(): string {
  const pages = SETTINGS_PAGES.map((p) => ({ id: p.id, switchKey: p.switchKey ?? null }));
  const palette = PRESET_PALETTE.map((p) => ({ name: p.name, hex: p.hex }));
  return `
  const PAGES = ${JSON.stringify(pages)};
  const PALETTE = ${JSON.stringify(palette)};
  const ICONS = ${JSON.stringify(ICONS)};
  const COPY = ${JSON.stringify(COPY)};
${SIDEBAR_SCRIPT}`;
}

export function sidebarHtml(fonts: BrandFonts | null, theme: ResolvedTheme): string {
  return renderWebviewPage({ fonts, theme, title: "Benefit's Toolkit", css: SIDEBAR_CSS, body: body(), script: script() });
}
