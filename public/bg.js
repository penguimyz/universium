/* Animated backgrounds. Five scenes, all reacting to the mouse:
     rings   a ringed planet in the corner; dust orbits and gets pulled toward the cursor
     warp    flying through stars; the cursor steers
     waves   stacked flowing lines, like a moving contour map; lines bulge around the cursor
     nebula  slow glowing clouds that drift toward the cursor
     none    a still starfield (no animation)
   Runs at the display's refresh rate but only while Home, Games, History, Chat or Friends
   is on screen, and never while the tab is hidden. Stars, glow and grain are drawn once
   into a cached layer, so each frame only draws what moves. */
window.bg = (() => {
  const cv = document.getElementById('bg');
  const ctx = cv.getContext('2d', { alpha: false });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const SEE_THROUGH = ['home', 'games', 'assistant', 'history', 'friends', 'admin'];
  const rand = (a, b) => a + Math.random() * (b - a);

  let W = 0, H = 0, dpr = 1, base = null, scene = 'rings', S = {};
  let rgb = [185, 163, 255], raf = 0;
  let mx = -1e4, my = -1e4, mActive = false, smx = 0, smy = 0; // smoothed pointer (0..1)
  const col = a => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  /* ── Static layer: dark base, corner glow, stars, film grain ─────────────── */
  function buildBase() {
    base = document.createElement('canvas');
    base.width = cv.width; base.height = cv.height;
    const b = base.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.fillStyle = '#0f1012'; b.fillRect(0, 0, W, H);
    const glow = b.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, Math.max(W, H) * 0.7);
    glow.addColorStop(0, col(0.09)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = glow; b.fillRect(0, 0, W, H);
    const nStars = scene === 'warp' ? 0 : W * H / 3500;
    for (let i = 0; i < nStars; i++) {
      b.fillStyle = Math.random() < 0.25 ? col(rand(0.2, 0.6)) : `rgba(230,228,240,${rand(0.08, 0.45)})`;
      b.beginPath(); b.arc(rand(0, W), rand(0, H), rand(0.3, 1.1), 0, TAU); b.fill();
    }
    // Grain, baked once (was a full-screen blend layer every frame).
    const g = document.createElement('canvas'); g.width = g.height = 128;
    const gx = g.getContext('2d'), img = gx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 10; }
    gx.putImageData(img, 0, 0);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.fillStyle = b.createPattern(g, 'repeat'); b.fillRect(0, 0, base.width, base.height);
  }

  /* ── Scene: rings ─────────────────────────────────────────────────────────── */
  const rings = {
    init() {
      const R = S.R = Math.hypot(W, H) * 0.78;
      S.rings = [];
      let r = R * 0.24;
      while (r < R * 1.35) {
        r += Math.random() < 0.14 ? R * rand(0.03, 0.06) : R * rand(0.007, 0.018);
        S.rings.push({ r, a: rand(0.035, 0.15), w: Math.random() < 0.12 ? 1.6 : 0.8 });
      }
      S.dust = Array.from({ length: Math.round(Math.min(170, W * H / 9000)) }, () => {
        const ring = S.rings[(Math.random() * S.rings.length) | 0];
        return { r: ring.r + rand(-4, 4), t: rand(0, TAU), w: 0.00005 * Math.pow(R * 0.5 / ring.r, 1.5), s: rand(0.5, 1.7), a: rand(0.25, 0.85), ox: 0, oy: 0, vx: 0, vy: 0 };
      });
      S.comets = Array.from({ length: 6 }, () => {
        const ring = S.rings[(Math.random() * S.rings.length * 0.7) | 0];
        return { r: ring.r, t: rand(0, TAU), w: 0.00011 * Math.pow(R * 0.5 / ring.r, 1.5) + 0.00004, len: rand(0.18, 0.4) };
      });
    },
    draw(t) {
      const { R } = S;
      const cx = W * 0.8 - smx * 24, cy = H * 0.97 - smy * 16;
      const tilt = -0.42 + Math.sin(t / 21000) * 0.04, k = 0.36 + Math.sin(t / 27000) * 0.03;
      const cos = Math.cos(tilt), sin = Math.sin(tilt);
      const at = (r, a) => { const x = r * Math.cos(a), y = r * k * Math.sin(a); return [cx + x * cos - y * sin, cy + x * sin + y * cos]; };
      const halves = (from, to) => { for (const g of S.rings) { ctx.strokeStyle = col(g.a); ctx.lineWidth = g.w; ctx.beginPath(); ctx.ellipse(cx, cy, g.r, g.r * k, tilt, from, to); ctx.stroke(); } };
      halves(Math.PI, TAU);
      const pr = R * 0.17;
      const body = ctx.createRadialGradient(cx - pr * 0.45, cy - pr * 0.55, pr * 0.1, cx, cy, pr);
      body.addColorStop(0, col(0.42)); body.addColorStop(0.3, '#2b2245'); body.addColorStop(0.75, '#141120'); body.addColorStop(1, '#0c0b11');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
      const halo = ctx.createRadialGradient(cx, cy, pr * 0.95, cx, cy, pr * 1.5);
      halo.addColorStop(0, col(0.16)); halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, pr * 1.5, 0, TAU); ctx.fill();
      halves(0, Math.PI);

      const near = [];
      for (const d of S.dust) {
        const ang = d.t + t * d.w;
        let [x, y] = at(d.r, ang);
        if (mActive) {
          const dx = mx - (x + d.ox), dy = my - (y + d.oy), dist = Math.hypot(dx, dy);
          if (dist < 160 && dist > 0) { const f = (1 - dist / 160) * 0.35; d.vx += dx / dist * f; d.vy += dy / dist * f; }
        }
        d.vx = (d.vx - d.ox * 0.012) * 0.92; d.vy = (d.vy - d.oy * 0.012) * 0.92;
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
      if (near.length) {
        near.sort((a, b) => Math.hypot(mx - a.x, my - a.y) - Math.hypot(mx - b.x, my - b.y));
        ctx.lineWidth = 0.8;
        for (const d of near.slice(0, 7)) {
          ctx.strokeStyle = col(0.45 * (1 - Math.hypot(mx - d.x, my - d.y) / 140));
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
      }
      ctx.lineCap = 'round';
      for (const c of S.comets) {
        const head = c.t + t * c.w, seg = c.len / 6;
        for (let j = 0; j < 6; j++) {
          ctx.strokeStyle = col(0.05 + j * 0.13); ctx.lineWidth = 0.6 + j * 0.25;
          ctx.beginPath(); ctx.ellipse(cx, cy, c.r, c.r * k, tilt, head - c.len + j * seg, head - c.len + (j + 1) * seg); ctx.stroke();
        }
        const [hx, hy] = at(c.r, head);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 1.4, 0, TAU); ctx.fill();
      }
    },
  };

  /* ── Scene: warp ──────────────────────────────────────────────────────────── */
  const warp = {
    init() {
      S.stars = Array.from({ length: Math.round(Math.min(520, W * H / 2600)) }, () => warp.spawn(true));
      S.last = 0;
    },
    spawn(anyZ) { return { x: rand(-1, 1), y: rand(-1, 1), z: anyZ ? rand(0.05, 1) : 1, pz: 0, tint: Math.random() < 0.3 }; },
    draw(t) {
      const dt = S.last ? Math.min(50, t - S.last) : 16; S.last = t;
      const speed = 0.00018 * dt;
      // The vanishing point follows the cursor a little, so the pointer "steers".
      const cx = W / 2 + smx * W * 0.18, cy = H / 2 + smy * H * 0.18;
      const f = Math.max(W, H) * 0.5;
      ctx.lineCap = 'round';
      for (const s of S.stars) {
        s.pz = s.z; s.z -= speed;
        if (s.z <= 0.02) { Object.assign(s, warp.spawn(false)); s.pz = s.z; continue; }
        const x = cx + s.x / s.z * f, y = cy + s.y / s.z * f;
        const px = cx + s.x / s.pz * f, py = cy + s.y / s.pz * f;
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) { Object.assign(s, warp.spawn(false)); continue; }
        const a = Math.min(1, (1 - s.z) * 1.3);
        ctx.strokeStyle = s.tint ? col(a) : `rgba(235,232,255,${a})`;
        ctx.lineWidth = (1 - s.z) * 2.6 + 0.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.35);
      g.addColorStop(0, col(0.08)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
  };

  /* ── Scene: waves ─────────────────────────────────────────────────────────── */
  const waves = {
    init() {
      S.lines = Math.round(Math.min(46, H / 17));
      S.step = Math.max(8, Math.round(W / 170));
      S.seeds = Array.from({ length: S.lines }, () => [rand(0, TAU), rand(0, TAU), rand(0.6, 1.4)]);
    },
    draw(t) {
      const gap = H / (S.lines - 1);
      const T = t / 1000;
      ctx.lineWidth = 1;
      for (let i = 0; i < S.lines; i++) {
        const [p1, p2, amp] = S.seeds[i];
        const y0 = i * gap;
        const depth = i / S.lines;
        ctx.strokeStyle = col(0.08 + depth * 0.26);
        ctx.beginPath();
        for (let x = -S.step; x <= W + S.step; x += S.step) {
          const nx = x / W;
          let y = y0
            + Math.sin(nx * 5.2 + T * 0.35 + p1) * 16 * amp
            + Math.sin(nx * 11.3 - T * 0.22 + p2 + i * 0.3) * 7
            + Math.sin(nx * 2.1 + T * 0.12 + i * 0.18) * 26;
          if (mActive) {
            const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
            y += (y < my ? -1 : 1) * 38 * Math.exp(-d2 / 9000);
          }
          x === -S.step ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
  };

  /* ── Scene: nebula (drawn at quarter resolution, it's all soft anyway) ───── */
  const nebula = {
    init() {
      S.off = document.createElement('canvas');
      S.off.width = Math.ceil(W / 4); S.off.height = Math.ceil(H / 4);
      S.octx = S.off.getContext('2d');
      const hues = [0, 25, -30, 50, -55];
      S.blobs = hues.map((dh, i) => ({ x: rand(0.1, 0.9), y: rand(0.1, 0.9), r: rand(0.35, 0.6), sx: rand(0.00005, 0.00012), sy: rand(0.00005, 0.00012), ph: rand(0, TAU), dh, a: i === 0 ? 0.22 : rand(0.1, 0.18) }));
      S.follow = { x: 0.5, y: 0.5 };
    },
    draw(t) {
      const o = S.octx, w = S.off.width, h = S.off.height;
      o.clearRect(0, 0, w, h);
      o.globalCompositeOperation = 'lighter';
      const [r, g, b] = rgb;
      S.follow.x += ((mActive ? mx / W : 0.5) - S.follow.x) * 0.02;
      S.follow.y += ((mActive ? my / H : 0.5) - S.follow.y) * 0.02;
      S.blobs.forEach((bl, i) => {
        let x = bl.x + Math.sin(t * bl.sx + bl.ph) * 0.18, y = bl.y + Math.cos(t * bl.sy + bl.ph) * 0.14;
        if (i === 0) { x = S.follow.x; y = S.follow.y; }
        const rad = bl.r * Math.max(w, h);
        const grd = o.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad);
        const shift = c => Math.max(0, Math.min(255, c + bl.dh));
        grd.addColorStop(0, `rgba(${shift(r)},${g},${shift(b)},${bl.a})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        o.fillStyle = grd; o.fillRect(0, 0, w, h);
      });
      o.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(S.off, 0, 0, W, H);
    },
  };

  const none = { init() {}, draw() {} };
  const SCENES = { rings, warp, waves, nebula, none };

  /* ── Loop ─────────────────────────────────────────────────────────────────── */
  function build() {
    dpr = Math.min(devicePixelRatio || 1, 1.25);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = {};
    buildBase();
    SCENES[scene].init();
  }
  function frame(t) {
    smx += ((mActive ? mx / W - 0.5 : 0) - smx) * 0.05;
    smy += ((mActive ? my / H - 0.5 : 0) - smy) * 0.05;
    ctx.drawImage(base, 0, 0, W, H);
    SCENES[scene].draw(t);
  }
  const visible = () => SEE_THROUGH.includes(document.body.dataset.view) && !document.hidden;
  const moving = () => (typeof cfg === 'undefined' || cfg.motion !== false) && !reduce.matches && scene !== 'none';
  function loop(t) {
    raf = 0;
    if (!visible() || !moving()) return;
    raf = requestAnimationFrame(loop);
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
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; mActive = e.pointerType !== 'touch'; }, { passive: true });
  document.addEventListener('pointerleave', () => { mActive = false; });
  addEventListener('blur', () => { mActive = false; });
  document.addEventListener('visibilitychange', kick);
  reduce.addEventListener?.('change', kick);

  return {
    kick,
    scenes: Object.keys(SCENES),
    setScene(name) { if (!SCENES[name]) name = 'rings'; scene = name; if (W) { build(); frame(performance.now()); } kick(); },
    setAccent(h) { const n = parseInt(h.replace('#', ''), 16); rgb = [n >> 16 & 255, n >> 8 & 255, n & 255]; if (W) { build(); frame(performance.now()); } },
  };
})();
