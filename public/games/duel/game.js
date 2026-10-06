// Duels client. Each browser moves its own player and reports what hurt it; the server
// (or, in practice mode, the same Match code running here) runs rounds, health and cards.
import {
  W, H, PR, MAPS, CARD, TYPES, ROUND_OPTIONS, statsFor, stepPlayer, stepBullet, bulletHitsBox, bounceBack,
  makeShot, bulletFrom, solidsAt, ropeBox, sawAt, Match,
} from './shared.js?v=3';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = new URLSearchParams(location.search);
const cv = $('cv'), ctx = cv.getContext('2d');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);
const FONT = '"Unbounded", system-ui, sans-serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const INK = '#0c0c0f', PAPER = '#f4f4f6';

/* ═══════════ Sound (tiny synth) ═══════════ */
const snd = (() => {
  let ac = null, out = null;
  const ok = () => {
    if (!ac) { try { ac = new AudioContext(); out = ac.createGain(); out.gain.value = 0.26; out.connect(ac.destination); } catch { return false; } }
    if (ac.state === 'suspended') ac.resume();
    return true;
  };
  function tone(f0, f1, dur, type = 'square', gain = 0.2) {
    if (!ok()) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, gain = 0.25, freq = 900) {
    if (!ok()) return;
    const t = ac.currentTime, b = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = gain;
    s.connect(f).connect(g).connect(out); s.start(t);
  }
  let lastShoot = 0;
  return {
    shoot: () => { const n = performance.now(); if (n - lastShoot < 40) return; lastShoot = n; tone(620, 180, 0.08, 'square', 0.08); noise(0.05, 0.07, 3000); },
    hit: () => { tone(220, 60, 0.14, 'sawtooth', 0.16); noise(0.1, 0.18, 1400); },
    hurt: () => { tone(160, 50, 0.22, 'sawtooth', 0.2); noise(0.14, 0.22, 900); },
    boom: () => { noise(0.4, 0.4, 600); tone(90, 30, 0.35, 'sine', 0.28); },
    block: () => tone(900, 1400, 0.09, 'triangle', 0.16),
    jump: () => tone(300, 520, 0.08, 'triangle', 0.06),
    bounce: () => tone(1200, 900, 0.04, 'sine', 0.04),
    reload: () => { tone(400, 400, 0.04, 'square', 0.05); setTimeout(() => tone(600, 600, 0.04, 'square', 0.05), 90); },
    tick: () => tone(700, 700, 0.05, 'sine', 0.1),
    go: () => tone(500, 1000, 0.18, 'square', 0.12),
    win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.16, 'triangle', 0.14), i * 110)); },
    lose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f * 0.98, 0.2, 'triangle', 0.12), i * 140)); },
    card: () => { tone(500, 900, 0.12, 'triangle', 0.12); setTimeout(() => tone(900, 1300, 0.14, 'triangle', 0.1), 90); },
    chat: () => tone(880, 880, 0.05, 'sine', 0.06),
    die: () => { noise(0.5, 0.4, 500); tone(300, 40, 0.5, 'sawtooth', 0.2); },
    thud: () => { noise(0.12, 0.3, 400); tone(140, 70, 0.12, 'sine', 0.2); },
    crack: () => noise(0.18, 0.3, 2200),
  };
})();

/* ═══════════ State ═══════════ */
const G = {
  net: null, practice: false, you: 0, m: null, phase: null, round: 0,
  hp: [100, 100], sh: [0, 0], dead: [false, false], stats: [statsFor(), statsFor()], hues: ['#e8a33d', '#4a90d9'],
  actors: [], me: null, bot: null,
  R: { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, a: 0, b: 0, g: 0, mx: 0, my: 0, ab: 0, ch: 0, rl: 0, at: 0 },
  bullets: [], parts: [], floats: [], rings: [], fields: [], bombs: [], saws: [], timers: [],
  broken: new Set(), rt: 0, solids: [], ropePrev: [], shake: 0,
  timerEnd: 0, ping: 80, mouse: { x: W / 2, y: H / 2, down: false }, keys: {}, jumpQueued: false, chatOpen: false, sendT: 0,
};
const mapNow = () => MAPS[G.m?.map ?? 0];
const nameOf = i => G.m?.players[i]?.username || (i ? 'Player 2' : 'Player 1');
const actorOf = slot => G.actors.find(a => a.slot === slot) || null;
const live = () => ['countdown', 'fight', 'roundEnd'].includes(G.phase);
const newBody = (x, y) => ({ x, y, vx: 0, vy: 0, ground: false, wall: 0, airJumps: 0, coyote: 0, on: null });
const later = (t, fn) => G.timers.push({ t, fn, round: G.round });

// Where a player is and what they're doing, whether they're simulated here or not.
function view(slot) {
  const a = actorOf(slot);
  if (a) return { x: a.body.x, y: a.body.y, vx: a.body.vx, vy: a.body.vy, aim: a.aim, cursor: a.cursor, blocking: a.blockT > 0, ab: a.abT > 0 ? a.abN : 0, ch: a.abCharge, rl: a.reloadT > 0 };
  const R = G.R;
  return { x: R.x, y: R.y, vx: R.vx, vy: R.vy, aim: R.a, cursor: { x: R.mx, y: R.my }, blocking: !!R.b, ab: R.ab, ch: R.ch, rl: !!R.rl };
}

/* ═══════════ Networking ═══════════ */
class SocketNet {
  constructor(id) {
    this.id = id; this.tries = 0; this.closed = false;
    this.open();
    setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }
  open() {
    const ws = this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/duel-ws?match=${encodeURIComponent(this.id)}`);
    ws.onopen = () => { this.tries = 0; status(''); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
    ws.onclose = e => {
      if (this.closed) return;
      if (e.code === 4001) return closedScreen('Sign in on the Friends page to play duels.');
      if (e.code === 4004 || e.code === 4000 || G.phase === 'closed') return;
      this.tries++;
      status(`Connection lost. Reconnecting${this.tries > 1 ? ` (${this.tries})` : ''}…`, true);
      setTimeout(() => this.open(), Math.min(5000, 600 * this.tries));
    };
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closed = true; try { this.ws.close(); } catch {} }
}

// Practice: the real match rules run right here with a bot in the other seat.
class LocalNet {
  constructor(me, rounds) {
    this.match = new Match({
      id: 'practice', rounds,
      players: [me, { id: 'bot', username: 'Bot', color: 210, bot: true }],
      emit: (slot, msg) => queueMicrotask(() => {
        if (slot !== 1) onMsg(structuredClone(msg));
        if (slot !== 0 && msg.t === 'state') G.bot?.onState(msg.match);
      }),
    });
    queueMicrotask(() => { onMsg({ t: 'hello', you: 0 }); this.match.connect(0); this.match.connect(1); });
  }
  send(m) { if (m.t === 'ping') return onMsg({ t: 'pong', c: m.c }); this.match.handle(0, m); }
  tick(dt) { this.match.tick(dt); }
  close() {}
}

function status(text, bad) { const s = $('status'); s.hidden = !text; s.textContent = text; s.classList.toggle('bad', !!bad); }

const OWNER_KINDS = new Set(['hit', 'boom', 'splash', 'bomb', 'emp', 'saw', 'static', 'over', 'cloud', 'drain', 'rad', 'abyss']);
function onMsg(m) {
  switch (m.t) {
    case 'hello':
      G.you = m.you;
      if (!G.practice) { G.me = new Actor(m.you); G.actors = [G.me]; }
      break;
    case 'state': applyState(m.match); break;
    case 's': {
      const R = G.R;
      Object.assign(R, { tx: m.x, ty: m.y, vx: m.vx, vy: m.vy, a: m.a, b: m.b, g: m.g, mx: m.mx, my: m.my, ab: m.ab, ch: m.ch, rl: m.rl, at: performance.now() });
      if (!R.seen) { R.x = m.x; R.y = m.y; R.seen = true; }
      break;
    }
    case 'shoot': {
      if (actorOf(m.slot)) break;
      const s = G.stats[m.slot];
      const ahead = Math.min(0.12, G.ping / 2000); // they fired a moment ago; catch the bullets up
      for (const sh of m.shots) {
        const b = bulletFrom(sh, s, m.slot);
        for (let t = ahead; t > 0; t -= 1 / 120) stepBullet(b, G.solids, Math.min(t, 1 / 120), bulletEnv(b));
        b.imp = null;
        G.bullets.push(b);
      }
      if (m.shots[0]) animFire(m.slot, Math.atan2(m.shots[0].vy, m.shots[0].vx));
      snd.shoot();
      break;
    }
    case 'block': if (!actorOf(m.slot)) blockFx(m.slot, m.x, m.y, m.key, { aim: m.a, area: m.area }); break;
    case 'fx': if (!actorOf(m.slot) && m.k === 'rad') radFx(m.slot, m.x, m.y, m.key); break;
    case 'break': breakBlock(m.i); break;
    case 'dmg': onDamage(m); break;
    case 'blocked': {
      G.bullets = G.bullets.filter(b => b.id !== m.bid);
      G.rings.push({ x: m.x, y: m.y, r: 8, max: 46, life: 0.3, max0: 0.3, color: G.hues[m.slot] });
      snd.block();
      break;
    }
    case 'hp': G.hp = m.hp; G.sh = m.sh; break;
    case 'chat': addChat(m); break;
    case 'pong': G.ping = G.ping * 0.7 + (performance.now() - m.c) * 0.3; break;
    case 'gone': closedScreen('This duel has ended.'); G.net?.close(); break;
    case 'replaced': closedScreen('You opened this duel somewhere else.'); G.net?.close(); break;
  }
}

function onDamage(m) {
  G.hp = m.hp; G.sh = m.sh;
  const t = m.target, body = view(t), local = actorOf(t) && !actorOf(t).bot;
  if (m.bid) G.bullets = G.bullets.filter(b => b.id !== m.bid);
  if (m.rev) {
    G.dead[t] = false;
    burst(body.x, body.y, '#ffb347', 40, 500);
    G.rings.push({ x: body.x, y: body.y, r: 10, max: 140, life: 0.6, max0: 0.6, color: '#ffb347' });
    G.floats.push({ x: body.x, y: body.y - 40, text: 'PHOENIX', life: 1.2, color: '#ffb347' });
    snd.win();
    return;
  }
  if (m.dmg) {
    const an = G.anim[t]; an.flash = 0.12; an.hurtT = 0.22; an.lagT = 0.4;
    burst(m.x || body.x, m.y || body.y, G.hues[t], m.dot ? 5 : 12, 300);
    if (!m.dot) flash(m.x || body.x, m.y || body.y, 22);
    G.floats.push({ x: body.x + (Math.random() - 0.5) * 20, y: body.y - 36, text: '-' + m.dmg, life: 0.9, max: 0.9, color: m.dot ? '#b5e08a' : local ? '#ff6b5a' : PAPER });
    G.shake = Math.max(G.shake, local ? 9 : 4);
    local ? snd.hurt() : snd.hit();
  }
  // On-damage cards for whoever dealt it.
  const atk = actorOf(1 - t);
  if (atk && OWNER_KINDS.has(m.kind)) {
    const c = G.stats[atk.slot].c;
    if (c.scavenger) { atk.ammo = G.stats[atk.slot].ammo; atk.reloadT = 0; }
    if (c.refresh) atk.blockCd = 0;
    if (c.tasteofblood) atk.bloodT = 3;
  }
  if (m.hp[t] <= 0 && !G.dead[t]) kill(t);
}

function kill(t) {
  G.dead[t] = true;
  const b = view(t);
  burst(b.x, b.y, G.hues[t], 30, 520);
  debris(b.x, b.y, G.hues[t], 16, 650, 10);
  debris(b.x, b.y, '#fffbee', 2, 500, 5);
  flash(b.x, b.y, 70, '#fff8e0', 0.18);
  puff(b.x, b.y, 8, 16, 160);
  G.rings.push({ x: b.x, y: b.y, r: 10, max: 140, life: 0.5, max0: 0.5, color: G.hues[t] });
  G.shake = 18; G.freeze = 0.08; G.slowT = 0.9;
  snd.die();
}

function breakBlock(i) {
  if (G.broken.has(i)) return;
  G.broken.add(i);
  const r = mapNow().breaks?.[i]; if (!r) return;
  for (let k = 0; k < 5; k++) splinters(r[0] + Math.random() * r[2], r[1] + Math.random() * r[3], 4);
  puff(r[0] + r[2] / 2, r[1] + r[3] / 2, 6, Math.max(r[2], r[3]) * 0.3, 90, '200,170,130', 0.5);
  snd.crack();
}

/* ═══════════ Phases ═══════════ */
const hsl = (h, l = 58) => { // → #rrggbb so it can be shaded later
  const a = 0.62 * Math.min(l / 100, 1 - l / 100), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
function applyState(m) {
  const prev = G.phase, prevRound = G.m?.round;
  G.m = m;
  G.phase = m.phase;
  G.stats = m.players.map(p => statsFor(p.cards));
  G.hp = m.players.map(p => p.hp);
  G.sh = m.players.map(p => p.sh || 0);
  G.timerEnd = performance.now() + m.timer * 1000;
  const h0 = m.players[0].color ?? 30; let h1 = m.players[1].color ?? 210;
  if (Math.abs(((h0 - h1 + 540) % 360) - 180) < 70) h1 = (h0 + 180) % 360;
  G.hues = [hsl(h0), hsl(h1)];

  if (m.phase === 'countdown' && (prev !== 'countdown' || prevRound !== m.round)) startRound();
  if (m.broken) m.broken.forEach(i => G.broken.add(i));
  if (m.phase === 'fight' && prev !== 'fight') { banner('FIGHT', '', 700); snd.go(); }
  if (m.phase === 'roundEnd' && prev !== 'roundEnd') {
    const w = m.winner;
    banner(w === G.you ? 'ROUND WON' : `${esc(nameOf(w))} takes it`, `${m.players[0].score} – ${m.players[1].score}`, 1700);
    w === G.you ? snd.win() : snd.lose();
  }
  if (m.phase === 'over' && prev !== 'over') (m.winner === G.you ? snd.win : snd.lose)();
  renderOverlays();
  renderTags();
}

function startRound() {
  G.round = G.m.round;
  G.rt = 0; G.broken = new Set();
  G.bullets = []; G.parts = []; G.floats = []; G.rings = []; G.fields = []; G.bombs = []; G.saws = []; G.timers = [];
  G.dead = [false, false];
  G.ropePrev = [];
  G.crateHits = []; G.anim = [mkAnim(), mkAnim()]; G.slowT = 0; G.freeze = 0;
  G.solids = solidsAt(mapNow(), 0, G.broken);
  G.actors.forEach(a => a.reset());
  const sp = mapNow().spawns[1 - G.you];
  Object.assign(G.R, { x: sp[0], y: sp[1], tx: sp[0], ty: sp[1], vx: 0, vy: 0, b: 0, ab: 0, ch: 0, seen: false });
  const lp = G.m.lastPick;
  const sub = lp ? `${lp.slot === G.you ? 'You' : esc(nameOf(lp.slot))} took ${esc(CARD[lp.card].name)}` : `First to ${G.m.rounds} · ${esc(mapNow().name)}`;
  banner(`Round ${G.m.round}`, sub, 1700);
}

let bannerT = 0;
function banner(big, sub, ms) {
  const b = $('banner');
  b.innerHTML = `<div class="big">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  b.hidden = false;
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, ms);
}

