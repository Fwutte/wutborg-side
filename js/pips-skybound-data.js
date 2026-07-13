(() => {
  "use strict";

  const HEIGHT = 14;

  const createGrid = (width) => Array.from({ length: HEIGHT }, () => Array(width).fill("."));
  const set = (grid, x, y, symbol) => {
    if (x >= 0 && x < grid[0].length && y >= 0 && y < grid.length) grid[y][x] = symbol;
  };
  const line = (grid, from, to, y, symbol) => {
    for (let x = from; x <= to; x += 1) set(grid, x, y, symbol);
  };
  const rect = (grid, x, y, width, height, symbol) => {
    for (let row = y; row < y + height; row += 1) line(grid, x, x + width - 1, row, symbol);
  };

  const WORLDS = [
    {
      name: "Grønsvamperiget",
      palette: { skyTop: "#5c94fc", skyBottom: "#5c94fc", hillFar: "#80d010", hillNear: "#00a800", dirt: "#a9623d", grass: "#00a800" },
      biome: "overworld",
    },
    {
      name: "Stenrørene",
      palette: { skyTop: "#3f64b8", skyBottom: "#3f64b8", hillFar: "#6b8fbf", hillNear: "#3f5f91", dirt: "#73554a", grass: "#4ca76e" },
      biome: "underground",
    },
    {
      name: "Skybroerne",
      palette: { skyTop: "#5c94fc", skyBottom: "#5c94fc", hillFar: "#d2eaff", hillNear: "#89bff2", dirt: "#7d6b58", grass: "#53a8d8" },
      biome: "athletic",
    },
    {
      name: "Skumringsskoven",
      palette: { skyTop: "#253b78", skyBottom: "#253b78", hillFar: "#4b5d9f", hillNear: "#263c77", dirt: "#69483f", grass: "#517b59" },
      biome: "night",
    },
    {
      name: "Tågetundraen",
      palette: { skyTop: "#6e9bd8", skyBottom: "#6e9bd8", hillFar: "#c7dbef", hillNear: "#8daeca", dirt: "#6d6a71", grass: "#d8e8f2" },
      biome: "snow",
    },
    {
      name: "Koralhavet",
      palette: { skyTop: "#367cc9", skyBottom: "#367cc9", hillFar: "#6fb6df", hillNear: "#2c6aab", dirt: "#8a644c", grass: "#52b8b0" },
      biome: "water",
    },
    {
      name: "Måneklipperne",
      palette: { skyTop: "#30295d", skyBottom: "#30295d", hillFar: "#725e9c", hillNear: "#45386f", dirt: "#594049", grass: "#966f9e" },
      biome: "night",
    },
    {
      name: "Ildslottet",
      palette: { skyTop: "#21152f", skyBottom: "#21152f", hillFar: "#65384a", hillNear: "#3c2030", dirt: "#623b36", grass: "#cc633d" },
      biome: "castle",
    },
  ];

  const ENEMY_TYPES = ["goomba", "koopa", "buzzy", "flyer"];

  function buildBonusRoom(worldIndex, stage, id) {
    const width = 30;
    const grid = createGrid(width);
    const entities = [
      { type: "player", x: 2, y: 10 },
      { type: "finish", x: width - 4, y: 9, exit: true },
    ];
    rect(grid, 0, 11, width, 3, "X");
    line(grid, 7, 12, 8, "X");
    line(grid, 17, 22, 7, "X");
    for (let x = 5; x < width - 5; x += 2) {
      entities.push({ type: "coin", x, y: x < 15 ? 7 : 6 });
    }
    set(grid, 10, 6, "S");
    set(grid, 20, 5, stage % 2 ? "I" : "L");
    return {
      id,
      name: "Bonusrum",
      time: 80,
      palette: WORLDS[worldIndex].palette,
      biome: "bonus",
      map: grid.map((row) => row.join("")),
      entities,
      isSubarea: true,
    };
  }

  function buildLevel(worldIndex, stage) {
    const world = WORLDS[worldIndex];
    const seed = (worldIndex + 2) * 29 + stage * 17;
    const width = 78 + worldIndex * 3 + stage * 4;
    const grid = createGrid(width);
    const entities = [];
    const subareas = [];
    const add = (type, x, y, extra = {}) => entities.push({ type, x, y, ...extra });
    const groundTop = 11;

    rect(grid, 0, groundTop, width, 3, "X");
    add("player", 2, 10);

    const gapCount = stage === 1 ? 2 : stage === 2 ? 3 : 4;
    for (let index = 0; index < gapCount; index += 1) {
      const gapStart = 18 + index * Math.floor((width - 34) / gapCount) + ((seed + index * 3) % 4);
      const gapWidth = 2 + ((seed + index) % (stage === 4 ? 2 : 1));
      rect(grid, gapStart, groundTop, gapWidth, 3, ".");
      line(grid, gapStart - 1, gapStart + gapWidth, 9 - (index % 2), "X");
      for (let coin = 0; coin < gapWidth + 1; coin += 1) add("coin", gapStart - 1 + coin, 7 - (index % 2));
    }

    const platformStep = 10 + (seed % 3);
    for (let x = 8; x < width - 11; x += platformStep) {
      const platformY = 7 + ((x + seed) % 3);
      const platformWidth = 4 + ((x + stage) % 3);
      line(grid, x, Math.min(width - 5, x + platformWidth), platformY, "X");
      for (let coin = 0; coin < platformWidth; coin += 1) add("coin", x + coin, platformY - 1);

      const blockX = x + 1 + ((seed + x) % Math.max(1, platformWidth - 1));
      const powerBlocks = ["?", "M", "I", "S", "L"];
      set(grid, blockX, platformY - 2, powerBlocks[(seed + x + stage) % powerBlocks.length]);
      if ((x + worldIndex) % 4 === 0) set(grid, blockX + 1, platformY - 2, "B");
    }

    for (let x = 13; x < width - 14; x += 13 + ((seed + x) % 4)) {
      const type = ENEMY_TYPES[(worldIndex + stage + Math.floor(x / 6)) % ENEMY_TYPES.length];
      add(type, x, 10);
      if (type === "koopa" && stage > 1) add("coin", x + 1, 8);
    }

    for (let index = 0; index < 2; index += 1) {
      const pipeX = 26 + index * Math.floor((width - 44) / 2) + ((seed + index) % 3);
      rect(grid, pipeX, 9, 2, 2, "R");
      if (index === 0 && stage !== 4) {
        const target = `bonus-${worldIndex + 1}-${stage}`;
        subareas.push(buildBonusRoom(worldIndex, stage, target));
        add("pipe", pipeX, 9, { target });
      }
      if (stage > 1 && index === 1) add("piranha", pipeX, 8, { range: 1 + (stage % 2) });
    }

    if (stage >= 2) add("checkpoint", Math.floor(width * 0.53), 10);

    if (world.biome === "water") {
      for (let x = 20; x < width - 12; x += 17) add("swimmer", x, 7 + ((x + seed) % 3));
    }

    if (stage === 4) {
      const bossX = width - 12;
      add("boss", bossX, 9, { hits: 3 + Math.floor(worldIndex / 3) });
      for (let x = bossX - 6; x < bossX - 1; x += 1) set(grid, x, 10, "^");
    }

    add("finish", width - 4, 9, { castle: stage === 4 });

    return {
      id: `${worldIndex + 1}-${stage}`,
      world: worldIndex + 1,
      stage,
      name: `${world.name} ${stage}-${stage}`,
      subtitle: `${world.name}: bane ${stage} af 4.`,
      time: 165 + worldIndex * 8 + stage * 12,
      palette: world.palette,
      biome: world.biome,
      map: grid.map((row) => row.join("")),
      entities,
      subareas,
      unlockAfter: worldIndex * 4 + stage - 1,
    };
  }

  const levels = [];
  WORLDS.forEach((world, worldIndex) => {
    for (let stage = 1; stage <= 4; stage += 1) levels.push(buildLevel(worldIndex, stage));
  });

  window.PipsSkyboundCampaign = {
    worlds: WORLDS,
    levels,
    buildLevel,
  };
})();
