// ============================================================
// UTIL — deterministic PRNG, hashing, small helpers.
// Nothing in sim code may touch Math.random(); every stream of
// randomness derives from the match seed through these.
// ============================================================

// FNV-1a string hash → 32-bit uint.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 — small, fast, deterministic PRNG. Returns fn → [0,1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A named random stream: rng('traffic') and rng('vandals') never
// perturb each other, so adding a draw in one system cannot shift
// every other system's sequence (determinism stays debuggable).
function makeRngPool(seedStr) {
  const streams = {};
  return function (name) {
    if (!streams[name]) streams[name] = mulberry32(hashStr(seedStr + '/' + name));
    return streams[name];
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Pick index by weight array using rng value r in [0,1).
function weightedIndex(weights, r) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return 0;
  let acc = 0;
  const target = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (target < acc) return i;
  }
  return weights.length - 1;
}

// Random base-36 seed string for NEW matches only — generation itself
// never touches wall-clock time (§19: the time salt belongs here alone).
function randomSeedString() {
  const t = (typeof performance !== 'undefined' ? performance.now() : 0) + Date.now();
  return (Math.floor(t) % 1679616).toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

// Plate generator: deterministic fictional plates, LLN-NNN shape.
function makePlate(rng) {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ'; // no I,O,Q — plates stay legible at small sizes
  let p = '';
  p += L[Math.floor(rng() * L.length)];
  p += L[Math.floor(rng() * L.length)];
  p += Math.floor(rng() * 10);
  p += '-';
  for (let i = 0; i < 3; i++) p += Math.floor(rng() * 10);
  return p;
}

// Threshold band label for a value, from CONFIG bands [[min,label],...].
function bandLabel(bands, v) {
  let label = bands[0][1];
  for (const [min, name] of bands) if (v >= min) label = name;
  return label;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hashStr, mulberry32, makeRngPool, clamp, lerp, weightedIndex, randomSeedString, makePlate, bandLabel };
}
