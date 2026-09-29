// Duels: rules shared by the server (lib/duel.js) and the browser (game.js).
// Plain logic, no I/O, so practice mode runs the same match code in the browser as the server.

export const W = 1280, H = 720;          // arena size in world units
export const PR = 17;                    // player half-size (players are 34×34)
export const GRAV = 2600;
export const ROUND_OPTIONS = [1, 3, 5, 7, 10];
export const PICKS = 6;                  // cards offered to the loser of a round
export const BREAK_HP = 100;

/* ═══════════ Maps ═══════════
   rects:  solid ground [x, y, w, h]
   breaks: blocks that break after BREAK_HP damage
   ropes:  boxes swinging on a rope {ax, ay, len, w, h, amp, spd, ph}
   saws:   spinning hazards {x, y, r, dx, dy, spd} (dx/dy/spd make them slide back and forth)
   The sides and bottom bounce you back in and hurt; the top is open. */
const bricks = (x0, y0, cols, rows, s = 40) => { const o = []; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) o.push([x0 + i * s, y0 + j * s, s, s]); return o; };
export const MAPS = [
  { name: 'Foundry', bg: '#6b5a4e', spawns: [[300, 440], [980, 440]],
    rects: [[0, 660, 1280, 60], [190, 480, 230, 24], [860, 480, 230, 24], [520, 330, 240, 24], [612, 520, 56, 140]],
    breaks: [[612, 440, 56, 40], [612, 480, 56, 40]] },
  { name: 'Stilts', bg: '#4f6b78', spawns: [[215, 520], [1065, 520]],
    rects: [[70, 560, 290, 30], [920, 560, 290, 30], [495, 455, 290, 30], [130, 300, 170, 22], [980, 300, 170, 22], [555, 190, 170, 22]],
    ropes: [{ ax: 640, ay: 0, len: 110, w: 64, h: 40, amp: 0.55, spd: 1.3, ph: 0 }] },
  { name: 'Crossfire', bg: '#6e4f5c', spawns: [[150, 620], [1130, 620]],
    rects: [[0, 660, 1280, 60], [300, 400, 30, 140], [950, 400, 30, 140], [0, 380, 330, 22], [950, 380, 330, 22], [470, 250, 340, 22], [560, 520, 160, 22]],
    breaks: [[300, 540, 30, 60], [300, 600, 30, 60], [950, 540, 30, 60], [950, 600, 30, 60]] },
  { name: 'Canopy', bg: '#4e6a52', spawns: [[240, 620], [1040, 620]],
    rects: [[0, 660, 470, 60], [810, 660, 470, 60], [390, 120, 500, 28], [170, 450, 210, 24], [900, 450, 210, 24], [540, 370, 200, 24]],
    saws: [{ x: 640, y: 640, r: 34, dx: 120, dy: 0, spd: 1.1 }] },
  { name: 'Steps', bg: '#5c5470', spawns: [[90, 620], [1190, 620]],
    rects: [[0, 660, 1280, 60], [170, 580, 130, 80], [300, 500, 130, 160], [980, 580, 130, 80], [850, 500, 130, 160], [520, 300, 240, 24]],
    ropes: [{ ax: 560, ay: 324, len: 120, w: 46, h: 46, amp: 0.7, spd: 1.6, ph: 0 }, { ax: 720, ay: 324, len: 120, w: 46, h: 46, amp: 0.7, spd: 1.6, ph: Math.PI }] },
  { name: 'Sawmill', bg: '#72604a', spawns: [[230, 460], [1050, 460]],
    rects: [[0, 660, 1280, 60], [100, 500, 260, 24], [920, 500, 260, 24], [440, 380, 400, 24]],
    saws: [{ x: 640, y: 660, r: 56 }, { x: 640, y: 250, r: 28, dx: 260, dy: 0, spd: 0.8 }] },
  { name: 'Brickyard', bg: '#6a4c44', spawns: [[200, 620], [1080, 620]],
    rects: [[0, 660, 1280, 60], [150, 470, 200, 24], [930, 470, 200, 24], [480, 220, 320, 22]],
    breaks: bricks(560, 420, 4, 6) },
  { name: 'Hangers', bg: '#4a5a6e', spawns: [[150, 620], [1130, 620]],
    rects: [[0, 660, 300, 60], [980, 660, 300, 60]],
    ropes: [{ ax: 430, ay: 0, len: 390, w: 120, h: 22, amp: 0.4, spd: 1.0, ph: 0 }, { ax: 640, ay: 0, len: 300, w: 120, h: 22, amp: 0.4, spd: 1.0, ph: Math.PI },
            { ax: 850, ay: 0, len: 390, w: 120, h: 22, amp: 0.4, spd: 1.0, ph: 0.6 }] },
  { name: 'Tower', bg: '#5b6456', spawns: [[300, 620], [980, 620]],
    rects: [[0, 660, 1280, 60], [590, 260, 100, 160], [590, 510, 100, 150], [120, 420, 220, 22], [940, 420, 220, 22], [250, 250, 160, 22], [870, 250, 160, 22]],
    breaks: [[590, 420, 50, 45], [640, 420, 50, 45], [590, 465, 50, 45], [640, 465, 50, 45]] },
  { name: 'Islands', bg: '#3f6a6a', spawns: [[210, 500], [1070, 500]],
    rects: [[100, 540, 220, 26], [960, 540, 220, 26], [420, 420, 160, 24], [700, 420, 160, 24], [560, 250, 160, 24]],
    saws: [{ x: 640, y: 560, r: 32, dx: 0, dy: 80, spd: 1.2 }] },
  { name: 'Pit', bg: '#6b4b4b', spawns: [[150, 620], [1130, 620]],
    rects: [[0, 660, 520, 60], [760, 660, 520, 60], [200, 480, 180, 22], [900, 480, 180, 22], [560, 330, 160, 22]],
    breaks: [[520, 660, 40, 24], [560, 660, 40, 24], [600, 660, 40, 24], [640, 660, 40, 24], [680, 660, 40, 24], [720, 660, 40, 24]],
    saws: [{ x: 640, y: 730, r: 70 }] },
  { name: 'Chandelier', bg: '#5e5066', spawns: [[150, 620], [1130, 620]],
    rects: [[0, 660, 1280, 60], [80, 430, 200, 24], [1000, 430, 200, 24]],
    breaks: [[400, 600, 60, 60], [400, 540, 60, 60], [820, 600, 60, 60], [620, 600, 60, 60]],
    ropes: [{ ax: 640, ay: 0, len: 220, w: 220, h: 24, amp: 0.3, spd: 0.9, ph: 0 }] },
  { name: 'Ladder', bg: '#556b4a', spawns: [[100, 620], [1180, 620]],
    rects: [[0, 660, 1280, 60], [200, 540, 200, 20], [880, 540, 200, 20], [440, 430, 160, 20], [680, 430, 160, 20], [200, 320, 200, 20], [880, 320, 200, 20], [540, 210, 200, 20]],
    saws: [{ x: 640, y: 655, r: 26, dx: 220, dy: 0, spd: 0.9 }] },
  { name: 'Cage', bg: '#61584a', spawns: [[150, 620], [1130, 620]],
    rects: [[0, 660, 1280, 60], [120, 450, 200, 22], [960, 450, 200, 22]],
    breaks: [[520, 380, 60, 30], [580, 380, 60, 30], [640, 380, 60, 30], [700, 380, 60, 30], [520, 410, 30, 125], [520, 535, 30, 125], [730, 410, 30, 125], [730, 535, 30, 125]],
    ropes: [{ ax: 330, ay: 0, len: 200, w: 60, h: 60, amp: 0.5, spd: 1.2, ph: 0 }, { ax: 950, ay: 0, len: 200, w: 60, h: 60, amp: 0.5, spd: 1.2, ph: Math.PI }] },
  { name: 'Seesaw', bg: '#4c5d73', spawns: [[140, 400], [1140, 400]],
    rects: [[60, 440, 180, 26], [1040, 440, 180, 26], [0, 660, 380, 60], [900, 660, 380, 60]],
    ropes: [{ ax: 500, ay: 0, len: 480, w: 140, h: 22, amp: 0.25, spd: 0.8, ph: 0 }, { ax: 780, ay: 0, len: 480, w: 140, h: 22, amp: 0.25, spd: 0.8, ph: Math.PI }],
    saws: [{ x: 640, y: 720, r: 60 }] },
  { name: 'Bunker', bg: '#5a5a52', spawns: [[120, 620], [1160, 620]],
    rects: [[0, 660, 1280, 60], [240, 520, 30, 140], [1010, 520, 30, 140], [400, 330, 480, 26]],
    breaks: [...bricks(240, 440, 1, 2), ...bricks(1010, 440, 1, 2), ...bricks(560, 580, 4, 2)],
    saws: [{ x: 640, y: 300, r: 24, dx: 200, dy: 0, spd: 1.4 }] },
];

