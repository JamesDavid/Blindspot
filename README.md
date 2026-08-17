# BLIND SPOT

*Every camera you place teaches them where not to drive.*

A competition prototype: portrait-orientation, single-player tower defense where
the towers are traffic cameras. Cameras don't stop anyone — they take pictures,
and pictures expire.

**The camera is one system doing five jobs.** It is *evidence* (reads build
cases), *economy* (closures pay budget), *territory* (its sightline is the
ground you hold), *liability* (a degraded camera poisons your own case files),
and *bait* (it teaches crews where not to drive — and watches the vandals who
come for its neighbours).

## Play

- `node build.js` assembles `src/*.js` into `index.html` (runs from `file://`, zero network).
- `node serve.js` serves on :8080 with rebuild-per-request for LAN playtesting.

Three verbs: **place cameras** (tap an intersection), **move the threshold
dial** (the HUD slider), **adjudicate contested cases** (charge or release).
Too few cases closed and you are relieved; too many wrong people stopped and
you are relieved. Neither maximal nor minimal surveillance survives.

## Develop

- `src/NN_name.js` concatenated in filename order; CONFIG is `01` and holds every tunable with a provenance comment.
- Sim files (01–15) run headless in a bare `vm` sandbox — no DOM. Renderer/UI/tutorial/demo are the only DOM-aware files.
- `node test/run_all.js` — the battery. It runs after every commit.
- `test/opt_*.js` — balance sweeps; `test/evolve.js` — the genetic trial-player pipeline.

## Docs

- `BLINDSPOT_master_spec.md` — the master spec (source of truth).
- `buildlog.md` — the running build log.
