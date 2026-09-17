import { Run, LEVELS, REGIONS, UNITS, STORAGE_KEY, normalizeProgress, buyUpgrade, upgradeCost, awardVictory, clamp } from './core.mjs';
import { Audio } from './audio.mjs';

const $ = id => document.getElementById(id);
const roman = ['I', 'II', 'III', 'IV', 'V'];
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
const fmt = n => Math.round(n).toLocaleString('da-DK');

export class Game {
  constructor() {
    this.app = document.querySelector('.game-app');
    this.canvas = $('battle-canvas'); this.keys = new Set(); this.view = 'menu'; this.tab = 'map';
    this.progress = this.load(); this.selected = this.progress.unlockedLevel - 1;
    this.run = new Run(LEVELS[this.selected], this.progress.upgrades, this.progress.difficulty);
    this.audio = new Audio(this.progress.sound); this.last = performance.now(); this.uiTime = 0;
    this.messageTime = 0; this.resultTime = 0; this.resultShown = false; this.dragging = false;
    this.bind(); this.renderMenu(); this.renderSound(); this.initialize();
  }
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('wutborg.borgstorm.progress.v2');
      return normalizeProgress(JSON.parse(raw || '{}'));
    } catch { return normalizeProgress(); }
  }
  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); return true; }
    catch { $('save-note').textContent = 'Fremgangen kan kun gemmes i denne session.'; return false; }
  }
  async initialize() {
    try {
      const { Scene, FlatScene } = await import('./scene.mjs');
      this.FlatScene = FlatScene;
      try { this.scene = new Scene(this.canvas); this.canvas.dataset.renderer = '3d'; }
      catch (error) { console.warn('Borgstorm bruger 2D-reserven:', error); this.fallback(); }
      this.bindCanvas(); this.ready = true; $('loading').hidden = true;
      this.renderMenu(); requestAnimationFrame(now => this.loop(now));
    } catch (error) {
      console.error('Borgstorm kunne ikke starte', error);
      $('loading').querySelector('p').textContent = 'Spillet kunne ikke indlæses. Genindlæs siden for at prøve igen.';
    }
  }
  fallback() {
    this.scene?.dispose();
    const replacement = this.canvas.cloneNode(); this.canvas.replaceWith(replacement); this.canvas = replacement;
    this.scene = new this.FlatScene(this.canvas); this.canvas.dataset.renderer = '2d';
  }
  bindCanvas() {
    const steer = event => {
      const rect = this.canvas.getBoundingClientRect();
      this.run.steer(((event.clientX - rect.left) / rect.width - .5) * 2.6);
    };
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.canPlay()) return;
      event.preventDefault(); this.dragging = true; this.canvas.setPointerCapture(event.pointerId); steer(event);
    });
    this.canvas.addEventListener('pointermove', event => { if (this.dragging && this.canPlay()) steer(event); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(name, () => { this.dragging = false; });
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.pause(true); this.fallback(); this.bindCanvas();
      $('message').textContent = 'Grafikken er skiftet til reservevisning. Du kan fortsætte slaget.';
    });
  }
  canPlay() { return this.view === 'playing' && this.run.active && !this.run.paused && !$('help-dialog').open; }
  bind() {
    $('start').addEventListener('click', () => this.start());
    $('retry').addEventListener('click', () => this.start());
    $('next').addEventListener('click', () => { if (this.run.state === 'won' && this.selected < 19) { this.selected++; this.start(); } });
    $('pause-menu').addEventListener('click', () => this.menu());
    $('result-menu').addEventListener('click', () => this.menu());
    $('pause-button').addEventListener('click', () => this.pause(true));
    $('resume').addEventListener('click', () => this.pause(false));
    $('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); this.pause(false); });
    $('result-dialog').addEventListener('cancel', event => { event.preventDefault(); this.menu(); });
    for (const [i, id] of ['left', 'right'].entries()) $(id).addEventListener('click', () => { if (this.canPlay()) this.run.choose(i); });
    for (const id of ['shield', 'volley']) $(id).addEventListener('click', () => { if (this.canPlay()) this.run.ability(id); });
    $('sound').addEventListener('click', () => { this.progress.sound = !this.progress.sound; this.audio.setEnabled(this.progress.sound); this.save(); this.renderSound(); });
    $('help').addEventListener('click', () => {
      this.helpWasPaused = this.run.paused; this.run.pause(true); this.keys.clear(); this.dragging = false;
      $('help-dialog').showModal();
    });
    $('help-close').addEventListener('click', () => $('help-dialog').close());
    $('help-dialog').addEventListener('close', () => { if (!this.helpWasPaused) this.run.pause(false); this.last = performance.now(); });
    $('difficulty').addEventListener('change', () => { if (this.view === 'menu') { this.progress.difficulty = $('difficulty').value; this.save(); } });
    for (const id of ['map', 'upgrades']) {
      $(id + '-tab').addEventListener('click', () => this.selectTab(id));
      $(id + '-tab').addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
          event.preventDefault(); const next = event.code === 'Home' ? 'map' : event.code === 'End' ? 'upgrades' : id === 'map' ? 'upgrades' : 'map';
          this.selectTab(next); $(next + '-tab').focus();
        }
      });
    }
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape' && !document.querySelector('dialog[open]') && this.canPlay()) { event.preventDefault(); this.pause(true); return; }
      if (!this.canPlay() || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        event.preventDefault(); this.keys.add(event.code);
        if (!event.repeat && event.code === 'KeyQ') this.run.ability('shield');
        if (!event.repeat && event.code === 'KeyE') this.run.ability('volley');
      }
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; if (!$('help-dialog').open) this.pause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.keys.clear(); if (!$('help-dialog').open) this.pause(true); } this.last = performance.now(); });
    window.addEventListener('pagehide', () => this.audio.context?.suspend().catch(() => {}));
  }
  renderSound() { $('sound').setAttribute('aria-pressed', String(this.progress.sound)); $('sound').querySelector('span').textContent = this.progress.sound ? 'Lyd til' : 'Lyd fra'; }
  selectTab(tab) {
    this.tab = tab;
    for (const id of ['map', 'upgrades']) { $(id + '-tab').setAttribute('aria-selected', String(tab === id)); $(id + '-tab').tabIndex = tab === id ? 0 : -1; $(id + '-panel').hidden = tab !== id; }
  }
  selectLevel(index) {
    if (this.view !== 'menu' || !LEVELS[index] || index >= this.progress.unlockedLevel) return false;
    this.selected = index; this.run = new Run(LEVELS[index], this.progress.upgrades, this.progress.difficulty); this.renderMenu(); return true;
  }
  renderMenu() {
    const level = LEVELS[this.selected], region = REGIONS[level.region], progress = this.progress;
    $('world-name').textContent = region.name; $('world-subtitle').textContent = region.subtitle;
    $('chapter-tag').textContent = `RIGE ${roman[level.region]} AF V`;
    $('coins').textContent = fmt(progress.coins); $('total-stars').textContent = `${Object.values(progress.stars).reduce((a, b) => a + b, 0)} / 60 ★`;
    $('mission-number').textContent = `${level.boss ? 'BORGHERRE' : 'BANE'} ${String(level.id).padStart(2, '0')}`;
    $('mission-title').textContent = level.name; $('mission-stars').textContent = stars(progress.stars[level.id]);
    $('mission-description').textContent = `${level.gates.length} porte · ${level.startingArmy + progress.upgrades.reinforcement * 3} soldater · ${level.boss ? 'en borgherre at besejre' : 'én borg at erobre'}`;
    $('difficulty').value = progress.difficulty;
    $('start').disabled = !this.ready; $('start').firstElementChild.textContent = this.ready ? `Start bane ${level.id}` : 'Gør klar til slaget…';
    $('record').textContent = progress.best ? `DIN REKORD · ${fmt(progress.best)} POINT` : 'Din første sejr venter.';
    const map = $('level-grid'); map.replaceChildren();
    REGIONS.forEach((r, i) => {
      const row = document.createElement('section'); row.className = 'region-row'; row.style.setProperty('--region', r.color);
      const group = LEVELS.filter(l => l.region === i);
      const earned = group.reduce((sum, l) => sum + progress.stars[l.id], 0);
      row.innerHTML = `<div class="region-header"><strong><i class="region-number">${roman[i]}</i>${r.name}</strong><span>${earned} / 12 ★</span></div><div class="region-levels"></div>`;
      group.forEach(l => {
        const button = document.createElement('button'); button.type = 'button'; button.className = `level${l.id === level.id ? ' selected' : ''}${l.boss ? ' boss' : ''}`;
        button.disabled = l.id > progress.unlockedLevel; button.dataset.level = l.id;
        button.setAttribute('aria-pressed', String(l.id === level.id)); button.setAttribute('aria-label', `Bane ${l.id}: ${l.name}. ${button.disabled ? 'Låst' : progress.stars[l.id] + ' af 3 stjerner'}`);
        button.innerHTML = `<strong>${l.boss ? '♜' : String(l.id).padStart(2, '0')}</strong><small>${button.disabled ? '·' : stars(progress.stars[l.id])}</small>`;
        button.addEventListener('click', () => { this.selectLevel(l.id - 1); map.querySelector(`[data-level="${l.id}"]`).focus({ preventScroll: true }); });
        row.lastElementChild.append(button);
      }); map.append(row);
    });
    const options = [
      ['reinforcement', '⚔', 'Forstærkninger', '+3 soldater fra start'],
      ['armor', '◆', 'Stærkere rustning', '6 % mindre skade'],
      ['banner', '⚑', 'Fanebærer', '+10 point pr. kombotrin'],
    ];
    $('upgrades').replaceChildren();
    options.forEach(([key, icon, title, copy]) => {
      const rank = progress.upgrades[key], cost = upgradeCost(rank), button = document.createElement('button');
      button.type = 'button'; button.className = 'upgrade'; button.disabled = rank >= 5; button.dataset.upgrade = key;
      button.innerHTML = `<span class="upgrade-icon">${icon}</span><span class="upgrade-info"><b>${title}</b><small>${copy} pr. niveau</small></span><span class="upgrade-price">${rank >= 5 ? 'Maks.' : '◈ ' + cost}<small>${rank} / 5</small></span>`;
      button.addEventListener('click', () => {
        if (this.view !== 'menu') return;
        if (buyUpgrade(progress, key)) {
          this.save(); this.audio.unlock(); this.audio.play('gain');
          $('upgrade-message').textContent = `${title} er opgraderet til niveau ${progress.upgrades[key]}.`;
          this.run = new Run(level, progress.upgrades, progress.difficulty); this.renderMenu();
          $('upgrades').querySelector(`[data-upgrade="${key}"]`).focus({ preventScroll: true });
        } else $('upgrade-message').textContent = `Du mangler ${Math.max(0, cost - progress.coins)} mønter. Hver sejr giver nye mønter.`;
      }); $('upgrades').append(button);
    });
  }
  start() {
    if (!this.ready || this.selected >= this.progress.unlockedLevel) return;
    for (const id of ['pause-dialog', 'result-dialog', 'help-dialog']) $(id).close();
    this.audio.unlock(); this.keys.clear(); this.dragging = false; this.view = 'playing'; this.app.dataset.view = 'playing';
    this.run = new Run(LEVELS[this.selected], this.progress.upgrades, this.progress.difficulty); this.run.start();
    this.resultShown = false; this.resultTime = 0; this.messageTime = 0;
    $('floating-message').classList.remove('show'); $('hud').hidden = $('play-controls').hidden = false;
    $('hud-region').textContent = REGIONS[this.run.level.region].name.toUpperCase(); $('hud-mission').textContent = this.run.level.name;
    $('message').textContent = this.selected === 0 ? 'Vælg en port · Brug ← → eller træk hæren' : 'Saml allierede. Vælg din vej.';
    this.last = performance.now(); this.scene.resize(); this.renderHUD(); window.scrollTo({ top: 0, behavior: 'instant' }); $('pause-button').focus({ preventScroll: true });
  }
  menu() {
    for (const id of ['pause-dialog', 'result-dialog']) $(id).close();
    this.view = 'menu'; this.app.dataset.view = 'menu'; this.keys.clear(); this.dragging = false;
    this.run = new Run(LEVELS[this.selected], this.progress.upgrades, this.progress.difficulty);
    $('hud').hidden = $('play-controls').hidden = true; this.renderMenu(); this.scene.resize(); $('start').focus({ preventScroll: true });
  }
  pause(value) {
    if (this.view !== 'playing' || !this.run.active || this.run.paused === value) return;
    this.run.pause(value); this.keys.clear(); this.dragging = false;
    if (value) { $('pause-dialog').showModal(); $('resume').focus(); }
    else { $('pause-dialog').close(); this.last = performance.now(); $('pause-button').focus({ preventScroll: true }); }
    this.renderHUD();
  }
  finish() {
    if (this.resultShown) return; this.resultShown = true;
    const run = this.run, won = run.state === 'won', complete = won && this.selected === 19;
    $('result-icon').textContent = won ? '♜' : '⚑';
    $('result-kicker').textContent = complete ? 'FEM RIGER. ÉN SEJRHERRE.' : won ? 'FANEN ER HEJST' : 'ET SLAG ER IKKE HELE KRIGEN';
    $('result-title').textContent = complete ? 'Guldborgen er din.' : won ? 'Borgen er din.' : 'Saml fanerne igen.';
    $('result-stars').textContent = won ? stars(run.stars) : '◇';
    $('result-copy').textContent = won ? `${run.level.name} er erobret. ${run.army} soldater vender hjem med dig.` : 'Hæren faldt. Prøv flere skjolde, flyt dig fra de røde felter, eller vælg Rolig på kampagnekortet.';
    $('result-stats').innerHTML = `<span><strong>${fmt(run.score)}</strong><small>POINT</small></span><span><strong>${run.dodges}</strong><small>UNDVIGELSER</small></span><span><strong>${run.maxCombo}×</strong><small>BEDSTE COMBO</small></span>`;
    const reward = awardVictory(this.progress, run);
    $('reward').textContent = won ? `+${reward} mønter til næste felttog${complete ? ' · Alle 20 baner er gennemført!' : ''}` : 'Dine opgraderinger og tidligere sejre er bevaret.';
    if (won) {
      if (!this.save()) $('reward').textContent += ' · Kan kun gemmes i denne session.';
      Promise.resolve(window.WutborgHighscores?.submit({ gameKey: 'borgstorm', gameTitle: 'Borgstorm', score: run.score, outcome: 'victory', details: { version: 3, level: run.level.id, difficulty: this.progress.difficulty, stars: run.stars, soldiers: run.army } })).catch(() => {});
    }
    $('next').hidden = !won || complete; $('result-dialog').showModal();
    (won && !complete ? $('next') : $('retry')).focus(); this.keys.clear();
  }
  event(e) {
    this.scene.event(e, this.run); this.audio.play(e.type);
    const messages = {
      gain: `+${e.amount} · ${e.name}`, dodge: 'Flot undveget!', hit: e.blocked ? `Skjoldet holder · −${e.amount}` : `−${e.amount} soldater`,
      clear: 'Vejen er fri!', siege: 'STORM BORGEN', shield: 'Skjoldmur!', volley: 'Pilesalve!',
    };
    if (messages[e.type]) { $('floating-message').textContent = messages[e.type]; $('floating-message').classList.add('show'); this.messageTime = 1.3; }
    if (e.type === 'encounter') $('message').textContent = e.hazard ? 'Fældefelt! Flyt hæren væk fra det røde område.' : 'Undvig røde felter · Q: skjold · E: pilesalve';
    if (e.type === 'siege') $('message').textContent = 'Tre faser. Hold hæren i live, til borgen falder.';
    if (e.type === 'gain' || e.type === 'clear') $('message').textContent = e.type === 'gain' ? `${e.name} slutter sig til hæren.` : 'Vælg næste port.';
    if (e.type === 'won' || e.type === 'lost') this.resultTime = .8;
  }
  renderHUD() {
    const r = this.run, combat = Boolean(r.combat && ['encounter', 'siege'].includes(r.state));
    $('army').textContent = r.army;
    $('roster').innerHTML = Object.entries(r.units).filter(([, n]) => n > 0).map(([k, n]) => `<span style="color:${UNITS[k].color}" title="${UNITS[k].name}">${UNITS[k].icon} ${n}</span>`).join('');
    $('route-progress').max = r.level.gates.length; $('route-progress').value = r.gateIndex + (r.state === 'running' ? r.travel : 0);
    $('route-label').textContent = r.state === 'siege' ? 'Borgen' : `Port ${Math.min(r.gateIndex + 1, r.level.gates.length)} / ${r.level.gates.length}`;
    $('combo').hidden = r.combo < 2; $('combo').innerHTML = `${r.combo}× <span>FREMDRIFT</span>`;
    $('enemy-panel').hidden = !combat; $('abilities').hidden = !combat;
    if (combat) {
      $('enemy-title').textContent = r.combat.hazard ? 'Fældefelt · hold dig i bevægelse' : r.state === 'siege' ? ['Bryd porten', 'Indtag borggården', 'Besejr borgherren'][r.combat.phase] : 'Fjendehæren';
      $('enemy-health').max = r.combat.maxHealth; $('enemy-health').value = r.combat.health;
      $('enemy-health').hidden = r.combat.hazard;
      $('enemy-phase').textContent = r.state === 'siege' ? `FASE ${r.combat.phase + 1} / 3` : r.combat.warning > 0 ? 'ANGREB PÅ VEJ — FLYT DIG!' : 'GØR KLAR TIL AT UNDVIGE';
    }
    for (const k of ['shield', 'volley']) {
      $(k).disabled = !combat || r.paused || r.cooldowns[k] > 0 || (k === 'volley' && r.combat?.hazard);
      $(k).querySelector('small').textContent = r.cooldowns[k] > 0 ? r.cooldowns[k].toFixed(1) + ' s' : 'Klar';
    }
    ['left', 'right'].forEach((id, i) => {
      const choice = r.gate?.[i], button = $(id);
      button.disabled = r.paused || !['running', 'encounter', 'siege'].includes(r.state);
      button.dataset.danger = String(!combat && choice && ['enemy', 'hazard'].includes(choice.type));
      button.querySelector('strong').textContent = combat ? (i ? 'Højre' : 'Venstre') : choice?.label || '♜';
      button.querySelector('small').textContent = combat ? 'Undvig angrebet' : choice?.name || 'Mod borgen';
      button.setAttribute('aria-label', combat ? `Undvig mod ${i ? 'højre' : 'venstre'}` : `${i ? 'Højre' : 'Venstre'} port: ${choice?.label || ''} ${choice?.name || ''}`);
    });
  }
  loop(now) {
    const dt = Math.min(.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (!document.hidden && !this.run.paused) {
      if (this.canPlay()) {
        const direction = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'));
        if (direction) this.run.steer(this.run.targetX + direction * dt * 2.5);
        this.run.update(dt);
      }
      for (const event of this.run.events.splice(0)) this.event(event);
      this.messageTime = Math.max(0, this.messageTime - dt);
      if (!this.messageTime) $('floating-message').classList.remove('show');
      if (this.resultTime > 0) { this.resultTime -= dt; if (this.resultTime <= 0) this.finish(); }
      this.scene.draw(this.run, dt, this.view === 'menu');
      this.uiTime += dt;
      if (this.view === 'playing' && this.uiTime > .06) { this.renderHUD(); this.uiTime = 0; }
    }
    this.frame = requestAnimationFrame(time => this.loop(time));
  }
}

if (typeof document !== 'undefined' && $('battle-canvas')) window.borgstorm = new Game();
