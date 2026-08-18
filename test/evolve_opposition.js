// evolve_opposition — §30: evolve the OPPOSITION (crime/vandal/learning
// pressure) against the reigning champion, then grade the population into
// the four ladder tiers by champion win-rate. QUIET is the pressure a
// struggling player faces; LAWLESS is what beats the champion.
// usage: node test/evolve_opposition.js [generations] [popSize]
'use strict';
const fs = require('fs');
const path = require('path');
const { makeSandbox } = require('./harness');
const L = require('./opt_lib');
const GA = require('./ga_lib');

const GENS = parseInt(process.argv[2], 10) || 6;
const POP = parseInt(process.argv[3], 10) || 16;
const SEEDS = ['opp-1', 'opp-2', 'opp-3'];
const champion = JSON.parse(fs.readFileSync(path.join(__dirname, 'best_genome.json'), 'utf8')).genome;
const rng = GA.mulberry(9182726);

const ORANGES = {
  crimeMult: [0.6, 1.8], vandalMult: [0.4, 2.2],
  learnMult: [0.5, 2.5], contestedMult: [0.7, 1.6]
};
const OKEYS = Object.keys(ORANGES);

function randOpp() {
  const g = {};
  for (const k of OKEYS) { const [lo, hi] = ORANGES[k]; g[k] = lo + rng() * (hi - lo); }
  return g;
}
function mutOpp(g) {
  const out = {};
  for (const k of OKEYS) {
    let v = g[k];
    if (rng() < 0.35) {
      const [lo, hi] = ORANGES[k];
      const u = Math.max(1e-9, rng()), w = rng();
      v += Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w) * 0.18 * (hi - lo);
      v = Math.max(lo, Math.min(hi, v));
    }
    out[k] = v;
  }
  return out;
}
function crossOpp(a, b) {
  const g = {};
  for (const k of OKEYS) g[k] = rng() < 0.5 ? a[k] : b[k];
  return g;
}

function sandboxFor(opp) {
  const line = `{ name: 'RESTLESS', crimeMult: ${opp.crimeMult.toFixed(3)}, vandalMult: ${opp.vandalMult.toFixed(3)}, learnMult: ${opp.learnMult.toFixed(3)}, contestedMult: ${opp.contestedMult.toFixed(3)} }`;
  return makeSandbox(code => code.replace(/\{ name: 'RESTLESS'[^}]*\}/, line));
}

// champion performance vs this opposition; opposition wants it LOW
function championPerf(opp) {
  const sb = sandboxFor(opp);
  let fit = 0, wins = 0;
  for (const seed of SEEDS) {
    const r = L.runMatch(sb, seed, champion);
    fit += L.fitness(r);
    if (r.verdict === 'WIN') wins++;
  }
  return { fit: fit / SEEDS.length, wins };
}

let pop = [ { crimeMult: 1, vandalMult: 1, learnMult: 1, contestedMult: 1 } ];
while (pop.length < POP) pop.push(randOpp());

const evaluated = [];   // every individual ever scored, for grading
for (let gen = 0; gen < GENS; gen++) {
  const t0 = Date.now();
  const perfs = pop.map(opp => championPerf(opp));
  for (let i = 0; i < pop.length; i++) evaluated.push({ opp: pop[i], perf: perfs[i] });
  const oppFits = perfs.map(p => -p.fit);
  const order = oppFits.map((f, i) => i).sort((a, b) => oppFits[b] - oppFits[a]);
  console.log(`gen ${gen}: hardest holds champion to fit=${perfs[order[0]].fit.toFixed(1)} (${perfs[order[0]].wins}/${SEEDS.length} wins) ` +
    `softest allows ${perfs[order[order.length - 1]].fit.toFixed(1)} [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  const next = [pop[order[0]], pop[order[1]]];
  while (next.length < POP) {
    const a = pop[order[Math.floor(rng() * Math.min(6, order.length))]];
    const b = pop[order[Math.floor(rng() * Math.min(6, order.length))]];
    next.push(mutOpp(crossOpp(a, b)));
  }
  pop = next;
}

// grade the whole evaluated population into tiers by champion fitness
evaluated.sort((a, b) => b.perf.fit - a.perf.fit);   // easiest first
const q = (f) => evaluated[Math.min(evaluated.length - 1, Math.floor(evaluated.length * f))];
const tiers = [
  { name: 'QUIET', pick: q(0.10) },
  { name: 'RESTLESS', pick: q(0.40) },
  { name: 'BRAZEN', pick: q(0.70) },
  { name: 'LAWLESS', pick: q(0.95) }
];
console.log('\nGraded ladder (champion fitness against each tier):');
for (const t of tiers) {
  const o = t.pick.opp;
  console.log(`${t.name.padEnd(9)} crime=${o.crimeMult.toFixed(2)} vandal=${o.vandalMult.toFixed(2)} learn=${o.learnMult.toFixed(2)} contested=${o.contestedMult.toFixed(2)} → champion fit ${t.pick.perf.fit.toFixed(1)} (${t.pick.perf.wins}/${SEEDS.length} wins)`);
}
fs.writeFileSync(path.join(__dirname, 'ladder_tiers.json'), JSON.stringify(tiers.map(t => ({
  name: t.name, ...Object.fromEntries(OKEYS.map(k => [k, +t.pick.opp[k].toFixed(3)])),
  championFit: +t.pick.perf.fit.toFixed(1), championWins: t.pick.perf.wins
})), null, 2));
console.log('wrote ladder_tiers.json');
