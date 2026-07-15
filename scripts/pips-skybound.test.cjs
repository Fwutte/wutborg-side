const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const campaignSource = fs.readFileSync(path.join(root, "js", "pips-skybound-data.js"), "utf8");
const source = fs.readFileSync(path.join(root, "js", "pips-skybound.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "pips-skybound.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "css", "pips-skybound.css"), "utf8");
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

const allowedSymbols = new Set([".", "X", "?", "M", "I", "S", "L", "T", "B", "R", "^"]);
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
["M", "I", "S", "L", "T"].forEach((symbol) => {
  assert.ok(campaignSymbols.includes(symbol), `Kampagnen mangler power-up-blok: ${symbol}`);
});

const firstWorldGaps = game.LEVEL_DEFINITIONS.slice(0, 4).map((level) => {
  let runs = 0;
  let inGap = false;
  for (const symbol of level.map[11]) {
    if (symbol === "." && !inGap) runs += 1;
    inGap = symbol === ".";
  }
  return runs;
});
assert.deepEqual(Array.from(firstWorldGaps), [1, 1, 2, 3], "Verden 1 skal introducere huller gradvist");
game.LEVEL_DEFINITIONS.slice(0, 2).forEach((level) => {
  level.map[11].split("").forEach((symbol, column) => {
    if (symbol !== ".") return;
    assert.equal(level.map[9][column], ".", "Tidlige huller mÃ¥ ikke have lavt loft");
    assert.equal(level.map[10][column], ".", "Tidlige huller mÃ¥ ikke have lavt loft");
  });
});
assert.equal(
  game.LEVEL_DEFINITIONS[1].entities.some((entity) => entity.type === "piranha"),
  false,
  "1-2 skal ikke kombinere de fÃ¸rste huller med en piranha"
);

const generated = game.createMap(4, 3, (map) => {
  map.line(0, 3, 2, "X");
  map.set(1, 1, "P");
});
assert.deepEqual(Array.from(generated), ["....", ".P..", "XXXX"]);

const { Camera, Enemy, Game, Player, TileMap, touchesFinishPole } = game.testHooks;
assert.equal(
  touchesFinishPole({ x: 3700, y: 120, w: 34, h: 44 }, { x: 3720, y: 408, w: 45, h: 120 }),
  true,
  "Et spring ind i flagstangen skal afslutte banen uanset hÃ¸jde"
);
assert.equal(
  touchesFinishPole({ x: 3800, y: 120, w: 34, h: 44 }, { x: 3720, y: 408, w: 45, h: 120 }),
  false,
  "Flagstangen mÃ¥ ikke afslutte banen, efter Mario er passeret"
);
const camera = new Camera();
camera.reset(10);
assert.equal(camera.x, 9, "Kameraet skal snappe til 3 px-grid ved reset");
camera.update({ x: 900, w: 34, vx: 300 }, 4000, 1);
const cameraAfterForwardMove = camera.x;
assert.equal(cameraAfterForwardMove % 3, 0, "Kameraet skal blive på 3 px-grid");
camera.update({ x: 100, w: 34, vx: -200 }, 4000, 1);
assert.ok(camera.x < cameraAfterForwardMove, "Mario World-kameraet skal kunne følge spilleren tilbage");

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
    map: [".......", ".MISLT?", "XXXXXXX"],
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
tileMap.hitBlock(6, 1, { powered: false });
tileMap.hitBlock(6, 1, { powered: false });
assert.equal(tileGame.level.powerUps.length, 5, "Power-up-blokke må kun udløse ét item hver");
assert.equal(questionCoins, 1, "En ?-blok må kun udløse én mønt");
assert.deepEqual(
  Array.from(tileGame.level.powerUps, (powerUp) => powerUp.type),
  ["mushroom", "flower", "star", "life", "feather"],
  "Power-up-blokke skal have deres korrekte indhold"
);

const worldPlayer = new Player(0, 0);
worldPlayer.grounded = true;
worldPlayer.grantCape();
assert.equal(worldPlayer.cape, true, "Kappefjeren skal aktivere Marios kappe");
worldPlayer.update(1 / 60, {
  axis: 0,
  run: false,
  down: false,
  jump: false,
  jumpPressed: false,
  jumpReleased: false,
  spinPressed: true,
}, { worldWidth: 2000, resolveHorizontal: () => false, resolveVertical: () => false }, { play() {} });
assert.equal(worldPlayer.spinJumping, true, "Spinhop skal kunne startes fra jorden");
assert.ok(worldPlayer.vy < 0, "Spinhoppet skal sende Mario opad");

const koopaEnemy = new Enemy(0, 0, "koopa");
const firstKoopaStomp = koopaEnemy.stomp(-50);
assert.equal(firstKoopaStomp.defeated, false, "Et Koopa-hop skal fÃ¸rst efterlade et skjold");
assert.equal(koopaEnemy.shell, true, "Koopaen skal trÃ¦kke sig ind i skjoldet");
assert.equal(koopaEnemy.vx, 0, "Et nyt skjold skal ligge stille");
koopaEnemy.stomp(-50);
assert.ok(koopaEnemy.vx > 300, "Skjoldet skal sparkes vÃ¦k fra Mario");

const buzzyEnemy = new Enemy(0, 0, "buzzy");
buzzyEnemy.stomp(100);
assert.equal(buzzyEnemy.shell, true, "Buzzy Beetle skal ogsÃ¥ blive til et skjold");

const flyerEnemy = new Enemy(0, 0, "flyer");
flyerEnemy.stomp(0);
assert.equal(flyerEnemy.winged, false, "FÃ¸rste hop pÃ¥ en bevinget Koopa skal fjerne vingerne");
assert.equal(flyerEnemy.airborne, false, "Koopaen skal falde ned efter at have mistet vingerne");
assert.equal(flyerEnemy.shell, false, "Den bevingede Koopa skal ikke gÃ¥ direkte i skjoldet");

const piranhaEnemy = new Enemy(96, 384, "piranha", { range: 2 });
piranhaEnemy.awake = true;
piranhaEnemy.piranhaClock = 3.4;
piranhaEnemy.update(1 / 60, { worldWidth: 2000 }, 0, { x: piranhaEnemy.x, w: 34 });
assert.equal(piranhaEnemy.piranhaClock, 3.4, "RÃ¸rplanten skal vente i rÃ¸ret, mens Mario er tÃ¦t pÃ¥");
assert.equal(piranhaEnemy.hidden, true, "En ventende rÃ¸rplante skal vÃ¦re ufarlig og skjult");

assert.match(htmlSource, /data-control="spin"/, "Telefonstyringen skal have en særskilt spinhopknap");
assert.match(htmlSource, /viewport-fit=cover/, "Mobilvisningen skal respektere telefonens safe areas");
assert.match(cssSource, /height:\s*100dvh/, "Mobilspillet skal kunne bruge hele telefonhøjden");
assert.match(cssSource, /\.touch-actions/, "Telefonstyringen skal have en ergonomisk handlingsgruppe");
assert.match(cssSource, /max-width:\s*900px[^}]*orientation:\s*landscape/s, "Brede telefoner skal bruge landskabskontroller");

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