export function ropeBox(r, t) {
  const a = r.amp * Math.sin(r.spd * t + r.ph);
  const cx = r.ax + Math.sin(a) * r.len, cy = r.ay + Math.cos(a) * r.len;
  return [cx - r.w / 2, cy - r.h / 2, r.w, r.h];
}
export function sawAt(s, t) {
  const k = s.spd ? Math.sin(s.spd * t) : 0;
  return { x: s.x + (s.dx || 0) * k, y: s.y + (s.dy || 0) * k, r: s.r };
}
// Everything solid right now: [x, y, w, h, tag]. Tag is null for ground, 'b<i>' for breakables, 'r<i>' for rope boxes.
export function solidsAt(map, t, broken) {
  const out = map.rects.map(r => [...r, null]);
  (map.breaks || []).forEach((r, i) => { if (!broken?.has(i)) out.push([...r, 'b' + i]); });
  (map.ropes || []).forEach((r, i) => out.push([...ropeBox(r, t), 'r' + i]));
  return out;
}

/* ═══════════ Stats & cards (from ROUNDS) ═══════════ */
export const BASE = {
  hp: 100, dmg: 55, fireDelay: 0.3, ammo: 3, reload: 1.5, move: 1,
  bulletSpeed: 1150, bulletGrav: 900, bullets: 1, spread: 0, jitter: 0, burst: 1, bounces: 0, bounceKeep: 0.92,
  size: 6, pad: 0, jumps: 1, jumpPower: 1, lifesteal: 0, blockCd: 4, knock: 0, drill: 0, explode: 0,
};
export const TYPES = {
  gun: { label: 'Gun', color: '#c8553d' },
  bullet: { label: 'Bullet', color: '#d98c2b' },
  block: { label: 'Block', color: '#3e74b8' },
  skill: { label: 'Ability', color: '#7c55b0' },
  body: { label: 'Body', color: '#4a8a4f' },
};
// ROUNDS math: +X% attack speed divides the shot delay, -X% multiplies it; same for HP.
const AS = (s, p) => { s.fireDelay = p >= 0 ? s.fireDelay / (1 + p) : s.fireDelay * (1 - p); };
const HP = (s, p) => { s.hp = p >= 0 ? s.hp * (1 + p) : s.hp / (1 - p); };
const D = (s, p) => { s.dmg *= 1 + p; };
const R = (s, t) => { s.reload += t; };
const BC = (s, t) => { s.blockCd += t; };
const g = t => [t, 1], b = t => [t, 0];
const blockCard = (id, name, ab, text, hp, cd = 0.25) => ({
  id, name, ab, type: 'block', text,
  lines: [...(hp ? [g(`+${hp * 100}% HP`)] : []), b(`+${cd}s Block cooldown`)],
  apply: s => { if (hp) HP(s, hp); BC(s, cd); },
});

