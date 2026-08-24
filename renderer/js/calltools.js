'use strict';
/* Call tools — watch party, screen annotations, whiteboard, quick snip,
   sound-pack receive hook.
   Depends on globals from app.js: call, chatOpen, watch vars moved here,
   sharingLocal, remoteSharing, applyStage, maybeClearShareVideo, sigSend,
   sendAttachment, toast, displayName, openChat, yt helpers included below. */

/* ============ watch party ============ */
let watch = null; // {url, kind, host, playing, pos, lastSync, applying}
let ytTime = 0;

const ytId = (url) => {
  const m = /(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
};

function ytPost(func, args = []) {
  const f = document.querySelector('#watch-mount iframe');
  if (f && f.contentWindow) {
    try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch {}
  }
}

function readWatchPos() {
  if (!watch) return 0;
  if (watch.kind === 'yt') return ytTime;
  const v = document.querySelector('#watch-mount video');
  return v ? v.currentTime : 0;
}

function setWatchPlaying(play) {
  if (!watch) return;
  if (watch.kind === 'yt') { play ? ytPost('playVideo') : ytPost('pauseVideo'); }
  else { const v = document.querySelector('#watch-mount video'); if (v) { play ? v.play().catch(() => {}) : v.pause(); } }
}

function seekWatch(pos) {
  if (!watch) return;
  if (watch.kind === 'yt') ytPost('seekTo', [pos, true]);
  else { const v = document.querySelector('#watch-mount video'); if (v) v.currentTime = pos; }
}

function buildPlayer(url, kind, isHost) {
  const mount = $('watch-mount');
  mount.innerHTML = '';
  if (kind === 'yt') {
    const f = document.createElement('iframe');
    f.src = 'https://www.youtube.com/embed/' + url + '?enablejsapi=1&autoplay=1&controls=' + (isHost ? '1' : '0') + '&rel=0&modestbranding=1';
    f.allow = 'autoplay; encrypted-media; fullscreen';
    f.setAttribute('allowfullscreen', '');
    mount.appendChild(f);
  } else {
    const v = document.createElement('video');
    v.src = url;
    v.autoplay = true;
    v.controls = isHost;
    v.playsInline = true;
    mount.appendChild(v);
  }
}

function showWatchStage(on) {
  $('watch-mount').classList.toggle('hidden', !on);
  $('call-stage').classList.toggle('sharing', on || sharingLocal || remoteSharing);
  applyStage();
}

function openWatch(url) {
  if (!call) { toast('Start a call first', 'err'); return; }
  const id = ytId(url);
  const kind = id ? 'yt' : 'file';
  watch = { url: id ? id : url, kind, host: true, playing: false, pos: 0, lastSync: Date.now(), applying: false };
  buildPlayer(watch.url, kind, true);
  sigSend({ t: 'watch', k: 'open', url: url });
  $('btn-watch').classList.add('on');
  $('watch-bar').classList.add('hidden');
  $('watch-ctl').classList.remove('hidden');
  showWatchStage(true);
  toast(kind === 'yt' ? 'YouTube synced — you control playback' : 'Video synced — you control playback', 'ok');
  if (!watchIv) startWatchSync();
}

function closeWatch(localOnly = false) {
  if (!watch) return;
  watch = null;
  if (watchIv) { clearInterval(watchIv); watchIv = null; }
  $('watch-mount').innerHTML = '';
  $('btn-watch').classList.remove('on');
  $('watch-ctl').classList.add('hidden');
  $('watch-bar').classList.add('hidden');
  showWatchStage(false);
  if (!localOnly) sigSend({ t: 'watch', k: 'close' });
  window.removeEventListener('message', onWatchMessage);
}

function nextInQueue() {
  if (!watch || !watch.host || !watchQueue.length) return;
  const nxt = watchQueue.shift();
  sigSend({ t: 'watch', k: 'q', q: watchQueue });
  updateQueueBadge();
  openWatch(nxt);
}

function mirrorWatch(url) {
  const id = ytId(url);
  const kind = id ? 'yt' : 'file';
  watch = { url: id ? id : url, kind, host: false, playing: false, pos: 0, lastSync: Date.now(), applying: false };
  buildPlayer(watch.url, kind, false);
  $('btn-watch').classList.add('on');
  $('watch-bar').classList.add('hidden');
  $('watch-ctl').classList.remove('hidden');
  showWatchStage(true);
  window.addEventListener('message', onWatchMessage);
  toast('Watching together — they control playback');
  if (!watchIv) startWatchSync();
}

let watchIv = null;
let watchQueue = [];
let watchRate = 1;

function applyWatchRate() {
  if (!watch) return;
  if (watch.kind === 'yt') ytPost('setPlaybackRate', [watchRate]);
  else { const v = document.querySelector('#watch-mount video'); if (v) v.playbackRate = watchRate; }
  const sel = $('w-speed');
  if (sel && String(sel.value) !== String(watchRate)) sel.value = String(watchRate);
}

function updateQueueBadge() {
  const el = $('w-queue-n');
  if (!el) return;
  el.textContent = watchQueue.length ? '+' + watchQueue.length + ' queued' : '';
  el.classList.toggle('hidden', !watchQueue.length);
}

function hostState() {
  return { p: watch.playing ? 1 : 0, pos: readWatchPos(), r: watchRate };
}

function startWatchSync() {
  watchIv = setInterval(() => {
    if (!watch || !call) { clearInterval(watchIv); watchIv = null; return; }
    if (watch.host) {
      const s = hostState();
      sigSend({ t: 'watch', k: 'st', p: s.p, pos: s.pos, r: watchRate });
    } else {
      // drift correction against the host's last known timeline
      const elapsed = (Date.now() - watch.lastSync) / 1000;
      const expected = watch.pos + (watch.playing ? elapsed : 0);
      const cur = readWatchPos();
      if (watch.playing && Math.abs(cur - expected) > 1.8) seekWatch(expected);
    }
  }, 2000);
}

function onWatchMessage(e) {
  try {
    if (!e.origin.includes('youtube')) return;
    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d.event === 'infoDelivery' && d.info && typeof d.info.currentTime === 'number') ytTime = d.info.currentTime;
    if ((d.event === 'onStateChange' || d.event === 'infoDelivery') && watch && !watch.host && d.info) {
      const playing = d.info.playerState === 1;
      if (playing !== watch.playing && !watch.applying) setWatchPlaying(watch.playing); // guests don't get to pause
    }
  } catch {}
}

