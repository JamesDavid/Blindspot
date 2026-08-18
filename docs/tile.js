// tile — the Devpost 3:2 tile (§32): an actual dramatic in-game moment
// (the strike, mid-loss) with the title at ~75% width and NO small text.
// usage: node docs/tile.js
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(require.resolve('playwright', { paths: [path.join(__dirname, '..', 'node_modules')] }));

const html = `<!DOCTYPE html><html><head><style>
  body { margin:0; width:1536px; height:1024px; overflow:hidden; position:relative;
    background:#0b0d12; font-family:'Segoe UI',Roboto,Arial,sans-serif; }
  img { position:absolute; width:1536px; top:-560px; left:0; filter:brightness(1.05) saturate(1.1); }
  .grad { position:absolute; inset:0; background:radial-gradient(ellipse at 50% 42%,
    transparent 30%, rgba(5,6,10,0.72) 100%); }
  h1 { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%);
    font-size:172px; letter-spacing:0.16em; color:#f2f5fa; margin:0; white-space:nowrap;
    text-shadow:0 0 90px rgba(255,200,74,0.55), 0 4px 30px #000; font-weight:800; }
  .tag { position:absolute; left:50%; top:57%; transform:translateX(-50%);
    font-size:44px; color:#d8b46a; font-style:italic; white-space:nowrap;
    text-shadow:0 2px 16px #000; }
</style></head><body>
  <img src="07_strike.png">
  <div class="grad"></div>
  <h1>BLIND SPOT</h1>
  <div class="tag">Every camera you place teaches them where not to drive.</div>
</body></html>`;

(async () => {
  const tmp = path.join(__dirname, '_tile.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  await page.goto('file:///' + tmp.replace(/\\/g, '/'));
  await page.waitForTimeout(600);
  fs.mkdirSync(path.join(__dirname, 'media'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, 'media', 'devpost_tile.png') });
  await browser.close();
  fs.rmSync(tmp);
  console.log('wrote docs/media/devpost_tile.png (1536x1024, 3:2)');
})().catch(e => { console.error(e); process.exit(1); });
