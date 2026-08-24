// Accessibility pass: keyboard parity for messages, reactions, links, friends, changelog.
const fs = require('fs');
let t = fs.readFileSync('renderer/app.js', 'utf8');
let n = 0;
const rep = (from, to) => {
  if (!t.includes(from)) { console.error('MISSING:', JSON.stringify(from.slice(0, 70))); process.exitCode = 1; return; }
  t = t.replace(from, to); n++;
};

/* messages: focusable + sr summary + labelled action buttons */
rep(
`    const row = document.createElement('div');
    row.className = 'msg' + (it.me ? ' me' : ' them') + (cont ? ' cont' : '');
    if (it.id) row.dataset.mid = it.id;`,
`    const row = document.createElement('div');
    row.className = 'msg' + (it.me ? ' me' : ' them') + (cont ? ' cont' : '');
    row.tabIndex = 0;
    row.setAttribute('role', 'article');
    row.setAttribute('aria-label',
      (it.me ? 'Your message' : 'Message from ' + displayName(code)) + ', ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
      (it.deleted ? ', deleted' : '') + '.');
    if (it.id) row.dataset.mid = it.id;`
);

/* reaction chips: spans -> real buttons */
rep(
`      chip.className = 'react-chip' + (it.myReacts && it.myReacts[k] ? ' mine' : '');
      chip.textContent = k + (it.reactions[k] > 1 ? ' ' + it.reactions[k] : '');
      chip.title = 'React with ' + k;`,
`      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'react-chip' + (it.myReacts && it.myReacts[k] ? ' mine' : '');
      chip.textContent = k + (it.reactions[k] > 1 ? ' ' + it.reactions[k] : '');
      chip.setAttribute('aria-label', k + ', ' + it.reactions[k] + ' times. React again');`
);

rep(
`    for (const em of ['\uD83D\uDE02', '\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE2E']) {
      const b = document.createElement('button');
      b.className = 'ma-btn';
      b.textContent = em;
      b.onclick = () => reactTo(code, it.id, em);
      bar.appendChild(b);
    }`,
`    for (const em of ['\uD83D\uDE02', '\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE2E']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ma-btn';
      b.setAttribute('aria-label', 'React with ' + em);
      b.textContent = em;
      b.onclick = () => reactTo(code, it.id, em);
      bar.appendChild(b);
    }`
);

rep(
`    const rp = document.createElement('button');
    rp.className = 'ma-btn';
    rp.innerHTML = '&#x21A9;';
    rp.title = 'Reply';`,
`    const rp = document.createElement('button');
    rp.type = 'button';
    rp.className = 'ma-btn';
    rp.setAttribute('aria-label', 'Reply to this message');
    rp.innerHTML = '&#x21A9;';`
);

/* message links: keyboard activatable */
rep(
"    return '<span class=\"msg-link\" data-url=\"' + m + '\" title=\"' + m + '\">' + m + '</span>';",
"    return '<span class=\"msg-link\" role=\"link\" tabindex=\"0\" data-url=\"' + m + '\" title=\"' + m + '\\nOpens in your browser\">' + m + '</span>';"
);

/* link activation: Enter key via delegation */
rep(
"  /* links open outside */\n  document.addEventListener('click', (e) => {\n    const link = e.target.closest('.msg-link');\n    if (link && link.dataset.url) window.aero.openExternal(link.dataset.url);\n  });",
`  /* links open outside */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.msg-link');
    if (link && link.dataset.url) window.aero.openExternal(link.dataset.url);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const link = e.target.closest('.msg-link');
    if (link && link.dataset.url) window.aero.openExternal(link.dataset.url);
  });`
);

/* changelog body: structured list + focusable scroll region */
rep(
`function mdLite(md) {
  const wrap = document.createElement('div');
  wrap.className = 'changelog-body';
  for (const rawLine of md.split(/\\r?\\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith('## ')) {
      const h = document.createElement('h2');
      h.textContent = line.slice(3).trim();
      wrap.appendChild(h);
    } else if (/^\\s*[-*] /.test(line)) {
      const li = document.createElement('li');
      li.innerHTML = escapeHtml(line.replace(/^\\s*[-*] /, ''))
        .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
      wrap.appendChild(li);
    } else {
      const p = document.createElement('div');
      p.innerHTML = escapeHtml(line).replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
      wrap.appendChild(p);
    }
  }
  return wrap;
}`,
`function mdLite(md) {
  const wrap = document.createElement('div');
  wrap.className = 'changelog-body';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'document');
  wrap.setAttribute('aria-label', 'Release notes');
  let ul = null;
  const closeList = () => { ul = null; };
  for (const rawLine of md.split(/\\r?\\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith('## ')) {
      closeList();
      const h = document.createElement('h2');
      h.textContent = line.slice(3).trim();
      wrap.appendChild(h);
    } else if (/^\\s*[-*] /.test(line)) {
      if (!ul) { ul = document.createElement('ul'); wrap.appendChild(ul); }
      const li = document.createElement('li');
      li.innerHTML = escapeHtml(line.replace(/^\\s*[-*] /, ''))
        .replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
      ul.appendChild(li);
    } else {
      closeList();
      const p = document.createElement('p');
      p.innerHTML = escapeHtml(line).replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>');
      wrap.appendChild(p);
    }
  }
  return wrap;
}`
);

/* changelog dialog: labelled live region so NVDA reads it on open */
rep(
"  $('dlg-changelog').insertBefore(content, body);",
"  content.setAttribute('role', 'document');\n  $('dlg-changelog').insertBefore(content, body);\n  setTimeout(() => { try { content.focus(); } catch (e) {} }, 80);"
);

fs.writeFileSync('renderer/app.js', t);
console.log('a11y wiring done,', n, 'replacements');
