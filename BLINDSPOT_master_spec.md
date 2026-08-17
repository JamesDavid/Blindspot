# BLIND SPOT
## Competition Prototype Master Spec — v2, revised with everything WINDWARD taught us

> *Every camera you place teaches them where not to drive.*

**Purpose:** Single source of truth for a coding agent.
**Scope:** Three-week competition prototype, not the full game.
**Genre:** Tower Defense & Strategy.

---

# 0. Lessons Carried Forward

Written after TWO specs for this competition: one that overran, and one (WINDWARD) that shipped, was judged-ready, and was live-playtested for days. The first six constraints survive from before; the rest were paid for.

1. **Focus is 15 % of the score** and explicitly penalises "over-scoped sprawl." This document is deliberately smaller than it wants to be. §37 lists what gets cut first, written before the build starts.
2. **Visual polish is scored at 0 %.** Spend nothing on art that legibility does not require.
3. **Every tunable value lives in one CONFIG block** (§22). No numeric literals in system logic.
4. **The signature moment is scripted, not hoped for** (§14.4) — *and verified by an automated end-to-end test that replays it headlessly on every build.* WINDWARD's wave-5 strike had `test_wave5.js`; shift 5 gets `test_shift5.js`. "Build the game so this is reliable" means a test proves it, not a developer believes it.
5. **Every feature has a stated cut path.** If it goes, what else has to change is written down now.
6. **No real brands** — and this extends further than you think. WINDWARD's final rules audit found game-name references *in shipped code comments inside index.html* and in the build log. Scrub brand names from **code comments, the build log, and the design intent**, not just the UI. The only third-party names allowed anywhere in the package are MIT attribution headers inside `/vendor` files, which the licenses require.
7. **Every match must end with a verdict.** WINDWARD's 8-seed census found half of all matches fizzling into full-health stalemate timeouts — the waves ended and nothing forced a conclusion. The fix (overtime escalation + a weighed judgment that can go either way) took a day and transformed the game. BLIND SPOT bakes this in from the start (§16.1). *Run an outcome census early: 8 seeds, extended horizon, count timeouts. The target is 0/8.*
8. **A balance sweep only counts if the scripted trial player actually exercises the mechanic.** WINDWARD swept divine-power prices before the trial player ever cast a power — confident-looking noise. The trial player (§29) must place cameras, **move the threshold**, **adjudicate contested cases**, relocate, and buy upgrades, or those constants cannot be honestly tuned. Constants the script can't exercise are marked *judgment-tuned* in CONFIG comments, never presented as swept.
9. **Every mechanics change re-prices every tuned number.** WINDWARD re-ran its difficulty grid three times (after the weapon rework, after horde compositions, after the wind law) and the optimum moved every time. Sweeps must be one command each, cheap enough to re-run reflexively.
10. **Headless is not live.** Two independent WINDWARD lessons: (a) software-rendered screenshots passed while real GPUs showed a flat broken ocean — a GLSL variable shadowing a builtin, and a NaN from reading a smoothed value before seeding it. **The phone is ground truth**; live-browser debugging (remote DevTools / MCP) is part of the toolchain, not a luxury. (b) A strategy evolved at headless act-rates *collapsed* when piped through a one-action-at-a-time UI — different action tempos are different games. Never assume a headless-validated behaviour transfers to the interactive layer without a live check.
11. **Silent states are frustration.** Every wait, refusal, and invisible modifier needs a voice: a one-line ticker the first time it happens, and a status readable by tapping the thing. WINDWARD's wind-waits generated three bug reports before they got a ticker; they were never reported again after.
12. **A changing label makes a floating UI jitter.** Any live readout (confidence preview, threshold effect) rides its **own fixed-position pill**, never inside a button whose width re-clamps every frame.
13. **Effects must never occlude the board.** WINDWARD's shelter dome hid everything it protected; the painted replacement ring covered sea-level lanes. The rule that survived: fx use **additive blending** (light is added; nothing behind is hidden) and **contrast against their own surface, not the backdrop** — white streaks on ivory roads were invisible; gold ones read instantly.
14. **Ship a build stamp.** `BUILD 2026-xx-xx hh:mm UTC`, small, on the title screen, injected by the build script. Stale phone caches *twice* made a WINDWARD playtester report bugs that had been fixed for hours. The stamp turns "which version is my phone running" into a glance.
15. **Release discipline: tag at the exact commit the asset was built from, and never clobber an asset in place.** WINDWARD's release went stale because the tag pointed two days behind the repeatedly-overwritten zip. Any change to packaged content = delete-and-recreate the release at a new tag, staging directory rebuilt empty, every component regenerated in the same pass.

---

# 1. Judge Pitch

> **You run a city's camera network. The cameras don't stop anyone — they take pictures, and pictures expire. Solve cases before the footage rolls off the drives, keep the threshold high enough that you aren't pulling over the wrong people, and hold the network together while scrappers strip your poles for the solar panels. Every camera you place teaches the crews where not to drive.**

Genre gloss, for a rubric: cameras are the towers, crimes are the waves, budget and public trust are the economy, and escalation comes from crews adapting to your coverage.

## 1.1 The four beats

1. **Towers that produce information, not damage.** A Cyclops logs a plate. It never stops anybody.
2. **Two ways to fail.** Too few cases closed and you are relieved. Too many wrong people stopped and you are relieved. Neither maximal nor minimal surveillance survives.
3. **Evidence decays.** Cameras hold a limited window. A case not built in time is not a case.
4. **Coverage is self-defeating.** Crews remember where they were caught and route around it. You are chasing a distribution that moves away from you.

## 1.2 One system, five jobs *(new — the WINDWARD "one road, five jobs" framing)*

The judges' rubric rewards a coherent core. State it the way WINDWARD stated its road: **the camera is one system doing five jobs.** It is *evidence* (reads build cases), *economy* (closures pay budget), *territory* (its sightline is the ground you hold), *liability* (a degraded camera poisons your own case files), and *bait* (it teaches crews where not to drive — and watches the vandals who come for its neighbours). Write the design-intent doc and the README around this sentence. If a proposed feature doesn't deepen one of the five jobs, it fails §27.

---

# 2. Setting

An unnamed mid-size city. No real place, no real department, no real vendor.

**Cyclops** is the fictional manufacturer of the pole-mounted units. Solar panel, battery, local drive, cellular uplink on a cycle.

The player is a civilian analyst running the camera desk. Not a beat officer, not a chief — someone at a screen deciding where the eyes go and which hits are worth acting on.

## 2.1 Art direction: top-down urban, roofs and roads

A fixed oblique top-down camera over a night-leaning city — the classic top-down-crime-game read, and exactly right for this design, because from above **the roads carry all the information**. Rules:

- **Buildings are dark flat-roofed blocks**, procedural boxes with a rooftop detail or two (vents, a water tank) so blocks are tellable apart. They exist to frame the roads, never to compete with them.
- **Roads are the canvas:** asphalt greys, lane markings, sodium-amber pooling at intersections. All *signal* colors (read flashes, threshold recolor, reroute dotted lines, drive icons) are reserved for game state and appear nowhere in the ambient palette — WINDWARD's contrast rule (§18.1) applied city-wide.
- **Vehicles are small capsule boxes with headlight cones** and a plate-ghost that flashes at a camera on a read. No people are ever rendered; crimes are an icon at the spawn, vandals are hooded capsule figures at the pole. Nothing violent is depicted — the game watches aftermaths, which fits both the fiction and the content rules.
- **Cameras read at a glance:** the Post a simple pole-and-head, the Long visibly *aimed* (its lens-hood wedge, §12), the Dome a half-sphere, the Relay a mast with a blinking uplink. Grime and tilt for degradation (§18).
- **The reference feel is 90s top-down urban crime games — but per §0.6 no game is ever named** in shipped text, code comments, the build log, or the design intent. In those documents the style is called *top-down urban*. (WINDWARD was bitten by exactly this: inspiration names in shipped comments, found by the final audit.)
- All of it procedural three.js geometry, zero image assets, consistent with visual polish being worth 0 %% of the score — this direction is chosen because it is the *most legible* option, not the prettiest.

**Tone: dry and procedural, never triumphant.** The game does not celebrate arrests or lecture about surveillance. Both errors cost you, and the systems say so without a word of commentary. No political content, no real-world referents, nothing that reads as a position.

