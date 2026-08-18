// test_census — §16.1: every match ends. 8 seeds, extended horizon,
// 0 timeouts, every verdict legible (result, reason, the scales), worst
// case ≈ 11 minutes. Plus the refuse path: overtime resumes permanently.
'use strict';
const { makeSandbox } = require('./harness');
const L = require('./opt_lib');

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

const SEEDS = ['cen-1', 'cen-2', 'cen-3', 'cen-4', 'cen-5', 'cen-6', 'cen-7', 'cen-8'];
const results = [];
const sb = makeSandbox();
for (const seed of SEEDS) {
  const r = L.runMatch(sb, seed, null, { horizon: 60 * 16 });
  results.push(r);
  console.log(`  ${seed}: ${r.verdict}/${r.reason} at t=${r.time.toFixed(0)}s shift=${r.shift} ` +
    `(closures=${r.closures} colds=${r.colds} trust=${r.trust.toFixed(0)} clr=${r.clearance.toFixed(0)} warrant=${r.warrant.toFixed(0)})`);
}

const timeouts = results.filter(r => r.verdict === 'TIMEOUT').length;
check(`census: 0/8 timeouts`, timeouts === 0, `${timeouts}/8 timed out`);
const worst = Math.max(...results.map(r => r.time));
check(`worst-case match ≈ 11 min (≤ 690 s)`, worst <= 690, worst.toFixed(0) + 's');
const wins = results.filter(r => r.verdict === 'WIN').length;
console.log(`  outcomes: ${wins} WIN / ${results.length - wins - timeouts} LOSE / ${timeouts} timeout`);

// verdicts are legible: every one carries its scales
{
  const state = sb.State.newMatch('cen-verdict', { dda: false });
  sb.Sim.run(state, 60 * 16, L.makeTrialPlayer(sb));
  const v = state.verdict;
  check('verdict present and legible', !!v && !!v.result && !!v.reason && !!v.scales, JSON.stringify(v));
  if (v && v.scales) {
    const keys = Object.keys(sb.CONFIG.Shifts.REVIEW_WEIGHTS);
    check('the scales show every weighed component', keys.every(k => typeof v.scales[k] === 'number'));
  }
}

// The Review can rule against, and the ruling is refusable (§16.1):
// refuse → overtime resumes permanently → only warrant or a floor ends it.
{
  const state = sb.State.newMatch('cen-refuse', { dda: false });
  // a do-nothing player earns a Review that rules against them
  sb.Sim.run(state, 60 * 16, null);
  const v = state.verdict;
  check('do-nothing analyst gets a verdict', !!v, 'no verdict by 16min');
  if (v) {
    check('the Review can rule AGAINST the analyst', v.reason !== 'REVIEW' || v.result === 'LOSE',
      v.result + '/' + v.reason);
  }
  if (v && v.refusable) {
    const r = sb.Actions.refuseReview(state);
    check('the verdict is refusable', r.ok);
    check('refusal clears the verdict', state.verdict === null);
    sb.Sim.run(state, 60 * 8, null);
    check('after refusal the matter still ends (floor or warrant)',
      state.verdict !== null && state.verdict.reason !== 'REVIEW',
      state.verdict && (state.verdict.result + '/' + state.verdict.reason));
  } else {
    // a floor loss is not refusable; exercise refuse on a synthetic review
    sb.ShiftSystem.conveneReview(state.verdict ? Object.assign(state, { verdict: null }) : state);
    if (state.verdict && state.verdict.refusable) {
      const r = sb.Actions.refuseReview(state);
      check('the verdict is refusable', r.ok);
      check('refusal clears the verdict and marks overtime permanent', state.verdict === null && state.shift.reviewRefused);
    } else {
      check('refuse path reachable', false, 'could not convene a refusable review');
    }
  }
}

if (fails) { console.error(`test_census: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_census: all green');
