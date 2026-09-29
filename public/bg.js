/* Background: a ring system around a planet peeking in from the corner.
   Interactive: the cursor pulls nearby dust in and links it with faint lines.
   Cheap by design: ~40 ellipse strokes + ~170 dots per frame, 30 fps cap, and it only runs
   while Home, Games, History or Chat is on screen (sites, games and movies cover it anyway). */
window.bg = (() => {
  const cv = document.getElementById('bg');
  const ctx = cv.getContext('2d', { alpha: false });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const SEE_THROUGH = ['home', 'games', 'assistant', 'history'];
  let W = 0, H = 0, R = 0, rings = [], dust = [], comets = [], starLayer = null;
  let rgb = [185, 163, 255], raf = 0, last = 0, px = 0, py = 0, tpx = 0, tpy = 0;
  let mx = -1e4, my = -1e4, mActive = false;

  const hex = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const col = a => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const rand = (a, b) => a + Math.random() * (b - a);

  function makeComet(ring) {
    ring = ring || rings[(Math.random() * rings.length * 0.7) | 0];
    return { r: ring.r, t: rand(0, TAU), w: 0.00011 * Math.pow(R * 0.5 / ring.r, 1.5) + 0.00004, len: rand(0.18, 0.4), life: Infinity };
  }

  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.hypot(W, H) * 0.78;

    rings = [];
    let r = R * 0.24;
    while (r < R * 1.35) {
      r += Math.random() < 0.14 ? R * rand(0.03, 0.06) : R * rand(0.007, 0.018);
      rings.push({ r, a: rand(0.035, 0.15), w: Math.random() < 0.12 ? 1.6 : 0.8 });
    }
    dust = Array.from({ length: Math.round(Math.min(170, W * H / 9000)) }, () => {
      const ring = rings[(Math.random() * rings.length) | 0];
      return { r: ring.r + rand(-4, 4), t: rand(0, TAU), w: 0.00005 * Math.pow(R * 0.5 / ring.r, 1.5), s: rand(0.5, 1.7), a: rand(0.25, 0.85), ox: 0, oy: 0, vx: 0, vy: 0, x: 0, y: 0 };
    });
    comets = Array.from({ length: 6 }, () => makeComet());

    starLayer = document.createElement('canvas');
    starLayer.width = cv.width; starLayer.height = cv.height;
    const s = starLayer.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.fillStyle = '#0f1012'; s.fillRect(0, 0, W, H);
    const glow = s.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, Math.max(W, H) * 0.7);
    glow.addColorStop(0, col(0.09)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = glow; s.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / 3500; i++) {
      s.fillStyle = Math.random() < 0.25 ? col(rand(0.2, 0.6)) : `rgba(230,228,240,${rand(0.08, 0.45)})`;
      s.beginPath(); s.arc(rand(0, W), rand(0, H), rand(0.3, 1.1), 0, TAU); s.fill();
    }
  }

  function frame(t) {
    px += (tpx - px) * 0.05; py += (tpy - py) * 0.05;
    const cx = W * 0.8 + px, cy = H * 0.97 + py;
    const tilt = -0.42 + Math.sin(t / 21000) * 0.04;
    const k = 0.36 + Math.sin(t / 27000) * 0.03;
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    const at = (r, a) => { const x = r * Math.cos(a), y = r * k * Math.sin(a); return [cx + x * cos - y * sin, cy + x * sin + y * cos]; };

    ctx.drawImage(starLayer, 0, 0, W, H);

    // Cursor glow
    if (mActive) {
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 180);
      g.addColorStop(0, col(0.08)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(mx - 180, my - 180, 360, 360);
    }

    const halves = (from, to) => {
      for (const g of rings) {
        ctx.strokeStyle = col(g.a); ctx.lineWidth = g.w;
        ctx.beginPath(); ctx.ellipse(cx, cy, g.r, g.r * k, tilt, from, to); ctx.stroke();
      }
    };
    halves(Math.PI, TAU);

    const pr = R * 0.17;
    const body = ctx.createRadialGradient(cx - pr * 0.45, cy - pr * 0.55, pr * 0.1, cx, cy, pr);
    body.addColorStop(0, col(0.42)); body.addColorStop(0.3, '#2b2245'); body.addColorStop(0.75, '#141120'); body.addColorStop(1, '#0c0b11');
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
    const halo = ctx.createRadialGradient(cx, cy, pr * 0.95, cx, cy, pr * 1.5);
    halo.addColorStop(0, col(0.16)); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, pr * 1.5, 0, TAU); ctx.fill();

    halves(0, Math.PI);

    // Dust: orbital position + a spring offset pulled around by the cursor.
    const near = [];
    for (const d of dust) {
      const ang = d.t + t * d.w;
      let [x, y] = at(d.r, ang);
      if (mActive) {
        const dx = mx - (x + d.ox), dy = my - (y + d.oy), dist = Math.hypot(dx, dy);
        if (dist < 160) { const f = (1 - dist / 160) * 0.6; d.vx += dx / dist * f; d.vy += dy / dist * f; }
      }
      d.vx += -d.ox * 0.02; d.vy += -d.oy * 0.02;    // spring back to the orbit
      d.vx *= 0.88; d.vy *= 0.88;
      d.ox += d.vx; d.oy += d.vy;
      x += d.ox; y += d.oy; d.x = x; d.y = y;
      if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
      const front = Math.sin(ang) > 0 || Math.hypot(x - cx, y - cy) > pr;
      const lit = mActive && Math.hypot(mx - x, my - y) < 140;
      ctx.fillStyle = col(front ? (lit ? 1 : d.a) : d.a * 0.15);
      const s = lit ? d.s + 1 : d.s;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (lit) near.push(d);
    }

    // Constellation lines from the cursor to the nearest dust
    if (near.length) {
      near.sort((a, b) => Math.hypot(mx - a.x, my - a.y) - Math.hypot(mx - b.x, my - b.y));
      ctx.lineWidth = 0.8;
      for (const d of near.slice(0, 7)) {
        const a = 0.45 * (1 - Math.hypot(mx - d.x, my - d.y) / 140);
        ctx.strokeStyle = col(a);
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
    }

    ctx.lineCap = 'round';
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      if (c.life !== Infinity && t > c.life) { comets.splice(i, 1); continue; }
      const head = c.t + t * c.w, seg = c.len / 6;
      for (let j = 0; j < 6; j++) {
        ctx.strokeStyle = col(0.05 + j * 0.13); ctx.lineWidth = 0.6 + j * 0.25;
        ctx.beginPath(); ctx.ellipse(cx, cy, c.r, c.r * k, tilt, head - c.len + j * seg, head - c.len + (j + 1) * seg); ctx.stroke();
      }
      const [hx, hy] = at(c.r, head);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = col(0.18); ctx.beginPath(); ctx.arc(hx, hy, 5, 0, TAU); ctx.fill();
    }
  }

  const visible = () => SEE_THROUGH.includes(document.body.dataset.view) && !document.hidden;
  const moving = () => (typeof cfg === 'undefined' || cfg.motion !== false) && !reduce.matches;

  function loop(t) {
    raf = 0;
    if (!visible() || !moving()) return;
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return;
    last = t;
    frame(t);
  }
  function kick() {
    if (!W) build();
    if (!visible()) return;
    if (!moving()) { cancelAnimationFrame(raf); raf = 0; frame(performance.now()); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { build(); frame(performance.now()); }, 120); });
  addEventListener('pointermove', e => {
    tpx = (e.clientX / W - 0.5) * -24; tpy = (e.clientY / H - 0.5) * -16;
    mx = e.clientX; my = e.clientY; mActive = e.pointerType !== 'touch';
  }, { passive: true });
  document.addEventListener('pointerleave', () => { mActive = false; });
  addEventListener('blur', () => { mActive = false; });
  document.addEventListener('visibilitychange', kick);
  reduce.addEventListener?.('change', kick);

  return {
    kick,
    setAccent(h) { rgb = hex(h); if (W) { build(); frame(performance.now()); } },
  };
})();
