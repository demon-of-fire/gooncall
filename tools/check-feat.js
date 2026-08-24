const s = require('fs').readFileSync('renderer/app.js', 'utf8');
const checks = {
  'pins default': s.includes('pins: {}'),
  'boardKeys setting': s.includes('boardKeys'),
  'ptt checkbox ref': s.includes('set-ptt'),
  'callvol slider ref': s.includes('set-callvol'),
  'applyCallVolume fn': s.includes('function applyCallVolume'),
  'stopSounds SC': s.includes("stopSounds: '"),
  'pttHeld logic': s.includes('pttHeld'),
  'QR render': s.includes('createDataURL'),
  'chat export binding': s.includes('btn-chat-export'),
  'startEdit fn': s.includes('function startEdit'),
  'pendingEditId': s.includes('pendingEditId'),
  'onData edit case': s.includes("case 'edit'"),
  'edited suffix': s.includes('edited')
};
for (const k in checks) console.log((checks[k] ? '[x]' : '[ ]'), k);
