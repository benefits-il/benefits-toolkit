// Benefit's Toolkit popup (macOS, JavaScript for Automation + Cocoa).
// Started detached by dispatch.js (or by the extension's "Test popup") with
// the path of a JSON job file: { title, subtitle, color, cli, folder, seconds }
// A small non-activating panel in the project's color, top-right under the
// menu bar, stacked under popups already showing. It never takes focus by
// itself; clicking it runs "<cli> <folder>", which brings that project's
// editor window to the front. The x in the corner just closes it.
//
// Written to run unchanged on Intel and Apple Silicon Macs, which disagree on
// several low-level values: BOOL is a char on Intel and a bool on Apple
// Silicon (so no ObjC.registerSubclass with BOOL methods: a type mismatch
// throws before anything shows), NSTextAlignmentRight is 1 on one and 2 on
// the other, and NSEventMaskAny (2^64-1) does not survive a JS number.
// Clicks are therefore read straight off the event queue.
// Failures are appended to state/dispatch.log, tagged [popup] as on Windows.
ObjC.import('Cocoa');

const W = 320;
const H = 64;
const GAP = 10;
const EDGE = 12;
const LEFT_MOUSE_DOWN = 1; // NSEventTypeLeftMouseDown
const EVENT_MASK = 0xFFFFFFFF; // every event type below 32 (mouse, keys, app-defined)
const ALIGN_NATURAL = 4; // NSTextAlignmentNatural, the same value on both architectures
const WRITING_RTL = 1; // NSWritingDirectionRightToLeft
const BOX_CUSTOM = 4; // NSBoxCustom
const NO_TITLE = 0; // NSNoTitle

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : s.js;
}
function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}
function quote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function colorFromHex(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '') || [null, '04', '78', '57'];
  const c = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return { color: $.NSColor.colorWithSRGBRedGreenBlueAlpha(c[0], c[1], c[2], 1), luminance: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] };
}

function label(text, size, bold, color, frame, rtl) {
  const field = $.NSTextField.labelWithString(text);
  field.setFont(bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size));
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

function inside(p, r) {
  return p.x >= r.origin.x && p.x <= r.origin.x + r.size.width &&
    p.y >= r.origin.y && p.y <= r.origin.y + r.size.height;
}

function show(job, slotsDir, sh) {
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

    const bg = colorFromHex(job.color);
    const fg = bg.luminance > 0.45
      ? $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.08, 0.13, 0.17, 1)
      : $.NSColor.whiteColor;
    const rtl = new RegExp('[' + String.fromCharCode(0x0590) + '-' + String.fromCharCode(0x06FF) + ']').test(job.title || '');

    const vf = $.NSScreen.mainScreen.visibleFrame;
    const x = vf.origin.x + vf.size.width - W - EDGE;
    const y = vf.origin.y + vf.size.height - EDGE - H - slot * (H + GAP);
    // Borderless (0) | NonactivatingPanel (1 << 7)
    const panel = $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(x, y, W, H), 1 << 7, 2, false);
    panel.setLevel(25); // NSStatusWindowLevel
    panel.setOpaque(false);
    panel.setBackgroundColor($.NSColor.clearColor);
    panel.setHasShadow(true);
    panel.setCollectionBehavior(1 | 256); // all Spaces, over full-screen apps

    // A custom NSBox draws the rounded card itself: plain AppKit, no layer
    // or CGColor bridging.
    const card = $.NSBox.alloc.initWithFrame($.NSMakeRect(0, 0, W, H));
    card.setBoxType(BOX_CUSTOM);
    card.setTitlePosition(NO_TITLE);
    card.setBorderWidth(0);
    card.setCornerRadius(12);
    card.setFillColor(bg.color);
    card.setContentViewMargins($.NSMakeSize(0, 0));
    panel.setContentView(card);

    const content = card.contentView;
    const textW = W - 16 - 34;
    content.addSubview(label(job.title || '', 14, true, fg, $.NSMakeRect(16, 32, textW, 20), rtl));
    content.addSubview(label(job.subtitle || '', 12, false, fg, $.NSMakeRect(16, 12, textW, 18), rtl));
    content.addSubview(label(String.fromCharCode(0xD7), 15, false, fg, $.NSMakeRect(W - 28, H - 28, 18, 20), false));

    panel.orderFrontRegardless;

    // Event loop with a countdown that pauses while the mouse is over the panel.
    const mode = $.NSDefaultRunLoopMode || $('kCFRunLoopDefaultMode');
    let remaining = Number(job.seconds) > 0 ? Number(job.seconds) : 8;
    let clicked = null; // 'open' | 'close'
    let last = Date.now();
    while (remaining > 0 && !clicked) {
      const event = app.nextEventMatchingMaskUntilDateInModeDequeue(
        EVENT_MASK, $.NSDate.dateWithTimeIntervalSinceNow(0.1), mode, true);
      if (!event.isNil()) {
        if (event.type === LEFT_MOUSE_DOWN && event.windowNumber === panel.windowNumber) {
          const p = event.locationInWindow;
          clicked = p.x > W - 34 && p.y > H - 30 ? 'close' : 'open';
        }
        app.sendEvent(event);
      }
      const now = Date.now();
      if (!inside($.NSEvent.mouseLocation, panel.frame)) remaining -= (now - last) / 1000;
      last = now;
    }

    if (clicked === 'open' && job.cli && job.folder) {
      sh.doShellScript(quote(job.cli) + ' ' + quote(job.folder) + ' > /dev/null 2>&1 &');
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
    show(job, stateDir + '/popup-slots', sh);
  } catch (e) {
    try {
      const log = stateDir + '/dispatch.log';
      writeText(log, (readText(log) || '').slice(-100000) + new Date().toISOString() + ' [popup] ' + e + '\n');
    } catch (e2) { /* nothing left to do */ }
    throw e; // osascript exits non-zero, so "Test popup" can report it
  }
}
