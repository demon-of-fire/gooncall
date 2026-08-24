// Adds edit-sync assertion to E2E-B driver.
const fs = require('fs');
let t = fs.readFileSync('main.js', 'utf8');
const anchor = "            console.log(fileOk ? 'E2E-B: FILE_OK' : 'E2E-B: FILE_MISSING');";
if (!t.includes(anchor)) { console.error('anchor missing'); process.exit(1); }
const insert = anchor + `

            let editOk = false;
            for (let i = 0; i < 15; i++) {
              const r = await wc.executeJavaScript("(function(){ return typeof window.__editSyncFlag !== 'undefined' ? window.__editSyncFlag : false; })()", true);
              if (r) { editOk = true; break; }
              await new Promise(r2 => setTimeout(r2, 1000));
            }
            console.log(editOk ? 'E2E-B: EDIT_SYNC_OK' : 'E2E-B: EDIT_SYNC_MISSING');
            const chatOk2 = await wc.executeJavaScript("(function(){ const c=(chats['TESTAAAA']||[]).find(e=>!e.me&&e.text==='ping-e2e-edited'); return c ? 'chat-edit-ok' : 'chat-edit-missing'; })()", true);
            console.log('E2E-B:', chatOk2);`;
t = t.replace(anchor, insert);
fs.writeFileSync('main.js', t);
console.log('B-side assertions added');
