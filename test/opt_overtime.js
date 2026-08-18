// opt_overtime — §29.4.5: overtime step x interval, census-tuned (§16.1).
// The scoring here is a census, not the quality composite: timeouts are
// disqualifying, worst-case time must stay ≈11 min, and both verdicts
// should appear across seeds.
'use strict';
const { makeSandbox, patchNumber } = require('./harness');
const L = require('./opt_lib');

const SEEDS = ['cen-1', 'cen-2', 'cen-3', 'cen-4', 'cen-5', 'cen-6', 'cen-7', 'cen-8'];
const STEPS = [0.08, 0.15, 0.25];
const INTERVALS = [24, 30, 40];

console.log('opt_overtime: 8-seed census per cell (timeouts | worst s | W-L)');
for (const step of STEPS) {
  const cells = [];
  for (const iv of INTERVALS) {
    const sb = makeSandbox(code =>
      patchNumber(patchNumber(code, 'OVERTIME_STEP', step), 'OVERTIME_INTERVAL', iv));
    let timeouts = 0, worst = 0, w = 0, l = 0;
    for (const seed of SEEDS) {
      const r = L.runMatch(sb, seed, null, { horizon: 60 * 16 });
      if (r.verdict === 'TIMEOUT') timeouts++;
      else if (r.verdict === 'WIN') w++; else l++;
      worst = Math.max(worst, r.time);
    }
    cells.push(`${timeouts}to ${Math.round(worst)}s ${w}-${l}`);
  }
  console.log('step ' + step.toFixed(2) + '  ' + cells.map(c => c.padStart(14)).join(' | '));
}
console.log('acceptance: 0 timeouts everywhere; keep the cell nearest worst≈660s with a verdict mix.');