// Card abbreviations for both players, top right.
const tagHtml = id => `<span class="tag" style="--tc:${TYPES[CARD[id].type].color}" title="${esc(CARD[id].name)}">${esc(CARD[id].ab)}</span>`;
function renderTags() {
  const box = $('tags'), m = G.m;
  const show = m && !['invite', 'lobby', 'closed'].includes(G.phase) && m.players.some(p => p.cards.length);
  box.hidden = !show;
  if (!show) return;
  box.innerHTML = m.players.map((p, i) => p.cards.length ? `<div class="tagrow"><span class="who" style="--pc:${G.hues[i]}">${esc(p.username)}</span>${p.cards.map(tagHtml).join('')}</div>` : '').join('');
}

const ICONS = {
  gun: '<path d="M3 9h13l2-2h3v5h-4l-2 2H9l-1 5H5l1-5H3z"/>',
  bullet: '<path d="M5 12c0-3 2-5 5-5h6l4 5-4 5h-6c-3 0-5-2-5-5z"/><path d="M9 7v10"/>',
  block: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  skill: '<path d="M13 2 5 13h6l-1 9 8-12h-6z"/>',
  body: '<path d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 5.5-8 11-8 11z"/>',
};
const cardHtml = (id, i, tag = 'div', cls = '') => {
  const c = CARD[id], t = TYPES[c.type];
  const tilt = (((i * 37) % 7) - 3) * 0.6;
  return `<${tag} class="card ${cls}" style="--tc:${t.color};--tilt:${tilt}deg" data-card="${id}">
    <div class="c-top"><span>${t.label}</span><span class="c-ab">${esc(c.ab)}</span></div>
    <div class="c-art"><svg viewBox="0 0 24 24">${ICONS[c.type]}</svg></div>
    <div class="c-name${c.name.length > 14 ? ' long' : ''}">${esc(c.name)}</div>
    ${c.text ? `<p class="c-text">${esc(c.text)}</p>` : ''}
    <ul class="c-stats">${c.lines.map(([l, good]) => { const [v, ...rest] = l.split(' '); return `<li class="${good ? 'g' : 'b'}"><b>${esc(v)}</b> ${esc(rest.join(' '))}</li>`; }).join('')}</ul>
    ${tag === 'button' ? `<span class="c-key">${i + 1}</span>` : ''}
  </${tag}>`;
};
const av = p => `<span class="av" style="--h:${p.color}">${esc((p.username || '?')[0].toUpperCase())}</span>`;

function renderOverlays() {
  const m = G.m, ph = G.phase, me = G.you;
  $('home').hidden = true;
  $('room').hidden = !['invite', 'lobby', 'closed'].includes(ph);
  $('pick').hidden = ph !== 'pick';
  $('over').hidden = ph !== 'over';
  $('menu-btn').hidden = ph === 'closed';
  $('chat').hidden = ph === 'closed';
  $('chat').classList.toggle('pinned', ['invite', 'lobby', 'over'].includes(ph));
  const opp = m.players[1 - me], you = m.players[me];

  if (ph === 'invite') {
    $('room-box').innerHTML = `
      <h2>Waiting on ${esc(opp.username)}</h2>
      <p>Challenge sent, first to ${m.rounds}. It runs out in <span class="timer" data-timer></span>.</p>
      <div class="row end"><button class="btn" data-act="leave">Cancel</button></div>`;
  } else if (ph === 'lobby') {
    const host = me === 0;
    $('room-box').innerHTML = `
      <h2>${G.practice ? 'Practice' : 'Duel'}</h2>
      <div class="vs">
        ${[0, 1].map(i => { const p = m.players[i]; return `<div class="pcard${p.ready ? ' ready' : ''}">${av(p)}<b>${esc(p.username)}</b><small>${i === me ? 'you · ' : ''}${!p.connected ? 'not here' : p.ready ? 'ready' : 'not ready'}</small></div>`; }).join('<div class="vs-x">vs</div>')}
      </div>
      <h3>First to${host ? '' : ` <span class="note">${esc(m.players[0].username)} picks</span>`}</h3>
      <div class="seg">${ROUND_OPTIONS.map(n => `<button data-rounds="${n}" aria-pressed="${n === m.rounds}" ${host ? '' : 'disabled'}>${n}</button>`).join('')}</div>
      <div class="row">
        <button class="btn" data-act="leave">Leave</button><span class="grow"></span>
        <button class="btn ${you.ready ? 'on' : 'go'}" data-act="ready">${you.ready ? 'Ready ✓' : 'Ready'}</button>
      </div>`;
  } else if (ph === 'closed') {
    const r = m.reason;
    const text = r === 'declined' ? `${esc(opp.username)} declined.` : r === 'expired' ? 'Nobody answered in time.'
      : r === 'cancelled' ? 'The challenge was cancelled.' : r === 'ended' ? 'This duel has ended.' : esc(r || 'This duel has ended.');
    closedScreen(text);
  }

  if (ph === 'pick') {
    const mine = m.pick.slot === me;
    $('pick-box').innerHTML = `
      <div class="pick-head"><h2>${mine ? 'Pick a card' : `${esc(nameOf(m.pick.slot))} is picking…`}</h2><span class="timer" data-timer></span></div>
      <div class="cards">${m.pick.options.map((id, i) => cardHtml(id, i, mine ? 'button' : 'div')).join('')}</div>`;
  }

  if (ph === 'over') {
    const w = m.winner;
    $('over-box').innerHTML = `
      <h2>${w === me ? 'You win' : `${esc(nameOf(w))} wins`}</h2>
      ${m.reason ? `<p>${esc(m.reason)}</p>` : ''}
      <div class="score">${m.players[0].score}<span>–</span>${m.players[1].score}</div>
      <div class="results">${m.players.map((p, i) => `<div class="pcard left">${av(p)}<b>${esc(p.username)}</b>
        <small>${i === me ? 'you · ' : ''}${p.cards.length} card${p.cards.length === 1 ? '' : 's'}${p.rematch && !p.bot ? ' · wants a rematch' : ''}</small>
        <div class="tagline">${p.cards.map(tagHtml).join('')}</div></div>`).join('')}</div>
      <div class="row">
        <button class="btn" data-act="leave">Leave</button><span class="grow"></span>
        ${opp.connected || opp.bot ? `<button class="btn ${you.rematch ? 'on' : 'go'}" data-act="rematch">${you.rematch ? `Waiting on ${esc(opp.username)}` : 'Rematch'}</button>` : `<span class="note">${esc(opp.username)} left</span>`}
      </div>`;
  }
  tickTimers();
}

function closedScreen(text) {
  G.phase = 'closed';
  ['pick', 'over', 'home'].forEach(id => { $(id).hidden = true; });
  $('chat').hidden = true; $('menu-btn').hidden = true; $('tags').hidden = true;
  $('room').hidden = false;
  $('room-box').innerHTML = `<h2>Duel over</h2><p>${text}</p><div class="row end"><button class="btn go" data-act="home">Back</button></div>`;
  status('');
}

function tickTimers() {
  const left = Math.max(0, Math.ceil((G.timerEnd - performance.now()) / 1000));
  document.querySelectorAll('[data-timer]').forEach(el => { el.textContent = G.phase === 'invite' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left + 's'; });
}
setInterval(tickTimers, 250);

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'leave') { G.net?.send({ t: 'leave' }); if (G.practice || G.phase !== 'invite') goHome(); }
    if (act === 'ready') G.net.send({ t: 'ready', v: !G.m.players[G.you].ready });
    if (act === 'rematch') G.net.send({ t: 'rematch', v: !G.m.players[G.you].rematch });
    if (act === 'home') goHome();
    snd.tick();
    return;
  }
  const r = e.target.closest('[data-rounds]');
  if (r && G.m) { G.net.send({ t: 'rounds', n: Number(r.dataset.rounds) }); snd.tick(); return; }
  const c = e.target.closest('button.card');
  if (c) choose(c.dataset.card);
});
function choose(id) {
  if (G.phase !== 'pick' || G.m.pick.slot !== G.you || G.chose) return;
  G.chose = true; setTimeout(() => { G.chose = false; }, 800);
  document.querySelectorAll('#pick-box .card').forEach(el => el.classList.add(el.dataset.card === id ? 'chosen' : 'dim'));
  snd.card();
  setTimeout(() => G.net.send({ t: 'pick', card: id }), 350);
}
$('menu-btn').onclick = () => {
  if (G.practice || ['over', 'lobby', 'invite'].includes(G.phase) || confirm('Leave the duel? You forfeit the match.')) {
    G.net?.send({ t: 'leave' });
    goHome();
  }
};
function goHome() { G.net?.close(); location.href = location.pathname; }

