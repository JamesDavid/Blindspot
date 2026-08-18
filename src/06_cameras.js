// ============================================================
// CAMERAS — placement/relocation/upgrades (the primary verb),
// local drives and the upload cycle (§10.1), degradation.
// A destroyed camera loses everything since its last upload;
// a degraded one keeps reporting, worse (§11.1).
// ============================================================

var CameraSystem = (() => {

  function camAt(state, nodeIdx) {
    return state.cameras.find(c => c.node === nodeIdx) || null;
  }

  function byId(state, id) {
    return state.cameras.find(c => c.id === id) || null;
  }

  function relayAdjacent(state, cam) {
    if (!CONFIG.Retention.RELAY_CONTINUOUS) return false;
    for (const e of state.map.adj[cam.node]) {
      const n = camAt(state, e.node);
      if (n && n.type === 'RELAY') return true;
    }
    return false;
  }

  // ---- Actions (shared verb surface: UI and trial player) ----

  Actions.place = function (state, nodeIdx, type, dir) {
    const spec = CONFIG.Cameras[type];
    if (!spec) return { ok: false, reason: 'NO SUCH UNIT' };
    const node = state.map.nodes[nodeIdx];
    if (!node || !state.map.adj[nodeIdx].length) return { ok: false, reason: 'NO ROAD AT THIS POLE' };
    if (node.exit) return { ok: false, reason: 'CITY LIMITS — NO POLE' };
    if (camAt(state, nodeIdx)) return { ok: false, reason: 'POLE OCCUPIED' };
    if (state.budget < spec.COST) return { ok: false, reason: 'BUDGET SHORT ' + (spec.COST - Math.floor(state.budget)) };
    state.budget -= spec.COST;
    const cam = {
      id: state.nextCamId++, node: nodeIdx, type, dir: dir || 0,
      tags: 0, hardened: false, storageUp: false,
      drive: [],                       // readIds recorded since last upload
      lastUpload: state.time,
      builtAt: state.time
    };
    cam.sight = Sightlines.compute(state.map, nodeIdx, type, cam.dir);
    state.cameras.push(cam);
    state.stats.built++;
    Sightlines.rebuildCoverage(state);
    State.emit(state, { type: 'placed', camId: cam.id, node: nodeIdx, unit: type });
    return { ok: true, cam };
  };

  // Relocation is the answer to crews learning coverage (§13) — cheap
  // enough to be routine. The unit keeps upgrades; its drive uploads
  // first (the truck takes the disk in).
  Actions.relocate = function (state, camId, nodeIdx, dir) {
    const cam = byId(state, camId);
    if (!cam) return { ok: false, reason: 'NO SUCH UNIT' };
    const node = state.map.nodes[nodeIdx];
    if (!node || !state.map.adj[nodeIdx].length) return { ok: false, reason: 'NO ROAD AT THIS POLE' };
    if (node.exit) return { ok: false, reason: 'CITY LIMITS — NO POLE' };
    if (camAt(state, nodeIdx)) return { ok: false, reason: 'POLE OCCUPIED' };
    const cost = Math.ceil(CONFIG.Cameras[cam.type].COST * CONFIG.Cameras.RELOCATE_COST_FRACTION);
    if (state.budget < cost) return { ok: false, reason: 'BUDGET SHORT ' + (cost - Math.floor(state.budget)) };
    state.budget -= cost;
    upload(state, cam);                // pending footage rides along, not lost
    cam.node = nodeIdx;
    if (dir !== undefined) cam.dir = dir;
    cam.sight = Sightlines.compute(state.map, nodeIdx, cam.type, cam.dir);
    Sightlines.rebuildCoverage(state);
    State.emit(state, { type: 'relocated', camId: cam.id, node: nodeIdx });
    return { ok: true, cam };
  };

  Actions.upgrade = function (state, camId, kind) {
    const cam = byId(state, camId);
    if (!cam) return { ok: false, reason: 'NO SUCH UNIT' };
    const cost = CONFIG.Upgrades[kind];
    if (cost === undefined) return { ok: false, reason: 'NO SUCH WORK' };
    if (kind === 'HARDEN' && cam.hardened) return { ok: false, reason: 'ALREADY HARDENED' };
    if (kind === 'STORAGE' && cam.storageUp) return { ok: false, reason: 'DRIVE ALREADY FITTED' };
    if (kind === 'CLEAN' && cam.tags === 0) return { ok: false, reason: 'LENS IS CLEAN' };
    if (state.budget < cost) return { ok: false, reason: 'BUDGET SHORT ' + (cost - Math.floor(state.budget)) };
    state.budget -= cost;
    if (kind === 'HARDEN') cam.hardened = true;
    if (kind === 'STORAGE') cam.storageUp = true;
    if (kind === 'CLEAN') cam.tags = 0;
    State.emit(state, { type: 'upgraded', camId: cam.id, kind });
    return { ok: true, cam };
  };

  // ---- reads & drives ----

  // Record a read on this camera's local drive. Attachment to cases is
  // CaseSystem's business; crews learning is CrewSystem's.
  function record(state, cam, read) {
    read.camId = cam.id;
    read.camNode = cam.node;   // where the picture was taken — survives the camera
    read.uploadedAt = null;
    read.lost = false;
    state.reads.push(read);
    if (relayAdjacent(state, cam)) {
      read.uploadedAt = state.time;    // relay neighbours upload continuously
      read.expiresAt = state.time + retentionWindow(cam);
    } else {
      cam.drive.push(read.id);
    }
    return read;
  }

  function retentionWindow(cam) {
    return CONFIG.Retention.WINDOW_SECONDS + (cam.storageUp ? CONFIG.Retention.STORAGE_UPGRADE_BONUS : 0);
  }

  function upload(state, cam) {
    if (!cam.drive.length) { cam.lastUpload = state.time; return; }
    for (const rid of cam.drive) {
      const r = state.reads[rid - 1];
      if (r && !r.lost) { r.uploadedAt = state.time; r.expiresAt = state.time + retentionWindow(cam); }
    }
    cam.drive.length = 0;
    cam.lastUpload = state.time;
    state.stats.uploads++;
    State.emit(state, { type: 'upload', camId: cam.id });
  }

  // Destruction: the freshest consequence in the design — retroactive
  // evidence loss (§10.1). Pending reads evaporate.
  function destroy(state, cam, byVandalId) {
    let lost = 0;
    for (const rid of cam.drive) {
      const r = state.reads[rid - 1];
      if (r && r.uploadedAt === null) { r.lost = true; lost++; }
    }
    state.stats.dataLostReads += lost;
    state.cameras = state.cameras.filter(c => c.id !== cam.id);
    state.stats.destroyed++;
    Sightlines.rebuildCoverage(state);
    State.emit(state, { type: 'destroyed', camId: cam.id, node: cam.node, lostReads: lost, byVandalId });
    if (lost > 0) {
      State.log(state, 'Pole down. ' + lost + ' unsent read' + (lost === 1 ? '' : 's') + ' gone with it.', null);
      State.emit(state, { type: 'dataLost', camId: cam.id, node: cam.node, count: lost });
    } else {
      State.log(state, 'Pole down at intersection ' + cam.node + '.', null);
    }
    return lost;
  }

  function tick(state, dt) {
    for (const cam of state.cameras) {
      if (state.time - cam.lastUpload >= CONFIG.Retention.UPLOAD_INTERVAL) upload(state, cam);
    }
  }

  return { camAt, byId, record, upload, destroy, tick, relayAdjacent, retentionWindow };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { CameraSystem };
