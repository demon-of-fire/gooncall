// Replaces instant-send snip with markup editor flow (pen/arrow/rect + send).
const fs = require('fs');
let s = fs.readFileSync('renderer/js/calltools.js', 'utf8');

const START = s.indexOf('async function snipAndSend() {');
if (START < 0) { console.error('anchor missing'); process.exit(1); }

const replacement = `let snipTargetCode = null;
let snipImg = null;
let snipShapes = [];
let snipLive = null;
let snipTool = 'pen';
let snipColor = '#f23f43';
let snipDragging = false;

async function snipAndSend() {
  const target = chatOpen || (call && call.peerCode);
  if (!target) { toast('Open a chat or call first', 'err'); return; }
  toast('Capturing your screen.');
  try {
    const dataUrl = await window.aero.captureScreen();
    if (!dataUrl) { toast('Capture failed', 'err'); return; }
    openSnipEditor(dataUrl, target);
  } catch { toast('Screenshot failed', 'err'); }
}

function snipToolLabel(t) {
  return t === 'pen' ? '\\u270F pen' : t === 'arrow' ? '\\u27A4 arrow' : '\\u25AD box';
}

function openSnipEditor(dataUrl, target) {
  snipTargetCode = target;
  snipShapes = []; snipLive = null;
  const img = new Image();
  img.onload = () => {
    snipImg = img;
    const c = document.getElementById('snip-canvas');
    const maxW = Math.min(1200, window.innerWidth - 120);
    const scale = Math.min(1, maxW / img.width);
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    redrawSnip();
    document.querySelectorAll('#dlg-snipedit .snip-tools button[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === snipTool);
    });
    const dlg = document.getElementById('dlg-snipedit');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  };
  img.onerror = () => toast('Could not load capture', 'err');
  img.src = dataUrl;
}

function snipCtx() {
  return document.getElementById('snip-canvas').getContext('2d');
}

function redrawSnip() {
  const c = document.getElementById('snip-canvas');
  if (!c || !snipImg) return;
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(snipImg, 0, 0, c.width, c.height);
  const shapes = snipLive ? snipShapes.concat([snipLive]) : snipShapes;
  for (const s of shapes) drawSnipShape(x, s);
}

function drawSnipShape(x, s) {
  if (s.type === 'pen') {
    if (s.pts.length < 2) return;
    x.strokeStyle = s.c; x.lineWidth = 3; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(s.pts[0][0] * c.width, s.pts[0][1] * c.height);
    for (let i = 1; i < s.pts.length; i++) x.lineTo(s.pts[i][0] * c.width, s.pts[i][1] * c.height);
    x.stroke();
  } else if (s.type === 'arrow') {
    const [x1, y1] = [s.a[0] * c.width, s.a[1] * c.height];
    const [x2, y2] = [s.b[0] * c.width, s.b[1] * c.height];
    x.strokeStyle = s.c; x.fillStyle = s.c; x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const hl = 14;
    x.beginPath();
    x.moveTo(x2, y2);
    x.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45));
    x.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45));
    x.closePath(); x.fill();
  } else if (s.type === 'rect') {
    x.strokeStyle = s.c; x.lineWidth = 4;
    x.strokeRect(Math.min(s.a[0], s.b[0]) * c.width, Math.min(s.a[1], s.b[1]) * c.height,
      Math.abs(s.b[0] - s.a[0]) * c.width, Math.abs(s.b[1] - s.a[1]) * c.height);
  } else if (s.type === 'text') {
    x.fillStyle = s.c; x.font = 'bold 20px Segoe UI';
    x.fillText(s.text || '', s.p[0] * c.width, s.p[1] * c.height);
  }
}

function snipPos(e) {
  const c = document.getElementById('snip-canvas');
  const r = c.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}

function bindSnipEditor() {
  const c = document.getElementById('snip-canvas');
  document.querySelectorAll('#dlg-snipedit .snip-tools button[data-tool]').forEach((b) => {
    b.onclick = () => {
      snipTool = b.dataset.tool;
      document.querySelectorAll('#dlg-snipedit .snip-tools button[data-tool]').forEach((x) => x.classList.toggle('active', x.dataset.tool === snipTool));
    };
  });
  document.getElementById('snip-color').oninput = (e) => { snipColor = e.target.value; };
  document.getElementById('snip-clear').onclick = () => { snipShapes = []; snipLive = null; redrawSnip(); };

  c.addEventListener('pointerdown', (e) => {
    if (!snipTargetCode) return;
    c.setPointerCapture(e.pointerId);
    const p = snipPos(e);
    if (snipTool === 'pen') { snipLive = { type: 'pen', c: snipColor, pts: [p] }; }
    else if (snipTool === 'arrow' || snipTool === 'rect') { snipLive = { type: snipTool, c: snipColor, a: p, b: p }; }
    redrawSnip();
  });
  c.addEventListener('pointermove', (e) => {
    if (!snipLive) return;
    const p = snipPos(e);
    if (snipTool === 'pen') snipLive.pts.push(p);
    else snipLive.b = p;
    redrawSnip();
  });
  const fin = () => {
    if (!snipLive) return;
    if (snipLive.type === 'pen' && snipLive.pts.length > 1) snipShapes.push(snipLive);
    else if (snipLive.type !== 'pen') snipShapes.push(snipLive);
    snipLive = null;
    redrawSnip();
  };
  c.addEventListener('pointerup', fin);
  c.addEventListener('pointercancel', fin);

  document.getElementById('snip-send').onclick = async () => {
    const code = snipTargetCode;
    if (!code) return;
    const c2 = document.getElementById('snip-canvas');
    redrawSnip();
    const out = document.createElement('canvas');
    out.width = c2.width; out.height = c2.height;
    const ox = out.getContext('2d');
    ox.drawImage(snipImg, 0, 0, out.width, out.height);
    for (const sh of snipShapes) drawSnipShape(ox, sh);
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    closeSnipEditor();
    const prevOpen = chatOpen;
    if (chatOpen !== code) openChat(code);
    await sendAttachment('image', blob, 'snip-' + Date.now() + '.png');
    void prevOpen;
  };
  document.getElementById('snip-discard').onclick = () => { closeSnipEditor(); toast('Screenshot discarded'); };
  document.getElementById('dlg-snipedit').addEventListener('close', () => { snipTargetCode = null; snipShapes = []; snipLive = null; snipImg = null; });
}

function closeSnipEditor() {
  const d = document.getElementById('dlg-snipedit');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
}
`;

s = s.slice(0, START) + replacement + '\n' + s.slice(START);

// bind once DOM ready
s += '\ndocument.addEventListener("DOMContentLoaded", bindSnipEditor);\n';

fs.writeFileSync('renderer/js/calltools.js', s);
console.log('snip markup editor installed');
