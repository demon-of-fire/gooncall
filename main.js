const { app, BrowserWindow, ipcMain, desktopCapturer, session, Tray, Menu, Notification, globalShortcut, screen, shell, dialog, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let win = null;
let tray = null;
let forceQuit = false;

/* ---- portable mode: drop an empty `portable.dat` next to the exe to keep all data beside it ---- */
const exeDir = () => path.dirname(process.execPath);
const isPortable = () => !process.env.SMOKE_PEER && fs.existsSync(path.join(exeDir(), 'portable.dat'));
if (isPortable()) {
  app.setPath('userData', path.join(exeDir(), 'UserData'));
}

/* ---- one-time migration: carry old AeroCall data over to GoonCall ---- */
function migrateFromAerocall() {
  if (process.env.SMOKE_PEER || isPortable()) return;
  try {
    const appData = app.getPath('appData');
    const legacy = path.join(appData, 'GoonCall');
    const cur = path.join(appData, app.getName());
    if (!fs.existsSync(legacy) || fs.existsSync(cur)) return;
    fs.mkdirSync(cur, { recursive: true });
    for (const part of ['data', 'sounds', 'received']) {
      const s = path.join(legacy, part);
      if (fs.existsSync(s)) fs.cpSync(s, path.join(cur, part), { recursive: true });
    }
    console.log('migrated data from aerocall -> ' + app.getName());
  } catch (e) { console.log('migration skipped: ' + String(e)); }
}
migrateFromAerocall();

/* ---- E2E harness: two isolated instances calling each other on one machine.
   SMOKE_PEER=A  -> Alice (TESTAAAA): adds Bob, calls, chats, shares screen
   SMOKE_PEER=B  -> Bob   (TESTBBBB): auto-accepts the incoming call        */
if (process.env.SMOKE_PEER) {
  const role = process.env.SMOKE_PEER;
  const dir = path.join(os.tmpdir(), 'aerocall-e2e-' + role);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  app.setPath('userData', dir);
  fs.writeFileSync(path.join(dir, 'data', 'identity.json'), JSON.stringify(
    role === 'A'
      ? { code: 'TESTAAAA', name: 'Alice', hue: 210 }
      : { code: 'TESTBBBB', name: 'Bob', hue: 120 }
  ));
}

const dataDir = () => path.join(app.getPath('userData'), 'data');
const soundsDir = () => path.join(app.getPath('userData'), 'sounds');
const dataFile = (name) => path.join(dataDir(), `${name}.json`);

/* ---- lightweight rotating file log (errors/warnings only) ---- */
function appendLog(line) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const f = path.join(dataDir(), 'app.log');
    fs.appendFileSync(f, line);
    if (fs.statSync(f).size > 512 * 1024) fs.writeFileSync(f, '');
  } catch {}
}
const logLine = (msg) => appendLog(new Date().toISOString() + ' ' + msg + '\n');

function readData(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(dataFile(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeData(name, value) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(dataFile(name), JSON.stringify(value, null, 2));
  return true;
}

/* ---- app-level prefs owned by the main process ---- */
const DEFAULT_PREFS = { closeToTray: true, hotkeyMute: false, startWithWindows: false };
let prefs = Object.assign({}, DEFAULT_PREFS);

function loadPrefs() {
  prefs = Object.assign({}, DEFAULT_PREFS, readData('app-prefs', {}));
}
const savePrefs = () => writeData('app-prefs', prefs);

function applyAutostart() {
  try { app.setLoginItemSettings({ openAtLogin: !!prefs.startWithWindows }); } catch {}
}

function applyHotkey() {
  if (!win || win.isDestroyed()) return;
  try {
    globalShortcut.unregister('Control+Shift+M');
    if (prefs.hotkeyMute) {
      globalShortcut.register('Control+Shift+M', () => {
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.webContents.send('hotkey', 'mute');
        }
      });
    }
  } catch {}
}

/* ---- window state persistence ---- */
function loadWindowState() {
  const st = readData('window-state', null);
  const defaults = { width: 1280, height: 800, minWidth: 940, minHeight: 620 };
  if (!st || typeof st !== 'object') return defaults;
  let boundsOk = false;
  try {
    for (const d of screen.getAllDisplays()) {
      const a = d.workArea;
      if (st.x >= a.x - 40 && st.y >= a.y - 40 && st.x < a.x + a.width && st.y < a.y + a.height) { boundsOk = true; break; }
    }
  } catch {}
  return Object.assign(defaults, boundsOk ? { x: st.x, y: st.y, width: st.w, height: st.h } : {});
}

let stateSaveTimer = null;
function queueSaveWindowState() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(saveWindowStateNow, 400);
}
function saveWindowStateNow() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  writeData('window-state', { x: b.x, y: b.y, w: b.width, h: b.height });
}

/* ---- tray ---- */
function createTray() {
  try {
    const img = (() => {
      try { return require('electron').nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')); }
      catch { return require('electron').nativeImage.createEmpty(); }
    })();
    tray = new Tray(img);
    tray.setToolTip('GoonCall');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open GoonCall', click: showMainWindow },
      { type: 'separator' },
      { label: 'Close button minimizes to tray', type: 'checkbox', checked: !!prefs.closeToTray, click: (i) => { prefs.closeToTray = i.checked; savePrefs(); } },
      { label: 'Start with Windows', type: 'checkbox', checked: !!prefs.startWithWindows, click: (i) => { prefs.startWithWindows = i.checked; savePrefs(); applyAutostart(); } },
      { type: 'separator' },
      { label: 'Quit GoonCall', click: () => { forceQuit = true; app.quit(); } }
    ]));
    tray.on('click', showMainWindow);
  } catch (e) {
    console.log('tray unavailable:', String(e));
  }
}

function showMainWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const st = loadWindowState();
  win = new BrowserWindow(Object.assign({}, st, {
    frame: false,
    backgroundColor: '#0a0b10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  }));

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.webContents.on('console-message', (_e, level, msg) => {
    if (level >= 2) logLine('[render:' + level + '] ' + msg);
  });
  win.webContents.on('render-process-gone', (_e, d) => logLine('[crash] renderer gone: ' + JSON.stringify(d)));
  app.on('child-process-gone', (_e, d) => logLine('[crash] child gone: ' + d.type + ' ' + (d.reason || '')));
  process.on('unhandledRejection', (r) => logLine('[main] unhandled rejection: ' + String(r)));

  win.on('close', (e) => {
    saveWindowStateNow();
    if (!forceQuit && prefs.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('resize', queueSaveWindowState);
  win.on('move', queueSaveWindowState);

  if (process.env.SMOKE_TEST || process.env.SMOKE_PEER) {
    console.log('SMOKE: window created');
    const bail = (ms = 800) => setTimeout(() => { console.log('SMOKE_OK'); app.exit(0); }, ms);
    win.webContents.on('render-process-gone', (_e, d) => console.log('SMOKE: render gone', d.reason));
    win.webContents.on('console-message', (_e, _lvl, msg) => console.log('RENDER:', msg));

    if (process.env.SMOKE_TEST) {
      win.webContents.on('did-finish-load', () => {
        console.log('SMOKE: page loaded');
        setTimeout(async () => {
          try {
            const probe = await win.webContents.executeJavaScript(
              '({ conn: document.getElementById("conn-state").textContent, code: identity.code, friends: friends.length })', true);
            console.log('SMOKE: probe', JSON.stringify(probe));
          } catch (e) { console.log('SMOKE: probe failed', String(e)); }
          bail(100);
        }, 6500);
      });
      setTimeout(() => { console.log('SMOKE_TIMEOUT'); app.exit(1); }, 25000);
    }

    if (process.env.SMOKE_PEER) {
      const wc = win.webContents;
      wc.on('did-finish-load', () => console.log('E2E: page loaded as', process.env.SMOKE_PEER));
      if (process.env.SMOKE_PEER === 'A') {
        wc.on('did-finish-load', () => setTimeout(async () => {
          try {
            await new Promise(r => setTimeout(r, 3500));
            console.log('E2E-A: adding Bob + calling…');
            await wc.executeJavaScript("addFriendByCode('TESTBBBB')", true);
            await new Promise(r => setTimeout(r, 6000));
            await wc.executeJavaScript("startCall('TESTBBBB')", true);
            let ok = false;
            for (let i = 0; i < 40; i++) {
              const st2 = await wc.executeJavaScript("(function(){ return call ? (call.pcConnected ? 'up' : call.state) : 'gone'; })()", true);
              if (st2 === 'up') { ok = true; break; }
              if (st2 === 'gone' && i > 8) break;
              await new Promise(r => setTimeout(r, 1000));
            }
            console.log(ok ? 'E2E-A: CALL_CONNECTED' : 'E2E-A: CALL_FAILED');
            if (!ok) return bail(300);
            await wc.executeJavaScript("sendChat('ping-e2e')", true);
            console.log('E2E-A: chat ping sent');
            await new Promise(r => setTimeout(r, 1200));
            await wc.executeJavaScript(
              "(async () => { const cv=document.createElement('canvas'); cv.width=64; cv.height=64; const cx=cv.getContext('2d'); cx.fillStyle='#f0f'; cx.fillRect(0,0,64,64); const blob=await new Promise(r=>cv.toBlob(r,'image/png')); await sendAttachment('image', blob, 'test.png'); return 'sent'; })()", true);
            console.log('E2E-A: image sent');
            await new Promise(r => setTimeout(r, 2500));
            await wc.executeJavaScript(
              "(async () => { const u=new Uint8Array(30*1024*1024); u[5]=66; const b=new Blob([u],{type:'application/octet-stream'}); await sendAttachment('file', b, 'big.bin'); return 'sent'; })()", true);
            console.log('E2E-A: 30MB file sent');
            const src = await wc.executeJavaScript("window.aero.getScreens().then(s => s.length ? s[0].id : null)", true);
            if (src) {
              await wc.executeJavaScript(`startShare(${JSON.stringify(src)}, false)`, true);
              console.log('E2E-A: share started');
              await new Promise(r => setTimeout(r, 4000));
              await wc.executeJavaScript("stopShare()", true);
              console.log('E2E-A: share stopped');
            } else console.log('E2E-A: no screen source found');
            bail(500);
          } catch (e) { console.log('E2E-A error:', String(e)); bail(300); }
        }, 500));
        setTimeout(() => { console.log('E2E_TIMEOUT'); app.exit(1); }, 90000);
      } else {
        wc.on('did-finish-load', () => setTimeout(async () => {
          try {
            const r = await wc.executeJavaScript(
              "(async () => { for (let i=0;i<120;i++) { const d=document.getElementById('dlg-incoming'); if (d && d.open) { document.getElementById('btn-accept').click(); return 'accepted'; } await new Promise(r=>setTimeout(r,500)); } return 'no-call'; })()", true);
            console.log('E2E-B:', r);
            let shared = false;
            for (let i = 0; i < 30; i++) {
              const s = await wc.executeJavaScript("(function(){ const v=document.getElementById('share-video'); return !!(v && v.srcObject && v.srcObject.getVideoTracks().length && !v.srcObject.getVideoTracks()[0].muted); })()", true);
              if (s) { shared = true; break; }
              await new Promise(r => setTimeout(r, 1000));
            }
            console.log(shared ? 'E2E-B: SHARE_LIVE' : 'E2E-B: SHARE_NOT_SEEN');
            const chatOk = await wc.executeJavaScript("(function(){ const c=(chats['TESTAAAA']||[]).find(e=>!e.me&&e.text==='ping-e2e'); return c ? 'chat-ok' : 'chat-missing'; })()", true);
            console.log('E2E-B:', chatOk);
            let fileOk = false;
            for (let i = 0; i < 15; i++) {
              const r = await wc.executeJavaScript("(function(){ const c=(chats['TESTAAAA']||[]).find(e=>e.kind==='image'&&e.name==='test.png'); return !!(c && !c.xfer && c.size>0); })()", true);
              if (r) { fileOk = true; break; }
              await new Promise(r2 => setTimeout(r2, 1000));
            }
            console.log(fileOk ? 'E2E-B: FILE_OK' : 'E2E-B: FILE_MISSING');
            let bigOk = false;
            for (let i = 0; i < 60; i++) {
              const r = await wc.executeJavaScript("(function(){ const c=(chats['TESTAAAA']||[]).find(e=>e.name==='big.bin'); return !!(c && c.diskPath && !c.xfer); })()", true);
              if (r) { bigOk = true; break; }
              await new Promise(r2 => setTimeout(r2, 1000));
            }
            console.log(bigOk ? 'E2E-B: BIGFILE_DISK_OK' : 'E2E-B: BIGFILE_FAILED');
            for (let i = 0; i < 20; i++) {
              const gone = await wc.executeJavaScript("(function(){ const v=document.getElementById('share-video'); return !(v && v.srcObject); })()", true);
              if (gone) { console.log('E2E-B: SHARE_CLEARED'); break; }
              await new Promise(r => setTimeout(r, 1000));
            }
          } catch (e) { console.log('E2E-B error:', String(e)); }
        }, 500));
        setTimeout(() => { console.log('E2E-B done'); app.exit(0); }, 85000);
      }
    }
  }
}

ipcMain.handle('win:minimize', () => win.minimize());
ipcMain.handle('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.handle('win:close', () => win.close());
/* ---- bundled soundboard pack: procedurally synthesized, generated once ---- */
function synthSamples() {
  const SR = 44100;
  const saw = (p) => 2 * (p - Math.floor(p + 0.5));
  const env = (t, dur, a = 0.01) => {
    if (t < a) return t / a;
    return Math.pow(1 - (t - a) / Math.max(0.001, dur - a), 1.6);
  };
  const defs = {
    'airhorn.wav': () => {
      const dur = 1.3; const buf = new Float32Array(SR * dur);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 7 * t);
        let s = saw(439 * vib * t) + saw(415 * vib * t) + saw(349 * vib * t);
        buf[i] = 0.27 * s * env(t, dur, 0.02);
      }
      return buf;
    },
    'drum-hit.wav': () => {
      const dur = 0.3; const buf = new Float32Array(SR * dur);
      let ph = 0;
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        const f = 45 + 115 * Math.exp(-t * 30);
        ph += f / SR;
        buf[i] = (Math.sin(2 * Math.PI * ph) * 0.9 + (Math.random() * 2 - 1) * 0.12 * Math.exp(-t * 90)) * env(t, dur, 0.002);
      }
      return buf;
    },
    'snare.wav': () => {
      const dur = 0.22; const buf = new Float32Array(SR * dur);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        buf[i] = ((Math.random() * 2 - 1) * 0.75 + Math.sin(2 * Math.PI * 185 * t) * 0.3) * Math.exp(-t * 26);
      }
      return buf;
    },
    'laser.wav': () => {
      const dur = 0.4; const buf = new Float32Array(SR * dur);
      let ph = 0;
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        const f = 200 + 1700 * Math.exp(-t * 9);
        ph += f / SR;
        buf[i] = saw(ph) * 0.4 * env(t, dur, 0.005);
      }
      return buf;
    },
    'explosion.wav': () => {
      const dur = 1.0; const buf = new Float32Array(SR * dur);
      let last = 0;
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03;
        buf[i] = last * 4 * Math.exp(-t * 4.5);
      }
      return buf;
    },
    'coin.wav': () => {
      const dur = 0.35; const buf = new Float32Array(SR * dur);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        const f = t < 0.09 ? 988 : 1319;
        buf[i] = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.16 * Math.exp(-((t % 0.09) === t ? t : t - 0.09) * 8);
      }
      return buf;
    },
    'boop.wav': () => {
      const dur = 0.14; const buf = new Float32Array(SR * dur);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        buf[i] = Math.sin(2 * Math.PI * 620 * t) * 0.5 * env(t, dur, 0.005);
      }
      return buf;
    },
    'buzzer.wav': () => {
      const dur = 0.6; const buf = new Float32Array(SR * dur);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        buf[i] = (Math.sign(Math.sin(2 * Math.PI * 110 * t)) * 0.5 + Math.sign(Math.sin(2 * Math.PI * 117 * t)) * 0.5) * 0.4 * env(t, dur, 0.01);
      }
      return buf;
    },
    'trombone.wav': () => {
      const dur = 1.2; const buf = new Float32Array(SR * dur);
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        const seg = Math.min(2, Math.floor(t / 0.36));
        const f = [233, 208, 185][seg];
        const lt = t - seg * 0.36;
        const vib = 1 + 0.02 * Math.sin(2 * Math.PI * 6 * lt);
        buf[i] = saw(f * vib * t) * 0.3 * env(t, dur, 0.05);
      }
      return buf;
    },
    'tada.wav': () => {
      const dur = 0.9; const buf = new Float32Array(SR * dur);
      const notes = [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.33]];
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR; let s = 0;
        for (const [f, st] of notes) {
          if (t >= st) s += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) * 3.5);
        }
        buf[i] = 0.3 * s;
      }
      return buf;
    }
  };
  return { SR, defs };
}

