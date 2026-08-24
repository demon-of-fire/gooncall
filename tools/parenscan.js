// crude bracket scanner: finds first imbalance + reports last unclosed ( line
const s = require('fs').readFileSync('renderer/app.js', 'utf8').split(/\r?\n/);
let depth = 0, par = 0;
const parLines = [];
let inStr = null, inTpl = 0, inLC = false, inBC = false, prev = '';
for (let i = 0; i < s.length; i++) {
  const line = s[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j], nx = line[j + 1];
    if (inLC) { if (nx === undefined) inLC = false; continue; }
    if (inBC) { if (prev === '*' && ch === '/') { inBC = false; prev = ''; } else { prev = ch; } continue; }
    if (inStr) { if (ch === '\\') { j++; continue; } if (ch === inStr) inStr = null; continue; }
    if (ch === '/' && nx === '/') break;
    if (ch === '/' && nx === '*') { inBC = true; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth < 0) console.log('EXTRA } at line', i + 1); }
    if (ch === '(') { par++; parLines.push(i + 1); }
    if (ch === ')') { par--; parLines.pop(); if (par < 0) console.log('EXTRA ) at line', i + 1); }
  }
}
console.log('final brace depth:', depth, 'paren depth:', par);
if (par > 0) console.log('unclosed ( opened at line(s):', parLines.slice(-5));
