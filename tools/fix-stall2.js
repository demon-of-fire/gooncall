// v2: regex-free exact cleanup of the conn-close transfer failover block.
const fs = require('fs');
let s = fs.readFileSync('renderer/app.js', 'utf8');

const badLines = [
  "    for (const [id] of Object.entries({})) {}",
  "    for (const id of Object.keys(xfersOut)) {",
  "      const meta = (chats[call ? call.peerCode : ''] || []);",
  "      void meta;",
  "    }"
].join('\n');

if (!s.includes(badLines)) { console.error('filler block not found'); process.exit(1); }
s = s.replace(badLines, '');

// track outbound code so we only cancel that peer's transfers on close
if (!s.includes('const track = { cancelled: false, code };')) {
  const from = '  const track = { cancelled: false };';
  if (!s.includes(from)) { console.error('track anchor missing'); process.exit(1); }
  s = s.replace(from, '  const track = { cancelled: false, code };');
}

fs.writeFileSync('renderer/app.js', s);
console.log('cleaned');
