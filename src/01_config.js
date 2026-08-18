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
    SEGMENT_SECONDS: 1.25,          // player-directed: "slow and boring to watch" — quickened twice from 1.6; reads still land legibly
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
    PER_VEHICLE_COOLDOWN: 6.0,      // player-directed: one read per camera per pass — a pole cannot triple-read the same car in seconds
    CLARITY: 75,                    // judgment-tuned: reads below this are ambiguous and can misattach to an open case (§7.1's trap)
    MISREAD_BASE: 0.75,             // swept (A/B in opt_threshold work): at 0.5 a LAX bar won cleanly (trap toothless); 0.75 gives the intended ridge — 45 punished, 55 best, 65 starved
    MISREAD_MAX_DIST: 3             // judgment-tuned: ambiguous sightings only misattach near the crime scene — believable lies, not cross-town ones
  },

  Threshold: {
    START: 60,                      // swept (test/opt_threshold.js): player-bar ridge at 55-60; spec's 70 opens in a band that starves shifts 1-3
    MIN: 0, MAX: 100,               // spec-authored
    BANDS: [[0, 'LAX'], [35, 'EASY'], [55, 'FAIR'], [70, 'STRICT'], [85, 'SEVERE']] // spec-authored
  },

  Cases: {
    READS_TO_CLOSE: 3,              // swept (test/opt_lifetime.js): 2 scores lower everywhere, 4 dips at mid lifetimes; 3 is the ridge
    MIN_TRACK_CAMS: 2,              // player-directed: corroboration means TRACKING — the closing triple must span distinct cameras across the city (vandal cases exempt: a witnessed pole is one scene, not a chase)
    ANCHOR_DIST: 6,                 // player-directed: the chain starts AT the scene — the earliest closing read must come from a camera within this many blocks of the crime; the last read is where they're taken down
    SECOND_RUN_AT: 0.4,             // fraction of the lifetime after which the suspect is seen driving again — without a second pass, one crime could never produce a multi-camera track
    ENGAGED_AT: 2,                  // player-directed-era rebalance: clearance judges files the network actually worked (≥ this many reads, or a surfaced card); a file with no real lead lapses quietly — the city is bigger than the network
    UNIDENTIFIED_CHANCE: 0.3,       // player-directed: some witnesses catch no plate — "brown SUV with damage robbed the bank!" — and the file opens on the description alone (0.35 collapsed the census win rate)
    IDENTIFY_EXTEND: 0.6,           // tying the file renews it by this fraction of a lifetime — the investigation properly starts at the lineup, not the crime
    CANDIDATE_DIST: 5,              // player-directed: clearly-photographed cars matching the description within this many blocks of the scene become candidates
    CANDIDATE_MAX: 4,               // player-directed: at most this many distinct candidate plates per file — a lineup, not a phonebook
    CLOSURE_CONFIDENCE_SUM: 210,    // spec-authored; re-swept post-scene-ID: lowering it only bred wrongful convictions — the scene ID is the accessible path, the chain is the strong one
    SCENE_ID_DIST: 2,               // player-directed ("just one near the scene at the time of the crime"): a CLEAN frame this close to the scene…
    SCENE_ID_WINDOW: 14,            // …within this many seconds of the crime, of a car matching the witness, closes the case by itself — made at the scene
    DMV_CHECK_CONF: 55,             // player-directed: frames at least this clear get run against the registry — mismatched plate-vs-car exposes swapped plates and bad reads, and the registry completes partial plates. Murkier frames can't be checked; the lie survives at the low end.
    LIFETIME_SECONDS: 90,           // re-swept (test/opt_lifetime.js) after quadrant cameras: 90x3 (51.0) now clearly beats 75x3 (41.2) — narrower sectors need longer files; the optimum moved with the mechanics again
    CONTESTED_BAND: 12,             // judgment-tuned: width of the near-bar band that surfaces a card
    CONTESTED_PER_SHIFT_MIN: 2,     // spec-authored: enough to matter
    CONTESTED_PER_SHIFT_MAX: 4,     // spec-authored: few enough to stay a judgement call
    CONVICTION_DELAY: 8.0,          // player-directed pipeline: corroborate -> ARREST -> trial; evidence must survive to conviction, so retention presses past the arrest
    STARVATION_GRACE: 12.0,         // spec-authored (§10.4): expiring evidence glows this early
    COHERENCE_SLACK_SEGS: 1.5,      // judgment-tuned: grace segments in the one-vehicle route check — tighter falsely contradicts same-pole reads
    FALSE_MAJORITY: 2               // judgment-tuned: closing triple with >= this many false reads charges the wrong plate ("two of three were someone else" is legible)
  },

  Retention: {
    UPLOAD_INTERVAL: 20.0,          // spec-authored: the vandal-erases-evidence window (§10.1)
    WINDOW_SECONDS: 90.0,           // swept (test/opt_threshold.js): flat 60-120 within noise at every bar; keep spec value
    STORAGE_UPGRADE_BONUS: 60.0,    // spec-authored: more memory vs more eyes
    RELAY_CONTINUOUS: true          // spec-authored: the mechanical reason relays exist
  },

  Cameras: {
    POST:  { COST: 30, RANGE: 2, DIRECTIONS: 2, CONF_MOD: 0 },    // player-directed: quadrant-aimed at placement (two adjacent rays), fixed-sector doctrine; buildings occlude — vision runs along street corridors only. Cost re-priced 40→30 for the halved sector (sweep below)
    LONG:  { COST: 60, RANGE: 5, DIRECTIONS: 1, CONF_MOD: 10 },   // spec-authored: aimed at placement, forever
    DOME:  { COST: 55, RANGE: 1, DIRECTIONS: 4, CONF_MOD: -8 },   // spec-authored: many angles, poor reads
    RELAY: { COST: 35, RANGE: 0, DIRECTIONS: 0, CONF_MOD: 0 },    // spec-authored: continuous upload for neighbours, nothing else
    OFFICER: { COST: 55, RANGE: 1, DIRECTIONS: 4, CONF_MOD: 6, TOUR_SECONDS: 45 }, // player-directed: post an officer instead of a camera — pricier per minute of coverage, one corner only, eyewitness reads file instantly (no drive to lose), vandals leave the uniform alone, and the tour ENDS. Camera-free play is possible; it just costs like overtime pay.
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
    CREW_CASE_BOUNTY_MULT: 2.0,     // swept (test/opt_bounty.js) 0-3: flat within noise on healthy AND collapsing cohorts (collapse here is clearance-driven, not cash-driven); keep x2
    WITNESS_READ_INTERVAL: 2.0,     // judgment-tuned: a witnessed vandal is read every this-many seconds while acting
    REVEAL_DELAY_LOW_TRUST: 6.0     // judgment-tuned: low trust reports vandalism late (§15.3)
  },

  CrewMemory: {
    FORGET_SECONDS: 100.0,          // spec-authored: crews forget; a well-played match must keep having crime on it
    AVOID_WEIGHT: 3.0,              // spec-authored: route weight multiplier on segments a KNOWN camera watches
    MAX_AVOIDED_FRACTION: 0.6,      // spec-authored: no crew may route around more than this much of the network
    RELEARN_COOLDOWN: 12.0,         // spec-authored (§13.3): re-weight at most once per this
    // Per-crew individuality (player-directed): every crew samples its own
    // tuning from these bands — one learns fast, one is careless, one is
    // stubborn about its routes. Deterministic per seed; the syndicate
    // skews professional. A runtime GA per criminal was considered and
    // rejected (§30's legibility rule): a trait a log line can name beats
    // a policy nobody can read.
    TRAIT_LEARN: [0.7, 1.5],        // multiplies learning/forgetting speed
    TRAIT_AVOID: [0.7, 1.4],        // multiplies route-avoidance weight
    TRAIT_BOLD: [0.8, 1.3],         // divides memory span — bold crews forget your cameras sooner
    SYNDICATE_PRO: 0.25             // added to the syndicate crew's learn trait: professionals case the block
  },

  Traffic: {
    AMBIENT_PER_30_NODES: 3.4,      // player-directed: raised for street life after "lacking action"
    AMBIENT_MAX: 18,                // player-directed with the density raise; still short of reading as static
    SPAWN_INTERVAL: 1.1,            // player-directed: streets refill fast
    PREFILL: true                   // player-directed: full ambient population from the first frame, no slow trickle-in
  },

  Economy: {
    START_BUDGET: 200,              // player-directed ("way too low" at 120), then CONFIRMED by re-sweep: after the pacing raise the grid inverted — richer starts now score higher (the denser city needs eyes sooner). The optimum moved with the mechanics, as it always does.
    PAYOUT_PETTY: 38, PAYOUT_MAJOR: 90, PAYOUT_SYNDICATE: 135, // re-priced x1.5 for the tracking era (probe): a conviction now takes a multi-camera chain, so it pays like one
    CLEARANCE_START: 70,            // spec-authored
    CLEARANCE_FLOOR: 35,            // spec-authored: fall below and you are relieved
    CLEARANCE_PRIOR: 10,            // judgment-tuned: pseudo-count seeding the rolling percentage so one early cold case is not lethal
    TRUST_START: 80,                // swept (test/opt_start.js): 70-90 within noise at budget 120; keep spec value
    TRUST_FLOOR: 20,                // spec-authored: too many wrong people stopped and you are relieved
    TRUST_LOSS_FALSE_CHARGE: 12,    // spec-authored
    TRUST_GAIN_CORRECT_RELEASE: 3,  // spec-authored
    TRUST_GAIN_CLEAN_SHIFT: 1,      // judgment-tuned: slow recovery on clean shifts (§15.3 "rises slowly")
    HIGH_TRUST_AT: 65,              // judgment-tuned: citizen tips arrive above this (§15.3)
    LOW_TRUST_AT: 45,               // spec-authored
    LOW_TRUST_PAYOUT_MULT: 0.7,     // spec-authored
    COLLAPSE_PAYOUT_MULT: 0.5       // player-directed pipeline: a case that collapses in court still pays the arrest half
  },

  Warrant: {
    REQUIRED: 100,                  // spec-authored
    PER_CASE: 22,                   // spec-authored: five syndicate closures outrun the leak, four do not
    DECAY_PER_SECOND: 0.15          // spec-authored: progress must outpace the leak
  },

  Shifts: {
    FIRST_AT: 18.0, TELEGRAPH: 6.0, // player-directed: the city must be busy from the first breath; tutorial still holds the clock for new players
    INTERVAL_EARLY: 40.0, INTERVAL_MID: 34.0, INTERVAL_LATE: 28.0, // player-directed: compressed twice from 55/45/35 after "slow, lacking action"
    COUNT: 9,                       // spec-authored
    OVERTIME_INTERVAL: 30.0,        // census-run (test/opt_overtime.js): 0 timeouts in every swept cell; 24-40s flat; keep 30
    OVERTIME_STEP: 0.15,            // census-run (test/opt_overtime.js): 0.08-0.25 all end every match with a verdict mix; keep 0.15
    OVERTIME_CAP: 1.8,              // census-run: cap never the binding constraint in the sweep; keep
    REVIEW_AFTER: 5,                // spec-authored: overtime shifts before the Review convenes
    REVIEW_WEIGHTS: { WARRANT: 3, CLEARANCE: 2, TRUST: 2, NETWORK: 1, TREASURY: 1 }, // spec-authored: same composite the ladder tally uses
    REVIEW_PASS: 55,                // census-run: 8-seed census yields both rulings (5-6 W / 2-3 L) and rules against a do-nothing analyst; the weighed score the Review must reach to rule FOR the analyst; it can and must be able to rule against
    RAIN_DURATION: 25.0,            // judgment-tuned: long enough to force a dial move, short enough to recover
    RAIN_RECUR_EVERY: 3             // judgment-tuned: rain recurs every third shift after 6
  },

  // Authored per-shift composition (§14). Counts are per shift; vandal
  // budget is how many vandals the shift may spawn in total.
  ShiftTable: [                     // spec-authored, index = shift-1
    { petty: 3, major: 0, synd: 0, vandalBudget: 0, scrapper: 0, tagger: 0, fixer: 0 }, // 1: reads, cases, closure (player-directed: +1 for opening action)
    { petty: 3, major: 1, synd: 0, vandalBudget: 0, scrapper: 0, tagger: 0, fixer: 0 }, // 2: one camera is not enough (player-directed: first major moved up)
    { petty: 3, major: 1, synd: 0, vandalBudget: 2, scrapper: 1, tagger: 1, fixer: 0 }, // 3: first scrapper (player-directed: +1 petty, +1 tagger)
    { petty: 3, major: 1, synd: 1, vandalBudget: 1, scrapper: 0, tagger: 1, fixer: 0 }, // 4: first contested case; syndicate case for shift 5 (player-directed: +1 petty)
    { petty: 2, major: 1, synd: 1, vandalBudget: 1, scrapper: 0, tagger: 0, fixer: 1 }, // 5: THE FIXER STRIKE (scripted, §14.4)
    { petty: 2, major: 2, synd: 1, vandalBudget: 2, scrapper: 1, tagger: 1, fixer: 0 }, // 6: rain
    { petty: 4, major: 2, synd: 1, vandalBudget: 2, scrapper: 1, tagger: 1, fixer: 0 }, // 7: crews visibly reroute (player-directed: +1 petty)
    { petty: 4, major: 2, synd: 2, vandalBudget: 3, scrapper: 1, tagger: 1, fixer: 1 }, // 8: surge
    { petty: 3, major: 3, synd: 3, vandalBudget: 3, scrapper: 1, tagger: 1, fixer: 1 }  // 9: the syndicate's largest job
  ],

  Ladder: {                         // §13.4 — four tiers; overrides graded by evolution (test/evolve_opposition.js)
    TIERS: [
      { name: 'QUIET',    crimeMult: 0.7, vandalMult: 0.6, learnMult: 0.6, contestedMult: 0.8 }, // hand-authored soft: the tier protects struggling players; evolution never explores this corner
      { name: 'RESTLESS', crimeMult: 1.0, vandalMult: 1.0, learnMult: 1.0, contestedMult: 1.0 }, // the authored baseline every sweep runs at
      { name: 'BRAZEN',   crimeMult: 1.15, vandalMult: 1.35, learnMult: 1.8, contestedMult: 1.3 }, // graded midpoint; crime/vandal floored monotone for mood legibility
      { name: 'LAWLESS',  crimeMult: 1.35, vandalMult: 1.7, learnMult: 2.5, contestedMult: 1.5 } // re-graded under quadrant rules (test/evolve_opposition.js): evolution's discovery is that LEARNING SPEED is the weapon against aimed sectors — learn 2.5 holds the champion to fit 59 vs 164; crime/vandal floored monotone for the mood line
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
    BLACKLIST_S: 30,                // spec-authored: any action that changes nothing is benched
    // The demo's strategy is the tracking-era champion (test/evolve.js:
    // holdout 4/5 wins vs 2/5 for the pre-tracking champion re-scored and
    // 1/5 hand-authored), re-validated at demo tempo (opt_demo_tempo.js).
    // Evolution's own verdict on the tracking rules: wPair pinned at its
    // cap — CHAINS of cameras are the skill now — and the lax-bar blitz
    // died (bar back up to 55).
    STRATEGY: {
      THR_CALM: 55, THR_RAIN: 55,   // evolved: hold the bar; drop it only for expiring evidence
      W_SPAWN: 1.37, W_COVERAGE: 0.19, W_QUALITY: 0.60, W_PAIR: 2.5, // evolved site weights: chain-building dominates
      ADJ_BIAS: 0.5,                // evolved: charge-leaning adjudication
      BUILD_PACE: 3.0               // evolved: maximum eyes
    }
  },

  Review: {},                       // reserved: Review knobs live under Shifts

  Sim: { DT_CLAMP: 0.1 }            // spec-authored (§21.1): background-tab hiccups cannot create physics spikes
});

// Node/vm export hook — the headless harness reads CONFIG from the sandbox.
if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG };
