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
    BG: 0x0b0d12, ROAD: 0x2a2e37, ROAD_ART: 0x333844, LANE: 0x4d525e,
    NODE: 0x31353f, POOL: 0xff9a2a, BUILDING: 0x14161c, BUILDING2: 0x171a21,
    ROOF: 0x1b1e26, EXIT: 0x2e3340, WINDOW: 0xffd98a, WINDOW2: 0x9ab4d9,
    GOLD: 0xffc84a, MISS: 0x6a6f78, TEAL: 0x39d3c0, RED: 0xff5a52,
    AMBER: 0xffb44a, CYAN: 0x53c8ff, VEHICLE: 0x8a8f99, HEADLIGHT: 0xffe9b0,
    SCRAPPER: 0xa0623a, TAGGER: 0x5da05a, FIXER: 0x23252d,
    GHOST_OK: 0x7ad9ff, GHOST_BAD: 0xff5a52,
    ROAD_W: 0.30, ART_W: 0.42
  };

  let renderer, scene, camera, canvas;
  let mapGroup = null, camGroup = null, vehGroup = null, vandalGroup = null, fxGroup = null, overlayGroup = null, caseGroup = null;
  let curState = null;
  const camMeshes = new Map(), vehMeshes = new Map(), vandalMeshes = new Map(), caseMarkers = new Map();
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

    // three-source night lighting: cool ambient, a moon key from the NE,
    // and a hemisphere so box faces separate — depth is legibility
    const amb = new THREE.AmbientLight(0x8890a8, 0.55);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xc8d4ff, 0.65);
    dir.position.set(4, 10, -3);
    scene.add(dir);
    const hemi = new THREE.HemisphereLight(0x354060, 0x14161c, 0.7);
    scene.add(hemi);
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

    // intersections: crosswalk ticks + sodium pools with a lamp head
    const nodeMat = new THREE.MeshLambertMaterial({ color: V.NODE });
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x565c68 });
    const poolTex = radialTexture('rgba(255,154,42,0.55)');
    for (const n of map.nodes) {
      if (!map.adj[n.id].length) continue;
      const w = V.ART_W + 0.06;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, w), nodeMat);
      m.position.set(n.x, 0.011, n.y);
      mapGroup.add(m);
      // crosswalk ticks on each connected approach
      for (const e of map.adj[n.id]) {
        const other = map.nodes[e.node];
        const dx = Math.sign(other.x - n.x), dy = Math.sign(other.y - n.y);
        for (let t = -1; t <= 1; t++) {
          const tick = new THREE.Mesh(new THREE.BoxGeometry(
            dx !== 0 ? 0.02 : 0.06, 0.004, dy !== 0 ? 0.02 : 0.06), crossMat);
          tick.position.set(n.x + dx * 0.3 + (dy !== 0 ? t * 0.08 : 0), 0.026,
            n.y + dy * 0.3 + (dx !== 0 ? t * 0.08 : 0));
          mapGroup.add(tick);
        }
      }
      if ((n.x + n.y) % 2 === 0) {
        const pool = new THREE.Sprite(new THREE.SpriteMaterial({
          map: poolTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5
        }));
        pool.scale.set(1.5, 1.5, 1);
        pool.position.set(n.x + 0.22, 0.06, n.y - 0.22);
        mapGroup.add(pool);
        // the streetlamp itself: pole + warm head
        const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.4, 5),
          new THREE.MeshLambertMaterial({ color: 0x2e323c }));
        lp.position.set(n.x + 0.22, 0.2, n.y - 0.22);
        mapGroup.add(lp);
        const lh = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xffc06a }));
        lh.position.set(n.x + 0.22, 0.41, n.y - 0.22);
        mapGroup.add(lh);
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

    // Buildings fill the block cells the roads leave — styled by district
    // so parts of town are tellable apart at a glance (player-directed):
    // downtown towers, ledged apartments, pitched-roof row houses, and
    // signature landmarks with signs for the bank / grocery / offices.
    const bMats = [new THREE.MeshLambertMaterial({ color: V.BUILDING }),
      new THREE.MeshLambertMaterial({ color: V.BUILDING2 })];
    const towerMat = new THREE.MeshLambertMaterial({ color: 0x161b26 });
    const houseMat = new THREE.MeshLambertMaterial({ color: 0x1c1913 });
    const houseRoofMat = new THREE.MeshLambertMaterial({ color: 0x241d15 });
    const roofMat = new THREE.MeshLambertMaterial({ color: V.ROOF });

    const addSign = (x, y, z, text, color) => {
      const sp = textSprite(text, color, 'rgba(8,10,14,0.9)');
      sp.scale.set(0.72, 0.22, 1);
      sp.position.set(x, y, z);
      mapGroup.add(sp);
    };
    // lit windows on the camera-facing (south) faces — the night city
    // reads as inhabited, and tall lit towers mark downtown at a glance
    const winMats = [new THREE.MeshBasicMaterial({ color: V.WINDOW }),
      new THREE.MeshBasicMaterial({ color: V.WINDOW2 }),
      new THREE.MeshBasicMaterial({ color: 0x6a6f66 })];
    const addWindows = (bx, bh, bz, bw, bd, count) => {
      for (let i = 0; i < count; i++) {
        const wm = winMats[Math.floor(rng() * winMats.length)];
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.04, 0.006), wm);
        win.position.set(bx + (rng() - 0.5) * bw * 0.7,
          0.08 + rng() * (bh - 0.14), bz + bd / 2 + 0.004);
        mapGroup.add(win);
      }
    };

    const poiCells = new Set();
    const poiDefs = [];
    if (map.poi) {
      for (const kind of Object.keys(map.poi)) {
        const n = map.nodes[map.poi[kind]];
        const cx = clamp(n.x, 0, map.W - 2), cy = clamp(n.y, 0, map.H - 2);
        poiCells.add(cx + '_' + cy);
        poiDefs.push({ kind, x: cx, y: cy });
      }
    }

    for (let y = 0; y < map.H - 1; y++) for (let x = 0; x < map.W - 1; x++) {
      if (poiCells.has(x + '_' + y)) continue;   // the landmark owns its block
      if (rng() < 0.1) continue;                 // vacant lot
      const district = map.districts ? map.districts[y * map.W + x] : 'HOUSES';
      if (district === 'HOUSES' || district === 'SYNDICATE') {
        // three house archetypes: simple, L-shaped, and with a garage
        const cnt = 2 + (rng() < 0.5 ? 1 : 0);
        const roofMats = [houseRoofMat,
          new THREE.MeshLambertMaterial({ color: 0x1d2419 }),
          new THREE.MeshLambertMaterial({ color: 0x261a1a })];
        for (let i = 0; i < cnt; i++) {
          const hw = 0.15 + rng() * 0.08, hh = 0.12 + rng() * 0.08;
          const hx = x + 0.24 + rng() * 0.5, hz = y + 0.24 + rng() * 0.5;
          const kind2 = rng();
          const body = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hw), houseMat);
          body.position.set(hx, hh / 2, hz);
          mapGroup.add(body);
          const rm = roofMats[Math.floor(rng() * roofMats.length)];
          const roof = new THREE.Mesh(new THREE.ConeGeometry(hw * 0.78, 0.07 + rng() * 0.05, 4), rm);
          roof.rotation.y = Math.PI / 4;
          roof.position.set(hx, hh + 0.04, hz);
          mapGroup.add(roof);
          if (kind2 < 0.35) {           // L-wing
            const wing = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.7, hh * 0.8, hw * 0.55), houseMat);
            wing.position.set(hx + hw * 0.62, hh * 0.4, hz + hw * 0.2);
            mapGroup.add(wing);
          } else if (kind2 < 0.6) {     // flat-roofed garage
            const gar = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.6, hh * 0.55, hw * 0.6), bMats[0]);
            gar.position.set(hx - hw * 0.72, hh * 0.28, hz);
            mapGroup.add(gar);
          }
          if (rng() < 0.6) {            // a warm porch light
            const pl = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.03, 0.006), winMats[0]);
            pl.position.set(hx + (rng() - 0.5) * hw * 0.5, hh * 0.45, hz + hw / 2 + 0.004);
            mapGroup.add(pl);
          }
        }
      } else if (district === 'APARTMENTS') {
        const bw = 0.32 + rng() * 0.2, bd = 0.3 + rng() * 0.16;
        const bh = 0.34 + rng() * 0.38;
        const bx = x + 0.3 + rng() * 0.35, bz = y + 0.3 + rng() * 0.35;
        const bm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMats[Math.floor(rng() * 2)]);
        bm.position.set(bx, bh / 2, bz);
        mapGroup.add(bm);
        for (let l = 1; l <= 2; l++) {           // balcony ledges
          const ledge = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.08, 0.012, bd * 1.08), roofMat);
          ledge.position.set(bx, bh * l / 3, bz);
          mapGroup.add(ledge);
        }
        const flavor = rng();
        if (flavor < 0.35) {            // stairwell tower on the roof
          const st = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.28, 0.1, bd * 0.3), roofMat);
          st.position.set(bx + bw * 0.25, bh + 0.05, bz - bd * 0.2);
          mapGroup.add(st);
        } else if (flavor < 0.6) {      // row of rooftop AC units
          for (let a2 = 0; a2 < 3; a2++) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.035), roofMat);
            ac.position.set(bx - bw * 0.3 + a2 * bw * 0.3, bh + 0.013, bz + bd * 0.2);
            mapGroup.add(ac);
          }
        } else if (flavor < 0.75) {     // a corner shop at street level
          const shop = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, 0.02, 0.05),
            new THREE.MeshBasicMaterial({ color: [0x7a5a8a, 0x5a7a6a, 0x8a6a4a][Math.floor(rng() * 3)] }));
          shop.position.set(bx, 0.1, bz + bd / 2 + 0.02);
          mapGroup.add(shop);
        }
        addWindows(bx, bh, bz, bw, bd, 2 + Math.floor(rng() * 3));
      } else {                                    // DOWNTOWN / OFFICE ring: tower archetypes
        const cnt = 1 + (rng() < 0.35 ? 1 : 0);
        for (let i = 0; i < cnt; i++) {
          const bw = 0.24 + rng() * 0.18, bd = 0.24 + rng() * 0.18;
          const bh = 0.65 + rng() * 1.15;
          const bx = x + 0.28 + rng() * (0.44 - bw / 2), bz = y + 0.28 + rng() * (0.44 - bd / 2);
          const arch = rng();
          if (arch < 0.4) {             // stepped setback tower
            const base = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.6, bd), towerMat);
            base.position.set(bx, bh * 0.3, bz);
            mapGroup.add(base);
            const top = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.65, bh * 0.45, bd * 0.65), towerMat);
            top.position.set(bx, bh * 0.6 + bh * 0.22, bz);
            mapGroup.add(top);
            addWindows(bx, bh * 0.6, bz, bw, bd, 3);
          } else if (arch < 0.6) {      // round tower with a crown
            const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.45, bw * 0.5, bh, 10), towerMat);
            cyl.position.set(bx, bh / 2, bz);
            mapGroup.add(cyl);
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.5, bw * 0.45, 0.03, 10), roofMat);
            crown.position.set(bx, bh + 0.015, bz);
            mapGroup.add(crown);
          } else {                      // slab
            const bm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), towerMat);
            bm.position.set(bx, bh / 2, bz);
            mapGroup.add(bm);
            addWindows(bx, bh, bz, bw, bd, 3 + Math.floor(rng() * 4));
          }
          if (rng() < 0.6) {
            const v = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.25, 0.08, bd * 0.25), roofMat);
            v.position.set(bx + (rng() - 0.5) * bw * 0.4, bh + 0.04, bz + (rng() - 0.5) * bd * 0.4);
            mapGroup.add(v);
          }
        }
      }
    }

    // every part of town gets its name, not just the landmarks
    // (player-directed): muted labels so they never compete with signals
    const addDistrictLabel = (nodeIdx, text, dz) => {
      if (nodeIdx === undefined || nodeIdx < 0) return;
      const n = map.nodes[nodeIdx];
      const sp = textSprite(text, '#7d8798', 'rgba(8,10,14,0.72)', true);
      // a name-tag, not a world object: always legible over rings/markers
      sp.material.depthTest = false;
      sp.renderOrder = 5;
      sp.scale.set(0.17 * sp.userData.aspect, 0.17, 1); // constant height, width to fit
      sp.position.set(n.x, 0.42, n.y + (dz || 0));
      mapGroup.add(sp);
    };
    if (map.districts) {
      const byDistrict = (tag, pick) => {
        const cands = map.nodes.filter(n => map.districts[n.id] === tag && map.adj[n.id].length);
        if (!cands.length) return -1;
        return pick(cands).id;
      };
      addDistrictLabel(map.center, 'DOWNTOWN');
      // nudged off the node: the syndicate pole collects telegraph rings
      // and scene markers, and the label must never sit under them
      addDistrictLabel(map.syndicate, 'SYNDICATE BLOCK', -0.38);
      addDistrictLabel(byDistrict('APARTMENTS', c => c.reduce((m, n) => n.y < m.y ? n : m, c[0])), 'APARTMENTS');
      addDistrictLabel(byDistrict('APARTMENTS', c => c.reduce((m, n) => n.y > m.y ? n : m, c[0])), 'APARTMENTS');
      addDistrictLabel(byDistrict('HOUSES', c => c.reduce((m, n) => n.y < m.y ? n : m, c[0])), 'ROW HOUSES');
      addDistrictLabel(byDistrict('HOUSES', c => c.reduce((m, n) => n.y > m.y ? n : m, c[0])), 'ROW HOUSES');
    }

    // signature landmarks that LOOK like their labels (player-directed)
    for (const p of poiDefs) {
      const bx = p.x + 0.5, bz = p.y + 0.5;
      if (p.kind === 'BANK') {
        const hall = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.4),
          new THREE.MeshLambertMaterial({ color: 0x403d33 }));
        hall.position.set(bx, 0.15, bz);
        mapGroup.add(hall);
        // pediment over the columns, and steps down to the street
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.3, 0.1, 3),
          new THREE.MeshLambertMaterial({ color: 0x555142 }));
        ped.rotation.z = Math.PI / 2;
        ped.rotation.y = Math.PI / 2;
        ped.scale.set(1, 1, 0.4);
        ped.position.set(bx, 0.33, bz - 0.16);
        mapGroup.add(ped);
        for (let c = -1; c <= 1; c++) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6),
            new THREE.MeshLambertMaterial({ color: 0x5c5847 }));
          col.position.set(bx + c * 0.16, 0.12, bz - 0.24);
          mapGroup.add(col);
        }
        for (let s2 = 0; s2 < 3; s2++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(0.5 - s2 * 0.06, 0.016, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x4a463a }));
          step.position.set(bx, 0.008 + s2 * 0.016, bz - 0.3 - s2 * 0.03);
          mapGroup.add(step);
        }
        addSign(bx, 0.52, bz, 'BANK', '#e8d48a');
      } else if (p.kind === 'GROCERY') {
        const store = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.46),
          new THREE.MeshLambertMaterial({ color: 0x27302b }));
        store.position.set(bx, 0.07, bz);
        mapGroup.add(store);
        // lit storefront band + a little parking with parked cars
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.006),
          new THREE.MeshBasicMaterial({ color: 0xbfd9a8 }));
        front.position.set(bx, 0.05, bz + 0.234);
        mapGroup.add(front);
        const lot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.006, 0.2),
          new THREE.MeshLambertMaterial({ color: 0x22252c }));
        lot.position.set(bx, 0.003, bz + 0.36);
        mapGroup.add(lot);
        for (let pc = 0; pc < 2 + Math.floor(rng() * 2); pc++) {
          const parked = buildVehicle({ plate: 'PARK' + Math.floor(rng() * 999) + p.x + '' + pc, id: -1 });
          parked.scale.setScalar(0.85);
          parked.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.1;
          parked.position.set(bx - 0.2 + pc * 0.17, 0, bz + 0.36);
          parked.traverse(o => { if (o.material && o.material.color && o.geometry &&
            o.geometry.type === 'ConeGeometry') o.visible = false; });   // no headlight cones while parked
          mapGroup.add(parked);
        }
        addSign(bx, 0.36, bz, 'GROCERY', '#9fd9a3');
      } else if (p.kind === 'OFFICE') {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), towerMat);
        tower.position.set(bx, 0.75, bz);
        mapGroup.add(tower);
        // glass curtain: stacked lit window rows + a lobby band
        for (let f = 0; f < 7; f++) addWindows(bx, 1.45, bz, 0.3, 0.3, 2);
        const lobby = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.006),
          new THREE.MeshBasicMaterial({ color: 0x9ab4d9 }));
        lobby.position.set(bx, 0.05, bz + 0.154);
        mapGroup.add(lobby);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4),
          new THREE.MeshBasicMaterial({ color: 0x8b93a5 }));
        mast.position.set(bx, 1.6, bz);
        mapGroup.add(mast);
        addSign(bx, 1.78, bz, 'OFFICES', '#9ab4d9');
      }
    }
    // the syndicate block reads as what it is: a dark warehouse, lights off
    {
      const sn = map.nodes[map.syndicate];
      const wx = clamp(sn.x, 0, map.W - 2) + 0.5, wz = clamp(sn.y, 0, map.H - 2) + 0.5;
      const wh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42),
        new THREE.MeshLambertMaterial({ color: 0x191b1c }));
      wh.position.set(wx, 0.1, wz);
      mapGroup.add(wh);
      const roofRidge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.08),
        new THREE.MeshLambertMaterial({ color: 0x121415 }));
      roofRidge.position.set(wx, 0.215, wz);
      mapGroup.add(roofRidge);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.006),
        new THREE.MeshLambertMaterial({ color: 0x24272a }));
      door.position.set(wx, 0.06, wz + 0.214);
      mapGroup.add(door);
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

  function textSprite(text, color, bg, fit) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = 'bold 22px monospace';
    // fit: size the canvas to the text so long names never truncate
    // (a fixed 128px canvas clipped "SYNDICATE BLOCK" to "NDICATE BLO")
    c.width = fit ? Math.max(64, Math.ceil(g.measureText(text).width) + 18) : 128;
    c.height = 40;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, 40); }
    g.font = 'bold 22px monospace'; // resizing the canvas resets the context
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, c.width / 2, 21);
    const t = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: t, transparent: true, depthWrite: false
    }));
    sp.scale.set(1.15, 0.36, 1);
    sp.userData.aspect = c.width / c.height;
    return sp;
  }

  // ---------- cameras ----------

  function buildCamMesh(state, cam) {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x454b58 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x6a7180 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.55, 6), poleMat);
    pole.position.y = 0.28;
    g.add(pole);
    // every unit stands in its own pool of light — find your network at
    // a glance (additive: it hides nothing)
    if (cam.id !== -1 || true) {
      const pool = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialTexture('rgba(122,217,255,0.5)'),
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4
      }));
      pool.scale.set(0.85, 0.85, 1);
      pool.position.y = 0.03;
      g.add(pool);
    }
    if (cam.type === 'POST') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.13), headMat);
      head.position.y = 0.6;
      g.add(head);
      // a lit lens on the quadrant bisector
      const [ax, ay] = Sightlines.DIRS[cam.dir || 0];
      const [bx2, by2] = Sightlines.DIRS[((cam.dir || 0) + 1) % 4];
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffc84a }));
      lens.position.set((ax + bx2) * 0.055, 0.6, (ay + by2) * 0.055);
      g.add(lens);
      // the aimed quadrant, shown forever at hull level: two gold ticks
      // along the covered rays (fixed-sector doctrine)
      const tickMat = new THREE.MeshBasicMaterial({ color: 0xd8b46a });
      for (const d of [cam.dir || 0, ((cam.dir || 0) + 1) % 4]) {
        const [dx, dy] = Sightlines.DIRS[d];
        const tick = new THREE.Mesh(new THREE.BoxGeometry(
          dx !== 0 ? 0.13 : 0.035, 0.016, dy !== 0 ? 0.13 : 0.035), tickMat);
        tick.position.set(dx * 0.16, 0.05, dy * 0.16);
        g.add(tick);
      }
    } else if (cam.type === 'LONG') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.11), headMat);
      head.position.y = 0.62;
      g.add(head);
      // lens hood wedge: shows the aim forever, sized hull-level (§12)
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 4),
        new THREE.MeshBasicMaterial({ color: 0xd8b46a }));
      hood.rotation.z = -Math.PI / 2;
      hood.position.set(0.18, 0.62, 0);
      g.add(hood);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffc84a }));
      lens.position.set(0.12, 0.62, 0);
      g.add(lens);
      const d = Sightlines.DIRS[cam.dir];
      g.rotation.y = -Math.atan2(d[1], d[0]);
    } else if (cam.type === 'DOME') {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x7a90a8 }));
      head.position.y = 0.58;
      g.add(head);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0x53c8ff }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.58;
      g.add(ring);
    } else if (cam.type === 'OFFICER') {
      // no pole: a uniform standing the corner
      g.remove(pole);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 8),
        new THREE.MeshLambertMaterial({ color: 0x2e3a55 }));
      body.position.y = 0.08;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x8a7862 }));
      head.position.y = 0.185;
      g.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.02, 8),
        new THREE.MeshLambertMaterial({ color: 0x232c42 }));
      cap.position.y = 0.215;
      g.add(cap);
      const badge = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffd98a }));
      badge.position.set(0.03, 0.11, 0.045);
      g.add(badge);
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
    // Literal coverage: a street collinear with the pole is watched its
    // whole length; cross-traffic is only ever photographed inside the
    // junction box the sight ray reaches. An oblique-only street gets a
    // short stub at that junction — the tint never claims mid-block sight
    // through a building row (it matches what the lens can show).
    const seen = new Map(); // segId -> best live conf per geometry
    for (const cam of state.cameras) {
      for (const e of cam.sight) {
        const conf = Sightlines.liveConfidence(state, cam, e);
        let rec = seen.get(e.seg);
        if (!rec) { rec = { full: -1, endA: -1, endB: -1 }; seen.set(e.seg, rec); }
        if (!e.oblique) { if (conf > rec.full) rec.full = conf; }
        else {
          const s = map.segs[e.seg];
          const na = map.nodes[s.a], nb = map.nodes[s.b], nc = map.nodes[cam.node];
          const da = Math.abs(na.x - nc.x) + Math.abs(na.y - nc.y);
          const db = Math.abs(nb.x - nc.x) + Math.abs(nb.y - nc.y);
          if (da <= db) { if (conf > rec.endA) rec.endA = conf; }
          else if (conf > rec.endB) rec.endB = conf;
        }
      }
    }
    const STUB = 0.3;  // how far past the junction box an oblique tint reaches
    const draw = (segId, conf, f0, f1) => {
      const s = map.segs[segId];
      const a = nodePos(map, s.a), b = nodePos(map, s.b);
      const len = (Math.abs(a.x - b.x) + Math.abs(a.z - b.z)) * (f1 - f0);
      const mx = a.x + (b.x - a.x) * (f0 + f1) / 2, mz = a.z + (b.z - a.z) * (f0 + f1) / 2;
      const color = conf >= state.threshold + 10 ? V.TEAL
        : conf >= state.threshold ? V.AMBER : V.RED;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: conf >= state.threshold ? 0.17 : 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        s.dir === 'H' ? len : 0.5, 0.004, s.dir === 'H' ? 0.5 : len), mat);
      m.position.set(mx, 0.03, mz);
      overlayGroup.add(m);
      // a crisp scanline down the covered stretch: coverage reads at any zoom
      const line = new THREE.Mesh(new THREE.BoxGeometry(
        s.dir === 'H' ? len : 0.05, 0.005, s.dir === 'H' ? 0.05 : len),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: conf >= state.threshold ? 0.3 : 0.22,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      line.position.set(mx, 0.035, mz);
      overlayGroup.add(line);
    };
    for (const [segId, rec] of seen) {
      if (rec.full >= 0) draw(segId, Math.max(rec.full, rec.endA, rec.endB), 0, 1);
      else {
        if (rec.endA >= 0) draw(segId, rec.endA, 0, STUB);
        if (rec.endB >= 0) draw(segId, rec.endB, 1 - STUB, 1);
      }
    }
  }

  // ---------- vehicles & vandals ----------

  // Vehicles are typed and coloured by their plate identity — the same
  // car the case-file stills show and the witness described.
  const VEH_DIMS = {
    'COMPACT':    { l: 0.15, h: 0.063, w: 0.098, cab: [0.071, 0.039, 0.0] },
    'SEDAN':      { l: 0.21, h: 0.055, w: 0.104, cab: [0.094, 0.039, -0.014] },
    'SPORTS CAR': { l: 0.2,  h: 0.041, w: 0.104, cab: [0.081, 0.03, -0.023] },
    'SUV':        { l: 0.18, h: 0.086, w: 0.11,  cab: [0.109, 0.044, 0.006] },
    'PICKUP':     { l: 0.22, h: 0.067, w: 0.109, cab: null },
    'VAN':        { l: 0.2,  h: 0.094, w: 0.11,  cab: null }
  };

  function buildVehicle(veh) {
    const g = new THREE.Group();
    const ident = carIdentity(veh.plate);
    const d = VEH_DIMS[ident.type] || VEH_DIMS.SEDAN;
    const mat = new THREE.MeshLambertMaterial({ color: ident.color.hex });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x0c0e13 });
    if (ident.type === 'PICKUP') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(d.l * 0.42, d.h * 1.35, d.w), mat);
      cab.position.set(d.l * 0.2, d.h * 0.7, 0);
      g.add(cab);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(d.l * 0.55, d.h * 0.75, d.w), mat);
      bed.position.set(-d.l * 0.22, d.h * 0.42, 0);
      g.add(bed);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(d.l, d.h, d.w), mat);
      body.position.y = d.h / 2 + 0.008;
      g.add(body);
      if (d.cab) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(d.cab[0], d.cab[1], d.w * 0.82), glassMat);
        cab.position.set(d.cab[2], d.h + d.cab[1] / 2, 0);
        g.add(cab);
      } else {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(d.l * 0.86, d.h * 0.5, d.w * 0.84), glassMat);
        cab.position.set(0, d.h + d.h * 0.22, 0);
        g.add(cab);
      }
    }
    // contact shadow grounds the car on the asphalt
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(d.l * 0.62, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.scale.z = 0.62;
    g.add(shadow);
    // lit headlights and taillights read direction of travel instantly —
    // and a car's damage traits show on the model itself, so the case
    // file's photos and the witness's description share one truth
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xc2483c });
    const deadMat = new THREE.MeshBasicMaterial({ color: 0x3a2224 });
    const brokenTl = ident.damage.includes('BROKEN TAILLIGHT');
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.02), hlMat);
      hl.position.set(d.l / 2, d.h * 0.55, s * d.w * 0.3);
      g.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.018),
        brokenTl && s === 1 ? deadMat : tlMat);
      tl.position.set(-d.l / 2, d.h * 0.55, s * d.w * 0.3);
      g.add(tl);
    }
    if (ident.damage.includes('DENTED PANEL')) {
      const dent = new THREE.Mesh(new THREE.BoxGeometry(d.l * 0.28, d.h * 0.5, 0.004),
        new THREE.MeshLambertMaterial({ color: 0x14161a }));
      dent.position.set(d.l * 0.08, d.h * 0.5, d.w / 2 + 0.002);
      g.add(dent);
    }
    if (ident.damage.includes('CRACKED WINDSHIELD')) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.02, d.w * 0.5),
        new THREE.MeshBasicMaterial({ color: 0xd8e0ec, transparent: true, opacity: 0.7 }));
      crack.position.set(d.l * 0.22, d.h + 0.012, 0);
      crack.rotation.y = 0.3;
      g.add(crack);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: V.HEADLIGHT, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
    cone.rotation.z = Math.PI / 2;
    cone.position.set(d.l * 0.5 + 0.16, 0.04, 0);
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
    // right-hand traffic (player-directed): the driver's right of travel
    // direction (dx,dz) is (-dz,dx) with x east and z south
    const ox = -dz * 0.07, oz = dx * 0.07;
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
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, 0.17, 8),
      new THREE.MeshLambertMaterial({ color: col }));
    body.position.y = 0.085;
    g.add(body);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshLambertMaterial({ color: col }));
    hood.position.y = 0.19;
    g.add(hood);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 10),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    g.add(shadow);
    // trouble light: red dot overhead, shown only while acting
    const alert = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5),
      new THREE.MeshBasicMaterial({ color: V.RED }));
    alert.position.y = 0.32;
    alert.visible = false;
    alert.userData.alert = true;
    g.add(alert);
    g.userData = { kind: 'vandal', id: v.id };
    return g;
  }

  // Persistent scene markers: every open case keeps a diamond at its
  // crime scene, so tips and cards stay connected to the geography.
  // Contested cases pulse amber; vandal scenes are cyan.
  function syncCaseMarkers(state) {
    const live = new Set();
    for (const kase of state.cases) {
      if (kase.status !== 'OPEN' && kase.status !== 'CONTESTED') continue;
      live.add(kase.id);
      let m = caseMarkers.get(kase.id);
      if (!m) {
        const color = kase.type === 'VANDAL' ? V.CYAN : V.GOLD;
        const g = new THREE.Group();
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.1, 4),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        d.rotation.x = -Math.PI / 2;
        d.rotation.z = Math.PI / 4;
        d.position.y = 0.045;
        g.add(d);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.19, 20),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        g.add(ring);
        const p = nodePos(state.map, kase.spawnNode);
        g.position.set(p.x, 0, p.z);
        caseGroup.add(g);
        caseMarkers.set(kase.id, g);
        m = g;
      }
      // contested pulses; open breathes gently
      const k = kase.status === 'CONTESTED' ? 0.25 : 0.08;
      const s = 1 + k * Math.sin(clockMs / (kase.status === 'CONTESTED' ? 180 : 420));
      m.scale.setScalar(s);
    }
    for (const [id, m] of caseMarkers) {
      if (!live.has(id)) { caseGroup.remove(m); caseMarkers.delete(id); }
    }
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
      // acting: bob + the trouble light blinks
      if (v.state === 'ACT') m.position.y = Math.abs(Math.sin(clockMs / 130)) * 0.03;
      m.traverse(o => {
        if (o.userData.alert) o.visible = v.state === 'ACT' && Math.floor(clockMs / 300) % 2 === 0;
      });
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

  // A word bubble pops where the crime was reported (player-directed):
  // the witness's own words, floating over the scene.
  function wordBubble(state, node, text, dur) {
    const lines = text.split('\n');
    const c = document.createElement('canvas');
    c.width = 512; c.height = 40 + lines.length * 42;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(14,17,24,0.94)';
    g.beginPath(); g.roundRect(4, 4, 504, c.height - 26, 16); g.fill();
    g.strokeStyle = '#ffc84a'; g.lineWidth = 3; g.stroke();
    // the tail
    g.fillStyle = 'rgba(14,17,24,0.94)';
    g.beginPath();
    g.moveTo(236, c.height - 24); g.lineTo(276, c.height - 24); g.lineTo(256, c.height - 2);
    g.closePath(); g.fill();
    g.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2e8c8';
    lines.forEach((l, i) => g.fillText(l, 256, 26 + i * 40));
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const scale = 1.7;
    sp.scale.set(scale, scale * c.height / 512, 1);
    const p = nodePos(state.map, node);
    sp.position.set(p.x, 0.75, p.z);
    addFx(sp, dur || 4.5, (f, k) => {
      f.mesh.position.y = 0.75 + k * 0.25;
      f.mesh.material.opacity = k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1;
    });
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
        case 'tip':
          if (ev.bubble) wordBubble(state, ev.node, ev.bubble, 4.5);
          else if (ev.early) crimeIcon(state, ev.node, V.CYAN, 5);
          break;
        case 'arrest': {
          const node = ev.node !== undefined ? ev.node
            : (state.cases.find(c => c.id === ev.caseId) || {}).spawnNode;
          if (node !== undefined) ringFx(state, node, V.TEAL, 1.6, 0.15, 0.8);
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
    // preview the sightline — same literal geometry as the placed overlay:
    // cross-streets show only the junction stub the ray reaches, so the
    // ghost never promises more street than the camera will watch
    const entries = Sightlines.compute(state.map, nodeIdx, type, dir || 0);
    const gc = state.map.nodes[nodeIdx];
    for (const e of entries) {
      const s = state.map.segs[e.seg];
      const a = nodePos(state.map, s.a), b = nodePos(state.map, s.b);
      let f0 = 0, f1 = 1;
      if (e.oblique) {
        const na = state.map.nodes[s.a], nb = state.map.nodes[s.b];
        const da = Math.abs(na.x - gc.x) + Math.abs(na.y - gc.y);
        const db = Math.abs(nb.x - gc.x) + Math.abs(nb.y - gc.y);
        if (da <= db) f1 = 0.3; else f0 = 0.7;
      }
      const len = (Math.abs(a.x - b.x) + Math.abs(a.z - b.z)) * (f1 - f0);
      const mx = a.x + (b.x - a.x) * (f0 + f1) / 2, mz = a.z + (b.z - a.z) * (f0 + f1) / 2;
      const conf = Sightlines.baseConfidence(state.map, e, type);
      const mat = new THREE.MeshBasicMaterial({
        color: conf >= state.threshold ? V.GHOST_OK : V.GHOST_BAD,
        transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        s.dir === 'H' ? len : 0.4, 0.004, s.dir === 'H' ? 0.4 : len), mat);
      m.position.set(mx, 0.045, mz);
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

  // ---------- the Cyclops lens: real 3D stills for the case file ----------
  // Each frame is rendered from the photographing camera's own head, into
  // the live scene, with the ACTUAL vehicle placed on the read's segment.
  // Non-diegetic layers (coverage, fx, markers, live traffic) are hidden
  // for the exposure; the UI applies confidence-degradation post on top.

  let stillRenderer = null, stillCam = null;

  function captureStill(read) {
    if (!curState || !renderer || read.camNode === undefined) return null;
    const map = curState.map;
    const seg = map.segs[read.segId];
    if (!seg) return null;
    if (!stillRenderer) {
      const cv = document.createElement('canvas');
      cv.width = 704; cv.height = 352;
      stillRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
      stillRenderer.setPixelRatio(1);
      stillCam = new THREE.PerspectiveCamera(55, cv.width / cv.height, 0.05, 40);
    }

    // the subject: the car that was genuinely photographed (or the hooded
    // figure at the pole, for a witness frame)
    let subject;
    const a = nodePos(map, seg.a), b = nodePos(map, seg.b);
    if (read.vehId !== null) {
      subject = buildVehicle({ plate: read.actualPlate, id: -1 });
      const HD = [[1, 0], [0, 1], [-1, 0], [0, -1]][read.heading || 0];
      // Where on the segment was the car when the lens caught it? A street
      // collinear with the pole is visible its whole length (mid-block
      // shot); cross-traffic is only visible inside the intersection box
      // the sight ray reaches — a mid-block position there sits behind the
      // building row, and a lens must never show a wall yet claim a plate.
      const ga = map.nodes[seg.a], gb = map.nodes[seg.b], gc = map.nodes[read.camNode];
      const collinear = (ga.x === gc.x && gb.x === gc.x) || (ga.y === gc.y && gb.y === gc.y);
      let f = 0.5;
      if (!collinear) {
        const cn0 = nodePos(map, read.camNode);
        const da = Math.hypot(a.x - cn0.x, a.z - cn0.z), db = Math.hypot(b.x - cn0.x, b.z - cn0.z);
        f = da <= db ? 0.1 : 0.9;   // snapped crossing the visible junction
      }
      // on its correct (right-hand) side of the street in the photo too
      subject.position.set(
        a.x + (b.x - a.x) * f - HD[1] * 0.07, 0,
        a.z + (b.z - a.z) * f + HD[0] * 0.07);
      subject.rotation.y = -Math.atan2(HD[1], HD[0]);
    } else {
      subject = buildVandal({ id: -1, type: 'FIXER' });
      const n = read.subjectNode !== undefined ? nodePos(map, read.subjectNode) : { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      subject.position.set(n.x - 0.15, 0, n.z - 0.15);
    }
    scene.add(subject);

    // shoot from over the intersection itself (the pole's head hangs out
    // over the street — a lens buried in the block would photograph
    // rooftops), zoomed so the subject fills the frame at any distance
    const cn = nodePos(map, read.camNode);
    stillCam.position.set(cn.x, 0.55, cn.z);
    const dist = Math.hypot(subject.position.x - cn.x, subject.position.z - cn.z) || 0.5;
    stillCam.fov = clamp(2 * Math.atan(0.42 / dist) * 180 / Math.PI, 16, 48);
    stillCam.updateProjectionMatrix();
    stillCam.lookAt(subject.position.x, 0.06, subject.position.z);
    const flood = new THREE.PointLight(0xc8d8ee, 1.6, 6);
    flood.position.set(cn.x, 0.8, cn.z);
    scene.add(flood);

    const hidden = [overlayGroup, fxGroup, caseGroup, vehGroup, vandalGroup,
      selectedRing, tutorialRing, ghost, rainSys].filter(Boolean);
    const prior = hidden.map(o => o.visible);
    hidden.forEach(o => { o.visible = false; });

    stillRenderer.render(scene, stillCam);

    hidden.forEach((o, i) => { o.visible = prior[i]; });
    scene.remove(subject);
    scene.remove(flood);
    return stillRenderer.domElement;
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
    for (const grp of [camGroup, vehGroup, vandalGroup, fxGroup, overlayGroup, caseGroup]) {
      if (grp) scene.remove(grp);
    }
    camMeshes.clear(); vehMeshes.clear(); vandalMeshes.clear(); caseMarkers.clear(); fx.length = 0;
    camGroup = new THREE.Group(); vehGroup = new THREE.Group();
    vandalGroup = new THREE.Group(); fxGroup = new THREE.Group(); overlayGroup = new THREE.Group();
    caseGroup = new THREE.Group();
    scene.add(camGroup, vehGroup, vandalGroup, fxGroup, overlayGroup, caseGroup);
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
    syncCaseMarkers(state);

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
    carColorHex: (plate) => '#' + carIdentity(plate).color.hex.toString(16).padStart(6, '0'),
    pingNode: (n, color) => curState && ringFx(curState, n, color === 'red' ? V.RED : V.CYAN, 1.4, 0.15, 0.7),
    setGhost: (n, t, d, ok) => setGhost(curState, n, t, d, ok),
    clearGhost,
    setSelected: (n) => setSelected(curState, n),
    setTutorialRing: (n) => setTutorialRing(curState, n),
    markOverlayDirty, captureStill,
    // tap a camera and its whole sightline lights for a beat — the
    // fastest way to teach what one unit actually holds
    flashSightline: (camId) => {
      if (!curState) return;
      const cam = curState.cameras.find(c => c.id === camId);
      if (!cam) return;
      for (const e of cam.sight) segFlash(curState, e.seg, V.TEAL, 0.9, 0.4);
    },
    getView: () => view
  };
})();
