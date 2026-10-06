/* ═══════════════ Storage ═══════════════ */
const canLS = (() => { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return true; } catch { return false; } })();
const store = {
  get(k, d) {
    try {
      if (canLS) { const v = localStorage.getItem(k); if (v !== null) return JSON.parse(v); }
      const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)'));
      if (m) return JSON.parse(decodeURIComponent(m[1]));
    } catch {}
    return d;
  },
  set(k, v) {
    try {
      if (canLS) { localStorage.setItem(k, JSON.stringify(v)); return; }
      // Cookie fallback only when localStorage is blocked; cookies ride along on every request.
      if (k === 'uos-history') return;
      document.cookie = `${k}=${encodeURIComponent(JSON.stringify(v))};max-age=31536000;path=/;SameSite=Lax`;
    } catch {}
  },
};

/* ═══════════════ Data ═══════════════ */
const ACCENTS = ['#b9a3ff', '#e0a8ff', '#7cc4ff', '#6ee7b7', '#ff8fa3', '#f0a35e'];
const ENGINES = {
  ddg:    { name: 'DuckDuckGo', url: q => 'https://duckduckgo.com/?q=' + q },
  google: { name: 'Google',     url: q => 'https://www.google.com/search?q=' + q },
  bing:   { name: 'Bing',       url: q => 'https://www.bing.com/search?q=' + q },
  brave:  { name: 'Brave',      url: q => 'https://search.brave.com/search?q=' + q },
};
const CLOAKS = [
  { name: 'Google Classroom', title: 'Home', icon: 'classroom.google.com' },
  { name: 'Google Docs', title: 'Google Docs', icon: 'docs.google.com' },
  { name: 'Google Drive', title: 'My Drive - Google Drive', icon: 'drive.google.com' },
  { name: 'Canvas', title: 'Dashboard', icon: 'instructure.com' },
  { name: 'Khan Academy', title: 'Khan Academy', icon: 'khanacademy.org' },
];
const DEFAULT_LINKS = [
  { label: 'YouTube',     url: 'youtube.com' },
  { label: 'TikTok',      url: 'tiktok.com' },
  { label: 'ChatGPT',     url: 'chatgpt.com' },
  { label: 'Spotify',     url: 'open.spotify.com' },
  { label: 'Twitch',      url: 'twitch.tv' },
  { label: 'GitHub',      url: 'github.com' },
  { label: 'CrazyGames',  url: 'crazygames.com' },
  { label: 'now.gg',      url: 'now.gg' },
  { label: 'GeForce Now', url: 'play.geforcenow.com' },
];
const steam = id => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
// fit: 'contain' for art that isn't card-shaped (logo strips, square icons), so nothing gets cropped.
const GAMES = [
  { id: 'minecraft',   name: 'Minecraft',              tag: 'Sandbox',    src: '/games/minecraft/index.html',       thumb: 'img/minecraft.png', fit: 'contain', desc: 'EaglercraftX 1.8 (u53). Singleplayer, LAN worlds, and servers.', heavy: '11–30 MB' },
  { id: 'duel',        name: 'Duels',                  tag: 'Multiplayer', src: '/games/duel/',                    thumb: 'img/duels.svg', desc: '1v1 a friend. Lose a round, pick a card. Challenge from Friends.' },
  { id: 'brotato',     name: 'Brotato',                tag: 'Roguelite',  src: '/games/brotato.html',               thumb: steam(1942280), desc: "You're a potato holding six guns. Survive the waves." },
  { id: 'terraria',    name: 'Terraria',               tag: 'Adventure',  src: '/games/terraria.html',              thumb: steam(105600),  desc: 'Dig, build, fight bosses. The 2D one everyone loves.' },
  { id: 'buckshot',    name: 'Buckshot Roulette',      tag: 'Horror',     src: '/games/buckshot_roulette.html',     thumb: steam(2835570), desc: 'Russian roulette with a shotgun and a very strange dealer.' },
  { id: 'repo',        name: 'R.E.P.O.',               tag: 'Horror',     src: '/games/repo.html',                  thumb: steam(3241660), desc: 'Haul valuables out of haunted places. Try not to drop them.' },
  { id: 'neighbor',    name: "That's Not My Neighbor", tag: 'Horror',     src: '/games/thats_not_my_neighbor.html', thumb: steam(3431040), desc: 'Check the papers. Decide who gets let in.' },
  { id: 'geodash',     name: 'Geometry Dash',          tag: 'Rhythm',     src: '/games/geometry_dash.html',         thumb: steam(322170),  desc: 'Jump to the beat. You will die a lot.' },
  { id: 'adofai',      name: 'A Dance of Fire and Ice',tag: 'Rhythm',     src: '/games/adofai.html',                thumb: steam(977950),  desc: 'One button, two planets, zero forgiveness.' },
  { id: 'cookie',      name: 'Cookie Clicker',         tag: 'Idle',       src: '/games/cookie_clicker.html',        thumb: steam(1454400), desc: 'Click the cookie. Or let the auto clicker do it.' },
  { id: 'bloons',      name: 'Bloons TD 5',            tag: 'Strategy',   src: '/games/bloons_td5.html',            thumb: steam(306020),  desc: 'Place monkeys, pop balloons, lose to the MOAB.' },
  { id: 'retrobowl',   name: 'Retro Bowl',             tag: 'Sports',     src: '/games/retro_bowl.html',            thumb: 'img/retro_bowl.png', fit: 'contain', desc: 'Run a football team and throw the passes yourself.' },
  { id: 'liquidsoccer', name: 'Super Liquid Soccer',   tag: 'Sports',     src: '/games/super_liquid_soccer.html',   thumb: 'img/super_liquid_soccer.png', noFav: true, desc: 'Arcade soccer. Dribble, shoot and outscore the other team.', heavy: '28 MB' },
  { id: 'basket',      name: 'Basket Bros',            tag: 'Sports',     src: '/games/basket_bros.html',           thumb: 'img/basket_bros.png', desc: 'Chaotic 1v1 basketball. Great with a friend on one keyboard.' },
  { id: 'bitlife',     name: 'BitLife',                tag: 'Simulation', src: '/games/bitlife.html',               thumb: 'img/bitlife.png', fit: 'contain', desc: 'Live a whole life in text. Make terrible choices.' },
  { id: 'cloverpit',   name: 'CloverPit',              tag: 'Roguelite',  src: '/games/clover_pit.html',            thumb: 'img/clover_pit.png', fit: 'contain', desc: 'A slot machine in a cell. Pay the debt or else.' },
  { id: 'noomiclone',  name: 'NoomiClone',             tag: 'Sports',     src: '/games/noomiclone.html',            thumb: 'img/noomiclone.svg', desc: 'High bar gymnastics. Time the release, flip, stick the landing.' },
  { id: 'tinyfishing', name: 'Tiny Fishing',           tag: 'Casual',     src: '/games/tiny_fishing.html',          thumb: 'https://tinyfishingame.com/tiny-fishing.webp', desc: 'Drop the line, reel it in, buy a longer line.' },
];
const EXTRAS_PAGE = 48;

/* ═══════════════ State ═══════════════ */
const cfg = Object.assign(
  { cloak: false, cloakName: 'Home', logoURL: '', adblock: true, accent: ACCENTS[0], engine: 'ddg', hiddenDefaults: [],
    motion: true, sound: true, bookmarksBar: true, railOpen: true, desktop: false, bgScene: 'rings', moviesShield: true, collapsed: {} },
  store.get('uos-cfg', {}) || {}
);
const app = {
  tabs: [], active: 'home', tc: 0, prevView: 'home',
  links: store.get('uos-links', []) || [],
  recent: (store.get('uos-recent', []) || []).filter(r => r && r.url),
  history: store.get('uos-history', []) || [],
  bookmarks: store.get('uos-bookmarks', []) || [],
  closed: [],
  gameFilter: { q: '', tag: 'All' },
  extras: null, extrasShown: EXTRAS_PAGE, extrasErr: '',
  frameZoom: {},
  favs: store.get('uos-favs', null) || GAMES.filter(g => !g.noFav).map(g => g.id),
  reqAll: false, reqList: [],
};
const saveCfg = () => store.set('uos-cfg', cfg);
// New games get added to favorites once for people who already have a saved list.
if (!store.get('uos-seen-duel', false)) { if (!app.favs.includes('duel')) app.favs.unshift('duel'); store.set('uos-favs', app.favs); store.set('uos-seen-duel', true); }
sfx.enabled = cfg.sound !== false;

