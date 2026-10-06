/* Sidebar extras:
   - Tools: a small menu off the sidebar that opens Calculator, Notes, Paint and the other
     window apps (apps.js) from anywhere, plus Snip & solve and the auto clicker.
   - What's new: a one-line card on Home with the latest update, and a list of all of them.
   Uses helpers from app.js ($, esc, svg, sfx, restart). */
window.tools = (() => {
  /* ── Tools menu ── */
  const pop = document.createElement('div');
  pop.className = 'tools-pop'; pop.id = 'tools-pop'; pop.hidden = true;
  pop.setAttribute('role', 'menu');
  document.body.appendChild(pop);
  let btn = null;

  const list = () => [
    ...Object.entries(window.winapps?.apps || {}).map(([id, a]) => ({ id, name: a.name, icon: a.icon, tint: a.tint, run: () => winapps.open(id) })),
    { id: 'snip', name: 'Snip & solve', icon: 'i-snip', tint: '#b9a3ff', run: () => window.snip?.start(), hint: 'Alt+S' },
    { id: 'clicker', name: 'Auto clicker', icon: 'i-cursor', tint: '#fb923c', run: () => toggleClickerPanel(true), hint: 'Alt+C' },
  ];

  function paint() {
    pop.innerHTML = `
      <div class="tp-head"><b>Tools</b><span>Opens in a window you can drag around</span></div>
      <div class="tp-grid">${list().map(t => `
        <button class="tp-item" role="menuitem" data-tool="${t.id}" title="${esc(t.name)}${t.hint ? ` (${t.hint})` : ''}">
          <span class="tp-ico" style="--tint:${t.tint}">${svg(t.icon)}</span><span class="tp-name">${esc(t.name)}</span>
        </button>`).join('')}
      </div>`;
  }

  function place() {
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const across = r.top > innerHeight - 90; // phone layout: the sidebar is a bar along the bottom
    if (across) {
      pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      pop.style.top = Math.max(8, r.top - h - 10) + 'px';
    } else {
      pop.style.left = (r.right + 10) + 'px';
      pop.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.top - 12)) + 'px';
    }
  }

  function open(from) {
    btn = from || document.querySelector('[data-nav="tools"]');
    paint(); pop.hidden = false; place(); restart(pop, 'enter');
    btn?.setAttribute('aria-expanded', 'true');
    sfx?.open?.();
  }
  function close() {
    if (pop.hidden) return;
    pop.hidden = true; btn?.setAttribute('aria-expanded', 'false');
  }
  const toggle = from => (pop.hidden ? open(from) : close());

  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-tool]'); if (!b) return;
    const t = list().find(x => x.id === b.dataset.tool);
    close(); t?.run();
  });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-nav="tools"]')) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('resize', close);

  /* ── What's new ── newest first. Add a line here with each release. */
  const UPDATES = [
    { v: '2026.10.06-2', date: 'Oct 6', title: 'Duels makeover and a Tools menu', items: [
      'Duels looks a lot more like ROUNDS: flat colored arenas, round little players, glowing bullets and cards',
      'Duels menus match the rest of Universium',
      'The practice bot is easier: it reacts slower, misses more and rarely blocks',
      'New Tools button in the sidebar opens Calculator, Notes, Paint and the rest anywhere, not just in desktop mode',
      'This What\'s new card',
      'Kiwi Clicker now loads through the proxy, so it works on school Chromebooks, and its card shows the actual bird',
    ] },
    { v: '2026.10.05', date: 'Oct 5', title: 'Snip & solve, Kiwi Clicker', items: [
      'Snip & solve: drag a box around a problem (Alt+S) and the AI explains the answer',
      'Kiwi Clicker added to Games',
    ] },
    { v: '2026.10.02', date: 'Oct 2', title: 'Super Liquid Soccer', items: ['Super Liquid Soccer added to Games'] },
    { v: '2026.10.01', date: 'Oct 1', title: 'Desktop apps and request replies', items: [
      'Desktop mode got apps: Calculator, Notes, Paint, Clock, Calendar, Mines, Terminal and Task Manager',
      'Desktop icons open with one click',
      'Game requests can get replies',
    ] },
    { v: '2026.09.29', date: 'Sep 29', title: 'Duels', items: [
      'Duels: 1v1 a friend, lose a round and pick a card. 66 cards and 16 maps',
      'Fixed Minecraft losing the keyboard after clicking away',
      'Friends, chat, desktop mode and backgrounds',
    ] },
  ];
  const SEEN = 'universium-seen-update';
  const seen = () => { try { return localStorage.getItem(SEEN) || ''; } catch { return ''; } };
  const markSeen = () => { try { localStorage.setItem(SEEN, UPDATES[0].v); } catch {} renderCard(); };

  const card = document.createElement('button');
  card.className = 'whatsnew'; card.type = 'button';
  card.addEventListener('click', openUpdates);
  function renderCard() {
    const u = UPDATES[0], fresh = seen() !== u.v;
    card.classList.toggle('fresh', fresh);
    card.innerHTML = `<span class="wn-tag">${fresh ? 'New' : 'Update'}</span><span class="wn-text"><b>${esc(u.title)}</b><span>${esc(u.items[0])}</span></span><span class="wn-more">See what's new<svg><use href="#i-fwd"/></svg></span>`;
  }
  renderCard();
  const search = document.querySelector('#slot-home form.search');
  search?.insertAdjacentElement('afterend', card);

  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim'; scrim.id = 'wn-scrim'; scrim.hidden = true;
  scrim.innerHTML = `
    <div class="modal wn-modal" role="dialog" aria-modal="true" aria-labelledby="wn-h">
      <div class="modal-head"><h2 id="wn-h">What's new</h2><button type="button" class="icon-btn" data-wn-close aria-label="Close"><svg><use href="#i-x"/></svg></button></div>
      <div class="wn-list">${UPDATES.map((u, i) => `
        <section class="wn-rel${i === 0 ? ' latest' : ''}">
          <div class="wn-date"><b>${esc(u.date)}</b><small>${esc(u.v)}</small></div>
          <div><h3>${esc(u.title)}</h3><ul>${u.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
        </section>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener('click', e => { if (e.target === scrim || e.target.closest('[data-wn-close]')) closeUpdates(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !scrim.hidden) closeUpdates(); });
  function openUpdates() { scrim.hidden = false; restart(scrim, 'enter'); markSeen(); sfx?.open?.(); }
  function closeUpdates() { scrim.hidden = true; sfx?.shut?.(); }

  return { open, close, toggle, openUpdates, updates: UPDATES };
})();
