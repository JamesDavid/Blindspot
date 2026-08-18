// ============================================================
// RENDERER — top-down urban night city, all procedural three.js
// geometry, zero image assets. Roads carry all the information;
// signal colors (gold reads, teal coverage, red liars, reroute
// dots) appear nowhere in the ambient palette (§2.1). Effects
// are additive, never occluding (§18.1), and contrast against
// the surface they sit on.
// ============================================================

var Renderer = (() => {

  // Visual constants — presentation only, not game-tunable (§22 governs
  // system logic; these are paint).
  const V = {
    BG: 0x0b0d12, ROAD: 0x24272e, ROAD_ART: 0x2b2e36, LANE: 0x3a3e47,
    NODE: 0x2a2d34, POOL: 0xff9a2a, BUILDING: 0x14161c, BUILDING2: 0x171a21,
    ROOF: 0x1b1e26, EXIT: 0x2e3340,
    GOLD: 0xffc84a, MISS: 0x6a6f78, TEAL: 0x39d3c0, RED: 0xff5a52,
    AMBER: 0xffb44a, CYAN: 0x53c8ff, VEHICLE: 0x8a8f99, HEADLIGHT: 0xffe9b0,
    SCRAPPER: 0xa0623a, TAGGER: 0x5da05a, FIXER: 0x23252d,
    GHOST_OK: 0x7ad9ff, GHOST_BAD: 0xff5a52,
    ROAD_W: 0.30, ART_W: 0.42
  };

  let renderer, scene, camera, canvas;
  let mapGroup = null, camGroup = null, vehGroup = null, vandalGroup = null, fxGroup = null, overlayGroup = null;
  let curState = null;
  const camMeshes = new Map(), vehMeshes = new Map(), vandalMeshes = new Map();
  const fx = [];            // live effects {mesh, t, dur, kind, update}
  let rainSys = null, raining = false;
  let ghost = null, selectedRing = null, tutorialRing = null;
  let view = { cx: 4, cz: 7.5, zoom: 11 };  // zoom = camera height
  let motionDamp = 1, lastUserMotion = -9;
  let clockMs = 0;

  function nodePos(map, id) {
    const n = map.nodes[id];
    return { x: n.x, z: n.y };
  }

  function init(cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(V.BG);
    scene.fog = new THREE.Fog(V.BG, 18, 34);
    camera = new THREE.PerspectiveCamera(46, 1, 0.5, 80);
    resize();
    window.addEventListener('resize', resize);

    const amb = new THREE.AmbientLight(0x8890a8, 0.75);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xbdc8ff, 0.5);
    dir.position.set(3, 10, 2);
    scene.add(dir);
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function applyView() {
    // slight oblique: camera south of target, looking down
    camera.position.set(view.cx, view.zoom, view.cz + view.zoom * 0.36);
    camera.lookAt(view.cx, 0, view.cz);
  }

  // ---------- static city ----------

  function buildCity(state) {
    if (mapGroup) scene.remove(mapGroup);
    mapGroup = new THREE.Group();
    const map = state.map;
    const rng = mulberry32(hashStr(map.seed + '/visual'));

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(map.W + 8, map.H + 8),
      new THREE.MeshLambertMaterial({ color: 0x0e1015 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((map.W - 1) / 2, -0.03, (map.H - 1) / 2);
    mapGroup.add(ground);

    // roads
    const roadMat = new THREE.MeshLambertMaterial({ color: V.ROAD });
    const artMat = new THREE.MeshLambertMaterial({ color: V.ROAD_ART });
    const laneMat = new THREE.MeshBasicMaterial({ color: V.LANE });
    for (const s of map.segs) {
      const a = nodePos(map, s.a), b = nodePos(map, s.b);
      const w = s.arterial ? V.ART_W : V.ROAD_W;
      const len = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      const g = new THREE.BoxGeometry(
        s.dir === 'H' ? len : w, 0.02, s.dir === 'H' ? w : len);
      const m = new THREE.Mesh(g, s.arterial ? artMat : roadMat);
      m.position.set((a.x + b.x) / 2, 0.01, (a.z + b.z) / 2);
      mapGroup.add(m);
      if (s.arterial) {
        // dashed centre line
        for (let d = 0.2; d < len; d += 0.34) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(
            s.dir === 'H' ? 0.14 : 0.02, 0.005, s.dir === 'H' ? 0.02 : 0.14), laneMat);
          dash.position.set(
            s.dir === 'H' ? Math.min(a.x, b.x) + d : a.x, 0.025,
            s.dir === 'H' ? a.z : Math.min(a.z, b.z) + d);
          mapGroup.add(dash);
        }
      }
    }

    // intersections + sodium pools
    const nodeMat = new THREE.MeshLambertMaterial({ color: V.NODE });
    const poolTex = radialTexture('rgba(255,154,42,0.55)');
    for (const n of map.nodes) {
      if (!map.adj[n.id].length) continue;
      const w = V.ART_W + 0.06;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, w), nodeMat);
      m.position.set(n.x, 0.011, n.y);
      mapGroup.add(m);
      if ((n.x + n.y) % 2 === 0) {
        const pool = new THREE.Sprite(new THREE.SpriteMaterial({
          map: poolTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35
        }));
        pool.scale.set(1.4, 1.4, 1);
        pool.position.set(n.x, 0.05, n.y);
        pool.material.rotation = 0;
        mapGroup.add(pool);
      }
      if (n.exit) {
        const em = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.5),
          new THREE.MeshBasicMaterial({ color: V.EXIT }));
        em.position.set(n.x, 0.02, n.y);
        mapGroup.add(em);
      }
      if (n.syndicate) {
        const sm = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 24),
          new THREE.MeshBasicMaterial({ color: 0x8a4a5a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
        sm.rotation.x = -Math.PI / 2;
        sm.position.set(n.x, 0.03, n.y);
        mapGroup.add(sm);
      }
    }

    // buildings fill the block cells the roads leave
    const segSet = new Set();
    for (const s of map.segs) segSet.add(s.a < s.b ? s.a + '_' + s.b : s.b + '_' + s.a);
    const bMats = [new THREE.MeshLambertMaterial({ color: V.BUILDING }),
      new THREE.MeshLambertMaterial({ color: V.BUILDING2 })];
    const roofMat = new THREE.MeshLambertMaterial({ color: V.ROOF });
    for (let y = 0; y < map.H - 1; y++) for (let x = 0; x < map.W - 1; x++) {
      if (rng() < 0.12) continue;   // vacant lot
      const cnt = 1 + (rng() < 0.4 ? 1 : 0);
      for (let i = 0; i < cnt; i++) {
        const bw = 0.28 + rng() * 0.22, bd = 0.28 + rng() * 0.22;
        const bh = 0.25 + rng() * 0.85;
        const bx = x + 0.28 + rng() * (0.44 - bw / 2), bz = y + 0.28 + rng() * (0.44 - bd / 2);
        const bm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMats[Math.floor(rng() * 2)]);
        bm.position.set(bx, bh / 2, bz);
        mapGroup.add(bm);
        if (rng() < 0.5) { // rooftop detail: vent or tank
          const v = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.25, 0.08, bd * 0.25), roofMat);
          v.position.set(bx + (rng() - 0.5) * bw * 0.4, bh + 0.04, bz + (rng() - 0.5) * bd * 0.4);
          mapGroup.add(v);
        }
      }
    }
    scene.add(mapGroup);
  }

  // ---------- textures & sprites ----------

  const texCache = {};
  function radialTexture(rgba) {
    if (texCache[rgba]) return texCache[rgba];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, rgba);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    texCache[rgba] = t;
    return t;
  }

  function textSprite(text, color, bg) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 40;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 128, 40); }
    g.font = 'bold 22px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, 64, 21);
    const t = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: t, transparent: true, depthWrite: false
    }));
    sp.scale.set(1.15, 0.36, 1);
    return sp;
  }

  // ---------- cameras ----------

  function buildCamMesh(state, cam) {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c414c });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x5a606e });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.55, 6), poleMat);
    pole.position.y = 0.28;
    g.add(pole);
    if (cam.type === 'POST') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.12), headMat);
      head.position.y = 0.6;
      g.add(head);
    } else if (cam.type === 'LONG') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.1), headMat);
      head.position.y = 0.62;
      g.add(head);
      // lens hood wedge: shows the aim forever, sized hull-level (§12)
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4),
        new THREE.MeshBasicMaterial({ color: 0x8b93a5 }));
      hood.rotation.z = -Math.PI / 2;
      hood.position.set(0.16, 0.62, 0);
      g.add(hood);
      const d = Sightlines.DIRS[cam.dir];
      g.rotation.y = -Math.atan2(d[1], d[0]);
    } else if (cam.type === 'DOME') {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), headMat);
      head.position.y = 0.58;
      g.add(head);
    } else if (cam.type === 'RELAY') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 5), poleMat);
      mast.position.y = 0.68;
      g.add(mast);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
        new THREE.MeshBasicMaterial({ color: V.CYAN }));
      tip.position.y = 0.85;
      tip.userData.blink = true;
      g.add(tip);
    }
    // drive-fullness pip (§18): fills toward upload, empties on upload
    const drive = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02),
      new THREE.MeshBasicMaterial({ color: V.AMBER }));
    drive.position.set(0, 0.74, 0);
    drive.userData.driveBar = true;
    g.add(drive);
    const p = nodePos(state.map, cam.node);
    g.position.set(p.x + 0.18, 0, p.z + 0.18);
    g.userData = { kind: 'camera', id: cam.id };
    return g;
  }

  function syncCameras(state) {
    const live = new Set();
    for (const cam of state.cameras) {
      live.add(cam.id);
      let m = camMeshes.get(cam.id);
      if (!m || m.userData.node !== cam.node || m.userData.type !== cam.type || m.userData.dir !== cam.dir) {
        if (m) camGroup.remove(m);
        m = buildCamMesh(state, cam);
        m.userData.node = cam.node; m.userData.type = cam.type; m.userData.dir = cam.dir;
        camGroup.add(m);
        camMeshes.set(cam.id, m);
      }
      // degradation reads at a glance: grime tilt + darkening (§18)
      m.rotation.z = -0.09 * Math.min(cam.tags, 3);
      m.traverse(o => {
        if (o.material && o.material.color && !o.userData.blink && !o.userData.driveBar) {
          const f = Math.max(0.45, 1 - cam.tags * 0.22);
          o.material.color.setScalar ? null : null;
        }
      });
      // drive bar
      const frac = CameraSystem.relayAdjacent(state, cam) ? 0 :
        Math.min(1, cam.drive.length / 8);
      m.traverse(o => {
        if (o.userData.driveBar) {
          o.scale.x = Math.max(0.02, frac);
          o.visible = frac > 0.01;
        }
      });
    }
    for (const [id, m] of camMeshes) {
      if (!live.has(id)) { camGroup.remove(m); camMeshes.delete(id); }
    }
  }

  // ---------- coverage overlay: the threshold made visible ----------
  // Rebuilt on placement/threshold/rain/tag changes: every covered segment
  // tinted by whether its base read clears the current bar. Moving the
  // dial recolours the whole board at once (§18).

  let overlayDirty = true;
  function markOverlayDirty() { overlayDirty = true; }

  function rebuildOverlay(state) {
    overlayDirty = false;
    while (overlayGroup.children.length) overlayGroup.remove(overlayGroup.children[0]);
    const map = state.map;
    const seen = new Map(); // segId -> best live conf
    for (const cam of state.cameras) {
      for (const e of cam.sight) {
        const conf = Sightlines.liveConfidence(state, cam, e);
        if (!seen.has(e.seg) || seen.get(e.seg) < conf) seen.set(e.seg, conf);
      }
    }
    for (const [segId, conf] of seen) {
      const s = map.segs[segId];
      const a = nodePos(map, s.a), b = nodePos(map, s.b);
      const len = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      const color = conf >= state.threshold + 10 ? V.TEAL
        : conf >= state.threshold ? V.AMBER : V.RED;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: conf >= state.threshold ? 0.13 : 0.09,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        s.dir === 'H' ? len : 0.5, 0.004, s.dir === 'H' ? 0.5 : len), mat);
      m.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
      overlayGroup.add(m);
    }
  }

  // ---------- vehicles & vandals ----------

  // muted night-street car palette — variety without stealing a signal color
  const CAR_COLORS = [0x9aa0ab, 0x7d8794, 0xa89078, 0x8a6f6a, 0x6f7f8f,
    0x7a8a72, 0xb0a898, 0x5f6673, 0x94847f, 0x86929e, 0xa39a6f, 0x6d7a85];

  function buildVehicle(veh) {
    const g = new THREE.Group();
    const col = CAR_COLORS[hashStr(veh.plate) % CAR_COLORS.length];
    const tint = 0.8 + (hashStr(veh.plate + 'x') % 30) / 100;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.09),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(col).multiplyScalar(tint) }));
    body.position.y = 0.045;
    g.add(body);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: V.HEADLIGHT, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    cone.rotation.z = Math.PI / 2;
    cone.position.set(0.22, 0.04, 0);
    g.add(cone);
    g.userData = { kind: 'vehicle', id: veh.id };
    return g;
  }

  function vehWorld(state, veh) {
    const map = state.map;
    if (veh.at + 1 >= veh.path.length) return null;
    const a = nodePos(map, veh.path[veh.at]);
    const b = nodePos(map, veh.path[veh.at + 1]);
    const t = veh.segT;
    const dx = b.x - a.x, dz = b.z - a.z;
    // drive on the right: offset perpendicular to travel
    const ox = dz * 0.07, oz = -dx * 0.07;
    return { x: a.x + dx * t + ox, z: a.z + dz * t + oz, ang: Math.atan2(dz, dx) };
  }

  function syncVehicles(state) {
    const live = new Set();
    for (const veh of state.vehicles) {
      if (veh.done) continue;
      const w = vehWorld(state, veh);
      if (!w) continue;
      live.add(veh.id);
      let m = vehMeshes.get(veh.id);
      if (!m) { m = buildVehicle(veh); vehGroup.add(m); vehMeshes.set(veh.id, m); }
      m.position.set(w.x, 0, w.z);
      m.rotation.y = -w.ang;
    }
    for (const [id, m] of vehMeshes) {
      if (!live.has(id)) { vehGroup.remove(m); vehMeshes.delete(id); }
    }
  }

  function buildVandal(v) {
    const g = new THREE.Group();
    const col = v.type === 'SCRAPPER' ? V.SCRAPPER : v.type === 'TAGGER' ? V.TAGGER : V.FIXER;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.14, 8),
      new THREE.MeshLambertMaterial({ color: col }));
    body.position.y = 0.07;
    g.add(body);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshLambertMaterial({ color: col }));
    hood.position.y = 0.16;
    g.add(hood);
    g.userData = { kind: 'vandal', id: v.id };
    return g;
  }

  function syncVandals(state) {
    const live = new Set();
    for (const v of state.vandals) {
      if (v.state === 'DONE' || v.state === 'CAUGHT') continue;
      if (state.time < v.revealedAt) continue;  // low trust reports late (§15.3)
      let node;
      if (v.path && v.at + 1 < v.path.length) {
        const a = nodePos(state.map, v.path[v.at]);
        const b = nodePos(state.map, v.path[v.at + 1]);
        node = { x: a.x + (b.x - a.x) * v.segT, z: a.z + (b.z - a.z) * v.segT };
      } else {
        const p = v.path ? v.path[Math.min(v.at, v.path.length - 1)] : v.spawnNode;
        const a = nodePos(state.map, p);
        node = { x: a.x, z: a.z };
      }
      live.add(v.id);
      let m = vandalMeshes.get(v.id);
      if (!m) { m = buildVandal(v); vandalGroup.add(m); vandalMeshes.set(v.id, m); }
      m.position.set(node.x - 0.15, 0, node.z - 0.15);
      // acting: bob
      if (v.state === 'ACT') m.position.y = Math.abs(Math.sin(clockMs / 130)) * 0.03;
    }
    for (const [id, m] of vandalMeshes) {
      if (!live.has(id)) { vandalGroup.remove(m); vandalMeshes.delete(id); }
    }
  }

  // ---------- effects ----------

  function addFx(mesh, dur, update) {
    fxGroup.add(mesh);
    fx.push({ mesh, t: 0, dur, update });
  }

  function segFlash(state, segId, color, dur, opacity) {
    const s = state.map.segs[segId];
    const a = nodePos(state.map, s.a), b = nodePos(state.map, s.b);
    const len = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: opacity || 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(
      s.dir === 'H' ? len : 0.34, 0.005, s.dir === 'H' ? 0.34 : len), mat);
    m.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2);
    addFx(m, dur, (f, k) => { f.mesh.material.opacity = (opacity || 0.55) * (1 - k); });
  }

  function ringFx(state, node, color, dur, r0, r1) {
    const p = nodePos(state.map, node);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(new THREE.RingGeometry(r0 || 0.1, (r0 || 0.1) + 0.05, 24), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.05, p.z);
    addFx(m, dur, (f, k) => {
      const r = (r0 || 0.1) + ((r1 || 0.6) - (r0 || 0.1)) * k;
      f.mesh.scale.setScalar(r / (r0 || 0.1));
      f.mesh.material.opacity = 0.7 * (1 - k);
    });
  }

  function plateGhost(state, camId, plate, color) {
    const cam = state.cameras.find(c => c.id === camId);
    if (!cam) return;
    const p = nodePos(state.map, cam.node);
    const sp = textSprite(plate, color, 'rgba(10,12,16,0.85)');
    sp.position.set(p.x + 0.18, 0.85, p.z + 0.18);
    addFx(sp, 0.9, (f, k) => {
      f.mesh.position.y = 0.85 + k * 0.35;
      f.mesh.material.opacity = 1 - k * k;
    });
  }

  function rerouteDots(state, path, dur) {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = nodePos(state.map, path[i]);
      const b = nodePos(state.map, path[i + 1]);
      for (let t = 0.15; t < 1; t += 0.3) {
        const mat = new THREE.MeshBasicMaterial({
          color: V.CYAN, transparent: true, opacity: 0.6,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), mat);
        dot.position.set(a.x + (b.x - a.x) * t, 0.06, a.z + (b.z - a.z) * t);
        addFx(dot, dur, (f, k) => { f.mesh.material.opacity = 0.6 * (1 - k); });
      }
    }
  }

  function crimeIcon(state, node, color, dur) {
    const sp = textSprite('!', '#111', null);
    // diamond backing
    const p = nodePos(state.map, node);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.14, 4), mat);
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = Math.PI / 4;
    d.position.set(p.x, 0.06, p.z);
    addFx(d, dur, (f, k) => {
      f.mesh.material.opacity = 0.9 * (k < 0.85 ? (0.7 + 0.3 * Math.sin(clockMs / 110)) : (1 - k) * 6);
    });
    sp.position.set(p.x, 0.5, p.z);
    addFx(sp, dur, (f, k) => { f.mesh.material.opacity = k < 0.85 ? 1 : (1 - k) * 6; });
  }

  function dataLostFx(state, node) {
    const p = nodePos(state.map, node);
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const mat = new THREE.MeshBasicMaterial({
        color: V.RED, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), mat);
      m.position.set(p.x, 0.3, p.z);
      addFx(m, 0.9, (f, k) => {
        f.mesh.position.set(p.x + Math.cos(ang) * k * 0.6, 0.3 + k * 0.5 - k * k * 0.9, p.z + Math.sin(ang) * k * 0.6);
        f.mesh.material.opacity = 0.8 * (1 - k);
      });
    }
  }

  // rain: streak particles, damped while the user pans (§18.1)
  function buildRain() {
    const n = 260;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 12 - 1;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = Math.random() * 18 - 1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x6a7f9a, size: 0.05, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    return new THREE.Points(geo, mat);
  }

  // ---------- events → visuals ----------

  function onEvents(state, evs) {
    for (const ev of evs) {
      switch (ev.type) {
        case 'read': {
          const color = !ev.qualifying ? V.MISS : ev.witness ? V.CYAN : V.GOLD;
          segFlash(state, ev.segId, color, ev.qualifying ? 0.55 : 0.4, ev.dim ? 0.3 : 0.55);
          if (ev.qualifying) plateGhost(state, ev.camId, ev.plate, ev.attached ? '#ffc84a' : '#9aa0ab');
          break;
        }
        case 'crime': crimeIcon(state, ev.node, V.RED, 6); break;
        case 'tip': if (ev.early) crimeIcon(state, ev.node, V.CYAN, 5); break;
        case 'arrest': {
          const kase = state.cases.find(c => c.id === ev.caseId);
          if (kase) ringFx(state, kase.spawnNode, V.TEAL, 1.6, 0.15, 0.8);
          break;
        }
        case 'destroyed': dataLostFx(state, ev.node); markOverlayDirty(); break;
        case 'dataLost': break;
        case 'tagged': markOverlayDirty(); break;
        case 'placed': case 'relocated': ringFx(state, ev.node, V.TEAL, 0.7, 0.1, 0.5); markOverlayDirty(); break;
        case 'upgraded': markOverlayDirty(); break;
        case 'threshold': markOverlayDirty(); break;
        case 'rain': raining = true; markOverlayDirty(); break;
        case 'reroute': rerouteDots(state, ev.path, 2.6); break;
        case 'caseAtRisk': {
          const kase = state.cases.find(c => c.id === ev.caseId);
          if (kase) ringFx(state, kase.spawnNode, V.RED, 2.0, 0.2, 0.9);
          break;
        }
        case 'vandalAct': ringFx(state, ev.node, V.AMBER, 1.2, 0.12, 0.4); break;
        case 'witnessCase': {
          const cam = state.cameras.find(c => c.id === ev.camId);
          if (cam) ringFx(state, cam.node, V.CYAN, 1.4, 0.15, 0.6);
          break;
        }
      }
    }
  }

  // ---------- ghost & rings ----------

  function setGhost(state, nodeIdx, type, dir, ok) {
    clearGhost();
    ghost = new THREE.Group();
    const mesh = buildCamMesh(state, { node: nodeIdx, type, dir: dir || 0, id: -1 });
    mesh.traverse(o => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
      }
    });
    ghost.add(mesh);
    // preview the sightline
    const entries = Sightlines.compute(state.map, nodeIdx, type, dir || 0);
    for (const e of entries) {
      const s = state.map.segs[e.seg];
      const a = nodePos(state.map, s.a), b = nodePos(state.map, s.b);
      const len = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      const conf = Sightlines.baseConfidence(state.map, e, type);
      const mat = new THREE.MeshBasicMaterial({
        color: conf >= state.threshold ? V.GHOST_OK : V.GHOST_BAD,
        transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        s.dir === 'H' ? len : 0.4, 0.004, s.dir === 'H' ? 0.4 : len), mat);
      m.position.set((a.x + b.x) / 2, 0.045, (a.z + b.z) / 2);
      ghost.add(m);
    }
    scene.add(ghost);
  }

  function clearGhost() {
    if (ghost) { scene.remove(ghost); ghost = null; }
  }

  function setSelected(state, nodeIdx) {
    if (selectedRing) { scene.remove(selectedRing); selectedRing = null; }
    if (nodeIdx === null || nodeIdx === undefined) return;
    const p = nodePos(state.map, nodeIdx);
    selectedRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.35, 28),
      new THREE.MeshBasicMaterial({
        color: 0xd8dde8, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    selectedRing.rotation.x = -Math.PI / 2;
    selectedRing.position.set(p.x, 0.05, p.z);
    scene.add(selectedRing);
  }

  // tutorial pointing ring (§17)
  function setTutorialRing(state, nodeIdx) {
    if (tutorialRing) { scene.remove(tutorialRing); tutorialRing = null; }
    if (nodeIdx === null || nodeIdx === undefined) return;
    const p = nodePos(state.map, nodeIdx);
    tutorialRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 28),
      new THREE.MeshBasicMaterial({
        color: V.GOLD, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    tutorialRing.rotation.x = -Math.PI / 2;
    tutorialRing.position.set(p.x, 0.06, p.z);
    scene.add(tutorialRing);
  }

  // ---------- picking & projection ----------

  function screenToGround(px, py) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((px - rect.left) / rect.width) * 2 - 1,
      -((py - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    const pt = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: pt.x, z: pt.z };
  }

  function worldToScreen(x, z, y) {
    const v = new THREE.Vector3(x, y || 0, z).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (v.x + 1) / 2 * rect.width + rect.left,
      y: (-v.y + 1) / 2 * rect.height + rect.top
    };
  }

  function pickNode(state, px, py) {
    const g = screenToGround(px, py);
    let best = -1, bestD = 0.5;   // fat-finger tolerance: half a block
    for (const n of state.map.nodes) {
      if (!state.map.adj[n.id].length) continue;
      const d = Math.hypot(n.x - g.x, n.y - g.z);
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best >= 0 ? best : null;
  }

  // Identify what a tap hits: camera > vandal > vehicle > node > segment.
  function pickObject(state, px, py) {
    const g = screenToGround(px, py);
    for (const cam of state.cameras) {
      const p = nodePos(state.map, cam.node);
      if (Math.hypot(p.x + 0.18 - g.x, p.z + 0.18 - g.z) < 0.3) return { kind: 'camera', id: cam.id };
    }
    for (const [id, m] of vandalMeshes) {
      if (Math.hypot(m.position.x - g.x, m.position.z - g.z) < 0.3) return { kind: 'vandal', id };
    }
    for (const [id, m] of vehMeshes) {
      if (Math.hypot(m.position.x - g.x, m.position.z - g.z) < 0.25) return { kind: 'vehicle', id };
    }
    const n = pickNode(state, px, py);
    if (n !== null) return { kind: 'node', id: n };
    // nearest segment
    let bestSeg = -1, bestD = 0.4;
    for (const s of state.map.segs) {
      const a = nodePos(state.map, s.a), b = nodePos(state.map, s.b);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const d = Math.hypot(mx - g.x, mz - g.z);
      if (d < bestD) { bestD = d; bestSeg = s.id; }
    }
    if (bestSeg >= 0) return { kind: 'segment', id: bestSeg };
    return null;
  }

  // ---------- camera controls ----------

  function pan(dx, dy) {
    const rect = canvas.getBoundingClientRect();
    const scale = view.zoom / rect.height * 1.35;
    view.cx -= dx * scale;
    view.cz -= dy * scale;
    clampView();
    applyView();
    notifyUserMotion();
  }

  function zoomBy(f) {
    view.zoom = clamp(view.zoom / f, 4.5, 17);
    clampView();
    applyView();
    notifyUserMotion();
  }

  function clampView() {
    if (!curState) return;
    view.cx = clamp(view.cx, 0, curState.map.W - 1);
    view.cz = clamp(view.cz, 0, curState.map.H - 1);
  }

  function centerOn(nodeIdx) {
    if (!curState) return;
    const p = nodePos(curState.map, nodeIdx);
    view.cx = p.x; view.cz = p.z;
    clampView(); applyView();
  }

  function notifyUserMotion() { lastUserMotion = clockMs / 1000; }
  function userIdleSeconds() { return clockMs / 1000 - lastUserMotion; }

  // ---------- per-frame ----------

  function setMatch(state) {
    curState = state;
    for (const grp of [camGroup, vehGroup, vandalGroup, fxGroup, overlayGroup]) {
      if (grp) scene.remove(grp);
    }
    camMeshes.clear(); vehMeshes.clear(); vandalMeshes.clear(); fx.length = 0;
    camGroup = new THREE.Group(); vehGroup = new THREE.Group();
    vandalGroup = new THREE.Group(); fxGroup = new THREE.Group(); overlayGroup = new THREE.Group();
    scene.add(camGroup, vehGroup, vandalGroup, fxGroup, overlayGroup);
    buildCity(state);
    view = { cx: (state.map.W - 1) / 2, cz: (state.map.H - 1) / 2, zoom: 12.5 };
    applyView();
    overlayDirty = true;
    raining = false;
    clearGhost(); setSelected(state, null); setTutorialRing(state, null);
  }

  function update(state, dtMs, evs) {
    if (!renderer || !curState) return;
    clockMs += dtMs;
    const dt = dtMs / 1000;

    // ambient motion damps to ~10% while the user pans, easing back (§18.1)
    const sinceMotion = clockMs / 1000 - lastUserMotion;
    motionDamp = sinceMotion < 0.15 ? 0.1 : Math.min(1, motionDamp + dt);

    if (evs && evs.length) onEvents(state, evs);
    if (overlayDirty) rebuildOverlay(state);

    syncCameras(state);
    syncVehicles(state);
    syncVandals(state);

    // fx aging
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.update) f.update(f, k);
      if (k >= 1) { fxGroup.remove(f.mesh); fx.splice(i, 1); }
    }

    // rain visuals
    const isRaining = state.shift.rainUntil > state.time;
    if (isRaining && !rainSys) { rainSys = buildRain(); scene.add(rainSys); }
    if (!isRaining && rainSys) { scene.remove(rainSys); rainSys = null; markOverlayDirty(); }
    if (rainSys) {
      const pos = rainSys.geometry.attributes.position;
      const fall = 7 * dt * motionDamp;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fall;
        if (y < 0) y = 6;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // relay blink, selected pulse
    for (const [, m] of camMeshes) {
      m.traverse(o => {
        if (o.userData.blink) o.material.color.setHex(
          Math.floor(clockMs / 500) % 2 ? V.CYAN : 0x1c5f78);
      });
    }
    if (selectedRing) selectedRing.material.opacity = 0.5 + 0.25 * Math.sin(clockMs / 200);
    if (tutorialRing) {
      const s = 1 + 0.12 * Math.sin(clockMs / 220);
      tutorialRing.scale.setScalar(s);
      tutorialRing.material.opacity = 0.6 + 0.3 * Math.sin(clockMs / 220);
    }

    renderer.render(scene, camera);
  }

  return {
    init, setMatch, update, resize,
    pan, zoomBy, centerOn, notifyUserMotion, userIdleSeconds,
    pickNode: (px, py) => curState ? pickNode(curState, px, py) : null,
    pickObject: (px, py) => curState ? pickObject(curState, px, py) : null,
    worldToScreen, screenToGround, nodeScreen: (nodeIdx) => {
      const p = nodePos(curState.map, nodeIdx);
      return worldToScreen(p.x, p.z, 0);
    },
    setGhost: (n, t, d, ok) => setGhost(curState, n, t, d, ok),
    clearGhost,
    setSelected: (n) => setSelected(curState, n),
    setTutorialRing: (n) => setTutorialRing(curState, n),
    markOverlayDirty,
    getView: () => view
  };
})();
