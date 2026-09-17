// Pure simulation. Rendering, input and storage never advance the battle.
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const VERSION = 3;
export const STORAGE_KEY = 'wutborg.borgstorm.progress.v3';
export const REGIONS = [
  { name: 'Kløvermarken', subtitle: 'Hvor et lille mod bliver til en stor hær', color: '#c8dc91', sky: 0xb7d4ca, ground: 0x66865a, tree: 0x365f45, road: 0xd0bb8b },
  { name: 'Hviskeskoven', subtitle: 'Mellem gamle træer venter nye allierede', color: '#a3d4b9', sky: 0x8aafa4, ground: 0x355d4b, tree: 0x204f3d, road: 0x9caa89 },
  { name: 'Glødelandet', subtitle: 'Hold sammen, når jorden brænder', color: '#f0b294', sky: 0xc6a392, ground: 0x65524b, tree: 0x8c5640, road: 0xb79377 },
  { name: 'Frosttinderne', subtitle: 'Kun de standhaftige når over bjergene', color: '#b9daee', sky: 0xc2d7e1, ground: 0xb9ced0, tree: 0x58817f, road: 0xe0e2d3 },
  { name: 'Kronelandet', subtitle: 'Et sidste felttog. En krone at vinde.', color: '#e9c778', sky: 0xd7c9a7, ground: 0x8e9560, tree: 0x747d43, road: 0xd9c497 },
];
export const UNITS = {
  soldier: { name: 'Sværd', color: '#c5dfef', icon: '⚔' },
  archer: { name: 'Bueskytter', color: '#c6e5a2', icon: '➶' },
  shield: { name: 'Skjolde', color: '#bfc8f8', icon: '◆' },
  giant: { name: 'Kæmper', color: '#f3c58a', icon: '♜' },
};
export const DIFFICULTIES = {
  calm: { name: 'Rolig', speed: 5.8, damage: .7, score: .8, warning: 1.55 },
  normal: { name: 'Eventyr', speed: 4.4, damage: 1, score: 1, warning: 1.2 },
  veteran: { name: 'Veteran', speed: 3.4, damage: 1.3, score: 1.3, warning: .95 },
};
const names = ['Den første fane', 'Over kløverbroen', 'Vagternes dal', 'Egeborgen', 'Skovens kald', 'De grønne skytter', 'Den glemte sti', 'Tornefæstet', 'Under rød himmel', 'Askevejen', 'Kæmpernes lejr', 'Glødeborgen', 'Den hvide dal', 'Skjold i stormen', 'Over ispasset', 'Frostkronen', 'Kongens vej', 'De sidste faner', 'Kronens vogtere', 'Guldborgen'];
const add = value => ({ type: 'add', value, label: `+${value}`, name: 'Forstærkninger' });
const multiply = value => ({ type: 'multiply', value, label: `×${value}`, name: 'Styrkeport' });
const recruit = (unit, value) => ({ type: 'recruit', unit, value, label: `+${value}`, name: UNITS[unit].name });
const hazard = value => ({ type: 'hazard', value, label: `−${value}`, name: 'Fældefelt' });
const enemy = value => ({ type: 'enemy', value, label: `${value}`, name: 'Fjendehær' });

export const LEVELS = Array.from({ length: 20 }, (_, i) => {
  const region = Math.floor(i / 4), n = i + 1, boss = n % 4 === 0;
  const pairs = [
    [add(12 + region * 3), recruit('archer', 7 + region)],
    [multiply(2), add(24 + i * 2)],
    [recruit('shield', 10 + region * 2), add(16 + i)],
    [hazard(9 + i), enemy(12 + i * 2)],
    [recruit(region > 1 ? 'giant' : 'archer', 8 + region), add(18 + region * 3)],
  ];
  if (i >= 4) pairs.splice(3, 0, [multiply(1.5), recruit('giant', 12 + region)]);
  if (i >= 12) pairs.splice(5, 0, [add(22), recruit('shield', 16)]);
  const gates = pairs.map((choices, j) => ((n * 7 + j * 3) % 2 ? choices : choices.slice().reverse()));
  return { id: n, name: names[i], region, boss, startingArmy: 24 + region * 3, gates, castleHealth: 160 + i * 21 + (boss ? 80 : 0), damage: 5 + region * 2 + (boss ? 2 : 0) };
});

