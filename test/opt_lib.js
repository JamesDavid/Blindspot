// opt_lib — the scripted trial player (§29.1) and the match-quality score
// (§29.2). The player places by site-scoring, MOVES THE THRESHOLD (rain,
// expiring evidence), ADJUDICATES contested cards by evidence weight,
// RELOCATES on idle coverage, and buys storage vs cameras — every mechanic
// whose constants get swept is exercised here, through the same Actions
// surface the UI uses. Its choices are a genome for the GA (§30): every
// gene is a sentence a human can read.
'use strict';
const { makeSandbox } = require('./harness');

// ~12 genes, hand-authored defaults. Ranges in evolve.js.
const DEFAULT_GENOME = {
  wSpawnDist: 1.0,     // prefer poles near crime spawn zones
  wExitDist: 0.6,      // prefer poles on the way to exits
  wCoverage: 0.8,      // prefer poles that see many segments
  wQuality: 1.0,       // prefer poles with clean head-on reads
  wWatch: 0.5,         // prefer poles that watch other poles (§11.3)
  thrBase: 58,         // preferred bar in calm conditions (probe: 55-60 ridge, 70 starves, 50 bleeds trust)
  thrRainDrop: 14,     // drop the bar this much while it rains
  thrExpiryDrop: 8,    // drop when evidence is about to expire unclosed
  adjBias: 0.72,       // charge when the weighed evidence beats this
  storagePerCam: 0.34, // fraction of cameras to fit with storage
  relocIdle: 30,       // relocate a camera idle this many seconds
  buildPace: 1.6,      // cameras wanted per shift number
  relayAt: 4,          // build the first relay at this network size
  hardenAt: 160        // harden isolated poles when budget exceeds this
};

// Site score for a POST at node n. Uses only player-visible information.
function siteScore(sb, state, n, g) {
  const map = state.map;
  const q = sb.Sightlines.quoteQuality(state, n, 'POST', 0);
  if (!q) return -1;
  let minSpawn = Infinity;
  for (const z of map.spawnZones) minSpawn = Math.min(minSpawn, sb.CaseSystem.nodeDist(state, n, z));
  const exitD = map.distToExit[n];
  const watch = sb.MapGen.visiblePoles(map, n);
  return g.wSpawnDist * (1 / (1 + minSpawn))
    + g.wExitDist * (1 / (1 + Math.abs(exitD - 3)))   // approaches, not the exit mouth
    + g.wCoverage * q.count / 8
    + g.wQuality * q.best / 100
    + g.wWatch * Math.min(watch, 4) / 4;
}

function bestSite(sb, state, g) {
  let best = -1, bestScore = -Infinity;
  for (const node of state.map.nodes) {
    if (node.exit || !state.map.adj[node.id].length) continue;
    if (sb.CameraSystem.camAt(state, node.id)) continue;
    const s = siteScore(sb, state, node.id, g);
    if (s > bestScore) { bestScore = s; best = node.id; }
  }
  return best;
}

// Aimed Long on the longest arterial straight run through a free pole.
function bestLongSite(sb, state) {
  const map = state.map;
  let best = null;
  for (const node of map.nodes) {
    if (node.exit || !map.adj[node.id].length) continue;
    if (sb.CameraSystem.camAt(state, node.id)) continue;
    for (let dir = 0; dir < 4; dir++) {
      const entries = sb.Sightlines.compute(map, node.id, 'LONG', dir);
      if (entries.length < 4) continue;
      const arterial = entries.filter(e => map.segs[e.seg].arterial).length;
      const score = entries.length + arterial;
      if (!best || score > best.score) best = { node: node.id, dir, score };
    }
  }
  return best;
}

