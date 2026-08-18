// test_sim — a full scripted match runs without error; event counts land
// in sane bands; both "economies" (budget and trust) stay alive and moving.
'use strict';
const { makeSandbox, aimedPlace } = require('./harness');
const sb = makeSandbox();
const { State, Sim, Actions, CONFIG, Economy } = sb;

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

function simpleController(state) {
  // place a small network early, then adjudicate whatever surfaces
  if (state.cameras.length < 5 && state.budget >= 40) {
    const zones = state.map.spawnZones;
    const targets = [state.map.center, ...zones];
    for (const n of targets) {
      const r = aimedPlace(sb, state, n);
      if (r.ok) break;
      // try neighbours if the pole is taken/bad
      for (const e of state.map.adj[n]) {
        if (aimedPlace(sb, state, e.node).ok) break;
      }
      break;
    }
  }
  for (const kase of state.cases) {
    if (kase.status === 'CONTESTED') {
      Actions.adjudicate(state, kase.id, kase.contested && kase.contested.contradiction ? 'RELEASE' : 'CHARGE');
    }
  }
}

const state = State.newMatch('simtest');
const t0 = Date.now();
let threw = null;
try {
  Sim.run(state, 60 * 12, simpleController); // 12 minutes or a verdict
} catch (e) { threw = e; }

check('12-minute match runs without error', !threw, threw && threw.stack);
const st = state.stats;
console.log('  stats:', JSON.stringify(st));
console.log('  end: t=' + state.time.toFixed(0), 'shift=' + state.shift.num,
  'budget=' + state.budget.toFixed(0), 'trust=' + state.trust.toFixed(0),
  'clearance=' + State.clearance(state).toFixed(0), 'warrant=' + state.warrant.toFixed(0),
  'verdict=' + (state.verdict ? state.verdict.result + '/' + state.verdict.reason : 'none'));

check('shifts advanced past 5', state.shift.num >= 5, state.shift.num);
check('crimes occurred', st.crimes >= 8, st.crimes);
check('reads logged', st.reads >= 50, st.reads);
check('qualifying reads occurred', st.qualifying >= 10, st.qualifying);
check('some cases closed', st.closures >= 1, st.closures);
check('some cases went cold (game is not trivially easy)', st.colds >= 1, st.colds);
check('contested cases surfaced', st.contestedShown >= 1, st.contestedShown);
check('vandals spawned', st.vandalsSpawned >= 1, st.vandalsSpawned);
check('budget economy alive (earned beyond start)', state.budget + 5 * 40 > CONFIG.Economy.START_BUDGET, state.budget);
check('trust moved or match ended', state.trust !== CONFIG.Economy.TRUST_START || state.verdict !== null, state.trust);
console.log(`  match simulated in ${Date.now() - t0} ms`);

// determinism: same seed + same controller → identical stats
const s2 = State.newMatch('simtest');
try { Sim.run(s2, 60 * 12, simpleController); } catch (e) { threw = e; }
check('determinism: same seed → identical stats',
  JSON.stringify(s2.stats) === JSON.stringify(st),
  'diff in stats');

if (fails) { console.error(`test_sim: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_sim: all green');
