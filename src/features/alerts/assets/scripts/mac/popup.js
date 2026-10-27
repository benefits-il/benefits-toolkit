// Benefit's Toolkit popup (macOS, JavaScript for Automation + Cocoa).
// Started detached by dispatch.js (or by the extension's "Test popup") with
// the path of a JSON job file:
//   { agent, title, subtitle, kind, color, text, theme, cli, folder, seconds, stay, position }
// A small non-activating panel in the toolkit's theme, top-right under the
// menu bar (or bottom-right with position "bottomRight"), stacked away from
// the corner past popups already showing: a tile with the mark of the
// agent that finished (Claude, Cursor or Antigravity, from bin/marks), the
// project name, and the status, framed in the project's color. A job without
// a mark gets the older tile: the project's color with a check (finished) or
// "!" (needs input). It never takes focus by itself;
// clicking it runs "<cli> <folder>", which brings that project's editor
// window to the front. The x in the corner just closes it. With "stay" it
// waits for one of the two.
//
// Written to run unchanged on Intel and Apple Silicon Macs, which disagree on
// several low-level values: BOOL is a char on Intel and a bool on Apple
// Silicon (so no ObjC.registerSubclass with BOOL methods: a type mismatch
// throws before anything shows), the right and center text alignments have
// different numbers on each (so labels are placed by measuring, never by
// alignment), and NSEventMaskAny (2^64-1) does not survive a JS number.
// Clicks are therefore read straight off the event queue.
// Failures are appended to state/dispatch.log, tagged [popup] as on Windows.
ObjC.import('Cocoa');

const W = 300;
const H = 64;
const GAP = 10;
const EDGE = 12;
const TILE = 34;
const LEFT_MOUSE_DOWN = 1; // NSEventTypeLeftMouseDown
const EVENT_MASK = 0xFFFFFFFF; // every event type below 32 (mouse, keys, app-defined)
const ALIGN_NATURAL = 4; // NSTextAlignmentNatural, the same value on both architectures
const WRITING_RTL = 1; // NSWritingDirectionRightToLeft
const BOX_CUSTOM = 4; // NSBoxCustom
const NO_TITLE = 0; // NSNoTitle
const SEMIBOLD = 0.3; // NSFontWeightSemibold
// Gentle entrance: fade in while sliding a few points in from the right, and
// out the same way. Stepped by hand in the event loop (plain setAlphaValue /
// setFrameOrigin, no animator proxies); with Reduce motion on it only fades.
const INTRO_MS = 260;
const OUTRO_MS = 160;
const SLIDE_IN = 12;
const SLIDE_OUT = 8;
const FRAME = 1 / 60;