export const CARDS = [
  // Gun
  { id: 'burst', name: 'Burst', ab: 'Bu', type: 'gun', text: 'Fires your bullets in a quick burst.', lines: [g('+2 Bullets'), g('+3 Ammo'), b('-60% Damage'), b('+0.25s Reload time')], apply: s => { s.burst += 2; s.ammo += 3; D(s, -0.6); R(s, 0.25); } },
  { id: 'combine', name: 'Combine', ab: 'Cm', type: 'gun', text: 'Fewer, heavier shots.', lines: [g('+100% Damage'), b('-2 Ammo'), b('+0.5s Reload time')], apply: s => { D(s, 1); s.ammo -= 2; R(s, 0.5); } },
  { id: 'fastball', name: 'Fastball', ab: 'Fb', type: 'gun', text: 'Very fast bullets.', lines: [g('+250% Bullet speed'), b('-50% Attack speed'), b('+0.25s Reload time')], apply: s => { s.bulletSpeed *= 3.5; AS(s, -0.5); R(s, 0.25); } },
  { id: 'quickshot', name: 'Quick Shot', ab: 'QS', type: 'gun', text: 'Faster bullets.', lines: [g('+150% Bullet speed'), b('+0.25s Reload time')], apply: s => { s.bulletSpeed *= 2.5; R(s, 0.25); } },
  { id: 'steady', name: 'Steady Shot', ab: 'SS', type: 'gun', text: 'Tougher, with faster bullets.', lines: [g('+40% HP'), g('+100% Bullet speed'), b('+0.25s Reload time')], apply: s => { HP(s, 0.4); s.bulletSpeed *= 2; R(s, 0.25); } },
  { id: 'windup', name: 'Wind Up', ab: 'WU', type: 'gun', text: 'Slow to fire, hits hard.', lines: [g('+100% Bullet speed'), g('+60% Damage'), b('-100% Attack speed'), b('+0.5s Reload time')], apply: s => { s.bulletSpeed *= 2; D(s, 0.6); AS(s, -1); R(s, 0.5); } },
  { id: 'barrage', name: 'Barrage', ab: 'Ba', type: 'gun', text: 'Fire many bullets at once.', lines: [g('+4 Bullets'), g('+5 Ammo'), b('-70% Damage'), b('+0.25s Reload time')], apply: s => { s.bullets += 4; s.ammo += 5; D(s, -0.7); s.spread += 0.12; R(s, 0.25); } },
  { id: 'buckshot', name: 'Buckshot', ab: 'Bs', type: 'gun', text: 'Shotgun spread.', lines: [g('+4 Bullets'), g('+5 Ammo'), b('-60% Damage'), b('+0.25s Reload time')], apply: s => { s.bullets += 4; s.ammo += 5; D(s, -0.6); s.spread += 0.42; s.jitter += 0.08; R(s, 0.25); } },
  { id: 'careful', name: 'Careful Planning', ab: 'CP', type: 'gun', text: 'Take your time.', lines: [g('+100% Damage'), b('-100% Attack speed'), b('+0.5s Reload time')], apply: s => { D(s, 1); AS(s, -1); R(s, 0.5); } },
  { id: 'spray', name: 'Spray', ab: 'Sp', type: 'gun', text: 'Hose it down. Not very accurate.', lines: [g('+1000% Attack speed'), g('+12 Ammo'), b('-75% Damage'), b('+0.25s Reload time')], apply: s => { AS(s, 10); s.ammo += 12; D(s, -0.75); s.jitter += 0.3; R(s, 0.25); } },
  { id: 'demonic', name: 'Demonic Pact', ab: 'DP', type: 'gun', text: 'Shooting costs 10 HP. No shooting cooldown.', lines: [g('+9 Bullets'), g('+ Splash damage'), b('+0.25s Reload time')], apply: s => { s.bullets += 9; s.spread += 0.3; s.fireDelay = 0.05; R(s, 0.25); } },
  // Bullet
  { id: 'bigbullet', name: 'Big Bullet', ab: 'BB', type: 'bullet', text: 'A big ring around your bullets makes them easier to land.', lines: [g('+ Bullet hitbox'), b('+0.25s Reload time')], apply: s => { s.pad += 12; R(s, 0.25); } },
  { id: 'cold', name: 'Cold Bullets', ab: 'CB', type: 'bullet', text: 'Hits slow the enemy down.', lines: [g('+70% Slow'), b('+0.25s Reload time')], apply: s => { R(s, 0.25); } },
  { id: 'dazzle', name: 'Dazzle', ab: 'Dz', type: 'bullet', text: 'Hits stun the enemy.', lines: [g('+ Stun on hit'), b('+0.25s Reload time')], apply: s => { R(s, 0.25); } },
  { id: 'fastforward', name: 'Fast Forward', ab: 'FF', type: 'bullet', text: 'Bullets get there twice as fast.', lines: [g('+100% Bullet speed'), g('+30% Reload speed')], apply: s => { s.bulletSpeed *= 2; s.reload /= 1.3; } },
  { id: 'poison', name: 'Poison', ab: 'Po', type: 'bullet', text: 'Damage is dealt over 3 seconds.', lines: [g('+60% Damage'), g('+30% Reload speed')], apply: s => { D(s, 0.6); s.reload /= 1.3; } },
  { id: 'timed', name: 'Timed Detonation', ab: 'TD', type: 'bullet', text: 'Bullets leave a sticky bomb that blows up after half a second.', lines: [b('-15% Damage'), b('+0.25s Reload time')], apply: s => { D(s, -0.15); R(s, 0.25); } },
  { id: 'explosive', name: 'Explosive Bullet', ab: 'EB', type: 'bullet', text: 'Bullets explode on impact.', lines: [g('+ Explosions'), b('-100% Attack speed'), b('+0.25s Reload time')], apply: s => { s.explode += 1; AS(s, -1); R(s, 0.25); } },
  { id: 'grow', name: 'Grow', ab: 'Gr', type: 'bullet', text: 'Bullets deal more damage the farther they travel.', lines: [g('+ Damage over distance'), b('+0.25s Reload time')], apply: s => { R(s, 0.25); } },
  { id: 'mayhem', name: 'Mayhem', ab: 'My', type: 'bullet', text: 'Bullets bounce everywhere.', lines: [g('+5 Bounces'), b('-15% Damage'), b('+0.5s Reload time')], apply: s => { s.bounces += 5; D(s, -0.15); R(s, 0.5); } },
  { id: 'parasite', name: 'Parasite', ab: 'Pa', type: 'bullet', text: 'Damage is dealt over 5 seconds.', lines: [g('+50% Life steal'), g('+30% HP'), g('+25% Damage'), b('+0.25s Reload time')], apply: s => { s.lifesteal += 0.5; HP(s, 0.3); D(s, 0.25); R(s, 0.25); } },
  { id: 'ricochet', name: 'Ricochet', ab: 'Ri', type: 'bullet', text: 'Bullets lose half their speed when they bounce.', lines: [g('+2 Bounces'), g('+25% Attack speed'), b('+0.25s Reload time')], apply: s => { s.bounces += 2; s.bounceKeep = 0.5; AS(s, 0.25); R(s, 0.25); } },
  { id: 'targetbounce', name: 'Target Bounce', ab: 'TB', type: 'bullet', text: 'Bullets seek the enemy after each bounce.', lines: [g('+1 Bounce'), b('-20% Damage'), b('+0.25s Reload time')], apply: s => { s.bounces += 1; D(s, -0.2); R(s, 0.25); } },
  { id: 'thruster', name: 'Thruster', ab: 'Th', type: 'bullet', text: 'Bullets shove the enemy.', lines: [g('+ Knockback'), b('+0.25s Reload time')], apply: s => { s.knock += 1; R(s, 0.25); } },
  { id: 'drill', name: 'Drill Ammo', ab: 'DA', type: 'bullet', text: 'Bullets drill through walls.', lines: [g('+7m Drill'), b('+0.25s Reload time')], apply: s => { s.drill += 250; R(s, 0.25); } },
  { id: 'remote', name: 'Remote', ab: 'Re', type: 'bullet', text: 'Steer your bullets with the mouse.', lines: [b('-40% Bullet speed'), b('+0.25s Reload time')], apply: s => { s.bulletSpeed *= 0.6; R(s, 0.25); } },
  { id: 'toxic', name: 'Toxic Cloud', ab: 'TC', type: 'bullet', text: 'Bullets leave a poison cloud that hurts and slows.', lines: [b('-25% Damage'), b('-20% Attack speed'), b('+0.5s Reload time')], apply: s => { D(s, -0.25); AS(s, -0.2); R(s, 0.5); } },
  { id: 'trickster', name: 'Trickster', ab: 'Tr', type: 'bullet', text: 'Bullets deal 80% more damage per bounce.', lines: [g('+2 Bounces'), b('-20% Damage'), b('+0.5s Reload time')], apply: s => { s.bounces += 2; D(s, -0.2); R(s, 0.5); } },
  { id: 'bouncy', name: 'Bouncy', ab: 'Bo', type: 'bullet', text: 'Bullets bounce.', lines: [g('+2 Bounces'), g('+25% Damage'), b('+0.25s Reload time')], apply: s => { s.bounces += 2; D(s, 0.25); R(s, 0.25); } },
  { id: 'sneaky', name: 'Sneaky Bullets', ab: 'SB', type: 'bullet', text: 'Bullets avoid the ground.', lines: [g('+ Ground avoidance'), b('+0.25s Reload time')], apply: s => { R(s, 0.25); } },
  // Block
  blockCard('frost', 'Frost Slam', 'FS', 'Blocking slows enemies around you.', 0.3),
  blockCard('healfield', 'Healing Field', 'HF', 'Blocking creates a healing field.', 0.3),
  blockCard('bombs', 'Bombs Away', 'Bm', 'Blocking drops six small bombs.', 0.3),
  blockCard('echo', 'Echo', 'Ec', 'Blocking triggers another block right after.', 0.3),
  blockCard('emp', 'EMP', 'EMP', 'Blocking fires a ring of weak shots that slow.', 0.3),
  blockCard('implode', 'Implode', 'Im', 'Blocking pulls enemies toward you.', 0.5),
  blockCard('overpower', 'Overpower', 'Op', 'Blocking deals 15% of your max HP to enemies near you.', 0.3),
  blockCard('radar', 'Radar Shot', 'RS', 'Blocking fires at enemies nearby.', 0.3),
  blockCard('charge', 'Shield Charge', 'SC', 'Blocking launches you forward, then blocks again.', 0),
  blockCard('shockwave', 'Shock Wave', 'SW', 'Blocking pushes enemies away.', 0.5),
  blockCard('silence', 'Silence', 'Si', 'Blocking silences enemies near you. Silenced players can’t shoot or block.', 0.25),
  blockCard('static', 'Static Field', 'SF', 'Blocking leaves a field that slows and hurts.', 0),
  blockCard('saw', 'Saw', 'Sa', 'Blocking spins a saw around you for 2 seconds.', 0.3),
  blockCard('supernova', 'Supernova', 'SN', 'Blocking makes a field that pulls enemies in, then stuns them.', 0.5, 0.5),
  blockCard('tactical', 'Tactical Reload', 'Tac', 'Blocking reloads your gun.', 0),
  { id: 'teleport', name: 'Teleport', ab: 'Te', type: 'block', text: 'Blocking teleports you forward.', lines: [g('-30% Block cooldown')], apply: s => { s.blockCd *= 0.7; } },
  { id: 'empower', name: 'Empower', ab: 'Em', type: 'block', text: 'Blocking powers up your next shot. It also sets off your block effects where it lands.', lines: [b('+0.25s Block cooldown')], apply: s => { BC(s, 0.25); } },
  // Abilities
  { id: 'brawler', name: 'Brawler', ab: 'Br', type: 'skill', text: 'Get a 200 HP shield for 3 seconds after dealing damage.', lines: [g('+200 HP after damage')], apply: () => {} },
  { id: 'chase', name: 'Chase', ab: 'Ch', type: 'skill', text: 'Move faster toward the enemy.', lines: [g('+60% Speed toward enemy')], apply: () => {} },
  { id: 'scavenger', name: 'Scavenger', ab: 'Sv', type: 'skill', text: 'Dealing damage reloads your gun.', lines: [b('+0.5s Reload time')], apply: s => { R(s, 0.5); } },
  { id: 'abyssal', name: 'Abyssal Countdown', ab: 'AC', type: 'skill', text: 'Stand still to charge. Then you block every bullet and hurt enemies near you for 5 seconds.', lines: [g('+ Dark power')], apply: () => {} },
  { id: 'chilling', name: 'Chilling Presence', ab: 'Cl', type: 'skill', text: 'Slightly slows enemies near you.', lines: [g('+25% HP')], apply: s => { HP(s, 0.25); } },
  { id: 'lifestealer', name: 'Life Stealer', ab: 'LS', type: 'skill', text: 'Drain HP from the enemy when you’re close.', lines: [g('+25% HP')], apply: s => { HP(s, 0.25); } },
  { id: 'phoenix', name: 'Phoenix', ab: 'Ph', type: 'skill', text: 'Come back to life once per round.', lines: [g('+1 Life'), b('-35% HP')], apply: s => { HP(s, -0.35); } },
  { id: 'radiance', name: 'Radiance', ab: 'Ra', type: 'skill', text: 'Reloading sends out damaging waves, faster as the reload finishes.', lines: [g('+30% HP')], apply: s => { HP(s, 0.3); } },
  { id: 'refresh', name: 'Refresh', ab: 'Rf', type: 'skill', text: 'Dealing damage gives your block back.', lines: [g('+ Block on hit')], apply: () => {} },
  { id: 'shieldsup', name: 'Shields Up', ab: 'SU', type: 'skill', text: 'Firing your last bullet blocks. You only reload when empty.', lines: [b('+0.5s Reload time'), b('+0.5s Block cooldown')], apply: s => { R(s, 0.5); BC(s, 0.5); } },
  { id: 'tasteofblood', name: 'Taste of Blood', ab: 'ToB', type: 'skill', text: '+50% move speed for 3 seconds after dealing damage.', lines: [g('+50% Speed after hitting')], apply: () => {} },
  // Body
  { id: 'huge', name: 'Huge', ab: 'Hu', type: 'body', text: '', lines: [g('+80% HP')], apply: s => { HP(s, 0.8); } },
  { id: 'leech', name: 'Leech', ab: 'Le', type: 'body', text: 'Heal from the damage you deal.', lines: [g('+75% Life steal'), g('+30% HP')], apply: s => { s.lifesteal += 0.75; HP(s, 0.3); } },
  { id: 'tank', name: 'Tank', ab: 'Ta', type: 'body', text: '', lines: [g('+100% HP'), b('-25% Attack speed'), b('+0.5s Reload time')], apply: s => { HP(s, 1); AS(s, -0.25); R(s, 0.5); } },
  { id: 'decay', name: 'Decay', ab: 'De', type: 'body', text: 'Damage you take is spread out over 4 seconds.', lines: [g('+50% HP')], apply: s => { HP(s, 0.5); } },
  { id: 'defender', name: 'Defender', ab: 'Df', type: 'body', text: '', lines: [g('-30% Block cooldown'), g('+30% HP')], apply: s => { s.blockCd *= 0.7; HP(s, 0.3); } },
  { id: 'glass', name: 'Glass Cannon', ab: 'GC', type: 'body', text: '', lines: [g('+100% Damage'), b('-100% HP'), b('+0.25s Reload time')], apply: s => { D(s, 1); HP(s, -1); R(s, 0.25); } },
  { id: 'quickreload', name: 'Quick Reload', ab: 'QR', type: 'body', text: '', lines: [g('-70% Reload time')], apply: s => { s.reload *= 0.3; } },
  { id: 'pristine', name: 'Pristine Perseverance', ab: 'PP', type: 'body', text: '+400 HP while you’re above 90% HP.', lines: [g('+400 HP while healthy')], apply: () => {} },
];
export const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));

