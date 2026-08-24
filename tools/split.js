// One-shot splitter: extracts soundboard + call-tools sections from app.js
// into js/board.js and js/calltools.js (window-global functions, classic scripts).
const fs = require('fs');
const path = require('path');
const R = p => fs.readFileSync(p, 'utf8');
const W = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); console.log('wrote', p, c.length + ' chars'); };

let core = R('renderer/app.js');

const B_START = 'async function toggleBoardRec() {';
const T_START = '/* ============ watch party ============ */';
const P_START = 'async function openScreenPicker() {';

const b1 = core.indexOf(B_START);
const t1 = core.indexOf(T_START);
const p1 = core.indexOf(P_START);
if (b1 < 0 || t1 < 0 || p1 < 0 || !(b1 < t1 && t1 < p1)) {
  console.error('anchors wrong', { b1, t1, p1 });
  process.exit(1);
}

const boardBody = core.slice(b1, t1);
const toolsBody = core.slice(t1, p1);
core = core.slice(0, b1) + core.slice(p1);

W('renderer/js/board.js',
  "'use strict';\n/* Soundboard module — Board UI, recording, pack export/import.\n" +
  "   Depends on globals from app.js: settings, chats, call, chatOpen, mix,\n" +
  "   duckMic, playSoundFile, u8ToB64, toast, displayName, sigSend. */\n\n" +
  boardBody.replace(/\r\n/g, '\n') + '\n');

W('renderer/js/calltools.js',
  "'use strict';\n/* Call tools — watch party, screen annotations, whiteboard, quick snip,\n" +
  "   sound-pack receive hook.\n" +
  "   Depends on globals from app.js: call, chatOpen, watch vars moved here,\n" +
  "   sharingLocal, remoteSharing, applyStage, maybeClearShareVideo, sigSend,\n"  +
  "   sendAttachment, toast, displayName, openChat, yt helpers included below. */\n\n" +
  toolsBody.replace(/\r\n/g, '\n') + '\n');

W('renderer/app.js', core);
console.log('core now', core.length, 'chars');
