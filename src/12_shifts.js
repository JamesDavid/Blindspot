// ============================================================
// SHIFTS — nine authored shifts, escalating cadence (§14), the
// scripted shift-5 Fixer strike (§14.4), rain, then overtime
// and the Commissioner's Review (§16.1). Every match ends.
// ============================================================

var ShiftSystem = (() => {

  function interval(state) {
    const S = CONFIG.Shifts;
    const n = state.shift.num;
    if (n > S.COUNT) return S.OVERTIME_INTERVAL;
    if (n >= 7) return S.INTERVAL_LATE;
    if (n >= 4) return S.INTERVAL_MID;
    return S.INTERVAL_EARLY;
  }

  function tierMults(state) {
    return CONFIG.Ladder.TIERS[state.ladder.tier] || CONFIG.Ladder.TIERS[1];
  }

  // Deterministic fractional rounding: 2.4 crimes → 2, +40% chance of 3.
  function countRound(state, v) {
    const f = Math.floor(v);
    return f + (State.rngNext(state, 'shifts') < (v - f) ? 1 : 0);
  }

  function moodLine(state) {
    const name = tierMults(state).name;
    return 'THE STREETS ARE ' + name + '.';
  }

  function scheduleShift(state) {
    const S = CONFIG.Shifts;
    const sh = state.shift;
    const row = CONFIG.ShiftTable[Math.min(sh.num, S.COUNT) - 1];
    const m = tierMults(state);
    const esc = sh.escalation;
    const span = interval(state) * 0.8;
    const rng = () => State.rngNext(state, 'shifts');

    sh.pendingCrimes = [];
    sh.pendingVandals = [];

    const add = (type, count) => {
      for (let i = 0; i < count; i++) {
        sh.pendingCrimes.push({ t: state.time + rng() * span, type });
      }
    };
    add('PETTY', countRound(state, row.petty * m.crimeMult * esc));
    add('MAJOR', countRound(state, row.major * m.crimeMult * esc));

    // Syndicate jobs: shift 5's is scripted to land after the strike so the
    // recovery read can land (§14.4); the rest are spread like other crimes.
    let syndCount = countRound(state, row.synd * m.crimeMult * esc);
    if (sh.num === CONFIG.Vandals.FIXER.FIRST_SHIFT && syndCount === 0) syndCount = 1;
    for (let i = 0; i < syndCount; i++) {
      const t = sh.num === CONFIG.Vandals.FIXER.FIRST_SHIFT && i === 0
        ? state.time + CONFIG.Shifts.TELEGRAPH * 2 + CONFIG.Vandals.FIXER.DESTROY_SECONDS + 8
        : state.time + rng() * span;
      sh.pendingCrimes.push({ t, type: 'SYNDICATE' });
    }

    // Vandals: a per-shift crew, budgeted by the table and the tier.
    const vb = countRound(state, row.vandalBudget * m.vandalMult * esc);
    if (vb > 0) {
      const crewId = 'vandals-' + sh.num;
      if (!state.crews[crewId]) State.addCrew(state, crewId, 'VANDAL');
      const types = [];
      for (let i = 0; i < row.scrapper; i++) types.push('SCRAPPER');
      for (let i = 0; i < row.tagger; i++) types.push('TAGGER');
      for (let i = 0; i < row.fixer && sh.num >= CONFIG.Vandals.FIXER.FIRST_SHIFT; i++) types.push('FIXER');
      while (types.length < vb) types.push(rng() < 0.6 ? 'SCRAPPER' : 'TAGGER');
      for (let i = 0; i < vb && i < types.length; i++) {
        sh.pendingVandals.push({ t: state.time + rng() * span, type: types[i], crewId });
      }
    }

    // §14.4 — the scripted signature sequence: the Fixer strikes the
    // camera that has produced the most evidence for the open syndicate
    // case (falling back to the highest-coverage camera), immediately.
    if (sh.num === CONFIG.Vandals.FIXER.FIRST_SHIFT && state.cameras.length) {
      const synd = state.cases.find(c => c.type === 'SYNDICATE' && (c.status === 'OPEN' || c.status === 'CONTESTED'));
      let target = null;
      if (synd) {
        const contrib = {};
        for (const r of state.reads) {
          if (r.caseId === synd.id && !r.lost) contrib[r.camId] = (contrib[r.camId] || 0) + 1;
        }
        let best = -1;
        for (const camId in contrib) {
          const cam = CameraSystem.byId(state, Number(camId));
          if (cam && contrib[camId] > best) { best = contrib[camId]; target = cam; }
        }
      }
      if (!target) {
        let bestCov = -1;
        for (const c of state.cameras) if (c.sight.length > bestCov) { bestCov = c.sight.length; target = c; }
      }
      if (target) {
        sh.pendingVandals = sh.pendingVandals.filter(v => v.type !== 'FIXER');
        sh.pendingVandals.push({ t: state.time + 1.0, type: 'FIXER', crewId: 'vandals-' + sh.num, forcedTargetCamId: target.id });
        State.emit(state, { type: 'strikeIncoming' });
      }
      if (!state.crews['vandals-' + sh.num]) State.addCrew(state, 'vandals-' + sh.num, 'VANDAL');
    }

    // Rain: enters at shift 6 and recurs (§14.3)
    if (sh.num >= 6 && (sh.num - 6) % CONFIG.Shifts.RAIN_RECUR_EVERY === 0) {
      sh.rainUntil = state.time + CONFIG.Shifts.RAIN_DURATION;
      State.emit(state, { type: 'rain', until: sh.rainUntil });
      State.log(state, 'Rain. Same bar, fewer clean reads.', 'first-rain');
    }
  }

  function conveneReview(state) {
    const score = Economy.reviewScore(state);
    const comps = Economy.reviewComponents(state);
    const pass = score >= CONFIG.Shifts.REVIEW_PASS;
    state.verdict = {
      result: pass ? 'WIN' : 'LOSE',
      reason: 'REVIEW',
      score: Math.round(score),
      scales: comps,
      refusable: true
    };
    State.emit(state, { type: 'verdict', verdict: state.verdict });
    State.log(state, "The Commissioner's Review convenes.", null);
  }

  // The verdict is refusable (§16.1): overtime resumes permanently and
  // only the warrant or a floor ends the matter.
  Actions.refuseReview = function (state) {
    if (!state.verdict || !state.verdict.refusable) return { ok: false, reason: 'NOTHING TO REFUSE' };
    state.verdict = null;
    state.shift.reviewRefused = true;
    State.log(state, 'Ruling refused. Back to work.', null);
    State.emit(state, { type: 'reviewRefused' });
    return { ok: true };
  };

  function startShift(state) {
    const S = CONFIG.Shifts;
    const sh = state.shift;

    // previous shift's books close
    if (sh.num >= 1) {
      Economy.shiftEnd(state);
      // §10.4: a silent shift explains itself
      if (state.cameras.length && state.stats.qualifying === sh._qualSnapshot) {
        State.log(state, 'Nothing cleared the bar this shift.', null);
      }
    }
    sh.num++;
    sh._qualSnapshot = state.stats.qualifying;
    sh.telegraphed = false;

    // a meter below its floor for a full shift ends the match
    const breach = Economy.floorCheck(state);
    if (breach) {
      state.verdict = {
        result: 'LOSE',
        reason: breach,
        score: Math.round(Economy.reviewScore(state)),
        scales: Economy.reviewComponents(state),
        refusable: false
      };
      State.emit(state, { type: 'verdict', verdict: state.verdict });
      return;
    }

    if (sh.num > S.COUNT) {
      sh.overtime = sh.num - S.COUNT;
      sh.escalation = Math.min(S.OVERTIME_CAP, 1 + S.OVERTIME_STEP * sh.overtime);
      State.log(state, 'OVERTIME — SHIFT ' + sh.num + '. The city does not go quiet.', 'first-overtime');
      if (sh.overtime >= S.REVIEW_AFTER && !sh.reviewRefused) {
        conveneReview(state);
        if (state.verdict) { sh.nextAt = state.time + interval(state); return; }
      }
    }

    sh.nextAt = state.time + interval(state);
    scheduleShift(state);
    State.emit(state, { type: 'shift', num: sh.num, overtime: sh.overtime, mood: moodLine(state) });
  }

  function tick(state, dt) {
    const sh = state.shift;
    if (state.verdict) return;

    // the shift clock waits for the tutorial (§14.5)
    if (state.tutorialActive) { sh.nextAt += dt; return; }

    if (!sh.telegraphed && state.time >= sh.nextAt - CONFIG.Shifts.TELEGRAPH) {
      sh.telegraphed = true;
      LadderSystem.tally(state);
      State.emit(state, { type: 'telegraph', nextShift: sh.num + 1, mood: moodLine(state) });
    }
    if (state.time >= sh.nextAt) startShift(state);
    if (state.verdict) return;

    // fire scheduled spawns
    if (sh.pendingCrimes) {
      for (const c of sh.pendingCrimes) {
        if (!c.done && state.time >= c.t) { c.done = true; CaseSystem.openCrime(state, c.type); }
      }
    }
    if (sh.pendingVandals) {
      for (const v of sh.pendingVandals) {
        if (v.done || state.time < v.t) continue;
        if (VandalSystem.activeCount(state) >= CONFIG.Vandals.MAX_SIMULTANEOUS) { v.t = state.time + 2; continue; }
        v.done = true;
        if (state.cameras.length) VandalSystem.spawn(state, v.type, v.crewId, v.forcedTargetCamId);
      }
    }
  }

  return { tick, startShift, interval, moodLine, conveneReview };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { ShiftSystem };