function floatToWav(samples, sr) {
  const n = samples.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return out;
}

function ensureBundledSounds() {
  try {
    const dir = soundsDir();
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.readdirSync(dir).filter(f => f.endsWith('.wav'));
    if (existing.length > 0) return;
    const { SR, defs } = synthSamples();
    for (const [name, gen] of Object.entries(defs)) {
      fs.writeFileSync(path.join(dir, name), floatToWav(gen(), SR));
    }
    console.log('bundled soundboard pack generated (' + Object.keys(defs).length + ' clips)');
  } catch (e) { console.log('bundled sounds skipped: ' + String(e)); }
}

ipcMain.handle('win:focus', () => showMainWindow());
ipcMain.handle('win:flash', (_e, on) => { try { win.flashFrame(!!on); } catch {} return true; });

ipcMain.handle('win:title-menu', () => {
  if (!win || win.isDestroyed()) return false;
  Menu.buildFromTemplate([
    { label: 'Restore', visible: win.isMaximized(), click: () => win.unmaximize() },
    { label: 'Maximize', visible: !win.isMaximized(), enabled: win.isMaximizable(), click: () => win.maximize() },
    { label: 'Minimize', click: () => win.minimize() },
    { type: 'separator' },
    { label: 'Hide to tray', click: () => win.hide() },
    { label: 'Quit GoonCall', click: () => { forceQuit = true; app.quit(); } }
  ]).popup({ window: win });
  return true;
});

