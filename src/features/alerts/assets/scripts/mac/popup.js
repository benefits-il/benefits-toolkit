// Benefit's Toolkit popup (macOS, JavaScript for Automation + Cocoa).
// Started detached by dispatch.js (or by the extension's "Test popup") with
// the path of a JSON job file in state/popups:
//   { agent, title, subtitle, kind, color, text, theme, cli, folder, seconds, stay, position }
// One process shows every card. The first one started becomes the host (the
// state/popup-host folder, holding its pid); a later one leaves its job in
// state/popups for the host and exits once the host has taken it. The host:
// - shows each alert as a small non-activating panel in the toolkit's theme:
//   a tile with the mark of the agent that finished (Claude, Cursor or
//   Antigravity, from bin/marks), the project name and the status, framed in
//   the project's color. A job without a mark gets the older tile: the
//   project's color with a check (finished) or "!" (needs input);
// - brings a card in from the screen edge with a small spring, then flashes
//   its frame once;
// - keeps one card per window (same folder, same editor): another alert from
//   it raises the counter on the mark, flashes the frame again and restarts
//   the timer;
// - stacks the cards from the corner under the menu bar (or the bottom right
//   with position "bottomRight"), or from wherever the user last dropped one
//   (state/popup-place.json; the extension's "Back to corner" deletes it);
// - closes a card after `seconds` (hovering pauses), or with "stay" shrinks
//   it to a pill that waits for a click;
// - exits when no card is left.
// A click runs "<cli> <folder>", which brings that project's editor window to
// the front; a drag only moves the card. The x in the corner just closes it
// (on a pill, the x shows on hover).
//
// Written to run unchanged on Intel and Apple Silicon Macs, which disagree on
// several low-level values: BOOL is a char on Intel and a bool on Apple
// Silicon (so no ObjC.registerSubclass with BOOL methods: a type mismatch
// throws before anything shows), the right and center text alignments have
// different numbers on each (so labels are placed by measuring, never by
// alignment), and NSEventMaskAny (2^64-1) does not survive a JS number.
// Mouse events are therefore read straight off the event queue, and every
// view is a plain NSBox, NSTextField or NSImageView (no layers). On macOS 26
// (seen on Apple Silicon) an event's type comes back as a value that reads
// "1" but is not the number 1, so integers from Cocoa go through int()
// before they are compared.
// Failures are appended to state/dispatch.log, tagged [popup] as on Windows.
ObjC.import('Cocoa');

const CARD_W = 300;
const CARD_H = 64;
const PILL_H = 30;
const MARGIN = 22; // room around the card for the flash ring; clear pixels let clicks through
const WIN_W = CARD_W + 2 * MARGIN;
const WIN_H = CARD_H + 2 * MARGIN;
const GAP = 10;
const EDGE = 12;
const TILE = 34;
const MAX_CARDS = 5;
const LEFT_MOUSE_DOWN = 1; // NSEventTypeLeftMouseDown
const LEFT_MOUSE_UP = 2; // NSEventTypeLeftMouseUp
const LEFT_MOUSE_DRAGGED = 6; // NSEventTypeLeftMouseDragged
const EVENT_MASK = 0xFFFFFFFF; // every event type below 32 (mouse, keys, app-defined)
const ALIGN_NATURAL = 4; // NSTextAlignmentNatural, the same value on both architectures
const WRITING_RTL = 1; // NSWritingDirectionRightToLeft
const BOX_CUSTOM = 4; // NSBoxCustom
const NO_TITLE = 0; // NSNoTitle
const SEMIBOLD = 0.3; // NSFontWeightSemibold
const BOLD = 0.4; // NSFontWeightBold
const FRAME = 1 / 60;

// Motion, in milliseconds, stepped by hand in the event loop (plain
// setAlphaValue / setFrameOrigin / setFrame, no animator proxies). Keys are
// [time, value, easing into it]. With Reduce motion on, cards fade without
// travel and the ring stays still.
const ENTER_MS = 700;
const FADE = [[0, 0], [80, 1, 'lin']];
const PULSE_MS = 820;
const RING_SPREAD = [[0, 0], [820, 18, 'out']];
const RING_ALPHA = [[0, 1], [820, 0, 'out']];
const FLASH_WIDTH = [[0, 0], [140, 3, 'out'], [520, 0, 'inout']];
const WASH_ALPHA = [[0, 0], [120, 0.2, 'out'], [620, 0, 'inout']];
const POP_SCALE = [[0, 1], [150, 1.4, 'out'], [420, 1, 'inout']];
const MOVE_MS = 280;
const MORPH_MS = 280;
const LEAVE_MS = 160;
// The spring: from just past the screen edge, 18 past the spot, back with a
// small bounce. s is the side it comes from (1 right, -1 left).
function enterKeys(d, s) {
  return [[0, d], [320, -18 * s, 'out'], [480, 6 * s, 'inout'], [600, -2 * s, 'inout'], [700, 0, 'inout']];
}