// The card's colors: the toolkit's theme (Graphite dark gray, cream light, or
// high contrast). Same tokens as the sidebar and popup.ps1. The frame takes
// the project's color, except in high contrast.
const THEMES = {
  'dark': { bg: '#1F2120', tile: '#2C302E', line: '#363A38', text: '#F6F4EA', muted: '#A9B3AE', done: '#8FD3B3', waiting: '#FCD34D' },
  'light': { bg: '#FFFDF6', tile: '#F1ECDD', line: '#E6D9AE', text: '#14231C', muted: '#55635C', done: '#047857', waiting: '#92400E' },
  'hc-dark': { bg: '#000000', tile: '#000000', line: '#FFFFFF', text: '#FFFFFF', muted: '#FFFFFF', done: '#FFFFFF', waiting: '#FFFFFF' },
  'hc-light': { bg: '#FFFFFF', tile: '#FFFFFF', line: '#000000', text: '#000000', muted: '#000000', done: '#000000', waiting: '#000000' },
};

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : s.js;
}
function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}
function quote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function rgb(hex, fallback) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '') || /^#(..)(..)(..)$/.exec(fallback);
  return [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
}
function nsColor(hex, fallback) {
  const c = rgb(hex, fallback || '#047857');
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(c[0], c[1], c[2], 1);
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

// A label centered in a box by measuring it: no alignment constants.
function centered(text, size, weight, color, x, y, w, h) {
  const field = $.NSTextField.labelWithString(text);
  field.setFont(font(size, weight));
  field.setTextColor(color);
  field.sizeToFit;
  const s = field.frame.size;
  field.setFrameOrigin($.NSMakePoint(x + (w - s.width) / 2, y + (h - s.height) / 2));
  return field;
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
    const v = $.NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion;
    return v === true || v === 1;
  } catch (e) {
    return false;
  }
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

function inside(p, r) {
  return p.x >= r.origin.x && p.x <= r.origin.x + r.size.width &&
    p.y >= r.origin.y && p.y <= r.origin.y + r.size.height;
}

// The agent's mark (a PNG in bin/marks), or null. Cursor's one-color cube
// comes in the card's text color, one file per theme.
function agentMark(job, marksDir) {
  const agent = String(job.agent || '');
  if (!/^[a-z]+$/.test(agent)) return null;
  const name = agent === 'cursor' ? (/light/.test(String(job.theme || '')) ? 'cursor-light' : 'cursor-dark') : agent;
  const path = marksDir + '/' + name + '.png';
  if (!$.NSFileManager.defaultManager.fileExistsAtPath(path)) return null;
  const img = $.NSImage.alloc.initWithContentsOfFile(path);
  return img.isNil() ? null : img;
}

function show(job, slotsDir, marksDir, sh) {
  // Stack position: the lowest slot no live popup holds.
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(slotsDir, true, $(), null);
  let slot = 0;
  for (; slot < 4; slot++) {
    const owner = parseInt(readText(slotsDir + '/' + slot) || '0', 10);
    if (!owner) break;
    if (sh.doShellScript('kill -0 ' + owner + ' 2>/dev/null && echo yes || echo no') !== 'yes') break;
  }
  if (slot >= 4) slot = 3;
  const slotFile = slotsDir + '/' + slot;
  writeText(slotFile, String($.NSProcessInfo.processInfo.processIdentifier));

  try {
    const app = $.NSApplication.sharedApplication;
    app.setActivationPolicy(1); // Accessory: no Dock icon, no menu bar
    app.finishLaunching;

    const theme = THEMES[job.theme] || THEMES.dark;
    const waiting = job.kind === 'waiting';
    const tileHex = /^#[0-9a-f]{6}$/i.test(job.color || '') ? job.color : '#047857';
    const tileText = /^#[0-9a-f]{6}$/i.test(job.text || '') ? job.text : readableOn(tileHex);
    const rtl = new RegExp('[' + String.fromCharCode(0x0590) + '-' + String.fromCharCode(0x06FF) + ']').test(job.title || '');

    const vf = $.NSScreen.mainScreen.visibleFrame;
    const x = vf.origin.x + vf.size.width - W - EDGE;
    const y = job.position === 'bottomRight'
      ? vf.origin.y + EDGE + slot * (H + GAP)
      : vf.origin.y + vf.size.height - EDGE - H - slot * (H + GAP);
    // Borderless (0) | NonactivatingPanel (1 << 7)
    const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(x, y, W, H), 1 << 7, 2, false);
    panel.setLevel(25); // NSStatusWindowLevel
    panel.setOpaque(false);
    panel.setBackgroundColor($.NSColor.clearColor);
    panel.setHasShadow(true);
    panel.setCollectionBehavior(1 | 256); // all Spaces, over full-screen apps

    // Custom NSBoxes draw the rounded card and the tile: plain AppKit, no
    // layer or CGColor bridging.
    const highContrast = String(job.theme || '').indexOf('hc') === 0;
    const card = box($.NSMakeRect(0, 0, W, H), nsColor(theme.bg), 10, highContrast ? nsColor(theme.line) : nsColor(tileHex), 2);
    panel.setContentView(card);
    const content = card.contentView;

    // The agent's mark fills the tile, on a quiet surface, so who finished
    // shows at a glance; the project's color stays in the frame. Sized by the
    // image itself, so no image-scaling constant is needed.
    const tileY = (H - TILE) / 2;
    const mark = agentMark(job, marksDir);
    if (mark) {
      content.addSubview(box($.NSMakeRect(12, tileY, TILE, TILE), nsColor(theme.tile), 8, highContrast ? nsColor(theme.line) : null));
      mark.setSize($.NSMakeSize(20, 20));
      const view = $.NSImageView.alloc.initWithFrame($.NSMakeRect(12 + (TILE - 20) / 2, tileY + (TILE - 20) / 2, 20, 20));
      view.setImage(mark);
      content.addSubview(view);
    } else {
      content.addSubview(box($.NSMakeRect(12, tileY, TILE, TILE), nsColor(tileHex), 8, null));
      const glyph = waiting ? '!' : String.fromCharCode(0x2713);
      content.addSubview(centered(glyph, waiting ? 18 : 17, 0.6, nsColor(tileText), 12, tileY, TILE, TILE));
    }

    const textX = 12 + TILE + 10;
    const textW = W - textX - 30;
    content.addSubview(label(job.title || '', 13, SEMIBOLD, nsColor(theme.text), $.NSMakeRect(textX, 32, textW, 18), rtl));
    content.addSubview(label(job.subtitle || '', 11, 0, nsColor(waiting ? theme.waiting : theme.done), $.NSMakeRect(textX, 15, textW, 16), rtl));
    content.addSubview(centered(String.fromCharCode(0xD7), 15, 0, nsColor(theme.muted), W - 30, H - 30, 22, 22));

    const slides = !reduceMotion();
    let alpha = 0;
    let offset = slides ? SLIDE_IN : 0;
    const place = () => {
      panel.setAlphaValue(alpha);
      if (slides) panel.setFrameOrigin($.NSMakePoint(x + offset, y));
    };
    place();
    panel.orderFrontRegardless;

    // Event loop with a countdown that pauses while the mouse is over the panel.
    const mode = $.NSDefaultRunLoopMode || $('kCFRunLoopDefaultMode');
    const nextEvent = (seconds) => app.nextEventMatchingMaskUntilDateInModeDequeue(
      EVENT_MASK, $.NSDate.dateWithTimeIntervalSinceNow(seconds), mode, true);
    // "stay" has no countdown: the panel waits for a click on it or on the x.
    const stay = job.stay === true;
    let remaining = Number(job.seconds) > 0 ? Number(job.seconds) : 8;
    let clicked = null; // 'open' | 'close'
    const shownAt = Date.now();
    let entering = true;
    let last = shownAt;
    while ((stay || remaining > 0) && !clicked) {
      const event = nextEvent(entering ? FRAME : 0.1);
      if (!event.isNil()) {
        if (event.type === LEFT_MOUSE_DOWN && event.windowNumber === panel.windowNumber) {
          const p = event.locationInWindow;
          clicked = p.x > W - 34 && p.y > H - 30 ? 'close' : 'open';
        }
        app.sendEvent(event);
      }
      const now = Date.now();
      if (entering) {
        const t = Math.min(1, (now - shownAt) / INTRO_MS);
        alpha = easeOut(t);
        if (slides) offset = SLIDE_IN * (1 - alpha);
        place();
        entering = t < 1;
      }
      if (!inside($.NSEvent.mouseLocation, panel.frame)) remaining -= (now - last) / 1000;
      last = now;
    }

    if (clicked === 'open' && job.cli && job.folder) {
      sh.doShellScript(quote(job.cli) + ' ' + quote(job.folder) + ' > /dev/null 2>&1 &');
    }
    // Fade out from wherever the entrance got to.
    const fromAlpha = alpha;
    const fromOffset = offset;
    const leftAt = Date.now();
    for (let t = 0; t < 1;) {
      t = Math.min(1, (Date.now() - leftAt) / OUTRO_MS);
      alpha = fromAlpha * (1 - t * t);
      if (slides) offset = fromOffset + (SLIDE_OUT - fromOffset) * t * t;
      place();
      if (t < 1) {
        const event = nextEvent(FRAME);
        if (!event.isNil()) app.sendEvent(event);
      }
    }
    panel.orderOut(null);
  } finally {
    $.NSFileManager.defaultManager.removeItemAtPathError(slotFile, null);
  }
}

function run(argv) {
  const jobPath = argv[0] || '';
  const inPopups = /\/popups\/[^\/]+$/;
  const stateDir = inPopups.test(jobPath)
    ? jobPath.replace(inPopups, '')
    : $.NSHomeDirectory().js + '/.benefits-toolkit/state';
  try {
    const job = JSON.parse(readText(jobPath));
    $.NSFileManager.defaultManager.removeItemAtPathError(jobPath, null);
    const sh = Application.currentApplication();
    sh.includeStandardAdditions = true;
    show(job, stateDir + '/popup-slots', stateDir.replace(/\/state$/, '') + '/bin/marks', sh);
  } catch (e) {
    try {
      const log = stateDir + '/dispatch.log';
      writeText(log, (readText(log) || '').slice(-100000) + new Date().toISOString() + ' [popup] ' + e + '\n');
    } catch (e2) { /* nothing left to do */ }
    throw e; // osascript exits non-zero, so "Test popup" can report it
  }
}
