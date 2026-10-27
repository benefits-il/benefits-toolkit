/**
 * The conversation viewer's own CSS and page script, on top of the shared
 * Graphite tokens (shared/webview-theme.ts). Read-only: the page renders the
 * conversation as a chat, finds in it, filters it and hands actions to the
 * extension.
 */

export const VIEWER_CSS = `
  body { overflow: hidden; }
  .viewer {
    display: flex; flex-direction: column; height: 100vh; background: var(--page);
    /* Every message is a card the width of the column with a stripe at its
       start: the project's color for the agent, gray for you. The text is
       the system font in a soft gray, as in the viewer before 0.8. */
    --card: hsl(150 3% 14.5%); --card-line: hsl(150 3% 22%); --you-mark: #7C847F;
    --read-font: 'Segoe UI', 'Segoe WPC', system-ui, -apple-system, sans-serif;
    --read-text: #D1D2CA;
    --agent-name: color-mix(in srgb, var(--proj) 85%, var(--text));
  }
  :root[data-theme="light"] .viewer { --card: #FAF7EF; --card-line: #E4E0D4; --you-mark: #9AA39E; --read-text: #36433C; }
  :root[data-theme^="hc"] .viewer { --card: transparent; --card-line: var(--line); --you-mark: var(--line); --read-text: var(--text); --agent-name: var(--text); }

  .vhead { flex: none; padding: 20px 28px 14px; border-bottom: 1px solid var(--line); background: var(--panel); }
  .eyebrow { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; }
  .eyebrow .kind { margin-inline-start: auto; font-size: 11px; }
  .pdot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--c, transparent); border: 1.5px solid var(--c, var(--muted)); }
  .heading-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 0 6px; }
  .heading-row h1 { font: 700 22px/1.25 var(--head); letter-spacing: -0.4px; min-width: 0; overflow-wrap: anywhere; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--muted); font-size: 12px; }
  .tools { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 16px; }
  .find {
    flex: 1; min-width: 220px; height: 34px; display: flex; align-items: center; gap: 4px; padding: 0 6px 0 12px;
    background: var(--input); border: 1px solid var(--line); border-radius: var(--pill);
  }
  .find:focus-within { outline: 2px solid var(--focus); outline-offset: 1px; }
  .find > .ico { width: 15px; height: 15px; color: var(--muted); }
  .find input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font-size: 12.5px; padding: 0 4px; }
  .find input::placeholder { color: var(--muted); }
  .find input::-webkit-search-cancel-button { display: none; }
  .find .count { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .find .icon-btn { width: 26px; height: 26px; }
  .find .icon-btn .ico { width: 14px; height: 14px; }
  .find .icon-btn:disabled { opacity: 0.4; cursor: default; }
  .context { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 11.5px; color: var(--muted); }
  .context strong { font-weight: 500; color: var(--accent); margin-inline-start: 4px; }
  .context .bar { flex: 1; height: 3px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .context .bar i { display: block; height: 100%; background: var(--accent); }
  .context .bar i.tier-warn { background: var(--warning); }
  .context .bar i.tier-high, .context .bar i.tier-crit { background: var(--danger); }
  .context .est { color: var(--warning); }
  .hidden-matches { margin-top: 10px; font-size: 12px; color: var(--muted); }

  /* ---- The conversation: a reading column, oldest exchange at the top, newest at the bottom. */
  .messages { flex: 1; min-height: 0; overflow: auto; padding: 0 24px; scrollbar-width: thin; }
  .column {
    max-width: 900px; min-height: 100%; margin: 0 auto; padding: 8px 40px 56px;
    background: var(--reading-bg); border-inline: 1px solid var(--line);
  }
  .turn { display: flex; flex-direction: column; gap: 10px; padding: 14px 0; content-visibility: auto; contain-intrinsic-size: auto 240px; }

  /* A message: a header (the speaker's icon, name and time) over its card. */
  .msg { min-width: 0; }
  .msg-head { display: flex; align-items: center; gap: 8px; min-height: 24px; margin-bottom: 6px; cursor: pointer; }
  .msg-toggle {
    flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0; border: 0;
    background: transparent; color: inherit; cursor: pointer; text-align: start; font-size: 12px;
  }
  /* The icons: the agent's mark on a wash of its own color, you on a wash of the window's color. */
  .avatar {
    width: 22px; height: 22px; flex: none; display: inline-grid; place-items: center; border-radius: 50%;
    border: 1px solid transparent; color: var(--text);
  }
  .avatar .ico, .avatar .mark { width: 12px; height: 12px; }
  .msg.you .avatar { background: color-mix(in srgb, var(--proj) 24%, transparent); border-color: color-mix(in srgb, var(--proj) 45%, transparent); }
  .avatar-claude { background: rgba(217, 119, 87, 0.2); border-color: rgba(217, 119, 87, 0.42); }
  .avatar-cursor { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.26); }
  :root[data-theme="light"] .avatar-cursor { background: rgba(20, 35, 28, 0.08); border-color: rgba(20, 35, 28, 0.2); }
  .avatar-antigravity { background: rgba(49, 134, 255, 0.2); border-color: rgba(49, 134, 255, 0.42); }
  :root[data-theme^="hc"] .msg .avatar { background: transparent; border-color: var(--line); }
  .meta .agent { display: inline-flex; align-items: center; gap: 6px; }
  .meta .agent .mark { width: 14px; height: 14px; }
  .who { font: 600 12.5px var(--head); }
  .msg.claude .who { color: var(--agent-name); }
  .msg.you .who { color: var(--muted); }
  .msg-head time { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .preview { display: none; }
  .chev { display: grid; place-items: center; flex: none; width: 22px; height: 22px; color: var(--muted); }
  .chev .ico { width: 15px; height: 15px; transition: transform 0.15s; }
  .msg:not(.collapsed) .chev .ico { transform: rotate(180deg); }
  .msg-head:hover .chev { color: var(--text); }
  /* Closed: the card shows its first lines and fades; a click opens the rest.
     The work before a closed answer stays out of the way until it opens. */
  .msg.collapsed .msg-body { position: relative; max-height: calc(13px * 1.75 * 3 + 32px); overflow: hidden; cursor: pointer; }
  .msg.collapsed .msg-body::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 60%; pointer-events: none;
    background: linear-gradient(transparent, var(--card));
  }
  .turn:has(.msg.claude.collapsed) details.work { display: none; }
  .actions { display: flex; gap: 6px; flex: none; opacity: 0; transition: opacity 0.15s; }
  .msg:hover .actions, .msg:focus-within .actions { opacity: 1; }
  .mini {
    display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 1px 9px; cursor: pointer;
    border: 1px solid var(--line); border-radius: var(--pill); background: transparent; color: var(--text);
    font: 500 11px var(--head);
  }
  .mini:hover { background: var(--hover); }
  .mini .ico { width: 12px; height: 12px; }
  .mini.copied { color: var(--accent); border-color: var(--accent); }
  body.no-mdhe .mdhe { display: none; }

  .msg-body {
    max-width: 100%; padding: 16px 20px; font: 13px/1.75 var(--read-font); color: var(--read-text); overflow-wrap: anywhere;
    background: var(--card); border: 1px solid var(--card-line); border-radius: 8px;
  }
  .msg.claude .msg-body { border-inline-start: 4px solid var(--proj); }
  .msg.you .msg-body { border-inline-start: 4px solid var(--you-mark); }

  .block + .block { margin-top: 12px; }
  .block.text > :first-child { margin-top: 0; }
  .block.text > :last-child { margin-bottom: 0; }
  .block.text p { margin: 0 0 12px; }
  .block.text h1, .block.text h2, .block.text h3, .block.text h4, .block.text h5, .block.text h6 {
    font-family: var(--head); font-weight: 600; line-height: 1.3; margin: 18px 0 8px;
  }
  .block.text h1 { font-size: 1.35em; } .block.text h2 { font-size: 1.2em; } .block.text h3 { font-size: 1.07em; }
  .block.text h4, .block.text h5, .block.text h6 { font-size: 1em; }
  .block.text ul, .block.text ol { margin: 0 0 12px; padding-inline-start: 1.5em; }
  .block.text li { margin: 3px 0; }
  .block.text li > ul, .block.text li > ol { margin-bottom: 0; }
  .block.text blockquote { margin: 0 0 12px; padding-inline-start: 14px; border-inline-start: 3px solid var(--line); color: var(--muted); }
  .block.text a { color: var(--accent); cursor: pointer; word-break: break-all; }
  .block.text hr { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }
  .block.text img { max-width: 100%; height: auto; border-radius: 8px; }
  .block.text table { border-collapse: collapse; margin: 0 0 12px; display: block; overflow-x: auto; max-width: 100%; font-size: 13px; }
  .block.text th, .block.text td { border: 1px solid var(--line); padding: 6px 10px; text-align: start; }
  .block.text th { background: var(--surface); font-family: var(--head); font-weight: 600; }
  .block.text code {
    direction: ltr; unicode-bidi: embed; font: 0.88em var(--mono);
    background: var(--code); color: var(--code-text); border-radius: 5px; padding: 1px 5px;
  }
  .code-wrap { margin: 0 0 12px; padding: 12px 14px; border-radius: 10px; background: var(--code); color: var(--code-text); direction: ltr; text-align: left; }
  .code-wrap pre { margin: 0; overflow-x: auto; }
  .code-wrap pre code { display: block; background: none; padding: 0; font: 12.5px/1.6 var(--mono); white-space: pre; }
  .code-copy { margin-top: 10px; }
  body.no-code-copy .code-copy { display: none; }

  details.block { color: var(--muted); }
  details.block summary {
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer; list-style: none;
    font: 500 11.5px var(--head); color: var(--muted);
  }
  details.block summary::-webkit-details-marker { display: none; }
  details.block summary .ico { width: 13px; height: 13px; }
  details.block .thinking-text, details.block .tool-text {
    margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: var(--surface);
    font: 12.5px/1.6 var(--body); white-space: pre-wrap; color: var(--muted);
  }
  details.block .tool-text { font-family: var(--mono); font-size: 12px; direction: ltr; text-align: left; }
  .msg.you details.attach .tool-text { background: var(--reading-bg); }
  .msg-body details.block .thinking-text, .msg-body details.block .tool-text { background: var(--reading-bg); }

  /* Claude's work between your message and its answer: one quiet line, open on click. */
  details.work { align-self: flex-start; max-width: 100%; color: var(--muted); }
  details.work > summary, details.step > summary {
    list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
  }
  details.work > summary::-webkit-details-marker, details.step > summary::-webkit-details-marker { display: none; }
  details.work > summary {
    padding: 4px 12px 4px 9px; border-radius: var(--pill); border: 1px solid var(--line);
    font: 500 11.5px var(--head); color: var(--muted);
  }
  details.work > summary:hover { color: var(--text); background: var(--hover); }
  details.work > summary .ico { width: 13px; height: 13px; transition: transform 0.15s; }
  details.work[open] > summary .ico { transform: rotate(90deg); }
  details.work > summary span, details.step > summary span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .work-body { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 2px 14px; }
  .note { font: 12.5px/1.6 var(--body); color: var(--muted); }
  .note .block.text p { margin-bottom: 6px; }
  details.step > summary { font: 400 11.5px var(--body); color: var(--muted); }
  details.step > summary:hover { color: var(--text); }
  details.step > summary .ico { width: 13px; height: 13px; }
  .step-body { margin: 6px 0 4px 19px; }
  .step-body details.block + details.block { margin-top: 6px; }
  body.hide-work details.work { display: none; }
  body.hide-thinking .block.thinking { display: none; }

  mark.hit { background: var(--mark-bg); color: var(--mark-text); border-radius: 3px; padding: 0 1px; }
  mark.hit.current { outline: 2px solid var(--mark-bg); outline-offset: 1px; box-shadow: 0 0 0 4px rgba(252, 211, 77, 0.35); }
  .empty-state { text-align: center; padding: 48px 24px; color: var(--muted); }

  .vfoot {
    flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 8px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; background: var(--panel);
  }
  .vfoot a { display: inline-flex; align-items: center; gap: 5px; color: var(--accent); }
  .vfoot a .ico { width: 12px; height: 12px; }
  .to-latest { position: fixed; inset-inline-end: 22px; bottom: 46px; box-shadow: var(--pop-shadow); }

  @media (max-width: 620px) {
    .vhead { padding: 16px 16px 12px; }
    .messages { padding: 0; }
    .column { padding: 4px 12px 40px; border: 0; }
    .heading-row h1 { font-size: 19px; }
    .find { flex-basis: 100%; }
    .meta { gap: 2px 10px; }
    .msg-body { padding: 12px 14px; }
  }
`;

