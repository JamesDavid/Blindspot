// package — builds the submission zip from an EMPTY staging directory in
// one pass (§32 freeze discipline): fresh build, index.html at zip root,
// vendor/ beside it, nothing else. usage: node package.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const stage = path.join(root, 'staging');
const zip = path.join(root, 'BLINDSPOT_submission.zip');

// staging rebuilt empty, every component regenerated in the same pass
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'vendor'), { recursive: true });
execSync('node build.js', { cwd: root, stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'index.html'), path.join(stage, 'index.html'));
fs.copyFileSync(path.join(root, 'vendor', 'three.min.js'), path.join(stage, 'vendor', 'three.min.js'));

fs.rmSync(zip, { force: true });
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}'"`);
const mb = fs.statSync(zip).size / 1e6;
console.log(`wrote ${zip} (${mb.toFixed(2)} MB${mb > 35 ? ' — OVER THE 35MB CAP' : ''})`);
if (mb > 35) process.exit(1);
