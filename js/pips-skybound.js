(() => {
  "use strict";

  const VIEW_WIDTH = 1152;
  const VIEW_HEIGHT = 648;
  const TILE = 48;
  const GRAVITY = 1850;
  const MAX_FALL_SPEED = 920;
  const TOTAL_LEVELS = 3;

  const SPRITE_RECTS = {
    marioSmall: { x: 2, y: 8, w: 16, h: 16 },
    marioBig: { x: 2, y: 32, w: 16, h: 32 },
    goomba: { x: 0, y: 15, w: 16, h: 16 },
    goombaSquished: { x: 36, y: 15, w: 16, h: 16 },
    mushroom: { x: 0, y: 8, w: 16, h: 16 },
    coin: { x: 180, y: 34, w: 16, h: 16 },
    brick: { x: 180, y: 8, w: 16, h: 16 },
    usedBlock: { x: 216, y: 8, w: 16, h: 16 },
    questionBlock: { x: 586, y: 79, w: 16, h: 16 },
    ground: { x: 34, y: 16, w: 16, h: 16 },
    pipe: { x: 112, y: 624, w: 32, h: 64 },
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  class SpriteAtlas {
    constructor() {
      this.images = {
        players: this.load("assets/mario/mario-luigi-transparent.png"),
        enemies: this.load("assets/mario/enemies-bosses-transparent.png"),
        objects: this.load("assets/mario/items-objects-npcs-transparent.png"),
        tiles: this.load("assets/mario/tileset-transparent.png"),
      };
    }

    load(src) {
      const image = new Image();
      image.src = src;
      return image;
    }

    isReady(name) {
      const image = this.images[name];
      return Boolean(image?.complete && image.naturalWidth);
    }

    draw(ctx, name, rect, dx, dy, dw, dh, flipX = false) {
      if (!this.isReady(name)) return false;
      const image = this.images[name];
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (flipX) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, dw, dh);
      } else {
        ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
      }
      ctx.restore();
      return true;
    }
  }

  function createMap(width, height, build) {
    const grid = Array.from({ length: height }, () => Array(width).fill("."));
    const api = {
      set(x, y, symbol) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          grid[y][x] = symbol;
        }
      },
      line(x1, x2, y, symbol) {
        for (let x = x1; x <= x2; x += 1) this.set(x, y, symbol);
      },
      rect(x, y, w, h, symbol) {
        for (let row = y; row < y + h; row += 1) {
          this.line(x, x + w - 1, row, symbol);
        }
      },
      clear(x, y, w, h) {
        this.rect(x, y, w, h, ".");
      },
    };

    build(api);
    return grid.map((row) => row.join(""));
  }

  function addGround(map, width) {
    map.rect(0, 11, width, 3, "X");
  }

  const LEVEL_DEFINITIONS = [
    {
      name: "Kløverengen",
      subtitle: "Lær Marios bevægelser på den solrige eng.",
      time: 170,
      palette: {
        skyTop: "#65cbed",
        skyBottom: "#dcf7dc",
        hillFar: "#82cda0",
        hillNear: "#4fad73",
        dirt: "#a9623d",
        grass: "#65c767",
      },
      map: createMap(82, 14, (m) => {
        addGround(m, 82);
        m.clear(18, 11, 3, 3);
        m.clear(40, 11, 3, 3);
        m.clear(63, 11, 3, 3);

        m.set(2, 10, "P");
        m.line(7, 12, 8, "X");
        m.line(23, 28, 7, "X");
        m.line(32, 36, 9, "X");
        m.line(46, 51, 8, "X");
        m.line(55, 60, 6, "X");
        m.line(68, 73, 8, "X");

        m.line(8, 11, 7, "C");
        m.set(13, 9, "?");
        m.set(15, 9, "B");
        m.set(16, 9, "?");
        m.line(23, 27, 6, "C");
        m.set(29, 9, "?");
        m.rect(34, 9, 2, 2, "R");
        m.line(46, 50, 7, "C");
        m.set(52, 9, "?");
        m.line(56, 59, 5, "C");
        m.set(58, 4, "U");
        m.set(69, 7, "?");
        m.line(70, 73, 7, "C");

        m.set(14, 10, "E");
        m.set(30, 10, "E");
        m.set(38, 10, "E");
        m.set(53, 10, "E");
        m.set(71, 7, "E");
        m.set(38, 10, "K");
        m.set(79, 9, "F");
      }),
    },
    {
      name: "Vindbroerne",
      subtitle: "Kryds høje broer og pas på de lange fald.",
      time: 190,
      palette: {
        skyTop: "#58b8eb",
        skyBottom: "#eef8ff",
        hillFar: "#9bb5d5",
        hillNear: "#657fa8",
        dirt: "#8a674e",
        grass: "#56b99c",
      },
      map: createMap(94, 14, (m) => {
        addGround(m, 94);
        m.clear(14, 11, 5, 3);
        m.clear(31, 11, 4, 3);
        m.clear(50, 11, 6, 3);
        m.clear(72, 11, 5, 3);

        m.set(2, 10, "P");
        m.line(8, 12, 8, "X");
        m.line(15, 18, 9, "X");
        m.line(22, 27, 7, "X");
        m.line(31, 35, 8, "X");
        m.line(39, 45, 6, "X");
        m.line(50, 55, 9, "X");
        m.line(59, 65, 7, "X");
        m.line(71, 76, 8, "X");
        m.line(81, 87, 6, "X");

        m.line(8, 12, 7, "C");
        m.line(15, 18, 8, "C");
        m.set(20, 9, "?");
        m.line(23, 26, 6, "C");
        m.set(28, 8, "B");
        m.line(31, 35, 7, "C");
        m.set(37, 9, "?");
        m.line(40, 44, 5, "C");
        m.set(43, 4, "U");
        m.line(51, 54, 8, "C");
        m.set(57, 9, "?");
        m.line(60, 64, 6, "C");
        m.line(72, 75, 7, "C");
        m.set(78, 9, "?");
        m.line(82, 86, 5, "C");

        m.set(12, 10, "E");
        m.set(24, 6, "E");
        m.set(39, 10, "E");
        m.set(53, 8, "E");
        m.set(62, 6, "E");
        m.set(69, 10, "E");
        m.set(84, 5, "E");
        m.set(46, 10, "K");
        m.rect(67, 9, 2, 2, "R");
        m.set(91, 9, "F");
      }),
    },
    {
      name: "Solruinerne",
      subtitle: "Den sidste vej går gennem glødende gamle ruiner.",
      time: 215,
      palette: {
        skyTop: "#7c7bd2",
        skyBottom: "#ffc782",
        hillFar: "#a76878",
        hillNear: "#73536f",
        dirt: "#84513f",
        grass: "#e4a54d",
      },
      map: createMap(108, 14, (m) => {
        addGround(m, 108);
        m.clear(17, 11, 4, 3);
        m.clear(36, 11, 5, 3);
        m.clear(58, 11, 5, 3);
        m.clear(79, 11, 4, 3);
        m.clear(96, 11, 5, 3);

        m.set(2, 10, "P");
        m.line(9, 14, 8, "X");
        m.line(17, 20, 9, "X");
        m.line(24, 30, 7, "X");
        m.line(36, 40, 8, "X");
        m.line(44, 50, 6, "X");
        m.line(57, 62, 8, "X");
        m.line(66, 72, 6, "X");
        m.line(78, 82, 8, "X");
        m.line(86, 92, 6, "X");
        m.line(97, 100, 8, "X");

        m.line(9, 13, 7, "C");
        m.set(15, 9, "?");
        m.line(17, 20, 8, "C");
        m.set(22, 9, "B");
        m.line(25, 29, 6, "C");
        m.set(32, 9, "?");
        m.line(36, 40, 7, "C");
        m.line(45, 49, 5, "C");
        m.set(48, 4, "U");
        m.set(53, 9, "?");
        m.line(58, 61, 7, "C");
        m.line(67, 71, 5, "C");
        m.set(74, 9, "B");
        m.line(78, 82, 7, "C");
        m.set(84, 9, "?");
        m.line(87, 91, 5, "C");
        m.set(90, 4, "U");
        m.line(97, 100, 7, "C");

        m.set(13, 10, "E");
        m.set(26, 6, "E");
        m.set(34, 10, "E");
        m.set(46, 5, "E");
        m.set(55, 10, "E");
        m.set(60, 7, "E");
        m.set(69, 5, "E");
        m.set(76, 10, "E");
        m.set(89, 5, "E");
        m.set(103, 10, "E");
        m.set(52, 10, "K");
        m.rect(93, 9, 2, 2, "R");
        m.set(105, 9, "F");

        m.set(6, 10, "^");
        m.set(43, 10, "^");
        m.set(64, 10, "^");
        m.set(85, 10, "^");
      }),
    },
  ];

  class InputManager {
    constructor() {
      this.left = false;
      this.right = false;
      this.jump = false;
      this.jumpPressed = false;
      this.jumpReleased = false;
      this.pausePressed = false;
      this.keyMap = new Map();
      this.touchButtons = Array.from(document.querySelectorAll("[data-control]"));
      this.bindKeyboard();
      this.bindTouch();
    }

    bindKeyboard() {
      const movementKeys = new Set([
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "KeyA",
        "KeyD",
        "KeyW",
        "Space",
      ]);

      window.addEventListener("keydown", (event) => {
        if (movementKeys.has(event.code)) event.preventDefault();
        if (event.repeat && ["Escape", "KeyP"].includes(event.code)) return;

        if (["ArrowLeft", "KeyA"].includes(event.code)) this.left = true;
        if (["ArrowRight", "KeyD"].includes(event.code)) this.right = true;
        if (["ArrowUp", "KeyW", "Space"].includes(event.code)) {
          if (!this.jump) this.jumpPressed = true;
          this.jump = true;
        }
        if (["Escape", "KeyP"].includes(event.code)) this.pausePressed = true;
      });

      window.addEventListener("keyup", (event) => {
        if (["ArrowLeft", "KeyA"].includes(event.code)) this.left = false;
        if (["ArrowRight", "KeyD"].includes(event.code)) this.right = false;
        if (["ArrowUp", "KeyW", "Space"].includes(event.code)) {
          this.jump = false;
          this.jumpReleased = true;
        }
      });

      window.addEventListener("blur", () => this.releaseAll());
    }

    bindTouch() {
      const setControl = (button, active) => {
        const control = button.dataset.control;
        button.classList.toggle("active", active);
        if (control === "left") this.left = active;
        if (control === "right") this.right = active;
        if (control === "jump") {
          if (active && !this.jump) this.jumpPressed = true;
          if (!active && this.jump) this.jumpReleased = true;
          this.jump = active;
        }
      };

      this.touchButtons.forEach((button) => {
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          button.setPointerCapture?.(event.pointerId);
          setControl(button, true);
        });
        ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => {
          button.addEventListener(type, (event) => {
            event.preventDefault();
            setControl(button, false);
          });
        });
      });
    }

    get axis() {
      return (this.right ? 1 : 0) - (this.left ? 1 : 0);
    }

    endFrame() {
      this.jumpPressed = false;
      this.jumpReleased = false;
      this.pausePressed = false;
    }

    releaseAll() {
      this.left = false;
      this.right = false;
      this.jump = false;
      this.jumpReleased = true;
      this.touchButtons.forEach((button) => button.classList.remove("active"));
    }
  }

  class AudioManager {
    constructor() {
      this.context = null;
      this.muted = false;
    }

    ensureContext() {
      if (this.muted) return null;
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.context = new AudioContext();
      }
      if (this.context.state === "suspended") this.context.resume();
      return this.context;
    }

    tone(frequency, duration, type = "sine", volume = 0.08, delay = 0) {
      const context = this.ensureContext();
      if (!context) return;
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    }

    play(name) {
      if (this.muted) return;
      const sounds = {
        jump: () => {
          this.tone(410, 0.13, "square", 0.045);
          this.tone(610, 0.09, "square", 0.03, 0.05);
        },
        coin: () => {
          this.tone(880, 0.08, "sine", 0.07);
          this.tone(1320, 0.12, "sine", 0.05, 0.05);
        },
        bump: () => this.tone(150, 0.09, "square", 0.035),
        stomp: () => {
          this.tone(130, 0.09, "square", 0.06);
          this.tone(230, 0.11, "triangle", 0.035, 0.04);
        },
        power: () => {
          [523, 659, 784, 1047].forEach((note, index) => {
            this.tone(note, 0.16, "triangle", 0.05, index * 0.06);
          });
        },
        hurt: () => {
          this.tone(240, 0.2, "sawtooth", 0.045);
          this.tone(120, 0.28, "sawtooth", 0.04, 0.08);
        },
        checkpoint: () => {
          [440, 554, 659].forEach((note, index) => {
            this.tone(note, 0.18, "sine", 0.05, index * 0.08);
          });
        },
        complete: () => {
          [523, 659, 784, 1047, 1319].forEach((note, index) => {
            this.tone(note, 0.25, "triangle", 0.055, index * 0.1);
          });
        },
        gameOver: () => {
          [330, 247, 196, 147].forEach((note, index) => {
            this.tone(note, 0.35, "triangle", 0.045, index * 0.18);
          });
        },
      };
      sounds[name]?.();
    }

    toggle() {
      this.muted = !this.muted;
      if (!this.muted) this.ensureContext();
      return this.muted;
    }
  }

  class Camera {
    constructor() {
      this.x = 0;
      this.y = 0;
    }

    reset(x = 0) {
      this.x = Math.max(0, x);
      this.y = 0;
    }

    update(player, worldWidth, dt) {
      const lookAhead = player.vx * 0.34;
      const target = clamp(
        player.x + player.w / 2 - VIEW_WIDTH * 0.42 + lookAhead,
        0,
        Math.max(0, worldWidth - VIEW_WIDTH)
      );
      this.x = lerp(this.x, target, 1 - Math.pow(0.00008, dt));
    }
  }

  class Particle {
    constructor(x, y, color, options = {}) {
      this.x = x;
      this.y = y;
      this.vx = options.vx ?? (Math.random() - 0.5) * 220;
      this.vy = options.vy ?? -120 - Math.random() * 180;
      this.life = options.life ?? 0.65;
      this.maxLife = this.life;
      this.size = options.size ?? 7 + Math.random() * 7;
      this.color = color;
      this.gravity = options.gravity ?? 500;
      this.shape = options.shape ?? "square";
    }

    update(dt) {
      this.life -= dt;
      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return this.life > 0;
    }

    draw(ctx, camera) {
      const alpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.translate(this.x - camera.x, this.y - camera.y);
      ctx.rotate((1 - alpha) * 3);
      if (this.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      }
      ctx.restore();
    }
  }

  class Coin {
    constructor(x, y) {
      this.x = x + TILE / 2;
      this.y = y + TILE / 2;
      this.w = 24;
      this.h = 34;
      this.phase = Math.random() * Math.PI * 2;
      this.collected = false;
    }

    get rect() {
      return {
        x: this.x - this.w / 2,
        y: this.y - this.h / 2,
        w: this.w,
        h: this.h,
      };
    }

    update(dt) {
      this.phase += dt * 5.5;
    }

    draw(ctx, camera, sprites) {
      if (this.collected) return;
      const width = 8 + Math.abs(Math.cos(this.phase)) * 22;
      const x = this.x - camera.x - width / 2;
      const y = this.y - camera.y - 16 + Math.sin(this.phase * 0.7) * 3;
      sprites.draw(ctx, "objects", SPRITE_RECTS.coin, x, y, width, 30);
    }
  }

  class PowerUp {
    constructor(x, y, emerging = false) {
      this.x = x + 7;
      this.y = emerging ? y + 10 : y + 7;
      this.w = 34;
      this.h = 34;
      this.vx = emerging ? 70 : 55;
      this.vy = 0;
      this.active = true;
      this.emerging = emerging ? 0.5 : 0;
      this.targetY = y - 36;
      this.phase = Math.random() * Math.PI * 2;
    }

    update(dt, tileMap) {
      this.phase += dt * 4;
      if (this.emerging > 0) {
        this.emerging -= dt;
        this.y = Math.max(this.targetY, this.y - 90 * dt);
        return;
      }

      this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * dt);
      this.x += this.vx * dt;
      if (tileMap.resolveHorizontal(this)) this.vx *= -1;
      this.y += this.vy * dt;
      tileMap.resolveVertical(this);
    }

    draw(ctx, camera, sprites) {
      if (!this.active) return;
      const x = this.x - camera.x - 2;
      const y = this.y - camera.y - 3 + Math.sin(this.phase) * 2;
      sprites.draw(ctx, "objects", SPRITE_RECTS.mushroom, x, y, 38, 38);
    }
  }

  class Enemy {
    constructor(x, y) {
      this.x = x + 5;
      this.y = y + 15;
      this.w = 38;
      this.h = 31;
      this.vx = Math.random() > 0.5 ? 66 : -66;
      this.vy = 0;
      this.active = true;
      this.squished = 0;
      this.phase = Math.random() * Math.PI * 2;
    }

    update(dt, tileMap) {
      if (!this.active) return;
      if (this.squished > 0) {
        this.squished -= dt;
        if (this.squished <= 0) this.active = false;
        return;
      }

      this.phase += dt * 7;
      this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * dt);
      this.x += this.vx * dt;
      if (tileMap.resolveHorizontal(this)) this.vx *= -1;
      this.y += this.vy * dt;
      tileMap.resolveVertical(this);

      const frontX = this.vx > 0 ? this.x + this.w + 4 : this.x - 4;
      const footY = this.y + this.h + 6;
      if (!tileMap.isSolidAtPixel(frontX, footY)) this.vx *= -1;
    }

    stomp() {
      this.squished = 0.28;
      this.vx = 0;
    }

    draw(ctx, camera, sprites) {
      if (!this.active) return;
      const x = this.x - camera.x;
      const y = this.y - camera.y;
      if (this.squished > 0) {
        sprites.draw(
          ctx,
          "enemies",
          SPRITE_RECTS.goombaSquished,
          x - 3,
          y + this.h - 18,
          44,
          18
        );
        return;
      }
      const frame = Math.floor(this.phase * 0.65) % 2;
      const rect = { ...SPRITE_RECTS.goomba, x: SPRITE_RECTS.goomba.x + frame * 18 };
      sprites.draw(ctx, "enemies", rect, x - 3, y + this.h - 44, 44, 44);
    }
  }

  class TileMap {
    constructor(definition, game) {
      this.game = game;
      this.rows = definition.map.map((row) => row.split(""));
      this.width = this.rows[0].length;
      this.height = this.rows.length;
      this.worldWidth = this.width * TILE;
      this.worldHeight = this.height * TILE;
      this.usedBlocks = new Set();
      this.brokenBlocks = new Set();
      this.bumpTimers = new Map();
      this.questionHits = 0;
    }

    key(tx, ty) {
      return `${tx},${ty}`;
    }

    getTile(tx, ty) {
      if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return ".";
      const key = this.key(tx, ty);
      if (this.brokenBlocks.has(key)) return ".";
      return this.rows[ty][tx];
    }

    isSolidTile(symbol) {
      return ["X", "?", "B", "R"].includes(symbol);
    }

    isSolidAtPixel(x, y) {
      return this.isSolidTile(this.getTile(Math.floor(x / TILE), Math.floor(y / TILE)));
    }

    getNearbySolidTiles(entity) {
      const left = Math.floor(entity.x / TILE) - 1;
      const right = Math.floor((entity.x + entity.w) / TILE) + 1;
      const top = Math.floor(entity.y / TILE) - 1;
      const bottom = Math.floor((entity.y + entity.h) / TILE) + 1;
      const tiles = [];

      for (let ty = top; ty <= bottom; ty += 1) {
        for (let tx = left; tx <= right; tx += 1) {
          const symbol = this.getTile(tx, ty);
          if (this.isSolidTile(symbol)) {
            tiles.push({ tx, ty, symbol, x: tx * TILE, y: ty * TILE, w: TILE, h: TILE });
          }
        }
      }
      return tiles;
    }

    resolveHorizontal(entity) {
      let collided = false;
      this.getNearbySolidTiles(entity).forEach((tile) => {
        if (!rectsOverlap(entity, tile)) return;
        collided = true;
        if (entity.vx > 0) entity.x = tile.x - entity.w;
        if (entity.vx < 0) entity.x = tile.x + tile.w;
      });
      return collided;
    }

    resolveVertical(entity) {
      let collided = false;
      if ("grounded" in entity) entity.grounded = false;
      this.getNearbySolidTiles(entity).forEach((tile) => {
        if (!rectsOverlap(entity, tile)) return;
        collided = true;
        if (entity.vy > 0) {
          entity.y = tile.y - entity.h;
          entity.vy = 0;
          if ("grounded" in entity) entity.grounded = true;
        } else if (entity.vy < 0) {
          entity.y = tile.y + tile.h;
          entity.vy = 0;
          if (entity instanceof Player) this.hitBlock(tile.tx, tile.ty, entity);
        }
      });
      return collided;
    }

    hitBlock(tx, ty, player) {
      const symbol = this.getTile(tx, ty);
      const key = this.key(tx, ty);
      if (!["?", "B"].includes(symbol)) return;
      this.bumpTimers.set(key, 0.16);
      this.game.audio.play("bump");

      if (symbol === "?" && !this.usedBlocks.has(key)) {
        this.usedBlocks.add(key);
        this.questionHits += 1;
        if (this.questionHits % 3 === 0) {
          this.game.level.powerUps.push(new PowerUp(tx * TILE, ty * TILE, true));
          this.game.showToast("En supersvamp!");
        } else {
          this.game.collectCoin(tx * TILE + TILE / 2, ty * TILE - 6);
        }
      } else if (symbol === "B" && player.powered) {
        this.brokenBlocks.add(key);
        for (let index = 0; index < 8; index += 1) {
          this.game.addParticle(tx * TILE + TILE / 2, ty * TILE + TILE / 2, "#b85e3f", {
            vx: (Math.random() - 0.5) * 300,
            vy: -100 - Math.random() * 230,
            size: 8,
          });
        }
      }
    }

    update(dt) {
      this.bumpTimers.forEach((time, key) => {
        const next = time - dt;
        if (next <= 0) this.bumpTimers.delete(key);
        else this.bumpTimers.set(key, next);
      });
    }

    getBumpOffset(tx, ty) {
      const time = this.bumpTimers.get(this.key(tx, ty));
      if (!time) return 0;
      return -Math.sin((time / 0.16) * Math.PI) * 9;
    }

    draw(ctx, camera, palette) {
      const startX = Math.max(0, Math.floor(camera.x / TILE) - 1);
      const endX = Math.min(this.width - 1, Math.ceil((camera.x + VIEW_WIDTH) / TILE) + 1);
      const startY = Math.max(0, Math.floor(camera.y / TILE) - 1);
      const endY = Math.min(this.height - 1, Math.ceil((camera.y + VIEW_HEIGHT) / TILE) + 1);

      for (let ty = startY; ty <= endY; ty += 1) {
        for (let tx = startX; tx <= endX; tx += 1) {
          const symbol = this.getTile(tx, ty);
          if (!this.isSolidTile(symbol)) continue;
          const x = tx * TILE - camera.x;
          const y = ty * TILE - camera.y + this.getBumpOffset(tx, ty);
          if (symbol === "R") {
            const startsPipe =
              this.getTile(tx - 1, ty) !== "R" && this.getTile(tx, ty - 1) !== "R";
            if (startsPipe) this.drawPipe(ctx, x, y, tx, ty);
            continue;
          }
          this.drawTile(ctx, x, y, tx, ty, symbol, palette);
        }
      }
    }

    drawPipe(ctx, x, y, tx, ty) {
      let tileWidth = 1;
      let tileHeight = 1;
      while (this.getTile(tx + tileWidth, ty) === "R") tileWidth += 1;
      while (this.getTile(tx, ty + tileHeight) === "R") tileHeight += 1;

      const width = tileWidth * TILE;
      const height = tileHeight * TILE;
      if (
        this.game.sprites.draw(
          ctx,
          "tiles",
          SPRITE_RECTS.pipe,
          x,
          y,
          width,
          height
        )
      ) {
        return;
      }
      const bodyX = x + 9;
      const bodyY = y + 18;
      const bodyWidth = width - 18;

      ctx.fillStyle = "rgba(13, 42, 64, 0.2)";
      roundedRect(ctx, bodyX + 7, bodyY + 8, bodyWidth, height - 13, 8);
      ctx.fill();

      ctx.fillStyle = "#173f5d";
      roundedRect(ctx, bodyX - 4, bodyY - 1, bodyWidth + 8, height - 17, 8);
      ctx.fill();
      ctx.fillStyle = "#289f79";
      roundedRect(ctx, bodyX, bodyY + 3, bodyWidth, height - 25, 5);
      ctx.fill();

      const bodyGradient = ctx.createLinearGradient(bodyX, 0, bodyX + bodyWidth, 0);
      bodyGradient.addColorStop(0, "#54dfaa");
      bodyGradient.addColorStop(0.22, "#2fc794");
      bodyGradient.addColorStop(0.74, "#15926e");
      bodyGradient.addColorStop(1, "#0b7259");
      ctx.fillStyle = bodyGradient;
      ctx.fillRect(bodyX + 8, bodyY + 6, bodyWidth - 16, height - 31);

      ctx.fillStyle = "#173f5d";
      roundedRect(ctx, x - 2, y + 1, width + 4, 30, 8);
      ctx.fill();
      const rimGradient = ctx.createLinearGradient(x, 0, x + width, 0);
      rimGradient.addColorStop(0, "#67e6b5");
      rimGradient.addColorStop(0.22, "#38cc9b");
      rimGradient.addColorStop(0.76, "#188d6d");
      rimGradient.addColorStop(1, "#0e7159");
      ctx.fillStyle = rimGradient;
      roundedRect(ctx, x + 4, y + 5, width - 8, 21, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      roundedRect(ctx, x + 11, y + 8, 8, 15, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(13,42,64,0.25)";
      ctx.fillRect(x + width - 17, y + 7, 7, 17);
    }

    drawTile(ctx, x, y, tx, ty, symbol, palette) {
      const key = this.key(tx, ty);
      if (symbol === "X") {
        if (
          this.game.sprites.draw(
            ctx,
            "tiles",
            SPRITE_RECTS.ground,
            x,
            y,
            TILE,
            TILE
          )
        ) {
          return;
        }
        ctx.fillStyle = palette.dirt;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(55, 31, 24, 0.18)";
        ctx.beginPath();
        ctx.arc(x + 10 + ((tx * 7 + ty * 3) % 13), y + 25, 4, 0, Math.PI * 2);
        ctx.arc(x + 33, y + 38 - ((tx * 5) % 7), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 221, 160, 0.13)";
        ctx.beginPath();
        ctx.arc(x + 27, y + 22 + ((tx + ty) % 8), 3, 0, Math.PI * 2);
        ctx.fill();
        if (!this.isSolidTile(this.getTile(tx, ty - 1))) {
          ctx.fillStyle = "rgba(13, 42, 64, 0.18)";
          ctx.fillRect(x, y + 12, TILE, 5);
          ctx.fillStyle = palette.grass;
          ctx.fillRect(x, y, TILE, 14);
          ctx.fillStyle = "rgba(255,255,255,0.34)";
          ctx.fillRect(x, y, TILE, 5);
          ctx.fillStyle = palette.dirt;
          for (let blade = 0; blade < 4; blade += 1) {
            ctx.beginPath();
            ctx.moveTo(x + blade * 12, y + 13);
            ctx.lineTo(x + 6 + blade * 12, y + 20);
            ctx.lineTo(x + 12 + blade * 12, y + 13);
            ctx.fill();
          }
        }
        ctx.strokeStyle = "rgba(73, 39, 28, 0.22)";
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        return;
      }

      const used = symbol === "?" && this.usedBlocks.has(key);
      const spriteRect =
        symbol === "B"
          ? SPRITE_RECTS.brick
          : used
            ? SPRITE_RECTS.usedBlock
            : SPRITE_RECTS.questionBlock;
      const spriteSheet = symbol === "?" && !used ? "tiles" : "objects";
      if (this.game.sprites.draw(ctx, spriteSheet, spriteRect, x, y, TILE, TILE)) {
        return;
      }
      ctx.fillStyle = "#173f5d";
      roundedRect(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 6);
      ctx.fill();
      if (symbol === "?") {
        const blockGradient = ctx.createLinearGradient(0, y + 4, 0, y + TILE - 5);
        blockGradient.addColorStop(0, used ? "#b7c3ba" : "#ffe878");
        blockGradient.addColorStop(1, used ? "#758981" : "#efa91f");
        ctx.fillStyle = blockGradient;
        roundedRect(ctx, x + 5, y + 5, TILE - 10, TILE - 10, 3);
        ctx.fill();
        ctx.fillStyle = used ? "#667a73" : "#9b6118";
        [[10, 10], [38, 10], [10, 38], [38, 38]].forEach(([px, py]) => {
          ctx.beginPath();
          ctx.arc(x + px, y + py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        ctx.fillStyle = "#dd694c";
        ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
        ctx.fillStyle = "#f19064";
        ctx.fillRect(x + 6, y + 6, TILE - 12, 5);
      }

      if (symbol === "?" && !used) {
        ctx.fillStyle = "#173f5d";
        ctx.font = "900 27px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + TILE / 2, y + TILE / 2 + 1);
      } else if (symbol === "B") {
        ctx.strokeStyle = "#833c32";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + TILE / 2);
        ctx.lineTo(x + TILE - 5, y + TILE / 2);
        ctx.moveTo(x + TILE / 2, y + 5);
        ctx.lineTo(x + TILE / 2, y + TILE / 2);
        ctx.moveTo(x + 16, y + TILE / 2);
        ctx.lineTo(x + 16, y + TILE - 5);
        ctx.stroke();
      }
    }
  }

  class Player {
    constructor(x, y) {
      this.x = x + 7;
      this.y = y + 3;
      this.w = 34;
      this.h = 44;
      this.vx = 0;
      this.vy = 0;
      this.grounded = false;
      this.coyoteTime = 0;
      this.jumpBuffer = 0;
      this.facing = 1;
      this.powered = false;
      this.invincible = 0;
      this.runTime = 0;
      this.previousBottom = this.y + this.h;
    }

    update(dt, input, tileMap, audio) {
      this.previousBottom = this.y + this.h;
      this.invincible = Math.max(0, this.invincible - dt);
      this.runTime += dt * (1 + Math.abs(this.vx) / 80);

      if (this.grounded) this.coyoteTime = 0.11;
      else this.coyoteTime = Math.max(0, this.coyoteTime - dt);

      if (input.jumpPressed) this.jumpBuffer = 0.13;
      else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

      const axis = input.axis;
      if (axis !== 0) {
        const acceleration = this.grounded ? 1650 : 1040;
        this.vx += axis * acceleration * dt;
        this.facing = axis;
      } else {
        const drag = this.grounded ? 0.00004 : 0.045;
        this.vx *= Math.pow(drag, dt);
        if (Math.abs(this.vx) < 3) this.vx = 0;
      }
      this.vx = clamp(this.vx, -320, 320);

      if (this.jumpBuffer > 0 && this.coyoteTime > 0) {
        this.vy = -670;
        this.grounded = false;
        this.coyoteTime = 0;
        this.jumpBuffer = 0;
        audio.play("jump");
      }
      if (input.jumpReleased && this.vy < -210) this.vy *= 0.48;

      this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * dt);
      this.x += this.vx * dt;
      if (tileMap.resolveHorizontal(this)) this.vx = 0;
      this.y += this.vy * dt;
      tileMap.resolveVertical(this);

      this.x = clamp(this.x, 0, tileMap.worldWidth - this.w);
    }

    grow() {
      // Keep the movement collider unchanged so every passage remains traversable.
      // The powered form is larger visually and still functions as a one-hit shield.
      this.powered = true;
      this.invincible = 1;
    }

    shrink() {
      this.powered = false;
      this.invincible = 2;
    }

    draw(ctx, camera, sprites) {
      if (this.invincible > 0 && Math.floor(this.invincible * 12) % 2 === 0) return;
      const x = this.x - camera.x;
      const y = this.y - camera.y;
      let frame = 0;
      if (!this.grounded) {
        frame = 3;
      } else if (Math.abs(this.vx) > 24) {
        frame = 1 + (Math.floor(this.runTime * 0.7) % 3);
      }

      const baseRect = this.powered ? SPRITE_RECTS.marioBig : SPRITE_RECTS.marioSmall;
      const rect = { ...baseRect, x: baseRect.x + frame * 18 };
      const drawWidth = this.powered ? 40 : 36;
      const drawHeight = this.powered ? 80 : 36;
      const drawX = x + this.w / 2 - drawWidth / 2;
      const drawY = y + this.h - drawHeight;
      const drawn = sprites.draw(
        ctx,
        "players",
        rect,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
        this.facing < 0
      );

      if (!drawn) {
        ctx.fillStyle = "#e23b2e";
        ctx.fillRect(x + 4, y, this.w - 8, this.h);
      }
    }
  }

  class Level {
    constructor(definition, game) {
      this.definition = definition;
      this.game = game;
      this.tileMap = new TileMap(definition, game);
      this.coins = [];
      this.enemies = [];
      this.powerUps = [];
      this.checkpoints = [];
      this.hazards = [];
      this.finish = null;
      this.spawn = { x: TILE * 2, y: TILE * 9 };
      this.parseEntities();
    }

    parseEntities() {
      this.definition.map.forEach((row, ty) => {
        Array.from(row).forEach((symbol, tx) => {
          const x = tx * TILE;
          const y = ty * TILE;
          if (symbol === "P") this.spawn = { x, y };
          if (symbol === "C") this.coins.push(new Coin(x, y));
          if (symbol === "E") this.enemies.push(new Enemy(x, y));
          if (symbol === "U") this.powerUps.push(new PowerUp(x, y));
          if (symbol === "K") {
            this.checkpoints.push({ x: x + 13, y: y - 47, w: 30, h: 95, active: false });
          }
          if (symbol === "F") this.finish = { x: x + 8, y: y - 24, w: 45, h: 120 };
          if (symbol === "^") this.hazards.push({ x: x + 5, y: y + 18, w: TILE - 10, h: 30 });
        });
      });
    }

    update(dt) {
      const player = this.game.player;
      this.tileMap.update(dt);

      this.coins.forEach((coin) => {
        coin.update(dt);
        if (!coin.collected && rectsOverlap(player, coin.rect)) {
          coin.collected = true;
          this.game.collectCoin(coin.x, coin.y);
        }
      });

      this.enemies.forEach((enemy) => {
        enemy.update(dt, this.tileMap);
        if (!enemy.active || enemy.squished > 0 || !rectsOverlap(player, enemy)) return;
        const stomped = player.vy > 80 && player.previousBottom <= enemy.y + 13;
        if (stomped) {
          enemy.stomp();
          player.vy = -430;
          this.game.audio.play("stomp");
          this.game.burst(enemy.x + enemy.w / 2, enemy.y + 5, "#fff2a4", 7);
        } else {
          this.game.damagePlayer();
        }
      });

      this.powerUps.forEach((powerUp) => {
        powerUp.update(dt, this.tileMap);
        if (powerUp.active && rectsOverlap(player, powerUp)) {
          powerUp.active = false;
          player.grow();
          this.game.audio.play("power");
          this.game.showToast("Supersvamp! Ét ekstra hit.");
          this.game.burst(powerUp.x + powerUp.w / 2, powerUp.y, "#ffd45d", 12);
        }
      });

      this.checkpoints.forEach((checkpoint) => {
        if (!checkpoint.active && rectsOverlap(player, checkpoint)) {
          this.checkpoints.forEach((item) => {
            item.active = false;
          });
          checkpoint.active = true;
          this.game.respawnPoint = {
            x: checkpoint.x - 7,
            y: checkpoint.y + checkpoint.h - TILE,
          };
          this.game.audio.play("checkpoint");
          this.game.showToast("Checkpoint gemt");
        }
      });

      if (this.finish && rectsOverlap(player, this.finish)) this.game.completeLevel();
      if (this.hazards.some((hazard) => rectsOverlap(player, hazard))) this.game.damagePlayer(true);
    }

    draw(ctx, camera) {
      this.tileMap.draw(ctx, camera, this.definition.palette);
      this.hazards.forEach((hazard) => this.drawHazard(ctx, camera, hazard));
      this.checkpoints.forEach((checkpoint) => this.drawCheckpoint(ctx, camera, checkpoint));
      if (this.finish) this.drawFinish(ctx, camera, this.finish);
      if (this.game.levelIndex === 0) this.drawTutorial(ctx, camera);
      this.coins.forEach((coin) => coin.draw(ctx, camera, this.game.sprites));
      this.powerUps.forEach((powerUp) => powerUp.draw(ctx, camera, this.game.sprites));
      this.enemies.forEach((enemy) => enemy.draw(ctx, camera, this.game.sprites));
    }

    drawTutorial(ctx, camera) {
      const tips = [
        { x: 230, y: 410, title: "A / D", copy: "Løb" },
        { x: 620, y: 345, title: "SPACE", copy: "Hop og hold" },
      ];

      tips.forEach((tip) => {
        const x = tip.x - camera.x;
        if (x < -170 || x > VIEW_WIDTH + 30) return;
        ctx.fillStyle = "rgba(23, 63, 93, 0.92)";
        roundedRect(ctx, x, tip.y, 142, 55, 12);
        ctx.fill();
        ctx.fillStyle = "#ffd45d";
        ctx.font = "900 17px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(tip.title, x + 71, tip.y + 23);
        ctx.fillStyle = "#fff";
        ctx.font = "800 12px system-ui";
        ctx.fillText(tip.copy, x + 71, tip.y + 42);
      });
    }

    drawCheckpoint(ctx, camera, checkpoint) {
      const x = checkpoint.x - camera.x;
      const y = checkpoint.y - camera.y;
      ctx.strokeStyle = "#173f5d";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 5, y + checkpoint.h);
      ctx.lineTo(x + 5, y + 8);
      ctx.stroke();
      ctx.fillStyle = checkpoint.active ? "#ffd45d" : "#f26850";
      ctx.strokeStyle = "#173f5d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 10);
      ctx.lineTo(x + 35, y + 18);
      ctx.lineTo(x + 7, y + 31);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    drawFinish(ctx, camera, finish) {
      const x = finish.x - camera.x;
      const y = finish.y - camera.y;
      ctx.strokeStyle = "#173f5d";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 7, y + finish.h);
      ctx.lineTo(x + 7, y + 5);
      ctx.stroke();
      ctx.fillStyle = "#fff9df";
      ctx.strokeStyle = "#173f5d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 11);
      ctx.quadraticCurveTo(x + 35, y + 4, x + 46, y + 18);
      ctx.quadraticCurveTo(x + 34, y + 35, x + 10, y + 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f26850";
      ctx.beginPath();
      ctx.arc(x + 26, y + 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHazard(ctx, camera, hazard) {
      const x = hazard.x - camera.x;
      const y = hazard.y - camera.y;
      ctx.fillStyle = "#173f5d";
      ctx.beginPath();
      for (let index = 0; index < 3; index += 1) {
        const left = x + (index * hazard.w) / 3;
        const right = x + ((index + 1) * hazard.w) / 3;
        ctx.moveTo(left, y + hazard.h);
        ctx.lineTo((left + right) / 2, y);
        ctx.lineTo(right, y + hazard.h);
      }
      ctx.fill();
      ctx.fillStyle = "#f26850";
      ctx.fillRect(x, y + hazard.h - 7, hazard.w, 7);
    }
  }

  class UI {
    constructor() {
      this.screens = {
        menu: document.getElementById("menu-screen"),
        instructions: document.getElementById("instructions-screen"),
        pause: document.getElementById("pause-screen"),
        complete: document.getElementById("complete-screen"),
        gameOver: document.getElementById("game-over-screen"),
      };
      this.hud = {
        lives: document.getElementById("hud-lives"),
        coins: document.getElementById("hud-coins"),
        level: document.getElementById("hud-level"),
        time: document.getElementById("hud-time"),
      };
      this.toast = document.getElementById("toast");
      this.toastTimer = null;
    }

    showOnly(name) {
      Object.entries(this.screens).forEach(([screenName, element]) => {
        element.hidden = screenName !== name;
      });
    }

    hideAll() {
      Object.values(this.screens).forEach((element) => {
        element.hidden = true;
      });
    }

    updateHud(game) {
      this.hud.lives.textContent = String(game.lives);
      this.hud.coins.textContent = String(game.coins);
      this.hud.level.textContent = `${game.levelIndex + 1} / ${TOTAL_LEVELS}`;
      this.hud.time.textContent = String(Math.max(0, Math.ceil(game.timeLeft)));
    }

    showToast(message) {
      this.toast.textContent = message;
      this.toast.classList.add("show");
      window.clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 1800);
    }
  }

  class Game {
    constructor() {
      this.canvas = document.getElementById("game-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.sprites = new SpriteAtlas();
      this.input = new InputManager();
      this.audio = new AudioManager();
      this.camera = new Camera();
      this.ui = new UI();
      this.state = "menu";
      this.selectedLevel = 0;
      this.levelIndex = 0;
      this.level = null;
      this.player = null;
      this.lives = 3;
      this.coins = 0;
      this.timeLeft = LEVEL_DEFINITIONS[0].time;
      this.nextLifeAt = 20;
      this.respawnPoint = null;
      this.particles = [];
      this.transition = 0;
      this.transitionKind = "";
      this.shake = 0;
      this.lastTime = performance.now();
      this.bindUI();
      this.loadLevel(0);
      this.state = "menu";
      this.ui.showOnly("menu");
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    bindUI() {
      document.getElementById("start-button").addEventListener("click", () => {
        this.audio.ensureContext();
        this.startNewGame(this.selectedLevel);
      });
      document.getElementById("instructions-button").addEventListener("click", () => {
        this.ui.showOnly("instructions");
      });
      document.querySelectorAll("[data-close-instructions]").forEach((button) => {
        button.addEventListener("click", () => this.ui.showOnly("menu"));
      });
      document.querySelectorAll(".level-choice").forEach((button) => {
        button.addEventListener("click", () => {
          this.selectedLevel = Number(button.dataset.level);
          document.querySelectorAll(".level-choice").forEach((choice) => {
            choice.classList.toggle("active", choice === button);
          });
          this.loadLevel(this.selectedLevel);
          this.state = "menu";
        });
      });
      document.getElementById("resume-button").addEventListener("click", () => this.resume());
      document.getElementById("pause-button").addEventListener("click", () => {
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
      });
      document.getElementById("restart-level-button").addEventListener("click", () => {
        this.loadLevel(this.levelIndex);
        this.state = "playing";
        this.ui.hideAll();
      });
      document.getElementById("retry-button").addEventListener("click", () => {
        this.startNewGame(this.selectedLevel);
      });
      document.getElementById("next-level-button").addEventListener("click", () => {
        if (this.levelIndex < TOTAL_LEVELS - 1) {
          this.loadLevel(this.levelIndex + 1);
          this.state = "playing";
          this.ui.hideAll();
        } else {
          this.returnToMenu();
        }
      });
      document.querySelectorAll("[data-back-menu]").forEach((button) => {
        button.addEventListener("click", () => this.returnToMenu());
      });
      document.getElementById("mute-button").addEventListener("click", (event) => {
        const muted = this.audio.toggle();
        event.currentTarget.textContent = muted ? "Lyd: fra" : "Lyd: til";
        event.currentTarget.setAttribute("aria-pressed", String(muted));
      });
    }

    startNewGame(levelIndex = 0) {
      this.lives = 3;
      this.coins = 0;
      this.nextLifeAt = 20;
      this.loadLevel(levelIndex);
      this.state = "playing";
      this.ui.hideAll();
      this.showToast(this.level.definition.name);
    }

    loadLevel(levelIndex) {
      this.levelIndex = clamp(levelIndex, 0, TOTAL_LEVELS - 1);
      this.level = new Level(LEVEL_DEFINITIONS[this.levelIndex], this);
      this.respawnPoint = { ...this.level.spawn };
      this.player = new Player(this.respawnPoint.x, this.respawnPoint.y);
      this.timeLeft = this.level.definition.time;
      this.transition = 0;
      this.transitionKind = "";
      this.particles = [];
      this.camera.reset(this.player.x - VIEW_WIDTH * 0.3);
      this.ui.updateHud(this);
    }

    returnToMenu() {
      this.input.releaseAll();
      this.selectedLevel = this.levelIndex;
      document.querySelectorAll(".level-choice").forEach((choice) => {
        choice.classList.toggle("active", Number(choice.dataset.level) === this.selectedLevel);
      });
      this.state = "menu";
      this.ui.showOnly("menu");
    }

    pause() {
      if (this.state !== "playing" || this.transition > 0) return;
      this.state = "paused";
      this.input.releaseAll();
      this.ui.showOnly("pause");
    }

    resume() {
      if (this.state !== "paused") return;
      this.state = "playing";
      this.ui.hideAll();
      this.lastTime = performance.now();
    }

    collectCoin(x, y) {
      this.coins += 1;
      this.audio.play("coin");
      this.burst(x, y, "#ffd45d", 7);
      if (this.coins >= this.nextLifeAt) {
        this.lives += 1;
        this.nextLifeAt += 20;
        this.showToast("Ekstra liv!");
        this.audio.play("power");
      }
      this.ui.updateHud(this);
    }

    damagePlayer(forceDeath = false) {
      if (this.state !== "playing" || this.transition > 0 || this.player.invincible > 0) return;
      if (this.player.powered && !forceDeath) {
        this.player.shrink();
        this.audio.play("hurt");
        this.shake = 0.25;
        this.showToast("Supersvampen reddede Mario");
        return;
      }
      this.killPlayer();
    }

    killPlayer() {
      if (this.transition > 0) return;
      this.audio.play("hurt");
      this.transition = 0.85;
      this.transitionKind = "death";
      this.player.vy = -430;
      this.player.vx *= -0.3;
      this.shake = 0.35;
    }

    finishDeathTransition() {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.state = "gameOver";
        this.audio.play("gameOver");
        this.ui.showOnly("gameOver");
      } else {
        this.player = new Player(this.respawnPoint.x, this.respawnPoint.y);
        this.camera.reset(this.player.x - VIEW_WIDTH * 0.3);
        this.timeLeft = Math.max(45, this.timeLeft);
        this.showToast(`${this.lives} liv tilbage`);
      }
      this.ui.updateHud(this);
    }

    completeLevel() {
      if (this.state !== "playing" || this.transition > 0) return;
      this.state = "complete";
      this.audio.play("complete");
      this.burst(this.player.x + this.player.w / 2, this.player.y, "#ffd45d", 24);

      const finalLevel = this.levelIndex === TOTAL_LEVELS - 1;
      document.getElementById("complete-kicker").textContent = finalLevel
        ? "Hele eventyret klaret"
        : "Bane klaret";
      document.getElementById("complete-title").textContent = finalLevel
        ? "Mario klarede eventyret!"
        : "Godt gået!";
      document.getElementById("complete-copy").textContent = finalLevel
        ? "Alle tre skyveje er erobret. En flot rejse fra eng til solruin."
        : `${this.level.definition.name} er gennemført. Den næste skyvej venter.`;
      document.getElementById("result-coins").textContent = String(this.coins);
      document.getElementById("result-time").textContent = `${Math.ceil(this.timeLeft)} sek.`;
      document.getElementById("next-level-button").textContent = finalLevel
        ? "Til hovedmenu"
        : "Næste bane";
      this.ui.showOnly("complete");
    }

    addParticle(x, y, color, options) {
      this.particles.push(new Particle(x, y, color, options));
    }

    burst(x, y, color, count) {
      for (let index = 0; index < count; index += 1) {
        this.addParticle(x, y, color, {
          vx: (Math.random() - 0.5) * 260,
          vy: -80 - Math.random() * 260,
          size: 5 + Math.random() * 8,
          shape: index % 2 ? "circle" : "square",
        });
      }
    }

    showToast(message) {
      this.ui.showToast(message);
    }

    update(dt) {
      if (this.input.pausePressed) {
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
      }

      this.particles = this.particles.filter((particle) => particle.update(dt));
      this.shake = Math.max(0, this.shake - dt);

      if (this.state !== "playing") return;

      if (this.transition > 0) {
        this.transition -= dt;
        this.player.vy = Math.min(MAX_FALL_SPEED, this.player.vy + GRAVITY * dt);
        this.player.x += this.player.vx * dt;
        this.player.y += this.player.vy * dt;
        if (this.transition <= 0 && this.transitionKind === "death") {
          this.transitionKind = "";
          this.finishDeathTransition();
        }
        return;
      }

      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.killPlayer();
        return;
      }

      this.player.update(dt, this.input, this.level.tileMap, this.audio);
      this.level.update(dt);
      this.camera.update(this.player, this.level.tileMap.worldWidth, dt);
      if (this.player.y > this.level.tileMap.worldHeight + 120) this.killPlayer();
      this.ui.updateHud(this);
    }

    drawBackground() {
      const ctx = this.ctx;
      const palette = this.level.definition.palette;
      const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT);
      gradient.addColorStop(0, palette.skyTop);
      gradient.addColorStop(1, palette.skyBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

      const sunX = VIEW_WIDTH - 130 - this.camera.x * 0.03;
      ctx.fillStyle = "rgba(255, 236, 147, 0.78)";
      ctx.beginPath();
      ctx.arc(sunX, 115, 58, 0, Math.PI * 2);
      ctx.fill();

      this.drawClouds(this.camera.x * 0.12);
      this.drawHills(palette.hillFar, 390, 92, this.camera.x * 0.18);
      this.drawHills(palette.hillNear, 475, 128, this.camera.x * 0.32);
      this.drawBushes(palette.grass, 535, this.camera.x * 0.48);
    }

    drawClouds(offset) {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      for (let index = -1; index < 8; index += 1) {
        const x = ((index * 245 - offset) % 1960) - 120;
        const y = 85 + ((index * 73) % 180);
        ctx.beginPath();
        ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.arc(x + 34, y - 15, 38, 0, Math.PI * 2);
        ctx.arc(x + 73, y, 31, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawHills(color, baseline, radius, offset) {
      const ctx = this.ctx;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, VIEW_HEIGHT);
      ctx.lineTo(0, baseline);
      for (let index = -2; index < 13; index += 1) {
        const x = index * radius * 1.7 - (offset % (radius * 1.7));
        ctx.quadraticCurveTo(x + radius * 0.85, baseline - radius, x + radius * 1.7, baseline);
      }
      ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
      ctx.closePath();
      ctx.fill();
    }

    drawBushes(color, baseline, offset) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.86;
      for (let index = -2; index < 12; index += 1) {
        const x = index * 185 - (offset % 185);
        const size = 34 + ((index * 17 + 80) % 24);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, baseline, size, Math.PI, 0);
        ctx.arc(x + size * 0.9, baseline, size * 0.72, Math.PI, 0);
        ctx.arc(x + size * 1.55, baseline, size * 0.92, Math.PI, 0);
        ctx.lineTo(x + size * 2.5, VIEW_HEIGHT);
        ctx.lineTo(x - size, VIEW_HEIGHT);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.beginPath();
        ctx.arc(x - size * 0.2, baseline - size * 0.55, 5, 0, Math.PI * 2);
        ctx.arc(x + size * 1.25, baseline - size * 0.45, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    render() {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake > 0) {
        ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8);
      }
      this.drawBackground();
      this.level.draw(ctx, this.camera);
      this.player.draw(ctx, this.camera, this.sprites);
      this.particles.forEach((particle) => particle.draw(ctx, this.camera));

      if (this.transition > 0 && this.transitionKind === "death") {
        const alpha = clamp(1 - this.transition / 0.85, 0, 0.5);
        ctx.fillStyle = `rgba(23, 63, 93, ${alpha})`;
        ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      }
      ctx.restore();
    }

    loop(timestamp) {
      const dt = Math.min(0.033, Math.max(0, (timestamp - this.lastTime) / 1000));
      this.lastTime = timestamp;
      this.update(dt);
      this.render();
      this.input.endFrame();
      requestAnimationFrame(this.loop);
    }
  }

  window.PipsSkybound = {
    createMap,
    LEVEL_DEFINITIONS,
    constants: { VIEW_WIDTH, VIEW_HEIGHT, TILE },
  };

  window.addEventListener("DOMContentLoaded", () => {
    window.pipsSkyboundGame = new Game();
  });
})();
