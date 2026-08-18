// test_crewfair — §13.1/§20.3: a crew's KNOWN set is a subset of the
// cameras that have actually produced a read on that crew. The AI never
// reads the player's placements directly. Run on every build.
'use strict';
const { makeSandbox } = require('./harness');
const sb = makeSandbox();
const { State, Sim, Actions } = sb;

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

function controller(state) {
  if (state.cameras.length < 6 && state.budget >= 40) {
    for (const n of [state.map.center, ...state.map.spawnZones]) {
      if (Actions.place(state, n, 'POST').ok) break;
    }
  }
  for (const kase of state.cases) {
    if (kase.status === 'CONTESTED') Actions.adjudicate(state, kase.id, 'RELEASE');
  }
}

for (const seed of ['fair-a', 'fair-b', 'fair-c']) {
  const state = State.newMatch(seed);

  // Track ground truth continuously: camId that read crewId, from the
  // read log itself (reads carry crewId).
  const sightedTruth = {}; // crewId -> Set(camId)
  const sample = (st) => {
    for (const r of st.reads) {
      if (r.crewId && r.camId !== undefined) {
        (sightedTruth[r.crewId] = sightedTruth[r.crewId] || new Set()).add(r.camId);
      }
    }
    // KNOWN ⊆ sighted, checked live so forgetting can't mask a violation
    for (const crewId in st.crews) {
      const crew = st.crews[crewId];
      for (const camId in crew.known) {
        const truth = sightedTruth[crewId];
        if (!truth || !truth.has(Number(camId))) {
          fails++;
          console.error(`FAIL  [${seed}] crew ${crewId} knows cam ${camId} it was never read by`);
        }
      }
    }
  };
  Sim.run(state, 60 * 10, (st) => { controller(st); sample(st); });
  sample(state);

  const knownCounts = Object.values(state.crews).map(c => Object.keys(c.known).length);
  check(`[${seed}] fairness held for full match (KNOWN sizes: ${knownCounts.join(',')})`, true);
  const learned = knownCounts.some(k => k > 0);
  check(`[${seed}] at least one crew actually learned something`, learned);
}

if (fails) { console.error(`test_crewfair: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_crewfair: all green');
