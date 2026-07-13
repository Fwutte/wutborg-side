(() => {
  "use strict";

  const data = window.WutborgKartData;
  if (!data) return;

  const { DRIVERS, ITEM_TYPES, TRACKS, TAU, clamp, normalizeAngle, angleDelta } = data;
  const STORAGE_KEY = "wutborg.kart.progress.v1";
  const FIXED_STEP = 1 / 60;
  const MAX_STEPS = 15;

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pointFrom = (x, y, angle, amount) => ({ x: x + Math.cos(angle) * amount, y: y + Math.sin(angle) * amount });
  const circularDistance = (left, right) => Math.abs(angleDelta(left, right));

  class Kart {
    constructor(driver, index, isAI = false) {
      this.driver = driver;
      this.index = index;
      this.isAI = isAI;
      this.radius = 18;
      this.reset(null, index);
    }

    reset(track, index = this.index) {
      this.index = index;
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
      this.spinTimer = 0;
      this.boostTimer = 0;
      this.invincibleTimer = 0;
      this.item = null;
      this.finished = false;
      this.finishTime = 0;
      this.lap = 0;
      this.nextCheckpoint = 0;
      this.progress = 0;
      this.nextWaypoint = 0;
      if (!track) {
        this.x = 0;
        this.y = 0;
        this.heading = 0;
        this.lastSafe = { x: 0, y: 0, heading: 0 };
        return;
      }
      const row = Math.floor(index / 2);
      const lane = index % 2 === 0 ? -1 : 1;
      const forward = -row * 48;
      const lateral = lane * 31;
      this.heading = track.heading;
      this.x = track.start.x + Math.cos(this.heading) * forward - Math.sin(this.heading) * lateral;
      this.y = track.start.y + Math.sin(this.heading) * forward + Math.cos(this.heading) * lateral;
      this.lastSafe = { x: this.x, y: this.y, heading: this.heading };
      this.nextWaypoint = Math.floor((normalizeAngle(track.startAngle) / TAU) * track.waypoints.length) % track.waypoints.length;
    }

    applySpin(duration = 0.8) {
      if (this.invincibleTimer > 0) return false;
      this.spinTimer = Math.max(this.spinTimer, duration);
      this.speed *= 0.28;
      return true;
    }

    update(dt, input, track) {
      this.spinTimer = Math.max(0, this.spinTimer - dt);
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
      const forward = input.accelerate ? 1 : input.brake ? -0.72 : 0;
      const topSpeed = this.driver.maxSpeed + (this.boostTimer > 0 ? 120 : 0);

      if (this.spinTimer > 0) {
        this.heading += 8.6 * dt;
        this.speed *= Math.pow(0.04, dt);
      } else {
        const acceleration = forward > 0 ? this.driver.acceleration : forward < 0 ? 185 : 0;
        this.speed += forward * acceleration * dt;
        if (!forward) this.speed *= Math.pow(0.12, dt);
        const steerStrength = this.driver.handling * (0.2 + Math.min(Math.abs(this.speed) / Math.max(1, topSpeed), 1));
        this.heading += input.steer * steerStrength * dt * (this.speed >= 0 ? 1 : -0.65);
      }

      this.speed = clamp(this.speed, -90, topSpeed);
      const previous = { x: this.x, y: this.y };
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.y += Math.sin(this.heading) * this.speed * dt;

      if (!track.isRoad(this.x, this.y)) {
        this.speed *= Math.pow(0.09, dt);
        const dx = this.x - track.cx;
        const dy = this.y - track.cy;
        const outer = (dx * dx) / (track.outerRx * track.outerRx) + (dy * dy) / (track.outerRy * track.outerRy);
        const inner = (dx * dx) / (track.innerRx * track.innerRx) + (dy * dy) / (track.innerRy * track.innerRy);
        if (outer > 1.17 || inner < 0.57) {
          this.x = this.lastSafe.x;
          this.y = this.lastSafe.y;
          this.heading = this.lastSafe.heading;
          this.speed *= 0.15;
          this.invincibleTimer = 0.7;
        }
      } else {
        this.lastSafe = { x: previous.x, y: previous.y, heading: this.heading };
      }
    }
  }

  class RaceAI {
    inputFor(kart, track) {
      const target = track.waypoints[kart.nextWaypoint];
      if (distance(kart, target) < 90) kart.nextWaypoint = (kart.nextWaypoint + 1) % track.waypoints.length;
      const nextTarget = track.waypoints[kart.nextWaypoint];
      const targetAngle = Math.atan2(nextTarget.y - kart.y, nextTarget.x - kart.x);
      const delta = angleDelta(kart.heading, targetAngle);
      return {
        steer: clamp(delta * 1.85, -1, 1),
        accelerate: Math.abs(delta) < 2.25,
        brake: Math.abs(delta) >= 2.25,
        itemPressed: kart.item && Math.random() < 0.0035,
      };
    }
  }

  class Race {
    constructor(track, drivers = DRIVERS) {
      this.track = track;
      this.drivers = drivers;
      this.ai = new RaceAI();
      this.lapTarget = 3;
      this.state = "ready";
      this.countdown = 3.5;
      this.elapsed = 0;
      this.player = null;
      this.karts = [];
      this.traps = [];
      this.shells = [];
      this.itemBoxes = [];
      this.lastRankings = [];
      this.result = null;
    }

    start(playerDriverId) {
      const playerDriver = this.drivers.find((driver) => driver.id === playerDriverId) || this.drivers[0];
      const orderedDrivers = [playerDriver, ...this.drivers.filter((driver) => driver.id !== playerDriver.id)].slice(0, 8);
      this.karts = orderedDrivers.map((driver, index) => new Kart(driver, index, index !== 0));
      this.karts.forEach((kart, index) => kart.reset(this.track, index));
      this.player = this.karts[0];
      this.itemBoxes = this.track.itemBoxes.map((box) => ({ ...box, cooldown: 0 }));
      this.traps = [];
      this.shells = [];
      this.countdown = 3.5;
      this.elapsed = 0;
      this.state = "countdown";
      this.result = null;
      this.updateRankings();
    }

    update(dt, playerInput) {
      if (this.state === "ready" || this.state === "finished") return;
      if (this.state === "countdown") {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.state = "racing";
        }
        return;
      }

      this.elapsed += dt;
      this.itemBoxes.forEach((box) => { box.cooldown = Math.max(0, box.cooldown - dt); });
      this.karts.forEach((kart) => {
        const input = kart.isAI ? this.ai.inputFor(kart, this.track) : playerInput;
        kart.update(dt, input, this.track);
        if (input.itemPressed) this.useItem(kart);
      });
      this.resolveKartCollisions();
      this.updateObjects(dt);
      this.karts.forEach((kart) => this.updateKartProgress(kart));
      this.updateRankings();

      if (this.player.lap >= this.lapTarget && !this.player.finished) {
        this.player.finished = true;
        this.player.finishTime = this.elapsed;
        this.finish();
      }
    }

    updateKartProgress(kart) {
      const trackAngle = this.track.angleAt(kart.x, kart.y);
      const target = this.track.checkpointAngles[kart.nextCheckpoint];
      if (circularDistance(trackAngle, target) < 0.12 && Math.abs(kart.speed) > 45) {
        kart.nextCheckpoint = (kart.nextCheckpoint + 1) % this.track.checkpointAngles.length;
        if (kart.nextCheckpoint === 0) kart.lap += 1;
      }
      kart.progress = kart.lap * this.track.checkpointAngles.length + kart.nextCheckpoint + trackAngle / TAU;
    }

    updateRankings() {
      this.lastRankings = [...this.karts].sort((left, right) => right.progress - left.progress || right.speed - left.speed);
      this.lastRankings.forEach((kart, index) => { kart.rank = index + 1; });
    }

    resolveKartCollisions() {
      for (let index = 0; index < this.karts.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < this.karts.length; otherIndex += 1) {
          const left = this.karts[index];
          const right = this.karts[otherIndex];
          const dx = right.x - left.x;
          const dy = right.y - left.y;
          const separation = Math.hypot(dx, dy) || 0.001;
          const minimum = left.radius + right.radius;
          if (separation >= minimum) continue;
          const overlap = (minimum - separation) / 2;
          const nx = dx / separation;
          const ny = dy / separation;
          const leftPush = right.driver.weight / (left.driver.weight + right.driver.weight);
          const rightPush = left.driver.weight / (left.driver.weight + right.driver.weight);
          left.x -= nx * overlap * leftPush;
          left.y -= ny * overlap * leftPush;
          right.x += nx * overlap * rightPush;
          right.y += ny * overlap * rightPush;
          left.speed *= 0.92;
          right.speed *= 0.92;
        }
      }
    }

    updateObjects(dt) {
      this.karts.forEach((kart) => {
        this.itemBoxes.forEach((box) => {
          if (box.cooldown > 0 || kart.item || distance(kart, box) > 31) return;
          box.cooldown = 5.5;
          kart.item = this.itemForRank(kart.rank || 8);
        });
      });

      this.traps.forEach((trap) => { trap.life -= dt; });
      this.traps = this.traps.filter((trap) => {
        const target = this.karts.find((kart) => kart !== trap.owner && distance(kart, trap) < kart.radius + 14);
        if (target) target.applySpin(0.9);
        return trap.life > 0 && !target;
      });

      this.shells.forEach((shell) => {
        shell.life -= dt;
        shell.x += Math.cos(shell.heading) * shell.speed * dt;
        shell.y += Math.sin(shell.heading) * shell.speed * dt;
        if (!this.track.isRoad(shell.x, shell.y)) shell.heading += Math.PI / 2;
      });
      this.shells = this.shells.filter((shell) => {
        const target = this.karts.find((kart) => kart !== shell.owner && distance(kart, shell) < kart.radius + 13);
        if (target) target.applySpin(0.95);
        return shell.life > 0 && !target;
      });
    }

    itemForRank(rank) {
      const roll = Math.random();
      if (rank >= 6) return roll < 0.48 ? "mushroom" : roll < 0.8 ? "shell" : "banana";
      if (rank >= 4) return roll < 0.35 ? "mushroom" : roll < 0.65 ? "shell" : "banana";
      return roll < 0.22 ? "mushroom" : roll < 0.56 ? "banana" : "shell";
    }

    useItem(kart) {
      if (!kart.item || this.state !== "racing") return false;
      const item = kart.item;
      kart.item = null;
      if (item === "mushroom") kart.boostTimer = Math.max(kart.boostTimer, 1.05);
      if (item === "banana") {
        const behind = pointFrom(kart.x, kart.y, kart.heading + Math.PI, 31);
        this.traps.push({ ...behind, owner: kart, life: 12 });
      }
      if (item === "shell") {
        const ahead = pointFrom(kart.x, kart.y, kart.heading, 31);
        this.shells.push({ ...ahead, owner: kart, heading: kart.heading, speed: 470, life: 5 });
      }
      return true;
    }

    finish() {
      this.updateRankings();
      const playerRank = this.player.rank || 8;
      const score = Math.max(1000, Math.round(120000 - this.elapsed * 500 + (9 - playerRank) * 6000));
      this.result = { position: playerRank, time: this.elapsed, score };
      this.state = "finished";
    }
  }

  class InputManager {
    constructor() {
      this.controls = { left: false, right: false, accelerate: false, brake: false, item: false };
      this.itemPressed = false;
      if (typeof document === "undefined") return;
      window.addEventListener("keydown", (event) => this.handleKey(event, true));
      window.addEventListener("keyup", (event) => this.handleKey(event, false));
    }

    handleKey(event, active) {
      const mapping = {
        ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
        ArrowUp: "accelerate", KeyW: "accelerate", ArrowDown: "brake", KeyS: "brake",
        ShiftLeft: "brake", ShiftRight: "brake", KeyX: "brake", Space: "item", KeyZ: "item",
      };
      const key = mapping[event.code];
      if (!key) return;
      event.preventDefault();
      if (key === "item" && active && !this.controls.item) this.itemPressed = true;
      this.controls[key] = active;
    }

    setControl(name, active) {
      if (name === "item" && active && !this.controls.item) this.itemPressed = true;
      this.controls[name] = active;
    }

    read() {
      const input = {
        steer: (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0),
        accelerate: this.controls.accelerate,
        brake: this.controls.brake,
        itemPressed: this.itemPressed,
      };
      this.itemPressed = false;
      return input;
    }

    reset() {
      Object.keys(this.controls).forEach((key) => { this.controls[key] = false; });
      this.itemPressed = false;
    }
  }

  class AudioManager {
    constructor() {
      this.enabled = true;
      this.context = null;
    }

    tone(frequency, duration, type = "square", volume = 0.025) {
      if (!this.enabled || typeof AudioContext === "undefined") return;
      this.context ||= new AudioContext();
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
    }
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
    }

    draw(race) {
      const { ctx, canvas } = this;
      const track = race.track;
      const scale = Math.min(canvas.width / track.width, canvas.height / track.height);
      const offsetX = (canvas.width - track.width * scale) / 2;
      const offsetY = (canvas.height - track.height * scale) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = track.palette.sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      ctx.fillStyle = track.palette.grass;
      ctx.fillRect(0, 0, track.width, track.height);
      for (let x = 40; x < track.width; x += 110) {
        for (let y = 30; y < track.height; y += 95) {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fillRect(x, y, 6, 6);
        }
      }
      ctx.beginPath();
      ctx.ellipse(track.cx, track.cy, track.outerRx, track.outerRy, 0, 0, TAU);
      ctx.fillStyle = track.palette.roadEdge;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(track.cx, track.cy, track.outerRx - 16, track.outerRy - 16, 0, 0, TAU);
      ctx.fillStyle = track.palette.road;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(track.cx, track.cy, track.innerRx + 16, track.innerRy + 16, 0, 0, TAU);
      ctx.fillStyle = track.palette.grassDark;
      ctx.fill();

      ctx.save();
      ctx.setLineDash([18, 18]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.42)";
      ctx.beginPath();
      ctx.ellipse(track.cx, track.cy, track.radiusX, track.radiusY, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();

      this.drawStartLine(ctx, track);
      race.itemBoxes.forEach((box) => this.drawItemBox(ctx, box));
      race.traps.forEach((trap) => this.drawTrap(ctx, trap));
      race.shells.forEach((shell) => this.drawShell(ctx, shell));
      [...race.karts].sort((a, b) => a.y - b.y).forEach((kart) => this.drawKart(ctx, kart));
      ctx.restore();
    }

    drawStartLine(ctx, track) {
      const point = track.start;
      const normal = { x: -Math.sin(track.heading), y: Math.cos(track.heading) };
      for (let index = -4; index < 4; index += 1) {
        ctx.fillStyle = index % 2 === 0 ? "#fff8e9" : "#273044";
        ctx.fillRect(point.x + normal.x * index * 20 - 10, point.y + normal.y * index * 20 - 10, 20, 20);
      }
    }

    drawItemBox(ctx, box) {
      const active = box.cooldown <= 0;
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = active ? "#58d9f6" : "rgba(88,217,246,0.25)";
      ctx.fillRect(-14, -14, 28, 28);
      if (active) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.strokeRect(-10, -10, 20, 20);
      }
      ctx.restore();
    }

    drawTrap(ctx, trap) {
      ctx.fillStyle = "#f8d548";
      ctx.beginPath();
      ctx.arc(trap.x, trap.y, 13, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#765421";
      ctx.fillRect(trap.x - 3, trap.y - 12, 6, 8);
    }

    drawShell(ctx, shell) {
      ctx.fillStyle = "#54c96b";
      ctx.beginPath();
      ctx.arc(shell.x, shell.y, 12, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#e7ffe8";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    drawKart(ctx, kart) {
      ctx.save();
      ctx.translate(kart.x, kart.y);
      ctx.rotate(kart.heading);
      ctx.fillStyle = "rgba(25,36,53,0.24)";
      ctx.fillRect(-17, -10, 37, 25);
      ctx.fillStyle = kart.spinTimer > 0 ? "#fff" : kart.driver.color;
      ctx.fillRect(-18, -13, 36, 26);
      ctx.fillStyle = kart.driver.accent;
      ctx.fillRect(-2, -9, 16, 18);
      ctx.fillStyle = "#202b3b";
      ctx.fillRect(10, -16, 7, 32);
      ctx.fillRect(-17, -16, 7, 32);
      if (kart.boostTimer > 0) {
        ctx.fillStyle = "#ffdc56";
        ctx.fillRect(-29, -6, 13, 12);
      }
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = "700 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(kart.driver.name, kart.x, kart.y - 27);
    }
  }

  class KartGame {
    constructor() {
      this.canvas = document.getElementById("kart-canvas");
      this.renderer = new Renderer(this.canvas);
      this.track = TRACKS[0];
      this.race = new Race(this.track);
      this.input = new InputManager();
      this.audio = new AudioManager();
      this.selectedDriver = DRIVERS[0].id;
      this.paused = false;
      this.lastTime = 0;
      this.accumulator = 0;
      this.resultSaved = false;
      this.progress = this.readProgress();
      this.els = {
        menu: document.getElementById("kart-menu"),
        pause: document.getElementById("kart-pause"),
        result: document.getElementById("kart-result"),
        start: document.getElementById("kart-start"),
        retry: document.getElementById("kart-retry"),
        resume: document.getElementById("kart-resume"),
        menuButton: document.getElementById("kart-menu-button"),
        resultMenuButton: document.getElementById("kart-menu-button-result"),
        pauseButton: document.getElementById("kart-pause-button"),
        soundButton: document.getElementById("kart-sound"),
        drivers: document.getElementById("driver-select"),
        countdown: document.getElementById("kart-countdown"),
        position: document.getElementById("kart-position"),
        lap: document.getElementById("kart-lap"),
        time: document.getElementById("kart-time"),
        speed: document.getElementById("kart-speed"),
        item: document.getElementById("kart-item"),
        resultTitle: document.getElementById("kart-result-title"),
        resultCopy: document.getElementById("kart-result-copy"),
        best: document.getElementById("kart-best"),
        toast: document.getElementById("kart-toast"),
      };
      this.populateDrivers();
      this.bindUI();
      this.updateUI();
      requestAnimationFrame((time) => this.loop(time));
    }

    readProgress() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        return saved && typeof saved === "object" ? saved : {};
      } catch {
        return {};
      }
    }

    saveProgress() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress)); } catch { /* local storage is optional */ }
    }

    populateDrivers() {
      this.els.drivers.innerHTML = "";
      DRIVERS.forEach((driver) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "driver-choice";
        button.dataset.driver = driver.id;
        button.innerHTML = `<span style="--driver:${driver.color};--accent:${driver.accent}"></span><strong>${driver.name}</strong><small>${driver.className}</small>`;
        button.addEventListener("click", () => {
          this.selectedDriver = driver.id;
          this.populateDrivers();
        });
        if (driver.id === this.selectedDriver) button.classList.add("selected");
        this.els.drivers.append(button);
      });
    }

    bindUI() {
      this.els.start.addEventListener("click", () => this.startRace());
      this.els.retry.addEventListener("click", () => this.startRace());
      this.els.resume.addEventListener("click", () => this.togglePause(false));
      this.els.menuButton.addEventListener("click", () => this.showMenu());
      this.els.resultMenuButton.addEventListener("click", () => this.showMenu());
      this.els.pauseButton.addEventListener("click", () => this.togglePause());
      this.els.soundButton.addEventListener("click", () => {
        this.audio.enabled = !this.audio.enabled;
        this.els.soundButton.textContent = this.audio.enabled ? "Lyd: til" : "Lyd: fra";
      });
      document.addEventListener("keydown", (event) => {
        if (event.code === "Escape") this.togglePause();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.race.state === "racing") this.togglePause(true);
      });
      document.querySelectorAll("[data-kart-control]").forEach((button) => {
        const control = button.dataset.kartControl;
        const set = (active) => this.input.setControl(control, active);
        button.addEventListener("pointerdown", (event) => { event.preventDefault(); set(true); button.setPointerCapture?.(event.pointerId); });
        ["pointerup", "pointercancel", "pointerleave"].forEach((name) => button.addEventListener(name, () => set(false)));
      });
    }

    startRace() {
      this.race.start(this.selectedDriver);
      this.paused = false;
      this.resultSaved = false;
      this.input.reset();
      this.els.menu.hidden = true;
      this.els.result.hidden = true;
      this.els.pause.hidden = true;
      this.audio.tone(440, 0.11, "triangle", 0.035);
      this.showToast("Klar til start!");
    }

    showMenu() {
      this.input.reset();
      this.paused = false;
      this.race.state = "ready";
      this.els.menu.hidden = false;
      this.els.result.hidden = true;
      this.els.pause.hidden = true;
    }

    togglePause(forcePause = false) {
      if (!["countdown", "racing"].includes(this.race.state)) return;
      this.paused = forcePause || !this.paused;
      this.input.reset();
      this.els.pause.hidden = !this.paused;
      this.els.pauseButton.textContent = this.paused ? "Fortsæt" : "Pause";
    }

    update(dt) {
      if (this.paused) return;
      const before = this.race.state;
      this.race.update(dt, this.input.read());
      if (before === "countdown" && this.race.state === "racing") this.audio.tone(660, 0.13, "square", 0.04);
      if (this.race.state === "finished" && !this.resultSaved) this.showResult();
    }

    async showResult() {
      this.resultSaved = true;
      const result = this.race.result;
      this.progress.bestTime = Math.min(this.progress.bestTime || Infinity, result.time);
      this.progress.bestScore = Math.max(this.progress.bestScore || 0, result.score);
      this.progress.completed = true;
      this.saveProgress();
      this.els.resultTitle.textContent = result.position === 1 ? "Du vandt!" : `Du blev nummer ${result.position}`;
      this.els.resultCopy.textContent = `${formatTime(result.time)} · ${result.score.toLocaleString("da-DK")} point`;
      this.els.result.hidden = false;
      this.audio.tone(result.position === 1 ? 880 : 250, 0.28, "triangle", 0.05);
      try {
        await window.WutborgHighscores?.submit({
          gameKey: "wutborg-kart",
          gameTitle: "Wutborg Kart",
          playerName: this.selectedDriver,
          score: result.score,
          outcome: result.position === 1 ? "won" : "completed",
          details: { position: result.position, seconds: Math.round(result.time * 100) / 100 },
        });
      } catch { /* local race result remains valid without highscores */ }
    }

    updateUI() {
      const player = this.race.player;
      const racing = this.race.state === "racing" || this.race.state === "countdown";
      this.els.position.textContent = player ? `${player.rank || 1}.` : "–";
      this.els.lap.textContent = player ? `${Math.min(player.lap + 1, this.race.lapTarget)}/${this.race.lapTarget}` : `1/${this.race.lapTarget}`;
      this.els.time.textContent = formatTime(this.race.elapsed);
      this.els.speed.textContent = player ? `${Math.round(Math.abs(player.speed) * 0.72)} km/t` : "0 km/t";
      this.els.item.textContent = player?.item ? `${ITEM_TYPES[player.item].icon} ${ITEM_TYPES[player.item].name}` : "—";
      this.els.best.textContent = this.progress.bestTime ? `Bedste: ${formatTime(this.progress.bestTime)}` : "Bedste: ingen endnu";
      this.els.pauseButton.disabled = !racing;
      if (this.race.state === "countdown") {
        const number = Math.ceil(this.race.countdown);
        this.els.countdown.textContent = number > 0 ? String(number) : "KØR!";
        this.els.countdown.hidden = false;
      } else {
        this.els.countdown.hidden = true;
      }
    }

    showToast(text) {
      this.els.toast.textContent = text;
      this.els.toast.classList.add("visible");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.els.toast.classList.remove("visible");
        this.els.toast.textContent = "";
      }, 1800);
    }

    loop(timestamp) {
      const elapsed = Math.min(0.25, Math.max(0, (timestamp - this.lastTime) / 1000));
      this.lastTime = timestamp;
      this.accumulator = Math.min(this.accumulator + elapsed, FIXED_STEP * MAX_STEPS);
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
        this.accumulator -= FIXED_STEP;
        this.update(FIXED_STEP);
        steps += 1;
      }
      this.renderer.draw(this.race);
      this.updateUI();
      requestAnimationFrame((time) => this.loop(time));
    }
  }

  const formatTime = (seconds) => {
    const safe = Math.max(0, seconds || 0);
    const minutes = Math.floor(safe / 60);
    const remainder = (safe % 60).toFixed(2).padStart(5, "0");
    return `${minutes}:${remainder}`;
  };

  window.WutborgKart = {
    data,
    formatTime,
    testHooks: { Kart, Race, RaceAI, InputManager, circularDistance },
  };

  if (typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", () => {
      if (document.getElementById("kart-canvas")) window.wutborgKartGame = new KartGame();
    });
  }
})();