/* ═══════════ Chat ═══════════ */
function addChat(m) {
  const el = document.createElement('div');
  el.className = 'msg' + (m.sys ? ' sys' : '');
  el.innerHTML = m.sys ? esc(m.text) : `<b style="color:${G.hues[m.from]}">${esc(m.name)}</b> ${esc(m.text)}`;
  const log = $('chat-log');
  log.appendChild(el);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => el.classList.add('old'), 9000);
  if (!m.sys && m.from !== G.you) snd.chat();
}
function openChat(on) {
  G.chatOpen = on;
  $('chat').classList.toggle('open', on);
  if (on) { G.keys = {}; G.mouse.down = false; $('chat-inp').focus(); }
  else $('chat-inp').blur();
}
$('chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('chat-inp').value.trim();
  if (v) G.net?.send({ t: 'chat', text: v });
  $('chat-inp').value = '';
  if (!$('chat').classList.contains('pinned')) openChat(false);
});
$('chat-inp').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') { $('chat-inp').value = ''; openChat(false); }
});
$('chat-inp').addEventListener('blur', () => { if (G.chatOpen && !$('chat').classList.contains('pinned')) setTimeout(() => openChat(false), 100); });

/* ═══════════ Input ═══════════ */
const K = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp', 'Space'], block: ['ShiftLeft', 'ShiftRight', 'KeyF'], reload: ['KeyR'] };
const held = name => K[name].some(k => G.keys[k]);
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Enter' || (e.code === 'KeyT' && G.phase === 'fight')) {
    if (G.m && !$('chat').hidden) { e.preventDefault(); openChat(true); }
    return;
  }
  if (G.phase === 'pick' && /^Digit[1-6]$/.test(e.code)) { const id = G.m.pick.options[+e.code.slice(5) - 1]; if (id) choose(id); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat && K.jump.includes(e.code)) G.jumpQueued = true;
  if (!e.repeat && K.block.includes(e.code)) G.me?.block();
  if (!e.repeat && K.reload.includes(e.code)) G.me?.startReload();
  G.keys[e.code] = true;
});
addEventListener('keyup', e => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; G.mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('pointermove', e => { const p = toWorld(e.clientX, e.clientY); G.mouse.x = p.x; G.mouse.y = p.y; });
cv.addEventListener('pointerdown', e => {
  const p = toWorld(e.clientX, e.clientY); G.mouse.x = p.x; G.mouse.y = p.y;
  if (G.chatOpen && !$('chat').classList.contains('pinned')) openChat(false);
  if (e.button === 2) G.me?.block(); else if (e.button === 0) G.mouse.down = true;
});
addEventListener('pointerup', e => { if (e.button === 0) G.mouse.down = false; });

/* ═══════════ Actors: players simulated in this browser ═══════════ */
class Actor {
  constructor(slot, bot = false) { this.slot = slot; this.bot = bot; this.seq = 0; this.blockN = 0; this.abN = 0; this.radN = 0; this.reset(); }
  get s() { return G.stats[this.slot]; }
  send(m) { if (this.bot) G.net.match.handle(this.slot, m); else G.net.send(m); }
  reset() {
    const sp = mapNow().spawns[this.slot];
    this.body = newBody(sp[0], sp[1]);
    Object.assign(this, { ammo: this.s.ammo, reloadT: 0, fireCd: 0, blockCd: 0, blockT: 0, idleT: 0, slowT: 0, slowAmt: 0, stunT: 0, silT: 0, bloodT: 0,
      abCharge: 0, abT: 0, radT: 0, empowered: false, oobCd: 0, hazCd: 0, acc: {}, cnt: {}, aim: this.slot ? Math.PI : 0,
      cursor: { x: W / 2, y: H / 2 }, input: {}, wantShoot: false });
  }
  // Run fn every `every` seconds while `on` holds (the first one fires right away).
  every(key, every, dt, on, fn) {
    if (!on) { delete this.acc[key]; return; }
    if (this.acc[key] === undefined) this.acc[key] = every;
    this.acc[key] += dt;
    if (this.acc[key] >= every) { this.acc[key] -= every; this.cnt[key] = (this.cnt[key] || 0) + 1; fn(this.cnt[key]); }
  }
  report(kind, key, extra = {}) {
    const p = this.body;
    this.send({ t: 'hit', kind, key: `${this.slot}:${G.round}:${key}`, x: r1(p.x), y: r1(p.y), ...extra });
  }
  slow(amt, t) { if (this.slowT <= 0 || amt > this.slowAmt) this.slowAmt = amt; this.slowT = Math.max(this.slowT, t); }
  startReload() {
    if (this.reloadT > 0 || this.ammo >= this.s.ammo) return;
    this.reloadT = this.s.reload; this.ammo = 0; this.radT = 0;
  }
  fire(angle = this.aim, radar = false) {
    const base = this.s, s = radar ? { ...base, bullets: 1, burst: 1 } : base, p = this.body;
    const e = !radar && this.empowered;
    const shots = makeShot(s, p.x, p.y, angle, Math.random, e ? 1.5 : 1);
    for (const sh of shots) {
      sh.id = `${this.slot}.${G.round}.${++this.seq}`; sh.e = e ? 1 : 0;
      G.bullets.push(bulletFrom(sh, base, this.slot));
    }
    animFire(this.slot, angle);
    this.send({ t: 'shoot', shots: shots.map(b => ({ id: b.id, x: r1(b.x), y: r1(b.y), vx: r1(b.vx), vy: r1(b.vy), delay: b.delay, e: b.e })) });
    snd.shoot();
    if (radar) return;
    this.empowered = false;
    this.ammo--; this.fireCd = s.fireDelay; this.idleT = 0;
    if (this.ammo <= 0) { this.ammo = 0; this.reloadT = s.reload; this.radT = 0; if (s.c.shieldsup) this.block({ free: true }); }
    p.vx -= Math.cos(angle) * 90; if (!p.ground) p.vy -= Math.sin(angle) * 60;
    for (let i = 0; i < 4; i++) spark(p.x + Math.cos(angle) * 28, p.y + Math.sin(angle) * 28, angle + (Math.random() - 0.5) * 0.9, 220, G.hues[this.slot], 0.16);
    if (!this.bot) G.shake = Math.max(G.shake, 2);
  }
  block(opts = {}) {
    if (G.phase !== 'fight' || G.dead[this.slot]) return;
    if (!opts.free && (this.blockCd > 0 || this.silT > 0 || this.stunT > 0)) return;
    this.blockT = Math.max(this.blockT, 0.3);
    if (!opts.free) this.blockCd = this.s.blockCd;
    const key = `${this.slot}k${G.round}.${++this.blockN}`, p = this.body;
    this.send({ t: 'block', key, x: r1(p.x), y: r1(p.y), a: r1(this.aim) });
    blockFx(this.slot, p.x, p.y, key, { owner: this, aim: this.aim, gen: opts.gen });
    snd.block();
  }
  update(dt) {
    const s = this.s, c = s.c, p = this.body, alive = !G.dead[this.slot], fight = G.phase === 'fight';
    for (const k of ['fireCd', 'blockCd', 'blockT', 'slowT', 'stunT', 'silT', 'bloodT', 'oobCd', 'hazCd', 'abT']) this[k] -= dt;
    this.idleT += dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (c.radiance && fight && alive) { // waves speed up as the reload finishes
        this.radT -= dt;
        if (this.radT <= 0) {
          this.radT = 0.15 + 0.45 * clamp(this.reloadT / s.reload, 0, 1);
          const key = `${this.slot}r${G.round}.${++this.radN}`;
          this.send({ t: 'fx', k: 'rad', key, x: r1(p.x), y: r1(p.y) });
          radFx(this.slot, p.x, p.y, key);
        }
      }
      if (this.reloadT <= 0) { this.reloadT = 0; this.ammo = s.ammo; if (!this.bot) snd.reload(); }
    } else if (!c.shieldsup && this.ammo < s.ammo && this.idleT > 1.1 && fight) this.startReload();
    if (!alive) return;

    // Movement, with slows and speed cards
    const canMove = (fight || G.phase === 'roundEnd') && this.stunT <= 0;
    const input = canMove ? this.input : {};
    const foe = view(1 - this.slot);
    let mult = this.slowT > 0 ? 1 - this.slowAmt : 1;
    if (c.tasteofblood && this.bloodT > 0) mult *= 1.5 ** c.tasteofblood;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (c.chase && dir && Math.sign(foe.x - p.x) === dir) mult *= Math.min(3, 1.6 ** c.chase);
    const ms = { ...s, move: s.move * mult };
    const steps = Math.ceil(dt / (1 / 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const j = stepPlayer(p, i === 0 ? input : { ...input, jump: false }, ms, G.solids, h);
      if (j && !this.bot) snd.jump();
    }
    this.input.jump = false;

    // Out of bounds: bounce back in and take a hit.
    if (bounceBack(p)) {
      burst(p.x, p.y, G.hues[this.slot], 10, 300);
      puff(p.x, p.y, 5, 10, 120);
      snd.thud();
      if (fight && this.oobCd <= 0) { this.oobCd = 0.35; this.report('oob', 'o' + (++this.seq)); }
    }
    // Saw hazards on the map
    for (const sw of mapNow().saws || []) {
      const q = sawAt(sw, G.rt), d = dist(p, q.x, q.y);
      if (d < q.r + PR - 4) {
        const nx = (p.x - q.x) / (d || 1), ny = (p.y - q.y) / (d || 1);
        p.vx = nx * 900; p.vy = ny * 900 - 300;
        if (fight && this.hazCd <= 0) { this.hazCd = 0.4; this.report('hazard', 'z' + (++this.seq)); burst(p.x, p.y, '#ddd', 10, 300); }
      }
    }

    if (fight && this.wantShoot && this.fireCd <= 0 && this.ammo > 0 && this.reloadT <= 0 && this.silT <= 0 && this.stunT <= 0) this.fire();

    // Abyssal Countdown: stand still to charge
    if (c.abyssal && this.abT <= 0) {
      const still = fight && p.ground && Math.abs(p.vx) < 25;
      this.abCharge = still ? this.abCharge + dt : Math.max(0, this.abCharge - dt * 1.5);
      if (this.abCharge >= 6) { this.abT = 5; this.abN++; this.abCharge = 0; if (!this.bot) snd.boom(); }
    }
    if (!fight) return;

    // What the other player's cards do to me
    const fc = G.stats[1 - this.slot].c, fd = G.dead[1 - this.slot] ? Infinity : dist(p, foe.x, foe.y);
    if (fc.chilling && fd < 240) this.slow(Math.min(0.6, 0.25 * fc.chilling), 0.2);
    this.every('drain', 0.5, dt, fc.lifestealer && fd < 200, n => this.report('drain', 'd' + n));
    this.every('abyss', 0.5, dt, foe.ab > 0 && fd < 210, n => this.report('abyss', `a${foe.ab}.${n}`));
    for (const f of G.fields) {
      const inside = dist(p, f.x, f.y) < f.r + PR;
      if (f.owner === this.slot) {
        this.every('h' + f.key, 0.5, dt, f.k === 'heal' && inside, n => this.send({ t: 'heal', key: `${f.key}:${n}` }));
        continue;
      }
      if (inside && (f.k === 'static' || f.k === 'cloud')) this.slow(0.4, 0.3);
      if (inside && f.k === 'nova') { const d = dist(p, f.x, f.y) || 1; p.vx += (f.x - p.x) / d * 2600 * dt; p.vy += (f.y - p.y) / d * 2600 * dt; }
      if (f.k === 'static' || f.k === 'cloud') this.every('f' + f.key, 0.5, dt, inside, n => this.report(f.k, `${f.key}.${n}`));
    }
    for (const sw of G.saws) {
      if (sw.owner === this.slot) continue;
      const o = sw.fixed ? sw : view(sw.owner);
      this.every('s' + sw.key, 0.25, dt, dist(p, o.x, o.y) < 85, n => this.report('saw', `${sw.key}.${n}`));
    }
  }
}

function teleport(a, angle, d) {
  const p = a.body, sx = p.x, sy = p.y;
  burst(sx, sy, G.hues[a.slot], 12, 250);
  for (let t = d; t >= 0; t -= 20) {
    const x = clamp(sx + Math.cos(angle) * t, 10, W - 10), y = Math.max(-600, sy + Math.sin(angle) * t);
    if (!G.solids.some(r => x + PR > r[0] && x - PR < r[0] + r[2] && y + PR > r[1] && y - PR < r[1] + r[3])) { p.x = x; p.y = y; break; }
  }
  p.vy = Math.min(p.vy, 0);
  burst(p.x, p.y, G.hues[a.slot], 12, 250);
}

/* ═══════════ Card effects ═══════════ */
// A block went off at (x, y). owner is set when that player is simulated here; area = set off by an Empower shot.
function blockFx(slot, x, y, key, { owner = null, aim = 0, area = false, gen } = {}) {
  const c = G.stats[slot].c, s = G.stats[slot], color = G.hues[slot];
  G.rings.push({ x, y, r: 12, max: 60, life: 0.3, max0: 0.3, color });
  if (owner && !area) {
    if (c.tactical) { owner.ammo = s.ammo; owner.reloadT = 0; }
    if (c.teleport) teleport(owner, aim, 240 * c.teleport);
    if (c.charge) {
      owner.body.vx = Math.cos(aim) * 1300; owner.body.vy = Math.sin(aim) * 1300 - 200;
      if (gen !== 'charge') later(0.35, () => owner.block({ free: true, gen: 'charge' }));
    }
    if (c.echo && gen !== 'echo') later(0.3, () => owner.block({ free: true, gen: 'echo' }));
    if (c.empower) owner.empowered = true;
    if (c.radar && !G.dead[1 - slot]) {
      const f = view(1 - slot);
      if (dist(f, x, y) < 380 * Math.sqrt(c.radar)) for (let i = 0; i < c.radar; i++) owner.fire(Math.atan2(f.y - y, f.x - x), true);
    }
  }
  if (c.healfield) G.fields.push({ k: 'heal', owner: slot, x, y, r: 130, t: 3, t0: 3, key: key + 'h' });
  if (c.static) G.fields.push({ k: 'static', owner: slot, x, y, r: 150, t: 3, t0: 3, key: key + 's' });
  if (c.supernova) G.fields.push({ k: 'nova', owner: slot, x, y, r: 270, t: 2, t0: 2, key: key + 'n' });
  if (c.saw) G.saws.push(area ? { owner: slot, key: key + 'w', t: 2, fixed: true, x, y } : { owner: slot, key: key + 'w', t: 2 });
  const shard = (id, kind, vx, vy, extra) => G.bullets.push({ id, owner: slot, kind, x, y, vx, vy, delay: 0, r: 5, pad: 0, bounces: 0, keep: 0.9, dist: 0, bounced: 0, boom: 0, knock: 0, drill: 0, ...extra });
  if (c.bombs) for (let i = 0; i < 6 * c.bombs; i++) shard(`${key}.b${i}`, 'bomb', ((i % 6) - 2.5) * 120, -180 - (i % 2) * 140, { r: 6, grav: 1700, life: 3 });
  if (c.emp) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; shard(`${key}.e${i}`, 'emp', Math.cos(a) * 650, Math.sin(a) * 650, { grav: 0, life: 0.6 }); }
  for (const a of G.actors) {
    if (a.slot === slot || G.dead[a.slot] || G.phase !== 'fight') continue;
    const p = a.body, d = dist(p, x, y) || 1, nx = (p.x - x) / d, ny = (p.y - y) / d;
    if (c.frost && d < 230) a.slow(0.6, 2);
    if (c.implode && d < 330) { p.vx = -nx * 1100; p.vy = -ny * 1100 - 150; }
    if (c.shockwave && d < 300) { p.vx = nx * 1200; p.vy = ny * 1200 - 350; }
    if (c.silence && d < 260) a.silT = 1.6;
    if (c.overpower && d < 200) a.report('over', key + 'o');
  }
  if (c.frost) G.rings.push({ x, y, r: 20, max: 230, life: 0.4, max0: 0.4, color: '#bfe6ff' });
  if (c.shockwave || c.implode) G.rings.push({ x, y, r: 20, max: 300, life: 0.35, max0: 0.35, color: '#ffffff' });
  if (c.overpower) G.rings.push({ x, y, r: 20, max: 200, life: 0.3, max0: 0.3, color: '#ff6b5a', fill: true });
  if (c.silence) G.rings.push({ x, y, r: 20, max: 260, life: 0.35, max0: 0.35, color: '#999999' });
}

