'use strict';

/* ============ tiny helpers ============ */
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = '', alert = false) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  (alert ? $('toasts-alert') : $('toasts')).appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3800);
  setTimeout(() => t.remove(), 4300);
}

const initials = (name) => String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/* ============ sounds ============ */
const Sounds = {
  ctx: null,
  ringIv: null,
  ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  blip(freqs, dur = 0.14, gain = 0.07) {
    try {
      const ctx = this.ensure();
      let t = ctx.currentTime;
      for (const f of freqs) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + dur);
        t += dur * 0.85;
      }
    } catch {}
  },
  pop() { this.blip([880], .06, .04); },
  sent() { this.blip([660], .05, .03); },
  connect() { this.blip([440, 660], .12); },
  disconnect() { this.blip([520, 340], .13); },
  mute() { this.blip([540, 370], .09, .06); },
  unmute() { this.blip([370, 540], .09, .05); },
  deafOn() { this.blip([240, 170], .11, .06); },
  deafOff() { this.blip([170, 260], .1, .05); },
  shareOn() { this.blip([660, 990], .08, .05); },
  shareOff() { this.blip([520, 392], .1, .045); },
  fxTick() { this.blip([760], .05, .04); },
  vol() { return Math.max(0, Math.min(1, ((typeof settings !== 'undefined' ? settings.ringVol : 70) || 70) / 100)); },
  ringToneFor(code) {
    const f = friendByCode(code);
    return (f && f.ring) || settings.ring || 'classic';
  },
  startRing(kind, code) {
    this.stopRing();
    const v = this.vol();
    if (kind === 'incoming') {
      if (qhActive()) { this.ringIv = setInterval(() => {}, 2500); return; }
      const f = friendByCode(code);
      const fr = f && f.ring;
      // custom ringtone from the soundboard folder
      if (fr && fr.startsWith('snd:')) {
        const name = fr.slice(4);
        const fire = () => playSoundFile(name, { localOnly: true });
        fire();
        this.ringIv = setInterval(fire, 3400);
        return;
      }
      const tone = RINGTONES[this.ringToneFor(code)] || RINGTONES.classic;
      let step = 0;
      const playStep = () => {
        if (!tone.steps.length) return;
        this.blip(tone.steps[step % tone.steps.length], tone.dur, .09 * v);
        step++;
      };
      playStep();
      this.ringIv = setInterval(playStep, tone.gap);
    } else {
      const pattern = () => this.blip([440, 480], .45, .045 * v);
      pattern();
      this.ringIv = setInterval(pattern, 3200);
    }
  },
  stopRing() { if (this.ringIv) { clearInterval(this.ringIv); this.ringIv = null; } }
};

/* ============ persistence / identity ============ */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, n => CODE_CHARS[n % CODE_CHARS.length]).join('');
};

let identity = null;
let friends = [];
let chats = {};
const unread = {};
let outbox = {};      // code -> [{id,text,ts}] messages waiting for the friend to come online
let callLog = [];     // [{code,name,dir,result,ts,dur}]
let winFocused = true;
let settings = {
  micId: '', speakerId: '',
  echo: true, noise: true, agc: true,
  ringVol: 70, notifyMsgs: true,
  status: '', ring: 'classic', gate: 0,
  sharePreset: 'balanced', accent: 'violet', amoled: false,
  qh: false, qhStart: '23:00', qhEnd: '08:00',
  boardVol: 80, boardMonitor: true, fx: 'none',
  pins: {}
};
let pendingIn = [];     // [{code,name}] incoming friend requests
let dismissedCodes = [];// codes whose requests were denied
let peerState = {};     // code -> {idle,status}

const ACCENTS = {
  violet: ['#6c7bff', '#9b5cff'],
  green: ['#2fd57c', '#39c5cf'],
  orange: ['#ff9040', '#ffb02e'],
  pink: ['#ff5c9d', '#b95cff'],
  cyan: ['#39c5cf', '#6c7bff'],
  red: ['#ff4d6a', '#ff9040']
};

const RINGTONES = {
  classic: { label: 'Classic', steps: [[659, 784], [659, 784], [587, 659]], dur: .16, gap: 2300 },
  future: { label: 'Futuristic', steps: [[523, 1046], [659, 1318], [784, 1568]], dur: .11, gap: 1600 },
  marimba: { label: 'Marimba', steps: [[784], [988], [1175], [988]], dur: .13, gap: 1900 },
  chirp: { label: 'Chirp', steps: [[1245], [1568], [1245]], dur: .07, gap: 1600 },
  off: { label: 'Silent', steps: [], dur: .1, gap: 2500 }
};

const SHARE_PRESETS = {
  fluid: { w: 1280, h: 720, fps: 30 },
  balanced: { w: 1920, h: 1080, fps: 15 },
  crisp: { w: 2560, h: 1440, fps: 10 },
  ultra: { w: 1920, h: 1080, fps: 60 }
};

const FX_ORDER = ['none', 'robot', 'phone', 'cave', 'deep'];
const FX_LABELS = { none: 'Clean', robot: 'Robot', phone: 'Telephone', cave: 'Cave', deep: 'Deep' };

function applyTheme() {
  const a = ACCENTS[settings.accent] || ACCENTS.violet;
  document.documentElement.style.setProperty('--acc', a[0]);
  document.documentElement.style.setProperty('--acc2', a[1]);
  document.body.classList.toggle('amoled', !!settings.amoled);
}

function qhActive() {
  if (!settings.qh) return false;
  const parse = (v, d) => { const p = String(v || d || '').split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
  const cur = new Date().getHours() * 60 + new Date().getMinutes();
  const s = parse(settings.qhStart, '23:00'), e = parse(settings.qhEnd, '08:00');
  return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

function canNotify() {
  return settings.notifyMsgs !== false && !winFocused && !qhActive();
}

async function loadState() {
  identity = await window.aero.getData('identity');
  if (!identity || !/^[A-Z0-9]{8}$/.test(identity.code)) {
    identity = { code: genCode(), name: 'Guest-' + Math.floor(1000 + Math.random() * 9000), hue: Math.floor(Math.random() * 360) };
    await window.aero.setData('identity', identity);
  }
  friends = (await window.aero.getData('friends')) || [];
  chats = (await window.aero.getData('chats')) || {};
  outbox = (await window.aero.getData('outbox')) || {};
  callLog = (await window.aero.getData('calllog')) || [];
  const savedUnread = (await window.aero.getData('unread')) || {};
  for (const k in savedUnread) if (friends.some(f => f.code === k)) unread[k] = savedUnread[k] | 0;
  const s = (await window.aero.getData('settings')) || {};
  settings = Object.assign(settings, s);
  pendingIn = (await window.aero.getData('pendingin')) || [];
  dismissedCodes = (await window.aero.getData('dismissed')) || [];
  drafts = (await window.aero.getData('drafts')) || {};
}
const saveIdentity = () => window.aero.setData('identity', identity);
const saveFriends = () => window.aero.setData('friends', friends);
const saveChats = () => window.aero.setData('chats', chats);
const saveOutbox = () => window.aero.setData('outbox', outbox);
const saveCallLog = () => window.aero.setData('calllog', callLog);
const saveUnread = () => window.aero.setData('unread', unread);
const saveSettingsData = () => window.aero.setData('settings', settings);
const savePendingIn = () => window.aero.setData('pendingin', pendingIn);
const saveDismissed = () => window.aero.setData('dismissed', dismissedCodes);

function setUnread(code, n) {
  if (n > 0) unread[code] = n; else delete unread[code];
  saveUnread();
  updateTitleBadge();
}

function updateTitleBadge() {
  const total = Object.values(unread).reduce((a, b) => a + b, 0);
  document.title = (total > 0 ? '(' + total + ') ' : '') + 'GoonCall — free global voice calls';
}

const friendByCode = (code) => friends.find(f => f.code === code);

function upsertFriend(code, name) {
  let f = friendByCode(code);
  const nn = String(name || '').trim().slice(0, 32) || ('Guest-' + code.slice(0, 4));
  if (!f) {
    f = { code, name: nn };
    friends.push(f);
    saveFriends(); renderFriends();
  } else if (f.name !== nn) {
    f.name = nn;
    saveFriends(); renderFriends();
    if (chatOpen === code) $('chat-peer-name').textContent = displayName(code);
    if (call && call.peerCode === code) renderCallHeader();
  }
  return f;
}

const displayName = (code) => {
  const f = friendByCode(code);
  return (f && f.nick) ? f.nick : ((f || {}).name || ('Guest-' + code.slice(0, 4)));
};

/* ============ webrtc config ============ */
const RTC_CFG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    // OpenRelay - free public TURN, no card required. Insurance for nasty NATs.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

async function getMic() {
  return navigator.mediaDevices.getUserMedia({ audio: applyMicConstraints() });
}

/* ============ networking (PeerJS) ============ */
let peer = null;
let peerOnline = false;
const conns = new Map();
const connAttempts = new Map();
const presence = new Map();

function initPeer() {
  peerOnline = false; renderConnState();
  peer = new Peer(identity.code, { config: RTC_CFG, debug: 0 });
  peer.on('open', () => { peerOnline = true; renderConnState(); sweepPresence(); });
  peer.on('connection', (conn) => trackIncoming(conn));
  peer.on('disconnected', () => {
    peerOnline = false; renderConnState();
    try { peer.reconnect(); } catch {}
  });
  peer.on('error', (err) => {
    const type = err && err.type;
    if (type === 'peer-unavailable') {
      const m = /peer\s+([A-Za-z0-9]+)/.exec(err.message || '');
      const code = m ? m[1] : null;
      presence.set(code, false); renderFriends(); renderConnState();
      return;
    }
    if (type === 'unavailable-id') {
      try { peer.destroy(); } catch {}
      identity.code = genCode();
      saveIdentity(); renderProfile();
      setTimeout(initPeer, 300);
      return;
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error') {
      peerOnline = false; renderConnState();
    }
  });
}

function ensureConn(code) {
  if (!peer || !peerOnline) return Promise.reject(new Error('offline'));
  const existing = conns.get(code);
  if (existing && existing.open) return Promise.resolve(existing);
  if (connAttempts.has(code)) return connAttempts.get(code);
  const p = new Promise((resolve, reject) => {
    let settled = false;
    let conn;
    try { conn = peer.connect(code, { reliable: true }); }
    catch (e) { settle(e); return; }
    // retire any half-dead predecessor so connections don't stack up
    const prev = conns.get(code);
    if (prev && prev !== conn && !prev.open) { try { prev.close(); } catch {} }
    conns.set(code, conn);
    conn.on('open', () => { wireConn(conn); settle(null, conn); });
    conn.on('error', (e) => settle(e || new Error('conn error')));
    conn.on('close', () => settle(new Error('closed')));
    const tm = setTimeout(() => settle(new Error('timeout')), 10000);
    function settle(err, ok) {
      if (settled) return; settled = true;
      clearTimeout(tm);
      connAttempts.delete(code);
      if (err && !ok) {
        if (conns.get(code) === conn && !conn.open) conns.delete(code);
        reject(err);
      } else resolve(conn);
    }
  });
  connAttempts.set(code, p);
  p.catch(() => {});
  return p;
}

function trackIncoming(conn) {
  if (!conn || conn.peer === identity.code) { try { conn.close(); } catch {} return; }
  const code = conn.peer;
  if (dismissedCodes.includes(code)) { try { conn.close(); } catch {} return; }
  const prev = conns.get(code);
  if (prev && prev !== conn) {
    // deterministic tie-break: lexicographic winner keeps its own connection.
    // The loser is retired SILENTLY — its close must not look like a disconnect.
    const keepNew = identity.code < code;
    if (!keepNew) { try { conn.close(); } catch {} return; }
    prev.__suppressed = true;
    try { prev.close(); } catch {}
  }
  conns.set(code, conn);
  conn.on('open', () => wireConn(conn));
}

function wireConn(conn) {
  const code = conn.peer;
  safeSend(conn, helloPayload());
  safeSend(conn, { t: 'presence', idle: isIdle, status: identity.status || '' });
  presence.set(code, true);
  renderFriends(); renderConnState();
  if (chatOpen === code) renderChatStatus();
  flushOutbox(code);
  conn.on('data', (m) => onData(conn, m));
  conn.on('close', () => {
    if (conn.__suppressed) {
      // retired deliberately during duplicate tie-break — not a real disconnect
      if (conns.get(code) === conn) conns.delete(code);
      return;
    }
    if (conns.get(code) === conn) conns.delete(code);
    const stillOpen = conns.has(code) && conns.get(code).open;
    presence.set(code, stillOpen);
    renderFriends(); renderConnState();
    if (chatOpen === code) renderChatStatus();
    if (!stillOpen && call && call.peerCode === code && call.state !== 'idle') {
      toast((displayName(code)) + ' disconnected', 'err');
      teardownCall({ back: false, result: 'failed' });
      showView('view-home');
    }
  });
}

const isOnline = (code) => !!presence.get(code);

function safeSend(conn, msg) {
  try { if (conn && conn.open) conn.send(msg); } catch (err) { console.error('SEND FAIL:', err && err.message); }
}

let isIdle = false;
let myActivity = '';
let idleTm = null;
let typingTm = null;
let typingSendTm = 0;

function currentAct() {
  if (typeof watch !== 'undefined' && watch) return '\uD83D\uDCFA Watching together';
  return myActivity || '';
}

function helloPayload() {
  return { t: 'hello', name: identity.name, hue: identity.hue, status: identity.status || '', idle: isIdle, avv: identity.avv || 0, act: currentAct() };
}

/* ---------- avatars ---------- */
function applyAvatar(el, img, hue, txt) {
  if (!el) return;
  if (img) {
    el.style.backgroundImage = 'url(' + img + ')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = txt;
  }
}

function requestAvatar(code) {
  const conn = conns.get(code);
  if (conn && conn.open) safeSend(conn, { t: 'avatar-req' });
}

function downscaleAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      const s = Math.max(128 / img.width, 128 / img.height);
      x.drawImage(img, (128 - img.width * s) / 2, (128 - img.height * s) / 2, img.width * s, img.height * s);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function broadcastPresence() {
  const msg = { t: 'presence', idle: isIdle, status: identity.status || '', act: currentAct() };
  for (const c of conns.values()) safeSend(c, msg);
}

function bumpActivity() {
  if (isIdle) {
    isIdle = false;
    broadcastPresence();
    renderConnState();
  }
  clearTimeout(idleTm);
  idleTm = setTimeout(() => {
    isIdle = true;
    broadcastPresence();
    renderFriends(); renderConnState();
  }, 5 * 60 * 1000);
}

function sendTo(code, msg) {
  const conn = conns.get(code);
  if (conn && conn.open) { safeSend(conn, msg); return true; }
  return false;
}

function sweepPresence() {
  if (!peerOnline) return;
  for (const f of friends) {
    const c = conns.get(f.code);
    if (!c || !c.open) ensureConn(f.code).catch(() => {});
  }
}

/* ============ incoming messages ============ */
async function onData(conn, raw) {
  let m = raw;
  if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return; } }
  if (!m || typeof m !== 'object') return;
  const code = conn.peer;

  switch (m.t) {
    case 'hello': {
      peerState[code] = { idle: !!m.idle, status: String(m.status || '').slice(0, 80), act: String(m.act || '').slice(0, 60) };
      const helloF = friendByCode(code);
      if (m.avv && m.avv !== (helloF && helloF.avv)) requestAvatar(code);
      const f = friendByCode(code);
      if (!f) {
        if (dismissedCodes.includes(code)) break;
        if (!pendingIn.some(p => p.code === code)) {
          pendingIn.push({ code, name: String(m.name || '').slice(0, 32) || ('Guest-' + code.slice(0, 4)) });
          savePendingIn(); renderRequests(); renderFriends();
          toast('Friend request from ' + (peerState[code] && pendingIn[pendingIn.length - 1].name));
        }
      } else {
        if (m.hue != null && f.hue !== Number(m.hue)) { f.hue = ((Number(m.hue) % 360) + 360) % 360; saveFriends(); }
        if (f.pending) {
          delete f.pending;
          saveFriends();
          toast(displayName(code) + ' added you back!', 'ok');
        }
        upsertFriend(code, m.name);
      }
      renderFriends(); renderConnState();
      if (chatOpen === code) renderChatStatus();
      break;
    }

    case 'presence': {
      peerState[code] = { idle: !!m.idle, status: String(m.status || '').slice(0, 80), act: String(m.act || '').slice(0, 60) };
      renderFriends();
      if (chatOpen === code) renderChatStatus();
      break;
    }

    case 'typing': {
      if (chatOpen !== code) break;
      const el = $('chat-typing');
      el.classList.remove('hidden');
      clearTimeout(typingTm);
      typingTm = setTimeout(() => el.classList.add('hidden'), 2500);
      break;
    }

    case 'react': {
      applyReaction(code, String(m.id || ''), String(m.emoji || '').slice(0, 8), false);
      break;
    }

    case 'delete': {
      if (applyDelete(code, String(m.id || ''))) {
        saveChats();
        if (chatOpen === code) renderChatLog(code);
      }
      break;
    }

    case 'chat': {
      const text = String(m.text || '').slice(0, 4000).trim();
      if (!text) break;
      const id = m.id ? String(m.id).slice(0, 64) : null;
      await pushChat(code, { me: false, text, ts: Number(m.ts) || Date.now(), id, replyTo: m.replyTo });
      safeSend(conn, { t: 'ack', id });
      Sounds.pop();
      const chatVisible = chatOpen === code && $('view-chat').classList.contains('active') && winFocused;
      if (chatVisible) {
        safeSend(conn, { t: 'seen', ids: id ? [id] : [] });
      } else {
        setUnread(code, (unread[code] || 0) + 1);
        renderFriends();
        if (canNotify()) {
          window.aero.notify(displayName(code), text.slice(0, 120), code);
          window.aero.flash(true);
        }
      }
      if (chatOpen === code) renderChatLog(code);
      break;
    }

    case 'seen': {
      let changed = false;
      for (const oid of (Array.isArray(m.ids) ? m.ids : [])) {
        for (const c of (chats[code] || [])) {
          if (c.id === oid && c.me && !c.seen) { c.seen = true; changed = true; }
        }
      }
      if (changed) { saveChats(); if (chatOpen === code) renderChatLog(code); }
      break;
    }

    case 'notes': {
      if (!call || call.peerCode !== code) break;
      applyRemoteNotes(String(m.text || '').slice(0, 8000));
      notes[code] = String(m.text || '');
      window.aero.setData('notes', notes);
      break;
    }

    case 'edit': {
      const eid = String(m.id || '');
      const eEntry = (chats[code] || []).find(c => c.id === eid && !c.me);
      if (eEntry && typeof m.text === 'string') {
        eEntry.text = String(m.text).slice(0, 4000);
        eEntry.edited = true;
        saveChats();
        if (chatOpen === code) renderChatLog(code);
      }
      break;
    }

    case 'avatar-req': {
      if (identity.avatar) safeSend(conn, { t: 'avatar', b64: identity.avatar, v: identity.avv || 1 });
      break;
}
    case 'avatar': {
      const b64 = String(m.b64 || '');
      const f2 = friendByCode(code);
      if (f2 && b64.length < 120000 && b64.startsWith('data:image')) {
        f2.av = b64; f2.avv = Number(m.v) || 1; saveFriends(); renderFriends(); renderProfile();
        if (chatOpen === code) { openChat(code); }
        if (call && call.peerCode === code) renderRemoteTile();
      }
      break;
    }
    case 'xfer-start': recvXferStart(conn, m); break;
    case 'xfer-chunk': recvXferChunk(conn, m); break;
    case 'xfer-end': recvXferEnd(conn, m); break;

    case 'bump': {
      if (call && call.peerCode === code) break;
      Sounds.blip([180, 240, 180], .12, .08);
      document.body.classList.add('nudged');
      setTimeout(() => document.body.classList.remove('nudged'), 500);
      toast('⚡ ' + displayName(code) + ' nudged you', '', true);
      if (canNotify()) window.aero.notify(displayName(code), 'Nudged you!', code);
      break;
    }

    case 'prank': {
      const nm = String(m.name || '');
      if (nm && /\.(wav|mp3|ogg|m4a|flac|webm)$/i.test(nm)) playSoundFile(nm, { localOnly: true });
      break;
    }

    case 'watch': {
      if (!call || call.peerCode !== code) break;
      if (m.k === 'open') mirrorWatch(String(m.url || ''));
      else if (m.k === 'close') closeWatch(true);
      else if (m.k === 'st') applyWatchState(m);
      else if (m.k === 'q') { watchQueue = Array.isArray(m.q) ? m.q.slice(0, 20) : []; updateQueueBadge(); toast('Queue updated: ' + watchQueue.length + ' up next'); }
      else if (m.k === 'rate') { watchRate = Number(m.r) || 1; applyWatchRate(); }
      break;
    }

    case 'wb': {
      if (!call || call.peerCode !== code) break;
      if (m.k === 'on') { if (!wbOn) toggleWhiteboard(); }
      else if (m.k === 'off') { if (wbOn) toggleWhiteboard(); }
      else if (m.k === 'c') clearWhiteboard(false);
      else {
        const col = String(m.c || '#5865f2');
        const w = Number(m.w) || 3;
        const x = wctx();
        if (m.k === 's' && Array.isArray(m.pts)) {
          wbStrokes.push({ c: col, w, pts: m.pts });
          drawWbStroke(x, { c: col, w, pts: m.pts });
        } else if (m.k === 'd' && Array.isArray(m.p)) {
          let cur = wbStrokes[wbStrokes.length - 1];
          if (!cur || cur.remote !== true) { cur = { c: col, w, pts: [], remote: true }; wbStrokes.push(cur); }
          cur.pts.push(m.p);
          const pts = cur.pts;
          x.strokeStyle = col; x.lineWidth = w;
          x.beginPath();
          x.moveTo(pts[pts.length - 2] ? pts[pts.length - 2][0] * x.canvas.width : m.p[0] * x.canvas.width,
                   pts[pts.length - 2] ? pts[pts.length - 2][1] * x.canvas.height : m.p[1] * x.canvas.height);
          x.lineTo(m.p[0] * x.canvas.width, m.p[1] * x.canvas.height);
          x.stroke();
        }
      }
      break;
    }

    case 'draw': {
      if (!call || call.peerCode !== code) break;
      const x = ctxOf();
      if (m.k === 'c') { clearAnnotations(false); break; }
      const col = String(m.c || '#ff4d6a');
      const w = Number(m.w) || 3;
      if (m.k === 's' && Array.isArray(m.pts)) {
        allStrokes.push({ c: col, w, pts: m.pts });
        drawStroke(x, { c: col, w, pts: m.pts });
      } else if (m.k === 'd' && Array.isArray(m.p)) {
        let cur = allStrokes[allStrokes.length - 1];
        if (!cur || cur.remote !== true) { cur = { c: col, w, pts: [], remote: true }; allStrokes.push(cur); }
        cur.pts.push(m.p);
        const pts = cur.pts;
        x.strokeStyle = col; x.lineWidth = w;
        x.beginPath();
        x.moveTo(pts[pts.length - 2] ? pts[pts.length - 2][0] * x.canvas.width : m.p[0] * x.canvas.width,
                 pts[pts.length - 2] ? pts[pts.length - 2][1] * x.canvas.height : m.p[1] * x.canvas.height);
        x.lineTo(m.p[0] * x.canvas.width, m.p[1] * x.canvas.height);
        x.stroke();
      }
      break;
    }

    case 'xfer-abort': {
      const id = String(m.id || '');
      const x = xfersIn.get(id);
      if (x) {
        if (x.disk) window.aero.xferAbort(id);
        xfersIn.delete(id);
        const idx = (chats[code] || []).findIndex(c => c.id === id);
        if (idx >= 0) { chats[code].splice(idx, 1); saveChats(); }
        if (chatOpen === code) renderChatLog(code);
        toast('Transfer cancelled by ' + displayName(code));
      }
      break;
    }

    case 'ack': {
      if (m.id) markDelivered(String(m.id), code);
      break;
    }

    case 'call-invite': handleInvite(conn, m); break;

    case 'call-accept': onCallAccepted(); break;
    case 'call-decline': {
      if (call && call.peerCode === code && (call.state === 'outgoing' || call.state === 'connecting' || call.state === 'active')) {
        toast(displayName(code) + ' declined the call');
        teardownCall({ back: true, result: 'declined' });
      }
      break;
    }
    case 'call-busy': {
      if (call && call.peerCode === code && call.state === 'outgoing') {
        toast(displayName(code) + ' is busy');
        teardownCall({ back: true, result: 'busy' });
      }
      break;
    }
    case 'call-cancel': {
      if (call && call.peerCode === code && call.state === 'incoming') {
        toast('Missed call from ' + displayName(code), '', true);
        if (!qhActive()) window.aero.notify(displayName(code), 'Missed GoonCall');
        teardownCall({ back: false, result: 'missed' });
      }
      break;
    }
    case 'call-end': {
      if (call && call.peerCode === code && call.state !== 'incoming') {
        Sounds.disconnect();
        toast(displayName(code) + ' ended the call');
        teardownCall({ back: true, result: 'completed' });
      }
      break;
    }

    case 'sdp': {
      if (call && call.peerCode === code) {
        const d = (m.type && typeof m.sdp === 'string')
          ? { type: m.type, sdp: m.sdp }
          : m.sdp;
        handleSdp(d);
      }
      break;
    }
    case 'ice': if (call && call.peerCode === code) handleIce(m.c); break;

    case 'ctrl': {
      if (!call || call.peerCode !== code) break;
      if (m.k === 'mic') { remoteMicOn = !!m.on; renderRemoteTile(); }
      else if (m.k === 'deafen') { remoteDeafened = !!m.on; renderRemoteTile(); }
      else if (m.k === 'share-start') { remoteSharing = true; applyStage(); }
      else if (m.k === 'share-stop') { remoteSharing = false; applyStage(); maybeClearShareVideo(); }
      break;
    }
  }
}

