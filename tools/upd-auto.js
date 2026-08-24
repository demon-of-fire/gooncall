// Adds download-progress push + auto-restart-on-complete to the updater.
const fs = require('fs');
let t = fs.readFileSync('main.js', 'utf8');
let n = 0;
const rep = (from, to) => {
  if (!t.includes(from)) { console.error('MISSING:', JSON.stringify(from.slice(0, 70))); process.exitCode = 1; return; }
  t = t.replace(from, to); n++;
};

rep(
  "  updater.setFeedURL({ provider: 'github', owner: UPDATE_REPO.owner, repo: UPDATE_REPO.repo });\n} catch (e) {\n  console.log('electron-updater not available, update checks disabled');\n}",
`  updater.setFeedURL({ provider: 'github', owner: UPDATE_REPO.owner, repo: UPDATE_REPO.repo });

  /* live progress + auto-restart once the download lands */
  let lastProgPush = 0;
  let autoInstTm = null;
  updater.on('download-progress', (p) => {
    const now = Date.now();
    if (now - lastProgPush < 400) return;
    lastProgPush = now;
    logLine('[updater] progress ' + Math.round(p.percent) + '%');
    pushUpdateToWindow({ kind: 'progress', status: 'progress', percent: Math.round(p.percent), version: p.version && p.version.name });
  });
  updater.on('update-downloaded', (i) => {
    logLine('[updater] downloaded v' + i.version + ' - restarting shortly to install');
    pushUpdateToWindow({ kind: 'downloaded', status: 'downloaded', version: i.version });
    clearTimeout(autoInstTm);
    autoInstTm = setTimeout(() => {
      forceQuit = true;
      try { updater.quitAndInstall(false, false); } catch (e) {}
    }, 5000);
  });
} catch (e) {
  console.log('electron-updater not available, update checks disabled');
}`
);

rep(
  "function pushUpdateToWindow(extra = {}) {",
  "function pushUpdateToWindow(extra = {}) { // eslint-disable-line"
);

fs.writeFileSync('main.js', t);
console.log('done,', n, 'replacements (pushUpdateToWindow already exists)');
