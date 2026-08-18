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
      if (r.caseId !== kase.id || r.lost || r.uploadedAt === null || r.dismissed) continue;
      if (state.time >= r.expiresAt) continue;
      out.push(r);
    }
    return out;
  }

  // The analyst can pull an irrelevant frame from a file (player-directed):
  // excising a poisoned frame can clean a contested file and let a track
  // close — and excising your own true frames is a new way to be wrong.
  Actions.dismissRead = function (state, caseId, readId) {
    const kase = byId(state, caseId);
    if (!kase) return { ok: false, reason: 'NO SUCH CASE' };
    if (kase.status !== 'OPEN' && kase.status !== 'CONTESTED') return { ok: false, reason: 'FILE NOT WORKABLE' };
    const read = state.reads[readId - 1];
    if (!read || read.caseId !== kase.id) return { ok: false, reason: 'NOT IN THIS FILE' };
    read.dismissed = !read.dismissed;   // a toggle — pulled frames can come back
    state.stats.dismissed = (state.stats.dismissed || 0) + (read.dismissed ? 1 : -1);
    State.emit(state, { type: 'frameDismissed', caseId: kase.id, readId, dismissed: read.dismissed });
    if (read.dismissed) State.log(state, 'Frame pulled from the file. Tap it again to restore.', 'first-dismiss');
    // a cleaned contested file may go back to quietly building
    if (kase.status === 'CONTESTED') {
      const g = grade(state, usableEvidence(state, kase), gradeOpts(kase));
      const S = CONFIG.Cases.CLOSURE_CONFIDENCE_SUM;
      const tier = CONFIG.Ladder.TIERS[state.ladder.tier] || CONFIG.Ladder.TIERS[1];
      const band = CONFIG.Cases.CONTESTED_BAND * (tier.contestedMult || 1);
      const nearBar = g.best && g.bestSum >= S - band && g.bestSum < S;
      if (!g.contradiction && !nearBar) {
        kase.status = 'OPEN';
        kase.contested = null;
        State.log(state, 'File cleaned up — case building again.', null);
      }
    }
    return { ok: true };
  };

  // Which pairs of reads cannot be one vehicle — the evidence sheet marks
  // these so the player can see WHERE the file's story breaks.
  function contradictionPairs(state, evidence) {
    const pairs = [];
    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        if (!pairCoherent(state, evidence[i], evidence[j])) pairs.push([evidence[i].id, evidence[j].id]);
      }
    }
    return pairs;
  }

  // Best coherent triple by confidence sum; also reports whether any
  // contradictory pair exists in the evidence set. A valid triple is a
  // TRACK (player-directed): it spans distinct cameras, and its earliest
  // read comes from near the scene — picked up where it happened,
  // followed across the city, taken down at the last pole.
  function grade(state, evidence, opts) {
    opts = opts || {};
    const K = CONFIG.Cases.READS_TO_CLOSE;
    const minCams = opts.minCams !== undefined ? opts.minCams : CONFIG.Cases.MIN_TRACK_CAMS;
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
          if (new Set(triple.map(r => r.camId)).size < minCams) return;
          if (opts.anchorNode !== undefined &&
              nodeDist(state, camNode(state, triple[0]), opts.anchorNode) > CONFIG.Cases.ANCHOR_DIST) return;
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

  // grading options for a case: vandal files are one witnessed scene,
  // everything else must be a cross-town track anchored at the crime
  function gradeOpts(kase) {
    return kase.type === 'VANDAL' ? { minCams: 1 } : { anchorNode: kase.spawnNode };
  }

  // ---- crimes ----

  // Specific crimes at recognisable places (player-directed): the kind
  // and the landmark come from where it happened, and the tip line says
  // what the witness actually saw.
  const PETTY_KINDS = {
    HOUSES: ['BREAK-IN', 'THE ROW HOUSES'],
    APARTMENTS: ['MUGGING', 'THE APARTMENTS'],
    DOWNTOWN: ['CAR THEFT', 'DOWNTOWN'],
    SYNDICATE: ['SHAKEDOWN', 'THE SYNDICATE BLOCK'],
    BANK: ['PURSE SNATCHING', 'THE BANK STEPS'],
    OFFICE: ['SMASH-AND-GRAB', 'THE OFFICE TOWER'],
    GROCERY: ['SHOPLIFTING', 'THE GROCERY STORE']
  };
  const TIP_VERBS = {
    'BANK ROBBERY': 'rob', 'OFFICE BURGLARY': 'hit', 'ARMED ROBBERY': 'hold up',
    'SHOPLIFTING': 'run from', 'MUGGING': 'flee', 'BREAK-IN': 'leave',
    'CAR THEFT': 'boost a car near', 'SHAKEDOWN': 'work', 'PURSE SNATCHING': 'strike at',
    'SMASH-AND-GRAB': 'hit', 'SYNDICATE HEIST': 'clean out'
  };

  function openCrime(state, type) {
    const rng = () => State.rngNext(state, 'crimes');
    let spawnNode, kind, landmark;
    if (type === 'SYNDICATE') {
      spawnNode = state.map.syndicate;
      kind = 'SYNDICATE HEIST'; landmark = 'THE SYNDICATE BLOCK';
    } else if (type === 'MAJOR') {
      const r = rng();
      const pick = r < 0.4 ? ['BANK', 'BANK ROBBERY', 'THE BANK']
        : r < 0.7 ? ['OFFICE', 'OFFICE BURGLARY', 'THE OFFICE TOWER']
        : ['GROCERY', 'ARMED ROBBERY', 'THE GROCERY STORE'];
      spawnNode = state.map.poi[pick[0]];
      kind = pick[1]; landmark = pick[2];
    } else {
      const zones = state.map.spawnZones;
      spawnNode = zones[Math.floor(rng() * zones.length)];
      const district = state.map.districts[spawnNode] || 'HOUSES';
      const k = PETTY_KINDS[district] || ['THEFT', 'THE ' + district];
      kind = k[0]; landmark = k[1];
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
      // some witnesses catch no plate (player-directed): the file opens on
      // the description alone and cannot be tracked, arrested or charged
      // until the analyst ties it to a candidate car
      const unidentified = type !== 'SYNDICATE' &&
        State.rngNext(state, 'crimes') < CONFIG.Cases.UNIDENTIFIED_CHANCE;
      kase = {
        id: state.nextCaseId++, type,
        truePlate: crew.plate,
        plate: unidentified ? null : crew.plate,
        crewId,
        kind, landmark,
        spawnNode, openedAt: state.time,
        coldAt: state.time + CONFIG.Cases.LIFETIME_SECONDS,
        status: 'OPEN', riskAnnounced: false, atRiskUntil: 0,
        closedTriple: null, falseCharge: false, contested: null,
        _peakUsable: 0
      };
      // the witness saw the actual car — usually well, sometimes vaguely
      kase.witnessDesc = witnessDescription(carIdentity(kase.truePlate),
        State.rngNext(state, 'witness'), State.rngNext(state, 'witness'));
      state.cases.push(kase);
      if (kase.plate === null) {
        State.log(state, 'No plate on the file — just "a ' + kase.witnessDesc + '". Candidates will collect on the card.', 'first-unidentified');
      }
    }

    // choose exit weighted toward nearer ones
    const exits = state.map.exits;
    const weights = exits.map(e => 1 / (1 + nodeDist(state, spawnNode, e)));
    const exit = exits[weightedIndex(weights, rng())];
    const veh = Traffic.spawnVehicle(state, 'SUSPECT', spawnNode, exit, crewId, kase.id, kase.truePlate || kase.plate);

    State.emit(state, { type: 'crime', crimeType: type, node: spawnNode, caseId: kase.id, kind });
    // every reported crime rings the tip line (player-directed) with what
    // the witness actually saw; high trust gets zones flagged EARLY at the
    // telegraph, before the car moves
    state.stats.tips++;
    const verb = TIP_VERBS[kind] || 'flee';
    State.emit(state, {
      type: 'tip', node: spawnNode, caseId: kase.id, early: false,
      bubble: 'Saw a ' + kase.witnessDesc + '\n' + verb + ' ' + landmark + '!'
    });
    State.log(state, 'Tip line: saw a ' + kase.witnessDesc + ' ' + verb + ' ' + landmark + '!', null);
    return kase;
  }

  // ---- read attachment (called by Traffic and Vandals) ----

  // Unidentified files collect CANDIDATES instead of evidence: any
  // clearly-photographed car matching the witness description near the
  // scene joins the lineup, capped, until the analyst ties the file.
  function candidateScan(state, read) {
    const s = state.map.segs[read.segId];
    for (const kase of state.cases) {
      if (kase.plate !== null) continue;
      if (kase.status !== 'OPEN' || state.time >= kase.coldAt) continue;
      const d = Math.min(nodeDist(state, s.a, kase.spawnNode), nodeDist(state, s.b, kase.spawnNode));
      if (d > CONFIG.Cases.CANDIDATE_DIST) continue;
      if (!descriptionMatches(kase.witnessDesc, carIdentity(read.actualPlate))) continue;
      if (!kase._candPlates) kase._candPlates = {};
      const isNew = !kase._candPlates[read.actualPlate];
      if (isNew && Object.keys(kase._candPlates).length >= CONFIG.Cases.CANDIDATE_MAX) continue;
      kase._candPlates[read.actualPlate] = true;
      read.candidateOf = kase.id;
      kase._leads = (kase._leads || 0) + 1;
      if (isNew) State.emit(state, { type: 'candidate', caseId: kase.id, plate: read.actualPlate });
      return;   // a frame joins one lineup
    }
  }

  function attachRead(state, read, veh, cam) {
    if (!read.qualifying) return;     // below the bar: never enters a file (§7)
    if (veh && veh.caseId !== null) {
      const kase = byId(state, veh.caseId);
      // a tied file only accepts reads of ITS plate — if you tied it to
      // the wrong car, the real crew's reads no longer help you
      if (kase && kase.plate !== null && veh.plate === kase.plate &&
          (kase.status === 'OPEN' || kase.status === 'CONTESTED') && state.time < kase.coldAt) {
        read.caseId = kase.id;
        read.trueMatch = read.actualPlate === kase.truePlate;
        read.plate = kase.plate;
        kase._leads = (kase._leads || 0) + 1;
        return;
      }
      candidateScan(state, read);   // its own file untied (or gone): the lineup may still want this frame
      return;
    }
    candidateScan(state, read);
    if (read.candidateOf !== undefined) return;
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
      if (kase.type === 'VANDAL' || kase.plate === null) continue;
      if (state.time >= kase.coldAt) continue;
      const d = Math.min(nodeDist(state, s.a, kase.spawnNode), nodeDist(state, s.b, kase.spawnNode));
      if (d < bestD) { bestD = d; best = kase; }
    }
    if (bestD > C.MISREAD_MAX_DIST) return;
    if (best) {
      read.caseId = best.id;
      read.trueMatch = false;
      read.plate = best.plate;        // the misread "looks like" the suspect plate
      best._leads = (best._leads || 0) + 1;
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

  // The pipeline (player-directed): corroborate → ARREST → conviction.
  // Corroboration makes the arrest; the file must then survive to trial —
  // evidence that ages off the drives before conviction collapses in court.
  function close(state, kase, triple, via) {
    kase.status = 'ARREST';
    kase.via = via || 'auto';
    kase.closedAt = state.time;
    kase.convictAt = state.time + CONFIG.Cases.CONVICTION_DELAY;
    kase.closedTriple = (triple || []).map(r => r.id);
    const falseCount = (triple || []).filter(r => !r.trueMatch).length;
    kase.falseCharge = falseCount >= CONFIG.Cases.FALSE_MAJORITY;
    state.clrClosed += 1;                  // the arrest is what clearance counts
    state.stats.closures++;
    // the last read in the track is where they're taken down
    const last = (triple || []).slice().sort((a, b) => a.t - b.t).pop();
    kase.arrestNode = last ? camNode(state, last) : kase.spawnNode;
    const where = state.map.districts ? state.map.districts[kase.arrestNode] : null;
    const PHRASE = { DOWNTOWN: 'downtown', APARTMENTS: 'by the apartments', HOUSES: 'in the row houses',
      BANK: 'outside the bank', OFFICE: 'by the office tower', GROCERY: 'at the grocery store',
      SYNDICATE: 'on the syndicate block' };
    State.emit(state, { type: 'arrest', caseId: kase.id, via: kase.via, node: kase.arrestNode });
    State.log(state, 'Tracked and taken down ' + (PHRASE[where] || 'mid-route') + ' — ' + kase.plate + '.', null);

    // an arrest takes the vandal crew off the board immediately
    if (kase.type === 'VANDAL') {
      const crew = state.crews[kase.crewId];
      if (crew) {
        crew.caught = true;
        for (const v of state.vandals) if (v.crewId === crew.id) v.state = 'CAUGHT';
      }
    }
  }

  function resolveConviction(state, kase) {
    const E = CONFIG.Economy;
    kase.status = 'CLOSED';
    const triple = (kase.closedTriple || []).map(id => state.reads[id - 1]).filter(Boolean);
    // the file must still stand up: enough of the closing reads unexpired
    const alive = triple.filter(r => !r.lost && r.expiresAt !== undefined && state.time < r.expiresAt).length;
    kase.collapsed = alive < CONFIG.Cases.READS_TO_CLOSE - 1;

    if (kase.falseCharge) {
      // the trap (§7.1): the wrongful conviction still pays
      state.budget += payout(state, kase);
      state.trust = Math.max(0, state.trust - E.TRUST_LOSS_FALSE_CHARGE);
      state.stats.falseCharges++;
      state.falseChargesThisShift++;
      const wrong = triple.find(r => !r.trueMatch);
      State.emit(state, { type: 'falseCharge', caseId: kase.id, actualPlate: wrong ? wrong.actualPlate : '?' });
      State.log(state, 'Wrong plate convicted. The crew is still out there.', 'first-false-charge');
      State.log(state, 'Convicted ' + kase.plate + ' — the reads were of ' + (wrong ? wrong.actualPlate : 'another car') + '.', null);
      return;
    }
    if (kase.collapsed) {
      state.budget += payout(state, kase) * E.COLLAPSE_PAYOUT_MULT;
      State.emit(state, { type: 'caseCollapsed', caseId: kase.id });
      State.log(state, 'The footage aged out before trial. Case collapsed in court.', 'first-collapse');
      return;
    }
    state.budget += payout(state, kase);
    State.emit(state, { type: 'caseClosed', caseId: kase.id, via: kase.via });
    State.log(state, 'Conviction — ' + kase.plate + '.', 'first-conviction');
    if (kase.type === 'SYNDICATE') {
      state.warrant = Math.min(CONFIG.Warrant.REQUIRED, state.warrant + CONFIG.Warrant.PER_CASE);
      State.emit(state, { type: 'warrant', value: state.warrant });
      State.log(state, 'Syndicate conviction. Warrant at ' + Math.round(state.warrant) + '%.', null);
    }
    if (kase.type === 'VANDAL') {
      const crew = state.crews[kase.crewId];
      if (crew) {
        const bounty = Math.round(crew.damage * CONFIG.Vandals.CREW_CASE_BOUNTY_MULT);
        state.budget += bounty;
        state.stats.bounties++;
        State.log(state, 'Vandal crew convicted. Recovered ' + bounty + '.', null);
      }
    }
  }

  // Clearance judges the cases you ENGAGED (player-directed rebalance for
  // the tracking era): a file with zero qualifying reads lapses quietly —
  // the city is bigger than the network, and that is not the analyst's
  // failure. Losing a lead you HAD still costs.
  function goCold(state, kase, reason) {
    // the "city is bigger than the network" mercy requires HAVING a
    // network: with no working cameras, every cold crime is on you —
    // which is also what lets a refused Review still end (§16.1)
    const hasNetwork = state.cameras.some(c => c.type !== 'RELAY');
    const engaged = !hasNetwork ||
      (kase._leads || 0) >= CONFIG.Cases.ENGAGED_AT || kase.status === 'CONTESTED';
    if (!engaged) {
      kase.status = 'LAPSED';
      state.stats.lapsed = (state.stats.lapsed || 0) + 1;
      State.emit(state, { type: 'caseCold', caseId: kase.id, reason: 'no-leads' });
      return;
    }
    kase.status = 'COLD';
    kase.coldReason = reason || 'expired';
    state.clrCold += 1;
    state.stats.colds++;
    State.emit(state, { type: 'caseCold', caseId: kase.id, reason: kase.coldReason });
  }

  // ---- the adjudication verb (§9) ----

  Actions.adjudicate = function (state, caseId, choice) {
    const kase = byId(state, caseId);
    if (!kase) return { ok: false, reason: 'NO SUCH CASE' };
    if (kase.status !== 'CONTESTED') return { ok: false, reason: 'NOT CONTESTED' };
    const ev = usableEvidence(state, kase);
    const g = grade(state, ev, gradeOpts(kase));
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

  // Tie an unidentified file to a candidate car (player-directed): its
  // lineup frames become evidence, and from here the normal track →
  // arrest → charge pipeline applies. Tie it to the wrong car and the
  // real crew's reads stop helping you — the deepest trap in the game.
  Actions.identify = function (state, caseId, plate) {
    const kase = byId(state, caseId);
    if (!kase) return { ok: false, reason: 'NO SUCH CASE' };
    if (kase.plate !== null) return { ok: false, reason: 'FILE ALREADY TIED' };
    if (kase.status !== 'OPEN') return { ok: false, reason: 'FILE NOT OPEN' };
    if (!kase._candPlates || !kase._candPlates[plate]) return { ok: false, reason: 'NOT IN THE LINEUP' };
    kase.plate = plate;
    let attached = 0;
    for (const r of state.reads) {
      if (r.candidateOf !== kase.id) continue;
      if (r.actualPlate === plate) {
        r.caseId = kase.id;
        r.plate = plate;
        r.trueMatch = r.actualPlate === kase.truePlate;
        delete r.candidateOf;
        attached++;
      } else {
        delete r.candidateOf;   // the rest of the lineup goes home
      }
    }
    // the clock restarts where the investigation properly begins
    kase.coldAt = Math.max(kase.coldAt, state.time + CONFIG.Cases.LIFETIME_SECONDS * CONFIG.Cases.IDENTIFY_EXTEND);
    state.stats.identified = (state.stats.identified || 0) + 1;
    State.emit(state, { type: 'identified', caseId: kase.id, plate, frames: attached });
    State.log(state, 'File tied to ' + plate + '. Track it, and the arrest can follow.', 'first-identified');
    return { ok: true, attached };
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
      if (kase.status === 'ARREST' && state.time >= kase.convictAt) resolveConviction(state, kase);
      if (kase.status !== 'OPEN' && kase.status !== 'CONTESTED') continue;

      // the suspect drives again mid-lifetime (player-directed tracking):
      // one crime is one pass; the second sighting is what lets two
      // cameras build a cross-town track. Syndicate re-runs via its
      // repeat jobs; vandal scenes don't drive.
      if (kase.type !== 'VANDAL' && kase.type !== 'SYNDICATE' && !kase._secondRun &&
          state.time >= kase.openedAt + CONFIG.Cases.LIFETIME_SECONDS * CONFIG.Cases.SECOND_RUN_AT) {
        kase._secondRun = true;
        const exits = state.map.exits;
        const exit = exits[Math.floor(State.rngNext(state, 'crimes') * exits.length)];
        const veh = Traffic.spawnVehicle(state, 'SUSPECT', kase.spawnNode, exit, kase.crewId, kase.id, kase.truePlate || kase.plate);
        if (veh) {
          State.emit(state, {
            type: 'tip', node: kase.spawnNode, caseId: kase.id, early: false,
            bubble: 'Seen again —\na ' + (kase.witnessDesc || kase.plate) + '!'
          });
          State.log(state, 'Seen again near ' + (kase.landmark || 'the scene') + ' — ' + (kase.witnessDesc || kase.plate) + '.', null);
        }
      }
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

      const g = grade(state, ev, gradeOpts(kase));
      const S = CONFIG.Cases.CLOSURE_CONFIDENCE_SUM;

      if (kase.status === 'OPEN') {
        if (g.best && g.bestSum >= S && !g.contradiction) {
          close(state, kase, g.best, 'auto');
          continue;
        }
        const tier = CONFIG.Ladder.TIERS[state.ladder.tier] || CONFIG.Ladder.TIERS[1];
        const band = CONFIG.Cases.CONTESTED_BAND * (tier.contestedMult || 1);
        const nearBar = g.best && g.bestSum >= S - band && g.bestSum < S;
        const contested = (g.contradiction && ev.length >= 2) || nearBar;
        if (contested && state.contestedThisShift < CONFIG.Cases.CONTESTED_PER_SHIFT_MAX) {
          kase.status = 'CONTESTED';
          state.contestedThisShift++;
          state.stats.contestedShown++;
          kase.contested = { at: state.time, reads: ev.length, contradiction: g.contradiction, nearBar: !!nearBar };
          State.emit(state, { type: 'contested', caseId: kase.id });
          State.log(state, 'Contested case. Open the card and read the stills before you rule.', 'first-contested');
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

  return { byId, openCrime, attachRead, tick, close, goCold, usableEvidence, grade, gradeOpts, nodeDist, pairCoherent, contradictionPairs };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { CaseSystem };
