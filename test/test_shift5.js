// test_shift5 — §14.4: the scripted signature sequence, end to end. A
// plausible player reaches shift 5; the Fixer strikes the camera carrying
// the syndicate case; the player recovers; the case closes and warrant
// progress survives. Headless, on pinned seeds, on every build.
'use strict';
const { makeSandbox } = require('./harness');
const L = require('./opt_lib');

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); }
}

for (const seed of ['sig-a', 'sig-b', 'sig-c']) {
  const sb = makeSandbox();
  const state = sb.State.newMatch(seed, { dda: false });
  // hardenAt disabled: the strike must land for the sequence to be testable
  const player = L.makeTrialPlayer(sb, { hardenAt: 99999 });

  const seen = {
    strikeIncoming: false, fixerSpawn: null, fixerForced: false,
    targetDestroyed: false, caseAtRisk: false,
    syndCaseIds: new Set(), syndClosedAfterStrike: false,
    warrantAfter: 0, shift5At: -1
  };

  let seq = 0;
  const controller = (st) => {
    const evs = sb.State.eventsSince(st, seq);
    if (evs.length) seq = evs[evs.length - 1].seq;
    for (const ev of evs) {
      if (ev.type === 'strikeIncoming') seen.strikeIncoming = true;
      if (ev.type === 'vandalSpawn' && ev.vandalType === 'FIXER' && st.shift.num === 5) {
        const v = st.vandals.find(x => x.id === ev.vandalId);
        seen.fixerSpawn = ev.vandalId;
        if (v && v.targetCamId) seen.fixerForced = true;
      }
      if (ev.type === 'destroyed' && st.shift.num === 5 && seen.fixerSpawn !== null) seen.targetDestroyed = true;
      if (ev.type === 'caseAtRisk') seen.caseAtRisk = true;
      if (ev.type === 'caseClosed' && seen.targetDestroyed) {
        const kase = st.cases.find(c => c.id === ev.caseId);
        if (kase && kase.type === 'SYNDICATE') { seen.syndClosedAfterStrike = true; seen.warrantAfter = st.warrant; }
      }
      if (ev.type === 'shift' && ev.num === 5) seen.shift5At = st.time;
    }
    for (const c of st.cases) if (c.type === 'SYNDICATE') seen.syndCaseIds.add(c.id);
    player(st);
  };

  // run through shift 7 at most
  sb.Sim.run(state, 60 * 7, controller);

  check(`[${seed}] match reached shift 5`, seen.shift5At >= 0, 'ended at shift ' + state.shift.num);
  check(`[${seed}] a syndicate case existed by shift 5`, seen.syndCaseIds.size > 0);
  check(`[${seed}] the strike was scripted (strikeIncoming fired)`, seen.strikeIncoming);
  check(`[${seed}] a Fixer spawned at shift 5 with a forced target`, seen.fixerSpawn !== null && seen.fixerForced);
  check(`[${seed}] the Fixer destroyed its target`, seen.targetDestroyed);
  check(`[${seed}] the syndicate case closed after the strike (recovery)`, seen.syndClosedAfterStrike);
  check(`[${seed}] warrant progress survived`, seen.warrantAfter > 0, seen.warrantAfter);
}

if (fails) { console.error(`test_shift5: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_shift5: all green');
