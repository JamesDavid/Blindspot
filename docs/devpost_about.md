# Devpost kit — copy

## Elevator pitch (first sentence carries the hook; only it shows uncropped)

Crime doesn't stop itself — it drives away, and your cameras are the only thing that remembers: they take pictures, pictures expire, and every camera you place teaches the crews where not to drive. BLIND SPOT is a tower-defense where the towers produce evidence instead of damage: log plates, corroborate routes, make arrests that must still stand up in court, and hold a city together while scrappers strip your poles for the solar panels. Too few convictions and you're relieved; too many wrong ones and you're relieved. Play it in one thumb, in portrait, in ten minutes.

## About — Inspiration

Classic top-down urban crime games watched cities from above; we wondered what it feels like to *be* the watcher — and to lose not by being overrun, but by being wrong. The design rule that emerged: both maximal and minimal surveillance must be losing strategies. That gave us a tower-defense with no damage numbers at all.

## What it does

Cameras read plates at a confidence set by geometry and weather — never dice. Reads above your evidence bar build cases; three reads tracing a coherent route make an arrest; the file must survive to trial or it collapses in court. Footage dies twice (on the pole if a vandal gets there before upload; off the drives as retention ages it out). Contested files surface as CHARGE/RELEASE judgement calls. Crews remember which cameras saw them and route around them, so your best camera decays *because* it's your best camera. Nine escalating shifts, then overtime until a weighed, refusable Review ends every match with a verdict.

## How we built it

Prompt-built, end to end — an AI coding agent wrote the architecture, the systems, the tests, and the tuning harnesses from a written spec; the human directed, playtested, and tuned by instruction. The sim runs headless-first: every system loads in a bare vm sandbox with no DOM, which made the whole battery possible — coherence proofs, crew-fairness proofs, an 8-seed outcome census, a scripted end-to-end test of the shift-5 signature strike, Playwright input/resume tests against the built file. Balance came from sweep harnesses driven by a scripted trial player, and the title-screen demonstrator's strategy is the champion of a genetic search (~1,300 headless matches), re-validated at the UI's one-action-at-a-time tempo before it was allowed to drive.

## Challenges we ran into

The honest ones: our first threshold sweep showed a lax evidence bar winning cleanly — the false-positive trap at the heart of the design was toothless until misread pressure was reshaped around ambiguity. The event queue silently ate everything player actions emitted (cleared at tick start), which made the signature-moment test "fail" while the game actually worked. Destroyed cameras shifted coherence distances after the fact until reads learned to remember their own pole. And a live playtest called the shipped pacing "slow and boring to watch" — the fix (prefilled streets, faster everything, a bigger opening budget) *inverted* our start-currency sweep: the optimum moved with the mechanics, exactly as our process notes warned it would.

## Accomplishments we're proud of

Every match ends — 8-seed census, 0 timeouts, verdicts that can go against you and can be refused. A demonstrator that plays the real interface and wins on camera. And the signature mechanic works: cameras watching cameras, where the vandalism your network records becomes the case that catches the crew.

## What we learned

Sweeps only count when the trial player honestly exercises the mechanic; a changed mechanic re-prices every tuned number; the phone is ground truth over any headless screenshot; and a player's "it feels slow" outranks a simulator's optimum — then, satisfyingly, the re-run simulator agreed.

## What's next

A persistent city of districts where crews carry learned routes between sessions, more unit and case types, and a campaign that follows the analyst precinct to precinct.