/* native clipboard — immune to focus quirks that break navigator.clipboard */
ipcMain.handle('clip:write', (_e, text) => {
  try { clipboard.writeText(String(text == null ? '' : text)); return true; }
  catch { return false; }
});

/* ---- real update check via GitHub releases (electron-updater) ---- */
const UPDATE_REPO = { owner: 'demon-of-fire', repo: 'gooncall' };
let updater = null;
try {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  updater = autoUpdater;
} catch (e) {
  console.log('electron-updater not available, update checks disabled');
}

let updaterBusy = false;
ipcMain.handle('updater:check', () => new Promise((resolve) => {
  if (!updater) return resolve({ status: 'disabled', message: 'Updater unavailable in this build.' });
  if (updaterBusy) return resolve({ status: 'busy', message: 'Already checking…' });
  updaterBusy = true;
  let settled = false;
  const done = (r) => { if (!settled) { settled = true; updaterBusy = false; resolve(r); } };
  const timer = setTimeout(() => done({ status: 'error', message: 'Check timed out.' }), 30000);

  updater.once('checking-for-update', () => {});
  updater.once('update-available', (info) => {
    clearTimeout(timer);
    done({ status: 'available', message: 'Downloading v' + info.version + ' — installs when you quit, or click again to install now.', version: info.version });
  });
  updater.once('update-not-available', (info) => {
    clearTimeout(timer);
    done({ status: 'latest', message: 'You are on the latest version (v' + (info.version || app.getVersion()) + ').' });
  });
  updater.once('update-downloaded', (info) => {
    clearTimeout(timer);
    done({ status: 'downloaded', message: 'v' + info.version + ' downloaded. Click "Install now" to apply and restart.', version: info.version });
  });
  updater.once('error', (err) => {
    clearTimeout(timer);
    const msg = String(err && err.message || err);
    done({
      status: 'error',
      message: msg.includes('ENOTFOUND') || msg.includes('net::')
        ? "Couldn't reach GitHub — check your internet."
        : msg.includes('404') || msg.toLowerCase().includes('release')
          ? 'No published releases found yet.'
          : msg
    });
  });

  try {
    updater.setFeedURL({ provider: 'github', owner: UPDATE_REPO.owner, repo: UPDATE_REPO.repo });
    updater.checkForUpdates();
  } catch (err) {
    clearTimeout(timer);
    done({ status: 'error', message: String(err) });
  }
}));

