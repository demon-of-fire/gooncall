// Adds renderer wiring for: ptt, callVol, stopSounds SC, QR render, chat export,
// message edit flow. Idempotent-ish: anchors must exist exactly once.
const fs = require('fs');
let t = fs.readFileSync('renderer/app.js', 'utf8');
let n = 0;
const rep = (from, to) => {
  if (!t.includes(from)) { console.error('MISSING:', JSON.stringify(from.slice(0, 70))); process.exitCode = 1; return; }
  t = t.replace(from, to); n++;
};

/* settings model additions */
rep(
  "  pins: {}\n};",
  "  pins: {},\n  boardKeys: {},\n  ptt: false,\n  callVol: 100\n};"
);

/* load */
rep(
  "  notes = (await window.aero.getData('notes')) || {};",
  "  notes = (await window.aero.getData('notes')) || {};\n  const st2 = (await window.aero.getData('settings')) || {};\n  if (st2.ptt !== undefined) settings.ptt = !!st2.ptt;\n  if (st2.callVol !== undefined) settings.callVol = Number(st2.callVol);"
);

/* SC registry */
rep("  snip: 'Ctrl+Shift+A',", "  snip: 'Ctrl+Shift+A',\n  stopSounds: 'Ctrl+Shift+O',");
rep("  ['snip', 'Quick screenshot'],", "  ['snip', 'Quick screenshot'],\n  ['stopSounds', 'Stop all sounds'],");

/* handler: stop sounds + ptt hold */
rep(
  "  if (comboMatches(e, getBind('mute'))) { toggleMute(); return; }",
`  if (comboMatches(e, getBind('stopSounds'))) { stopAllSounds(); return; }
  if (comboMatches(e, getBind('mute')) && !settings.ptt) { toggleMute(); return; }`
);

/* keydown top: push-to-talk hold (before typingInField guard) */
rep(
  "  if (typingInField()) return;\n\n  const k = e.key.toLowerCase();".replace('const k', 'const kk'),
  'PLACEHOLDER-NEVER'
);
rep(
  "  if (typingInField()) return;",
`  if (settings.ptt && e.code === 'Space' && !e.repeat && call && call.state !== 'incoming' && !$('dlg-incoming').open) {
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

  if (typingInField()) return;`
);

/* keyup release */
rep(
  "window.addEventListener('keyup', () => {});",
`window.addEventListener('keyup', (e) => {
  if (settings.ptt && pttHeld && e.code === 'Space') {
    pttHeld = false;
    if (call && call.micStream) {
      const tr = call.micStream.getAudioTracks()[0];
      if (tr) { tr.enabled = false; sigSend({ t: 'ctrl', k: 'mic', on: false }); }
    }
    const mb = document.getElementById('btn-mute');
    if (mb) { mb.classList.add('off'); mb.classList.remove('on'); mb.querySelector('i').textContent = 'PTT'; }
  }
});`
);

/* gate plain M when ptt on is handled by the comboMatches condition above */

/* call volume apply helper + boot init */
rep(
  "function toggleMute() {",
`function applyCallVolume() {
  const ra = document.getElementById('remote-audio');
  if (ra) ra.volume = Math.max(0, Math.min(1, ((Number(settings.callVol) || 100)) / 100));
}

function toggleMute() {`
);
rep(
  "  initPeer();\n  renderRequests();",
  "  applyCallVolume();\n  initPeer();\n  renderRequests();"
);

/* settings open/save for new fields */
rep(
  "  $('set-ringvol').value = settings.ringVol;",
  "  $('set-callvol').value = settings.callVol;\n  $('callvol-val').textContent = settings.callVol;\n  $('set-ptt').checked = !!settings.ptt;\n  $('set-ringvol').value = settings.ringVol;"
);
rep(
  "  settings.notifyMsgs = $('set-notifs').checked;",
  "  settings.notifyMsgs = $('set-notifs').checked;\n  settings.ptt = $('set-ptt').checked;\n  settings.callVol = Number($('set-callvol').value) || 100;"
);
rep(
  "  $('set-gate').addEventListener('input', updateGateLabel);",
`  $('set-callvol').addEventListener('input', (e) => {
    settings.callVol = Number(e.target.value);
    document.getElementById('callvol-val').textContent = e.target.value;
    applyCallVolume();
  });
  $('set-gate').addEventListener('input', updateGateLabel);`
);

