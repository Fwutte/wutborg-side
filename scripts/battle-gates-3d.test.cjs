const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const logicSource = fs.readFileSync(path.join(root, "js", "battle-gates-3d-logic.js"), "utf8");
const sceneSource = fs.readFileSync(path.join(root, "js", "battle-gates-3d.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "battle-gates.html"), "utf8");
const characterPath = path.join(root, "assets", "borgstorm-3d", "kaykit-adventurers", "Knight.glb");
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

for (const token of ["PerspectiveCamera", "WebGLRenderer", "InstancedMesh", "GLTFLoader", "cloneSkeleton", "AnimationMixer", "pointerdown", "setSteering", "onGateChoice(side)", "meadow", "forest", "volcano", "frost", "royal"]) {
  assert.ok(sceneSource.includes(token), `3D-scenen skal indeholde ${token}`);
}
assert.ok(!sceneSource.includes("https://"), "Del 1 skal køre uden eksterne runtime-assets");

assert.match(htmlSource, /<script type="module" src="js\/battle-gates\.js\?v=20260713-borg4"><\/script>/, "Hovedspillet skal vente pÃ¥ 3D-modulet");

const glb = fs.readFileSync(characterPath);
assert.equal(glb.subarray(0, 4).toString("ascii"), "glTF", "KayKit-figuren skal være en gyldig binær glTF-fil");
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/, ""));
const animationNames = new Set((gltf.animations || []).map((animation) => animation.name));
for (const animation of ["Idle", "Running_A", "1H_Melee_Attack_Slice_Horizontal", "Block_Hit", "Hit_A", "Death_A", "Cheer"]) {
  assert.ok(animationNames.has(animation), `KayKit-figuren skal indeholde animationen ${animation}`);
}
assert.ok(animationNames.size >= 70, "Del 2-figuren skal have et komplet animationsbibliotek");

console.log("Borgstorm 3D-test: formation, fem regioner, lokal KayKit-figur og animationer bestået");
