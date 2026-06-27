const fs = require('fs');
const s = fs.readFileSync('geometry-dash.html', 'utf8');
const checks = [
  'state.flipped = !state.flipped;',
  'state.speedMultiplier = object.multiplier',
  'if (state.flipped) ctx.scale(1, -1);',
  'function drawFlipPortal',
  'function drawSpeedGate',
  'const gravityDir = state.flipped ? -1 : 1;',
  'state.scroll += level.speed * state.speedMultiplier * delta;',
  'flip(4900)',
  'speedGate(5350, 1.5)',
  'flip(5250)',
  'flip(5700)'
];
let ok = true;
checks.forEach((c) => {
  const found = s.includes(c);
  if (!found) ok = false;
  console.log((found ? 'OK   ' : 'MISS ') + c);
});
console.log(ok ? '\nA+B ALL PRESENT' : '\nSOME MISSING');
