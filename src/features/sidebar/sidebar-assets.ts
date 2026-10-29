import { relativeTime } from "../chats/services/chat-list";

/**
 * The sidebar's own CSS and page script, on top of the shared Graphite tokens
 * (shared/webview-theme.ts). The markup is static (sidebar-html.ts); the
 * script fills it from the state the extension posts, and sends back what the
 * user does. It never writes a setting itself.
 */

export const SIDEBAR_CSS = `
  body { background: var(--chrome); overflow: hidden; }
  .side { display: flex; flex-direction: column; height: 100vh; }
  .side-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px 12px; }
  .tabs { padding: 3px; }
  .head-new {
    display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px 0 11px; flex: none;
    border-radius: var(--pill); border: 1px solid var(--line); background: var(--input); color: var(--text);
    font: 500 13px var(--head); white-space: nowrap; cursor: pointer;
  }
  .head-new:hover { background: var(--hover); }
  .head-new .mark { width: 15px; height: 15px; }
  .tabs button { font: 500 13px var(--head); min-height: 28px; padding: 4px 16px; }
  /* Each button carries its word and its icon; a narrow sidebar shows the icon (see the end). */
  .tabs button, .scope button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .tabs .ico, .scope .ico, .head-new > .ico { display: none; width: 17px; height: 17px; }
  .side-body { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 12px; scrollbar-width: thin; }

  .brand {
    flex: none; position: relative; margin: 6px 12px 12px;
    border-radius: var(--card-r); background: var(--surface); border: 1px solid var(--line);
  }
  .brand-link { display: block; padding: 12px 40px 12px 12px; border-radius: inherit; color: var(--text); text-decoration: none; }
  .brand-link:hover { text-decoration: none; background: var(--hover); }
  .brand .top { display: flex; align-items: center; gap: 8px; }
  /* The logo and the word shrink with the sidebar (16px at 320 px wide, 10px at 160). */
  .brand .logo { width: clamp(22px, calc(10px + 6.25vw), 30px); height: clamp(22px, calc(10px + 6.25vw), 30px); flex: none; }
  .brand .logo svg { width: 100%; height: 100%; display: block; }
  .brand .lock { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
  .brand strong { font: 700 clamp(10px, calc(4px + 3.75vw), 16px) var(--head); }
  .brand .lock small { margin-top: 2px; font: 500 11.5px var(--head); color: var(--accent); }
  .brand p { margin-top: 8px; font: 11.5px/1.6 var(--body); color: var(--muted); }
  .brand .benefits-dot { font-weight: 900; }
  .brand .fold {
    position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; display: grid; place-items: center;
    border: 0; border-radius: var(--pill); background: transparent; color: var(--muted); cursor: pointer;
  }
  .brand .fold:hover { background: var(--hover); color: var(--text); }
  .brand .fold .ico { width: 15px; height: 15px; }
  /* Folded: one line, about a third of the open card. */
  .brand.folded .brand-link { padding: 7px 40px 7px 10px; }
  .brand.folded .logo { width: clamp(18px, calc(10px + 3.75vw), 22px); height: clamp(18px, calc(10px + 3.75vw), 22px); }
  .brand.folded .lock { flex-direction: row; align-items: baseline; gap: 7px; white-space: nowrap; overflow: hidden; }
  .brand.folded strong { font-size: clamp(10px, calc(4px + 2.95vw), 13.5px); }
  .brand.folded .lock small { margin: 0; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
  .brand.folded .by, .brand.folded p { display: none; }
  .brand.folded .fold { top: 50%; margin-top: -12px; }

  /* ---- Chats ---- */
  .search {
    display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; margin-bottom: 10px;
    border-radius: var(--pill); background: var(--input); border: 1px solid var(--line);
  }
  .search:focus-within { outline: 2px solid var(--focus); outline-offset: 1px; }
  .search .ico { width: 15px; height: 15px; color: var(--muted); }
  .search input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-size: 13px; }
  .search input::placeholder { color: var(--muted); }
  .search input::-webkit-search-cancel-button { display: none; }
  .search-close { display: none; place-items: center; flex: none; padding: 0; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
  .search-close:hover { color: var(--text); }
  .search-close .ico { width: 15px; height: 15px; }
  .search-open {
    display: none; place-items: center; flex: none; width: 34px; height: 34px; padding: 0; cursor: pointer;
    border-radius: var(--pill); border: 1px solid var(--line); background: var(--input); color: var(--muted);
  }
  .search-open:hover { color: var(--text); }
  .search-open .ico { width: 16px; height: 16px; }
  /* Search above the scope; a narrow sidebar puts them on one line as icons. */
  .tools-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 8px; margin-bottom: 12px; }
  .tools-row .search { flex: 1 1 100%; min-width: 0; margin-bottom: 0; }
  .scope { display: grid; grid-template-columns: 1fr 1fr; flex: 1 1 100%; }
  .list-tools { display: flex; align-items: center; gap: 2px; margin: 0 0 2px; color: var(--muted); font-size: 12px; }
  .list-tools .name { flex: 1; min-width: 0; padding-inline-start: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .group-label { font: 500 12px var(--head); color: var(--accent); margin: 14px 8px 6px; letter-spacing: 0.01em; }
  .group-label:first-child { margin-top: 6px; }
  #chat-list { outline: none; }
  /* One line per conversation, in columns: the project's dot, the agent's mark,
     the title in a softer gray, then the time and the context ring at the far end. */
  :root { --row-text: #CDD1CC; }
  :root[data-theme="light"] { --row-text: #2E3A33; }
  :root[data-theme^="hc"] { --row-text: var(--text); }
  .row {
    position: relative; display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 10px;
    margin-bottom: 2px; border-radius: var(--row-r); cursor: pointer;
  }
  /* The agent's mark: Claude, Cursor or Antigravity, at a glance. */
  .row > .mark { width: 15px; height: 15px; }
  .agent-copy { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .agent-copy .mark { width: 20px; height: 20px; }
  /* A "Benefits alert only" row: its button sits under its text, above the row's line. */
  .own-row { border-bottom: 1px solid var(--line); }
  .own-row .srow { border-bottom: 0; align-items: flex-start; }
  .own-row .agent-copy { align-items: flex-start; }
  .own-row .agent-copy .mark { margin-top: 1px; }
  .own-row .btn-row { margin: 0 0 12px 32px; }
  /* A hairline between two rows of a group; it hides next to a highlighted row. */
  .row + .row::before {
    content: ""; position: absolute; left: 12px; right: 12px; top: -2px; height: 1px; background: var(--line); pointer-events: none;
  }
  .row:hover::before, .row:hover + .row::before, .row.selected::before, .row.selected + .row::before { visibility: hidden; }
  .row:hover { background: var(--hover); }
  .row.selected { background: var(--selected); }
  #chat-list:focus-visible .row.focused { outline: 2px solid var(--focus); outline-offset: -2px; }
  /* A Hebrew title reads right to left but starts beside the mark, like the rest. */
  .row-title { flex: 1; min-width: 0; text-align: left; font: 400 13px/1.3 var(--head); color: var(--row-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row.selected .row-title { color: var(--text); font-weight: 500; }
  .row.archived .row-title { color: var(--muted); }
  /* The far end: the time against the ring. Both keep their width in every row
     (a row without a ring keeps the space), so the times line up. */
  .row-end { flex: none; display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); }
  .row-end time { width: 26px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; unicode-bidi: isolate; }
  .row-ctx { flex: none; width: 14px; display: flex; justify-content: center; }
  /* The context ring fills with the window: green, yellow from 50%, red from 80%. */
  .ring {
    width: 13px; height: 13px; flex: none; border-radius: 50%;
    background: conic-gradient(var(--fill) calc(var(--p) * 1%), var(--line) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.6px), #000 calc(100% - 2.4px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 2.6px), #000 calc(100% - 2.4px));
  }
  .pdot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--c, transparent); border: 1.5px solid var(--c, var(--muted)); }
  /* What every row shares tells nothing, so it makes room for the titles: no
     marks when all the conversations are Claude's, no dots when all are one project's. */
  #chat-list.claude-only .row > .mark, #chat-list.one-project .row > .pdot { display: none; }
  .skeleton { height: 28px; margin: 2px 0; border-radius: var(--row-r); background: var(--surface); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }

  .empty { padding: 30px 8px; text-align: center; }
  .empty > .ico { width: 28px; height: 28px; margin: 0 auto 12px; color: var(--muted); }
  .empty h3 { font: 600 14px var(--head); margin-bottom: 6px; }
  .empty p { color: var(--muted); font-size: 12px; margin-bottom: 14px; }
  .empty .btn { margin: 3px; }

  /* ---- A narrow sidebar: each word turns into its icon once it no longer fits
     (the widths are where the English words stop fitting). */
  @media (max-width: 304px) {
    .head-new { width: 34px; padding: 0; justify-content: center; }
    .head-new > span, .head-new > .mark { display: none; }
    .head-new > .ico { display: block; }
  }
  @media (max-width: 300px) { .brand p { display: none; } }
  @media (max-width: 280px) { .brand .lock small { display: none; } }
  /* Tabs, search and scope as icons; search is a magnifier on the scope's line
     that opens the field (and stays open while it holds a search). */
  @media (max-width: 244px) {
    .tabs button, .scope button { padding: 4px 12px; }
    .tabs .lbl, .scope .lbl { display: none; }
    .tabs .ico, .scope .ico { display: block; }
    .tools-row { flex-wrap: nowrap; }
    .tools-row .search { display: none; flex: 1 1 auto; }
    .search-open { display: grid; }
    .scope { display: inline-flex; flex: none; margin-left: auto; }
    .tools-row.searching .search, .tools-row:has(#search:not(:placeholder-shown)) .search { display: flex; }
    .tools-row.searching .search-close, .tools-row:has(#search:not(:placeholder-shown)) .search-close { display: grid; }
    .tools-row.searching .search-open, .tools-row:has(#search:not(:placeholder-shown)) .search-open,
    .tools-row.searching .scope, .tools-row:has(#search:not(:placeholder-shown)) .scope { display: none; }
  }
  /* Only when the word would be too small to read: the B alone. */
  @media (max-width: 159px) {
    .brand .lock, .brand .fold { display: none; }
    .brand-link, .brand.folded .brand-link { padding: 8px; display: grid; place-items: center; }
    .brand .top { justify-content: center; }
  }

  /* ---- Settings ---- */
  .project-card { padding: 12px; margin-bottom: 8px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .project-card strong { display: flex; align-items: center; gap: 7px; margin-bottom: 2px; color: var(--text); font: 600 13px var(--head); min-width: 0; }
  .project-card strong span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .feature-row {
    display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 8px; cursor: pointer;
    border: 0; border-radius: var(--row-r); background: transparent; text-align: start; color: var(--text);
  }
  .feature-row:hover { background: var(--hover); }
  .tile { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 9px; }
  .tile .ico { width: 16px; height: 16px; }
  .feature-row .copy { flex: 1; min-width: 0; }
  .feature-row strong { display: block; font: 500 13px var(--head); }
  .feature-row small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--muted); }
  .off-chip { flex: none; font: 500 10.5px var(--head); color: var(--muted); border: 1px solid var(--line); border-radius: var(--pill); padding: 1px 8px; }
  .feature-row > .ico { width: 16px; height: 16px; color: var(--muted); }

  .back { display: inline-flex; align-items: center; gap: 2px; margin: 2px 0 10px; padding: 0; border: 0; background: none; cursor: pointer; color: var(--accent); font: 500 12px var(--head); }
  .back .ico { width: 14px; height: 14px; }
  .page h2 { font: 700 20px var(--head); letter-spacing: -0.3px; margin-bottom: 8px; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  fieldset:disabled { opacity: 0.5; }
  .srow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); cursor: pointer; }
  .srow strong { display: block; font: 400 13px var(--head); }
  .srow.main strong { font-weight: 500; }
  .srow small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--muted); }
  .frow { display: block; margin: 12px 0; font-size: 12px; color: var(--muted); }
  .frow .field { margin-top: 6px; }
  .flabel { display: block; }
  .dd, .picker {
    width: 100%; min-width: 0; min-height: 32px; display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 12px;
    border-radius: 10px; background: var(--input); border: 1px solid var(--line); color: var(--text); cursor: pointer; text-align: start;
    font: 400 12.5px var(--head);
  }
  .dd { margin-top: 6px; }
  .dd:hover, .picker:hover { background: var(--hover); }
  .dd[aria-expanded="true"], .picker[aria-expanded="true"] { border-color: var(--accent); }
  .dd:disabled, .picker:disabled { cursor: not-allowed; background: var(--input); }
  .dd .v, .picker .v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dd > .ico, .picker > .ico { width: 14px; height: 14px; color: var(--muted); transition: transform 0.15s; }
  .dd[aria-expanded="true"] > .ico, .picker[aria-expanded="true"] > .ico { transform: rotate(180deg); }
  .dd-menu, .sound-menu { max-height: min(320px, calc(100vh - 24px)); overflow: auto; scrollbar-width: thin; }
  .sound-menu button .sl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sound-menu button small { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .sound-menu button.playing > .ico:first-child { color: var(--accent); }
  .section-label { margin: 18px 0 0; font: 500 12px var(--head); color: var(--accent); }
  .hint { margin: 10px 0; font: 12px/1.6 var(--body); color: var(--muted); }
  .off-note { margin: 10px 0; font-size: 12px; color: var(--muted); }
  .btn-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }

  .current-color { display: flex; align-items: center; gap: 8px; margin: 10px 0 4px; font-size: 12px; color: var(--muted); }
  .current-color i { width: 16px; height: 16px; flex: none; border-radius: 5px; background: var(--c); border: 1px solid var(--line); }
  .swatches { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 5px; margin: 8px 0; }
  .swatches.benefits { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .swatch {
    aspect-ratio: 1; min-width: 0; padding: 0; cursor: pointer; display: grid; place-items: center;
    border-radius: 6px; border: 1px solid rgba(0, 0, 0, 0.18); background: var(--sw); color: var(--sw-text);
  }
  .swatch .ico { width: 12px; height: 12px; display: none; }
  .swatch[aria-checked="true"] { outline: 2px solid var(--focus); outline-offset: 2px; }
  .swatch[aria-checked="true"] .ico { display: block; }
  .custom { display: flex; align-items: center; gap: 6px; margin: 10px 0; }
  .custom input[type="color"] { width: 34px; height: 32px; flex: none; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--input); cursor: pointer; }
  .custom .field { flex: 1; font-family: var(--mono); }

  .slot-label { margin: 12px 0 6px; font-size: 12px; color: var(--muted); }
  .picker-row { display: flex; gap: 6px; }
  .picker { flex: 1; }
  .picker .m { color: var(--muted); }
  .sound-scope { display: grid; grid-template-columns: 1fr 1fr; width: 100%; margin-top: 12px; }

  .popup-preview {
    display: flex; align-items: center; gap: 10px; width: 100%; max-width: 300px; height: 64px; padding: 11px; margin: 12px 0;
    border-radius: 10px; background: var(--surface); border: 2px solid var(--c); box-shadow: var(--card-shadow);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  :root[data-theme^="hc"] .popup-preview { border-color: var(--line); }
  /* Like the real popup: the agent's mark on a quiet tile; the project's color is the frame. */
  .popup-preview .ptile { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 8px; background: #2C302E; color: var(--text); }
  :root[data-theme="light"] .popup-preview .ptile { background: #F1ECDD; }
  :root[data-theme^="hc"] .popup-preview .ptile { background: transparent; border: 1px solid var(--line); }
  .popup-preview .ptile .mark { width: 20px; height: 20px; }
  .popup-preview .pcopy { flex: 1; min-width: 0; }
  .popup-preview strong { display: block; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .popup-preview small { display: block; font-size: 11px; color: var(--accent); }
  .popup-preview .px { align-self: flex-start; color: var(--muted); }
  .popup-preview .px .ico { width: 14px; height: 14px; }
  /* The pill a staying popup shrinks to: mark, name, counter, check. */
  .pv-cap { display: block; margin: -4px 0 6px; font-size: 11px; color: var(--muted); }
  .pill-preview {
    display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px 0 7px; margin: 0 0 12px;
    border-radius: 15px; background: var(--surface); border: 2px solid var(--c); box-shadow: var(--card-shadow);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  :root[data-theme^="hc"] .pill-preview { border-color: var(--line); }
  .pill-preview .mark { width: 16px; height: 16px; }
  .pill-preview strong { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
  .pill-preview .pn { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; display: grid; place-items: center; background: var(--c); color: var(--ct); font-size: 10px; font-weight: 700; }
  :root[data-theme^="hc"] .pill-preview .pn { background: var(--line); color: var(--bg); }
  .pill-preview .ico { width: 12px; height: 12px; color: var(--accent); }

  .status { display: flex; align-items: center; gap: 8px; margin: 6px 0; padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); font-size: 12.5px; }
  .status i { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--muted); }
  .status.on i { background: var(--on); }

  .menu .menu-label { padding: 6px 10px 2px; font: 500 11px var(--head); color: var(--accent); }
  .menu button .check { margin-inline-start: auto; visibility: hidden; color: var(--accent); }
  .menu button .check .ico { width: 14px; height: 14px; color: var(--accent); }
  .menu button[aria-checked="true"] .check { visibility: visible; }
`;

