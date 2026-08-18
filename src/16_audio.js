// ============================================================
// AUDIO — synthesised at runtime with WebAudio, nothing loaded.
// Repeated events share a throttle so a busy shift never becomes
// a slot machine (§18.1). DOM-aware: never loaded headless.
// ============================================================

var GameAudio = (() => {
  let ctx = null, master = null, muted = false;
  const lastPlayed = {};   // per-sound throttle

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch (e) { return false; }
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    startAmbient();
  }

  // ---------- the city bed: distant traffic, never dead silence ----------
  // A brown-noise loop through a low-pass (far-off engines, no hiss) with a
  // slow LFO swell — traffic arrives in waves. Starts on the first gesture
  // that unlocks audio; the mute toggle gates it like everything else.
  let ambientSrc = null, ambientMute = null;
  function startAmbient() {
    if (!ctx || ambientSrc) return;
    const dur = 6, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    ambientSrc = ctx.createBufferSource();
    ambientSrc.buffer = buf; ambientSrc.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.5;
    const base = ctx.createGain(); base.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.018;
    lfo.connect(lfoG); lfoG.connect(base.gain);
    ambientMute = ctx.createGain(); ambientMute.gain.value = muted ? 0 : 1;
    ambientSrc.connect(lp); lp.connect(base); base.connect(ambientMute); ambientMute.connect(master);
    ambientSrc.start(); lfo.start();
  }

  function tone(freq, dur, type, gain, slideTo, delay) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.5, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain, delay) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain || 0.2;
    src.connect(g); g.connect(master);
    src.start(t0);
  }

  function throttled(key, minGap) {
    const now = Date.now();
    if (lastPlayed[key] && now - lastPlayed[key] < minGap) return true;
    lastPlayed[key] = now;
    return false;
  }

  const S = {
    read()        { if (!throttled('read', 140)) tone(1240, 0.06, 'sine', 0.18); },
    readMiss()    { if (!throttled('miss', 200)) tone(420, 0.05, 'sine', 0.08); },
    place()       { tone(300, 0.12, 'triangle', 0.4, 380); },
    confirm()     { tone(520, 0.09, 'triangle', 0.35, 660); },
    deny()        { tone(180, 0.14, 'square', 0.22, 150); },
    close()       { tone(660, 0.1, 'sine', 0.4); tone(880, 0.14, 'sine', 0.35, null, 0.09); },
    cold()        { tone(330, 0.2, 'sine', 0.3, 240); },
    falseCharge() { tone(220, 0.3, 'sawtooth', 0.25, 160); },
    contested()   { tone(560, 0.08, 'square', 0.2); tone(490, 0.08, 'square', 0.2, null, 0.1); },
    destroyed()   { if (!throttled('boom', 300)) { noise(0.35, 0.4); tone(90, 0.4, 'sine', 0.5, 45); } },
    tagged()      { if (!throttled('tag', 300)) noise(0.12, 0.15); },
    upload()      { if (!throttled('up', 500)) tone(980, 0.05, 'sine', 0.1, 1400); },
    shift()       { tone(392, 0.16, 'triangle', 0.35); tone(523, 0.2, 'triangle', 0.35, null, 0.14); },
    rain()        { noise(0.8, 0.12); },
    warrant()     { tone(523, 0.12, 'sine', 0.4); tone(659, 0.12, 'sine', 0.4, null, 0.1); tone(784, 0.2, 'sine', 0.4, null, 0.2); },
    win()         { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.4, null, i * 0.13)); },
    lose()        { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.35, null, i * 0.15)); },
    tick()        { if (!throttled('tick', 90)) tone(1600, 0.02, 'sine', 0.06); },
    // a crime lands: the smash — glass pings over a noise burst and a thud
    crime()       { if (!throttled('crime', 800)) { noise(0.16, 0.3); tone(2600, 0.08, 'sine', 0.1, 1500, 0.02); tone(3200, 0.1, 'sine', 0.08, 1700, 0.07); tone(75, 0.25, 'sine', 0.34, 50); } },
    // the tip line: a double ring — brr-brr, amplitude chopped by hand
    tipRing()     { if (!throttled('tipring', 900)) for (const dly of [0, 0.26]) for (let i = 0; i < 7; i++) tone(1160, 0.02, 'sine', 0.09, null, dly + i * 0.026); },
    // an arrest: a brief far-off two-tone wail, kept quiet and rare
    siren()       { if (!throttled('siren', 1600)) for (let i = 0; i < 3; i++) { tone(640, 0.17, 'triangle', 0.11, 900, i * 0.34); tone(900, 0.17, 'triangle', 0.11, 640, i * 0.34 + 0.17); } }
  };

  // React to sim events (called with each new batch).
  function onEvents(evs) {
    for (const ev of evs) {
      switch (ev.type) {
        case 'read': ev.qualifying ? S.read() : S.readMiss(); break;
        case 'placed': S.place(); break;
        case 'crime': S.crime(); break;
        case 'tip': case 'witnessCase': S.tipRing(); break;
        case 'arrest': S.siren(); break;
        case 'caseCollapsed': S.cold(); break;
        case 'caseClosed': S.close(); break;
        case 'caseCold': S.cold(); break;
        case 'falseCharge': S.falseCharge(); break;
        case 'contested': S.contested(); break;
        case 'destroyed': S.destroyed(); break;
        case 'tagged': S.tagged(); break;
        case 'upload': S.upload(); break;
        case 'shift': S.shift(); break;
        case 'rain': S.rain(); break;
        case 'warrant': S.warrant(); break;
        case 'verdict': ev.verdict.result === 'WIN' ? S.win() : S.lose(); break;
      }
    }
  }

  function setMuted(m) { muted = m; if (ambientMute) ambientMute.gain.value = m ? 0 : 1; }

  // Backgrounding a mobile tab suspends WebAudio, and iOS can park the
  // context in a state where resume() is accepted yet nothing ever plays
  // again. Recovery is resume-then-verify: retry a resume on return to the
  // tab and on the first touch; if the context still is not running shortly
  // after, tear it down and rebuild from scratch — a context created fresh
  // inside a user gesture always runs.
  let reviveTimer = null;
  function hardRestart() {
    try { if (ctx) ctx.close(); } catch (e) {}
    ctx = null; master = null; ambientSrc = null; ambientMute = null;
    if (ensure()) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      startAmbient();
    }
  }
  function revive() {
    if (!ctx) return;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    if (reviveTimer) clearTimeout(reviveTimer);
    reviveTimer = setTimeout(() => { if (ctx && ctx.state !== 'running') hardRestart(); }, 400);
  }
  // iOS can also report 'running' while the audio session is dead — that
  // state is undetectable from JS, so after ANY backgrounding the next
  // touch rebuilds the context unconditionally, inside the gesture.
  let wasBackgrounded = false;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) wasBackgrounded = true;
      else revive();
    });
    window.addEventListener('pageshow', revive);
    window.addEventListener('focus', revive);
    document.addEventListener('pointerdown', () => {
      if (wasBackgrounded && ctx) { wasBackgrounded = false; hardRestart(); }
      else revive();
    }, { passive: true });
  }
  return { unlock, onEvents, sounds: S, setMuted };
})();