// Radiance wave from a reloading player.
function radFx(slot, x, y, key) {
  G.rings.push({ x, y, r: 10, max: 320, life: 0.4, max0: 0.4, color: '#ffd166' });
  for (const a of G.actors) {
    if (a.slot === slot || G.dead[a.slot]) continue;
    const d = dist(a.body, x, y);
    if (d < 320) later(d / 800, () => { if (!G.dead[a.slot]) a.report('rad', key); });
  }
}

function explosion(x, y, r, b, kind) {
  G.rings.push({ x, y, r: 6, max: r, life: 0.35, max0: 0.35, color: G.hues[b.owner], fill: true });
  burst(x, y, G.hues[b.owner], kind === 'splash' ? 5 : 16, 380);
  flash(x, y, r * 0.7, '#fff3c8', 0.14);
  if (kind !== 'splash') { puff(x, y, 7, r * 0.25, r * 1.2, '70,62,55', 0.55); debris(x, y, '#2d2723', 5, 450, 5); }
  (mapNow().breaks || []).forEach((q, i) => { if (!G.broken.has(i) && Math.hypot(clamp(x, q[0], q[0] + q[2]) - x, clamp(y, q[1], q[1] + q[3]) - y) < r) G.crateHits[i] = (G.crateHits[i] || 0) + 1; });
  G.shake = Math.max(G.shake, kind === 'splash' ? 2 : 6);
  if (kind !== 'splash') snd.boom();
  for (const a of G.actors) {
    if (a.slot === b.owner || G.dead[a.slot] || G.phase !== 'fight' || a.blockT > 0 || a.abT > 0) continue;
    const d = dist(a.body, x, y);
    if (d > r + PR) continue;
    a.report(kind, `${b.id}:${kind}`, { bid: b.id });
    const k = 500 * (1 - d / (r + PR)) + 150;
    a.body.vx += (a.body.x - x) / (d || 1) * k; a.body.vy += (a.body.y - y) / (d || 1) * k - 150;
  }
  // Explosions chip breakable blocks too
  const owner = actorOf(b.owner);
  if (owner && kind !== 'splash' && G.phase === 'fight') (mapNow().breaks || []).forEach((q, i) => {
    if (G.broken.has(i)) return;
    const cx = clamp(x, q[0], q[0] + q[2]), cy = clamp(y, q[1], q[1] + q[3]);
    if (Math.hypot(cx - x, cy - y) < r) owner.send({ t: 'bhit', i, key: `${b.id}:x${i}`, boom: 1 });
  });
}

// A bullet stopped (hit a wall, a player, or ran out). hitSlot = who it hit, if anyone.
function bulletEnd(b, x, y, hitSlot = null) {
  if (b.kind === 'bomb') return explosion(x, y, 60, b, 'bomb');
  if (b.kind === 'emp') return;
  if (b.boom) explosion(x, y, b.boom, b, 'boom');
  if (b.splash) explosion(x, y, 45, b, 'splash');
  if (b.timed) G.bombs.push({ x, y, t: 0.5, owner: b.owner, id: b.id + 't', stick: hitSlot });
  if (b.toxic) G.fields.push({ k: 'cloud', owner: b.owner, x, y, r: 90 + 15 * (b.toxic - 1), t: 5.5, t0: 5.5, key: b.id + 'c' });
  if (b.e && G.stats[b.owner].c.empower) blockFx(b.owner, x, y, b.id + 'E', { area: true });
}

function bulletEnv(b) {
  return { target: b.tb ? view(1 - b.owner) : null, cursor: b.remote ? view(b.owner).cursor : null };
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    if (b.done) continue;
    const bounced = b.bounced || 0;
    const end = stepBullet(b, G.solids, dt, bulletEnv(b));
    if (b.imp?.length) {
      b.imp.forEach(tag => { const i = +tag.slice(1); G.crateHits[i] = (G.crateHits[i] || 0) + 1; splinters(b.x, b.y, 4); });
      const owner = actorOf(b.owner);
      if (owner && G.phase === 'fight') b.imp.forEach(tag => owner.send({ t: 'bhit', i: +tag.slice(1), key: `${b.id}:${b.bhN = (b.bhN || 0) + 1}` }));
      b.imp.length = 0;
    }
    if ((b.bounced || 0) > bounced) { snd.bounce(); for (let i = 0; i < 3; i++) spark(b.x, b.y, Math.random() * 7, 180, G.hues[b.owner], 0.2); }
    if (end) {
      b.done = true;
      if (!end.out) { for (let i = 0; i < 5; i++) spark(end.x, end.y, Math.random() * 7, 200, G.hues[b.owner], 0.25); flash(end.x, end.y, 9); puff(end.x, end.y, 2, 5, 40); }
      bulletEnd(b, end.x, end.y);
      continue;
    }
    if (b.delay > 0 || G.phase !== 'fight') continue;
    // Bullets vs players simulated here: this browser decides.
    for (const a of G.actors) {
      if (a.slot === b.owner || G.dead[a.slot] || !bulletHitsBox(b, a.body)) continue;
      b.done = true;
      if (a.blockT > 0 || a.abT > 0) {
        a.send({ t: 'hit', kind: 'block', key: `${b.id}:blk`, bid: b.id, x: r1(b.x), y: r1(b.y) });
        G.rings.push({ x: a.body.x, y: a.body.y, r: 20, max: 50, life: 0.25, max0: 0.25, color: G.hues[a.slot] });
        break;
      }
      if (b.kind === 'bomb') { explosion(b.x, b.y, 60, b, 'bomb'); break; }
      a.report(b.kind, `${b.id}:h`, { bid: b.id, e: b.e, bn: b.bounced, d: Math.round(b.dist) });
      const sp = Math.hypot(b.vx, b.vy) || 1, k = 160 + 700 * (b.knock || 0);
      a.body.vx += b.vx / sp * k; a.body.vy += b.vy / sp * k - 120 * (1 + (b.knock || 0));
      if (b.cold) a.slow(Math.min(0.85, 0.55 + 0.15 * b.cold), 1.5);
      if (b.kind === 'emp') a.slow(0.5, 1);
      if (b.dazzle) a.stunT = Math.max(a.stunT, Math.min(1.2, 0.35 * b.dazzle));
      bulletEnd(b, b.x, b.y, a.slot);
      break;
    }
    // My bullet reaching the other player (who's simulated on their side): looks like a hit here.
    if (!b.done && actorOf(b.owner) && !actorOf(1 - b.owner) && !G.dead[1 - b.owner] && bulletHitsBox(b, G.R)) {
      b.done = true;
      burst(b.x, b.y, G.hues[1 - b.owner], 6, 250);
      if (b.kind === 'bomb') explosion(b.x, b.y, 60, b, 'bomb'); else bulletEnd(b, b.x, b.y, 1 - b.owner);
    }
  }
  G.bullets = G.bullets.filter(b => !b.done);
}