function applyWatchState(m) {
  if (!watch || watch.host) return;
  watch.applying = true;
  watch.playing = m.p === 1;
  watch.pos = Number(m.pos) || 0;
  watch.lastSync = Date.now();
  if (m.r && m.r !== watchRate) { watchRate = Number(m.r); applyWatchRate(); }
  setWatchPlaying(watch.playing);
  seekWatch(watch.pos);
  $('w-state').textContent = watch.playing ? 'synced · playing' : 'paused';
  setTimeout(() => { if (watch) watch.applying = false; }, 400);
}

/* ============ share annotations ============ */
let drawOn = false;
let drawColor = '#ff4d6a';
const DRAW_COLORS = ['#ff4d6a', '#ffd23f', '#2fd57c', '#39c5cf'];
let allStrokes = [];
let liveStroke = null;
let lastNetDot = 0;

function sizeShareCanvas() {
  const c = $('share-canvas');
  const v = $('share-video');
  if (!c || !v || !v.clientWidth) return;
  if (c.width !== v.clientWidth || c.height !== v.clientHeight) {
    c.width = v.clientWidth;
    c.height = v.clientHeight;
    redrawStrokes();
  }
}
window.addEventListener('resize', () => setTimeout(sizeShareCanvas, 60));

function ctxOf() {
  const c = $('share-canvas');
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  return x;
}

function drawStroke(x, s) {
  if (!s.pts.length) return;
  x.strokeStyle = s.c; x.lineWidth = s.w;
  x.beginPath();
  x.moveTo(s.pts[0][0] * x.canvas.width, s.pts[0][1] * x.canvas.height);
  for (let i = 1; i < s.pts.length; i++) x.lineTo(s.pts[i][0] * x.canvas.width, s.pts[i][1] * x.canvas.height);
  if (s.pts.length === 1) x.lineTo(s.pts[0][0] * x.canvas.width + 1, s.pts[0][1] * x.canvas.height + 1);
  x.stroke();
}

