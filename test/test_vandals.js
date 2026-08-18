// test_vandals — §11.4: no vandal livelock. No vandal idles > 10 s while a
// legal target exists; the simultaneous cap holds; activity lands inside
// authored bands. Build-time censuses, not survivor counts.
'use strict';
const { makeSandbox } = require('./harness');
const sb = makeSandbox();
const { State, Sim, Actions, CONFIG } = sb;

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

function makeController(hardenAll) {
  return (state) => {
    if (state.cameras.length < 6 && state.budget >= 40) {
      for (const n of [state.map.center, ...state.map.spawnZones]) {
        if (Actions.place(state, n, 'POST').ok) break;
      }
    }
    if (hardenAll) {
      for (const cam of state.cameras) {
        if (!cam.hardened) Actions.upgrade(state, cam.id, 'HARDEN');
      }
    }
    for (const kase of state.cases) {
      if (kase.status === 'CONTESTED') Actions.adjudicate(state, kase.id, 'RELEASE');
    }
  };
}

for (const [seed, hardenAll] of [['van-a', false], ['van-b', false], ['van-hardened', true]]) {
  const state = State.newMatch(seed);
  const progress = new Map(); // vandalId -> {sig, since}
  let maxSimultaneous = 0, idleViolations = 0;

  const watch = (st) => {
    const active = st.vandals.filter(v => v.state === 'MOVE' || v.state === 'ACT' || v.state === 'FLEE');
    maxSimultaneous = Math.max(maxSimultaneous, active.filter(v => v.state !== 'FLEE').length);
    const targetsExist = st.cameras.length > 0;
    for (const v of active) {
      // progress signature: any of these changing means the vandal is working
      const sig = v.state + '|' + v.at + '|' + Math.floor(v.segT * 4) + '|' + Math.floor(v.actT) + '|' + (v.targetCamId || 0);
      const p = progress.get(v.id);
      if (!p || p.sig !== sig) progress.set(v.id, { sig, since: st.time });
      else if (targetsExist && st.time - p.since > CONFIG.Vandals.ABANDON_AFTER + 2) {
        idleViolations++;
        progress.set(v.id, { sig, since: st.time }); // report once per stretch
      }
    }
  };

  Sim.run(state, 60 * 10, (st) => { makeController(hardenAll)(st); watch(st); });

  const st = state.stats;
  check(`[${seed}] no vandal idled past the abandon window`, idleViolations === 0, idleViolations);
  check(`[${seed}] simultaneous cap held (≤${CONFIG.Vandals.MAX_SIMULTANEOUS})`, maxSimultaneous <= CONFIG.Vandals.MAX_SIMULTANEOUS, maxSimultaneous);
  check(`[${seed}] vandals spawned in band [3,30]`, st.vandalsSpawned >= 3 && st.vandalsSpawned <= 30, st.vandalsSpawned);
  const actRate = st.vandalsSpawned ? st.vandalActs / st.vandalsSpawned : 0;
  check(`[${seed}] acts within band (some succeed, some are stopped): rate ${actRate.toFixed(2)}`,
    st.vandalsSpawned === 0 || (actRate >= 0.1 && actRate <= 1.0), actRate);
  console.log(`  [${seed}] spawned=${st.vandalsSpawned} acts=${st.vandalActs} abandons=${st.vandalAbandons} witnessCases=${st.witnessCases} dataLost=${st.dataLostReads}`);
}

if (fails) { console.error(`test_vandals: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_vandals: all green');