ipcMain.handle('updater:install', () => {
  if (updater) { try { updater.quitAndInstall(); } catch {} }
  return true;
});

ipcMain.handle('data:get', (_e, name) => readData(name, null));
ipcMain.handle('data:set', (_e, name, value) => writeData(name, value));

ipcMain.handle('screens:list', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 360, height: 200 }
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumb: s.thumbnail.toDataURL()
  }));
});

ipcMain.handle('notify', (_e, title, body, code) => {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: String(title || 'GoonCall'), body: String(body || ''), silent: false });
      n.on('click', () => {
        showMainWindow();
        if (code && win && !win.isDestroyed()) win.webContents.send('notify-click', String(code));
      });
      n.show();
    }
  } catch {}
  return true;
});

ipcMain.handle('prefs:get', () => Object.assign({}, prefs));

ipcMain.handle('sounds:list', () => {
  try {
    return fs.readdirSync(soundsDir())
      .filter(n => /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(n))
      .map(n => ({ name: n, size: fs.statSync(path.join(soundsDir(), n)).size }));
  } catch { return []; }
});

ipcMain.handle('sounds:read', (_e, name) => {
  try {
    const safe = path.basename(String(name));
    return fs.readFileSync(path.join(soundsDir(), safe)).buffer;
  } catch { return null; }
});