const integer = (v, min, max) => Number.isFinite(Number(v)) ? clamp(Math.floor(Number(v)), min, max) : min;
export function normalizeProgress(value) {
  const p = value && typeof value === 'object' ? value : {};
  return {
    version: VERSION, unlockedLevel: integer(p.unlockedLevel ?? 1, 1, 20),
    coins: integer(p.coins, 0, 1000000),
    stars: Object.fromEntries(LEVELS.map(l => [l.id, integer(p.stars?.[l.id], 0, 3)])),
    upgrades: Object.fromEntries(['reinforcement', 'armor', 'banner'].map(k => [k, integer(p.upgrades?.[k], 0, 5)])),
    best: integer(p.best, 0, 100000000), sound: p.sound !== false,
    difficulty: Object.hasOwn(DIFFICULTIES, p.difficulty) ? p.difficulty : 'normal',
  };
}
export const upgradeCost = rank => 80 + rank * 60;
export function buyUpgrade(progress, kind) {
  if (!Object.hasOwn(progress.upgrades, kind)) return false;
  const rank = progress.upgrades[kind], cost = upgradeCost(rank);
  if (rank >= 5 || progress.coins < cost) return false;
  progress.coins -= cost; progress.upgrades[kind]++;
  return true;
}
export function awardVictory(progress, run) {
  if (run.state !== 'won' || run.rewarded) return 0;
  run.rewarded = true;
  const improvement = Math.max(0, run.stars - progress.stars[run.level.id]);
  // A small replay reward means upgrades can never become permanently inaccessible.
  const reward = improvement * 50 + 20;
  progress.stars[run.level.id] = Math.max(progress.stars[run.level.id], run.stars);
  progress.unlockedLevel = Math.max(progress.unlockedLevel, Math.min(20, run.level.id + 1));
  progress.coins += reward; progress.best = Math.max(progress.best, run.score);
  return reward;
}

