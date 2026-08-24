// Replaces renderLocalTile + renderRemoteTile (+ stray code2name) with
// background-image-aware versions that never wipe their child spans.
const fs = require('fs');
let s = fs.readFileSync('renderer/app.js', 'utf8');

const L = s.indexOf('function renderLocalTile() {');
const END = s.indexOf('\nfunction toggleDeafen()', L);
if (L < 0 || END < 0) { console.error('anchors missing', { L, END }); process.exit(1); }

const rep = [
  'function renderLocalTile() {',
  '  const nm = document.getElementById(\'av-local-name\');',
  '  if (nm) nm.textContent = identity.avatar ? \'\' : initials(identity.name);',
  '  const t = document.getElementById(\'av-local\');',
  '  if (t) {',
  '    t.style.backgroundImage = identity.avatar ? \'url(\' + identity.avatar + \')\' : \'\';',
  '    t.style.backgroundSize = \'cover\';',
  '  }',
  '  const tl = document.getElementById(\'tile-local-name\');',
  '  if (tl) tl.textContent = identity.name;',
  '}',
  '',
  'function renderRemoteTile() {',
  '  if (!call) return;',
  '  const f = friendByCode(call.peerCode);',
  '  const hue = (f && f.hue != null) ? f.hue : 220;',
  '  const t = document.getElementById(\'av-remote\');',
  '  if (t) {',
  '    t.style.backgroundImage = (f && f.av) ? \'url(\' + f.av + \')\' : \'\';',
  '    t.style.backgroundSize = \'cover\';',
  '  } else if (!hue) {}',
  '  const nm2 = document.getElementById(\'av-remote-name\');',
  '  if (nm2) nm2.textContent = (f && f.av) ? \'\' : initials(displayName(call.peerCode));',
  '  const rn = document.querySelector(\'#av-remote .tile-name\');',
  '  if (rn) rn.textContent = displayName(call.peerCode);',
  '  const chips = [];',
  '  if (!remoteMicOn) chips.push(\'muted\');',
  '  if (remoteDeafened) chips.push(\'deafened\');',
  '  const sub = document.getElementById(\'av-remote-sub\');',
  '  if (sub) sub.textContent = chips.join(\' \\u00b7 \');',
  '  if (sub) sub.classList.toggle(\'visible\', chips.length > 0);',
  '}'
].join('\n');

s = s.slice(0, L) + rep + s.slice(END);
fs.writeFileSync('renderer/app.js', s);
console.log('tiles rewritten');
