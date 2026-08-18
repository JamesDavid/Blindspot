// opt_start — §29.4.3: START_BUDGET × TRUST_START 4x4 grid. The previous
// prototype's start-currency grid found its defaults optimal AND that
// richer starts plateau lower; expect the same shape and cite it.
'use strict';
const { makeSandbox, patchNumber } = require('./harness');
const L = require('./opt_lib');

const SEEDS = ['sw-1', 'sw-2', 'sw-3'];
const BUDGETS = [80, 120, 180, 260];
const TRUSTS = [60, 70, 80, 90];

console.log('opt_start: start budget x start trust, 3 seeds/cell');
console.log('bud\\tr ' + TRUSTS.map(t => String(t).padStart(7)).join(''));
let best = { score: -Infinity };
for (const b of BUDGETS) {
  const row = [];
  for (const t of TRUSTS) {
    const sb = makeSandbox(code =>
      patchNumber(patchNumber(code, 'START_BUDGET', b), 'TRUST_START', t));
    let tot = 0;
    for (const seed of SEEDS) tot += L.score(L.runMatch(sb, seed));
    const avg = tot / SEEDS.length;
    row.push(avg);
    if (avg > best.score) best = { score: avg, b, t };
  }
  console.log(String(b).padStart(3) + '    ' + row.map(v => v.toFixed(1).padStart(7)).join(''));
}
console.log(`BEST budget=${best.b} trust=${best.t} score=${best.score.toFixed(1)}`);
