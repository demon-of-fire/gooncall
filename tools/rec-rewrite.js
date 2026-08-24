// Rewrites toggleBoardRec with countdown/timer + adds clip editor pipeline.
const fs = require('fs');
let s = fs.readFileSync('renderer/js/board.js', 'utf8');

const START = s.indexOf('async function toggleBoardRec(');
const END = s.length;
if (START < 0 || END < 0 || END < START) { console.error('anchors missing'); process.exit(1); }

const replacement = `async function toggleBoardRec(mode) {
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
    btn.textContent = mode === 'pc' ? '\\u25CF PC' : '\\u25CF Mic';
    const blob = new Blob(chunks, { type: 'audio/webm' });
    if (blob.size < 1500) { toast('Too short - nothing recorded'); return; }
    openClipEditor(blob, mode);
  };
  boardRec.start();
  recTickIv = setInterval(() => {
    btn.textContent = '\\u25A0 REC ' + ((Date.now() - recT0) / 1000).toFixed(0) + 's';
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

`;

fs.writeFileSync('renderer/js/board.js', s.slice(0, START) + replacement + '\n');
console.log('board.js recording rewritten');