export function statsFor(cards = []) {
  const s = { ...BASE, c: {} };
  for (const id of cards) { const c = CARD[id]; if (!c) continue; c.apply(s); s.c[id] = (s.c[id] || 0) + 1; }
  if (s.c.demonic) s.fireDelay = 0.05;
  s.hp = Math.max(10, Math.round(s.hp));
  s.fireDelay = Math.max(0.05, s.fireDelay);
  s.reload = Math.max(0.2, s.reload);
  s.blockCd = Math.max(0.5, s.blockCd);
  s.ammo = Math.max(1, Math.min(60, s.ammo));
  s.bullets = Math.min(20, s.bullets);
  s.burst = Math.min(8, s.burst);
  s.bounces = Math.min(20, s.bounces);
  s.bulletSpeed = Math.min(6000, s.bulletSpeed);
  s.spread = Math.min(1.6, s.spread);
  s.lifesteal = Math.min(2, s.lifesteal);
  return s;
}
export const explodeRadius = s => s.explode ? 80 + 30 * (s.explode - 1) : 0;

/* ═══════════ Physics ═══════════ */
const over = (x, y, hw, hh, r) => x + hw > r[0] && x - hw < r[0] + r[2] && y + hh > r[1] && y - hh < r[1] + r[3];

// Moves a player box one step. Returns 'ground' | 'wall' | 'air' when it jumped.
export function stepPlayer(p, input, s, solids, dt) {
  const max = 380 * s.move, accel = p.ground ? 4200 : 2600;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) p.vx += Math.sign(dir * max - p.vx) * Math.min(Math.abs(dir * max - p.vx), accel * dt);
  else p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), (p.ground ? 3600 : 700) * dt);
  if (Math.abs(p.vx) > max * 1.9) p.vx *= 0.94; // knockback bleeds off

  p.coyote = p.ground ? 0.09 : Math.max(0, (p.coyote || 0) - dt);
  if (p.ground) p.airJumps = s.jumps - 1;
  let jumped = null;
  if (input.jump) {
    const jv = -900 * Math.sqrt(s.jumpPower);
    if (p.ground || p.coyote > 0) { p.vy = jv; p.coyote = 0; jumped = 'ground'; }
    else if (p.wall) { p.vy = jv * 0.92; p.vx = -p.wall * 470 * s.move; jumped = 'wall'; }
    else if (p.airJumps > 0) { p.vy = jv * 0.9; p.airJumps--; jumped = 'air'; }
  }
  if (!input.jumpHeld && p.vy < -300) p.vy += GRAV * 1.6 * dt;
  p.vy += GRAV * dt;
  if (p.wall && p.vy > 240 && dir === p.wall) p.vy = 240;
  p.vy = Math.min(p.vy, 1500);

  p.x += p.vx * dt;
  p.wall = 0;
  for (const r of solids) if (over(p.x, p.y, PR, PR, r)) {
    if (p.vx > 0) { p.x = r[0] - PR; p.wall = 1; } else if (p.vx < 0) { p.x = r[0] + r[2] + PR; p.wall = -1; }
    p.vx = 0;
  }
  if (!p.wall) for (const r of solids) {
    if (over(p.x + 2, p.y, PR, PR - 4, r)) p.wall = 1; else if (over(p.x - 2, p.y, PR, PR - 4, r)) p.wall = -1;
  }
  p.y += p.vy * dt;
  p.ground = false; p.on = null;
  for (const r of solids) if (over(p.x, p.y, PR, PR, r)) {
    if (p.vy > 0) { p.y = r[1] - PR; p.ground = true; p.on = r[4]; } else if (p.vy < 0) { p.y = r[1] + r[3] + PR; }
    p.vy = 0;
  }
  // Something moving (a rope box) pushed into us: shove out the shortest way.
  for (const r of solids) if (over(p.x, p.y, PR - 1, PR - 1, r)) {
    const l = p.x + PR - r[0], rr = r[0] + r[2] - (p.x - PR), u = p.y + PR - r[1], d = r[1] + r[3] - (p.y - PR);
    const m = Math.min(l, rr, u, d);
    if (m === u) { p.y -= u; p.ground = true; p.on = r[4]; p.vy = Math.min(0, p.vy); } else if (m === d) p.y += d; else if (m === l) p.x -= l; else p.x += rr;
  }
  if (p.y < -700) { p.y = -700; p.vy = Math.max(0, p.vy); }
  if (p.ground) p.wall = 0;
  return jumped;
}