export const SIDEBAR_SCRIPT = `
  const relTime = ${relativeTime.toString()};
  let state = null;
  let chats = null;
  let route = Object.assign({ tab: 'chats', page: null }, vscode.getState() || {});
  let soundScope = 'default';
  let query = '';
  let focusIndex = -1;
  let pendingReveal = null;
  let revealSwitched = false;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('visible'), 1600);
  }

  // ---- Where we are: a tab, and on Settings maybe a feature page. Kept across reloads.
  function go(tab, page) {
    route = { tab, page: tab === 'settings' ? (page || null) : route.page };
    vscode.setState(route);
    closeMenu(false);
    renderRoute();
    $('body').scrollTop = 0;
  }
  function renderRoute() {
    const settings = route.tab === 'settings';
    $('tab-chats').setAttribute('aria-selected', String(!settings));
    $('tab-settings').setAttribute('aria-selected', String(settings));
    $('screen-chats').hidden = settings;
    $('screen-settings').hidden = !settings;
    $('settings-home').hidden = !!route.page;
    $$('.page').forEach((p) => { p.hidden = p.dataset.page !== route.page; });
  }
  $('tab-chats').onclick = () => go('chats');
  $('tab-settings').onclick = () => go('settings', null);
  $$('[data-open-page]').forEach((b) => { b.onclick = () => go('settings', b.dataset.openPage); });
  $$('.back').forEach((b) => { b.onclick = () => go('settings', null); });
  $('brand-link').onclick = (e) => { e.preventDefault(); post({ type: 'openBrand' }); };
  $('new-chat').onclick = () => post({ type: 'newChat' });
  $('open-cursor-settings').onclick = () => post({ type: 'openCursorSettings' });
  // The card folds to one line; the choice is a setting, so every window follows.
  $('brand-fold').onclick = () => {
    const folded = !$('brand').classList.contains('folded');
    renderFold(folded);
    post({ type: 'set', key: 'appearance.brandFolded', value: folded });
  };
  function renderFold(folded) {
    $('brand').classList.toggle('folded', folded);
    const fold = $('brand-fold');
    fold.innerHTML = folded ? ICONS.chevronsUp : ICONS.chevronDown;
    fold.setAttribute('aria-expanded', String(!folded));
    fold.setAttribute('aria-label', folded ? 'Unfold the Benefits card' : 'Fold the Benefits card');
    fold.title = folded ? 'Unfold' : 'Fold';
  }

  // ---- Settings: every control names its setting in data-set; the extension checks and writes it.
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.set) return;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    post({ type: 'set', key: el.dataset.set, value });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-set-value]');
    if (!b) return;
    post({ type: 'set', key: b.dataset.setValue, value: b.dataset.value });
    // A dropdown shows the choice at once and closes; the state that follows confirms it.
    const menu = b.closest('.dd-menu');
    if (menu) {
      $$('[data-set-value]', menu).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      renderDropdowns();
      closeMenu(true);
    }
  });

  // ---- Dropdowns: the button shows the current choice; its list opens under it.
  function renderDropdowns() {
    $$('.dd').forEach((b) => {
      const menu = $(b.dataset.dd);
      const on = menu.querySelector('[aria-checked="true"]');
      const v = state ? value(menu.querySelector('[data-set-value]').dataset.setValue) : '';
      // A value typed by hand before the lists existed still shows, marked custom.
      b.querySelector('.v').textContent = on ? on.textContent.trim() : v ? v + ' (custom)' : '';
    });
  }
  function openUnder(button, menu) {
    const r = button.getBoundingClientRect();
    menu.style.minWidth = Math.round(r.width) + 'px';
    toggleMenu(button, menu, r.left, r.bottom + 4, false);
  }
  $$('.dd').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openUnder(b, $(b.dataset.dd)); }; });

  function value(key) { return state ? state.values[key] : undefined; }

  function render() {
    if (!state) return;
    document.documentElement.dataset.theme = state.theme;
    renderFold(!!value('appearance.brandFolded'));
    // New chat: this editor's agent, or Claude Code when chosen; the mark says which.
    const target = value('chats.newChatOpens') === 'claudeCode' ? 'claude' : EDITOR_AGENT;
    $('new-chat').hidden = !value('chats.newChatButton');
    $('new-chat').querySelector('.mark').className = 'mark mark-' + target;
    $('new-chat').title = 'New ' + (target === 'claude' ? 'Claude Code' : AGENT_NAMES[target] + ' Agent') + ' chat';

    $$('[data-set]').forEach((el) => {
      const v = value(el.dataset.set);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v === undefined || v === null ? '' : String(v);
    });
    $$('[data-set-value]').forEach((b) => b.setAttribute('aria-checked', String(value(b.dataset.setValue) === b.dataset.value)));
    // Fonts this computer lacks stay out of the lists (the current one stays, so it can be seen).
    $$('[data-font]').forEach((b) => { b.hidden = !state.fonts.includes(b.dataset.font) && b.getAttribute('aria-checked') !== 'true'; });
    renderDropdowns();

    PAGES.forEach((p) => {
      if (!p.switchKey) return;
      const on = !!value(p.switchKey);
      $('fs-' + p.id).disabled = !on;
      $('off-' + p.id).hidden = on;
      $('chip-' + p.id).hidden = on;
    });
    $('hc-note').hidden = !state.theme.startsWith('hc');
    renderProject();
    renderColors();
    renderSounds();
    renderPopup();
    renderHooks();
    renderAgents();
  }

  function renderProject() {
    const pr = state.project;
    $('project-card').hidden = !pr;
    $('no-folder-note').hidden = !!pr;
    if (!pr) return;
    $('project-name').textContent = pr.folderName;
    $('project-dot').style.setProperty('--c', pr.color ? pr.color.hex : '');
    $('project-line').textContent = 'Popup name: ' + (pr.popupName || pr.folderName);
    $('project-multi').hidden = pr.folderCount < 2;
    $('project-multi').textContent = 'The first of ' + pr.folderCount + ' folders in this window.';
  }

  function renderColors() {
    const pr = state.project;
    $('color-no-folder').hidden = !!pr;
    $('color-body').hidden = !pr;
    if (!pr) { $('current-color').hidden = true; return; }
    const hex = pr.color ? pr.color.hex : null;
    $$('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s.dataset.hex === hex)));
    const shown = hex || pr.stashedColor;
    $('current-color').hidden = !shown;
    if (shown) {
      const preset = PALETTE.find((p) => p.hex === shown);
      $('current-swatch').style.setProperty('--c', shown);
      $('current-text').textContent = (preset ? preset.name : 'Custom') + ' \\u00b7 ' + shown + (hex ? '' : ' \\u00b7 kept while off');
    }
    if (document.activeElement !== $('hex-input') && hex) $('color-native').value = hex;
  }

  function soundLabel(id) { return state.sounds.labels[id] || id; }
  function renderSounds() {
    const pr = state.project;
    if (!pr && soundScope === 'project') soundScope = 'default';
    $('scope-project').disabled = !pr;
    $('scope-default').setAttribute('aria-pressed', String(soundScope === 'default'));
    $('scope-project').setAttribute('aria-pressed', String(soundScope === 'project'));
    $('sound-hint').textContent = soundScope === 'project' ? COPY.scopeProject : COPY.scopeAll;
    ['stop', 'notification'].forEach((slot) => {
      const btn = $('pick-' + slot);
      const own = soundScope === 'project' ? state.sounds.overrides[slot] : state.sounds.defaults[slot];
      btn.innerHTML = '<span class="v">' + (own ? esc(soundLabel(own)) : '<span class="m">Default \\u00b7 </span>' + esc(soundLabel(state.sounds.defaults[slot]))) + '</span>' + ICONS.chevronDown;
    });
  }
  $('scope-default').onclick = () => { soundScope = 'default'; renderSounds(); };
  $('scope-project').onclick = () => { soundScope = 'project'; renderSounds(); };

  // The sound list: a click plays the sound and chooses it, and the list stays
  // open, so the sounds can be heard one after another.
  function soundItem(id, label, sub, checked) {
    return '<button type="button" role="menuitemradio" aria-checked="' + checked + '" data-sound="' + esc(id) + '">' +
      ICONS.play + '<span class="sl">' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') +
      '<span class="check">' + ICONS.check + '</span></button>';
  }
  function openSoundMenu(button) {
    const slot = button.dataset.pick;
    const project = soundScope === 'project';
    const current = project ? (state.sounds.overrides[slot] || '') : state.sounds.defaults[slot];
    const menu = $('sound-menu');
    menu.dataset.slot = slot;
    menu.dataset.scope = soundScope;
    menu.innerHTML = (project ? soundItem('', 'Same as all projects', soundLabel(state.sounds.defaults[slot]), current === '') + '<hr />' : '') +
      Object.keys(state.sounds.labels).map((id) => soundItem(id, soundLabel(id), '', id === current)).join('');
    openUnder(button, menu);
    const on = menu.querySelector('[aria-checked="true"]');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }
  $$('[data-pick]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openSoundMenu(b); }; });
  $('sound-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sound]');
    if (!b) return;
    const menu = $('sound-menu');
    $$('[data-sound]', menu).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    $$('.playing', menu).forEach((x) => x.classList.remove('playing'));
    b.classList.add('playing');
    clearTimeout(openSoundMenu.timer);
    openSoundMenu.timer = setTimeout(() => b.classList.remove('playing'), 1500);
    post({ type: 'setSound', scope: menu.dataset.scope, slot: menu.dataset.slot, id: b.dataset.sound });
  });
  $$('[data-play]').forEach((b) => { b.onclick = () => post({ type: 'previewSound', scope: soundScope, slot: b.dataset.play }); });
  $('test-sounds').onclick = () => post({ type: 'testSounds' });

  function renderPopup() {
    const pr = state.project;
    $('popup-unsupported').hidden = state.platform.popup;
    $('popup-name-row').hidden = !pr;
    const name = $('popup-name');
    if (pr && document.activeElement !== name) name.value = pr.popupName || '';
    if (pr) name.placeholder = pr.folderName;
    const typed = document.activeElement === name ? name.value.trim() : (pr && pr.popupName) || '';
    const title = typed || (pr ? pr.folderName : "Benefit's Toolkit");
    $('pv-title').textContent = title;
    $('pv-pill-title').textContent = title;
    // The preview card and pill take the project's color for their frame, like the real ones.
    for (const el of [$('pv-tile').parentElement, $('pv-pill')]) {
      el.style.setProperty('--c', pr && pr.color ? pr.color.hex : '#047857');
      el.style.setProperty('--ct', pr && pr.color ? pr.color.text : '#ffffff');
    }
    // Staying popups are full size for the seconds, then a pill.
    const stay = !!value('popup.stayUntilClicked');
    $('popup-seconds-label').textContent = stay ? 'Full size for (seconds)' : 'Visible for (seconds)';
    $('pv-pill-row').hidden = !stay;
    $('popup-place').hidden = !state.popupPlaced;
  }
  $('popup-corner').onclick = () => post({ type: 'popupToCorner' });
  $('popup-name').addEventListener('input', renderPopup);
  $('popup-name').addEventListener('change', (e) => post({ type: 'setPopupName', value: e.target.value }));
  $('test-popup').onclick = () => post({ type: 'testPopup' });

  function renderAgents() {
    for (const [agent, a] of Object.entries(state.agents || {})) {
      const el = $('agent-' + agent + '-status');
      if (!el) continue;
      el.textContent = !a.present ? 'Not installed on this computer'
        : !value('agents.' + agent) ? 'Off'
        : !state.hooks.wanted ? 'Sounds and popup are off; chats are listed'
        : a.hooked ? 'Connected' : 'Not connected';
    }
  }

  function renderHooks() {
    const h = state.hooks;
    const on = h.wanted && h.installed;
    $('hooks-status').classList.toggle('on', on);
    $('hooks-text').textContent = !state.platform.alerts ? 'Not available on this system'
      : !h.wanted ? 'Sounds and popup are off' : h.installed ? 'Connected to Claude Code' : 'Not connected';
    $('reconnect').disabled = !h.wanted;
    $('disconnect').disabled = !h.installed;
  }
  $('reconnect').onclick = () => post({ type: 'reconnect' });
  $('disconnect').onclick = () => post({ type: 'disconnect' });
  $('show-log').onclick = () => post({ type: 'showLog' });

  // ---- Window colors: a swatch applies at once; a typed hex on Apply or Enter.
  $$('.swatch').forEach((s) => { s.onclick = () => post({ type: 'pickColor', hex: s.dataset.hex }); });
  function applyHex() {
    const input = $('hex-input');
    const v = input.value.trim();
    const ok = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
    input.classList.toggle('invalid', !ok);
    if (!ok) return;
    post({ type: 'pickColor', hex: v });
    input.value = '';
  }
  $('hex-apply').onclick = applyHex;
  $('hex-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyHex(); });
  $('hex-input').addEventListener('input', () => $('hex-input').classList.remove('invalid'));
  $('color-native').addEventListener('change', (e) => post({ type: 'pickColor', hex: e.target.value }));
  $('clear-color').onclick = () => post({ type: 'clearColor' });

  // ---- Chats: the list, its states, search, and the keyboard.
  function visibleRows() { return $$('#chat-list .row'); }
  // An empty state is not a list of options: the container's role follows what it holds.
  function emptyState(icon, title, body, buttons) {
    $('chat-list').setAttribute('role', 'group');
    return '<div class="empty">' + ICONS[icon] + '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' +
      buttons.map((b) => '<button class="btn' + (b.primary ? ' primary' : '') + '" type="button" data-empty-action="' + b.action + '">' + esc(b.label) + '</button>').join('') + '</div>';
  }
  function renderChats() {
    const host = $('chat-list');
    const enabled = state ? !!state.values['chats.enabled'] : true;
    $('chat-tools').hidden = !enabled;
    $('chat-list').setAttribute('aria-busy', String(enabled && !(chats && chats.list)));
    if (!enabled) {
      host.innerHTML = emptyState('messages', COPY.offTitle, COPY.offBody, [{ action: 'enable', label: 'Enable conversations', primary: true }]);
      return;
    }
    if (!chats || !chats.list) {
      host.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      return;
    }
    const list = chats.list;
    const scope = list.scope;
    $$('[data-scope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === scope)));
    $('list-name').textContent = scope === 'all' ? 'All projects' : (chats.projectName || 'This project');
    if (list.status === 'noFolder') {
      host.innerHTML = emptyState('folder', COPY.noFolderTitle, COPY.noFolderBody, [{ action: 'all', label: 'Show all projects', primary: true }, { action: 'openFolder', label: 'Open folder' }]);
      return;
    }
    if (list.status === 'error') {
      host.innerHTML = emptyState('alertTriangle', COPY.errorTitle, COPY.errorBody, [{ action: 'refresh', label: 'Try again', primary: true }]);
      return;
    }
    if (!list.total) {
      host.innerHTML = emptyState('messages', COPY.emptyTitle, COPY.emptyBody, scope === 'all' ? [] : [{ action: 'all', label: 'Show all projects', primary: true }]);
      return;
    }
    // Decided on the whole list, not the search's matches, so typing never shifts the rows.
    const all = list.groups.flatMap((g) => g.rows);
    host.classList.toggle('claude-only', all.every((r) => r.agent === 'claude'));
    host.classList.toggle('one-project', new Set(all.map((r) => r.project)).size <= 1);
    const q = query.toLowerCase();
    let html = '';
    let n = 0;
    list.groups.forEach((g) => {
      const rows = g.rows.filter((r) => !q || r.title.toLowerCase().includes(q) || r.project.toLowerCase().includes(q) || AGENT_NAMES[r.agent].toLowerCase().includes(q));
      if (!rows.length) return;
      if (g.label) html += '<h3 class="group-label">' + esc(g.label) + '</h3>';
      rows.forEach((r) => {
        const sel = chats.active === r.id;
        html += '<div class="row' + (sel ? ' selected' : '') + (r.archived ? ' archived' : '') + '" role="option" id="row-' + n + '" data-id="' + esc(r.id) + '"' + (r.readOnly ? ' data-read-only="1"' : '') + ' aria-selected="' + sel + '">' +
          // The project is the dot's color, and its name on hover.
          '<i class="pdot" role="img" aria-label="' + esc(r.project) + '" title="' + esc(r.project) + '"' + (r.color ? ' style="--c:' + esc(r.color) + '"' : '') + '></i>' +
          '<i class="mark mark-' + esc(r.agent) + '" role="img" aria-label="' + esc(AGENT_NAMES[r.agent]) + '" title="' + esc(AGENT_NAMES[r.agent]) + '"></i>' +
          '<span class="row-title" dir="auto" title="' + esc(r.title) + '">' + esc(r.title) + '</span>' +
          '<span class="row-end"><time datetime="' + esc(r.modified) + '" title="' + esc(new Date(r.modified).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })) + '">' + esc(relTime(r.modified)) + '</time>' +
          '<span class="row-ctx">' + contextMeter(r.context) + '</span></span></div>';
        n++;
      });
    });
    if (!n) {
      host.innerHTML = emptyState('search', COPY.noMatchTitle, COPY.noMatchBody, scope === 'all' ? [] : [{ action: 'all', label: 'Search all projects', primary: true }]);
      return;
    }
    host.setAttribute('role', 'listbox');
    host.innerHTML = html;
    if (focusIndex >= n) focusIndex = n - 1;
    syncFocus(false);
    if (pendingReveal) reveal(pendingReveal);
  }

  // How full the conversation's context window is: a small ring, the percent on hover.
  function contextMeter(pct) {
    if (pct === null || pct === undefined) return '';
    const fill = pct >= 80 ? 'var(--danger)' : pct >= 50 ? 'var(--warning)' : 'var(--accent)';
    const shown = pct > 0 && pct < 1 ? '<1' : String(Math.round(pct));
    return '<span class="ring" role="img" aria-label="Context window ' + shown + '% full" title="Context window ' + shown + '% full" style="--p:' + Math.max(3, pct) + ';--fill:' + fill + '"></span>';
  }

  $('chat-list').addEventListener('click', (e) => {
    const action = e.target.closest('[data-empty-action]');
    if (action) {
      const a = action.dataset.emptyAction;
      if (a === 'enable') post({ type: 'set', key: 'chats.enabled', value: true });
      if (a === 'all') post({ type: 'set', key: 'chats.scope', value: 'all' });
      if (a === 'openFolder') post({ type: 'openFolder' });
      if (a === 'refresh') post({ type: 'refreshChats' });
      return;
    }
    const row = e.target.closest('.row');
    if (!row) return;
    focusIndex = visibleRows().indexOf(row);
    syncFocus(false);
    post({ type: 'chat', action: 'open', id: row.dataset.id });
  });
  $('chat-list').addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    e.preventDefault();
    focusIndex = visibleRows().indexOf(row);
    syncFocus(false);
    openRowMenu(row, e.clientX, e.clientY);
  });
  $('chat-list').addEventListener('keydown', (e) => {
    const rows = visibleRows();
    if (!rows.length) return;
    const last = rows.length - 1;
    const move = { ArrowDown: Math.min(last, focusIndex + 1), ArrowUp: Math.max(0, focusIndex - 1), Home: 0, End: last }[e.key];
    if (move !== undefined) { e.preventDefault(); focusIndex = move; syncFocus(true); return; }
    const row = rows[focusIndex];
    if (!row) return;
    if (e.key === 'Enter') { e.preventDefault(); post({ type: 'chat', action: 'open', id: row.dataset.id }); }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = row.getBoundingClientRect();
      openRowMenu(row, r.left + 24, r.bottom - 6);
    }
    if (row.dataset.readOnly) return;
    if (e.key === 'Delete') post({ type: 'chat', action: 'delete', id: row.dataset.id });
    if (e.key === 'F2') post({ type: 'chat', action: 'rename', id: row.dataset.id });
  });
  $('chat-list').addEventListener('focus', () => { if (focusIndex < 0) { focusIndex = 0; syncFocus(true); } });
  function syncFocus(scroll) {
    const rows = visibleRows();
    rows.forEach((r, i) => r.classList.toggle('focused', i === focusIndex));
    const row = rows[focusIndex];
    if (row) {
      $('chat-list').setAttribute('aria-activedescendant', row.id);
      if (scroll) row.scrollIntoView({ block: 'nearest' });
    } else {
      $('chat-list').removeAttribute('aria-activedescendant');
    }
  }
  // Select a conversation in the list ("Show in list" from a viewer). One from
  // another project switches the list to All projects first.
  function reveal(id) {
    const rows = visibleRows();
    const row = rows.find((r) => r.dataset.id === id);
    if (row) {
      pendingReveal = null;
      focusIndex = rows.indexOf(row);
      syncFocus(true);
      $('chat-list').focus();
      return;
    }
    const scope = chats && chats.list ? chats.list.scope : null;
    if (scope === 'currentWorkspace') {
      pendingReveal = id;
      if (!revealSwitched) { revealSwitched = true; post({ type: 'set', key: 'chats.scope', value: 'all' }); }
      return;
    }
    // Still loading: keep waiting. Already all projects: it is not listed (archived, or empty).
    pendingReveal = scope === 'all' ? null : id;
  }

  $('search').addEventListener('input', (e) => { query = e.target.value.trim(); focusIndex = -1; renderChats(); });
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; query = ''; renderChats(); closeSearch(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIndex = 0; $('chat-list').focus(); syncFocus(true); }
  });
  // A narrow sidebar shows search as a magnifier: it opens the field in the
  // scope's place, and the field folds back once it is empty and left.
  function closeSearch() {
    if (!$('tools-row').classList.contains('searching')) return;
    $('tools-row').classList.remove('searching');
    $('search-open').focus();
  }
  $('search-open').onclick = () => { $('tools-row').classList.add('searching'); $('search').focus(); };
  $('search-close').onclick = () => { $('search').value = ''; query = ''; renderChats(); closeSearch(); };
  $('search').addEventListener('blur', () => { if (!$('search').value) $('tools-row').classList.remove('searching'); });
  $$('[data-scope]').forEach((b) => { b.onclick = () => post({ type: 'set', key: 'chats.scope', value: b.dataset.scope }); });
  $('refresh').onclick = () => post({ type: 'refreshChats' });
  $('list-options').onclick = (e) => {
    e.stopPropagation();
    const r = $('list-options').getBoundingClientRect();
    toggleMenu($('list-options'), $('list-menu'), r.right, r.bottom + 6, true);
  };

  // ---- Menus: the row's right-click menu and List options.
  let openMenu = null;
  function closeMenu(focusBack) {
    if (!openMenu) return;
    openMenu.menu.hidden = true;
    if (openMenu.button) openMenu.button.setAttribute('aria-expanded', 'false');
    const back = openMenu.button || $('chat-list');
    openMenu = null;
    if (focusBack) back.focus();
  }
  function toggleMenu(button, menu, x, y, alignEnd) {
    if (openMenu && openMenu.menu === menu && openMenu.button === button) return closeMenu(true);
    closeMenu(false);
    menu.hidden = false;
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const left = alignEnd ? x - w : x;
    menu.style.left = Math.round(Math.max(6, Math.min(window.innerWidth - w - 6, left))) + 'px';
    menu.style.top = Math.round(Math.max(6, Math.min(window.innerHeight - h - 6, y))) + 'px';
    if (button) button.setAttribute('aria-expanded', 'true');
    openMenu = { button, menu };
    const first = menu.querySelector('[aria-checked="true"]:not([hidden])') || menu.querySelector('button:not([hidden]), input');
    if (first) first.focus({ preventScroll: true });
  }
  function openRowMenu(row, x, y) {
    const archived = row.classList.contains('archived');
    const item = (action, icon, label, cls) =>
      '<button type="button" role="menuitem"' + (cls ? ' class="' + cls + '"' : '') + ' data-row-action="' + action + '">' + ICONS[icon] + label + '</button>';
    const menu = $('row-menu');
    menu.dataset.id = row.dataset.id;
    // Cursor's and Antigravity's conversations are theirs: open and save only.
    menu.innerHTML = row.dataset.readOnly
      ? item('open', 'messages', 'Open') + item('export', 'download', 'Save as Markdown')
      : item('open', 'messages', 'Open') + item('rename', 'pencil', 'Rename') +
        (archived ? item('restore', 'restore', 'Restore from archive') : item('archive', 'archive', 'Archive')) +
        item('export', 'download', 'Save as Markdown') + '<hr />' + item('delete', 'trash', 'Delete', 'danger');
    toggleMenu(null, menu, x, y, false);
  }
  $('row-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-row-action]');
    if (!b) return;
    const id = $('row-menu').dataset.id;
    closeMenu(true);
    post({ type: 'chat', action: b.dataset.rowAction, id });
  });
  document.addEventListener('click', (e) => { if (openMenu && !openMenu.menu.contains(e.target)) closeMenu(false); });
  // A list fixed under its button would drift away from it: scrolling the page closes it.
  $('body').addEventListener('scroll', () => closeMenu(false), { passive: true });
  document.addEventListener('keydown', (e) => {
    if (!openMenu) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    const items = $$('button:not([hidden]), input', openMenu.menu);
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
  });

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'state') { state = m.state; render(); renderChats(); }
    if (m.type === 'chats') { chats = m.chats; renderChats(); }
    if (m.type === 'navigate') go(m.tab, m.page);
    if (m.type === 'reveal') { go('chats'); query = ''; $('search').value = ''; $('tools-row').classList.remove('searching'); revealSwitched = false; renderChats(); reveal(m.id); }
    if (m.type === 'toast') toast(m.text);
  });

  renderRoute();
  renderChats();
  post({ type: 'ready' });
`;
