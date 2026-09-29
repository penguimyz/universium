/* Friends: accounts, friend requests and live chat. Talks to lib/accounts.js on the server.
   Uses helpers from app.js ($, esc, svg, toast, sfx, showView, nav, cfg). */
window.social = (() => {
  const st = {
    loaded: false, me: null, friends: [], incoming: [], outgoing: [], blocked: [],
    open: null, msgs: {}, more: {}, theirRead: {}, typing: {}, es: null, authMode: 'login', busy: false,
  };
  const root = () => document.getElementById('friends-root');

  async function api(path, { method = 'GET', body } = {}) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || (r.status >= 500 ? 'The server had a problem. Try again.' : 'Something went wrong.')), { status: r.status });
    return d;
  }

  function apply(d) {
    st.me = d.user; st.friends = d.friends || []; st.incoming = d.incoming || []; st.outgoing = d.outgoing || []; st.blocked = d.blocked || [];
    if (st.open && !st.friends.some(f => f.id === st.open)) st.open = null;
    badge();
  }
  async function refresh() {
    try { apply(await api('/api/me')); }
    catch (e) { st.me = null; if (e.status !== 401 && location.protocol !== 'file:') st.offline = true; }
    st.loaded = true;
    connect(); render(); renderSettings();
  }

  /* ── live updates ── */
  function connect() {
    if (!st.me) { st.es?.close(); st.es = null; return; }
    if (st.es) return;
    const es = st.es = new EventSource('/api/events');
    es.addEventListener('message', e => onMessage(JSON.parse(e.data)));
    es.addEventListener('friends', e => {
      const before = st.incoming.length;
      apply(JSON.parse(e.data)); render();
      if (st.incoming.length > before) { toast(`${st.incoming[st.incoming.length - 1].username} sent you a friend request`); sfx.chime(); }
    });
    es.addEventListener('presence', e => {
      const d = JSON.parse(e.data), f = st.friends.find(x => x.id === d.id);
      if (f) { f.online = d.online; render(); }
    });
    es.addEventListener('typing', e => {
      const d = JSON.parse(e.data); st.typing[d.from] = Date.now();
      renderTyping(); setTimeout(renderTyping, 3600);
    });
    es.addEventListener('read', e => { const d = JSON.parse(e.data); st.theirRead[d.by] = d.t; if (st.open === d.by) renderMessages(); });
    // A 401 closes the stream for good (signed out elsewhere); anything else EventSource retries itself.
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) { st.es = null; setTimeout(refresh, 5000); } };
  }

  function onMessage(d) {
    const fid = d.with, m = d.message;
    const list = st.msgs[fid];
    if (list && !list.some(x => x.id === m.id)) list.push(m);
    const f = st.friends.find(x => x.id === fid);
    if (f) f.last = m;
    delete st.typing[fid];
    const viewing = st.open === fid && app.active === 'friends' && !document.hidden;
    if (m.from !== st.me?.id) {
      if (viewing) markRead(fid);
      else {
        if (f) f.unread = (f.unread || 0) + 1;
        toast(`${d.from?.username || 'Friend'}: ${m.text.slice(0, 60)}`);
        sfx.recv();
      }
    }
    st.friends.sort((a, b) => (b.last?.t || 0) - (a.last?.t || 0));
    badge();
    if (app.active === 'friends') { renderList(); if (st.open === fid) renderMessages(true); }
  }

  function badge() {
    const n = st.friends.reduce((a, f) => a + (f.unread || 0), 0) + st.incoming.length;
    document.querySelectorAll('[data-badge="friends"]').forEach(b => { b.textContent = n > 9 ? '9+' : n; b.hidden = !n; });
  }

  /* ── rendering ── */
  const avatar = (u, size = 36) => `<span class="av" style="--h:${u.color ?? 260};--s:${size}px">${esc((u.username || '?')[0].toUpperCase())}</span>`;
  const time = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = t => { const d = new Date(t), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
    return d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); };

  function render() {
    const el = root(); if (!el) return;
    if (!st.loaded) { el.innerHTML = '<div class="fl-center"><div class="spinner"></div></div>'; return; }
    if (!st.me) return renderAuth(el);
    el.innerHTML = `
      <div class="fl${st.open ? ' conv-open' : ''}">
        <aside class="fl-side">
          <div class="fl-me">
            ${avatar(st.me, 38)}
            <div><b>${esc(st.me.username)}</b><small>Share your username so friends can add you</small></div>
            <button class="icon-btn" title="Sign out" aria-label="Sign out" data-act="logout">${svg('i-logout')}</button>
          </div>
          <form class="fl-add" data-form="add">
            <input class="field" name="username" placeholder="Add a friend by username" autocomplete="off" maxlength="20" spellcheck="false">
            <button class="btn primary" type="submit">Add</button>
          </form>
          <div class="fl-scroll" id="fl-list"></div>
        </aside>
        <main class="fl-chat" id="fl-chat"></main>
      </div>`;
    renderList(); renderChat();
  }

  function renderAuth(el) {
    const signup = st.authMode === 'signup';
    el.innerHTML = `
      <div class="fl-center">
        <form class="auth" data-form="auth">
          <div class="auth-mark"><svg class="mark"><use href="#mark"/></svg></div>
          <h1>${signup ? 'Create an account' : 'Sign in'}</h1>
          <p>${signup ? 'Pick a username your friends can find you by.' : 'Chat with friends and see who’s online.'}</p>
          <div class="seg auth-seg"><button type="button" data-mode="login" aria-pressed="${!signup}">Sign in</button><button type="button" data-mode="signup" aria-pressed="${signup}">Create account</button></div>
          <label class="lbl">Username<input class="field" name="username" autocomplete="username" maxlength="20" required spellcheck="false" ${signup ? 'pattern="[A-Za-z0-9_]{3,20}" title="3–20 letters, numbers or underscores"' : ''}></label>
          <label class="lbl">Password<input class="field" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 6 : 1}" required></label>
          <p class="auth-err" id="auth-err">${st.offline ? 'Accounts need the server running.' : ''}</p>
          <button class="btn primary auth-go" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
          <p class="fine">${signup ? 'Accounts are stored on this site’s server. Don’t reuse a password from another site.' : 'New here? Switch to Create account.'}</p>
        </form>
      </div>`;
    el.querySelector('input[name=username]').focus();
  }

  function renderList() {
    const box = document.getElementById('fl-list'); if (!box) return;
    let html = '';
    if (st.incoming.length) {
      html += `<h3 class="fl-h">Friend requests <span class="count">${st.incoming.length}</span></h3>`;
      html += st.incoming.map(u => `<div class="fl-req">${avatar(u, 32)}<b>${esc(u.username)}</b>
        <button class="btn primary sm" data-act="accept" data-id="${u.id}">Accept</button>
        <button class="icon-btn" data-act="decline" data-id="${u.id}" title="Decline" aria-label="Decline">${svg('i-x')}</button></div>`).join('');
    }
    html += `<h3 class="fl-h">Friends <span class="count">${st.friends.length}</span></h3>`;
    html += st.friends.length ? st.friends.map(f => `
      <button class="fl-friend${st.open === f.id ? ' active' : ''}" data-open="${f.id}">
        <span class="av-wrap">${avatar(f, 38)}<i class="dot${f.online ? ' on' : ''}"></i></span>
        <span class="fl-fmain"><b>${esc(f.username)}</b><small>${st.typing[f.id] && Date.now() - st.typing[f.id] < 3500 ? '<em>typing…</em>' : f.last ? esc((f.last.from === st.me.id ? 'You: ' : '') + f.last.text) : (f.online ? 'Online' : 'Say hi')}</small></span>
        ${f.unread ? `<span class="unread">${f.unread > 9 ? '9+' : f.unread}</span>` : f.last ? `<time>${time(f.last.t)}</time>` : ''}
      </button>`).join('') : `<p class="fl-empty">No friends yet. Add someone by their username above.</p>`;
    if (st.outgoing.length) {
      html += `<h3 class="fl-h">Waiting on</h3>` + st.outgoing.map(u => `<div class="fl-req muted">${avatar(u, 28)}<b>${esc(u.username)}</b><small>Pending</small>
        <button class="icon-btn" data-act="decline" data-id="${u.id}" title="Cancel request" aria-label="Cancel request">${svg('i-x')}</button></div>`).join('');
    }
    if (st.blocked.length) {
      html += `<h3 class="fl-h">Blocked</h3>` + st.blocked.map(u => `<div class="fl-req muted">${avatar(u, 28)}<b>${esc(u.username)}</b>
        <button class="btn sm" data-act="unblock" data-id="${u.id}">Unblock</button></div>`).join('');
    }
    box.innerHTML = html;
  }

  function renderChat() {
    const box = document.getElementById('fl-chat'); if (!box) return;
    const f = st.friends.find(x => x.id === st.open);
    if (!f) {
      box.innerHTML = `<div class="fl-center"><div class="fl-hello">${svg('i-users')}<h2>${st.friends.length ? 'Pick a friend to chat' : 'Add your friends'}</h2><p>${st.friends.length ? 'Messages show up here instantly.' : 'Ask them for their username, type it on the left, and they’ll get a request.'}</p></div></div>`;
      return;
    }
    box.innerHTML = `
      <header class="fl-head">
        <button class="icon-btn fl-back" data-act="back" aria-label="Back">${svg('i-back')}</button>
        <span class="av-wrap">${avatar(f, 34)}<i class="dot${f.online ? ' on' : ''}"></i></span>
        <div><b>${esc(f.username)}</b><small id="fl-sub">${f.online ? 'Online' : 'Offline'}</small></div>
        <button class="icon-btn" data-act="friendmenu" data-id="${f.id}" aria-label="More">${svg('i-dots')}</button>
      </header>
      <div class="fl-msgs" id="fl-msgs"><div class="fl-center"><div class="spinner"></div></div></div>
      <form class="fl-compose" data-form="send">
        <textarea name="text" rows="1" placeholder="Message ${esc(f.username)}" maxlength="1000"></textarea>
        <button class="send" type="submit" aria-label="Send">${svg('i-send')}</button>
      </form>`;
    if (st.msgs[f.id]) renderMessages(true); else loadMessages(f.id);
    renderTyping();
  }

  function renderMessages(stick) {
    const box = document.getElementById('fl-msgs'); if (!box || !st.open) return;
    const list = st.msgs[st.open] || [];
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    let html = st.more[st.open] ? `<button class="link-btn fl-older" data-act="older">Load older messages</button>` : '';
    let lastDay = '', lastFrom = '', lastT = 0;
    const myLast = [...list].reverse().find(m => m.from === st.me.id);
    for (const m of list) {
      const d = day(m.t);
      if (d !== lastDay) { html += `<div class="fl-day">${d}</div>`; lastDay = d; lastFrom = ''; }
      const mine = m.from === st.me.id;
      const grouped = m.from === lastFrom && m.t - lastT < 5 * 60000;
      html += `<div class="bub-row${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}${m.pending ? ' pending' : ''}"><div class="bub" title="${time(m.t)}">${esc(m.text)}</div></div>`;
      if (m === myLast) html += `<div class="seen${mine ? ' mine' : ''}">${m.pending ? 'Sending…' : (st.theirRead[st.open] || 0) >= m.t ? 'Seen' : time(m.t)}</div>`;
      lastFrom = m.from; lastT = m.t;
    }
    if (!list.length) html += `<div class="fl-center"><p class="fl-empty">This is the start of your chat. Say hi!</p></div>`;
    box.innerHTML = html;
    if (stick || nearBottom) box.scrollTop = box.scrollHeight;
  }

  function renderTyping() {
    const sub = document.getElementById('fl-sub'); if (!sub || !st.open) return;
    const f = st.friends.find(x => x.id === st.open); if (!f) return;
    const typing = st.typing[st.open] && Date.now() - st.typing[st.open] < 3500;
    sub.innerHTML = typing ? '<em>typing…</em>' : f.online ? 'Online' : 'Offline';
    if (app.active === 'friends') renderList();
  }

  async function loadMessages(fid, before) {
    try {
      const d = await api(`/api/messages/${fid}${before ? '?before=' + before : ''}`);
      st.msgs[fid] = before ? [...d.messages, ...(st.msgs[fid] || [])] : d.messages;
      st.more[fid] = d.more; st.theirRead[fid] = d.theirRead;
      if (st.open === fid) renderMessages(!before);
      markRead(fid);
    } catch (e) { toast(e.message, 'err'); }
  }
  function markRead(fid) {
    const f = st.friends.find(x => x.id === fid);
    if (f && f.unread) { f.unread = 0; badge(); renderList(); }
    api(`/api/messages/${fid}/read`, { method: 'POST' }).catch(() => {});
  }

  function openConv(fid) {
    st.open = fid; sfx.tick();
    renderList(); renderChat(); markRead(fid);
    document.querySelector('.fl')?.classList.add('conv-open');
    setTimeout(() => document.querySelector('.fl-compose textarea')?.focus(), 30);
  }

  async function send(text) {
    const fid = st.open; if (!fid || !text.trim()) return;
    const temp = { id: 'tmp' + Date.now(), from: st.me.id, text: text.trim(), t: Date.now(), pending: true };
    (st.msgs[fid] = st.msgs[fid] || []).push(temp);
    renderMessages(true); sfx.send();
    try {
      const { message } = await api(`/api/messages/${fid}`, { method: 'POST', body: { text } });
      const list = st.msgs[fid];
      const i = list.indexOf(temp);
      if (list.some(m => m.id === message.id)) list.splice(i, 1); else list[i] = message;
      const f = st.friends.find(x => x.id === fid); if (f) f.last = message;
    } catch (e) {
      st.msgs[fid] = st.msgs[fid].filter(m => m !== temp);
      toast(e.message, 'err');
    }
    renderMessages(true); renderList();
  }

  async function act(action, id, extra) {
    try {
      if (action === 'logout') { await api('/api/auth/logout', { method: 'POST' }); st.me = null; st.open = null; st.msgs = {}; connect(); render(); renderSettings(); badge(); toast('Signed out'); return; }
      if (action === 'block' && !confirm('Block them? They’ll be removed from your friends and can’t add you again.')) return;
      if (action === 'remove' && !confirm('Remove this friend?')) return;
      apply(await api(`/api/friends/${id}/${action}`, { method: 'POST' }));
      if (action === 'accept') { toast('Friend added', 'ok'); }
      render();
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ── events ── */
  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-form]'); if (!form || !root()?.contains(form)) return;
    e.preventDefault();
    const kind = form.dataset.form;
    if (kind === 'auth') {
      const body = { username: form.username.value.trim(), password: form.password.value };
      const btn = form.querySelector('.auth-go'); btn.disabled = true;
      try {
        apply(await api(st.authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login', { method: 'POST', body }));
        sfx.chime(); toast(st.authMode === 'signup' ? `Welcome, ${st.me.username}!` : `Signed in as ${st.me.username}`);
        connect(); render(); renderSettings();
      } catch (err) { document.getElementById('auth-err').textContent = err.message; sfx.error(); btn.disabled = false; }
    } else if (kind === 'add') {
      const name = form.username.value.trim(); if (!name) return;
      try {
        const had = st.friends.length;
        apply(await api('/api/friends/request', { method: 'POST', body: { username: name } }));
        form.username.value = '';
        toast(st.friends.length > had ? 'You’re now friends' : `Request sent to ${name}`, 'ok');
        render();
      } catch (err) { toast(err.message, 'err'); }
    } else if (kind === 'send') {
      const ta = form.text; const v = ta.value; ta.value = ''; ta.style.height = '';
      send(v); ta.focus();
    }
  });
  document.addEventListener('click', e => {
    const r = root(); if (!r || !r.contains(e.target)) return;
    const mode = e.target.closest('.auth-seg [data-mode]');
    if (mode) { st.authMode = mode.dataset.mode; render(); sfx.tick(); return; }
    const o = e.target.closest('[data-open]'); if (o) return openConv(o.dataset.open);
    const a = e.target.closest('[data-act]'); if (!a) return;
    const action = a.dataset.act;
    if (action === 'back') { st.open = null; document.querySelector('.fl')?.classList.remove('conv-open'); renderList(); renderChat(); return; }
    if (action === 'older') { const list = st.msgs[st.open] || []; return loadMessages(st.open, list[0]?.t); }
    if (action === 'friendmenu') {
      const m = document.getElementById('menu-friend'); m.dataset.id = a.dataset.id;
      const rc = a.getBoundingClientRect(); placeMenu(m, rc.right, rc.bottom + 6, true); sfx.tick(); return;
    }
    act(action, a.dataset.id);
  });
  document.getElementById('menu-friend').addEventListener('click', e => {
    const b = e.target.closest('[data-fact]'); if (!b) return;
    const id = e.currentTarget.dataset.id; hideMenus();
    act(b.dataset.fact, id);
  });
  let lastTyping = 0;
  document.addEventListener('input', e => {
    const ta = e.target.closest('.fl-compose textarea'); if (!ta) return;
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    if (st.open && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); api(`/api/typing/${st.open}`, { method: 'POST' }).catch(() => {}); }
  });
  document.addEventListener('keydown', e => {
    const ta = e.target.closest?.('.fl-compose textarea');
    if (ta && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ta.form.requestSubmit(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && st.open && app.active === 'friends') markRead(st.open); });

  /* ── settings: account group ── */
  function renderSettings() {
    const box = document.getElementById('account-settings'); if (!box) return;
    box.innerHTML = st.me
      ? `<div class="row"><div class="row-label"><b>Signed in as ${esc(st.me.username)}</b><small>Friends and chat</small></div><button class="btn" data-sact="logout">Sign out</button></div>
         <div class="row"><div class="row-label"><b>Delete account</b><small>Removes your account, friends and messages</small></div><button class="btn ghost danger" data-sact="delete">Delete</button></div>`
      : `<div class="row"><div class="row-label"><b>Not signed in</b><small>Make an account to add friends and chat</small></div><button class="btn primary" data-sact="signin">Sign in</button></div>`;
  }
  document.getElementById('account-settings').addEventListener('click', async e => {
    const b = e.target.closest('[data-sact]'); if (!b) return;
    const a = b.dataset.sact;
    if (a === 'signin') { closeSettings(); openFriends(); }
    if (a === 'logout') act('logout');
    if (a === 'delete') {
      const pw = prompt('Type your password to delete your account. This can’t be undone.');
      if (!pw) return;
      try { await api('/api/account', { method: 'DELETE', body: { password: pw } }); st.me = null; st.open = null; connect(); render(); renderSettings(); badge(); toast('Account deleted'); }
      catch (err) { toast(err.message, 'err'); }
    }
  });

  window.openFriends = nav(() => {
    stopAllRunningContent();
    showView('friends');
    if (!st.loaded) refresh(); else render();
    if (st.open) markRead(st.open);
  });

  refresh();
  return { refresh, state: st };
})();
