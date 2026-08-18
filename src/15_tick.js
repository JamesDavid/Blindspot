// ============================================================
// TICK — the sim orchestrator. All timing lives in sim-time
// with a clamped dt (§21.1); the same function drives the live
// frame loop, the headless battery, the sweeps and the GA.
// ============================================================

var Sim = (() => {

  function tick(state, rawDt) {
    const dt = Math.min(CONFIG.Sim.DT_CLAMP, rawDt);
    if (state.verdict) return;      // verdict screens freeze the city
    state.events.length = 0;
    state.time += dt;

    ShiftSystem.tick(state, dt);
    if (state.verdict) return;
    Traffic.tick(state, dt);
    CameraSystem.tick(state, dt);
    VandalSystem.tick(state, dt);
    CaseSystem.tick(state, dt);

    // the warrant leaks (§16): progress must outpace the decay
    if (state.warrant > 0 && state.warrant < CONFIG.Warrant.REQUIRED) {
      state.warrant = Math.max(0, state.warrant - CONFIG.Warrant.DECAY_PER_SECOND * dt);
    }
    if (state.warrant >= CONFIG.Warrant.REQUIRED) {
      state.verdict = {
        result: 'WIN', reason: 'WARRANT',
        score: Math.round(Economy.reviewScore(state)),
        scales: Economy.reviewComponents(state),
        refusable: false
      };
      State.emit(state, { type: 'verdict', verdict: state.verdict });
      State.log(state, 'Warrant served. The raid goes in at dawn.', null);
    }
  }

  // Headless driver: runs at a fixed step, calling controller(state, t)
  // between ticks (the trial player and tests hook here). Stops on
  // verdict or when seconds elapse.
  function run(state, seconds, controller, step) {
    const dt = step || CONFIG.Sim.DT_CLAMP;
    const end = state.time + seconds;
    while (state.time < end && !state.verdict) {
      if (controller) controller(state);
      tick(state, dt);
    }
    return state;
  }

  return { tick, run };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Sim };
