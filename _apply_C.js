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

// A+B: resetPlayer - nulstil flipped og speedMultiplier
R('resetPlayer flipped speed',
  '      state.jumpBuffer = 0;\n      state.coyote = 0;\n    }',
  '      state.jumpBuffer = 0;\n      state.coyote = 0;\n      state.flipped = false;\n      state.speedMultiplier = 1;\n    }');

// A+B: startGame - nulstil flipped og speedMultiplier
R('startGame flipped speed',
  '      state.attempts += 1;\n      state.holding = false;\n      resetPlayer();',
  '      state.attempts += 1;\n      state.holding = false;\n      state.flipped = false;\n      state.speedMultiplier = 1;\n      resetPlayer();');

// A+B: nextLevelOrWin - nulstil flipped og speedMultiplier
R('nextLevel flipped speed',
  '      state.collected = new Set();\n      state.particles = [];\n      state.rings = [];\n      resetPlayer();',
  '      state.collected = new Set();\n      state.particles = [];\n      state.rings = [];\n      state.flipped = false;\n      state.speedMultiplier = 1;\n      resetPlayer();');

// A: drawPlayer - vend kuben visuelt når flipped (flip vertikalt via scale)
R('drawPlayer flipped scale',
  '      ctx.save();\n      ctx.translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);\n      ctx.rotate(player.rotation);',
  '      ctx.save();\n      ctx.translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);\n      if (state.flipped) ctx.scale(1, -1);\n      ctx.rotate(player.rotation);');

// A+B: drawObjects - tegn flip og speedGate objekter + nye draw-funktioner
R('drawObjects flip speedGate',
  '        if (object.type === "shard" && !state.collected.has(object.x)) drawShard(screenX, object.y, object.radius, colors);\n      }\n    }\n\n    function drawSpike',
  '        if (object.type === "shard" && !state.collected.has(object.x)) drawShard(screenX, object.y, object.radius, colors);\n        if (object.type === "flip" && !state.collected.has("flip" + object.x)) drawFlipPortal(screenX, GROUND_Y, colors);\n        if (object.type === "speedGate" && !state.collected.has("speed" + object.x)) drawSpeedGate(screenX, GROUND_Y, colors, object.multiplier);\n      }\n    }\n\n    function drawFlipPortal(x, baseY, colors) {\n      ctx.save();\n      const t = performance.now() * 0.003;\n      const cx = x + 24;\n      const cy = baseY - 110;\n      ctx.globalAlpha = 0.85;\n      ctx.strokeStyle = colors.primary;\n      ctx.shadowColor = colors.primary;\n      ctx.shadowBlur = 22;\n      ctx.lineWidth = 4;\n      ctx.beginPath();\n      ctx.ellipse(cx, cy, 14, 110, 0, 0, Math.PI * 2);\n      ctx.stroke();\n      ctx.globalAlpha = 0.4 + Math.sin(t * 3) * 0.2;\n      ctx.fillStyle = colors.primary;\n      ctx.beginPath();\n      ctx.ellipse(cx, cy, 8, 90, 0, 0, Math.PI * 2);\n      ctx.fill();\n      ctx.restore();\n    }\n\n    function drawSpeedGate(x, baseY, colors, multiplier) {\n      ctx.save();\n      const t = performance.now() * 0.004;\n      const cx = x + 24;\n      const top = baseY - 200;\n      ctx.globalAlpha = 0.8;\n      ctx.strokeStyle = colors.secondary;\n      ctx.shadowColor = colors.secondary;\n      ctx.shadowBlur = 20;\n      ctx.lineWidth = 3;\n      for (let i = 0; i < 3; i++) {\n        const yo = top + i * 70 + Math.sin(t + i) * 6;\n        ctx.beginPath();\n        ctx.moveTo(cx - 22, yo);\n        ctx.lineTo(cx + 22, yo);\n        ctx.stroke();\n      }\n      ctx.shadowBlur = 0;\n      ctx.fillStyle = "#fff";\n      ctx.font = "900 13px system-ui, sans-serif";\n      ctx.textAlign = "center";\n      ctx.textBaseline = "middle";\n      ctx.fillText((multiplier < 1 ? "SLOW" : "FAST") + " x" + multiplier, cx, top - 14);\n      ctx.restore();\n    }\n\n    function drawSpike');

fs.writeFileSync(p, s, 'utf8');
console.log('SCRIPT 2b (A+B reset/draw) APPLIED:');
done.forEach((d) => console.log('  - ' + d));
