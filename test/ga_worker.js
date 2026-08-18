// ga_worker — child process: evaluates genomes over seeds and reports
// mean fitness. One sandbox per worker, reused across evaluations.
'use strict';
const L = require('./opt_lib');

const sb = L.makeSandbox();

process.on('message', (msg) => {
  if (msg.type !== 'eval') return;
  const results = [];
  for (const job of msg.jobs) {
    let fit = 0;
    const details = [];
    for (const seed of msg.seeds) {
      const r = L.runMatch(sb, seed, job.genome);
      fit += L.fitness(r);
      details.push(r.verdict === 'WIN' ? 1 : 0);
    }
    results.push({ id: job.id, fitness: fit / msg.seeds.length, wins: details.reduce((a, b) => a + b, 0) });
  }
  process.send({ type: 'done', results });
});