function redrawStrokes() {
  const x = ctxOf();
  x.clearRect(0, 0, x.canvas.width, x.canvas.height);
  for (const s of allStrokes) drawStroke(x, s);
  if (liveStroke) drawStroke(x, liveStroke);
}

function clearAnnotations(broadcast) {
  allStrokes = []; liveStroke = null;
  const c = $('share-canvas');
  if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  if (broadcast) sigSend({ t: 'draw', k: 'c' });
}

function toggleDraw() {
  if (!sharingLocal) { toast('Start sharing your screen first', 'err'); return; }
  drawOn = !drawOn;
  $('btn-draw').classList.toggle('active', drawOn);
  const c = $('share-canvas');
  c.classList.remove('hidden');
  c.classList.toggle('draw-on', drawOn);
  sizeShareCanvas();
  if (drawOn) {
    drawColor = DRAW_COLORS[(DRAW_COLORS.indexOf(drawColor) + 1) % DRAW_COLORS.length];
    toast('Draw mode ON — pen cycles colors, right-click clears', 'ok');
  }
}

function canvasPoint(e) {
  const c = $('share-canvas');
  const r = c.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}
/* ============ whiteboard (call) — dedicated canvas, independent of share ============ */
let wbOn = false;
let wbStrokes = [];
let wbLive = null;
let lastWbDot = 0;
let wbColor = '#5865f2';
const WB_COLORS = ['#5865f2', '#f23f43', '#23a55a', '#f0b232', '#ffffff'];

function sizeWbCanvas() {
  const c = $('wb-canvas');
  const st = $('call-stage');
  if (!c || !st.clientWidth) return;
  const w = Math.max(50, st.clientWidth - 48);
  const h = Math.max(50, st.clientHeight - 48);
  if (c.width !== w || c.height !== h) {
    c.width = w; c.height = h;
    redrawWb();
  }
}
window.addEventListener('resize', () => setTimeout(sizeWbCanvas, 60));

function wctx() {
  const c = $('wb-canvas');
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  return x;
}

function drawWbStroke(x, s) {
  if (!s.pts.length) return;
  x.strokeStyle = s.c; x.lineWidth = s.w;
  x.beginPath();
  x.moveTo(s.pts[0][0] * x.canvas.width, s.pts[0][1] * x.canvas.height);
  for (let i = 1; i < s.pts.length; i++) x.lineTo(s.pts[i][0] * x.canvas.width, s.pts[i][1] * x.canvas.height);
  if (s.pts.length === 1) x.lineTo(s.pts[0][0] * x.canvas.width + 1, s.pts[0][1] * x.canvas.height);
  x.stroke();
}

function redrawWb() {
  const x = wctx();
  x.clearRect(0, 0, x.canvas.width, x.canvas.height);
  for (const s of wbStrokes) drawWbStroke(x, s);
  if (wbLive) drawWbStroke(x, wbLive);
}

function toggleWhiteboard() {
  if (!call) return;
  wbOn = !wbOn;
  $('btn-wb').classList.toggle('on', wbOn);
  const c = $('wb-canvas');
  c.classList.toggle('hidden', !wbOn);
  c.classList.toggle('draw-on', wbOn);
  if (wbOn) {
    sizeWbCanvas();
    sigSend({ t: 'ctrl', k: 'wb-on' });
    wbColor = WB_COLORS[(WB_COLORS.indexOf(wbColor) + 1) % WB_COLORS.length];
    toast('Whiteboard ON — pen cycles colors, right-click clears.', 'ok');
  } else {
    sigSend({ t: 'ctrl', k: 'wb-off' });
  }
}

function clearWhiteboard(broadcast) {
  wbStrokes = []; wbLive = null;
  const c = $('wb-canvas');
  if (c && c.width) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  if (broadcast) sigSend({ t: 'wb', k: 'c' });
}