/* QR render in phone settings refresh */
rep(
"    if (p.phoneRemote && p.lanUrl) {\n      $('phone-url').textContent = p.lanUrl;",
`    if (p.phoneRemote && p.lanUrl) {
      $('phone-url').textContent = p.lanUrl;
      try {
        if (typeof qrcode === 'function') {
          const qr = qrcode(0, 'M');
          qr.addData(p.lanUrl);
          qr.make();
          const img = document.getElementById('phone-qr');
          img.src = qr.createDataURL(6, 10);
          img.classList.remove('hidden');
        }
      } catch (e) {}
    } else {
      const q = document.getElementById('phone-qr');
      if (q) q.classList.add('hidden');`
);
rep(
"      $('phone-url').classList.remove('hidden');\n      toast('Phone remote ON",
"      $('phone-url').classList.remove('hidden');\n      toast('Phone remote ON"
);
rep(
"      $('phone-url').textContent = p.lanUrl + '   (same Wi-Fi, open in phone browser)';",
"      $('phone-url').textContent = p.lanUrl + '   (same Wi-Fi)';\n      try { if (typeof qrcode === 'function') { const qr = qrcode(0,'M'); qr.addData(p.lanUrl); qr.make(); const qi = document.getElementById('phone-qr'); qi.src = qr.createDataURL(6,10); qi.classList.remove('hidden'); } } catch (e) {}"
);

/* chat export button */
rep(
  "  $('btn-chat-clear').onclick = clearChatClicked;",
  "  $('btn-chat-export').onclick = () => {\n    if (!chatOpen) return;\n    const items = chats[chatOpen] || [];\n    let h = '<html><head><meta charset=\"utf-8\"><title>Chat with ' + escapeHtml(displayName(chatOpen)) + '</title>' +\n      '<style>body{font-family:Segoe UI,sans-serif;background:#1e1f22;color:#dbdee1;padding:24px;line-height:1.6}' +\n      '.m{margin-bottom:12px}.who{font-weight:700;color:#7983f5}.when{color:#949ba4;font-size:11px}</style></head><body>' +\n      '<h1>Chat with ' + escapeHtml(displayName(chatOpen)) + '</h1>';\n    for (const it of items) {\n      const d = new Date(it.ts || Date.now());\n      h += '<div class=\"m\"><span class=\"who\">' + escapeHtml(it.me ? identity.name : displayName(chatOpen)) + '</span> ' +\n        '<span class=\"when\">' + d.toLocaleString() + '</span><br>' + escapeHtml(it.text || ('[' + (it.kind || 'file') + ']')) + '</div>';\n    }\n    h += '</body></html>';\n    window.aero.exportChat(h, 'gooncall-chat-' + displayName(chatOpen)).then((p2) => {\n      if (p2) toast('Exported: ' + p2.split('\\\\').pop(), 'ok');\n    });\n  };"
);

/* message editing */
rep(
  "let replyTarget = null;",
  "let replyTarget = null;\nlet pendingEditId = null;"
);
rep(
  "  add('\\u21A9  Reply', () => startReply(chatOpen, entry));",
  "  if (entry.me && entry.text && !entry.deleted) add('\\u270E  Edit', () => startEdit(chatOpen, entry));\n  add('\\u21A9  Reply', () => startReply(chatOpen, entry));"
);
rep(
  "let replyTarget = null;",
`function startEdit(code, entry) {
  if (chatOpen !== code || !entry.me || entry.kind) return;
  pendingEditId = entry.id;
  document.getElementById('chat-input').value = entry.text || '';
  document.getElementById('chat-input').focus();
  toast('Editing - Enter to save, Esc to cancel');
}`
);
rep(
  "    if (sendChat(txt)) input.value = '';",
`    if (pendingEditId) {
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
    }`
);
rep(
"    case 'edit': {",
`    case 'edit': {
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
    case 'edit-old-marker':`
);
rep(
"    tm.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });",
"    tm.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (it.edited ? ' \\u00b7 edited' : '');"
);
rep(
"  window.addEventListener('keydown', (e) => {\n    if (typingInField()) return;\n    const k = e.key.toLowerCase();",
"  window.addEventListener('keydown', (e) => {\n    if (pendingEditId && e.key === 'Escape') { pendingEditId = null; document.getElementById('chat-input').value = ''; toast('Edit cancelled'); return; }\n    if (typingInField()) return;\n    const k = e.key.toLowerCase();"
);

fs.writeFileSync('renderer/app.js', t);
console.log('app.js feature wiring done,', n, 'replacements');