/* ============ chat ============ */
let chatOpen = null;
let replyTarget = null;
let msgSeq = 0;

function newMsgId() { return Date.now().toString(36) + '-' + (msgSeq++).toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36); }

function pushChat(code, entry) {
  if (!chats[code]) chats[code] = [];
  chats[code].push(entry);
  if (chats[code].length > 500) chats[code] = chats[code].slice(-500);
  return saveChats();
}

function flushOutbox(code) {
  const q = outbox[code];
  if (!q || !q.length) return;
  const conn = conns.get(code);
  if (!conn || !conn.open) return;
  let sentAny = false;
  for (const m of q) {
    safeSend(conn, { t: 'chat', text: m.text, ts: m.ts, id: m.id, replyTo: m.replyTo });
    const entry = (chats[code] || []).find(c => c.id === m.id);
    if (entry) entry.status = 'sent';
    scheduleDeliveredFallback(code, m.id);
    sentAny = true;
  }
  delete outbox[code];
  saveOutbox(); saveChats();
  if (sentAny && chatOpen === code) renderChatLog(code);
}

/* Delivered = the reliable ordered datachannel accepted it; transport guarantees
   arrival at their machine. Acks confirm it faster; this fallback catches the rest. */
function scheduleDeliveredFallback(code, id) {
  setTimeout(() => {
    const entry = (chats[code] || []).find(c => c.id === id);
    if (entry && entry.me && entry.status === 'sent') {
      entry.status = 'delivered';
      saveChats();
      if (chatOpen === code) renderChatLog(code);
    }
  }, 4000);
}

async function transmitChat(code, payload) {
  let conn = conns.get(code);
  if (!conn || !conn.open) {
    try { conn = await ensureConn(code); } catch { return false; }
  }
  return sendTo(code, payload);
}

function markDelivered(id, code) {
  for (const c of (chats[code] || [])) if (c.id === id && c.me && c.status !== 'delivered') { c.status = 'delivered'; saveChats(); }
  if (chatOpen === code) renderChatLog(code);
}

function openChat(code) {
  chatOpen = code;
  const f = upsertFriend(code, displayName(code));
  $('chat-peer-name').textContent = displayName(code);
  const cav = $('chat-peer-av');
  if (cav) {
    const h = (f && f.hue != null) ? f.hue : 220;
    cav.style.background = 'linear-gradient(135deg,hsl(' + h + ',62%,52%),hsl(' + ((h + 40) % 360) + ',62%,42%))';
    cav.textContent = initials(displayName(code));
  }
  renderChatStatus();
  unreadCutId = null;
  if (unread[code] > 0) {
    const items = chats[code] || [];
    const cut = Math.max(0, items.length - unread[code]);
    unreadCutId = items[cut] ? items[cut].id : null;
    sendSeenBatch(code);
  }
  searchQuery = '';
  $('chat-search').value = '';
  $('chat-search-row').classList.add('hidden');
  renderChatLog(code);
  setUnread(code, 0);
  renderFriends();
  showView('view-chat');
  $('chat-input').value = drafts[code] || '';
  $('chat-input').focus();
}

/* tell the peer we've laid eyes on their messages */
function sendSeenBatch(code) {
  const conn = conns.get(code);
  if (!conn || !conn.open) return;
  const ids = (chats[code] || []).filter(c => !c.me && c.id && !c.seen).map(c => c.id).slice(-50);
  if (ids.length) safeSend(conn, { t: 'seen', ids });
}

function renderChatStatus() {
  const el = $('chat-peer-status');
  if (!chatOpen) return;
  const on = isOnline(chatOpen);
  const st = peerState[chatOpen] || {};
  el.textContent = !on ? 'offline' : (st.idle ? 'idle' : 'online') + (st.status ? ' · ' + st.status : '');
  el.classList.toggle('online', !!on);
  el.classList.toggle('offline', !on);
}

function tickHtml(entry) {
  if (!entry.me) return '';
  const cls = entry.status === 'delivered' ? 'delivered' : entry.status === 'pending' ? 'pending' : 'sent';
  return '<span class="tick ' + cls + '" title="' + cls + '"></span>';
}

/* ---- attachments / transfers ---- */
const CHUNK = 24 * 1024;
const MAX_XFER = 4 * 1024 * 1024 * 1024;   // 4 GB
const DISK_THRESHOLD = 25 * 1024 * 1024;   // above this, stream to disk on the far end
const blobStore = new Map();
const activeSounds = new Set();
const xfersIn = new Map();
const xfersOut = new Map();                // id -> {cancelled}

const u8ToB64 = (u8) => {
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000)
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToU8 = (b64) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
const blobToDataUrl = (blob) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.readAsDataURL(blob);
});
const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B';
const fmtRate = (bps) => bps > 1048576 ? (bps / 1048576).toFixed(1) + ' MB/s' : (bps / 1024).toFixed(0) + ' KB/s';

async function sendAttachment(kind, input, name) {
  const code = chatOpen;
  if (!code || !input) return;
  const conn = conns.get(code);
  if (!conn || !conn.open) { toast(displayName(code) + ' is offline — files need both of you online', 'err'); return; }
  const size = input.size || 0;
  if (size > MAX_XFER) { toast('Files are capped at 4 GB', 'err'); return; }
  const useDisk = size > DISK_THRESHOLD;
  const id = newMsgId();
  const entry = { me: true, id, kind, name, size, mime: input.type || 'application/octet-stream', ts: Date.now(), status: 'sent', xfer: { pct: 0, rate: 0 } };
  if (useDisk) entry.disk = true;
  else if (kind === 'image' && size < 200 * 1024) {
    try { entry.dataUrl = await blobToDataUrl(input); } catch {}
  }
  pushChat(code, entry);
  renderChatLog(code);
  safeSend(conn, { t: 'xfer-start', id, name, size, mime: entry.mime, kind, disk: useDisk });
  const track = { cancelled: false };
  xfersOut.set(id, track);

  const u8 = useDisk ? null : new Uint8Array(await input.arrayBuffer());
  const total = Math.max(1, Math.ceil(size / CHUNK));
  const t0 = Date.now();
  let sentBytes = 0;
  for (let i = 0; i < total; i++) {
    if (track.cancelled) break;
    const from = i * CHUNK;
    const slice = useDisk
      ? new Uint8Array(await input.slice(from, Math.min(from + CHUNK, size)).arrayBuffer())
      : u8.subarray(from, Math.min(from + CHUNK, size));
    safeSend(conn, { t: 'xfer-chunk', id, i, d: u8ToB64(slice) });
    sentBytes += slice.length;
    if (i % 4 === 0) {
      const dt = (Date.now() - t0) / 1000 || 1;
      entry.xfer.pct = Math.round(((i + 1) / total) * 100);
      entry.xfer.rate = sentBytes / dt;
      renderChatLog(code);
    }
    await new Promise(r => setTimeout(r));
  }
  xfersOut.delete(id);

  if (track.cancelled) {
    safeSend(conn, { t: 'xfer-abort', id });
    const idx = (chats[code] || []).indexOf(entry);
    if (idx >= 0) { chats[code].splice(idx, 1); saveChats(); }
    renderChatLog(code);
    toast('Transfer cancelled');
    return;
  }

  safeSend(conn, { t: 'xfer-end', id });
  delete entry.xfer;
  if (!useDisk) blobStore.set(id, input instanceof Blob ? input : new Blob([u8]));
  saveChats();
  renderChatLog(code);
  Sounds.sent();
}

function cancelTransfer(code, id) {
  const out = xfersOut.get(id);
  if (out) { out.cancelled = true; return; }
  const inb = xfersIn.get(id);
  if (inb && inb.disk) window.aero.xferAbort(id);
  xfersIn.delete(id);
  sendTo(code, { t: 'xfer-abort', id });
}

function recvXferStart(conn, m) {
  const code = conn.peer;
  if (!m.id || (Number(m.size) || 0) > MAX_XFER) return;
  const disk = !!m.disk;
  const id = String(m.id);
  const x = {
    code,
    meta: { id, kind: m.kind || 'file', name: String(m.name || 'file'), size: Number(m.size) || 0, mime: m.mime || 'application/octet-stream', ts: Date.now() },
    chunks: [], got: 0, disk, t0: Date.now(), beginP: null
  };
  if (disk) {
    x.beginP = window.aero.xferBegin(id, x.meta.name).catch(() => false);
  }
  xfersIn.set(id, x);
  pushChat(code, { me: false, id, kind: m.kind || 'file', name: String(m.name || 'file'), size: Number(m.size) || 0, mime: m.mime || '', ts: Date.now(), disk, xfer: { pct: 0, rate: 0 } });
  if (chatOpen === code) renderChatLog(code);
}

async function recvXferChunk(conn, m) {
  const x = xfersIn.get(String(m.id));
  if (!x || typeof m.d !== 'string') return;
  try {
    const u8 = b64ToU8(m.d);
    if (x.disk) {
      if (x.beginP) { const ok = await x.beginP; x.beginP = null; if (!ok) return; }
      await window.aero.xferAppend(String(m.id), u8.buffer);
    }
    else x.chunks[Number(m.i) || 0] = u8;
    x.got += u8.length;
    const entry = (chats[x.code] || []).find(c => c.id === String(m.id));
    if (entry && entry.xfer && x.meta.size) {
      entry.xfer.pct = Math.min(99, Math.round((x.got / x.meta.size) * 100));
      const dt = (Date.now() - x.t0) / 1000 || 1;
      entry.xfer.rate = x.got / dt;
      if (chatOpen === x.code) renderChatLog(x.code);
    }
  } catch {}
}

async function recvXferEnd(conn, m) {
  const x = xfersIn.get(String(m.id));
  if (!x) return;
  xfersIn.delete(String(m.id));

  let finalPath = null;
  let packBlob = null;
  if (x.disk) {
    finalPath = await window.aero.xferFinish(String(m.id));
  } else {
    const blob = new Blob(x.chunks.filter(Boolean), { type: x.meta.mime });
    blobStore.set(x.meta.id, blob);
    if ((x.meta.name || '').endsWith('.goonpack')) packBlob = blob;
  }

  const entry = (chats[x.code] || []).find(c => c.id === x.meta.id);
  if (packBlob) {
    await importGoonPack(packBlob);
    const idx = (chats[x.code] || []).findIndex(c => c.id === x.meta.id);
    if (idx >= 0) { chats[x.code].splice(idx, 1); saveChats(); }
    if (chatOpen === x.code) renderChatLog(x.code);
    return;
  }
  if (entry) {
    delete entry.xfer;
    if (finalPath) entry.diskPath = finalPath;
    if (!finalPath && entry.kind === 'image') {
      const b = blobStore.get(x.meta.id);
      if (b && b.size < 200 * 1024) blobToDataUrl(b).then(d => { entry.dataUrl = d; saveChats(); });
    }
    saveChats();
    Sounds.pop();
    if (!(chatOpen === x.code && $('view-chat').classList.contains('active') && winFocused)) {
      setUnread(x.code, (unread[x.code] || 0) + 1);
      renderFriends();
      if (canNotify()) window.aero.notify(displayName(x.code), (x.meta.kind === 'voice' ? 'Voice message' : 'Sent a file: ' + x.meta.name), x.code);
    }
    if (chatOpen === x.code) renderChatLog(x.code);
  }
}