export const VIEWER_SCRIPT = `
  let prefs = INITIAL.prefs;
  const findInput = $('find');
  let marks = [];
  let matchIndex = 0;

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('visible'), 1600);
  }

  // What the Display switches hide. Find counts matches there as hidden.
  function hiddenByPrefs(el) {
    return !!((prefs.hideWork && el.closest('.work')) || (prefs.hideThinking && el.closest('.block.thinking')));
  }

  // ---- Display and text direction: shared by every viewer, kept by the extension.
  function applyPrefs() {
    document.body.classList.toggle('hide-work', !!prefs.hideWork);
    document.body.classList.toggle('hide-thinking', !!prefs.hideThinking);
    // One direction for the whole conversation: B left to right, ב right to left.
    $$('.column, .preview').forEach((el) => { el.dir = prefs.direction; });
    $$('[data-dir]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === prefs.direction)));
    $$('[data-pref]').forEach((s) => { s.checked = !!prefs[s.dataset.pref]; });
    const on = ['hideWork', 'hideThinking'].filter((k) => prefs[k]).length;
    $('display').querySelector('span').textContent = on ? 'Display \\u00b7 ' + on : 'Display';
    applyFind();
  }
  function setPrefs(patch) {
    prefs = Object.assign({}, prefs, patch);
    applyPrefs();
    post({ type: 'prefs', prefs });
  }
  $$('[data-dir]').forEach((b) => { b.onclick = () => setPrefs({ direction: b.dataset.dir }); });
  $$('[data-pref]').forEach((s) => { s.onchange = () => setPrefs({ [s.dataset.pref]: s.checked }); });

  // ---- Menus (Display, More): open under their button, close on Escape or a click outside.
  let openMenu = null;
  function closeMenu(focusBack) {
    if (!openMenu) return;
    openMenu.menu.hidden = true;
    openMenu.button.setAttribute('aria-expanded', 'false');
    if (focusBack) openMenu.button.focus();
    openMenu = null;
  }
  function toggleMenu(button, menu) {
    if (openMenu && openMenu.menu === menu) return closeMenu(true);
    closeMenu(false);
    menu.hidden = false;
    const r = button.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))) + 'px';
    button.setAttribute('aria-expanded', 'true');
    openMenu = { button, menu };
    const first = menu.querySelector('button, input');
    if (first) first.focus();
  }
  $('display').onclick = (e) => { e.stopPropagation(); toggleMenu($('display'), $('display-menu')); };
  $('more').onclick = (e) => { e.stopPropagation(); toggleMenu($('more'), $('more-menu')); };
  document.addEventListener('click', (e) => {
    if (openMenu && !openMenu.menu.contains(e.target)) closeMenu(false);
  });
  $$('#more-menu [data-action]').forEach((b) => {
    b.onclick = () => {
      closeMenu(false);
      if (b.dataset.action === 'exportVisible') post({ type: 'exportVisible', content: buildMarkdown() });
      else post({ type: 'action', action: b.dataset.action });
    };
  });
  // Arrow keys move inside an open menu.
  document.addEventListener('keydown', (e) => {
    if (!openMenu) return;
    const items = $$('button, input', openMenu.menu);
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
  });

  // ---- Collapse: one message from its header, or all of them.
  function setCollapsed(article, collapsed) {
    article.classList.toggle('collapsed', collapsed);
    article.querySelector('.msg-toggle').setAttribute('aria-expanded', String(!collapsed));
  }
  function syncCollapseAll() {
    const anyOpen = $$('.msg').some((m) => !m.classList.contains('collapsed'));
    $('collapse').querySelector('span').textContent = anyOpen ? 'Collapse all' : 'Expand all';
  }
  $('messages').addEventListener('click', (e) => {
    const head = e.target.closest('.msg-head');
    if (!head || e.target.closest('.actions')) return;
    const article = head.closest('.msg');
    setCollapsed(article, !article.classList.contains('collapsed'));
    syncCollapseAll();
  });
  // A closed card shows its first lines; a click anywhere on it opens it,
  // even on a link in the faded part.
  $('messages').addEventListener('click', (e) => {
    const body = e.target.closest('.msg.collapsed .msg-body');
    if (!body) return;
    e.preventDefault();
    e.stopPropagation();
    setCollapsed(body.closest('.msg'), false);
    syncCollapseAll();
  }, true);
  $('collapse').onclick = () => {
    const anyOpen = $$('.msg').some((m) => !m.classList.contains('collapsed'));
    $$('.msg').forEach((m) => setCollapsed(m, anyOpen));
    syncCollapseAll();
  };

  // ---- Find in conversation: highlights, a counter, and the arrows between matches.
  function clearMarks() {
    $$('mark.hit').forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    $$('.msg-body, .work-body').forEach((b) => b.normalize());
  }
  function countIn(text, q) {
    let n = 0, i = 0;
    const t = text.toLowerCase();
    while ((i = t.indexOf(q, i)) >= 0) { n++; i += q.length; }
    return n;
  }
  // Marks every match in an element's text; returns how many matches sat in hidden parts.
  function highlight(root, q) {
    let hidden = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      // Buttons and the folded lines' labels are not the conversation.
      if (n.parentElement.closest('button, summary')) continue;
      if (hiddenByPrefs(n.parentElement)) { hidden += countIn(n.textContent, q); continue; }
      nodes.push(n);
    }
    nodes.forEach((n) => {
      const text = n.textContent;
      const lower = text.toLowerCase();
      let pos = 0, idx;
      const frag = document.createDocumentFragment();
      while ((idx = lower.indexOf(q, pos)) >= 0) {
        frag.append(text.slice(pos, idx));
        const mark = document.createElement('mark');
        mark.className = 'hit';
        mark.textContent = text.slice(idx, idx + q.length);
        frag.append(mark);
        pos = idx + q.length;
      }
      if (pos) { frag.append(text.slice(pos)); n.replaceWith(frag); }
    });
    return hidden;
  }
  function applyFind(scroll) {
    clearMarks();
    const q = findInput.value.trim().toLowerCase();
    let hidden = 0;
    if (q) {
      $$('.msg-body, .work').forEach((root) => { hidden += highlight(root, q); });
      // A match opens what holds it: a folded message, the work, a step, a tool call.
      $$('.msg').forEach((m) => { if (m.querySelector('.msg-body mark.hit')) setCollapsed(m, false); });
      // The work shows only beside an open answer, so a match in it opens the answer too.
      $$('.turn').forEach((t) => {
        const answer = t.querySelector('.msg.claude');
        if (answer && t.querySelector('details.work mark.hit')) setCollapsed(answer, false);
      });
      $$('details').forEach((d) => { if (d.querySelector('mark.hit')) d.open = true; });
      syncCollapseAll();
    }
    marks = $$('mark.hit');
    if (matchIndex >= marks.length) matchIndex = 0;
    marks.forEach((m, i) => m.classList.toggle('current', i === matchIndex));
    $('find-count').textContent = !q ? '' : marks.length ? (matchIndex + 1) + '/' + marks.length : 'No matches';
    $('prev').disabled = $('next').disabled = marks.length === 0;
    $('hidden-matches').hidden = !hidden;
    $('hidden-count').textContent = hidden === 1 ? '1 match is' : hidden + ' matches are';
    if (scroll && marks[matchIndex]) marks[matchIndex].scrollIntoView({ block: 'center' });
  }
  function moveMatch(delta) {
    if (!marks.length) return;
    matchIndex = (matchIndex + delta + marks.length) % marks.length;
    marks.forEach((m, i) => m.classList.toggle('current', i === matchIndex));
    $('find-count').textContent = (matchIndex + 1) + '/' + marks.length;
    marks[matchIndex].scrollIntoView({ block: 'center' });
  }
  let findTimer;
  findInput.addEventListener('input', () => {
    clearTimeout(findTimer);
    findTimer = setTimeout(() => { matchIndex = 0; applyFind(true); }, 120);
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); moveMatch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { findInput.value = ''; applyFind(false); }
  });
  $('next').onclick = () => moveMatch(1);
  $('prev').onclick = () => moveMatch(-1);
  $('show-hidden').onclick = () => setPrefs({ hideWork: false, hideThinking: false });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); findInput.focus(); findInput.select(); }
    if (e.key === 'Escape' && openMenu) closeMenu(true);
  });

  // ---- Copy, md-he and code copy.
  // The blocks of a message, a note or a step. Text the editor attached to
  // your message stays out; text you pasted is yours and counts.
  function blockTexts(unit, onlyText) {
    const parts = [];
    $$('.block', unit).forEach((block) => {
      if (hiddenByPrefs(block)) return;
      if (block.classList.contains('attach')) {
        if (block.classList.contains('pasted')) parts.push({ kind: 'text', text: block.querySelector('.tool-text').textContent });
        return;
      }
      if (block.classList.contains('thinking')) { if (!onlyText) parts.push({ kind: 'thinking', text: block.querySelector('.thinking-text').textContent }); }
      else if (block.classList.contains('tool')) { if (!onlyText) parts.push({ kind: 'tool', text: block.querySelector('.tool-text').textContent }); }
      else parts.push({ kind: 'text', text: block.dataset.md || block.textContent });
    });
    return parts;
  }
  function flash(btn, ok) {
    const label = btn.querySelector('span');
    const before = label.textContent;
    label.textContent = ok ? 'Copied' : 'Failed';
    btn.classList.toggle('copied', ok);
    setTimeout(() => { label.textContent = before; btn.classList.remove('copied'); }, 1400);
  }
  function copy(btn, text) {
    navigator.clipboard.writeText(text).then(() => flash(btn, true), () => flash(btn, false));
  }
  $('messages').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const article = btn.closest('.msg');
    if (btn.dataset.act === 'copy') {
      copy(btn, blockTexts(article, false).map((p) => p.kind === 'thinking' ? '[Thinking]\\n' + p.text : p.text).join('\\n\\n'));
    } else if (btn.dataset.act === 'mdhe') {
      const text = blockTexts(article, true).map((p) => p.text).join('\\n\\n').trim();
      if (!text) toast('No text in this message');
      else post({ type: 'mdhe', content: text });
    } else if (btn.dataset.act === 'code') {
      const code = btn.parentElement.querySelector('pre code, pre');
      copy(btn, code ? code.textContent.replace(/\\n$/, '') : '');
    }
  });

  // Webviews swallow navigation: every link goes through the extension, which
  // opens files and URLs (or copies a path it cannot resolve).
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    post({ type: 'openLink', href: a.getAttribute('data-raw') || a.getAttribute('href') });
  });

  // ---- Save visible messages: what passes the filters, oldest first.
  function buildMarkdown() {
    const lines = ['# ' + INITIAL.title, ''];
    $$('.turn').forEach((turn) => {
      $$('.unit', turn).forEach((unit) => {
        if (hiddenByPrefs(unit)) return;
        const parts = blockTexts(unit, false);
        if (!parts.length) return;
        lines.push('## ' + unit.dataset.who + ' \\u00b7 ' + unit.dataset.when, '');
        parts.forEach((p) => {
          if (p.kind === 'thinking') { lines.push('> **Thinking**', '>'); p.text.split('\\n').forEach((l) => lines.push('> ' + l)); lines.push(''); }
          else if (p.kind === 'tool') { lines.push('\\u0060\\u0060\\u0060', p.text, '\\u0060\\u0060\\u0060', ''); }
          else lines.push(p.text, '');
        });
      });
    });
    return lines.join('\\n');
  }

  // ---- The newest message is at the bottom: the page opens there, and a
  // button brings you back after scrolling up.
  const list = $('messages');
  function syncLatest() {
    $('to-latest').hidden = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  }
  $('to-latest').onclick = () => list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  list.addEventListener('scroll', syncLatest, { passive: true });
  window.addEventListener('resize', syncLatest);
  // Turns off screen are laid out lazily (content-visibility) and fonts load
  // late, so the page keeps growing after it opens: it stays pinned to the
  // bottom until the first scroll, click or key.
  function openAtLatest() {
    let pinned = true;
    const unpin = () => { pinned = false; };
    ['wheel', 'touchstart', 'pointerdown'].forEach((type) => list.addEventListener(type, unpin, { passive: true, once: true }));
    window.addEventListener('keydown', unpin, { once: true });
    const pin = () => { if (pinned) list.scrollTop = list.scrollHeight; };
    new ResizeObserver(pin).observe(list.firstElementChild);
    pin();
  }

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'prefs') { prefs = m.prefs; applyPrefs(); }
    if (m.type === 'flags') {
      document.body.classList.toggle('no-code-copy', !m.codeCopy);
      document.body.classList.toggle('no-mdhe', !m.mdHe);
    }
    if (m.type === 'toast') toast(m.text);
  });

  applyPrefs();
  syncCollapseAll();
  openAtLatest();
  syncLatest();
`;
