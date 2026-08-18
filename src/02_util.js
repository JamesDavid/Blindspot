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

// ---- car identity: type, colour, damage — deterministic from the plate,
// so the same vehicle looks the same in traffic, in the case-file stills,
// and in a witness's description. Night-street palette: distinct without
// stealing any signal colour.
var CAR_TYPES = ['COMPACT', 'SEDAN', 'SPORTS CAR', 'SUV', 'PICKUP', 'VAN'];
var CAR_COLOR_TABLE = [
  { name: 'RED',    hex: 0x9c4038, tone: 'DARK' },
  { name: 'BLUE',   hex: 0x3d5a80, tone: 'DARK' },
  { name: 'WHITE',  hex: 0xc9cdd6, tone: 'LIGHT' },
  { name: 'BLACK',  hex: 0x23252c, tone: 'DARK' },
  { name: 'SILVER', hex: 0x9aa0ab, tone: 'LIGHT' },
  { name: 'GREEN',  hex: 0x52704f, tone: 'DARK' },
  { name: 'TAN',    hex: 0xa89078, tone: 'LIGHT' },
  { name: 'BROWN',  hex: 0x6b4f42, tone: 'DARK' },
  { name: 'YELLOW', hex: 0xb09a3f, tone: 'LIGHT' },
  { name: 'GREY',   hex: 0x6f7681, tone: 'DARK' }
];

function carIdentity(plate) {
  const h1 = hashStr(plate + '/t'), h2 = hashStr(plate + '/c'), h3 = hashStr(plate + '/d');
  const damage = [];
  if (h3 % 100 < 16) damage.push('CRACKED WINDSHIELD');
  if ((h3 >>> 3) % 100 < 13) damage.push('DENTED PANEL');
  if ((h3 >>> 7) % 100 < 10) damage.push('BROKEN TAILLIGHT');
  return {
    type: CAR_TYPES[h1 % CAR_TYPES.length],
    color: CAR_COLOR_TABLE[h2 % CAR_COLOR_TABLE.length],
    damage
  };
}

// What a witness actually says: usually the colour and type, sometimes
// just "a dark car" — and sometimes a telling specific ("dented panel")
// that sharpens the lineup to almost nothing.
function witnessDescription(identity, r1, r2, r3) {
  const color = r1 < 0.7 ? identity.color.name : (identity.color.tone === 'DARK' ? 'DARK' : 'LIGHT-COLORED');
  const type = r2 < 0.75 ? identity.type : 'CAR';
  let desc = color + ' ' + type;
  if (identity.damage.length && (r3 !== undefined ? r3 : 1) < 0.5) {
    desc += ', ' + identity.damage[0];
  }
  return desc;
}

// Does a photographed car fit what the witness said? The description is
// "COLOR TYPE" where colour may be vague (DARK / LIGHT-COLORED) and type
// may be just CAR.
function descriptionMatches(desc, identity) {
  if (!desc) return false;
  let main = desc, damageWord = null;
  const comma = desc.indexOf(',');
  if (comma >= 0) { main = desc.slice(0, comma); damageWord = desc.slice(comma + 2); }
  const firstSpace = main.indexOf(' ');
  const colorWord = main.slice(0, firstSpace);
  const typeWord = main.slice(firstSpace + 1);
  const colorOK = colorWord === identity.color.name ||
    (colorWord === 'DARK' && identity.color.tone === 'DARK') ||
    (colorWord === 'LIGHT-COLORED' && identity.color.tone === 'LIGHT');
  const typeOK = typeWord === 'CAR' || typeWord === identity.type;
  const damageOK = !damageWord || identity.damage.includes(damageWord);
  return colorOK && typeOK && damageOK;
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