/* ═══════════════ Helpers ═══════════════ */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hostOf = u => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return String(u); } };
const fav = (domain, sz = 64) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`;
const svg = (id, cls = '') => `<svg class="${cls}"><use href="#${id}"/></svg>`;
const isTabId = id => /^t\d+$/.test(id);
const hashHue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

function toast(msg, kind) {
  const el = $('toast');
  el.textContent = msg; el.dataset.kind = kind || '';
  restart(el, 'show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600);
  if (kind === 'ok') sfx.chime(); else if (kind === 'err') sfx.error();
}

function looksLikeURL(raw) {
  return /^https?:\/\//i.test(raw) || (!/\s/.test(raw) && /^[^/\s]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(raw)) || /^localhost(:\d+)?(\/|$)/i.test(raw);
}
function resolveURL(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^localhost(:\d+)?(\/|$)/i.test(raw)) return 'http://' + raw;
  if (looksLikeURL(raw)) return 'https://' + raw;
  return (ENGINES[cfg.engine] || ENGINES.ddg).url(encodeURIComponent(raw));
}

function loadbar(on) {
  const lb = $('loadbar');
  if (on) { lb.classList.remove('done'); restart(lb, 'on'); }
  else { lb.classList.remove('on'); lb.classList.add('done'); }
}

/* ═══════════════ Proxy init ═══════════════ */
window._uvReady = false;
const uvReady = new Promise(resolve => {
  window.addEventListener('DOMContentLoaded', async () => {
    if (window._uvFail || typeof __uv$config === 'undefined' || !navigator.serviceWorker) { resolve(false); return; }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: __uv$config.prefix, updateViaCache: 'none' });
      await new Promise(done => {
        if (reg.active) return done();
        const w = reg.installing || reg.waiting;
        w?.addEventListener('statechange', e => e.target.state === 'activated' && done());
        setTimeout(done, 5000);
      });
      const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
      if (!(await conn.getTransport())) {
        const wisp = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/wisp/';
        await conn.setTransport('/epoxy/index.mjs', [{ wisp }]);
      }
      window._uvReady = true;
      $('px-dot').classList.remove('off'); $('px-dot').title = 'Proxy ready';
      syncAdblock();
      resolve(true);
    } catch (err) {
      console.error('[proxy] init failed:', err);
      resolve(false);
    }
  });
});

async function syncAdblock() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(__uv$config.prefix);
    reg?.active?.postMessage({ type: 'SET_ADBLOCK', value: cfg.adblock !== false });
  } catch {}
}

/* ═══════════════ Views ═══════════════ */
function stopFrame(frame) {
  if (!frame || !frame.src || frame.src === 'about:blank') return;
  frame._loadToken = (frame._loadToken || 0) + 1;
  frame.onload = null;
  frame.dataset.suspended = 'true';
  try { frame.contentDocument?.querySelectorAll('audio,video').forEach(m => m.pause()); } catch {}
  frame.removeAttribute('srcdoc');
  frame.src = 'about:blank';
}

// Only one thing plays at a time: leaving a view unloads its frame so audio and CPU stop.
function stopAllRunningContent(keepId = null) {
  document.querySelectorAll('#frames iframe').forEach(f => { if (f.id !== keepId) stopFrame(f); });
  if (keepId !== 'movies-frame') _moviesLoaded = false;
}

function viewKind(id) { return id.startsWith('game-') ? 'game' : isTabId(id) ? 'tab' : id; }

function showView(id) {
  const slotId = id === 'home' ? 'slot-home' : 'slot-' + id;
  const changed = app.active !== id;
  document.querySelectorAll('.fslot').forEach(s => {
    const on = s.id === slotId;
    s.classList.toggle('active', on);
    if (on && changed) restart(s, 'enter');
  });
  if (changed && clicker.running && clicker.frame && !$(slotId)?.contains(clicker.frame)) stopClicking();
  if (changed) { closeFind(); hideMenus(); }
  app.prevView = app.active;
  app.active = id;
  const kind = viewKind(id);
  document.body.dataset.view = kind;
  const nav = kind === 'game' ? 'games' : kind;
  document.querySelectorAll('.rail-btn[data-nav]').forEach(b => {
    const on = b.dataset.nav === nav;
    if (on) { b.setAttribute('aria-current', 'page'); if (changed) restart(b, 'bump'); }
    else b.removeAttribute('aria-current');
  });
  const tab = app.tabs.find(t => t.id === id);
  $('addr-input').value = tab?.url || '';
  if (kind !== 'tab' && kind !== 'movies') loadbar(false);
  updateToolbar();
  renderTabs();
  renderBookmarksBar();
  window.bg?.kick();
  window.desktop?.sync();
}

function nav(fn) { return (...a) => { const before = app.active; fn(...a); if (app.active !== before) sfx.nav(); }; }

const goHome = nav(() => {
  stopAllRunningContent();
  showView('home');
  renderRecent();
});

function toggleRail(force) {
  cfg.railOpen = force ?? !cfg.railOpen;
  document.documentElement.classList.toggle('rail-collapsed', !cfg.railOpen);
  setSwitch('sw-railOpen', cfg.railOpen);
  saveCfg();
  sfx.toggle(cfg.railOpen);
  setTimeout(() => dispatchEvent(new Event('resize')), 260);
}

/* ═══════════════ Tabs ═══════════════ */
function makeTabFrame(id) {
  const slot = document.createElement('section');
  slot.className = 'fslot'; slot.id = 'slot-' + id;
  const iframe = document.createElement('iframe');
  iframe.className = 'pf'; iframe.id = 'ifr-' + id; iframe.title = 'Browser tab';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-presentation allow-downloads allow-modals');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; gamepad');
  iframe.allowFullscreen = true;
  slot.appendChild(iframe);
  $('frames').appendChild(slot);
  return iframe;
}

function newTab(url, { background = false } = {}) {
  const id = 't' + (++app.tc);
  app.tabs.push({ id, title: url ? hostOf(url) : 'New tab', url: url || '', fav: url ? fav(hostOf(url), 32) : '', fresh: true, zoom: 1 });
  const iframe = makeTabFrame(id);
  sfx.pop();
  if (background) { renderTabs(); if (url) $('ifr-' + id).dataset.suspended = 'true'; return id; }
  switchTab(id);
  if (url) loadURL(id, url);
  else {
    iframe.srcdoc = newTabPage(id);
    setTimeout(() => $('addr-input').focus(), 30);
  }
  return id;
}

// The new-tab page is a same-origin srcdoc, so it can call back into this window.
function newTabPage(id) {
  const tiles = allLinks().slice(0, 10).map(l => `<a href="#" onclick="parent.ntGo('${id}', this.dataset.u);return false" data-u="${esc(l.url)}"><span><img src="${fav(hostOf(l.url))}" alt="" onerror="this.remove()"></span>${esc(l.label)}</a>`).join('');
  const acc = cfg.accent || ACCENTS[0];
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{height:100%;margin:0;background:#0f1012;color:#ececee;font:14px -apple-system,"Segoe UI",Roboto,sans-serif}
    body{display:flex;flex-direction:column;align-items:center;padding-top:16vh;box-sizing:border-box;background:radial-gradient(700px 400px at 50% -80px,${acc}22,transparent 70%),#0f1012}
    h1{font:800 34px Unbounded,system-ui,sans-serif;letter-spacing:-.03em;margin:0 0 22px}
    h1 i{color:${acc};font-style:normal}
    form{width:min(580px,90vw);display:flex;gap:10px;align-items:center;height:50px;padding:0 8px 0 18px;border-radius:14px;background:#18191d;border:1px solid #36383e}
    form:focus-within{border-color:${acc};box-shadow:0 0 0 4px ${acc}29}
    input{flex:1;background:none;border:0;outline:0;color:inherit;font:inherit;font-size:16px}
    button{height:36px;padding:0 16px;border:0;border-radius:10px;background:${acc};color:#140e24;font-weight:650;cursor:pointer}
    nav{display:grid;grid-template-columns:repeat(5,96px);gap:6px;margin-top:26px}
    a{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 4px;border-radius:12px;color:#a1a3a9;text-decoration:none;font-size:12.5px}
    a:hover{background:#18191d;color:#ececee} a span{width:48px;height:48px;border-radius:14px;background:#1f2025;border:1px solid #2a2c31;display:grid;place-items:center}
    a img{width:24px;height:24px;border-radius:5px}
  </style><h1>New tab<i>.</i></h1>
  <form onsubmit="parent.ntGo('${id}', this.q.value);return false"><input name="q" placeholder="Search or type a URL" autofocus autocomplete="off"><button>Go</button></form>
  <nav>${tiles}</nav>`;
}
window.ntGo = (id, v) => { if (!v?.trim()) return; const url = resolveURL(v); remember({ type: 'site', label: hostOf(url), url }); loadURL(id, url); };

function switchTab(id) {
  const changed = app.active !== id;
  stopAllRunningContent('ifr-' + id);
  showView(id);
  if (changed) sfx.tick();
  const tab = app.tabs.find(t => t.id === id);
  const frame = $('ifr-' + id);
  if (frame?.dataset.suspended && tab?.url) loadURL(id, tab.url);
}

function closeTab(id, e) {
  e?.stopPropagation();
  const i = app.tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const el = $('tabs').querySelector(`[data-id="${id}"]`);
  const finish = () => {
    const j = app.tabs.findIndex(t => t.id === id);
    if (j < 0) return;
    const [t] = app.tabs.splice(j, 1);
    if (t.url) { app.closed.push({ url: t.url, title: t.title }); if (app.closed.length > 20) app.closed.shift(); }
    $('slot-' + id)?.remove();
    if (app.active === id) app.tabs.length ? switchTab(app.tabs[Math.max(0, j - 1)].id) : goHome();
    else renderTabs();
  };
  sfx.close();
  if (el && !matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('leaving'); setTimeout(finish, 170); }
  else finish();
}

function closeOtherTabs(id) {
  app.tabs.filter(t => t.id !== id).forEach(t => {
    if (t.url) app.closed.push({ url: t.url, title: t.title });
    $('slot-' + t.id)?.remove();
  });
  app.tabs = app.tabs.filter(t => t.id === id);
  switchTab(id);
  sfx.close();
}

function reopenClosed() {
  const t = app.closed.pop();
  if (!t) return toast('No closed tabs to reopen');
  newTab(t.url);
}
function duplicateTab(id = app.active) {
  const t = app.tabs.find(x => x.id === id);
  if (t?.url) newTab(t.url);
}

