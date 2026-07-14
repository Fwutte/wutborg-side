const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const logicSource = fs.readFileSync(path.join(root, "js", "battle-gates-3d-logic.js"), "utf8");
const sceneSource = fs.readFileSync(path.join(root, "js", "battle-gates-3d.js"), "utf8");
const gameSource = fs.readFileSync(path.join(root, "js", "battle-gates.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "battle-gates.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "css", "battle-gates.css"), "utf8");
const threeModuleSource = fs.readFileSync(path.join(root, "js", "vendor", "three", "three.module.js"), "utf8");
const threeCorePath = path.join(root, "js", "vendor", "three", "three.core.js");
const characterFiles = ["Knight.glb", "Rogue_Hooded.glb", "Barbarian.glb", "Rogue.glb"];
const browserWindow = {};
vm.runInNewContext(logicSource, { window: browserWindow, Math });

const logic = browserWindow.WutborgBattle3DLogic;
assert.ok(logic, "3D-styringslogikken skal være tilgængelig");
assert.equal(logic.laneForPosition(-0.01), 0, "Negativ position skal ramme venstre port");
assert.equal(logic.laneForPosition(0), 1, "Midten skal have en entydig højre port");
assert.equal(logic.laneForPosition(2.2), 1, "Positiv position skal ramme højre port");
assert.equal(logic.formationColumns(1), 3, "Små hære skal have en læsbar minimumsformation");
assert.equal(logic.formationColumns(200), 7, "Store hære skal være begrænset af instancing-budgettet");
assert.equal(logic.visibleUnits(1), 8, "En lille hær skal stadig have en synlig trop");
assert.equal(logic.visibleUnits(200), 42, "3D-rendereren må højst oprette 42 prototypefigurer");
assert.equal(logic.clamp(7, -3, 3), 3, "Styring må ikke forlade arenaen");

for (const token of ["PerspectiveCamera", "WebGLRenderer", "ACESFilmicToneMapping", "InstancedMesh", "GLTFLoader", "cloneSkeleton", "AnimationMixer", "CHARACTER_URLS", "Rogue_Hooded.glb", "Barbarian.glb", "Rogue.glb", "previewActors", "pointerdown", "setSteering", "onGateChoice(side)", "buildGateShape", "makeBlobShadow", "updateEnvironment", "this.laneGlows", "this.roadMarks", "TorusGeometry", "hazardType", "choice.operation", "choice.unit", "this.gateZ += dt", "Math.min(30, Math.max(1, Math.round(choice.value)))", "enemyCount <= 6 ? enemyCount", "new THREE.InstancedMesh(bodyGeometry", "meadow", "forest", "volcano", "frost", "royal"]) {
  assert.ok(sceneSource.includes(token), `3D-scenen skal indeholde ${token}`);
}
assert.ok(!sceneSource.includes("https://"), "Del 1 skal køre uden eksterne runtime-assets");

assert.match(gameSource, /await import\("\.\/battle-gates-3d\.js\?v=20260714-borg14"\)/, "Hovedspillet skal indlæse 3D uden at blokere Start-knappen");
assert.match(gameSource, /drawGateSilhouette/, "2D-reserven skal også tegne indholdsspecifikke porte");
assert.match(gameSource, /this\.gateTravel\+dt\*\.29/, "2D-reservens mål skal bevæge sig mod spilleren");
assert.match(gameSource, /enemyCount=Math\.min\(30,Math\.max\(1,Math\.round\(choice\.value\)\)\)/, "2D-reserven skal vise små fjendeantal én til én");
assert.match(htmlSource, /<script src="js\/battle-gates\.js\?v=20260714-borg14"><\/script>/, "Hovedspillet skal starte som et robust klassisk script");
assert.match(sceneSource, /this\.gateStartZ \+ \(-2\.15 - this\.gateStartZ\) \* eased/, "Det valgte mål skal bremse ved sammenstødspunktet");
assert.match(sceneSource, /transition - 0\.64/, "Den valgte port skal fade kontrolleret ud");
assert.doesNotMatch(sceneSource, /this\.makeActor\("soldier", true\)/, "Portens fjendeformation må ikke få en ekstra overlappende 3D-fjende");
assert.doesNotMatch(htmlSource, /<script type="module"/, "Et 3D-modul må ikke kunne blokere hele spillets opstart");
assert.match(htmlSource, /viewport-fit=cover/, "Mobilvisningen skal bruge hele skærmen omkring safe areas");
assert.match(htmlSource, /battle-gates\.css\?v=20260714-borg12/, "Mobil-CSS skal have en frisk cacheversion");
assert.match(cssSource, /height:100dvh/, "Mobilspillet skal fylde telefonens dynamiske viewport");
assert.match(cssSource, /\.battle-hero,\.battle-help,\.battle-footer \{ display:none; \}/, "Sekundært sideindhold skal skjules i mobilspillet");
assert.match(cssSource, /\.battle-canvas \{ width:100%; height:100%; aspect-ratio:auto; \}/, "Arenaen skal udfylde den ledige mobilhøjde");
assert.match(threeModuleSource, /from '\.\/three\.core\.js'/, "Three.js-modulet skal importere sin kerne");
assert.ok(fs.statSync(threeCorePath).size > 1_000_000, "Den komplette lokale Three.js-kerne skal være med");

for (const file of characterFiles) {
const characterPath = path.join(root, "assets", "borgstorm-3d", "kaykit-adventurers", file);
const glb = fs.readFileSync(characterPath);
assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF", file + " skal være en gyldig binær glTF-fil");
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/, ""));
const animationNames = new Set((gltf.animations || []).map((animation) => animation.name));
for (const animation of ["Idle", "Running_A", "1H_Melee_Attack_Slice_Horizontal", "Block_Hit", "Hit_A", "Death_A", "Cheer"]) {
  assert.ok(animationNames.has(animation), file + " skal indeholde animationen " + animation);
}
assert.ok(animationNames.size >= 70, file + " skal have et komplet animationsbibliotek");
}

console.log("Borgstorm 3D-test: formation, fem regioner, fire lokale KayKit-figurtyper og animationer bestået");