function makeTrialPlayer(sb, genome) {
  const g = Object.assign({}, DEFAULT_GENOME, genome || {});
  const mem = { lastThink: -Infinity, lastReloc: -Infinity, thresholdMoves: 0, placed: 0, relocations: 0 };

  const controller = (state) => {
    const { Actions, State, CaseSystem, CameraSystem } = sb;
    if (state.time - mem.lastThink < 1.5) return;   // human-ish cadence
    mem.lastThink = state.time;

    // ---- the dial (the strategic verb) ----
    const raining = state.shift.rainUntil > state.time;
    let expiring = false;
    for (const kase of state.cases) {
      if (kase.status !== 'OPEN' && kase.status !== 'CONTESTED') continue;
      if (kase.riskAnnounced) { expiring = true; break; }   // §14.4 recovery: answer the strike with the dial
      for (const r of CaseSystem.usableEvidence(state, kase)) {
        if (r.expiresAt - state.time < sb.CONFIG.Cases.STARVATION_GRACE) { expiring = true; break; }
      }
      if (expiring) break;
    }
    const target = Math.round(g.thrBase - (raining ? g.thrRainDrop : 0) - (expiring ? g.thrExpiryDrop : 0));
    if (Math.abs(target - state.threshold) >= 2) {
      const r = Actions.setThreshold(state, target);
      if (r.ok && !r.unchanged) mem.thresholdMoves++;
    }

    // ---- adjudication (the judgement verb) ----
    for (const kase of state.cases) {
      if (kase.status !== 'CONTESTED') continue;
      const ev = CaseSystem.usableEvidence(state, kase);
      const avg = ev.length ? ev.reduce((s, r) => s + r.conf, 0) / ev.length : 0;
      const gr = CaseSystem.grade(state, ev);
      const chargeScore = avg / 100 + 0.15 * Math.min(ev.length, 4) - (gr.contradiction ? 0.35 : 0);
      Actions.adjudicate(state, kase.id, chargeScore > g.adjBias ? 'CHARGE' : 'RELEASE');
    }

    // ---- build & works (the primary verb) ----
    const wanted = Math.min(10, Math.ceil(Math.max(1, state.shift.num) * g.buildPace) + 1);
    const relays = state.cameras.filter(c => c.type === 'RELAY').length;

    // clean fouled lenses first — cheap if noticed
    for (const cam of state.cameras) {
      if (cam.tags > 0 && state.budget > sb.CONFIG.Upgrades.CLEAN + 20) {
        Actions.upgrade(state, cam.id, 'CLEAN');
      }
    }

    if (state.cameras.length - relays >= g.relayAt && relays === 0) {
      // relay next to the camera with the most pending footage
      let target = null, most = -1;
      for (const cam of state.cameras) {
        if (cam.type === 'RELAY') continue;
        if (cam.drive.length > most) { most = cam.drive.length; target = cam; }
      }
      if (target && state.budget >= sb.CONFIG.Cameras.RELAY.COST) {
        for (const e of state.map.adj[target.node]) {
          if (Actions.place(state, e.node, 'RELAY').ok) break;
        }
      }
    } else if (state.cameras.length < wanted) {
      if (state.budget >= sb.CONFIG.Cameras.LONG.COST + 40 && state.shift.num >= 3 &&
          !state.cameras.some(c => c.type === 'LONG')) {
        const spot = bestLongSite(sb, state);
        if (spot) Actions.place(state, spot.node, 'LONG', spot.dir);
      } else if (state.budget >= sb.CONFIG.Cameras.POST.COST) {
        const n = bestSite(sb, state, g);
        if (n >= 0) { if (Actions.place(state, n, 'POST').ok) mem.placed++; }
      }
    }

    // storage vs eyes (§10.3)
    const storageCams = state.cameras.filter(c => c.storageUp).length;
    if (state.cameras.length >= 3 && storageCams < g.storagePerCam * state.cameras.length &&
        state.budget > sb.CONFIG.Upgrades.STORAGE + 60) {
      const cam = state.cameras.find(c => !c.storageUp && c.type !== 'RELAY');
      if (cam) Actions.upgrade(state, cam.id, 'STORAGE');
    }

    // harden the most isolated pole when rich
    if (state.budget > g.hardenAt) {
      let iso = null, fewest = Infinity;
      for (const cam of state.cameras) {
        if (cam.hardened) continue;
        const w = sb.Sightlines.camerasWatchingNode(state, cam.node, cam.id).length;
        if (w < fewest) { fewest = w; iso = cam; }
      }
      if (iso) Actions.upgrade(state, iso.id, 'HARDEN');
    }

    // ---- relocation (the §13 counterplay) ----
    if (state.time - mem.lastReloc > 12 && state.cameras.length >= 4) {
      const cutoff = state.time - g.relocIdle;
      for (const cam of state.cameras) {
        if (cam.type === 'RELAY' || state.time - cam.builtAt < g.relocIdle) continue;
        const recent = state.reads.some(r => r.camId === cam.id && r.t > cutoff);
        if (recent) continue;
        const n = bestSite(sb, state, g);
        if (n >= 0 && Actions.relocate(state, cam.id, n).ok) {
          mem.relocations++;
          mem.lastReloc = state.time;
        }
        break;
      }
    }
  };
  controller.mem = mem;
  return controller;
}

