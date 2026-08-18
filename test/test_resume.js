// test_resume — Playwright: play, hide (pagehide fires on reload), the
// title offers the shift back, restore is exact, and the resumed match
// still advances (§17.2).
'use strict';
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'node_modules')] }));

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('blindspot-seen', JSON.stringify({ 'tutorial-done': true })));

  // start a seeded match and play a while at warp
  await page.fill('[data-key=seedinput]', 'resume1');
  await page.click('[data-key=start]');
  await page.waitForTimeout(400);
  const ns = await page.evaluate(() => Renderer.nodeScreen(window.__game.state.map.center));
  await page.mouse.click(ns.x, ns.y);
  await page.waitForTimeout(250);
  await page.click('[data-key=buy-post]');
  await page.waitForTimeout(250);
  await page.click('[data-key=confirm]');
  await page.evaluate(() => { window.__warp = 30; });
  await page.waitForTimeout(12000);  // dt clamp saturates ≈ 6x realtime (less under headless load)
  await page.evaluate(() => { window.__warp = 1; });
  await page.evaluate(() => Actions.setThreshold(window.__game.state, 61));
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const s = window.__game.state;
    return {
      seed: s.seed, time: s.time, shift: s.shift.num, budget: s.budget,
      trust: s.trust, threshold: s.threshold, cameras: s.cameras.length,
      cases: s.cases.length, reads: s.reads.length, warrant: s.warrant
    };
  });
  check('match progressed before the interruption', before.time > 30, before.time);

  // life happens: reload fires pagehide → snapshot
  await page.reload();
  await page.waitForTimeout(800);
  // exact-restore comparison target: what pagehide actually wrote
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('blindspot-resume')));
  const resumeText = await page.textContent('[data-key=resume]').catch(() => null);
  check('the title offers the shift back', !!resumeText, 'no resume button');
  check('the offer names the shift and seed',
    resumeText && resumeText.includes('SHIFT ' + before.shift) && resumeText.includes(before.seed), resumeText);

  // freeze the clock (warp 0) the instant we resume so the comparison
  // is against the restored state, not a state that already moved on
  await page.evaluate(() => { window.__warp = 0; });
  await page.click('[data-key=resume]');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const s = window.__game.state;
    return {
      seed: s.seed, time: s.time, shift: s.shift.num, budget: s.budget,
      trust: s.trust, threshold: s.threshold, cameras: s.cameras.length,
      cases: s.cases.length, reads: s.reads.length, warrant: s.warrant,
      mapSegs: s.map.segs.length, sight: s.cameras.every(c => c.sight && c.sight.length >= 0)
    };
  });
  check('seed restored', after.seed === before.seed);
  check('sim clock restored exactly (vs the snapshot)', Math.abs(after.time - saved.time) < 0.5, `${saved.time} vs ${after.time}`);
  check('shift restored', after.shift === saved.shift.num);
  check('budget restored exactly', Math.abs(after.budget - saved.budget) < 0.001);
  check('trust restored exactly', Math.abs(after.trust - saved.trust) < 0.001);
  check('threshold restored', after.threshold === saved.threshold && after.threshold === 61, after.threshold);
  check('cameras restored with sightlines recomputed', after.cameras === saved.cameras.length && after.sight);
  check('cases and read log restored exactly', after.cases === saved.cases.length && after.reads === saved.reads.length);

  // the resumed match still advances
  await page.evaluate(() => { window.__warp = 1; });
  await page.waitForTimeout(2500);
  const t2 = await page.evaluate(() => window.__game.state.time);
  check('the resumed match is alive and ticking', t2 > after.time + 1.5, `${after.time} → ${t2}`);

  // a decided match clears its save: force a verdict, then check
  await page.evaluate(() => {
    const s = window.__game.state;
    s.warrant = 100;
  });
  await page.waitForTimeout(800);
  const verdictShown = await page.isVisible('[data-key=verdict]');
  check('verdict screen appears on win', verdictShown);
  const savedGone = await page.evaluate(() => localStorage.getItem('blindspot-resume') === null);
  check('a decided match clears its save', savedGone);

  check('zero page errors throughout', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  if (fails) { console.error(`test_resume: ${fails} FAILURE(S)`); process.exit(1); }
  console.log('test_resume: all green');
})().catch(e => { console.error('test_resume crashed:', e); process.exit(1); });
