// The progression system: sub-skill XP, stats derived from sub-skills,
// counters, and hidden skill / evolution unlocks. No rendering in here.
(function () {
  'use strict';
  const D = window.GAME_DATA, C = window.GAME_CONFIG;

  const entries = {};
  D.abilities.forEach(a => { entries[a.id] = { kind: 'ability', def: a }; });
  D.hidden.forEach(h => { entries[h.id] = { kind: 'hidden', def: h }; });
  D.evolutions.forEach(h => { entries[h.id] = { kind: 'evolution', def: h }; });
  const skillName = id => (D.subskills.find(s => s.id === id) || { name: id }).name;

  const P = {
    state: null,
    stats: {},
    statSources: {},
    listeners: [],
    dirty: false,

    on(fn) { this.listeners.push(fn); },
    emit(type, data) {
      for (const fn of this.listeners) { try { fn(type, data); } catch (e) { console.error(e); } }
    },

    fresh() {
      const s = { version: 1, skills: {}, counters: {}, unlocked: {}, rumored: {}, stirred: {}, met: {}, rumorIdx: {}, fastMode: false };
      for (const sk of D.subskills) s.skills[sk.id] = { level: 1, xp: 0 };
      return s;
    },

    load(saved) {
      const s = this.fresh();
      if (saved && saved.version === 1) {
        for (const id in s.skills) {
          const v = saved.skills && saved.skills[id];
          if (v) s.skills[id] = { level: Math.max(1, +v.level || 1), xp: Math.max(0, +v.xp || 0) };
        }
        for (const k of ['counters', 'unlocked', 'rumored', 'stirred', 'met', 'rumorIdx']) Object.assign(s[k], saved[k] || {});
        s.fastMode = !!saved.fastMode;
      }
      this.state = s;
      this.stats = {};
      this.recompute(true);
    },

    serialize() { return JSON.parse(JSON.stringify(this.state)); },

    // ---- Sub-skills ----
    xpToNext(level) { return Math.round(C.xpCurve.base * Math.pow(level, C.xpCurve.exponent)); },
    level(id) { return this.state.skills[id].level; },
    totalLevel() {
      let t = 0;
      for (const id in this.state.skills) t += this.state.skills[id].level - 1;
      return t;
    },

    addXP(id, amount) {
      const sk = this.state.skills[id];
      if (!sk || !(amount > 0)) return;
      sk.xp += amount * C.xpMultiplier * (this.state.fastMode ? C.fastModeMultiplier : 1);
      let leveled = false;
      for (let need = this.xpToNext(sk.level); sk.xp >= need; need = this.xpToNext(sk.level)) {
        sk.xp -= need;
        sk.level++;
        leveled = true;
        this.emit('skillLevel', { id, level: sk.level });
        for (const a of D.abilities) if (a.skill === id && a.level === sk.level) this.emit('ability', a);
      }
      if (leveled) { this.recompute(false); this.check(); }
    },

    // ---- Stats: base + what each sub-skill contributes ----
    recompute(silent) {
      const stats = {}, src = {};
      for (const s of D.stats) { stats[s.id] = C.baseStat; src[s.id] = [{ from: 'Base', amount: C.baseStat }]; }
      for (const sk of D.subskills) {
        const lvl = this.state.skills[sk.id].level;
        for (const g of sk.stats) {
          const n = Math.floor(lvl / g.every);
          if (n > 0) { stats[g.stat] += n; src[g.stat].push({ from: sk.name, amount: n }); }
        }
      }
      if (!silent) {
        for (const s of D.stats) {
          for (const entry of src[s.id]) {
            const prev = (this.statSources[s.id] || []).find(e => e.from === entry.from);
            const diff = entry.amount - (prev ? prev.amount : 0);
            if (diff > 0) this.emit('statUp', { stat: s.id, amount: diff, from: entry.from });
          }
        }
      }
      this.stats = stats;
      this.statSources = src;
    },

    // ---- Counters (anything the game wants to track for unlocks) ----
    bump(id, amount = 1) {
      this.state.counters[id] = (this.state.counters[id] || 0) + amount;
      this.dirty = true;
    },
    counter(id) { return this.state.counters[id] || 0; },

    // ---- Unlock checks ----
    has(id) {
      const e = entries[id];
      if (!e) return false;
      if (e.kind === 'ability') return this.level(e.def.skill) >= e.def.level;
      return !!this.state.unlocked[id];
    },

    condProgress(c) {
      let v = 0;
      if (c.skill) v = this.level(c.skill) / c.min;
      else if (c.stat) v = this.stats[c.stat] / c.min;
      else if (c.counter) v = this.counter(c.counter) / c.min;
      else if (c.unlocked) v = this.state.unlocked[c.unlocked] ? 1 : 0;
      return Math.max(0, Math.min(1, v));
    },
    condLabel(c) {
      if (c.skill) return `${skillName(c.skill)} level ${c.min}`;
      if (c.stat) return `${c.stat} ${c.min}`;
      if (c.counter) return `${D.counterNames[c.counter] || c.counter}: ${c.min}`;
      if (c.unlocked) return `Have ${entries[c.unlocked].def.name}`;
      return '';
    },
    progress(def) {
      if (!def.conds.length) return 1;
      let t = 0;
      for (const c of def.conds) t += this.condProgress(c);
      return t / def.conds.length;
    },

    check() {
      this.dirty = false;
      const all = D.hidden.map(def => ({ def, kind: 'hidden' })).concat(D.evolutions.map(def => ({ def, kind: 'evolution' })));
      for (const { def, kind } of all) {
        if (this.state.unlocked[def.id]) continue;
        if (def.conds.every(c => this.condProgress(c) >= 1)) {
          this.state.unlocked[def.id] = true;
          this.emit('discover', { def, kind });
        } else if (kind === 'hidden' && !this.state.stirred[def.id] && !this.state.rumored[def.id] && this.progress(def) >= 0.5) {
          this.state.stirred[def.id] = true;
          this.emit('stir', def);
        }
      }
    },

    entryState(def) {
      if (this.state.unlocked[def.id]) return 'unlocked';
      if (this.state.rumored[def.id]) return 'rumored';
      if (this.state.stirred[def.id]) return 'stirring';
      return 'unknown';
    },

    // ---- Rumors: in-game sources of hints ----
    rumorPool(source) {
      const pool = D.hidden.filter(h => h.hint && h.hint.source === source && !this.state.unlocked[h.id]);
      for (const ev of D.evolutions) {
        if (ev.hint && ev.hint.source === source && this.state.unlocked[ev.from] && !this.state.unlocked[ev.id]) pool.push(ev);
      }
      return pool;
    },
    hasFreshRumor(source) { return this.rumorPool(source).some(d => !this.state.rumored[d.id]); },
    rumor(source) {
      const pool = this.rumorPool(source);
      if (!pool.length) return null;
      const fresh = pool.find(d => !this.state.rumored[d.id]);
      if (fresh) { this.state.rumored[fresh.id] = true; return { text: fresh.hint.text, isNew: true, def: fresh }; }
      const i = (this.state.rumorIdx[source] || 0) % pool.length;
      this.state.rumorIdx[source] = i + 1;
      return { text: pool[i].hint.text, isNew: false, def: pool[i] };
    },
  };

  window.Progress = P;
})();
