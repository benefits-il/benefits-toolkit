// Benefit's Toolkit alert dispatcher (macOS, JavaScript for Automation).
// Installed to ~/.benefits-toolkit/bin by the extension and run by agent hooks:
//   osascript -l JavaScript dispatch.js <agent> <kind>
//     agent: claude | cursor | antigravity      kind: done | waiting
// Same job as dispatch.ps1 on Windows: read the hook's JSON from stdin, find
// the project the agent ran in, show the popup (detached) unless that
// project's window is focused, then play the sound. Never fails the hook.
ObjC.import('Foundation');

const fm = $.NSFileManager.defaultManager;
const sh = Application.currentApplication();
sh.includeStandardAdditions = true;

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : s.js;
}
function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}
function exists(path) { return fm.fileExistsAtPath(path); }
function mkdirs(path) { fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, $(), null); }
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
function shell(cmd) { return sh.doShellScript(cmd); }

// Same rule as normalizeFolder() in project-registry.ts.
function normalizeFolder(p) { return p ? String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : ''; }

// The toolkit home is this script's folder's parent (~/.benefits-toolkit).
function toolkitRoot() {
  const args = $.NSProcessInfo.processInfo.arguments.js.map((a) => a.js);
  const self = args.find((a) => /dispatch\.js$/.test(a));
  if (self) return self.replace(/\/bin\/dispatch\.js$/, '');
  return $.NSHomeDirectory().js + '/.benefits-toolkit';
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function run(argv) {
  const agent = argv[0] || 'claude';
  const kind = argv[1] || 'done';
  const root = toolkitRoot();
  const stateDir = root + '/state';
  try {
    mkdirs(stateDir);

    // 1. The hook's input.
    let data = null;
    try {
      const raw = $.NSString.alloc.initWithDataEncoding(
        $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile, $.NSUTF8StringEncoding).js;
      if (raw && raw.trim()) data = JSON.parse(raw);
    } catch (e) { /* no or bad input: still alert, without a project */ }
    let folder = null;
    if (data) {
      if (data.cwd) folder = String(data.cwd);
      else if (data.workspace_roots && data.workspace_roots.length) folder = String(data.workspace_roots[0]);
      else if (data.workspacePaths && data.workspacePaths.length) folder = String(data.workspacePaths[0]);
    }

    const configText = readText(root + '/config.json');
    if (!configText) return;
    const config = JSON.parse(configText);

    // 2. One alert per project and kind within 3 seconds.
    const stamp = stateDir + '/last-' + hash(normalizeFolder(folder) + '|' + kind);
    const now = Date.now() / 1000;
    if (exists(stamp) && now - mtimeSeconds(stamp) < 3) return;
    writeText(stamp, '');

    // 3. The project whose folder contains the agent's folder (deepest wins).
    let project = null;
    const target = normalizeFolder(folder);
    const projectsDir = root + '/projects';
    if (target && exists(projectsDir)) {
      let best = -1;
      for (const name of listDir(projectsDir)) {
        if (!/\.json$/.test(name)) continue;
        try {
          const record = JSON.parse(readText(projectsDir + '/' + name));
          const f = normalizeFolder(record.folder);
          if (!f) continue;
          const inside = target === f || target.indexOf(f + '/') === 0;
          if (inside && f.length > best) { project = record; best = f.length; }
        } catch (e) { /* skip a half-written record */ }
      }
    }

    // 4. Popup, unless the user is already in that project's window. Claude
    //    Code's idle reminder gets no popup: the "finished" one already said it.
    const idleReminder = !!data && data.hook_event_name === 'Notification' &&
      (data.notification_type === 'idle_prompt' || /waiting for your input/.test(String(data.message || '')));
    const wantPopup = config.popup.enabled && !idleReminder &&
      ((kind === 'done' && config.popup.onDone) || (kind === 'waiting' && config.popup.onWaiting));
    let focused = false;
    if (project && project.focused && project.pid) {
      focused = shell('kill -0 ' + Number(project.pid) + ' 2>/dev/null && echo yes || echo no') === 'yes';
    }
    if (wantPopup && !focused) {
      const labels = { claude: 'Claude', cursor: 'Cursor', antigravity: 'Antigravity' };
      const agentLabel = labels[agent] || agent;
      // The record carries the text color and the theme the extension worked
      // out; older records lack them, and popup.js falls back on its own.
      const job = {
        title: (project && project.name) || (folder ? folder.replace(/\/+$/, '').split('/').pop() : agentLabel),
        subtitle: kind === 'waiting' ? agentLabel + ' needs input' : agentLabel + ' finished',
        kind: kind,
        color: (project && project.color) || '#047857',
        text: (project && project.colorText) || null,
        theme: (project && project.theme) || 'dark',
        cli: project ? project.cli : null,
        folder: project ? project.folder : folder,
        seconds: config.popup.seconds,
        stay: config.popup.stay === true,
      };
      const jobsDir = stateDir + '/popups';
      mkdirs(jobsDir);
      const jobFile = jobsDir + '/' + $.NSUUID.UUID.UUIDString.js + '.json';
      writeText(jobFile, JSON.stringify(job));
      const popupScript = root + '/bin/popup.js';
      shell('osascript -l JavaScript ' + quote(popupScript) + ' ' + quote(jobFile) + ' > /dev/null 2>&1 &');
    }

    // 5. Sound: the project's own, else the default.
    if (config.sounds.enabled) {
      const id = (project && project.sounds && project.sounds[kind]) || config.sounds[kind];
      const file = id ? root + '/sounds/' + id : null;
      if (file && exists(file)) shell('afplay ' + quote(file));
    }
  } catch (e) {
    try {
      const log = stateDir + '/dispatch.log';
      const line = new Date().toISOString() + ' [' + agent + ' ' + kind + '] ' + e + '\n';
      writeText(log, (readText(log) || '').slice(-100000) + line);
    } catch (e2) { /* nothing left to do */ }
  }
}
