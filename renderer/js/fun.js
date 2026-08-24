'use strict';
/* GoonCall fun pack — emoji rain, shared notes, phone-remote command handling,
   per-friend voice FX presets, talk stats. Loaded after app.js; everything runs
   off the same global realm so core functions are directly callable. */

/* ---------- talk stats ---------- */
const FunStats = {
  data: null,
  async load() {
    this.data = (await window.aero.getData('funstats')) || { mins: 0, calls: 0, sounds: 0, nudges: 0 };
    return this.data;
  },
  save() { window.aero.setData('funstats', this.data); },
  addCall(dur) { this.data.calls++; this.data.mins += Math.round(dur / 60); this.save(); },
  addSound() { this.data.sounds++; this.save(); },
  addNudge() { this.data.nudges++; this.save(); }
};

/* ---------- emoji rain ---------- */
function rainEmoji(emoji) {
  const layer = $('rain-layer');
  if (!layer || document.hidden) return;
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'rain-drop';
    s.textContent = emoji;
    s.style.left = (5 + Math.random() * 90) + '%';
    s.style.animationDelay = (Math.random() * 0.4) + 's';
    s.style.fontSize = (18 + Math.random() * 22) + 'px';
    layer.appendChild(s);
    setTimeout(() => s.remove(), 2600);
  }
}

/* ---------- shared notes ---------- */
let notesApplyLock = false;
let notesSendTm = null;

function wireNotes() {
  const ta = $('notes-text');
  if (!ta) return;
  ta.addEventListener('input', () => {
    if (notesApplyLock) return;
    clearTimeout(notesSendTm);
    notesSendTm = setTimeout(() => {
      sigSend({ t: 'notes', text: ta.value.slice(0, 8000) });
    }, 350);
  });
}

function applyRemoteNotes(text) {
  const ta = $('notes-text');
  if (!ta) return;
  notesApplyLock = true;
  ta.value = String(text || '');
  setTimeout(() => { notesApplyLock = false; }, 50);
}

/* ---------- per-friend FX preset ---------- */
function applyFriendFx(code) {
  const f = friendByCode(code);
  if (f && f.fxAuto && FX_ORDER.includes(f.fxAuto)) {
    settings.fx = f.fxAuto;
    saveSettingsData();
    $('fx-label').textContent = FX_LABELS[f.fxAuto] || 'Clean';
    $('btn-fx').classList.toggle('active', f.fxAuto !== 'none');
  } else {
    settings.fx = 'none';
    $('fx-label').textContent = 'Clean';
    $('btn-fx').classList.remove('active');
  }
}

/* ---------- phone remote commands ---------- */
const REMOTE_HANDLERS = {
  play: (name) => playSoundFile(String(name || ''), {}).then(r => FunStats.addSound()),
  stopall: () => stopAllSounds(),
  nudge: () => { sigSend({ t: 'bump' }); FunStats.addNudge(); },
  mute: () => toggleMute(),
  deafen: () => toggleDeafen(),
  share: () => { sharingLocal ? stopShare() : openScreenPicker(); },
  join: () => { if ($('dlg-incoming').open) acceptIncoming(); }
};

function handleRemote(cmd) {
  if (!cmd || !cmd.a) return;
  const h = REMOTE_HANDLERS[cmd.a];
  if (h) h(cmd.name);
}

/* ---------- init ---------- */
FunStats.load().then(() => {});

window.Fun = {
  statCall: (dur) => { FunStats.addCall(dur); },
  statSound: () => FunStats.addSound(),
  rain: rainEmoji
};

document.addEventListener('DOMContentLoaded', wireNotes);

window.addEventListener('keydown', (e) => {
  if (comboMatches(e, getBind('snip'))) { e.preventDefault(); snipAndSend(); }
});
