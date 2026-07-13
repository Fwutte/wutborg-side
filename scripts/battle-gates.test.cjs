const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "js", "battle-gates-data.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "js", "battle-gates.js"), "utf8")
  .replace(/^import \{ BattleScene3D \} from "\.\/battle-gates-3d\.js\?v=[^"]+";\r?\n/, "");
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
