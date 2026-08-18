// ============================================================
// CASES — crimes open cases; qualifying reads become evidence
// after upload; three corroborating reads on a coherent route
// close a case (§8). Contradictions flag contested — never a
// silent wrong closure; that invariant is proven by
// test_coherence.js on every build.
// ============================================================

var CaseSystem = (() => {

  function byId(state, id) {
    return state.cases.find(c => c.id === id) || null;
  }

  // BFS hop distance between two nodes, cached per source node.
  function nodeDist(state, a, b) {
    if (!state.map._distCache) state.map._distCache = new Map();
    let d = state.map._distCache.get(a);
    if (!d) { d = MapGen.bfsMulti(state.map, [a]); state.map._distCache.set(a, d); }
    return d[b];
  }

  function camNode(state, read) {
    if (read.camNode !== undefined) return read.camNode;
    const s = state.map.segs[read.segId];
    return s.a;
  }

  // Two reads are consistent with one vehicle's travel iff the gap in
  // space is coverable in the gap in time at the fastest road speed,
  // plus a slack (§8.2). Same camera never contradicts itself.
  function pairCoherent(state, r1, r2) {
    const dt = Math.abs(r1.t - r2.t);
    const dd = nodeDist(state, camNode(state, r1), camNode(state, r2));
    return dd <= dt * Traffic.maxSegPerSec() + CONFIG.Cases.COHERENCE_SLACK_SEGS;
  }

  // Usable evidence right now: qualifying, attached, uploaded, not lost,
  // not expired.
  function usableEvidence(state, kase) {
    const out = [];
    for (const r of state.reads) {
      if (r.caseId !== kase.id || r.lost || r.uploadedAt === null) continue;
      if (state.time >= r.expiresAt) continue;
      out.push(r);
    }
    return out;
  }

  // Best coherent triple by confidence sum; also reports whether any
  // contradictory pair exists in the evidence set.
  function grade(state, evidence) {
    const K = CONFIG.Cases.READS_TO_CLOSE;
    const E = evidence.slice().sort((a, b) => b.conf - a.conf).slice(0, 10);
    let contradiction = false;
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      if (!pairCoherent(state, E[i], E[j])) { contradiction = true; }
    }
    let best = null, bestSum = -1;
    if (E.length >= K) {
      const idx = [];
      const pick = (start) => {
        if (idx.length === K) {
          const triple = idx.map(i => E[i]).sort((a, b) => a.t - b.t);
          for (let i = 0; i + 1 < triple.length; i++) {
            if (!pairCoherent(state, triple[i], triple[i + 1])) return;
          }
          if (!pairCoherent(state, triple[0], triple[triple.length - 1])) return;
          const sum = triple.reduce((s, r) => s + r.conf, 0);
          if (sum > bestSum) { bestSum = sum; best = triple; }
          return;
        }
        for (let i = start; i < E.length; i++) { idx.push(i); pick(i + 1); idx.pop(); }
      };
      pick(0);
    }
    return { best, bestSum, contradiction, count: evidence.length };
  }

  // ---- crimes ----

  function openCrime(state, type) {
    const rng = () => State.rngNext(state, 'crimes');
    let spawnNode;
    if (type === 'SYNDICATE') {
      spawnNode = state.map.syndicate;
    } else {
      const zones = state.map.spawnZones;
      spawnNode = zones[Math.floor(rng() * zones.length)];
    }
    const crewId = type === 'SYNDICATE' ? 'syndicate'
      : type === 'MAJOR' ? 'major-a'
      : (rng() < 0.5 ? 'petty-a' : 'petty-b');
    const crew = state.crews[crewId];
    state.stats.crimes++;

    // Syndicate continuity: the crew keeps its plate, and a still-open
    // syndicate case absorbs the new job's reads — this is what makes
    // the shift-5 recovery possible (§14.4).
    let kase = null;
    if (type === 'SYNDICATE') {
      kase = state.cases.find(c => c.crewId === 'syndicate' && (c.status === 'OPEN' || c.status === 'CONTESTED'));
    }
    if (!kase) {
      if (!crew.plate || type !== 'SYNDICATE') crew.plate = makePlate(() => State.rngNext(state, 'plates'));
      if (type === 'SYNDICATE' && !crew.plate) crew.plate = makePlate(() => State.rngNext(state, 'plates'));
      kase = {
        id: state.nextCaseId++, type, plate: crew.plate, crewId,
        spawnNode, openedAt: state.time,
        coldAt: state.time + CONFIG.Cases.LIFETIME_SECONDS,
        status: 'OPEN', riskAnnounced: false, atRiskUntil: 0,
        closedTriple: null, falseCharge: false, contested: null,
        _peakUsable: 0
      };
      state.cases.push(kase);
    }

    // choose exit weighted toward nearer ones
    const exits = state.map.exits;
    const weights = exits.map(e => 1 / (1 + nodeDist(state, spawnNode, e)));
    const exit = exits[weightedIndex(weights, rng())];
    const veh = Traffic.spawnVehicle(state, 'SUSPECT', spawnNode, exit, crewId, kase.id, kase.plate);

    State.emit(state, { type: 'crime', crimeType: type, node: spawnNode, caseId: kase.id });
    // High trust: citizen tips reveal the start early (§15.3)
    if (state.trust >= CONFIG.Economy.HIGH_TRUST_AT) {
      state.stats.tips++;
      State.emit(state, { type: 'tip', node: spawnNode, caseId: kase.id });
      State.log(state, 'Tip line: trouble near intersection ' + spawnNode + '.', 'first-tip');
    }
    return kase;
  }

  // ---- read attachment (called by Traffic and Vandals) ----

  function attachRead(state, read, veh, cam) {
    if (!read.qualifying) return;     // below the bar: never enters a file (§7)
    if (veh && veh.caseId !== null) {
      const kase = byId(state, veh.caseId);
      if (kase && (kase.status === 'OPEN' || kase.status === 'CONTESTED') && state.time < kase.coldAt) {
        read.caseId = kase.id;
        read.trueMatch = true;
        read.plate = kase.plate;
      }
      return;
    }
    // Ambient vehicle. A clean read identifies an uninvolved plate and is
    // discarded; an ambiguous one (below CLARITY) can misattach to the
    // nearest open case — §7.1's trap, priced by the threshold. How often
    // an ambiguous plate happens to resemble a suspect's scales with how
    // ambiguous the read is: a lax bar admits liars, a strict one rarely.
    const C = CONFIG.Confidence;
    if (read.conf >= C.CLARITY) return;
    const p = C.MISREAD_BASE * (C.CLARITY - read.conf) / C.CLARITY;
    if (State.rngNext(state, 'misread') >= p) return;
    let best = null, bestD = Infinity;
    const s = state.map.segs[read.segId];
    for (const kase of state.cases) {
      if (kase.status !== 'OPEN' && kase.status !== 'CONTESTED') continue;
      if (kase.type === 'VANDAL') continue;
      if (state.time >= kase.coldAt) continue;
      const d = Math.min(nodeDist(state, s.a, kase.spawnNode), nodeDist(state, s.b, kase.spawnNode));
      if (d < bestD) { bestD = d; best = kase; }
    }
    if (bestD > C.MISREAD_MAX_DIST) return;
    if (best) {
      read.caseId = best.id;
      read.trueMatch = false;
      read.plate = best.plate;        // the misread "looks like" the suspect plate
      state.stats.falseAttached++;
    }
  }

  // ---- closure / contested / cold ----

  function payout(state, kase) {
    const E = CONFIG.Economy;
    let pay = kase.type === 'SYNDICATE' ? E.PAYOUT_SYNDICATE
      : kase.type === 'MAJOR' ? E.PAYOUT_MAJOR
      : kase.type === 'VANDAL' ? 0
      : E.PAYOUT_PETTY;
    if (state.trust < E.LOW_TRUST_AT) pay *= E.LOW_TRUST_PAYOUT_MULT;
    return pay;
  }

  function close(state, kase, triple, via) {
    const E = CONFIG.Economy;
    kase.status = 'CLOSED';
    kase.via = via || 'auto';
    kase.closedAt = state.time;
    kase.closedTriple = (triple || []).map(r => r.id);
    const falseCount = (triple || []).filter(r => !r.trueMatch).length;
    kase.falseCharge = falseCount >= CONFIG.Cases.FALSE_MAJORITY;
    state.clrClosed += 1;
    state.budget += payout(state, kase);   // closures pay whether or not the charge was correct (§15.1)
    state.stats.closures++;

    if (kase.falseCharge) {
      state.trust = Math.max(0, state.trust - E.TRUST_LOSS_FALSE_CHARGE);
      state.stats.falseCharges++;
      state.falseChargesThisShift++;
      const wrong = (triple || []).find(r => !r.trueMatch);
      State.emit(state, { type: 'falseCharge', caseId: kase.id, actualPlate: wrong ? wrong.actualPlate : '?' });
      State.log(state, 'Wrong plate charged. The crew is still out there.', 'first-false-charge');
      State.log(state, 'Charged ' + kase.plate + ' — the reads were of ' + (wrong ? wrong.actualPlate : 'another car') + '.', null);
    } else {
      State.emit(state, { type: 'caseClosed', caseId: kase.id, via: via || 'auto' });
      if (kase.type === 'SYNDICATE') {
        state.warrant = Math.min(CONFIG.Warrant.REQUIRED, state.warrant + CONFIG.Warrant.PER_CASE);
        State.emit(state, { type: 'warrant', value: state.warrant });
        State.log(state, 'Syndicate case closed. Warrant at ' + Math.round(state.warrant) + '%.', null);
      }
      if (kase.type === 'VANDAL') {
        const crew = state.crews[kase.crewId];
        if (crew) {
          const bounty = Math.round(crew.damage * CONFIG.Vandals.CREW_CASE_BOUNTY_MULT);
          state.budget += bounty;
          state.stats.bounties++;
          crew.caught = true;
          for (const v of state.vandals) if (v.crewId === crew.id) v.state = 'CAUGHT';
          State.log(state, 'Vandal crew identified and picked up. Recovered ' + bounty + '.', null);
        }
      }
    }
  }

  function goCold(state, kase, reason) {
    kase.status = 'COLD';
    state.clrCold += 1;
    state.stats.colds++;
    State.emit(state, { type: 'caseCold', caseId: kase.id, reason: reason || 'expired' });
  }

  // ---- the adjudication verb (§9) ----

  Actions.adjudicate = function (state, caseId, choice) {
    const kase = byId(state, caseId);
    if (!kase) return { ok: false, reason: 'NO SUCH CASE' };
    if (kase.status !== 'CONTESTED') return { ok: false, reason: 'NOT CONTESTED' };
    const ev = usableEvidence(state, kase);
    const g = grade(state, ev);
    const graded = g.best || ev.slice().sort((a, b) => b.conf - a.conf).slice(0, CONFIG.Cases.READS_TO_CLOSE);
    const majorityTrue = graded.filter(r => r.trueMatch).length > graded.length / 2;
    state.stats.contestedResolved++;

    if (choice === 'CHARGE') {
      close(state, kase, graded, 'charge');
    } else if (choice === 'RELEASE') {
      if (majorityTrue) {
        goCold(state, kase, 'released');   // the real crew walks: clearance pays
      } else {
        kase.status = 'RELEASED';           // nothing lost, small trust gain
        state.trust = Math.min(100, state.trust + CONFIG.Economy.TRUST_GAIN_CORRECT_RELEASE);
        State.emit(state, { type: 'released', caseId: kase.id, correct: true });
      }
    } else return { ok: false, reason: 'CHARGE OR RELEASE' };
    return { ok: true, kase };
  };

  Actions.setThreshold = function (state, v) {
    const T = CONFIG.Threshold;
    const nv = clamp(Math.round(v), T.MIN, T.MAX);
    if (nv === state.threshold) return { ok: true, unchanged: true };
    state.threshold = nv;
    State.emit(state, { type: 'threshold', value: nv, band: State.thresholdBand(state) });
    return { ok: true };
  };

  // ---- per-tick lifecycle ----

  function tick(state, dt) {
    for (const kase of state.cases) {
      if (kase.status !== 'OPEN' && kase.status !== 'CONTESTED') continue;
      const ev = usableEvidence(state, kase);

      // §14.4: evidence loss makes the wall visible
      if (ev.length < kase._peakUsable && !kase.riskAnnounced && ev.length < CONFIG.Cases.READS_TO_CLOSE) {
        const lost = state.reads.some(r => r.caseId === kase.id && r.lost);
        if (lost) {
          kase.riskAnnounced = true;
          State.emit(state, { type: 'caseAtRisk', caseId: kase.id, coldAt: kase.coldAt });
          State.log(state, 'CASE AT RISK — evidence lost, file expires in ' + Math.max(0, Math.round(kase.coldAt - state.time)) + 's.', null);
        }
      }
      kase._peakUsable = Math.max(kase._peakUsable, ev.length);

      // §10.4 floor valve: evidence near expiry glows on the card
      for (const r of ev) {
        if (r.expiresAt - state.time < CONFIG.Cases.STARVATION_GRACE && !r._glowed) {
          r._glowed = true;
          State.emit(state, { type: 'evidenceExpiring', caseId: kase.id, readId: r.id });
        }
      }

      const g = grade(state, ev);
      const S = CONFIG.Cases.CLOSURE_CONFIDENCE_SUM;

      if (kase.status === 'OPEN') {
        if (g.best && g.bestSum >= S && !g.contradiction) {
          close(state, kase, g.best, 'auto');
          continue;
        }
        const nearBar = g.best && g.bestSum >= S - CONFIG.Cases.CONTESTED_BAND && g.bestSum < S;
        const contested = (g.contradiction && ev.length >= 2) || nearBar;
        if (contested && state.contestedThisShift < CONFIG.Cases.CONTESTED_PER_SHIFT_MAX) {
          kase.status = 'CONTESTED';
          state.contestedThisShift++;
          state.stats.contestedShown++;
          kase.contested = { at: state.time, reads: ev.length, contradiction: g.contradiction, nearBar: !!nearBar };
          State.emit(state, { type: 'contested', caseId: kase.id });
          State.log(state, 'Contested case: the evidence is not sure of itself. Charge or release.', 'first-contested');
        }
      } else if (kase.status === 'CONTESTED') {
        // a contested case that accumulates clean closure evidence still
        // needs the player's call — the card is already on the table
        if (g.best && g.bestSum >= S && !g.contradiction && !g.best.some(r => !r.trueMatch)) {
          // fully clean file resolves itself; the card withdraws
          close(state, kase, g.best, 'auto');
          continue;
        }
      }

      if (state.time >= kase.coldAt) {
        if (kase.status === 'CONTESTED') {
          // cards never softlock (§9.1): unattended card auto-releases
          state.stats.autoReleased++;
          goCold(state, kase, 'auto-release');
          State.log(state, 'Contested case expired unanswered — released.', null);
        } else {
          goCold(state, kase, 'expired');
          if (kase.type === 'SYNDICATE') State.log(state, 'Syndicate file went cold.', null);
        }
      }
    }
  }

  return { byId, openCrime, attachRead, tick, close, goCold, usableEvidence, grade, nodeDist, pairCoherent };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { CaseSystem };