function startEdit(code, entry) {
  if (chatOpen !== code || !entry.me || entry.kind) return;
  pendingEditId = entry.id;
  document.getElementById('chat-input').value = entry.text || '';
  document.getElementById('chat-input').focus();
  toast('Editing - Enter to save, Esc to cancel');
}
let pendingEditId = null;

/* ---- messaging v3 state ---- */
let unreadCutId = null;
let searchQuery = '';
let drafts = {};
let notes = {};
let draftSaveTm = null;
const urlCache = new Map();   // blob -> object URL, kept alive so audio/img elements survive re-renders
const regUrl = (blob) => {
  if (!urlCache.has(blob)) urlCache.set(blob, URL.createObjectURL(blob));
  return urlCache.get(blob);
};

function hueFor(code) {
  if (code === (call && call.peerCode) || true) {}
  const f = friendByCode(code);
  return (f && f.hue != null) ? f.hue : 220;
}
function myHue() { return identity.hue != null ? identity.hue : 220; }

function renderChatLog(code, forceScroll) {
  const log = $('chat-log');
  log.innerHTML = '';
  const items = chats[code] || [];
  const q = searchQuery.trim().toLowerCase();
  const shown = q
    ? items.filter(it => String(it.text || '').toLowerCase().includes(q) || String(it.name || '').toLowerCase().includes(q))
    : items;
  const sc = $('search-count');
  if (sc) sc.textContent = q ? shown.length + ' match' + (shown.length === 1 ? '' : 'es') : '';

  if (!items.length) {
    const d = document.createElement('div');
    d.className = 'chat-empty';
    d.textContent = 'This is the beginning of your history with ' + displayName(code) + '.';
    log.appendChild(d);
    return;
  }
  if (!shown.length) {
    const d = document.createElement('div');
    d.className = 'chat-empty';
    d.textContent = 'No messages match "' + searchQuery + '"';
    log.appendChild(d);
    return;
  }

  let lastDay = '';
  let prev = null;
  let hasSeenOutgoing = false;
  for (const it of shown) {
    const d = new Date(it.ts || Date.now());
    const day = d.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      const sep = document.createElement('div');
      sep.className = 'chat-day';
      sep.textContent = dayFmtLong(d);
      log.appendChild(sep);
      prev = null;
    }
    if (it.id === unreadCutId) {
      const cut = document.createElement('div');
      cut.className = 'divider-unread';
      cut.textContent = 'New messages';
      log.appendChild(cut);
      prev = null;
    }
    const cont = prev && prev.me === it.me && Math.abs((it.ts || 0) - (prev.ts || 0)) < 300000;
    const row = document.createElement('div');
    row.className = 'msg' + (it.me ? ' me' : ' them') + (cont ? ' cont' : '');
    if (it.id) row.dataset.mid = it.id;

    const av = document.createElement('div');
    av.className = 'msg-avatar';
    const msgImg = it.me ? identity.avatar : (friendByCode(code) || {}).av;
    applyAvatar(av, msgImg, it.me ? myHue() : hueFor(code), initials(it.me ? identity.name : displayName(code)));
    row.appendChild(av);

    const main = document.createElement('div');
    main.className = 'msg-main';
    appendMsgContent(main, code, it, d, !cont);
    row.appendChild(main);
    log.appendChild(row);
    if (it.me && it.seen) hasSeenOutgoing = true;
    prev = it;
  }
  if (hasSeenOutgoing) {
    const s = document.createElement('div');
    s.className = 'seen-label';
    s.textContent = 'Seen';
    log.appendChild(s);
  }
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 180;
  if (nearBottom || forceScroll || q) log.scrollTop = log.scrollHeight;
}

function dayFmtLong(d) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}
function appendMsgContent(main, code, it, d, showMeta) {
  if (it.deleted) {
    const del = document.createElement('div');
    del.className = 'deleted-msg';
    del.textContent = 'message deleted';
    main.appendChild(del);
    if (it.me) {
      const b = document.createElement('div');
      b.insertAdjacentHTML('beforeend', tickHtml(it));
      main.appendChild(b);
    }
    return;
  }

  if (showMeta !== false) {
    if (it.replyTo && it.replyTo.text) {
      const q = document.createElement('div');
      q.className = 'quote';
      const qb = document.createElement('b');
      qb.textContent = it.replyTo.name + ': ';
      q.appendChild(qb);
      q.appendChild(document.createTextNode(String(it.replyTo.text).slice(0, 90)));
      main.appendChild(q);
    }
    const head = document.createElement('div');
    head.className = 'msg-head';
    const author = document.createElement('span');
    author.className = 'msg-author';
    author.style.color = it.me
      ? 'hsl(' + myHue() + ',70%,72%)'
      : 'hsl(' + hueFor(code) + ',70%,72%)';
    author.textContent = it.me ? identity.name : displayName(code);
    const tm = document.createElement('span');
    tm.className = 'msg-time';
    tm.title = d.toLocaleString();
    tm.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (it.edited ? ' \u00b7 edited' : '');
    head.appendChild(author); head.appendChild(tm);
    main.appendChild(head);
  } else if (it.replyTo && it.replyTo.text) {
    const q = document.createElement('div');
    q.className = 'quote';
    const qb = document.createElement('b');
    qb.textContent = it.replyTo.name + ': ';
    q.appendChild(qb);
    q.appendChild(document.createTextNode(String(it.replyTo.text).slice(0, 90)));
    main.appendChild(q);
  }

  const body = document.createElement('div');
  body.className = 'msg-body';

  if (it.kind === 'image') {
    const src = blobStore.has(it.id) ? regUrl(blobStore.get(it.id)) : (it.dataUrl || null);
    if (src) {
      const img = document.createElement('img');
      img.className = 'imgmsg';
      img.src = src;
      img.alt = it.name || 'image';
      img.title = 'Click to save';
      img.onclick = () => { const a = document.createElement('a'); a.href = src; a.download = it.name || 'image.png'; a.click(); };
      body.appendChild(img);
    } else {
      body.innerHTML = '<div class="file-card"><span class="fc-ico">&#x1F5BC;</span><div class="fc-meta"><div class="fc-name">' +
        escapeHtml(it.name || 'image') + '</div><div class="fc-sub">expired - ask them to resend</div></div></div>';
    }
  } else if (it.kind === 'voice') {
    const src = blobStore.has(it.id) ? regUrl(blobStore.get(it.id)) : (it.dataUrl || null);
    if (src) {
      const wrap = document.createElement('div');
      wrap.className = 'voice-msg';
      const au = document.createElement('audio');
      au.controls = true;
      au.src = src;
      wrap.appendChild(au);
      body.appendChild(wrap);
    } else {
      body.innerHTML = '<div class="file-card"><span class="fc-ico">&#x1F3A4;</span><div class="fc-meta"><div class="fc-name">Voice message</div><div class="fc-sub">expired</div></div></div>';
    }
  } else if (it.kind === 'file') {
    const live = blobStore.has(it.id);
    const card = document.createElement('div');
    card.className = 'file-card';
    const transferring = it.xfer && it.xfer.pct < 100;
    card.innerHTML =
      '<span class="fc-ico">&#x1F4C4;</span>' +
      '<div class="fc-meta"><div class="fc-name">' + escapeHtml(it.name || 'file') + '</div>' +
      '<div class="fc-sub">' + fmtSize(it.size || 0) +
      (transferring ? ' - ' + it.xfer.pct + '% - ' + fmtRate(it.xfer.rate) : '') +
      '</div></div>';
    if (it.diskPath) {
      const b = document.createElement('button');
      b.className = 'fc-save';
      b.textContent = 'Show';
      b.onclick = () => window.aero.showFile(it.diskPath);
      card.appendChild(b);
    } else if (live) {
      const a = document.createElement('a');
      a.className = 'fc-save';
      a.textContent = 'Save';
      a.href = regUrl(blobStore.get(it.id));
      a.download = it.name || 'file';
      card.appendChild(a);
    }
    body.appendChild(card);
    if (transferring) {
      const bar = document.createElement('div');
      bar.className = 'xbar';
      const fill = document.createElement('i');
      fill.style.width = (it.xfer.pct || 0) + '%';
      bar.appendChild(fill);
      body.appendChild(bar);
      const cx = document.createElement('button');
      cx.className = 'ma-btn xcancel';
      cx.textContent = '\u2715';
      cx.title = 'Cancel transfer';
      cx.onclick = () => cancelTransfer(code, it.id);
      card.appendChild(cx);
    }
  } else {
    body.appendChild(document.createTextNode(it.text));
    body.insertAdjacentHTML('beforeend', tickHtml(it));
    if (it.xfer && it.xfer.pct < 100 && it.me) {
      const bar = document.createElement('div');
      bar.className = 'xbar';
      const fill = document.createElement('i');
      fill.style.width = (it.xfer.pct || 0) + '%';
      bar.appendChild(fill);
      body.appendChild(bar);
    }
  }
  main.appendChild(body);

  const rKeys = it.reactions ? Object.keys(it.reactions).filter(k => it.reactions[k] > 0) : [];
  if (rKeys.length) {
    const rr = document.createElement('div');
    rr.className = 'reactions';
    for (const k of rKeys) {
      const chip = document.createElement('span');
      chip.className = 'react-chip' + (it.myReacts && it.myReacts[k] ? ' mine' : '');
      chip.textContent = k + (it.reactions[k] > 1 ? ' ' + it.reactions[k] : '');
      chip.onclick = () => reactTo(code, it.id, k);
      rr.appendChild(chip);
    }
    main.appendChild(rr);
  }

  if (it.id && !(it.xfer && it.xfer.pct < 100)) {
    const bar = document.createElement('div');
    bar.className = 'msg-actions';
    for (const em of ['\uD83D\uDE02', '\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE2E']) {
      const b = document.createElement('button');
      b.className = 'ma-btn';
      b.textContent = em;
      b.onclick = () => reactTo(code, it.id, em);
      bar.appendChild(b);
    }
    const rp = document.createElement('button');
    rp.className = 'ma-btn';
    rp.innerHTML = '&#x21A9;';
    rp.title = 'Reply';
    rp.onclick = () => startReply(code, it);
    bar.appendChild(rp);
    main.appendChild(bar);
  }
}
function appendRichText(parent, text) {
  const span = document.createElement('span');
  let h = escapeHtml(String(text))
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/(https?:\/\/[^\s<"]+)/g, function (m) {
    return '<span class="msg-link" data-url="' + m + '" title="' + m + '">' + m + '</span>';
  });
  span.innerHTML = h;
  parent.appendChild(span);
}

function startReply(code, entry) {
  if (chatOpen !== code) return;
  replyTarget = { id: entry.id, name: entry.me ? identity.name : displayName(code), text: entry.text || entry.name || '' };
  $('rb-name').textContent = replyTarget.name;
  $('rb-text').textContent = String(replyTarget.text).slice(0, 60);
  $('reply-bar').classList.remove('hidden');
  $('chat-input').focus();
}

function cancelReply() {
  replyTarget = null;
  $('reply-bar').classList.add('hidden');
}

function applyReaction(code, id, emoji, mine) {
  for (const c of (chats[code] || [])) {
    if (c.id === id) {
      if (!c.reactions) c.reactions = {};
      if (!c.myReacts) c.myReacts = {};
      c.reactions[emoji] = (c.reactions[emoji] || 0) + 1;
      if (mine) c.myReacts[emoji] = true;
      saveChats();
      if (chatOpen === code) renderChatLog(code);
      return true;
    }
  }
  return false;
}

function reactTo(code, id, emoji) {
  sendTo(code, { t: 'react', id, emoji });
  if ((sharingLocal || remoteSharing || watch) && window.Fun) Fun.rain(emoji);
  applyReaction(code, id, emoji, true);
}

function applyDelete(code, id) {
  const entry = (chats[code] || []).find(c => c.id === id);
  if (!entry || entry.deleted) return false;
  entry.deleted = true;
  delete entry.text;
  delete entry.kind;
  delete entry.dataUrl;
  delete entry.diskPath;
  delete entry.reactions;
  delete entry.myReacts;
  const b = blobStore.get(id);
  if (b) { blobStore.delete(id); }
  return true;
}

function deleteMessage(code, id) {
  sendTo(code, { t: 'delete', id });
  if (applyDelete(code, id)) {
    saveChats();
    if (chatOpen === code) renderChatLog(code);
    toast('Message deleted');
  }
}

async function sendChat(text) {
  const code = chatOpen;
  if (!code || !text) return false;
  const id = newMsgId();
  let rt;
  if (replyTarget) {
    rt = { name: replyTarget.name, text: replyTarget.text, id: replyTarget.id };
    replyTarget = null;
    $('reply-bar').classList.add('hidden');
  }
  pushChat(code, { me: true, text, ts: Date.now(), id, status: 'pending', replyTo: rt });
  renderChatLog(code);
  Sounds.sent();

  const ok = await transmitChat(code, { t: 'chat', text, ts: Date.now(), id, replyTo: rt });
  const entry = (chats[code] || []).find(c => c.id === id);
  if (!entry) return true;
  if (ok) {
    entry.status = 'sent';
    scheduleDeliveredFallback(code, id);
    saveChats();
  } else {
    entry.status = 'pending';
    if (!outbox[code]) outbox[code] = [];
    if (!outbox[code].some(m => m.id === id)) outbox[code].push({ id, text, ts: entry.ts, replyTo: rt });
    if (outbox[code].length > 100) outbox[code] = outbox[code].slice(-100);
    saveOutbox(); saveChats();
    toast('Queued — will deliver the moment ' + displayName(code) + "'s machine is reachable", '');
  }
  renderChatLog(code);
  return true;
}

/* relentless retry: every 12s, try to hand queued messages over */
setInterval(async () => {
  for (const code of Object.keys(outbox)) {
    const q = outbox[code];
    if (!q || !q.length) continue;
    const ok = await transmitChat(code, { t: 'ping-check' });
    if (!ok) continue;
    for (const m of q) {
      sendTo(code, { t: 'chat', text: m.text, ts: m.ts, id: m.id, replyTo: m.replyTo });
      const entry = (chats[code] || []).find(c => c.id === m.id);
      if (entry) entry.status = 'sent';
      scheduleDeliveredFallback(code, m.id);
    }
    delete outbox[code];
    saveOutbox(); saveChats();
    if (chatOpen === code) renderChatLog(code);
  }
}, 12000);

function sendTyping() {
  if (!chatOpen) return;
  const now = Date.now();
  if (now - typingSendTm < 1500) return;
  if (isOnline(chatOpen)) { sendTo(chatOpen, { t: 'typing' }); typingSendTm = now; }
}

/* ============ voice messages ============ */
let rec = null;
let recChunks = [];
let recStream = null;

async function toggleVoiceRec() {
  const b = $('btn-voice');
  if (rec && rec.state === 'recording') { try { rec.stop(); } catch {} return; }
  if (!chatOpen) return;
  try {
    recStream = (call && call.micStream)
      ? new MediaStream(call.micStream.getAudioTracks())
      : await getMic();
  } catch { toast('Microphone unavailable', 'err'); return; }
  recChunks = [];
  try {
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    rec = new MediaRecorder(recStream, { mimeType: mime });
  } catch { toast('Recording not supported', 'err'); return; }
  rec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  rec.onstop = () => {
    b.classList.remove('rec');
    const blob = new Blob(recChunks, { type: 'audio/webm' });
    const ownedStream = !(call && call.micStream);
    rec = null;
    if (ownedStream && recStream) { recStream.getTracks().forEach(t => t.stop()); }
    recStream = null;
    if (blob.size > 1200) sendAttachment('voice', blob, 'voice-' + Date.now() + '.webm');
    else toast('Too short — nothing sent');
  };
  rec.start();
  b.classList.add('rec');
  toast('Recording… click the mic again to send', '');
}

/* ============ connection quality pill (numbers-free on purpose) ============ */
let qualIv = null;

function startQuality() {
  stopQuality();
  qualIv = setInterval(async () => {
    if (!call || !call.pc) return stopQuality();
    try {
      const rep = await call.pc.getStats();
      let rtt = null;
      rep.forEach(r => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime;
      });
      const ms = rtt != null ? Math.round(rtt * 1000) : null;
      const pill = $('btn-stats');
      pill.textContent = ms == null ? '\u2014' : ms < 80 ? 'HD' : ms < 200 ? 'OK' : 'LAG';
      pill.className = 'quality-pill' + (ms == null ? '' : ms < 80 ? ' good' : ms < 200 ? ' mid' : ' bad');
    } catch {}
  }, 3000);
}

function stopQuality() {
  if (qualIv) { clearInterval(qualIv); qualIv = null; }
  const pill = $('btn-stats');
  if (pill) { pill.textContent = '\u2014'; pill.className = 'quality-pill'; }
}
let mix = null;
let gateRAF = 0;

function buildFx(ctx, name) {
  const input = ctx.createGain();
  const nodes = [input];
  let tail;
  if (name === 'robot') {
    const ring = ctx.createGain(); ring.gain.value = 0;
    const osc = ctx.createOscillator(); osc.frequency.value = 50; osc.start();
    osc.connect(ring.gain);
    input.connect(ring); tail = ring; nodes.push(ring, osc);
  } else if (name === 'phone') {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    input.connect(hp); hp.connect(lp); tail = lp; nodes.push(hp, lp);
  } else if (name === 'cave') {
    const dry = ctx.createGain(); dry.gain.value = 0.7;
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.22;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    tail = ctx.createGain();
    input.connect(dry); dry.connect(tail);
    input.connect(dl); dl.connect(fb); fb.connect(dl);
    dl.connect(wet); wet.connect(tail);
    nodes.push(dry, dl, fb, wet, tail);
  } else if (name === 'deep') {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
    const boost = ctx.createGain(); boost.gain.value = 1.6;
    input.connect(lp); lp.connect(boost); tail = boost; nodes.push(lp, boost);
  } else {
    const g = ctx.createGain();
    input.connect(g); tail = g; nodes.push(g);
  }
  return { input, output: tail, nodes };
}

