// The game itself: world, input, player, enemies, combat, rendering.
// Progression rules live in progression.js and data.js; this file only reports
// what happened (P.addXP, P.bump) and asks what the player has (P.has).
(function () {
  'use strict';
  const C = window.GAME_CONFIG, D = window.GAME_DATA, P = window.Progress, UI = window.UI;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  let VW = 1, VH = 1, DPR = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = Math.max(1, r.width); VH = Math.max(1, r.height);
    canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR);
  }
  const viewScale = () => (VW < 640 ? 0.72 : 1);

  // ======================= WORLD =======================
  const WORLD = C.world;
  const TOWN = { x: 120, y: 560, w: 480, h: 480 };
  const TOWN_REGION = { id: 'town', name: 'Hollowford' };
  const WELL = { x: 360, y: 820, r: 24 };
  const MASTER = { x: 230, y: 680, r: 14 };
  const LECTERN = { x: 500, y: 680, r: 14 };
  const REGIONS = [
    { id: 'meadow', name: 'Greenwater Meadow', x: 0, y: 0, w: 1300, h: 1600, color: '#27351f', spawns: [{ type: 'slime', count: 8 }] },
    { id: 'barrow', name: 'Old Barrow', x: 1300, y: 0, w: 1100, h: 560, color: '#24282b', spawns: [{ type: 'skeleton', count: 5 }] },
    { id: 'marsh', name: 'Toadmire', x: 1300, y: 560, w: 1100, h: 520, color: '#1b2f2b', spawns: [{ type: 'toad', count: 5 }, { type: 'slime', count: 2 }] },
    { id: 'ash', name: 'Cinder Flats', x: 1300, y: 1080, w: 1100, h: 520, color: '#35261f', spawns: [{ type: 'imp', count: 4 }, { type: 'skeleton', count: 2 }] },
  ];
  const R = {}; REGIONS.forEach(r => { R[r.id] = r; });
  const inRect = (o, r, pad = 0) => o.x > r.x - pad && o.x < r.x + r.w + pad && o.y > r.y - pad && o.y < r.y + r.h + pad;
  const inTown = o => inRect(o, TOWN);
  function regionAt(x, y) {
    if (inRect({ x, y }, TOWN)) return TOWN_REGION;
    for (const r of REGIONS) if (inRect({ x, y }, r)) return r;
    return REGIONS[0];
  }

  const obstacles = [];
  (function genObstacles() {
    const rng = mulberry32(7);
    const gate = { x: TOWN.x + TOWN.w, y: TOWN.y + TOWN.h / 2 };
    const add = (region, n, kind, rmin, rmax) => {
      let tries = 0;
      while (n > 0 && tries++ < 600) {
        const x = region.x + 40 + rng() * (region.w - 80), y = region.y + 40 + rng() * (region.h - 80), r = rmin + rng() * (rmax - rmin);
        if (inRect({ x, y }, TOWN, 90)) continue;
        if (hyp(x, y, gate.x, gate.y) < 170) continue;
        if (obstacles.some(o => hyp(o.x, o.y, x, y) < o.r + r + 46)) continue;
        obstacles.push({ x, y, r, kind, seed: rng() });
        n--;
      }
    };
    add(R.meadow, 30, 'tree', 18, 26); add(R.meadow, 8, 'rock', 12, 18);
    add(R.barrow, 34, 'grave', 10, 13); add(R.barrow, 6, 'deadtree', 14, 18);
    add(R.marsh, 12, 'stump', 11, 15); add(R.marsh, 6, 'rock', 12, 16);
    add(R.ash, 20, 'rock', 12, 22);
  })();

  // Ground is painted once to an offscreen canvas.
  const bg = document.createElement('canvas');
  bg.width = WORLD.w; bg.height = WORLD.h;
  (function paintGround() {
    const b = bg.getContext('2d'), rng = mulberry32(11);
    for (const r of REGIONS) { b.fillStyle = r.color; b.fillRect(r.x, r.y, r.w, r.h); }
    // soft seams between regions
    for (const r of REGIONS.slice(1)) {
      const g = b.createLinearGradient(r.x - 60, 0, r.x + 60, 0);
      g.addColorStop(0, 'rgba(39,53,31,0)'); g.addColorStop(0.5, 'rgba(20,24,20,0.35)'); g.addColorStop(1, 'rgba(20,24,20,0)');
      b.fillStyle = g; b.fillRect(r.x - 60, r.y, 120, r.h);
    }
    for (let i = 0; i < 11000; i++) {
      const x = rng() * WORLD.w, y = rng() * WORLD.h, reg = regionAt(x, y).id;
      if (reg === 'meadow') {
        b.strokeStyle = rng() < 0.5 ? 'rgba(130,170,90,0.16)' : 'rgba(20,30,15,0.25)'; b.lineWidth = 1.2;
        b.beginPath(); b.moveTo(x, y); b.lineTo(x + rng() * 4 - 2, y - 4 - rng() * 5); b.stroke();
      } else if (reg === 'barrow') {
        b.fillStyle = rng() < 0.5 ? 'rgba(150,150,140,0.10)' : 'rgba(10,10,12,0.25)'; b.fillRect(x, y, 2, 2);
      } else if (reg === 'marsh') {
        if (rng() < 0.05) { b.fillStyle = 'rgba(30,80,80,0.35)'; b.beginPath(); b.ellipse(x, y, 14 + rng() * 30, 6 + rng() * 12, rng() * 3, 0, TAU); b.fill(); }
        else { b.strokeStyle = 'rgba(110,140,80,0.14)'; b.beginPath(); b.moveTo(x, y); b.lineTo(x + 1, y - 7); b.stroke(); }
      } else if (reg === 'ash') {
        if (rng() < 0.04) { b.strokeStyle = 'rgba(15,8,6,0.5)'; b.lineWidth = 1.4; b.beginPath(); b.moveTo(x, y); let cx = x, cy = y; for (let k = 0; k < 4; k++) { cx += rng() * 24 - 12; cy += rng() * 24 - 12; b.lineTo(cx, cy); } b.stroke(); }
        else if (rng() < 0.08) { b.fillStyle = 'rgba(228,138,69,0.35)'; b.fillRect(x, y, 2, 2); }
        else { b.fillStyle = 'rgba(80,70,60,0.12)'; b.fillRect(x, y, 2, 2); }
      }
    }
    // dirt road from the east gate
    b.strokeStyle = 'rgba(110,92,64,0.38)'; b.lineWidth = 34; b.lineCap = 'round';
    b.beginPath(); b.moveTo(TOWN.x + TOWN.w, TOWN.y + TOWN.h / 2); b.bezierCurveTo(900, 820, 1150, 760, 1500, 820); b.stroke();
    b.beginPath(); b.moveTo(1100, 790); b.bezierCurveTo(1250, 600, 1400, 400, 1700, 300); b.stroke();
    b.beginPath(); b.moveTo(1150, 800); b.bezierCurveTo(1250, 1000, 1450, 1250, 1750, 1320); b.stroke();
    // town square
    b.fillStyle = '#423c30'; b.fillRect(TOWN.x, TOWN.y, TOWN.w, TOWN.h);
    b.strokeStyle = 'rgba(20,16,10,0.35)'; b.lineWidth = 1;
    for (let y = TOWN.y; y < TOWN.y + TOWN.h; y += 16) {
      const off = ((y - TOWN.y) / 16) % 2 ? 12 : 0;
      b.beginPath(); b.moveTo(TOWN.x, y); b.lineTo(TOWN.x + TOWN.w, y); b.stroke();
      for (let x = TOWN.x + off; x < TOWN.x + TOWN.w; x += 24) { b.beginPath(); b.moveTo(x, y); b.lineTo(x, y + 16); b.stroke(); }
    }
    // fence with four gates
    b.fillStyle = '#6b5638';
    const gates = [[TOWN.x + TOWN.w / 2, TOWN.y], [TOWN.x + TOWN.w / 2, TOWN.y + TOWN.h], [TOWN.x, TOWN.y + TOWN.h / 2], [TOWN.x + TOWN.w, TOWN.y + TOWN.h / 2]];
    const nearGate = (x, y) => gates.some(([gx, gy]) => hyp(gx, gy, x, y) < 44);
    for (let x = TOWN.x; x <= TOWN.x + TOWN.w; x += 20) for (const y of [TOWN.y, TOWN.y + TOWN.h]) if (!nearGate(x, y)) b.fillRect(x - 3, y - 3, 6, 6);
    for (let y = TOWN.y; y <= TOWN.y + TOWN.h; y += 20) for (const x of [TOWN.x, TOWN.x + TOWN.w]) if (!nearGate(x, y)) b.fillRect(x - 3, y - 3, 6, 6);
    b.strokeStyle = '#6b5638'; b.lineWidth = 2;
    const rail = (x1, y1, x2, y2) => { b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y2); b.stroke(); };
    const cx = TOWN.x + TOWN.w / 2, cy = TOWN.y + TOWN.h / 2;
    for (const y of [TOWN.y, TOWN.y + TOWN.h]) { rail(TOWN.x, y, cx - 44, y); rail(cx + 44, y, TOWN.x + TOWN.w, y); }
    for (const x of [TOWN.x, TOWN.x + TOWN.w]) { rail(x, TOWN.y, x, cy - 44); rail(x, cy + 44, x, TOWN.y + TOWN.h); }
  })();

  // ======================= STATE =======================
  const G = { t: 0, enemies: [], projectiles: [], flames: [], items: [], texts: [], fx: [], cam: { x: 0, y: 0 }, shake: 0, attackSeq: 0, S: null, checkT: 0, saveT: 0, miniT: 0 };
  let nextId = 1;
  const player = {
    x: WELL.x, y: WELL.y + 60, r: 13, face: -Math.PI / 2, hp: 100, sta: 80, mana: 45, weapon: 'rapier',
    atkCd: 0, atkT: 0, atkDur: 1, atkPending: -1, atkWeapon: 'rapier', atkFace: 0, atkSprint: false,
    dodgeT: 0, dodgeCd: 0, dodgeDir: 0, dodgeSpeed: 0, iframes: 0, dodgeSeen: new Set(),
    blocking: false, blockStart: -9, specialT: 0, specialMax: 1, specialKind: null, specialCd: 0, specialCdMax: 1, lungeHit: null, lungeDir: 0, whirlTicks: 0,
    comboCount: 0, comboT: 0, riposteReady: false, windStepCrit: false, sprinting: false, inFire: false,
    poisonT: 0, slimeRegen: 0, sinceHit: 99, hitFlash: 0, stun: 0, dead: false, deadT: 0, runAcc: 0, lastRegion: null, lowResT: 0,
  };

  function derived() {
    const s = P.stats, has = id => P.has(id);
    return {
      maxHp: 60 + s.VIT * 8,
      dr: s.VIT / (s.VIT + 60),
      speed: 135 + s.AGI * 4,
      maxSta: 70 + s.AGI * 3 + s.VIT,
      staRegen: 16 + s.AGI * 1.6,
      maxMana: 20 + s.INT * 5,
      manaRegen: 1.5 + s.INT * 0.3,
      dodgeCd: Math.max(0.3, 0.9 - s.AGI * 0.012) * (has('quickFeet') ? 0.7 : 1),
      dodgeDist: 120 * (has('longRoll') ? 1.4 : 1),
      crit: 0.03 + s.DEX * 0.008 + (has('pinpoint') ? 0.15 : 0),
      critMul: has('pinpoint') ? 2.5 : 1.8,
      blockArc: has('bulwark') ? 4.2 : 2.1,
      mul: { rapier: 1 + (s.DEX - 5) * 0.09 + (s.STR - 5) * 0.02, greatsword: 1 + (s.STR - 5) * 0.1, fire: 1 + (s.INT - 5) * 0.1 },
    };
  }

  // ======================= INPUT =======================
  const keys = new Set(), pressed = new Set();
  const mouse = { x: 0, y: 0, active: false, left: false, right: false };
  const touch = { mx: 0, my: 0, attack: false, block: false, stickId: null, ox: 0, oy: 0 };
  let touchMode = false, wheelWeapon = null, wheelT = 0;

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'tab' || (!UI.isBookOpen() && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))) e.preventDefault();
    if (!e.repeat) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); });
  window.addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });
  canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true; });
  canvas.addEventListener('mousedown', e => { canvas.focus(); if (e.button === 0) mouse.left = true; if (e.button === 2) mouse.right = true; mouse.active = true; });
  window.addEventListener('mouseup', e => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (G.t - wheelT < 0.15) return;
    wheelT = G.t;
    const i = D.weaponOrder.indexOf(player.weapon), n = D.weaponOrder.length;
    wheelWeapon = D.weaponOrder[(i + (e.deltaY > 0 ? 1 : -1) + n) % n];
  }, { passive: false });

  function enableTouch() { if (!touchMode) { touchMode = true; document.body.classList.add('touch'); } }
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') enableTouch(); }, true);
  const stickZone = document.getElementById('stick-zone'), stickBase = document.getElementById('stick-base'), stickKnob = document.getElementById('stick-knob');
  stickZone.addEventListener('pointerdown', e => {
    touch.stickId = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY;
    stickZone.setPointerCapture(e.pointerId);
    const r = stickZone.getBoundingClientRect();
    stickBase.style.left = (e.clientX - r.left) + 'px'; stickBase.style.top = (e.clientY - r.top) + 'px';
    stickBase.classList.add('on'); e.preventDefault();
  });
  stickZone.addEventListener('pointermove', e => {
    if (e.pointerId !== touch.stickId) return;
    let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
    const len = Math.hypot(dx, dy), max = 52;
    if (len > max) { dx *= max / len; dy *= max / len; }
    touch.mx = dx / max; touch.my = dy / max;
    stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const endStick = e => { if (e.pointerId !== touch.stickId) return; touch.stickId = null; touch.mx = touch.my = 0; stickKnob.style.transform = ''; stickBase.classList.remove('on'); };
  stickZone.addEventListener('pointerup', endStick); stickZone.addEventListener('pointercancel', endStick);
  document.querySelectorAll('[data-act]').forEach(btn => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); btn.classList.add('down');
      if (act === 'attack') touch.attack = true;
      else if (act === 'block') touch.block = true;
      else pressed.add({ dodge: ' ', special: 'f', interact: 'e', book: 'i', swap: 'q' }[act]);
    });
    const up = () => { btn.classList.remove('down'); if (act === 'attack') touch.attack = false; if (act === 'block') touch.block = false; };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
  });

  const input = {
    attack: () => mouse.left || keys.has('j') || touch.attack,
    block: () => mouse.right || keys.has('k') || touch.block,
    sprint: () => keys.has('shift') || (touchMode && Math.hypot(touch.mx, touch.my) > 0.92),
  };
  function axis() {
    let x = 0, y = 0;
    if (keys.has('a') || keys.has('arrowleft')) x--;
    if (keys.has('d') || keys.has('arrowright')) x++;
    if (keys.has('w') || keys.has('arrowup')) y--;
    if (keys.has('s') || keys.has('arrowdown')) y++;
    return { x: x + touch.mx, y: y + touch.my };
  }
  function screenToWorld(sx, sy) { const sc = viewScale(); return { x: sx / sc + G.cam.x, y: sy / sc + G.cam.y }; }

  // ======================= HELPERS =======================
  function floatText(x, y, text, color = 'dmg') { G.texts.push({ x: x + rand(-6, 6), y, text: String(text), color, t: 0, dur: 0.9 }); }
  function lowResource(what) { if (G.t - player.lowResT > 0.8) { player.lowResT = G.t; floatText(player.x, player.y - 26, `Not enough ${what}`, 'info'); } }
  function collideObstacles(o) {
    for (const ob of obstacles) {
      const dx = o.x - ob.x, dy = o.y - ob.y, d = Math.hypot(dx, dy), min = ob.r + o.r;
      if (d < min && d > 0.001) { o.x = ob.x + dx / d * min; o.y = ob.y + dy / d * min; }
    }
    o.x = clamp(o.x, o.r, WORLD.w - o.r); o.y = clamp(o.y, o.r, WORLD.h - o.r);
  }
  function keepOutOfTown(e) {
    const pad = e.r + 4;
    if (!inRect(e, TOWN, pad)) return;
    const dl = e.x - (TOWN.x - pad), dr = TOWN.x + TOWN.w + pad - e.x, dt = e.y - (TOWN.y - pad), db = TOWN.y + TOWN.h + pad - e.y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) e.x = TOWN.x - pad; else if (m === dr) e.x = TOWN.x + TOWN.w + pad; else if (m === dt) e.y = TOWN.y - pad; else e.y = TOWN.y + TOWN.h + pad;
  }
  function setWeapon(id) {
    if (!D.weapons[id] || player.weapon === id) return;
    player.weapon = id; player.atkPending = -1; player.atkT = 0; player.comboCount = 0;
    floatText(player.x, player.y - 28, D.weapons[id].name, 'info');
  }
  function autoAim() {
    let best = null, bd = 280;
    for (const e of G.enemies) { if (e.dead) continue; const d = hyp(e.x, e.y, player.x, player.y); if (d < bd) { bd = d; best = e; } }
    if (best) player.face = Math.atan2(best.y - player.y, best.x - player.x);
  }

  // ======================= ENEMIES =======================
  function makeEnemy(type, x, y) {
    const d = D.enemies[type];
    const elite = type !== 'dummy' && Math.random() < Math.min(C.eliteChanceMax, P.totalLevel() * C.eliteChancePerLevel);
    const hp = d.hp * (elite ? 2.6 : 1);
    return {
      id: nextId++, type, def: d, x, y, hx: x, hy: y, r: d.r * (elite ? 1.25 : 1), hp, maxHp: hp, elite, dmgMul: elite ? 1.5 : 1,
      kx: 0, ky: 0, cd: rand(0.6, 1.6), contactCd: 0, stun: 0, hitFlash: 0, jugCd: 0,
      burnT: 0, burnTick: 0, burnDps: 0, burnByPlayer: false, poisonT: 0, poisonTick: 0, poisonDps: 0,
      state: 'idle', st: 0, face: rand(0, TAU), lockFace: 0, wanderT: 0, wa: null, hop: rand(0, TAU), aggro: false, dead: false, deadT: 0, slot: null,
    };
  }
  const slots = [];
  for (const r of REGIONS) for (const s of r.spawns) slots.push({ region: r, type: s.type, count: s.count, timer: 0 });
  function spawnPoint(region, ignorePlayer) {
    for (let i = 0; i < 40; i++) {
      const x = region.x + 50 + Math.random() * (region.w - 100), y = region.y + 50 + Math.random() * (region.h - 100);
      if (inRect({ x, y }, TOWN, 160)) continue;
      if (!ignorePlayer && hyp(x, y, player.x, player.y) < 460) continue;
      if (obstacles.some(o => hyp(o.x, o.y, x, y) < o.r + 26)) continue;
      return { x, y };
    }
    return null;
  }
  function updateSpawns(dt, initial) {
    for (const s of slots) {
      let alive = 0;
      for (const e of G.enemies) if (e.slot === s && !e.dead) alive++;
      while (alive < s.count) {
        if (!initial) { s.timer -= dt; if (s.timer > 0) break; s.timer = 7; }
        const pt = spawnPoint(s.region, initial);
        if (!pt) break;
        const e = makeEnemy(s.type, pt.x, pt.y); e.slot = s; G.enemies.push(e); alive++;
        if (!initial) break;
      }
    }
  }
  function spawnDummy() { G.enemies.push(makeEnemy('dummy', TOWN.x + TOWN.w - 70, TOWN.y + TOWN.h - 80)); }

  function hitXP(e) { return (e.def.tier === 0 ? 3 : 4 + e.def.tier * 2) * (e.elite ? 2 : 1); }

  function damageEnemy(e, dmg, o = {}) {
    if (e.dead) return;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg; e.hitFlash = 0.1;
    if (o.knock && e.type !== 'dummy') {
      const a = Math.atan2(e.y - player.y, e.x - player.x), k = o.knock * (e.elite ? 0.6 : 1);
      e.kx += Math.cos(a) * k; e.ky += Math.sin(a) * k;
    }
    if (o.stagger) e.stun = Math.max(e.stun, o.stagger);
    if (o.burn) { e.burnT = Math.max(e.burnT, o.burn); e.burnDps = Math.max(e.burnDps, 3 * G.S.mul.fire); e.burnByPlayer = true; }
    floatText(e.x, e.y - e.r - 6, (o.tag ? o.tag + ' ' : '') + dmg, o.crit ? 'crit' : (o.color || 'dmg'));
    if (o.skill) P.addXP(o.skill, o.xp != null ? o.xp : hitXP(e));
    if (e.type === 'dummy') { e.hp = e.maxHp; return; }
    if (e.hp <= 0) killEnemy(e, o);
  }
  function killEnemy(e, o) {
    e.dead = true; e.deadT = 0.45;
    P.bump('kills');
    if (o.skill) P.addXP(o.skill, (6 + e.def.tier * 3) * (e.elite ? 2 : 1));
    if (e.type === 'slime' && Math.random() < 0.65) G.items.push({ x: e.x, y: e.y, t: 45, bob: rand(0, TAU) });
    const color = { slime: '#8fcf62', toad: '#9aa848', skeleton: '#ddd5c0', imp: '#f08a40' }[e.type] || '#ccc';
    const parts = [];
    for (let i = 0; i < 12; i++) { const a = rand(0, TAU), s = rand(40, 140); parts.push({ x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s }); }
    G.fx.push({ type: 'burst', x: e.x, y: e.y, t: 0, dur: 0.5, color, parts });
  }
  function poisonEnemy(e) {
    if (!e || e.dead || e.type === 'dummy') return;
    e.poisonT = 4; e.poisonDps = 3 * (P.has('venomBulwark') ? 2 : 1);
  }

  function skeletonStrike(e) {
    const p = player;
    const id = ++G.attackSeq;
    G.fx.push({ type: 'eswing', x: e.x, y: e.y, face: e.lockFace, range: e.def.range + 6, t: 0, dur: 0.22 });
    if (p.dead) return;
    if (hyp(p.x, p.y, e.x, e.y) < e.def.range + p.r + 2 && angDiff(Math.atan2(p.y - e.y, p.x - e.x), e.lockFace) < 1.0) {
      hurtPlayer(e.def.dmg * e.dmgMul, 'melee', { source: e, dir: Math.atan2(e.y - p.y, e.x - p.x), attackId: 's' + id });
    }
  }
  function enemyShoot(e, a) {
    const toad = e.type === 'toad', speed = toad ? 230 : 260;
    G.projectiles.push({
      id: nextId++, owner: 'enemy', kind: toad ? 'poison' : 'fire', x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 7, dmg: e.def.dmg * e.dmgMul, life: toad ? 2.2 : 1.6, poison: toad ? e.def.poison : 0, src: e,
    });
  }
  function spawnFlame(x, y, owner, r = 32, t = 3.5) {
    G.flames.push({ x, y, r, t, max: t, owner, seed: Math.random() * 10 });
    if (G.flames.length > 48) G.flames.shift();
  }

  function updateEnemy(e, dt) {
    const p = player, d = e.def;
    if (e.dead) { e.deadT -= dt; return; }
    e.hitFlash -= dt; e.stun -= dt; e.cd -= dt; e.contactCd -= dt; e.jugCd -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick -= dt;
      if (e.burnTick <= 0) { e.burnTick = 0.5; damageEnemy(e, e.burnDps * 0.5, { skill: e.burnByPlayer ? 'fire' : null, xp: 1, color: 'burn' }); if (e.dead) return; }
    } else { e.burnDps = 0; }
    if (e.poisonT > 0) {
      e.poisonT -= dt; e.poisonTick -= dt;
      if (e.poisonTick <= 0) { e.poisonTick = 0.5; damageEnemy(e, e.poisonDps * 0.5, { color: 'poison' }); if (e.dead) return; }
    }
    e.x += e.kx * dt; e.y += e.ky * dt;
    const damp = Math.pow(0.002, dt); e.kx *= damp; e.ky *= damp;
    if (e.type === 'dummy') { e.x = e.hx; e.y = e.hy; return; }

    const dx = p.x - e.x, dy = p.y - e.y, dd = Math.hypot(dx, dy), toP = Math.atan2(dy, dx);
    const canChase = !p.dead && !inTown(p);
    e.aggro = canChase && (dd < d.aggro || (e.aggro && dd < 650));
    let mx = 0, my = 0;
    if (e.stun > 0) {
      if (e.state === 'windup') e.state = 'idle';
    } else if (e.aggro) {
      if (e.type === 'slime') {
        e.hop += dt * 7;
        const f = Math.max(0, Math.sin(e.hop)) * 1.6;
        mx = Math.cos(toP) * f; my = Math.sin(toP) * f;
      } else if (e.type === 'skeleton') {
        if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'recover'; e.st = 0.35; skeletonStrike(e); } }
        else if (e.state === 'recover') { e.st -= dt; if (e.st <= 0) e.state = 'idle'; }
        else {
          e.face = toP;
          if (dd < d.range + p.r - 4 && e.cd <= 0) { e.state = 'windup'; e.st = d.windup; e.lockFace = toP; e.cd = d.cd; }
          else if (dd > d.range * 0.7) { mx = Math.cos(toP); my = Math.sin(toP); }
        }
      } else {
        e.face = toP;
        if (dd < d.keep - 40) { mx = -Math.cos(toP); my = -Math.sin(toP); }
        else if (dd > d.keep + 40) { mx = Math.cos(toP); my = Math.sin(toP); }
        else { const s = Math.sin(G.t * 0.8 + e.id) > 0 ? 0.5 : -0.5; mx = Math.cos(toP + Math.PI / 2) * s; my = Math.sin(toP + Math.PI / 2) * s; }
        if (e.cd <= 0 && dd < d.keep + 170) { e.cd = d.cd * rand(0.85, 1.15); enemyShoot(e, toP); }
      }
    } else {
      e.state = 'idle';
      e.wanderT -= dt;
      if (hyp(e.hx, e.hy, e.x, e.y) > 200) { const a = Math.atan2(e.hy - e.y, e.hx - e.x); mx = Math.cos(a); my = Math.sin(a); e.face = a; }
      else {
        if (e.wanderT <= 0) { e.wanderT = rand(1.5, 4); e.wa = Math.random() < 0.4 ? null : rand(0, TAU); }
        if (e.wa != null) { mx = Math.cos(e.wa) * 0.4; my = Math.sin(e.wa) * 0.4; e.face = e.wa; }
      }
      if (e.type === 'slime') e.hop += dt * 4;
    }
    if (e.state === 'windup') mx = my = 0;
    e.x += mx * d.speed * dt; e.y += my * d.speed * dt;
    collideObstacles(e); keepOutOfTown(e);

    if (!p.dead) {
      const close = hyp(p.x, p.y, e.x, e.y) < e.r + p.r + 3;
      if (e.type === 'slime' && close && e.contactCd <= 0) {
        e.contactCd = 0.9;
        hurtPlayer(d.dmg * e.dmgMul, 'contact', { source: e, dir: Math.atan2(e.y - p.y, e.x - p.x), attackId: 'c' + (++G.attackSeq) });
      }
    }
  }

  function separate() {
    const list = G.enemies.filter(e => !e.dead && e.type !== 'dummy');
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d < min && d > 0.001) { const push = (min - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
      }
      if (!player.dead) {
        const dx = a.x - player.x, dy = a.y - player.y, d = Math.hypot(dx, dy), min = a.r + player.r;
        if (d < min && d > 0.001) { a.x = player.x + dx / d * min; a.y = player.y + dy / d * min; }
      }
    }
  }

  // ======================= PLAYER COMBAT =======================
  function meleeGeom(wid) {
    const w = D.weapons[wid];
    if (wid === 'greatsword' && P.has('wideArc')) return { range: w.range + 14, arc: w.arc + 0.6 };
    return { range: w.range, arc: w.arc };
  }

  function tryAttack() {
    const p = player;
    if (p.atkCd > 0 || p.dodgeT > 0 || p.blocking || p.specialT > 0) return;
    const w = D.weapons[p.weapon];
    if (touchMode) autoAim();
    if (w.type === 'melee') {
      if (p.sta < w.sta) { lowResource('stamina'); return; }
      p.sta -= w.sta; p.atkCd = w.cd; p.atkT = p.atkDur = w.dur; p.atkWeapon = p.weapon; p.atkFace = p.face; p.atkSprint = p.sprinting; p.atkPending = w.windup;
      const g = meleeGeom(p.weapon);
      G.fx.push({ type: 'swing', weapon: p.weapon, face: p.face, range: g.range, arc: g.arc, t: 0, dur: w.dur + 0.06 });
    } else {
      if (p.mana < w.mana) { lowResource('mana'); return; }
      p.mana -= w.mana; p.atkCd = w.cd; p.atkT = p.atkDur = 0.18; p.atkWeapon = p.weapon; p.atkFace = p.face;
      const offsets = P.has('twinFlame') ? [-0.12, 0.12] : [0];
      for (const off of offsets) shootFireball(p.face + off);
    }
  }
  function lowHpBonus() { return player.hp < G.S.maxHp * 0.25 && P.has('secondWind') ? 1.3 : 1; }
  function shootFireball(a) {
    const p = player, w = D.weapons.staff;
    G.projectiles.push({
      id: nextId++, owner: 'player', kind: 'fire', x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
      vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, r: 6, dmg: w.dmg * G.S.mul.fire * lowHpBonus(), life: w.life, burn: P.has('ignite') ? 3 : 0,
    });
  }

  function resolveMelee() {
    const p = player, S = G.S, wid = p.atkWeapon, w = D.weapons[wid], g = meleeGeom(wid);
    let targets = G.enemies.filter(e => {
      if (e.dead) return false;
      const d = hyp(e.x, e.y, p.x, p.y);
      return d < g.range + e.r && (d < p.r + e.r + 2 || angDiff(Math.atan2(e.y - p.y, e.x - p.x), p.atkFace) <= g.arc / 2 + 0.15);
    });
    if (!targets.length) return;
    if (wid === 'rapier') targets = targets.sort((a, b) => hyp(a.x, a.y, p.x, p.y) - hyp(b.x, b.y, p.x, p.y)).slice(0, 1);
    for (const e of targets) {
      let dmg = w.dmg * S.mul[wid];
      const tags = [];
      let crit = Math.random() < S.crit;
      if (p.windStepCrit) { crit = true; p.windStepCrit = false; }
      if (wid === 'rapier') {
        if (p.riposteReady) { dmg *= 3; p.riposteReady = false; P.bump('riposteUses'); tags.push('Riposte!'); }
        p.comboCount++; p.comboT = 1.2;
        if (P.has('flurry') && p.comboCount % 4 === 0) { dmg *= 2.2; tags.push('Flurry'); }
        if (e.burnT > 0 && e.type !== 'dummy') P.bump('burningRapierHits');
      }
      if (wid === 'greatsword' && p.atkSprint && e.type !== 'dummy') P.bump('sprintHits');
      dmg *= lowHpBonus();
      if (crit) dmg *= S.critMul;
      damageEnemy(e, dmg, {
        crit, skill: wid, tag: tags.join(' '),
        knock: wid === 'greatsword' ? 220 + P.stats.STR * 6 : 70,
        stagger: wid === 'greatsword' && P.has('staggeringBlows') ? 0.5 : 0,
        burn: wid === 'rapier' && P.has('flameFencer') ? 3 : 0,
      });
    }
    if (wid === 'greatsword') G.shake = Math.max(G.shake, 4);
  }

  function trySpecial() {
    const p = player;
    if (p.specialCd > 0 || p.dodgeT > 0 || p.specialT > 0 || p.dead) return;
    const w = D.weapons[p.weapon], ab = D.abilities.find(a => a.id === w.special);
    if (!P.has(ab.id)) {
      const sk = D.subskills.find(s => s.id === ab.skill).name;
      UI.toast(`${w.name} has no special yet.<span>${ab.name} unlocks at ${sk} level ${ab.level}.</span>`, 'info', 3000);
      return;
    }
    if (touchMode) autoAim();
    let cd = 0;
    if (ab.id === 'lunge') {
      if (p.sta < 14) return lowResource('stamina');
      p.sta -= 14; p.specialKind = 'lunge'; p.specialT = p.specialMax = 0.2; p.iframes = Math.max(p.iframes, 0.2);
      p.lungeHit = new Set(); p.lungeDir = p.face; cd = 2.5;
    } else if (ab.id === 'whirlwind') {
      if (p.sta < 26) return lowResource('stamina');
      p.sta -= 26; p.specialKind = 'whirlwind'; p.specialT = p.specialMax = 0.6; p.whirlTicks = 0; cd = 5;
    } else if (ab.id === 'fireBurst') {
      if (p.mana < 16) return lowResource('mana');
      p.mana -= 16; cd = 5; fireBurst();
    }
    p.specialCd = p.specialCdMax = cd;
  }
  function fireBurst() {
    const p = player, S = G.S;
    for (const e of G.enemies) if (!e.dead && hyp(e.x, e.y, p.x, p.y) < 125 + e.r) damageEnemy(e, 14 * S.mul.fire * lowHpBonus(), { skill: 'fire', knock: 200, burn: P.has('ignite') ? 3 : 1.5 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + G.t; spawnFlame(p.x + Math.cos(a) * 78, p.y + Math.sin(a) * 78, 'player', 30, 4); }
    G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 125, t: 0, dur: 0.4 });
    G.shake = Math.max(G.shake, 5);
  }
  function updateSpecial(dt) {
    const p = player, S = G.S;
    p.specialT -= dt;
    if (p.specialKind === 'lunge') {
      for (const e of G.enemies) {
        if (e.dead || p.lungeHit.has(e.id) || hyp(e.x, e.y, p.x, p.y) > p.r + e.r + 16) continue;
        p.lungeHit.add(e.id);
        const crit = Math.random() < S.crit;
        damageEnemy(e, D.weapons.rapier.dmg * 1.6 * S.mul.rapier * lowHpBonus() * (crit ? S.critMul : 1), { skill: 'rapier', knock: 120, crit, burn: P.has('flameFencer') ? 3 : 0 });
      }
    } else if (p.specialKind === 'whirlwind') {
      const elapsed = p.specialMax - p.specialT;
      while (p.whirlTicks < 3 && elapsed >= p.whirlTicks * 0.2) {
        p.whirlTicks++;
        for (const e of G.enemies) if (!e.dead && hyp(e.x, e.y, p.x, p.y) < 92 + e.r) damageEnemy(e, D.weapons.greatsword.dmg * 0.7 * S.mul.greatsword * lowHpBonus(), { skill: 'greatsword', knock: 160 });
        G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 92, t: 0, dur: 0.25, steel: true });
      }
    }
    if (p.specialT <= 0) { p.specialT = 0; p.specialKind = null; }
  }

  // Everything that hurts the player goes through here: dodges, parries, blocks, armor.
  function hurtPlayer(amount, type, o = {}) {
    const p = player, S = G.S;
    if (p.dead) return 'none';
    const isHit = type === 'melee' || type === 'proj' || type === 'contact';
    if (isHit) {
      if (p.iframes > 0) {
        if (p.dodgeT > 0 && !p.dodgeSeen.has(o.attackId)) {
          p.dodgeSeen.add(o.attackId);
          P.bump('perfectDodges'); P.addXP('evasion', 10);
          floatText(p.x, p.y - 28, 'Perfect dodge', 'good');
          if (P.has('windStep')) { p.sta = Math.min(S.maxSta, p.sta + 20); p.windStepCrit = true; }
        }
        return 'dodged';
      }
      if (P.has('gelatinousBody') && Math.random() < 0.15) { floatText(p.x, p.y - 28, '*jiggle*', 'poison'); return 'absorbed'; }
      if (p.blocking && o.dir != null && angDiff(p.face, o.dir) <= S.blockArc / 2) {
        if (G.t - p.blockStart <= 0.22) {
          P.bump('perfectParries'); P.addXP('block', 12);
          floatText(p.x, p.y - 28, 'Parry!', 'crit');
          G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 34, t: 0, dur: 0.25, gold: true });
          if (o.source && type !== 'proj') o.source.stun = Math.max(o.source.stun, 0.9);
          if (P.has('riposte')) p.riposteReady = true;
          if (P.has('counterFlourish')) {
            for (const e of G.enemies) if (!e.dead && e.type !== 'dummy' && hyp(e.x, e.y, p.x, p.y) < 100 + e.r) damageEnemy(e, D.weapons.rapier.dmg * 1.5 * S.mul.rapier, { skill: 'rapier', knock: 160, tag: 'Flourish' });
          }
          return 'parry';
        }
        const cost = amount * 0.9 * (P.has('steadyGuard') ? 0.6 : 1);
        if (p.sta >= cost) {
          p.sta -= cost; P.addXP('block', amount * 0.7);
          if (P.has('venomBulwark') && o.source && type !== 'proj') poisonEnemy(o.source);
          amount *= 0.15;
          floatText(p.x, p.y - 28, 'Blocked', 'info');
          if (amount < 0.5) return 'blocked';
        } else {
          p.sta = 0; P.addXP('block', amount * 0.3); amount *= 0.6; p.stun = 0.4; p.blocking = false;
          floatText(p.x, p.y - 28, 'Guard broken', 'hurt');
        }
      }
    }
    if (type === 'poison' && P.has('toxicBlood')) return 'immune';
    if (type === 'fire' && o.dot && P.has('ashWalker')) return 'immune';
    if (P.has('ironHide') && !o.dot) amount = Math.max(0, amount - 3);
    amount *= 1 - S.dr;
    if (amount <= 0) { floatText(p.x, p.y - 28, 'No damage', 'info'); return 'blocked'; }
    p.hp -= amount; p.sinceHit = 0;
    P.bump('damageTaken', amount); P.addXP('endurance', amount * 0.45);
    if (!o.dot) { p.hitFlash = 0.15; floatText(p.x, p.y - 26, Math.round(amount), 'hurt'); G.shake = Math.max(G.shake, 3); }
    if (o.poison && !P.has('toxicBlood')) p.poisonT = Math.max(p.poisonT, o.poison);
    if ((type === 'contact' || type === 'melee') && o.source && P.has('toxicBlood')) poisonEnemy(o.source);
    if (p.hp <= 0) die();
    return 'hit';
  }

  function die() {
    const p = player;
    p.hp = 0; p.dead = true; p.deadT = 2.6; p.poisonT = 0; p.blocking = false; p.specialT = 0; p.dodgeT = 0; p.riposteReady = false;
    P.bump('deaths');
    UI.banner('You fell', 'Back to the well', 'Nothing is lost. Every hit you took still counts.');
  }
  function respawn() {
    const p = player, S = G.S;
    p.dead = false; p.x = WELL.x; p.y = WELL.y + 60; p.hp = S.maxHp; p.sta = S.maxSta; p.mana = S.maxMana; p.poisonT = 0; p.stun = 0; p.iframes = 1;
    G.cam.x = p.x - VW / viewScale() / 2; G.cam.y = p.y - VH / viewScale() / 2;
  }

  // ======================= PLAYER UPDATE =======================
  function updatePlayer(dt, edges) {
    const p = player, S = G.S;
    if (p.dead) { p.deadT -= dt; if (p.deadT <= 0) respawn(); return; }
    p.atkCd -= dt; p.specialCd -= dt; p.dodgeCd -= dt; p.iframes -= dt; p.comboT -= dt; p.hitFlash -= dt; p.stun -= dt; p.sinceHit += dt;
    if (p.comboT <= 0) p.comboCount = 0;

    const ax = axis();
    let mx = ax.x, my = ax.y;
    const mlen = Math.hypot(mx, my);
    if (mlen > 1) { mx /= mlen; my /= mlen; }
    const moving = mlen > 0.15;
    if (mouse.active && !touchMode) { const w = screenToWorld(mouse.x, mouse.y); p.face = Math.atan2(w.y - p.y, w.x - p.x); }
    else if (moving && p.atkT <= 0 && p.specialT <= 0) p.face = Math.atan2(my, mx);

    const busy = p.stun > 0;
    const wantBlock = input.block() && !busy && p.dodgeT <= 0 && p.specialT <= 0 && p.sta > 0;
    if (wantBlock && !p.blocking) p.blockStart = G.t;
    p.blocking = wantBlock;

    p.sprinting = input.sprint() && moving && !p.blocking && p.dodgeT <= 0 && p.specialT <= 0 && p.sta > 2 && !busy;

    if (edges.dodge && p.dodgeCd <= 0 && p.dodgeT <= 0 && p.specialT <= 0 && !busy) {
      if (p.sta < 16) lowResource('stamina');
      else {
        p.dodgeT = 0.26; p.iframes = Math.max(p.iframes, 0.24); p.dodgeDir = moving ? Math.atan2(my, mx) : p.face;
        p.dodgeSpeed = S.dodgeDist / 0.26; p.sta -= 16; p.dodgeCd = S.dodgeCd; p.dodgeSeen.clear(); p.blocking = false;
        P.addXP('evasion', 1);
      }
    }
    if (edges.weapon) setWeapon(edges.weapon);
    if (!busy && input.attack()) tryAttack();
    if (!busy && edges.special) trySpecial();

    let vx = 0, vy = 0;
    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      vx = Math.cos(p.dodgeDir) * p.dodgeSpeed; vy = Math.sin(p.dodgeDir) * p.dodgeSpeed;
      if (Math.random() < 0.6) G.fx.push({ type: 'ghost', x: p.x, y: p.y, t: 0, dur: 0.25 });
    } else if (p.specialT > 0) {
      updateSpecial(dt);
      if (p.specialKind === 'lunge') { vx = Math.cos(p.lungeDir) * 820; vy = Math.sin(p.lungeDir) * 820; }
      else { vx = mx * S.speed * 0.45; vy = my * S.speed * 0.45; }
    } else if (!busy) {
      const sp = S.speed * (p.sprinting ? 1.55 : 1) * (p.blocking ? 0.5 : 1) * (p.atkT > 0 && p.atkWeapon === 'greatsword' ? 0.55 : 1);
      vx = mx * sp; vy = my * sp;
    }
    p.x += vx * dt; p.y += vy * dt;
    collideObstacles(p);

    if (p.sprinting) {
      p.sta -= 14 * (P.has('lightStep') ? 0.6 : 1) * dt;
      p.runAcc += Math.hypot(vx, vy) * dt;
      if (p.runAcc >= 30) { const n = Math.floor(p.runAcc / 30); p.runAcc -= n * 30; P.addXP('running', n); }
      if (P.has('juggernaut')) {
        for (const e of G.enemies) {
          if (e.dead || e.jugCd > 0 || hyp(e.x, e.y, p.x, p.y) > e.r + p.r + 5) continue;
          e.jugCd = 0.6;
          damageEnemy(e, 10 * S.mul.greatsword, { skill: 'greatsword', knock: 340, tag: 'Slam' });
        }
      }
    }
    if (p.atkT > 0) p.atkT -= dt;
    if (p.atkPending >= 0) { p.atkPending -= dt; if (p.atkPending < 0) { p.atkPending = -1; resolveMelee(); } }

    const low = p.hp < S.maxHp * 0.25;
    if (!p.sprinting && !p.blocking && p.dodgeT <= 0) p.sta = Math.min(S.maxSta, p.sta + S.staRegen * (low && P.has('secondWind') ? 2 : 1) * dt);
    p.mana = Math.min(S.maxMana, p.mana + S.manaRegen * dt);
    if (P.has('grit') && p.sinceHit > 4) p.hp = Math.min(S.maxHp, p.hp + 1.5 * dt);
    if (p.slimeRegen > 0) { p.slimeRegen -= dt; p.hp = Math.min(S.maxHp, p.hp + 6 * dt); }

    if (p.poisonT > 0) {
      if (P.has('toxicBlood')) p.poisonT = 0;
      else { p.poisonT -= dt; P.bump('poisonSeconds', dt); hurtPlayer(3 * dt, 'poison', { dot: true }); }
    }
    let fireDps = 0;
    for (const f of G.flames) if (hyp(f.x, f.y, p.x, p.y) < f.r + p.r * 0.4) fireDps = Math.max(fireDps, f.owner === 'player' ? 2.5 : 5);
    p.inFire = fireDps > 0 && !p.dead;
    if (p.inFire) {
      P.bump('fireStandSeconds', dt);
      if (P.has('ashWalker')) p.mana = Math.min(S.maxMana, p.mana + 5 * dt);
      else hurtPlayer(fireDps * dt, 'fire', { dot: true });
    }
    if (!p.dead && p.hp < S.maxHp * 0.25) P.bump('lowHpSeconds', dt);

    if (hyp(WELL.x, WELL.y, p.x, p.y) < 70) {
      p.hp = Math.min(S.maxHp, p.hp + 30 * dt); p.sta = Math.min(S.maxSta, p.sta + 40 * dt); p.mana = Math.min(S.maxMana, p.mana + 20 * dt); p.poisonT = 0;
    }
    const reg = regionAt(p.x, p.y);
    if (reg !== p.lastRegion) { if (p.lastRegion) UI.region(reg.name); p.lastRegion = reg; }
  }

  // ======================= PROJECTILES / FLAMES / ITEMS =======================
  function updateProjectiles(dt) {
    const p = player;
    for (const pr of G.projectiles) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      const fireEnd = () => { if (pr.kind === 'fire' && pr.owner === 'enemy') spawnFlame(pr.x, pr.y, 'enemy'); };
      if (pr.life <= 0) { pr.dead = true; fireEnd(); continue; }
      if (obstacles.some(o => hyp(o.x, o.y, pr.x, pr.y) < o.r + pr.r)) { pr.dead = true; fireEnd(); continue; }
      if (pr.owner === 'player') {
        for (const e of G.enemies) {
          if (e.dead || hyp(e.x, e.y, pr.x, pr.y) > e.r + pr.r) continue;
          damageEnemy(e, pr.dmg, { skill: 'fire', knock: 90, burn: pr.burn });
          pr.dead = true; break;
        }
      } else if (!p.dead && hyp(p.x, p.y, pr.x, pr.y) < p.r + pr.r) {
        const res = hurtPlayer(pr.dmg, 'proj', { source: pr.src, dir: Math.atan2(-pr.vy, -pr.vx), attackId: 'p' + pr.id, poison: pr.poison });
        if (res !== 'dodged') { pr.dead = true; if (res === 'hit') fireEnd(); }
      }
    }
    G.projectiles = G.projectiles.filter(pr => !pr.dead);
  }
  function updateFlames(dt) {
    for (const f of G.flames) {
      f.t -= dt;
      if (f.owner !== 'player') continue;
      for (const e of G.enemies) {
        if (e.dead || e.type === 'dummy' || hyp(e.x, e.y, f.x, f.y) > f.r + e.r * 0.5) continue;
        e.burnT = Math.max(e.burnT, 1.2); e.burnDps = Math.max(e.burnDps, 3 * G.S.mul.fire); e.burnByPlayer = true;
      }
    }
    G.flames = G.flames.filter(f => f.t > 0);
  }

  function interactTarget() {
    const p = player;
    if (p.dead) return null;
    let best = null, bd = 1e9;
    const consider = (obj, r, kind, label) => { const d = hyp(obj.x, obj.y, p.x, p.y); if (d < r && d < bd) { bd = d; best = { obj, kind, label }; } };
    consider(MASTER, 64, 'master', `Talk to ${D.npcText.masterName}`);
    consider(LECTERN, 60, 'hermit', `Read ${D.npcText.hermitName}`);
    for (const it of G.items) consider(it, 38, 'goo', 'Eat the slime goo');
    return best;
  }
  function interact(target) {
    const p = player, S = G.S, met = P.state.met;
    if (target.kind === 'goo') {
      G.items.splice(G.items.indexOf(target.obj), 1);
      P.bump('gooEaten');
      const n = P.counter('gooEaten');
      if (P.has('slimeGut')) { p.hp = Math.min(S.maxHp, p.hp + 25); p.slimeRegen = 3; floatText(p.x, p.y - 28, '+25', 'good'); }
      else { p.hp = Math.min(S.maxHp, p.hp + 4); floatText(p.x, p.y - 28, '+4', 'good'); }
      UI.toast(D.gooLines[Math.min(n - 1, D.gooLines.length - 1)], 'info', 2600);
      P.check();
      return;
    }
    const isMaster = target.kind === 'master';
    const name = isMaster ? D.npcText.masterName : D.npcText.hermitName;
    if (!met[target.kind]) { met[target.kind] = true; UI.dialog(name, isMaster ? D.npcText.masterIntro : D.npcText.hermitIntro, 'Talk again to hear rumors about hidden skills.'); return; }
    const r = P.rumor(target.kind);
    if (!r) { UI.dialog(name, isMaster ? D.npcText.masterEmpty : D.npcText.hermitEmpty); return; }
    UI.dialog(name, r.text, r.isNew ? 'New rumor written in your Skill Book under Secrets.' : 'You have heard this one before.');
  }

  // ======================= MAIN UPDATE =======================
  let promptTarget = null;
  function update(dt) {
    G.t += dt;
    const S = G.S = derived();
    const p = player;
    if (p.hp > S.maxHp) p.hp = S.maxHp;
    const edges = {
      dodge: pressed.has(' '),
      special: pressed.has('f') || pressed.has('l'),
      interact: pressed.has('e'),
      weapon: pressed.has('1') ? 'rapier' : pressed.has('2') ? 'greatsword' : pressed.has('3') ? 'staff' : null,
    };
    if (pressed.has('q')) { const i = D.weaponOrder.indexOf(p.weapon); edges.weapon = D.weaponOrder[(i + 1) % D.weaponOrder.length]; }
    if (wheelWeapon) { edges.weapon = wheelWeapon; wheelWeapon = null; }

    updatePlayer(dt, edges);
    for (const e of G.enemies) updateEnemy(e, dt);
    G.enemies = G.enemies.filter(e => !e.dead || e.deadT > 0);
    separate();
    updateProjectiles(dt);
    updateFlames(dt);
    for (const it of G.items) { it.t -= dt; it.bob += dt * 3; }
    G.items = G.items.filter(it => it.t > 0);
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter(f => f.t < f.dur);
    for (const t of G.texts) { t.t += dt; t.y -= 38 * dt; }
    G.texts = G.texts.filter(t => t.t < t.dur);
    if (G.texts.length > 60) G.texts.splice(0, G.texts.length - 60);
    updateSpawns(dt, false);

    promptTarget = interactTarget();
    if (UI.isDialogOpen()) {
      if (edges.interact) { UI.closeDialog(); edges.interact = false; }
      else if (hyp(p.x, p.y, MASTER.x, MASTER.y) > 140 && hyp(p.x, p.y, LECTERN.x, LECTERN.y) > 140) UI.closeDialog();
    }
    if (edges.interact && promptTarget) interact(promptTarget);
    UI.prompt(promptTarget && !UI.isDialogOpen() ? promptTarget.label : null);

    G.checkT -= dt;
    if (G.checkT <= 0) { G.checkT = 0.25; if (P.dirty) P.check(); }
    G.saveT -= dt;
    if (G.saveT <= 0) { G.saveT = C.autosaveSeconds; save(); }

    const sc = viewScale(), vw = VW / sc, vh = VH / sc;
    const tx = vw >= WORLD.w ? (WORLD.w - vw) / 2 : clamp(p.x - vw / 2, 0, WORLD.w - vw);
    const ty = vh >= WORLD.h ? (WORLD.h - vh) / 2 : clamp(p.y - vh / 2, 0, WORLD.h - vh);
    const k = Math.min(1, dt * 9);
    G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
    G.shake = Math.max(0, G.shake - dt * 20);
    UI.updateHUD(p, S);
  }

  // ======================= RENDER =======================
  const TEXT_COLORS = { dmg: '#efe4cb', crit: '#f3c55a', burn: '#f0954d', poison: '#a6d36a', hurt: '#ec6f62', info: '#a9bccb', good: '#93cf86' };
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function shadow(x, y, r) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 0.95, r * 0.4, 0, 0, TAU); ctx.fill(); }

  function drawObstacle(o) {
    const { x, y, r } = o;
    if (o.kind === 'tree') {
      shadow(x, y + 4, r);
      ctx.fillStyle = '#4a3523'; ctx.fillRect(x - 3, y, 6, r * 0.6);
      ctx.fillStyle = '#1f3a1e'; circle(x, y - 4, r); ctx.fill();
      ctx.fillStyle = '#2b4d27'; circle(x - r * 0.3, y - r * 0.45, r * 0.62); ctx.fill();
      ctx.fillStyle = 'rgba(160,200,110,0.10)'; circle(x - r * 0.35, y - r * 0.55, r * 0.35); ctx.fill();
    } else if (o.kind === 'rock') {
      shadow(x, y, r);
      ctx.fillStyle = regionAt(x, y).id === 'ash' ? '#3e3530' : '#56584f';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, o.seed * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, TAU); ctx.fill();
    } else if (o.kind === 'grave') {
      shadow(x, y + 2, r);
      ctx.fillStyle = '#6f716d'; ctx.beginPath(); ctx.moveTo(x - r * 0.8, y + r * 0.7); ctx.lineTo(x - r * 0.8, y - r * 0.4); ctx.arc(x, y - r * 0.4, r * 0.8, Math.PI, 0); ctx.lineTo(x + r * 0.8, y + r * 0.7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,20,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - r * 0.7); ctx.lineTo(x, y + r * 0.1); ctx.moveTo(x - r * 0.35, y - r * 0.4); ctx.lineTo(x + r * 0.35, y - r * 0.4); ctx.stroke();
    } else if (o.kind === 'deadtree') {
      shadow(x, y, r * 0.6);
      ctx.strokeStyle = '#3b3128'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + r * 0.5); ctx.lineTo(x, y - r);
      ctx.moveTo(x, y - r * 0.3); ctx.lineTo(x - r * 0.8, y - r * 1.1); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x + r * 0.7, y - r * 1.3); ctx.stroke();
    } else if (o.kind === 'stump') {
      shadow(x, y, r);
      ctx.fillStyle = '#4a3a2a'; circle(x, y, r); ctx.fill();
      ctx.strokeStyle = '#6a553c'; ctx.lineWidth = 1.2; circle(x, y, r * 0.6); ctx.stroke(); circle(x, y, r * 0.25); ctx.stroke();
    }
  }

  function drawTown() {
    // well
    shadow(WELL.x, WELL.y, WELL.r);
    ctx.fillStyle = '#6d6a60'; circle(WELL.x, WELL.y, WELL.r); ctx.fill();
    ctx.fillStyle = '#28506a'; circle(WELL.x, WELL.y, WELL.r - 7); ctx.fill();
    ctx.fillStyle = 'rgba(170,215,240,' + (0.18 + Math.sin(G.t * 2) * 0.06) + ')'; circle(WELL.x - 4, WELL.y - 4, 6); ctx.fill();
    // master
    const m = MASTER;
    shadow(m.x, m.y, m.r);
    ctx.fillStyle = '#7a3f34'; circle(m.x, m.y, m.r); ctx.fill();
    ctx.fillStyle = '#d9c9a5'; circle(m.x, m.y - 3, m.r * 0.55); ctx.fill();
    ctx.strokeStyle = '#c9ced2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x + 10, m.y + 4); ctx.lineTo(m.x + 30, m.y - 14); ctx.stroke();
    // lectern
    const l = LECTERN;
    shadow(l.x, l.y, l.r);
    ctx.fillStyle = '#5a412a'; ctx.fillRect(l.x - 4, l.y - 2, 8, 16);
    ctx.fillStyle = '#7b5a39'; ctx.fillRect(l.x - 15, l.y - 12, 30, 12);
    ctx.fillStyle = '#e8dcc0'; ctx.fillRect(l.x - 13, l.y - 11, 12, 9); ctx.fillRect(l.x + 1, l.y - 11, 12, 9);
    // markers and names
    ctx.textAlign = 'center'; ctx.font = '600 12px "Alegreya Sans", system-ui, sans-serif';
    for (const [o, src, name] of [[m, 'master', D.npcText.masterName], [l, 'hermit', D.npcText.hermitName]]) {
      const fresh = !P.state.met[src] || P.hasFreshRumor(src);
      if (fresh) {
        const by = o.y - 34 + Math.sin(G.t * 4) * 3;
        ctx.fillStyle = '#f3c55a'; ctx.font = '700 18px "Alegreya SC", Georgia, serif'; ctx.fillText('!', o.x, by);
        ctx.font = '600 12px "Alegreya Sans", system-ui, sans-serif';
      }
      if (hyp(player.x, player.y, o.x, o.y) < 150) { ctx.fillStyle = 'rgba(239,228,203,0.85)'; ctx.fillText(name, o.x, o.y + 32); }
    }
  }

  function drawFlames() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of G.flames) {
      const life = clamp(f.t / f.max, 0, 1), a = Math.min(1, f.t * 2) * 0.9;
      const mine = f.owner === 'player';
      for (let i = 0; i < 3; i++) {
        const ox = Math.sin(G.t * 7 + f.seed + i * 2) * f.r * 0.25, oy = Math.cos(G.t * 9 + f.seed + i) * f.r * 0.2;
        const rr = f.r * (0.55 + 0.2 * i) * (0.7 + 0.3 * life);
        const g = ctx.createRadialGradient(f.x + ox, f.y + oy, 0, f.x + ox, f.y + oy, rr);
        g.addColorStop(0, mine ? `rgba(255,214,120,${0.55 * a})` : `rgba(255,150,80,${0.55 * a})`);
        g.addColorStop(1, 'rgba(180,40,10,0)');
        ctx.fillStyle = g; circle(f.x + ox, f.y + oy, rr); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const p = player;
    ctx.save(); ctx.translate(e.x, e.y);
    if (e.dead) { const k = Math.max(0, e.deadT / 0.45); ctx.globalAlpha = k; ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); }
    const r = e.r, flash = e.hitFlash > 0;
    if (e.type === 'skeleton' && e.state === 'windup') {
      const k = 1 - e.st / e.def.windup;
      ctx.fillStyle = `rgba(214,72,60,${0.12 + 0.28 * k})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, e.def.range + 6, e.lockFace - 1.0, e.lockFace + 1.0); ctx.closePath(); ctx.fill();
    }
    shadow(0, 0, r);
    const look = e.aggro ? Math.atan2(p.y - e.y, p.x - e.x) : e.face;
    const eye = (dx, dy, er, col) => { ctx.fillStyle = col; circle(dx, dy, er); ctx.fill(); };
    if (e.type === 'slime') {
      const s = Math.sin(e.hop);
      ctx.fillStyle = flash ? '#ffffff' : 'rgba(120,196,86,0.92)';
      ctx.beginPath(); ctx.ellipse(0, -Math.max(0, s) * 6, r * (1 + 0.12 * -s), r * (0.85 + 0.12 * s), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4 - Math.max(0, s) * 6, r * 0.3, r * 0.2, -0.5, 0, TAU); ctx.fill();
      const ex = Math.cos(look) * 4, ey = Math.sin(look) * 3 - Math.max(0, s) * 6;
      eye(ex - 4, ey - 2, 2, '#1a2414'); eye(ex + 4, ey - 2, 2, '#1a2414');
    } else if (e.type === 'toad') {
      ctx.fillStyle = flash ? '#ffffff' : '#7e8f38';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(40,60,20,0.45)'; circle(-5, 3, 3); ctx.fill(); circle(6, 5, 2.5); ctx.fill(); circle(1, -3, 2); ctx.fill();
      const ex = Math.cos(look) * 6, ey = Math.sin(look) * 5;
      eye(ex - 6, ey - 6, 4.5, '#c9c463'); eye(ex + 6, ey - 6, 4.5, '#c9c463');
      eye(ex - 6 + Math.cos(look), ey - 6 + Math.sin(look), 2, '#141a0c'); eye(ex + 6 + Math.cos(look), ey - 6 + Math.sin(look), 2, '#141a0c');
      if (e.aggro && e.cd < 0.4) { ctx.fillStyle = 'rgba(166,211,106,0.6)'; circle(ex * 1.4, ey * 1.4 + 4, 5); ctx.fill(); }
    } else if (e.type === 'skeleton') {
      const sa = e.state === 'windup' ? e.lockFace - 1.3 : e.state === 'recover' ? e.lockFace + 1.0 : look + 0.7;
      ctx.strokeStyle = '#8f8574'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(Math.cos(sa) * (r - 2), Math.sin(sa) * (r - 2)); ctx.lineTo(Math.cos(sa) * (r + 26), Math.sin(sa) * (r + 26)); ctx.stroke();
      ctx.fillStyle = flash ? '#ffffff' : '#d8d0bb'; circle(0, 0, r); ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 1.5; circle(0, 0, r); ctx.stroke();
      const ex = Math.cos(look) * 5, ey = Math.sin(look) * 5;
      eye(ex - 4, ey - 2, 3, '#221d18'); eye(ex + 4, ey - 2, 3, '#221d18');
      if (e.aggro) { eye(ex - 4, ey - 2, 1.2, '#e05a48'); eye(ex + 4, ey - 2, 1.2, '#e05a48'); }
    } else if (e.type === 'imp') {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2.2);
      g.addColorStop(0, 'rgba(255,140,60,0.35)'); g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g; circle(0, 0, r * 2.2); ctx.fill();
      ctx.fillStyle = '#2a1a14';
      ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.9, -r * 1.4); ctx.lineTo(-r * 0.2, -r * 0.8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.5); ctx.lineTo(r * 0.9, -r * 1.4); ctx.lineTo(r * 0.2, -r * 0.8); ctx.fill();
      ctx.fillStyle = flash ? '#ffffff' : '#d8642f'; circle(0, 0, r); ctx.fill();
      const ex = Math.cos(look) * 4, ey = Math.sin(look) * 4;
      eye(ex - 4, ey - 1, 2.2, '#ffe9a0'); eye(ex + 4, ey - 1, 2.2, '#ffe9a0');
    } else if (e.type === 'dummy') {
      ctx.fillStyle = '#5a412a'; ctx.fillRect(-3, -4, 6, 22);
      ctx.fillRect(-16, -6, 32, 5);
      ctx.fillStyle = flash ? '#ffffff' : '#b9935c'; circle(0, -8, 11); ctx.fill();
      ctx.strokeStyle = 'rgba(70,45,20,0.6)'; ctx.lineWidth = 1.5; circle(0, -8, 6); ctx.stroke();
    }
    if (e.elite) { ctx.strokeStyle = '#e2b84f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); circle(0, 0, r + 5); ctx.stroke(); ctx.setLineDash([]); }
    if (e.burnT > 0) for (let i = 0; i < 3; i++) { const a = G.t * 6 + i * 2.1; ctx.fillStyle = 'rgba(255,170,80,0.8)'; circle(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.5 - r * 0.6 - (G.t * 30 + i * 7) % 10, 2.5); ctx.fill(); }
    if (e.poisonT > 0) { ctx.fillStyle = 'rgba(166,211,106,0.75)'; circle(Math.sin(G.t * 5) * r * 0.6, -r - (G.t * 25) % 12, 2.5); ctx.fill(); }
    if (e.stun > 0 && !e.dead) { ctx.fillStyle = '#f3c55a'; for (let i = 0; i < 3; i++) { const a = G.t * 5 + i * 2.1; circle(Math.cos(a) * 10, -r - 8 + Math.sin(a) * 3, 2); ctx.fill(); } }
    ctx.restore();
    if (!e.dead && e.type !== 'dummy' && e.hp < e.maxHp) {
      const w = e.r * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
      ctx.fillStyle = e.elite ? '#e2b84f' : '#d65a4c'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  function drawPlayer() {
    const p = player;
    if (p.dead) {
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#6b6457'; circle(p.x, p.y, p.r); ctx.fill(); ctx.globalAlpha = 1;
      return;
    }
    shadow(p.x, p.y, p.r);
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.dodgeT > 0) ctx.globalAlpha = 0.55;
    const attacking = p.atkT > 0;
    const k = attacking ? 1 - p.atkT / p.atkDur : 0;
    ctx.lineCap = 'round';
    if (p.weapon === 'rapier') {
      const a = p.specialKind === 'lunge' ? p.lungeDir : attacking ? p.atkFace : p.face + 0.55;
      const ext = p.specialKind === 'lunge' ? 22 : attacking ? Math.sin(k * Math.PI) * 24 : 0;
      const s = p.r - 3 + ext;
      ctx.strokeStyle = '#d7dde2'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(Math.cos(a) * (s + 34), Math.sin(a) * (s + 34)); ctx.stroke();
      ctx.strokeStyle = '#c59a4a'; ctx.lineWidth = 3;
      const gx = Math.cos(a) * (s + 3), gy = Math.sin(a) * (s + 3);
      ctx.beginPath(); ctx.moveTo(gx + Math.cos(a + Math.PI / 2) * 5, gy + Math.sin(a + Math.PI / 2) * 5); ctx.lineTo(gx - Math.cos(a + Math.PI / 2) * 5, gy - Math.sin(a + Math.PI / 2) * 5); ctx.stroke();
    } else if (p.weapon === 'greatsword') {
      const arc = meleeGeom('greatsword').arc;
      const ease = 1 - Math.pow(1 - k, 3);
      const a = p.specialKind === 'whirlwind' ? G.t * 24 : attacking ? p.atkFace - arc / 2 + arc * ease : p.face + 0.95;
      ctx.strokeStyle = '#a9b4bc'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (p.r + 2), Math.sin(a) * (p.r + 2)); ctx.lineTo(Math.cos(a) * (p.r + 46), Math.sin(a) * (p.r + 46)); ctx.stroke();
      ctx.strokeStyle = '#6a4d2e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (p.r - 6), Math.sin(a) * (p.r - 6)); ctx.lineTo(Math.cos(a) * (p.r + 2), Math.sin(a) * (p.r + 2)); ctx.stroke();
    } else {
      const a = p.face + 0.4;
      ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (p.r - 6), Math.sin(a) * (p.r - 6)); ctx.lineTo(Math.cos(a) * (p.r + 24), Math.sin(a) * (p.r + 24)); ctx.stroke();
      const ox = Math.cos(a) * (p.r + 26), oy = Math.sin(a) * (p.r + 26);
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 10);
      g.addColorStop(0, 'rgba(255,220,140,1)'); g.addColorStop(0.4, 'rgba(240,130,60,0.8)'); g.addColorStop(1, 'rgba(240,130,60,0)');
      ctx.fillStyle = g; circle(ox, oy, 10); ctx.fill();
    }
    ctx.fillStyle = '#4e6342'; ctx.beginPath(); ctx.arc(0, 0, p.r + 1, p.face + Math.PI / 2, p.face + Math.PI * 1.5); ctx.fill();
    ctx.fillStyle = p.hitFlash > 0 ? '#ff9a8a' : '#e9dcc0'; circle(Math.cos(p.face) * 1.5, Math.sin(p.face) * 1.5, p.r - 2); ctx.fill();
    ctx.strokeStyle = '#231d14'; ctx.lineWidth = 2; circle(0, 0, p.r); ctx.stroke();
    ctx.fillStyle = '#231d14'; circle(Math.cos(p.face) * 7, Math.sin(p.face) * 7, 2); ctx.fill();
    if (p.blocking) {
      const perfect = G.t - p.blockStart <= 0.22, half = Math.min(G.S.blockArc / 2, 1.5);
      ctx.strokeStyle = perfect ? '#f3c55a' : '#9fb3c1'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, p.r + 8, p.face - half, p.face + half); ctx.stroke();
    }
    if (p.riposteReady) { ctx.strokeStyle = 'rgba(243,197,90,0.6)'; ctx.lineWidth = 1.5; circle(0, 0, p.r + 4 + Math.sin(G.t * 10) * 1.5); ctx.stroke(); }
    ctx.restore();
  }

  function drawFx() {
    const p = player;
    for (const f of G.fx) {
      const k = f.t / f.dur, a = 1 - k;
      if (f.type === 'swing') {
        if (f.weapon === 'rapier') {
          ctx.strokeStyle = `rgba(230,236,240,${0.5 * a})`; ctx.lineWidth = 2;
          const s = p.r + 6, e2 = f.range + 6;
          ctx.beginPath(); ctx.moveTo(p.x + Math.cos(f.face) * s, p.y + Math.sin(f.face) * s); ctx.lineTo(p.x + Math.cos(f.face) * e2, p.y + Math.sin(f.face) * e2); ctx.stroke();
        } else {
          const end = f.face - f.arc / 2 + f.arc * Math.min(1, k * 1.6);
          ctx.fillStyle = `rgba(236,223,196,${0.16 * a})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, f.range, f.face - f.arc / 2, end); ctx.closePath(); ctx.fill();
        }
      } else if (f.type === 'eswing') {
        ctx.strokeStyle = `rgba(230,90,72,${0.7 * a})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.range, f.face - 1.0, f.face + 1.0); ctx.stroke();
      } else if (f.type === 'ring') {
        ctx.strokeStyle = f.gold ? `rgba(243,197,90,${a})` : f.steel ? `rgba(190,205,215,${0.6 * a})` : `rgba(255,170,80,${0.8 * a})`;
        ctx.lineWidth = f.gold ? 3 : 5; circle(f.x, f.y, f.r * (0.4 + 0.6 * k)); ctx.stroke();
      } else if (f.type === 'ghost') {
        ctx.fillStyle = `rgba(233,220,192,${0.25 * a})`; circle(f.x, f.y, p.r); ctx.fill();
      } else if (f.type === 'burst') {
        ctx.fillStyle = f.color; ctx.globalAlpha = a;
        for (const q of f.parts) { circle(f.x + q.vx * f.t, f.y + q.vy * f.t, 2.5 * a + 0.5); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0c100e'; ctx.fillRect(0, 0, VW, VH);
    const sc = viewScale(), vw = VW / sc, vh = VH / sc;
    const sx = (Math.random() - 0.5) * G.shake, sy = (Math.random() - 0.5) * G.shake;
    ctx.save(); ctx.scale(sc, sc); ctx.translate(-G.cam.x + sx, -G.cam.y + sy);
    const bx = Math.max(0, G.cam.x), by = Math.max(0, G.cam.y), bw = Math.min(vw, WORLD.w - bx), bh = Math.min(vh, WORLD.h - by);
    if (bw > 0 && bh > 0) ctx.drawImage(bg, bx, by, bw, bh, bx, by, bw, bh);
    const inView = (o, m = 60) => o.x > G.cam.x - m && o.x < G.cam.x + vw + m && o.y > G.cam.y - m && o.y < G.cam.y + vh + m;

    drawFlames();
    for (const it of G.items) {
      if (!inView(it)) continue;
      const yb = Math.sin(it.bob) * 2, blink = it.t < 5 && Math.sin(G.t * 12) > 0;
      if (blink) continue;
      ctx.fillStyle = 'rgba(120,196,86,0.75)'; ctx.beginPath(); ctx.ellipse(it.x, it.y + yb, 8, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; circle(it.x - 3, it.y - 2 + yb, 2); ctx.fill();
    }
    drawTown();
    // y-sorted drawing of obstacles, enemies and the player
    const list = [];
    for (const o of obstacles) if (inView(o)) list.push({ y: o.y, draw: () => drawObstacle(o) });
    for (const e of G.enemies) if (inView(e)) list.push({ y: e.y, draw: () => drawEnemy(e) });
    list.push({ y: player.y, draw: drawPlayer });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.draw();
    for (const pr of G.projectiles) {
      if (!inView(pr)) continue;
      const fire = pr.kind === 'fire';
      const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.4);
      g.addColorStop(0, fire ? (pr.owner === 'player' ? 'rgba(255,230,150,1)' : 'rgba(255,170,90,1)') : 'rgba(200,240,140,1)');
      g.addColorStop(0.45, fire ? 'rgba(240,120,50,0.85)' : 'rgba(120,170,60,0.8)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; circle(pr.x, pr.y, pr.r * 2.4); ctx.fill();
    }
    drawFx();
    ctx.textAlign = 'center';
    for (const t of G.texts) {
      const a = 1 - t.t / t.dur;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = (t.color === 'crit' ? '700 16px' : '600 13px') + ' "Alegreya Sans", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = TEXT_COLORS[t.color] || TEXT_COLORS.dmg; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // vignette
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
    g.addColorStop(0, 'rgba(6,9,7,0)'); g.addColorStop(1, 'rgba(6,9,7,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    if (player.hp < (G.S ? G.S.maxHp : 100) * 0.25 && !player.dead) {
      ctx.fillStyle = `rgba(150,20,20,${0.12 + Math.sin(G.t * 5) * 0.05})`; ctx.fillRect(0, 0, VW, VH);
    }
  }

  function drawMinimap() {
    const w = mini.width, h = mini.height, sx = w / WORLD.w, sy = h / WORLD.h;
    mctx.clearRect(0, 0, w, h);
    mctx.globalAlpha = 0.9;
    for (const r of REGIONS) { mctx.fillStyle = r.color; mctx.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy); }
    mctx.fillStyle = '#5e5546'; mctx.fillRect(TOWN.x * sx, TOWN.y * sy, TOWN.w * sx, TOWN.h * sy);
    mctx.globalAlpha = 1;
    for (const e of G.enemies) {
      if (e.dead || e.type === 'dummy') continue;
      mctx.fillStyle = e.aggro ? '#ec6f62' : e.elite ? '#e2b84f' : 'rgba(239,228,203,0.45)';
      mctx.fillRect(e.x * sx - 1, e.y * sy - 1, 2, 2);
    }
    mctx.fillStyle = '#f3c55a'; mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, 3, 0, TAU); mctx.fill();
    const sc = viewScale();
    mctx.strokeStyle = 'rgba(239,228,203,0.5)'; mctx.lineWidth = 1;
    mctx.strokeRect(G.cam.x * sx, G.cam.y * sy, VW / sc * sx, VH / sc * sy);
  }

  // ======================= BOOT =======================
  function save() { try { localStorage.setItem(C.saveKey, JSON.stringify(P.serialize())); } catch (e) { /* storage unavailable */ } }

  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (pressed.has('tab') || pressed.has('i')) UI.toggleBook();
    else if (pressed.has('escape')) { if (UI.isBookOpen()) UI.closeBook(); else if (UI.isDialogOpen()) UI.closeDialog(); }
    if (!UI.isBookOpen()) update(dt);
    render();
    G.miniT -= dt;
    if (G.miniT <= 0) { G.miniT = 0.15; drawMinimap(); }
    pressed.clear();
    requestAnimationFrame(frame);
  }

  function start(data) {
    let saved = data && data.save;
    if (!saved) { try { saved = JSON.parse(localStorage.getItem(C.saveKey) || 'null'); } catch (e) { saved = null; } }
    P.load(saved);
    UI.init(P, {
      save,
      setWeapon,
      focusGame: () => canvas.focus(),
      reset: () => { P.load(null); G.items = []; player.riposteReady = false; player.windStepCrit = false; respawn(); save(); UI.toast('Progress reset. Fresh start.', 'info'); },
    });
    resize();
    window.addEventListener('resize', resize);
    G.S = derived();
    if (data && data.player) Object.assign(player, data.player);
    player.hp = Math.min(player.hp, G.S.maxHp); player.sta = G.S.maxSta; player.mana = G.S.maxMana;
    if (!data || !data.player) player.hp = G.S.maxHp;
    spawnDummy();
    updateSpawns(0, true);
    player.lastRegion = regionAt(player.x, player.y);
    UI.region(player.lastRegion.name);
    const sc = viewScale();
    G.cam.x = clamp(player.x - VW / sc / 2, 0, Math.max(0, WORLD.w - VW / sc)); G.cam.y = clamp(player.y - VH / sc / 2, 0, Math.max(0, WORLD.h - VH / sc));
    if (!P.state.met.master) UI.toast('Talk to the Fencing Master (the ! in town) to get started.', 'info', 7000);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    canvas.focus();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: P.serialize(), player: { x: player.x, y: player.y, hp: player.hp, weapon: player.weapon } }));
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});

  // Exposed for debugging in the browser console.
  window.SKILLBOUND = { G, player, P };
})();