/* ============ quick screenshot ============ */
let snipTargetCode = null;
let snipImg = null;
let snipShapes = [];
let snipLive = null;
let snipTool = 'pen';
let snipColor = '#f23f43';
let snipDragging = false;

async function snipAndSend() {
  const target = chatOpen || (call && call.peerCode);
  if (!target) { toast('Open a chat or call first', 'err'); return; }
  toast('Capturing your screen.');
  try {
    const dataUrl = await window.aero.captureScreen();
    if (!dataUrl) { toast('Capture failed', 'err'); return; }
    openSnipEditor(dataUrl, target);
  } catch { toast('Screenshot failed', 'err'); }
}

function snipToolLabel(t) {
  return t === 'pen' ? '\u270F pen' : t === 'arrow' ? '\u27A4 arrow' : '\u25AD box';
}

function openSnipEditor(dataUrl, target) {
  snipTargetCode = target;
  snipShapes = []; snipLive = null;
  const img = new Image();
  img.onload = () => {
    snipImg = img;
    const c = document.getElementById('snip-canvas');
    const maxW = Math.min(1200, window.innerWidth - 120);
    const scale = Math.min(1, maxW / img.width);
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    redrawSnip();
    document.querySelectorAll('#dlg-snipedit .snip-tools button[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === snipTool);
    });
    const dlg = document.getElementById('dlg-snipedit');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  };
  img.onerror = () => toast('Could not load capture', 'err');
  img.src = dataUrl;
}

function snipCtx() {
  return document.getElementById('snip-canvas').getContext('2d');
}

function redrawSnip() {
  const c = document.getElementById('snip-canvas');
  if (!c || !snipImg) return;
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(snipImg, 0, 0, c.width, c.height);
  const shapes = snipLive ? snipShapes.concat([snipLive]) : snipShapes;
  for (const s of shapes) drawSnipShape(x, s);
}

function drawSnipShape(x, s) {
  if (s.type === 'pen') {
    if (s.pts.length < 2) return;
    x.strokeStyle = s.c; x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(s.pts[0][0] * c.width, s.pts[0][1] * c.height);
    for (let i = 1; i < s.pts.length; i++) x.lineTo(s.pts[i][0] * c.width, s.pts[i][1] * c.height);
    x.stroke();
  } else if (s.type === 'arrow') {
    const [x1, y1] = [s.a[0] * c.width, s.a[1] * c.height];
    const [x2, y2] = [s.b[0] * c.width, s.b[1] * c.height];
    x.strokeStyle = s.c; x.fillStyle = s.c; x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hl = 14;
    x.beginPath();
    x.moveTo(x2, y2);
    x.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45));
    x.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45));
    x.closePath(); x.fill();
  } else if (s.type === 'rect') {
    x.strokeStyle = s.c; x.lineWidth = 4;
    x.strokeRect(Math.min(s.a[0], s.b[0]) * c.width, Math.min(s.a[1], s.b[1]) * c.height,
      Math.abs(s.b[0] - s.a[0]) * c.width, Math.abs(s.b[1] - s.a[1]) * c.height);
  } else if (s.type === 'text') {
    x.fillStyle = s.c; x.font = 'bold 20px Segoe UI';
    x.fillText(s.text || '', s.p[0] * c.width, s.p[1] * c.height);
  }
}

function snipPos(e) {
  const c = document.getElementById('snip-canvas');
  const r = c.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}

