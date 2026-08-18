// ============================================================
// ECONOMY — the two-currency doctrine (§15.4): hardware costs
// budget; judgment costs trust. Budget never buys trust back.
// Also the standing composite that both the difficulty ladder
// and the Commissioner's Review weigh (§13.4 / §16.1) — one
// formula, so the difficulty system and the endgame judgment
// stay honest with each other.
// ============================================================

var Economy = (() => {

  function networkIntegrity(state) {
    if (state.stats.built === 0) return 50;   // no network yet: neutral, not zero
    const working = state.cameras.filter(c => c.type !== 'OFFICER').length;  // tours rotate off by design
    return clamp(100 * working / state.stats.built, 0, 100);
  }

  // Each component 0–100; weights from CONFIG.
  function reviewComponents(state) {
    const E = CONFIG.Economy;
    const clr = State.clearance(state);
    return {
      WARRANT: clamp(100 * state.warrant / CONFIG.Warrant.REQUIRED, 0, 100),
      CLEARANCE: clamp(100 * (clr - E.CLEARANCE_FLOOR) / (100 - E.CLEARANCE_FLOOR), 0, 100),
      TRUST: clamp(100 * (state.trust - E.TRUST_FLOOR) / (100 - E.TRUST_FLOOR), 0, 100),
      NETWORK: networkIntegrity(state),
      TREASURY: clamp(100 * state.budget / E.START_BUDGET, 0, 100)
    };
  }

  function reviewScore(state) {
    const W = CONFIG.Shifts.REVIEW_WEIGHTS;
    const c = reviewComponents(state);
    let sum = 0, wsum = 0;
    for (const k in W) { sum += c[k] * W[k]; wsum += W[k]; }
    return sum / wsum;
  }

  // Called at each shift boundary: clean-shift trust drip and the
  // one-shift-of-warning floor discipline (§16).
  function shiftEnd(state) {
    if (state.falseChargesThisShift === 0) {
      state.trust = Math.min(100, state.trust + CONFIG.Economy.TRUST_GAIN_CLEAN_SHIFT);
    }
    state.falseChargesThisShift = 0;
    state.contestedThisShift = 0;
  }

  // Returns 'CLEARANCE' | 'TRUST' | null if a floor has been breached for
  // a full shift (warning fired one shift earlier).
  function floorCheck(state) {
    const E = CONFIG.Economy;
    const clr = State.clearance(state);
    const shiftNum = state.shift.num;

    for (const [key, value, floor] of [
      ['clearance', clr, E.CLEARANCE_FLOOR],
      ['trust', state.trust, E.TRUST_FLOOR]
    ]) {
      if (value < floor) {
        if (state.warn[key] === -1) {
          state.warn[key] = shiftNum;
          State.emit(state, { type: 'floorWarning', meter: key });
          State.log(state, key === 'clearance'
            ? 'Clearance below the floor. One shift to turn it around.'
            : 'Trust below the floor. One shift to turn it around.', null);
        } else if (shiftNum > state.warn[key]) {
          return key.toUpperCase();
        }
      } else if (state.warn[key] !== -1) {
        state.warn[key] = -1;
        State.log(state, key === 'clearance' ? 'Clearance recovered.' : 'Trust recovered.', null);
      }
    }
    return null;
  }

  return { reviewScore, reviewComponents, networkIntegrity, shiftEnd, floorCheck };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Economy };
