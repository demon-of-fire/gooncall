const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

'use strict';
/* Soundboard module — Board UI, recording, pack export/import.
   Depends on globals from app.js: settings, chats, call, chatOpen, mix,
   duckMic, playSoundFile, u8ToB64, toast, displayName, sigSend. */

async function toggleBoardRec(mode) {
  mode = mode || 'mic';
  const btnId = mode === 'pc' ? 'btn-board-rec-pc' : 'btn-board-rec';
  const btn = document.getElementById(btnId);
  if (boardRec && boardRec.state === 'recording') { try { boardRec.stop(); } catch (e) {} return; }

  // 3-2-1 countdown so you have time to line up the sound
  const ov = document.createElement('div');
  ov.id = 'rec-overlay';
  document.body.appendChild(ov);
  for (const n of [3, 2, 1]) {
    ov.innerHTML = '<span class="rec-num">' + n + '</span>';
    Sounds.blip([480 + n * 120], 0.09, 0.08);
    await sleep(750);
  }
  ov.innerHTML = '<span class="rec-num">REC</span>';
  Sounds.blip([980], 0.12, 0.09);

  let stream;
  try {
    if (mode === 'pc') {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop' } }
      });
    } else {
      stream = (call && call.micStream) ? new MediaStream(call.micStream.getAudioTracks()) : await getMic();
    }
  } catch (err) {
    ov.remove();
    toast(mode === 'pc' ? 'PC-audio capture unavailable here' : 'Microphone unavailable', 'err');
    return;
  }
  setTimeout(() => { try { ov.remove(); } catch (e) {} }, 500);

  const chunks = [];
  const recT0 = Date.now();
  boardRec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
  boardRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  boardRec.onstop = async () => {
    clearInterval(recTickIv);
    stream.getTracks().forEach((t) => t.stop());
    btn.classList.remove('rec');
    btn.textContent = mode === 'pc' ? '\u25CF PC' : '\u25CF Mic';
    const blob = new Blob(chunks, { type: 'audio/webm' });
    if (blob.size < 1500) { toast('Too short - nothing recorded'); return; }
    openClipEditor(blob, mode);
  };
  boardRec.start();
  recTickIv = setInterval(() => {
    btn.textContent = '\u25A0 REC ' + ((Date.now() - recT0) / 1000).toFixed(0) + 's';
  }, 300);
}

/* ---------- clip review / trim / save ---------- */
const ClipEdit = {
  ctx: null, buf: null, blob: null, mode: 'mic',
  start: 0, end: 0
};

async function openClipEditor(blob, mode) {
  ClipEdit.blob = blob;
  ClipEdit.mode = mode;
  ClipEdit.ctx = new AudioContext();
  const ab = await blob.arrayBuffer();
  try {
    ClipEdit.buf = await ClipEdit.ctx.decodeAudioData(ab.slice(0));
  } catch (e) { toast('Could not decode recording', 'err'); return; }
  ClipEdit.start = 0;
  ClipEdit.end = ClipEdit.buf.duration;

  document.getElementById('clip-audio').src = URL.createObjectURL(blob);
  document.getElementById('clip-start-lbl').textContent = '0.00s';
  document.getElementById('clip-end-lbl').textContent = ClipEdit.buf.duration.toFixed(2) + 's';
  const dlg = document.getElementById('dlg-clipedit');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

function fmtClipSec(s) { return Number(s).toFixed(2) + 's'; }

function sliceBuffer(ctx, buf, startSec, endSec) {
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(startSec * sr));
  const e0 = Math.min(buf.length, Math.ceil(endSec * sr));
  const len = Math.max(1, e0 - s0);
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    out.getChannelData(c).set(src.subarray(s0, s0 + len));
  }
  return out;
}

