// Benefit's Toolkit popup (macOS, JavaScript for Automation + Cocoa).
// Started detached by dispatch.js (or by the extension's "Test popup") with
// the path of a JSON job file: { title, subtitle, color, cli, folder, seconds }
// A small non-activating panel in the project's color, top-right under the
// menu bar, stacked under popups already showing. It never takes focus by
// itself; clicking it runs "<cli> <folder>", which brings that project's
// editor window to the front. The x in the corner just closes it.
ObjC.import('Cocoa');

const W = 320;
const H = 64;
const GAP = 10;
const EDGE = 12;

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : s.js;
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
    field.setAlignment(1); // NSTextAlignmentRight (AppKit)
    field.setBaseWritingDirection(1); // NSWritingDirectionRightToLeft
  }
  return field;
}

let clicked = null; // 'open' | 'close'

ObjC.registerSubclass({
  name: 'BenefitPopupView',
  superclass: 'NSView',
  methods: {
    'acceptsFirstMouse:': { types: ['bool', ['id']], implementation: function () { return true; } },
    'mouseDown:': {
      types: ['void', ['id']],
      implementation: function (event) {
        const p = event.locationInWindow;
        clicked = p.x > W - 34 && p.y > H - 30 ? 'close' : 'open';
      },
    },
  },
});

function run(argv) {
  const jobPath = argv[0];
  const job = JSON.parse(readText(jobPath));
  $.NSFileManager.defaultManager.removeItemAtPathError(jobPath, null);

  const sh = Application.currentApplication();
  sh.includeStandardAdditions = true;

  // Stack position: the lowest slot no live popup holds.
  const slotsDir = jobPath.replace(/\/popups\/[^\/]+$/, '/popup-slots');
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(slotsDir, true, $(), null);
  let slot = 0;
  for (; slot < 4; slot++) {
    const owner = parseInt(readText(slotsDir + '/' + slot) || '0', 10);
    if (!owner) break;
    if (sh.doShellScript('kill -0 ' + owner + ' 2>/dev/null && echo yes || echo no') !== 'yes') break;
  }
  if (slot >= 4) slot = 3;
  const slotFile = slotsDir + '/' + slot;
  $(String($.NSProcessInfo.processInfo.processIdentifier)).writeToFileAtomicallyEncodingError(slotFile, true, $.NSUTF8StringEncoding, null);

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

  const view = $.BenefitPopupView.alloc.initWithFrame($.NSMakeRect(0, 0, W, H));
  view.setWantsLayer(true);
  view.layer.setCornerRadius(12);
  view.layer.setBackgroundColor(bg.color.CGColor);
  panel.setContentView(view);

  const textW = W - 16 - 34;
  view.addSubview(label(job.title || '', 14, true, fg, $.NSMakeRect(16, 32, textW, 20), rtl));
  view.addSubview(label(job.subtitle || '', 12, false, fg, $.NSMakeRect(16, 12, textW, 18), rtl));
  view.addSubview(label(String.fromCharCode(0xD7), 15, false, fg, $.NSMakeRect(W - 28, H - 28, 18, 20), false));

  panel.orderFrontRegardless;

  // Event loop with a countdown that pauses while the mouse is over the panel.
  let remaining = Number(job.seconds) > 0 ? Number(job.seconds) : 8;
  const anyEvent = $.NSEventMaskAny !== undefined ? $.NSEventMaskAny : $.NSAnyEventMask;
  let last = Date.now();
  while (remaining > 0 && !clicked) {
    const event = app.nextEventMatchingMaskUntilDateInModeDequeue(
      anyEvent, $.NSDate.dateWithTimeIntervalSinceNow(0.1), $.NSDefaultRunLoopMode, true);
    if (!event.isNil()) app.sendEvent(event);
    const now = Date.now();
    const hovering = $.NSPointInRect($.NSEvent.mouseLocation, panel.frame);
    if (!hovering) remaining -= (now - last) / 1000;
    last = now;
  }

  if (clicked === 'open' && job.cli && job.folder) {
    sh.doShellScript(quote(job.cli) + ' ' + quote(job.folder) + ' > /dev/null 2>&1 &');
  }
  panel.orderOut(null);
  $.NSFileManager.defaultManager.removeItemAtPathError(slotFile, null);
}
