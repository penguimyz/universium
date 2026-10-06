/* Snip & solve: drag a box over a problem on the page you have open, and the AI
   (a vision model on the AI PC, via /api/ai/vision) reads it and shows the answer with
   the steps. Follow-up questions work in the same panel. It only shows answers; it never
   types into or clicks anything on the page.

   Capturing: the page is redrawn with html2canvas (no prompt, works for normal pages).
   If the area has something html2canvas can't draw (another frame, a canvas/game, a video),
   or the picture comes out blank, it falls back to the browser's screen capture, which
   asks once per snip ("Share this tab") and gets exact pixels.
   Uses helpers from app.js ($, esc, svg, toast, sfx, activeFrame, frameDoc, viewKind, app). */
window.snip = (() => {
  // Served from this site (school networks often block CDNs). Loaded the first time they're needed.
  const H2C = '/vendor/html2canvas.min.js';
  const KATEX = '/vendor/katex/';
  const MAX_SIDE = 1600;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const loadScript = src => new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load " + src.split('/').pop()));
    document.head.appendChild(s);
  });
  let h2cP = null, katexP = null;
  const needH2C = () => (h2cP ||= loadScript(H2C).catch(e => { h2cP = null; throw e; }));
  const needKatex = () => (katexP ||= (async () => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = KATEX + 'katex.min.css'; document.head.appendChild(l);
    await loadScript(KATEX + 'katex.min.js');
    await loadScript(KATEX + 'contrib/auto-render.min.js');
  })().catch(() => { katexP = null; }));

  let layer = null, panel = null, controller = null;
  let messages = [], shot = null;

  /* ═══════════ Selecting an area ═══════════ */
  function start() {
    if (layer) return cancel();
    const f = activeFrame();
    if (!f || !['tab', 'game'].includes(viewKind(app.active)) || !f.src || f.src.endsWith('about:blank')) {
      toast('Open a site first, then snip the problem on it');
      return;
    }
    hideMenus?.();
    const r = f.getBoundingClientRect();
    layer = document.createElement('div');
    layer.id = 'snip-layer';
    layer.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    layer.innerHTML = `<div class="snip-hint">${svg('i-snip')}Drag a box around the problem<kbd>Esc</kbd> to cancel</div><div class="snip-box" hidden></div>`;
    document.body.appendChild(layer);
    restart(layer, 'enter');
    sfx.open();
    const box = layer.querySelector('.snip-box');
    let sx = 0, sy = 0, dragging = false;
    layer.addEventListener('pointerdown', e => {
      if (e.button !== 0) return cancel();
      const b = layer.getBoundingClientRect();
      sx = e.clientX - b.left; sy = e.clientY - b.top; dragging = true;
      layer.setPointerCapture(e.pointerId);
      layer.classList.add('dragging');
      Object.assign(box.style, { left: sx + 'px', top: sy + 'px', width: '0px', height: '0px' }); box.hidden = false;
    });
    layer.addEventListener('pointermove', e => {
      if (!dragging) return;
      const b = layer.getBoundingClientRect();
      const x = clamp(e.clientX - b.left, 0, b.width), y = clamp(e.clientY - b.top, 0, b.height);
      Object.assign(box.style, { left: Math.min(sx, x) + 'px', top: Math.min(sy, y) + 'px', width: Math.abs(x - sx) + 'px', height: Math.abs(y - sy) + 'px' });
      box.dataset.size = `${Math.round(Math.abs(x - sx))} × ${Math.round(Math.abs(y - sy))}`;
    });
    layer.addEventListener('pointerup', e => {
      if (!dragging) return;
      dragging = false;
      const rect = { x: parseFloat(box.style.left), y: parseFloat(box.style.top), w: parseFloat(box.style.width), h: parseFloat(box.style.height) };
      if (rect.w < 14 || rect.h < 14) { toast('Drag a bigger box around the problem'); box.hidden = true; layer.classList.remove('dragging'); return; }
      cancel(true);
      solveArea(f, rect);
    });
    layer.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); });
  }
  function cancel(quiet) {
    if (!layer) return;
    layer.remove(); layer = null;
    if (!quiet) sfx.shut?.();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && layer) { e.stopPropagation(); cancel(); } }, true);

  /* ═══════════ Capturing ═══════════ */
  async function capture(f, rect) {
    const doc = frameDoc(f), win = f.contentWindow;
    let useScreen = !doc;
    if (doc) {
      // Things html2canvas can't redraw: other frames, canvases (games, graphs), video.
      const z = app.frameZoom?.[f.id] || 1;
      for (let i = 0; i <= 4 && !useScreen; i++) for (let j = 0; j <= 4; j++) {
        const el = doc.elementFromPoint((rect.x + rect.w * i / 4) / z, (rect.y + rect.h * j / 4) / z);
        if (el && /^(IFRAME|CANVAS|VIDEO|EMBED|OBJECT)$/.test(el.tagName)) { useScreen = true; break; }
      }
    }
    if (!useScreen) {
      try {
        const c = await viaDom(doc, win, rect, app.frameZoom?.[f.id] || 1);
        if (!looksBlank(c)) return c;
      } catch (e) { console.warn('[snip] html2canvas failed, using screen capture:', e); }
    }
    return viaScreen(f, rect);
  }

  async function viaDom(doc, win, rect, zoom) {
    await needH2C();
    const scale = Math.max(1.5, Math.min(2, devicePixelRatio || 1));
    const bg = getComputedStyle(doc.body).backgroundColor;
    return window.html2canvas(doc.documentElement, {
      x: win.scrollX + rect.x / zoom, y: win.scrollY + rect.y / zoom, width: rect.w / zoom, height: rect.h / zoom,
      scale, useCORS: true, logging: false, imageTimeout: 4000,
      backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff',
    });
  }

  function looksBlank(c) {
    try {
      const x = c.getContext('2d'), w = c.width, h = c.height;
      const d = x.getImageData(0, 0, w, h).data, step = Math.max(4, Math.floor(d.length / 4 / 4000)) * 4;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += step) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; if (v < min) min = v; if (v > max) max = v; }
      return max - min < 8;
    } catch { return false; }
  }

  async function viaScreen(f, rect) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("This browser can't capture this part of the page.");
    toast('Choose "this tab" and press Share so the AI can see the problem');
    const hidden = panel && !panel.hidden; if (hidden) panel.style.visibility = 'hidden';
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 5 }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
      });
    } catch (e) {
      if (hidden) panel.style.visibility = '';
      throw new Error('Screen capture was cancelled.');
    }
    const t = document.getElementById('toast');
    if (t) { t.classList.remove('show'); t.style.visibility = 'hidden'; } // keep the hint out of the picture
    try {
      const v = document.createElement('video');
      v.srcObject = stream; v.muted = true; v.playsInline = true;
      await v.play();
      await new Promise(r => setTimeout(r, 450)); // let the share prompt and hint disappear from the picture
      const vw = v.videoWidth, vh = v.videoHeight, fr = f.getBoundingClientRect();
      const k = vw / innerWidth;
      const sameTab = Math.abs(vw / vh - innerWidth / innerHeight) < 0.04;
      const c = document.createElement('canvas');
      if (sameTab) {
        c.width = Math.round(rect.w * k); c.height = Math.round(rect.h * k);
        c.getContext('2d').drawImage(v, (fr.left + rect.x) * k, (fr.top + rect.y) * k, rect.w * k, rect.h * k, 0, 0, c.width, c.height);
      } else { c.width = vw; c.height = vh; c.getContext('2d').drawImage(v, 0, 0); } // something else was shared: send all of it
      return c;
    } finally {
      stream.getTracks().forEach(tr => tr.stop());
      if (t) t.style.visibility = '';
      if (hidden) panel.style.visibility = '';
    }
  }

  function toJpeg(c) {
    let w = c.width, h = c.height;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.round(w * k); out.height = Math.round(h * k);
    const x = out.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, out.width, out.height);
    x.drawImage(c, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.9);
  }

  /* ═══════════ Panel ═══════════ */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('aside');
    panel.className = 'snip-panel'; panel.hidden = true;
    panel.innerHTML = `
      <header class="sp-head">
        <span class="sp-title">${svg('i-snip')}Solve</span>
        <button class="btn sm" data-sp="again" title="Snip something else (Alt+S)">${svg('i-snip')}New snip</button>
        <button class="icon-btn" data-sp="close" aria-label="Close" title="Close">${svg('i-x')}</button>
      </header>
      <div class="sp-scroll">
        <figure class="sp-shot" title="Click to see it bigger"><img alt="Your snip"></figure>
        <div class="sp-thread"></div>
      </div>
      <form class="sp-ask">
        <input class="field" maxlength="1000" placeholder="Ask a follow-up, like “why?” or “explain step 2”" autocomplete="off">
        <button class="btn primary sm" type="submit">${svg('i-send')}</button>
      </form>
      <p class="sp-fine">AI can make mistakes, so check the work.</p>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-sp]');
      if (b?.dataset.sp === 'close') return close();
      if (b?.dataset.sp === 'again') return start();
      if (b?.dataset.sp === 'stop') return controller?.abort();
      if (b?.dataset.sp === 'copy') {
        const txt = b.closest('.sp-msg').dataset.raw || '';
        navigator.clipboard?.writeText(txt).then(() => toast('Copied', 'ok'), () => toast("Couldn't copy", 'err'));
        return;
      }
      if (b?.dataset.sp === 'retry') return ask(null);
      if (e.target.closest('.sp-shot')) panel.querySelector('.sp-shot').classList.toggle('big');
    });
    panel.querySelector('.sp-ask').addEventListener('submit', e => {
      e.preventDefault();
      const inp = e.target.querySelector('input'), t = inp.value.trim();
      if (!t || controller) return;
      inp.value = ''; ask(t);
    });
    return panel;
  }
  function open() { ensurePanel(); if (panel.hidden) { panel.hidden = false; restart(panel, 'enter'); } }
  function close() { controller?.abort(); if (panel) panel.hidden = true; sfx.shut?.(); }

  async function solveArea(f, rect) {
    open();
    const thread = panel.querySelector('.sp-thread');
    panel.querySelector('.sp-shot').hidden = true;
    thread.innerHTML = `<div class="sp-status"><div class="spinner"></div>Capturing…</div>`;
    let c;
    try { c = await capture(f, rect); }
    catch (e) { thread.innerHTML = `<div class="sp-err"><b>Couldn't capture that.</b><span>${esc(e.message)}</span></div>`; return; }
    shot = toJpeg(c);
    const img = panel.querySelector('.sp-shot img'); img.src = shot;
    panel.querySelector('.sp-shot').hidden = false; panel.querySelector('.sp-shot').classList.remove('big');
    thread.innerHTML = '';
    messages = [{ role: 'user', content: 'Solve the problem in this screenshot. Give the answer first, then explain the steps.', images: [shot.split(',')[1]] }];
    sfx.pop?.();
    ask(null, true);
  }

  // Ask the model. text = a follow-up question; null = (re)answer the last question.
  async function ask(text, first) {
    if (controller) return;
    const thread = panel.querySelector('.sp-thread');
    if (text) {
      messages.push({ role: 'user', content: text });
      thread.insertAdjacentHTML('beforeend', `<div class="sp-q">${esc(text)}</div>`);
    } else if (!first) {
      // retry: drop the failed/last answer
      if (messages[messages.length - 1]?.role === 'assistant') messages.pop();
      thread.querySelector('.sp-msg:last-child')?.remove();
    }
    const msg = document.createElement('div');
    msg.className = 'sp-msg streaming';
    msg.innerHTML = `<div class="sp-body"><div class="sp-status"><div class="spinner"></div>${first ? 'Reading the problem…' : 'Thinking…'}</div></div>
      <div class="sp-tools"><button class="link-btn" data-sp="stop">Stop</button></div>`;
    thread.appendChild(msg);
    scroll(true);
    controller = new AbortController();
    let raw = '', paintT = 0;
    const body = msg.querySelector('.sp-body');
    const paint = () => { paintT = 0; body.innerHTML = fmt(raw) || body.innerHTML; math(body); scroll(); };
    try {
      const res = await fetch('/api/ai/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }), signal: controller.signal });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw Object.assign(new Error(d.error || (res.status === 413 ? 'That snip is too big. Try a smaller box.' : "The AI couldn't be reached.")), { hint: d.hint || d.detail });
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let o; try { o = JSON.parse(line); } catch { continue; }
          if (o.error) throw new Error(o.error);
          if (o.t) { raw += o.t; if (!paintT) paintT = setTimeout(paint, 60); }
        }
      }
      clearTimeout(paintT); paint();
      if (!raw.trim()) throw new Error('The AI sent back an empty answer.');
      messages.push({ role: 'assistant', content: raw });
      msg.dataset.raw = raw;
      msg.querySelector('.sp-tools').innerHTML = `<button class="link-btn" data-sp="copy">${svg('i-copy')}Copy</button><button class="link-btn" data-sp="retry">${svg('i-reload')}Try again</button>`;
    } catch (e) {
      clearTimeout(paintT);
      if (e.name === 'AbortError') {
        if (raw) { paint(); messages.push({ role: 'assistant', content: raw }); msg.dataset.raw = raw; }
        else body.innerHTML = '<p class="sp-dim">Stopped.</p>';
        msg.querySelector('.sp-tools').innerHTML = `<button class="link-btn" data-sp="retry">${svg('i-reload')}Try again</button>`;
      } else {
        body.innerHTML = `<div class="sp-err"><b>${esc(e.message)}</b>${e.hint ? `<code>${esc(e.hint)}</code>` : ''}</div>`;
        msg.querySelector('.sp-tools').innerHTML = `<button class="link-btn" data-sp="retry">${svg('i-reload')}Try again</button>`;
      }
    } finally {
      controller = null;
      msg.classList.remove('streaming');
      scroll();
    }
  }

  function scroll(force) {
    const s = panel.querySelector('.sp-scroll');
    if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 140) s.scrollTop = s.scrollHeight;
  }

  /* ── formatting: paragraphs, lists, **bold**, `code`; the "Answer:" line stands out; LaTeX via KaTeX ── */
  function fmt(text) {
    const inline = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    const out = []; let list = null;
    for (const line of text.replace(/\r/g, '').split('\n')) {
      const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*(\d+)[.)]\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        if (list !== tag) { if (list) out.push(`</${list}>`); out.push(tag === 'ol' ? `<ol start="${ol[1]}">` : '<ul>'); list = tag; }
        const t = ul ? ul[1] : ol[2];
        out.push(`<li${/^\**\s*answer/i.test(t) ? ' class="sp-ans"' : ''}>${inline(t)}</li>`);
        continue;
      }
      if (list) { out.push(`</${list}>`); list = null; }
      const h = line.match(/^#{1,4}\s+(.*)/);
      if (h) out.push(`<p class="h">${inline(h[1])}</p>`);
      else if (/^\s*\**\s*(final\s+)?answers?\s*:?/i.test(line)) out.push(`<p class="sp-ans">${inline(line.trim())}</p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`</${list}>`);
    return out.join('');
  }
  function math(el) {
    if (!/\\\(|\\\[|\$\$/.test(el.textContent)) return;
    needKatex().then(() => {
      try {
        window.renderMathInElement?.(el, { throwOnError: false, delimiters: [
          { left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false },
        ] });
      } catch {}
    });
  }

  return { start, cancel, close };
})();
