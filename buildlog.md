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
| 3 | (milestone 3: headless sim core) | `4c46fc0` | Full sim: sightlines/confidence, drives+upload cycle, cases/coherence, vandals with livelock guards, crew memory, shifts+overtime+Review, ladder, save. Fixed: destroyed cameras shifted coherence distances (reads now stamp their pole). |
| 4 | (milestone 4: trial player + full battery) | `daa7185` | Trial player exercises all three verbs; misread model reshaped (ambiguity-scaled, scene-local) after 70-bar files flooded with false evidence; threshold probe found the 55-60 ridge the design wants; event queue became a cursor ring after action-emitted events were silently wiped; shift-5 signature test green on 3 seeds; census 0/8 timeouts, Review rules both ways, refuse path works. Battery 7/7 green. |

**Problems & fixes this session:** (1) auto-closures at STRICT bar were a false-charge factory — oblique reads sat at conf 74 vs CLARITY 75; misattachment now scales with ambiguity and stays near the crime scene. (2) The signature sequence failed because the syndicate case closed *before* shift 5 — syndicate jobs now land late in their shift. (3) Events were cleared at tick start, wiping everything actions emitted between ticks — replaced with a seq-cursor ring every consumer reads independently.

**Where things stand:** headless game complete and tuned to a first playable band; next: renderer/UI (files 16+), then tutorial/demo/save wiring, Playwright tests, sweeps, GA.

| # | Prompt (summary) | Commit | Result |
|---|---|---|---|
| 8 | (milestone 8: evolution) | `62a56e6` | GA champion (14 genes, ~1300 matches): holdout 4/5 warrant wins vs 2/5 hand-authored — it discovered a lax-bar blitz that outruns the trust cost. Opposition evolved against it; LAWLESS tier graded (holds champion to fit 98 vs ~150), soft tiers kept authored so QUIET stays protective. Champion re-validated at one-action-per-3s demo tempo (4/5) then baked into WATCH A SHIFT, which wins on the warrant through the real UI at shift ~10, zero page errors. Also: screenshot pipeline, design-intent .docx generator riding 500/500 with a hard gate, README rewritten as a user manual, GitHub Pages hosting. |
| 7 | (milestone 7: sweep batch) | `4a081ab` | First sweep batch run and cited in CONFIG. Notable: the first threshold sweep exposed a toothless trap (LAX bar won cleanly) — misread pressure retuned 0.5→0.75 to restore the designed ridge; start-currency grid reproduced the previous prototype's shape exactly (richer starts plateau lower); bounty sweep was honest noise (collapse is clearance-driven) and the value was kept, not moved. Overtime census: 0 timeouts in every cell. |
| 6 | (milestone 6: browser battery) | `7a2785f` | test_input green (tap-to-place, pan≠tap, pinch, orphan-pointer recovery, refusal reasons); test_resume green (pagehide snapshot → offer → exact restore vs the snapshot itself → still ticking → decided match clears save). Two test-side races fixed (pole under HUD; comparing against a moving clock instead of the snapshot). |
| 5 | (milestone 5: DOM layer) | `58a051d` | Audio synth, night-city renderer (coverage overlay recolours board-wide with the dial), tap-first UI (menu columns EYES·UPLINK·WORKS·DIAL, quality pill, identity pills, contested cards), tutorial with pointing hand, WATCH A SHIFT demo driving the real UI, main loop with dt clamp + save-on-hide. Live smoke in a real browser: zero page errors; place flow, dial, ghost pill all verified on screenshots. Fixed: HUD stacked above title overlay. |