function initMixBus(micStream) {
  destroyMixBus();
  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(new MediaStream(micStream.getAudioTracks()));
    const fx = buildFx(ctx, settings.fx || 'none');
    const gateGain = ctx.createGain();
    const micGain = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    src.connect(fx.input);
    fx.output.connect(gateGain);
    gateGain.connect(micGain);
    micGain.connect(dest);
    mix = {
      ctx, src, fx, gateGain, micGain, dest,
      boardGain: (() => { const b = ctx.createGain(); b.gain.value = 1; b.connect(dest); return b; })()
    };
    for (const t of micStream.getAudioTracks()) { try { t.contentHint = 'speech'; } catch {} }
    startGateLoop(fx.output);
    return true;
  } catch (err) {
    console.error('MIX BUS FAIL:', err && err.message);
    mix = null;
    return false;
  }
}

function destroyMixBus() {
  if (gateRAF) { cancelAnimationFrame(gateRAF); gateRAF = 0; }
  if (mix) {
    try { mix.src.disconnect(); } catch {}
    for (const n of (mix.fx.nodes || [])) { try { n.disconnect && n.disconnect(); } catch {} }
    try { mix.gateGain.disconnect(); } catch {}
    try { mix.micGain.disconnect(); } catch {}
    try { mix.boardGain.disconnect(); } catch {}
    try { mix.ctx.close(); } catch {}
    mix = null;
  }
}

function setFx(name) {
  settings.fx = name;
  saveSettingsData();
  $('fx-label').textContent = FX_LABELS[name] || 'Clean';
  $('btn-fx').classList.toggle('active', name !== 'none');
  if (mix) {
    try { mix.src.disconnect(); } catch {}
    for (const n of (mix.fx.nodes || [])) { try { n.disconnect && n.disconnect(); } catch {} }
    const fx = buildFx(mix.ctx, name);
    mix.fx = fx;
    mix.src.connect(fx.input);
    fx.output.connect(mix.gateGain);
    startGateLoop(fx.output);
  }
}

/* Adaptive gate: learns ambient noise floor, opens on dynamic ratio with hysteresis.
   settings.gate acts as aggressiveness 0-100 -> ratio 1.5x .. 4.5x the floor. */
function startGateLoop(tapNode) {
  if (gateRAF) cancelAnimationFrame(gateRAF);
  if (!mix) return;
  const ctx = mix.ctx;
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  tapNode.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let noiseFloor = 0.004;
  let isOpen = false;

  const loop = () => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    const g = Number(settings.gate) || 0;

    if (g <= 0) {
      mix.gateGain.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
      noiseFloor = noiseFloor * 0.995 + rms * 0.005;
      gateRAF = requestAnimationFrame(loop);
      return;
    }

    const ratio = 1.5 + (g / 100) * 3;
    // track floor only while quiet-ish, so speech never raises it
    if (!isOpen && rms < noiseFloor * 1.35) {
      noiseFloor = Math.max(0.0008, noiseFloor * 0.97 + rms * 0.03);
    }
    noiseFloor = Math.min(noiseFloor, 0.05);

    const openThresh = noiseFloor * ratio;
    const closeThresh = noiseFloor * Math.max(1.15, ratio - 1);

    if (!isOpen && rms > openThresh) isOpen = true;
    else if (isOpen && rms < closeThresh) isOpen = false;

    mix.gateGain.gain.setTargetAtTime(isOpen ? 1 : 0, ctx.currentTime, isOpen ? 0.008 : 0.22);
    gateRAF = requestAnimationFrame(loop);
  };
  loop();
}

function duckMic(on) {
  if (!mix) return;
  mix.micGain.gain.setTargetAtTime(on ? 0.22 : 1, mix.ctx.currentTime, on ? 0.01 : 0.3);
}

function stopAllSounds() {
  for (const s of activeSounds) { try { s.stop(); } catch {} }
  activeSounds.clear();
  duckMic(false);
  toast('All sounds stopped');
}

async function playSoundFile(name, opts = {}) {
  let raw;
  try { raw = await window.aero.readSound(name); } catch { return 'missing'; }
  if (!raw) return 'missing';
  const ctx = mix ? mix.ctx : new AudioContext();
  let routed = 'local';
  try {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const buf = await ctx.decodeAudioData(raw.slice(0));
    const srcN = ctx.createBufferSource();
    srcN.buffer = buf;
    activeSounds.add(srcN);
    srcN.onended = () => activeSounds.delete(srcN);
    const g = ctx.createGain();
    g.gain.value = Math.max(0, (Number(settings.boardVol) || 80) / 100) * 1.4;
    srcN.connect(g);
    if (mix && !opts.localOnly) {
      g.connect(mix.dest);
      routed = 'call';
      if (settings.boardMonitor) {
        const m = ctx.createGain(); m.gain.value = .9;
        g.connect(m); m.connect(ctx.destination);
      }
      duckMic(true);
      srcN.onended = () => { activeSounds.delete(srcN); duckMic(false); };
    } else {
      g.connect(ctx.destination);
      routed = opts.localOnly ? 'their-side' : 'local';
    }
    srcN.start();
    return routed;
  } catch {
    toast('Could not play ' + name, 'err');
    return 'error';
  }
}

let boardRec = null;

async function openScreenPicker() {
  let sources = [];
  try { sources = await window.aero.getScreens(); } catch { toast('Cannot list screens', 'err'); return; }
  if (!sources.length) { toast('No screens found', 'err'); return; }
  const bd = document.createElement('div');
  bd.id = 'picker-backdrop';
  const picker = document.createElement('div');
  picker.id = 'screen-picker';
  picker.innerHTML =
    '<div class="modal-head">Share a screen or window <button class="pick-close">&#x2715;</button></div>' +
    '<div class="picker-grid"></div>' +
    '<div class="picker-foot"><label class="pick-audio"><input type="checkbox" id="pick-sysaudio" checked /> Include system audio</label>' +
    '<button class="pick-cancel ghost-btn">Cancel</button></div>';
  const grid = picker.querySelector('.picker-grid');
  for (const s of sources) {
    const item = document.createElement('button');
    item.className = 'pick-item';
    item.innerHTML = '<img src="' + s.thumb + '" /><div class="pick-name">' + escapeHtml(s.name) + '</div>';
    item.onclick = () => {
      bd.remove();
      startShare(s.id, picker.querySelector('#pick-sysaudio').checked)
        .catch(() => toast('Could not start sharing', 'err'));
    };
    grid.appendChild(item);
  }
  bd.appendChild(picker);
  document.body.appendChild(bd);
  picker.querySelector('.pick-close').onclick = () => bd.remove();
  picker.querySelector('.pick-cancel').onclick = () => bd.remove();
  bd.addEventListener('click', (e) => { if (e.target === bd) bd.remove(); });
}

/* ============ views / profile / friends ============ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(name).classList.add('active');
  updateBanner();
  if (name === 'view-call' && call && call.connectedTs) startTimer();
}

function updateBanner() {
  const banner = $('in-call-banner');
  const active = call && (call.state === 'active' || call.state === 'connecting' || call.state === 'outgoing');
  const visible = active && $('view-chat').classList.contains('active');
  banner.classList.toggle('hidden', !visible);
  if (visible) $('banner-peer').textContent = displayName(call.peerCode);
}

function renderProfile() {
  $('prof-name').textContent = identity.name;
  $('prof-code').textContent = identity.code;
  const av = $('avatar');
  applyAvatar(av, identity.avatar, identity.hue, initials(identity.name));
  const rail = $('rail-avatar');
  if (rail) {
    rail.style.backgroundImage = identity.avatar ? 'url(' + identity.avatar + ')' : '';
    rail.style.backgroundSize = 'cover';
    rail.textContent = identity.avatar ? '' : initials(identity.name);
  }
  const home = $('home-code');
  if (home) home.textContent = identity.code;
  renderConnState();
}

function renderConnState() {
  const dot = $('rail-dot');
  if (dot) dot.classList.toggle('online', peerOnline);
  const up = $('up-dot');
  if (up) up.classList.toggle('online', peerOnline && !isIdle);
}

function friendRow(f) {
  const st = peerState[f.code] || {};
  const on = isOnline(f.code);
  const li = document.createElement('li');
  li.className = 'friend-item';
  li.dataset.code = f.code;
  if (f.note) li.dataset.note = f.note;
  li.title = (f.note ? f.note + '\n' : '') + '#' + f.code;

  const hue = (f.hue != null) ? f.hue : 220;
  const av = document.createElement('div');
  av.className = 'friend-avatar ' + (!on ? '' : (st.idle ? 'dot-idle' : 'dot-online'));
  applyAvatar(av, f.av, hue, initials(f.nick || f.name));

  const meta = document.createElement('div');
  meta.className = 'friend-meta';
  const nm = document.createElement('span');
  nm.className = 'friend-name';
  nm.textContent = (f.pending ? '[pending] ' : '') + (f.nick || f.name);
  const sub = document.createElement('span');
  sub.className = 'friend-sub';
  sub.textContent = !on
    ? '#' + f.code
    : (st.act || (st.idle ? 'Idle' : '') + (st.status ? ((st.idle ? ' · ' : '') + st.status) : '')) || '#' + f.code;
  meta.appendChild(nm); meta.appendChild(sub);

  li.appendChild(av); li.appendChild(meta);

  const badge = document.createElement('span');
  badge.className = 'friend-badge' + (unread[f.code] ? '' : ' hidden');
  badge.textContent = unread[f.code] || '';
  li.appendChild(badge);

  const callBtn = document.createElement('button');
  callBtn.className = 'friend-action friend-call';
  callBtn.title = 'Call ' + (f.nick || f.name);
  callBtn.innerHTML = '&#128222;';
  callBtn.onclick = (e) => { e.stopPropagation(); startCall(f.code); };

  const delBtn = document.createElement('button');
  delBtn.className = 'friend-action friend-remove';
  delBtn.title = 'Remove ' + (f.nick || f.name);
  delBtn.innerHTML = '&#x2715;';
  delBtn.onclick = (e) => { e.stopPropagation(); removeFriend(f.code); };

  li.appendChild(callBtn); li.appendChild(delBtn);
  li.onclick = () => openChat(f.code);
  return li;
}

function renderFriends() {
  const list = $('friends-list');
  const chip = $('acq-count');
  if (chip) chip.textContent = friends.length ? String(friends.length) : '';
  list.innerHTML = '';
  if (!friends.length) {
    const empty = document.createElement('li');
    empty.className = 'friends-empty';
    empty.innerHTML = 'No acquaintances yet.<br>Hit the <b>+</b> on the rail and paste their code.';
    list.appendChild(empty);
    return;
  }
  const filter = ($('friend-filter').value || '').trim().toLowerCase();
  let sorted = [...friends].sort((a, b) => (a.nick || a.name).localeCompare(b.nick || b.name));
  if (filter) sorted = sorted.filter(f => ((f.nick || f.name) + ' ' + f.code + ' ' + (f.note || '')).toLowerCase().includes(filter));
  if (!sorted.length) {
    const none = document.createElement('li');
    none.className = 'friends-empty';
    none.textContent = 'No matches.';
    list.appendChild(none);
    return;
  }
  const mkGroup = (label, arr) => {
    if (!arr.length) return;
    const h = document.createElement('div');
    h.className = 'group-label';
    h.textContent = label + ' — ' + arr.length;
    list.appendChild(h);
    for (const f of arr) list.appendChild(friendRow(f));
  };
  mkGroup('Online', sorted.filter(f => isOnline(f.code)));
  mkGroup('Offline', sorted.filter(f => !isOnline(f.code)));
}

function removeFriend(code) {
  const f = friendByCode(code);
  friends = friends.filter(x => x.code !== code);
  delete chats[code];
  delete outbox[code];
  setUnread(code, 0);
  saveFriends(); saveChats(); saveOutbox();
  const c = conns.get(code);
  if (c) { try { c.close(); } catch {} conns.delete(code); }
  if (chatOpen === code) { chatOpen = null; showView('view-home'); }
  renderFriends(); renderRecent();
  toast('Removed ' + (f ? (f.nick || f.name) : 'friend'));
}

function addFriendByCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(code)) { toast('Codes are 8 letters/digits', 'err'); return false; }
  if (code === identity.code) { toast("That's your own code", 'err'); return false; }
  const existing = friendByCode(code);
  if (existing && !existing.pending) { toast('Already on your list', ''); return false; }
  if (existing) { toast('Request already sent — waiting for them', ''); return false; }
  upsertFriend(code, 'Friend-' + code.slice(0, 4));
  friendByCode(code).pending = true;
  saveFriends(); renderFriends();
  toast('Request sent — you can chat once they add you back', 'ok');
  ensureConn(code).catch(() => {});
  openChat(code);
  return true;
}

function cycleFx() {
  if (!call) return;
  const idx = FX_ORDER.indexOf(settings.fx || 'none');
  const next = FX_ORDER[(idx + 1) % FX_ORDER.length];
  setFx(next);
  Sounds.fxTick();
}
let call = null;
let remoteMicOn = true;
let remoteSharing = false;
let sharingLocal = false;
let deafened = false;
let remoteDeafened = false;
let timerIv = null;
let speakingIv = null;
let speakCtx = null;

function sigSend(msg) {
  if (!call) return false;
  return sendTo(call.peerCode, msg);
}

function startCall(code) {
  if (call && call.state !== 'idle') { toast('Already in a call', 'err'); return; }

  getMic().then((micStream) => {
    call = {
      state: 'outgoing',
      role: 'caller',
      polite: false,
      peerCode: code,
      pc: null,
      micStream,
      remoteStream: null,
      shareStream: null,
      shareSenders: [],
      attached: false,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      pendingIce: [],
      connectedTs: 0
    };
    remoteMicOn = true; remoteSharing = false; sharingLocal = false; deafened = false;
    call.meta = { dir: 'out', result: null };
    call.startedAt = Date.now();
    renderCallHeader();
    renderLocalTile();
    renderRemoteTile();
    resetCallButtons();
    $('call-status').textContent = 'Ringing…';
    $('call-timer').textContent = '';
    showView('view-call');
    console.log('SC E');
    console.log('SC E');
    Sounds.startRing('outgoing');
    call.ringTimeout = setTimeout(() => {
      if (call && call.state === 'outgoing') {
        sigSend({ t: 'call-cancel' });
        toast('No answer from ' + displayName(code));
        teardownCall({ back: true, result: 'no-answer' });
      }
    }, 45000);

    const dial = async () => {
      for (const wait of [0, 4000, 5000]) {
        if (wait) await new Promise(r => setTimeout(r, wait));
        if (!call || call.peerCode !== code || call.state === 'idle') return null;
        try { return await ensureConn(code); } catch {}
      }
      return null;
    };
    dial().then((conn) => {
      if (!call || call.peerCode !== code || call.state === 'idle') return;
      if (!conn || !conn.open) {
        Sounds.stopRing();
        clearTimeout(call.ringTimeout);
        toast(displayName(code) + ' is offline', 'err');
        teardownCall({ back: true, result: 'failed' });
        return;
      }
      // send on the exact verified-open conn the dialer returned (immune to map swaps)
      const fire = (attempt) => {
        if (!call || call.peerCode !== code) return;
        if (conn.open) {
          safeSend(conn, { t: 'call-invite', name: identity.name });
          return;
        }
        if (attempt < 3) setTimeout(() => fire(attempt + 1), 800);
        else {
          Sounds.stopRing();
          clearTimeout(call.ringTimeout);
          toast('Could not reach ' + displayName(code), 'err');
          teardownCall({ back: true, result: 'failed' });
        }
      };
      fire(0);
    });
  }).catch((err) => {
    console.error('MIC FAIL:', err && err.name, '-', err && err.message);
    toast('Microphone access denied', 'err');
    teardownCall({ back: false });
  });
}

function handleInvite(conn, m) {
  const code = conn.peer;
  const f = friendByCode(code);
  const knownEnough = (f && !dismissedCodes.includes(code)) || pendingIn.some(p => p.code === code);
  if (!knownEnough) {
    safeSend(conn, { t: 'call-decline' });
    return;
  }
  if (call && call.state !== 'idle') {
    safeSend(conn, { t: 'call-busy' });
    return;
  }
  upsertFriend(code, m.name);
  call = {
    state: 'incoming',
    role: 'callee',
    polite: true,
    peerCode: code,
    pc: null,
    micStream: null,
    remoteStream: null,
    shareStream: null,
    shareSenders: [],
    attached: false,
    makingOffer: false,
    ignoreOffer: false,
    isSettingRemoteAnswerPending: false,
    pendingIce: []
  };
  remoteMicOn = true; remoteSharing = false; sharingLocal = false; deafened = false;
  $('inc-avatar').textContent = initials(displayName(code));
  applyAvatar($('inc-avatar'), (friendByCode(code) || {}).av, hueFor(code), initials(displayName(code)));
  $('inc-from').textContent = displayName(code) + ' wants to talk';
  const dlg = $('dlg-incoming');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  Sounds.startRing('incoming', code);
}

function acceptIncoming() {
  if (!call || call.state !== 'incoming') return;
  const code = call.peerCode;
  Sounds.stopRing();
  closeIncomingDialog();

  getMic().then((micStream) => {
    if (!call || call.peerCode !== code || call.state !== 'incoming') {
      micStream.getTracks().forEach(t => t.stop());
      return;
    }
    call.micStream = micStream;
    sigSend({ t: 'call-accept' });
    call.state = 'connecting';
    call.meta = { dir: 'in', result: null };
    call.startedAt = Date.now();
    buildPC();
    renderCallHeader(); renderLocalTile(); renderRemoteTile();
    $('call-status').textContent = 'Connecting…';
    $('call-timer').textContent = '';
    resetCallButtons();
    showView('view-call');
    call.answerTimeout = setTimeout(() => {
      if (call && call.state === 'connecting' && !call.pcConnected) {
        toast('Connection failed', 'err');
        teardownCall({ back: true, result: 'failed' });
      }
    }, 15000);
    // belt & braces: some environments never dispatch negotiationneeded for
    // MediaStreamDestination tracks — kick the offer manually if nothing happened
    setTimeout(() => {
      if (!call || !call.pc) return;
      const pc = call.pc;
      if (pc.signalingState === 'stable' && !pc.localDescription &&
          pc.getSenders().some(s => s.track)) {
          try { pc.onnegotiationneeded(); } catch {}
      }
    }, 150);
  }).catch(() => {
    sigSend({ t: 'call-decline' });
    teardownCall({ back: false });
    showView('view-home');
    toast('Microphone access denied', 'err');
  });
}

function declineIncoming() {
  if (!call || call.state !== 'incoming') return;
  sigSend({ t: 'call-decline' });
  teardownCall({ back: false, result: 'declined' });
}

function closeIncomingDialog() {
  const dlg = $('dlg-incoming');
  try { if (dlg.open) dlg.close(); } catch { dlg.removeAttribute('open'); }
}

function onCallAccepted() {
  if (!call || call.state !== 'outgoing') return;
  // per-friend voice FX preset
  const pf = friendByCode(call.peerCode);
  if (pf && pf.fxAuto && FX_ORDER.includes(pf.fxAuto)) {
    settings.fx = pf.fxAuto;
    saveSettingsData();
  }
  clearTimeout(call.ringTimeout);
  Sounds.stopRing();
  call.state = 'connecting';
  $('call-status').textContent = 'Connecting…';
  try { buildPC(); } catch (e) { console.error('BPC FAIL:', e && e.message); }
  try { attachMic(); } catch (e) { console.error('ATTACH FAIL:', e && e.message); }
  // some environments never dispatch negotiationneeded for MediaStreamDestination
  // tracks — kick the offer manually if nothing happened shortly after attach
  setTimeout(() => {
    if (!call || !call.pc) return;
    const pc = call.pc;
    if (pc.signalingState === 'stable' && !pc.localDescription &&
        pc.getSenders().some(s => s.track)) {
      try { pc.onnegotiationneeded(); } catch (err) { console.error('KICK FAIL:', err && err.message); }
    }
  }, 150);
}

/* raise Opus from the ~24kbps default to 66kbps + forward error correction */
function enhanceOpusSdp(sdp) {
  try {
    if (!sdp || sdp.indexOf('opus/48000') === -1) return sdp;
    const m = /a=rtpmap:(\d+) opus\/48000\/2/.exec(sdp);
    if (!m) return sdp;
    const pt = m[1];
    const params = 'maxaveragebitrate=66000;useinbandfec=1;usedtx=0';
    const fmtpRe = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
    if (fmtpRe.test(sdp)) {
      return sdp.replace(fmtpRe, (line, existing) =>
        line + (existing ? ';' : '') + params);
    }
    return sdp.replace(
      new RegExp('a=rtpmap:' + pt + ' opus/48000/2'),
      'a=rtpmap:' + pt + ' opus/48000/2\r\na=fmtp:' + pt + ' ' + params
    );
  } catch { return sdp; }
}