// Out of bounds: the sides and the bottom bounce you back in. Returns true if it bounced.
export function bounceBack(p) {
  if (p.y > H - 4) { p.y = H - 4; p.vy = -1750; p.vx *= 0.5; return true; }
  if (p.x < 4) { p.x = 4; p.vx = 1100; p.vy = Math.min(p.vy, -500); return true; }
  if (p.x > W - 4) { p.x = W - 4; p.vx = -1100; p.vy = Math.min(p.vy, -500); return true; }
  return false;
}

// Bullets: returns null while flying, or {x, y, out} / {x, y, wall, tag} when it stops.
// Break-block impacts (including bounces) are pushed onto b.imp so the shooter can report them.
export function stepBullet(b, solids, dt, env = {}) {
  if (b.delay > 0) { b.delay -= dt; if (b.delay > 0) return null; dt = -b.delay; b.delay = 0; }
  b.life -= dt;
  if (b.life <= 0 || b.y > H + 120 || b.x < -200 || b.x > W + 200) return { x: b.x, y: b.y, out: true };
  const steer = (tx, ty, rate) => {
    const want = Math.atan2(ty - b.y, tx - b.x), cur = Math.atan2(b.vy, b.vx);
    let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const turn = Math.max(-1, Math.min(1, d)) * rate * dt, sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
  };
  if (b.remote && env.cursor) steer(env.cursor.x, env.cursor.y, 7);
  if (b.tb && b.bounced && env.target) steer(env.target.x, env.target.y, 5 * b.tb);
  b.vy += b.grav * dt;
  if (b.sneaky) for (const r of solids) if (b.x > r[0] - 10 && b.x < r[0] + r[2] + 10 && r[1] > b.y && r[1] - b.y < 90) { b.vy -= (b.grav + 2200) * dt; break; }
  const sp = Math.hypot(b.vx, b.vy);
  const steps = Math.min(16, Math.max(1, Math.ceil(sp * dt / Math.max(4, b.r))));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const nx = b.x + b.vx * h, ny = b.y + b.vy * h;
    let hitX = false, hitY = false, tag = null;
    for (const r of solids) {
      if (!over(nx, ny, b.r, b.r, r)) continue;
      if (b.drill > 0) { hitX = hitY = false; tag = 'drill'; break; }
      if (over(nx, b.y, b.r, b.r, r)) hitX = true;
      if (over(b.x, ny, b.r, b.r, r)) hitY = true;
      if (!hitX && !hitY) hitX = hitY = true;
      tag = r[4];
    }
    if (tag === 'drill') { b.drill -= sp * h; b.x = nx; b.y = ny; b.dist += sp * h; continue; }
    if (hitX || hitY) {
      if (tag && tag[0] === 'b') (b.imp || (b.imp = [])).push(tag);
      if (b.bounces > 0) {
        b.bounces--;
        if (hitX) b.vx = -b.vx * b.keep;
        if (hitY) b.vy = -b.vy * b.keep;
        b.bounced = (b.bounced || 0) + 1;
        continue;
      }
      return { x: b.x, y: b.y, wall: true, tag };
    }
    b.x = nx; b.y = ny; b.dist += sp * h;
  }
  return null;
}

