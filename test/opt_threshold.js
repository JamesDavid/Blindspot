// opt_threshold — §29.4.1: the coupled heart. Player bar (thrBase gene)
// × retention WINDOW_SECONDS. Expect a ridge, not a point.
'use strict';
const { makeSandbox, patchNumber } = require('./harness');
const L = require('./opt_lib');

const SEEDS = ['sw-1', 'sw-2', 'sw-3'];
const BARS = [45, 50, 55, 60, 65, 70, 75];
const WINDOWS = [60, 75, 90, 105, 120];

console.log('opt_threshold: player bar x retention window, 3 seeds/cell, score per cell');
console.log('bar\\win  ' + WINDOWS.map(w => String(w).padStart(6)).join(''));
let best = { score: -Infinity };
for (const bar of BARS) {
  const row = [];
  for (const win of WINDOWS) {
    const sb = makeSandbox(code => patchNumber(code, 'WINDOW_SECONDS', win));
    let tot = 0, closures = 0, wins = 0;
    for (const seed of SEEDS) {
      const r = L.runMatch(sb, seed, { thrBase: bar });
      tot += L.score(r); closures += r.closures; if (r.verdict === 'WIN') wins++;
    }
    const avg = tot / SEEDS.length;
    row.push(avg);
    if (avg > best.score) best = { score: avg, bar, win, wins, closures };
    if (closures === 0) row[row.length - 1] = NaN; // starved: §10.4 boundary
  }
  console.log(String(bar).padStart(3) + '     ' + row.map(v => (isNaN(v) ? ' starv' : v.toFixed(1).padStart(6))).join(''));
}
console.log(`BEST bar=${best.bar} window=${best.win} score=${best.score.toFixed(1)} (${best.wins}/${SEEDS.length} wins)`);