ipcMain.handle('sounds:delete', (_e, name) => {
  try { fs.unlinkSync(path.join(soundsDir(), path.basename(String(name)))); return true; }
  catch { return false; }
});

ipcMain.handle('sounds:open-folder', async () => {
  try { fs.mkdirSync(soundsDir(), { recursive: true }); } catch {}
  return shell.openPath(soundsDir());
});

ipcMain.handle('sounds:pick', async () => {
  try { fs.mkdirSync(soundsDir(), { recursive: true }); } catch {}
  const r = await dialog.showOpenDialog(win, {
    title: 'Add sounds to your soundboard',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'] }]
  });
  if (r.canceled) return [];
  const copied = [];
  for (const src of r.filePaths) {
    try {
      const dst = path.join(soundsDir(), path.basename(src));
      await fs.promises.copyFile(src, dst);
      copied.push(path.basename(dst));
    } catch {}
  }
  return copied;
});

ipcMain.handle('logs:open', () => {
  try { fs.mkdirSync(dataDir(), { recursive: true }); } catch {}
  return shell.openPath(dataDir());
});

/* ---- large file transfer: receiver streams straight to disk ---- */
const receivedDir = () => path.join(app.getPath('userData'), 'received');
const xferWrites = new Map();

ipcMain.handle('xfer:begin', (_e, id, name) => {
  try {
    fs.mkdirSync(receivedDir(), { recursive: true });
    const safe = String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    let final = path.join(receivedDir(), safe);
    let i = 1;
    const ext = path.extname(safe);
    while (fs.existsSync(final)) {
      final = path.join(receivedDir(), path.basename(safe, ext) + ' (' + (i++) + ')' + ext);
    }
    xferWrites.set(String(id), { ws: fs.createWriteStream(final), final });
    return true;
  } catch { return false; }
});

