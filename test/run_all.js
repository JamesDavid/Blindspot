// The battery: one command, runs after every commit. Headless tests always;
// Playwright tests when --browser is passed (they need a built index.html).
'use strict';
const { execSync } = require('child_process');
const path = require('path');

const headless = [
  'test_mapgen.js', 'test_sim.js', 'test_coherence.js',
  'test_crewfair.js', 'test_vandals.js', 'test_shift5.js', 'test_census.js'
];
const browser = ['test_input.js', 'test_resume.js'];

const withBrowser = process.argv.includes('--browser');
const list = headless.concat(withBrowser ? browser : []);
const t0 = Date.now();
let failed = [];

for (const f of list) {
  const p = path.join(__dirname, f);
  try { require('fs').accessSync(p); } catch { console.log(`skip  ${f} (not written yet)`); continue; }
  process.stdout.write(`\n== ${f} ==\n`);
  try {
    execSync(`node "${p}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch {
    failed.push(f);
  }
}

console.log(`\nbattery: ${list.length} suites in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed.length) { console.error('RED: ' + failed.join(', ')); process.exit(1); }
console.log('battery: GREEN');