function renderTabs() {
  document.body.classList.toggle('has-tabs', app.tabs.length > 0);
  const bar = $('tabs');
  bar.innerHTML = app.tabs.map((t, i) => `
    <div class="tab${t.id === app.active ? ' active' : ''}${t.fresh ? ' enter' : ''}${t.loading ? ' loading' : ''}" role="tab" tabindex="0" draggable="true"
      aria-selected="${t.id === app.active}" data-id="${t.id}" title="${esc(t.title)}${i < 9 ? ` (Alt+${i + 1})` : ''}">
      <span class="tab-ico">${t.loading ? '<span class="tab-spin"></span>' : t.fav ? `<img src="${esc(t.fav)}" alt="" width="16" height="16" onerror="this.remove()">` : svg('i-globe', 'globe')}</span>
      <span class="tab-title">${esc(t.title)}</span>
      ${t.muted ? `<span class="tab-mute" title="Muted">${svg('i-mute')}</span>` : ''}
      <button class="tab-x" data-close="${t.id}" aria-label="Close tab">${svg('i-x')}</button>
    </div>`).join('');
  app.tabs.forEach(t => { t.fresh = false; });
  bar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  window.desktop?.renderRunning?.();
}
$('tabs').addEventListener('click', e => {
  const x = e.target.closest('[data-close]');
  if (x) return closeTab(x.dataset.close, e);
  const t = e.target.closest('.tab');
  if (t) switchTab(t.dataset.id);
});
$('tabs').addEventListener('auxclick', e => { const t = e.target.closest('.tab'); if (e.button === 1 && t) closeTab(t.dataset.id, e); });
$('tabs').addEventListener('keydown', e => { const t = e.target.closest('.tab'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchTab(t.dataset.id); } });
$('tabs').addEventListener('contextmenu', e => {
  const t = e.target.closest('.tab'); if (!t) return;
  e.preventDefault();
  openTabMenu(t.dataset.id, e.clientX, e.clientY);
});
// Drag to reorder
let dragId = null;
$('tabs').addEventListener('dragstart', e => { const t = e.target.closest('.tab'); if (!t) return; dragId = t.dataset.id; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
$('tabs').addEventListener('dragend', () => { dragId = null; renderTabs(); });
$('tabs').addEventListener('dragover', e => {
  const t = e.target.closest('.tab'); if (!t || !dragId || t.dataset.id === dragId) return;
  e.preventDefault();
  const from = app.tabs.findIndex(x => x.id === dragId), to = app.tabs.findIndex(x => x.id === t.dataset.id);
  const r = t.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
  const [moved] = app.tabs.splice(from, 1);
  let idx = app.tabs.findIndex(x => x.id === t.dataset.id) + (after ? 1 : 0);
  if (idx === from && to === from) return;
  app.tabs.splice(idx, 0, moved);
  const el = $('tabs').querySelector(`[data-id="${dragId}"]`);
  after ? t.after(el) : t.before(el);
});

function setTabLoading(id, on) {
  const t = app.tabs.find(x => x.id === id); if (!t) return;
  t.loading = on; renderTabs();
  if (id === app.active) updateToolbar();
}

async function loadURL(tabId, url) {
  const iframe = $('ifr-' + tabId);
  if (!iframe) return;
  const token = (iframe._loadToken || 0) + 1;
  iframe._loadToken = token;
  delete iframe.dataset.suspended;

  const tab = app.tabs.find(t => t.id === tabId);
  const host = hostOf(url);
  if (tab) { tab.url = url; tab.title = host; tab.fav = fav(host, 32); tab.loading = true; tab.loadedAt = Date.now(); }
  if (app.active === tabId) { $('addr-input').value = url; updateToolbar(); }
  renderTabs();
  loadbar(true);

  const ok = window._uvReady || await Promise.race([uvReady, new Promise(r => setTimeout(() => r(false), 6000))]);
  if (iframe._loadToken !== token) return;

  if (!ok) {
    loadbar(false); setTabLoading(tabId, false);
    iframe.srcdoc = `<!doctype html><style>html,body{height:100%;margin:0;background:#0f1012;color:#ececee;font:14px/1.5 system-ui,sans-serif;display:grid;place-items:center;text-align:center}div{max-width:360px;padding:24px}p{color:#a1a3a9}</style>
      <div><h3 style="font-weight:600;margin:0 0 6px">Couldn't open ${esc(host)}</h3><p>The proxy didn't start. Refresh the page and try again. If it keeps happening, the server is probably down.</p></div>`;
    return;
  }

  iframe.removeAttribute('srcdoc');
  await new Promise(r => requestAnimationFrame(r));
  if (iframe._loadToken !== token) return;
  iframe.onload = () => {
    if (!iframe.src || iframe.src.endsWith('about:blank')) return;
    loadbar(false);
    const t = app.tabs.find(x => x.id === tabId);
    if (!t) return;
    t.loading = false; t.loadedAt = Date.now();
    try {
      const doc = iframe.contentDocument;
      if (doc?.title) t.title = doc.title;
      // Keep the address bar honest as the user clicks around inside the page.
      const real = __uv$config.decodeUrl(iframe.contentWindow.location.href.split(__uv$config.prefix)[1] || '');
      if (/^https?:/i.test(real)) { t.url = real; t.fav = fav(hostOf(real), 32); if (app.active === tabId) $('addr-input').value = real; }
    } catch {}
    addHistory(t.url, t.title);
    applyFramePrefs(iframe, t);
    renderTabs();
    if (app.active === tabId) updateToolbar();
  };
  iframe.src = __uv$config.prefix + __uv$config.encodeUrl(url);
}

function go(raw, opts = {}) {
  const url = resolveURL(raw);
  if (!url) return;
  remember({ type: 'site', label: hostOf(url), url });
  if (!opts.newTab && isTabId(app.active) && $('ifr-' + app.active)) loadURL(app.active, url);
  else newTab(url);
}
function navFromBar() { hideSuggest(); const v = $('addr-input').value; if (v.trim()) { go(v); $('addr-input').blur(); } }
function homeGo() { hideSuggest(); const i = $('home-inp'); if (i.value.trim()) { go(i.value); i.value = ''; } }

function activeFrame() {
  if (app.active === 'movies') return $('movies-frame');
  if (app.active.startsWith('game-')) return $('game-frame-' + app.active.slice(5));
  return $('ifr-' + app.active);
}
function frameDoc(f = activeFrame()) { try { return f?.contentDocument || null; } catch { return null; } }
function histBack() { try { activeFrame()?.contentWindow?.history.back(); } catch {} }
function histFwd()  { try { activeFrame()?.contentWindow?.history.forward(); } catch {} }
function reloadTab() {
  if (app.active === 'movies') { _moviesLoaded = false; stopFrame($('movies-frame')); return openMovies(); }
  if (app.active.startsWith('game-')) { const g = findGame(app.active.slice(5)); return g && launchGame(g); }
  const tab = app.tabs.find(t => t.id === app.active);
  if (tab?.url) loadURL(tab.id, tab.url);
}
function reloadOrStop() {
  const t = app.tabs.find(x => x.id === app.active);
  if (t?.loading) {
    try { activeFrame()?.contentWindow?.stop(); } catch {}
    t.loading = false; loadbar(false); renderTabs(); updateToolbar();
  } else reloadTab();
}

function updateToolbar() {
  const t = app.tabs.find(x => x.id === app.active);
  const url = t?.url || '';
  $('omni-lock').classList.toggle('secure', url.startsWith('https:'));
  $('omni-lock').hidden = !url;
  $('reload-btn').innerHTML = t?.loading ? svg('i-x') : svg('i-reload');
  $('reload-btn').title = t?.loading ? 'Stop' : 'Reload';
  const bm = url && app.bookmarks.some(b => b.url === url);
  const star = $('star-btn');
  star.innerHTML = svg(bm ? 'i-bookmark-fill' : 'i-bookmark');
  star.classList.toggle('on', !!bm);
  star.hidden = !url;
  const z = app.frameZoom[activeFrame()?.id] || 1;
  $('zoom-badge').hidden = z === 1;
  $('zoom-badge').textContent = Math.round(z * 100) + '%';
  $('clicker-tb').classList.toggle('on', clicker.running);
}

/* ═══════════════ Per-frame tools: zoom, dark, mute, find, PiP, auto refresh ═══════════════ */
function applyFramePrefs(frame, tab) {
  const doc = frameDoc(frame);
  if (!doc) return;
  const z = app.frameZoom[frame.id] || 1;
  if (z !== 1) doc.documentElement.style.zoom = z;
  if (tab?.dark) setPageDark(doc, true);
  if (tab?.muted) setPageMuted(doc, true);
  relayHotkeys(frame);
}

// Alt shortcuts should still work while focus is inside a site or game.
function relayHotkeys(frame) {
  try {
    const w = frame.contentWindow;
    if (!w || w.__uosRelay) return;
    w.__uosRelay = true;
    w.addEventListener('keydown', e => { if (e.altKey && handleHotkey(e)) e.preventDefault(); }, true);
    // Games like Minecraft cancel mousedown, which stops the browser from giving the frame
    // keyboard focus when you click back into it. Hand focus over ourselves.
    w.addEventListener('pointerdown', () => {
      if (document.activeElement === frame && w.document.hasFocus()) return;
      try { frame.focus(); w.focus(); } catch {}
    }, true);
  } catch {}
}

const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
function setZoom(z) {
  const f = activeFrame(); if (!f) return;
  app.frameZoom[f.id] = z;
  const doc = frameDoc(f);
  if (doc) doc.documentElement.style.zoom = z === 1 ? '' : z;
  $('zoom-val').textContent = Math.round(z * 100) + '%';
  updateToolbar(); sfx.tick();
}
function stepZoom(dir) {
  const cur = app.frameZoom[activeFrame()?.id] || 1;
  const i = ZOOMS.findIndex(z => z >= cur - 0.001);
  setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 5 : i) + dir))]);
}

function setPageDark(doc, on) {
  let st = doc.getElementById('__uos-dark');
  if (on && !st) {
    st = doc.createElement('style'); st.id = '__uos-dark';
    st.textContent = 'html{filter:invert(.9) hue-rotate(180deg)!important;background:#fff}img,video,picture,canvas,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
    (doc.head || doc.documentElement).appendChild(st);
  } else if (!on && st) st.remove();
}
function togglePageDark() {
  const t = app.tabs.find(x => x.id === app.active); if (!t) return;
  t.dark = !t.dark;
  const doc = frameDoc(); if (doc) setPageDark(doc, t.dark);
  sfx.toggle(t.dark); hideMenus();
}

function setPageMuted(doc, on) {
  const apply = root => root.querySelectorAll('audio,video').forEach(m => { m.muted = on; });
  apply(doc);
  doc.__uosMuteObs?.disconnect();
  if (on) {
    const obs = new MutationObserver(() => apply(doc));
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    doc.__uosMuteObs = obs;
  }
}
function toggleMute(id = app.active) {
  const t = app.tabs.find(x => x.id === id); if (!t) return;
  t.muted = !t.muted;
  const doc = frameDoc($('ifr-' + id)); if (doc) setPageMuted(doc, t.muted);
  renderTabs(); hideMenus(); sfx.toggle(!t.muted);
  toast(t.muted ? 'Tab muted' : 'Tab unmuted');
}

const AR_STEPS = [0, 30, 60, 300];
function cycleAutoRefresh() {
  const t = app.tabs.find(x => x.id === app.active); if (!t) return;
  t.ar = AR_STEPS[(AR_STEPS.indexOf(t.ar || 0) + 1) % AR_STEPS.length];
  t.loadedAt = Date.now();
  $('ar-val').textContent = arLabel(t.ar);
  toast(t.ar ? `Refreshing every ${arLabel(t.ar)}` : 'Auto refresh off');
}
const arLabel = s => !s ? 'Off' : s < 60 ? s + 's' : (s / 60) + ' min';
setInterval(() => {
  const t = app.tabs.find(x => x.id === app.active);
  if (t?.ar && !t.loading && !document.hidden && Date.now() - (t.loadedAt || 0) > t.ar * 1000) loadURL(t.id, t.url);
}, 1000);

async function pictureInPicture() {
  hideMenus();
  const vids = [];
  const collect = d => { if (!d) return; d.querySelectorAll('video').forEach(v => vids.push(v)); d.querySelectorAll('iframe').forEach(f => { try { collect(f.contentDocument); } catch {} }); };
  collect(frameDoc());
  const v = vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
  if (!v) return toast("There's no video on this page", 'err');
  try { await v.requestPictureInPicture(); } catch { toast("This video won't pop out", 'err'); }
}

async function copyLink() {
  hideMenus();
  const t = app.tabs.find(x => x.id === app.active); if (!t?.url) return;
  try { await navigator.clipboard.writeText(t.url); toast('Link copied', 'ok'); }
  catch { toast("Couldn't copy the link", 'err'); }
}

/* Find in page */
function openFind() {
  hideMenus();
  if (!frameDoc()) return toast("Can't search inside this page", 'err');
  $('findbar').hidden = false; restart($('findbar'), 'enter');
  const i = $('find-inp'); i.focus(); i.select();
  sfx.open();
}
function closeFind() { if (!$('findbar').hidden) { $('findbar').hidden = true; $('find-count').textContent = ''; } }
function findStep(forward = true) {
  const q = $('find-inp').value; const f = activeFrame(); const doc = frameDoc(f);
  if (!q || !doc) return;
  const w = f.contentWindow;
  if (q !== findStep.last) { w.getSelection()?.removeAllRanges(); findStep.last = q; }
  const found = w.find(q, false, !forward, true, false, false, false);
  const text = (doc.body?.innerText || '').toLowerCase();
  let n = 0, i = -1; const ql = q.toLowerCase();
  while ((i = text.indexOf(ql, i + 1)) !== -1 && n < 999) n++;
  $('find-count').textContent = found ? `${n} match${n === 1 ? '' : 'es'}` : 'No matches';
  $('find-count').classList.toggle('none', !found);
  $('find-inp').focus();
}
$('find-inp').addEventListener('input', () => { findStep.last = null; if ($('find-inp').value) findStep(true); else $('find-count').textContent = ''; });
$('find-inp').addEventListener('keydown', e => { if (e.key === 'Escape') closeFind(); if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); findStep(false); } });

/* ═══════════════ Auto clicker ═══════════════ */
const clicker = { mode: 'spot', cps: 10, running: false, spot: null, frame: null, timer: 0, count: 0, follow: null, marker: null };

