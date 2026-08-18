// ga_lib — the genetic machinery (§30). A ~14-gene genome where every
// gene is a sentence a human can read (see opt_lib.DEFAULT_GENOME).
// Tournament selection, uniform crossover, gaussian mutation, elites,
// rotating training seeds, holdout validation. No neural nets — this is
// the right power-to-legibility trade for a contest requiring readable
// shipped code.
'use strict';
const { DEFAULT_GENOME } = require('./opt_lib');

// gene → [min, max, integer?]
const RANGES = {
  wSpawnDist: [0, 2], wExitDist: [0, 2], wCoverage: [0, 2],
  wQuality: [0, 2], wWatch: [0, 2], wPair: [0, 2.5],
  thrBase: [40, 75], thrRainDrop: [0, 25], thrExpiryDrop: [0, 20],
  adjBias: [0.5, 1.05],
  storagePerCam: [0, 0.8], relocIdle: [15, 60], buildPace: [0.8, 3],
  relayAt: [2, 8, true], hardenAt: [60, 400]
};
const GENES = Object.keys(RANGES);

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampGene(g, v) {
  const [lo, hi, int] = RANGES[g];
  v = Math.max(lo, Math.min(hi, v));
  return int ? Math.round(v) : v;
}

function randomGenome(rng) {
  const g = {};
  for (const k of GENES) {
    const [lo, hi] = RANGES[k];
    g[k] = clampGene(k, lo + rng() * (hi - lo));
  }
  return g;
}

function crossover(a, b, rng) {
  const g = {};
  for (const k of GENES) g[k] = rng() < 0.5 ? a[k] : b[k];
  return g;
}

function mutate(g, rng, rate, sigma) {
  const out = {};
  for (const k of GENES) {
    let v = g[k];
    if (rng() < rate) {
      const [lo, hi] = RANGES[k];
      // box-muller gaussian
      const u = Math.max(1e-9, rng()), w = rng();
      const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
      v = v + n * sigma * (hi - lo);
    }
    out[k] = clampGene(k, v);
  }
  return out;
}

function tournament(pop, fits, rng, k) {
  let best = -1;
  for (let i = 0; i < k; i++) {
    const c = Math.floor(rng() * pop.length);
    if (best === -1 || fits[c] > fits[best]) best = c;
  }
  return pop[best];
}

function nextGeneration(pop, fits, rng, opts) {
  const o = Object.assign({ elites: 2, tournK: 3, mutRate: 0.25, mutSigma: 0.15 }, opts);
  const order = fits.map((f, i) => i).sort((a, b) => fits[b] - fits[a]);
  const next = [];
  for (let i = 0; i < o.elites; i++) next.push(pop[order[i]]);
  while (next.length < pop.length) {
    const a = tournament(pop, fits, rng, o.tournK);
    const b = tournament(pop, fits, rng, o.tournK);
    next.push(mutate(crossover(a, b, rng), rng, o.mutRate, o.mutSigma));
  }
  return next;
}

function trainingSeeds(gen, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push('train-' + ((gen * 7 + i * 3) % 23));
  return out;
}
const HOLDOUT_SEEDS = ['hold-a', 'hold-b', 'hold-c', 'hold-d', 'hold-e'];

module.exports = {
  RANGES, GENES, mulberry, randomGenome, crossover, mutate,
  tournament, nextGeneration, trainingSeeds, HOLDOUT_SEEDS,
  DEFAULT_GENOME
};
