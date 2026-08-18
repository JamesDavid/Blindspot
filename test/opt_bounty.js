// opt_bounty — §29.4.4: comeback money (§15.5). CREW_CASE_BOUNTY_MULT
// across healthy and collapsing seeds. Expect: neutral on healthy seeds,
// rescuing on collapsing ones.
'use strict';
const { makeSandbox, patchNumber } = require('./harness');
const L = require('./opt_lib');

// b2/e5 collapse under the default genome (clearance death); a1/c3/d4 are healthy
const HEALTHY = ['a1', 'c3', 'd4'];
const COLLAPSING = ['b2', 'e5'];
const MULTS = [0, 1, 2, 3];

console.log('opt_bounty: crew-case bounty multiplier, healthy vs collapsing seeds');
console.log('mult   healthy  collapse');
let best = { score: -Infinity };
for (const m of MULTS) {
  const sb = makeSandbox(code => patchNumber(code, 'CREW_CASE_BOUNTY_MULT', m));
  let hTot = 0, cTot = 0;
  for (const seed of HEALTHY) hTot += L.score(L.runMatch(sb, seed));
  for (const seed of COLLAPSING) cTot += L.score(L.runMatch(sb, seed));
  const h = hTot / HEALTHY.length, c = cTot / COLLAPSING.length;
  console.log(String(m).padStart(4) + '  ' + h.toFixed(1).padStart(8) + '  ' + c.toFixed(1).padStart(8));
  const combined = (h + c) / 2;
  if (combined > best.score) best = { score: combined, m, h, c };
}
console.log(`BEST mult=${best.m} (healthy ${best.h.toFixed(1)}, collapsing ${best.c.toFixed(1)})`);
