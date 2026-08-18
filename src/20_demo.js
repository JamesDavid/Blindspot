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
      const btnKey = (charge ? 'charge-' : 'release-') + contested.id;
      stage('adjudicate', [
        { delay: 0.3, fn: () => { const el = UI.getEl(btnKey); if (el) el.scrollIntoView({ inline: 'center' }); lit(UI.getEl(btnKey)); } },
        { delay: D.HIGHLIGHT_S + 0.4, fn: () => { const el = UI.getEl(btnKey); if (pressable(el)) el.click(); unlight(); } }
      ]);
      return;
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

    // 3. build the network through the real menus
    const wanted = Math.min(9, Math.max(2, Math.ceil(state.shift.num * STRAT.BUILD_PACE) + 1));
    if (state.cameras.length < wanted && state.budget >= CONFIG.Cameras.POST.COST && ok('place')) {
      const site = pickSite();
      if (site !== null) {
        const relayTurn = state.cameras.length >= 4 &&
          !state.cameras.some(c => c.type === 'RELAY') && state.budget >= CONFIG.Cameras.RELAY.COST;
        const buyKey = relayTurn ? 'buy-relay' : 'buy-post';
        stage('place', [
          { delay: 0.2, fn: () => { Renderer.centerOn(site); } },
          { delay: 0.5, fn: () => {
            const s = Renderer.nodeScreen(site);
            UI.openMenu(site, s.x, s.y);
          } },
          { delay: D.HIGHLIGHT_S, fn: () => lit(UI.getEl(buyKey)) },
          { delay: D.PRESS_S + 0.3, fn: () => {
            const el = UI.getEl(buyKey);
            if (pressable(el)) el.click(); else { UI.closeMenu(); blacklist.set('place', wall + CONFIG.Demo.BLACKLIST_S); }
            unlight();
          } },
          { delay: D.CONFIRM_S + 0.35, fn: () => lit(UI.getEl('confirm')) },
          { delay: D.CONFIRM_S, fn: () => {
            const el = UI.getEl('confirm');
            if (pressable(el)) el.click(); else { UI.cancelGhost(); blacklist.set('place', wall + CONFIG.Demo.BLACKLIST_S); }
            unlight();
          } }
        ]);
        return;
      }
    }

    // 4. clean a fouled lens through the works column
    const dirty = state.cameras.find(c => c.tags > 0);
    if (dirty && state.budget > CONFIG.Upgrades.CLEAN + 10 && ok('clean')) {
      stage('clean', [
        { delay: 0.2, fn: () => Renderer.centerOn(dirty.node) },
        { delay: 0.5, fn: () => { const s = Renderer.nodeScreen(dirty.node); UI.openMenu(dirty.node, s.x, s.y); } },
        { delay: D.HIGHLIGHT_S, fn: () => lit(UI.getEl('clean')) },
        { delay: D.PRESS_S + 0.3, fn: () => {
          const el = UI.getEl('clean');
          if (pressable(el)) el.click(); else { UI.closeMenu(); blacklist.set('clean', wall + CONFIG.Demo.BLACKLIST_S); }
          unlight();
        } }
      ]);
      return;
    }
  }

  function pickSite() {
    let best = null, bestScore = -Infinity;
    for (const n of state.map.nodes) {
      if (n.exit || !state.map.adj[n.id].length) continue;
      if (CameraSystem.camAt(state, n.id)) continue;
      let minSpawn = Infinity;
      for (const z of state.map.spawnZones) minSpawn = Math.min(minSpawn, CaseSystem.nodeDist(state, n.id, z));
      const q = Sightlines.quoteQuality(state, n.id, 'POST', 0);
      if (!q) continue;
      const S = CONFIG.Demo.STRATEGY;
      const score = S.W_COVERAGE * q.count / 8 + S.W_QUALITY * q.best / 100 + S.W_SPAWN / (1 + minSpawn);
      if (score > bestScore) { bestScore = score; best = n.id; }
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
