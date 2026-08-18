// ============================================================
// STATE — match state factory, deterministic rng streams,
// the event/log plumbing, and the Actions facade that both the
// UI and the headless trial player call. No DOM anywhere here.
// ============================================================

// Actions is the single verb surface: UI buttons and the scripted
// trial player call exactly these, so a swept constant was exercised
// through the same code path a player uses.
var Actions = {};

var State = (() => {

  // Named deterministic rng streams stored as plain data (uint32 per
  // stream) so save/resume serialises them and the sequence continues.
  function rngNext(state, name) {
    let a = state.rngState[name];
    if (a === undefined) a = hashStr(state.seed + '/' + name);
    a = (a + 0x6D2B79F5) >>> 0;
    state.rngState[name] = a;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function log(state, msg, onceKey) {
    if (onceKey) {
      if (state.seenKeys[onceKey]) return;
      state.seenKeys[onceKey] = true;
    }
    state.logLines.push({ t: state.time, msg });
    if (state.logLines.length > 120) state.logLines.shift();
    emit(state, { type: 'log', msg });
  }

  // Events are a cursor-based ring: every consumer (renderer, audio,
  // tests, the demo) tracks its own seq and asks for "events since". They
  // are never cleared mid-pipeline — actions fire between ticks and their
  // events must survive to the next consumer read.
  function emit(state, ev) {
    ev.t = state.time;
    ev.seq = ++state.eventSeq;
    state.events.push(ev);
    if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
  }

  function eventsSince(state, seq) {
    const out = [];
    for (const ev of state.events) if (ev.seq > seq) out.push(ev);
    return out;
  }

  function newMatch(seed, opts) {
    opts = opts || {};
    const map = MapGen.generate(seed);
    const E = CONFIG.Economy;
    const state = {
      version: 1,
      seed, map,
      time: 0,
      rngState: {},
      threshold: CONFIG.Threshold.START,
      budget: E.START_BUDGET,
      trust: E.TRUST_START,
      // clearance as a rolling percentage seeded with a prior so one early
      // cold case is not lethal (§15.2)
      clrClosed: E.CLEARANCE_PRIOR * E.CLEARANCE_START / 100,
      clrCold: E.CLEARANCE_PRIOR * (1 - E.CLEARANCE_START / 100),
      warrant: 0,
      cameras: [], nextCamId: 1,
      reads: [], nextReadId: 1,
      cases: [], nextCaseId: 1,
      vehicles: [], nextVehId: 1,
      vandals: [], nextVandalId: 1,
      crews: {},
      shift: {
        num: 0, nextAt: CONFIG.Shifts.FIRST_AT, telegraphed: false,
        overtime: 0, escalation: 1.0, rainUntil: 0,
        reviewRefused: false, reviewPending: false
      },
      ladder: { tier: opts.tier !== undefined ? opts.tier : CONFIG.Ladder.START_TIER },
      dda: !!opts.dda,               // silent skill matching runs in real matches only
      tutorialActive: false,          // main sets true; shifts hold while it runs
      verdict: null,
      contestedThisShift: 0,
      falseChargesThisShift: 0,
      warn: { clearance: -1, trust: -1 }, // shift number when the floor warning fired
      events: [], eventSeq: 0,
      logLines: [],
      seenKeys: opts.seenKeys || {},
      covSegs: null, covNodes: null,  // rebuilt by Sightlines.rebuildCoverage
      stats: {
        built: 0, destroyed: 0, reads: 0, qualifying: 0, falseAttached: 0,
        closures: 0, falseCharges: 0, colds: 0, contestedShown: 0,
        contestedResolved: 0, autoReleased: 0, crimes: 0, vandalsSpawned: 0,
        vandalActs: 0, vandalAbandons: 0, dataLostReads: 0, reroutes: 0,
        witnessCases: 0, bounties: 0, tips: 0, uploads: 0
      }
    };

    // Standing crews: two petty, one major, one syndicate. Vandal crews
    // are created per shift as they spawn. Crews learn *only* from being
    // sighted (§20.3); known maps camId → last-sighted sim-time.
    addCrew(state, 'petty-a', 'PETTY');
    addCrew(state, 'petty-b', 'PETTY');
    addCrew(state, 'major-a', 'MAJOR');
    addCrew(state, 'syndicate', 'SYNDICATE');

    Sightlines.rebuildCoverage(state);
    return state;
  }

  function addCrew(state, id, kind) {
    // each crew runs its own tuning, sampled deterministically (player-
    // directed individuality): traits a log line could name, not a policy
    const M = CONFIG.CrewMemory;
    const draw = (band) => band[0] + rngNext(state, 'crewtraits') * (band[1] - band[0]);
    const traits = {
      learn: draw(M.TRAIT_LEARN) + (kind === 'SYNDICATE' ? M.SYNDICATE_PRO : 0),
      avoid: draw(M.TRAIT_AVOID),
      bold: draw(M.TRAIT_BOLD)
    };
    state.crews[id] = {
      id, kind, traits,
      known: {},            // camId -> time last sighted
      activeKnown: [],      // snapshot used for routing (rate-limited, §13.3)
      lastRelearn: -Infinity,
      plate: null,          // syndicate keeps a persistent plate for case continuity
      damage: 0,            // vandal crews: value destroyed, prices the bounty
      caught: false,
      rerouteAnnounced: false
    };
    return state.crews[id];
  }

  // Clearance as a percentage for HUD/verdicts.
  function clearance(state) {
    const total = state.clrClosed + state.clrCold;
    return total <= 0 ? CONFIG.Economy.CLEARANCE_START : 100 * state.clrClosed / total;
  }

  function thresholdBand(state) {
    return bandLabel(CONFIG.Threshold.BANDS, state.threshold);
  }

  return { newMatch, addCrew, rngNext, log, emit, eventsSince, clearance, thresholdBand };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { State, Actions };