function updateWorld(dt) {
  if (G.phase === 'fight' || G.phase === 'roundEnd') G.rt += dt;
  // Rope boxes swing; carry whoever stands on them.
  const map = mapNow();
  const boxes = (map.ropes || []).map(r => ropeBox(r, G.rt));
  for (const a of G.actors) {
    const on = a.body.on;
    if (on && on[0] === 'r' && G.ropePrev.length) {
      const i = +on.slice(1), was = G.ropePrev[i], now = boxes[i];
      if (was && now) { a.body.x += now[0] - was[0]; a.body.y += now[1] - was[1]; }
    }
  }
  G.ropePrev = boxes;
  G.solids = solidsAt(map, G.rt, G.broken);
  const due = G.timers.filter(t => (t.t -= dt) <= 0);
  G.timers = G.timers.filter(t => t.t > 0);
  due.forEach(t => { if (t.round === G.round) t.fn(); });
  for (const f of G.fields) {
    f.t -= dt;
    if (f.k === 'nova' && f.t <= 0) {
      G.rings.push({ x: f.x, y: f.y, r: 20, max: f.r, life: 0.4, max0: 0.4, color: '#c9a3ff', fill: true });
      for (const a of G.actors) if (a.slot !== f.owner && dist(a.body, f.x, f.y) < f.r + PR) a.stunT = Math.max(a.stunT, 1);
    }
  }
  G.fields = G.fields.filter(f => f.t > 0);
  for (const sw of G.saws) sw.t -= dt;
  G.saws = G.saws.filter(s => s.t > 0);
  const boom = [];
  for (const bm of G.bombs) {
    if (bm.stick !== null) { const v = view(bm.stick); bm.x = v.x; bm.y = v.y; }
    bm.t -= dt;
    if (bm.t <= 0) boom.push(bm);
  }
  G.bombs = G.bombs.filter(b => b.t > 0);
  boom.forEach(bm => explosion(bm.x, bm.y, 90, { id: bm.id, owner: bm.owner }, 'boom'));
}

function localInput() {
  const me = G.me; if (!me) return;
  me.input = G.chatOpen ? {} : { left: held('left'), right: held('right'), jump: G.jumpQueued, jumpHeld: held('jump') };
  G.jumpQueued = false;
  me.aim = Math.atan2(G.mouse.y - me.body.y, G.mouse.x - me.body.x);
  me.cursor = { x: G.mouse.x, y: G.mouse.y };
  me.wantShoot = G.mouse.down && !G.chatOpen;
}

function sendState(dt) {
  G.sendT -= dt;
  if (G.sendT > 0 || !G.me || G.practice || !live()) return;
  G.sendT = 1 / 30;
  const a = G.me, p = a.body;
  G.net.send({ t: 's', x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), a: Math.round(a.aim * 100) / 100, b: a.blockT > 0 ? 1 : 0, g: p.ground ? 1 : 0,
    mx: Math.round(a.cursor.x), my: Math.round(a.cursor.y), ab: a.abT > 0 ? a.abN : 0, ch: Math.round(a.abCharge * 10) / 10, rl: a.reloadT > 0 ? 1 : 0 });
}

function updateRemote(dt) {
  if (actorOf(1 - G.you)) return;
  const R = G.R;
  const age = Math.min(0.15, (performance.now() - R.at) / 1000);
  const px = R.tx + R.vx * age, py = R.ty + (R.g ? 0 : R.vy * age);
  const k = 1 - Math.exp(-dt * 22);
  if (Math.hypot(px - R.x, py - R.y) > 200) { R.x = px; R.y = py; } else { R.x += (px - R.x) * k; R.y += (py - R.y) * k; }
}

/* ═══════════ Practice bot ═══════════ */
class Bot extends Actor {
  constructor() { super(1, true); this.dir = -1; this.dirT = 0; this.think = 0; this.aimErr = 0; this.rest = 0; this.seen = null; }
  onState(m) {
    if (m.phase === 'pick' && m.pick.slot === 1) setTimeout(() => this.send({ t: 'pick', card: m.pick.options[Math.floor(Math.random() * m.pick.options.length)] }), 1600);
  }
  groundAt(x) { const p = this.body; return G.solids.some(r => x > r[0] - 4 && x < r[0] + r[2] + 4 && r[1] >= p.y + PR - 2 && r[1] < p.y + 260); }
  update(dt) {
    const p = this.body, s = this.s, me = G.me?.body;
    this.wantShoot = false;
    if (me && G.phase === 'fight' && !G.dead[1]) {
      this.dirT -= dt; this.think -= dt;
      const dx = me.x - p.x, dy = me.y - p.y, d = Math.hypot(dx, dy);
      if (this.dirT <= 0) { this.dirT = 0.5 + Math.random() * 0.9; this.dir = d > 520 ? Math.sign(dx) : d < 240 ? -Math.sign(dx) : (Math.random() < 0.5 ? -1 : 1); }
      let jump = false;
      if (p.ground && !this.groundAt(p.x + this.dir * 46)) { if (this.groundAt(p.x - this.dir * 46)) this.dir = -this.dir; else jump = true; }
      if (p.x < 120) this.dir = 1;
      if (p.x > W - 120) this.dir = -1;
      if (p.wall === this.dir && Math.random() < 0.08) jump = true;
      if (dy < -140 && p.ground && Math.random() < 0.03) jump = true;
      if (!p.ground && p.vy > 200 && p.y > 500 && !this.groundAt(p.x)) { jump = true; this.dir = p.x < W / 2 ? 1 : -1; }
      for (const sw of mapNow().saws || []) { const q = sawAt(sw, G.rt); if (p.ground && Math.abs(q.x - (p.x + this.dir * 60)) < q.r + 30 && Math.abs(q.y - p.y) < q.r + 40) jump = true; }
      if (Math.random() < 0.004) jump = true;
      this.input = { left: this.dir < 0, right: this.dir > 0, jump, jumpHeld: true };
      // Easier bot: it reacts late, aims loosely, turns its gun slowly, takes breathers and rarely blocks.
      if (this.think <= 0) {
        this.think = 0.45 + Math.random() * 0.5;
        this.aimErr = (Math.random() - 0.5) * (0.28 + Math.min(0.24, d / 3000));
        this.seen = { x: me.x, y: me.y, vx: me.vx, vy: me.vy }; // where it thinks you are (stale until next think)
        this.rest = Math.random() < 0.22 ? 0.5 + Math.random() * 0.8 : 0;
      }
      const tg = this.seen || me, t = d / s.bulletSpeed;
      const want = Math.atan2(tg.y + tg.vy * t * 0.2 - p.y - (s.bulletGrav * t * t) / 2, tg.x + tg.vx * t * 0.2 - p.x) + this.aimErr;
      const da = Math.atan2(Math.sin(want - this.aim), Math.cos(want - this.aim));
      this.aim += clamp(da, -3.2 * dt, 3.2 * dt);
      this.cursor = { x: me.x, y: me.y };
      if (this.rest > 0) this.rest -= dt;
      this.wantShoot = this.rest <= 0 && d < 850 && Math.abs(da) < 0.35 && Math.random() < 0.06;
      if (this.blockCd <= 0 && G.bullets.some(b => b.owner === 0 && !b.delay && Math.hypot(b.x - p.x, b.y - p.y) < 80 && ((p.x - b.x) * b.vx + (p.y - b.y) * b.vy) > 0) && Math.random() < 0.06) this.block();
    } else this.input = {};
    super.update(dt);
  }
}

/* ═══════════ Effects ═══════════ */
const MAX_PARTS = 700;
function part(o) { if (G.parts.length < MAX_PARTS) G.parts.push(o); }
function spark(x, y, a, sp, color, life, override) {
  const v = sp * (0.4 + Math.random() * 0.8);
  part({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: override || color, size: 1.5 + Math.random() * 2, g: 700 });
}
function burst(x, y, color, n, sp) {
  for (let i = 0; i < n; i++) spark(x, y, Math.random() * Math.PI * 2, sp, color, 0.3 + Math.random() * 0.35);
  if (n >= 10) debris(x, y, color, Math.round(n / 4), sp);
}
function debris(x, y, color, n, sp = 380, size = 6) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = sp * (0.3 + Math.random() * 0.8);
    part({ t: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, size: 2 + Math.random() * size, life: 0.9 + Math.random() * 0.6, max: 1.5, color, g: 1500 });
  }
}
function puff(x, y, n = 4, size = 10, sp = 70, color = '236,236,240', alpha = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * Math.random();
    part({ t: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, r: size * (0.6 + Math.random() * 0.6), grow: size * 2.2, life: 0.45 + Math.random() * 0.4, max: 0.85, color, alpha });
  }
}
function flash(x, y, r, color = '#fff8e0', life = 0.1) { part({ t: 'flash', x, y, r, life, max: life, color }); }
function shell(x, y, angle) {
  const side = Math.cos(angle) >= 0 ? -1 : 1;
  part({ t: 'shell', x, y, vx: side * (120 + Math.random() * 120), vy: -260 - Math.random() * 160, rot: 0, vr: side * 20, life: 1.1, max: 1.1, color: '#d9b24c', g: 1700 });
}
function splinters(x, y, n = 5) { debris(x, y, '#b07c4f', n, 300, 4); }

// Per-player animation state (both players, simulated here or not)
const mkAnim = () => ({ walk: 0, lean: 0, sq: 0, blink: 0, nextBlink: 1 + Math.random() * 3, flash: 0, recoil: 0, muzzle: 0, muzzleA: 0, wasGround: true, lastVy: 0, hpLag: null, lagT: 0, hurtT: 0 });
G.anim = [mkAnim(), mkAnim()];
G.crateHits = [];
G.slowT = 0; G.freeze = 0; G.time = 0;
G.motes = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 12, vy: -4 - Math.random() * 10, s: 1 + Math.random() * 2.5, ph: Math.random() * 6 }));

function animFire(slot, angle) {
  const a = G.anim[slot]; if (!a) return;
  a.recoil = 1; a.muzzle = 0.06; a.muzzleA = angle;
  const v = view(slot);
  shell(v.x, v.y - 2, angle);
  flash(v.x + Math.cos(angle) * 36, v.y + Math.sin(angle) * 36, 16, '#fff3b0', 0.05);
}

function isGrounded(slot) { const a = actorOf(slot); return a ? a.body.ground : !!G.R.g; }
function updateAnim(dt) {
  for (const slot of [0, 1]) {
    const a = G.anim[slot], v = view(slot), grounded = isGrounded(slot);
    if (grounded && !a.wasGround && a.lastVy > 450 && !G.dead[slot]) {
      a.sq = Math.min(0.32, a.lastVy / 3200);
      puff(v.x, v.y + PR, 5, 8, 90, '243,234,215', 0.35);
    }
    if (!grounded && a.wasGround && v.vy < -300 && !G.dead[slot]) puff(v.x, v.y + PR, 3, 6, 50);
    a.wasGround = grounded; a.lastVy = v.vy;
    a.sq *= Math.exp(-dt * 12);
    a.walk += grounded ? Math.abs(v.vx) * dt * 0.045 : 0;
    a.lean += (clamp(v.vx / 1600, -0.22, 0.22) - a.lean) * Math.min(1, dt * 10);
    a.nextBlink -= dt;
    if (a.nextBlink <= 0) { a.blink = 0.12; a.nextBlink = 1.5 + Math.random() * 3.5; }
    a.blink = Math.max(0, a.blink - dt);
    a.flash = Math.max(0, a.flash - dt);
    a.hurtT = Math.max(0, a.hurtT - dt);
    a.recoil = Math.max(0, a.recoil - dt * 9);
    a.muzzle = Math.max(0, a.muzzle - dt);
    const hp = G.hp[slot] ?? 0;
    if (a.hpLag === null || hp > a.hpLag) a.hpLag = hp;
    if ((a.lagT -= dt) <= 0) a.hpLag += (hp - a.hpLag) * Math.min(1, dt * 6);
  }
}

