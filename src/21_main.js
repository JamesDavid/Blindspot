// ============================================================
// MAIN — boot, title, the clamped frame loop (§21.1), save on
// focus loss (§17.2), the ladder's cross-session memory, and
// the once-ever teaching lines.
// ============================================================

(function () {
  'use strict';

  let state = null, mode = 'title';   // 'title' | 'play' | 'demo'
  let lastFrame = 0, mainSeq = 0;
  window.__warp = 1;                  // rAF-warp for film capture (§21.1)

  // ---------- persistence helpers (UI layer owns localStorage) ----------

  function loadJson(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function saveJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function loadSeen() { return loadJson(CONFIG.Save.SEEN_KEY) || {}; }
  function persistSeen() {
    if (!state || mode === 'demo') return;
    saveJson(CONFIG.Save.SEEN_KEY, state.seenKeys);
  }

  // ---------- match lifecycle ----------

  function newMatch(seed, opts) {
    opts = opts || {};
    const seen = opts.demo ? {} : loadSeen();
    const mem = opts.demo ? null : loadJson(CONFIG.Save.SKILL_KEY);
    const s = State.newMatch(seed || randomSeedString(), {
      dda: !opts.demo,
      seenKeys: seen,
      tier: opts.demo ? CONFIG.Ladder.START_TIER : LadderSystem.openingTier(mem)
    });
    return s;
  }

  function startPlay(seed) {
    state = newMatch(seed);
    mode = 'play';
    mainSeq = state.eventSeq;
    Renderer.setMatch(state);
    UI.setMatch(state);
    try { localStorage.removeItem(CONFIG.Save.KEY); } catch (e) {}
    if (!state.seenKeys['tutorial-done']) {
      Tutorial.start(state, () => {
        state.seenKeys['tutorial-done'] = true;
        persistSeen();
      });
    }
  }

  function startDemo() {
    state = newMatch('demo-' + randomSeedString(), { demo: true });
    mode = 'demo';
    mainSeq = state.eventSeq;
    Renderer.setMatch(state);
    UI.setMatch(state);
    UI.identity('WATCH A SHIFT — tap anywhere to take the desk back.');
    Demo.start(state);
  }

  function backToTitle() {
    if (Demo.isRunning()) Demo.stop();
    Tutorial.finish();
    mode = 'title';
    showTitle();
  }

  function onMatchEnd() {
    // ladder memory: EMA + decaying peak of end standing (§13.4);
    // demo matches never touch it
    if (mode === 'play' && state) {
      const standing = Economy.reviewScore(state) / 100;
      const mem = LadderSystem.updateMemory(loadJson(CONFIG.Save.SKILL_KEY), standing);
      saveJson(CONFIG.Save.SKILL_KEY, mem);
      try { localStorage.removeItem(CONFIG.Save.KEY); } catch (e) {}  // a decided match clears its save
      persistSeen();
    }
  }

  function showTitle() {
    const saved = loadJson(CONFIG.Save.KEY);
    UI.showTitle({
      resume: saved ? { shift: saved.shift.num, seed: saved.seed } : null,
      onResume: () => {
        try {
          state = SaveSystem.restore(saved);
          mode = 'play';
          mainSeq = state.eventSeq;
          Renderer.setMatch(state);
          UI.setMatch(state);
          UI.identity('Back on the desk. Shift ' + state.shift.num + '.');
        } catch (e) {
          try { localStorage.removeItem(CONFIG.Save.KEY); } catch (_) {}
          startPlay(null);
        }
      },
      onStart: (seed) => startPlay(seed),
      onDemo: () => startDemo()
    });
  }

  // ---------- save on focus loss (§17.2) ----------

  function snapshotNow() {
    if (mode !== 'play' || !state || state.verdict) return;
    try { localStorage.setItem(CONFIG.Save.KEY, SaveSystem.serialize(state)); } catch (e) {}
    persistSeen();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') snapshotNow();
  });
  window.addEventListener('pagehide', snapshotNow);

  // ---------- frame loop ----------

  function frame(now) {
    requestAnimationFrame(frame);
    if (!lastFrame) { lastFrame = now; return; }
    let dtMs = (now - lastFrame) * window.__warp;
    lastFrame = now;

    if (state && (mode === 'play' || mode === 'demo')) {
      // the dt clamp (§21.1): background-tab hiccups cannot spike physics
      const dt = Math.min(CONFIG.Sim.DT_CLAMP, dtMs / 1000);
      const hadVerdict = !!state.verdict;
      Sim.tick(state, dt);

      const evs = State.eventsSince(state, mainSeq);
      if (evs.length) mainSeq = evs[evs.length - 1].seq;

      UI.update();
      Renderer.update(state, dtMs, evs);
      GameAudio.onEvents(evs);
      if (Tutorial.isActive()) Tutorial.tick();
      if (mode === 'demo') Demo.tick(dt);

      if (!hadVerdict && state.verdict) {
        if (mode === 'demo') {
          // the demo resets itself and keeps teaching
          setTimeout(() => { if (mode === 'demo') startDemo(); }, 5200);
        } else {
          onMatchEnd();
        }
      }
    } else if (state) {
      Renderer.update(state, dtMs, []);
    }
  }

  // ---------- boot ----------

  function boot() {
    Renderer.init(document.getElementById('game-canvas'));
    UI.init(document.getElementById('ui-root'), {
      onAgain: () => startPlay(null),
      onBackToMenu: () => backToTitle(),
      onDialTouched: () => Tutorial.noteDialTouched(),
      onTapWhileDemo: () => {
        if (mode === 'demo') { backToTitle(); return true; }
        return false;
      }
    });
    // a background city gives the title depth: a quiet demo state, unticked
    state = newMatch('title', { demo: true });
    Renderer.setMatch(state);
    UI.setMatch(state);
    showTitle();
    requestAnimationFrame(frame);
    // debug/test hooks: readable code is a submission requirement, and the
    // input tests drive the game through these
    window.__game = { get state() { return state; }, get mode() { return mode; }, startPlay, startDemo, backToTitle };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
