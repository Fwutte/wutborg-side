import * as THREE from "./vendor/three/three.module.js";
import { mergeGeometries } from "./vendor/three/addons/utils/BufferGeometryUtils.js";
import { surfaceTexture, glowTexture, softSprite, instancedDecor } from "./game-art-3d.js?v=20260911-art";

function batchArchitecture(group, shadows) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(), batches = new Map(), originals = new Set();
  group.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry); originals.add(object.geometry);
  });
  group.clear();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error("Borgstorm architecture could not be batched");
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = shadows; mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
  originals.forEach(g => g.dispose());
}

export function dressBattlefield(r) {
  const stone = surfaceTexture("stone", 2, 8);
  r.roadMaterial.map = stone; r.roadMaterial.bumpMap = stone; r.roadMaterial.bumpScale = .11;
  r.groundMaterial.map = surfaceTexture("grass", 18, 18);
  r.wallMaterial.map = surfaceTexture("stone", 1, 2); r.wallMaterial.bumpMap = r.wallMaterial.map; r.wallMaterial.bumpScale = .065;
  r.roadMarks.forEach(({ mesh }) => { mesh.visible = false; });
  const trim = new THREE.MeshStandardMaterial({ color: 0xbbaF99, roughness: .72 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x423e46, metalness: .75, roughness: .3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe9b559, metalness: .7, roughness: .28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17212d, roughness: .85 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
  const stones = [], caps = [], bushes = [], grass = [], blossoms = [], trunks = [], crowns = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const z = 7 - i * 1.2;
      caps.push({ position: [side * 6.05, 1.23, z], scale: [1.34, .16, 1.13] });
      if (i % 2 === 0) {
        stones.push({ position: [side * 6.05, 1.52, z], scale: [.9, .5, .55] });
        stones.push({ position: [side * 6.05, .65, z], scale: [1.38, 1.3, .5] });
      }
      const x = side * (8.5 + Math.sin(i * 7.2) * 1.4);
      bushes.push({ position: [x, .45, z], scale: [1.3, .65, .95], color: i % 2 ? "#426e50" : "#658951" });
      if (i % 3 === 0) {
        trunks.push({ position: [side * (11 + i % 3), 1.3, z], scale: [.35, 2.6, .35] });
        for (let n = 0; n < 4; n++) crowns.push({ position: [side * (11 + i % 3) + Math.cos(n * 2) * .7, 3 + Math.sin(n) * .7, z + Math.sin(n * 2) * .7], scale: [1.6, 1.6, 1.5], color: ["#537951", "#718e5a", "#406751", "#879857"][n] });
      }
    }
    for (let i = 0; i < (r.quality.compact ? 90 : 170); i++) {
      const z = -23 + (i * 2.173 % 31), x = side * (6.85 + (i * .713 % 4));
      grass.push({ position: [x, .16, z], rotation: [0, i, 0], scale: [.14, .2 + i % 4 * .08, .14] });
      if (i % 3 === 0) blossoms.push({ position: [x, .36, z], scale: [.1, .07, .1], color: i % 2 ? "#ffda83" : "#eac3dd" });
    }
  }
  instancedDecor(r.scene, new THREE.BoxGeometry(1, 1, 1), r.wallMaterial, stones);
  instancedDecor(r.scene, new THREE.BoxGeometry(1, 1, 1), trim, caps);
  r.artLeaves = [instancedDecor(r.scene, new THREE.SphereGeometry(1, 10, 7), leaf, bushes), instancedDecor(r.scene, new THREE.SphereGeometry(1, 12, 8), leaf, crowns)];
  r.artLeaves.forEach(mesh => { mesh.userData.baseColors = mesh.instanceColor.array.slice(); });
  instancedDecor(r.scene, new THREE.CylinderGeometry(.8, 1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x6b5147 }), trunks);
  r.artGrass = instancedDecor(r.scene, new THREE.ConeGeometry(1, 1, 3), r.propMaterial, grass, false);
  r.artFlowers = instancedDecor(r.scene, new THREE.SphereGeometry(1, 6, 4), leaf, blossoms, false);

  const add = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = !r.quality.compact; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  // Carved arch, columns, iron portcullis and roof bands on the distant keep.
  const facade = new THREE.Group(); r.fortress.add(facade);
  add(facade, new THREE.TorusGeometry(1.36, .23, 6, 18, Math.PI), trim, 0, 2.5, -18.04);
  for (const x of [-1.36, 1.36]) add(facade, new THREE.BoxGeometry(.46, 2.5, .4), trim, x, 1.25, -18.04);
  for (let x = -1; x <= 1; x += .25) add(facade, new THREE.BoxGeometry(.055, 2.8, .06), metal, x, 1.55, -18.04);
  for (const y of [.5, 1.35, 2.2]) add(facade, new THREE.BoxGeometry(2.3, .07, .09), metal, 0, y, -17.98);
  for (const x of [-3.7, 3.7]) {
    for (const y of [.3, 2, 4, 5.9]) add(facade, new THREE.CylinderGeometry(1.27, 1.32, .17, 16), trim, x, y, -18.8);
    add(facade, new THREE.BoxGeometry(.42, 1.2, .09), dark, x, 4.4, -17.5);
    add(facade, new THREE.ConeGeometry(.12, .8, 8), gold, x, 8.6, -18.8);
  }
  // Detail follows each destructible piece, including the falling gate.
  const gate = r.siegeParts[0], towers = r.siegeParts[1];
  for (const x of [-1.75, 1.75]) {
    add(gate, new THREE.BoxGeometry(.58, 2.5, .65), r.wallMaterial, x, 1.25, -5.7);
    add(gate, new THREE.BoxGeometry(.74, .2, .8), trim, x, .15, -5.7);
  }
  add(gate, new THREE.TorusGeometry(1.75, .3, 6, 16, Math.PI), trim, 0, 2.5, -5.7);
  for (let i = 0; i < 8; i++) add(gate, new THREE.SphereGeometry(.055, 6, 4), gold, (i % 4 - 1.5) * .72, i < 4 ? .5 : 1.6, -5.34);
  for (const x of [-4, 4]) {
    for (const y of [.18, 1.35, 3.65]) add(towers, new THREE.BoxGeometry(2.3, .17, 2.4), trim, x, y, -6);
    for (const dx of [-.88, .88]) add(towers, new THREE.BoxGeometry(.22, 3.8, .2), trim, x + dx, 1.95, -4.85);
    add(towers, new THREE.TorusGeometry(.27, .06, 6, 12, Math.PI), gold, x, 3.06, -4.8);
    add(towers, new THREE.ConeGeometry(.12, .65, 8), gold, x, 6.1, -6);
  }

  r.artGlow = glowTexture(); r.braziers = [];
  for (const side of [-1, 1]) for (const z of [-15, -6, 4]) {
    const x = side * 5.6;
    add(r.scene, new THREE.CylinderGeometry(.12, .2, 1.65, 8), metal, x, .9, z);
    add(r.scene, new THREE.CylinderGeometry(.32, .12, .25, 8, 1, true), gold, x, 1.77, z);
    const glow = softSprite(r.artGlow, 0xffaa43, 2.4, .6); glow.position.set(x, 2.05, z); r.scene.add(glow);
    const flame = add(r.scene, new THREE.SphereGeometry(.18, 10, 7), new THREE.MeshBasicMaterial({ color: 0xffdd84 }), x, 2.03, z); flame.scale.set(.85, 1.8, .85);
    r.braziers.push({ glow, flame });
  }
  const particleCount = r.quality.compact ? 45 : 100, positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) { positions[i * 3] = Math.sin(i * 45) * 14; positions[i * 3 + 1] = (i * 1.73) % 9; positions[i * 3 + 2] = 9 - (i * 3.17) % 34; }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  r.artMotes = new THREE.Points(geometry, new THREE.PointsMaterial({ map: r.artGlow, size: .16, transparent: true, opacity: .75, color: 0xffdc8d, depthWrite: false, blending: THREE.AdditiveBlending }));
  r.artMotes.frustumCulled = false; r.scene.add(r.artMotes);
  for (const group of [r.fortress, r.terraces, ...r.siegeParts]) batchArchitecture(group, !r.quality.compact);
}

