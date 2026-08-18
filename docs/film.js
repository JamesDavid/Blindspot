// film — §32: the champion plays the real UI at rAF-warp (the dt clamp
// saturates ≈6x, headless-identical integration), recorded to video,
// encoded to mp4 + a palette-optimized teaser gif that ENDS ON THE
// VERDICT — the ending is the story. usage: node docs/film.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'node_modules')] }));

const URL = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'media');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } }
  });
  const page = await context.newPage();
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.click('[data-key=watchdemo]');
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__warp = 30; });   // saturates at the clamp

  const t0 = Date.now();
  let verdict = null;
  while (Date.now() - t0 < 150000) {
    await page.waitForTimeout(1000);
    verdict = await page.evaluate(() => window.__game.state.verdict &&
      (window.__game.state.verdict.result + '/' + window.__game.state.verdict.reason));
    if (verdict) break;
  }
  console.log('verdict on camera:', verdict);
  await page.evaluate(() => { window.__warp = 1; });
  await page.waitForTimeout(4500);   // hold on the verdict screen
  await context.close();             // flushes the video
  await browser.close();

  const webm = fs.readdirSync(OUT).filter(f => f.endsWith('.webm'))
    .map(f => path.join(OUT, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  console.log('raw video:', webm);

  const mp4 = path.join(OUT, 'shift_timelapse.mp4');
  execSync(`ffmpeg -y -i "${webm}" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "${mp4}"`, { stdio: 'inherit' });

  // teaser gif: the final 22 seconds (strike-era play into the verdict),
  // palette-optimized, 12fps at width 260, under the 5MB cap
  const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp4}"`).toString());
  const start = Math.max(0, dur - 22);
  const gif = path.join(OUT, 'shift_teaser.gif');
  const pal = path.join(OUT, '_pal.png');
  execSync(`ffmpeg -y -ss ${start.toFixed(1)} -t 22 -i "${mp4}" -vf "fps=12,scale=260:-1:flags=lanczos,palettegen" "${pal}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -ss ${start.toFixed(1)} -t 22 -i "${mp4}" -i "${pal}" -lavfi "fps=12,scale=260:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer" "${gif}"`, { stdio: 'inherit' });
  fs.rmSync(pal, { force: true });
  fs.rmSync(webm, { force: true });
  console.log(`mp4 ${(fs.statSync(mp4).size / 1e6).toFixed(1)}MB, gif ${(fs.statSync(gif).size / 1e6).toFixed(1)}MB`);
})().catch(e => { console.error(e); process.exit(1); });
