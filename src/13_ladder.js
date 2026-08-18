// ============================================================
// LADDER — four-tier opponent pressure with silent skill
// matching (§13.4). Steps one rung at a time on the same
// composite the Review weighs. Runs in real matches only
// (state.dda); headless sims and sweeps never rubber-band.
// The mood line makes it visible: seen DDA reads as a living
// city, hidden DDA reads as cheating.
// ============================================================

var LadderSystem = (() => {

  function tally(state) {
    const L = CONFIG.Ladder;
    if (!state.dda) return;
    if (state.shift.num < L.DDA_FROM_SHIFT) return;
    const standing = Economy.reviewScore(state) / 100;
    const before = state.ladder.tier;
    if (standing > L.DDA_UP && state.ladder.tier < L.TIERS.length - 1) state.ladder.tier++;
    else if (standing < L.DDA_DOWN && state.ladder.tier > 0) state.ladder.tier--;
    if (state.ladder.tier !== before) {
      State.emit(state, { type: 'mood', tier: state.ladder.tier, name: L.TIERS[state.ladder.tier].name });
    }
  }

  // Cross-session memory (§13.4): EMA of end-of-match standing plus a
  // decaying peak; the next match opens at round((ema+peak)/2) rungs.
  // Pure functions — the UI layer owns localStorage; demo matches and
  // headless runs never touch it.
  function updateMemory(mem, endStanding) {
    const L = CONFIG.Ladder;
    const m = mem || { ema: 0.5, peak: 0.5 };
    const ema = m.ema * (1 - L.MEMORY_EMA_ALPHA) + endStanding * L.MEMORY_EMA_ALPHA;
    const peak = Math.max(endStanding, m.peak * L.MEMORY_PEAK_DECAY);
    return { ema, peak };
  }

  function openingTier(mem) {
    const L = CONFIG.Ladder;
    if (!mem) return L.START_TIER;
    const standing = (mem.ema + mem.peak) / 2;
    return clamp(Math.round(standing * (L.TIERS.length - 1)), 0, L.TIERS.length - 1);
  }

  return { tally, updateMemory, openingTier };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { LadderSystem };
