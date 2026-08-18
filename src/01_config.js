// ============================================================
// CONFIG — every tunable in the game, frozen, with provenance.
// Provenance tags: spec-authored (from the master spec),
// swept (test/opt_*.js found signal), judgment-tuned (trial
// player cannot exercise it honestly), player-directed,
// census-tuned (the 8-seed outcome census priced it).
// No numeric literal appears in system logic.
// ============================================================

var CONFIG = Object.freeze({

  Grid: {
    W: 9, H: 16,                    // spec-authored: portrait lattice; one knob, everything derives from area
    SEGMENT_SECONDS: 1.6,           // player-directed: 1.0 made vehicles blur past cameras; reads need a readable beat
    ARTERIAL_SPEED_MULT: 1.6        // spec-authored
  },

  Confidence: {
    BASE: 92,                       // spec-authored
    PER_SEGMENT_FALLOFF: 14,        // spec-authored: distance is the main siting cost
    OBLIQUE_PENALTY: 18,            // spec-authored: head-on reads best
    ARTERIAL_PENALTY: 12,           // spec-authored: fast traffic reads worse
    RAIN_PENALTY: 20,               // spec-authored: forces the threshold to move at shift 6
    DEGRADE_PER_TAG: 15,            // spec-authored
    DEGRADE_FLOOR: 25,              // spec-authored: a degraded camera never goes silent — it lies
    CLARITY: 75                     // judgment-tuned: reads below this are ambiguous and can misattach to an open case (§7.1's trap)
  },

  Threshold: {
    START: 70,                      // spec-authored; sweep planned (test/opt_threshold.js)
    MIN: 0, MAX: 100,               // spec-authored
    BANDS: [[0, 'LAX'], [35, 'EASY'], [55, 'FAIR'], [70, 'STRICT'], [85, 'SEVERE']] // spec-authored
  },

  Cases: {
    READS_TO_CLOSE: 3,              // spec-authored; sweep planned (test/opt_lifetime.js)
    CLOSURE_CONFIDENCE_SUM: 210,    // spec-authored: three serviceable reads or two clean ones plus a poor one
    LIFETIME_SECONDS: 75,           // spec-authored; sweep planned (test/opt_lifetime.js)
    CONTESTED_BAND: 12,             // judgment-tuned: width of the near-bar band that surfaces a card
    CONTESTED_PER_SHIFT_MIN: 2,     // spec-authored: enough to matter
    CONTESTED_PER_SHIFT_MAX: 4,     // spec-authored: few enough to stay a judgement call
    STARVATION_GRACE: 12.0,         // spec-authored (§10.4): expiring evidence glows this early
    COHERENCE_SLACK_SEGS: 1.5,      // judgment-tuned: grace segments in the one-vehicle route check — tighter falsely contradicts same-pole reads
    FALSE_MAJORITY: 2               // judgment-tuned: closing triple with >= this many false reads charges the wrong plate ("two of three were someone else" is legible)
  },

  Retention: {
    UPLOAD_INTERVAL: 20.0,          // spec-authored: the vandal-erases-evidence window (§10.1)
    WINDOW_SECONDS: 90.0,           // spec-authored; sweep planned (test/opt_threshold.js)
    STORAGE_UPGRADE_BONUS: 60.0,    // spec-authored: more memory vs more eyes
    RELAY_CONTINUOUS: true          // spec-authored: the mechanical reason relays exist
  },

  Cameras: {
    POST:  { COST: 40, RANGE: 2, DIRECTIONS: 4, CONF_MOD: 0 },    // spec-authored: the workhorse
    LONG:  { COST: 60, RANGE: 5, DIRECTIONS: 1, CONF_MOD: 10 },   // spec-authored: aimed at placement, forever
    DOME:  { COST: 55, RANGE: 1, DIRECTIONS: 4, CONF_MOD: -8 },   // spec-authored: many angles, poor reads
    RELAY: { COST: 35, RANGE: 0, DIRECTIONS: 0, CONF_MOD: 0 },    // spec-authored: continuous upload for neighbours, nothing else
    RELOCATE_COST_FRACTION: 0.5     // spec-authored: relocation is a routine move, not a last resort
  },

  Upgrades: {
    HARDEN: 25,                     // spec-authored: vandal resistance
    STORAGE: 30,                    // spec-authored: longer retention on this unit
    CLEAN: 10                       // spec-authored: restores degradation; cheap if noticed
  },

  Vandals: {
    SCRAPPER: { DESTROY_SECONDS: 6, ISOLATION_WEIGHT: 1.0 },  // spec-authored
    TAGGER:   { DEGRADE_SECONDS: 3 },                         // spec-authored
    FIXER:    { DESTROY_SECONDS: 4, FIRST_SHIFT: 5 },         // spec-authored: the shift-5 strike
    WALK_SEGMENT_SECONDS: 2.2,      // judgment-tuned: on foot, slower than traffic, fast enough to threaten
    HARDENED_TIME_MULT: 2.5,        // spec-authored
    MAX_SIMULTANEOUS: 3,            // spec-authored (§11.4): livelock guard
    RETARGET_COOLDOWN: 8.0,         // spec-authored (§11.4)
    ABANDON_AFTER: 10.0,            // spec-authored (§11.4): unreachable-target fallback
    CREW_CASE_BOUNTY_MULT: 2.0,     // spec-authored at x1; sweep planned (test/opt_bounty.js) — expect x2 to rescue collapses
    WITNESS_READ_INTERVAL: 2.0,     // judgment-tuned: a witnessed vandal is read every this-many seconds while acting
    REVEAL_DELAY_LOW_TRUST: 6.0     // judgment-tuned: low trust reports vandalism late (§15.3)
  },

  CrewMemory: {
    FORGET_SECONDS: 100.0,          // spec-authored: crews forget; a well-played match must keep having crime on it
    AVOID_WEIGHT: 3.0,              // spec-authored: route weight multiplier on segments a KNOWN camera watches
    MAX_AVOIDED_FRACTION: 0.6,      // spec-authored: no crew may route around more than this much of the network
    RELEARN_COOLDOWN: 12.0          // spec-authored (§13.3): re-weight at most once per this
  },

  Traffic: {
    AMBIENT_PER_30_NODES: 2.5,      // judgment-tuned: ambient vehicles scale with map area; ~12 concurrent on the 9x16
    AMBIENT_MAX: 14,                // judgment-tuned: legibility cap — more than this reads as static
    SPAWN_INTERVAL: 2.5             // judgment-tuned: ambient respawn cadence
  },

  Economy: {
    START_BUDGET: 120,              // spec-authored; sweep planned (test/opt_start.js)
    PAYOUT_PETTY: 25, PAYOUT_MAJOR: 60, PAYOUT_SYNDICATE: 90, // spec-authored, scaled by severity
    CLEARANCE_START: 70,            // spec-authored
    CLEARANCE_FLOOR: 35,            // spec-authored: fall below and you are relieved
    CLEARANCE_PRIOR: 10,            // judgment-tuned: pseudo-count seeding the rolling percentage so one early cold case is not lethal
    TRUST_START: 80,                // spec-authored; sweep planned (test/opt_start.js)
    TRUST_FLOOR: 20,                // spec-authored: too many wrong people stopped and you are relieved
    TRUST_LOSS_FALSE_CHARGE: 12,    // spec-authored
    TRUST_GAIN_CORRECT_RELEASE: 3,  // spec-authored
    TRUST_GAIN_CLEAN_SHIFT: 1,      // judgment-tuned: slow recovery on clean shifts (§15.3 "rises slowly")
    HIGH_TRUST_AT: 65,              // judgment-tuned: citizen tips arrive above this (§15.3)
    LOW_TRUST_AT: 45,               // spec-authored
    LOW_TRUST_PAYOUT_MULT: 0.7      // spec-authored
  },

  Warrant: {
    REQUIRED: 100,                  // spec-authored
    PER_CASE: 22,                   // spec-authored: five syndicate closures outrun the leak, four do not
    DECAY_PER_SECOND: 0.15          // spec-authored: progress must outpace the leak
  },

  Shifts: {
    FIRST_AT: 45.0, TELEGRAPH: 6.0, // spec-authored
    INTERVAL_EARLY: 55.0, INTERVAL_MID: 45.0, INTERVAL_LATE: 35.0, // spec-authored: compressing the interval is free difficulty
    COUNT: 9,                       // spec-authored
    OVERTIME_INTERVAL: 30.0,        // spec-authored; census planned (test/test_census.js)
    OVERTIME_STEP: 0.15,            // spec-authored; census planned — the previous prototype's gentle first try was shrugged off by turtles
    OVERTIME_CAP: 1.8,              // spec-authored; census planned
    REVIEW_AFTER: 5,                // spec-authored: overtime shifts before the Review convenes
    REVIEW_WEIGHTS: { WARRANT: 3, CLEARANCE: 2, TRUST: 2, NETWORK: 1, TREASURY: 1 }, // spec-authored: same composite the ladder tally uses
    REVIEW_PASS: 55,                // judgment-tuned; census planned: the weighed score the Review must reach to rule FOR the analyst; it can and must be able to rule against
    RAIN_DURATION: 25.0,            // judgment-tuned: long enough to force a dial move, short enough to recover
    RAIN_RECUR_EVERY: 3             // judgment-tuned: rain recurs every third shift after 6
  },

  // Authored per-shift composition (§14). Counts are per shift; vandal
  // budget is how many vandals the shift may spawn in total.
  ShiftTable: [                     // spec-authored, index = shift-1
    { petty: 2, major: 0, synd: 0, vandalBudget: 0, scrapper: 0, tagger: 0, fixer: 0 }, // 1: reads, cases, closure
    { petty: 3, major: 0, synd: 0, vandalBudget: 0, scrapper: 0, tagger: 0, fixer: 0 }, // 2: one camera is not enough
    { petty: 2, major: 1, synd: 0, vandalBudget: 1, scrapper: 1, tagger: 0, fixer: 0 }, // 3: first scrapper
    { petty: 2, major: 1, synd: 1, vandalBudget: 1, scrapper: 0, tagger: 1, fixer: 0 }, // 4: first contested case; syndicate case for shift 5
    { petty: 2, major: 1, synd: 1, vandalBudget: 1, scrapper: 0, tagger: 0, fixer: 1 }, // 5: THE FIXER STRIKE (scripted, §14.4)
    { petty: 2, major: 2, synd: 1, vandalBudget: 2, scrapper: 1, tagger: 1, fixer: 0 }, // 6: rain
    { petty: 3, major: 2, synd: 1, vandalBudget: 2, scrapper: 1, tagger: 1, fixer: 0 }, // 7: crews visibly reroute
    { petty: 4, major: 2, synd: 2, vandalBudget: 3, scrapper: 1, tagger: 1, fixer: 1 }, // 8: surge
    { petty: 3, major: 3, synd: 3, vandalBudget: 3, scrapper: 1, tagger: 1, fixer: 1 }  // 9: the syndicate's largest job
  ],

  Ladder: {                         // §13.4 — four tiers; overrides graded by evolution (test/evolve_opposition.js)
    TIERS: [
      { name: 'QUIET',    crimeMult: 0.7, vandalMult: 0.6, learnMult: 0.6, contestedMult: 0.8 }, // hand-authored; evolution grading planned
      { name: 'RESTLESS', crimeMult: 1.0, vandalMult: 1.0, learnMult: 1.0, contestedMult: 1.0 }, // the authored baseline
      { name: 'BRAZEN',   crimeMult: 1.25, vandalMult: 1.4, learnMult: 1.5, contestedMult: 1.2 }, // hand-authored; evolution grading planned
      { name: 'LAWLESS',  crimeMult: 1.5, vandalMult: 1.8, learnMult: 2.2, contestedMult: 1.4 }  // hand-authored; evolution grading planned
    ],
    START_TIER: 1,                  // spec-authored: open at RESTLESS
    DDA_FROM_SHIFT: 2,              // spec-authored
    DDA_UP: 0.62, DDA_DOWN: 0.38,   // spec-authored: standing bands; step one rung, silently, real matches only
    MEMORY_EMA_ALPHA: 0.4,          // spec-authored
    MEMORY_PEAK_DECAY: 0.92         // spec-authored
  },

  Save: { KEY: 'blindspot-resume', SKILL_KEY: 'blindspot-skill', SEEN_KEY: 'blindspot-seen' }, // spec-authored

  MapGen: {
    GOLDEN_SEED: 'bs1',             // spec-authored: the baked fallback a judge can never see fail
    MAX_REROLLS: 50,                // spec-authored
    ARTERIAL_FRACTION_MIN: 0.25, ARTERIAL_FRACTION_MAX: 0.40, // spec-authored
    MIN_ROUTES_TO_EXIT: 3,          // spec-authored: coverage cannot trivially bottleneck
    MIN_ESCAPE_SEGMENTS: 5,         // spec-authored: every escape observable somewhere
    MIN_STRAIGHT_RUN: 5,            // spec-authored: the Long needs a legal home
    SYNDICATE_DISTANCE_MIN: 8, SYNDICATE_DISTANCE_MAX: 12, // spec-authored
    REMOVE_FRACTION: 0.18,          // judgment-tuned: fraction of lattice segments removed to make blocks tellable apart
    EXITS: 4,                       // spec-authored
    SPAWN_ZONES: 5,                 // judgment-tuned: derived feel — one per ~29 nodes
    MAX_DEAD_END: 2,                // spec-authored
    MIN_WATCHER_POLES: 2,           // spec-authored (§19.2.7): poles that can see 3 other poles, so cameras-watching-cameras is discoverable
    WATCHER_SEES: 3                 // spec-authored
  },

  Tutorial: {
    RELEASE_AT: 32.0,               // spec-authored
    STEP_TIMEOUTS: [0, 0, 45, 8, 10] // spec-authored (§17): per-step fallback; 0 = no timeout, waits for the real event
  },

  Demo: {                            // §17.3 — staged one-action-at-a-time tempo, validated at THIS rate
    HIGHLIGHT_S: 0.45, PRESS_S: 0.35, CONFIRM_S: 0.35, // spec-authored
    PLAN_INTERVAL: 1.2,             // judgment-tuned: seconds between planning passes
    BLACKLIST_S: 30                 // spec-authored: any action that changes nothing is benched
  },

  Review: {},                       // reserved: Review knobs live under Shifts

  Sim: { DT_CLAMP: 0.1 }            // spec-authored (§21.1): background-tab hiccups cannot create physics spikes
});

// Node/vm export hook — the headless harness reads CONFIG from the sandbox.
if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG };
