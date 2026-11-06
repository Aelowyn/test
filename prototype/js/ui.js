// HUD, notifications, dialog and the Skill Book. Reads from Progress, never changes game state
// except through the handlers passed to UI.init.
(function () {
  'use strict';
  const D = window.GAME_DATA;
  const $ = id => document.getElementById(id);
  const skillById = {}; D.subskills.forEach(s => { skillById[s.id] = s; });
  const abilityById = {}; D.abilities.forEach(a => { abilityById[a.id] = a; });
  const KIND_LABEL = { grounded: 'Grounded', weird: 'Weird', combined: 'Combined', evolution: 'Evolution' };

  let P = null, handlers = {};
  let bookOpen = false, dialogOpen = false;
  const bannerQueue = []; let bannerBusy = false;
  let lastStatusKey = '', lastPrompt = null;

  const UI = {};

  UI.init = function (progress, h) {
    P = progress; handlers = h || {};
    $('book-close').addEventListener('click', () => UI.closeBook());
    $('book-btn').addEventListener('click', e => { UI.toggleBook(); e.currentTarget.blur(); });
    $('book').addEventListener('click', e => { if (e.target.id === 'book') UI.closeBook(); });
    $('fast-mode').addEventListener('change', e => { P.state.fastMode = e.target.checked; if (handlers.save) handlers.save(); });
    const reset = $('reset-btn'); let armedAt = 0;
    reset.addEventListener('click', () => {
      if (armedAt && Date.now() - armedAt < 3000) {
        armedAt = 0; reset.textContent = 'Reset progress';
        if (handlers.reset) handlers.reset();
        UI.renderBook();
      } else {
        armedAt = Date.now(); reset.textContent = 'Click again to erase everything';
        setTimeout(() => { if (armedAt && Date.now() - armedAt >= 2900) { armedAt = 0; reset.textContent = 'Reset progress'; } }, 3000);
      }
    });
    $('dialog').addEventListener('click', () => UI.closeDialog());

    P.on((type, d) => {
      if (type === 'skillLevel') UI.toast(`<b>${skillById[d.id].name}</b> reached level ${d.level}`, 'level');
      else if (type === 'statUp') UI.toast(`<b>+${d.amount} ${d.stat}</b><span>from ${d.from}</span>`, 'stat');
      else if (type === 'ability') UI.toast(`New ability: <b>${d.name}</b><span>${d.desc}</span>`, 'ability', 6500);
      else if (type === 'stir') UI.toast('Something stirs inside you.<span>A new entry appeared under Secrets in your Skill Book.</span>', 'stir', 6500);
      else if (type === 'discover') UI.banner(d.kind === 'evolution' ? 'Skill evolved' : 'Hidden skill discovered', d.def.name, d.def.desc);
      if (bookOpen) UI.renderBook();
    });

    UI.buildWeapons();
  };

  // ---------- Notifications ----------
  UI.toast = function (html, kind = 'info', ms = 4200) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  };

  UI.banner = function (kicker, title, desc) {
    bannerQueue.push({ kicker, title, desc });
    if (!bannerBusy) nextBanner();
  };
  function nextBanner() {
    const b = bannerQueue.shift();
    const el = $('banner');
    if (!b) { bannerBusy = false; el.hidden = true; return; }
    bannerBusy = true;
    $('banner-kicker').textContent = b.kicker;
    $('banner-title').textContent = b.title;
    $('banner-desc').textContent = b.desc || '';
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(nextBanner, 4600);
  }

  UI.region = function (name) {
    const el = $('region-name');
    el.textContent = name;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };

  UI.dialog = function (name, text, note) {
    $('dialog-name').textContent = name;
    $('dialog-text').textContent = text;
    $('dialog-note').textContent = note || '';
    $('dialog-note').hidden = !note;
    $('dialog').hidden = false;
    dialogOpen = true;
  };
  UI.closeDialog = function () { $('dialog').hidden = true; dialogOpen = false; };
  UI.isDialogOpen = () => dialogOpen;

  UI.prompt = function (text) {
    if (text === lastPrompt) return;
    lastPrompt = text;
    const el = $('prompt');
    if (!text) { el.hidden = true; return; }
    el.innerHTML = `<kbd>E</kbd> ${text}`;
    el.hidden = false;
  };

  // ---------- HUD ----------
  UI.buildWeapons = function () {
    const box = $('weapons');
    box.innerHTML = D.weaponOrder.map((id, i) => `
      <button class="slot" type="button" data-weapon="${id}" id="slot-${id}" aria-label="Equip ${D.weapons[id].name}">
        <span class="slot-key">${i + 1}</span>
        <span class="slot-name">${D.weapons[id].name}</span>
        <span class="slot-spec" id="spec-${id}"></span>
        <i class="slot-cd" id="cd-${id}"></i>
      </button>`).join('');
    box.querySelectorAll('[data-weapon]').forEach(btn => btn.addEventListener('click', e => {
      if (handlers.setWeapon) handlers.setWeapon(btn.dataset.weapon);
      e.currentTarget.blur();
    }));
  };

  function setBar(id, v, max) {
    $(id + '-fill').style.width = (max > 0 ? Math.max(0, Math.min(1, v / max)) * 100 : 0) + '%';
    $(id + '-text').textContent = `${Math.ceil(Math.max(0, v))} / ${Math.round(max)}`;
  }

  UI.updateHUD = function (p, S) {
    setBar('hp', p.hp, S.maxHp);
    setBar('sta', p.sta, S.maxSta);
    setBar('mp', p.mana, S.maxMana);
    $('hp-fill').parentElement.classList.toggle('low', p.hp < S.maxHp * 0.25);

    for (const id of D.weaponOrder) {
      const w = D.weapons[id], ab = abilityById[w.special];
      $('slot-' + id).classList.toggle('active', p.weapon === id);
      const spec = $('spec-' + id);
      const txt = P.has(ab.id) ? `F · ${ab.name}` : `${ab.name} at Lv ${ab.level}`;
      if (spec.textContent !== txt) spec.textContent = txt;
      spec.classList.toggle('locked', !P.has(ab.id));
      const cd = p.weapon === id && p.specialCd > 0 ? p.specialCd / (p.specialCdMax || 1) : 0;
      $('cd-' + id).style.width = (cd * 100) + '%';
    }

    const st = [];
    if (p.dead) st.push(['bad', 'Fallen']);
    if (p.poisonT > 0) st.push(['poison', `Poisoned ${p.poisonT.toFixed(0)}s`]);
    if (p.inFire) st.push(['fire', P.has('ashWalker') ? 'Basking in fire' : 'Burning']);
    if (p.hp < S.maxHp * 0.25 && !p.dead) st.push(['bad', P.has('secondWind') ? 'Second Wind' : 'Low health']);
    if (p.riposteReady) st.push(['good', 'Riposte ready']);
    if (p.windStepCrit) st.push(['good', 'Next hit crits']);
    if (P.state.fastMode) st.push(['info', 'Fast test mode']);
    const key = st.map(s => s.join(':')).join('|');
    if (key !== lastStatusKey) {
      lastStatusKey = key;
      $('status').innerHTML = st.map(([k, t]) => `<span class="chip ${k}">${t}</span>`).join('');
    }
  };

  // ---------- Skill Book ----------
  UI.isBookOpen = () => bookOpen;
  UI.openBook = function () { bookOpen = true; UI.renderBook(); $('book').hidden = false; $('book-close').focus(); };
  UI.closeBook = function () { bookOpen = false; $('book').hidden = true; if (handlers.focusGame) handlers.focusGame(); };
  UI.toggleBook = function () { if (bookOpen) UI.closeBook(); else UI.openBook(); };

  const pct = v => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const fmt = n => (n >= 100 ? Math.floor(n) : Math.floor(n * 10) / 10).toLocaleString();

  function statCards() {
    return D.stats.map(s => {
      const parts = P.statSources[s.id].map(e => e.from === 'Base' ? `${e.amount} base` : `+${e.amount} ${e.from}`).join(' · ');
      return `<div class="stat-card">
        <div class="stat-top"><span class="stat-id">${s.id}</span><span class="stat-val">${P.stats[s.id]}</span></div>
        <div class="stat-name">${s.name}</div>
        <div class="stat-src">${parts}</div>
        <div class="stat-desc">${s.desc}</div>
      </div>`;
    }).join('');
  }

  function skillRows() {
    return D.subskills.map(sk => {
      const st = P.state.skills[sk.id], need = P.xpToNext(st.level);
      const feeds = sk.stats.map(g => {
        const next = (Math.floor(st.level / g.every) + 1) * g.every;
        return `+1 ${g.stat} every ${g.every} levels <span class="dim">(next at ${next})</span>`;
      }).join(' · ');
      const ms = D.abilities.filter(a => a.skill === sk.id).map(a => {
        const got = st.level >= a.level;
        return `<li class="${got ? 'got' : ''}"><span class="ms-lvl">Lv ${a.level}</span><span class="ms-name">${a.name}</span><span class="ms-desc">${a.desc}</span></li>`;
      }).join('');
      return `<div class="skill">
        <div class="skill-head"><span class="skill-name">${sk.name}</span><span class="skill-lvl">Lv ${st.level}</span></div>
        <div class="xpbar"><i style="width:${pct(st.xp / need)}%"></i></div>
        <div class="skill-meta"><span>${fmt(st.xp)} / ${need} XP</span><span>${feeds}</span></div>
        <div class="skill-desc">${sk.desc}</div>
        ${ms ? `<ul class="milestones">${ms}</ul>` : ''}
      </div>`;
    }).join('');
  }

  function bar(v) { return `<div class="xpbar secret-bar"><i style="width:${pct(v)}%"></i></div>`; }

  function secretCard(def, isEvo) {
    const state = P.entryState(def), prog = P.progress(def);
    const src = def.hint ? (def.hint.source === 'master' ? D.npcText.masterName : D.npcText.hermitName) : '';
    if (state === 'unlocked') {
      return `<article class="secret unlocked ${isEvo ? 'evo' : ''}">
        <header><h4>${def.name}</h4><span class="tag ${def.kind}">${KIND_LABEL[def.kind] || ''}</span></header>
        <p>${def.desc}</p>
        <ul class="reqs">${def.conds.map(c => `<li>${P.condLabel(c)}</li>`).join('')}</ul>
      </article>`;
    }
    if (isEvo) {
      const parent = D.hidden.find(h => h.id === def.from);
      return `<article class="secret evo ${state}">
        <header><h4>???</h4><span class="tag evolution">Evolution of ${parent.name}</span></header>
        ${state === 'rumored' ? `<blockquote>${def.hint.text}</blockquote><p class="src">From ${src}</p>` : '<p class="dim">This skill feels like it could grow into something more.</p>'}
        ${bar(prog)}
      </article>`;
    }
    if (state === 'rumored') {
      return `<article class="secret rumored">
        <header><h4>???</h4><span class="tag">Rumor</span></header>
        <blockquote>${def.hint.text}</blockquote><p class="src">From ${src}</p>
        ${bar(prog)}
      </article>`;
    }
    if (state === 'stirring') {
      return `<article class="secret stirring">
        <header><h4>???</h4><span class="tag">Stirring</span></header>
        <p class="dim">You feel close to something, but you cannot name it yet.</p>
        ${bar(prog)}
      </article>`;
    }
    return `<article class="secret unknown"><header><h4>???</h4></header><p class="dim">Undiscovered. Someone in Hollowford might know something.</p></article>`;
  }

  function secrets() {
    let html = '';
    for (const h of D.hidden) {
      html += secretCard(h, false);
      if (P.state.unlocked[h.id]) for (const ev of D.evolutions.filter(e => e.from === h.id)) html += secretCard(ev, true);
    }
    return html;
  }

  UI.renderBook = function () {
    if (!P) return;
    const found = D.hidden.filter(h => P.state.unlocked[h.id]).length;
    const evo = D.evolutions.filter(h => P.state.unlocked[h.id]).length;
    $('book-summary').textContent = `Total skill level ${P.totalLevel()} · ${found} of ${D.hidden.length} hidden skills found · ${evo} of ${D.evolutions.length} evolutions · ${Math.floor(P.counter('kills'))} enemies defeated`;
    $('book-stats').innerHTML = statCards();
    $('book-skills').innerHTML = skillRows();
    $('book-secrets').innerHTML = secrets();
    $('fast-mode').checked = !!P.state.fastMode;
  };

  window.UI = UI;
})();
