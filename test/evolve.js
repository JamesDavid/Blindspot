// evolve — the champion pipeline (§30). Worker processes for parallel
// evaluation, per-generation checkpointing (a killed run resumes), warm
// start with the incumbent champion (which must then be dethroned to be
// replaced), holdout validation on unseen seeds.
// usage: node test/evolve.js [generations] [popSize]
'use strict';
const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const GA = require('./ga_lib');
const L = require('./opt_lib');

const GENS = parseInt(process.argv[2], 10) || 18;
const POP = parseInt(process.argv[3], 10) || 24;
const SEEDS_PER_GEN = 3;
const CHECKPOINT = path.join(__dirname, 'ga_checkpoint.json');
const CHAMPION = path.join(__dirname, 'best_genome.json');

const rng = GA.mulberry(20260817);

async function evalPopulation(pop, seeds, workers) {
  const jobs = pop.map((genome, id) => ({ id, genome }));
  const per = Math.ceil(jobs.length / workers.length);
  const promises = workers.map((w, i) => new Promise((resolve) => {
    const slice = jobs.slice(i * per, (i + 1) * per);
    if (!slice.length) return resolve([]);
    const onMsg = (msg) => {
      if (msg.type === 'done') { w.removeListener('message', onMsg); resolve(msg.results); }
    };
    w.on('message', onMsg);
    w.send({ type: 'eval', jobs: slice, seeds });
  }));
  const chunks = await Promise.all(promises);
  const fits = new Array(pop.length).fill(-Infinity);
  const wins = new Array(pop.length).fill(0);
  for (const chunk of chunks) for (const r of chunk) { fits[r.id] = r.fitness; wins[r.id] = r.wins; }
  return { fits, wins };
}

(async () => {
  const nWorkers = Math.max(2, Math.min(8, os.cpus().length - 2));
  const workers = [];
  for (let i = 0; i < nWorkers; i++) workers.push(fork(path.join(__dirname, 'ga_worker.js')));
  console.log(`evolve: pop=${POP} gens=${GENS} workers=${nWorkers}`);

  let pop, startGen = 0;
  if (fs.existsSync(CHECKPOINT)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    pop = cp.pop; startGen = cp.gen + 1;
    console.log(`resuming from checkpoint at gen ${cp.gen}`);
  } else {
    pop = [GA.DEFAULT_GENOME];   // warm start: the incumbent must be dethroned
    if (fs.existsSync(CHAMPION)) {
      pop.push(JSON.parse(fs.readFileSync(CHAMPION, 'utf8')).genome);
      console.log('warm-starting with the reigning champion');
    }
    while (pop.length < POP) pop.push(GA.randomGenome(rng));
  }

  let best = null;
  for (let gen = startGen; gen < GENS; gen++) {
    const seeds = GA.trainingSeeds(gen, SEEDS_PER_GEN);
    const t0 = Date.now();
    const { fits, wins } = await evalPopulation(pop, seeds, workers);
    const order = fits.map((f, i) => i).sort((a, b) => fits[b] - fits[a]);
    const b = order[0];
    best = { genome: pop[b], fitness: fits[b] };
    const mean = fits.reduce((a, x) => a + x, 0) / fits.length;
    console.log(`gen ${gen}: best=${fits[b].toFixed(1)} (${wins[b]}/${SEEDS_PER_GEN} wins) mean=${mean.toFixed(1)} [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
    fs.writeFileSync(CHECKPOINT, JSON.stringify({ gen, pop, fits }));
    pop = GA.nextGeneration(pop, fits, rng, {});
  }

  // holdout validation: the champion is judged on seeds it never trained on
  console.log('holdout validation on', GA.HOLDOUT_SEEDS.join(', '));
  const sb = L.makeSandbox();
  const evalOn = (genome) => {
    let fit = 0, wins = 0;
    for (const seed of GA.HOLDOUT_SEEDS) {
      const r = L.runMatch(sb, seed, genome);
      fit += L.fitness(r);
      if (r.verdict === 'WIN') wins++;
    }
    return { fit: fit / GA.HOLDOUT_SEEDS.length, wins };
  };
  const champHold = evalOn(best.genome);
  const defaultHold = evalOn(GA.DEFAULT_GENOME);
  console.log(`champion holdout: fit=${champHold.fit.toFixed(1)} wins=${champHold.wins}/${GA.HOLDOUT_SEEDS.length}`);
  console.log(`hand-authored holdout: fit=${defaultHold.fit.toFixed(1)} wins=${defaultHold.wins}/${GA.HOLDOUT_SEEDS.length}`);

  // the incumbent defends its crown under TODAY'S rules — a stored holdout
  // from an older ruleset is not a defense (§0.9: mechanics changes
  // re-price everything, champions included)
  const incumbent = fs.existsSync(CHAMPION) ? JSON.parse(fs.readFileSync(CHAMPION, 'utf8')) : null;
  const incumbentNow = incumbent ? evalOn(incumbent.genome) : null;
  if (incumbentNow) console.log(`incumbent re-scored under current rules: fit=${incumbentNow.fit.toFixed(1)} wins=${incumbentNow.wins}/${GA.HOLDOUT_SEEDS.length}`);
  if (!incumbent || champHold.fit > incumbentNow.fit) {
    fs.writeFileSync(CHAMPION, JSON.stringify({
      genome: best.genome, training: best.fitness, holdout: champHold.fit,
      holdoutWins: champHold.wins, generations: GENS, pop: POP
    }, null, 2));
    console.log('champion CROWNED → best_genome.json');
  } else {
    console.log(`incumbent stands (holdout ${incumbent.holdout.toFixed(1)} ≥ ${champHold.fit.toFixed(1)})`);
  }
  console.log('genome:', JSON.stringify(best.genome));
  for (const w of workers) w.kill();
  fs.unlinkSync(CHECKPOINT);
})();