// The card's colors: the toolkit's theme (Graphite dark gray, cream light, or
// high contrast). Same tokens as the sidebar and popup.ps1. The frame takes
// the project's color, except in high contrast.
const THEMES = {
  'dark': { bg: '#1F2120', tile: '#2C302E', line: '#363A38', text: '#F6F4EA', muted: '#A9B3AE', done: '#8FD3B3', waiting: '#FCD34D' },
  'light': { bg: '#FFFDF6', tile: '#F1ECDD', line: '#E6D9AE', text: '#14231C', muted: '#55635C', done: '#047857', waiting: '#92400E' },
  'hc-dark': { bg: '#000000', tile: '#000000', line: '#FFFFFF', text: '#FFFFFF', muted: '#FFFFFF', done: '#FFFFFF', waiting: '#FFFFFF' },
  'hc-light': { bg: '#FFFFFF', tile: '#FFFFFF', line: '#000000', text: '#000000', muted: '#000000', done: '#000000', waiting: '#000000' },
};

const fm = $.NSFileManager.defaultManager;

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : s.js;
}
function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}
function listDir(path) {
  const a = fm.contentsOfDirectoryAtPathError(path, null);
  return a.isNil() ? [] : a.js.map((x) => x.js);
}
function mtimeSeconds(path) {
  const attrs = fm.attributesOfItemAtPathError(path, null);
  if (attrs.isNil()) return 0;
  return attrs.objectForKey($.NSFileModificationDate).timeIntervalSince1970;
}
function quote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
// An integer from Cocoa (an event's type, a window number) as a plain number.
function int(v) { return Number(String(v)); }
function logLine(stateDir, message) {
  try {
    const log = stateDir + '/dispatch.log';
    writeText(log, (readText(log) || '').slice(-100000) + new Date().toISOString() + ' [popup] ' + message + '\n');
  } catch (e) { /* nothing left to do */ }
}

function rgb(hex, fallback) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '') || /^#(..)(..)(..)$/.exec(fallback);
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
}
function nsColor(hex, alpha) {
  const c = rgb(hex, '#047857');
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(c[0], c[1], c[2], alpha === undefined ? 1 : alpha);
}
// WCAG relative luminance; picks the tile's icon color when the job has none.
function luminance(hex) {
  const w = [0.2126, 0.7152, 0.0722];
  return rgb(hex, '#047857').reduce((sum, c, i) => sum + w[i] * (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)), 0);
}
function readableOn(hex) {
  const l = luminance(hex);
  const white = 1.05 / (l + 0.05);
  const dark = (l + 0.05) / (luminance('#15202B') + 0.05);
  return white >= dark ? '#FFFFFF' : '#15202B';
}

function font(size, weight) {
  if (weight) {
    try { return $.NSFont.systemFontOfSizeWeight(size, weight); } catch (e) { return $.NSFont.boldSystemFontOfSize(size); }
  }
  return $.NSFont.systemFontOfSize(size);
}

function label(text, size, weight, color, frame, rtl) {
  const field = $.NSTextField.labelWithString(text);
  field.setFont(font(size, weight));
  field.setTextColor(color);
  field.setFrame(frame);
  field.setLineBreakMode(4); // NSLineBreakByTruncatingTail
  if (rtl) {
    // Natural alignment follows the writing direction: right for RTL.
    field.setBaseWritingDirection(WRITING_RTL);
    field.setAlignment(ALIGN_NATURAL);
  }
  return field;
}

// A label sized to its text, placed by measuring: no alignment constants.
function measured(text, size, weight, color) {
  const field = $.NSTextField.labelWithString(text);
  field.setFont(font(size, weight));
  field.setTextColor(color);
  field.sizeToFit;
  return field;
}
function centerIn(field, x, y, w, h) {
  const s = field.frame.size;
  field.setFrameOrigin($.NSMakePoint(x + (w - s.width) / 2, y + (h - s.height) / 2));
  return field;
}
function centered(text, size, weight, color, x, y, w, h) {
  return centerIn(measured(text, size, weight, color), x, y, w, h);
}

function box(frame, fill, radius, line, lineWidth) {
  const b = $.NSBox.alloc.initWithFrame(frame);
  b.setBoxType(BOX_CUSTOM);
  b.setTitlePosition(NO_TITLE);
  b.setCornerRadius(radius);
  b.setFillColor(fill);
  b.setBorderWidth(line ? lineWidth || 1 : 0);
  if (line) b.setBorderColor(line);
  b.setContentViewMargins($.NSMakeSize(0, 0));
  return b;
}

// BOOL comes back as true on Apple Silicon and as 1 on Intel; anything else
// (or an error) means animate.
function reduceMotion() {
  try {
    const v = String($.NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion);
    return v === 'true' || v === '1';
  } catch (e) {
    return false;
  }
}

