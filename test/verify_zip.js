// verify_zip — §25: the scripted airplane-mode and compliance check.
// Fresh extraction of the ACTUAL zip → file:// load → a simulated minute
// of play → zero non-file network requests, zero page errors, playable.
// Then the anonymity + brand scans over every packaged file, the build
// log, and the design intent (vendor MIT headers exempt).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'node_modules')] }));

const root = path.join(__dirname, '..');
const zip = path.join(root, 'BLINDSPOT_submission.zip');

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

(async () => {
  check('zip exists', fs.existsSync(zip));
  const mb = fs.statSync(zip).size / 1e6;
  check(`zip within the 35MB cap (${mb.toFixed(2)} MB)`, mb <= 35);

  // ---- fresh extraction
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-verify-'));
  execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zip}' -DestinationPath '${ext}'"`);
  check('index.html at the zip ROOT (not nested)', fs.existsSync(path.join(ext, 'index.html')));
  check('vendor/three.min.js beside it', fs.existsSync(path.join(ext, 'vendor', 'three.min.js')));

  // ---- offline playability: a simulated minute, all requests file://
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], badRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('file://')) badRequests.push(r.url()); });
  await page.goto('file:///' + path.join(ext, 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => localStorage.setItem('blindspot-seen', JSON.stringify({ 'tutorial-done': true })));
  await page.click('[data-key=start]');
  await page.waitForTimeout(500);
  const ns = await page.evaluate(() => Renderer.nodeScreen(window.__game.state.map.center));
  await page.mouse.click(ns.x, ns.y);
  await page.waitForTimeout(250);
  await page.click('[data-key=buy-post]');
  await page.waitForTimeout(250);
  await page.click('[data-key=confirm]');
  await page.evaluate(() => { window.__warp = 30; });
  await page.waitForTimeout(11000);  // ≈ a simulated minute at saturated warp
  const st = await page.evaluate(() => ({
    t: window.__game.state.time, cams: window.__game.state.cameras.length,
    reads: window.__game.state.stats.reads, stamp: window.BUILDSTAMP
  }));
  check('a simulated minute of play ran (t=' + st.t.toFixed(0) + 's)', st.t >= 55);
  check('playable: camera placed and reads landing', st.cams >= 1 && st.reads > 0);
  check('build stamp present and current', /BUILD 20\d\d-/.test(st.stamp), st.stamp);
  check('zero non-file network requests', badRequests.length === 0, badRequests.slice(0, 3).join(', '));
  check('zero page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  // ---- anonymity + brand scans (§0.6)
  // personal identifiers must appear NOWHERE in any artefact
  const personal = /james|busch|jamesdavid|gmail|@\w+\.(com|net|org)/i;
  // the previous prototype's name and inspiration-game names: nowhere either
  const priorNames = /windward|grand theft|gta\b|watch.?dogs|simcity|cities.?skylines/i;
  // tool/brand names: allowed ONLY in the build log (it must document tools)
  const toolNames = /claude|anthropic|copilot|chatgpt|openai/i;
  // sponsor name: allowed only in the build log / README competition line
  const sponsor = /\bmeta\b|facebook/i;

  function scanFile(p, rules) {
    const text = fs.readFileSync(p, 'utf8');
    const hits = [];
    for (const [name, re] of rules) {
      const m = text.match(re);
      if (m) hits.push(name + ':' + m[0]);
    }
    return hits;
  }

  // zip contents: strictest — nothing at all (vendor exempt: MIT headers)
  const zipRules = [['personal', personal], ['prior-names', priorNames], ['tools', toolNames], ['sponsor', sponsor]];
  const idx = scanFile(path.join(ext, 'index.html'), zipRules);
  check('packaged index.html clean of names/brands/tools', idx.length === 0, idx.join(', '));

  // build log: personal + prior names banned; tools/sponsor allowed
  const logHits = scanFile(path.join(root, 'buildlog.md'), [['personal', personal], ['prior-names', priorNames]]);
  check('buildlog.md clean of personal info and prior-game names', logHits.length === 0, logHits.join(', '));

  // design intent: everything banned (fully anonymous)
  const docx = path.join(root, 'docs', 'design-intent.docx');
  if (fs.existsSync(docx)) {
    const dext = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-docx-'));
    const dz = path.join(dext, 'd.zip');
    fs.copyFileSync(docx, dz);
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${dz}' -DestinationPath '${dext}\\x'"`);
    const docHits = scanFile(path.join(dext, 'x', 'word', 'document.xml'), zipRules);
    check('design-intent.docx fully anonymous', docHits.length === 0, docHits.join(', '));
    fs.rmSync(dext, { recursive: true, force: true });
  } else {
    check('design-intent.docx exists', false);
  }

  fs.rmSync(ext, { recursive: true, force: true });
  if (fails) { console.error(`verify_zip: ${fails} FAILURE(S)`); process.exit(1); }
  console.log('verify_zip: all green');
})().catch(e => { console.error('verify_zip crashed:', e); process.exit(1); });
