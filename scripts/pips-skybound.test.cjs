const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "pips-skybound.js"), "utf8");
const browserWindow = {
  addEventListener() {},
};

vm.runInNewContext(source, {
  window: browserWindow,
  console,
});

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

const expectedWidths = [82, 94, 108];
const expectedEnemies = [5, 7, 10];
const expectedMushroomBlocks = [1, 1, 2];
const allowedSymbols = new Set([".", "X", "?", "M", "B", "R", "P", "C", "E", "K", "F", "^"]);

game.LEVEL_DEFINITIONS.forEach((level, index) => {
  assert.equal(level.map.length, 14, `Bane ${index + 1} skal være 14 tiles høj`);
  level.map.forEach((row) => {
    assert.equal(row.length, expectedWidths[index], `Bane ${index + 1} har en forkert rækkelængde`);
    Array.from(row).forEach((symbol) => {
      assert.ok(allowedSymbols.has(symbol), `Bane ${index + 1} bruger ukendt symbol: ${symbol}`);
    });
  });

  const symbols = level.map.join("");
  const count = (symbol) => Array.from(symbols).filter((item) => item === symbol).length;
  assert.equal(count("P"), 1, `Bane ${index + 1} skal have præcis ét startpunkt`);
  assert.equal(count("F"), 1, `Bane ${index + 1} skal have præcis ét mål`);
  assert.equal(count("E"), expectedEnemies[index], `Bane ${index + 1} har mistet en fjende`);
  assert.equal(
    count("M"),
    expectedMushroomBlocks[index],
    `Bane ${index + 1} skal have authored svampeblokke`
  );
  assert.equal(count("U"), 0, `Bane ${index + 1} må ikke have fritsvævende svampe`);
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
    map: ["....", ".M?.", "XXXX"],
  },
  tileGame
);
tileMap.hitBlock(1, 1, { powered: false });
tileMap.hitBlock(1, 1, { powered: false });
tileMap.hitBlock(2, 1, { powered: false });
tileMap.hitBlock(2, 1, { powered: false });
assert.equal(tileGame.level.powerUps.length, 1, "En M-blok må kun udløse én svamp");
assert.equal(questionCoins, 1, "En ?-blok må kun udløse én mønt");

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

console.log("Mario-test: viewport, kamera, blokke, genstart og tre banekort bestået");