export class Run {
  constructor(level = LEVELS[0], upgrades = {}, difficulty = 'normal') {
    this.level = level;
    this.upgrades = normalizeProgress({ upgrades }).upgrades;
    this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    this.units = { soldier: level.startingArmy + this.upgrades.reinforcement * 3, archer: 0, shield: 0, giant: 0 };
    this.state = 'ready'; this.gateIndex = 0; this.travel = 0; this.x = 0; this.targetX = 0;
    this.elapsed = 0; this.combo = 0; this.maxCombo = 0; this.points = 0; this.kills = 0;
    this.dodges = 0; this.hits = 0; this.losses = 0; this.shieldTime = 0;
    this.cooldowns = { shield: 0, volley: 0 }; this.events = []; this.combat = null;
    this.breather = 0; this.time = 0; this.rewarded = false; this.paused = false;
  }
  get army() { return Object.values(this.units).reduce((a, b) => a + b, 0); }
  get gate() { return this.level.gates[this.gateIndex] || null; }
  get active() { return ['running', 'encounter', 'siege', 'breather'].includes(this.state); }
  get stars() { return this.state !== 'won' ? 0 : 1 + Number(this.army >= 35) + Number(this.army >= 65 && this.hits <= 2); }
  get score() { return Math.round((this.points + this.army * 35 + this.dodges * 100 + (this.state === 'won' ? 1000 : 0)) * this.difficulty.score); }
  emit(type, details = {}) { this.events.push({ type, ...details }); }
  start() { if (this.state === 'ready') { this.state = 'running'; this.emit('start'); } }
  pause(value) { if (this.active) this.paused = value; }
  steer(x) { if (this.active && !this.paused) this.targetX = clamp(x, -1, 1); }
  choose(side) {
    if (this.paused || ![0, 1].includes(side)) return false;
    if (this.state === 'running') {
      this.targetX = side ? .8 : -.8;
      this.travel = Math.max(this.travel, .58);
      return true;
    }
    if (['encounter', 'siege'].includes(this.state)) { this.targetX = side ? 1 : -1; return true; }
    return false;
  }
  addUnits(kind, count) { this.units[kind] += Math.max(0, Math.min(Math.floor(count), 399 - this.army)); }
  damage(amount) {
    const total = this.army;
    let left = Math.min(total, Math.max(0, Math.round(amount)));
    const actual = left;
    // Allocate casualties proportionally; specialist counts always sum to the visible army.
    for (const kind of ['giant', 'shield', 'archer']) {
      const n = Math.min(this.units[kind], Math.floor(actual * this.units[kind] / Math.max(1, total)));
      this.units[kind] -= n; left -= n;
    }
    for (const kind of ['soldier', 'archer', 'shield', 'giant']) {
      const n = Math.min(left, this.units[kind]); this.units[kind] -= n; left -= n;
    }
    this.losses += actual;
    if (!this.army) { this.state = 'lost'; this.emit('lost'); }
    return actual;
  }
  ability(kind) {
    if (this.paused || !['encounter', 'siege'].includes(this.state) || !Object.hasOwn(this.cooldowns, kind) || this.cooldowns[kind] > 0) return false;
    if (kind === 'shield') { this.shieldTime = 1.8 + Math.min(.8, this.units.shield * .03); this.cooldowns.shield = 6; }
    if (kind === 'volley') {
      if (this.combat.hazard) return false;
      this.combat.health = Math.max(0, this.combat.health - (18 + this.units.archer * 2 + this.units.giant));
      this.cooldowns.volley = 4.8;
    }
    this.emit(kind); return true;
  }
  passGate() {
    const side = this.x < 0 ? 0 : 1, choice = this.gate[side], before = this.army;
    this.lastSide = side;
    if (['enemy', 'hazard'].includes(choice.type)) {
      this.combat = {
        health: choice.value * 2.3, maxHealth: choice.value * 2.3, clock: .65,
        warning: 0, lane: 0, phase: 0, attacks: 0, hazard: choice.type === 'hazard',
        damage: choice.type === 'hazard' ? choice.value : Math.max(4, Math.round(choice.value * .25)),
      };
      this.state = 'encounter'; this.targetX = this.x = 0;
      this.emit('encounter', { hazard: this.combat.hazard }); return;
    }
    if (choice.type === 'add') this.addUnits('soldier', choice.value);
    if (choice.type === 'multiply') {
      const totals = { ...this.units };
      for (const [kind, n] of Object.entries(totals)) this.addUnits(kind, Math.floor(n * (choice.value - 1)));
    }
    if (choice.type === 'recruit') this.addUnits(choice.unit, choice.value);
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.points += 100 + this.combo * (25 + this.upgrades.banner * 10);
    this.emit('gain', { amount: this.army - before, name: choice.name, side });
    this.advance();
  }
  advance() { this.gateIndex++; this.state = 'breather'; this.breather = .65; this.combat = null; this.travel = 0; }
  beginSiege() {
    this.state = 'siege'; this.x = this.targetX = 0;
    const health = this.level.castleHealth;
    this.combat = { health, maxHealth: health, clock: 1.25, warning: 0, lane: 0, phase: 0, attacks: 0, damage: this.level.damage, hazard: false };
    this.emit('siege');
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.paused || !this.active) return;
    // Bounded substeps make attacks and collisions independent of display refresh rate.
    let remaining = Math.min(dt, .25);
    while (remaining > .000001 && this.active) { const step = Math.min(remaining, 1 / 60); this.step(step); remaining -= step; }
  }
  step(dt) {
    this.elapsed += dt; this.time += dt;
    this.x += (this.targetX - this.x) * Math.min(1, dt * 10);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    for (const key of Object.keys(this.cooldowns)) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    if (this.state === 'running') {
      this.travel += dt / this.difficulty.speed;
      if (this.travel >= 1) this.passGate();
    } else if (this.state === 'breather') {
      this.breather -= dt;
      if (this.breather <= 0) { if (this.gate) this.state = 'running'; else this.beginSiege(); }
    } else if (this.combat) this.stepCombat(dt);
  }
  stepCombat(dt) {
    const c = this.combat;
    if (!c.hazard) c.health = Math.max(0, c.health - dt * (this.army * .19 + this.units.archer * .16 + this.units.giant * .65 + 2));
    c.phase = this.state === 'siege' ? Math.min(2, Math.floor((1 - c.health / c.maxHealth) * 3)) : 0;
    if (c.health <= 0 && !c.hazard) {
      if (this.state === 'siege') { this.state = 'won'; this.emit('won'); }
      else { this.kills++; this.emit('clear'); this.advance(); }
      return;
    }
    if (c.warning > 0) {
      c.warning -= dt;
      if (c.warning <= 0) {
        const hit = Math.abs(this.x - c.lane) < (c.phase === 2 ? .63 : .53);
        if (hit) {
          const reduction = (1 - this.upgrades.armor * .06) * (1 - Math.min(.3, this.units.shield * .012)) * (this.shieldTime > 0 ? .15 : 1);
          const loss = this.damage(c.damage * this.difficulty.damage * reduction);
          this.hits++; this.combo = 0; this.emit('hit', { amount: loss, lane: c.lane, blocked: this.shieldTime > 0 });
        } else { this.dodges++; this.points += 80; this.emit('dodge', { lane: c.lane }); }
        c.attacks++; c.clock = c.phase === 2 ? .75 : 1.1;
        if (c.hazard && this.state !== 'lost') this.advance();
      }
    } else {
      c.clock -= dt;
      if (c.clock <= 0) {
        c.lane = clamp(Math.round(this.x * 1.25) / 1.25, -.8, .8);
        c.warning = this.difficulty.warning + (c.hazard ? .25 : 0);
        this.emit('warning', { lane: c.lane });
      }
    }
  }
}