function eased(kind, t) {
  if (kind === 'lin') return t;
  if (kind === 'inout') return 0.5 - Math.cos(Math.PI * t) / 2;
  return 1 - Math.pow(1 - t, 3);
}
function track(keys, ms) {
  if (ms <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1];
    const k1 = keys[i];
    if (ms <= k1[0]) return k0[1] + (k1[1] - k0[1]) * eased(k1[2], (ms - k0[0]) / (k1[0] - k0[0]));
  }
  return keys[keys.length - 1][1];
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// The agent's mark (a PNG in bin/marks), or null. Cursor's one-color cube
// comes in the card's text color, one file per theme.
function agentMark(job, marksDir) {
  const agent = String(job.agent || '');
  if (!/^[a-z]+$/.test(agent)) return null;
  const name = agent === 'cursor' ? (/light/.test(String(job.theme || '')) ? 'cursor-light' : 'cursor-dark') : agent;
  const path = marksDir + '/' + name + '.png';
  if (!fm.fileExistsAtPath(path)) return null;
  const img = $.NSImage.alloc.initWithContentsOfFile(path);
  return img.isNil() ? null : img;
}
// An SF Symbol (macOS 11 and later), tinted by its image view; null before.
function symbol(name) {
  try {
    const img = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription(name, null);
    return img.isNil() ? null : img;
  } catch (e) {
    return null;
  }
}
function imageView(img, x, y, size) {
  img.setSize($.NSMakeSize(size, size));
  const view = $.NSImageView.alloc.initWithFrame($.NSMakeRect(x, y, size, size));
  view.setImage(img);
  return view;
}

