// test_mapgen — §19.2: determinism (same seed twice → identical maps),
// convergence (200 random-ish seeds resolve within the re-roll cap; report
// the fallback rate), and the golden seed validates directly.
'use strict';
const { makeSandbox } = require('./harness');

const sb = makeSandbox();
const { MapGen, CONFIG } = sb;

let fails = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok  ${name}`);
  else { fails++; console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

// -- determinism: same seed string → byte-identical map
function fingerprint(map) {
  return JSON.stringify({
    segs: map.segs.map(s => [s.a, s.b, s.arterial ? 1 : 0]),
    exits: map.exits, zones: map.spawnZones, synd: map.syndicate, nonce: map.nonce
  });
}
const a = MapGen.generate('judge');
const b = MapGen.generate('judge');
check('determinism (seed "judge")', fingerprint(a) === fingerprint(b));

const c = MapGen.generate('7f3k');
const d = MapGen.generate('7f3k');
check('determinism (seed "7f3k")', fingerprint(c) === fingerprint(d));
check('different seeds differ', fingerprint(a) !== fingerprint(c));

// -- golden seed validates directly (no fallback path inside fallback)
const golden = MapGen.generate(CONFIG.MapGen.GOLDEN_SEED);
check('golden seed generates', !!golden);
check('golden seed is not itself a fallback', golden.fallback === false);

// -- convergence: 200 seeds resolve; count how many needed the fallback
let fallbacks = 0, errors = 0;
const t0 = Date.now();
for (let i = 0; i < 200; i++) {
  const seed = (i * 2654435761 % 1679616).toString(36);
  try {
    const m = MapGen.generate(seed);
    if (m.fallback) fallbacks++;
    // spot invariants on every generated map
    if (m.adj.some(l => l.length > 4)) { errors++; console.error('  valence violation on ' + seed); }
    if (MapGen.longestStraightRun(m) < CONFIG.MapGen.MIN_STRAIGHT_RUN) { errors++; console.error('  straight-run violation on ' + seed); }
  } catch (e) { errors++; console.error('  gen threw on ' + seed + ': ' + e.message); }
}
check('200-seed convergence, zero throws', errors === 0);
check('fallback rate acceptable (<5%)', fallbacks < 10, `${fallbacks}/200 fell back`);
console.log(`  200 seeds in ${Date.now() - t0} ms, ${fallbacks} fallback(s)`);

if (fails) { console.error(`test_mapgen: ${fails} FAILURE(S)`); process.exit(1); }
console.log('test_mapgen: all green');