function bindSnipEditor() {
  const c = document.getElementById('snip-canvas');
  document.querySelectorAll('#dlg-snipedit .snip-tools button[data-tool]').forEach((b) => {
    b.onclick = () => {
      snipTool = b.dataset.tool;
      document.querySelectorAll('#dlg-snipedit .snip-tools button[data-tool]').forEach((x) => x.classList.toggle('active', x.dataset.tool === snipTool));
    };
  });
  document.getElementById('snip-color').oninput = (e) => { snipColor = e.target.value; };
  document.getElementById('snip-clear').onclick = () => { snipShapes = []; snipLive = null; redrawSnip(); };

  c.addEventListener('pointerdown', (e) => {
    if (!snipTargetCode) return;
    c.setPointerCapture(e.pointerId);
    const p = snipPos(e);
    if (snipTool === 'pen') { snipLive = { type: 'pen', c: snipColor, pts: [p] }; }
    else if (snipTool === 'arrow' || snipTool === 'rect') { snipLive = { type: snipTool, c: snipColor, a: p, b: p }; }
    redrawSnip();
  });
  c.addEventListener('pointermove', (e) => {
    if (!snipLive) return;
    const p = snipPos(e);
    if (snipTool === 'pen') snipLive.pts.push(p);
    else snipLive.b = p;
    redrawSnip();
  });
  const fin = () => {
    if (!snipLive) return;
    if (snipLive.type === 'pen' && snipLive.pts.length > 1) snipShapes.push(snipLive);
    else if (snipLive.type !== 'pen') snipShapes.push(snipLive);
    snipLive = null;
    redrawSnip();
  };
  c.addEventListener('pointerup', fin);
  c.addEventListener('pointercancel', fin);

  document.getElementById('snip-send').onclick = async () => {
    const code = snipTargetCode;
    if (!code) return;
    const c2 = document.getElementById('snip-canvas');
    redrawSnip();
    const out = document.createElement('canvas');
    out.width = c2.width; out.height = c2.height;
    const ox = out.getContext('2d');
    ox.drawImage(snipImg, 0, 0, out.width, out.height);
    for (const sh of snipShapes) drawSnipShape(ox, sh);
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    closeSnipEditor();
    const prevOpen = chatOpen;
    if (chatOpen !== code) openChat(code);
    await sendAttachment('image', blob, 'snip-' + Date.now() + '.png');
    void prevOpen;
  };
  document.getElementById('snip-discard').onclick = () => { closeSnipEditor(); toast('Screenshot discarded'); };
  document.getElementById('dlg-snipedit').addEventListener('close', () => { snipTargetCode = null; snipShapes = []; snipLive = null; snipImg = null; });
}

function closeSnipEditor() {
  const d = document.getElementById('dlg-snipedit');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
}

async function snipAndSend() {
  const target = chatOpen || (call && call.peerCode);
  if (!target) { toast('Open a chat or call first', 'err'); return; }
  toast('Capturing your screen…');
  try {
    const dataUrl = await window.aero.captureScreen();
    if (!dataUrl) { toast('Capture failed', 'err'); return; }
    const blob = await (await fetch(dataUrl)).blob();
    const prevOpen = chatOpen;
    if (chatOpen !== target) openChat(target);
    await sendAttachment('image', blob, 'snip-' + Date.now() + '.png');
  } catch { toast('Screenshot failed', 'err'); }
}

/* ============ sound pack export / import ============ */
async function exportSoundPack() {
  if (!Board.files.length) { toast('No sounds to export', 'err'); return; }
  const out = { v: 1, app: 'gooncall', files: [] };
  for (const f of Board.files) {
    try {
      const ab = await window.aero.readSound(f.name);
      if (ab) out.files.push({ name: f.name, b64: u8ToB64(new Uint8Array(ab)) });
    } catch {}
  }
  const code = chatOpen || (call && call.peerCode);
  if (!code) { toast('Open a chat to send the pack', 'err'); return; }
  sendAttachment('file', new Blob([JSON.stringify(out)], { type: 'application/goonpack' }), 'board.goonpack');
}

async function importGoonPack(blob) {
  try {
    const data = JSON.parse(await blob.text());
    if (!data.files || !Array.isArray(data.files)) throw new Error('bad pack');
    let n = 0;
    for (const f of data.files.slice(0, 100)) {
      const u8 = b64ToU8(String(f.b64 || ''));
      await window.aero.saveSound(String(f.name).slice(0, 80), u8.buffer);
      n++;
    }
    Board.refresh();
    toast('Imported ' + n + ' sounds from pack', 'ok');
  } catch { toast('Not a valid .goonpack file', 'err'); }
}



document.addEventListener("DOMContentLoaded", bindSnipEditor);