ipcMain.handle('xfer:append', (_e, id, chunk) => {
  const w = xferWrites.get(String(id));
  if (!w) return false;
  return new Promise((res) => {
    try { w.ws.write(Buffer.from(chunk), () => res(true)); }
    catch { res(false); }
  });
});

ipcMain.handle('xfer:finish', (_e, id) => {
  const w = xferWrites.get(String(id));
  if (!w) return null;
  return new Promise((res) => {
    try {
      w.ws.end(() => { xferWrites.delete(String(id)); res(w.final); });
    } catch { res(null); }
  });
});

ipcMain.handle('xfer:abort', (_e, id) => {
  const w = xferWrites.get(String(id));
  if (!w) return false;
  try { w.ws.destroy(); } catch {}
  try { fs.unlinkSync(w.final); } catch {}
  xferWrites.delete(String(id));
  return true;
});

ipcMain.handle('file:show', (_e, p) => {
  if (typeof p === 'string' && p.startsWith(receivedDir())) shell.showItemInFolder(p);
  return true;
});

ipcMain.handle('files:open-received', async () => {
  try { fs.mkdirSync(receivedDir(), { recursive: true }); } catch {}
  return shell.openPath(receivedDir());
});

ipcMain.handle('shell:external', (_e, url) => {
  if (/^https:\/\//i.test(String(url))) shell.openExternal(String(url));
  return true;
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('prefs:set', (_e, key, value) => {
  if (!(key in DEFAULT_PREFS)) return prefs;
  prefs[key] = !!value;
  savePrefs();
  if (key === 'startWithWindows') applyAutostart();
  if (key === 'hotkeyMute') applyHotkey();
  if (key === 'closeToTray' && tray) {
    try { tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open GoonCall', click: showMainWindow },
      { type: 'separator' },
      { label: 'Close button minimizes to tray', type: 'checkbox', checked: !!prefs.closeToTray, click: (i) => { prefs.closeToTray = i.checked; savePrefs(); } },
      { label: 'Start with Windows', type: 'checkbox', checked: !!prefs.startWithWindows, click: (i) => { prefs.startWithWindows = i.checked; savePrefs(); applyAutostart(); } },
      { type: 'separator' },
      { label: 'Quit GoonCall', click: () => { forceQuit = true; app.quit(); } }
    ])); } catch {}
  }
  return prefs;
});

// auto-approve mic (voice-only app); screen capture uses desktopCapturer via IPC

const gotLock = (process.env.SMOKE_PEER || process.env.SMOKE_TEST) ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(['media', 'audioCapture'].includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      ['media', 'audioCapture'].includes(permission));
    loadPrefs();
    ensureBundledSounds();
    applyAutostart();
    createWindow();
    createTray();
    applyHotkey();
  });

  app.on('before-quit', () => {
    forceQuit = true;
    try { globalShortcut.unregisterAll(); } catch {}
    for (const [, w] of xferWrites) { try { w.ws.destroy(); } catch {} }
    xferWrites.clear();
  });

  app.on('window-all-closed', () => app.quit());
}