function updateFx(dt) {
  G.time += dt;
  for (const p of G.parts) {
    p.life -= dt;
    if (p.t === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.r += p.grow * dt; continue; }
    if (p.t === 'flash') continue;
    p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.rot !== undefined) p.rot += p.vr * dt;
    if (p.t === 'chunk' || p.t === 'shell') {
      for (const r of G.solids) if (p.x > r[0] && p.x < r[0] + r[2] && p.y > r[1] && p.y < r[1] + r[3]) {
        p.y = r[1] - 1; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5;
        if (Math.abs(p.vy) < 40) { p.vy = 0; p.g = 0; p.vx *= 0.8; }
        break;
      }
    } else p.vx *= 0.985;
  }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const f of G.floats) { f.life -= dt; f.y -= 46 * dt; }
  G.floats = G.floats.filter(f => f.life > 0);
  for (const r of G.rings) r.life -= dt;
  G.rings = G.rings.filter(r => r.life > 0);
  G.shake = Math.max(0, G.shake - dt * 36);
  for (const m of G.motes) {
    m.x += (m.vx + Math.sin(G.time * 0.7 + m.ph) * 6) * dt; m.y += m.vy * dt;
    if (m.y < -TOP) { m.y = H; m.x = Math.random() * W; }
    if (m.x < 0) m.x += W; if (m.x > W) m.x -= W;
  }
  // bullet trails
  for (const b of G.bullets) { if (b.delay > 0) continue; (b.tr || (b.tr = [])).unshift(b.x, b.y); if (b.tr.length > 14) b.tr.length = 14; }
  // ambient bits from fields
  for (const f of G.fields) {
    if (f.k === 'heal' && Math.random() < dt * 14) part({ t: 'plus', x: f.x + (Math.random() - 0.5) * f.r * 1.4, y: f.y + (Math.random() - 0.2) * f.r * 0.8, vx: 0, vy: -50, life: 0.9, max: 0.9, color: '#7bd88f' });
    if (f.k === 'cloud' && Math.random() < dt * 8) puff(f.x + (Math.random() - 0.5) * f.r, f.y + (Math.random() - 0.5) * f.r * 0.6, 1, 16, 15, '155,197,61', 0.3);
  }
}

/* ═══════════ Rendering ═══════════ */
let vt = { s: 1, ox: 0, oy: 0, dpr: 1 };
const TOP = 70; // room above the arena for the score, and for things flying over the top
let bgCache = null;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  const s = Math.min(innerWidth / W, innerHeight / (H + TOP));
  vt = { s, ox: (innerWidth - W * s) / 2, oy: (innerHeight - (H + TOP) * s) / 2 + TOP * s, dpr };
  bgCache = null;
}
addEventListener('resize', resize); resize();
function toWorld(cx, cy) { return { x: (cx - vt.ox) / vt.s, y: (cy - vt.oy) / vt.s }; }
function rr(x, y, w, h, r, c = ctx) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(hex, k) {
  const f = c => clamp(Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k), 0, 255);
  const [r, g, b] = rgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
function seeded(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

// Scenery behind the arena, by map.
const THEMES = { Foundry: 'factory', Stilts: 'mountains', Crossfire: 'city', Canopy: 'forest', Steps: 'ruins', Sawmill: 'pines', Brickyard: 'city', Hangers: 'factory',
  Tower: 'castle', Islands: 'clouds', Pit: 'mountains', Chandelier: 'columns', Ladder: 'hills', Cage: 'city', Seesaw: 'clouds', Bunker: 'hills' };
function drawScenery(c, map, rnd, layer, color) {
  const theme = THEMES[map.name] || 'hills', base = layer ? H - 40 : H - 150, top = -TOP;
  c.fillStyle = color;
  c.beginPath();
  if (theme === 'hills' || theme === 'clouds' || theme === 'forest') {
    const amp = layer ? 70 : 110, f1 = 0.004 + rnd() * 0.004, f2 = 0.011 + rnd() * 0.01, p1 = rnd() * 9, p2 = rnd() * 9;
    c.moveTo(0, H + 10);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, base - amp * 0.6 - Math.sin(x * f1 + p1) * amp * 0.5 - Math.sin(x * f2 + p2) * amp * 0.25);
    c.lineTo(W, H + 10);
  } else if (theme === 'mountains') {
    c.moveTo(0, H + 10);
    let x = -40;
    while (x < W + 60) { const w = 80 + rnd() * 160, h = (layer ? 140 : 260) * (0.5 + rnd() * 0.6); c.lineTo(x + w / 2, base - h); c.lineTo(x + w, base - h * 0.15); x += w * 0.8; }
    c.lineTo(W + 40, H + 10);
  } else if (theme === 'city' || theme === 'factory') {
    let x = -10;
    const stacks = [];
    c.moveTo(-10, H + 10);
    while (x < W + 20) {
      const w = 40 + rnd() * (theme === 'city' ? 70 : 110), h = (layer ? 90 : 190) * (0.4 + rnd() * 0.8);
      c.lineTo(x, base - h); c.lineTo(x + w, base - h);
      if (theme === 'factory' && rnd() < 0.5) stacks.push([x + w * (0.2 + rnd() * 0.5), base - h, 50 + rnd() * 80]);
      if (theme === 'factory' && rnd() < 0.4) { c.lineTo(x + w, base - h - 20); c.lineTo(x + w, base - h); } // saw-tooth roofs
      x += w;
    }
    c.lineTo(W + 20, H + 10); c.lineTo(-10, H + 10);
    c.closePath(); c.fill();
    c.beginPath();
    for (const [sx, sy, sh] of stacks) { c.rect(sx, sy - sh, 14, sh + 2); c.rect(sx - 3, sy - sh, 20, 6); }
  } else if (theme === 'pines') {
    c.moveTo(0, H + 10); c.lineTo(0, base);
    for (let x = 0; x < W + 30; x += 22 + rnd() * 26) { const h = (layer ? 80 : 150) * (0.6 + rnd() * 0.6); c.lineTo(x + 10, base - h); c.lineTo(x + 22, base); }
    c.lineTo(W, H + 10);
  } else if (theme === 'castle' || theme === 'ruins' || theme === 'columns') {
    c.moveTo(-10, H + 10);
    let x = -10;
    while (x < W + 20) {
      const w = theme === 'columns' ? 34 : 60 + rnd() * 90, h = (layer ? 100 : 210) * (0.5 + rnd() * 0.6);
      if (theme === 'columns') { c.lineTo(x, base - h); c.lineTo(x + w, base - h); c.lineTo(x + w, base - 20); c.lineTo(x + w + 40, base - 20); x += w + 40; continue; }
      c.lineTo(x, base - h);
      if (theme === 'castle') for (let k = 0; k < w; k += 14) { c.lineTo(x + k, base - h - 10); c.lineTo(x + k + 7, base - h - 10); c.lineTo(x + k + 7, base - h); c.lineTo(x + k + 14, base - h); }
      else { c.lineTo(x + w * 0.3, base - h); c.lineTo(x + w * 0.5, base - h * 0.8); c.lineTo(x + w, base - h * 0.8); }
      c.lineTo(x + w, base - h * 0.4);
      x += w;
    }
    c.lineTo(W + 20, H + 10);
  }
  c.closePath(); c.fill();
  if (theme === 'forest' || theme === 'clouds') { // round tree tops / puffy clouds along the line
    for (let i = 0; i < 16; i++) {
      const x = rnd() * W, y = theme === 'clouds' ? top + 110 + rnd() * (layer ? 300 : 180) : base - 30 - rnd() * 90, r = (theme === 'clouds' ? 16 : 26) + rnd() * (theme === 'clouds' ? 18 : 34);
      if (theme === 'clouds') {
        if (i > 6) continue;
        // one flat-bottomed cloud: a few bumps on a bar
        c.globalAlpha = layer ? 0.28 : 0.18; c.fillStyle = '#fffaf0';
        const n = 3 + Math.floor(rnd() * 3), w2 = r * n * 0.9;
        c.beginPath(); c.roundRect(x - w2 / 2, y - r * 0.5, w2, r * 0.9, r * 0.45); c.fill();
        for (let k = 0; k < n; k++) { c.beginPath(); c.arc(x - w2 / 2 + r * 0.6 + k * (w2 - r * 1.2) / Math.max(1, n - 1), y - r * 0.4 - rnd() * r * 0.4, r * (0.6 + rnd() * 0.35), 0, 7); c.fill(); }
        c.globalAlpha = 1; c.fillStyle = color;
      }
      else { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.fillRect(x - 4, y, 8, base - y + 40); }
    }
  }
  if ((theme === 'city' || theme === 'factory') && layer === 0) { // lit windows on the far layer
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = base - 20 - rnd() * 150; c.fillRect(x, y, 5, 7); }
    c.fillStyle = color;
  }
}

function groundTufts(c, r, rnd, lip) {
  c.fillStyle = lip;
  for (let x = r[0] + 6; x < r[0] + r[2] - 6; x += 10 + rnd() * 16) {
    const h = 3 + rnd() * 5;
    c.beginPath(); c.moveTo(x - 3, r[1]); c.lineTo(x, r[1] - h); c.lineTo(x + 3, r[1]); c.fill();
  }
}

