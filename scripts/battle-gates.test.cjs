const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "js", "battle-gates-data.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "js", "battle-gates.js"), "utf8");
const browserWindow = { addEventListener() {} };
const sandbox = { window: browserWindow, console, Math };

vm.runInNewContext(dataSource, sandbox);
vm.runInNewContext(gameSource, sandbox);

const api = browserWindow.WutborgBattle;
assert.ok(api, "Borgstorm skal eksportere et test-API");
assert.equal(api.data.LEVELS.length, 20, "High-end-fasen skal have tyve baner");
assert.equal(new Set(api.data.LEVELS.map((level) => level.region.id)).size, 5, "Kampagnen skal besøge fem riger");
assert.equal(api.data.LEVELS.filter((level) => level.boss).map((level) => level.id).join(","), "5,10,15,20", "Hvert rige skal slutte med en boss");

const choiceTypes = new Set();
const recruitedUnits = new Set();
api.data.LEVELS.forEach((level) => {
  level.gates.flatMap((gate) => gate.choices).forEach((choice) => {
    choiceTypes.add(choice.type);
    if (choice.unit) recruitedUnits.add(choice.unit);
  });
  const safeResult = api.data.evaluateRoute(level.safeRoute, level);
  assert.equal(safeResult.won, true, `Den planlagte rute på bane ${level.id} skal kunne vinde`);
  const best = api.data.findBestRoute(level);
  assert.ok(best?.won && best.army > 0, `Bane ${level.id} skal have mindst én vinderrute`);
});
assert.deepEqual([...choiceTypes].sort(), ["bonus", "hazard", "recruit", "tower"]);
assert.deepEqual([...recruitedUnits].sort(), ["archer", "giant", "shield"]);

const unarmored = api.data.resolveChoice(40, { type: "tower", value: 20 });
const armored = api.data.resolveChoice(40, { type: "tower", value: 20 }, { armor: 3 });
assert.ok(armored.army > unarmored.army, "Rustning skal reducere tab i kamp");
const archerSupported = api.data.resolveChoice(40, { type: "tower", value: 20 }, { archers: 8 });
assert.ok(archerSupported.army > unarmored.army, "Bueskyttere skal støtte hæren mod fjender");
assert.equal(api.data.resolveChoice(21, { type: "bonus", operation: "multiply", value: 2 }).army, 42, "Gange-port skal fordoble hæren");
assert.equal(api.data.resolveChoice(20, { type: "hazard", value: 8, hint: "Pigge" }, { shields: 8 }).army > 12, true, "Skjolde skal beskytte mod forhindringer");

const firstLevel = api.data.LEVELS[0];
const timedRun = new api.BattleRun(firstLevel);
timedRun.start();
timedRun.choose(firstLevel.safeRoute[0]);
assert.equal(timedRun.update(0.72), null, "Portovergangen skal have tid til en glat animation");
assert.ok(timedRun.update(0.21), "Porten skal afgøres efter den fulde overgang");
const run = new api.BattleRun(firstLevel, { reinforcement: 2, armor: 1, banner: 1 });
run.start();
assert.equal(run.army, firstLevel.startingArmy + 6, "Forstærkningsopgraderingen skal give tre soldater per niveau");
firstLevel.safeRoute.forEach((side, index) => {
  assert.equal(run.choose(side), true, `Port ${index + 1} skal kunne vælges`);
  const outcome = run.resolve();
  assert.equal(outcome.type, index === firstLevel.gates.length - 1 ? "won" : "continue");
});
assert.equal(run.state, "won", "Den planlagte rute skal afslutte banen");
assert.equal(run.maxCombo, firstLevel.gates.length, "Optimale valg skal opbygge en ubrudt combo");
assert.ok(run.stars >= 1 && run.stars <= 3, "En sejr skal give en til tre stjerner");
assert.ok(run.score > 0, "En sejr skal give point");

let losingRoute = null;
for (let mask = 0; mask < 2 ** firstLevel.gates.length; mask += 1) {
  const route = firstLevel.gates.map((_, index) => (mask >> index) & 1);
  if (!api.data.evaluateRoute(route, firstLevel).won) { losingRoute = route; break; }
}
assert.ok(losingRoute, "Første bane skal også have mindst én taberrute");
const doomedRun = new api.BattleRun(firstLevel);
doomedRun.start();
for (const side of losingRoute) {
  if (doomedRun.state === "lost") break;
  doomedRun.choose(side);
  doomedRun.resolve();
}
assert.equal(doomedRun.state, "lost", "En dårlig rute skal kunne give nederlag");

console.log("Borgstorm-test: 20 baner, bosser, enheder, opgraderinger, combo og stjerner bestået");

