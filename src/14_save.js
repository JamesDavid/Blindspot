// ============================================================
// SAVE — snapshot all dynamic state; the map regenerates from
// the seed at restore (§17.2), which is why the same seed must
// always produce the same map. Pure serialisation here; the UI
// layer owns localStorage and the focus-loss triggers.
// ============================================================

var SaveSystem = (() => {

  // Fields never serialised: the map (regenerated), coverage indices and
  // sightlines (recomputed), transient events, caches.
  function serialize(state) {
    const snap = {
      version: state.version,
      seed: state.seed,
      eventSeq: state.eventSeq,
      time: state.time,
      rngState: state.rngState,
      threshold: state.threshold,
      budget: state.budget, trust: state.trust,
      clrClosed: state.clrClosed, clrCold: state.clrCold,
      warrant: state.warrant,
      nextCamId: state.nextCamId, nextReadId: state.nextReadId,
      nextCaseId: state.nextCaseId, nextVehId: state.nextVehId, nextVandalId: state.nextVandalId,
      cameras: state.cameras.map(c => ({
        id: c.id, node: c.node, type: c.type, dir: c.dir, tags: c.tags,
        hardened: c.hardened, storageUp: c.storageUp, drive: c.drive.slice(),
        lastUpload: c.lastUpload, builtAt: c.builtAt
      })),
      reads: state.reads,
      cases: state.cases,
      vehicles: state.vehicles,
      vandals: state.vandals,
      crews: state.crews,
      shift: state.shift,
      ladder: state.ladder,
      contestedThisShift: state.contestedThisShift,
      falseChargesThisShift: state.falseChargesThisShift,
      warn: state.warn,
      logLines: state.logLines,
      seenKeys: state.seenKeys,
      stats: state.stats,
      verdict: state.verdict,
      _nextAmbientAt: state._nextAmbientAt
    };
    return JSON.stringify(snap);
  }

  function restore(json) {
    const snap = typeof json === 'string' ? JSON.parse(json) : json;
    const map = MapGen.generate(snap.seed);
    const state = Object.assign({}, snap, {
      map,
      events: [], eventSeq: snap.eventSeq || 0,
      covSegs: null, covNodes: null,
      dda: true,                  // resumed matches are real matches
      tutorialActive: false       // the tutorial never re-runs mid-resume (§17.2)
    });
    // recompute derived state
    for (const cam of state.cameras) {
      cam.sight = Sightlines.compute(map, cam.node, cam.type, cam.dir);
    }
    Sightlines.rebuildCoverage(state);
    return state;
  }

  return { serialize, restore };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { SaveSystem };