function toggleClickerPanel(force) {
  const p = $('clicker');
  const open = force ?? p.hidden;
  hideMenus();
  if (open) {
    if (!activeFrame() || !['tab', 'game'].includes(viewKind(app.active))) { toast('Open a site or game first, then use the auto clicker'); return; }
    p.hidden = false; restart(p, 'enter'); sfx.open();
  } else {
    p.hidden = true; cancelPick(); sfx.shut();
    const f = activeFrame(); if (f && viewKind(app.active) === 'game') { try { f.focus(); f.contentWindow?.focus(); } catch {} }
  }
}

document.querySelector('.seg').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  clicker.mode = b.dataset.mode;
  document.querySelectorAll('.seg [data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $('pick-btn').hidden = clicker.mode !== 'spot';
  clickerStatus();
  if (clicker.running) { stopClicking(); startClicking(); }
  sfx.tick();
});
$('cps').addEventListener('input', e => {
  clicker.cps = +e.target.value; $('cps-val').textContent = clicker.cps;
  if (clicker.running) { clearInterval(clicker.timer); schedule(); }
});

function clickerStatus(msg) {
  $('clicker-status').textContent = msg || (clicker.running
    ? `Clicking... ${clicker.count.toLocaleString()} clicks`
    : clicker.mode === 'follow' ? 'Clicks wherever your mouse is over the page.'
    : clicker.spot ? 'Spot set. Press Start.' : 'Pick a spot on the page, then start.');
  $('clicker-go').textContent = clicker.running ? 'Stop' : 'Start';
  $('clicker-go').classList.toggle('danger-fill', clicker.running);
  $('clicker-tb').classList.toggle('on', clicker.running);
}

function pickSpot() {
  const f = activeFrame(); if (!f) return;
  if (!frameDoc(f)) return toast("This page blocks the auto clicker", 'err');
  cancelPick();
  const r = f.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'pick-layer'; layer.id = 'pick-layer';
  Object.assign(layer.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  layer.innerHTML = '<span>Click where it should click · Esc to cancel</span>';
  layer.addEventListener('click', e => {
    clicker.spot = { x: e.clientX - r.left, y: e.clientY - r.top };
    clicker.frame = f;
    cancelPick(); placeMarker(); clickerStatus(); sfx.pop();
  });
  document.body.appendChild(layer);
  sfx.tick();
}
function cancelPick() { $('pick-layer')?.remove(); }

function placeMarker() {
  clicker.marker?.remove();
  if (!clicker.spot || !clicker.frame) return;
  const m = document.createElement('div');
  m.className = 'click-marker';
  m.style.left = (clicker.frame.offsetLeft + clicker.spot.x) + 'px';
  m.style.top = (clicker.frame.offsetTop + clicker.spot.y) + 'px';
  clicker.frame.parentElement.appendChild(m);
  clicker.marker = m;
}

// Dispatch a full press/release/click at (x, y) in frame coordinates. Recurses into
// same-origin nested iframes so it works on games embedded inside pages.
function fireClick(doc, x, y, depth = 0) {
  const win = doc.defaultView;
  const el = doc.elementFromPoint(x, y);
  if (!el) return false;
  if (el.tagName === 'IFRAME' && depth < 3) {
    try {
      const r = el.getBoundingClientRect();
      if (el.contentDocument) return fireClick(el.contentDocument, x - r.left, y - r.top, depth + 1);
    } catch {}
  }
  const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, view: win, button: 0 };
  const P = win.PointerEvent || win.MouseEvent, M = win.MouseEvent;
  el.dispatchEvent(new P('pointerdown', { ...base, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new M('mousedown', { ...base, buttons: 1 }));
  el.dispatchEvent(new P('pointerup', { ...base, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new M('mouseup', { ...base, buttons: 0 }));
  el.dispatchEvent(new M('click', { ...base, buttons: 0, detail: 1 }));
  return true;
}

function schedule() {
  // Timers bottom out around 4 ms, so high speeds batch several clicks per tick.
  const interval = Math.max(10, 1000 / clicker.cps);
  const perTick = Math.max(1, Math.round(clicker.cps * interval / 1000));
  let lastUi = 0;
  clicker.timer = setInterval(() => {
    const doc = frameDoc(clicker.frame);
    if (!doc) { stopClicking('The page changed, so the auto clicker stopped.'); return; }
    const pt = clicker.mode === 'follow' ? clicker.follow : clicker.spot;
    if (!pt) return;
    for (let i = 0; i < perTick; i++) if (fireClick(doc, pt.x, pt.y)) clicker.count++;
    const now = performance.now();
    if (now - lastUi > 120) {
      lastUi = now; clickerStatus();
    }
  }, interval);
}

// Games like Minecraft capture the mouse (pointer lock) when clicked. Browsers only allow that
// after a real click, so fake clicks make the game ask over and over, fail, and get stuck between
// its pause menu and "grabbing" the mouse, which also swallows the keyboard. While the auto
// clicker runs, lock requests without a real user gesture are ignored. Everything is restored on stop.
function guardPointerLock(win, on) {
  const visit = w => {
    try {
      const proto = w.Element.prototype;
      if (on && !proto.__uosOrigLock) {
        proto.__uosOrigLock = proto.requestPointerLock;
        proto.requestPointerLock = function (...a) {
          if (w.navigator.userActivation && !w.navigator.userActivation.isActive) return Promise.resolve();
          return proto.__uosOrigLock.apply(this, a);
        };
      } else if (!on && proto.__uosOrigLock) {
        proto.requestPointerLock = proto.__uosOrigLock;
        delete proto.__uosOrigLock;
      }
      w.document.querySelectorAll('iframe').forEach(f => { try { visit(f.contentWindow); } catch {} });
    } catch {}
  };
  visit(win);
}

function startClicking() {
  const f = activeFrame();
  if (!f || !frameDoc(f)) return toast("The auto clicker can't reach this page", 'err');
  if (clicker.mode === 'spot' && (!clicker.spot || clicker.frame !== f)) { toggleClickerPanel(true); return pickSpot(); }
  clicker.frame = f; clicker.running = true; clicker.count = 0;
  guardPointerLock(f.contentWindow, true);
  if (clicker.mode === 'follow') {
    const doc = frameDoc(f);
    clicker.follow = null;
    clicker._move = e => { clicker.follow = { x: e.clientX, y: e.clientY }; };
    clicker._leave = () => { clicker.follow = null; };
    doc.addEventListener('mousemove', clicker._move, true);
    doc.addEventListener('mouseleave', clicker._leave, true);
  }
  schedule(); clickerStatus(); updateToolbar(); sfx.pop();
  toast(`Auto clicker on · ${clicker.cps}/sec`);
}
function stopClicking(msg) {
  if (!clicker.running) return;
  clearInterval(clicker.timer);
  clicker.running = false;
  const f = clicker.frame;
  try { const d = frameDoc(f); d?.removeEventListener('mousemove', clicker._move, true); d?.removeEventListener('mouseleave', clicker._leave, true); } catch {}
  try {
    // Release any "held" button the game may think is down, then give the game its keyboard back.
    const d = frameDoc(f), pt = clicker.mode === 'follow' ? clicker.follow : clicker.spot;
    if (d && pt) { const el = d.elementFromPoint(pt.x, pt.y); const W = d.defaultView; el?.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, clientX: pt.x, clientY: pt.y, button: 0, buttons: 0 })); }
    guardPointerLock(f.contentWindow, false);
    if (viewKind(app.active) === 'game') { f.focus(); f.contentWindow?.focus(); }
  } catch {}
  clickerStatus(msg); updateToolbar(); sfx.close();
  toast(msg || `Auto clicker off · ${clicker.count.toLocaleString()} clicks`);
}
function toggleClicking() { clicker.running ? stopClicking() : startClicking(); }
addEventListener('resize', () => { if (clicker.marker) placeMarker(); cancelPick(); });

/* ═══════════════ Menus ═══════════════ */
function hideMenus() { document.querySelectorAll('.menu').forEach(m => { m.hidden = true; }); }
function placeMenu(m, x, y, alignRight) {
  m.hidden = false; restart(m, 'enter');
  const w = m.offsetWidth, h = m.offsetHeight;
  let left = alignRight ? x - w : x;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  const top = Math.max(8, Math.min(y, innerHeight - h - 8));
  m.style.left = left + 'px'; m.style.top = top + 'px';
}
function toggleMenu(e, name) {
  e.stopPropagation();
  const m = $('menu-' + name);
  if (!m.hidden) return hideMenus();
  hideMenus();
  const t = app.tabs.find(x => x.id === app.active);
  const kind = viewKind(app.active);
  m.querySelectorAll('[data-need]').forEach(el => {
    const need = el.dataset.need;
    el.hidden = need === 'tab' ? kind !== 'tab' : !(kind === 'tab' || kind === 'game');
  });
  m.querySelectorAll('[data-check]').forEach(i => {
    const k = i.dataset.check;
    i.classList.toggle('on', k === 'bookmarksBar' ? cfg.bookmarksBar : !!t?.[k === 'pageDark' ? 'dark' : k]);
  });
  $('zoom-val').textContent = Math.round((app.frameZoom[activeFrame()?.id] || 1) * 100) + '%';
  $('ar-val').textContent = arLabel(t?.ar);
  const r = e.currentTarget.getBoundingClientRect();
  placeMenu(m, r.right, r.bottom + 6, true);
  sfx.tick();
}
let menuTabId = null;
function openTabMenu(id, x, y) {
  hideMenus(); menuTabId = id;
  const t = app.tabs.find(v => v.id === id);
  $('menu-tab').querySelector('[data-act="mute"] span').textContent = t?.muted ? 'Unmute tab' : 'Mute tab';
  placeMenu($('menu-tab'), x, y);
  sfx.tick();
}
$('menu-tab').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = menuTabId; hideMenus();
  ({
    reload: () => { const t = app.tabs.find(v => v.id === id); if (t?.url) { if (app.active !== id) switchTab(id); else loadURL(id, t.url); } },
    dup: () => duplicateTab(id),
    mute: () => toggleMute(id),
    bookmark: () => { const t = app.tabs.find(v => v.id === id); if (t?.url) toggleBookmark(t); },
    others: () => closeOtherTabs(id),
    close: () => closeTab(id),
  })[b.dataset.act]?.();
});
document.querySelectorAll('.menu').forEach(m => m.addEventListener('click', e => {
  if (e.target.closest('button[role="menuitem"]') && !e.target.closest('.zoom-ctl')) setTimeout(hideMenus, 0);
}));
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu')) hideMenus(); });

