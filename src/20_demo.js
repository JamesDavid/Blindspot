// ============================================================
// DEMO — WATCH A SHIFT (§17.3). An AI plays the REAL interface:
// it opens the actual tap menus, the button it intends to press
// lights gold and pulses, ghosts walk turn → CONFIRM. One staged
// action at a time; refused actions never loop; any tap exits.
// Never saves, never touches the skill memory.
// ============================================================

var Demo = (() => {

  let state = null, running = false;
  let queue = [];            // staged steps: {at (wall s), fn, key}
  let wall = 0, nextPlanAt = 0;
  const blacklist = new Map();   // action key -> wall time until allowed
  let lastChecksum = '', lastActionKey = '', lastActionAt = -99;

  function start(s) {
    state = s;
    running = true;
    queue = []; wall = 0; nextPlanAt = 1.2;
    blacklist.clear();
  }
  function stop() {
    running = false;
    unlight();
    state = null;
  }

  function checksum() {
    return state.cameras.length + '|' + Math.floor(state.budget) + '|' + state.threshold + '|' +
      state.cases.filter(c => c.status === 'CONTESTED').length + '|' +
      state.cameras.reduce((s, c) => s + c.tags + (c.hardened ? 10 : 0) + (c.storageUp ? 100 : 0), 0);
  }

  function lit(el) {
    unlight();
    if (el) el.classList.add('demolit');
  }
  function unlight() {
    document.querySelectorAll('.demolit').forEach(e => e.classList.remove('demolit'));
  }

  function pressable(el) {
    return el && !el.getAttribute('data-refused');
  }

  // a visible PRESS: the button depresses and flashes as the AI clicks it
  function pressFx(el) {
    if (!el) return;
    el.classList.add('demopress');
    setTimeout(() => { if (el.isConnected) el.classList.remove('demopress'); }, 160);
    el.click();
  }

  // the demonstrator visibly reads the file: down through the frames,
  // then back up to the verdict row
  function scrollSheet(seconds) {
    const sheet = document.querySelector('[data-key=evsheet]');
    if (!sheet) return;
    const max = sheet.scrollHeight - sheet.clientHeight;
    if (max <= 0) return;
    const t0 = performance.now();
    const iv = setInterval(() => {
      const k = (performance.now() - t0) / (seconds * 1000);
      if (k >= 1 || !document.body.contains(sheet)) { clearInterval(iv); return; }
      sheet.scrollTop = max * (k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.4);
    }, 40);
  }

  function stage(key, steps) {
    const D = CONFIG.Demo;
    let t = wall;
    for (const s of steps) {
      t += s.delay !== undefined ? s.delay : D.PRESS_S;
      queue.push({ at: t, fn: s.fn, key });
    }
    lastActionKey = key;
    lastActionAt = wall;
  }

  // one planning pass: pick the single most instructive next action
  function plan() {
    const D = CONFIG.Demo;
    const ok = (key) => !blacklist.has(key) || blacklist.get(key) < wall;

    const STRAT = D.STRATEGY;

    // 1. adjudicate a contested card (visibly weighing, then pressing)
    const contested = state.cases.find(c => c.status === 'CONTESTED');
    if (contested && ok('adjudicate')) {
      const ev = CaseSystem.usableEvidence(state, contested);
      const avg = ev.length ? ev.reduce((s, r) => s + r.conf, 0) / ev.length : 0;
      const gr = CaseSystem.grade(state, ev);
      const charge = (avg / 100 + 0.15 * Math.min(ev.length, 4) - (gr.contradiction ? 0.35 : 0)) > STRAT.ADJ_BIAS;
      const btnKey = 'ev-' + (charge ? 'charge-' : 'release-') + contested.id;
      // open the case file, visibly SCROLL through the frames, then rule
      stage('adjudicate', [
        { delay: 0.3, fn: () => UI.openEvidenceSheet(contested.id) },
        { delay: 0.5, fn: () => scrollSheet(2.2) },
        { delay: 2.6, fn: () => lit(UI.getEl(btnKey)) },
        { delay: D.HIGHLIGHT_S + 0.5, fn: () => {
          const el = UI.getEl(btnKey);
          if (pressable(el)) pressFx(el); else UI.closeEvidenceSheet();
          unlight();
        } }
      ]);
      return;
    }

    // 1.5 tie an unidentified file to its strongest candidate, visibly
    const untied = state.cases.find(c => c.status === 'OPEN' && c.plate === null &&
      c._candPlates && Object.keys(c._candPlates).length && state.time - c.openedAt > 6);
    if (untied && ok('identify')) {
      const scores = {};
      for (const r of state.reads) {
        if (r.candidateOf === untied.id) scores[r.actualPlate] = (scores[r.actualPlate] || 0) + r.conf;
      }
      let bestPlate = null, bs = -1;
      for (const p in scores) if (scores[p] > bs) { bs = scores[p]; bestPlate = p; }
      if (bestPlate) {
        const key = 'identify-' + untied.id + '-' + bestPlate;
        stage('identify', [
          { delay: 0.3, fn: () => UI.openEvidenceSheet(untied.id) },
          { delay: 0.4, fn: () => scrollSheet(1.6) },
          { delay: 1.9, fn: () => lit(UI.getEl(key)) },
          { delay: D.PRESS_S + 0.4, fn: () => {
            const el = UI.getEl(key);
            if (pressable(el)) pressFx(el); else UI.closeEvidenceSheet();
            unlight();
          } },
          { delay: 1.3, fn: () => UI.closeEvidenceSheet() }
        ]);
        return;
      }
    }

    // 2. rain: move the dial down, visibly
    const raining = state.shift.rainUntil > state.time;
    const wantThr = raining ? STRAT.THR_RAIN : STRAT.THR_CALM;
    if (Math.abs(state.threshold - wantThr) >= 6 && ok('dial')) {
      stage('dial', [
        { delay: 0.2, fn: () => lit(UI.getEl('bandpill')) },
        { delay: D.HIGHLIGHT_S, fn: () => {
          const from = state.threshold;
          const el = UI.getEl('dial');
          let k = 0;
          const iv = setInterval(() => {
            k += 0.12;
            const v = Math.round(from + (wantThr - from) * Math.min(1, k));
            if (el) el.value = v;
            Actions.setThreshold(state, v);
            if (k >= 1) { clearInterval(iv); unlight(); }
          }, 60);
        } }
      ]);
      return;
    }

    // 3. build the network through the real menus. The warrant is the win
    // condition and it weighs x3 in the Review, so the syndicate block
    // gets a staked-out CHAIN before anything else expands.
    const wanted = Math.min(12, Math.max(2, Math.ceil(state.shift.num * STRAT.BUILD_PACE) + 1));
    if (state.cameras.length < wanted && state.budget >= CONFIG.Cameras.POST.COST && ok('place')) {
      let site = null;
      if (state.cameras.length >= 3) {
        const near = state.cameras.filter(c => c.type !== 'RELAY' &&
          CaseSystem.nodeDist(state, c.node, state.map.syndicate) <= CONFIG.Cases.ANCHOR_DIST).length;
        if (near < 3) site = pickSiteNear(state.map.syndicate, 3);
      }
      if (!site) site = pickSite();
      if (site !== null) {
        const relayTurn = state.cameras.length >= 4 &&
          !state.cameras.some(c => c.type === 'RELAY') && state.budget >= CONFIG.Cameras.RELAY.COST;
        const buyKey = relayTurn ? 'buy-relay' : 'buy-post';
        const steps = [
          { delay: 0.2, fn: () => { if (Renderer.userIdleSeconds() > 6) Renderer.centerOn(site.node); } },
          { delay: 0.5, fn: () => {
            const s = Renderer.nodeScreen(site.node);
            UI.openMenu(site.node, s.x, s.y);
          } },
          { delay: D.HIGHLIGHT_S, fn: () => lit(UI.getEl(buyKey)) },
          { delay: D.PRESS_S + 0.3, fn: () => {
            const el = UI.getEl(buyKey);
            if (pressable(el)) pressFx(el); else { UI.closeMenu(); blacklist.set('place', wall + CONFIG.Demo.BLACKLIST_S); }
            unlight();
          } }
        ];
        // aim the quadrant with visible TURN presses (fixed-sector doctrine)
        if (!relayTurn) {
          for (let t = 0; t < site.dir; t++) {
            steps.push({ delay: 0.35, fn: () => { const el = UI.getEl('turn-cw'); if (el) { lit(el); pressFx(el); } } });
          }
        }
        steps.push({ delay: D.CONFIRM_S + 0.35, fn: () => lit(UI.getEl('confirm')) });
        steps.push({ delay: D.CONFIRM_S, fn: () => {
          const el = UI.getEl('confirm');
          if (pressable(el)) pressFx(el); else { UI.cancelGhost(); blacklist.set('place', wall + CONFIG.Demo.BLACKLIST_S); }
          unlight();
        } });
        stage('place', steps);
        return;
      }
    }

    // 3.5 relocate a camera the crews have learned around — the §13
    // counterplay, played through the real menu → RELOCATE → tap → CONFIRM
    if (ok('relocate') && state.cameras.length >= 5 && state.budget > CONFIG.Cameras.POST.COST) {
      const cutoff = state.time - 32;
      const idle = state.cameras.find(c => c.type !== 'RELAY' &&
        state.time - c.builtAt > 32 &&
        !state.reads.some(r => r.camId === c.id && r.t > cutoff));
      if (idle) {
        const spot = pickSite();
        if (spot && spot.node !== idle.node) {
          stage('relocate', [
            { delay: 0.2, fn: () => { if (Renderer.userIdleSeconds() > 6) Renderer.centerOn(idle.node); } },
            { delay: 0.5, fn: () => {
              const s = Renderer.nodeScreen(idle.node);
              UI.openMenu(idle.node, s.x, s.y);
            } },
            { delay: D.HIGHLIGHT_S, fn: () => lit(UI.getEl('relocate')) },
            { delay: D.PRESS_S + 0.3, fn: () => {
              const el = UI.getEl('relocate');
              if (pressable(el)) pressFx(el); else { UI.closeMenu(); blacklist.set('relocate', wall + CONFIG.Demo.BLACKLIST_S); }
              unlight();
            } },
            { delay: 0.5, fn: () => {           // tap the new pole
              const s = Renderer.nodeScreen(spot.node);
              UI.simulateTapAt(s.x, s.y);
            } },
            ...Array.from({ length: spot.dir }, () => (
              { delay: 0.3, fn: () => { const el = UI.getEl('turn-cw'); if (el) { lit(el); pressFx(el); } } }
            )),
            { delay: D.CONFIRM_S + 0.3, fn: () => lit(UI.getEl('confirm')) },
            { delay: D.CONFIRM_S, fn: () => {
              const el = UI.getEl('confirm');
              if (pressable(el)) pressFx(el); else UI.cancelGhost();
              unlight();
            } }
          ]);
          return;
        }
      }
    }

    // 4. clean a fouled lens through the works column
    const dirty = state.cameras.find(c => c.tags > 0);
    if (dirty && state.budget > CONFIG.Upgrades.CLEAN + 10 && ok('clean')) {
      stage('clean', [
        { delay: 0.2, fn: () => { if (Renderer.userIdleSeconds() > 6) Renderer.centerOn(dirty.node); } },
        { delay: 0.5, fn: () => { const s = Renderer.nodeScreen(dirty.node); UI.openMenu(dirty.node, s.x, s.y); } },
        { delay: D.HIGHLIGHT_S, fn: () => lit(UI.getEl('clean')) },
        { delay: D.PRESS_S + 0.3, fn: () => {
          const el = UI.getEl('clean');
          if (pressable(el)) pressFx(el); else { UI.closeMenu(); blacklist.set('clean', wall + CONFIG.Demo.BLACKLIST_S); }
          unlight();
        } }
      ]);
      return;
    }
  }

  // best aimed pole within `hops` of an anchor node (the stakeout move)
  function pickSiteNear(anchor, hops) {
    let best = null, bestScore = -Infinity;
    for (const n of state.map.nodes) {
      if (n.exit || !state.map.adj[n.id].length) continue;
      if (CameraSystem.camAt(state, n.id)) continue;
      if (CaseSystem.nodeDist(state, n.id, anchor) > hops) continue;
      for (let dir = 0; dir < 4; dir++) {
        const q = Sightlines.quoteQuality(state, n.id, 'POST', dir);
        if (!q) continue;
        const score = q.count / 8 + q.best / 100;
        if (score > bestScore) { bestScore = score; best = { node: n.id, dir }; }
      }
    }
    return best;
  }

  function pickSite() {
    let best = null, bestScore = -Infinity;
    for (const n of state.map.nodes) {
      if (n.exit || !state.map.adj[n.id].length) continue;
      if (CameraSystem.camAt(state, n.id)) continue;
      // crimes land at the zones AND the landmarks AND the syndicate block
      const sources = state.map.spawnZones.concat(
        state.map.poi ? [state.map.poi.BANK, state.map.poi.OFFICE, state.map.poi.GROCERY] : [],
        [state.map.syndicate]);
      let minSpawn = Infinity;
      for (const z of sources) minSpawn = Math.min(minSpawn, CaseSystem.nodeDist(state, n.id, z));
      let nearCam = Infinity;
      for (const cam of state.cameras) {
        if (cam.type === 'RELAY') continue;
        nearCam = Math.min(nearCam, CaseSystem.nodeDist(state, n.id, cam.node));
      }
      const pair = nearCam === Infinity ? 0 : 1 / (1 + Math.abs(nearCam - 2));
      for (let dir = 0; dir < 4; dir++) {
        const q = Sightlines.quoteQuality(state, n.id, 'POST', dir);
        if (!q) continue;
        const S = CONFIG.Demo.STRATEGY;
        const score = S.W_COVERAGE * q.count / 8 + S.W_QUALITY * q.best / 100 +
          S.W_SPAWN / (1 + minSpawn) + S.W_PAIR * pair;
        if (score > bestScore) { bestScore = score; best = { node: n.id, dir }; }
      }
    }
    return best;
  }

  function tick(dt) {
    if (!running || !state || state.verdict) return;
    wall += dt;

    // execute due steps
    while (queue.length && queue[0].at <= wall) {
      const s = queue.shift();
      try { s.fn(); } catch (e) { /* a vanished element is never fatal */ }
    }

    if (!queue.length && wall >= nextPlanAt) {
      nextPlanAt = wall + CONFIG.Demo.PLAN_INTERVAL;
      // refused-action watchdog: if the last action changed nothing, bench it
      const cs = checksum();
      if (lastActionKey && wall - lastActionAt < CONFIG.Demo.PLAN_INTERVAL * 2 && cs === lastChecksum) {
        blacklist.set(lastActionKey, wall + CONFIG.Demo.BLACKLIST_S);
      }
      lastChecksum = cs;
      plan();
    }
  }

  return { start, stop, tick, isRunning: () => running };
})();
