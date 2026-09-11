const assert = require("node:assert/strict");
require("../js/pokemon/type-chart.js");
require("../js/pokemon/battle-engine.js");
require("../js/pokemon/battle-engine.test.js");
const results = globalThis.runBattleEngineTests();
for (const result of results) assert.ok(result.passed, `${result.name}: ${result.error || ""}`);
console.log(`Pokémon: ${results.length} kampkontroller bestået, inklusive opbrugt PP.`);