/* ═══════════════ Bookmarks & history ═══════════════ */
function toggleBookmark(tab) {
  hideMenus();
  const t = tab || app.tabs.find(x => x.id === app.active);
  if (!t?.url) return;
  const i = app.bookmarks.findIndex(b => b.url === t.url);
  if (i >= 0) { app.bookmarks.splice(i, 1); toast('Bookmark removed'); sfx.close(); }
  else { app.bookmarks.push({ url: t.url, title: (t.title || hostOf(t.url)).slice(0, 80) }); toast('Bookmarked', 'ok'); }
  store.set('uos-bookmarks', app.bookmarks);
  updateToolbar(); renderBookmarksBar();
}
function renderBookmarksBar() {
  const bar = $('bookmarks-bar');
  const show = cfg.bookmarksBar && app.bookmarks.length > 0;
  document.body.classList.toggle('has-bookmarks', show);
  if (!show) { bar.innerHTML = ''; return; }
  bar.innerHTML = app.bookmarks.map((b, i) => `<button class="bm" data-i="${i}" title="${esc(b.url)}"><img src="${fav(hostOf(b.url), 32)}" alt="" onerror="this.remove()"><span>${esc(b.title)}</span><i class="bm-x" data-rm="${i}" title="Remove">${svg('i-x')}</i></button>`).join('');
}
$('bookmarks-bar').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { e.stopPropagation(); app.bookmarks.splice(+rm.dataset.rm, 1); store.set('uos-bookmarks', app.bookmarks); renderBookmarksBar(); updateToolbar(); sfx.close(); return; }
  const b = e.target.closest('[data-i]'); if (b) go(app.bookmarks[+b.dataset.i].url);
});
$('bookmarks-bar').addEventListener('auxclick', e => { const b = e.target.closest('[data-i]'); if (e.button === 1 && b) newTab(app.bookmarks[+b.dataset.i].url, { background: true }); });

function addHistory(url, title) {
  if (!url || !/^https?:/i.test(url)) return;
  const h = app.history;
  if (h[0]?.url === url) { h[0].title = title || h[0].title; h[0].t = Date.now(); }
  else h.unshift({ url, title: (title || hostOf(url)).slice(0, 120), t: Date.now() });
  if (h.length > 400) h.length = 400;
  store.set('uos-history', h);
}
function clearHistory() {
  app.history = []; app.recent = [];
  store.set('uos-history', []); store.set('uos-recent', []);
  renderRecent(); renderHistory();
  toast('History cleared', 'ok');
}

const openHistory = nav(() => {
  hideMenus();
  stopAllRunningContent();
  showView('history');
  renderHistory();
});
function renderHistory() {
  const q = ($('hist-q').value || '').toLowerCase();
  const items = app.history.filter(h => !q || h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q));
  if (!items.length) { $('history-list').innerHTML = `<p class="empty">${q ? 'Nothing matches.' : "Nothing here yet. Sites you open will show up here."}</p>`; return; }
  const day = t => { const d = new Date(t), n = new Date(); const y = new Date(n); y.setDate(n.getDate() - 1);
    return d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); };
  let cur = '', html = '';
  items.slice(0, 200).forEach(h => {
    const d = day(h.t);
    if (d !== cur) { cur = d; html += `<h3 class="hist-day">${d}</h3>`; }
    const i = app.history.indexOf(h);
    html += `<div class="hist-row" data-i="${i}"><time>${new Date(h.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><img src="${fav(hostOf(h.url), 32)}" alt="" onerror="this.style.visibility='hidden'"><span class="hist-title">${esc(h.title)}</span><span class="hist-host">${esc(hostOf(h.url))}</span><button class="icon-btn" data-del="${i}" aria-label="Remove">${svg('i-x')}</button></div>`;
  });
  $('history-list').innerHTML = html;
}
$('hist-q').addEventListener('input', renderHistory);
$('history-list').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { app.history.splice(+del.dataset.del, 1); store.set('uos-history', app.history); renderHistory(); sfx.close(); return; }
  const r = e.target.closest('[data-i]'); if (r) go(app.history[+r.dataset.i].url, { newTab: true });
});

/* ═══════════════ Omnibox suggestions ═══════════════ */
const sug = { input: null, items: [], idx: -1 };
function hideSuggest() { $('suggest-box').hidden = true; sug.idx = -1; sug.input = null; }
function updateSuggest(input) {
  const q = input.value.trim();
  const box = $('suggest-box');
  if (!q || document.activeElement !== input) return hideSuggest();
  const ql = q.toLowerCase();
  const items = [];
  if (looksLikeURL(q)) items.push({ kind: 'go', label: q, url: resolveURL(q) });
  items.push({ kind: 'search', label: q, url: resolveURL(looksLikeURL(q) ? ' ' + q : q) });
  const seen = new Set(items.map(i => i.url));
  const pool = [...app.bookmarks.map(b => ({ ...b, bm: true })), ...app.history];
  for (const p of pool) {
    if (items.length >= 7) break;
    if (seen.has(p.url)) continue;
    if ((p.title || '').toLowerCase().includes(ql) || p.url.toLowerCase().includes(ql)) { seen.add(p.url); items.push({ kind: p.bm ? 'bm' : 'hist', label: p.title, url: p.url }); }
  }
  sug.input = input; sug.items = items; sug.idx = -1;
  const engine = (ENGINES[cfg.engine] || ENGINES.ddg).name;
  box.innerHTML = items.map((it, i) => `<div class="sg" role="option" data-i="${i}">
    ${svg(it.kind === 'search' ? 'i-search' : it.kind === 'bm' ? 'i-bookmark-fill' : it.kind === 'hist' ? 'i-history' : 'i-globe')}
    <span class="sg-main">${esc(it.label)}</span>
    <span class="sg-sub">${it.kind === 'search' ? `${engine} search` : it.kind === 'go' ? 'Open site' : esc(hostOf(it.url))}</span></div>`).join('');
  const host = input.closest('form').getBoundingClientRect();
  Object.assign(box.style, { left: host.left + 'px', top: (host.bottom + 6) + 'px', width: host.width + 'px' });
  box.hidden = false;
}
function moveSuggest(d) {
  if ($('suggest-box').hidden) return;
  sug.idx = (sug.idx + d + sug.items.length + 1) % (sug.items.length + 1) - 1;
  if (sug.idx < -1) sug.idx = sug.items.length - 1;
  $('suggest-box').querySelectorAll('.sg').forEach((el, i) => el.classList.toggle('sel', i === sug.idx));
}
function pickSuggest(i) {
  const it = sug.items[i]; const input = sug.input; if (!it) return;
  hideSuggest(); input.value = ''; input.blur();
  remember({ type: 'site', label: hostOf(it.url), url: it.url });
  if (isTabId(app.active) && $('ifr-' + app.active)) loadURL(app.active, it.url); else newTab(it.url);
}
['addr-input', 'home-inp'].forEach(id => {
  const inp = $(id);
  inp.addEventListener('input', () => updateSuggest(inp));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(-1); }
    else if (e.key === 'Escape') hideSuggest();
    else if (e.key === 'Enter' && sug.idx >= 0) { e.preventDefault(); pickSuggest(sug.idx); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (sug.input === inp) hideSuggest(); }, 150));
});
$('suggest-box').addEventListener('pointerdown', e => { const s = e.target.closest('[data-i]'); if (s) { e.preventDefault(); pickSuggest(+s.dataset.i); } });

/* ═══════════════ Fullscreen / about:blank ═══════════════ */
function fsEl(el) {
  if (document.fullscreenElement || document.webkitFullscreenElement) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  el = el || document.documentElement;
  (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
}
function toggleFS() { hideMenus(); fsEl(activeFrame()); }

function openBlank(path) {
  hideMenus();
  const w = window.open('about:blank', '_blank');
  if (!w) return toast('Pop-ups are blocked. Allow them for this site, then try again.', 'err');
  const d = w.document;
  d.title = cfg.cloak ? cfg.cloakName : 'Universium';
  const icon = d.createElement('link'); icon.rel = 'icon'; icon.href = $('fav-icon').href; d.head.appendChild(icon);
  const st = d.createElement('style'); st.textContent = 'html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{border:0;width:100%;height:100%}';
  d.head.appendChild(st);
  const f = d.createElement('iframe');
  f.src = new URL(path || '/', location.href).href;
  f.allow = 'autoplay; fullscreen; encrypted-media; clipboard-write; gamepad; pointer-lock';
  f.allowFullscreen = true;
  d.body.appendChild(f);
  f.focus();
}

/* ═══════════════ Home ═══════════════ */
function tickClock() {
  const n = new Date();
  $('clk').textContent = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('clk-d').textContent = n.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function greet() {
  const h = new Date().getHours();
  $('greet').textContent = h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late?';
}

// One text run with a slow color sweep (CSS); no per-letter animation.
function buildWordmark() {
  if (!$('wordmark').firstChild) $('wordmark').innerHTML = '<span class="word">universium</span><span class="dot" aria-hidden="true"></span>';
}
const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

function allLinks() {
  const hidden = new Set(cfg.hiddenDefaults || []);
  return [
    ...DEFAULT_LINKS.filter(l => !hidden.has(l.url)).map(l => ({ ...l, def: true })),
    ...app.links.map((l, i) => ({ ...l, idx: i })),
  ];
}

function renderShortcuts() {
  $('shortcuts').innerHTML = allLinks().map((l, n) => {
    const d = hostOf(l.url);
    const key = l.def ? `d:${esc(l.url)}` : `c:${l.idx}`;
    return `<div class="sc" role="link" tabindex="0" data-url="${esc(l.url)}" style="--i:${n}">
      <span class="sc-ico"><img src="${fav(d)}" alt="" width="28" height="28" loading="lazy" decoding="async" data-letter="${esc(l.label.charAt(0).toUpperCase())}" onerror="favFail(this)"></span>
      <span class="sc-label">${esc(l.label)}</span>
      <button class="sc-rm" data-rm="${key}" aria-label="Remove ${esc(l.label)}" title="Remove">${svg('i-x')}</button>
    </div>`;
  }).join('') + `<button class="sc" onclick="toggleAddForm()"><span class="sc-ico">${svg('i-plus')}</span><span class="sc-label">Add</span></button>`;
  renderLinkList();
}
$('shortcuts').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { e.preventDefault(); e.stopPropagation(); return removeLink(rm.dataset.rm); }
  const a = e.target.closest('.sc[data-url]');
  if (a) go(a.dataset.url);
});
$('shortcuts').addEventListener('keydown', e => {
  const a = e.target.closest('.sc[data-url]');
  if (a && e.target === a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(a.dataset.url); }
});

function toggleAddForm(force) {
  const f = $('add-form');
  const open = force ?? !f.classList.contains('open');
  f.classList.toggle('open', open);
  if (open) { $('add-name').focus(); sfx.open(); }
}
function addLink(from) {
  const [ni, ui] = from === 'home' ? [$('add-name'), $('add-url')] : [$('ln'), $('lu')];
  const url = ui.value.trim();
  if (!url) { ui.focus(); return; }
  const label = ni.value.trim() || hostOf(url);
  app.links.push({ label, url });
  store.set('uos-links', app.links);
  ni.value = ui.value = '';
  if (from === 'home') toggleAddForm(false);
  renderShortcuts();
  toast(`Added ${label}`, 'ok');
}
function removeLink(key) {
  if (key.startsWith('d:')) { cfg.hiddenDefaults = [...new Set([...(cfg.hiddenDefaults || []), key.slice(2)])]; saveCfg(); }
  else { app.links.splice(+key.slice(2), 1); store.set('uos-links', app.links); }
  renderShortcuts(); sfx.close();
}
function restoreDefaults() { cfg.hiddenDefaults = []; saveCfg(); renderShortcuts(); }
function renderLinkList() {
  $('link-list').innerHTML = app.links.length
    ? app.links.map((l, i) => `<div class="li"><img src="${fav(hostOf(l.url), 32)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(l.label)} <small>${esc(hostOf(l.url))}</small></span><button class="icon-btn" style="width:26px;height:26px" onclick="removeLink('c:${i}')" aria-label="Remove">${svg('i-x')}</button></div>`).join('')
    : `<small style="color:var(--faint)">Nothing added yet.</small>`;
  $('restore-defaults').hidden = !(cfg.hiddenDefaults || []).length;
}

