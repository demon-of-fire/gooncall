// Adds listening-titles, board global keys pref handling, chat export IPC.
const fs = require('fs');
let t = fs.readFileSync('main.js', 'utf8');
let n = 0;
const rep = (from, to) => {
  if (!t.includes(from)) { console.error('MISSING:', JSON.stringify(from.slice(0, 70))); process.exitCode = 1; return; }
  t = t.replace(from, to); n++;
};

rep(
`function friendlyActivity(proc, title) {
  const p = String(proc || '').toLowerCase();
  if (ACTIVITY_MAP[p] !== undefined) return ACTIVITY_MAP[p];`,
`function musicTitle(title) {
  let s = String(title || '').trim();
  s = s.replace(/\\s*[-\\u2013\\u2014]\\s*(YouTube Music|Spotify|Spotify Premium|Free)\\s*$/i, '');
  if (/youtube music/i.test(String(title))) s = s.replace(/\\s*-\\s*YouTube\\s*Music\\s*$/i, '');
  if (!s || /^spotify$/i.test(s)) return '';
  return 'Listening to ' + s.slice(0, 60);
}

function friendlyActivity(proc, title) {
  const p = String(proc || '').toLowerCase();
  const tl = String(title || '');
  if (p === 'spotify') { const m = musicTitle(tl.replace(/ - Spotify$/i, '')); if (m) return m.replace('Listening to', 'Listening'); }
  if ((p === 'chrome' || p === 'msedge' || p === 'firefox' || p === 'brave' || p === 'opera') && /youtube music|music\\.youtube\\.com/i.test(tl)) {
    const m = musicTitle(tl.split(/[-\\u2013]/)[0] ? tl : tl);
    if (m && m !== 'Browsing the web') return m;
  }
  if (ACTIVITY_MAP[p] !== undefined) return ACTIVITY_MAP[p];`
);

rep(
"if (key === 'shareActivity') {",
"if (key === 'boardGlobalKeys') { refreshBoardShortcuts(); }\n  if (key === 'shareActivity') {"
);

rep(
"ipcMain.handle('app:relaunch', () => { forceQuit = true; app.relaunch(); app.exit(0); });",
`ipcMain.handle('app:relaunch', () => { forceQuit = true; app.relaunch(); app.exit(0); });

ipcMain.handle('chat:export', async (_e, html, name) => {
  try {
    const r = await dialog.showSaveDialog(win, {
      title: 'Export chat',
      defaultPath: String(name || 'chat').replace(/[\\\\/:*?"<>|]/g, '_') + '.html',
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (r.canceled) return null;
    fs.writeFileSync(r.filePath, String(html || ''), 'utf8');
    return r.filePath;
  } catch { return null; }
});`
);

fs.writeFileSync('main.js', t);
console.log('main.js updated,', n, 'replacements');