// One full match; returns the stats object every sweep and the GA consume.
function runMatch(sb, seed, genome, opts) {
  opts = opts || {};
  const state = sb.State.newMatch(seed, { dda: false });
  const player = makeTrialPlayer(sb, genome);
  sb.Sim.run(state, opts.horizon || 60 * 14, player, opts.step);
  const m = player.mem;
  return {
    seed,
    time: state.time,
    verdict: state.verdict ? state.verdict.result : 'TIMEOUT',
    reason: state.verdict ? state.verdict.reason : 'none',
    shift: state.shift.num,
    warrant: state.warrant,
    trust: state.trust,
    clearance: sb.State.clearance(state),
    budget: state.budget,
    closures: state.stats.closures,
    falseCharges: state.stats.falseCharges,
    colds: state.stats.colds,
    contested: state.stats.contestedShown,
    contestedResolved: state.stats.contestedResolved,
    reads: state.stats.reads,
    qualifying: state.stats.qualifying,
    built: state.stats.built,
    destroyed: state.stats.destroyed,
    relocations: m.relocations,
    thresholdMoves: m.thresholdMoves,
    reroutes: state.stats.reroutes,
    witnessCases: state.stats.witnessCases,
    bounties: state.stats.bounties
  };
}

// The single match-quality composite (§29.2) — comparable across every
// sweep for the whole project. Rewards deep survival under pressure with
// both meters alive but MOVING; penalises degenerate strategies.
function score(r) {
  let s = 0;
  if (r.closures === 0) s -= 50;              // broken
  if (r.colds === 0) s -= 20;                 // too easy
  s += 30 * Math.min(1, r.time / 660);        // survival depth
  if (r.verdict === 'WIN') s += r.reason === 'WARRANT' ? 40 : 25;
  if (r.verdict === 'TIMEOUT') s -= 40;       // §16.1 exists to make this impossible
  s += 10 * Math.min(1, r.warrant / 100);
  if (r.contestedResolved > 0) s += 5;
  s += Math.max(0, Math.min(100, r.trust)) / 10;
  s += Math.max(0, Math.min(100, r.clearance)) / 10;
  if (r.thresholdMoves === 0) s -= 15;        // dial parked = not playing the game
  if (r.built > 14) s -= 10;                  // camera spam
  return s;
}

// The fitness the GA maximises (§30): must contain the win condition —
// warrant completion, not survival theatre.
function fitness(r) {
  let f = 0;
  if (r.verdict === 'WIN' && r.reason === 'WARRANT') f += 100;
  else if (r.verdict === 'WIN') f += 45;
  f += r.warrant * 0.5;
  f += Math.min(1, r.time / 660) * 15;
  f += Math.max(0, r.trust) * 0.1 + Math.max(0, r.clearance) * 0.1;
  f -= r.falseCharges * 2;
  return f;
}

module.exports = { DEFAULT_GENOME, makeTrialPlayer, runMatch, score, fitness, makeSandbox, bestSite, bestLongSite };