function remember(item) {
  app.recent = [item, ...app.recent.filter(r => r.url !== item.url)].slice(0, 6);
  store.set('uos-recent', app.recent);
}
function renderRecent() {
  $('recent-section').hidden = !app.recent.length;
  $('recent').innerHTML = app.recent.map((r, i) => {
    const g = r.type === 'game' && (findGame(r.id) || r.game);
    const thumb = g ? coverImg(g, true) : `<img class="fav" src="${fav(hostOf(r.url), 32)}" alt="" loading="lazy" onerror="this.remove()">`;
    return `<button class="recent-item" data-i="${i}"><span class="recent-thumb">${thumb}</span><span class="recent-text"><b>${esc(g ? g.name : r.label)}</b><small>${g ? esc(g.tag || 'Extra') : esc(hostOf(r.url))}</small></span></button>`;
  }).join('');
}
$('recent').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const r = app.recent[+b.dataset.i];
  const g = r?.type === 'game' && (findGame(r.id) || r.game);
  g ? launchGame(g) : r && go(r.url);
});

/* ═══════════════ Games ═══════════════ */
function favFail(img) { const s = document.createElement('span'); s.className = 'letter'; s.textContent = img.dataset.letter || ''; img.replaceWith(s); }
function coverFail(img) {
  const c = img.closest('.cover, .recent-thumb'); if (!c) return img.remove();
  c.querySelectorAll('img').forEach(i => i.remove());
  if (c.classList.contains('cover')) c.insertAdjacentHTML('afterbegin', genCover(img.dataset.name || ''));
}
function genCover(name) {
  const h = hashHue(name);
  const initials = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return `<span class="gen" style="--h:${h}"><b>${esc(initials)}</b><small>${esc(name)}</small></span>`;
}
function coverImg(g, small) {
  if (!g.thumb) return small ? '' : genCover(g.name);
  const src = esc(g.thumb), nm = esc(g.name);
  if (g.fit === 'contain') return `<img class="bd" src="${src}" alt="" loading="lazy" decoding="async" aria-hidden="true"><img class="fg contain" src="${src}" alt="" loading="lazy" decoding="async" data-name="${nm}" onerror="coverFail(this)">`;
  return `<img class="fg" src="${src}" alt="" loading="lazy" decoding="async" data-name="${nm}" onerror="coverFail(this)">`;
}
function gameCard(g, i = 0) {
  const fav = app.favs.includes(g.id);
  return `<button class="game" data-game="${esc(g.id)}" style="--i:${Math.min(i, 16)}">
    <div class="cover">${coverImg(g)}<span class="play-pill">${svg('i-play')}Play</span>
      <span class="fav-btn${fav ? ' on' : ''}" role="button" tabindex="0" data-fav="${esc(g.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">${svg(fav ? 'i-heart-fill' : 'i-heart')}</span>
    </div>
    <div class="game-meta"><span class="game-name">${esc(g.name)}</span><span class="game-tag">${esc(g.tag || 'Extra')}</span></div>
    ${g.desc ? `<p class="game-desc">${esc(g.desc)}</p>` : ''}
  </button>`;
}
function findGame(id) { return GAMES.find(g => g.id === id) || app.extras?.find(g => g.id === id) || app.recent.find(r => r.game?.id === id)?.game; }
function onGameClick(e) {
  const f = e.target.closest('[data-fav]');
  if (f) { e.preventDefault(); e.stopPropagation(); return toggleFav(f.dataset.fav, f); }
  const c = e.target.closest('[data-game]'); if (c) launchGame(findGame(c.dataset.game));
}
['game-grid', 'more-grid', 'home-games', 'extras-grid'].forEach(id => {
  $(id).addEventListener('click', onGameClick);
  $(id).addEventListener('keydown', e => { const f = e.target.closest('[data-fav]'); if (f && (e.key === 'Enter' || e.key === ' ')) onGameClick(e); });
});

/* Favorites: starts as the hand-picked list; heart or un-heart any game (extras too). */
function toggleFav(id, el) {
  const on = !app.favs.includes(id);
  app.favs = on ? [...app.favs, id] : app.favs.filter(x => x !== id);
  store.set('uos-favs', app.favs);
  if (el) { el.classList.toggle('on', on); el.innerHTML = svg(on ? 'i-heart-fill' : 'i-heart'); restart(el, 'pop'); }
  on ? sfx.pop() : sfx.close();
  toast(on ? 'Added to favorites' : 'Removed from favorites');
  setTimeout(() => { renderGameGrid(); renderHomeGames(); }, el ? 260 : 0);
}
const favGames = () => app.favs.map(findGame).filter(Boolean);

function renderHomeGames() {
  const list = favGames().slice(0, 8);
  $('home-games').innerHTML = list.length ? list.map(gameCard).join('') : `<p class="empty">Heart some games and they'll show up here.</p>`;
  $('home-games').querySelectorAll('.game-desc').forEach(p => p.remove());
}

/* Collapsible sections, remembered per browser. */
function toggleSection(name, force) {
  cfg.collapsed = cfg.collapsed || {};
  cfg.collapsed[name] = force ?? !cfg.collapsed[name];
  saveCfg(); applySections(); sfx.tick();
}
function applySections() {
  document.querySelectorAll('.gsec').forEach(sec => {
    const c = !!cfg.collapsed?.[sec.dataset.sec];
    sec.classList.toggle('collapsed', c);
    sec.querySelector('.gsec-head').setAttribute('aria-expanded', String(!c));
  });
}

function matches(g, needle) { return !needle || (g.name + ' ' + (g.tag || '') + ' ' + (g.desc || '')).toLowerCase().includes(needle); }
function renderGameGrid() {
  const { q, tag } = app.gameFilter;
  const needle = q.toLowerCase();
  const pass = g => (tag === 'All' || g.tag === tag) && matches(g, needle);
  const favs = favGames().filter(pass);
  const more = GAMES.filter(g => !app.favs.includes(g.id) && pass(g));
  $('game-grid').innerHTML = favs.length ? favs.map(gameCard).join('')
    : `<p class="empty" style="grid-column:1/-1">${q || tag !== 'All' ? 'No favorites match.' : 'No favorites yet. Tap the heart on any game.'}</p>`;
  $('fav-count').textContent = favs.length;
  $('more-grid').innerHTML = more.map(gameCard).join('');
  $('more-count').textContent = more.length;
  $('more-sec').hidden = !more.length;
  const total = GAMES.length + (app.extras?.length || 0);
  $('games-count').textContent = app.extras ? `${total} games to play.` : `${GAMES.length}+ games to play.`;
  $('pill-games').textContent = `${total} games`;
  renderExtras();
}
function renderExtras() {
  const grid = $('extras-grid'), more = $('extras-more');
  $('extras-sec').hidden = app.gameFilter.tag !== 'All';
  if (app.extrasErr) { grid.innerHTML = `<p class="empty" style="grid-column:1/-1">${esc(app.extrasErr)}</p>`; more.hidden = true; $('extras-count').textContent = ''; return; }
  if (!app.extras) { grid.innerHTML = Array.from({ length: 8 }, () => '<div class="game skel"><div class="cover"></div><div class="skel-line"></div></div>').join(''); more.hidden = true; return; }
  const needle = app.gameFilter.q.toLowerCase();
  const list = app.extras.filter(g => !app.favs.includes(g.id) && matches(g, needle));
  $('extras-count').textContent = list.length;
  grid.innerHTML = list.length ? list.slice(0, app.extrasShown).map(gameCard).join('') : `<p class="empty" style="grid-column:1/-1">No extras match "${esc(app.gameFilter.q)}".</p>`;
  more.hidden = list.length <= app.extrasShown;
  more.textContent = `Show more (${list.length - app.extrasShown} left)`;
}
function showMoreExtras() { app.extrasShown += EXTRAS_PAGE; renderExtras(); sfx.tick(); }

async function loadExtras() {
  if (app.extras || loadExtras.busy) return;
  loadExtras.busy = true;
  try {
    const r = await fetch('/api/extras');
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    app.extras = (data.games || []).map(g => ({ id: 'x-' + g.id, name: g.name, src: '/extras/' + g.path.split('/').map(encodeURIComponent).join('/'), thumb: g.thumb ? '/extras/' + g.thumb.split('/').map(encodeURIComponent).join('/') : '', tag: 'Extra', extra: true }));
    app.extrasErr = '';
  } catch {
    app.extrasErr = location.protocol === 'file:' ? 'Extras load from the server. Run it with npm start to see them.' : "Couldn't load extras right now. Try again in a bit.";
  }
  loadExtras.busy = false;
  renderGameGrid(); renderHomeGames();
}

function renderTagChips() {
  const tags = ['All', ...[...new Set(GAMES.map(g => g.tag))].sort()];
  $('tag-chips').innerHTML = tags.map(t => `<button class="chip" aria-pressed="${t === app.gameFilter.tag}" data-tag="${t}">${t}</button>`).join('');
}
$('tag-chips').addEventListener('click', e => {
  const c = e.target.closest('[data-tag]'); if (!c) return;
  app.gameFilter.tag = c.dataset.tag; renderTagChips(); renderGameGrid(); sfx.tick();
});
$('game-q').addEventListener('input', e => { app.gameFilter.q = e.target.value.trim(); app.extrasShown = EXTRAS_PAGE; renderGameGrid(); });

const openGames = nav(() => {
  stopAllRunningContent();
  const was = app.active;
  showView('games');
  if (was !== 'games') ['game-grid', 'more-grid'].forEach(id => restart($(id), 'stagger'));
  loadExtras(); loadRequests();
});