*(WINDWARD note on tone drift: mid-match "voice" lines multiplied until a playtester demanded they be "gone — ever." Budget the flavour lines at the start: the onboarding script, the first-time-teaching lines, and the end screens. Nothing talks during play except the log, and log lines are facts.)*

---

# 3. What Actually Ships

Written first, deliberately. Everything below this line in the document is subordinate to it.

**In the prototype:**

- one city grid, deterministically generated per match from a seed
- three camera types and one relay
- placement, sightlines, confidence, degradation
- the threshold dial
- crimes, escape routes, sightings, case files
- data retention and expiry, local storage and upload cycle
- contested-case adjudication
- clearance and trust meters, both lethal
- three vandal types
- crews learning coverage
- nine shifts with an authored escalation table — **then overtime and the Review (§16.1): every match ends**
- the Syndicate warrant as a win condition
- win, lose, reset
- **save/resume on focus loss (§17.2) — this is a mobile game and life happens**
- **the guided pointing-hand tutorial (§17) and a WATCH A SHIFT self-playing demo on the title screen (§17.3)**
- **a four-tier opponent-pressure ladder with silent skill matching and a visible mood readout (§13.4)**
- **the balance-sweep suite (§29) and the genetic-evolution pipeline (§30) — planned work, not stretch: they are how WINDWARD got tuned and how its demo got good, and they are cheap because the harness makes them cheap**

**Not in the prototype:** multiple maps, multiple cities, officer units, pursuit, court outcomes, detective assignment, day/night cycle as a system, camera types beyond the four, any narrative campaign.

---

# 4. Core Loop

```text
Place a Cyclops at an intersection
        ↓
Crimes occur; suspect vehicles drive escape routes
        ↓
Cameras in sightline log plate reads at some confidence
        ↓
Reads above the threshold become case evidence
        ↓
Enough corroborating evidence → CASE CLOSED → budget
        ↓
Contested cases surface for the player to charge or release
        ↓
Evidence expires; scrappers strip poles; crews learn your coverage
        ↓
Reposition, upgrade, retune the threshold
```

Repeat, escalating, for nine shifts — then overtime until a verdict (§16.1).

## 4.1 Three verbs, one primary

| Verb | Frequency | Role |
|---|---|---|
| **Place / relocate a camera** | constant | the primary action |
| **Move the threshold dial** | occasional | the strategic decision |
| **Adjudicate a contested case** | a few times per shift | the judgement call |

Nothing else. No unit command, no pursuit, no camera facing micro-adjustment beyond placement.

*(WINDWARD lesson on verb creep: every feature added late in that build was pressed into one of the existing verbs — powers moved INTO the context menu, the fleet upgrade INTO the yard dialog. When a new feature needs a home, find it inside an existing verb's surface. A fourth verb is the cut test failing.)*

---

# 5. The Grid

A city street grid on a **9 × 16 portrait lattice** of intersections, connected by road segments.

| Element | Rule |
|---|---|
| Intersection | a mountable site; at most one Cyclops each |
| Road segment | connects two adjacent intersections; carries traffic |
| Arterial | high-traffic segment, faster vehicles, worse read confidence |
| Exit | a map-edge node a suspect vehicle is trying to reach |

Vehicles move along segments at one segment per second, modified by road class.

*(Sizing note from WINDWARD: it sized its world in portrait-screen tiles from a single CONFIG entry and scaled content counts automatically. Keep `Grid.W/H` as the one knob and derive everything — spawn zone counts, arterial quotas, vandal budgets — from area, so a late "the map feels cramped" note is a one-number change.)*

---

# 6. Sightlines and Confidence

## 6.1 What a camera sees

A Cyclops reads plates on segments within its **sightline**, which is a function of type, distance, and geometry — not a circle.

> **Confidence is environmental, never random.** The same camera on the same segment always yields the same base confidence. Variation comes from conditions, not from a die roll.

## 6.2 Confidence factors

| Factor | Effect on confidence |
|---|---|
| Distance | falls with each segment of range |
| Angle | head-on reads best; oblique worst |
| Road class | arterial traffic is faster, reads worse |
| Weather | rain shifts the whole map down for a period |
| Lens condition | degrades with damage and neglect (§11) |

**Placement is therefore about sightline quality, not coverage area.** A camera at a bad angle on a busy arterial is a false-positive factory, and a judge should be able to feel that within two minutes.

## 6.3 The placement ghost quotes its quality *(new — WINDWARD's wind readout)*

WINDWARD's single most-appreciated late feature was the ghost that quoted the wind before you committed ("HEADWIND ×0.69"). BLIND SPOT's placement ghost does the same: while siting a camera, a fixed pill above the confirm row reads the **best and worst base confidence** the unit will achieve from that pole ("READS 84 BEST / 41 ON THE ARTERIAL"), banded into words (**CLEAN / SERVICEABLE / LIAR**) at the current threshold. The player should never discover a false-positive factory after paying for it. Rules from §0.12 apply: the readout is its own pill; the CONFIRM button's label never changes width.

## 6.4 Reads

Every vehicle passing through a sightline produces a read:

```text
read.trueMatch   = whether this is genuinely the suspect vehicle
read.confidence  = 0–100, from the factors above
```

A read enters the case file **only if `confidence ≥ threshold`** (§7).

---

# 7. The Threshold Dial

The single most important control in the game, and the reason it is a game rather than a placement puzzle.

A global slider, adjustable at any time, from 0 to 100.

| Setting | Consequence |
|---|---|
| **Low** | more reads qualify; cases close fast; innocent plates enter case files |
| **High** | only clean reads qualify; few false positives; cases expire unbuilt |

**There is no correct setting — only a correct setting for the current board.** Coverage quality, weather, shift pressure, and how much evidence is about to expire all move the right answer. The player should end up touching this dial constantly and never feeling they have solved it.

## 7.1 False positives

A read where `trueMatch == false` but `confidence ≥ threshold` enters the case file as bad evidence. If a case closes on bad evidence, the wrong plate is charged:

- **Trust penalty**
- the actual crew escapes, and their case goes cold
- the closure still pays budget, so the player is *rewarded in the short term for being wrong* — which is precisely the trap the trust meter exists to punish

## 7.2 The dial has a face *(new)*

Per §0.11, the dial's current meaning is always visible in words, in the HUD next to the shift clock: **"BAR AT 70 — STRICT"** through bands (LAX / EASY / FAIR / STRICT / SEVERE). When rain or degradation shifts effective confidence map-wide, the band label does **not** move (the dial didn't) — but the board recolour (§18) does, and that visible divergence between "what I asked for" and "what I'm getting" is the teaching moment. First time it happens, one log line: *"Rain. Same bar, fewer clean reads."*

---

# 8. Cases

## 8.1 Structure

```text
Case
- id
- crimeType
- suspectPlate
- evidence[]        # qualifying reads
- openedAt
- coldAt            # openedAt + CASE_LIFETIME
- syndicate         # whether the plate belongs to the Syndicate
```

## 8.2 Closing a case

A case closes when it holds **three corroborating reads** whose combined confidence exceeds the closure bar, and whose timestamps trace a coherent route.

- **Coherent** means the reads are consistent with one vehicle's travel — sequential in time, adjacent in space. Two sightings on opposite edges of the map one second apart do not corroborate; they contradict.
- Contradictory evidence does not merely fail to help. It **flags the case as contested** (§9).

## 8.3 Cold cases

An unclosed case at `coldAt` goes cold: clearance penalty, no budget, and if the plate was Syndicate, that warrant progress is lost.

## 8.4 Coherence is a provable invariant *(new)*

WINDWARD's most trusted test was `test_fairplay.js`: a headless proof that every enemy lane traced home or died on a timer, run on every build. BLIND SPOT's equivalent: **`test_coherence.js`** — headlessly simulate full matches and prove that (a) no case ever closes on an incoherent route, (b) every closed case's evidence chain is reconstructible from the read log, and (c) a contradictory pair always flags contested, never closes silently. The adjudication card's credibility rests on this being *provably* true, because the player is asked to reason about it.

---

# 9. Contested Cases

Cases whose evidence is near the closure bar, or internally contradictory, do not resolve automatically. They surface as a card the player must act on.

```text
CONTESTED — 2 reads, 1 contradiction
[ CHARGE ]        [ RELEASE ]
```

