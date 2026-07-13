const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const campaignSource = fs.readFileSync(path.join(root, "js", "pips-skybound-data.js"), "utf8");
const source = fs.readFileSync(path.join(root, "js", "pips-skybound.js"), "utf8");
const browserWindow = {
  addEventListener() {},
};

const sandbox = {
  window: browserWindow,
  console,
};
vm.runInNewContext(campaignSource, sandbox);
vm.runInNewContext(source, sandbox);

const game = browserWindow.PipsSkybound;
assert.ok(game, "Spillets test-API skal eksporteres");
assert.deepEqual(
  { ...game.constants },
  {
    VIEW_WIDTH: 864,
    VIEW_HEIGHT: 648,
    TILE: 48,
    FIXED_STEP: 1 / 60,
    MAX_STEPS_PER_FRAME: 15,
  },
  "Viewport og tiles skal bevare det faste 3× pixelgrid"
);
assert.ok(
  game.constants.FIXED_STEP * game.constants.MAX_STEPS_PER_FRAME >= 0.25,
  "Fixed-step-loopet skal kunne indhente et 250 ms frame"
);

const allowedSymbols = new Set([".", "X", "?", "M", "I", "S", "L", "B", "R", "^"]);
const allowedEntities = new Set([
  "player",
  "coin",
  "goomba",
  "koopa",
  "buzzy",
  "flyer",
  "piranha",
  "swimmer",
  "boss",
  "pipe",
  "checkpoint",
  "finish",
]);

assert.equal(game.LEVEL_DEFINITIONS.length, 32, "Den komplette kampagne skal have 32 baner");
assert.equal(browserWindow.PipsSkyboundCampaign.worlds.length, 8, "Kampagnen skal have otte verdener");

game.LEVEL_DEFINITIONS.forEach((level, index) => {
  assert.equal(level.map.length, 14, `Bane ${index + 1} skal være 14 tiles høj`);
  level.map.forEach((row) => {
    assert.ok(row.length >= 78, `Bane ${index + 1} skal have en reel sidescroll-bredde`);
    Array.from(row).forEach((symbol) => {
      assert.ok(allowedSymbols.has(symbol), `Bane ${index + 1} bruger ukendt symbol: ${symbol}`);
    });
  });

  assert.equal(level.id, `${Math.floor(index / 4) + 1}-${(index % 4) + 1}`);
  assert.equal(level.entities.filter((entity) => entity.type === "player").length, 1);
  assert.equal(level.entities.filter((entity) => entity.type === "finish").length, 1);
  assert.ok(level.entities.some((entity) => entity.type === "coin"), `Bane ${index + 1} mangler mønter`);
  assert.ok(level.entities.some((entity) => entity.type === "goomba" || entity.type === "koopa"), `Bane ${index + 1} mangler kernefjender`);
  level.entities.forEach((entity) => {
    assert.ok(allowedEntities.has(entity.type), `Bane ${index + 1} bruger ukendt entity: ${entity.type}`);
    assert.ok(entity.x >= 0 && entity.x < level.map[0].length, `Entity uden for bane ${index + 1}`);
  });
  if (level.stage !== 4) {
    assert.equal(level.subareas.length, 1, `Bane ${index + 1} skal have ét bonusrum`);
    assert.equal(level.subareas[0].entities.filter((entity) => entity.type === "finish" && entity.exit).length, 1);
    assert.equal(level.entities.filter((entity) => entity.type === "pipe").length, 1);
  } else {
    assert.equal(level.entities.filter((entity) => entity.type === "boss").length, 1, `Slot ${index + 1} mangler boss`);
  }
});

const campaignSymbols = game.LEVEL_DEFINITIONS.map((level) => level.map.join("")).join("");
["M", "I", "S", "L"].forEach((symbol) => {
  assert.ok(campaignSymbols.includes(symbol), `Kampagnen mangler power-up-blok: ${symbol}`);
});