// Same window = same folder in the same editor: the click leads to it.
function alertKey(job) {
  let folder = String(job.folder || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  if (!folder) folder = 'title:' + String(job.title || '');
  return folder + '|' + String(job.cli || '').toLowerCase();
}

// Become the host, or leave the job to the one already running: wait until
// it has taken the job (gone from state/popups), or until it quits. A host
// that died leaves its folder behind with a pid that no longer runs.
function becomeHost(stateDir, jobPath, sh) {
  const lock = stateDir + '/popup-host';
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(stateDir, true, $(), null);
  const deadline = Date.now() + 5000;
  for (;;) {
    if (fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(lock, false, $(), null)) {
      writeText(lock + '/pid', String($.NSProcessInfo.processInfo.processIdentifier));
      return lock;
    }
    const owner = parseInt(readText(lock + '/pid') || '0', 10);
    const stale = owner
      ? sh.doShellScript('kill -0 ' + owner + ' 2>/dev/null && echo yes || echo no') !== 'yes'
      : Date.now() / 1000 - mtimeSeconds(lock) > 10;
    if (stale) {
      fm.removeItemAtPathError(lock, null);
      continue;
    }
    if (!fm.fileExistsAtPath(jobPath)) return null;
    if (Date.now() > deadline) return null;
    delay(0.1);
  }
}

function host(stateDir, marksDir, sh) {
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(1); // Accessory: no Dock icon, no menu bar
  app.finishLaunching;
  const inbox = stateDir + '/popups';
  const placeFile = stateDir + '/popup-place.json';
  const motion = !reduceMotion();
  const cards = [];
  let place = readPlace();
  let position = 'topRight';
  let press = null;
  let now = Date.now();

  // --- Where the stack starts: the dropped spot, else the corner. Spots are
  // the top-left corner of the first card, in screen points (y up). ---
  function readPlace() {
    try {
      const p = JSON.parse(readText(placeFile));
      return p ? { x: Number(p.x), y: Number(p.y), side: p.side === 'left' ? -1 : 1, down: p.vdir !== 'up' } : null;
    } catch (e) {
      return null;
    }
  }
  function savePlace(p) {
    writeText(placeFile, JSON.stringify({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, side: p.side < 0 ? 'left' : 'right', vdir: p.down ? 'down' : 'up' }));
  }
  function screenAt(x, y) {
    for (const s of $.NSScreen.screens.js) {
      const f = s.frame;
      if (x >= f.origin.x && x < f.origin.x + f.size.width && y >= f.origin.y && y < f.origin.y + f.size.height) return s;
    }
    return null;
  }
  // A spot on a screen that is gone (a display unplugged) falls back to the
  // corner; the file stays, for when the screen is back.
  function anchor() {
    if (place && screenAt(place.x + CARD_W / 2, place.y - CARD_H / 2)) return place;
    const vf = $.NSScreen.mainScreen.visibleFrame;
    const x = vf.origin.x + vf.size.width - EDGE - CARD_W;
    if (position === 'bottomRight') return { x, y: vf.origin.y + EDGE + CARD_H, side: 1, down: false };
    return { x, y: vf.origin.y + vf.size.height - EDGE, side: 1, down: true };
  }

  // --- A card is pinned to one corner of its panel (the stack's side): its
  // anchor (ax, ay) is that corner on the screen, so it keeps its place while
  // it shrinks to a pill or grows back. ---
  function cardRect(c) {
    return $.NSMakeRect(c.side > 0 ? WIN_W - MARGIN - c.w : MARGIN, c.down ? WIN_H - MARGIN - c.h : MARGIN, c.w, c.h);
  }
  function screenRect(c) {
    const left = (c.side > 0 ? c.ax - c.w : c.ax) + c.tx;
    const bottom = c.down ? c.ay - c.h : c.ay;
    return { x: left, y: bottom, w: c.w, h: c.h };
  }
  function placePanel(c) {
    const x = (c.side > 0 ? c.ax + MARGIN - WIN_W : c.ax - MARGIN) + c.tx;
    const y = c.down ? c.ay + MARGIN - WIN_H : c.ay - MARGIN;
    if (x !== c.px || y !== c.py) {
      c.panel.setFrameOrigin($.NSMakePoint(x, y));
      c.px = x;
      c.py = y;
    }
  }
  function setAlpha(c, a) {
    if (a !== c.alpha) {
      c.panel.setAlphaValue(a);
      c.alpha = a;
    }
  }
  function setShape(c) {
    const r = cardRect(c);
    c.card.setFrame(r);
    c.card.setCornerRadius(c.radius);
    const inner = $.NSMakeRect(0, 0, c.w - 2 * c.inset, c.h - 2 * c.inset);
    for (const b of [c.wash, c.flash]) {
      b.setFrame(inner);
      b.setCornerRadius(Math.max(0, c.radius - 2));
    }
    c.ring.setFrame($.NSMakeRect(r.origin.x - c.rs, r.origin.y - c.rs, c.w + 2 * c.rs, c.h + 2 * c.rs));
    c.ring.setCornerRadius(c.radius + c.rs);
  }
  function setSide(c, side, down) {
    if (c.side !== side || c.down !== down) {
      const left = c.side > 0 ? c.ax - c.w : c.ax;
      const bottom = c.down ? c.ay - c.h : c.ay;
      c.side = side;
      c.down = down;
      c.ax = side > 0 ? left + c.w : left;
      c.ay = down ? bottom + c.h : bottom;
      c.moveT0 = null;
      setShape(c);
    }
  }

  // --- Building a card ---
  function showGroups(c) {
    const morphing = c.morphT0 !== null;
    for (const v of c.fullViews) v.setHidden(c.pill || morphing);
    for (const v of c.pillViews) v.setHidden(!c.pill || morphing);
    if (c.pill && !morphing) {
      c.pillStatus.setHidden(c.hover);
      c.pillClose.setHidden(!c.hover);
    }
  }
  // Fill a card from its job: colors, mark, texts, counter. The views are
  // built again each time; it only happens when an alert arrives.
  function setJob(c, job) {
    c.job = job;
    c.stay = job.stay === true;
    c.remaining = (Number(job.seconds) > 0 ? Number(job.seconds) : 8) * 1000;
    const t = THEMES[job.theme] || THEMES.dark;
    const waiting = job.kind === 'waiting';
    const highContrast = String(job.theme || '').indexOf('hc') === 0;
    const tileHex = /^#[0-9a-f]{6}$/i.test(job.color || '') ? job.color : '#047857';
    const tileText = /^#[0-9a-f]{6}$/i.test(job.text || '') ? job.text : readableOn(tileHex);
    c.frameHex = highContrast ? t.line : tileHex;
    const rtl = new RegExp('[' + String.fromCharCode(0x0590) + '-' + String.fromCharCode(0x06FF) + ']').test(job.title || '');
    c.card.setFillColor(nsColor(t.bg));
    c.card.setBorderColor(nsColor(c.frameHex));

    for (const v of c.views) v.removeFromSuperview;
    c.views = [];
    c.fullViews = [];
    c.pillViews = [];
    const content = c.card.contentView;
    const add = (v, group) => {
      content.addSubview(v);
      c.views.push(v);
      if (group) group.push(v);
      return v;
    };
    const cw = CARD_W - 2 * c.inset;
    const ch = CARD_H - 2 * c.inset;
    c.wash = add(box($.NSMakeRect(0, 0, cw, ch), nsColor(c.frameHex, 0), 8, null));

    // The full card. The agent's mark fills the tile, on a quiet surface, so
    // who finished shows at a glance; the project's color stays in the frame.
    const tileY = (ch - TILE) / 2;
    const mark = agentMark(job, marksDir);
    if (mark) {
      add(box($.NSMakeRect(12, tileY, TILE, TILE), nsColor(t.tile), 8, highContrast ? nsColor(t.line) : null), c.fullViews);
      add(imageView(mark, 12 + (TILE - 20) / 2, tileY + (TILE - 20) / 2, 20), c.fullViews);
    } else {
      add(box($.NSMakeRect(12, tileY, TILE, TILE), nsColor(tileHex), 8, null), c.fullViews);
      add(centered(waiting ? '!' : String.fromCharCode(0x2713), waiting ? 18 : 17, 0.6, nsColor(tileText), 12, tileY, TILE, TILE), c.fullViews);
    }
    const textX = 12 + TILE + 10;
    const textW = cw - textX - 30;
    add(label(job.title || '', 13, SEMIBOLD, nsColor(t.text), $.NSMakeRect(textX, ch / 2, textW, 18), rtl), c.fullViews);
    add(label(job.subtitle || '', 11, 0, nsColor(waiting ? t.waiting : t.done), $.NSMakeRect(textX, ch / 2 - 17, textW, 16), rtl), c.fullViews);
    add(centered(String.fromCharCode(0xD7), 15, 0, nsColor(t.muted), cw - 30, ch - 30, 22, 22), c.fullViews);
    // The counter: the project's color with its readable text, cut out of the
    // card by a ring in the card's own color, on the tile's corner.
    const countColor = nsColor(highContrast ? t.bg : tileText);
    c.badge = null;
    if (c.count > 1) {
      const text = measured(String(c.count), 10, BOLD, countColor);
      const bw = Math.max(19, text.frame.size.width + 10);
      const base = { x: 12 + TILE + 8 - bw, y: tileY + TILE + 7 - 19, w: bw, h: 19 };
      const b = add(box($.NSMakeRect(base.x, base.y, base.w, base.h), nsColor(c.frameHex), 9.5, nsColor(t.bg), 2), c.fullViews);
      add(centerIn(text, base.x, base.y, base.w, base.h), c.fullViews);
      c.badge = { box: b, text, base };
    }

    // The pill: mark, name, counter, then a check or a bell (the x on hover).
    const ph = PILL_H - 2 * c.inset;
    let x = 6;
    if (mark) {
      const small = agentMark(job, marksDir);
      add(imageView(small, x, (ph - 16) / 2, 16), c.pillViews);
      x += 16 + 7;
    }
    const name = measured(job.title || '', 12, SEMIBOLD, nsColor(t.text));
    name.setLineBreakMode(4);
    const nameW = Math.min(130, name.frame.size.width);
    name.setFrame($.NSMakeRect(x, (ph - name.frame.size.height) / 2, nameW, name.frame.size.height));
    add(name, c.pillViews);
    x += nameW + 7;
    c.pillCount = null;
    if (c.count > 1) {
      const text = measured(String(c.count), 10, BOLD, countColor);
      const base = { x, y: (ph - 16) / 2, w: Math.max(16, text.frame.size.width + 8), h: 16 };
      const b = add(box($.NSMakeRect(base.x, base.y, base.w, base.h), nsColor(c.frameHex), 8, null), c.pillViews);
      add(centerIn(text, base.x, base.y, base.w, base.h), c.pillViews);
      c.pillCount = { box: b, text, base };
      x += base.w + 7;
    }
    const statusColor = nsColor(waiting ? t.waiting : t.done);
    const sym = symbol(waiting ? 'bell.fill' : 'checkmark');
    if (sym) {
      const view = imageView(sym, x, (ph - 12) / 2, 12);
      try { view.setContentTintColor(statusColor); } catch (e) { /* macOS before 10.14: drawn in black */ }
      c.pillStatus = add(view, c.pillViews);
    } else {
      c.pillStatus = add(centered(waiting ? '!' : String.fromCharCode(0x2713), 11, BOLD, statusColor, x, 0, 12, ph), c.pillViews);
    }
    c.pillClose = add(centered(String.fromCharCode(0xD7), 13, 0, nsColor(t.muted), x, 0, 12, ph), c.pillViews);
    c.pillW = x + 12 + 9 + 2 * c.inset;

    c.flash = add(box($.NSMakeRect(0, 0, cw, ch), $.NSColor.clearColor, 8, nsColor(c.frameHex), 3));
    c.flash.setHidden(true);
    c.ring.setBorderColor(nsColor(c.frameHex, 0));
    setShape(c);
    showGroups(c);
  }

  function makeCard(job, key) {
    // Borderless (0) | NonactivatingPanel (1 << 7)
    const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, WIN_W, WIN_H), 1 << 7, 2, false);
    panel.setLevel(25); // NSStatusWindowLevel
    panel.setOpaque(false);
    panel.setBackgroundColor($.NSColor.clearColor);
    panel.setHasShadow(true);
    panel.setCollectionBehavior(1 | 256); // all Spaces, over full-screen apps
    const root = $.NSView.alloc.initWithFrame($.NSMakeRect(0, 0, WIN_W, WIN_H));
    panel.setContentView(root);
    // Custom NSBoxes draw the ring, the card and its parts: plain AppKit, no
    // layer or CGColor bridging.
    const ring = box($.NSMakeRect(0, 0, CARD_W, CARD_H), $.NSColor.clearColor, 10, $.NSColor.clearColor, 2);
    ring.setHidden(true);
    root.addSubview(ring);
    const card = box($.NSMakeRect(WIN_W - MARGIN - CARD_W, WIN_H - MARGIN - CARD_H, CARD_W, CARD_H), $.NSColor.clearColor, 10, $.NSColor.clearColor, 2);
    root.addSubview(card);
    const inset = clamp((CARD_W - card.contentView.frame.size.width) / 2, 0, 4);
    const c = {
      key, panel, root, ring, card, inset, views: [], count: 1, pill: false, phase: 'enter',
      w: CARD_W, h: CARD_H, radius: 10, rs: 0, side: 1, down: true, ax: 0, ay: 0, tx: 0, alpha: -1, px: null, py: null,
      t0: null, moveT0: null, morphT0: null, pulseT0: null, bumpT0: null, hover: false,
    };
    setJob(c, job);
    return c;
  }

  // --- Card life ---
  function layout(instant) {
    const a = anchor();
    let off = 0;
    for (const c of cards) {
      if (c.phase === 'leave') continue;
      const h = c.pill ? PILL_H : CARD_H;
      const dragging = press && press.dragging && press.c === c;
      if (!dragging) setSide(c, a.side, a.down);
      const tx = a.side > 0 ? a.x + CARD_W : a.x;
      const ty = a.down ? a.y - off : a.y - CARD_H + off;
      off += h + GAP;
      if (dragging) continue;
      if (c === instant || !motion) {
        c.ax = tx;
        c.ay = ty;
        c.moveT0 = null;
        placePanel(c);
      } else if (Math.abs(c.ax - tx) > 0.5 || Math.abs(c.ay - ty) > 0.5) {
        c.from = [c.ax, c.ay];
        c.to = [tx, ty];
        c.moveT0 = now;
      }
    }
  }
  function enter(c) {
    c.phase = 'enter';
    c.t0 = null; // starts on the first frame after the panel shows
    c.enterMs = ENTER_MS;
    c.fade = FADE;
    const s = c.side;
    const left = s > 0 ? c.ax - c.w : c.ax;
    const midY = c.down ? c.ay - c.h / 2 : c.ay + c.h / 2;
    const own = screenAt(left + c.w / 2, midY);
    if (!motion) {
      c.keys = [[0, 0], [1, 0]];
      c.enterMs = 220;
      c.fade = [[0, 0], [220, 1, 'out']];
    } else if (own) {
      const f = own.frame;
      let d = s > 0 ? f.origin.x + f.size.width - left + MARGIN : -(left + c.w - f.origin.x + MARGIN);
      // Another screen just past that edge would show the card on its way
      // in: come in from closer instead.
      if (screenAt(s > 0 ? f.origin.x + f.size.width + 4 : f.origin.x - 4, midY)) {
        d = 40 * s;
        c.fade = [[0, 0], [200, 1, 'out']];
      }
      c.keys = enterKeys(d, s);
    } else {
      c.keys = enterKeys(40 * s, s);
    }
    c.tx = track(c.keys, 0);
    setAlpha(c, 0);
    placePanel(c);
    c.panel.orderFrontRegardless;
  }
  function startMorph(c, w, h, toPill) {
    c.pill = toPill;
    c.morph = { w0: c.w, h0: c.h, r0: c.radius, w1: w, h1: h, r1: toPill ? 15 : 10 };
    c.morphT0 = now;
    showGroups(c);
    if (!motion) stepMorph(c, now + MORPH_MS);
    layout(null);
  }
  function toPill(c) {
    c.remaining = Infinity;
    startMorph(c, c.pillW, PILL_H, true);
  }
  function leave(c) {
    if (c.phase === 'leave') return;
    c.phase = 'leave';
    c.l0 = now;
    c.alpha0 = c.alpha;
    c.tx0 = c.tx;
    layout(null);
  }
  function open(c) {
    if (c.job.cli && c.job.folder) {
      try { sh.doShellScript(quote(c.job.cli) + ' ' + quote(c.job.folder) + ' > /dev/null 2>&1 &'); } catch (e) { logLine(stateDir, e); }
    }
    leave(c);
  }
  function addAlert(job) {
    position = job.position === 'bottomRight' ? 'bottomRight' : 'topRight';
    const key = alertKey(job);
    const same = cards.find((c) => c.key === key && c.phase !== 'leave');
    if (same) {
      same.count++;
      setJob(same, job);
      if (same.pill) startMorph(same, CARD_W, CARD_H, false);
      if (same.phase === 'shown') same.pulseT0 = now;
      same.bumpT0 = now;
      return;
    }
    const c = makeCard(job, key);
    cards.push(c);
    const live = cards.filter((x) => x.phase !== 'leave');
    if (live.length > MAX_CARDS) leave(live[0]);
    layout(c);
    enter(c);
  }
  // Dropped: this card stays where it is, the stack gathers around it, and
  // the spot is kept for the next alerts.
  function dropped(c) {
    const r = screenRect(c);
    const s = screenAt(r.x + r.w / 2, r.y + r.h / 2) || $.NSScreen.mainScreen;
    const vf = s.visibleFrame;
    const left = clamp(r.x, vf.origin.x, vf.origin.x + vf.size.width - c.w);
    const bottom = clamp(r.y, vf.origin.y, vf.origin.y + vf.size.height - c.h);
    const side = left + c.w / 2 < vf.origin.x + vf.size.width / 2 ? -1 : 1;
    const down = bottom + c.h / 2 > vf.origin.y + vf.size.height / 2;
    let off = 0;
    for (const x of cards) {
      if (x === c) break;
      if (x.phase !== 'leave') off += (x.pill ? PILL_H : CARD_H) + GAP;
    }
    place = {
      x: side > 0 ? left + c.w - CARD_W : left,
      y: down ? bottom + c.h + off : bottom - off + CARD_H,
      side,
      down,
    };
    try { savePlace(place); } catch (e) { logLine(stateDir, e); }
    c.side = side;
    c.down = down;
    c.ax = side > 0 ? left + c.w : left;
    c.ay = down ? bottom + c.h : bottom;
    setShape(c);
    placePanel(c);
    layout(null);
  }

  // --- One frame of a card. Returns true while it still moves. ---
  function stepMorph(c, t) {
    const m = Math.min(1, (t - c.morphT0) / MORPH_MS);
    const k = eased('out', m);
    const p = c.morph;
    c.w = p.w0 + (p.w1 - p.w0) * k;
    c.h = p.h0 + (p.h1 - p.h0) * k;
    c.radius = p.r0 + (p.r1 - p.r0) * k;
    if (m >= 1) {
      c.morphT0 = null;
      showGroups(c);
      c.panel.invalidateShadow;
    }
    setShape(c);
  }
  function popBox(part, scale) {
    if (!part) return;
    const b = part.base;
    const w = b.w * scale;
    const h = b.h * scale;
    part.box.setFrame($.NSMakeRect(b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h));
    part.box.setCornerRadius(h / 2);
    centerIn(part.text, b.x, b.y, b.w, b.h);
  }
  function step(c) {
    let busy = false;
    if (c.phase === 'enter') {
      if (c.t0 === null) c.t0 = now;
      const e = now - c.t0;
      c.tx = track(c.keys, e);
      setAlpha(c, track(c.fade, e));
      if (e >= c.enterMs) {
        c.phase = 'shown';
        c.tx = 0;
        setAlpha(c, 1);
        c.pulseT0 = now;
      }
      busy = true;
    }
    if (c.moveT0 !== null) {
      const m = Math.min(1, (now - c.moveT0) / MOVE_MS);
      const k = eased('out', m);
      c.ax = c.from[0] + (c.to[0] - c.from[0]) * k;
      c.ay = c.from[1] + (c.to[1] - c.from[1]) * k;
      if (m >= 1) c.moveT0 = null;
      busy = true;
    }
    if (c.morphT0 !== null) {
      stepMorph(c, now);
      busy = true;
    }
    if (c.pulseT0 !== null) {
      const p = now - c.pulseT0;
      const done = p >= PULSE_MS;
      // With Reduce motion the ring stays still; the frame and tint still flash.
      c.rs = done || !motion ? 0 : track(RING_SPREAD, p);
      const ra = done || !motion ? 0 : track(RING_ALPHA, p);
      const bw = done ? 0 : track(FLASH_WIDTH, p);
      c.ring.setHidden(ra <= 0.01);
      c.ring.setBorderColor(nsColor(c.frameHex, ra));
      c.flash.setHidden(bw < 0.2);
      c.flash.setBorderWidth(Math.max(0.2, bw));
      c.wash.setFillColor(nsColor(c.frameHex, done ? 0 : track(WASH_ALPHA, p)));
      setShape(c);
      if (done) c.pulseT0 = null;
      else busy = true;
    }
    if (c.bumpT0 !== null) {
      const b = now - c.bumpT0;
      const scale = b >= 420 || !motion ? 1 : track(POP_SCALE, b);
      popBox(c.pill ? c.pillCount : c.badge, scale);
      if (b >= 420) c.bumpT0 = null;
      else busy = true;
    }
    if (c.phase === 'leave') {
      const l = Math.min(1, (now - c.l0) / LEAVE_MS);
      setAlpha(c, c.alpha0 * (1 - l * l));
      if (motion) c.tx = c.tx0 + (8 * c.side - c.tx0) * l * l;
      if (l >= 1) {
        c.panel.orderOut(null);
        cards.splice(cards.indexOf(c), 1);
        return false;
      }
      busy = true;
    }
    placePanel(c);
    if (busy) c.panel.displayIfNeeded;
    return busy;
  }
  function moving(c) {
    return c.phase === 'enter' || c.phase === 'leave' || c.moveT0 !== null || c.morphT0 !== null || c.pulseT0 !== null || c.bumpT0 !== null;
  }

  // Jobs waiting in state/popups, oldest first. A file still being written is
  // left for the next round; a stale one (from a crash) is dropped.
  function receive() {
    const files = listDir(inbox).filter((n) => /\.json$/.test(n))
      .map((n) => ({ path: inbox + '/' + n, t: mtimeSeconds(inbox + '/' + n) }))
      .sort((a, b) => a.t - b.t);
    for (const f of files) {
      const age = Date.now() / 1000 - f.t;
      let job = null;
      try {
        job = JSON.parse(readText(f.path));
      } catch (e) {
        if (age < 3) continue;
      }
      fm.removeItemAtPathError(f.path, null);
      if (job && age < 60) {
        try { addAlert(job); } catch (e) { logLine(stateDir, e); }
      }
    }
  }
  function inside(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // --- Mouse: a click opens, a drag moves, the x closes. ---
  function onEvent(event) {
    const type = int(event.type);
    const m = $.NSEvent.mouseLocation;
    if (type === LEFT_MOUSE_DOWN) {
      const win = int(event.windowNumber);
      const c = cards.find((k) => k.phase !== 'leave' && int(k.panel.windowNumber) === win);
      if (c && inside(m, screenRect(c))) press = { c, x: m.x, y: m.y, ax: c.ax, ay: c.ay, dragging: false };
    } else if (type === LEFT_MOUSE_DRAGGED && press) {
      const c = press.c;
      const dx = m.x - press.x;
      const dy = m.y - press.y;
      if (!press.dragging && Math.sqrt(dx * dx + dy * dy) >= 4) {
        press.dragging = true;
        if (c.moveT0 !== null) {
          press.ax = c.ax - dx;
          press.ay = c.ay - dy;
          c.moveT0 = null;
        }
        if (c.phase === 'enter') {
          c.phase = 'shown';
          c.tx = 0;
          setAlpha(c, 1);
          c.pulseT0 = now;
        }
      }
      if (press.dragging) {
        c.ax = press.ax + dx;
        c.ay = press.ay + dy;
        placePanel(c);
      }
    } else if (type === LEFT_MOUSE_UP && press) {
      const p = press;
      press = null;
      if (p.dragging) {
        dropped(p.c);
        return;
      }
      const c = p.c;
      const r = screenRect(c);
      const x = m.x - r.x;
      const y = m.y - r.y;
      if (c.pill ? x > c.w - 24 : x > c.w - 34 && y > c.h - 30) leave(c);
      else open(c);
    }
  }

  const mode = $.NSDefaultRunLoopMode || $('kCFRunLoopDefaultMode');
  const nextEvent = (seconds) => app.nextEventMatchingMaskUntilDateInModeDequeue(
    EVENT_MASK, $.NSDate.dateWithTimeIntervalSinceNow(seconds), mode, true);
  receive();
  let lastTick = Date.now();
  let idleSince = Date.now();
  for (;;) {
    now = Date.now();
    if (now - lastTick >= 250) {
      const dt = now - lastTick;
      lastTick = now;
      receive();
      // "Back to corner" in Settings deletes the spot.
      if (place && !fm.fileExistsAtPath(placeFile)) {
        place = null;
        layout(null);
      }
      for (const c of cards.slice()) {
        if (c.phase !== 'shown' || c.pill || c.hover || (press && press.dragging && press.c === c)) continue;
        c.remaining -= dt;
        if (c.remaining <= 0) {
          if (c.stay) toPill(c);
          else leave(c);
        }
      }
    }
    if (cards.length) idleSince = now;
    else if (now - idleSince > 1500 && !listDir(inbox).some((n) => /\.json$/.test(n))) break;
    const event = nextEvent(cards.some(moving) ? FRAME : 0.1);
    if (!event.isNil()) {
      onEvent(event);
      app.sendEvent(event);
    }
    now = Date.now();
    for (const c of cards.slice()) step(c);
    // Hovering pauses the timer; on a pill it swaps the check for the x.
    const mouse = $.NSEvent.mouseLocation;
    for (const c of cards) {
      const over = c.phase !== 'leave' && inside(mouse, screenRect(c));
      if (over !== c.hover) {
        c.hover = over;
        if (c.pill && c.morphT0 === null) showGroups(c);
      }
    }
  }
}

function run(argv) {
  const jobPath = argv[0] || '';
  const inPopups = /\/popups\/[^\/]+$/;
  const stateDir = inPopups.test(jobPath)
    ? jobPath.replace(inPopups, '')
    : $.NSHomeDirectory().js + '/.benefits-toolkit/state';
  try {
    const sh = Application.currentApplication();
    sh.includeStandardAdditions = true;
    const lock = becomeHost(stateDir, jobPath, sh);
    if (!lock) return;
    try {
      host(stateDir, stateDir.replace(/\/state$/, '') + '/bin/marks', sh);
    } finally {
      fm.removeItemAtPathError(lock, null);
    }
  } catch (e) {
    logLine(stateDir, e);
    throw e; // osascript exits non-zero, so "Test popup" can report it
  }
}
