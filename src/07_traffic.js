// ============================================================
// TRAFFIC — ambient vehicles and suspect escape runs. Route
// choice is the entire suspect behaviour (§20.1): no evasion
// beyond it. Reads happen as vehicles complete segments inside
// sightlines.
// ============================================================

var Traffic = (() => {

  function segSeconds(state, segId) {
    const s = state.map.segs[segId];
    return CONFIG.Grid.SEGMENT_SECONDS / (s.arterial ? CONFIG.Grid.ARTERIAL_SPEED_MULT : 1);
  }

  // Max speed any vehicle can move, in segments/second — the coherence
  // check (§8.2) uses this to decide whether two reads can be one car.
  function maxSegPerSec() {
    return CONFIG.Grid.ARTERIAL_SPEED_MULT / CONFIG.Grid.SEGMENT_SECONDS;
  }

  // Dijkstra with a per-segment weight function; returns node path.
  function route(state, from, to, weightFn) {
    const N = state.map.nodes.length;
    const dist = new Array(N).fill(Infinity);
    const prev = new Array(N).fill(-1);
    const done = new Array(N).fill(false);
    dist[from] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u === -1 || u === to) break;
      done[u] = true;
      for (const e of state.map.adj[u]) {
        const w = weightFn ? weightFn(e.seg) : 1;
        if (dist[u] + w < dist[e.node]) { dist[e.node] = dist[u] + w; prev[e.node] = u; }
      }
    }
    if (dist[to] === Infinity) return null;
    const path = [to];
    let n = to;
    while (n !== from) { n = prev[n]; path.push(n); }
    path.reverse();
    return path;
  }

  function spawnVehicle(state, kind, from, to, crewId, caseId, plate) {
    const crew = crewId ? state.crews[crewId] : null;
    const weightFn = crew ? CrewSystem.routeWeightFn(state, crew) : null;
    const path = route(state, from, to, weightFn);
    if (!path || path.length < 2) return null;
    const veh = {
      id: state.nextVehId++, kind, plate,
      crewId: crewId || null, caseId: caseId || null,
      path, at: 0, segT: 0, done: false
    };
    state.vehicles.push(veh);
    // Visible learning (§13.2): if avoidance bent this route, show it.
    if (crew && crew.activeKnown.length) {
      const straight = route(state, from, to, null);
      if (straight && straight.length !== path.length) {
        state.stats.reroutes++;
        State.emit(state, { type: 'reroute', vehId: veh.id, path: path.slice(), avoided: crew.activeKnown.slice() });
        State.log(state, "They've made the pole. They're going around.", 'first-reroute');
      }
    }
    return veh;
  }

  function currentSeg(state, veh) {
    if (veh.at + 1 >= veh.path.length) return -1;
    const a = veh.path[veh.at], b = veh.path[veh.at + 1];
    for (const e of state.map.adj[a]) if (e.node === b) return e.seg;
    return -1;
  }

  // A vehicle finished a segment: every camera sighting that segment
  // takes a picture. The read exists whether or not it qualifies —
  // below-threshold reads are the *visibly missed* grey flashes (§18).
  function readsOnSegment(state, veh, segId) {
    const cams = state.covSegs.get(segId);
    if (!cams) return;
    for (const camId of cams) {
      const cam = CameraSystem.byId(state, camId);
      if (!cam) continue;
      const entry = cam.sight.find(e => e.seg === segId);
      if (!entry) continue;
      // one read per camera per pass (player-directed): tracking a car
      // takes multiple cameras, not one pole triple-dipping
      if (!veh._lastReadBy) veh._lastReadBy = {};
      if (state.time - (veh._lastReadBy[camId] || -Infinity) < CONFIG.Confidence.PER_VEHICLE_COOLDOWN) continue;
      veh._lastReadBy[camId] = state.time;
      const conf = Sightlines.liveConfidence(state, cam, entry);
      const a = state.map.nodes[veh.path[veh.at - 1]], b = state.map.nodes[veh.path[veh.at]];
      const heading = a && b ? (b.x > a.x ? 0 : b.y > a.y ? 1 : b.x < a.x ? 2 : 3) : 0; // E S W N
      const read = {
        id: state.nextReadId++, t: state.time, segId, vehId: veh.id,
        crewId: veh.crewId, heading,
        actualPlate: veh.plate, plate: veh.plate,
        trueMatch: false, conf, qualifying: conf >= state.threshold,
        caseId: null
      };
      state.stats.reads++;
      CaseSystem.attachRead(state, read, veh, cam);
      CameraSystem.record(state, cam, read);
      if (veh.crewId) CrewSystem.sighted(state, veh.crewId, cam.id);
      State.emit(state, {
        type: 'read', segId, camId: cam.id, conf, qualifying: read.qualifying,
        attached: read.caseId !== null, plate: read.plate, dim: cam.tags > 0
      });
      if (read.qualifying) state.stats.qualifying++;
    }
  }

  // Ambient traffic enters from the city limits and drives THROUGH
  // (player-directed): cars never pop into existence mid-map.
  function pickAmbientTrip(state) {
    const rng = () => State.rngNext(state, 'traffic');
    const exits = state.map.exits;
    if (exits.length < 2) return null;
    const from = exits[Math.floor(rng() * exits.length)];
    let to = exits[Math.floor(rng() * exits.length)];
    if (to === from) to = exits[(exits.indexOf(from) + 1) % exits.length];
    return { from, to };
  }

  function ambientTarget(state) {
    const per30 = CONFIG.Traffic.AMBIENT_PER_30_NODES;
    const n = Math.round(state.map.nodes.length / 30 * per30);
    return Math.min(CONFIG.Traffic.AMBIENT_MAX, n);
  }

  function tick(state, dt) {
    // full streets from the first frame (player-directed)
    if (CONFIG.Traffic.PREFILL && !state._prefilled) {
      state._prefilled = true;
      const want = ambientTarget(state);
      for (let i = 0; i < want; i++) {
        const trip = pickAmbientTrip(state);
        if (trip) {
          const veh = spawnVehicle(state, 'AMBIENT', trip.from, trip.to, null, null,
            makePlate(() => State.rngNext(state, 'plates')));
          // scatter them along their routes so the city starts mid-motion
          if (veh) veh.at = Math.floor(State.rngNext(state, 'traffic') * Math.max(1, veh.path.length - 2));
        }
      }
    }
    // keep ambient population up
    const ambient = state.vehicles.filter(v => v.kind === 'AMBIENT' && !v.done).length;
    if (ambient < ambientTarget(state)) {
      if (!state._nextAmbientAt || state.time >= state._nextAmbientAt) {
        const trip = pickAmbientTrip(state);
        if (trip) {
          spawnVehicle(state, 'AMBIENT', trip.from, trip.to, null, null,
            makePlate(() => State.rngNext(state, 'plates')));
        }
        state._nextAmbientAt = state.time + CONFIG.Traffic.SPAWN_INTERVAL;
      }
    }

    for (const veh of state.vehicles) {
      if (veh.done) continue;
      const segId = currentSeg(state, veh);
      if (segId < 0) { veh.done = true; continue; }
      veh.segT += dt / segSeconds(state, segId);
      if (veh.segT >= 1) {
        veh.segT = 0;
        veh.at++;
        readsOnSegment(state, veh, segId);
        if (veh.at + 1 >= veh.path.length) {
          veh.done = true;
          State.emit(state, { type: 'exited', vehId: veh.id, kind: veh.kind });
        }
      }
    }
    // compact finished vehicles occasionally
    if (state.vehicles.length > 60) state.vehicles = state.vehicles.filter(v => !v.done);
  }

  return { tick, spawnVehicle, route, maxSegPerSec, segSeconds };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Traffic };
