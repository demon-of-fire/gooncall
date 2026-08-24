'use strict';
/* Soundboard module — Board UI, recording, pack export/import.
   Depends on globals from app.js: settings, chats, call, chatOpen, mix,
   duckMic, playSoundFile, u8ToB64, toast, displayName, sigSend. */

async function toggleBoardRec(mode) {
  mode = mode || 'mic';
  const btnId = mode === 'pc' ? 'btn-board-rec-pc' : 'btn-board-rec';
  const btn = $(btnId);
  if (boardRec && boardRec.state === 'recording') { try { boardRec.stop(); } catch {} return; }
  let stream;
  try {
    if (mode === 'pc') {
      // capture whatever your PC is playing right now
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop' } }
      });
    } else {
      stream = (call && call.micStream) ? new MediaStream(call.micStream.getAudioTracks()) : await getMic();
    }
  } catch (err) {
    toast(mode === 'pc' ? 'PC-audio capture unavailable here' : 'Microphone unavailable', 'err');
    return;
  }
  const chunks = [];
  try {
    boardRec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
  } catch { toast('Recording not supported', 'err'); return; }
  boardRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  boardRec.onstop = async () => {
    btn.textContent = mode === 'pc' ? '\u25CF PC' : '\u25CF Mic';
    btn.classList.remove('rec');
    const other = $(mode === 'pc' ? 'btn-board-rec' : 'btn-board-rec-pc');
    if (other && !other.classList.contains('rec')) other.disabled = false;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    if (blob.size < 1500) { toast('Too short - nothing saved'); return; }
    const name = (mode === 'pc' ? 'sys-' : 'clip-') + Date.now() + '.webm';
    const ab = await blob.arrayBuffer();
    await window.aero.saveSound(name, ab);
    Board.refresh();
    toast('Saved to board: ' + name, 'ok');
  };
  boardRec.start();
  // lock the sibling button so two recorders never fight over the same device
  const sib = $(mode === 'pc' ? 'btn-board-rec' : 'btn-board-rec-pc');
  if (sib) sib.disabled = true;
  btn.classList.add('rec');
  btn.textContent = '\u25A0 Stop rec';
}

/* ---- soundboard UI ---- */
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
      const key = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
    tile.innerHTML =
      '<span class="snd-key">' + key + '</span>' +
      '<span class="snd-play">&#x266A;</span>' +
      '<span class="snd-name">' + escapeHtml(f.name.replace(/\.[^.]+$/, '')) + '</span>' +
      '<span class="snd-del" title="Delete">&#x2715;</span>';
    tile.title = 'Click: play into call · Shift+click: play on their speakers';
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

