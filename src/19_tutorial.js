// ============================================================
// TUTORIAL — thirty seconds, scripted, with a pointing hand
// (§17). Each step marks the exact touch target with a pulsing
// ring and 👆, keeps its line up in a dark readable pill, and
// advances on the REAL event, with a timeout fallback so nobody
// wedges. Once ever; SKIP visible; the shift clock holds.
// ============================================================

var Tutorial = (() => {

  let state = null, active = false, step = -1, stepStart = 0, seq = 0;
  let pillEl = null, handEl = null, skipEl = null, targetNode = -1;
  let onDone = null, dialTouched = false;

  const STEPS = [
    { line: "Pole's approved. Put an eye on it.", advance: 'placed' },
    { line: "It reads plates. It doesn't stop anybody.", advance: 'read' },
    { line: 'Three reads that agree closes a case.', advance: 'caseClosed' },
    { line: 'Drives fill up. Old footage rolls off.', advance: null },
    { line: "Raise the bar and you'll miss people. Lower it and you'll charge the wrong ones.", advance: 'dial' }
  ];

  function start(s, doneCb) {
    state = s; onDone = doneCb;
    active = true;
    state.tutorialActive = true;   // the shift clock waits (§14.5)
    seq = state.eventSeq;
    dialTouched = false;
    buildDom();
    enterStep(0);
  }

  function buildDom() {
    const root = document.getElementById('ui-root');
    pillEl = document.createElement('div');
    pillEl.setAttribute('data-key', 'tutorialpill');
    pillEl.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);' +
      'bottom:calc(70px + env(safe-area-inset-bottom));background:#0d0f15f5;border:1px solid #3a4152;' +
      'border-radius:12px;padding:10px 18px;font-size:13px;line-height:1.45;max-width:82vw;' +
      'text-align:center;z-index:40;color:#e8ecf4;box-shadow:0 4px 18px #000c;pointer-events:none;';
    root.appendChild(pillEl);
    handEl = document.createElement('div');
    handEl.textContent = '👆';
    handEl.setAttribute('data-key', 'tutorialhand');
    handEl.style.cssText = 'position:absolute;font-size:30px;z-index:41;pointer-events:none;' +
      'transition:left 0.5s, top 0.5s;filter:drop-shadow(0 2px 6px #000);';
    root.appendChild(handEl);
    skipEl = document.createElement('button');
    skipEl.textContent = 'SKIP TUTORIAL';
    skipEl.setAttribute('data-key', 'skiptutorial');
    skipEl.style.cssText = 'position:absolute;top:calc(120px + env(safe-area-inset-top));right:8px;' +
      'z-index:41;background:#161922e8;border:1px solid #2b3040;color:#8b93a5;border-radius:8px;' +
      'padding:6px 10px;font-size:10px;letter-spacing:0.06em;';
    skipEl.onclick = finish;
    root.appendChild(skipEl);
  }

  function enterStep(i) {
    step = i;
    stepStart = state.time;
    if (i >= STEPS.length) { finish(); return; }
    pillEl.textContent = STEPS[i].line;

    if (i === 0) {
      // the exact pole to touch: the best site the trial player would pick
      targetNode = pickTeachingNode();
      Renderer.centerOn(targetNode);
      Renderer.setTutorialRing(targetNode);
    } else if (i === 1) {
      const cam = state.cameras[0];
      targetNode = cam ? cam.node : targetNode;
      Renderer.setTutorialRing(targetNode);
    } else if (i === 2) {
      // bring the first shift forward so a case can actually close —
      // the clock hold ends here (§17 step 3, Tutorial.RELEASE_AT)
      state.tutorialActive = false;
      state.shift.nextAt = Math.min(state.shift.nextAt, state.time + 2);
      Renderer.setTutorialRing(null);
    } else if (i === 3) {
      const cam = state.cameras[0];
      targetNode = cam ? cam.node : targetNode;
      Renderer.setTutorialRing(targetNode);
    } else if (i === 4) {
      Renderer.setTutorialRing(null);
    }
  }

  function pickTeachingNode() {
    // a good site near a spawn zone with headroom
    const map = state.map;
    let best = map.center, bestScore = -1;
    for (const n of map.nodes) {
      if (n.exit || !map.adj[n.id].length) continue;
      let minSpawn = Infinity;
      for (const z of map.spawnZones) minSpawn = Math.min(minSpawn, CaseSystem.nodeDist(state, n.id, z));
      const score = map.adj[n.id].length - minSpawn * 0.5;
      if (score > bestScore) { bestScore = score; best = n.id; }
    }
    return best;
  }

  function positionHand() {
    if (!handEl) return;
    if (step === 2) {
      // hand on the case rail
      const rail = document.querySelector('.caserail .card') || document.querySelector('.caserail');
      if (rail) {
        const r = rail.getBoundingClientRect();
        handEl.style.left = (r.left + r.width / 2 - 15) + 'px';
        handEl.style.top = (r.bottom + 2) + 'px';
        return;
      }
    }
    if (step === 4) {
      const dial = document.querySelector('[data-key=dial]');
      if (dial) {
        const r = dial.getBoundingClientRect();
        handEl.style.left = (r.left + r.width / 2 - 15) + 'px';
        handEl.style.top = (r.bottom + 2) + 'px';
        return;
      }
    }
    if (targetNode >= 0) {
      const s = Renderer.nodeScreen(targetNode);
      handEl.style.left = (s.x - 6) + 'px';
      handEl.style.top = (s.y + 6) + 'px';
    }
  }

  function noteDialTouched() { dialTouched = true; }

  function tick() {
    if (!active || !state) return;
    positionHand();
    const S = STEPS[step];
    if (!S) return;

    // real-event advancement
    const evs = State.eventsSince(state, seq);
    if (evs.length) seq = evs[evs.length - 1].seq;
    for (const ev of evs) {
      if (S.advance && ev.type === S.advance) { enterStep(step + 1); return; }
    }
    if (S.advance === 'dial' && dialTouched) { enterStep(step + 1); return; }

    // per-step timeout fallback (§17)
    const timeout = CONFIG.Tutorial.STEP_TIMEOUTS[step];
    if (timeout > 0 && state.time - stepStart > timeout) enterStep(step + 1);
    // steps with no timeout but no possible event would wedge — belt and
    // braces: any step older than RELEASE_AT moves on
    if (timeout === 0 && step !== 0 && state.time - stepStart > CONFIG.Tutorial.RELEASE_AT) enterStep(step + 1);
  }

  function finish() {
    if (!active) return;
    active = false;
    if (state) state.tutorialActive = false;
    Renderer.setTutorialRing(null);
    for (const el of [pillEl, handEl, skipEl]) if (el) el.remove();
    pillEl = handEl = skipEl = null;
    if (onDone) onDone();
  }

  return { start, tick, finish, noteDialTouched, isActive: () => active };
})();
