// Build script: concatenates src/*.js (sorted by filename) into index.html
// at the INJECT marker in shell.html. The submission requires all
// entrant-authored code in one readable index.html; development happens
// across src files and this assembles them.
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const shell = fs.readFileSync(path.join(root, 'shell.html'), 'utf8');
const srcDir = path.join(root, 'src');
const files = fs.readdirSync(srcDir).filter(f => /^\d\d_.*\.js$/.test(f)).sort();

let code = '';
for (const f of files) {
  const body = fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/\s+$/, '');
  code += `\n// ============================================================\n`;
  code += `// ${f.replace(/^\d+_/, '').replace('.js', '').toUpperCase()}\n`;
  code += `// ============================================================\n\n${body}\n`;
}

// A visible build stamp settles "which version is my phone running"
// questions instantly (stale caches mimic unfixed bugs).
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const out = shell.replace('/* @INJECT_GAME_CODE */', () => code)
  .replace('@BUILDSTAMP', stamp);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`built index.html (${(out.length / 1024).toFixed(1)} KB) from ${files.length} src files, stamp ${stamp}`);