// Exercise the campaign controller with the real HTML IDs and an isolated DOM/storage adapter.
// Rendering stays stubbed so pause tests detect accidental simulation or renderer updates.
const html = fs.readFileSync(path.join(root, "battle-gates.html"), "utf8");
class Element {
  constructor() { this.dataset = {}; this.attributes = {}; this.children = []; this.parts = {}; this.events = {}; this.hidden = false; this.style = { setProperty() {} }; }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  querySelector(selector) { return this.parts[selector] ||= new Element(); }
  focus() { sandbox.document.activeElement = this; }
}
const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(match => {
  const element = new Element();
  element.hidden = /\bhidden\b/.test(match[0]);
  return [match[1], element];
}));
const surfaces = Object.fromEntries([".battle-page", ".battle-nav", ".battle-command"].map(selector => [selector, new Element()]));
const upgrades = ["reinforcement", "armor", "banner"].map(type => {
  const element = new Element();
  element.dataset.battleUpgrade = type;
  return element;
});
let savedProgress = null;
let failSaving = false;
sandbox.localStorage = {
  getItem() { return savedProgress; },
  setItem(key, value) { if (failSaving) throw new Error("Storage unavailable"); savedProgress = value; },
};
sandbox.document = {
  hidden: false,
  getElementById(id) { assert.ok(elements.has(id), "Controller ID exists in HTML: " + id); return elements.get(id); },
  querySelector(selector) { assert.ok(surfaces[selector]); return surfaces[selector]; },
  querySelectorAll(selector) { assert.equal(selector, "[data-battle-upgrade]"); return upgrades; },
  createElement() { return new Element(); },
  addEventListener() {},
};
sandbox.performance = { now: () => 0 };
sandbox.requestAnimationFrame = () => {};
browserWindow.scrollTo = () => {};
let draws = 0;
let steering = 0;
let resizes = 0;
api.BattleGame.prototype.initializeRenderer = function () {
  this.renderer = { reset() {}, emit() {}, draw() { draws++; }, resizeRenderer() { resizes++; }, setSteering(value) { steering = value; } };
  this.is3D = true;
};
const game = new api.BattleGame();
assert.equal(game.els.levelGrid.children.length, 5, "Kampagnekortet skal vise fem riger");
const mapButtons = game.els.levelGrid.children.flatMap(region => region.children[0].children);
assert.equal(mapButtons.length, 20);
assert.equal(mapButtons.filter(button => button.disabled).length, 19, "Kun første bane skal være åben fra start");
game.selectLevel(19);
assert.equal(game.selectedLevel, 0, "Låste baner må ikke vælges");
game.purchaseUpgrade("armor");
assert.equal(game.progress.coins, 0);
assert.match(game.els.upgradeMessage.textContent, /mangler 80 mønter/, "Manglende mønter skal forklares på det synlige kampagnekort");

game.start();
assert.equal(game.page.dataset.view, "playing");
assert.equal(resizes, 1, "Arenaen skal tilpasses efter det skjulte kampagnekort forlades");
assert.equal(game.els.left.disabled, false);
assert.match(game.els.left.attributes["aria-label"], /Venstre port:/);
steering = 1;
game.togglePause(true);
game.togglePause(true);
game.loop(1000);
assert.equal(game.paused, true, "Gentagen automatisk pause må ikke genoptage spillet");
assert.equal(game.run.elapsed, 0, "Slagtiden skal stå stille under pause");
assert.equal(draws, 0, "3D-arenaens porte og soldater skal også stå stille under pause");
assert.equal(steering, 0, "Pause skal rydde fastholdt tastaturstyring");
assert.equal(game.els.left.disabled, true);
assert.equal(game.els.right.disabled, true);
game.choose(0);
assert.equal(game.run.state, "choosing", "Pause skal blokere portvalg");
game.togglePause(false);
game.togglePause(false);
assert.equal(game.paused, false, "Fortsæt skal være idempotent");
game.loop(1016);
assert.equal(draws, 1);
assert.ok(game.run.elapsed > 0);

firstLevel.safeRoute.forEach(side => { game.choose(side); game.resolve(game.run.resolve()); });
assert.equal(game.run.state, "won");
assert.equal(game.els.routeProgress.value, firstLevel.gates.length);
assert.equal(game.progress.unlockedLevel, 2);
assert.equal(game.els.next.hidden, false);
const earnedCoins = game.progress.coins;
assert.equal(earnedCoins, game.run.stars * 60);
game.showResult(true);
assert.equal(game.progress.coins, earnedCoins, "Samme resultat må ikke udløse mønter to gange");
game.nextLevel();
assert.equal(game.run.level.id, 2, "Næste bane skal starte den nyligt åbnede bane");
assert.equal(game.run.state, "choosing");
assert.equal(game.page.dataset.view, "playing");
assert.equal(game.els.result.hidden, true);
game.purchaseUpgrade("armor");
assert.equal(game.progress.coins, earnedCoins, "Opgraderinger må ikke ændre et aktivt slag");
game.showMenu();
game.purchaseUpgrade("armor");
assert.equal(game.progress.upgrades.armor, 1);
assert.equal(game.progress.coins, earnedCoins - 80);
assert.equal(JSON.parse(savedProgress).upgrades.armor, 1, "Købet skal gemmes med den eksisterende lagernøgle");
const reloaded = game.loadProgress();
assert.equal(reloaded.unlockedLevel, 2);
assert.equal(reloaded.stars[1], game.progress.stars[1]);
game.loop(2000);
assert.equal(draws, 1, "Skjult arena må ikke animeres på kampagnekortet");
savedProgress = '{"unlockedLevel":2.7,"stars":{"1":99,"2":-4},"coins":"Infinity","upgrades":{"armor":2.8}}';
const repaired = game.loadProgress();
assert.equal(repaired.unlockedLevel, 2);
assert.equal(repaired.stars[1], 3);
assert.equal(repaired.stars[2], 0);
assert.equal(repaired.coins, 0);
assert.equal(repaired.upgrades.armor, 2);
failSaving = true;
assert.doesNotThrow(() => game.saveProgress());
assert.match(game.els.upgradeMessage.textContent, /kun denne session/);
console.log("Borgstorm UI-test: kampagnekort, pause, næste bane, mønter, opgraderinger og gemt fremgang bestået");