function buildPC() {
  const pc = new RTCPeerConnection(RTC_CFG);
  call.pc = pc;
  call.pcConnected = false;

  const sendLocalDesc = async () => {
    const d = pc.localDescription;
    sigSend({ t: 'sdp', type: d.type, sdp: enhanceOpusSdp(d.sdp) });
  };

  pc.onnegotiationneeded = async () => {
    try {
      call.makingOffer = true;
      await pc.setLocalDescription();
      await sendLocalDesc();
    } catch {}
    finally { call.makingOffer = false; }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) sigSend({ t: 'ice', c: candidate.toJSON ? candidate.toJSON() : candidate });
  };
  pc.onconnectionstatechange = () => {
    if (!call || call.pc !== pc) return;
    const st = pc.connectionState;
    if (st === 'connected') {
      call.state = 'active';
      if (call.graceTm) { clearTimeout(call.graceTm); call.graceTm = null; toast('Back online', 'ok'); }
      if (!call.pcConnected) {
        call.pcConnected = true;
        call.connectedTs = Date.now();
        clearTimeout(call.answerTimeout);
        $('call-status').textContent = '';
        startTimer();
        startQuality();
        Sounds.connect();
      }
    } else if (st === 'failed') {
      toast('Connection failed', 'err');
      teardownCall({ back: true, result: 'failed' });
    } else if (st === 'disconnected') {
      if (!call.graceTm) {
        toast('Connection hiccup — trying to recover…');
        try { pc.restartIce && pc.restartIce(); } catch {}
        call.graceTm = setTimeout(() => {
          toast('Connection lost', 'err');
          teardownCall({ back: true, result: 'failed' });
        }, 12000);
      }
    }
  };
  pc.ontrack = (e) => {
    call.remoteStream = e.streams[0] || new MediaStream([e.track]);
    $('remote-audio').srcObject = call.remoteStream;
    // smooth out network bursts instead of hard cutouts
    try {
      if (e.receiver && e.receiver.setParameters && e.track.kind === 'audio') {
        const p = e.receiver.getParameters();
        p.playoutDelayHint = 0.06;
        e.receiver.setParameters(p);
      }
    } catch {}
    e.track.onunmute = () => onRemoteTrackLive(e.track);
    e.track.onmute = () => onRemoteTrackGone(e.track);
    e.track.onended = () => onRemoteTrackGone(e.track);
    if (!e.track.muted) { onRemoteTrackLive(e.track); }
  };

  return pc;
}

function attachMic() {
  if (!call || !call.pc || call.attached || !call.micStream) return;
  const ok = initMixBus(call.micStream);
  let track = null;
  if (ok && mix) {
    track = mix.dest.stream.getAudioTracks()[0];
  }
  if (!track) {
    // mix bus failed (no gesture yet etc) — fall back to a live silent-ish source so the call still connects
    try {
      const tc = new AudioContext();
      const osc = tc.createOscillator(); osc.frequency.value = 50;
      const g = tc.createGain(); g.gain.value = 0;
      osc.connect(g);
      const dst = tc.createMediaStreamDestination();
      g.connect(dst);
      osc.start();
      track = dst.stream.getAudioTracks()[0];
    } catch {}
  }
  if (!track) { try { track = call.micStream.getAudioTracks()[0]; } catch {} }
  if (track) call.pc.addTrack(track, call.micStream);
  call.attached = true;
}

async function handleSdp(desc) {
  const pc = call && call.pc;
  if (!pc || !desc || !desc.type) return;
  try {
    const readyForOffer = !call.makingOffer &&
      (pc.signalingState === 'stable' || call.isSettingRemoteAnswerPending);
    const offerCollision = desc.type === 'offer' && !readyForOffer;
    call.ignoreOffer = !call.polite && offerCollision;
    if (call.ignoreOffer) return;
    await pc.setRemoteDescription(desc);
    flushIce();
    if (desc.type === 'offer') {
      attachMic();
      await pc.setLocalDescription();
      const d = pc.localDescription;
      sigSend({ t: 'sdp', type: d.type, sdp: enhanceOpusSdp(d.sdp) });
    }
  } catch {}
}

async function handleIce(c) {
  const pc = call && call.pc;
  if (!pc || !c) return;
  try {
    if (pc.remoteDescription && pc.remoteDescription.type) {
      await pc.addIceCandidate(c);
    } else {
      call.pendingIce.push(c);
    }
  } catch {}
}

function flushIce() {
  const pc = call && call.pc;
  if (!pc) return;
  while (call.pendingIce.length) {
    const c = call.pendingIce.shift();
    pc.addIceCandidate(c).catch(() => {});
  }
}

function hangUp() {
  if (!call) return;
  if (call.state === 'incoming') {
    declineIncoming();
    return;
  }
  sigSend({ t: call.state === 'outgoing' ? 'call-cancel' : 'call-end' });
  if (call.connectedTs) Sounds.disconnect();
  teardownCall({ back: true, result: call.connectedTs ? 'completed' : 'cancelled' });
}

function recordCallEntry(callObj, result) {
  if (!callObj || !callObj.meta || callObj.recorded) return;
  callObj.recorded = true;
  const dur = callObj.connectedTs ? Math.max(1, Math.round((Date.now() - callObj.connectedTs) / 1000)) : 0;
  callLog.unshift({
    code: callObj.peerCode,
    name: displayName(callObj.peerCode),
    dir: callObj.meta.dir || 'out',
    result,
    ts: callObj.startedAt || Date.now(),
    dur
  });
  if (callLog.length > 100) callLog = callLog.slice(0, 100);
  saveCallLog();
  if (window.Fun && dur > 0) { try { Fun.statCall(dur); } catch {} }
  renderRecent();
}

function teardownCall(opts = {}) {
  if (call) {
    recordCallEntry(call, opts.result || call.meta && call.meta.result || (call.connectedTs ? 'completed' : 'failed'));
    clearTimeout(call.ringTimeout);
    clearTimeout(call.answerTimeout);
    clearTimeout(call.graceTm);
    if (call.pc) try { call.pc.close(); } catch {}
    if (call.micStream) call.micStream.getTracks().forEach(t => t.stop());
    if (call.shareStream) call.shareStream.getTracks().forEach(t => t.stop());
    if (call.remoteStream) try { call.remoteStream.getTracks().forEach(t => t.stop()); } catch {}
  }
  Sounds.stopRing();
  stopTimer();
  stopSpeakingWatch();
  stopQuality();
  destroyMixBus();
  if (watch) closeWatch(true);
  drawOn = false; liveStroke = null; allStrokes = [];
  $('btn-draw').classList.add('hidden');
  closeIncomingDialog();
  call = null;
  remoteMicOn = true; remoteSharing = false; sharingLocal = false; deafened = false; remoteDeafened = false;
  $('remote-audio').srcObject = null;
  $('remote-audio').muted = false;
  $('share-video').srcObject = null;
  $('call-stage').classList.remove('sharing');
  $('btn-share').classList.remove('on');
  if (opts.back) {
    showView(chatOpen ? 'view-chat' : 'view-home');
    if (chatOpen) renderChatStatus();
  }
}

/* ---- call UI bits ---- */
function resetCallButtons() {
  const mute = $('btn-mute');
  mute.classList.add('on'); mute.classList.remove('off');
  mute.setAttribute('aria-pressed', 'false');
  mute.querySelector('i').textContent = 'Mic';
  const deaf = $('btn-deafen');
  deaf.classList.add('on'); deaf.classList.remove('off');
  deaf.setAttribute('aria-pressed', 'false');
}

function renderCallHeader() {
  if (!call) return;
  $('call-peer-name').textContent = displayName(call.peerCode);
}

function renderLocalTile() {
  const nm = document.getElementById('av-local-name');
  if (nm) nm.textContent = identity.avatar ? '' : initials(identity.name);
  const t = document.getElementById('av-local');
  if (t) {
    t.style.backgroundImage = identity.avatar ? 'url(' + identity.avatar + ')' : '';
    t.style.backgroundSize = 'cover';
  }
  const tl = document.getElementById('tile-local-name');
  if (tl) tl.textContent = identity.name;
}

function renderRemoteTile() {
  if (!call) return;
  const f = friendByCode(call.peerCode);
  const hue = (f && f.hue != null) ? f.hue : 220;
  const t = document.getElementById('av-remote');
  if (t) {
    t.style.backgroundImage = (f && f.av) ? 'url(' + f.av + ')' : '';
    t.style.backgroundSize = 'cover';
  } else if (!hue) {}
  const nm2 = document.getElementById('av-remote-name');
  if (nm2) nm2.textContent = (f && f.av) ? '' : initials(displayName(call.peerCode));
  const rn = document.querySelector('#av-remote .tile-name');
  if (rn) rn.textContent = displayName(call.peerCode);
  const chips = [];
  if (!remoteMicOn) chips.push('muted');
  if (remoteDeafened) chips.push('deafened');
  const sub = document.getElementById('av-remote-sub');
  if (sub) sub.textContent = chips.join(' \u00b7 ');
  if (sub) sub.classList.toggle('visible', chips.length > 0);
}
function toggleDeafen() {
  if (!call) return;
  deafened = !deafened;
  deafened ? Sounds.deafOn() : Sounds.deafOff();
  const ra = $('remote-audio');
  ra.muted = deafened;
  const btn = $('btn-deafen');
  btn.classList.toggle('off', deafened);
  btn.classList.toggle('on', !deafened);
  btn.setAttribute('aria-pressed', String(deafened));
  btn.querySelector('i').textContent = deafened ? 'Deafened' : 'Deaf';
  sigSend({ t: 'ctrl', k: 'deafen', on: deafened });
}

function startTimer() {
  stopTimer();
  timerIv = setInterval(() => {
    if (!call || !call.connectedTs) return;
    const s = Math.floor((Date.now() - call.connectedTs) / 1000);
    $('call-timer').textContent =
      String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 500);
}
function stopTimer() { if (timerIv) { clearInterval(timerIv); timerIv = null; } }

function applyCallVolume() {
  const ra = document.getElementById('remote-audio');
  if (ra) ra.volume = Math.max(0, Math.min(1, ((Number(settings.callVol) || 100)) / 100));
}

function toggleMute() {
  if (!call || !call.micStream) return;
  const track = call.micStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  track.enabled ? Sounds.unmute() : Sounds.mute();
  const muted = !track.enabled;
  const mute = $('btn-mute');
  mute.classList.toggle('off', muted);
  mute.classList.toggle('on', !muted);
  mute.setAttribute('aria-pressed', String(muted));
  mute.querySelector('i').textContent = muted ? 'Muted' : 'Mic';
  sigSend({ t: 'ctrl', k: 'mic', on: track.enabled });
}

/* ---- speaking ring detection ---- */
function startSpeakingWatch() {
  stopSpeakingWatch();
  try {
    const stream = call && call.remoteStream;
    const at = stream && stream.getAudioTracks()[0];
    if (!at) return;
    speakCtx = new AudioContext();
    const src = speakCtx.createMediaStreamSource(new MediaStream([at]));
    const an = speakCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    speakingIv = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      $('av-remote').classList.toggle('speaking', rms > 0.04);
    }, 160);
  } catch {}
}
function stopSpeakingWatch() {
  if (speakingIv) { clearInterval(speakingIv); speakingIv = null; }
  $('av-remote') && $('av-remote').classList.remove('speaking');
  if (speakCtx) { try { speakCtx.close(); } catch {} speakCtx = null; }
}

/* ---- screen share ---- */
function onRemoteTrackLive(track) {
  if (!call) return;
  if (track.kind === 'video') {
    remoteSharing = true;
    $('share-video').srcObject = new MediaStream([track]);
    applyStage();
  }
  startSpeakingWatch();
}

function onRemoteTrackGone(track) {
  if (!call) return;
  if (track.kind === 'video') {
    remoteSharing = false;
    maybeClearShareVideo();
    applyStage();
  }
}

function maybeClearShareVideo() {
  if (!sharingLocal && !remoteSharing) $('share-video').srcObject = null;
}

function applyStage() {
  const anyShare = sharingLocal || remoteSharing;
  $('call-stage').classList.toggle('sharing', anyShare);
  $('btn-share').classList.toggle('on', sharingLocal);
  const label = $('share-label');
  if (label) {
    label.textContent = anyShare ? (sharingLocal ? 'You are sharing' : (call ? displayName(call.peerCode) + "'s screen" : '')) : '';
    label.classList.toggle('hidden', !anyShare);
  }
}

async function startShare(sourceId, withAudio) {
  if (!call || !call.pc) { toast('Not in a call', 'err'); return; }
  const p = SHARE_PRESETS[settings.sharePreset] || SHARE_PRESETS.balanced;
  const constraints = {
    audio: withAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: p.w, maxHeight: p.h, maxFrameRate: p.fps
      }
    }
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  call.shareStream = stream;
  const vt = stream.getVideoTracks()[0];
  vt.addEventListener('ended', () => stopShare(true));
  for (const t of stream.getTracks()) {
    const s = call.pc.addTrack(t, stream);
    call.shareSenders.push(s);
  }
  sigSend({ t: 'ctrl', k: 'share-start' });
  sharingLocal = true;
  Sounds.shareOn();
  $('share-video').srcObject = new MediaStream([vt]);
  const sc = $('share-canvas');
  sc.classList.remove('hidden');
  $('btn-draw').classList.remove('hidden');
  setTimeout(sizeShareCanvas, 120);
  applyStage();
}

function stopShare(fromEnded = false) {
  if (!call || !call.shareStream) return;
  for (const s of call.shareSenders) { try { call.pc.removeTrack(s); } catch {} }
  call.shareSenders = [];
  call.shareStream.getTracks().forEach(t => t.stop());
  call.shareStream = null;
  sharingLocal = false;
  if (!fromEnded) { sigSend({ t: 'ctrl', k: 'share-stop' }); Sounds.shareOff(); }
  drawOn = false;
  liveStroke = null;
  allStrokes = [];
  const c = $('share-canvas');
  if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); c.classList.add('hidden'); c.classList.remove('draw-on'); }
  $('btn-draw').classList.add('hidden');
  maybeClearShareVideo();
  applyStage();
}




/* ============ friend requests ============ */
function renderRequests() {
  const wrap = $('requests-wrap');
  const badge = $('requests-badge');
  if (!pendingIn.length) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  badge.textContent = pendingIn.length;
  badge.classList.remove('hidden');
  const list = $('requests-list');
  list.innerHTML = '';
  for (const r of pendingIn) {
    const li = document.createElement('li');
    li.className = 'req-item';
    const nm = document.createElement('span');
    nm.className = 'req-name';
    nm.textContent = r.name;
    nm.title = '#' + r.code;
    const ok = document.createElement('button');
    ok.className = 'req-ok'; ok.innerHTML = '&#x2713;'; ok.title = 'Accept';
    ok.onclick = (e) => { e.stopPropagation(); acceptRequest(r.code); };
    const no = document.createElement('button');
    no.className = 'req-no'; no.innerHTML = '&#x2715;'; no.title = 'Dismiss';
    no.onclick = (e) => { e.stopPropagation(); denyRequest(r.code); };
    li.appendChild(nm); li.appendChild(ok); li.appendChild(no);
    li.onclick = () => {};
    list.appendChild(li);
  }
}

function acceptRequest(code) {
  const req = pendingIn.find(p => p.code === code);
  pendingIn = pendingIn.filter(p => p.code !== code);
  savePendingIn();
  dismissedCodes = dismissedCodes.filter(c => c !== code);
  saveDismissed();
  let f = friendByCode(code);
  if (!f) { f = upsertFriend(code, req ? req.name : null); }
  else { delete f.pending; delete f._reqName; saveFriends(); }
  renderRequests(); renderFriends();
  ensureConn(code).then(() => {}).catch(() => {});
  toast(displayName(code) + ' added — say hi!', 'ok');
  openChat(code);
}

