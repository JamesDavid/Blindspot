// test_coherence — §8.4: (a) no case ever auto-closes on an incoherent
// route; (b) every closed case's evidence chain is reconstructible from
// the read log; (c) a contradictory pair always flags contested, never
// closes silently. The adjudication card's credibility rests on this.
'use strict';
const { makeSandbox } = require('./harness');
const sb = makeSandbox();
const { State, Sim, Actions, CaseSystem, CONFIG } = sb;

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
  // adjudicate everything so both branches run
  for (const kase of state.cases) {
    if (kase.status === 'CONTESTED') {
      Actions.adjudicate(state, kase.id, (kase.id % 2 === 0) ? 'CHARGE' : 'RELEASE');
    }
  }
}

for (const seed of ['coh-a', 'coh-b', 'coh-c']) {
  const state = State.newMatch(seed);
  Sim.run(state, 60 * 12, controller);
  const closed = state.cases.filter(c => (c.status === 'CLOSED' || c.status === 'ARREST') && c.closedTriple);
  const autoClosed = closed.filter(c => c.via === 'auto');
  let incoherent = 0, unreconstructible = 0;
  for (const kase of closed) {
    const triple = (kase.closedTriple || []).map(id => state.reads[id - 1]);
    // (b) reconstructible: every closing read exists and points at the case
    for (const r of triple) {
      if (!r || r.caseId !== kase.id) unreconstructible++;
    }
    // (a) auto closures must be pairwise coherent
    if (kase.via === 'auto') {
      const sorted = triple.filter(Boolean).sort((a, b) => a.t - b.t);
      for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
        if (!CaseSystem.pairCoherent(state, sorted[i], sorted[j])) incoherent++;
      }
    }
  }
  check(`[${seed}] no incoherent auto-closure (${autoClosed.length} auto of ${closed.length} closed)`, incoherent === 0, incoherent);
  check(`[${seed}] evidence chains reconstructible from the read log`, unreconstructible === 0, unreconstructible);
}

// (c) unit: a contradictory pair flags contested, never closes silently.
{
  const state = State.newMatch('coh-unit');
  // two cameras far apart
  const nodes = state.map.nodes.filter(n => state.map.adj[n.id].length >= 2 && !n.exit);
  const a = nodes[0], b = nodes[nodes.length - 1];
  const ra = Actions.place(state, a.id, 'POST');
  const rb = Actions.place(state, b.id, 'POST');
  check('unit: two far cameras placed', ra.ok && rb.ok);
  const dist = CaseSystem.nodeDist(state, a.id, b.id);
  check('unit: cameras are far apart', dist > 6, dist);
  // craft a case with three same-time reads from both poles: contradiction
  const kase = {
    id: state.nextCaseId++, type: 'PETTY', plate: 'ZZ9-999', crewId: 'petty-a',
    spawnNode: a.id, openedAt: state.time, coldAt: state.time + 60,
    status: 'OPEN', riskAnnounced: false, closedTriple: null, falseCharge: false,
    contested: null, _peakUsable: 0
  };
  state.cases.push(kase);
  const mk = (cam, t) => {
    const entry = cam.sight[0];
    const read = {
      id: state.nextReadId++, t, segId: entry.seg, vehId: null, crewId: null,
      actualPlate: 'ZZ9-999', plate: 'ZZ9-999', trueMatch: true,
      conf: 90, qualifying: true, caseId: kase.id,
      camId: cam.id, uploadedAt: t, expiresAt: t + 90, lost: false
    };
    state.reads.push(read);
    return read;
  };
  mk(ra.cam, 10); mk(rb.cam, 10.5); mk(ra.cam, 11); // b is unreachable in 0.5s
  state.time = 12;
  CaseSystem.tick(state, 0.1);
  check('unit: contradictory evidence flags CONTESTED', kase.status === 'CONTESTED', kase.status);
  check('unit: contradiction recorded on the card', kase.contested && kase.contested.contradiction === true);

  // and a coherent file does close
  const kase2 = Object.assign({}, kase, { id: state.nextCaseId++, status: 'OPEN', contested: null, _peakUsable: 0 });
  state.cases.push(kase2);
  const mk2 = (cam, t) => { const r = mk(cam, t); r.caseId = kase2.id; return r; };
  mk2(ra.cam, 20); mk2(ra.cam, 24); mk2(ra.cam, 28); // same pole, sequential: coherent
  state.time = 30;
  CaseSystem.tick(state, 0.1);
  check('unit: coherent evidence corroborates (arrest made)', kase2.status === 'ARREST', kase2.status);
}

if (fails) { console.error(`test_coherence: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_coherence: all green');
