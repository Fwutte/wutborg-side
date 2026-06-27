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

// C1: State-tilføjelser for beat-system (efter attempts: 0)
R('state beat fields',
  '      attempts: 0,\n      flipped: false,',
  '      attempts: 0,\n      beat: 0,\n      beatActive: false,\n      flipped: false,');

// C2: BPM-konstant + beat-afspiller (efter reducedMotion-konstanten)
R('bpm const + startBeat',
  '    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;\n',
  '    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;\n    const BPM = 128;\n    const BEAT_INTERVAL = 60 / BPM;\n    let beatTimer = null;\n\n    function startBeat() {\n      if (state.beatActive || !audioContext) return;\n      state.beatActive = true;\n      let next = audioContext.currentTime + 0.05;\n      const tick = () => {\n        if (!state.beatActive) return;\n        state.beat = (state.beat + 1) % 4;\n        tone(state.beat === 0 ? 90 : 60, 0.06, "square", 0.05);\n        next += BEAT_INTERVAL;\n        const delay = Math.max(0, (next - audioContext.currentTime) * 1000);\n        beatTimer = setTimeout(tick, delay);\n      };\n      tick();\n    }\n\n    function stopBeat() {\n      state.beatActive = false;\n      if (beatTimer) { clearTimeout(beatTimer); beatTimer = null; }\n      state.beat = 0;\n    }\n');

// C3: Start beat når spillet starter (i startGame efter ensureAudio)
R('startGame startBeat',
  '    function startGame(practice = false) {\n      ensureAudio();\n      state.practice = practice;',
  '    function startGame(practice = false) {\n      ensureAudio();\n      startBeat();\n      state.practice = practice;');

// C4: Stop beat ved crash/win/overlay (i crash)
R('crash stopBeat',
  '    function crash() {\n      if (state.mode !== "playing") return;\n      state.mode = "crashed";',
  '    function crash() {\n      if (state.mode !== "playing") return;\n      stopBeat();\n      state.mode = "crashed";');

// C5: Stop beat ved completeGame
R('completeGame stopBeat',
  '    function completeGame() {\n      state.mode = "win";',
  '    function completeGame() {\n      stopBeat();\n      state.mode = "win";');

// C6: Stop beat ved togglePause (når pauseres)
R('togglePause stopBeat',
  '      if (state.mode === "playing") {\n        state.mode = "paused";\n        pauseButton.textContent = "Fortsaet";',
  '      if (state.mode === "playing") {\n        stopBeat();\n        state.mode = "paused";\n        pauseButton.textContent = "Fortsaet";');

// C7: Genoptag beat ved resume fra pause
R('togglePause resumeBeat',
  '      } else if (state.mode === "paused") {\n        state.mode = "playing";\n        pauseButton.textContent = "Pause";',
  '      } else if (state.mode === "paused") {\n        startBeat();\n        state.mode = "playing";\n        pauseButton.textContent = "Pause";');

// C8: drawBackground - puls-effekt på floor-linjen (efter floor fillRect glow)
R('drawBg beat pulse',
  '      ctx.fillStyle = colors.primary;\n      ctx.shadowColor = colors.primary;\n      ctx.shadowBlur = 20;\n      ctx.fillRect(-20, GROUND_Y - 5, WIDTH + 40, 7);\n      ctx.shadowBlur = 0;',
  '      const beatPulse = state.beatActive && state.beat === 0 ? 0.5 : 0;\n      ctx.fillStyle = colors.primary;\n      ctx.shadowColor = colors.primary;\n      ctx.shadowBlur = 20 + beatPulse * 30;\n      ctx.fillRect(-20, GROUND_Y - 5, WIDTH + 40, 7 + beatPulse * 3);\n      ctx.shadowBlur = 0;');

// C9: drawBackground - subtil baggrundspuls (overlay-farve ved beat 0)
R('drawBg sky pulse',
  '      ctx.fillStyle = sky;\n      ctx.fillRect(0, 0, WIDTH, HEIGHT);\n\n      ctx.save();\n      ctx.globalAlpha = 0.42;',
  '      ctx.fillStyle = sky;\n      ctx.fillRect(0, 0, WIDTH, HEIGHT);\n\n      if (state.beatActive && state.beat === 0) {\n        ctx.fillStyle = "rgba(255, 255, 255, 0.035)";\n        ctx.fillRect(0, 0, WIDTH, HEIGHT);\n      }\n\n      ctx.save();\n      ctx.globalAlpha = 0.42;');

fs.writeFileSync(p, s, 'utf8');
console.log('SCRIPT 3 (C beat system) APPLIED:');
done.forEach((d) => console.log('  - ' + d));