export function bulletHitsBox(b, p) {
  if (b.delay > 0) return false;
  const r = b.r + (b.pad || 0);
  const cx = Math.max(p.x - PR, Math.min(b.x, p.x + PR)), cy = Math.max(p.y - PR, Math.min(b.y, p.y + PR));
  return (b.x - cx) ** 2 + (b.y - cy) ** 2 <= r * r;
}

// Bullets for one trigger pull: [{x, y, vx, vy, delay}] (ids added by the caller).
export function makeShot(s, x, y, angle, rand = Math.random, power = 1) {
  const out = [];
  for (let k = 0; k < s.burst; k++) {
    for (let i = 0; i < s.bullets; i++) {
      const off = s.bullets > 1 ? (i / (s.bullets - 1) - 0.5) * (s.spread + 0.06 * s.bullets) : 0;
      const a = angle + off + (rand() - 0.5) * (0.02 + s.spread * 0.12 + s.jitter);
      const sp = s.bulletSpeed * power * (s.bullets > 1 ? 0.92 + rand() * 0.16 : 1);
      out.push({ x: x + Math.cos(angle) * 26, y: y + Math.sin(angle) * 26, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, delay: k * 0.07 });
    }
  }
  return out;
}
export function bulletFrom(shot, s, owner) {
  const c = s.c;
  return {
    id: shot.id, owner, x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, delay: shot.delay || 0, e: shot.e ? 1 : 0,
    r: s.size, pad: s.pad, grav: c.sneaky ? s.bulletGrav * 0.5 : s.bulletGrav, bounces: s.bounces, keep: s.bounceKeep,
    life: 4, dist: 0, bounced: 0, boom: explodeRadius(s), knock: s.knock, drill: s.drill,
    tb: c.targetbounce || 0, remote: !!c.remote, sneaky: !!c.sneaky, timed: !!c.timed, toxic: c.toxic || 0,
    cold: c.cold || 0, dazzle: c.dazzle || 0, splash: !!c.demonic, kind: 'hit',
  };
}

/* ═══════════ Damage ═══════════
   The player who gets hurt reports it (kind + unique key); the amount comes from the attacker's cards here. */
export function damageFor(kind, s, msg, victimMax) {
  const c = s.c;
  switch (kind) {
    case 'hit': {
      let d = s.dmg * (msg.e ? 1.6 : 1);
      if (c.grow) d *= 1 + c.grow * Math.min(3, (Number(msg.d) || 0) / 700);
      if (c.trickster) d *= 1 + 0.8 * c.trickster * Math.min(10, Number(msg.bn) || 0);
      return d;
    }
    case 'boom': return s.dmg * 0.75;
    case 'splash': return 6 * (c.demonic || 1);
    case 'bomb': return 18;
    case 'emp': return 5;
    case 'saw': return 12 * (c.saw || 1);
    case 'static': return 8 * (c.static || 1);
    case 'over': return 0.15 * s.hp * (c.overpower || 1);
    case 'cloud': return 16 * (c.toxic || 1);
    case 'drain': return 6 * (c.lifestealer || 1);
    case 'rad': return 7 * (c.radiance || 1);
    case 'abyss': return 15 * (c.abyssal || 1);
    case 'hazard': return 25;
    case 'oob': return Math.max(15, victimMax * 0.2);
  }
  return 0;
}
const OWNER_KINDS = new Set(['hit', 'boom', 'splash', 'bomb', 'emp', 'saw', 'static', 'over', 'cloud', 'drain', 'rad', 'abyss']);

/* ═══════════ Match flow (authoritative side) ═══════════ */
const TIMES = { invite: 120, countdown: 3, roundEnd: 1.8, pick: 30, awayForfeit: 45, awayClose: 90 };
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v, n = 64) => String(v ?? '').slice(0, n);
const clean = t => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
const now = () => (globalThis.performance?.now() ?? Date.now()) / 1000;

export class Match {
  constructor({ id, players, rounds = 5, emit, onClose }) {
    this.id = id;
    this.emit = emit;
    this.onClose = onClose || (() => {});
    this.rounds = ROUND_OPTIONS.includes(rounds) ? rounds : 5;
    this.p = players.map(u => ({ id: u.id, username: u.username, color: u.color ?? 200, bot: !!u.bot,
      cards: [], score: 0, hp: 100, connected: !!u.bot, away: 0, ready: !!u.bot, rematch: !!u.bot }));
    this.phase = 'invite';
    this.timer = TIMES.invite;
    this.map = 0;
    this.round = 0;
    this.pick = null;
    this.winner = -1;
    this.lastPick = null;
    this.keys = new Set();
    this.broken = new Set();
    this.breakHp = [];
    this.clock = 0;
    this.chatHits = [[], []];
    this.hpDirty = false;
  }
  stats(i) { return statsFor(this.p[i].cards); }
  slotOf(uid) { return this.p.findIndex(p => p.id === uid); }
  shieldOf(p) { return Math.ceil((p.brawl || 0) + (p.pristine || 0)); }
  snapshot() {
    return {
      id: this.id, phase: this.phase, rounds: this.rounds, map: this.map, round: this.round, timer: Math.max(0, this.timer),
      winner: this.winner, reason: this.reason || null, lastPick: this.lastPick, broken: [...this.broken],
      pick: this.pick && { slot: this.pick.slot, options: this.pick.options },
      players: this.p.map(p => ({ id: p.id, username: p.username, color: p.color, bot: p.bot, cards: p.cards, score: p.score,
        hp: Math.ceil(p.hp), sh: this.shieldOf(p), maxHp: statsFor(p.cards).hp, connected: p.connected, ready: p.ready, rematch: p.rematch })),
    };
  }
  hpMsg() { return { hp: this.p.map(p => Math.max(0, Math.ceil(p.hp))), sh: this.p.map(p => this.shieldOf(p)) }; }
  sync() { this.emit(-1, { t: 'state', match: this.snapshot() }); }
  sys(text) { this.emit(-1, { t: 'chat', sys: true, text }); }
  setPhase(phase, timer = 0) { this.phase = phase; this.timer = timer; this.sync(); }
  close(reason) {
    if (this.phase === 'closed') return;
    this.reason = reason;
    this.setPhase('closed');
    this.onClose(reason);
  }