| Choice | If the plate was right | If it was wrong |
|---|---|---|
| **Charge** | case closed, budget, warrant progress | trust penalty, crew escapes |
| **Release** | case goes cold, clearance penalty | nothing lost, small trust gain |

The card shows the evidence — how many reads, at what confidence, from which cameras, with contradictions marked. **The player is given enough to reason with and never enough to be sure.** That is the design intent; do not add a certainty indicator.

**Volume: 2–4 contested cases per shift.** Enough to matter, few enough to stay a judgement call rather than a queue to grind.

## 9.1 Cards never softlock *(new)*

A contested card unanswered at the case's `coldAt` auto-resolves as **RELEASE** (the conservative outcome) with the normal clearance penalty and a log line. WINDWARD's rule after its refused-button loop bug: every player-facing prompt has a defined unattended outcome, and the self-playing demo (§17.3) must be able to act on every card through the real UI.

---

# 10. Data Retention

Two clocks, and they are the reason urgency exists without an arbitrary timer.

## 10.1 Local storage and upload

Every Cyclops stores reads on a local drive and **uploads on a cycle**.

> **A camera destroyed before its upload loses everything it has recorded since the last one.**

This is the most distinctive consequence in the design: destroying a tower costs the player *retroactively*, not just prospectively. A scrapper who takes a pole thirty seconds before upload has erased the evidence that was about to close a case.

**Counterplay:** a **Relay** (§12) uploads its neighbours' data continuously, removing the window entirely for cameras adjacent to it. This is the mechanical reason Relays exist.

## 10.2 Retention window

Uploaded reads live in the case system for a limited period, then expire. Not deleted for drama — the drives are finite and the fiction says so.

Consequence: **a case must be built faster than its evidence decays.** A high threshold produces fewer qualifying reads, so evidence trickles in and can expire before three corroborating reads accumulate. The threshold dial and the retention clock are directly coupled, and that coupling is the heart of the game.

## 10.3 Upgrade axis

Storage upgrades extend retention. They compete for budget with new cameras. **More memory or more eyes** is a real, recurring decision.

## 10.4 Watch the starvation boundary *(new)*

WINDWARD's wind law — beautiful on paper — starved a whole reference match to zero deliveries before a pressure valve was added. Retention × threshold has the same failure shape: a strict bar plus a short window can make case-building *mathematically impossible* on some boards, which reads as a broken game, not a hard one. Guard it three ways: (1) the trial-player census (§29.3) must show closures happening at every swept threshold band; (2) a **floor valve** — evidence within `STARVATION_GRACE` of expiry glows on the case card so the player sees the wall coming; (3) if a full shift passes with zero qualifying reads network-wide, the log says why (*"Nothing cleared the bar this shift."*) — never silence.

---

# 11. Vandalism and Degradation

## 11.1 Degraded cameras lie

> **A damaged Cyclops does not stop working. It starts reporting badly.**

Damage lowers confidence without announcing it clearly. The camera still contributes reads; those reads are simply worse, and at a given threshold that means more false positives from that pole. **A degraded camera is worse than a destroyed one, because the player acts on its data.**

This is the freshest idea in the design and it must survive any cut.

