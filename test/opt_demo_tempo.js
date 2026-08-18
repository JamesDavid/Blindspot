// opt_demo_tempo — §0.10: a strategy evolved at headless act-rates
// collapses when piped through a one-action-at-a-time UI. Validate the
// champion at the demo's tempo (single action per ~3s think) before it
// is allowed to drive WATCH A SHIFT.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./opt_lib');

const champion = JSON.parse(fs.readFileSync(path.join(__dirname, 'best_genome.json'), 'utf8')).genome;
const SEEDS = ['dt-1', 'dt-2', 'dt-3', 'dt-4', 'dt-5'];
const sb = L.makeSandbox();

function trial(opts, label) {
  let wins = 0, fit = 0, losses = [];
  for (const seed of SEEDS) {
    const state = sb.State.newMatch(seed, { dda: false });
    const player = L.makeTrialPlayer(sb, champion, opts);
    sb.Sim.run(state, 60 * 16, player);
    const r = {
      verdict: state.verdict ? state.verdict.result : 'TIMEOUT',
      reason: state.verdict ? state.verdict.reason : 'none',
      time: state.time, warrant: state.warrant,
      trust: state.trust, clearance: sb.State.clearance(state),
      closures: state.stats.closures, falseCharges: state.stats.falseCharges, colds: state.stats.colds
    };
    fit += L.fitness(Object.assign({ }, r, state.stats, { time: state.time, trust: state.trust, clearance: sb.State.clearance(state), warrant: state.warrant, verdict: r.verdict, reason: r.reason }));
    if (r.verdict === 'WIN') wins++; else losses.push(seed + ':' + r.reason);
  }
  console.log(`${label}: ${wins}/${SEEDS.length} wins, mean fit ${(fit / SEEDS.length).toFixed(1)}${losses.length ? ' — losses ' + losses.join(', ') : ''}`);
  return { wins, fit: fit / SEEDS.length };
}

console.log('champion at headless tempo vs demo tempo (one action / 3s):');
const multi = trial({}, 'headless tempo  ');
const demoT = trial({ single: true, think: 3.0 }, 'demo tempo      ');
if (demoT.wins < Math.max(1, multi.wins - 2)) {
  console.log('VERDICT: collapses at demo tempo — do NOT bake into the demo without adaptation');
  process.exit(1);
}
console.log('VERDICT: survives the interactive tempo — cleared to drive the demo');
