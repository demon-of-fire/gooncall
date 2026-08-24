// Cleans up the conn-close handler: stalled transfer failover done right.
const fs = require('fs');
let s = fs.readFileSync('renderer/app.js', 'utf8');

const bad = `    // fail any in-flight transfers to this peer so they don't hang at 47%
    for (const [id, x] of [...xfersIn.entries()]) {
      if (x.code !== code) continue;
      if (x.disk) window.aero.xferAbort(id);
      xfersIn.delete(id);
      const entry = (chats[code] || []).find(c => c.id === id);
      if (entry && entry.xfer) {
        delete entry.xfer;
        entry.failed = true;
        saveChats();
        if (chatOpen === code) renderChatLog(code);
      }
    }
    for (const [id] of Object.entries({})) {}
    for (const id of Object.keys(xfersOut)) {
      const meta = (chats[call ? call.peerCode : ''] || []);
      void meta;
    }
`;

const good = `    // fail any in-flight transfers to this peer so they don't hang forever
    for (const [id, x] of [...xfersIn.entries()]) {
      if (x.code !== code) continue;
      if (x.disk) window.aero.xferAbort(id);
      xfersIn.delete(id);
      const entry = (chats[code] || []).find(c => c.id === id);
      if (entry && entry.xfer) {
        delete entry.xfer;
        entry.failed = true;
        saveChats();
        if (chatOpen === code) renderChatLog(code);
      }
    }
`;

if (!s.includes(bad)) { console.error('block not found'); process.exit(1); }
s = s.replace(bad, good);

// track which code an outbound transfer belongs to
s = s.replace(
  "  const track = { cancelled: false };",
  "  const track = { cancelled: false, code };"
);

fs.writeFileSync('renderer/app.js', s);
console.log('cleaned');
