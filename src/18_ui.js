// ============================================================
// UI — location-first, at the thumb (§12.2). Tap an intersection
// for the category menu; tap anything and it names itself; the
// dial lives in a slim persistent strip; the bottom bar stays
// empty. Every button carries data-key (the demo, the tests and
// the capture scripts all drive these). Live readouts ride their
// own fixed pills so nothing jitters (§0.12).
// ============================================================

var UI = (() => {

  let root, state = null, hooks = {};
  let els = {};              // named dom elements
  let ghostMode = null;      // {type, node, dir, relocCamId}
  let menuNode = null;
  let uiSeq = 0;             // event cursor
  let relocPick = null;      // camId awaiting a target tap
  let identityTimer = null;
  const cardEls = new Map();

  // ---------- dom helpers ----------

  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function css() {
    const st = document.createElement('style');
    st.textContent = `
#ui-root { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #d8dde8; }
.hud { position:absolute; top:0; left:0; right:0; padding:calc(4px + env(safe-area-inset-top)) 8px 4px;
  background:linear-gradient(#0b0d12f2,#0b0d12cc 70%,transparent); pointer-events:none; }
.hud * { pointer-events:auto; }
.hudrow { display:flex; align-items:center; gap:8px; justify-content:space-between; }
.shiftclock { font-size:13px; font-weight:700; letter-spacing:0.06em; white-space:nowrap; }
.mood { font-size:10px; color:#8b93a5; letter-spacing:0.08em; white-space:nowrap; }
.seedtag { font-size:9px; color:#5a6070; }
.meters { display:flex; gap:6px; margin-top:3px; }
.meter { flex:1; min-width:0; }
.meter .lab { font-size:8.5px; color:#8b93a5; letter-spacing:0.06em; display:flex; justify-content:space-between; }
.meter .bar { height:4px; background:#1c1f27; border-radius:2px; overflow:hidden; margin-top:1px; }
.meter .fill { height:100%; border-radius:2px; transition:width 0.3s; }
.meter.warned .lab { color:#ff5a52; animation:blink 1s infinite; }
@keyframes blink { 50% { opacity:0.4; } }
.dialrow { display:flex; align-items:center; gap:8px; margin-top:4px; }
.dial { flex:1; -webkit-appearance:none; appearance:none; height:22px; background:transparent; }
.dial::-webkit-slider-runnable-track { height:6px; border-radius:3px;
  background:linear-gradient(90deg,#3577b0,#5a8a5a 45%,#b0813a 70%,#b04a42); }
.dial::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px; margin-top:-8px;
  border-radius:50%; background:#e8ecf4; border:2px solid #0b0d12; }
.bandpill { width:128px; text-align:center; font-size:10.5px; font-weight:700; letter-spacing:0.05em;
  background:#161922; border:1px solid #2a2e3a; border-radius:10px; padding:4px 0; white-space:nowrap; }
.ticker { position:absolute; top:calc(96px + env(safe-area-inset-top)); left:0; right:0; text-align:center;
  font-size:10.5px; color:#aab2c0; text-shadow:0 1px 3px #000; pointer-events:none;
  opacity:0; transition:opacity 0.4s; padding:0 12px; }
.caserail { position:absolute; top:calc(112px + env(safe-area-inset-top)); left:0; right:0;
  display:flex; gap:6px; overflow-x:auto; padding:4px 8px; pointer-events:auto;
  scrollbar-width:none; -webkit-overflow-scrolling:touch; }
.caserail::-webkit-scrollbar { display:none; }
.card { flex:0 0 auto; width:88px; background:#12151dee; border:1px solid #262b38; border-radius:8px;
  padding:5px 6px; font-size:9px; transition:opacity 0.5s, transform 0.5s; }
.card .plate { font-family:monospace; font-size:10.5px; font-weight:700; color:#ffc84a; }
.card.vandal .plate { color:#53c8ff; }
.card .typ { color:#8b93a5; letter-spacing:0.06em; font-size:8px; }
.card .pips { display:flex; gap:3px; margin:3px 0; }
.card .pip { width:8px; height:8px; border-radius:50%; background:#252a36; border:1px solid #3a4152; }
.card .pip.full { background:#ffc84a; border-color:#ffc84a; }
.card .pip.expiring { animation:blink 0.8s infinite; box-shadow:0 0 5px #ffc84a; }
.card .timer { height:3px; background:#1c1f27; border-radius:2px; overflow:hidden; }
.card .timer i { display:block; height:100%; background:#5a8a5a; }
.card.contested { border-color:#b0813a; box-shadow:0 0 8px #b0813a55; width:116px; }
.card.contested .why { color:#d8b46a; margin:2px 0; font-size:8.5px; }
.card .btns { display:flex; gap:4px; margin-top:3px; }
.card .btns button { flex:1; font-size:9px; padding:4px 0; border-radius:5px; border:none; font-weight:700;
  letter-spacing:0.04em; }
.card .charge { background:#6e3b36; color:#ffd9d5; }
.card .release { background:#31504f; color:#d2f2ef; }
.card.closing { opacity:0; transform:translateY(-8px); }
.card.cold { filter:grayscale(1); opacity:0.55; }
.ctxmenu { position:absolute; background:#12151df5; border:1px solid #2b3040; border-radius:10px;
  padding:7px; display:flex; gap:7px; z-index:30; box-shadow:0 6px 24px #000a; }
.ctxcol { display:flex; flex-direction:column; gap:5px; min-width:86px; }
.ctxcol .colhead { font-size:8.5px; color:#6f7788; letter-spacing:0.12em; text-align:center; }
.ctxbtn { background:#1b2029; border:1px solid #2e3546; color:#d8dde8; border-radius:7px;
  padding:6px 7px; font-size:10px; text-align:left; line-height:1.25; }
.ctxbtn .nm { font-weight:700; display:flex; justify-content:space-between; gap:6px; }
.ctxbtn .cost { color:#ffc84a; }
.ctxbtn .ex { color:#8b93a5; font-size:8.5px; }
.ctxbtn[data-refused] { opacity:0.45; }
.ctxbtn.demolit { outline:2px solid #ffc84a; box-shadow:0 0 12px #ffc84a88; animation:blink 0.5s infinite; }
.dismiss { align-self:flex-end; background:#232837; border:1px solid #343b4e; color:#aab2c0;
  border-radius:7px; padding:6px 12px; font-size:11px; font-weight:700; }
.confirmwrap { position:absolute; z-index:29; display:flex; flex-direction:column; gap:6px; align-items:center; }
.qualitypill { width:210px; text-align:center; background:#161922f2; border:1px solid #2a2e3a;
  border-radius:10px; padding:5px 0; font-size:10px; letter-spacing:0.03em; white-space:nowrap; }
.qualitypill .verdictword { font-weight:800; }
.confirmrow { display:flex; gap:6px; background:#12151df5; border:1px solid #2b3040;
  border-radius:10px; padding:6px; }
.confirmrow button { border:none; border-radius:7px; font-size:12px; font-weight:700; padding:8px 12px; }
.turnbtn { background:#232837; color:#d8dde8; width:40px; }
.okbtn { background:#3d6b48; color:#e6ffe9; width:110px; }
.cancelbtn { background:#553; background:#4a3038; color:#f2d8d8; width:40px; }
.identity { position:absolute; left:50%; transform:translateX(-50%);
  bottom:calc(14px + env(safe-area-inset-bottom)); background:#12151df0; border:1px solid #2b3040;
  border-radius:10px; padding:7px 14px; font-size:11px; letter-spacing:0.03em; max-width:86vw;
  text-align:center; opacity:0; transition:opacity 0.25s; pointer-events:none; white-space:nowrap; }
.evsheet { position:absolute; left:50%; transform:translateX(-50%); bottom:0; width:min(400px,100vw);
  max-height:74vh; overflow-y:auto; background:#0e1118fa; border:1px solid #2b3040; border-bottom:none;
  border-radius:14px 14px 0 0; z-index:44; padding:10px 10px calc(10px + env(safe-area-inset-bottom));
  box-shadow:0 -8px 30px #000c; -webkit-overflow-scrolling:touch; }
.evhead { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
.evhead b { font-size:13px; letter-spacing:0.05em; color:#ffc84a; font-family:monospace; }
.evhead span { font-size:9.5px; color:#8b93a5; flex:1; }
.evhead button { background:#232837; border:1px solid #343b4e; color:#aab2c0; border-radius:7px;
  padding:4px 10px; font-size:12px; font-weight:700; }
.evref { margin-bottom:8px; }
.evref canvas, .evcell canvas { display:block; width:100%; border-radius:8px; background:#000; }
.evmeta { font-size:8.5px; color:#8b93a5; margin-top:2px; letter-spacing:0.04em; line-height:1.35; }
.evmeta .warn { color:#ff8a80; font-weight:700; }
.evmeta .ref { color:#39d3c0; font-weight:700; }
.evgrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.evcell { border-radius:8px; }
.evcell.inactive { opacity:0.55; }
.evmap { margin-bottom:8px; }
.evmap canvas { display:block; width:100%; border-radius:8px; background:#0a0c11; }
.evlegs { font-size:8.5px; color:#8b93a5; margin:3px 0 6px; line-height:1.5; }
.evlegs .bad { color:#ff8a80; font-weight:700; }
.evhint { font-size:9.5px; color:#8b93a5; text-align:center; margin:2px 0 8px; line-height:1.5; }
.evverdict { display:flex; gap:8px; }
.evverdict button { flex:1; padding:11px 0; border:none; border-radius:9px; font-size:13px;
  font-weight:800; letter-spacing:0.06em; }
.evverdict .charge { background:#6e3b36; color:#ffd9d5; }
.evverdict .release { background:#31504f; color:#d2f2ef; }
.overlay { position:absolute; inset:0; background:#05060af0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; z-index:50; text-align:center; padding:20px; }
.overlaid .hud, .overlaid .caserail, .overlaid .ticker, .overlaid .identity { display:none; }
.overlay h1 { font-size:30px; letter-spacing:0.14em; margin:0 0 4px; }
.overlay .sub { color:#8b93a5; font-size:12px; margin-bottom:14px; max-width:300px; line-height:1.5; }
.scales { width:min(300px,80vw); margin:0 0 16px; }
.scales .srow { display:flex; align-items:center; gap:8px; font-size:10px; margin:4px 0; }
.scales .sname { width:88px; text-align:right; color:#8b93a5; letter-spacing:0.06em; }
.scales .sbar { flex:1; height:7px; background:#1c1f27; border-radius:3px; overflow:hidden; }
.scales .sbar i { display:block; height:100%; }
.scales .sval { width:30px; text-align:left; }
.bigbtn { display:block; width:min(240px,70vw); margin:5px auto; padding:12px; border-radius:10px;
  border:1px solid #2e3546; background:#1b2029; color:#e8ecf4; font-size:14px; font-weight:700;
  letter-spacing:0.08em; }
.bigbtn.primary { background:#3d6b48; border-color:#4a7d56; }
.bigbtn.warn { background:#6e5a2b; border-color:#8a7136; }
.buildstamp { position:absolute; bottom:calc(4px + env(safe-area-inset-bottom)); right:8px;
  font-size:8px; color:#3a4152; }
.title h1 { font-size:44px; margin:0; letter-spacing:0.2em; text-shadow:0 0 30px #ffc84a44; }
.title .tag { color:#8b93a5; font-size:12px; margin:2px 0 26px; font-style:italic; }
.seedrow { display:flex; gap:6px; margin-top:14px; align-items:center; }
.seedrow input { background:#12151d; border:1px solid #2b3040; color:#d8dde8; border-radius:8px;
  padding:8px 10px; width:110px; font-family:monospace; font-size:13px; text-align:center; }
.seedrow button { padding:8px 12px; border-radius:8px; border:1px solid #2e3546; background:#1b2029;
  color:#aab2c0; font-size:11px; }
`;
    document.head.appendChild(st);
  }

  // ---------- init & frame ----------

  function init(uiRoot, gameHooks) {
    root = uiRoot;
    hooks = gameHooks || {};
    css();
    root.innerHTML = '';

    els.hud = h('div', 'hud');
    els.hud.innerHTML = `
      <div class="hudrow">
        <span class="shiftclock" data-key="shiftclock">—</span>
        <span class="mood" data-key="mood"></span>
        <span class="seedtag" data-key="seedtag"></span>
      </div>
      <div class="meters">
        <div class="meter" data-key="m-budget"><div class="lab"><span>BUDGET</span><b class="v"></b></div><div class="bar"><div class="fill" style="background:#ffc84a"></div></div></div>
        <div class="meter" data-key="m-clearance"><div class="lab"><span>CLEARANCE</span><b class="v"></b></div><div class="bar"><div class="fill" style="background:#5a9a6a"></div></div></div>
        <div class="meter" data-key="m-trust"><div class="lab"><span>TRUST</span><b class="v"></b></div><div class="bar"><div class="fill" style="background:#53c8ff"></div></div></div>
        <div class="meter" data-key="m-warrant"><div class="lab"><span>WARRANT</span><b class="v"></b></div><div class="bar"><div class="fill" style="background:#c86a9a"></div></div></div>
      </div>
      <div class="dialrow">
        <input type="range" class="dial" data-key="dial" min="0" max="100" step="1">
        <div class="bandpill" data-key="bandpill">BAR AT — </div>
      </div>`;
    root.appendChild(els.hud);

    els.ticker = h('div', 'ticker');
    root.appendChild(els.ticker);
    els.caserail = h('div', 'caserail');
    els.caserail.setAttribute('data-key', 'caserail');
    root.appendChild(els.caserail);
    els.identity = h('div', 'identity');
    root.appendChild(els.identity);

    els.dial = els.hud.querySelector('[data-key=dial]');
    els.bandpill = els.hud.querySelector('[data-key=bandpill]');
    els.dial.addEventListener('input', () => {
      if (!state) return;
      Actions.setThreshold(state, parseInt(els.dial.value, 10));
      if (hooks.onDialTouched) hooks.onDialTouched();
    });

    bindInput();
  }

  function setMatch(s) {
    state = s;
    uiSeq = s.eventSeq;
    ghostMode = null; menuNode = null; relocPick = null;
    cardEls.clear();
    els.caserail.innerHTML = '';
    closeMenu(); hideConfirm(); closeEvidenceSheet();
    els.dial.value = s.threshold;
    els.hud.querySelector('[data-key=seedtag]').textContent = 'seed ' + s.seed;
  }

  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function update() {
    if (!state) return;
    const evs = State.eventsSince(state, uiSeq);
    if (evs.length) uiSeq = evs[evs.length - 1].seq;

    // HUD
    const sh = state.shift;
    const untilNext = Math.max(0, sh.nextAt - state.time);
    const clockEl = els.hud.querySelector('[data-key=shiftclock]');
    clockEl.textContent = sh.num === 0
      ? 'FIRST SHIFT IN ' + Math.ceil(untilNext) + 's'
      : (sh.overtime ? 'OVERTIME — SHIFT ' + sh.num : 'SHIFT ' + sh.num) + ' · ' + fmtTime(state.time);
    els.hud.querySelector('[data-key=mood]').textContent = ShiftSystem.moodLine(state);

    setMeter('m-budget', Math.floor(state.budget), Math.min(100, state.budget / 3));
    setMeter('m-clearance', Math.floor(State.clearance(state)) + '%', State.clearance(state), state.warn.clearance !== -1);
    setMeter('m-trust', Math.floor(state.trust), state.trust, state.warn.trust !== -1);
    setMeter('m-warrant', Math.floor(state.warrant) + '%', state.warrant);

    if (document.activeElement !== els.dial) els.dial.value = state.threshold;
    els.bandpill.textContent = 'BAR AT ' + state.threshold + ' — ' + State.thresholdBand(state);

    // ticker: newest log line, shown briefly
    const last = state.logLines[state.logLines.length - 1];
    if (last && last !== els._lastLog) {
      els._lastLog = last;
      els.ticker.textContent = last.msg;
      els.ticker.style.opacity = 1;
      clearTimeout(els._tickerT);
      els._tickerT = setTimeout(() => { els.ticker.style.opacity = 0; }, 3600);
    }

    syncCards();

    // an open case file follows its case: resolved or expired → it closes
    if (evsheetCaseId !== null) {
      const kase = CaseSystem.byId(state, evsheetCaseId);
      if (!kase || kase.status !== 'CONTESTED') {
        closeEvidenceSheet();
        if (kase && kase.status === 'COLD') identity('The file expired unanswered — released.');
      }
    }

    for (const ev of evs) {
      if (ev.type === 'verdict') showVerdict(ev.verdict);
      if (ev.type === 'crime' || ev.type === 'caseAtRisk') {
        // the rail crowding IS the escalation display (§14.2)
        const open = state.cases.filter(c => c.status === 'OPEN' || c.status === 'CONTESTED').length;
        if (open >= 5) State.log(state, open + ' CASES OPEN.', 'rail-crowd-' + open);
      }
    }
    return evs;
  }

  function setMeter(key, text, frac, warned) {
    const m = els.hud.querySelector(`[data-key=${key}]`);
    m.querySelector('.v').textContent = text;
    m.querySelector('.fill').style.width = clamp(frac, 0, 100) + '%';
    m.classList.toggle('warned', !!warned);
  }

  // ---------- case rail ----------

  function cardFor(kase) {
    let el = cardEls.get(kase.id);
    if (!el) {
      el = h('div', 'card');
      el.setAttribute('data-key', 'case-' + kase.id);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (kase.status === 'CONTESTED') {   // the card opens the case file
          openEvidenceSheet(kase.id);
          return;
        }
        Renderer.centerOn(kase.spawnNode);
        identity(caseIdentity(kase));
      });
      cardEls.set(kase.id, el);
      els.caserail.prepend(el);
    }
    return el;
  }

  function caseIdentity(kase) {
    const ev = CaseSystem.usableEvidence(state, kase);
    const kind = kase.type === 'VANDAL' ? 'VANDAL CREW CASE' : kase.type + ' CASE';
    return kind + ' — ' + kase.plate + ' · ' + ev.length + ' read' + (ev.length === 1 ? '' : 's') +
      ' · cold in ' + Math.max(0, Math.ceil(kase.coldAt - state.time)) + 's';
  }

  function syncCards() {
    const show = state.cases.filter(c =>
      c.status === 'OPEN' || c.status === 'CONTESTED' || c.status === 'ARREST' ||
      (c.status === 'CLOSED' && c.convictAt !== undefined && state.time - c.convictAt < 2.5) ||
      (c.status === 'COLD' && c._coldShownUntil === undefined));
    // order: contested first, then by expiry
    show.sort((a, b) =>
      (b.status === 'CONTESTED') - (a.status === 'CONTESTED') || a.coldAt - b.coldAt);

    const liveIds = new Set();
    for (const kase of show) {
      liveIds.add(kase.id);
      const el = cardFor(kase);
      const ev = CaseSystem.usableEvidence(state, kase);
      const K = CONFIG.Cases.READS_TO_CLOSE;
      const expSoon = ev.some(r => r.expiresAt - state.time < CONFIG.Cases.STARVATION_GRACE);
      let pips = '';
      for (let i = 0; i < K; i++) {
        pips += `<span class="pip ${i < ev.length ? 'full' : ''} ${expSoon && i < ev.length ? 'expiring' : ''}"></span>`;
      }
      const frac = clamp((kase.coldAt - state.time) / CONFIG.Cases.LIFETIME_SECONDS, 0, 1);
      el.className = 'card' + (kase.status === 'CONTESTED' ? ' contested' : '') +
        (kase.type === 'VANDAL' ? ' vandal' : '') +
        (kase.status === 'CLOSED' && state.time - kase.convictAt > 1.5 ? ' closing' : '') +
        (kase.status === 'COLD' ? ' cold' : '');
      if (kase.status === 'CONTESTED') {
        const c = kase.contested || {};
        el.innerHTML = `
          <div class="typ">CONTESTED · ${kase.kind || kase.type}</div>
          <div class="plate">${kase.plate}</div>
          <div class="why">${ev.length} read${ev.length === 1 ? '' : 's'}${c.contradiction ? ', contradiction' : ', near the bar'}</div>
          <div class="pips">${pips}</div>
          <div class="timer"><i style="width:${frac * 100}%"></i></div>
          <div class="btns">
            <button class="charge" data-key="charge-${kase.id}">CHARGE</button>
            <button class="release" data-key="release-${kase.id}">RELEASE</button>
          </div>`;
        el.querySelector('.charge').onclick = (e) => {
          e.stopPropagation(); Actions.adjudicate(state, kase.id, 'CHARGE'); GameAudio.unlock();
        };
        el.querySelector('.release').onclick = (e) => {
          e.stopPropagation(); Actions.adjudicate(state, kase.id, 'RELEASE'); GameAudio.unlock();
        };
      } else if (kase.status === 'ARREST') {
        const trial = Math.max(0, Math.ceil(kase.convictAt - state.time));
        el.innerHTML = `
          <div class="typ">ARREST · TRIAL ${trial}s</div>
          <div class="plate">${kase.plate}</div>
          <div class="pips">${pips}</div>
          <div class="timer"><i style="width:100%;background:#53c8ff"></i></div>`;
      } else {
        const tail = kase.status === 'CLOSED'
          ? (kase.falseCharge ? ' · WRONG PLATE' : kase.collapsed ? ' · COLLAPSED' : ' · CONVICTED')
          : kase.status === 'COLD' ? ' · COLD' : '';
        el.innerHTML = `
          <div class="typ">${kase.kind || (kase.type === 'VANDAL' ? 'VANDALISM' : kase.type)}${tail}</div>
          <div class="plate">${kase.plate}</div>
          <div class="pips">${pips}</div>
          <div class="timer"><i style="width:${frac * 100}%"></i></div>`;
      }
      if (kase.status === 'COLD') kase._coldShownUntil = state.time + 1.6;
    }
    for (const [id, el] of cardEls) {
      if (!liveIds.has(id)) {
        const kase = state.cases.find(c => c.id === id);
        if (kase && kase.status === 'COLD' && kase._coldShownUntil > state.time) continue;
        el.remove();
        cardEls.delete(id);
      }
    }
  }

  // ---------- the case file: stills you can actually read ----------
  // Every read renders as a synthetic camera frame: the car that was
  // GENUINELY photographed (its real colour), the plate as the OCR took
  // it (characters smudged by confidence), rain, lens grime, grain. The
  // player compares frames against the best one — a mismatched car or an
  // unreadable plate is the informed reason to RELEASE. Confidence is
  // image quality made visible; certainty is never given away.

  function drawStill(canvas, read) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const rng = mulberry32(hashStr('still:' + read.id));
    const q = clamp((read.conf - 20) / 70, 0.08, 1);   // confidence IS image quality

    // night ground
    g.fillStyle = '#07090d'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#191c22'; g.fillRect(0, H * 0.42, W, H * 0.58);
    g.fillStyle = '#22262e'; g.fillRect(0, H * 0.52, W, H * 0.48);
    // lane dashes
    g.fillStyle = 'rgba(120,126,140,0.35)';
    for (let x = W * 0.05; x < W; x += W * 0.16) g.fillRect(x, H * 0.72, W * 0.07, H * 0.015);
    // sodium pool
    const gx = W * (0.25 + rng() * 0.5);
    const grad = g.createRadialGradient(gx, H * 0.3, 4, gx, H * 0.3, W * 0.45);
    grad.addColorStop(0, 'rgba(255,154,42,0.30)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    const flip = read.heading === 2;   // westbound cars face the other way
    const cx = W * (0.34 + rng() * 0.18), cy = H * 0.52;
    const cw = W * 0.44, ch = H * 0.20;

    if (read.vehId === null) {
      // a witness frame: a hooded figure at the pole, not a car
      g.fillStyle = '#2a2e38';
      g.fillRect(cx + cw * 0.4, cy - ch * 1.1, cw * 0.16, ch * 1.5);
      g.beginPath(); g.arc(cx + cw * 0.48, cy - ch * 1.2, cw * 0.11, 0, 7); g.fill();
      g.fillStyle = '#3c414c';
      g.fillRect(cx + cw * 0.7, cy - ch * 2.2, cw * 0.05, ch * 2.6);   // the pole
    } else {
      // the car as it genuinely was: type, colour, and damage from its
      // plate identity — the same identity the witness described
      const ident = carIdentity(read.actualPlate);
      const smear = (1 - q) * W * 0.05;
      const col = Renderer.carColorHex(read.actualPlate);
      const glass = 'rgba(10,12,16,0.85)';
      const rr = (x, y, w2, h2, r) => { g.beginPath(); g.roundRect(x, y, w2, h2, r); g.fill(); };

      const body = (dx, alpha) => {
        g.globalAlpha = alpha;
        g.fillStyle = col;
        const t = ident.type;
        if (t === 'PICKUP') {
          rr(cx + dx + (flip ? 0 : cw * 0.45), cy - ch * 1.25, cw * 0.42, ch * 1.25, ch * 0.25); // cab
          rr(cx + dx + (flip ? cw * 0.38 : 0), cy - ch * 0.7, cw * 0.62, ch * 0.7, ch * 0.15);   // bed
          g.fillStyle = glass;
          rr(cx + dx + (flip ? cw * 0.06 : cw * 0.5), cy - ch * 1.18, cw * 0.3, ch * 0.5, ch * 0.15);
        } else if (t === 'VAN') {
          rr(cx + dx, cy - ch * 1.35, cw, ch * 1.35, ch * 0.22);
          g.fillStyle = glass;
          rr(cx + dx + (flip ? cw * 0.08 : cw * 0.62), cy - ch * 1.22, cw * 0.28, ch * 0.5, ch * 0.12);
        } else if (t === 'SUV') {
          rr(cx + dx, cy - ch * 1.15, cw, ch * 1.15, ch * 0.3);
          g.fillStyle = glass;
          rr(cx + dx + cw * 0.2, cy - ch * 1.05, cw * 0.6, ch * 0.5, ch * 0.18);
        } else if (t === 'SPORTS CAR') {
          rr(cx + dx, cy - ch * 0.72, cw, ch * 0.72, ch * 0.3);
          g.fillStyle = col;
          rr(cx + dx + (flip ? cw * 0.02 : cw * 0.88), cy - ch * 0.95, cw * 0.1, ch * 0.25, 2); // spoiler
          g.fillStyle = glass;
          rr(cx + dx + cw * 0.3, cy - ch * 0.92, cw * 0.38, ch * 0.32, ch * 0.14);
        } else if (t === 'COMPACT') {
          rr(cx + dx + cw * 0.12, cy - ch, cw * 0.76, ch, ch * 0.35);
          g.fillStyle = glass;
          rr(cx + dx + cw * 0.28, cy - ch * 0.95, cw * 0.44, ch * 0.5, ch * 0.2);
        } else { // SEDAN
          rr(cx + dx, cy - ch, cw, ch, ch * 0.35);
          g.fillStyle = glass;
          rr(cx + dx + cw * (flip ? 0.42 : 0.18), cy - ch * 0.92, cw * 0.4, ch * 0.5, ch * 0.2);
        }
        g.globalAlpha = 1;
      };
      if (smear > 0.5) body(flip ? smear : -smear, 0.35);
      body(0, 1);

      // damage the witness might mention — hidden by murk on bad frames
      g.globalAlpha = Math.max(0, q * 0.95);
      if (ident.damage.includes('CRACKED WINDSHIELD')) {
        g.strokeStyle = 'rgba(220,228,240,0.75)'; g.lineWidth = 1;
        const wx = cx + cw * (flip ? 0.2 : 0.5), wy = cy - ch * 0.75;
        for (let k = 0; k < 3; k++) {
          g.beginPath(); g.moveTo(wx, wy);
          g.lineTo(wx + (rng() - 0.5) * cw * 0.25, wy + (rng() - 0.3) * ch * 0.35);
          g.stroke();
        }
      }
      if (ident.damage.includes('DENTED PANEL')) {
        g.fillStyle = 'rgba(8,10,14,0.55)';
        g.beginPath();
        g.ellipse(cx + cw * (0.3 + rng() * 0.4), cy - ch * 0.35, cw * 0.09, ch * 0.22, 0.4, 0, 7);
        g.fill();
      }
      if (ident.damage.includes('BROKEN TAILLIGHT')) {
        g.fillStyle = 'rgba(90,20,20,0.9)';
        g.fillRect(cx + (flip ? cw - 4 : 0), cy - ch * 0.5, 4, ch * 0.2);
      }
      g.globalAlpha = 1;

      // wheels
      g.fillStyle = '#0a0c10';
      g.beginPath(); g.arc(cx + cw * 0.22, cy + 1, ch * 0.28, 0, 7); g.fill();
      g.beginPath(); g.arc(cx + cw * 0.78, cy + 1, ch * 0.28, 0, 7); g.fill();
      // headlight bloom
      const hx = flip ? cx : cx + cw;
      const hg = g.createRadialGradient(hx, cy - ch * 0.5, 2, hx, cy - ch * 0.5, cw * 0.5);
      hg.addColorStop(0, 'rgba(255,233,176,0.55)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hg; g.fillRect(0, 0, W, H);
      // murk swallows colour as quality falls — a bad frame keeps its secrets
      g.fillStyle = `rgba(13,16,23,${(1 - q) * 0.62})`;
      g.fillRect(cx - 4, cy - ch - 4, cw + 8, ch * 1.4 + 8);
    }

    // the plate strip — the ANPR close-up along the bottom
    g.fillStyle = 'rgba(5,6,9,0.88)';
    g.fillRect(0, H * 0.8, W, H * 0.2);
    const plate = read.plate || '???-???';
    const pw = W * 0.44, ph = H * 0.15;
    const px = (W - pw) / 2, py = H * 0.825;
    g.fillStyle = '#c9cdd6';
    g.beginPath(); g.roundRect(px, py, pw, ph, 3); g.fill();
    g.font = `bold ${Math.floor(ph * 0.78)}px monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const step = pw / (plate.length + 1);
    for (let i = 0; i < plate.length; i++) {
      const legible = (hashStr(read.id + ':' + i) % 100) < q * 118 - 10;
      const chx = px + step * (i + 1), chy = py + ph / 2;
      if (legible) {
        g.fillStyle = '#14161c';
        g.fillText(plate[i], chx, chy + 1);
      } else {
        g.fillStyle = 'rgba(20,22,28,0.5)';   // the smudge: something was there
        g.fillText(plate[i], chx + (rng() - 0.5) * 3, chy + 1);
        g.fillStyle = 'rgba(120,124,134,0.8)';
        g.fillRect(chx - step * 0.38, py + ph * 0.18, step * 0.76, ph * 0.64);
      }
    }

    // weather and neglect leave their marks
    if (read.rain) {
      g.strokeStyle = 'rgba(120,150,190,0.28)'; g.lineWidth = 1;
      for (let i = 0; i < 30; i++) {
        const x = rng() * W, y = rng() * H * 0.8;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 11); g.stroke();
      }
    }
    if (read.camTags > 0) {
      for (let i = 0; i < read.camTags + 1; i++) {
        const sg = g.createRadialGradient(rng() * W, rng() * H * 0.7, 2, rng() * W, rng() * H * 0.7, W * 0.3);
        sg.addColorStop(0, 'rgba(22,26,20,0.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg; g.fillRect(0, 0, W, H);
      }
    }
    // grain
    const specks = Math.floor((1 - q) * 170);
    for (let i = 0; i < specks; i++) {
      g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)';
      g.fillRect(rng() * W, rng() * H, 1.5, 1.5);
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  const HEADINGS = ['→ EAST', '↓ SOUTH', '← WEST', '↑ NORTH'];

  // Every read the file ever held — the sheet shows the WHOLE story,
  // including footage that aged off, died with its pole, or is still
  // sitting unsent on a drive.
  function allEvidence(kase) {
    return state.reads.filter(r => r.caseId === kase.id).sort((a, b) => a.t - b.t);
  }
  function readStatus(r) {
    if (r.lost) return ['LOST WITH POLE', '#ff8a80'];
    if (r.uploadedAt === null) return ['ON THE POLE — UNSENT', '#ffb44a'];
    if (state.time >= r.expiresAt) return ['AGED OFF', '#8b93a5'];
    return null;   // active
  }

  // The sightings map: where each frame was taken, in time order, with
  // the legs between them — and a named problem when a leg is impossible
  // ("9 blocks in 3s: nothing drives that fast").
  function drawCaseMap(cv, kase, ev) {
    const g = cv.getContext('2d');
    const map = state.map, W = cv.width, H = cv.height, m = 26;
    g.fillStyle = '#0a0c11'; g.fillRect(0, 0, W, H);
    // zoom to the case's own neighbourhood: scene + every sighting, padded
    const involved = [kase.spawnNode, ...ev.map(r => r.camNode)];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of involved) {
      const nd = map.nodes[n];
      x0 = Math.min(x0, nd.x); x1 = Math.max(x1, nd.x);
      y0 = Math.min(y0, nd.y); y1 = Math.max(y1, nd.y);
    }
    x0 = Math.max(0, x0 - 2); x1 = Math.min(map.W - 1, x1 + 2);
    y0 = Math.max(0, y0 - 2); y1 = Math.min(map.H - 1, y1 + 2);
    const scale = Math.min((W - 2 * m) / Math.max(2, x1 - x0), (H - 2 * m) / Math.max(2, y1 - y0), 90);
    const ox = (W - (x1 - x0) * scale) / 2 - x0 * scale, oy = (H - (y1 - y0) * scale) / 2 - y0 * scale;
    const px = (n) => ox + map.nodes[n].x * scale, py = (n) => oy + map.nodes[n].y * scale;
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    // streets
    g.strokeStyle = '#242a36'; g.lineWidth = 2;
    for (const s of map.segs) {
      g.beginPath(); g.moveTo(px(s.a), py(s.a)); g.lineTo(px(s.b), py(s.b)); g.stroke();
    }
    // the scene
    g.save();
    g.translate(px(kase.spawnNode), py(kase.spawnNode));
    g.rotate(Math.PI / 4);
    g.fillStyle = '#ff5a52';
    g.fillRect(-7, -7, 14, 14);
    g.restore();
    // legs between consecutive sightings — impossible legs paint LAST so
    // a clean return leg on the same street can never hide them
    for (const pass of [true, false]) {
      for (let i = 1; i < ev.length; i++) {
        const a = ev[i - 1], b = ev[i];
        const ok = CaseSystem.pairCoherent(state, a, b);
        if (ok !== pass) continue;
        g.strokeStyle = ok ? 'rgba(57,211,192,0.75)' : 'rgba(255,90,82,0.95)';
        g.lineWidth = ok ? 3 : 4;
        g.setLineDash(ok ? [] : [7, 6]);
        g.beginPath(); g.moveTo(px(a.camNode), py(a.camNode)); g.lineTo(px(b.camNode), py(b.camNode)); g.stroke();
        g.setLineDash([]);
      }
    }
    // numbered sightings (jitter repeats at the same pole so both show)
    g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const seenAt = {};
    ev.forEach((r, i) => {
      const k = r.camNode;
      const jit = (seenAt[k] || 0) * 9;
      seenAt[k] = (seenAt[k] || 0) + 1;
      const x = px(k) + jit, y = py(k) - jit;
      const st = readStatus(r);
      g.fillStyle = st ? '#5a6070' : '#ffc84a';
      g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill();
      g.fillStyle = '#0b0d12';
      g.fillText(String(i + 1), x, y + 1);
    });
    g.restore();
    // legend
    g.fillStyle = 'rgba(10,12,17,0.8)'; g.fillRect(2, 2, 170, 52);
    g.font = '11px monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#ff5a52'; g.fillText('◆ scene', 8, 16);
    g.fillStyle = '#ffc84a'; g.fillText('● sighting (in order)', 8, 32);
    g.fillStyle = 'rgba(255,90,82,0.9)'; g.fillText('┅ impossible leg', 8, 48);
  }

  function legDiagnostics(ev) {
    const out = [];
    let clean = 0;
    for (let i = 1; i < ev.length; i++) {
      const a = ev[i - 1], b = ev[i];
      if (CaseSystem.pairCoherent(state, a, b)) { clean++; continue; }
      const dd = CaseSystem.nodeDist(state, a.camNode, b.camNode);
      const dt = Math.max(0.1, b.t - a.t);
      out.push(`<span class="bad">⚠ #${i} → #${i + 1}: ${dd} blocks in ${dt < 10 ? dt.toFixed(1) : Math.round(dt)}s — nothing drives that fast. One of these frames is someone else.</span>`);
    }
    if (ev.length >= 2 && out.length === 0) out.push(`${clean} leg${clean === 1 ? '' : 's'}, all drivable — the route holds together.`);
    return out.join('<br>');
  }

  function stillMeta(read, idx, refId, conflicts, idxOf) {
    const bits = [];
    if (read.id === refId) bits.push('<span class="ref">BEST FRAME #' + idx + '</span>');
    else bits.push('#' + idx);
    const st = readStatus(read);
    if (st) bits.push(`<span style="color:${st[1]};font-weight:700">${st[0]}</span>`);
    bits.push('CONF ' + read.conf);
    bits.push(fmtTime(read.t));
    bits.push('CAM ' + read.camId + (read.camTags > 0 ? ' · <span class="warn">LENS FOULED</span>' : ''));
    if (read.vehId !== null && read.heading !== undefined) bits.push(HEADINGS[read.heading]);
    const against = conflicts.filter(p => p.includes(read.id));
    if (against.length) bits.push('<span class="warn">⚠ CANNOT BE ONE CAR WITH ' +
      against.map(p => '#' + idxOf[p[0] === read.id ? p[1] : p[0]]).join(', ') + '</span>');
    return bits.join(' · ');
  }

  let evsheetCaseId = null;

  function openEvidenceSheet(caseId) {
    closeEvidenceSheet();
    const kase = CaseSystem.byId(state, caseId);
    if (!kase || kase.status !== 'CONTESTED') return;
    evsheetCaseId = caseId;
    const ev = allEvidence(kase);           // the WHOLE file, aged and lost included
    const active = ev.filter(r => !readStatus(r));
    const pairs = CaseSystem.contradictionPairs(state, ev);
    const refPool = active.length ? active : ev;
    const refId = refPool.length ? refPool.reduce((m, r) => r.conf > m.conf ? r : m, refPool[0]).id : -1;
    const idxOf = {};
    ev.forEach((r, i) => { idxOf[r.id] = i + 1; });

    const sheet = h('div', 'evsheet');
    sheet.setAttribute('data-key', 'evsheet');
    const c = kase.contested || {};
    sheet.innerHTML = `<div class="evhead"><b>CASE FILE — ${kase.plate}</b>
      <span>${kase.kind || kase.type} at ${kase.landmark || 'the scene'} · ${ev.length} frame${ev.length === 1 ? '' : 's'}${active.length !== ev.length ? ' (' + active.length + ' usable)' : ''} · ${c.contradiction ? 'contradiction' : 'near the bar'} · cold in ${Math.max(0, Math.ceil(kase.coldAt - state.time))}s</span>
      <button data-key="ev-close">✕</button></div>
      ${kase.witnessDesc ? `<div class="evhint" style="margin:0 0 8px"><span style="color:#ffc84a;font-weight:700">WITNESS: "a ${kase.witnessDesc}"</span> — does every frame match?</div>` : ''}`;

    // the sightings map: scene, numbered frames in time order, and the
    // legs between them — impossible legs drawn dashed red and named
    if (ev.length) {
      const mapWrap = h('div', 'evmap');
      const mcv = document.createElement('canvas');
      mcv.width = 720; mcv.height = 440;
      drawCaseMap(mcv, kase, ev);
      mapWrap.appendChild(mcv);
      mapWrap.setAttribute('data-key', 'evmap');
      sheet.appendChild(mapWrap);
      const legs = h('div', 'evlegs');
      legs.innerHTML = legDiagnostics(ev);
      sheet.appendChild(legs);
    }

    // reference frame, big
    const ref = ev.find(r => r.id === refId);
    if (ref) {
      const wrap = h('div', 'evref');
      const cv = document.createElement('canvas');
      cv.width = 720; cv.height = 300;
      drawStill(cv, ref);
      wrap.appendChild(cv);
      const meta = h('div', 'evmeta');
      meta.innerHTML = stillMeta(ref, idxOf[ref.id], refId, pairs, idxOf);
      wrap.appendChild(meta);
      wrap.onclick = () => { Renderer.centerOn(ref.camNode); Renderer.pingNode(ref.camNode); };
      sheet.appendChild(wrap);
    }

    // every frame in time order
    const grid = h('div', 'evgrid');
    ev.forEach((r, i) => {
      const cell = h('div', 'evcell' + (readStatus(r) ? ' inactive' : ''));
      cell.setAttribute('data-key', 'ev-still-' + (i + 1));
      const cv = document.createElement('canvas');
      cv.width = 352; cv.height = 200;
      drawStill(cv, r);
      cell.appendChild(cv);
      const meta = h('div', 'evmeta');
      meta.innerHTML = stillMeta(r, i + 1, refId, pairs, idxOf);
      cell.appendChild(meta);
      const inConflict = pairs.some(p => p.includes(r.id));
      cell.onclick = () => { Renderer.centerOn(r.camNode); Renderer.pingNode(r.camNode, inConflict ? 'red' : 'cyan'); };
      grid.appendChild(cell);
    });
    sheet.appendChild(grid);

    sheet.appendChild(h('div', 'evhint',
      'Compare each car with the best frame. Smudged plates and murky frames are weak; ⚠ frames cannot be the same vehicle. Tap a frame to see its pole.'));

    const verdict = h('div', 'evverdict');
    const cb = h('button', 'charge', 'CHARGE');
    cb.setAttribute('data-key', 'ev-charge-' + kase.id);
    cb.onclick = () => { GameAudio.unlock(); Actions.adjudicate(state, kase.id, 'CHARGE'); closeEvidenceSheet(); };
    const rb = h('button', 'release', 'RELEASE');
    rb.setAttribute('data-key', 'ev-release-' + kase.id);
    rb.onclick = () => { GameAudio.unlock(); Actions.adjudicate(state, kase.id, 'RELEASE'); closeEvidenceSheet(); };
    verdict.appendChild(cb); verdict.appendChild(rb);
    sheet.appendChild(verdict);

    sheet.querySelector('[data-key=ev-close]').onclick = () => closeEvidenceSheet();
    root.appendChild(sheet);
    els.evsheet = sheet;
  }

  function closeEvidenceSheet() {
    if (els.evsheet) { els.evsheet.remove(); els.evsheet = null; }
    evsheetCaseId = null;
  }

  // ---------- identity pill: tap anything and it names itself ----------

  const DISTRICT_NAMES = {
    DOWNTOWN: 'DOWNTOWN', APARTMENTS: 'THE APARTMENTS', HOUSES: 'THE ROW HOUSES',
    SYNDICATE: 'THE SYNDICATE BLOCK', BANK: 'THE BANK', OFFICE: 'THE OFFICE TOWER',
    GROCERY: 'THE GROCERY STORE'
  };
  function districtName(d) { return DISTRICT_NAMES[d] || d; }
  function poiAt(nodeIdx) {
    if (!state.map.poi) return null;
    if (state.map.poi.BANK === nodeIdx) return 'THE BANK';
    if (state.map.poi.OFFICE === nodeIdx) return 'THE OFFICE TOWER';
    if (state.map.poi.GROCERY === nodeIdx) return 'THE GROCERY STORE';
    if (state.map.nodes[nodeIdx].syndicate) return 'THE SYNDICATE BLOCK';
    return null;
  }

  function identity(text) {
    els.identity.textContent = text;
    els.identity.style.opacity = 1;
    clearTimeout(identityTimer);
    identityTimer = setTimeout(() => { els.identity.style.opacity = 0; }, 2600);
  }

  function describeTap(pick) {
    if (!pick) return;
    if (pick.kind === 'camera') {
      const cam = CameraSystem.byId(state, pick.id);
      if (!cam) return;
      const cond = cam.tags >= 2 ? 'LENS BADLY FOULED' : cam.tags === 1 ? 'LENS FOULED' : 'CLEAN';
      const link = CameraSystem.relayAdjacent(state, cam) ? 'RELAY-LINKED'
        : cam.drive.length + ' unsent · uploads in ' + Math.max(0, Math.ceil(CONFIG.Retention.UPLOAD_INTERVAL - (state.time - cam.lastUpload))) + 's';
      const aim = Sightlines.aimLabel(cam.type, cam.dir);
      identity('CYCLOPS ' + cam.type + (aim ? ' · WATCHING ' + aim : '') + ' — ' + cond + ' · ' + link + (cam.hardened ? ' · HARDENED' : ''));
    } else if (pick.kind === 'vandal') {
      const v = state.vandals.find(x => x.id === pick.id);
      if (!v) return;
      identity(v.type + (v.state === 'ACT' ? ' — WORKING ON A POLE' : ' — ON THE MOVE'));
    } else if (pick.kind === 'vehicle') {
      identity('VEHICLE — TRAFFIC');
    } else if (pick.kind === 'segment') {
      const s = state.map.segs[pick.id];
      const dist = state.map.districts ? state.map.districts[s.a] : null;
      identity((s.arterial ? 'ARTERIAL — FAST TRAFFIC, POOR READS' : 'STREET — SLOW TRAFFIC, CLEAN READS') +
        (dist ? ' · ' + districtName(dist) : ''));
    } else if (pick.kind === 'node') {
      const n = state.map.nodes[pick.id];
      if (n.exit) { identity('CITY LIMITS — SUSPECTS ESCAPE HERE'); return; }
      const poi = poiAt(pick.id);
      if (poi) identity(poi + ' — CRIME LANDS HERE. WATCH THE APPROACHES.');
      else identity('OPEN POLE — ' + districtName(state.map.districts ? state.map.districts[pick.id] : 'HOUSES'));
    }
  }

  // ---------- context menu (§12.2) ----------

  function ctxButton(key, name, cost, ex, refused) {
    const b = h('button', 'ctxbtn');
    b.setAttribute('data-key', key);
    if (refused) b.setAttribute('data-refused', refused);
    b.innerHTML = `<div class="nm"><span>${name}</span>${cost !== null ? `<span class="cost">${cost}</span>` : ''}</div><div class="ex">${refused || ex}</div>`;
    return b;
  }

  function openMenu(nodeIdx, sx, sy) {
    closeMenu(); hideConfirm();
    menuNode = nodeIdx;
    Renderer.setSelected(nodeIdx);
    const cam = CameraSystem.camAt(state, nodeIdx);
    const menu = h('div', 'ctxmenu');
    menu.setAttribute('data-key', 'ctxmenu');

    const colEyes = h('div', 'ctxcol', '<div class="colhead">EYES</div>');
    for (const [type, ex] of [['POST', '2 blocks, one corner'], ['LONG', '5 blocks, one way'], ['DOME', 'this corner, all ways']]) {
      const spec = CONFIG.Cameras[type];
      let refused = null;
      if (cam) refused = 'POLE OCCUPIED';
      else if (state.budget < spec.COST) refused = 'BUDGET SHORT ' + Math.ceil(spec.COST - state.budget);
      const b = ctxButton('buy-' + type.toLowerCase(), 'CYCLOPS ' + type, spec.COST, ex, refused);
      b.onclick = (e) => {
        e.stopPropagation(); GameAudio.unlock();
        if (refused) { identity(refused); GameAudio.sounds.deny(); return; }
        startGhost(type, nodeIdx);
      };
      colEyes.appendChild(b);
    }

    const colUp = h('div', 'ctxcol', '<div class="colhead">UPLINK</div>');
    {
      const spec = CONFIG.Cameras.RELAY;
      let refused = cam ? 'POLE OCCUPIED' : state.budget < spec.COST ? 'BUDGET SHORT ' + Math.ceil(spec.COST - state.budget) : null;
      const b = ctxButton('buy-relay', 'RELAY', spec.COST, 'neighbours upload live', refused);
      b.onclick = (e) => {
        e.stopPropagation(); GameAudio.unlock();
        if (refused) { identity(refused); GameAudio.sounds.deny(); return; }
        startGhost('RELAY', nodeIdx);
      };
      colUp.appendChild(b);
    }

    const colWorks = h('div', 'ctxcol', '<div class="colhead">WORKS</div>');
    if (cam) {
      const U = CONFIG.Upgrades;
      const works = [
        ['harden', 'HARDEN', U.HARDEN, 'vandals take much longer', cam.hardened ? 'ALREADY HARDENED' : state.budget < U.HARDEN ? 'BUDGET SHORT ' + Math.ceil(U.HARDEN - state.budget) : null],
        ['storage', 'STORAGE', U.STORAGE, 'reads live longer', cam.storageUp ? 'DRIVE ALREADY FITTED' : state.budget < U.STORAGE ? 'BUDGET SHORT ' + Math.ceil(U.STORAGE - state.budget) : null],
        ['clean', 'CLEAN LENS', U.CLEAN, 'undo the paint', cam.tags === 0 ? 'LENS IS CLEAN' : state.budget < U.CLEAN ? 'BUDGET SHORT ' + Math.ceil(U.CLEAN - state.budget) : null]
      ];
      for (const [key, name, cost, ex, refused] of works) {
        const b = ctxButton(key, name, cost, ex, refused);
        b.onclick = (e) => {
          e.stopPropagation(); GameAudio.unlock();
          if (refused) { identity(refused); GameAudio.sounds.deny(); return; }
          Actions.upgrade(state, cam.id, key.toUpperCase() === 'CLEAN' ? 'CLEAN' : key.toUpperCase());
          GameAudio.sounds.confirm();
          closeMenu();
        };
        colWorks.appendChild(b);
      }
      const relocCost = Math.ceil(CONFIG.Cameras[cam.type].COST * CONFIG.Cameras.RELOCATE_COST_FRACTION);
      const refusedR = state.budget < relocCost ? 'BUDGET SHORT ' + Math.ceil(relocCost - state.budget) : null;
      const br = ctxButton('relocate', 'RELOCATE', relocCost, 'tap the new pole', refusedR);
      br.onclick = (e) => {
        e.stopPropagation(); GameAudio.unlock();
        if (refusedR) { identity(refusedR); GameAudio.sounds.deny(); return; }
        relocPick = cam.id;
        identity('RELOCATING — TAP THE NEW POLE');
        closeMenu();
      };
      colWorks.appendChild(br);
    } else {
      const b = ctxButton('works-none', 'NO UNIT HERE', null, '', 'mount a camera first');
      b.onclick = (e) => { e.stopPropagation(); identity('No unit on this pole yet.'); };
      colWorks.appendChild(b);
    }

    const colDial = h('div', 'ctxcol', '<div class="colhead">DIAL</div>');
    const bd = ctxButton('focus-dial', 'THE BAR', null, 'BAR AT ' + state.threshold + ' — ' + State.thresholdBand(state), null);
    bd.onclick = (e) => {
      e.stopPropagation();
      identity('The bar is in the top strip — drag it. Low closes fast and charges wrong; high stays clean and goes cold.');
      closeMenu();
    };
    colDial.appendChild(bd);
    // ✕ dismiss chip, in-flow at the end of the last column (§12.2)
    const x = h('button', 'dismiss', '✕');
    x.setAttribute('data-key', 'dismiss');
    x.onclick = (e) => { e.stopPropagation(); closeMenu(); };
    colDial.appendChild(x);

    menu.appendChild(colEyes); menu.appendChild(colUp); menu.appendChild(colWorks); menu.appendChild(colDial);
    root.appendChild(menu);

    // clamp on screen at the tap point
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    const W = window.innerWidth, H = window.innerHeight;
    menu.style.left = clamp(sx - mw / 2, 6, W - mw - 6) + 'px';
    menu.style.top = clamp(sy - mh - 18, 60, H - mh - 6) + 'px';
    els.menu = menu;
  }

  function closeMenu() {
    if (els.menu) { els.menu.remove(); els.menu = null; }
    if (!ghostMode) Renderer.setSelected(null);
    menuNode = null;
  }

  // ---------- ghost → turn → confirm (§12.2) ----------

  function startGhost(type, nodeIdx, relocCamId) {
    closeMenu();
    ghostMode = { type, node: nodeIdx, dir: 0, relocCamId: relocCamId || null };
    Renderer.setSelected(nodeIdx);
    showConfirm();
  }

  function showConfirm() {
    hideConfirm();
    const gm = ghostMode;
    Renderer.setGhost(gm.node, gm.type, gm.dir);
    const wrap = h('div', 'confirmwrap');
    const q = Sightlines.quoteQuality(state, gm.node, gm.type, gm.dir);
    const pill = h('div', 'qualitypill');
    pill.setAttribute('data-key', 'qualitypill');
    if (gm.type === 'RELAY') {
      const neighbours = state.map.adj[gm.node].filter(e => {
        const c = CameraSystem.camAt(state, e.node);
        return c && c.type !== 'RELAY';
      }).length;
      pill.innerHTML = neighbours > 0
        ? `LINKS <b>${neighbours}</b> CAMERA${neighbours === 1 ? '' : 'S'} · <span class="verdictword" style="color:#39d3c0">LIVE UPLOAD</span>`
        : `LINKS <b>0</b> CAMERAS · <span class="verdictword" style="color:#ff5a52">NOTHING TO SERVE</span>`;
    } else if (q) {
      const word = q.best >= state.threshold + 10 ? ['CLEAN', '#39d3c0']
        : q.best >= state.threshold ? ['SERVICEABLE', '#ffb44a'] : ['LIAR', '#ff5a52'];
      pill.innerHTML = `READS <b>${q.best}</b> BEST / <b>${q.worst}</b>${q.worstArterial ? ' ON THE ARTERIAL' : ' WORST'} · <span class="verdictword" style="color:${word[1]}">${word[0]}</span>`;
    } else {
      pill.innerHTML = `<span class="verdictword" style="color:#ff5a52">SEES NOTHING FROM HERE</span>`;
    }
    wrap.appendChild(pill);

    const row = h('div', 'confirmrow');
    const spec = CONFIG.Cameras[gm.type];
    if (spec.RANGE > 0 && spec.DIRECTIONS < 4) {   // aimed units: POST quadrant, LONG ray
      const l = h('button', 'turnbtn', '↺'); l.setAttribute('data-key', 'turn-ccw');
      const r = h('button', 'turnbtn', '↻'); r.setAttribute('data-key', 'turn-cw');
      l.onclick = (e) => { e.stopPropagation(); gm.dir = (gm.dir + 3) % 4; showConfirm(); };
      r.onclick = (e) => { e.stopPropagation(); gm.dir = (gm.dir + 1) % 4; showConfirm(); };
      row.appendChild(l); row.appendChild(r);
    }
    const ok = h('button', 'okbtn', 'CONFIRM');   // label never changes width (§0.12)
    ok.setAttribute('data-key', 'confirm');
    ok.onclick = (e) => {
      e.stopPropagation(); GameAudio.unlock();
      let r;
      if (gm.relocCamId) r = Actions.relocate(state, gm.relocCamId, gm.node, gm.dir);
      else r = Actions.place(state, gm.node, gm.type, gm.dir);
      if (r.ok) {
        GameAudio.sounds.confirm();
        cancelGhost();
        if (hooks.onPlaced) hooks.onPlaced();
      } else {
        identity(r.reason);
        GameAudio.sounds.deny();
        ok.setAttribute('data-refused', r.reason);
      }
    };
    row.appendChild(ok);
    const x = h('button', 'cancelbtn', '✕');
    x.setAttribute('data-key', 'cancel');
    x.onclick = (e) => { e.stopPropagation(); cancelGhost(); };
    row.appendChild(x);
    wrap.appendChild(row);
    root.appendChild(wrap);
    els.confirm = wrap;
    positionConfirm();
  }

  function positionConfirm() {
    if (!els.confirm || !ghostMode) return;
    const s = Renderer.nodeScreen(ghostMode.node);
    const w = els.confirm.offsetWidth, hh = els.confirm.offsetHeight;
    els.confirm.style.left = clamp(s.x - w / 2, 6, window.innerWidth - w - 6) + 'px';
    els.confirm.style.top = clamp(s.y + 22, 100, window.innerHeight - hh - 60) + 'px';
  }

  function hideConfirm() {
    if (els.confirm) { els.confirm.remove(); els.confirm = null; }
  }

  function cancelGhost() {
    ghostMode = null;
    Renderer.clearGhost();
    Renderer.setSelected(null);
    hideConfirm();
  }

  // ---------- verdict & title overlays ----------

  function scalesHtml(v) {
    const names = { WARRANT: 'WARRANT', CLEARANCE: 'CLEARANCE', TRUST: 'TRUST', NETWORK: 'NETWORK', TREASURY: 'TREASURY' };
    let rows = '';
    for (const k in v.scales) {
      const val = Math.round(v.scales[k]);
      const col = val >= 60 ? '#5a9a6a' : val >= 35 ? '#b0813a' : '#b04a42';
      rows += `<div class="srow"><span class="sname">${names[k]} ×${CONFIG.Shifts.REVIEW_WEIGHTS[k]}</span>
        <span class="sbar"><i style="width:${val}%;background:${col}"></i></span><span class="sval">${val}</span></div>`;
    }
    return `<div class="scales">${rows}</div>`;
  }

  function showVerdict(v) {
    cancelGhost(); closeMenu(); closeEvidenceSheet();
    hideOverlay();
    const o = h('div', 'overlay');
    o.setAttribute('data-key', 'verdict');
    const win = v.result === 'WIN';
    const head = v.reason === 'WARRANT' ? 'WARRANT SERVED'
      : v.reason === 'REVIEW' ? (win ? 'REVIEW: RETAINED' : 'REVIEW: RELIEVED')
      : v.reason === 'TRUST' ? 'RELIEVED OF DUTY'
      : 'RELIEVED OF DUTY';
    const sub = v.reason === 'WARRANT' ? 'The syndicate case held. The raid goes in at dawn.'
      : v.reason === 'REVIEW' ? (win ? 'The Commissioner weighed the board and ruled for the analyst.' : 'The Commissioner weighed the board and ruled against the analyst.')
      : v.reason === 'TRUST' ? 'Too many wrong people were stopped. The city stopped answering.'
      : 'Too few cases closed. The desk was given to someone else.';
    o.innerHTML = `<h1 style="color:${win ? '#7ad9a0' : '#ff8a80'}">${head}</h1>
      <div class="sub">${sub} · shift ${state.shift.num} · ${fmtTime(state.time)}${typeof v.score === 'number' ? ' · weighed ' + v.score : ''}</div>
      ${v.scales ? scalesHtml(v) : ''}`;
    if (v.refusable) {
      const rb = h('button', 'bigbtn warn', 'REFUSE — WORK ON');
      rb.setAttribute('data-key', 'refuse');
      rb.onclick = () => { Actions.refuseReview(state); hideOverlay(); };
      o.appendChild(rb);
    }
    const again = h('button', 'bigbtn primary', 'AGAIN');
    again.setAttribute('data-key', 'again');
    again.onclick = () => { hideOverlay(); if (hooks.onAgain) hooks.onAgain(); };
    o.appendChild(again);
    const back = h('button', 'bigbtn', 'BACK TO MENU');
    back.setAttribute('data-key', 'backtomenu');
    back.onclick = () => { hideOverlay(); if (hooks.onBackToMenu) hooks.onBackToMenu(); };
    o.appendChild(back);
    root.appendChild(o);
    els.overlay = o;
    root.classList.add('overlaid');
  }

  function showTitle(opts) {
    hideOverlay();
    const o = h('div', 'overlay title');
    o.setAttribute('data-key', 'title');
    o.innerHTML = `<h1>BLIND SPOT</h1>
      <div class="tag">Every camera you place teaches them where not to drive.</div>`;
    if (opts.resume) {
      const rb = h('button', 'bigbtn primary', `RESUME YOUR SHIFT — SHIFT ${opts.resume.shift} · ${opts.resume.seed}`);
      rb.setAttribute('data-key', 'resume');
      rb.style.fontSize = '12px';
      rb.onclick = () => { hideOverlay(); opts.onResume(); };
      o.appendChild(rb);
    }
    if (opts.resumeDemo) {
      const rd = h('button', 'bigbtn', `RESUME WATCHING — SHIFT ${opts.resumeDemo.shift}`);
      rd.setAttribute('data-key', 'resumedemo');
      rd.style.fontSize = '12px';
      rd.onclick = () => { hideOverlay(); opts.onResumeDemo(); };
      o.appendChild(rd);
    }
    const sb2 = h('button', 'bigbtn primary', 'START SHIFT');
    sb2.setAttribute('data-key', 'start');
    sb2.onclick = () => { hideOverlay(); opts.onStart(seedInput.value.trim() || null); };
    o.appendChild(sb2);
    const db = h('button', 'bigbtn', 'WATCH A SHIFT');
    db.setAttribute('data-key', 'watchdemo');
    db.onclick = () => { hideOverlay(); opts.onDemo(); };
    o.appendChild(db);
    const seedrow = h('div', 'seedrow');
    const seedInput = h('input');
    seedInput.setAttribute('data-key', 'seedinput');
    seedInput.placeholder = 'seed';
    seedInput.maxLength = 12;
    seedInput.value = randomSeedString();   // never blank (player-directed)
    const rndb = h('button', null, 'RANDOM');
    rndb.setAttribute('data-key', 'randomseed');
    rndb.onclick = () => { seedInput.value = randomSeedString(); };
    seedrow.appendChild(seedInput); seedrow.appendChild(rndb);
    o.appendChild(seedrow);
    const stamp = h('div', 'buildstamp', document.title ? (window.BUILDSTAMP || '') : '');
    stamp.textContent = window.BUILDSTAMP || '';
    o.appendChild(stamp);
    root.appendChild(o);
    els.overlay = o;
    root.classList.add('overlaid');
  }

  function hideOverlay() {
    if (els.overlay) { els.overlay.remove(); els.overlay = null; }
    root.classList.remove('overlaid');
  }

  // ---------- input hardening (§18.2) ----------

  const pointers = new Map();
  let tapCandidate = null, pinchDist = 0, suppressTaps = false;

  function bindInput() {
    const canvas = document.getElementById('game-canvas');

    canvas.addEventListener('pointerdown', (e) => {
      GameAudio.unlock();
      if (e.isPrimary) pointers.clear();      // purge dead pointers (§18.2)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: Date.now() });
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      if (pointers.size === 1) tapCandidate = e.pointerId;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        tapCandidate = null;
      }
      if (hooks.onAnyTap) hooks.onAnyTap();
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 12) tapCandidate = null;
        if (tapCandidate === null) {
          Renderer.pan(dx, dy);
          positionConfirm();
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) Renderer.zoomBy(d / pinchDist);
        pinchDist = d;
        positionConfirm();
      }
    });

    const release = (e) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (p && tapCandidate === e.pointerId && Date.now() - p.t < 600 && !suppressTaps) {
        onTap(e.clientX, e.clientY);
      }
      tapCandidate = null;
      pinchDist = 0;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', (e) => { pointers.delete(e.pointerId); });
    window.addEventListener('blur', () => pointers.clear());
    document.addEventListener('visibilitychange', () => pointers.clear());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      Renderer.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
      positionConfirm();
    }, { passive: false });
  }

  function onTap(x, y) {
    if (!state || state.verdict) return;
    // demo mode is a guided tour, not a locked door (player-directed):
    // pan, zoom and tap-to-name all work; only the chip hands the desk back
    if (hooks.isDemoMode && hooks.isDemoMode()) {
      describeTap(Renderer.pickObject(x, y));
      return;
    }
    if (els.menu) { closeMenu(); return; }

    if (relocPick !== null) {
      const n = Renderer.pickNode(x, y);
      if (n !== null && !state.map.nodes[n].exit && !CameraSystem.camAt(state, n)) {
        const cam = CameraSystem.byId(state, relocPick);
        if (cam) startGhost(cam.type, n, relocPick);
        relocPick = null;
        return;
      }
      relocPick = null;
      identity('Relocation cancelled.');
      return;
    }

    if (ghostMode) {
      const n = Renderer.pickNode(x, y);
      if (n !== null && n !== ghostMode.node && !state.map.nodes[n].exit && !CameraSystem.camAt(state, n)) {
        ghostMode.node = n;
        Renderer.setSelected(n);
        showConfirm();
      }
      return;
    }

    const pick = Renderer.pickObject(x, y);
    describeTap(pick);
    if (pick && (pick.kind === 'node' || pick.kind === 'camera')) {
      const nodeIdx = pick.kind === 'camera'
        ? CameraSystem.byId(state, pick.id).node
        : pick.id;
      if (!state.map.nodes[nodeIdx].exit) {
        openMenu(nodeIdx, x, y);
        if (hooks.onMenuOpened) hooks.onMenuOpened();
      }
    }
  }

  return {
    init, setMatch, update, identity,
    showTitle, showVerdict, hideOverlay,
    openEvidenceSheet, closeEvidenceSheet,
    openMenu, closeMenu, startGhost, cancelGhost, positionConfirm,
    setSuppressTaps: (v) => { suppressTaps = v; },
    getEl: (key) => root.querySelector(`[data-key="${key}"]`),
    isMenuOpen: () => !!els.menu,
    isGhostActive: () => !!ghostMode,
    getGhost: () => ghostMode,
    simulateTapAt: (x, y) => onTap(x, y)
  };
})();
