// ============================================================
// SIGHTLINES — what a camera sees and how well. A sightline is
// a function of type, distance and geometry, never a circle;
// confidence is environmental, never random (§6).
// ============================================================

var Sightlines = (() => {

  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, S, W, N (dir index for the Long)

  function segBetween(map, a, b) {
    for (const e of map.adj[a]) if (e.node === b) return e.seg;
    return -1;
  }

  // Sightline entries: { seg, dist, oblique } — dist is 1-indexed segments
  // from the pole, oblique marks cross-traffic seen at an angle.
  // POST: rays in 4 directions, range 2, plus oblique crossings at ray nodes.
  // LONG: one aimed ray, range 5, no obliques — a narrow corridor.
  // DOME: all incident segments head-on at dist 1, plus obliques at the
  //       neighbouring nodes — many angles, poor reads.
  // RELAY: sees nothing.
  function compute(map, nodeIdx, type, dir) {
    const spec = CONFIG.Cameras[type];
    const out = [];
    if (!spec || spec.RANGE === 0) return out;
    const seen = new Set();
    const node = map.nodes[nodeIdx];
    const dirs = spec.DIRECTIONS === 1 ? [DIRS[dir || 0]] : DIRS;

    for (const [dx, dy] of dirs) {
      let x = node.x, y = node.y, cur = nodeIdx;
      for (let d = 1; d <= spec.RANGE; d++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.W || ny >= map.H) break;
        const nxt = ny * map.W + nx;
        const seg = segBetween(map, cur, nxt);
        if (seg < 0) break;           // the ray stops at a missing road
        if (!seen.has(seg)) { seen.add(seg); out.push({ seg, dist: d, oblique: false }); }
        // cross-traffic at the ray node reads at an angle (POST/DOME only)
        if (spec.DIRECTIONS > 1) {
          for (const e of map.adj[nxt]) {
            if (e.node === cur) continue;
            const en = map.nodes[e.node];
            const along = (en.x - nx) === dx && (en.y - ny) === dy;
            if (along) continue;      // that's the next ray segment, not a crossing
            if (!seen.has(e.seg)) { seen.add(e.seg); out.push({ seg: e.seg, dist: d, oblique: true }); }
          }
        }
        x = nx; y = ny; cur = nxt;
      }
    }
    return out;
  }

  // Static base confidence of a camera type for one sightline entry —
  // everything environmental and permanent: distance, angle, road class,
  // unit optics. Rain and degradation apply at read time.
  function baseConfidence(map, entry, type) {
    const C = CONFIG.Confidence;
    let conf = C.BASE + CONFIG.Cameras[type].CONF_MOD;
    conf -= (entry.dist - 1) * C.PER_SEGMENT_FALLOFF;
    if (entry.oblique) conf -= C.OBLIQUE_PENALTY;
    if (map.segs[entry.seg].arterial) conf -= C.ARTERIAL_PENALTY;
    return clamp(Math.round(conf), 0, 100);
  }

  // Live confidence for a camera reading on a segment right now.
  function liveConfidence(state, cam, entry) {
    const C = CONFIG.Confidence;
    let conf = baseConfidence(state.map, entry, cam.type);
    if (state.shift.rainUntil > state.time) conf -= C.RAIN_PENALTY;
    conf -= cam.tags * C.DEGRADE_PER_TAG;
    return clamp(Math.round(conf), Math.min(C.DEGRADE_FLOOR, conf > 0 ? conf : 0), 100);
  }

  // The placement ghost quotes its quality before you commit (§6.3):
  // best and worst base confidence from this pole at this aim.
  function quoteQuality(state, nodeIdx, type, dir) {
    const entries = compute(state.map, nodeIdx, type, dir);
    if (!entries.length) return null;
    let best = -1, worst = 101, worstArterial = false;
    for (const e of entries) {
      const c = baseConfidence(state.map, e, type);
      if (c > best) best = c;
      if (c < worst) { worst = c; worstArterial = state.map.segs[e.seg].arterial; }
    }
    return { best, worst, worstArterial, count: entries.length };
  }

  // Coverage indices: segId → [camIds] and nodeId → [camIds] (a pole is
  // watched when a camera's sightline touches a segment incident to it —
  // the §11.3 cameras-watching-cameras mechanic).
  function rebuildCoverage(state) {
    const covSegs = new Map(), covNodes = new Map();
    for (const cam of state.cameras) {
      for (const e of cam.sight) {
        if (!covSegs.has(e.seg)) covSegs.set(e.seg, []);
        covSegs.get(e.seg).push(cam.id);
        const s = state.map.segs[e.seg];
        for (const n of [s.a, s.b]) {
          if (!covNodes.has(n)) covNodes.set(n, []);
          const l = covNodes.get(n);
          if (!l.includes(cam.id)) l.push(cam.id);
        }
      }
    }
    state.covSegs = covSegs; state.covNodes = covNodes;
  }

  function camerasWatchingNode(state, nodeIdx, excludeCamId) {
    const l = state.covNodes.get(nodeIdx) || [];
    return excludeCamId === undefined ? l : l.filter(id => id !== excludeCamId);
  }

  return { compute, baseConfidence, liveConfidence, quoteQuality, rebuildCoverage, camerasWatchingNode, DIRS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Sightlines };