function launchGame(g) {
  if (!g) return;
  const key = g.id.replace(/[^a-z0-9_-]/gi, '_');
  stopAllRunningContent('game-frame-' + key);
  let slot = $('slot-game-' + key);
  if (!slot) {
    slot = document.createElement('section');
    slot.className = 'fslot'; slot.id = 'slot-game-' + key;
    slot.innerHTML = `
      <div class="player-bar">
        <button class="bar-btn" onclick="openGames()">${svg('i-back')}<span class="lbl">Games</span></button>
        <span class="player-title">${esc(g.name)}<small>${esc(g.tag || 'Extra')}</small></span>
        <button class="bar-btn" onclick="toggleClickerPanel()">${svg('i-cursor')}<span class="lbl">Auto clicker</span></button>
        <button class="bar-btn" onclick="reloadTab()">${svg('i-reload')}<span class="lbl">Restart</span></button>
        <button class="bar-btn" onclick="openBlank('${esc(g.src)}')">${svg('i-eye')}<span class="lbl">about:blank</span></button>
        <button class="bar-btn" onclick="fsEl($('game-frame-${key}'))">${svg('i-full')}<span class="lbl">Fullscreen</span></button>
      </div>
      <div class="stage">
        <div class="loader" id="game-loader-${key}">
          ${g.thumb ? `<div class="loader-cover cover">${coverImg(g)}</div>` : ''}
          <div class="spinner"></div>
          <p>Loading ${esc(g.name)}${g.heavy ? `. This one's big (${g.heavy}), so the first load takes a minute. After that it's cached.` : '…'}</p>
        </div>
        <div class="focus-hint" id="game-hint-${key}">Click the game to use your keyboard</div>
        <iframe id="game-frame-${key}" class="pf" title="${esc(g.name)}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-presentation allow-downloads allow-modals"
          allow="autoplay; fullscreen; gamepad; clipboard-write; accelerometer; gyroscope"
          allowfullscreen></iframe>
      </div>`;
    $('frames').appendChild(slot);
  }
  const loader = $('game-loader-' + key), frame = $('game-frame-' + key), hint = $('game-hint-' + key);
  loader.classList.remove('hidden');
  frame.onload = () => {
    if (frame.src.endsWith('about:blank')) return;
    loader.classList.add('hidden');
    applyFramePrefs(frame);
    focusGame(frame, hint);
  };
  delete frame.dataset.suspended;
  frame.src = g.src;
  const before = app.active;
  showView('game-' + key);
  if (before !== app.active) sfx.launch();
  remember({ type: 'game', id: g.id, url: g.home || g.src, label: g.name, game: g.extra ? { id: g.id, name: g.name, src: g.src, thumb: g.thumb, tag: 'Extra', extra: true } : undefined });
}

// Duels with a match or invite in the URL ("?match=abc", "?invite=<friendId>").
function launchDuel(query = '') {
  const g = GAMES.find(x => x.id === 'duel');
  launchGame({ ...g, src: g.src + query, home: g.src });
}

// Keyboard events only reach an iframe that has focus. Hand focus to the game once it loads,
// and nudge the player to click if something steals it back.
function focusGame(frame, hint) {
  const tryFocus = () => { try { frame.focus(); frame.contentWindow?.focus(); } catch {} };
  tryFocus();
  setTimeout(tryFocus, 300);
  const check = () => {
    if (!frame.isConnected || frame.src.endsWith('about:blank')) { clearInterval(frame._focusTimer); hint.classList.remove('show'); return; }
    const visible = frame.closest('.fslot')?.classList.contains('active');
    const pickerOpen = !!$('pick-layer') || !$('clicker').hidden;
    hint.classList.toggle('show', visible && !pickerOpen && document.activeElement !== frame && document.hasFocus());
  };
  clearInterval(frame._focusTimer);
  frame._focusTimer = setInterval(check, 700);
}

/* ═══════════════ Game requests ═══════════════ */
async function loadRequests() {
  const box = $('requests');
  try {
    const r = await fetch('/api/game-requests');
    if (!r.ok) throw new Error();
    renderRequests((await r.json()).requests || []);
  } catch {
    box.innerHTML = `<p class="empty small">${location.protocol === 'file:' ? 'Requests need the server running.' : "Couldn't load requests right now."}</p>`;
  }
}
// Replies open under a request; which ones are open survives re-renders.
app.reqOpen = new Set();
const agoShort = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
function threadHtml(r) {
  const me = window.social?.state?.me;
  const replies = r.replies || [];
  return `<div class="req-thread">
    ${replies.length ? replies.map(rp => `
      <div class="rp${rp.admin ? ' staff' : ''}">
        <span class="av" style="--h:${rp.color ?? 260};--s:26px">${esc((rp.name || '?')[0].toUpperCase())}</span>
        <div class="rp-main">
          <div class="rp-head"><b>${esc(rp.name)}</b>${rp.admin ? '<em class="tag">Admin</em>' : ''}<time title="${new Date(rp.t).toLocaleString()}">${agoShort(rp.t)}</time></div>
          <p>${esc(rp.text)}</p>
        </div>
        ${me && (me.id === rp.uid || me.admin) ? `<button class="icon-btn rp-del" data-delreply="${esc(r.id)}:${esc(rp.id)}" title="Delete reply" aria-label="Delete reply">${svg('i-x')}</button>` : ''}
      </div>`).join('') : '<p class="rp-empty">No replies yet.</p>'}
    ${me ? `<form class="rp-form" data-reply="${esc(r.id)}">
        <input class="field" name="text" maxlength="300" placeholder="${me.admin ? 'Reply as admin…' : 'Write a reply…'}" autocomplete="off">
        <button class="btn primary sm" type="submit">Reply</button>
      </form>`
      : `<p class="rp-empty">Sign in on the <button class="link-btn" type="button" onclick="openFriends()">Friends</button> page to reply.</p>`}
  </div>`;
}
function renderRequests(list) {
  app.reqList = list;
  const shown = app.reqAll ? list.slice(0, 60) : list.slice(0, 5);
  // Keep the open threads (and anything half-typed) visible even when they'd be cut off.
  for (const id of app.reqOpen) { const r = list.find(x => x.id === id); if (r && !shown.includes(r)) shown.push(r); }
  const drafts = {};
  document.querySelectorAll('#requests .rp-form').forEach(f => { drafts[f.dataset.reply] = { v: f.text.value, focus: document.activeElement === f.text }; });
  const max = Math.max(1, ...list.map(r => r.votes));
  const t = $('req-toggle');
  t.hidden = list.length <= 5;
  t.textContent = app.reqAll ? 'Show less' : `See all ${list.length}`;
  $('requests').innerHTML = shown.length ? shown.map((r, i) => {
    const open = app.reqOpen.has(r.id), n = (r.replies || []).length, staff = (r.replies || []).some(x => x.admin);
    return `
    <div class="req${r.status === 'added' ? ' added' : ''}${open ? ' open' : ''}" style="--i:${Math.min(i, 12)}">
      <span class="req-rank">${list.indexOf(r) + 1}</span>
      <div class="req-body">
        <b>${esc(r.name)}</b>${r.status === 'added' ? '<span class="req-badge">Added</span>' : ''}
        ${r.note ? `<small>${esc(r.note)}</small>` : ''}
        <span class="req-bar"><i style="width:${Math.round(r.votes / max * 100)}%"></i></span>
        <button class="req-replies${staff ? ' staff' : ''}" data-thread="${esc(r.id)}" aria-expanded="${open}">${svg('i-chat')}${n ? `${n} repl${n === 1 ? 'y' : 'ies'}` : 'Reply'}${staff ? '<em>Admin replied</em>' : ''}</button>
      </div>
      <button class="vote${r.voted ? ' on' : ''}" data-vote="${esc(r.id)}" ${r.voted || r.status === 'added' ? 'disabled' : ''} aria-label="Vote for ${esc(r.name)}">${svg('i-up')}<b>${r.votes}</b></button>
      ${open ? threadHtml(r) : ''}
    </div>`;
  }).join('') : `<p class="empty small">No requests yet. Be the first.</p>`;
  document.querySelectorAll('#requests .rp-form').forEach(f => { const d = drafts[f.dataset.reply]; if (d) { f.text.value = d.v; if (d.focus) f.text.focus(); } });
}
function toggleAllRequests() { app.reqAll = !app.reqAll; renderRequests(app.reqList || []); sfx.tick(); }
async function reqApi(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : {} });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
$('requests').addEventListener('click', async e => {
  const th = e.target.closest('[data-thread]');
  if (th) {
    const id = th.dataset.thread;
    app.reqOpen.has(id) ? app.reqOpen.delete(id) : app.reqOpen.add(id);
    renderRequests(app.reqList || []); sfx.tick();
    if (app.reqOpen.has(id)) document.querySelector(`#requests .rp-form[data-reply="${CSS.escape(id)}"] input`)?.focus();
    return;
  }
  const del = e.target.closest('[data-delreply]');
  if (del) {
    const [id, rid] = del.dataset.delreply.split(':');
    if (!(await ui.confirm({ title: 'Delete this reply?', confirmText: 'Delete', danger: true }))) return;
    try { renderRequests((await reqApi(`/api/game-requests/${encodeURIComponent(id)}/replies/${encodeURIComponent(rid)}`, { method: 'DELETE' })).requests || []); toast('Reply deleted'); }
    catch (err) { toast(err.message, 'err'); }
    return;
  }
  const b = e.target.closest('[data-vote]'); if (!b || b.disabled) return;
  b.disabled = true; b.classList.add('on');
  const n = b.querySelector('b'); n.textContent = +n.textContent + 1;
  restart(b, 'bump'); sfx.pop();
  try {
    const r = await fetch(`/api/game-requests/${encodeURIComponent(b.dataset.vote)}/vote`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error);
    renderRequests(data.requests || []);
  } catch (err) { toast(err.message || "Your vote didn't go through", 'err'); loadRequests(); }
});
$('requests').addEventListener('submit', async e => {
  const f = e.target.closest('[data-reply]'); if (!f) return;
  e.preventDefault();
  const text = f.text.value.trim(); if (!text) return f.text.focus();
  const btn = f.querySelector('button'); btn.disabled = true;
  try {
    const d = await reqApi(`/api/game-requests/${encodeURIComponent(f.dataset.reply)}/replies`, { method: 'POST', body: JSON.stringify({ text }) });
    f.text.value = '';
    renderRequests(d.requests || []); sfx.send?.();
    document.querySelector(`#requests .rp-form[data-reply="${CSS.escape(f.dataset.reply)}"] input`)?.focus();
  } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
});
// Someone replied on a request I asked for or replied to.
function onRequestNotice(d) {
  if (d.kind !== 'reqreply') return;
  toast(`${d.from}${d.admin ? ' (admin)' : ''} replied ${d.mine ? 'to your request for' : 'on'} ${d.game}: "${d.text}"`);
  sfx.chime();
  app.reqOpen.add(d.id);
  if (app.active === 'games') loadRequests();
}