const generated = game.createMap(4, 3, (map) => {
  map.line(0, 3, 2, "X");
  map.set(1, 1, "P");
});
assert.deepEqual(Array.from(generated), ["....", ".P..", "XXXX"]);

const { Camera, Game, TileMap } = game.testHooks;
const camera = new Camera();
camera.reset(10);
assert.equal(camera.x, 9, "Kameraet skal snappe til 3 px-grid ved reset");
camera.update({ x: 500, w: 34 }, 4000);
const cameraAfterForwardMove = camera.x;
assert.equal(cameraAfterForwardMove % 3, 0, "Kameraet skal blive på 3 px-grid");
camera.update({ x: 100, w: 34 }, 4000);
assert.equal(camera.x, cameraAfterForwardMove, "Kameraet må ikke scrolle tilbage");

let questionCoins = 0;
const tileGame = {
  audio: { play() {} },
  level: { powerUps: [] },
  showToast() {},
  collectCoin() {
    questionCoins += 1;
  },
  addScore() {},
  addParticle() {},
};
const tileMap = new TileMap(
  {
    map: ["......", ".MISL?", "XXXXXX"],
  },
  tileGame
);
tileMap.hitBlock(1, 1, { powered: false });
tileMap.hitBlock(1, 1, { powered: false });
tileMap.hitBlock(2, 1, { powered: true });
tileMap.hitBlock(3, 1, { powered: false });
tileMap.hitBlock(4, 1, { powered: false });
tileMap.hitBlock(5, 1, { powered: false });
tileMap.hitBlock(5, 1, { powered: false });
assert.equal(tileGame.level.powerUps.length, 4, "Power-up-blokke må kun udløse ét item hver");
assert.equal(questionCoins, 1, "En ?-blok må kun udløse én mønt");
assert.deepEqual(
  Array.from(tileGame.level.powerUps, (powerUp) => powerUp.type),
  ["mushroom", "flower", "star", "life"],
  "Power-up-blokke skal have deres korrekte indhold"
);

const restartGame = Object.create(Game.prototype);
restartGame.levelIndex = 1;
restartGame.lives = 2;
restartGame.coins = 37;
restartGame.totalCoins = 58;
restartGame.score = 9400;
restartGame.levelStartSnapshot = {
  lives: 3,
  coins: 12,
  totalCoins: 24,
  score: 3600,
};
restartGame.loadLevel = (levelIndex) => {
  restartGame.loadedLevel = levelIndex;
};
restartGame.beginLevelIntro = () => {
  restartGame.introStarted = true;
};
restartGame.restartCurrentLevel();
assert.equal(restartGame.lives, 2, "Genstart må ikke give tabte liv tilbage");
assert.equal(restartGame.coins, 12, "Genstart skal gendanne banens møntsnapshot");
assert.equal(restartGame.totalCoins, 24, "Genstart skal fjerne farmede mønter");
assert.equal(restartGame.score, 3600, "Genstart skal fjerne farmet score");
assert.equal(restartGame.loadedLevel, 1, "Genstart skal indlæse den aktuelle bane");
assert.equal(restartGame.introStarted, true, "Genstart skal vise baneintroen");

const campaignGame = Object.create(Game.prototype);
campaignGame.levelIndex = 0;
campaignGame.score = 2200;
campaignGame.progress = { unlocked: 0, completed: [], bestScores: {} };
campaignGame.saveProgress = () => {
  campaignGame.saved = true;
};
campaignGame.unlockLevel(1);
assert.equal(campaignGame.progress.unlocked, 1, "Næste bane skal låses op efter gennemførsel");
assert.deepEqual(campaignGame.progress.completed, ["1-1"], "Gennemført bane skal gemmes");
assert.equal(campaignGame.progress.bestScores["1-1"], 2200, "Bedste score skal gemmes pr. bane");
assert.equal(campaignGame.saved, true, "Kampagnefremdrift skal gemmes");

console.log("Mario-test: kampagne, power-ups, kamera, blokke, genstart og progression bestået");
