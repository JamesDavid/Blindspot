// capture — the screenshot pipeline (§32): a Playwright portrait driver
// plus small staging passes per shot (fast-forward to a moment, frame it,
// shoot). Ends the tutorial and controls warp so hint pills and the hand
// never photobomb the gallery. usage: node docs/capture.js
'use strict';
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'node_modules')] }));

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(URL);
  await page.waitForTimeout(1000);

  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const warpUntil = async (cond, maxMs) => {
    await page.evaluate(() => { window.__warp = 30; });
    const t0 = Date.now();
    while (Date.now() - t0 < (maxMs || 120000)) {
      await page.waitForTimeout(400);
      if (await page.evaluate(cond)) break;
    }
    await page.evaluate(() => { window.__warp = 0; });   // freeze for framing
  };
  const resume = () => page.evaluate(() => { window.__warp = 1; });

  // ---- 01 title
  await shot('01_title');

  // ---- tutorial: hand on the pole
  await page.evaluate(() => localStorage.removeItem('blindspot-seen'));
  await page.fill('[data-key=seedinput]', 'press');
  await page.click('[data-key=start]');
  await page.waitForTimeout(1500);
  await shot('02_tutorial');
  await page.click('[data-key=skiptutorial]');
  await page.waitForTimeout(300);

  // ---- context menu (re-centre first: the tutorial panned the camera)
  const ns = await page.evaluate(() => {
    Renderer.centerOn(window.__game.state.map.center);
    return Renderer.nodeScreen(window.__game.state.map.center);
  });
  await page.mouse.click(ns.x, ns.y);
  await page.waitForTimeout(300);
  await shot('03_menu');

  // ---- ghost + quality pill
  await page.click('[data-key=buy-post]');
  await page.waitForTimeout(300);
  await shot('04_ghost');
  await page.click('[data-key=confirm]');

  // build a network the staged way (direct actions are fine for staging)
  await page.evaluate(() => {
    const st = window.__game.state;
    st.budget = 400;
    const picks = [];
    for (const n of st.map.nodes) {
      if (n.exit || !st.map.adj[n.id].length || CameraSystem.camAt(st, n.id)) continue;
      let d = Infinity;
      for (const z of st.map.spawnZones) d = Math.min(d, CaseSystem.nodeDist(st, n.id, z));
      picks.push({ id: n.id, d });
    }
    picks.sort((a, b) => a.d - b.d);
    for (let i = 0; i < 5; i++) Actions.place(st, picks[i * 2].id, 'POST');
  });

  // ---- live play with reads
  await warpUntil(() => window.__game.state.stats.qualifying > 6, 60000);
  await resume();
  await page.waitForTimeout(1200);
  await shot('05_reads');

  // ---- contested card
  await warpUntil(() => window.__game.state.cases.some(c => c.status === 'CONTESTED'), 90000);
  await page.waitForTimeout(300);
  await shot('06_contested');
  await resume();

  // ---- the shift-5 strike: data lost, case at risk
  await warpUntil(() => window.__game.state.stats.destroyed > 0, 180000);
  await page.waitForTimeout(200);
  await shot('07_strike');
  await resume();

  // ---- rain at shift 6
  await warpUntil(() => window.__game.state.shift.rainUntil > window.__game.state.time, 180000);
  await page.evaluate(() => { window.__warp = 1; });
  await page.waitForTimeout(900);
  await shot('08_rain');

  // ---- verdict (drive the warrant up so the raid lands)
  await page.evaluate(() => { window.__game.state.warrant = 100; });
  await page.waitForTimeout(900);
  await shot('09_verdict');

  // ---- demo with a lit button
  await page.click('[data-key=again]').catch(() => {});
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__game.backToTitle());
  await page.waitForTimeout(400);
  await page.click('[data-key=watchdemo]');
  const t0 = Date.now();
  let got = false;
  while (Date.now() - t0 < 40000) {
    await page.waitForTimeout(250);
    if (await page.evaluate(() => !!document.querySelector('.demolit'))) { got = true; break; }
  }
  if (got) await shot('10_demo');
  console.log('captured 01-10 into docs/');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