*(Legibility bound, from §0.11: "without announcing it clearly" must not mean "silently." The camera shows grime and tilt (§18), its reads render dimmer, and tapping it names its condition — "CYCLOPS POST — LENS FOULED." What stays hidden is the *magnitude* of the confidence loss, not the fact of it. WINDWARD's rule: hide quantities if you like, never hide states.)*

## 11.2 The three types

| Type | Wants | Behaviour | Counter |
|---|---|---|---|
| **Scrapper** | the solar panel and battery | destroys isolated poles, prefers cameras far from others | hardened mounts; mutual coverage |
| **Tagger** | nothing; bored | degrades confidence rather than destroying | cleaning; cheap to fix if noticed |
| **Fixer** | to blind you before a job | targets the single highest-coverage camera, shortly before a Syndicate crime | relocation; redundancy |

Scrappers and taggers are opportunists, not ideologues. **Nobody in this game is cutting cameras down as a political act**, and no dialogue, flavour text, or visual should imply otherwise.

## 11.3 Cameras watching cameras

**The signature mechanic.**

A pole within another camera's sightline is protected in the only way this game can protect anything: the vandalism gets **recorded**, which opens a case, which is how the player catches the scrapper crew.

Coverage of your own network is coverage. A player who works this out has understood the game, and the moment they do should be legible — the first time a scrapper is caught on a neighbouring camera, say so plainly in the log.

## 11.4 Vandal AI must not livelock *(new)*

WINDWARD's AI froze all building for entire matches because a reaction-pause re-armed on every cut under sustained pressure (the "turtling anomaly"), and separately blockaded itself by capping its own lanes with solid towers. The debugging pattern that found both: **build-time censuses** (count intended actions at the moment of decision, not survivors at match end) and instrumented traces on the exact seed a playtester reports. For BLIND SPOT: cap simultaneous vandals; rate-limit each crew's target reselection; and give every vandal an *unreachable-target fallback* (abandon after `N` seconds, pick next) so a fully-hardened network never produces a vandal spinning in place. Write `test_vandals.js` asserting: no vandal idles > 10 s with a legal target available, and vandal action counts at each shift fall inside authored bands.

---

# 12. Cameras

Four units. Unit variety as the genre brief asks, without a catalogue.

| Unit | Cost | Sightline | Confidence | Notes |
|---|---:|---|---|---|
| **Cyclops Post** | 40 | 2 segments, all four directions | medium | the workhorse |
| **Cyclops Long** | 60 | 5 segments, one direction, narrow | high | needs a straight run; useless at a bend |
| **Cyclops Dome** | 55 | 1 segment, all directions | low–medium | intersection specialist, many angles, poor reads |
| **Relay** | 35 | none | — | continuous upload for adjacent cameras (§10.1); extends nothing else |

**The Long is aimed at placement, forever** — same doctrine as WINDWARD's fixed-sector batteries, which played far better than turreted ones: the aim decision happens at purchase, with twin ↺ ↻ turn buttons on the ghost, and never changes after. This makes placement the skill and keeps the running game readable. Show the Long's chosen direction permanently on its model (a small lens hood wedge), sized modestly — WINDWARD's first sector markers "painted the whole map" at full range and had to be shrunk to hull-level marks.

## 12.1 Upgrades

| Upgrade | Cost | Effect |
|---|---:|---|
| Hardened mount | 25 | vandal resistance |
| Storage | 30 | longer retention on this unit |
| Clean lens | 10 | restores confidence lost to degradation |

**Relocation** costs half the unit's price and is the answer to crews learning coverage (§13). It should be cheap enough to be a routine move, not a last resort.

## 12.2 Where the verbs live *(new — the WINDWARD context menu, proven at length)*

All interaction is **location-first, at the thumb**:

- **Tap any intersection** → a context menu opens at the tap point, options in **labelled category columns** (EYES · UPLINK · WORKS · DIAL), each button carrying a one-line explanation and its cost, with a **✕ dismiss chip at the end of the bottom row** (in-flow, so it can never clip at a screen edge — two absolute-positioned attempts both clipped in WINDWARD).
- **Tap anything and it names itself** — every camera, vehicle ghost, case pip, and even empty road answers a tap with an identity line ("ARTERIAL — FAST TRAFFIC, POOR READS"). This one feature eliminated an entire class of "why can't I…" bug reports in WINDWARD; disabled buttons stay tappable and *explain their refusal* (mobile has no tooltips).
- **Ghost → turn → CONFIRM** for placements, confirm row styled identically to the menu, floating beside the ghost, clamped on-screen. The quality pill (§6.3) rides above it.
- The threshold dial lives in a persistent slim HUD strip (it is the one global control), everything else goes through the tap menu. **The bottom bar stays empty; the whole screen belongs to the map.**
- **Give every menu button a `data-key`.** This is free, and it is what makes the self-playing demo (§17.3), the Playwright input tests (§28), and screenshot staging scripts possible. WINDWARD retrofitted this; BLIND SPOT ships with it.

---

# 13. Crews Learn

The escalation engine, and the reason the game does not stabilise.

```text
A crew is sighted by camera C
        ↓
C enters that crew's KNOWN set
        ↓
future escape routes weight away from C
        ↓
crime migrates to the roads you are not watching
```

**Your best camera degrades in usefulness precisely because it is your best camera.** Coverage is self-defeating, and no amount of budget fixes it — only movement does.

Counters, all already in the design: relocate; place Longs on approaches rather than on known routes; accept a blind spot deliberately and cover its downstream exits instead.

**Cap the effect.** Crews forget after a period, and no crew may avoid more than a set fraction of the network, or a well-played match becomes a map with no crime on it and nothing to do.

## 13.1 Fairness is a test, not a promise *(new)*

§20.3's "the AI does not read the player's placements directly" is exactly the kind of claim that silently rots. `test_crewfair.js`: headless matches asserting a crew's KNOWN set ⊆ the set of cameras that have actually produced a read on that crew. WINDWARD ran its equivalent on every build for its entire life; it caught two regressions.

## 13.2 Learning is visible *(new)*

When a route bends around a KNOWN camera, the dotted reroute line (§18) shows it — and the *first* time it happens, one log line: *"They've made the pole on 5th. They're going around."* WINDWARD's crews-adapt moment landed only after it got its one-time announcement.

## 13.3 Rate limits *(new, from §11.4's lesson)*

A crew re-weights its routes at most once per `RELEARN_COOLDOWN`, and KNOWN entries carry timestamps so forgetting is per-camera, not per-crew-wipe. Without the cooldown, a dense network makes crews oscillate every tick and traffic looks like static.

## 13.4 The pressure ladder and silent skill matching *(new — planned, with cut path)*

WINDWARD's most successful late system: opponent pressure as a **four-tier ladder** of parameter sets, a **silent per-wave matcher** stepping one rung at a time based on a neutral board tally, a **visible mood line**, and a **persistent memory** of the player across sessions. Port the shape:

- **Tiers:** `QUIET → RESTLESS → BRAZEN → LAWLESS` — parameter sets over crime rate multiplier, vandal budget, crew learning speed, Fixer count, contested-case frequency. Start hand-authored; if time allows, grade them by simulation against the champion trial player (§30).
- **The tally:** at each shift telegraph, compute the player's standing from clearance, trust, warrant progress, and network integrity (working cameras ÷ built cameras) — the same composite the Review (§16.1) uses, which keeps the difficulty system and the endgame judgment honest with each other. Above the upper band → step up a rung; below the lower → step down. **Silent, one rung at a time, real matches only** (never in headless sims or sweeps — gate on a `state.dda` flag).
- **The mood line:** under the shift clock: **"THE STREETS ARE BRAZEN."** Players forgave WINDWARD's rubber-banding *because they could see it* — hidden DDA reads as cheating when discovered; visible DDA reads as a living world.
- **Memory:** localStorage: an exponential moving average of end-of-match standing plus a slowly-decaying peak; the next match opens at `round((ema + peak)/2)`. Returning strong players are greeted by a brazen city from shift 1. Demo matches never touch the memory.
- **Cut path:** ship `RESTLESS` as the fixed tier; ladder and matcher move to future state; the mood line becomes static flavour. Nothing else changes — which is exactly why this is safe to attempt.

---

# 14. Shifts

Nine authored shifts. The schedule is fixed so that a judge always sees escalation; composition responds to the board.

| Shift | Adds | Teaches |
|---|---|---|
| 1 | 2 petty crimes, slow vehicles | reads, cases, closure |
| 2 | 3 crimes | one camera is not enough |
| 3 | first scrapper | the network needs defending |
| 4 | first contested case | evidence can be ambiguous |
| 5 | **Fixer strike, scripted** | §14.4 — the signature sequence |
| 6 | rain — confidence drops map-wide | the threshold must move |
| 7 | crews visibly routing around known cameras | coverage is self-defeating |
| 8 | **surge** — crime rate up, retention pressure peaks | endgame |
| 9 | Syndicate's largest job | win or lose |

## 14.1 Timing

| Shifts | Interval |
|---|---|
| 1 → 3 | 55 s |
| 4 → 6 | 45 s |
| 7 → 9 | 35 s |

Approximate resolution: **7:00–7:30** — *for a decided match. Undecided matches continue into overtime (§16.1); the census target is every match decided by ~11:00 worst case.*

## 14.2 Escalating cadence, not escalating noise

Compressing the shift interval is free difficulty. Crime *volume* rises modestly; what really rises is the number of simultaneous open cases competing for a retention window that has not grown.

*(WINDWARD correction: its early waves also "escalated" on paper but a playtester couldn't feel the hordes. Escalation must be **visible in the fiction**, not only in the numbers — more distinct vehicles on screen, the case rail visibly crowding, the HUD narrating volume: "SEVEN CASES OPEN." Numbers players can't see don't count as escalation.)*

## 14.3 Weather

Rain enters at shift 6 and recurs. It lowers confidence across the whole map for its duration, which forces a threshold change and is the clearest possible demonstration that the dial is not a set-and-forget.

## 14.4 The scripted signature sequence — shift 5

By shift 5 the player reliably has one high-coverage camera carrying an in-progress Syndicate case. The Fixer targets it deliberately.

```text
Fixer destroys the highest-coverage camera
        ↓ its unuploaded reads are lost
        ↓ the Syndicate case loses its corroboration
        ↓ CASE AT RISK warning, expiry visible
        ↓ player has ~25 s: relocate, re-cover the route, or drop the threshold
        ↓ a new read lands
        ↓ CASE CLOSED — warrant progress survives
```

Twelve seconds that demonstrate placement, retention, vandalism, the threshold dial, and recovery at once. **Build the game so this is reliable, and prove it with `test_shift5.js`** — a headless end-to-end test that scripts a plausible player to shift 5, fires the strike, performs the recovery, and asserts the case closes. WINDWARD's equivalent test caught three regressions in systems that had nothing obvious to do with waves.

## 14.5 The shift clock waits for the tutorial *(new)*

While the guided tutorial (§17) is active, `shift.nextAt` slides forward each frame — the first shift never lands on a player who is still learning to place. Headless sims never create the tutorial object, so tests and sweeps are unaffected. Straight lift from WINDWARD; it is three lines and it saves the entire first-session experience.

---

# 15. Economy

## 15.1 Budget

Earned on case closure, scaled by crime severity. Spent on cameras, upgrades, relocation.

Closures pay **whether or not the charge was correct**. This is deliberate: the short-term incentive points the wrong way, and only the trust meter corrects it.

## 15.2 Clearance

Rolling percentage of cases closed versus gone cold. **Falls below the floor and the match is lost.**

## 15.3 Trust

Starts at a comfortable level. Falls on false charges. Rises slowly on correct releases and on clean shifts.

| Trust level | Effect |
|---|---|
| High | citizen tips reveal a crime's start location early |
| Normal | — |
| Low | tips stop; budget per closure reduced; vandalism reported later, so scrappers work longer before you see it |
| Floor | **match lost** |

The low-trust loop matters: **over-charging degrades the network that makes charging possible.** No commentary is required; the numbers say it.

## 15.4 Price things in the meter they stress *(new — WINDWARD's two-currency doctrine)*

WINDWARD's economy clicked when a doctrine was stated: physical things cost coin, divine things cost favour, and what is both costs both. BLIND SPOT's analogue: **hardware costs budget; judgment costs trust.** Cameras, upgrades, relocation — budget. Charging on thin evidence — trust, win or lose the gamble. Never invent a third currency, and never let budget buy trust back directly (that is the trap §7.1 exists to set).

## 15.5 Comeback money *(new)*

WINDWARD's sweep found that doubling kill-bounties was neutral on healthy seeds and *rescued* collapsing ones — comeback income is what lets a battered player rebuild. BLIND SPOT's analogue: closing a case against a **vandal crew** (§11.3) pays a bounty scaled to the damage they did. Sweep it (§29); expect the same shape.

---

# 16. Win and Lose

**Win — the warrant.** Closed cases whose plates belong to the Syndicate add warrant evidence. Warrant evidence **decays**, so progress must outpace the leak. Reach the threshold and the raid resolves the match.

**Lose —** clearance below its floor, or trust below its floor. Both are announced with a shift of warning.

**Reset —** one tap, new seed. *Plus AGAIN and BACK TO MENU on every end screen — WINDWARD needed both.*

## 16.1 Every match ends: overtime and the Review *(new — the single most important addition)*

The spec as written has WINDWARD's exact stalemate hole: a player who keeps both meters above floor but never completes the warrant plays forever, and the match fizzles. WINDWARD's census measured this at **half of all matches**. The fix, ported whole:

- **Overtime shifts.** After shift 9, shifts keep coming every `OVERTIME_INTERVAL` (30 s), escalating crime rate and vandal budget by `OVERTIME_STEP` per shift toward a cap. The HUD reads **"OVERTIME — SHIFT 11."** The city does not go quiet because the schedule ran out.
- **The Commissioner's Review.** Survive `REVIEW_AFTER` overtime shifts (5) and the Review convenes: it **weighs the whole board** — warrant progress, clearance, trust, network integrity, treasury — each weighted in CONFIG, and rules for or against the analyst. The verdict screen **shows the scales** ("warrant 64%, clearance 71–35, trust 62, network 12/15") and is worded plainly as the win or loss it is. Two WINDWARD lessons paid for this design: an unconditional survival-win crowned a player who was on the verge of losing (the tally can and must rule *against* you), and printing the scales converts an arbitrary-feeling judgment into a legible one.
- **The verdict is refusable.** A **REFUSE — WORK ON** button declines either ruling: overtime resumes permanently and only the warrant or a floor ends the matter. Players who were ruled against demanded this in WINDWARD; players who were ruled for used it too.
- **Acceptance test:** the 8-seed extended-horizon census returns **0 timeouts**, with worst-case match length ≈ 11 minutes.

---

# 17. Onboarding

Thirty seconds, scripted — **with a pointing hand.** WINDWARD's text-only tutorial failed live playtests ("people who try to play don't understand what to do"); the version that worked marks the **exact touch target** with a pulsing ring and 👆, keeps the instruction up in a dark, readable pill for the whole step, and advances each step on the **real event** (a placement, a read, a closure), not a timer — with a per-step timeout fallback so nobody wedges. Once ever (localStorage flag); SKIP TUTORIAL visible for returners. The shift clock holds while it runs (§14.5).

| Step | Line | Advances on |
|---|---|---|
| 1 | *"Pole's approved. Put an eye on it."* — hand on an intersection | first placement |
| 2 | *"It reads plates. It doesn't stop anybody."* — hand tracks a passing read | first read logged |
| 3 | *"Three reads that agree closes a case."* — hand on the case card | first case closed (timeout 45 s) |
| 4 | *"Drives fill up. Old footage rolls off."* — hand on a drive icon | timeout 8 s |
| 5 | *"Raise the bar and you'll miss people. Lower it and you'll charge the wrong ones."* — hand on the dial | dial touched (timeout 10 s) |

Later teaching arrives just-in-time, in one line, at the moment the thing first happens — the first degraded camera, the first contested card, the first crew reroute, the first neighbour-recorded vandalism (§11.3, mandatory line). Every such line shows **once ever**, remembered across matches.

## 17.2 Save and resume *(new — non-negotiable for a mobile judge)*

The moment the page loses focus (`visibilitychange`/`pagehide`), snapshot all dynamic state to localStorage: cameras with their local-drive contents and upload timers, open cases and evidence, meters, crew KNOWN sets, shift clock, ladder tier. The map regenerates from the seed — **which requires that the same seed string always produces the same map, no time salt** (§19). On next visit, the title offers **"RESUME YOUR SHIFT — SHIFT 6 · seed."** Restore re-links references, then recomputes derived state. Demo matches never save; a decided match clears its save; the tutorial never re-runs mid-resume. **Ship the Playwright round-trip test** (§28): play, hide, reload, resume, assert exact restore, prove the resumed match still advances. WINDWARD's version of this took one day and became a headline feature; its test caught two snapshot-shape regressions later.

## 17.3 WATCH A SHIFT — the self-playing demo *(new — planned, on the title screen, with cut path)*

WINDWARD's most effective teacher was not the tutorial: it was a demo mode in which an AI **plays the real interface** — opens the actual tap menus, the button it intends to press lights gold and pulses, ghosts walk turn → CONFIRM — as a wordless second tutorial and a permanent Devpost/film asset. Port the pattern with its scars:

- One staged action at a time: plan → open menu → highlight (0.45 s) → click (0.35 s) → ghost/confirm (0.35 s). Tempo tuned so the demo can keep pace with the game — WINDWARD's first demo *lost every match* because its action rate was a third of what its strategy assumed. **The demo's strategy must be validated at the demo's action rate**, not headless rate.
- **Refused actions never loop.** Disabled buttons carry `data-refused`; the puppeteer never presses them, and any press or confirm that changes nothing blacklists that action for 30 s and moves on. WINDWARD shipped three separate fixes for demo action-loops before adopting this rule wholesale; adopt it on day one.
- The demo adjudicates contested cards (visibly weighing, then pressing), moves the dial when rain comes, relocates when crews reroute — one of each is enough to teach.
- Any tap exits to the title. The demo never saves and never touches the skill memory.
- **Cut path:** ship without it; the tutorial carries onboarding alone; the film (§32) is made with a scripted driver instead.

---

# 18. Feedback

Non-negotiable. If the player cannot trace a falling meter to a cause, the systems are invisible arithmetic.

| Event | Signal |
|---|---|
| Read logged | brief flash along the segment, plate ghost at the camera |
| Read below threshold | the flash is grey and silent — visibly *missed* |
| Case building | evidence pips fill on the case card |
| Case cold | card greys and slides away, clearance ticks down |
| False charge | the card turns over to show the wrong plate; trust ticks down |
| Camera degraded | visible grime and tilt, and its reads render dimmer |
| Unuploaded data at risk | a small drive icon fills on the camera; empties on upload |
| Data lost to vandalism | that camera's pending reads visibly evaporate |
| Crew avoiding a camera | on reroute, a dotted line shows the path bending around it |
| Threshold moved | qualifying reads recolour live across the whole board |

That last one matters most: moving the dial must produce an **immediate, visible, board-wide** change, or the player will never understand what it does.

## 18.1 Rendering rules paid for in WINDWARD *(new)*

- **Additive, never occluding:** protective/area effects are ground rings and rim glows with additive blending — nothing the player owns is ever hidden by an effect meant to help it.
- **Contrast against the surface it sits on:** a signal's colour is chosen against the thing it decorates (reads on dark asphalt = warm light; reads on a pale card = ink), never against the general backdrop. White-on-ivory was invisible in WINDWARD until a capture proved it.
- **Fog/undiscovered states show no live data** — if parts of the board are ever hidden, remembered objects freeze at last-seen state; live signals there would leak information the fiction says you don't have.
- **Audio synthesised, throttled:** WebAudio only; repeated events (reads, hits) share a throttle so a busy shift never becomes a slot machine — WINDWARD's temple-attack audio bug, one line to prevent.
- **Camera motion calms the noise:** while the player pans/zooms, ambient motion (traffic shimmer, rain) damps to ~10 % and eases back over a second. Same trick that fixed "the water goes crazy when I pan."

## 18.2 Input hardening *(new — this bug will happen to you)*

Multi-touch pointer tracking **will** leak dead pointers (finger slides off-screen, palm touch, browser-stolen gesture) and the map will stop responding to taps. WINDWARD's fix, adopt wholesale: on any `isPrimary` pointerdown, purge the pointer map; `setPointerCapture` on the canvas; handle `lostpointercapture`; forget everything on `blur`/`visibilitychange`. **Test it with real injected orphan pointers in Playwright** (§28). Gestures: drag pans, pinch zooms, two-finger twist rotates if the camera allows, wheel + right-drag for desktop mirrors. A tap is a press-and-release under a movement threshold; everything else is a pan.

---

# 19. Map Generation

Deterministic from a seed, constrained and validated. Never free-form.

```text
seed  = short base-36 string, shown in the HUD, enterable on the title screen
PRNG  = mulberry32(hash(seed + ':' + nonce))   // never Math.random()
nonce = deterministic RE-ROLL COUNTER, not a time salt
```

> **Same seed string → same map, always, across sessions and devices.** Save/resume (§17.2) regenerates the map from the seed at restore time; the build-log workflow reproduces playtester bugs from the seed in their screenshot; and the balance suite pins seeds by name. WINDWARD nearly shipped an ambiguity here — the "time nonce" belongs only in *picking a random seed string* for a new match, never inside generation.

## 19.1 Fixed versus generated

| Fixed | Generated |
|---|---|
| 9 × 16 lattice | which segments are arterials |
| 4 map-edge exits | block lengths and dead ends |
| Crime and shift schedule | crime spawn zones |
| Camera and upgrade costs | Syndicate home district |

## 19.2 Validation invariants

Any failure re-rolls. **Re-roll cap 50, then fall back to a baked golden seed.** A judge must never see a generation failure.

1. At least three distinct routes from the central district to a map exit, so coverage cannot trivially bottleneck.
2. No exit reachable in under 5 segments from any crime spawn zone — every escape must be observable somewhere.
3. At least one long straight run of ≥5 segments, or the Cyclops Long has no legal home.
4. Arterials are 25–40 % of segments.
5. No intersection with more than 4 incident segments.
6. The Syndicate district is 8–12 segments from the nearest exit.
7. At least two intersections exist from which a camera can see three other mountable poles, so §11.3 is discoverable.
8. No dead end longer than 2 segments.

Invariant 7 is the one to protect. Without it, cameras-watching-cameras may never occur to the player.

**Test:** `test_mapgen.js` — determinism (same seed twice → identical maps), convergence (200 random seeds resolve within the re-roll cap; report the fallback rate), and the golden seed validates. WINDWARD ran exactly this; its convergence line ("200/200 resolve directly") was the cheapest confidence in the project.

---

# 20. AI Behaviour

## 20.1 Suspect vehicles

1. Spawn at the crime scene.
2. Choose a target exit, weighted by distance and by the crew's KNOWN camera set (§13).
3. Drive it. No evasion beyond route choice — no speeding up when observed, no doubling back.

Route choice is the entire behaviour. It is enough, and anything more becomes unreadable at this scale.

## 20.2 Vandals

Each type follows the table in §11.2 with one scoring pass: isolation for scrappers, proximity for taggers, coverage value for the Fixer. No pathfinding beyond reaching the pole. Rate limits and fallbacks per §11.4.

## 20.3 Fairness

Crews use only what they have observed — a camera that has never sighted them is unknown to them. **The AI does not read the player's placements directly.** This must hold, because the player's central counterplay is placing cameras the crews have not learned yet. Proven by `test_crewfair.js` (§13.1), on every build.

---

# 21. Technical Architecture

```text
GameState      Grid          TrafficSystem
CameraSystem   SightlineSystem   ConfidenceSystem
CaseSystem     RetentionSystem   ThresholdSystem
VandalSystem   CrewMemorySystem  LadderSystem
ShiftSystem    EconomySystem     SaveSystem
MapGen         Renderer      UIController   Tutorial   Demo
```

## 21.1 Build pipeline *(new — WINDWARD's, verbatim)*

- Source in `src/NN_name.js`, concatenated **in filename order** by `node build.js` into `index.html` at an inject marker in `shell.html`. CONFIG is file `01`, so it is always first and always at the top of the built file.
- `build.js` stamps `BUILD <ISO datetime> UTC` into the title screen (§0.14).
- `node serve.js`: local dev server, rebuilds on change, `no-store` headers — playtesters on the LAN always get the current build.
- The built `index.html` runs from `file://` with zero network requests. Verify constantly, not at the end.
- **Sim/DOM separation is architectural**, not aspirational: every system file up to the renderer must load and run in a bare `vm` sandbox with no DOM. This single discipline is what makes the entire test battery (§28), sweep suite (§29), and evolution harness (§30) possible. The renderer, UI, tutorial, and demo are the only DOM-aware files, and the headless harness simply doesn't load them.
- **The frame loop clamps dt** (`min(0.1, elapsed)`) and all timing state lives in sim-time, not wall-time. Two payoffs proven in WINDWARD: background-tab hiccups can't create physics spikes, and films can be captured at warp by scaling rAF timestamps until the clamp saturates — giving *headless-identical integration* on camera.

---

# 22. Configuration Constants

**No numeric literal may appear in system logic.** Every tunable lives in one frozen object at the top of `index.html`.

**Every constant carries a provenance comment** — `// swept (test/opt_x.js): band 60-80 flat, 90+ starves closures` or `// player-directed: felt frantic at 2s` or `// judgment-tuned: trial player can't exercise this`. WINDWARD's config ended with a citation on every line, and it made every future retune a diff against evidence instead of an argument.

```javascript
const CONFIG = Object.freeze({

  Grid: { W: 9, H: 16, SEGMENT_SECONDS: 1.0, ARTERIAL_SPEED_MULT: 1.6 },

  Confidence: {
    BASE: 92,
    PER_SEGMENT_FALLOFF: 14,
    OBLIQUE_PENALTY: 18,
    ARTERIAL_PENALTY: 12,
    RAIN_PENALTY: 20,
    DEGRADE_PER_TAG: 15,
    DEGRADE_FLOOR: 25
  },

  Threshold: { START: 70, MIN: 0, MAX: 100,
    BANDS: [[0,'LAX'],[35,'EASY'],[55,'FAIR'],[70,'STRICT'],[85,'SEVERE']] },

  Cases: {
    READS_TO_CLOSE: 3,
    CLOSURE_CONFIDENCE_SUM: 210,
    LIFETIME_SECONDS: 75,
    CONTESTED_BAND: 12,
    CONTESTED_PER_SHIFT_MIN: 2, CONTESTED_PER_SHIFT_MAX: 4,
    STARVATION_GRACE: 12.0          // §10.4: expiring evidence glows this early
  },

  Retention: {
    UPLOAD_INTERVAL: 20.0,
    WINDOW_SECONDS: 90.0,
    STORAGE_UPGRADE_BONUS: 60.0,
    RELAY_CONTINUOUS: true
  },

  Cameras: {
    POST:  { COST: 40, RANGE: 2, DIRECTIONS: 4, CONF_MOD: 0 },
    LONG:  { COST: 60, RANGE: 5, DIRECTIONS: 1, CONF_MOD: +10 },   // aimed at placement, forever
    DOME:  { COST: 55, RANGE: 1, DIRECTIONS: 4, CONF_MOD: -8 },
    RELAY: { COST: 35, RANGE: 0, DIRECTIONS: 0, CONF_MOD: 0 },
    RELOCATE_COST_FRACTION: 0.5
  },

  Upgrades: { HARDEN: 25, STORAGE: 30, CLEAN: 10 },

  Vandals: {
    SCRAPPER: { HP: 30, DESTROY_SECONDS: 6, ISOLATION_WEIGHT: 1.0 },
    TAGGER:   { HP: 15, DEGRADE_SECONDS: 3 },
    FIXER:    { HP: 50, DESTROY_SECONDS: 4, FIRST_SHIFT: 5 },
    HARDENED_TIME_MULT: 2.5,
    MAX_SIMULTANEOUS: 3,            // §11.4
    RETARGET_COOLDOWN: 8.0,         // §11.4
    ABANDON_AFTER: 10.0,            // §11.4: unreachable-target fallback
    CREW_CASE_BOUNTY_MULT: 1.0      // §15.5: sweep this; expect x2 to rescue collapses
  },

  CrewMemory: {
    FORGET_SECONDS: 100.0,
    AVOID_WEIGHT: 3.0,
    MAX_AVOIDED_FRACTION: 0.6,
    RELEARN_COOLDOWN: 12.0          // §13.3
  },

  Economy: {
    START_BUDGET: 120,              // sweep a 4x4 grid vs trust start; WINDWARD's start-currency grid found its default was optimal AND that richer starts plateau LOWER
    PAYOUT_PETTY: 25, PAYOUT_MAJOR: 60, PAYOUT_SYNDICATE: 90,
    CLEARANCE_START: 70, CLEARANCE_FLOOR: 35,
    TRUST_START: 80, TRUST_FLOOR: 20,
    TRUST_LOSS_FALSE_CHARGE: 12,
    TRUST_GAIN_CORRECT_RELEASE: 3,
    LOW_TRUST_AT: 45, LOW_TRUST_PAYOUT_MULT: 0.7
  },

  Warrant: { REQUIRED: 100, PER_CASE: 22, DECAY_PER_SECOND: 0.15 },

  Shifts: {
    FIRST_AT: 45.0, TELEGRAPH: 6.0,
    INTERVAL_EARLY: 55.0, INTERVAL_MID: 45.0, INTERVAL_LATE: 35.0,
    COUNT: 9,
    // §16.1 — every match ends. Census-tune these: WINDWARD's first
    // gentle overtime (0.06/40s) was shrugged off by turtles.
    OVERTIME_INTERVAL: 30.0,
    OVERTIME_STEP: 0.15, OVERTIME_CAP: 1.8,
    REVIEW_AFTER: 5,                            // overtime shifts before the Review convenes
    REVIEW_WEIGHTS: { WARRANT: 3, CLEARANCE: 2, TRUST: 2, NETWORK: 1, TREASURY: 1 }
  },

  Ladder: {                          // §13.4 — stretch; cut path = fixed RESTLESS
    TIERS: [
      { name: 'QUIET',    overrides: {} },
      { name: 'RESTLESS', overrides: {} },
      { name: 'BRAZEN',   overrides: {} },
      { name: 'LAWLESS',  overrides: {} }
    ],
    DDA_FROM_SHIFT: 2, DDA_UP: 0.62, DDA_DOWN: 0.38,
    MEMORY_EMA_ALPHA: 0.4, MEMORY_PEAK_DECAY: 0.92
  },

  Save: { KEY: 'blindspot-resume', SKILL_KEY: 'blindspot-skill' },

  MapGen: {
    GOLDEN_SEED: "bs1", MAX_REROLLS: 50,
    ARTERIAL_FRACTION_MIN: 0.25, ARTERIAL_FRACTION_MAX: 0.40,
    MIN_ROUTES_TO_EXIT: 3, MIN_ESCAPE_SEGMENTS: 5,
    MIN_STRAIGHT_RUN: 5, SYNDICATE_DISTANCE_MIN: 8, SYNDICATE_DISTANCE_MAX: 12
  },

  Tutorial: { RELEASE_AT: 32.0 }

});
```

## 22.1 Dev tuning panel

A hidden overlay that live-edits CONFIG and reports current false-positive rate, closure rate, and mean evidence age. **But know its limits:** WINDWARD's real tuning happened in the headless sweep suite, not the overlay. The overlay is for *feel* (does STRICT feel strict?); the sweeps are for *truth* (does STRICT starve closures on seed 7?). Budget accordingly.

---

# 23. Three-Week Schedule

| Days | Work | Gate |
|---|---|---|
| **1–2** | Spikes: tap-to-place on a real phone; portrait grid legibility; threshold dial feel. **Plus: build.js + shell.html + the vm test harness + `test_mapgen.js` determinism on day 2.** | any red flag → simplify before adding systems |
| **3–6** | Grid, traffic, cameras, sightlines, confidence, reads. **Headless full-match sim (`test_sim.js`) running by day 5 even with stub systems.** | **placing a camera and watching a read land is satisfying by Day 6** |
| **7–10** | Cases, retention, upload, threshold, contested cards. **`test_shift5.js` and `test_coherence.js` land with their features.** | **shift 5 sequence works end-to-end by Day 10 — as a passing test** |
| **11–14** | Vandals, crew memory, shifts, economy, win/lose, **overtime + Review, save/resume**. First **outcome census**. | full match playable start to finish; census trending toward 0 timeouts |
| **15–17** | Onboarding, feedback pass, audio, map generation polish. **Trial player learns every verb; first sweep batch runs overnight.** | a stranger plays it without help |
| **18–19** | Packaging, offline test **on a fresh extraction**, design intent, build log, **anonymity + brand scan scripts**, media kit (§32). | airplane-mode test passes; scans return zero |
| **20–21** | Tuning (**sweep batch §29.4, then evolution §30: champion → opposition → ladder → demo strategy**) and buffer | census 0/8; battery green; demo wins on the title screen |

Day 6 and Day 10 are real kill gates.

**The standing rule that made WINDWARD's pace possible:** after *every* commit, the battery runs; after every mechanics change, the affected sweeps re-run. The agent does this unprompted. A commit with a red battery does not happen — WINDWARD did it exactly once, and the next commit's log entry is an apology.

## 23.1 If Days 7–10 overrun

Build in this order and stop when the window ends:

1. **Cases and retention** — the judge pitch depends on them
2. **Threshold dial** — the strategic core
3. **Contested cases** — the judgement verb
4. **Crew memory** — the escalation

**Crew memory is the designated cut.** It is the most novel idea in the design and also the only one nothing else depends on. If it goes, shifts 7–9 escalate on volume and weather alone, and §13 moves to future state. Say so in the build log rather than shipping it half-working.

*(Order of the new systems if 11–14 overruns: overtime+Review are tiny and non-negotiable (§16.1); save/resume next (one day, huge mobile value); the ladder and the demo cut last and each has a clean cut path already written.)*

---

# 24. Explicit Cuts

Officer units, pursuit, arrests as an on-screen event, court outcomes, multiple cities, day/night as a system, camera facing adjustment, more than four unit types, detective assignment, a narrative campaign, any real-world referent.

Each is a reasonable idea. None is the reason a judge scores this well in six minutes.

---

# 25. Submission Compliance

- [ ] Single-player, portrait, Three.js
- [ ] `index.html` at ZIP root, not nested
- [ ] All own game code in `index.html`, readable and unminified
- [ ] Three.js under `/vendor`, relative paths, no CDN
- [ ] All assets local; audio synthesised at runtime with WebAudio
- [ ] Airplane-mode test passes — **scripted: fresh extraction of the actual zip, file:// load, a simulated minute of play, zero non-file network requests, zero page errors**
- [ ] ZIP ≤ 35 MB
- [ ] **No real brands, vendors, departments, cities, or identifiable people — verified by a scripted scan of every packaged file, including code comments and the build log** (§0.6)
- [ ] No identifying information — code comments, file metadata, repo URLs, page title; **scripted scan; vendor MIT headers exempt**
- [ ] No hidden or embedded text intended to influence automated evaluation
- [ ] Design intent ≤ 500 words, `.docx`, template sections unchanged, anonymous — **generated by a script with a hard word-count gate that fails the build when over** (§26)
- [ ] Build log `.md`, kept during the build, showing AI did the heavy lifting (§31)
- [ ] All text English
- [ ] Primary action, win, lose, reset, real-time feedback, escalation, economy, defensive systems all functional
- [ ] Moving the threshold produces an immediate visible board-wide change
- [ ] Degraded cameras report worse rather than stopping
- [ ] A camera destroyed before upload loses its pending reads
- [ ] Vandalism within another camera's sightline opens a case
- [ ] Crews route around cameras that have sighted them
- [ ] Shift 5 sequence fires reliably — **`test_shift5.js` green**
- [ ] **Every match ends: 8-seed extended census, 0 timeouts**
- [ ] **Save/resume round-trip test green**
- [ ] **Ghost-pointer recovery test green**
- [ ] **Build stamp present and current in the packaged index.html**
- [ ] **Zip built from an empty staging directory in one pass; release tagged at the exact commit of the asset**

---

# 26. Design Intent Guidance

500 words, `.docx`, text only, template sections exactly as given, anonymous.

**Generate it from a script** (`make_docx.js`, zip/XML by hand — no docx library needed) that counts the body words and **fails when over 500**, and writes no author metadata. WINDWARD rode the 490s for its entire life; the gate is what made every edit safe. Rewrite section 5 against what actually shipped before submitting — it drifted four times in WINDWARD's final week, and the doc was regenerated in seconds each time.

| Section | Words | Content |
|---|---:|---|
| Title and genre | 10 | BLIND SPOT — Tower Defense & Strategy |
| Target player and pitch | 75 | systems and optimisation players; the four beats of §1.1 — *describe the audience by what they love doing, never by naming other games* (§0.6 bit WINDWARD here) |
| How to play | 75 | **verbs first, plainly:** place cameras on poles and aim the Long; drag the threshold; charge or release contested cases; relocate when crews learn — *then* controls |
| Core loop | 150 | §4, plus win/lose/reset **including the Review**, and what feedback tells the player |
| What is in this prototype | 125 | the §3 list, as actually built — **and what is NOT yet in** (the template asks; WINDWARD's audit caught the omission) |
| Progression and signature twist | 50 | shift escalation; name **cameras watching cameras** as the mechanic to validate |
| Future-state vision | 25 | more districts, more unit types, a campaign across a region |

---

# 27. The Test For Any Addition

> Does this make placing, protecting, or re-siting a camera more interesting — **within three weeks**?

If it needs a fourth week, it is future state. If it adds a fourth verb, it is out.

*(Amendment from experience: infrastructure is exempt from this test. Tests, sweeps, the build stamp, save/resume, scan scripts — none of these "make placing a camera more interesting," and every one of them earned its place in WINDWARD. The test governs* game features*; the engineering sections (§28–§32) govern themselves.)*

---

# 28. The Test Battery *(new)*

Headless unless stated. All run by one command; the agent runs them after every commit.

| Test | Proves |
|---|---|
| `test_mapgen.js` | seed determinism; 200-seed convergence; golden seed validity |
| `test_sim.js` | a full scripted match runs without error; event counts in sane bands; both "economies" (budget and trust) alive |
| `test_coherence.js` | §8.4 — no incoherent closure, ever; contradictions always flag |
| `test_crewfair.js` | §13.1 — crews know only what sighted them |
| `test_vandals.js` | §11.4 — no vandal livelock; activity within authored bands |
| `test_shift5.js` | §14.4 — the signature sequence, end to end |
| `test_census.js` | §16.1 — 8 seeds, extended horizon, 0 timeouts, all verdicts legible |
| `test_input.js` | **Playwright, real browser:** tap-to-place works; pan/pinch don't misfire as taps; **injected orphan pointers recover** (§18.2) |
| `test_resume.js` | **Playwright:** save on hide → offer on reload → exact restore → match still alive |
| `verify_zip.js` | §25 — fresh extraction, offline, playable, zero requests; anonymity + brand scans |

Harness: a ~30-line `vm` sandbox that loads `src/01…` through the last sim file, exposes the globals, and returns the sandbox. The Playwright pair run against the *built* `index.html` from `file://`. WINDWARD's identical battery caught, at minimum: two fairness regressions, three signature-sequence regressions, a page-wide syntax error from shell quoting, two snapshot-shape breaks, and the ghost-pointer class of input bug — every one before a human saw it.

---

# 29. Balance by Simulation *(new)*

## 29.1 The trial player

A scripted analyst in the harness (`opt_lib.js`): places by a simple site-scoring pass, **moves the threshold** in response to rain and expiring evidence, **adjudicates contested cards** by evidence weight, relocates on visible reroutes, buys storage vs cameras by a ratio, upgrades and cleans. Per §0.8 it must exercise **every mechanic whose constants you intend to sweep**. It also returns a stats object (closures, false charges, colds, meters, verdict).

## 29.2 The score

A single composite "match quality" number: reward deep survival under real pressure, both meters alive but *moving*, contested cards actually surfacing, closures and colds both nonzero (a game with no colds is too easy; no closures, broken), penalise degenerate strategies (camera spam, threshold parked at an extreme). Keep it comparable across sweeps for the whole project.

## 29.3 Sweep discipline

- One file per question (`opt_threshold.js`, `opt_retention.js`, `opt_economy.js`, `opt_vandals.js`…), each: patch CONFIG by regex → run trials across 3 pinned seeds → print per-cell scores and a BEST line.
- **Keep current values when the grid is flat within noise; move only on signal.** Annotate the config either way.
- **Re-run affected sweeps after every mechanics change** — WINDWARD's optimum moved every single time.
- Run an **outcome census** (8 seeds, long horizon) after anything touching pacing or endgame.
- Sweeps that would score noise (mechanics the trial player can't exercise) are *named as judgment-tuned*, which is honest, instead of swept, which would be theatre.

## 29.4 Priorities for BLIND SPOT's first sweep batch

1. `threshold START × retention WINDOW` — the coupled heart (§10.2); expect a ridge, not a point.
2. `CASE_LIFETIME × READS_TO_CLOSE` — the closable-at-all boundary (§10.4).
3. `START_BUDGET × TRUST_START` — WINDWARD's start-currency grid found its shipped values were already optimal *and* that richer starts plateau lower; expect the same shape and cite it.
4. `CREW_CASE_BOUNTY_MULT` — comeback money (§15.5).
5. Overtime step/interval — census-tuned (§16.1).

---

# 30. Evolution *(new — planned)*

Cleanly cuttable if the schedule demands, but planned: in WINDWARD this pipeline produced the demo's strategy, the difficulty ladder, and two of the best design discoveries in the project. WINDWARD's experience:

- **Parameterize first.** The trial player's choices become a ~12-gene genome (site-scoring weights, threshold aggressiveness, adjudication bias, storage-vs-eyes ratio, relocation eagerness…). A GA (tournament selection, uniform crossover, gaussian mutation, elites, rotating training seeds, holdout validation) finds a champion in a few hundred matches on a laptop.
- **Fitness must contain the win condition** — warrant completion, not survival. WINDWARD's phrasing, earned: *otherwise evolution optimizes survival theatre.*
- **Engineering:** worker processes for parallel evaluation; per-generation checkpointing so shell timeouts just resume; warm-start round 2 with the incumbent champion, which then must be dethroned to be replaced.
- **What it's for:** (1) a champion exposes *missing actions* — WINDWARD's demo AI "wasn't dumb, it was disarmed," and evolution proved it within one generation; (2) evolve the *opposition* (crew/vandal parameters) against the champion and grade the population into the §13.4 ladder tiers by win-rate; (3) the champion drives the WATCH A SHIFT demo — but **re-validate it at the demo's action tempo** (§0.10) before baking it in.
- **What not to do:** neural nets. Evaluated and rejected in WINDWARD for cause: orders more compute for an illegible policy that can't ship readably in a contest requiring unminified inspectable code. A 12-parameter genome where every gene is a sentence a human can read is the right power-to-legibility trade at this scale.

---

# 31. Build Log Discipline *(new)*

The rules require it; WINDWARD's practice made it nearly free and genuinely useful:

- **Two parts:** a "Decisions locked" list at top — amended with strikethroughs and dated notes when a decision reverses, never silently rewritten — and per-session entries (tools, what was built, pivots, what changed after playtesting, problems, lessons, where things stand).
- **A running prompt→commit table**, one row per work item: the player's directive (quoted verbatim when it drove the change — *"the wind wall kinda hides everything it covers"* is better documentation than any paraphrase), the commit hash, the outcome. **Lag-by-one:** commit code first, get the hash, the row citing it rides in the next commit.
- The log is confidential-to-judges but still subject to the brand/name scans (§0.6).
- Honesty is the point: WINDWARD's log records the commit made against a red battery, the sweep that was noise, and the demo that lost every match — and is a better document for it.

---

# 32. Media & Submission Kit *(new)*

Budget a day; WINDWARD needed all of it, twice.

- **Screenshot pipeline:** a Playwright portrait-capture driver plus small staging scripts per shot (fast-forward to a moment, frame the camera, screenshot). Capture drivers **end the tutorial and suppress one-time hint pills** — both photobombed WINDWARD's gallery and forced retakes.
- **Film:** an in-page scripted driver (the champion or trial player) with a camera director that follows the action, captured with rAF-warp (§21.1) for smooth speed, encoded to mp4 + a palette-optimized teaser gif. Film a match that *ends on a verdict screen* — the ending is the story. Expect take-to-take variance under recording load; keep the driver deterministic (fixed dt) and be willing to run three takes.
- **Devpost kit:** 3:2 tile (an actual dramatic in-game moment — a Fixer strike mid-destruction — with the title at 70–80 % width and **no small text**, illegible at gallery size); a living gif tile under the 5 MB cap that ends on the money moment; 15 gallery images in a narrative order with ≤140-char captions whose *first sentence survives alone*; an elevator pitch whose first sentence carries the whole hook (only it shows uncropped); the About story: inspiration, what it does, how it was built (say "prompt-built" plainly — it's the premise), challenges *with the real failures*, lessons.
- **Freeze discipline:** final zip staged from an empty directory, every component regenerated in one pass, verified on a fresh extraction, tagged at that exact commit, published as the single Latest release. After the entry window closes, nothing changes until judging ends.

---

# 33. The One-Sentence Version of Everything Above

Build the sim headless-first with the battery from day 2; make every state speak when touched and every wait explain itself; script the signature moment and prove it with a test; let sweeps price every number the trial player can honestly exercise; make sure every match ends in a legible verdict that can go against you; save the game when life happens; and spend the last days on the freeze checklist, not on features.
