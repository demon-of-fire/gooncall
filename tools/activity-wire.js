// Wires activity presence into app.js
const fs = require('fs');
let t = fs.readFileSync('renderer/app.js', 'utf8');
let n = 0;
const rep = (from, to) => { if (!t.includes(from)) { console.error('MISSING:', JSON.stringify(from.slice(0, 60))); process.exitCode = 1; return; } t = t.replace(from, to); n++; };

rep(
  "return { t: 'hello', name: identity.name, hue: identity.hue, status: identity.status || '', idle: isIdle, avv: identity.avv || 0 };",
  "return { t: 'hello', name: identity.name, hue: identity.hue, status: identity.status || '', idle: isIdle, avv: identity.avv || 0, act: currentAct() };"
);
rep(
  "const msg = { t: 'presence', idle: isIdle, status: identity.status || '' };",
  "const msg = { t: 'presence', idle: isIdle, status: identity.status || '', act: currentAct() };"
);
rep(
  "peerState[code] = { idle: !!m.idle, status: String(m.status || '').slice(0, 80) };\n      const f = friendByCode(code);",
  "peerState[code] = { idle: !!m.idle, status: String(m.status || '').slice(0, 80), act: String(m.act || '').slice(0, 60) };\n      const f = friendByCode(code);"
);
rep(
  "case 'presence': {\n      peerState[code] = { idle: !!m.idle, status: String(m.status || '').slice(0, 80) };",
  "case 'presence': {\n      peerState[code] = { idle: !!m.idle, status: String(m.status || '').slice(0, 80), act: String(m.act || '').slice(0, 60) };"
);
rep(
  "function helloPayload() {",
  "function currentAct() {\n  if (typeof watch !== 'undefined' && watch) return '\\uD83D\\uDCFA Watching together';\n  return myActivity || '';\n}\n\nfunction helloPayload() {"
);
rep(
  "window.addEventListener('focus', () => {",
  "window.aero.onActivity((a) => {\n  myActivity = String(a || '');\n  broadcastPresence();\n  renderFriends();\n});\n\nwindow.addEventListener('focus', () => {"
);

fs.writeFileSync('renderer/app.js', t);
console.log('activity wired,', n, 'replacements');
