const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "js", "kart-racer-data.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "js", "kart-racer.js"), "utf8");
const browserWindow = { addEventListener() {} };
const sandbox = { window: browserWindow, console, Math };

vm.runInNewContext(dataSource, sandbox);
vm.runInNewContext(gameSource, sandbox);

const api = browserWindow.WutborgKart;
assert.ok(api, "Kartspillet skal eksportere et test-API");
assert.equal(api.data.TRACKS.length, 1, "Den økonomiske fase skal have én spilbar bane");
assert.equal(api.data.DRIVERS.length, 8, "Løbet skal have otte kørere");
assert.deepEqual(Object.keys(api.data.ITEM_TYPES), ["mushroom", "banana", "shell"]);

const track = api.data.TRACKS[0];
assert.equal(track.isRoad(track.start.x, track.start.y), true, "Startfeltet skal ligge på asfalt");
assert.equal(track.isRoad(track.cx, track.cy), false, "Indmarken må ikke være kørebane");
assert.equal(track.isRoad(2, 2), false, "Yderområdet må ikke være kørebane");
assert.equal(track.waypoints.length, 24, "AI skal have en sammenhængende waypoint-linje");
assert.equal(track.itemBoxes.length, 6, "Banen skal have itembokse");

const { Kart, Race, RaceAI, circularDistance } = api.testHooks;
const kart = new Kart(api.data.DRIVERS[0], 0, false);
kart.reset(track, 0);
const startingSpeed = kart.speed;
kart.update(1 / 60, { steer: 0, accelerate: true, brake: false, itemPressed: false }, track);
assert.ok(kart.speed > startingSpeed, "Gas skal accelerere karten");
assert.ok(Number.isFinite(kart.x) && Number.isFinite(kart.y), "Fysik må holde karten i endelige koordinater");

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

const aiInput = new RaceAI().inputFor(race.karts[1], track);
assert.ok(aiInput.steer >= -1 && aiInput.steer <= 1, "AI-styring skal være normaliseret");
assert.equal(typeof aiInput.accelerate, "boolean");
assert.ok(circularDistance(0, Math.PI * 2 - 0.02) < 0.03, "Vinkelafstand skal håndtere 0/2π-overgang");

console.log("Kart-test: bane, fysik, checkpoints, AI og items bestået");