function openRequest() {
  $('req-scrim').hidden = false; restart($('req-scrim'), 'enter');
  $('req-msg').textContent = '';
  setTimeout(() => $('req-name').focus(), 50);
  sfx.open();
}
function closeRequest() { $('req-scrim').hidden = true; sfx.shut(); }
async function submitRequest() {
  const name = $('req-name').value.trim(), link = $('req-link').value.trim(), note = $('req-note').value.trim();
  if (name.length < 2) return $('req-name').focus();
  const btn = $('req-submit'); btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const r = await fetch('/api/game-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, link, note }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    $('req-form').reset(); closeRequest();
    toast(data.merged ? `Someone already asked for that, so it counts as a vote` : `Request sent. Thanks!`, 'ok');
    renderRequests(data.requests || []);
    if (app.active !== 'games') openGames();
    setTimeout(() => $('requests-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  } catch (err) {
    $('req-msg').textContent = location.protocol === 'file:' ? 'Requests need the server running.' : err.message;
    sfx.error();
  }
  btn.disabled = false; btn.textContent = 'Send request';
}

/* ═══════════════ Movies ═══════════════ */
// streamex.hn, loaded through the proxy. The frame's sandbox has no allow-popups or
// allow-top-navigation, so the site's pop-under ads and redirects can't escape it.
const MOVIES_URL = 'https://streamex.hn/';
let _moviesLoaded = false;
const moviesProxied = () => __uv$config.prefix + __uv$config.encodeUrl(MOVIES_URL);
const openMovies = nav(async () => {
  stopAllRunningContent('movies-frame');
  showView('movies');
  if (_moviesLoaded) return;
  _moviesLoaded = true;
  const frame = $('movies-frame');
  $('movies-notice')?.remove(); frame.hidden = false;
  loadbar(true);
  const ok = window._uvReady || await Promise.race([uvReady, new Promise(r => setTimeout(() => r(false), 6000))]);
  if (app.active !== 'movies') { _moviesLoaded = false; return loadbar(false); }
  if (!ok) {
    loadbar(false); _moviesLoaded = false; frame.hidden = true;
    $('movies-stage').insertAdjacentHTML('beforeend', `<div class="notice" id="movies-notice"><h2>Movies needs the proxy</h2><p>The proxy didn't start, so the movie site can't load. Refresh the page and try again.</p></div>`);
    return;
  }
  frame.onload = () => { if (!frame.src.endsWith('about:blank')) { loadbar(false); applyFramePrefs(frame); } };
  frame.src = moviesProxied();
});
const SHIELD = 'allow-scripts allow-same-origin allow-forms allow-presentation';
function applyShield() {
  const on = cfg.moviesShield !== false, f = $('movies-frame');
  on ? f.setAttribute('sandbox', SHIELD) : f.removeAttribute('sandbox');
  const b = $('shield-btn');
  b.querySelector('.lbl').textContent = 'Ad shield: ' + (on ? 'On' : 'Off');
  b.classList.toggle('off', !on);
}
function toggleShield() {
  cfg.moviesShield = cfg.moviesShield === false; saveCfg();
  // The sandbox only applies on the next load, so reload the player.
  stopFrame($('movies-frame')); _moviesLoaded = false; applyShield();
  toast(cfg.moviesShield ? 'Ad shield on' : 'Ad shield off. Pop-ups may appear.');
  sfx.toggle(cfg.moviesShield); openMovies();
}
function moviesBlank() { openBlank(window._uvReady ? moviesProxied() : '/'); }

/* Chat (the AI assistant) lives in assistant.js. */

/* ═══════════════ Settings ═══════════════ */
function openSettings() {
  hideMenus();
  $('settings').classList.add('open'); $('scrim').classList.add('open');
  $('settings').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('settings').querySelector('button,input')?.focus(), 50);
  sfx.open();
}
function closeSettings() {
  if (!$('settings').classList.contains('open')) return;
  $('settings').classList.remove('open'); $('scrim').classList.remove('open');
  $('settings').setAttribute('aria-hidden', 'true');
  sfx.shut();
}
function setSwitch(id, on) { $(id)?.setAttribute('aria-checked', String(!!on)); }

function applyAccent(c) {
  document.documentElement.style.setProperty('--accent', c);
  const [r, g, b] = hexRgb(c);
  document.documentElement.style.setProperty('--accent-deep', `rgb(${r * 0.45 | 0},${g * 0.35 | 0},${b * 0.6 | 0})`);
  $('swatches').querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.c === c)));
  window.bg?.setAccent(c);
  buildWordmark();
}
function logoSVG(c) {
  const [r, g, b] = hexRgb(c), deep = `rgb(${r * 0.45 | 0},${g * 0.35 | 0},${b * 0.6 | 0})`;
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff'/><stop offset='.45' stop-color='${c}'/><stop offset='1' stop-color='${deep}'/></linearGradient><clipPath id='f'><rect x='-20' y='24' width='88' height='40' transform='rotate(-22 24 24)'/></clipPath></defs><rect width='48' height='48' rx='12' fill='#15141c'/><ellipse cx='24' cy='24' rx='21' ry='7.2' transform='rotate(-22 24 24)' fill='none' stroke='${c}' stroke-width='2.8' opacity='.55'/><circle cx='24' cy='24' r='11.5' fill='url(#p)'/><g clip-path='url(#f)'><ellipse cx='24' cy='24' rx='21' ry='7.2' transform='rotate(-22 24 24)' fill='none' stroke='#15141c' stroke-width='6'/><ellipse cx='24' cy='24' rx='21' ry='7.2' transform='rotate(-22 24 24)' fill='none' stroke='${c}' stroke-width='2.8'/></g></svg>`;
}
function iconFrom(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (/\.(png|jpe?g|ico|svg|gif|webp)(\?|$)/i.test(raw)) return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  return fav(hostOf(raw), 64);
}
function applyIdentity() {
  document.title = cfg.cloak ? (cfg.cloakName || 'Home') : 'Universium';
  $('fav-icon').href = (cfg.cloak && iconFrom(cfg.logoURL)) || 'data:image/svg+xml,' + encodeURIComponent(logoSVG(cfg.accent || ACCENTS[0]));
}
function saveCloak() {
  cfg.cloakName = $('cloak-name-inp').value.trim() || 'Home';
  cfg.logoURL = $('logo-url-inp').value.trim();
  if (!cfg.cloak) { cfg.cloak = true; setSwitch('sw-cloak', true); }
  saveCfg(); applyIdentity();
  toast('Tab disguise saved', 'ok');
}
function togSetting(key) {
  hideMenus();
  cfg[key] = !cfg[key];
  setSwitch('sw-' + key, cfg[key]);
  if (key === 'sound') sfx.enabled = cfg.sound;
  sfx.toggle(cfg[key]);
  if (key === 'cloak') applyIdentity();
  if (key === 'motion') window.bg?.kick();
  if (key === 'bookmarksBar') renderBookmarksBar();
  if (key === 'desktop') window.desktop?.apply(cfg.desktop);
  if (key === 'adblock') { syncAdblock(); toast(cfg.adblock ? 'Ad blocking on' : 'Ad blocking off'); }
  saveCfg();
}
function setEngine(v) { cfg.engine = v; saveCfg(); }
async function resetAll() {
  if (!(await ui.confirm({ title: 'Reset everything?', message: 'Settings, shortcuts, bookmarks, favorites, history and chats on this browser are cleared. If you’re signed in, your account keeps its copy.', confirmText: 'Reset', danger: true }))) return;
  ['uos-cfg', 'uos-links', 'uos-recent', 'uos-ck', 'uos-history', 'uos-bookmarks'].forEach(k => {
    try { localStorage.removeItem(k); } catch {}
    document.cookie = `${k}=;max-age=0;path=/`;
  });
  location.reload();
}
function initSettings() {
  $('swatches').innerHTML = ACCENTS.map(c => `<button class="swatch" style="background:${c}" data-c="${c}" aria-label="Accent ${c}"></button>`).join('');
  $('swatches').addEventListener('click', e => {
    const s = e.target.closest('[data-c]'); if (!s) return;
    cfg.accent = s.dataset.c; saveCfg(); applyAccent(cfg.accent); applyIdentity(); sfx.tick();
  });
  $('cloak-presets').innerHTML = CLOAKS.map((p, i) => `<button class="chip" data-p="${i}">${p.name}</button>`).join('');
  $('cloak-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const p = CLOAKS[+b.dataset.p];
    $('cloak-name-inp').value = p.title; $('logo-url-inp').value = p.icon;
    saveCloak();
  });
  $('cloak-name-inp').value = cfg.cloakName || '';
  $('logo-url-inp').value = cfg.logoURL || '';
  $('engine').value = ENGINES[cfg.engine] ? cfg.engine : 'ddg';
  ['cloak', 'motion', 'sound', 'bookmarksBar', 'railOpen', 'desktop'].forEach(k => setSwitch('sw-' + k, cfg[k]));
  const BGS = [
    { id: 'rings', name: 'Rings' }, { id: 'warp', name: 'Warp' }, { id: 'waves', name: 'Waves' },
    { id: 'nebula', name: 'Nebula' }, { id: 'none', name: 'Still' },
  ];
  $('bg-picker').innerHTML = BGS.map(b => `<button class="bg-opt" data-bg="${b.id}" aria-pressed="${cfg.bgScene === b.id}"><span class="bg-prev bg-prev-${b.id}"></span>${b.name}</button>`).join('');
  $('bg-picker').addEventListener('click', e => {
    const b = e.target.closest('[data-bg]'); if (!b) return;
    cfg.bgScene = b.dataset.bg; saveCfg();
    $('bg-picker').querySelectorAll('[data-bg]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    window.bg?.setScene(cfg.bgScene); sfx.tick();
  });
  window.bg?.setScene(cfg.bgScene);
  setSwitch('sw-adblock', cfg.adblock !== false);
  document.documentElement.classList.toggle('rail-collapsed', !cfg.railOpen);
  applyAccent(cfg.accent || ACCENTS[0]);
  applyIdentity();
}

/* ═══════════════ Keyboard ═══════════════ */
// Returns true if it handled the key. Also called from inside same-origin frames.
function handleHotkey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return false;
  const code = e.code;
  if (code === 'KeyT' && e.shiftKey) { reopenClosed(); return true; }
  if (code === 'KeyT') { newTab(); return true; }
  if (code === 'KeyW' && isTabId(app.active)) { closeTab(app.active); return true; }
  if (code === 'KeyD' && isTabId(app.active)) { toggleBookmark(); return true; }
  if (code === 'KeyF' && ['tab', 'game'].includes(viewKind(app.active))) { openFind(); return true; }
  if (code === 'KeyC') {
    if (clicker.running) stopClicking();
    else if (clicker.mode === 'follow' || (clicker.spot && clicker.frame === activeFrame())) startClicking();
    else toggleClickerPanel(true);
    return true;
  }
  if (code === 'KeyS' && ['tab', 'game'].includes(viewKind(app.active))) { window.snip?.start(); return true; }
  if (code === 'KeyH') { openHistory(); return true; }
  if (code === 'KeyB') { toggleRail(); return true; }
  if (/^Digit[1-9]$/.test(code)) { const t = app.tabs[+code.slice(5) - 1]; if (t) switchTab(t.id); return !!t; }
  return false;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('pick-layer')) return cancelPick();
    if (!$('req-scrim').hidden) return closeRequest();
    if ($('settings').classList.contains('open')) return closeSettings();
    hideMenus(); hideSuggest();
    return;
  }
  if (handleHotkey(e)) { e.preventDefault(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (typing) return;
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (app.active === 'games') $('game-q').focus();
    else if (app.active === 'home') $('home-inp').focus();
    else if (app.active === 'history') $('hist-q').focus();
    else if (isTabId(app.active)) $('addr-input').select();
  }
});
$('addr-input').addEventListener('focus', e => e.target.select());

/* ═══════════════ Boot ═══════════════ */
greet();
tickClock();
setInterval(() => { if (app.active === 'home' && !document.hidden) tickClock(); }, 15000);
initSettings();
renderShortcuts();
renderRecent();
renderHomeGames();
renderTagChips();
renderGameGrid();
renderBookmarksBar();
applySections();
applyShield();
showView('home');
if (canLS && !localStorage.getItem('uos-cfg')) saveCfg();
fetch('/api/health', { cache: 'no-store' }).then(r => r.json()).then(d => { if (d.version) $('app-version').textContent = '· Version ' + d.version; }).catch(() => {});
