// ============================================================
// VANDALS — scrappers want the panel, taggers are bored, the
// Fixer wants you blind before a job (§11.2). Rate limits and
// unreachable-target fallbacks keep the AI from livelocking
// (§11.4, proven by test_vandals.js). A vandal acting inside
// another camera's sightline is being recorded — that case is
// the counterplay (§11.3).
// ============================================================

var VandalSystem = (() => {

  function edgeRoadNodes(state) {
    const m = state.map;
    return m.nodes.filter(n =>
      (n.x === 0 || n.y === 0 || n.x === m.W - 1 || n.y === m.H - 1) && m.adj[n.id].length > 0);
  }

  function pickTarget(state, vandal) {
    // nobody strips a pole with a uniform standing on it
    const cams = state.cameras.filter(c => c.type !== 'OFFICER');
    if (!cams.length) return null;
    if (vandal.type === 'SCRAPPER') {
      // isolation: fewest other cameras watching the pole
      let best = null, bestScore = Infinity;
      for (const c of cams) {
        const watchers = Sightlines.camerasWatchingNode(state, c.node, c.id).length;
        const score = watchers * CONFIG.Vandals.SCRAPPER.ISOLATION_WEIGHT + State.rngNext(state, 'vandals') * 0.5;
        if (score < bestScore) { bestScore = score; best = c; }
      }
      return best;
    }
    if (vandal.type === 'TAGGER') {
      const at = vandal.path ? vandal.path[vandal.at] : vandal.spawnNode;
      let best = null, bestD = Infinity;
      for (const c of cams) {
        const d = CaseSystem.nodeDist(state, at, c.node);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    }
    // FIXER: the single highest-coverage camera
    let best = null, bestCov = -1;
    for (const c of cams) {
      if (c.sight.length > bestCov) { bestCov = c.sight.length; best = c; }
    }
    return best;
  }

  function walkRoute(state, from, to) {
    return Traffic.route(state, from, to, null);
  }

  function spawn(state, type, crewId, forcedTargetCamId, spawnNode) {
    let from = spawnNode;
    if (from === undefined) {
      const edges = edgeRoadNodes(state);
      if (!edges.length) return null;
      from = edges[Math.floor(State.rngNext(state, 'vandals') * edges.length)].id;
    }
    const vandal = {
      id: state.nextVandalId++, type, crewId,
      spawnNode: from, path: null, at: 0, segT: 0,
      targetCamId: forcedTargetCamId || null, forced: !!forcedTargetCamId,
      state: 'MOVE', actT: 0, needT: 0,
      lastRetarget: -Infinity, stuckT: 0, idleT: 0,
      spawnedAt: state.time, lastWitnessRead: -Infinity,
      revealedAt: state.time + (state.trust < CONFIG.Economy.LOW_TRUST_AT ? CONFIG.Vandals.REVEAL_DELAY_LOW_TRUST : 0)
    };
    state.vandals.push(vandal);
    state.stats.vandalsSpawned++;
    State.emit(state, { type: 'vandalSpawn', vandalId: vandal.id, vandalType: type, node: from });
    return vandal;
  }

  function actDuration(state, vandal, cam) {
    const V = CONFIG.Vandals;
    let t = vandal.type === 'SCRAPPER' ? V.SCRAPPER.DESTROY_SECONDS
      : vandal.type === 'TAGGER' ? V.TAGGER.DEGRADE_SECONDS
      : V.FIXER.DESTROY_SECONDS;
    if (cam.hardened && vandal.type !== 'TAGGER') t *= V.HARDENED_TIME_MULT;
    return t;
  }

  // The §11.3 signature: cameras watching the vandal's pole take reads of
  // the crew while it works. Those reads build a VANDAL case like any other.
  function witness(state, vandal, node) {
    if (state.time - vandal.lastWitnessRead < CONFIG.Vandals.WITNESS_READ_INTERVAL) return;
    const watchers = Sightlines.camerasWatchingNode(state, node);
    const crew = state.crews[vandal.crewId];
    if (!watchers.length || !crew || crew.caught) return;
    vandal.lastWitnessRead = state.time;
    for (const camId of watchers) {
      const cam = CameraSystem.byId(state, camId);
      if (!cam || cam.node === node) continue;  // a pole cannot testify for itself
      const entry = cam.sight.find(e => {
        const s = state.map.segs[e.seg];
        return s.a === node || s.b === node;
      });
      if (!entry) continue;
      const conf = Sightlines.liveConfidence(state, cam, entry);
      const qualifying = conf >= state.threshold;
      let kase = state.cases.find(c => c.crewId === crew.id && c.type === 'VANDAL' &&
        (c.status === 'OPEN' || c.status === 'CONTESTED'));
      if (!kase && qualifying) {
        if (!crew.plate) crew.plate = makePlate(() => State.rngNext(state, 'plates'));
        kase = {
          id: state.nextCaseId++, type: 'VANDAL', plate: crew.plate, crewId: crew.id,
          kind: 'VANDALISM', landmark: 'A CAMERA POLE',
          witnessDesc: 'HOODED FIGURE',
          spawnNode: node, openedAt: state.time,
          coldAt: state.time + CONFIG.Cases.LIFETIME_SECONDS,
          status: 'OPEN', riskAnnounced: false,
          closedTriple: null, falseCharge: false, contested: null, _peakUsable: 0
        };
        state.cases.push(kase);
        state.stats.witnessCases++;
        State.emit(state, { type: 'witnessCase', caseId: kase.id, camId: cam.id, node });
        State.log(state, 'A neighbouring camera caught the vandal at work. Case opened.', 'first-witness');
      }
      const read = {
        id: state.nextReadId++, t: state.time, segId: entry.seg, vehId: null,
        subjectNode: node,     // where the figure stood — the still shoots this
        crewId: crew.id,
        actualPlate: crew.plate || 'CREW', plate: crew.plate || 'CREW',
        trueMatch: true, conf, qualifying,
        caseId: qualifying && kase ? kase.id : null
      };
      if (read.caseId !== null && kase) kase._leads = (kase._leads || 0) + 1;
      state.stats.reads++;
      if (qualifying) state.stats.qualifying++;
      CameraSystem.record(state, cam, read);
      State.emit(state, { type: 'read', segId: entry.seg, camId: cam.id, conf, qualifying, attached: read.caseId !== null, plate: read.plate, witness: true });
    }
  }

  function flee(state, vandal) {
    const at = vandal.path ? vandal.path[Math.min(vandal.at, vandal.path.length - 1)] : vandal.spawnNode;
    const exits = state.map.exits;
    let best = exits[0], bestD = Infinity;
    for (const e of exits) {
      const d = CaseSystem.nodeDist(state, at, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    vandal.path = walkRoute(state, at, best);
    vandal.at = 0; vandal.segT = 0;
    vandal.state = 'FLEE';
  }

  function tick(state, dt) {
    const V = CONFIG.Vandals;
    for (const vandal of state.vandals) {
      if (vandal.state === 'DONE' || vandal.state === 'CAUGHT') continue;
      const crew = state.crews[vandal.crewId];
      if (crew && crew.caught) { vandal.state = 'CAUGHT'; continue; }

      const atNode = vandal.path ? vandal.path[Math.min(vandal.at, vandal.path.length - 1)] : vandal.spawnNode;

      if (vandal.state === 'MOVE') {
        let target = vandal.targetCamId ? CameraSystem.byId(state, vandal.targetCamId) : null;
        // (re)select target, rate-limited (§11.4)
        if (!target) {
          if (state.time - vandal.lastRetarget < V.RETARGET_COOLDOWN && !vandal.forced) {
            vandal.idleT += dt;
            if (vandal.idleT > V.ABANDON_AFTER) { state.stats.vandalAbandons++; flee(state, vandal); }
            continue;
          }
          vandal.lastRetarget = state.time;
          vandal.forced = false;
          target = pickTarget(state, vandal);
          if (!target) { flee(state, vandal); continue; }
          vandal.targetCamId = target.id;
          vandal.path = walkRoute(state, atNode, target.node);
          vandal.at = 0; vandal.segT = 0;
          if (!vandal.path) { state.stats.vandalAbandons++; vandal.targetCamId = null; vandal.idleT = 0; continue; }
        }
        if (!vandal.path) {
          vandal.path = walkRoute(state, atNode, target.node);
          vandal.at = 0; vandal.segT = 0;
          if (!vandal.path) { state.stats.vandalAbandons++; vandal.targetCamId = null; continue; }
        }
        // target moved (relocation is counterplay): path end must still match
        if (vandal.path[vandal.path.length - 1] !== target.node) {
          vandal.targetCamId = null; vandal.path = null;
          continue;
        }
        if (vandal.at + 1 >= vandal.path.length) {
          vandal.state = 'ACT';
          vandal.actT = 0;
          vandal.needT = actDuration(state, vandal, target);
          State.emit(state, { type: 'vandalAct', vandalId: vandal.id, vandalType: vandal.type, node: target.node, camId: target.id });
          State.log(state, vandal.type === 'SCRAPPER' ? 'Someone is stripping a pole.' :
            vandal.type === 'TAGGER' ? 'Someone is painting a lens.' :
            'Someone professional is taking a camera apart.', 'first-' + vandal.type.toLowerCase());
          continue;
        }
        vandal.segT += dt / V.WALK_SEGMENT_SECONDS;
        if (vandal.segT >= 1) { vandal.segT = 0; vandal.at++; }
      }

      else if (vandal.state === 'ACT') {
        const target = CameraSystem.byId(state, vandal.targetCamId);
        if (!target) { flee(state, vandal); continue; } // someone else took it down / relocated
        if (target.node !== atNode && vandal.path && vandal.path[vandal.path.length - 1] !== target.node) {
          vandal.state = 'MOVE'; vandal.path = null; continue;
        }
        vandal.actT += dt;
        witness(state, vandal, target.node);
        if (vandal.actT >= vandal.needT) {
          state.stats.vandalActs++;
          if (crew) crew.damage += vandal.type === 'TAGGER' ? CONFIG.Upgrades.CLEAN : CONFIG.Cameras[target.type].COST;
          if (vandal.type === 'TAGGER') {
            target.tags++;
            State.emit(state, { type: 'tagged', camId: target.id, tags: target.tags });
            State.log(state, 'Lens fouled at intersection ' + target.node + '. Its reads run dim now.', 'first-degrade');
          } else {
            CameraSystem.destroy(state, target, vandal.id);
          }
          flee(state, vandal);
        }
      }

      else if (vandal.state === 'FLEE') {
        if (!vandal.path || vandal.at + 1 >= vandal.path.length) { vandal.state = 'DONE'; continue; }
        vandal.segT += dt / V.WALK_SEGMENT_SECONDS;
        if (vandal.segT >= 1) { vandal.segT = 0; vandal.at++; }
      }
    }
    // compact the finished
    if (state.vandals.length > 24) {
      state.vandals = state.vandals.filter(v => v.state !== 'DONE' && v.state !== 'CAUGHT');
    }
  }

  function activeCount(state) {
    return state.vandals.filter(v => v.state === 'MOVE' || v.state === 'ACT' || v.state === 'FLEE').length;
  }

  return { spawn, tick, activeCount, pickTarget };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { VandalSystem };
