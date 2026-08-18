// opt_lifetime — §29.4.2: CASE_LIFETIME × READS_TO_CLOSE, the
// closable-at-all boundary (§10.4). Census guard: closures must be
// nonzero at every swept band or the cell is marked starved.
'use strict';
const { makeSandbox, patchNumber } = require('./harness');
const L = require('./opt_lib');

const SEEDS = ['sw-1', 'sw-2', 'sw-3'];
const LIFES = [55, 65, 75, 90, 110];
const READS = [2, 3, 4];

console.log('opt_lifetime: case lifetime x reads-to-close, 3 seeds/cell');
console.log('life\\rd ' + READS.map(r => String(r).padStart(7)).join(''));
let best = { score: -Infinity };
for (const life of LIFES) {
  const row = [];
  for (const k of READS) {
    const sb = makeSandbox(code =>
      patchNumber(patchNumber(code, 'LIFETIME_SECONDS', life), 'READS_TO_CLOSE', k));
    let tot = 0, closures = 0, colds = 0;
    for (const seed of SEEDS) {
      const r = L.runMatch(sb, seed);
      tot += L.score(r); closures += r.closures; colds += r.colds;
    }
    const avg = tot / SEEDS.length;
    row.push(closures === 0 ? NaN : avg);
    if (closures > 0 && avg > best.score) best = { score: avg, life, k, closures, colds };
  }
  console.log(String(life).padStart(4) + '    ' + row.map(v => (isNaN(v) ? '  starv' : v.toFixed(1).padStart(7))).join(''));
}
console.log(`BEST lifetime=${best.life} reads=${best.k} score=${best.score.toFixed(1)} (closures=${best.closures}, colds=${best.colds})`);