function buildBackground() {
  const map = mapNow(), bg = map.bg, k = vt.s * vt.dpr;
  const can = document.createElement('canvas');
  can.width = Math.ceil(W * k); can.height = Math.ceil((H + TOP) * k);
  const c = can.getContext('2d');
  c.setTransform(k, 0, 0, k, 0, TOP * k);
  const rnd = seeded(map.name);
  // ROUNDS-style backdrop: one flat colour, lit softly from the middle
  c.fillStyle = bg; c.fillRect(0, -TOP, W, H + TOP);
  const glow = c.createRadialGradient(W / 2, H * 0.3, 40, W / 2, H * 0.4, W * 0.72);
  glow.addColorStop(0, shade(bg, 0.22)); glow.addColorStop(0.5, bg); glow.addColorStop(1, shade(bg, -0.32));
  c.fillStyle = glow; c.fillRect(0, -TOP, W, H + TOP);
  // big soft blobs far back
  for (let i = 0; i < 10; i++) {
    const r = 50 + rnd() * 170;
    c.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.035})`; c.beginPath(); c.arc(rnd() * W, -TOP + rnd() * (H + TOP), r, 0, 7); c.fill();
  }
  // distant silhouettes, just a shade darker than the sky
  drawScenery(c, map, rnd, 0, shade(bg, -0.1));
  drawScenery(c, map, rnd, 1, shade(bg, -0.2));
  // the arena: flat ink shapes with a soft offset shadow
  c.fillStyle = 'rgba(0,0,0,.24)';
  for (const r of map.rects) c.fillRect(r[0] + 9, r[1] + 11, r[2], r[3]);
  c.fillStyle = INK;
  for (const r of map.rects) c.fillRect(r[0], r[1], r[2], r[3]);
  c.fillStyle = 'rgba(255,255,255,.07)';
  for (const r of map.rects) c.fillRect(r[0], r[1], r[2], Math.min(2, r[3]));
  // saw tracks
  for (const s of map.saws || []) if (s.spd) {
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(s.x - (s.dx || 0), s.y - (s.dy || 0)); c.lineTo(s.x + (s.dx || 0), s.y + (s.dy || 0)); c.stroke();
    c.fillStyle = INK; for (const k2 of [-1, 1]) { c.beginPath(); c.arc(s.x + k2 * (s.dx || 0), s.y + k2 * (s.dy || 0), 6, 0, 7); c.fill(); }
  }
  for (const r of map.ropes || []) { c.fillStyle = INK; c.fillRect(r.ax - 12, r.ay - 3, 24, 7); }
  return { can, map: G.m?.map, k };
}

function draw() {
  const map = mapNow();
  const k = vt.s * vt.dpr;
  if (!bgCache || bgCache.map !== G.m?.map || bgCache.k !== k) bgCache = buildBackground();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, cv.width, cv.height);
  // smooth screen shake
  const t = G.time, sh = G.shake;
  const sx = (Math.sin(t * 91) * 0.6 + Math.sin(t * 57 + 1) * 0.4) * sh, sy = (Math.cos(t * 83) * 0.6 + Math.sin(t * 43 + 2) * 0.4) * sh;
  ctx.drawImage(bgCache.can, (vt.ox + sx * vt.s) * vt.dpr, (vt.oy - TOP * vt.s + sy * vt.s) * vt.dpr);
  ctx.setTransform(k, 0, 0, k, (vt.ox + sx * vt.s) * vt.dpr, (vt.oy + sy * vt.s) * vt.dpr);
  ctx.save(); ctx.beginPath(); ctx.rect(0, -TOP, W, H + TOP); ctx.clip();

  // drifting dust
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  for (const m of G.motes) ctx.fillRect(m.x, m.y, m.s, m.s);

  // ropes and swinging boxes
  (map.ropes || []).forEach(r => {
    const b = ropeBox(r, G.rt), ex = b[0] + b[2] / 2, ey = b[1];
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r.ax, r.ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(b[0] + 7, b[1] + 9, b[2], b[3]);
    ctx.fillStyle = INK; ctx.fillRect(b[0], b[1], b[2], b[3]);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(b[0], b[1], b[2], 2);
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 7); ctx.fillStyle = INK; ctx.fill();
  });
  // breakable crates (they crack as they take hits)
  (map.breaks || []).forEach((r, i) => {
    if (G.broken.has(i)) return;
    const [x, y, w, h] = r;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + 7, y + 9, w, h);
    ctx.fillStyle = mix(map.bg, '#000000', 0.66); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = mix(map.bg, '#000000', 0.38); ctx.lineWidth = 3; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    ctx.beginPath(); ctx.moveTo(x + 6, y + h - 6); ctx.lineTo(x + w - 6, y + 6); ctx.stroke();
    const hits = G.crateHits[i] || 0;
    if (hits) {
      const rnd = seeded('c' + i);
      ctx.strokeStyle = shade(map.bg, 0.25); ctx.lineWidth = 1.6;
      for (let c = 0; c < Math.min(4, hits * 2); c++) {
        let cx = x + w * (0.2 + rnd() * 0.6), cy = y + h * (0.2 + rnd() * 0.6);
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) { cx += (rnd() - 0.5) * w * 0.45; cy += (rnd() - 0.5) * h * 0.45; ctx.lineTo(clamp(cx, x + 2, x + w - 2), clamp(cy, y + 2, y + h - 2)); }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  });
  for (const sw of map.saws || []) drawSaw(sawAt(sw, G.rt), G.rt * 11);
  drawFields();

  if (G.m && ['countdown', 'fight', 'roundEnd', 'pick'].includes(G.phase)) {
    for (const slot of [1 - G.you, G.you]) if (!G.dead[slot]) drawPlayer(slot);
    for (const sw of G.saws) { const o = sw.fixed ? sw : view(sw.owner); ctx.globalAlpha = 0.85; drawSaw({ x: o.x, y: o.y, r: 66 }, G.time * 16, true); ctx.globalAlpha = 1; }
    for (const bm of G.bombs) {
      const blinkOn = Math.floor(bm.t * 14) % 2;
      ctx.fillStyle = '#100d0b'; ctx.beginPath(); ctx.arc(bm.x, bm.y, 8, 0, 7); ctx.fill();
      ctx.fillStyle = blinkOn ? '#ff5a4a' : '#ffe08a'; ctx.beginPath(); ctx.arc(bm.x, bm.y, 3.5, 0, 7); ctx.fill();
      if (blinkOn) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(bm.x, bm.y, 14, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    }
    drawBullets();
  }
  drawParts();
  drawRings();
  drawFloats();
  ctx.restore();
  // Arrows for anything above the visible area
  if (G.m && live()) {
    for (const b of G.bullets) if (!b.delay && b.y < -TOP) arrow(b.x, G.hues[b.owner], 6);
    for (const slot of [0, 1]) { const v = view(slot); if (!G.dead[slot] && v.y < -TOP - PR) arrow(v.x, G.hues[slot], 12); }
  }
  // vignette
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.35, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cv.width, cv.height);
  if (G.slowT > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.12, G.slowT * 0.2)})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.setTransform(k, 0, 0, k, vt.ox * vt.dpr, vt.oy * vt.dpr);
  drawHud();
}

function drawFields() {
  for (const f of G.fields) {
    const a = clamp(Math.min(f.t / 0.3, (f.t0 - f.t) / 0.15 + 0.2), 0, 1), t = G.time;
    ctx.globalAlpha = a;
    if (f.k === 'heal') {
      ctx.fillStyle = 'rgba(123,216,143,.16)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7bd88f'; ctx.lineWidth = 3; ctx.setLineDash([14, 8]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    } else if (f.k === 'static') {
      ctx.fillStyle = 'rgba(143,211,255,.12)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c8ecff'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        let ang = Math.random() * 7, x = f.x, y = f.y; ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 1; s <= 6; s++) { const d = f.r * s / 6; ang += (Math.random() - 0.5) * 0.8; ctx.lineTo(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d); }
        ctx.stroke();
      }
      ctx.strokeStyle = '#8fd3ff'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.stroke();
    } else if (f.k === 'cloud') {
      const rnd = seeded(f.key);
      ctx.fillStyle = 'rgba(155,197,61,.33)';
      for (let i = 0; i < 8; i++) {
        const a0 = rnd() * 7 + t * (0.3 + rnd() * 0.4), d = f.r * 0.55 * rnd();
        ctx.beginPath(); ctx.arc(f.x + Math.cos(a0) * d, f.y + Math.sin(a0) * d * 0.6, f.r * (0.35 + rnd() * 0.3), 0, 7); ctx.fill();
      }
    } else if (f.k === 'nova') {
      const left = f.t / f.t0;
      ctx.fillStyle = 'rgba(201,163,255,.14)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c9a3ff'; ctx.lineWidth = 2.5;
      for (let arm = 0; arm < 4; arm++) {
        ctx.beginPath();
        for (let s = 0; s <= 20; s++) { const d = f.r * (1 - s / 20), ang = arm * Math.PI / 2 + s * 0.25 + t * 3; ctx.lineTo(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d); }
        ctx.stroke();
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * left, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawBullets() {
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    if (b.delay > 0) continue;
    const col = G.hues[b.owner], tr = b.tr || [];
    for (let i = 2; i < tr.length; i += 2) {
      const f = 1 - i / tr.length;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.5 * f; ctx.lineWidth = Math.max(1, b.r * 1.6 * f);
      ctx.beginPath(); ctx.moveTo(tr[i - 2], tr[i - 1]); ctx.lineTo(tr[i], tr[i + 1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (b.pad) { ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(b.x, b.y, b.r + b.pad, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    if (b.kind === 'bomb') {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff7a4a'; ctx.beginPath(); ctx.arc(b.x + 2, b.y - b.r, 2, 0, 7); ctx.fill();
      continue;
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.32;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.4 + 3, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1.5, b.r * 0.7), 0, 7); ctx.fill();
  }
}

function drawParts() {
  for (const p of G.parts) {
    const f = Math.max(0, p.life / p.max);
    if (p.t === 'smoke') { ctx.fillStyle = `rgba(${p.color},${p.alpha * f})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  }
  for (const p of G.parts) {
    const f = Math.max(0, p.life / p.max);
    if (p.t === 'chunk' || p.t === 'shell') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = p.color;
      if (p.t === 'shell') { ctx.fillRect(-3, -1.5, 6, 3); } else { ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.strokeStyle = 'rgba(16,13,11,.6)'; ctx.lineWidth = 1; ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size); }
      ctx.restore();
    } else if (p.t === 'plus') {
      ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.5, p.y - 5, 3, 10); ctx.fillRect(p.x - 5, p.y - 1.5, 10, 3);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.parts) {
    const f = Math.max(0, p.life / p.max);
    if (p.t === 'spark') {
      ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.lineWidth = p.size; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else if (p.t === 'flash') {
      ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - f * 0.4), 0, 7); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawRings() {
  for (const r of G.rings) {
    const t = 1 - r.life / r.max0, rad = r.r + (r.max - r.r) * (1 - (1 - Math.min(1, t * 1.2)) ** 3), al = Math.max(0, r.life / r.max0);
    if (r.fill) { ctx.globalAlpha = al * 0.28; ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.fill(); }
    ctx.globalAlpha = al; ctx.strokeStyle = r.color; ctx.lineWidth = 2 + 5 * al; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFloats() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of G.floats) {
    const age = (f.max || 0.9) - f.life, sc = age < 0.12 ? 1.7 - age * 5.8 : 1;
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, f.life * 2.5); ctx.font = `800 21px ${FONT}`;
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
}

function arrow(x, color, size) {
  x = clamp(x, 10, W - 10);
  ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, -TOP + 2); ctx.lineTo(x - size, -TOP + 2 + size * 1.4); ctx.lineTo(x + size, -TOP + 2 + size * 1.4); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function sawPath(r, n) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 0.55) / n * Math.PI * 2;
    ctx.lineTo(Math.cos(a0) * r * 0.8, Math.sin(a0) * r * 0.8);
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  ctx.closePath();
}
function drawSaw(q, spin, ghost) {
  const n = Math.max(10, Math.round(q.r / 3.2));
  ctx.save(); ctx.translate(q.x, q.y);
  if (!ghost) { ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.arc(7, 9, q.r, 0, 7); ctx.fill(); }
  ctx.rotate(spin);
  sawPath(q.r, n);
  ctx.fillStyle = ghost ? 'rgba(255,255,255,.3)' : INK; ctx.fill();
  ctx.strokeStyle = ghost ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (!ghost) {
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, q.r * 0.5, i * 2.1, i * 2.1 + 1.1); ctx.stroke(); }
    ctx.fillStyle = '#e9e9ec'; ctx.beginPath(); ctx.arc(0, 0, q.r * 0.13, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function groundBelow(x, y) {
  let best = null;
  for (const r of G.solids) if (x > r[0] - 4 && x < r[0] + r[2] + 4 && r[1] >= y + PR - 3 && (best === null || r[1] < best)) best = r[1];
  return best;
}

function drawPlayer(slot) {
  const v = view(slot), an = G.anim[slot], act = actorOf(slot), s = G.stats[slot], col = G.hues[slot];
  const grounded = isGrounded(slot), aim = v.aim, face = Math.cos(aim) >= 0 ? 1 : -1;
  const dark = shade(col, -0.25), light = shade(col, 0.35);
  // ground shadow
  const gy = groundBelow(v.x, v.y);
  if (gy !== null && gy - v.y < 320) {
    const k2 = 1 - (gy - v.y - PR) / 320;
    ctx.fillStyle = `rgba(0,0,0,${0.25 * k2})`; ctx.beginPath(); ctx.ellipse(v.x, gy, 20 * k2 + 4, 4.5 * k2 + 1, 0, 0, 7); ctx.fill();
  }
  // aura / charge (Abyssal Countdown)
  if (v.ab) {
    ctx.fillStyle = 'rgba(40,12,60,.35)'; ctx.beginPath(); ctx.arc(v.x, v.y, 210, 0, 7); ctx.fill();
    ctx.strokeStyle = '#6a2fa0'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = G.time * 40; ctx.beginPath(); ctx.arc(v.x, v.y, 210, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  } else if (v.ch > 0) {
    ctx.strokeStyle = '#6a2fa0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v.ch / 6)); ctx.stroke();
  }

  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(an.lean * 0.5);
  const st = grounded ? 0 : clamp(-v.vy / 2800, -0.14, 0.18);
  const sy = 1 + st - an.sq, sx = 1 - st * 0.6 + an.sq * 0.9;
  const moving = grounded && Math.abs(v.vx) > 40;
  // legs: two ink sticks
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const ph = an.walk + (side > 0 ? Math.PI : 0);
    const fx = side * 6 + (moving ? Math.sin(ph) * 7 : grounded ? side * 2 : -side), lift = moving ? Math.max(0, Math.cos(ph)) * 5 : grounded ? 0 : 4;
    ctx.beginPath(); ctx.moveTo(side * 5, 4); ctx.lineTo(fx, PR - 1 - lift); ctx.stroke();
  }
  // body: a round blob that squashes from its bottom
  const br = PR - 2;
  ctx.save(); ctx.translate(0, br - 3); ctx.scale(sx, sy); ctx.translate(0, -br);
  ctx.beginPath(); ctx.arc(0, 0, br, 0, 7);
  ctx.save(); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(-br - 2, -br - 2, br * 2 + 4, br * 2 + 4);
  ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, br * 0.95, br * 1.25, br * 0.62, 0, 0, 7); ctx.fill();
  ctx.fillStyle = light; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(-br * 0.38, -br * 0.48, br * 0.34, br * 0.2, -0.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  if (an.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, an.flash * 9)})`; ctx.fillRect(-br - 2, -br - 2, br * 2 + 4, br * 2 + 4); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, br, 0, 7); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  // face: two ink eyes that look where you aim
  const ex = Math.cos(aim) * 5, ey = Math.sin(aim) * 4;
  const hurt = an.hurtT > 0, blink = an.blink > 0;
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 2.2;
  for (const o of [-5.5, 5.5]) {
    const cx = o + ex, cy = -3 + ey;
    if (hurt) { ctx.beginPath(); ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3); ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3); ctx.stroke(); continue; }
    if (blink) { ctx.beginPath(); ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy); ctx.stroke(); continue; }
    ctx.beginPath(); ctx.ellipse(cx, cy, 2.4, 3.8, 0, 0, 7); ctx.fill();
  }
  ctx.lineWidth = 1.8; ctx.beginPath();
  if (an.recoil > 0.3 || hurt) ctx.arc(ex * 0.8, 5 + ey * 0.6, 2.2, 0, 7);
  else ctx.arc(ex * 0.8, 3 + ey * 0.6, 3.6, 0.35, Math.PI - 0.35);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // gun, held in a little hand
  ctx.save(); ctx.translate(v.x, v.y - 2); ctx.rotate(aim); if (face < 0) ctx.scale(1, -1);
  const kick = an.recoil * 7;
  ctx.fillStyle = INK;
  ctx.fillRect(14 - kick, -3.5, 22, 7);
  ctx.fillRect(8 - kick, -5.5, 12, 10);
  ctx.fillRect(11 - kick, 3, 4.5, 7);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(12 - kick, 5, 4.5, 0, 7); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  if (an.muzzle > 0) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); const mx = 38 - kick;
    for (let i = 0; i < 10; i++) { const a2 = i / 10 * Math.PI * 2, r2 = i % 2 ? 4 : 11 + Math.random() * 5; ctx.lineTo(mx + Math.cos(a2) * r2 * 1.3, Math.sin(a2) * r2 * 0.8); }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // status effects
  if (act?.stunT > 0) {
    for (let i = 0; i < 3; i++) { const a2 = G.time * 5 + i * 2.1; ctx.fillStyle = '#ffd166'; ctx.font = `700 16px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText('✦', v.x + Math.cos(a2) * 18, v.y - PR - 8 + Math.sin(a2) * 5); }
  }
  if (act?.slowT > 0) {
    ctx.fillStyle = 'rgba(191,230,255,.9)';
    for (let i = 0; i < 5; i++) { const a2 = i / 5 * Math.PI * 2 + G.time; const px = v.x + Math.cos(a2) * 24, py = v.y + Math.sin(a2) * 24; ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 3, py); ctx.fill(); }
  }
  if (act?.silT > 0) { ctx.font = `700 11px ${SANS}`; ctx.textAlign = 'center'; ctx.fillStyle = '#100d0b'; ctx.fillRect(v.x - 30, v.y + PR + 6, 60, 16); ctx.fillStyle = PAPER; ctx.fillText('SILENCED', v.x, v.y + PR + 19); }
  if (v.blocking) {
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 13, 0, 7); ctx.fill();
    ctx.strokeStyle = PAPER; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 13, 0, 7); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { const a2 = G.time * 6 + i * 2.1; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 18, a2, a2 + 0.9); ctx.stroke(); }
  }

  // health bar (with a lagging chunk) and shield
  const hp = G.hp[slot] ?? s.hp, shv = G.sh[slot] || 0, total = Math.max(s.hp, hp + shv), bwid = 50, bx = v.x - bwid / 2, by = v.y - PR - 20;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(bx - 2, by - 2, bwid + 4, 9, 4.5); ctx.fill();
  const lag = clamp((an.hpLag ?? hp) / total, 0, 1), cur = clamp(hp / total, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; if (lag > 0) { rr(bx, by, bwid * lag, 5, 2.5); ctx.fill(); }
  ctx.fillStyle = cur > 0.5 ? '#7bd88f' : cur > 0.25 ? '#f0b43c' : '#ff6b6b'; if (cur > 0) { rr(bx, by, bwid * cur, 5, 2.5); ctx.fill(); }
  if (shv) { ctx.fillStyle = '#9fd4ff'; ctx.fillRect(bx + bwid * cur, by, bwid * clamp(shv / total, 0, 1), 5); }
  if (act && !act.bot) {
    const n = s.ammo, pw = Math.max(2, Math.min(6, 50 / n - 2)), w0 = n * (pw + 2);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = act.reloadT > 0 || i >= act.ammo ? 'rgba(255,255,255,.22)' : '#fff';
      rr(v.x - w0 / 2 + i * (pw + 2), by - 9, pw, 4, 2); ctx.fill();
    }
    if (act.reloadT > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - act.reloadT / s.reload)); ctx.stroke(); }
    if (act.blockCd > 0) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 7, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * (1 - act.blockCd / s.blockCd)); ctx.stroke(); }
    if (act.empowered) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -G.time * 30; ctx.beginPath(); ctx.arc(v.x, v.y, PR + 17, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.font = `600 12px ${SANS}`; ctx.textAlign = 'center';
  const label = act && !act.bot ? 'You' : nameOf(slot);
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(label, v.x, by - 14);
  ctx.fillStyle = '#fff'; ctx.fillText(label, v.x, by - 14);
}

