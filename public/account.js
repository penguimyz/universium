/* Account sync.
   While signed in, these follow you to any computer: settings (theme, background, desktop mode…),
   shortcuts, favorites, bookmarks, history, recently played, AI chats, notes and calendar events.
   How it works: every save to one of those keys marks the data "dirty" and uploads it a few
   seconds later. On sign-in the newer copy wins (account vs this browser). */
window.account = (() => {
  const KEYS = ['uos-cfg', 'uos-links', 'uos-favs', 'uos-bookmarks', 'uos-history', 'uos-recent', 'uos-chats', 'uos-notes', 'uos-calendar'];
  const META = 'uos-sync';
  let user = null, timer = 0, syncing = false;

  const meta = () => { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch { return {}; } };
  const setMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch {} };
  // True once someone has changed anything on this browser (a fresh visit doesn't count).
  const hasLocalData = () => !!meta().updated;
  function collect() {
    const data = {};
    for (const k of KEYS) { try { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); } catch {} }
    return data;
  }

  // Mark data dirty whenever app code saves a synced key.
  const origSet = store.set.bind(store);
  store.set = (k, v) => {
    origSet(k, v);
    if (!KEYS.includes(k)) return;
    const m = meta(); m.updated = Date.now(); setMeta(m);
    if (user) { clearTimeout(timer); timer = setTimeout(push, 3000); paint(); }
  };

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Sync failed.');
    return d;
  }

  async function push(keepalive) {
    if (!user || syncing) return;
    syncing = true; paint('Saving…');
    try {
      const m = meta();
      const updated = m.updated || Date.now();
      await api('/api/account/data', { method: 'PUT', keepalive: !!keepalive, body: JSON.stringify({ updated, data: collect() }) });
      setMeta({ ...meta(), uid: user.id, synced: Date.now(), updated });
    } catch (e) { paint('Couldn’t sync: ' + e.message); syncing = false; return; }
    syncing = false; paint();
  }

  function apply(server) {
    for (const k of KEYS) {
      try {
        if (server.data[k] === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(server.data[k]));
      } catch {}
    }
    setMeta({ uid: user.id, updated: server.updated, synced: Date.now() });
    // Reload once so every part of the site picks up the account's data.
    sessionStorage.setItem('uos-synced-reload', '1');
    location.reload();
  }

  async function pull() {
    let server;
    try { server = await api('/api/account/data'); } catch { paint('Couldn’t reach your account data.'); return; }
    const m = meta();
    const serverHas = server && server.data && Object.keys(server.data).length;
    if (serverHas && m.uid !== user.id) {
      // Different (or no) account last used this browser.
      if (!m.uid && hasLocalData() && !sessionStorage.getItem('uos-synced-reload')) {
        const useAccount = await ui.confirm({
          title: 'Load your saved stuff?',
          message: 'Your account has saved settings, favorites, bookmarks and chats. Use those, or keep what’s on this browser (and save it to your account instead)?',
          confirmText: 'Use my account', cancelText: 'Keep this browser’s',
        });
        if (!useAccount) { setMeta({ ...m, uid: user.id, updated: Date.now() }); return push(); }
      }
      return apply(server);
    }
    if (serverHas && (server.updated || 0) > (m.updated || 0)) return apply(server);
    if (!serverHas || (m.updated || 0) > (server.updated || 0) || m.uid !== user.id) { setMeta({ ...m, uid: user.id }); return push(); }
    setMeta({ ...m, uid: user.id, synced: Date.now() });
    paint();
  }

  /* ── settings row ── */
  function paint(text) {
    const row = document.getElementById('sync-row'); if (!row) return;
    const m = meta();
    const ago = m.synced ? Math.max(0, Math.round((Date.now() - m.synced) / 60000)) : null;
    row.innerHTML = `<div class="row-label"><b>Synced to your account</b><small>${esc(text || (ago === null ? 'Not synced yet' : `Settings, shortcuts, favorites, bookmarks, history and chats · saved ${ago < 1 ? 'just now' : ago + ' min ago'}`))}</small></div>
      <button class="btn" data-sync>Sync now</button>`;
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-sync]')) { pull(); } });

  /* ── hooks from social.js ── */
  function onUser(u) {
    const was = user?.id;
    user = u || null;
    if (!user) return;
    if (was !== user.id) pull();
    else paint();
  }
  async function afterLogout() {
    user = null;
    const clear = await ui.confirm({
      title: 'Clear this browser too?',
      message: 'Your stuff is saved to your account. If this is a shared computer, clear your settings, favorites, history and chats from this browser.',
      confirmText: 'Clear this browser', cancelText: 'Keep it',
    });
    if (clear) {
      for (const k of [...KEYS, META]) { try { localStorage.removeItem(k); } catch {} }
      location.reload();
    } else setMeta({ ...meta(), uid: null });
  }

  addEventListener('pagehide', () => { if (user && timer) { clearTimeout(timer); push(true); } });
  sessionStorage.removeItem('uos-synced-reload');
  return { onUser, afterLogout, paint };
})();
