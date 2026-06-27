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

// ===== A + B: Nye objekt-typer (flip/speedGate) i LEVELS =====
// A1: Tilføj flip + speedGate objekter i niveau 2 (Pulse City) - tyngdekraftsvending
R('level2 flip+speed',
  '          spike(4570), block(4870, 120, 50), spike(5205)\n        ]\n      },',
  '          spike(4570), block(4870, 120, 50), spike(5205),\n          flip(4900), block(5100, 120, 50), speedGate(5350, 1.5), spike(5500)\n        ]\n      },');

// A2: Niveau 3 (Final Sync) - flip portal i en sektion
R('level3 flip',
  '          spike(4300), spike(4360), block(4680, 140, 54), spike(5055),\n          block(5320, 70, 96), shard(5525, 252), spike(5825), spike(5885), block(6155, 92, 52)\n        ]',
  '          spike(4300), spike(4360), block(4680, 140, 54), spike(5055),\n          speedGate(5150, 0.6), flip(5250), block(5320, 70, 96), shard(5525, 252),\n          flip(5700), spike(5825), spike(5885), block(6155, 92, 52)\n        ]');

// B1: Helper-funktioner flip() og speedGate() - tilføj efter shard()
R('helpers flip speedGate',
  '    function shard(x, y) {\n      return { type: "shard", x, y, radius: 17 };\n    }\n\n    function currentLevel()',
  '    function shard(x, y) {\n      return { type: "shard", x, y, radius: 17 };\n    }\n\n    function flip(x) {\n      return { type: "flip", x };\n    }\n\n    function speedGate(x, multiplier) {\n      return { type: "speedGate", x, multiplier };\n    }\n\n    function currentLevel()');

// A3 + B2: State-tilføjelser - flipped (gravity-retning), speedMultiplier, baseSpeed
R('state flipped speed',
  '      holding: false,\n      attempts: 0,\n      collected: new Set(),',
  '      holding: false,\n      attempts: 0,\n      flipped: false,\n      speedMultiplier: 1,\n      collected: new Set(),');

fs.writeFileSync(p, s, 'utf8');
console.log('SCRIPT 1 (A+B setup) APPLIED:');
done.forEach((d) => console.log('  - ' + d));