function denyRequest(code) {
  pendingIn = pendingIn.filter(p => p.code !== code);
  savePendingIn();
  if (!dismissedCodes.includes(code)) dismissedCodes.push(code);
  saveDismissed();
  renderRequests();
  toast('Request dismissed');
}

/* ============ recent calls ============ */
const RESULT_META = {
  completed: { ico: '', cls: '' },
  missed:    { ico: '&#x21B3;', cls: 'missed', label: 'Missed' },
  declined:  { ico: '&#x2715;', cls: 'missed', label: 'Declined' },
  busy:      { ico: '&#x2715;', cls: 'missed', label: 'Busy' },
  'no-answer': { ico: '&#x2715;', cls: 'missed', label: 'No answer' },
  cancelled: { ico: '&#x2715;', cls: 'missed', label: 'Cancelled' },
  failed:    { ico: '&#x26A0;', cls: 'missed', label: "Couldn't connect" }
};

function renderRecent() {
  const wrap = $('recent-wrap');
  const list = $('recent-list');
  list.innerHTML = '';
  if (!callLog.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  for (const it of callLog.slice(0, 12)) {
    const meta = RESULT_META[it.result] || RESULT_META.completed;
    const d = new Date(it.ts);
    const li = document.createElement('li');
    li.className = 'recent-item';
    li.innerHTML =
      '<span class="recent-ico ' + (meta.cls || '') + '">' + (meta.ico || (it.dir === 'out' ? '&#x2197;' : '&#x2198;')) + '</span>' +
      '<span class="recent-name">' + escapeHtml(it.name) + '</span>' +
      '<span class="recent-sub' + (meta.cls ? ' bad' : '') + '">' +
        (meta.label || (it.dur >= 60 ? Math.round(it.dur / 60) + ' min' : it.dur + 's')) +
        ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>';
    const rb = document.createElement('button');
    rb.className = 'recent-call';
    rb.title = 'Call back';
    rb.setAttribute('aria-label', 'Call back ' + it.name);
    rb.innerHTML = '&#128222;';
    rb.onclick = (e) => { e.stopPropagation(); startCall(it.code); };
    li.appendChild(rb);
    li.onclick = () => openChat(it.code);
    list.appendChild(li);
  }
}

/* ============ dialogs ============ */
function openAddFriend() {
  $('af-code').value = '';
  const dlg = $('dlg-addfriend');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => $('af-code').focus(), 50);
}

function fillRingSelect(sel, withDefault) {
  sel.innerHTML = '';
  if (withDefault) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'Default (' + (RINGTONES[settings.ring] || RINGTONES.classic).label + ')';
    sel.appendChild(o);
  }
  for (const key of Object.keys(RINGTONES)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = RINGTONES[key].label;
    sel.appendChild(o);
  }
}

function buildAccentRow() {
  const row = $('accent-row');
  row.innerHTML = '';
  for (const [key, pair] of Object.entries(ACCENTS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'accent-sw' + (settings.accent === key ? ' sel' : '');
    b.style.background = 'linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')';
    b.dataset.accent = key;
    b.title = key;
    b.onclick = () => {
      settings.accent = key;
      applyTheme();
      buildAccentRow();
      Sounds.blip([660], .06, .05 * Sounds.vol());
    };
    row.appendChild(b);
  }
}

function openSettings() {
  $('set-name').value = identity.name;
  $('set-status').value = identity.status || '';
  $('set-echo').checked = settings.echo;
  $('set-noise').checked = settings.noise;
  $('set-agc').checked = settings.agc;
  $('set-notifs').checked = settings.notifyMsgs !== false;
  $('set-callvol').value = settings.callVol;
  $('callvol-val').textContent = settings.callVol;
  $('set-ptt').checked = !!settings.ptt;
  $('set-ringvol').value = settings.ringVol;
  $('ringvol-val').textContent = settings.ringVol;
  $('set-gate').value = settings.gate;
  updateGateLabel();
  $('set-sharepreset').value = SHARE_PRESETS[settings.sharePreset] ? settings.sharePreset : 'balanced';
  const fxSel = $('set-fx');
  fxSel.innerHTML = '';
  for (const f of FX_ORDER) {
    const o = document.createElement('option');
    o.value = f; o.textContent = FX_LABELS[f] || f;
    fxSel.appendChild(o);
  }
  fxSel.value = FX_ORDER.includes(settings.fx) ? settings.fx : 'none';
  fillRingSelect($('set-ring'), false);
  $('set-ring').value = RINGTONES[settings.ring] ? settings.ring : 'classic';
  $('set-amoled').checked = !!settings.amoled;
  $('set-qh').checked = !!settings.qh;
  $('set-qh-start').value = settings.qhStart || '23:00';
  $('set-qh-end').value = settings.qhEnd || '08:00';
  buildAccentRow();
  scCapturing = null;
  renderShortcuts();
  applyAvatar($('set-av-preview'), identity.avatar, identity.hue, initials(identity.name));
  $('btn-av-change').onclick = async () => {
    const picked = await window.aero.pickFiles();
    const f = (picked || [])[0];
    if (!f) return;
    try {
      const ab = await window.aero.readFile(f.path);
      if (!ab) return;
      const b64 = await downscaleAvatar(new Blob([ab], { type: 'image/*' }));
      identity.avatar = b64;
      identity.avv = Date.now();
      saveIdentity();
      broadcastHello();
      renderProfile();
      openSettings();
      toast('Avatar updated', 'ok');
    } catch { toast('Could not use that image', 'err'); }
  };
  $('btn-av-remove').onclick = () => {
    delete identity.avatar;
    identity.avv = Date.now();
    saveIdentity();
    broadcastHello();
    renderProfile();
    openSettings();
    toast('Avatar removed');
  };
  window.aero.getPrefs().then((p) => {
    $('set-tray').checked = !!p.closeToTray;
    $('set-hotkey').checked = !!p.hotkeyMute;
    $('set-autostart').checked = !!p.startWithWindows;
  });
  window.aero.getVersion().then((v) => { $('app-version').textContent = 'GoonCall v' + v; }).catch(() => {});
  const dlg = $('dlg-settings');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  populateDevices();
}

function updateGateLabel() {
  const g = Number($('set-gate').value) || 0;
  $('gate-val').textContent = g <= 0 ? 'Off' : g >= 80 ? 'Aggressive' : g >= 40 ? 'Medium' : 'Light';
}

/* ---- shortcuts editor ---- */
function renderShortcuts() {
  const list = $('sc-list');
  list.innerHTML = '';
  for (const [id, label] of SC_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'sc-row';
    const name = document.createElement('span');
    name.className = 'sc-label';
    name.textContent = label;
    const kbd = document.createElement('kbd');
    kbd.textContent = getBind(id) || 'Unbound';
    kbd.title = 'Click to rebind';
    if (scCapturing === id) {
      kbd.classList.add('capturing');
      kbd.textContent = 'Press keys…';
    }
    kbd.onclick = () => {
      scCapturing = (scCapturing === id) ? null : id;
      renderShortcuts();
      if (scCapturing) $('btn-set-save').focus();
    };
    row.appendChild(name); row.appendChild(kbd);
    list.appendChild(row);
  }
}

function endShortcutCapture() {
  scCapturing = null;
  renderShortcuts();
}

function resetShortcuts() {
  settings.shortcuts = {};
  saveSettingsData();
  scCapturing = null;
  renderShortcuts();
  updateShortcutTooltips();
  toast('Shortcuts restored to defaults', 'ok');
}

function updateShortcutTooltips() {
  const map = { 'btn-share': 'shareToggle', 'btn-fx': 'fxCycle', 'btn-board': 'board', 'btn-call-chat': 'chatPanel', 'btn-hangup': 'hangup', 'btn-mute': 'mute', 'btn-deafen': 'deafen' };
  for (const [btnId, action] of Object.entries(map)) {
    const b = $(btnId);
    if (!b) continue;
    const base = b.getAttribute('aria-label') || '';
    b.title = base + ' (' + getBind(action) + ')';
  }
}

async function populateDevices() {
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch {}
  if (!devs.length || devs.every(d => !d.label)) {
    try {
      const tmp = await getMic();
      tmp.getTracks().forEach(t => t.stop());
      devs = await navigator.mediaDevices.enumerateDevices();
    } catch {}
  }
  const fill = (sel, items, current) => {
    sel.innerHTML = '';
    for (const d of items) {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || (d.deviceId === 'default' ? 'System default' : 'Device ' + (sel.options.length + 1));
      sel.appendChild(o);
    }
    sel.value = items.some(d => d.deviceId === current) ? current : 'default';
  };
  fill($('set-mic'), [{ deviceId: 'default', label: 'System default' }, ...devs.filter(d => d.kind === 'audioinput')], settings.micId);
  fill($('set-speaker'), [{ deviceId: 'default', label: 'System default' }, ...devs.filter(d => d.kind === 'audiooutput')], settings.speakerId);
}

function applyMicConstraints() {
  const c = { echoCancellation: settings.echo, noiseSuppression: settings.noise, autoGainControl: settings.agc };
  if (settings.micId && settings.micId !== 'default') c.deviceId = { exact: settings.micId };
  return c;
}

async function switchMicLive() {
  if (!call || !call.pc) return false;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: applyMicConstraints() });
    const nt = s.getAudioTracks()[0];
    if (!nt) return false;
    nt.enabled = call.micStream.getAudioTracks()[0] ? call.micStream.getAudioTracks()[0].enabled : true;
    try { call.micStream.removeTrack(call.micStream.getAudioTracks()[0]); } catch {}
    call.micStream.addTrack(nt);
    const sender = call.pc.getSenders().find(x => x.track && x.track.kind === 'audio');
    if (sender) await sender.replaceTrack(nt);
    s.getAudioTracks().slice(1).forEach(t => t.stop());
    return true;
  } catch { return false; }
}

function saveSettings() {
  const nn = $('set-name').value.trim().slice(0, 32);
  if (nn) identity.name = nn;
  identity.status = $('set-status').value.trim().slice(0, 80);
  saveIdentity();
  broadcastHello();
  broadcastPresence();
  renderProfile(); renderFriends();

  settings.echo = $('set-echo').checked;
  settings.noise = $('set-noise').checked;
  settings.agc = $('set-agc').checked;
  settings.notifyMsgs = $('set-notifs').checked;
  settings.ptt = $('set-ptt').checked;
  settings.callVol = Number($('set-callvol').value) || 100;
  settings.ringVol = Number($('set-ringvol').value);
  settings.gate = Number($('set-gate').value) || 0;
  if (RINGTONES[$('set-ring').value]) settings.ring = $('set-ring').value;
  if (SHARE_PRESETS[$('set-sharepreset').value]) settings.sharePreset = $('set-sharepreset').value;
  if (FX_ORDER.includes($('set-fx').value)) {
    settings.fx = $('set-fx').value;
    $('fx-label').textContent = FX_LABELS[settings.fx] || 'Clean';
    $('btn-fx').classList.toggle('active', settings.fx !== 'none');
    if (mix && call) setFx(settings.fx);
  }
  settings.amoled = $('set-amoled').checked;
  settings.qh = $('set-qh').checked;
  settings.qhStart = $('set-qh-start').value || '23:00';
  settings.qhEnd = $('set-qh-end').value || '08:00';
  applyTheme();

  const micChanged = settings.micId !== $('set-mic').value;
  settings.micId = $('set-mic').value;
  settings.speakerId = $('set-speaker').value;
  saveSettingsData();

  window.aero.setPref('closeToTray', $('set-tray').checked);
  window.aero.setPref('hotkeyMute', $('set-hotkey').checked);
  window.aero.setPref('startWithWindows', $('set-autostart').checked);

  const ra = $('remote-audio');
  if (ra.setSinkId && settings.speakerId) ra.setSinkId(settings.speakerId).catch(() => {});
  if (micChanged) switchMicLive();

  try { $('dlg-settings').close(); } catch {}
  toast('Settings saved', 'ok');
}

/* ---- mic test meter ---- */
let micTestStop = null;
async function micTest() {
  if (micTestStop) { micTestStop(); return; }
  let stream;
  try { stream = await getMic(); } catch { toast('Microphone unavailable', 'err'); return; }
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  const bar = document.querySelector('#mic-meter i');
  $('btn-mic-test').textContent = 'Stop test \u23F9';
  let raf = 0;
  const loop = () => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);
    bar.style.width = Math.min(100, rms * 420) + '%';
    raf = requestAnimationFrame(loop);
  };
  loop();
  micTestStop = () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach(t => t.stop());
    ctx.close().catch(() => {});
    bar.style.width = '0%';
    $('btn-mic-test').innerHTML = 'Test mic &#x1F50A;';
    micTestStop = null;
  };
}

function broadcastHello() {
  for (const c of conns.values()) safeSend(c, helloPayload());
}

/* ============ shortcuts registry ============ */
const SC_DEFAULTS = {
  answerCall: 'Ctrl+Enter',
  declineCall: 'Esc',
  mute: 'M',
  deafen: 'D',
  shareToggle: 'Ctrl+Shift+S',
  fxCycle: 'Ctrl+Shift+F',
  board: 'Ctrl+Shift+B',
  chatPanel: 'Ctrl+Shift+C',
  hangup: 'Ctrl+Shift+H',
  watch: 'Ctrl+Shift+W',
  quitApp: 'Ctrl+F1',
  searchChat: 'Ctrl+F',
  snip: 'Ctrl+Shift+A',
  stopSounds: 'Ctrl+Shift+O',
  switcher: 'Ctrl+K',
  settings: 'Ctrl+,'
};
const SC_ACTIONS = [
  ['answerCall', 'Answer incoming call'],
  ['declineCall', 'Decline incoming call'],
  ['mute', 'Mute mic (in call)'],
  ['deafen', 'Deafen (in call)'],
  ['shareToggle', 'Screen share'],
  ['fxCycle', 'Cycle voice effect'],
  ['board', 'Soundboard'],
  ['chatPanel', 'Chat panel (in call)'],
  ['hangup', 'Hang up'],
  ['watch', 'Watch party'],
  ['quitApp', 'Quit GoonCall'],
  ['searchChat', 'Search chat'],
  ['settings', 'Open settings'],
  ['switcher', 'Quick switcher'],
  ['snip', 'Quick screenshot']
];

const normKeyToken = (e) => {
  const k = e.key;
  if (k === ' ') return 'Space';
  if (k === 'Escape') return 'Esc';
  if (k.length === 1) return k.toUpperCase();
  return k;
};

function comboFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  parts.push(normKeyToken(e));
  return parts.join('+');
}

function comboMatches(e, binding) {
  if (!binding) return false;
  const parts = String(binding).split('+').map(s => s.trim());
  const key = parts.pop();
  const need = { ctrl: false, alt: false, shift: false, super: false };
  for (const p of parts) {
    const lp = p.toLowerCase();
    if (lp === 'ctrl' || lp === 'control') need.ctrl = true;
    else if (lp === 'alt' || lp === 'option') need.alt = true;
    else if (lp === 'shift') need.shift = true;
    else if (lp === 'super' || lp === 'meta' || lp === 'win') need.super = true;
  }
  if (need.ctrl !== e.ctrlKey || need.alt !== e.altKey || need.shift !== e.shiftKey || need.super !== e.metaKey) return false;
  return normKeyToken(e).toLowerCase() === key.toLowerCase();
}

const getBind = (id) => (settings.shortcuts && settings.shortcuts[id]) || SC_DEFAULTS[id] || '';

/* ============ keyboard / shortcuts ============ */
function typingInField() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

let scCapturing = null; // action id currently being rebound

function togglePin(code, id) {
  if (!settings.pins) settings.pins = {};
  const arr = settings.pins[code] || [];
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  else { arr.push(id); if (arr.length > 5) arr.shift(); }
  settings.pins[code] = arr;
  saveSettingsData();
  renderPinStrip(code);
  renderChatLog(code);
}

function renderPinStrip(code) {
  const strip = $('pin-strip');
  const ids = (settings.pins && settings.pins[code]) || [];
  strip.innerHTML = '';
  strip.classList.toggle('hidden', !ids.length);
  for (const pid of ids) {
    const e = (chats[code] || []).find(c => c.id === pid);
    if (!e) continue;
    const chip = document.createElement('button');
    chip.className = 'pin-chip';
    chip.textContent = '📌 ' + ((e.text || e.name || '').slice(0, 40) || 'message');
    chip.title = 'Jump to pinned message';
    chip.onclick = () => {
      const row = document.querySelector('.msg[data-mid="' + pid + '"]');
      if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.style.background = 'rgba(88,101,242,.2)'; setTimeout(() => { row.style.background = ''; }, 1000); }
    };
    strip.appendChild(chip);
  }
}