function bufferToWavBlob(buf) {
  const sr = buf.sampleRate;
  const n = buf.length;
  const bytes = 44 + n * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const wstr = (off, st) => { for (let i = 0; i < st.length; i++) v.setUint8(off + i, st.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wstr(36, 'data'); v.setUint32(40, n * 2, true);
  const d = buf.getChannelData(0);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const sv = Math.max(-1, Math.min(1, d[i]));
    v.setInt16(off, Math.round(sv * 32767), true); off += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

async function previewCut() {
  if (!ClipEdit.buf) return;
  const sliced = sliceBuffer(ClipEdit.ctx, ClipEdit.buf, ClipEdit.start, ClipEdit.end);
  const srcN = ClipEdit.ctx.createBufferSource();
  srcN.buffer = sliced;
  srcN.connect(ClipEdit.ctx.destination);
  srcN.start();
}

async function saveCutClip() {
  if (!ClipEdit.buf) return;
  const sliced = sliceBuffer(ClipEdit.ctx, ClipEdit.buf, ClipEdit.start, ClipEdit.end);
  const wav = bufferToWavBlob(sliced);
  const name = (ClipEdit.mode === 'pc' ? 'sys-' : 'clip-') + Date.now() + '.wav';
  const ab = await wav.arrayBuffer();
  await window.aero.saveSound(name, ab);
  Board.refresh();
  try { document.getElementById('dlg-clipedit').close(); } catch (e) {}
  if (ClipEdit.ctx) { try { ClipEdit.ctx.close(); } catch (e) {} }
  ClipEdit.ctx = null; ClipEdit.buf = null; ClipEdit.blob = null;
  toast('Saved to board: ' + name, 'ok');
}

function discardClip() {
  try { document.getElementById('dlg-clipedit').close(); } catch (e) {}
  if (ClipEdit.ctx) { try { ClipEdit.ctx.close(); } catch (e) {} }
  ClipEdit.ctx = null; ClipEdit.buf = null; ClipEdit.blob = null;
  toast('Recording discarded');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('clip-set-start').onclick = () => {
    const a = document.getElementById('clip-audio');
    if (!a) return;
    ClipEdit.start = Math.max(0, Math.min(a.currentTime, (ClipEdit.buf ? ClipEdit.buf.duration : 0)));
    document.getElementById('clip-start-lbl').textContent = fmtClipSec(ClipEdit.start);
  };
  document.getElementById('clip-set-end').onclick = () => {
    const a = document.getElementById('clip-audio');
    if (!a) return;
    const maxDur = ClipEdit.buf ? ClipEdit.buf.duration : a.duration || 0;
    ClipEdit.end = Math.min(maxDur, Math.max(a.currentTime, ClipEdit.start + 0.05));
    document.getElementById('clip-end-lbl').textContent = fmtClipSec(ClipEdit.end);
  };
  document.getElementById('clip-preview').onclick = previewCut;
  document.getElementById('clip-save').onclick = saveCutClip;
  document.getElementById('clip-discard').onclick = discardClip;
});



/* ---- soundboard UI ---- */

let assignMode = false;
let pendingKeyTile = null;
function bindTileKey(name) {
  pendingKeyTile = name;
  toast('Press any key to bind to: ' + name.replace(/\\.[^.]+$/, '') + ' (Esc cancels)');
}

const Board = {
  files: [],
  async refresh() {
    this.files = (await window.aero.listSounds()) || [];
    this.renderGrid();
  },
  renderGrid() {
    const grid = $('board-grid');
    grid.innerHTML = '';
    if (!this.files.length) {
      grid.innerHTML = '<div class="snd-empty">No sounds yet.<br>Record with <b>Record mic</b>, click <b>+ Add sounds</b>, or drop files into the sounds folder.<br>Unlimited clips &mdash; first 10 get hotkeys.</div>';
      return;
    }
    this.files.forEach((f, i) => {
      const tile = document.createElement('button');
      tile.className = 'snd-tile';
      tile.title = f.name;
      let key = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
      const overrides = (typeof settings !== 'undefined' && settings.boardKeys) || {};
      for (const [nm, kk] of Object.entries(overrides)) {
        if (nm === f.name && kk) { key = kk; break; }
      }
      tile.innerHTML =
      '<span class="snd-key">' + key + '</span>' +
      '<span class="snd-play">&#x266A;</span>' +
      '<span class="snd-name">' + escapeHtml(f.name.replace(/\.[^.]+$/, '')) + '</span>' +
      '<span class="snd-del" title="Delete">&#x2715;</span>';
    tile.title = 'Click: play into call · Shift+click: play on their speakers';
    if (typeof assignMode !== 'undefined' && assignMode) tile.title += ' - press a key to bind';
    tile.onclick = (e) => {
      if (e.target.classList.contains('snd-del')) {
        window.aero.deleteSound(f.name).then(() => this.refresh());
        toast('Deleted ' + f.name);
        return;
      }
      if (e.shiftKey && call) {
        // prank mode: fires on their machine's speakers
        sigSend({ t: 'prank', name: f.name });
        toast('Sent to ' + displayName(call.peerCode) + "'s speakers 😈");
        return;
      }
      if (typeof assignMode !== 'undefined' && assignMode) {
        bindTileKey(f.name);
        return;
      }
      const route = call ? 'into the call' : 'locally (no active call)';
      playSoundFile(f.name).then(r => { if (r === 'missing') toast('Clip file missing', 'err'); });
      void route;
    };
    grid.appendChild(tile);
  });
  },
  async open() {
    await this.refresh();
    $('board-vol').value = settings.boardVol;
    $('board-monitor').checked = !!settings.boardMonitor;
    const dlg = $('dlg-board');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
};


