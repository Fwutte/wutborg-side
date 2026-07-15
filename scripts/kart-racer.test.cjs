const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "js", "kart-racer-data.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "js", "kart-racer.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "kart-racer.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "css", "kart-racer.css"), "utf8");
const browserWindow = { addEventListener() {} };
const sandbox = { window: browserWindow, console, Math };

vm.runInNewContext(dataSource, sandbox);
vm.runInNewContext(gameSource, sandbox);

const api = browserWindow.WutborgKart;
assert.ok(api, "Kartspillet skal eksportere et test-API");
assert.equal(api.data.TRACKS.length, 3, "Grand Prix-versionen skal have tre baner");
assert.equal(api.data.DRIVERS.length, 8, "Løbet skal have otte kørere");
assert.deepEqual(Object.keys(api.data.ITEM_TYPES), ["mushroom", "banana", "shell", "redShell", "star", "lightning"]);
assert.ok(api.data.DRIVERS.every((driver) => driver.sprite.endsWith(".png")), "Alle kørere skal bruge en bilsprite");

api.data.TRACKS.forEach((candidate) => {
  assert.equal(candidate.isRoad(candidate.start.x, candidate.start.y), true, `${candidate.name} skal starte på asfalt`);
  assert.equal(candidate.isRoad(candidate.cx, candidate.cy), false, `${candidate.name} må ikke have asfalt i midten`);
  assert.equal(candidate.waypoints.length, 32, `${candidate.name} skal have en tæt AI-linje`);
  assert.ok(candidate.itemBoxes.length >= 6, `${candidate.name} skal have itembokse`);
  assert.ok(candidate.coins.length >= 10, `${candidate.name} skal have mønter`);
  assert.ok(candidate.boostPads.length >= 2, `${candidate.name} skal have boostfelter`);
});

const track = api.data.TRACKS[0];
assert.equal(track.isRoad(2, 2), false, "Yderområdet må ikke være kørebane");

const { Kart, Race, RaceAI, circularDistance } = api.testHooks;
const kart = new Kart(api.data.DRIVERS[0], 0, false);
kart.reset(track, 0);
const startingSpeed = kart.speed;
kart.update(1 / 60, { steer: 0, accelerate: true, brake: false, drift: false, itemPressed: false }, track);
assert.ok(kart.speed > startingSpeed, "Gas skal accelerere karten");
assert.ok(Number.isFinite(kart.x) && Number.isFinite(kart.y), "Fysik må holde karten i endelige koordinater");

kart.speed = 220;
kart.update(0.6, { steer: 1, accelerate: true, brake: false, drift: true, itemPressed: false }, track);
assert.equal(kart.drifting, true, "Shift/drift skal starte et drift ved fart og styring");
kart.update(1 / 60, { steer: 0, accelerate: true, brake: false, drift: false, itemPressed: false }, track);
assert.ok(kart.boostTimer > 0, "Et opladet drift skal udløse mini-turbo");

const race = new Race(track, api.data.DRIVERS);
race.start("mario");
assert.equal(race.karts.length, 8, "Et løb skal starte med otte karts");
assert.equal(race.state, "countdown", "Løbet skal starte med countdown");
race.state = "racing";
const player = race.player;
track.checkpointAngles.forEach((angle) => {
  const point = track.pointAt(angle);
  player.x = point.x;
  player.y = point.y;
  player.speed = 90;
  race.updateKartProgress(player);
});
assert.equal(player.lap, 1, "Checkpoints i korrekt rækkefølge skal give én omgang");

player.item = "mushroom";
assert.equal(race.useItem(player), true, "Turbo-svamp skal kunne bruges");
assert.ok(player.boostTimer > 0, "Turbo-svamp skal give boosttid");
player.item = "banana";
race.useItem(player);
assert.equal(race.traps.length, 1, "Banan skal placere en fælde");
player.item = "shell";
race.useItem(player);
assert.equal(race.shells.length, 1, "Grøn skal skal affyre et projektil");
player.item = "redShell";
race.useItem(player);
assert.equal(race.shells.at(-1).homing, true, "Rød skal skal være målsøgende");
player.item = "star";
race.useItem(player);
assert.ok(player.starTimer > 5, "Stjerne skal give midlertidig usårlighed");
player.item = "lightning";
race.useItem(player);
assert.ok(race.karts.slice(1).every((target) => target.spinTimer > 0), "Lyn skal ramme rivalerne");

const coin = race.coins[0];
player.x = coin.x;
player.y = coin.y;
race.updateObjects(1 / 60);
assert.equal(player.coins, 1, "En mønt skal øge kartens mønttal");

const aiInput = new RaceAI().inputFor(race.karts[1], track);
assert.ok(aiInput.steer >= -1 && aiInput.steer <= 1, "AI-styring skal være normaliseret");
assert.equal(typeof aiInput.accelerate, "boolean");
assert.equal(typeof aiInput.drift, "boolean");
assert.ok(circularDistance(0, Math.PI * 2 - 0.02) < 0.03, "Vinkelafstand skal håndtere 0/2π-overgang");

assert.match(htmlSource, /data-kart-control="drift"/, "Mobilstyringen skal have en driftknap");
assert.match(htmlSource, /viewport-fit=cover/, "Mobilvisningen skal respektere telefonens safe area");
assert.match(cssSource, /orientation:landscape/, "Spillet skal have et dedikeret mobilt landskabs-layout");
assert.match(cssSource, /100dvh/, "Mobilspillet skal passe til den dynamiske skærmhøjde");

console.log("Kart-test: 3 baner, drift, mønter, 6 items, grafik og mobil bestået");
