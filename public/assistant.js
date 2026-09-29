/* Chat assistant: multiple saved chats, settings, streaming replies.
   Chats live in this browser (localStorage). Talks to /api/ai/chat, which streams
   newline-delimited JSON: {"t": "..."} chunks, then {"done": true} or {"error": "..."}.
   Uses helpers from app.js ($, esc, svg, toast, sfx, store, cfg, saveCfg, nav, showView). */
(() => {
  const MAX_CHATS = 60;
  const SUGGESTIONS = [
    'Explain the difference between mitosis and meiosis',
    'Help me write an email asking for an extension',
    'Quiz me on the Spanish words for food',
    'Is 17 × 24 = 408?',
  ];
  cfg.ai = Object.assign({ temperature: 0.7, length: 'normal', instructions: '' }, cfg.ai || {});
  let chats = (store.get('uos-chats', []) || []).filter(c => c && Array.isArray(c.messages));
  let current = null;       // id of the open chat (null = fresh, unsaved chat)
  let controller = null;    // AbortController while a reply is streaming
  let filter = '';

  const saveChats = () => store.set('uos-chats', chats.slice(0, MAX_CHATS));
  const chat = () => chats.find(c => c.id === current);

  /* ── light formatting: paragraphs, lists, **bold**, `code` ── */
  function fmt(text) {
    const inline = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    const out = []; let list = null;
    for (const line of text.split('\n')) {
      const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
        continue;
      }
      if (list) { out.push(`</${list}>`); list = null; }
      const h = line.match(/^#{1,4}\s+(.*)/);
      if (h) out.push(`<p class="h">${inline(h[1])}</p>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
    if (list) out.push(`</${list}>`);
    return out.join('');
  }

  /* ── sidebar ── */
  function renderList() {
    const q = filter.toLowerCase();
    const list = chats.filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q)));
    const groups = {};
    const now = new Date(), day = 864e5;
    for (const c of list) {
      const age = (now - new Date(c.updated)) / day;
      const g = new Date(c.updated).toDateString() === now.toDateString() ? 'Today' : age < 2 ? 'Yesterday' : age < 7 ? 'This week' : 'Older';
      (groups[g] = groups[g] || []).push(c);
    }
    $('ai-list').innerHTML = list.length ? ['Today', 'Yesterday', 'This week', 'Older'].filter(g => groups[g]).map(g => `
      <h4>${g}</h4>
      ${groups[g].map(c => `<div class="ai-item${c.id === current ? ' active' : ''}" data-id="${c.id}" tabindex="0" role="button">
        <span class="ai-item-t">${esc(c.title)}</span>
        <button class="ai-item-b" data-rename="${c.id}" title="Rename" aria-label="Rename">${svg('i-edit')}</button>
        <button class="ai-item-b" data-del="${c.id}" title="Delete" aria-label="Delete">${svg('i-x')}</button>
      </div>`).join('')}`).join('')
      : `<p class="ai-none">${q ? 'No chats match.' : 'Your chats will show up here.'}</p>`;
  }

  /* ── conversation ── */
  function renderChat() {
    const c = chat();
    $('ai-title').textContent = c ? c.title : 'New chat';
    const box = $('ai-msgs');
    if (!c || !c.messages.length) {
      box.innerHTML = `
        <div class="chat-empty">
          <div class="ai-status" id="ai-status"></div>
          <h2>What do you need?</h2>
          <p>Good for quick questions: explaining something, checking work, or wording a message.</p>
          <div class="suggest">${SUGGESTIONS.map(s => `<button>${esc(s)}</button>`).join('')}</div>
        </div>`;
      checkAI();
      return;
    }
    box.innerHTML = c.messages.map((m, i) => msgHTML(m, i === c.messages.length - 1)).join('');
    scrollDown(true);
  }
  function msgHTML(m, isLast) {
    if (m.role === 'user') return `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`;
    return `<div class="msg bot${m.error ? ' err' : ''}"><div class="bubble">${m.error ? esc(m.content) : fmt(m.content)}</div>
      ${m.error ? '' : `<div class="msg-actions"><button data-copy title="Copy">${svg('i-copy')}Copy</button>${isLast ? `<button data-regen title="Try again">${svg('i-reload')}Try again</button>` : ''}</div>`}</div>`;
  }
  function scrollDown(force) {
    const sc = $('chat-scroll');
    if (force || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120) sc.scrollTop = sc.scrollHeight;
  }

  /* ── status (why it's offline) ── */
  async function checkAI(force) {
    const box = $('ai-status'); if (!box) return;
    if (!force && checkAI.last && Date.now() - checkAI.last.at < 20000) return paint(checkAI.last.v);
    box.className = 'ai-status checking'; box.innerHTML = '<i></i>Checking the assistant…';
    let v;
    try { v = await (await fetch('/api/ai/status', { cache: 'no-store' })).json(); }
    catch { v = { ok: false, message: "Couldn't reach the server.", hint: '' }; }
    checkAI.last = { at: Date.now(), v };
    paint(v);
    return v;
    function paint(v) {
      const b = $('ai-status'); if (!b) return v;
      b.className = 'ai-status ' + (v.ok ? 'ok' : 'bad');
      b.innerHTML = v.ok ? '<i></i>Online' : `<i></i><div><b>Assistant offline: ${esc(v.message)}</b>${v.hint ? `<span>${esc(v.hint)}</span>` : ''}</div>`;
      return v;
    }
  }

  /* ── sending ── */
  function setBusy(on) {
    const b = $('ai-send');
    b.innerHTML = svg(on ? 'i-stop' : 'i-send');
    b.classList.toggle('stop', on);
    b.setAttribute('aria-label', on ? 'Stop' : 'Send');
    b.disabled = !on && !$('ai-input').value.trim();
  }

  async function send(text, { regenerate = false } = {}) {
    if (controller) return;
    let c = chat();
    if (!regenerate) {
      text = (text || '').trim(); if (!text) return;
      if (!c) {
        c = { id: Date.now().toString(36), title: text.slice(0, 48) + (text.length > 48 ? '…' : ''), created: Date.now(), updated: Date.now(), messages: [] };
        chats.unshift(c); current = c.id;
      }
      c.messages.push({ role: 'user', content: text });
      sfx.send();
    }
    c.messages = c.messages.filter(m => !m.error);
    const reply = { role: 'assistant', content: '' };
    c.messages.push(reply);
    c.updated = Date.now();
    chats = [c, ...chats.filter(x => x !== c)];
    renderList(); renderChat();

    const bubble = $('ai-msgs').lastElementChild.querySelector('.bubble');
    bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    $('ai-msgs').lastElementChild.querySelector('.msg-actions')?.remove();
    controller = new AbortController(); setBusy(true);

    const history = c.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    let failed = null;
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, temperature: cfg.ai.temperature, length: cfg.ai.length, instructions: cfg.ai.instructions }),
      });
      if (!res.ok) {
        const v = await checkAI(true);
        failed = res.status === 502 && v && !v.ok ? `The assistant is offline: ${v.message}${v.hint ? '\n' + v.hint : ''}` : 'Something went wrong on the server. Try again.';
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '', paint = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            let o; try { o = JSON.parse(line); } catch { continue; }
            if (o.t) reply.content += o.t;
            if (o.error) failed = 'The model stopped with an error: ' + o.error;
          }
          // Repaint at most every ~50ms so long replies stay smooth.
          const now = performance.now();
          if (reply.content && now - paint > 50) { paint = now; bubble.innerHTML = fmt(reply.content); scrollDown(); }
        }
        if (!reply.content && !failed) failed = 'The model sent back an empty reply. Try again.';
      }
    } catch (e) {
      if (e.name !== 'AbortError') failed = "Couldn't reach the server. Check your connection.";
    }
    controller = null; setBusy(false);
    if (failed && !reply.content) { reply.content = failed; reply.error = true; sfx.error(); }
    else if (reply.content) sfx.recv();
    else c.messages.pop(); // stopped before anything arrived
    c.updated = Date.now();
    saveChats(); renderChat(); renderList();
    $('ai-input').focus();
  }

  /* ── settings panel ── */
  function paintSettings() {
    $('ai-temp').value = cfg.ai.temperature;
    $('ai-temp-lbl').textContent = cfg.ai.temperature <= 0.3 ? 'Focused' : cfg.ai.temperature >= 1.1 ? 'Very creative' : 'Balanced';
    document.querySelectorAll('#ai-length [data-len]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.len === cfg.ai.length)));
    $('ai-instr').value = cfg.ai.instructions;
  }
  window.aiSettings = open => {
    const p = $('ai-settings');
    if (open) { paintSettings(); p.hidden = false; restart(p, 'enter'); sfx.open(); }
    else { p.hidden = true; sfx.shut(); }
  };
  $('ai-temp').addEventListener('input', e => { cfg.ai.temperature = +e.target.value; saveCfg(); paintSettings(); });
  $('ai-length').addEventListener('click', e => { const b = e.target.closest('[data-len]'); if (!b) return; cfg.ai.length = b.dataset.len; saveCfg(); paintSettings(); sfx.tick(); });
  $('ai-instr').addEventListener('input', e => { cfg.ai.instructions = e.target.value; clearTimeout(paintSettings.t); paintSettings.t = setTimeout(saveCfg, 400); });

  window.aiClearAll = () => {
    if (!chats.length || !confirm('Delete all chats? This can’t be undone.')) return;
    chats = []; current = null; saveChats(); renderList(); renderChat(); aiSettings(false);
    toast('All chats deleted');
  };

  /* ── actions ── */
  window.aiNew = () => {
    controller?.abort();
    current = null; renderList(); renderChat();
    $('ai-root').classList.remove('side-open');
    $('ai-input').focus(); sfx.tick();
  };
  window.aiSend = () => {
    if (controller) { controller.abort(); return; } // the button is "Stop" while streaming
    const inp = $('ai-input'); const v = inp.value;
    inp.value = ''; autosize(inp);
    send(v);
  };
  function autosize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }

  $('ai-input').addEventListener('input', e => { autosize(e.target); if (!controller) $('ai-send').disabled = !e.target.value.trim(); });
  $('ai-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!controller) aiSend(); } });
  $('ai-find').addEventListener('input', e => { filter = e.target.value; renderList(); });

  $('ai-list').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const c = chats.find(x => x.id === del.dataset.del);
      if (!c || !confirm(`Delete "${c.title}"?`)) return;
      chats = chats.filter(x => x !== c);
      if (current === c.id) current = null;
      saveChats(); renderList(); renderChat(); sfx.close();
      return;
    }
    const ren = e.target.closest('[data-rename]');
    if (ren) {
      e.stopPropagation();
      const c = chats.find(x => x.id === ren.dataset.rename); if (!c) return;
      const t = prompt('Rename chat', c.title);
      if (t && t.trim()) { c.title = t.trim().slice(0, 60); saveChats(); renderList(); if (c.id === current) $('ai-title').textContent = c.title; }
      return;
    }
    const item = e.target.closest('[data-id]'); if (!item) return;
    if (controller) controller.abort();
    current = item.dataset.id; renderList(); renderChat();
    $('ai-root').classList.remove('side-open'); sfx.tick();
  });
  $('ai-list').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-id]')) e.target.click(); });

  $('ai-msgs').addEventListener('click', async e => {
    const s = e.target.closest('.suggest button'); if (s) return send(s.textContent);
    if (e.target.closest('[data-regen]')) {
      const c = chat(); if (!c) return;
      if (c.messages[c.messages.length - 1]?.role === 'assistant') c.messages.pop();
      return send('', { regenerate: true });
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const text = cp.closest('.msg').querySelector('.bubble').innerText;
      try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); } catch { toast("Couldn't copy", 'err'); }
    }
  });

  window.openAssistant = nav(() => {
    stopAllRunningContent();
    showView('assistant');
    renderList(); renderChat();
    setTimeout(() => $('ai-input').focus(), 30);
  });

  // Chats saved by the old single-chat version are simply started fresh.
  renderList();
})();
