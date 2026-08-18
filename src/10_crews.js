// ============================================================
// CREW MEMORY — the escalation engine (§13). Crews learn only
// what has sighted them (§20.3, proven by test_crewfair.js),
// forget per-camera, re-weight on a cooldown, and can never
// route around more than a capped fraction of the network.
// ============================================================

var CrewSystem = (() => {

  function learnMult(state) {
    const tier = CONFIG.Ladder.TIERS[state.ladder.tier];
    return tier ? tier.learnMult : 1;
  }

  // A camera produced a read on this crew's vehicle: it is now KNOWN.
  // This is the ONLY write into crew memory — the AI never reads the
  // player's placements directly.
  function sighted(state, crewId, camId) {
    const crew = state.crews[crewId];
    if (!crew) return;
    crew.known[camId] = state.time;
  }

  // Rate-limited snapshot (§13.3): the routing view of KNOWN updates at
  // most once per cooldown, drops forgotten entries, and caps how much
  // of the network a crew may avoid.
  function snapshot(state, crew) {
    const M = CONFIG.CrewMemory;
    const lm = learnMult(state);
    const cooldown = M.RELEARN_COOLDOWN / Math.max(0.25, lm);
    if (state.time - crew.lastRelearn < cooldown) return;
    crew.lastRelearn = state.time;
    const forget = M.FORGET_SECONDS * lm;
    const entries = [];
    for (const camId in crew.known) {
      const t = crew.known[camId];
      if (state.time - t > forget) { delete crew.known[camId]; continue; }
      entries.push({ camId: Number(camId), t });
    }
    entries.sort((a, b) => b.t - a.t);   // most recent first
    const cap = Math.max(1, Math.floor(state.cameras.length * M.MAX_AVOIDED_FRACTION));
    crew.activeKnown = entries.slice(0, cap).map(e => e.camId);
  }

  // Route weight for a crew: segments a KNOWN camera watches cost more.
  function routeWeightFn(state, crew) {
    snapshot(state, crew);
    if (!crew.activeKnown.length) return null;
    const avoid = new Set();
    for (const camId of crew.activeKnown) {
      const cam = CameraSystem.byId(state, camId);
      if (!cam) continue;
      for (const e of cam.sight) avoid.add(e.seg);
    }
    if (!avoid.size) return null;
    return (segId) => avoid.has(segId) ? CONFIG.CrewMemory.AVOID_WEIGHT : 1;
  }

  return { sighted, snapshot, routeWeightFn };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { CrewSystem };