window.addEventListener('keydown', (e) => {
  /* capture mode: swallow the next combo for the row being edited */
  if (scCapturing) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { endShortcutCapture(); return; }
    const combo = comboFromEvent(e);
    if (!settings.shortcuts) settings.shortcuts = {};
    for (const [id, b] of Object.entries(settings.shortcuts)) {
      if (id !== scCapturing && String(b).toLowerCase() === combo.toLowerCase()) {
        delete settings.shortcuts[id];
        toast('Cleared duplicate binding');
      }
    }
    settings.shortcuts[scCapturing] = combo;
    saveSettingsData();
    endShortcutCapture();
    renderShortcuts();
    updateShortcutTooltips();
    return;
  }

  /* incoming call always wins — even while typing */
  const dlg = $('dlg-incoming');
  if (dlg && dlg.open) {
    if (comboMatches(e, getBind('answerCall'))) { e.preventDefault(); acceptIncoming(); return; }
    if (comboMatches(e, getBind('declineCall'))) { e.preventDefault(); declineIncoming(); return; }
  }

  if (comboMatches(e, getBind('settings'))) { e.preventDefault(); openSettings(); return; }

  if (settings.ptt && e.code === 'Space' && !e.repeat && call && call.state !== 'incoming' && !$('dlg-incoming').open) {
    e.preventDefault();
    if (!pttHeld) {
      pttHeld = true;
      const tr = call.micStream && call.micStream.getAudioTracks()[0];
      if (tr) { tr.enabled = true; sigSend({ t: 'ctrl', k: 'mic', on: true }); }
      const mb = document.getElementById('btn-mute');
      if (mb) { mb.classList.remove('off'); mb.classList.add('on'); mb.querySelector('i').textContent = 'TALK'; }
    }
    return;
  }

  if (typingInField()) return;

  const bd = $('dlg-board');
  if (bd && bd.open && typeof pendingKeyTile !== 'undefined' && pendingKeyTile) {
    e.preventDefault();
    if (e.key === 'Escape') { pendingKeyTile = null; Board.refresh(); return; }
    if (!settings.boardKeys) settings.boardKeys = {};
    settings.boardKeys[pendingKeyTile] = normKeyToken(e);
    saveSettingsData();
    toast('Bound "' + normKeyToken(e) + '" to clip', 'ok');
    pendingKeyTile = null;
    Board.renderGrid();
    return;
  }
  if (bd && bd.open) {
    const byOverride = Object.entries(settings.boardKeys || {}).find(([, kk]) => kk.toLowerCase() === normKeyToken(e).toLowerCase());
    if (byOverride) { e.preventDefault(); playSoundFile(byOverride[0]); return; }
  }
  if (bd && bd.open && /^[0-9]$/.test(e.key)) {
    e.preventDefault();
    const idx = e.key === '0' ? 9 : Number(e.key) - 1;
    const f = Board.files[idx];
    if (f) playSoundFile(f.name);
    return;
  }

  if (comboMatches(e, getBind('searchChat')) && chatOpen && $('view-chat').classList.contains('active')) {
    e.preventDefault();
    $('chat-search-row').classList.remove('hidden');
    $('chat-search').focus();
    return;
  }

  if (!call || call.state === 'incoming') {
    return;
  }

  if (comboMatches(e, getBind('shareToggle'))) { sharingLocal ? stopShare() : openScreenPicker(); return; }
  if (comboMatches(e, getBind('fxCycle'))) { cycleFx(); return; }
  if (comboMatches(e, getBind('board'))) { Board.open(); return; }
  if (comboMatches(e, getBind('watch'))) { btn-watch.click(); return; }
  if (comboMatches(e, getBind('chatPanel'))) { showView($('view-chat').classList.contains('active') ? 'view-call' : 'view-chat'); return; }
  if (comboMatches(e, getBind('hangup'))) { hangUp(); return; }
  if (comboMatches(e, getBind('stopSounds'))) { stopAllSounds(); return; }
  if (comboMatches(e, getBind('mute')) && !settings.ptt) { toggleMute(); return; }
  if (comboMatches(e, getBind('deafen'))) { toggleDeafen(); return; }
  if (comboMatches(e, getBind('quitApp'))) {
    window.aero.quitApp();
    return;
  }
});

window.addEventListener('keyup', (e) => {
  if (settings.ptt && pttHeld && e.code === 'Space') {
    pttHeld = false;
    if (call && call.micStream) {
      const tr = call.micStream.getAudioTracks()[0];
      if (tr) { tr.enabled = false; sigSend({ t: 'ctrl', k: 'mic', on: false }); }
    }
    const mb = document.getElementById('btn-mute');
    if (mb) { mb.classList.add('off'); mb.classList.remove('on'); mb.querySelector('i').textContent = 'PTT'; }
  }
});

window.addEventListener('focus', () => {
  winFocused = true;
  window.aero.flash(false);
  if (chatOpen) sendSeenBatch(chatOpen);
});
window.addEventListener('blur', () => { winFocused = false; });

function handleDroppedFiles(files) {
  if (!chatOpen || !files || !files.length) return;
  for (const f of files) {
    const kind = f.type && f.type.startsWith('image/') ? 'image' : 'file';
    sendAttachment(kind, f, f.name || ('file-' + Date.now()));
  }
}

function openCtxMenu(x, y, entry) {
  closeCtxMenu();
  const m = document.createElement('div');
  m.className = 'ctx-menu';
  const add = (label, fn, cls) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.onclick = () => { closeCtxMenu(); fn(); };
    m.appendChild(b);
  };
  if (entry.me && entry.text && !entry.deleted) add('\u270E  Edit', () => startEdit(chatOpen, entry));
  add('\u21A9  Reply', () => startReply(chatOpen, entry));
  if (entry.text) {
    add('Copy text', async () => {
      const ok = await window.aero.clipWrite(entry.text);
      toast(ok ? 'Copied' : 'Copy failed', ok ? 'ok' : 'err');
    });
  }
  if (entry.me && !entry.deleted) {
    add('Delete', () => deleteMessage(chatOpen, entry.id), 'danger');
  }
  const pinList = (settings.pins && settings.pins[chatOpen]) || [];
  const isPinned = entry.id && pinList.includes(entry.id);
  add(isPinned ? 'Unpin' : 'Pin', () => togglePin(chatOpen, entry.id), isPinned ? '' : 'danger');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  setTimeout(() => document.addEventListener('mousedown', closeCtxMenu, { once: true }), 0);
}
function closeCtxMenu() {
  for (const el of document.querySelectorAll('.ctx-menu')) el.remove();
}

function openNickname() {
  if (!chatOpen) return;
  const f = friendByCode(chatOpen);
  $('nick-input').value = (f && f.nick) || '';
  $('note-input').value = (f && f.note) || '';
  fillRingSelect($('nick-ring'), true);
  $('nick-ring').value = (f && f.ring) || '';
  const selF = $('nick-fx');
  selF.innerHTML = '<option value="default">Default</option>';
  for (const fx of FX_ORDER) {
    const o = document.createElement('option');
    o.value = fx; o.textContent = 'Always ' + (FX_LABELS[fx] || fx);
    selF.appendChild(o);
  }
  selF.value = (f && f.fxAuto && FX_ORDER.includes(f.fxAuto)) ? f.fxAuto : 'default';
  $('nick-title').textContent = (f && f.nick ? f.nick : (f && f.name)) || 'Friend';
  const dlg = $('dlg-nick');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => $('nick-input').select(), 60);
}

function saveNickname() {
  if (!chatOpen) { try { $('dlg-nick').close(); } catch {} return; }
  const f = upsertFriend(chatOpen, displayName(chatOpen));
  const v = $('nick-input').value.trim().slice(0, 32);
  if (v) f.nick = v; else delete f.nick;
  const note = $('note-input').value.trim().slice(0, 120);
  if (note) f.note = note; else delete f.note;
  const ring = $('nick-ring').value;
  if (ring && (RINGTONES[ring] || ring.startsWith('snd:'))) f.ring = ring; else delete f.ring;
  const fxv = $('nick-fx').value;
  if (fxv && fxv !== 'default' && FX_ORDER.includes(fxv)) f.fxAuto = fxv; else delete f.fxAuto;
  saveFriends();
  renderFriends(); renderRecent();
  $('chat-peer-name').textContent = displayName(chatOpen);
  if (call && call.peerCode === chatOpen) { renderCallHeader(); renderRemoteTile(); }
  try { $('dlg-nick').close(); } catch {}
  toast('Saved', 'ok');
}

let clearArmTm = null;
function clearChatClicked() {
  if (!chatOpen) return;
  const b = $('btn-chat-clear');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed');
    toast('Click again to clear this chat', '');
    clearTimeout(clearArmTm);
    clearArmTm = setTimeout(() => b.classList.remove('armed'), 3000);
    return;
  }
  clearTimeout(clearArmTm);
  b.classList.remove('armed');
  chats[chatOpen] = [];
  saveChats();
  renderChatLog(chatOpen);
  toast('Chat cleared', 'ok');
}

/* ============ changelog / what's new ============ */
let seenVersion = null;

function mdLite(md) {
  const wrap = document.createElement('div');
  wrap.className = 'changelog-body';
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith('## ')) {
      const h = document.createElement('h2');
      h.textContent = line.slice(3).trim();
      wrap.appendChild(h);
    } else if (/^\s*[-*] /.test(line)) {
      const li = document.createElement('li');
      li.innerHTML = escapeHtml(line.replace(/^\s*[-*] /, ''))
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
      wrap.appendChild(li);
    } else {
      const p = document.createElement('div');
      p.innerHTML = escapeHtml(line).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
      wrap.appendChild(p);
    }
  }
  return wrap;
}

