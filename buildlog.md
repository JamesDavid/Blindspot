# BLIND SPOT — Build Log

A running record kept during the build. Prompt-built with an AI coding agent
(Claude Code); the human directed, playtested, and tuned by instruction.

---

## Decisions locked so far

- **Genre:** Tower Defense & Strategy. Cameras are the towers; they produce information, not damage.
- **Scope:** the master spec (`BLINDSPOT_master_spec.md`) is the source of truth; §3 "What Actually Ships" governs; §37/§24 cuts are pre-authorized.
- **Platform:** single-player, portrait, Three.js, one self-contained `index.html`, zero network requests at runtime.
- **Architecture:** source in `src/NN_name.js`, concatenated by `node build.js` into `index.html` from `shell.html`. CONFIG is file 01. Sim/DOM separation is architectural: every system file through the sim tick runs in a bare `vm` sandbox with no DOM; only renderer/UI/tutorial/demo touch the DOM.
- **Determinism:** `mulberry32(hash(seed + ':' + nonce))`, never `Math.random()` in sim code. Same seed string → same map, always. The re-roll nonce is a deterministic counter, not a time salt.
- **All tunables in one frozen CONFIG block**, every constant carrying a provenance comment (swept / player-directed / judgment-tuned). No numeric literals in system logic.
- **Test battery runs after every commit**; a commit against a red battery does not happen.
- **Every match ends:** overtime shifts after shift 9, then the Commissioner's Review — a weighed verdict that can go either way, refusable. Census target: 8 seeds, 0 timeouts.
- **Three verbs only:** place/relocate a camera, move the threshold dial, adjudicate contested cases. New features must live inside an existing verb's surface.
- **Anonymity:** no real brands, games, places, or people anywhere in the package, including code comments and this log. The previous competition prototype is referred to as "the previous prototype", never by name.
- **Build log discipline:** code commits first (`feat:`/`fix:`/`tune:`/`cut:`), the log row citing the hash rides in the *next* commit (lag-by-one).

---

## Session 1 — 2026-08-17

**Tools:** Claude Code (agent does the heavy lifting: architecture, code, tests, tuning harness), git, Node 22, Playwright for browser tests.

**Built:** repo scaffold — build pipeline (`build.js`, `shell.html`, `serve.js` with no-store headers), vendor Three.js (MIT), this log.

**Decisions made:** all of the "Decisions locked" list above, inherited deliberately from the previous prototype's paid-for lessons, which the spec encodes.

### Prompts and commits

| # | Prompt (summary) | Commit | Result |
|---|---|---|---|
| 1 | "implement the spec, abide by rules and buildlog requirements, repo at each milestone, all steps incl. tuning, evolution, asset creation" | `70ca2d1` | Repo scaffold: build pipeline, vendor lib, log |
| 2 | (same directive, milestone 2) | `aef11d6` | CONFIG + PRNG utils + validated deterministic mapgen; test_mapgen green: 200/200 seeds converge, 0 fallbacks, golden seed valid |
