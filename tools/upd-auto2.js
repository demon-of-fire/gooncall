// v2: LF-safe insertion of progress + auto-restart
const fs = require('fs');
let t = fs.readFileSync('main.js', 'utf8');
if (t.includes("updater.on('download-progress'")) { console.log('already wired'); process.exit(0); }
const anchor = "  updater.setFeedURL({ provider: 'github', owner: UPDATE_REPO.owner, repo: UPDATE_REPO.repo });";
const i = t.indexOf(anchor);
if (i < 0) { console.error('anchor missing'); process.exit(1); }
const insert = `
  /* live progress + auto-restart once the download lands */
  let lastProgPush = 0;
  let autoInstTm = null;
  updater.on('download-progress', (p) => {
    const now = Date.now();
    if (now - lastProgPush < 400) return;
    lastProgPush = now;
    logLine('[updater] progress ' + Math.round(p.percent) + '%');
    pushUpdateToWindow({ kind: 'progress', status: 'progress', percent: Math.round(p.percent) });
  });
  updater.on('update-downloaded', (ii) => {
    logLine('[updater] downloaded v' + ii.version + ' - restarting shortly to install');
    pushUpdateToWindow({ kind: 'downloaded', status: 'downloaded', version: ii.version });
    clearTimeout(autoInstTm);
    autoInstTm = setTimeout(() => {
      forceQuit = true;
      try { updater.quitAndInstall(false, false); } catch (e) {}
    }, 5000);
  });`;
t = t.slice(0, i + anchor.length) + '\n' + insert + t.slice(i + anchor.length);
fs.writeFileSync('main.js', t);
console.log('progress + auto-restart inserted');