  connect(slot) {
    const p = this.p[slot]; if (!p) return;
    const was = p.connected;
    p.connected = true; p.away = 0;
    if (slot === 1 && this.phase === 'invite') { this.phase = 'lobby'; this.sys(`${p.username} joined. Pick the rounds and hit Ready.`); }
    else if (!was && this.phase !== 'invite') this.sys(`${p.username} is back.`);
    this.sync();
  }
  disconnect(slot) {
    const p = this.p[slot]; if (!p || !p.connected) return;
    p.connected = false; p.away = 0;
    if (this.phase === 'lobby') p.ready = false;
    if (!['invite', 'closed'].includes(this.phase)) this.sys(`${p.username} disconnected…`);
    this.sync();
  }
  leave(slot) {
    const p = this.p[slot]; if (!p) return;
    if (this.phase === 'invite') return this.close(slot === 0 ? 'cancelled' : 'declined');
    if (['countdown', 'fight', 'roundEnd', 'pick'].includes(this.phase)) return this.finish(1 - slot, `${p.username} left the match.`);
    if (this.phase === 'lobby') return this.close(`${p.username} left.`);
    p.connected = false; p.rematch = false;
    this.sys(`${p.username} left.`);
    this.sync();
  }

  startRound() {
    let m; do { m = Math.floor(Math.random() * MAPS.length); } while (m === this.map && this.round > 0);
    this.map = m;
    this.round++;
    this.winner = -1;
    this.pick = null;
    this.keys.clear();
    this.broken.clear();
    this.breakHp = (MAPS[m].breaks || []).map(() => BREAK_HP);
    this.p.forEach((p, i) => {
      const s = this.stats(i);
      Object.assign(p, { hp: s.hp, dots: [], brawl: 0, brawlT: 0, pristine: 400 * (s.c.pristine || 0), lives: s.c.phoenix || 0, shotLog: [], blockLog: [], healLog: [] });
    });
    this.setPhase('countdown', TIMES.countdown);
  }
  finish(winner, reason) {
    this.winner = winner;
    this.reason = reason || null;
    this.p.forEach(p => { p.rematch = p.bot; });
    this.setPhase('over');
  }
  endRound(winner) {
    if (this.phase !== 'fight') return;
    this.winner = winner;
    this.p[winner].score++;
    this.setPhase('roundEnd', TIMES.roundEnd);
  }

  // Take HP off, through shields. Returns what actually came off HP + shields.
  hurt(slot, amount, fx) {
    const p = this.p[slot];
    if (this.phase !== 'fight' || p.hp <= 0 || amount <= 0) return 0;
    let a = amount;
    const eat = k => { const t = Math.min(p[k] || 0, a); p[k] = (p[k] || 0) - t; a -= t; };
    eat('brawl'); eat('pristine');
    p.hp -= a;
    this.hpDirty = true;
    if (p.hp <= 0) {
      if (p.lives > 0) {
        p.lives--; p.hp = this.stats(slot).hp; p.dots = [];
        this.emit(-1, { t: 'dmg', target: slot, kind: 'revive', dmg: 0, rev: 1, ...this.hpMsg() });
      } else {
        p.hp = 0;
        if (fx) this.emit(-1, { ...fx, ...this.hpMsg() });
        this.endRound(1 - slot);
        return amount;
      }
    }
    if (fx) this.emit(-1, { ...fx, ...this.hpMsg() });
    return amount;
  }
  heal(slot, amount) {
    const p = this.p[slot], max = this.stats(slot).hp;
    if (p.hp <= 0 || amount <= 0) return;
    p.hp = Math.min(max, p.hp + amount); this.hpDirty = true;
  }

  tick(dt) {
    this.clock += dt;
    for (let i = 0; i < 2; i++) {
      const p = this.p[i];
      if (p.connected) continue;
      p.away += dt;
      if (['countdown', 'fight', 'roundEnd', 'pick'].includes(this.phase) && p.away > TIMES.awayForfeit) this.finish(1 - i, `${p.username} disconnected.`);
      else if (this.phase === 'lobby' && p.away > TIMES.awayForfeit) this.close(`${p.username} disconnected.`);
      else if (this.phase === 'invite' && i === 0 && p.away > 20) this.close('cancelled');
    }
    if (this.phase === 'over' && this.p.every(p => !p.connected && p.away > 20)) this.close('ended');
    if (this.p.every(p => !p.connected && p.away > TIMES.awayClose)) this.close('ended');

    if (this.phase === 'fight') {
      this.p.forEach((p, i) => {
        const s = this.stats(i);
        // Poison, Parasite and Decay: damage over time.
        if (p.dots?.length) {
          let d = 0;
          for (const o of p.dots) { const step = Math.min(o.t, dt); d += o.per * step; o.t -= step; }
          p.dots = p.dots.filter(o => o.t > 0);
          if (d > 0 && this.phase === 'fight') this.hurt(i, d);
        }
        if (p.brawlT > 0) { p.brawlT -= dt; if (p.brawlT <= 0) { p.brawl = 0; this.hpDirty = true; } }
        if (s.c.pristine && p.hp >= s.hp * 0.9 && p.pristine < 400 * s.c.pristine) { p.pristine = 400 * s.c.pristine; this.hpDirty = true; }
      });
      if (this.hpDirty && Math.floor(this.clock * 10) !== Math.floor((this.clock - dt) * 10)) { this.hpDirty = false; this.emit(-1, { t: 'hp', ...this.hpMsg() }); }
    }
    if (!this.timer) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0;
    if (this.phase === 'invite') this.close('expired');
    else if (this.phase === 'countdown') this.setPhase('fight');
    else if (this.phase === 'roundEnd') {
      const w = this.winner;
      if (this.p[w].score >= this.rounds) return this.finish(w);
      const options = [];
      while (options.length < PICKS) { const c = CARDS[Math.floor(Math.random() * CARDS.length)].id; if (!options.includes(c)) options.push(c); }
      this.pick = { slot: 1 - w, options };
      this.lastPick = null;
      this.setPhase('pick', TIMES.pick);
    } else if (this.phase === 'pick') this.choose(this.pick.slot, this.pick.options[Math.floor(Math.random() * PICKS)]);
  }

