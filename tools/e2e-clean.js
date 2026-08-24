// Removes two broken/stale E2E-B assertions (superseded by chat-edit-ok).
const fs = require('fs');
let t = fs.readFileSync('main.js', 'utf8');

let i = t.indexOf("            let editOk = false;");
if (i >= 0) {
  const endMarker = "            console.log('E2E-B:', chatOk2);";
  const e2 = t.indexOf(endMarker, i);
  if (e2 < 0) { console.error('end marker missing'); process.exit(1); }
  t = t.slice(0, i) + t.slice(e2 + endMarker.length);
}

// also drop the older chatOk block if present
const staleA = "            const chatOk = await wc.executeJavaScript(";
const si = t.indexOf(staleA);
if (si >= 0) {
  const lineEnd = t.indexOf('\n', si);
  t = t.slice(0, si) + t.slice(lineEnd + 1);
}

fs.writeFileSync('main.js', t);
console.log('cleaned');
