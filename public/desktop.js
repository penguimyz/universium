/* Desktop mode: makes the site look and feel like a PC.
   - Taskbar with a start menu, pinned apps, running tabs/games and a clock
   - Home becomes a desktop with icons (double-click to open)
   - Everything else opens in a window with maximize/close buttons
   Uses helpers from app.js. Turned on in Settings → Desktop mode. */
window.desktop = (() => {
  const APPS = [
    { id: 'games',     name: 'Games',        icon: 'i-games',   open: () => openGames() },
    { id: 'movies',    name: 'Movies & TV',  icon: 'i-film',    open: () => openMovies() },
    { id: 'browser',   name: 'Browser',      icon: 'i-globe',   open: () => newTab() },
    { id: 'assistant', name: 'Chat',         icon: 'i-chat',    open: () => openAssistant() },
    { id: 'friends',   name: 'Friends',      icon: 'i-users',   open: () => openFriends() },
    { id: 'history',   name: 'History',      icon: 'i-history', open: () => openHistory() },
    { id: 'admin',     name: 'Admin',        icon: 'i-shield',  open: () => openAdmin(), adminOnly: true },
    { id: 'settings',  name: 'Settings',     icon: 'i-gear',    open: () => openSettings() },
    { id: 'blank',     name: 'about:blank',  icon: 'i-eye',     open: () => openBlank() },
  ];
  const PINNED = ['games', 'movies', 'browser', 'assistant', 'friends'];
  const TITLES = { admin: 'Admin', games: 'Games', movies: 'Movies & TV', assistant: 'Chat', friends: 'Friends', history: 'History' };
  const ICONS = { admin: 'i-shield', games: 'i-games', movies: 'i-film', assistant: 'i-chat', friends: 'i-users', history: 'i-history', tab: 'i-globe', game: 'i-games' };
  let on = false, selected = null;

  /* ── build DOM once ── */
  const taskbar = document.createElement('div');
  taskbar.className = 'taskbar'; taskbar.id = 'taskbar';
  taskbar.innerHTML = `
    <button class="tb-start" id="tb-start" aria-label="Start" title="Start"><svg class="mark"><use href="#mark"/></svg></button>
    <button class="tb-app" data-app="home" title="Desktop" aria-label="Desktop">${svg('i-home')}</button>
    ${PINNED.map(id => { const a = APPS.find(x => x.id === id); return `<button class="tb-app" data-app="${id}" title="${a.name}" aria-label="${a.name}">${svg(a.icon)}${id === 'friends' ? '<span class="badge" data-badge="friends" hidden></span>' : ''}</button>`; }).join('')}
    <span class="tb-sep"></span>
    <div class="tb-running" id="tb-running"></div>
    <div class="tb-tray">
      <span class="tb-dot" id="tb-dot" title="Proxy status"></span>
      <button class="tb-clock" id="tb-clock" title="Show desktop"><b></b><small></small></button>
    </div>`;
  document.body.appendChild(taskbar);

  const start = document.createElement('div');
  start.className = 'startmenu'; start.id = 'startmenu'; start.hidden = true;
  start.innerHTML = `
    <form class="sm-search" id="sm-form"><svg><use href="#i-search"/></svg><input id="sm-q" placeholder="Search apps, games or the web" autocomplete="off" spellcheck="false"></form>
    <div class="sm-results" id="sm-results" hidden></div>
    <div class="sm-body" id="sm-body">
      <h3>Apps</h3>
      <div class="sm-apps">${APPS.map(a => `<button data-app="${a.id}"${a.adminOnly ? ' class="admin-only"' : ''}><span>${svg(a.icon)}</span>${a.name}</button>`).join('')}</div>
      <h3>Favorite games</h3>
      <div class="sm-games" id="sm-games"></div>
    </div>
    <div class="sm-foot"><span id="sm-user"></span><button class="icon-btn" data-app="settings" title="Settings" aria-label="Settings">${svg('i-gear')}</button></div>`;
  document.body.appendChild(start);

  const winbar = document.createElement('div');
  winbar.className = 'win-bar'; winbar.id = 'win-bar';
  winbar.innerHTML = `<span class="win-title"><svg id="win-ico"><use href="#i-globe"/></svg><b id="win-name"></b></span>
    <button class="win-btn" data-win="min" title="Minimize" aria-label="Minimize">${svg('i-min')}</button>
    <button class="win-btn" data-win="max" title="Maximize" aria-label="Maximize">${svg('i-max')}</button>
    <button class="win-btn close" data-win="close" title="Close" aria-label="Close">${svg('i-x')}</button>`;
  document.querySelector('.main').prepend(winbar);

  const desk = document.createElement('div');
  desk.className = 'desk'; desk.id = 'desk';
  document.getElementById('slot-home').prepend(desk);

  /* ── rendering ── */
  function renderDesk() {
    const links = allLinks().slice(0, 12);
    desk.innerHTML = `
      <div class="desk-icons" id="desk-icons">
        ${APPS.filter(a => a.id !== 'blank').map(a => `<button class="dicon${a.adminOnly ? ' admin-only' : ''}" data-app="${a.id}"><span class="dicon-img is-app">${svg(a.icon)}</span><span class="dicon-label">${a.name}</span></button>`).join('')}
        ${links.map(l => `<button class="dicon" data-url="${esc(l.url)}"><span class="dicon-img"><img src="${fav(hostOf(l.url))}" alt="" onerror="this.remove()"></span><span class="dicon-label">${esc(l.label)}</span></button>`).join('')}
      </div>
      <div class="desk-widget"><b id="dw-time"></b><span id="dw-date"></span><small>Double-click an icon to open it</small></div>`;
    tick();
  }
  function renderStartGames() {
    const games = favGames().slice(0, 6);
    document.getElementById('sm-games').innerHTML = games.length
      ? games.map(g => `<button data-game="${esc(g.id)}"><span class="sm-cover cover">${coverImg(g)}</span>${esc(g.name)}</button>`).join('')
      : '<p class="fine left">Heart games on the Games page to pin them here.</p>';
    const me = window.social?.state?.me;
    document.getElementById('sm-user').innerHTML = me ? `<span class="av" style="--h:${me.color};--s:26px">${esc(me.username[0].toUpperCase())}</span>${esc(me.username)}` : '<button class="link-btn" data-app="friends">Sign in</button>';
  }
  function renderRunning() {
    const box = document.getElementById('tb-running');
    const items = app.tabs.map(t => ({ id: t.id, title: t.title, img: t.fav, icon: 'i-globe' }));
    if (app.active.startsWith('game-')) {
      const g = findGame(app.active.slice(5)) || GAMES.find(x => 'game-' + x.id.replace(/[^a-z0-9_-]/gi, '_') === app.active);
      if (g) items.push({ id: app.active, title: g.name, icon: 'i-games' });
    }
    box.innerHTML = items.map(it => `<button class="tb-run${it.id === app.active ? ' active' : ''}" data-run="${it.id}" title="${esc(it.title)}">
      ${it.img ? `<img src="${esc(it.img)}" alt="" onerror="this.remove()">` : svg(it.icon)}<span>${esc(it.title)}</span></button>`).join('');
  }
  function tick() {
    const n = new Date();
    const t = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const clock = document.getElementById('tb-clock');
    clock.querySelector('b').textContent = t;
    clock.querySelector('small').textContent = n.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
    const dt = document.getElementById('dw-time'); if (dt) { dt.textContent = t; document.getElementById('dw-date').textContent = n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); }
    document.getElementById('tb-dot').classList.toggle('on', !!window._uvReady);
  }
  setInterval(() => { if (on && !document.hidden) tick(); }, 10000);

  function sync() {
    if (!on) return;
    const kind = document.body.dataset.view;
    taskbar.querySelectorAll('.tb-app').forEach(b => b.classList.toggle('active', b.dataset.app === kind || (b.dataset.app === 'games' && kind === 'game') || (b.dataset.app === 'browser' && kind === 'tab')));
    renderRunning();
    let title = TITLES[kind] || '';
    if (kind === 'tab') title = app.tabs.find(t => t.id === app.active)?.title || 'Browser';
    if (kind === 'game') title = document.querySelector('.fslot.active .player-title')?.firstChild?.textContent || 'Game';
    document.getElementById('win-name').textContent = title;
    document.querySelector('#win-ico use').setAttribute('href', '#' + (ICONS[kind] || 'i-globe'));
    const main = document.querySelector('.main');
    if (kind !== 'home' && main.dataset.lastView !== app.active) restart(main, 'win-open');
    main.dataset.lastView = app.active;
    if (kind === 'home') renderDesk();
  }

  function apply(state) {
    on = !!state;
    document.documentElement.classList.toggle('desktop', on);
    if (on) { renderDesk(); tick(); sync(); } else closeStart();
    window.bg?.kick();
    dispatchEvent(new Event('resize'));
  }

  /* ── start menu ── */
  function openStart() {
    renderStartGames();
    start.hidden = false; restart(start, 'enter');
    document.getElementById('tb-start').classList.add('active');
    const q = document.getElementById('sm-q'); q.value = ''; searchStart('');
    setTimeout(() => q.focus(), 20);
    sfx.open();
  }
  function closeStart() {
    if (start.hidden) return;
    start.hidden = true; document.getElementById('tb-start').classList.remove('active');
  }
  function searchStart(q) {
    const res = document.getElementById('sm-results'), body = document.getElementById('sm-body');
    q = q.trim().toLowerCase();
    if (!q) { res.hidden = true; body.hidden = false; return; }
    const apps = APPS.filter(a => a.name.toLowerCase().includes(q)).map(a => `<button data-app="${a.id}">${svg(a.icon)}<span>${a.name}</span><small>App</small></button>`);
    const games = [...GAMES, ...(app.extras || [])].filter(g => g.name.toLowerCase().includes(q)).slice(0, 6).map(g => `<button data-game="${esc(g.id)}">${svg('i-games')}<span>${esc(g.name)}</span><small>Game</small></button>`);
    const web = `<button data-web="${esc(q)}">${svg('i-search')}<span>Search the web for "${esc(q)}"</span></button>`;
    res.innerHTML = [...apps, ...games, web].join('');
    res.hidden = false; body.hidden = true;
  }
  document.getElementById('sm-q').addEventListener('input', e => searchStart(e.target.value));
  document.getElementById('sm-form').addEventListener('submit', e => {
    e.preventDefault();
    const first = document.querySelector('#sm-results:not([hidden]) button');
    if (first) first.click(); else if (e.target.querySelector('input').value.trim()) { go(e.target.querySelector('input').value); closeStart(); }
  });

  function openApp(id) {
    closeStart();
    if (id === 'home') return goHome();
    APPS.find(a => a.id === id)?.open();
  }

  /* ── events ── */
  document.getElementById('tb-start').addEventListener('click', e => { e.stopPropagation(); start.hidden ? openStart() : closeStart(); });
  document.getElementById('tb-clock').addEventListener('click', () => goHome());
  taskbar.addEventListener('click', e => {
    const a = e.target.closest('.tb-app'); if (a) return openApp(a.dataset.app);
    const r = e.target.closest('[data-run]'); if (!r) return;
    const id = r.dataset.run;
    if (id === app.active) goHome(); // clicking the active item minimizes, like a real taskbar
    else if (id.startsWith('t')) switchTab(id);
    else { const g = findGame(id.slice(5)); if (g) launchGame(g); }
  });
  start.addEventListener('click', e => {
    const a = e.target.closest('[data-app]'); if (a) return openApp(a.dataset.app);
    const g = e.target.closest('[data-game]'); if (g) { closeStart(); return launchGame(findGame(g.dataset.game)); }
    const w = e.target.closest('[data-web]'); if (w) { closeStart(); go(w.dataset.web); }
  });
  document.addEventListener('pointerdown', e => {
    if (!start.hidden && !start.contains(e.target) && !e.target.closest('#tb-start')) closeStart();
    if (on && !e.target.closest('.dicon')) desk.querySelectorAll('.dicon.sel').forEach(d => d.classList.remove('sel'));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeStart(); });

  // Desktop icons: click selects, double-click opens (single tap on touch screens).
  const openIcon = el => el.dataset.app ? openApp(el.dataset.app) : go(el.dataset.url);
  desk.addEventListener('click', e => {
    const d = e.target.closest('.dicon'); if (!d) return;
    desk.querySelectorAll('.dicon.sel').forEach(x => x.classList.remove('sel'));
    d.classList.add('sel'); selected = d;
    if (e.pointerType === 'touch' || matchMedia('(pointer: coarse)').matches) openIcon(d);
  });
  desk.addEventListener('dblclick', e => { const d = e.target.closest('.dicon'); if (d) openIcon(d); });
  desk.addEventListener('keydown', e => { const d = e.target.closest('.dicon'); if (d && e.key === 'Enter') openIcon(d); });

  winbar.addEventListener('click', e => {
    const b = e.target.closest('[data-win]'); if (!b) return;
    const w = b.dataset.win;
    if (w === 'max') { document.documentElement.classList.toggle('win-max'); sfx.tick(); dispatchEvent(new Event('resize')); }
    if (w === 'min') goHome();
    if (w === 'close') {
      if (/^t\d+$/.test(app.active)) closeTab(app.active);
      else goHome();
    }
  });
  winbar.addEventListener('dblclick', e => { if (!e.target.closest('[data-win]')) { document.documentElement.classList.toggle('win-max'); dispatchEvent(new Event('resize')); } });

  apply(cfg.desktop);
  return { apply, sync, renderRunning };
})();