  choose(slot, card) {
    if (this.phase !== 'pick' || this.pick?.slot !== slot || !this.pick.options.includes(card)) return;
    this.p[slot].cards.push(card);
    this.lastPick = { slot, card };
    this.startRound();
  }

  // Keeps only recent timestamps; true if there's still room for one more.
  allow(p, key, windowS, max) {
    const t = now();
    p[key] = (p[key] || []).filter(x => t - x < windowS);
    if (p[key].length >= max) return false;
    p[key].push(t);
    return true;
  }

  handle(slot, msg) {
    if (!msg || typeof msg !== 'object') return;
    const me = this.p[slot], other = 1 - slot;
    const live = ['countdown', 'fight', 'roundEnd'].includes(this.phase);
    switch (msg.t) {
      case 's':
        if (live) this.emit(other, { t: 's', x: num(msg.x), y: num(msg.y), vx: num(msg.vx), vy: num(msg.vy), a: num(msg.a), b: msg.b ? 1 : 0, g: msg.g ? 1 : 0,
          mx: num(msg.mx), my: num(msg.my), ab: num(msg.ab), ch: num(msg.ch), rl: msg.rl ? 1 : 0 });
        return;
      case 'shoot': {
        if (this.phase !== 'fight' || me.hp <= 0 || !Array.isArray(msg.shots)) return;
        const s = this.stats(slot);
        if (!this.allow(me, 'shotLog', 2, 2 / s.fireDelay + s.ammo + 8)) return;
        const shots = msg.shots.slice(0, s.bullets * s.burst).map(b => ({
          id: str(b.id, 40), x: num(b.x), y: num(b.y), vx: num(b.vx), vy: num(b.vy), delay: Math.min(1, Math.max(0, num(b.delay))), e: b.e ? 1 : 0,
        }));
        this.emit(other, { t: 'shoot', slot, shots });
        if (s.c.demonic) this.hurt(slot, 10 * s.c.demonic, { t: 'dmg', target: slot, kind: 'pact', dmg: 10 * s.c.demonic });
        return;
      }
      case 'block':
        if (!live || me.hp <= 0) return;
        if (!this.allow(me, 'blockLog', 3, 3 / this.stats(slot).blockCd + 6)) return;
        this.emit(other, { t: 'block', slot, key: str(msg.key), x: num(msg.x), y: num(msg.y), a: num(msg.a), area: msg.area ? 1 : 0 });
        return;
      case 'fx':
        if (!live) return;
        this.emit(other, { t: 'fx', slot, k: str(msg.k, 10), key: str(msg.key), x: num(msg.x), y: num(msg.y) });
        return;
      case 'bhit': { // the shooter says their bullet hit a breakable block
        const i = Math.floor(num(msg.i)), key = 'bh:' + str(msg.key);
        if (this.phase !== 'fight' || this.broken.has(i) || this.breakHp[i] === undefined || this.keys.has(key)) return;
        this.keys.add(key);
        this.breakHp[i] -= Math.max(20, this.stats(slot).dmg * (msg.boom ? 1.5 : 1));
        if (this.breakHp[i] <= 0) { this.broken.add(i); this.emit(-1, { t: 'break', i }); }
        return;
      }
      case 'heal': {
        const s = this.stats(slot), key = 'hl:' + str(msg.key);
        if (this.phase !== 'fight' || !s.c.healfield || this.keys.has(key) || !this.allow(me, 'healLog', 3, 8 * s.c.healfield)) return;
        this.keys.add(key);
        this.heal(slot, 9 * s.c.healfield);
        return;
      }
      case 'hit': { // the player who got hit reports it
        if (this.phase !== 'fight' || me.hp <= 0) return;
        const kind = str(msg.kind, 10), key = str(msg.key), x = num(msg.x), y = num(msg.y);
        if (key) { if (this.keys.has(key)) return; this.keys.add(key); }
        if (kind === 'block') { this.emit(-1, { t: 'blocked', slot, bid: str(msg.bid), x, y }); return; }
        const maxHp = this.stats(slot).hp;
        const src = OWNER_KINDS.has(kind) ? this.stats(other) : null;
        const dmg = damageFor(kind, src || this.stats(slot), msg, maxHp);
        if (!dmg) return;
        const fx = { t: 'dmg', target: slot, bid: str(msg.bid), kind, dmg: Math.round(dmg), x, y };
        const mine = this.stats(slot);
        if (src && kind === 'hit' && (src.c.poison || src.c.parasite)) {
          me.dots.push({ per: dmg / (src.c.poison ? 3 : 5), t: src.c.poison ? 3 : 5 });
          this.emit(-1, { ...fx, dot: 1, ...this.hpMsg() });
        } else if (mine.c.decay && kind !== 'oob') {
          me.dots.push({ per: dmg / 4, t: 4 });
          this.emit(-1, { ...fx, dot: 1, ...this.hpMsg() });
        } else this.hurt(slot, dmg, fx);
        if (src) {
          const o = this.p[other];
          if (src.lifesteal && ['hit', 'boom', 'splash'].includes(kind)) this.heal(other, dmg * src.lifesteal);
          if (kind === 'drain') this.heal(other, dmg);
          if (src.c.brawler && o.hp > 0) { o.brawl = Math.max(o.brawl || 0, 200 * src.c.brawler); o.brawlT = 3; this.hpDirty = true; }
        }
        return;
      }
      case 'pick': return this.choose(slot, String(msg.card));
      case 'ready':
        if (this.phase !== 'lobby') return;
        me.ready = !!msg.v;
        if (this.p.every(p => p.ready && p.connected)) { this.sys(`First to ${this.rounds}. Good luck!`); this.startRound(); }
        else this.sync();
        return;
      case 'rounds':
        if (this.phase !== 'lobby' || slot !== 0 || !ROUND_OPTIONS.includes(msg.n)) return;
        this.rounds = msg.n;
        this.p.forEach(p => { p.ready = p.bot; });
        this.sys(`Rounds set to first to ${this.rounds}.`);
        this.sync();
        return;
      case 'rematch':
        if (this.phase !== 'over') return;
        me.rematch = !!msg.v;
        if (this.p.every(p => p.rematch && p.connected)) {
          this.p.forEach(p => { p.cards = []; p.score = 0; });
          this.round = 0;
          this.lastPick = null;
          this.sys('Rematch!');
          this.startRound();
        } else this.sync();
        return;
      case 'chat': {
        const text = clean(msg.text); if (!text) return;
        const recent = this.chatHits[slot] = this.chatHits[slot].filter(t => this.clock - t < 6);
        if (recent.length >= 5) return;
        recent.push(this.clock);
        this.emit(-1, { t: 'chat', from: slot, name: me.username, color: me.color, text });
        return;
      }
      case 'ping': this.emit(slot, { t: 'pong', c: num(msg.c) }); return;
      case 'leave': this.leave(slot); return;
    }
  }
}
