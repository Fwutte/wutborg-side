const fs = require('fs');
const p = 'c:\\wutborg-side\\wutborg-side\\geometry-dash.html';
let s = fs.readFileSync(p, 'utf8');
const done = [];
function R(label, find, repl) {
  const i = s.indexOf(find);
  if (i === -1) throw new Error('NOT FOUND: ' + label);
  if (s.indexOf(find, i + 1) !== -1) throw new Error('NOT UNIQUE: ' + label);
  s = s.replace(find, repl);
  done.push(label);
}

// A: update - brug flipped til at bestemme gravity-retning
R('update gravity direction',
  '      player.previousY = player.y;\n      player.vy += level.gravity * delta;\n      player.vy = clamp(player.vy, -980, 980);\n      player.y += player.vy * delta;\n      player.onGround = false;\n\n      if (player.y + PLAYER_SIZE >= GROUND_Y) {',
  '      player.previousY = player.y;\n      const gravityDir = state.flipped ? -1 : 1;\n      player.vy += level.gravity * gravityDir * delta;\n      player.vy = clamp(player.vy, -980, 980);\n      player.y += player.vy * delta;\n      player.onGround = false;\n\n      if (!state.flipped && player.y + PLAYER_SIZE >= GROUND_Y) {');

// A: update - loftet (når flipped)
R('update ceiling ground',
  '        player.y = GROUND_Y - PLAYER_SIZE;\n        player.vy = 0;\n        player.onGround = true;\n        state.coyote = 0.09;\n      }\n\n      const rect = {',
  '        player.y = GROUND_Y - PLAYER_SIZE;\n        player.vy = 0;\n        player.onGround = true;\n        state.coyote = 0.09;\n      }\n      if (state.flipped && player.y <= 0) {\n        player.y = 0;\n        player.vy = 0;\n        player.onGround = true;\n        state.coyote = 0.09;\n      }\n\n      const rect = {');

// A + B: update - håndter flip og speedGate objekter i kollision-loopet
R('update flip speedGate handling',
  '        if (object.type === "shard" && !state.collected.has(object.x)) {\n          const dx = rect.x + rect.width / 2 - screenX;\n          const dy = rect.y + rect.height / 2 - object.y;\n          if (Math.hypot(dx, dy) < object.radius + 24) {\n            state.collected.add(object.x);\n            spawnParticles(screenX, object.y, level.colors.secondary, 22, 210);\n            state.rings.push({ x: screenX, y: object.y, radius: 18, life: 0.55, color: level.colors.secondary });\n            state.score += 125;\n            playCollect();\n          }\n        }\n      }',
  '        if (object.type === "shard" && !state.collected.has(object.x)) {\n          const dx = rect.x + rect.width / 2 - screenX;\n          const dy = rect.y + rect.height / 2 - object.y;\n          if (Math.hypot(dx, dy) < object.radius + 24) {\n            state.collected.add(object.x);\n            spawnParticles(screenX, object.y, level.colors.secondary, 22, 210);\n            state.rings.push({ x: screenX, y: object.y, radius: 18, life: 0.55, color: level.colors.secondary });\n            state.score += 125;\n            playCollect();\n          }\n        }\n\n        if (object.type === "flip" && !state.collected.has("flip" + object.x)) {\n          if (screenX < PLAYER_X + PLAYER_SIZE) {\n            state.flipped = !state.flipped;\n            state.collected.add("flip" + object.x);\n            state.rings.push({ x: screenX, y: GROUND_Y / 2, radius: 24, life: 0.6, color: level.colors.primary });\n            spawnParticles(screenX, GROUND_Y / 2, level.colors.primary, 16, 180);\n            player.vy = level.jump * (state.flipped ? 1 : -1);\n            playCollect();\n          }\n        }\n\n        if (object.type === "speedGate" && !state.collected.has("speed" + object.x)) {\n          if (screenX < PLAYER_X + PLAYER_SIZE) {\n            state.speedMultiplier = object.multiplier;\n            state.collected.add("speed" + object.x);\n            state.rings.push({ x: screenX, y: GROUND_Y / 2, radius: 26, life: 0.6, color: level.colors.secondary });\n            spawnParticles(screenX, GROUND_Y / 2, level.colors.secondary, 16, 200);\n            playCollect();\n          }\n        }\n      }');

// B: update - anvend speedMultiplier på scroll
R('update scroll speed',
  '      state.scroll += level.speed * delta;',
  '      state.scroll += level.speed * state.speedMultiplier * delta;');

// B: updateHud - vis fart (tempo) med multiplier
R('updateHud tempo multiplier',
  '      const speed = currentLevel().speed;\n      tempoElement.textContent = `${Math.round((speed / LEVELS[0].speed) * 100)}%`;\n      attemptsElement.textContent = String(state.attempts);',
  '      const speed = currentLevel().speed * state.speedMultiplier;\n      tempoElement.textContent = `${Math.round((speed / LEVELS[0].speed) * 100)}%`;\n      attemptsElement.textContent = String(state.attempts);');

fs.writeFileSync(p, s, 'utf8');
console.log('SCRIPT 2a (A+B update logic) APPLIED:');
done.forEach((d) => console.log('  - ' + d));