function drawHud() {
  if (!G.m || !['countdown', 'fight', 'roundEnd', 'pick'].includes(G.phase)) return;
  const m = G.m, y = -TOP / 2, half = 44 + Math.max(16 + m.rounds * 11, ...m.players.map(p => 18 + Math.min(14, p.username.length) * 7.5));
  ctx.textBaseline = 'middle';
  // glass pill, Universium-style
  ctx.fillStyle = 'rgba(12,12,15,.74)'; rr(W / 2 - half, y - 24, half * 2, 48, 24); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillStyle = G.hues[0]; ctx.fillText(String(m.players[0].score), W / 2 - 20, y + 1);
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillText(':', W / 2, y);
  ctx.fillStyle = G.hues[1]; ctx.fillText(String(m.players[1].score), W / 2 + 20, y + 1);
  for (const i of [0, 1]) {
    const p = m.players[i], x = W / 2 + (i ? 44 : -44), color = G.hues[i];
    const name = p.username.length > 14 ? p.username.slice(0, 13) + '…' : p.username;
    ctx.textAlign = i ? 'left' : 'right';
    ctx.font = `600 13px ${SANS}`; ctx.fillStyle = '#ececee'; ctx.fillText(name, x, y - 7);
    for (let r = 0; r < m.rounds; r++) {
      const px = i ? x + 4 + r * 11 : x - 4 - r * 11;
      ctx.fillStyle = r < p.score ? color : 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.arc(px, y + 10, 3.6, 0, 7); ctx.fill();
    }
  }
  if (G.phase === 'countdown') {
    const left = Math.ceil((G.timerEnd - performance.now()) / 1000);
    if (left > 0 && left !== G.lastCount) { G.lastCount = left; G.countPop = 1; snd.tick(); }
    G.countPop = Math.max(0, (G.countPop || 0) - 0.05);
    if (left > 0 && $('banner').hidden) {
      ctx.save(); ctx.translate(W / 2, H / 2); const sc = 1 + G.countPop * 0.5; ctx.scale(sc, sc);
      ctx.textAlign = 'center'; ctx.font = `800 120px ${FONT}`;
      ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.strokeText(String(left), 0, 6);
      ctx.fillStyle = '#fff'; ctx.fillText(String(left), 0, 0);
      ctx.restore();
    }
  }
  if (!G.practice) { ctx.font = `500 12px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillText(`${Math.round(G.ping)} ms`, 6, H - 12); }
  ctx.textBaseline = 'alphabetic';
}

/* ═══════════ Loop ═══════════ */
let last = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.net instanceof LocalNet) G.net.tick(real);
  G.slowT = Math.max(0, G.slowT - real);
  const freeze = G.freeze > 0; G.freeze = Math.max(0, G.freeze - real);
  // Slow motion only once the round is decided, so it never skews a live fight.
  const dt = G.phase === 'roundEnd' && G.slowT > 0 ? real * 0.3 : real;
  if (G.m && live() && !freeze) {
    updateWorld(dt);
    localInput();
    for (const a of G.actors) a.update(dt);
    updateRemote(dt);
    updateBullets(dt);
    sendState(real);
  }
  if (!freeze) { updateAnim(dt); updateFx(G.slowT > 0 ? real * 0.35 : real); }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ═══════════ Menu (no match yet) ═══════════ */
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong.'), { status: r.status, data: d });
  return d;
}

let homeRounds = 5, meUser = null;
async function showHome() {
  $('home').hidden = false;
  const pre = qs.get('invite');
  const seg = $('home-rounds');
  const paintRounds = () => { seg.innerHTML = ROUND_OPTIONS.map(n => `<button data-hr="${n}" aria-pressed="${n === homeRounds}">${n}</button>`).join(''); };
  paintRounds();
  seg.onclick = e => { const b = e.target.closest('[data-hr]'); if (b) { homeRounds = +b.dataset.hr; paintRounds(); snd.tick(); } };
  $('practice').onclick = () => startPractice();

  let me;
  try { me = await api('/api/me'); meUser = me.user; }
  catch {
    $('home-friends').innerHTML = `<p>Sign in on the Friends page to challenge people. Practice works without an account.</p>`;
    return;
  }
  try { const a = await api('/api/duel/active'); if (a.id && !pre) { location.search = '?match=' + a.id; return; } } catch {}

  const friends = me.friends || [];
  const paint = () => {
    $('home-friends').innerHTML = friends.length ? friends.map(f => `
      <div class="friend${f.id === pre ? ' pre' : ''}">
        ${av(f)}<b class="grow">${esc(f.username)}</b><span class="state ${f.online ? 'y' : ''}">${f.online ? 'online' : 'offline'}</span>
        <button class="btn sm ${f.online ? 'go' : ''}" data-challenge="${f.id}" ${f.online ? '' : 'disabled'}>Challenge</button>
      </div>`).join('') : `<p>No friends yet. Add some on the Friends page.</p>`;
  };
  paint();
  $('home-friends').onclick = async e => {
    const b = e.target.closest('[data-challenge]'); if (!b) return;
    b.disabled = true; $('home-err').textContent = '';
    try {
      const { id } = await api('/api/duel/invite', { method: 'POST', body: JSON.stringify({ friendId: b.dataset.challenge, rounds: homeRounds }) });
      location.search = '?match=' + id;
    } catch (err) {
      if (err.data?.id) { location.search = '?match=' + err.data.id; return; }
      $('home-err').textContent = err.message; b.disabled = false;
    }
  };
  const poll = async () => {
    if ($('home').hidden) return;
    try {
      const { invites } = await api('/api/duel/invites');
      $('home-invites').innerHTML = invites.length ? `<h3>Challenges for you</h3><div class="list">${invites.map(i => `
        <div class="friend pre">${av(i.from)}<b class="grow">${esc(i.from.username)} <span class="note">first to ${i.rounds}</span></b>
          <button class="btn sm" data-decline="${i.id}">Decline</button><button class="btn sm go" data-accept="${i.id}">Accept</button></div>`).join('')}</div>` : '';
    } catch {}
    try { const d = await api('/api/me'); d.friends.forEach(f => { const x = friends.find(y => y.id === f.id); if (x) x.online = f.online; }); paint(); } catch {}
  };
  $('home-invites').onclick = async e => {
    const a = e.target.closest('[data-accept]'), d = e.target.closest('[data-decline]');
    if (a) location.search = '?match=' + a.dataset.accept;
    if (d) { await api(`/api/duel/${d.dataset.decline}/decline`, { method: 'POST' }).catch(() => {}); poll(); }
  };
  poll();
  setInterval(poll, 4000);
}

function startPractice() {
  G.practice = true;
  const me = meUser ? { id: meUser.id, username: meUser.username, color: meUser.color ?? 30 } : { id: 'me', username: 'You', color: 30 };
  G.net = new LocalNet(me, homeRounds);
  G.me = new Actor(0);
  G.bot = new Bot();
  G.actors = [G.me, G.bot];
  $('home').hidden = true;
}

/* ═══════════ Start ═══════════ */
const matchId = qs.get('match');
if (matchId) {
  G.net = new SocketNet(matchId);
  $('room').hidden = false; $('room-box').innerHTML = '<h2>Joining…</h2>';
} else showHome();
window.__duel = G; // handy for poking at from the console
