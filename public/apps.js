/* Desktop apps: small programs that open in their own windows in desktop mode.
   Windows can be dragged by the title bar, resized from the corner, minimized to the taskbar,
   maximized (button or double-click the title) and stacked. Uses helpers from app.js. */
window.winapps = (() => {
  /* ── icons, added to the page's icon sprite ── */
  const ICONS = {
    'i-calc': '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M8.5 18h.01M12 18h.01M15.5 14.5V18"/>',
    'i-note': '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h7M9 14.5h7M9 18h4"/>',
    'i-paint': '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-2-.5-1.3.3-2.5 1.7-2.5H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="8" r="1.2"/>',
    'i-clockapp': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    'i-cal': '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    'i-mines': '<circle cx="12" cy="13" r="6"/><path d="M12 4v3M12 19v2M4 13H3M21 13h-1M6.3 7.3 5.2 6.2M17.7 7.3l1.1-1.1"/><circle cx="10" cy="11" r="1.2" fill="currentColor" stroke="none"/>',
    'i-term': '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 10 3 2.5L7 15M12.5 15H17"/>',
    'i-tasks': '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M7 15.5l3-4 3 2.5 4-5.5"/>',
    'i-flag2': '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
  };
  const defs = document.querySelector('svg > defs');
  defs?.insertAdjacentHTML('beforeend', Object.entries(ICONS).map(([id, p]) =>
    `<symbol id="${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</symbol>`).join(''));

  const APPS = {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TASKBAR = 52;
  const layer = document.createElement('div');
  layer.id = 'fwins';
  document.body.appendChild(layer);
  const wins = new Map();
  let z = 10, cascade = 0;
  const changed = () => window.desktop?.renderRunning?.();
  // Outside desktop mode there's no taskbar, so windows can use the full height.
  const area = () => ({ w: innerWidth, h: innerHeight - (document.documentElement.classList.contains('desktop') ? TASKBAR : 0) });

  function open(id) {
    const def = APPS[id]; if (!def) return;
    let w = wins.get(id);
    if (w) { if (w.min) restore(w); focus(w); restart(w.el, 'fw-nudge'); return w; }
    const { w: vw, h: vh } = area();
    const W = Math.min(def.w, vw - 16), H = Math.min(def.h, vh - 16);
    const off = (cascade++ % 6) * 26 - 65;
    const x = clamp(Math.round((vw - W) / 2 + off), 8, vw - W - 8), y = clamp(Math.round((vh - H) / 2 + off), 8, vh - H - 8);
    const el = document.createElement('section');
    el.className = 'fwin'; el.dataset.app = id;
    el.style.cssText = `left:${x}px;top:${y}px;width:${W}px;height:${H}px`;
    el.innerHTML = `
      <header class="fw-bar">
        <span class="fw-title"><span class="fw-ico" style="--tint:${def.tint}">${svg(def.icon)}</span><b>${def.name}</b></span>
        <button class="fw-btn" data-fw="min" title="Minimize" aria-label="Minimize">${svg('i-min')}</button>
        <button class="fw-btn" data-fw="max" title="Maximize" aria-label="Maximize">${svg('i-max')}</button>
        <button class="fw-btn close" data-fw="close" title="Close" aria-label="Close">${svg('i-x')}</button>
      </header>
      <div class="fw-body"></div>
      <span class="fw-grip" aria-hidden="true"></span>`;
    layer.appendChild(el);
    w = { id, el, def, min: false, max: false, body: el.querySelector('.fw-body'), listeners: [] };
    w.active = () => el.classList.contains('active') && !w.min;
    w.on = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); w.listeners.push(() => target.removeEventListener(type, fn, opt)); };
    w.setTitle = t => { el.querySelector('.fw-title b').textContent = t; };
    w.resizeTo = (nw, nh) => { const a = area(); el.style.width = Math.min(nw, a.w - 16) + 'px'; el.style.height = Math.min(nh, a.h - 16) + 'px'; keepInside(w); w.onResize?.(); };
    wins.set(id, w);
    w.cleanup = def.mount(w.body, w) || (() => {});
    focus(w);
    restart(el, 'fw-in');
    sfx.open();
    changed();
    return w;
  }
  function close(w) {
    if (!w) return;
    try { w.cleanup(); } catch {}
    w.listeners.forEach(f => f());
    w.el.classList.add('fw-out');
    setTimeout(() => w.el.remove(), 140);
    wins.delete(w.id);
    sfx.close();
    const top = [...wins.values()].filter(x => !x.min).sort((a, b) => b.z - a.z)[0];
    if (top) focus(top);
    changed();
  }
  function focus(w) {
    w.z = ++z; w.el.style.zIndex = w.z;
    for (const x of wins.values()) x.el.classList.toggle('active', x === w);
    changed();
  }
  function minimize(w) { w.min = true; w.el.hidden = true; w.el.classList.remove('active'); changed(); }
  function restore(w) { w.min = false; w.el.hidden = false; restart(w.el, 'fw-in'); }
  function toggleMax(w) {
    w.max = !w.max;
    if (w.max) { w.prev = w.el.style.cssText; w.el.classList.add('max'); }
    else { w.el.classList.remove('max'); if (w.prev) w.el.style.cssText = w.prev; w.el.style.zIndex = w.z; }
    setTimeout(() => w.onResize?.(), 30);
  }
  function keepInside(w) {
    const a = area(), r = w.el.getBoundingClientRect();
    w.el.style.left = clamp(r.left, Math.min(0, a.w - r.width), Math.max(0, a.w - 80)) + 'px';
    w.el.style.top = clamp(r.top, 0, Math.max(0, a.h - 40)) + 'px';
  }
  // From the taskbar: minimized → bring back; active → minimize; behind something → bring to front.
  function toggle(id) {
    const w = wins.get(id); if (!w) return;
    if (w.min) { restore(w); focus(w); } else if (w.active()) minimize(w); else focus(w);
  }

  /* ── dragging, resizing, buttons ── */
  layer.addEventListener('pointerdown', e => {
    const el = e.target.closest('.fwin'); if (!el) return;
    const w = wins.get(el.dataset.app); if (!w) return;
    if (!w.active()) focus(w);
    const bar = e.target.closest('.fw-bar'), grip = e.target.closest('.fw-grip');
    if ((!bar && !grip) || e.target.closest('.fw-btn') || e.button !== 0) return;
    if (bar && w.max) return;
    e.preventDefault();
    const r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    el.classList.add('dragging');
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, a = area();
      if (bar) {
        el.style.left = clamp(r.left + dx, -r.width + 90, a.w - 90) + 'px';
        el.style.top = clamp(r.top + dy, 0, a.h - 38) + 'px';
      } else {
        el.style.width = clamp(r.width + dx, w.def.minW || 260, a.w - r.left) + 'px';
        el.style.height = clamp(r.height + dy, w.def.minH || 200, a.h - r.top) + 'px';
        w.onResize?.();
      }
    };
    const up = () => { el.classList.remove('dragging'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); w.onResize?.(); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  layer.addEventListener('click', e => {
    const b = e.target.closest('[data-fw]'); if (!b) return;
    const w = wins.get(b.closest('.fwin').dataset.app); if (!w) return;
    ({ min: minimize, max: toggleMax, close })[b.dataset.fw](w);
  });
  layer.addEventListener('dblclick', e => {
    if (!e.target.closest('.fw-bar') || e.target.closest('.fw-btn')) return;
    const w = wins.get(e.target.closest('.fwin').dataset.app); if (w) toggleMax(w);
  });
  addEventListener('resize', () => { for (const w of wins.values()) { if (!w.max) keepInside(w); w.onResize?.(); } });

  /* ── helpers for apps ── */
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const pad = n => String(n).padStart(2, '0');
  const fmtMs = ms => { const t = Math.max(0, Math.floor(ms / 10)); const cs = t % 100, s = Math.floor(t / 100) % 60, m = Math.floor(t / 6000) % 60, hr = Math.floor(t / 360000); return `${hr ? hr + ':' + pad(m) : pad(m)}:${pad(s)}.${pad(cs)}`; };
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  function download(name, href) { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  // Safe arithmetic (no eval): + - * / % ^, parentheses, decimals, unary minus.
  function calcExpr(src) {
    const toks = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').match(/\d*\.?\d+(?:e[+-]?\d+)?|[-+*/%^()]/gi);
    if (!toks || toks.join('') !== String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '')) throw new Error('bad input');
    let i = 0;
    const peek = () => toks[i], take = () => toks[i++];
    const prim = () => {
      const t = take();
      if (t === '(') { const v = add(); if (take() !== ')') throw new Error('missing )'); return v; }
      if (t === '-') return -pow();
      if (t === '+') return pow();
      const n = parseFloat(t); if (Number.isNaN(n)) throw new Error('bad input'); return n;
    };
    const pow = () => { const b = prim(); return peek() === '^' ? (take(), b ** pow()) : b; };
    const mul = () => { let v = pow(); while (['*', '/', '%'].includes(peek())) { const o = take(), r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; };
    const add = () => { let v = mul(); while (['+', '-'].includes(peek())) { const o = take(), r = mul(); v = o === '+' ? v + r : v - r; } return v; };
    const v = add();
    if (i < toks.length) throw new Error('bad input');
    return v;
  }
  const niceNum = v => !Number.isFinite(v) ? 'Error' : Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(6).replace(/\.?0+e/, 'e') : String(Number(v.toPrecision(12)));

  /* ═══════════ Calculator ═══════════ */
  APPS.calc = {
    name: 'Calculator', icon: 'i-calc', tint: '#f59e0b', w: 300, h: 450, minW: 240, minH: 360,
    mount(body, w) {
      body.classList.add('ap-calc');
      body.innerHTML = `
        <div class="calc-screen"><small class="calc-expr"></small><output class="calc-out">0</output></div>
        <div class="calc-keys">${['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '=']
          .map(k => `<button data-k="${k}" class="${/[÷×−+=]/.test(k) ? 'op' : /[C±%⌫]/.test(k) ? 'fn' : ''}${k === '=' ? ' eq' : ''}">${k}</button>`).join('')}</div>`;
      const out = body.querySelector('.calc-out'), exprEl = body.querySelector('.calc-expr');
      let cur = '0', acc = null, op = null, fresh = false;
      const ops = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };
      const paint = () => {
        out.textContent = cur;
        out.style.fontSize = cur.length > 12 ? '24px' : cur.length > 9 ? '32px' : '';
        body.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('lit', b.dataset.k === op && fresh));
      };
      function press(k) {
        if (cur === 'Error' && k !== 'C') { cur = '0'; acc = null; op = null; }
        if (/\d/.test(k)) { cur = fresh || cur === '0' ? k : cur.length < 16 ? cur + k : cur; fresh = false; }
        else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
        else if (k === 'C') { cur = '0'; acc = null; op = null; fresh = false; exprEl.textContent = ''; }
        else if (k === '⌫') { if (!fresh) cur = cur.length > 1 && !(cur.length === 2 && cur[0] === '-') ? cur.slice(0, -1) : '0'; }
        else if (k === '±') { if (cur !== '0') cur = cur[0] === '-' ? cur.slice(1) : '-' + cur; }
        else if (k === '%') { const v = parseFloat(cur); cur = niceNum(acc !== null && (op === '+' || op === '−') ? acc * v / 100 : v / 100); }
        else if (ops[k]) {
          if (op && !fresh) { acc = ops[op](acc, parseFloat(cur)); cur = niceNum(acc); }
          else acc = parseFloat(cur);
          op = k; fresh = true; exprEl.textContent = `${niceNum(acc)} ${k}`;
        } else if (k === '=' && op) {
          const b = parseFloat(cur);
          exprEl.textContent = `${niceNum(acc)} ${op} ${niceNum(b)} =`;
          cur = niceNum(ops[op](acc, b)); acc = null; op = null; fresh = true;
        }
        paint();
      }
      body.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { press(b.dataset.k); restart(b, 'tap'); } });
      const keymap = { '*': '×', '/': '÷', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', Delete: 'C', '%': '%', '.': '.', ',': '.' };
      w.on(document, 'keydown', e => {
        if (!w.active() || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = /^\d$/.test(e.key) ? e.key : keymap[e.key];
        if (!k) return;
        e.preventDefault(); press(k);
        const b = body.querySelector(`[data-k="${CSS.escape(k)}"]`); if (b) restart(b, 'tap');
      });
      paint();
    },
  };

  /* ═══════════ Notes ═══════════ */
  APPS.notes = {
    name: 'Notes', icon: 'i-note', tint: '#facc15', w: 640, h: 440, minW: 380, minH: 260,
    mount(body) {
      body.classList.add('ap-notes');
      let notes = store.get('uos-notes', []) || [];
      if (!notes.length) notes = [{ id: Date.now().toString(36), text: '', t: Date.now() }];
      let cur = notes[0].id, timer = 0;
      body.innerHTML = `
        <aside class="nt-side"><div class="nt-tools"><button class="btn sm" data-n="new">${svg('i-plus')}New</button></div><div class="nt-list"></div></aside>
        <div class="nt-main">
          <textarea class="nt-text" spellcheck="true" placeholder="Start typing. Notes save by themselves${window.social?.state?.me ? ' and follow your account' : ''}."></textarea>
          <footer class="nt-foot"><span class="nt-count"></span><span class="grow"></span>
            <button class="link-btn" data-n="save">Download .txt</button><button class="link-btn danger" data-n="del">Delete</button></footer>
        </div>`;
      const list = body.querySelector('.nt-list'), ta = body.querySelector('.nt-text'), count = body.querySelector('.nt-count');
      const title = n => (n.text.split('\n').find(l => l.trim()) || 'New note').trim().slice(0, 40);
      const save = () => { store.set('uos-notes', notes.filter(n => n.text.trim() || n.id === cur)); };
      function paintList() {
        notes.sort((a, b) => b.t - a.t);
        list.innerHTML = notes.map(n => `<button class="nt-item${n.id === cur ? ' on' : ''}" data-id="${n.id}"><b>${esc(title(n))}</b><small>${new Date(n.t).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${esc(n.text.replace(/\s+/g, ' ').slice(title(n).length, 60).trim() || 'No more text')}</small></button>`).join('');
      }
      function show(id) { cur = id; const n = notes.find(x => x.id === id); ta.value = n.text; paintList(); paintCount(); ta.focus(); }
      const paintCount = () => { const t = ta.value; count.textContent = `${t.trim() ? t.trim().split(/\s+/).length : 0} words · ${t.length} characters`; };
      ta.addEventListener('input', () => {
        const n = notes.find(x => x.id === cur); n.text = ta.value; n.t = Date.now();
        paintCount(); clearTimeout(timer); timer = setTimeout(() => { save(); paintList(); }, 400);
      });
      body.addEventListener('click', async e => {
        const it = e.target.closest('.nt-item'); if (it) return show(it.dataset.id);
        const b = e.target.closest('[data-n]'); if (!b) return;
        if (b.dataset.n === 'new') { const n = { id: Date.now().toString(36), text: '', t: Date.now() }; notes.unshift(n); show(n.id); sfx.tick(); }
        if (b.dataset.n === 'save') { const n = notes.find(x => x.id === cur); download(title(n).replace(/[^\w -]+/g, '') + '.txt', URL.createObjectURL(new Blob([n.text], { type: 'text/plain' }))); }
        if (b.dataset.n === 'del') {
          const n = notes.find(x => x.id === cur);
          if (n.text.trim() && !(await ui.confirm({ title: 'Delete this note?', message: `"${title(n)}" will be gone for good.`, confirmText: 'Delete', danger: true }))) return;
          notes = notes.filter(x => x !== n);
          if (!notes.length) notes = [{ id: Date.now().toString(36), text: '', t: Date.now() }];
          save(); show(notes[0].id);
        }
      });
      show(cur);
      return () => { clearTimeout(timer); save(); };
    },
  };

  /* ═══════════ Paint ═══════════ */
  APPS.paint = {
    name: 'Paint', icon: 'i-paint', tint: '#ec4899', w: 760, h: 520, minW: 420, minH: 320,
    mount(body, w) {
      body.classList.add('ap-paint');
      const COLORS = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#9ca3af'];
      body.innerHTML = `
        <div class="pt-tools">
          <div class="pt-group">${['brush', 'eraser', 'fill'].map((t, i) => `<button class="pt-tool${i ? '' : ' on'}" data-tool="${t}" title="${t[0].toUpperCase() + t.slice(1)}">${{ brush: '✎', eraser: '⌫', fill: '◧' }[t]}</button>`).join('')}</div>
          <div class="pt-group">${[3, 8, 18, 36].map((s, i) => `<button class="pt-size${i === 1 ? ' on' : ''}" data-size="${s}" title="${s}px"><i style="width:${Math.min(18, s / 2 + 2)}px;height:${Math.min(18, s / 2 + 2)}px"></i></button>`).join('')}</div>
          <div class="pt-colors">${COLORS.map((c, i) => `<button class="pt-color${i ? '' : ' on'}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}<label class="pt-custom" title="Pick any color"><input type="color" value="#b9a3ff"></label></div>
          <span class="grow"></span>
          <button class="btn sm" data-p="undo" title="Undo (Ctrl+Z)">Undo</button>
          <button class="btn sm" data-p="clear">Clear</button>
          <button class="btn sm primary" data-p="save">Save PNG</button>
        </div>
        <div class="pt-stage"><canvas></canvas></div>`;
      const stage = body.querySelector('.pt-stage'), cv = body.querySelector('canvas'), c = cv.getContext('2d', { willReadFrequently: true });
      let tool = 'brush', size = 8, color = '#111111', drawing = false, last = null, ready = false;
      const undo = [];
      const snapshot = () => { undo.push(c.getImageData(0, 0, cv.width, cv.height)); if (undo.length > 25) undo.shift(); };
      function fit() {
        const r = stage.getBoundingClientRect(), nw = Math.max(50, Math.floor(r.width)), nh = Math.max(50, Math.floor(r.height));
        if (cv.width === nw && cv.height === nh) return;
        const old = ready ? c.getImageData(0, 0, cv.width, cv.height) : null; // keep the drawing when the window resizes
        cv.width = nw; cv.height = nh;
        c.fillStyle = '#fff'; c.fillRect(0, 0, nw, nh);
        if (old) c.putImageData(old, 0, 0);
        ready = true;
      }
      w.onResize = fit;
      requestAnimationFrame(fit);
      const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      function line(a, b) {
        c.strokeStyle = tool === 'eraser' ? '#ffffff' : color; c.lineWidth = size; c.lineCap = c.lineJoin = 'round';
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
      function fill(x, y) {
        x = Math.floor(x); y = Math.floor(y);
        const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data, W = cv.width, H = cv.height;
        const at = (px, py) => (py * W + px) * 4, t = at(x, y), target = [d[t], d[t + 1], d[t + 2]];
        const n = parseInt(color.slice(1), 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
        if (target.every((v, i) => Math.abs(v - rgb[i]) < 3)) return;
        const same = i => Math.abs(d[i] - target[0]) < 40 && Math.abs(d[i + 1] - target[1]) < 40 && Math.abs(d[i + 2] - target[2]) < 40;
        const stack = [[x, y]];
        while (stack.length) {
          let [px, py] = stack.pop();
          while (py >= 0 && same(at(px, py))) py--;
          py++;
          let left = false, right = false;
          while (py < H && same(at(px, py))) {
            const i = at(px, py); d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
            if (px > 0) { const s = same(at(px - 1, py)); if (s && !left) { stack.push([px - 1, py]); left = true; } else if (!s) left = false; }
            if (px < W - 1) { const s = same(at(px + 1, py)); if (s && !right) { stack.push([px + 1, py]); right = true; } else if (!s) right = false; }
            py++;
          }
        }
        c.putImageData(img, 0, 0);
      }
      cv.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        snapshot();
        const p = pos(e);
        if (tool === 'fill') return fill(p.x, p.y);
        drawing = true; last = p; cv.setPointerCapture(e.pointerId); line(p, { x: p.x + 0.01, y: p.y });
      });
      cv.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); line(last, p); last = p; });
      const stop = () => { drawing = false; };
      cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
      body.addEventListener('click', e => {
        const t = e.target.closest('[data-tool]'), s = e.target.closest('[data-size]'), col = e.target.closest('[data-color]'), a = e.target.closest('[data-p]');
        const pick = (sel, el) => { body.querySelectorAll(sel).forEach(x => x.classList.toggle('on', x === el)); };
        if (t) { tool = t.dataset.tool; pick('[data-tool]', t); }
        if (s) { size = +s.dataset.size; pick('[data-size]', s); }
        if (col) { color = col.dataset.color; pick('[data-color]', col); if (tool === 'eraser') { tool = 'brush'; pick('[data-tool]', body.querySelector('[data-tool="brush"]')); } }
        if (a?.dataset.p === 'clear') { snapshot(); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); }
        if (a?.dataset.p === 'undo' && undo.length) c.putImageData(undo.pop(), 0, 0);
        if (a?.dataset.p === 'save') download('painting.png', cv.toDataURL('image/png'));
      });
      body.querySelector('input[type=color]').addEventListener('input', e => { color = e.target.value; body.querySelectorAll('[data-color]').forEach(x => x.classList.remove('on')); });
      w.on(document, 'keydown', e => { if (w.active() && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undo.length) { e.preventDefault(); c.putImageData(undo.pop(), 0, 0); } });
    },
  };

  /* ═══════════ Clock (clock, stopwatch, timer) ═══════════ */
  APPS.clock = {
    name: 'Clock', icon: 'i-clockapp', tint: '#38bdf8', w: 420, h: 470, minW: 320, minH: 380,
    mount(body) {
      body.classList.add('ap-clock');
      const ZONES = [['New York', 'America/New_York'], ['London', 'Europe/London'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney']];
      body.innerHTML = `
        <div class="seg ck-tabs"><button data-tab="clock" aria-pressed="true">Clock</button><button data-tab="stop" aria-pressed="false">Stopwatch</button><button data-tab="timer" aria-pressed="false">Timer</button></div>
        <div class="ck-pane" data-pane="clock">
          <svg class="ck-face" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" class="rim"/>${Array.from({ length: 12 }, (_, i) => `<line x1="100" y1="${i % 3 ? 16 : 13}" x2="100" y2="${i % 3 ? 24 : 30}" transform="rotate(${i * 30} 100 100)" class="tick${i % 3 ? '' : ' big'}"/>`).join('')}
            <line class="hh" x1="100" y1="100" x2="100" y2="56"/><line class="mh" x1="100" y1="100" x2="100" y2="34"/><line class="sh" x1="100" y1="112" x2="100" y2="26"/><circle cx="100" cy="100" r="4" class="pin"/></svg>
          <b class="ck-time"></b><span class="ck-date"></span>
          <div class="ck-zones">${ZONES.map(([n, tz]) => `<div><small>${n}</small><b data-tz="${tz}"></b></div>`).join('')}</div>
        </div>
        <div class="ck-pane" data-pane="stop" hidden>
          <b class="ck-big" id="sw-time">00:00.00</b>
          <div class="ck-btns"><button class="btn" data-sw="lap" disabled>Lap</button><button class="btn primary" data-sw="go">Start</button><button class="btn" data-sw="reset" disabled>Reset</button></div>
          <ol class="ck-laps"></ol>
        </div>
        <div class="ck-pane" data-pane="timer" hidden>
          <b class="ck-big" id="tm-time">05:00</b>
          <div class="ck-presets">${[1, 3, 5, 10, 15, 25].map(m => `<button class="chip" data-min="${m}">${m} min</button>`).join('')}</div>
          <div class="ck-custom"><input class="field" type="number" min="0" max="599" value="5" aria-label="Minutes"><span>min</span><input class="field" type="number" min="0" max="59" value="0" aria-label="Seconds"><span>sec</span></div>
          <div class="ck-btns"><button class="btn primary" data-tm="go">Start</button><button class="btn" data-tm="reset">Reset</button></div>
        </div>`;
      const $$ = s => body.querySelector(s);
      // clock
      function tickClock() {
        const n = new Date(), s = n.getSeconds() + n.getMilliseconds() / 1000, m = n.getMinutes() + s / 60, hr = (n.getHours() % 12) + m / 60;
        $$('.hh').setAttribute('transform', `rotate(${hr * 30} 100 100)`);
        $$('.mh').setAttribute('transform', `rotate(${m * 6} 100 100)`);
        $$('.sh').setAttribute('transform', `rotate(${s * 6} 100 100)`);
        $$('.ck-time').textContent = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        $$('.ck-date').textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        body.querySelectorAll('[data-tz]').forEach(b => { try { b.textContent = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: b.dataset.tz }); } catch {} });
      }
      // stopwatch
      let swStart = 0, swAcc = 0, swRun = false; const laps = [];
      const swNow = () => swAcc + (swRun ? performance.now() - swStart : 0);
      // timer
      let tmLen = 300000, tmLeft = 300000, tmEnd = 0, tmRun = false, ringing = 0;
      const tmPaint = () => { const s = Math.ceil(tmLeft / 1000); $$('#tm-time').textContent = `${s >= 3600 ? Math.floor(s / 3600) + ':' : ''}${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
      const loop = setInterval(() => {
        if (!$$('[data-pane="clock"]').hidden) tickClock();
        if (swRun) $$('#sw-time').textContent = fmtMs(swNow());
        if (tmRun) {
          tmLeft = tmEnd - performance.now();
          if (tmLeft <= 0) {
            tmLeft = 0; tmRun = false; $$('[data-tm="go"]').textContent = 'Start';
            toast('⏰ Timer done', 'ok');
            let k = 0; clearInterval(ringing); ringing = setInterval(() => { sfx.chime(); if (++k >= 4) clearInterval(ringing); }, 700);
            $$('#tm-time').classList.add('ring');
          }
          tmPaint();
        }
      }, 50);
      tickClock(); tmPaint();
      body.addEventListener('click', e => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { body.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', b === tab)); body.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== tab.dataset.tab; }); sfx.tick(); return; }
        const sw = e.target.closest('[data-sw]')?.dataset.sw;
        if (sw === 'go') { if (swRun) { swAcc = swNow(); swRun = false; } else { swStart = performance.now(); swRun = true; } }
        if (sw === 'lap' && swRun) { laps.unshift(swNow()); }
        if (sw === 'reset') { swRun = false; swAcc = 0; laps.length = 0; $$('#sw-time').textContent = fmtMs(0); }
        if (sw) {
          $$('[data-sw="go"]').textContent = swRun ? 'Stop' : swAcc ? 'Resume' : 'Start';
          $$('[data-sw="lap"]').disabled = !swRun; $$('[data-sw="reset"]').disabled = swRun || !swAcc;
          $$('.ck-laps').innerHTML = laps.map((t, i) => `<li><span>Lap ${laps.length - i}</span><b>${fmtMs(t - (laps[i + 1] || 0))}</b><small>${fmtMs(t)}</small></li>`).join('');
        }
        const min = e.target.closest('[data-min]');
        if (min) { const [mi, se] = body.querySelectorAll('.ck-custom input'); mi.value = min.dataset.min; se.value = 0; }
        const tm = e.target.closest('[data-tm]')?.dataset.tm;
        if (min || tm === 'reset') { tmRun = false; const [mi, se] = body.querySelectorAll('.ck-custom input'); tmLen = tmLeft = (clamp(+mi.value || 0, 0, 599) * 60 + clamp(+se.value || 0, 0, 59)) * 1000; $$('[data-tm="go"]').textContent = 'Start'; $$('#tm-time').classList.remove('ring'); tmPaint(); }
        if (tm === 'go') {
          $$('#tm-time').classList.remove('ring');
          if (tmRun) { tmRun = false; tmLeft = tmEnd - performance.now(); }
          else { if (tmLeft <= 0) tmLeft = tmLen; if (tmLeft > 0) { tmEnd = performance.now() + tmLeft; tmRun = true; } }
          $$('[data-tm="go"]').textContent = tmRun ? 'Pause' : 'Start';
        }
      });
      body.querySelectorAll('.ck-custom input').forEach(i => i.addEventListener('change', () => body.querySelector('[data-tm="reset"]').click()));
      return () => { clearInterval(loop); clearInterval(ringing); };
    },
  };

  /* ═══════════ Calendar ═══════════ */
  APPS.calendar = {
    name: 'Calendar', icon: 'i-cal', tint: '#ef4444', w: 640, h: 470, minW: 420, minH: 360,
    mount(body) {
      body.classList.add('ap-cal');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let view = new Date(today.getFullYear(), today.getMonth(), 1), sel = new Date(today);
      const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const events = () => store.get('uos-calendar', {}) || {};
      body.innerHTML = `
        <div class="cal-main">
          <header class="cal-head"><b class="cal-title"></b><span class="grow"></span>
            <button class="icon-btn" data-c="prev" aria-label="Previous month">‹</button><button class="btn sm" data-c="today">Today</button><button class="icon-btn" data-c="next" aria-label="Next month">›</button></header>
          <div class="cal-dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<span>${d}</span>`).join('')}</div>
          <div class="cal-grid"></div>
        </div>
        <aside class="cal-side"><b class="cal-day"></b><ul class="cal-events"></ul>
          <form class="cal-add"><input class="field" maxlength="120" placeholder="Add an event or reminder"><button class="btn sm primary">Add</button></form></aside>`;
      const $$ = s => body.querySelector(s);
      function paint() {
        const ev = events();
        $$('.cal-title').textContent = view.toLocaleDateString([], { month: 'long', year: 'numeric' });
        const first = new Date(view), start = new Date(first); start.setDate(1 - first.getDay());
        let html = '';
        for (let i = 0; i < 42; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i);
          const k = key(d), n = (ev[k] || []).length;
          html += `<button class="cal-cell${d.getMonth() !== view.getMonth() ? ' out' : ''}${+d === +today ? ' today' : ''}${+d === +sel ? ' sel' : ''}" data-d="${k}"><span>${d.getDate()}</span>${n ? `<i>${'•'.repeat(Math.min(3, n))}</i>` : ''}</button>`;
        }
        $$('.cal-grid').innerHTML = html;
        $$('.cal-day').textContent = sel.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
        const list = ev[key(sel)] || [];
        $$('.cal-events').innerHTML = list.length ? list.map((t, i) => `<li><span>${esc(t)}</span><button class="icon-btn" data-del="${i}" aria-label="Remove">${svg('i-x')}</button></li>`).join('') : '<li class="none">Nothing planned.</li>';
      }
      body.addEventListener('click', e => {
        const cell = e.target.closest('[data-d]');
        if (cell) { const [y, m, d] = cell.dataset.d.split('-').map(Number); sel = new Date(y, m - 1, d); if (sel.getMonth() !== view.getMonth()) view = new Date(y, m - 1, 1); paint(); return; }
        const c = e.target.closest('[data-c]')?.dataset.c;
        if (c === 'prev') view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
        if (c === 'next') view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
        if (c === 'today') { view = new Date(today.getFullYear(), today.getMonth(), 1); sel = new Date(today); }
        const del = e.target.closest('[data-del]');
        if (del) { const ev = events(), k = key(sel); ev[k].splice(+del.dataset.del, 1); if (!ev[k].length) delete ev[k]; store.set('uos-calendar', ev); }
        if (c || del) paint();
      });
      $$('.cal-add').addEventListener('submit', e => {
        e.preventDefault();
        const inp = e.target.querySelector('input'), t = inp.value.trim(); if (!t) return;
        const ev = events(), k = key(sel); (ev[k] = ev[k] || []).push(t); store.set('uos-calendar', ev);
        inp.value = ''; paint(); sfx.pop();
      });
      paint();
    },
  };

  /* ═══════════ Mines ═══════════ */
  APPS.mines = {
    name: 'Mines', icon: 'i-mines', tint: '#64748b', w: 330, h: 440, minW: 300, minH: 400,
    mount(body, w) {
      body.classList.add('ap-mines');
      const LEVELS = { easy: [9, 9, 10], medium: [16, 16, 40], hard: [30, 16, 99] };
      let level = 'easy', cols, rows, mines, grid, state, flags, opened, t0, timer = 0;
      body.innerHTML = `
        <header class="mn-head"><output class="mn-count">010</output><button class="mn-face" title="New game">🙂</button><output class="mn-time">000</output></header>
        <div class="seg mn-levels">${Object.keys(LEVELS).map(l => `<button data-lv="${l}" aria-pressed="${l === level}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>
        <div class="mn-board"></div>
        <p class="mn-hint">Click to dig. Right click to flag.</p>`;
      const board = body.querySelector('.mn-board'), face = body.querySelector('.mn-face');
      const cnt = body.querySelector('.mn-count'), clk = body.querySelector('.mn-time');
      const d3 = n => String(clamp(n, -99, 999)).padStart(3, '0');
      function reset() {
        [cols, rows, mines] = LEVELS[level];
        grid = Array.from({ length: cols * rows }, () => ({ mine: false, n: 0, open: false, flag: false }));
        state = 'ready'; flags = 0; opened = 0; clearInterval(timer); clk.textContent = '000'; face.textContent = '🙂';
        board.style.gridTemplateColumns = `repeat(${cols}, 26px)`;
        board.innerHTML = grid.map((_, i) => `<button class="mn-cell" data-i="${i}"></button>`).join('');
        cnt.textContent = d3(mines);
        w.resizeTo(cols * 26 + 46, rows * 26 + 170);
      }
      const nbrs = i => { const x = i % cols, y = Math.floor(i / cols), out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx); } return out; };
      function plant(safe) {
        const banned = new Set([safe, ...nbrs(safe)]);
        let placed = 0;
        while (placed < mines) { const i = Math.floor(Math.random() * grid.length); if (!grid[i].mine && !banned.has(i)) { grid[i].mine = true; placed++; } }
        grid.forEach((c, i) => { c.n = nbrs(i).filter(j => grid[j].mine).length; });
        state = 'play'; t0 = Date.now();
        timer = setInterval(() => { clk.textContent = d3(Math.floor((Date.now() - t0) / 1000)); }, 250);
      }
      function paintCell(i) {
        const c = grid[i], el = board.children[i];
        el.className = 'mn-cell' + (c.open ? ' open' : '') + (c.flag ? ' flag' : '') + (c.open && c.mine ? ' boom' : '');
        el.textContent = c.flag && !c.open ? '⚑' : c.open ? (c.mine ? '✹' : c.n || '') : '';
        if (c.open && c.n && !c.mine) el.dataset.n = c.n;
      }
      function dig(i) {
        const c = grid[i]; if (c.open || c.flag) return;
        if (state === 'ready') plant(i);
        if (c.mine) {
          state = 'lost'; clearInterval(timer); face.textContent = '😵';
          grid.forEach((g, j) => { if (g.mine) { g.open = true; paintCell(j); } else if (g.flag) board.children[j].classList.add('wrong'); });
          board.children[i].classList.add('hit'); sfx.error();
          return;
        }
        const stack = [i];
        while (stack.length) {
          const j = stack.pop(), g = grid[j]; if (g.open || g.flag) continue;
          g.open = true; opened++; paintCell(j);
          if (!g.n) stack.push(...nbrs(j));
        }
        if (opened === grid.length - mines) { state = 'won'; clearInterval(timer); face.textContent = '😎'; grid.forEach((g, j) => { if (g.mine && !g.flag) { g.flag = true; paintCell(j); } }); cnt.textContent = '000'; sfx.chime(); toast(`Cleared ${level} in ${Math.floor((Date.now() - t0) / 1000)}s`, 'ok'); }
      }
      // Click a number with the right count of flags around it to open the rest.
      function chord(i) {
        const c = grid[i]; if (!c.open || !c.n) return;
        const ns = nbrs(i); if (ns.filter(j => grid[j].flag).length === c.n) ns.forEach(dig);
      }
      board.addEventListener('click', e => { const el = e.target.closest('[data-i]'); if (!el || state === 'won' || state === 'lost') return; const i = +el.dataset.i; grid[i].open ? chord(i) : dig(i); });
      board.addEventListener('contextmenu', e => {
        e.preventDefault();
        const el = e.target.closest('[data-i]'); if (!el || state === 'won' || state === 'lost') return;
        const c = grid[+el.dataset.i]; if (c.open) return;
        c.flag = !c.flag; flags += c.flag ? 1 : -1; cnt.textContent = d3(mines - flags); paintCell(+el.dataset.i); sfx.tick();
      });
      board.addEventListener('pointerdown', e => { if (e.button === 0 && e.target.closest('[data-i]') && state !== 'won' && state !== 'lost') face.textContent = '😮'; });
      w.on(window, 'pointerup', () => { if (state === 'play' || state === 'ready') face.textContent = '🙂'; });
      face.addEventListener('click', reset);
      body.querySelector('.mn-levels').addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (!b) return; level = b.dataset.lv; body.querySelectorAll('[data-lv]').forEach(x => x.setAttribute('aria-pressed', x === b)); reset(); });
      reset();
      return () => clearInterval(timer);
    },
  };

  /* ═══════════ Terminal ═══════════ */
  APPS.terminal = {
    name: 'Terminal', icon: 'i-term', tint: '#22c55e', w: 640, h: 400, minW: 360, minH: 220,
    mount(body, w) {
      body.classList.add('ap-term');
      body.innerHTML = `<div class="tm-out"></div><form class="tm-line"><span class="tm-ps"></span><input spellcheck="false" autocomplete="off" aria-label="Command"></form>`;
      const out = body.querySelector('.tm-out'), form = body.querySelector('form'), inp = form.querySelector('input'), ps = body.querySelector('.tm-ps');
      const who = () => window.social?.state?.me?.username || 'guest';
      const prompt = () => `${who()}@universium:~$`;
      ps.textContent = prompt();
      const hist = []; let hi = 0;
      const print = (html, cls = '') => { const d = document.createElement('div'); d.className = 'tm-row ' + cls; d.innerHTML = html; out.appendChild(d); out.scrollTop = out.scrollHeight; };
      const allApps = () => (window.desktop?.apps?.() || []);
      const started = performance.now();
      const CMDS = {
        help: () => print([
          ['help', 'show this list'], ['open <name>', 'open an app, a game, or a website'], ['apps', 'list apps'], ['games', 'list games'],
          ['calc <math>', 'do some math, like calc (2+3)*4^2'], ['echo <text>', 'print text'], ['date', 'today’s date and time'],
          ['whoami', 'who you’re signed in as'], ['neofetch', 'system info'], ['history', 'commands you ran'], ['clear', 'clear the screen'], ['exit', 'close the terminal'],
        ].map(([c, d]) => `<span class="k">${esc(c)}</span>${'&nbsp;'.repeat(Math.max(1, 16 - c.length))}${esc(d)}`).join('<br>')),
        clear: () => { out.innerHTML = ''; },
        exit: () => close(w),
        date: () => print(esc(new Date().toString())),
        whoami: () => print(esc(who())),
        echo: a => print(esc(a)),
        history: () => print(hist.map((h2, i) => `${String(i + 1).padStart(3)}  ${esc(h2)}`).join('<br>') || 'empty'),
        apps: () => print(allApps().map(a => `<span class="k">${esc(a.id)}</span> ${esc(a.name)}`).join('<br>')),
        games: () => print([...GAMES, ...(app.extras || [])].map(g => esc(g.name)).join(' · ')),
        calc: a => { try { print(`= <span class="k">${niceNum(calcExpr(a))}</span>`); } catch { print('calc: that doesn’t look like math', 'err'); } },
        sudo: () => print('nice try', 'err'),
        open: a => {
          const q = a.trim().toLowerCase(); if (!q) return print('usage: open &lt;app, game or website&gt;', 'err');
          const ap = allApps().find(x => x.id === q || x.name.toLowerCase() === q) || allApps().find(x => x.name.toLowerCase().startsWith(q));
          if (ap) { print(`opening ${esc(ap.name)}…`); return window.desktop.open(ap.id); }
          const games = [...GAMES, ...(app.extras || [])];
          const g = games.find(x => x.name.toLowerCase() === q) || games.find(x => x.name.toLowerCase().includes(q));
          if (g) { print(`launching ${esc(g.name)}…`); return launchGame(g); }
          print(`going to ${esc(a)}…`); go(a);
        },
        neofetch: async () => {
          let ver = '?'; try { ver = (await (await fetch('/api/health')).json()).version; } catch {}
          const up = Math.floor((performance.now() - started) / 1000);
          const art = ['   .--.   ', '  / .. \\  ', ' (  \\/  ) ', '  \\    /  ', "   `--'   "];
          const info = [`<span class="k">${esc(who())}</span>@universium`, `version  ${esc(ver)}`, `games    ${GAMES.length + (app.extras?.length || 0)}`, `screen   ${screen.width}×${screen.height}`, `uptime   ${Math.floor(up / 60)}m ${up % 60}s`];
          print(art.map((l, i) => `<span class="k">${esc(l)}</span>  ${info[i] || ''}`).join('<br>'));
        },
      };
      print('Universium terminal. Type <span class="k">help</span> to see what it can do.', 'dim');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const line = inp.value; inp.value = '';
        print(`<span class="tm-ps">${esc(prompt())}</span> ${esc(line)}`);
        if (!line.trim()) return;
        hist.push(line); hi = hist.length;
        const [cmd, ...rest] = line.trim().split(/\s+/), arg = line.trim().slice(cmd.length).trim();
        const f = CMDS[cmd.toLowerCase()];
        if (f) f(arg, rest); else print(`${esc(cmd)}: command not found. Try <span class="k">help</span>.`, 'err');
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp' && hi > 0) { inp.value = hist[--hi]; e.preventDefault(); }
        if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] || ''; e.preventDefault(); }
        if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.innerHTML = ''; }
      });
      body.addEventListener('click', () => { if (!getSelection().toString()) inp.focus(); });
      setTimeout(() => inp.focus(), 50);
    },
  };

  /* ═══════════ Task Manager ═══════════ */
  APPS.tasks = {
    name: 'Task Manager', icon: 'i-tasks', tint: '#a78bfa', w: 520, h: 420, minW: 380, minH: 280,
    mount(body) {
      body.classList.add('ap-tasks');
      body.innerHTML = `
        <div class="tk-stats"><div><small>FPS</small><b id="tk-fps">–</b></div><div><small>Memory</small><b id="tk-mem">–</b></div><div><small>Windows</small><b id="tk-n">–</b></div><div><small>Open for</small><b id="tk-up">–</b></div></div>
        <div class="tk-head"><span>Name</span><span>Type</span><span></span></div>
        <div class="tk-list"></div>`;
      let frames = 0, last = performance.now(), raf = 0;
      const count = () => { frames++; raf = requestAnimationFrame(count); };
      raf = requestAnimationFrame(count);
      const opened = performance.timeOrigin || Date.now() - performance.now();
      function rows() {
        const r = [];
        app.tabs.forEach(t => r.push({ key: 't:' + t.id, name: t.title || 'New tab', type: 'Browser tab', img: t.fav, icon: 'i-globe' }));
        if (app.active.startsWith('game-')) r.push({ key: 'g:' + app.active, name: document.querySelector('.fslot.active .player-title')?.firstChild?.textContent || 'Game', type: 'Game', icon: 'i-games' });
        for (const x of wins.values()) r.push({ key: 'w:' + x.id, name: x.def.name, type: x.min ? 'App (minimized)' : 'App', icon: x.def.icon });
        return r;
      }
      function paint() {
        const now = performance.now();
        body.querySelector('#tk-fps').textContent = Math.round(frames * 1000 / (now - last)); frames = 0; last = now;
        const mem = performance.memory?.usedJSHeapSize;
        body.querySelector('#tk-mem').textContent = mem ? (mem / 1048576).toFixed(0) + ' MB' : 'n/a';
        const r = rows();
        body.querySelector('#tk-n').textContent = r.length;
        const up = Math.floor((Date.now() - opened) / 1000);
        body.querySelector('#tk-up').textContent = up >= 3600 ? `${Math.floor(up / 3600)}h ${Math.floor(up / 60) % 60}m` : `${Math.floor(up / 60)}m ${up % 60}s`;
        body.querySelector('.tk-list').innerHTML = r.length ? r.map(x => `<div class="tk-row"><span class="tk-name">${x.img ? `<img src="${esc(x.img)}" alt="" onerror="this.remove()">` : svg(x.icon)}<b>${esc(x.name)}</b></span><span>${x.type}</span><button class="btn sm" data-end="${esc(x.key)}">End task</button></div>`).join('') : '<p class="tk-empty">Nothing else is running.</p>';
      }
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-end]'); if (!b) return;
        const [kind, ...rest] = b.dataset.end.split(':'), id = rest.join(':');
        if (kind === 't') closeTab(id);
        if (kind === 'g') { const f = document.querySelector(`#slot-${CSS.escape(id)} iframe`); if (f) stopFrame(f); goHome(); }
        if (kind === 'w') close(wins.get(id));
        setTimeout(paint, 220);
      });
      paint();
      const loop = setInterval(paint, 1000);
      return () => { clearInterval(loop); cancelAnimationFrame(raf); };
    },
  };

  return {
    open, toggle, apps: APPS,
    list: () => [...wins.values()].map(w => ({ id: w.id, name: w.def.name, icon: w.def.icon, min: w.min, active: w.active() })),
    minimizeAll: () => { for (const w of wins.values()) if (!w.min) minimize(w); },
  };
})();
