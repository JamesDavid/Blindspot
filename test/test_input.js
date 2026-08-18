// test_input — Playwright, real browser, built index.html over file://.
// Proves: tap-to-place works through the real menu; a pan is never
// mistaken for a tap; injected orphan pointers recover (§18.2).
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
  await page.click('[data-key=start]');
  await page.waitForTimeout(500);

  // --- tap-to-place through the real UI
  const ns = await page.evaluate(() => Renderer.nodeScreen(window.__game.state.map.center));
  await page.mouse.click(ns.x, ns.y);
  await page.waitForTimeout(250);
  check('tap on a pole opens the context menu', await page.isVisible('[data-key=ctxmenu]'));
  await page.click('[data-key=buy-post]');
  await page.waitForTimeout(250);
  check('buying opens the ghost confirm row', await page.isVisible('[data-key=confirm]'));
  check('the quality pill quotes the sightline', (await page.textContent('[data-key=qualitypill]')).includes('READS'));
  await page.click('[data-key=confirm]');
  await page.waitForTimeout(250);
  check('confirm places the camera', await page.evaluate(() => window.__game.state.cameras.length) === 1);

  // --- a pan is not a tap
  const before = await page.evaluate(() => Renderer.getView().cx);
  await page.mouse.move(200, 500);
  await page.mouse.down();
  await page.mouse.move(120, 380, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => Renderer.getView().cx);
  check('drag pans the map', Math.abs(after - before) > 0.1, `cx ${before} → ${after}`);
  check('drag does not open a menu', !(await page.isVisible('[data-key=ctxmenu]')));

  // --- pinch zooms (synthetic pointer pair on the canvas)
  const zoomBefore = await page.evaluate(() => Renderer.getView().zoom);
  await page.evaluate(() => {
    const cv = document.getElementById('game-canvas');
    const mk = (type, id, x, y, primary) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, isPrimary: primary, bubbles: true
    }));
    mk('pointerdown', 1, 180, 400, true);
    mk('pointerdown', 2, 220, 440, false);
    for (let i = 1; i <= 5; i++) {
      mk('pointermove', 1, 180 - i * 12, 400 - i * 12, true);
      mk('pointermove', 2, 220 + i * 12, 440 + i * 12, false);
    }
    mk('pointerup', 1, 120, 340, true);
    mk('pointerup', 2, 280, 500, false);
  });
  await page.waitForTimeout(200);
  const zoomAfter = await page.evaluate(() => Renderer.getView().zoom);
  check('pinch zooms', Math.abs(zoomAfter - zoomBefore) > 0.2, `zoom ${zoomBefore} → ${zoomAfter}`);
  check('pinch does not open a menu', !(await page.isVisible('[data-key=ctxmenu]')));

  // --- orphan pointer recovery (§18.2): a pointerdown that never ends
  await page.evaluate(() => {
    const cv = document.getElementById('game-canvas');
    cv.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 77, clientX: 300, clientY: 600, isPrimary: false, bubbles: true
    }));
    // no pointerup: 77 is now a dead pointer in the map
  });
  const ns2 = await page.evaluate(() => {
    const st = window.__game.state;
    // nearest free pole to the map centre (must be on-screen, not under the HUD)
    const c = st.map.nodes[st.map.center];
    let best = null, bestD = Infinity;
    for (const n of st.map.nodes) {
      if (n.exit || !st.map.adj[n.id].length || CameraSystem.camAt(st, n.id)) continue;
      const d = Math.abs(n.x - c.x) + Math.abs(n.y - c.y);
      if (d > 0 && d < bestD) { bestD = d; best = n.id; }
    }
    Renderer.centerOn(best);
    return Renderer.nodeScreen(best);
  });
  await page.mouse.click(ns2.x, ns2.y);
  await page.waitForTimeout(250);
  check('taps still work after an orphaned pointer (primary-down purge)',
    await page.isVisible('[data-key=ctxmenu]'));
  await page.click('[data-key=dismiss]');

  // --- disabled buttons explain their refusal
  await page.evaluate(() => { window.__game.state.budget = 5; });
  await page.mouse.click(ns2.x, ns2.y);
  await page.waitForTimeout(250);
  const refused = await page.getAttribute('[data-key=buy-post]', 'data-refused');
  check('a too-expensive unit is refused with a reason', refused && refused.includes('BUDGET SHORT'), refused);
  await page.click('[data-key=buy-post]');
  await page.waitForTimeout(250);
  check('pressing a refused button explains, not acts',
    await page.evaluate(() => window.__game.state.cameras.length) === 1);

  check('zero page errors throughout', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  if (fails) { console.error(`test_input: ${fails} FAILURE(S)`); process.exit(1); }
  console.log('test_input: all green');
})().catch(e => { console.error('test_input crashed:', e); process.exit(1); });