export function animateBattlefield(r, run, dt) {
  const region = run.level.region.id;
  if (r.artRegion !== region) {
    r.artRegion = region;
    const tint = new THREE.Color(region === "frost" ? 0xe6f4ff : region === "volcano" ? 0x71515b : region === "royal" ? 0xbf8a58 : 0xffffff);
    const mix = region === "frost" ? .92 : region === "volcano" ? .85 : region === "royal" ? .7 : 0;
    r.artLeaves.forEach(mesh => {
      const color = new THREE.Color(), base = mesh.userData.baseColors;
      for(let i=0;i<mesh.count;i++){color.fromArray(base,i*3).lerp(tint,mix);mesh.setColorAt(i,color);}
      mesh.instanceColor.needsUpdate = true;
    });
    r.artFlowers.visible = region !== "frost" && region !== "volcano";
    r.artMotes.material.color.set(region === "frost" ? 0xffffff : region === "volcano" ? 0xff8a43 : 0xffdc8d);
    r.artMotes.material.size = region === "frost" ? .22 : .16;
  }
  r.roadMaterial.map.offset.y = -r.worldScroll / 48 * 8;
  r.braziers.forEach(({ glow, flame }, i) => {
    const pulse = r.reducedMotion ? 1 : 1 + Math.sin(r.time * 9 + i * 3) * .12 + Math.sin(r.time * 17 + i) * .06;
    flame.scale.y = 1.8 * pulse; glow.material.opacity = .5 * pulse;
  });
  if (!r.reducedMotion) {
    const p = r.artMotes.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, (p.getY(i) + dt * (region === "frost" ? -.7 : .25) + 9) % 9);
    p.needsUpdate = true;
    r.trackProps.forEach(({ flag, phase }) => {
      const p = flag.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 7 - r.time * 4 + phase) * .11 * (p.getX(i) + .42) / .84);
      p.needsUpdate = true; flag.geometry.computeVertexNormals();
    });
  }
}