async function showChangelog() {
  try {
    const md = await window.aero.getChangelog();
    const body = $('dlg-changelog').querySelector('.dialog-actions');
    const content = mdLite(md);
    $('dlg-changelog').insertBefore(content, body);
    const dlg = $('dlg-changelog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  } catch { toast('Could not load changelog', 'err'); }
}

async function maybePromptChangelog() {
  const v = await window.aero.getVersion();
  seenVersion = await window.aero.getData('seenVersion');
  if (seenVersion !== v) {
    await showChangelog();
    await window.aero.setData('seenVersion', v);
  }
}

/* ---------- profile card ---------- */
function showProfile(code) {
  const me = !code;
  const f = me ? null : friendByCode(code);
  const name = me ? identity.name : displayName(code);
  const hue = me ? myHue() : ((f && f.hue != null) ? f.hue : 220);
  const img = me ? identity.avatar : (f && f.av);
  applyAvatar($('pf-avatar'), img, hue, initials(name));
  $('pf-name').textContent = name;
  const on = me ? peerOnline : isOnline(code);
  const pst = peerState[code] || {};
  $('pf-statusline').textContent = me
    ? (identity.status || (peerOnline ? 'online' : 'connecting'))
    : (!on ? 'offline' : (pst.idle ? 'idle' : 'online')) +
      ((pst.act || pst.status) ? ' · ' + (pst.act || pst.status) : '');
  const noteEl = $('pf-note');
  if (!me && f && f.note) { noteEl.textContent = f.note; noteEl.classList.remove('hidden'); }
  else noteEl.classList.add('hidden');

  const msgs = (chats[code] || []);
  let callsN = 0, mins = 0;
  for (const c of callLog) if (c.code === code) { callsN++; mins += Math.round((c.dur || 0) / 60); }
  $('pf-stats').innerHTML =
    '<div class="stat"><b>' + msgs.length + '</b><span>messages</span></div>' +
    '<div class="stat"><b>' + callsN + '</b><span>calls</span></div>' +
    '<div class="stat"><b>' + mins + '</b><span>min talked</span></div>';
  $('pf-code-row').textContent = '#' + code;

  const actions = $('pf-actions');
  actions.innerHTML = '';
  const close = document.createElement('button');
  close.className = 'ghost-btn'; close.textContent = 'Close';
  close.onclick = () => { try { $('dlg-profile').close(); } catch {} };
  actions.appendChild(close);
  if (!me && !call) {
    const callBtn = document.createElement('button');
    callBtn.className = 'primary-btn'; callBtn.textContent = 'Call';
    callBtn.onclick = () => { try { $('dlg-profile').close(); } catch {} startCall(code); };
    actions.appendChild(callBtn);
  }

  const dlg = $('dlg-profile');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

/* ============ boot / wiring ============ */
async function boot() {
  await loadState();
  renderProfile();
  renderFriends();
  renderRecent();

  /* titlebar: drag is native; dblclick maximizes, right-click gives the window menu */
  const tb = $('titlebar');
  tb.addEventListener('dblclick', () => window.aero.maximize());
  tb.addEventListener('contextmenu', (e) => { e.preventDefault(); window.aero.titleMenu(); });

  $('btn-copy-code').onclick = async () => {
    const ok = await window.aero.clipWrite(identity.code);
    toast(ok ? 'Your code copied: ' + identity.code : 'Copy failed — your code is ' + identity.code, ok ? 'ok' : 'err');
  };

  $('btn-add-friend').onclick = openAddFriend;
  $('btn-settings').onclick = openSettings;
  $('btn-af-cancel').onclick = () => { try { $('dlg-addfriend').close(); } catch {} };
  $('btn-af-add').onclick = () => { if (addFriendByCode($('af-code').value)) { try { $('dlg-addfriend').close(); } catch {} } };
  $('af-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-af-add').click(); }
  });

  $('btn-set-save').onclick = saveSettings;
  $('btn-set-cancel').onclick = () => { scCapturing = null; try { $('dlg-settings').close(); } catch {} };

  $('set-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    for (const x of $('set-tabs').children) x.classList.toggle('active', x === b);
    for (const page of document.querySelectorAll('#dlg-settings .tab-page')) {
      page.classList.toggle('active', page.dataset.page === b.dataset.tab);
    }
  });
  $('btn-sc-reset').onclick = resetShortcuts;
  $('dlg-settings').addEventListener('close', () => { scCapturing = null; });
  $('set-fx').addEventListener('change', (e) => {
    settings.fx = e.target.value;
    saveSettingsData();
    Sounds.fxTick();
  });

  $('btn-nick-save').onclick = saveNickname;
  $('btn-nick-cancel').onclick = () => { try { $('dlg-nick').close(); } catch {} };

  $('btn-accept').onclick = acceptIncoming;
  $('btn-decline').onclick = declineIncoming;

  $('btn-chat-back').onclick = () => { chatOpen = null; showView('view-home'); };
  $('btn-chat-call').onclick = () => { if (chatOpen) startCall(chatOpen); };
  $('btn-chat-nick').onclick = openNickname;
  $('btn-chat-export').onclick = () => {
    if (!chatOpen) return;
    const items = chats[chatOpen] || [];
    let h = '<html><head><meta charset="utf-8"><title>Chat with ' + escapeHtml(displayName(chatOpen)) + '</title>' +
      '<style>body{font-family:Segoe UI,sans-serif;background:#1e1f22;color:#dbdee1;padding:24px;line-height:1.6}' +
      '.m{margin-bottom:12px}.who{font-weight:700;color:#7983f5}.when{color:#949ba4;font-size:11px}</style></head><body>' +
      '<h1>Chat with ' + escapeHtml(displayName(chatOpen)) + '</h1>';
    for (const it of items) {
      const d = new Date(it.ts || Date.now());
      h += '<div class="m"><span class="who">' + escapeHtml(it.me ? identity.name : displayName(chatOpen)) + '</span> ' +
        '<span class="when">' + d.toLocaleString() + '</span><br>' + escapeHtml(it.text || ('[' + (it.kind || 'file') + ']')) + '</div>';
    }
    h += '</body></html>';
    window.aero.exportChat(h, 'gooncall-chat-' + displayName(chatOpen)).then((p2) => {
      if (p2) toast('Exported: ' + p2.split('\\').pop(), 'ok');
    });
  };

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const txt = input.value.trim();
    if (!txt) return;
    if (pendingEditId) {
      const code = chatOpen, id = pendingEditId;
      const entry = (chats[code] || []).find(c => c.id === id);
      if (entry && entry.me) {
        entry.text = txt;
        saveChats();
        sendTo(code, { t: 'edit', id, text: txt });
        renderChatLog(code);
      }
      pendingEditId = null;
      input.value = '';
      return;
    }
  });

  $('btn-return-call').onclick = () => showView('view-call');

  $('btn-mute').onclick = toggleMute;
  $('btn-deafen').onclick = toggleDeafen;
  $('btn-fx').onclick = cycleFx;
  $('btn-board').onclick = () => Board.open();
  $('btn-watch').onclick = () => {
    if (!call) return;
    if (watch) { closeWatch(); return; }
    $('watch-bar').classList.toggle('hidden');
    $('watch-url').focus();
  };
  $('btn-watch-go').onclick = () => {
    const u = $('watch-url').value.trim();
    if (!u) return;
    openWatch(u);
  };
  $('watch-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('btn-watch-go').click(); }
  });
  $('btn-watch-close').onclick = () => closeWatch();
  $('w-play').onclick = () => {
    if (watch && watch.host) { watch.playing = !watch.playing; setWatchPlaying(watch.playing); }
  };

  $('btn-draw').onclick = toggleDraw;
  const scn = $('share-canvas');
  scn.addEventListener('pointerdown', (e) => {
    if (!drawOn || !sharingLocal) return;
    scn.setPointerCapture(e.pointerId);
    const pt = canvasPoint(e);
    liveStroke = { c: drawColor, w: 3, pts: [pt] };
    drawStroke(ctxOf(), liveStroke);
    sigSend({ t: 'draw', k: 'd', p: pt, c: drawColor, w: 3 });
  });
  scn.addEventListener('pointermove', (e) => {
    if (!liveStroke) return;
    const pt = canvasPoint(e);
    liveStroke.pts.push(pt);
    drawStroke(ctxOf(), liveStroke);
    const now = Date.now();
    if (now - lastNetDot > 45) {
      lastNetDot = now;
      sigSend({ t: 'draw', k: 'd', p: pt, c: liveStroke.c, w: liveStroke.w });
    }
  });
  const endStroke = () => {
    if (!liveStroke) return;
    allStrokes.push(liveStroke);
    sigSend({ t: 'draw', k: 's', pts: liveStroke.pts, c: liveStroke.c, w: liveStroke.w });
    liveStroke = null;
  };
  scn.addEventListener('pointerup', endStroke);
  scn.addEventListener('pointercancel', endStroke);
  scn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearAnnotations(true);
    toast('Annotations cleared');
  });
  $('btn-stats').onclick = () => {};
  $('btn-call-chat').onclick = () => { if (call) openChat(call.peerCode); };
  $('btn-share').onclick = () => {
    if (!call || !call.pc) return;
    sharingLocal ? stopShare() : openScreenPicker();
  };
  $('btn-hangup').onclick = hangUp;
  $('btn-notes').onclick = () => {
    if (!call) { toast('Notes live inside calls', 'err'); return; }
    const panel = $('notes-panel');
    if (panel.classList.contains('hidden')) {
      notesApplyLock = true;
      $('notes-text').value = notes[call.peerCode] || '';
      setTimeout(() => { notesApplyLock = false; }, 60);
    }
    panel.classList.toggle('hidden');
  };

  $('btn-voice').onclick = toggleVoiceRec;
  $('btn-attach').onclick = async () => {
    if (!chatOpen) return;
    const picked = await window.aero.pickFiles();
    for (const f of (picked || [])) {
      try {
        const ab = await window.aero.readFile(f.path);
        if (!ab) continue;
        const ext = (f.name.match(/\.([^.]+)$/) || [,''])[1].toLowerCase();
        const mimeMap = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', webm:'video/webm', mp4:'video/mp4', txt:'text/plain' };
        const kind = ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image' : 'file';
        sendAttachment(kind, new Blob([ab], { type: mimeMap[ext] || 'application/octet-stream' }), f.name);
      } catch { toast('Could not read ' + f.name, 'err'); }
    }
  };
  $('btn-reply-cancel').onclick = cancelReply;
  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pendingEditId) {
      pendingEditId = null;
      $('chat-input').value = '';
      toast('Edit cancelled');
    }
  });
  $('chat-input').addEventListener('input', () => {
    sendTyping();
    if (!chatOpen) return;
    drafts[chatOpen] = $('chat-input').value;
    clearTimeout(draftSaveTm);
    draftSaveTm = setTimeout(() => window.aero.setData('drafts', drafts), 500);
  });

  /* search */
  $('btn-chat-search').onclick = () => {
    const row = $('chat-search-row');
    row.classList.toggle('hidden');
    if (!row.classList.contains('hidden')) {
      $('chat-search').focus();
    } else {
      searchQuery = '';
      $('chat-search').value = '';
      if (chatOpen) renderChatLog(chatOpen);
    }
  };
  $('chat-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (chatOpen) renderChatLog(chatOpen);
  });
  $('btn-search-close').onclick = () => {
    searchQuery = '';
    $('chat-search').value = '';
    $('chat-search-row').classList.add('hidden');
    if (chatOpen) renderChatLog(chatOpen);
  };
  $('chat-search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('btn-search-close').click();
  });

  /* jump to latest */
  const logEl = $('chat-log');
  logEl.addEventListener('scroll', () => {
    const far = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight > 260;
    $('jump-btn').classList.toggle('hidden', !far);
  });
  $('jump-btn').onclick = () => logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });

  /* right-click menu: reply / copy */
  logEl.addEventListener('contextmenu', (e) => {
    const msgEl = e.target.closest('.msg');
    if (!msgEl || !msgEl.dataset.mid || !chatOpen) return;
    e.preventDefault();
    const entry = (chats[chatOpen] || []).find(c => c.id === msgEl.dataset.mid);
    if (entry) openCtxMenu(e.clientX, e.clientY, entry);
  });

  /* links open outside */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.msg-link');
    if (link && link.dataset.url) window.aero.openExternal(link.dataset.url);
  });

  /* emoji picker */
  const EMOJIS = ['😀','😂','🥲','😍','🤔','😎','😭','😡','🥳','😱','🤡','💀','👍','👎','🙏','👏','💪','🔥','💯','🎉','❤️','💜','💔','⭐','🍕','☕','🎮','🎧','😴','🤝','👀','🚀','🌈','⚡','✅','❌','🤖','👻','🎃','🐸'];
  const pop = $('emoji-pop');
  for (const em of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    b.onclick = () => {
      const inp = $('chat-input');
      const at = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
      inp.value = inp.value.slice(0, at) + em + inp.value.slice(at);
      inp.focus();
      pop.classList.add('hidden');
    };
    pop.appendChild(b);
  }
  $('btn-emoji').onclick = (e) => { e.stopPropagation(); pop.classList.toggle('hidden'); };
  document.addEventListener('click', (e) => {
    if (!pop.contains(e.target) && e.target !== $('btn-emoji')) pop.classList.add('hidden');
  });

  /* drag & drop + paste to send */
  const wrapEl = $('chat-log-wrap');
  ['dragenter', 'dragover'].forEach(ev => wrapEl.addEventListener(ev, (e) => {
    e.preventDefault();
    $('drop-hint').classList.remove('hidden');
  }));
  wrapEl.addEventListener('dragleave', (e) => {
    if (!wrapEl.contains(e.relatedTarget)) $('drop-hint').classList.add('hidden');
  });
  wrapEl.addEventListener('drop', (e) => {
    e.preventDefault();
    $('drop-hint').classList.add('hidden');
    handleDroppedFiles(e.dataTransfer.files);
  });
  $('chat-input').addEventListener('paste', (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.items : [])]
      .filter(it => it.kind === 'file')
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      handleDroppedFiles(files);
    }
  });

  window.aero.onNotifyClick((code) => {
    if (friendByCode(code)) openChat(code);
  });

  $('btn-board-add').onclick = async () => {
    const added = await window.aero.pickSounds();
    toast(added.length ? 'Added ' + added.length + ' sound(s)' : 'No files added', added.length ? 'ok' : '');
    Board.refresh();
  };
  $('btn-board-folder').onclick = () => window.aero.openSoundsFolder();
  $('btn-board-rec').onclick = () => toggleBoardRec('mic');
  $('btn-board-rec-pc').onclick = () => toggleBoardRec('pc');
  $('btn-board-close').onclick = () => { try { $('dlg-board').close(); } catch {} };
  $('board-vol').addEventListener('input', (e) => { settings.boardVol = Number(e.target.value); saveSettingsData(); });
  $('board-monitor').addEventListener('change', (e) => { settings.boardMonitor = e.target.checked; saveSettingsData(); });

  $('set-callvol').addEventListener('input', (e) => {
    settings.callVol = Number(e.target.value);
    document.getElementById('callvol-val').textContent = e.target.value;
    applyCallVolume();
  });
  $('set-gate').addEventListener('input', updateGateLabel);
  $('set-ring').addEventListener('change', (e) => {
    const t = RINGTONES[e.target.value];
    if (!t || !t.steps.length) return;
    let i = 0;
    const iv = setInterval(() => {
      if (i >= t.steps.length) { clearInterval(iv); return; }
      Sounds.blip(t.steps[i], t.dur, .09 * Sounds.vol());
      i++;
    }, 170);
  });
  $('set-ringvol').addEventListener('input', (e) => { $('ringvol-val').textContent = e.target.value; });
  $('set-ringvol').addEventListener('change', (e) => { settings.ringVol = Number(e.target.value); Sounds.blip([660], .08, .06 * Sounds.vol()); });
  $('set-speaker').addEventListener('change', (e) => {
    settings.speakerId = e.target.value;
    const ra = $('remote-audio');
    if (ra.setSinkId && settings.speakerId) ra.setSinkId(settings.speakerId).catch(() => {});
  });
  $('btn-mic-test').onclick = micTest;
  $('btn-open-received').onclick = () => window.aero.openReceivedFolder();
  $('btn-open-sounds').onclick = () => window.aero.openSoundsFolder();
  $('btn-open-logs').onclick = () => window.aero.openLogsFolder();
  $('btn-cl-close').onclick = () => { try { $('dlg-changelog').close(); } catch {} };
  $('btn-whatsnew').onclick = showChangelog;
  maybePromptChangelog().catch(() => {});

  /* activity sharing + profile backup */
  window.aero.onActivity((a) => { myActivity = String(a || ''); broadcastPresence(); renderFriends(); });
  const actCb = document.getElementById('set-activity');
  window.aero.getPrefs().then((pp) => { actCb.checked = !!pp.shareActivity; });
  actCb.addEventListener('change', async () => {
    await window.aero.setPref('shareActivity', actCb.checked);
    toast(actCb.checked ? 'Activity sharing ON' : 'Activity sharing OFF', 'ok');
  });
  document.getElementById('btn-profile-backup').onclick = async () => {
    const p2 = await window.aero.exportProfile();
    if (p2) toast('Backup saved: ' + p2.split('\\\\').pop(), 'ok'); else if (p2 === null) toast('Backup cancelled');
  };
  document.getElementById('btn-profile-restore').onclick = async () => {
    const r3 = await window.aero.importProfile();
    if (r3 && r3 !== 'ERROR') { toast('Profile restored - restarting', 'ok'); setTimeout(() => window.aero.relaunchApp(), 1200); }
    else if (r3 === 'ERROR') toast('Restore failed - invalid file?', 'err');
  };

  /* phone remote settings */
  const phoneCb = $('set-phone');
  window.aero.getPrefs().then((p) => {
    phoneCb.checked = !!p.phoneRemote;
    if (p.phoneRemote && p.lanUrl) {
      $('phone-url').textContent = p.lanUrl;
      $('phone-url').classList.remove('hidden');
    }
  });
  phoneCb.addEventListener('change', async () => {
    await window.aero.setPref('phoneRemote', phoneCb.checked);
    const p = await window.aero.getPrefs();
    if (phoneCb.checked && p.lanUrl) {
      $('phone-url').textContent = p.lanUrl + '   (same Wi-Fi)';
      try { if (typeof qrcode === 'function') { const qr = qrcode(0,'M'); qr.addData(p.lanUrl); qr.make(); const qi = document.getElementById('phone-qr'); qi.src = qr.createDataURL(6,10); qi.classList.remove('hidden'); } } catch (e) {}
      $('phone-url').classList.remove('hidden');
      toast('Phone remote ON — open the URL on your phone', 'ok');
    } else {
      $('phone-url').textContent = '';
      $('phone-url').classList.add('hidden');
    }
  });
  window.aero.onRemote(handleRemote);
  let updateReadyVersion = null;
  const markUpdateReady = (version) => {
    updateReadyVersion = version || true;
    $('btn-updates').textContent = 'Install now';
    $('btn-updates').classList.add('glow-btn');
  };
  /* rail + user panel */
  $('rail-home').onclick = () => { chatOpen = null; showView('view-home'); };
  $('rail-avatar').textContent = initials(identity.name);
  $('btn-settings2').onclick = openSettings;
  $('btn-up-mute').onclick = () => { if (call && call.state !== 'incoming') toggleMute(); else toast('Not in a call'); };
  $('home-code').textContent = identity.code;
  const doCopy = async () => {
    const ok = await window.aero.clipWrite(identity.code);
    toast(ok ? 'Your code copied: ' + identity.code : 'Copy failed — your code is ' + identity.code, ok ? 'ok' : 'err');
  };
  $('btn-copy-code').onclick = doCopy;
  $('btn-copy-code2').onclick = doCopy;
  $('btn-invite').onclick = async () => {
    const msg = 'Get GoonCall (free, no account): https://github.com/demon-of-fire/gooncall/releases/latest\nThen add me with my code: ' + identity.code;
    const ok = await window.aero.clipWrite(msg);
    toast(ok ? 'Invite copied — paste it to them' : 'Copy failed', ok ? 'ok' : 'err');
  };

  $('friend-filter').addEventListener('input', renderFriends);

  /* quick switcher */
  let swSel = 0;
  function openSwitcher() {
    const rows = [...friends].sort((a, b) => (a.nick || a.name).localeCompare(b.nick || b.name));
    const list = $('sw-list');
    const paint = (q) => {
      list.innerHTML = '';
      const f2 = rows.filter(f => ((f.nick || f.name) + f.code).toLowerCase().includes(q.toLowerCase()));
      f2.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'sw-row' + (i === 0 ? ' sel' : '');
        li.dataset.code = f.code;
        const av = document.createElement('span');
        av.className = 'sw-av';
        av.textContent = initials(f.nick || f.name);
        av.style.background = 'linear-gradient(135deg,hsl(' + ((f.hue != null) ? f.hue : 220) + ',62%,52%),hsl(' + (((f.hue != null) ? f.hue : 220) + 40) % 360 + ',62%,42%))';
        li.appendChild(av);
        li.appendChild(document.createTextNode(f.nick || f.name));
        const sst = document.createElement('span');
        sst.className = 'sw-status';
        sst.textContent = isOnline(f.code) ? 'online' : 'offline';
        li.appendChild(sst);
        li.onclick = () => { closeSwitcher(); openChat(f.code); };
        list.appendChild(li);
      });
      swSel = 0;
      return f2;
    };
    let current = paint('');
    const dlgS = $('dlg-switcher');
    if (typeof dlgS.showModal === 'function') dlgS.showModal(); else dlgS.setAttribute('open', '');
    $('sw-input').value = '';
    setTimeout(() => $('sw-input').focus(), 40);
    $('sw-input').oninput = (e2) => { current = paint(e2.target.value); };
    $('sw-input').onkeydown = (e2) => {
      if (e2.key === 'Escape') { closeSwitcher(); return; }
      if (e2.key === 'ArrowDown' || e2.key === 'ArrowUp') {
        e2.preventDefault();
        if (!current.length) return;
        swSel = (swSel + (e2.key === 'ArrowDown' ? 1 : current.length - 1)) % current.length;
        for (const [i, r] of [...list.children].entries()) r.classList.toggle('sel', i === swSel);
      } else if (e2.key === 'Enter') {
        e2.preventDefault();
        const row = list.children[swSel];
        if (row) { closeSwitcher(); openChat(row.dataset.code); }
      }
    };
    function closeSwitcher() { try { dlgS.close(); } catch {} }
  }

  window.addEventListener('keydown', (e) => {
    if (comboMatches(e, getBind('switcher'))) {
      e.preventDefault();
      if (!$('dlg-switcher').open) openSwitcher();
      else try { $('dlg-switcher').close(); } catch {}
    }
  });

  window.addEventListener('keydown', (e) => {
    if (comboMatches(e, getBind('switcher'))) {
      e.preventDefault();
      if (!$('dlg-switcher').open) openSwitcher();
      else try { $('dlg-switcher').close(); } catch {}
    }
  });

  $('btn-nudge').onclick = () => {
    if (!chatOpen) return;
    sigSend({ t: 'bump' });
    document.body.classList.add('nudged');
    setTimeout(() => document.body.classList.remove('nudged'), 500);
    Sounds.blip([180, 240, 180], .12, .07);
    toast('Nudged ' + displayName(chatOpen));
  };

  /* quote jump */
  $('chat-log').addEventListener('click', (e) => {
    const q = e.target.closest('.quote');
    if (!q || !q.dataset.qid) return;
    const row = document.querySelector('.msg[data-mid="' + q.dataset.qid + '"]');
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.transition = 'background .2s';
      row.style.background = 'rgba(88,101,242,.25)';
      setTimeout(() => { row.style.background = ''; }, 1200);
    }
  });

  /* whiteboard + snip dock buttons */
  $('btn-wb').onclick = toggleWhiteboard;
  $('btn-snip').onclick = snipAndSend;
  $('wb-canvas').addEventListener('pointerdown', (e) => {
    if (!wbOn) return;
    $('wb-canvas').setPointerCapture(e.pointerId);
    const r = $('wb-canvas').getBoundingClientRect();
    const pt = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    wbLive = { c: wbColor, w: 3, pts: [pt] };
    drawWbStroke(wctx(), wbLive);
    sigSend({ t: 'wb', k: 'd', p: pt, c: wbColor, w: 3 });
  });
  $('wb-canvas').addEventListener('pointermove', (e) => {
    if (!wbLive) return;
    const r = $('wb-canvas').getBoundingClientRect();
    const pt = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    wbLive.pts.push(pt);
    drawWbStroke(wctx(), wbLive);
    const now = Date.now();
    if (now - lastWbDot > 45) {
      lastWbDot = now;
      sigSend({ t: 'wb', k: 'd', p: pt, c: wbColor, w: 3 });
    }
  });
  const endWbStroke = () => {
    if (!wbLive) return;
    wbStrokes.push(wbLive);
    sigSend({ t: 'wb', k: 's', pts: wbLive.pts, c: wbLive.c, w: wbLive.w });
    wbLive = null;
  };
  $('wb-canvas').addEventListener('pointerup', endWbStroke);
  $('wb-canvas').addEventListener('pointercancel', endWbStroke);
  $('wb-canvas').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearWhiteboard(true);
  });

  /* board extras: export / import / stop all */
  $('btn-board-export').onclick = () => exportSoundPack();
  $('btn-board-import').onclick = async () => {
    const picked = await window.aero.pickFiles();
    for (const f of (picked || [])) {
      if (f.name.endsWith('.goonpack')) {
        try {
          const ab = await window.aero.readFile(f.path);
          await importGoonPack(new Blob([ab]));
        } catch {}
      }
    }
  };
  $('btn-stop-all').onclick = stopAllSounds;

  /* watch speed select */
  $('w-speed').addEventListener('change', (e) => {
    if (!watch || !watch.host) return;
    watchRate = Number(e.target.value) || 1;
    applyWatchRate();
    sigSend({ t: 'watch', k: 'rate', r: watchRate });
  });

  /* profile cards */
  $('chat-peer-av').onclick = () => { if (chatOpen) showProfile(chatOpen); };
  $('chat-peer-name').onclick = () => { if (chatOpen) showProfile(chatOpen); };
  $('up-avatar').onclick = () => showProfile(null);
  $('rail-home').ondblclick = () => showProfile(null);

  window.aero.onUpdateStatus((s) => {
    if (!s) return;
    if (s.kind === 'progress') {
      const b = $('btn-updates');
      b.textContent = 'Downloading ' + s.percent + '%';
      return;
    }
    if (s.status === 'downloaded') {
      toast('Update ready — restarting to install v' + s.version + '…', 'ok', true);
      window.aero.notify('GoonCall update ready', 'v' + s.version + ' — restarting to install');
      markUpdateReady(s.version);
    } else if (s.status === 'available' && s.kind === 'launch') {
      toast(s.message, '');
    }
  });
  $('btn-updates').onclick = async () => {
    const btn = $('btn-updates');
    if (updateReadyVersion) {
      btn.disabled = true;
      await window.aero.installUpdate();
      return;
    }
    const old = btn.textContent;
    btn.textContent = 'Checking…';
    btn.disabled = true;
    try {
      const r = await window.aero.checkForUpdates();
      toast(r.message || 'Unknown status', r.status === 'latest' ? 'ok' : r.status === 'error' || r.status === 'disabled' ? 'err' : '');
      if (r.status === 'downloaded') {
        updateReadyVersion = r.version;
        btn.textContent = 'Install now';
        toast('Click "Install now" to restart and apply', 'ok');
      } else if (r.status === 'available') {
        btn.textContent = 'Check again';
      } else {
        btn.textContent = old;
      }
    } catch (e) {
      toast('Update check failed: ' + String(e), 'err');
      btn.textContent = old;
    }
    btn.disabled = false;
  };

  window.aero.onHotkey((k) => {
    if (k === 'mute' && call && call.state !== 'incoming') toggleMute();
  });

  ['mousemove', 'mousedown', 'keydown', 'focus', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, bumpActivity, { passive: true }));

  applyCallVolume();
  initPeer();
  renderRequests();
  applyTheme();
  updateShortcutTooltips();
  setInterval(() => { sweepPresence(); renderChatStatus(); }, 20000);
  maybeOnboarding();
}

async function maybeOnboarding() {
  if (friends.length > 0) return;
  if (await window.aero.getData('seenOnboarding')) return;
  const d = $('dlg-onboarding');
  $('btn-onb-done').onclick = () => {
    window.aero.setData('seenOnboarding', true);
    try { d.close(); } catch {}
  };
  if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
}

boot().catch((err) => console.error('BOOT FAIL:', err && err.stack));
