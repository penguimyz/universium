/* Admin page (only shown to accounts in ADMIN_USERNAMES) and the site-wide announcement banner.
   Uses helpers from app.js ($, esc, svg, toast, sfx, nav, showView, stopAllRunningContent). */
(() => {
  let tab = 'overview', q = '';
  const api = async (path, { method = 'GET', body } = {}) => {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Something went wrong.');
    return d;
  };
  const root = () => $('admin-root');
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const dur = ms => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60; return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`; };

  function shell(body) {
    root().innerHTML = `
      <div class="page adm">
        <div class="page-head"><div><h1 class="page-title">Admin</h1><p class="page-sub">Manage accounts, game requests and announcements.</p></div>
          <button class="btn" data-a="refresh">${svg('i-reload', 'btn-ico')}Refresh</button></div>
        <div class="seg adm-tabs">${['overview', 'users', 'requests', 'announcement'].map(t => `<button type="button" data-tab="${t}" aria-pressed="${t === tab}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        <div class="adm-body">${body}</div>
      </div>`;
  }

  async function render() {
    shell('<div class="fl-center"><div class="spinner"></div></div>');
    try {
      if (tab === 'overview') {
        const d = await api('/api/admin/overview');
        const card = (label, value, sub = '') => `<div class="adm-card"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
        shell(`
          <div class="adm-grid">
            ${card('Accounts', d.users, `${d.newToday} new today${d.banned ? ` · ${d.banned} banned` : ''}`)}
            ${card('Online now', d.onlineNow)}
            ${card('Messages', d.messages, `${d.conversations} conversations`)}
            ${card('Game requests', d.requestsOpen, `${d.requestsAdded} added · ${d.votes} votes`)}
            ${card('Uptime', dur(d.uptime), `Version ${esc(d.version)}`)}
          </div>
          <div class="adm-ai ${d.ai?.ok ? 'ok' : 'bad'}"><i></i><div><b>Chat assistant: ${d.ai?.ok ? 'online' : 'offline'}</b><span>${esc(d.ai?.message || '')}${d.ai?.hint ? ' ' + esc(d.ai.hint) : ''}</span></div></div>
          <div class="adm-ai ${d.storage?.persistent ? 'ok' : 'bad'}"><i></i><div><b>Storage: ${d.storage?.persistent ? 'saved on a volume' : 'NOT persistent'}</b><span>${d.storage?.persistent ? 'Accounts and requests survive redeploys (' + esc(d.storage.dir) + ').' : 'Accounts and requests are wiped on every deploy. Attach a Railway volume.'}</span></div></div>
          ${d.announcement ? `<div class="adm-note">Current announcement: “${esc(d.announcement.text)}”</div>` : ''}`);
      } else if (tab === 'users') {
        const d = await api('/api/admin/users?q=' + encodeURIComponent(q));
        shell(`
          <label class="filter-search wide"><svg><use href="#i-search"/></svg><input id="adm-q" type="search" placeholder="Search usernames" value="${esc(q)}" autocomplete="off"></label>
          <div class="adm-table">
            ${d.users.length ? d.users.map(u => `
              <div class="adm-row">
                <span class="av-wrap"><span class="av" style="--h:${u.color};--s:34px">${esc(u.username[0].toUpperCase())}</span><i class="dot${u.online ? ' on' : ''}"></i></span>
                <div class="adm-main"><b>${esc(u.username)}${u.admin ? ' <em class="tag">Admin</em>' : ''}${u.banned ? ' <em class="tag bad">Banned</em>' : ''}</b><small>Joined ${ago(u.created)} · ${u.friends} friend${u.friends === 1 ? '' : 's'}</small></div>
                ${u.admin ? '' : `
                  <button class="btn sm" data-a="ban" data-id="${u.id}" data-banned="${u.banned}">${u.banned ? 'Unban' : 'Ban'}</button>
                  <button class="btn sm" data-a="pw" data-id="${u.id}" data-name="${esc(u.username)}">Reset password</button>
                  <button class="icon-btn" data-a="deluser" data-id="${u.id}" data-name="${esc(u.username)}" title="Delete account" aria-label="Delete account">${svg('i-x')}</button>`}
              </div>`).join('') : '<p class="empty">No accounts found.</p>'}
          </div>`);
        const inp = $('adm-q');
        inp.addEventListener('input', () => { clearTimeout(inp._t); inp._t = setTimeout(() => { q = inp.value; render().then(() => { const i = $('adm-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); });
      } else if (tab === 'requests') {
        const d = await api('/api/admin/requests');
        shell(`<div class="adm-table">${d.requests.length ? d.requests.map(r => `
          <div class="adm-row${r.status === 'added' ? ' done' : ''}">
            <span class="adm-votes"><b>${r.votes}</b><small>votes</small></span>
            <div class="adm-main"><b>${esc(r.name)}${r.status === 'added' ? ' <em class="tag ok">Added</em>' : ''}</b>
              <small>${ago(r.createdAt)}${r.note ? ' · ' + esc(r.note) : ''}</small>
              ${r.link ? `<a href="#" data-a="open" data-url="${esc(r.link)}">${esc(r.link)}</a>` : ''}</div>
            <button class="btn sm" data-a="status" data-id="${r.id}" data-to="${r.status === 'added' ? 'open' : 'added'}">${r.status === 'added' ? 'Reopen' : 'Mark added'}</button>
            <button class="icon-btn" data-a="delreq" data-id="${r.id}" data-name="${esc(r.name)}" title="Delete" aria-label="Delete">${svg('i-x')}</button>
          </div>`).join('') : '<p class="empty">No requests yet.</p>'}</div>`);
      } else {
        const d = await api('/api/announcement');
        const a = d.announcement;
        shell(`
          <div class="adm-ann">
            <p class="page-sub">Shows a banner at the top of the site for everyone until they close it. Posting a new one shows it again.</p>
            <textarea class="field" id="adm-ann-text" rows="3" maxlength="280" placeholder="e.g. New games added! Check the Games tab.">${esc(a?.text || '')}</textarea>
            <div class="seg seg3" id="adm-tone">${['info', 'warn', 'party'].map(t => `<button type="button" data-tone="${t}" aria-pressed="${(a?.tone || 'info') === t}">${{ info: 'Info', warn: 'Warning', party: 'Celebration' }[t]}</button>`).join('')}</div>
            <div class="inline"><button class="btn primary" data-a="post">Post announcement</button>${a ? '<button class="btn ghost danger" data-a="clear">Remove</button>' : ''}</div>
            ${a ? `<p class="fine left">Posted by ${esc(a.by)} ${ago(a.at)}.</p>` : ''}
          </div>`);
      }
    } catch (e) {
      shell(`<p class="empty">${esc(e.message)}</p>`);
    }
  }

  document.addEventListener('click', async e => {
    const r = root(); if (!r || !r.contains(e.target)) return;
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; sfx.tick(); return render(); }
    const tone = e.target.closest('[data-tone]');
    if (tone) { r.querySelectorAll('[data-tone]').forEach(b => b.setAttribute('aria-pressed', String(b === tone))); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const { a, id, name } = b.dataset;
    try {
      if (a === 'refresh') return render();
      if (a === 'open') { e.preventDefault(); return go(b.dataset.url, { newTab: true }); }
      if (a === 'ban') { const ban = b.dataset.banned !== 'true'; if (ban && !confirm('Ban this account? They’ll be signed out and can’t sign back in.')) return; await api(`/api/admin/users/${id}/ban`, { method: 'POST', body: { banned: ban } }); toast(ban ? 'Banned' : 'Unbanned', 'ok'); }
      if (a === 'pw') { if (!confirm(`Reset ${name}'s password? They'll be signed out.`)) return; const d = await api(`/api/admin/users/${id}/password`, { method: 'POST' }); prompt(`Temporary password for ${name}. Copy it and send it to them:`, d.password); }
      if (a === 'deluser') { if (!confirm(`Delete ${name}'s account, friends and messages? This can't be undone.`)) return; await api(`/api/admin/users/${id}`, { method: 'DELETE' }); toast('Account deleted', 'ok'); }
      if (a === 'status') { await api(`/api/admin/requests/${id}`, { method: 'PATCH', body: { status: b.dataset.to } }); toast(b.dataset.to === 'added' ? 'Marked as added' : 'Reopened', 'ok'); }
      if (a === 'delreq') { if (!confirm(`Delete the request for "${name}"?`)) return; await api(`/api/admin/requests/${id}`, { method: 'DELETE' }); toast('Request deleted', 'ok'); }
      if (a === 'post' || a === 'clear') {
        const text = a === 'clear' ? '' : $('adm-ann-text').value.trim();
        if (a === 'post' && !text) return $('adm-ann-text').focus();
        const toneBtn = r.querySelector('[data-tone][aria-pressed="true"]');
        await api('/api/admin/announcement', { method: 'POST', body: { text, tone: toneBtn?.dataset.tone || 'info' } });
        toast(text ? 'Announcement posted' : 'Announcement removed', 'ok');
        loadAnnouncement();
      }
      render();
    } catch (err) { toast(err.message, 'err'); }
  });

  window.openAdmin = nav(() => {
    stopAllRunningContent();
    showView('admin');
    render();
  });

  /* ── announcement banner (everyone) ── */
  async function loadAnnouncement() {
    let a = null;
    try { a = (await (await fetch('/api/announcement', { cache: 'no-store' })).json()).announcement; } catch {}
    const bar = $('announce');
    const dismissed = store.get('uos-ann-dismissed', '');
    if (!a || a.id === dismissed) { bar.hidden = true; return; }
    bar.dataset.tone = a.tone; bar.dataset.id = a.id;
    bar.querySelector('span').textContent = a.text;
    bar.hidden = false; restart(bar, 'enter');
  }
  $('announce').querySelector('button').addEventListener('click', () => {
    store.set('uos-ann-dismissed', $('announce').dataset.id);
    $('announce').hidden = true; sfx.close();
  });
  loadAnnouncement();
  setInterval(() => { if (!document.hidden) loadAnnouncement(); }, 5 * 60000);
})();
