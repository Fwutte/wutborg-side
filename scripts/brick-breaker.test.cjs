const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "brick-breaker.html"), "utf8");

const levelsMatch = source.match(/this\.levels = (\[[\s\S]*?\n        \]);/);
assert.ok(levelsMatch, "Neon Breakers banedata skal kunne findes");
const levels = vm.runInNewContext(`(${levelsMatch[1]})`);
assert.equal(levels.length, 14, "Neon Breaker skal have 14 baner efter udvidelsen");

levels.forEach((level, levelIndex) => {
  assert.ok(level.length >= 6, `Bane ${levelIndex + 1} skal have mindst seks rÃ¦kker`);
  level.forEach((row) => {
    assert.equal(row.length, 14, `Alle rÃ¦kker pÃ¥ bane ${levelIndex + 1} skal have 14 kolonner`);
    assert.match(row, /^[0123ME]+$/, `Bane ${levelIndex + 1} indeholder et ukendt bloktegn`);
  });
  assert.ok(level.some((row) => /[123E]/.test(row)), `Bane ${levelIndex + 1} skal have blokke, der kan ryddes`);
});
assert.ok(levels.slice(4).every((level) => level.some((row) => row.includes("E"))), "Alle ti nye baner skal bruge eksplosionsblokke");

const classStart = source.indexOf("class NeonBreaker");
const classEnd = source.indexOf("window.NeonBreaker = NeonBreaker;");
assert.ok(classStart >= 0 && classEnd > classStart, "NeonBreaker-klassen skal eksporteres til test");

let now = 1000;
const sandbox = {
  performance: { now: () => now },
  Math,
  Set,
};
vm.runInNewContext(`${source.slice(classStart, classEnd)}\nthis.NeonBreaker = NeonBreaker;`, sandbox);
const NeonBreaker = sandbox.NeonBreaker;

const laserGame = Object.create(NeonBreaker.prototype);
laserGame.state = "playing";
laserGame.width = 960;
laserGame.basePaddleWidth = 126;
laserGame.throughUntil = 0;
laserGame.bullets = [];
laserGame.paddle = {
  x: 200,
  y: 570,
  width: 126,
  sizeMode: "normal",
  sizeUntil: 0,
  catchUntil: 0,
  laserUntil: 12000,
  laserCooldown: 1,
};

laserGame.updateEffects(0.99);
assert.equal(laserGame.bullets.length, 0, "Laseren mÃ¥ ikke skyde fÃ¸r det fÃ¸rste sekund");
laserGame.updateEffects(0.01);
assert.equal(laserGame.bullets.length, 2, "Laseren skal affyre Ã©t dobbeltskud efter et sekund");
laserGame.updateEffects(1);
assert.equal(laserGame.bullets.length, 4, "Laseren skal fortsÃ¦tte med Ã©t dobbeltskud pr. sekund");
now = 12001;
laserGame.updateEffects(1);
assert.equal(laserGame.bullets.length, 4, "Laseren skal stoppe, nÃ¥r power-up'en udlÃ¸ber");
assert.equal(laserGame.paddle.laserUntil, 0, "UdlÃ¸bet laserstatus skal nulstilles");

const speedGame = Object.create(NeonBreaker.prototype);
speedGame.maxBallSpeed = 760;
speedGame.levelIndex = 0;
assert.equal(speedGame.levelSpeed(), 390, "FÃ¸rste bane skal bevare den rolige starthastighed");
speedGame.levelIndex = 13;
assert.equal(speedGame.levelSpeed(), 754, "Farten skal stige jÃ¦vnt gennem alle 14 baner");

const explosionGame = Object.create(NeonBreaker.prototype);
explosionGame.levelIndex = 0;
explosionGame.score = 0;
explosionGame.flash = 0;
explosionGame.shake = 0;
explosionGame.spawnParticles = () => {};
const origin = { x: 0, y: 0, width: 60, height: 22, active: false, explosive: true, scoreValue: 260 };
const neighbour = { x: 65, y: 0, width: 60, height: 22, active: true, explosive: false, solid: false, scoreValue: 100 };
const metal = { x: 0, y: 27, width: 60, height: 22, active: true, explosive: false, solid: true, scoreValue: 0 };
const distant = { x: 260, y: 120, width: 60, height: 22, active: true, explosive: false, solid: false, scoreValue: 100 };
explosionGame.bricks = [origin, neighbour, metal, distant];
explosionGame.detonateBrick(origin);
assert.equal(neighbour.active, false, "Eksplosionsblokke skal rydde naboblokke");
assert.equal(metal.active, false, "Eksplosioner skal kunne fjerne ellers uknuselige blokke som i DX-Ball");
assert.equal(distant.active, true, "Eksplosionen mÃ¥ ikke rydde fjerne blokke");

assert.doesNotMatch(source, /tryFireLaser|KeyF/, "Laseren skal ikke lÃ¦ngere krÃ¦ve manuel affyring");
assert.match(source, /laserCooldown \+= 1/, "Den automatiske laser skal bruge en prÃ¦cis et-sekunds kadence");

console.log("Neon Breaker-test: 14 baner, DX-Ball-blokke, progression og automatisk laser bestÃ¥et");
