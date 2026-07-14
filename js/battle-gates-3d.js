import * as THREE from "./vendor/three/three.module.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "./vendor/three/addons/utils/SkeletonUtils.js";

const logic = window.WutborgBattle3DLogic;
const CHARACTER_URL = new URL("../assets/borgstorm-3d/kaykit-adventurers/Knight.glb", import.meta.url).href;
const ACTIONS = {
  idle: "Idle",
  run: "Running_A",
  attack: "1H_Melee_Attack_Slice_Horizontal",
  block: "Block_Hit",
  hit: "Hit_A",
  death: "Death_A",
  cheer: "Cheer",
};
const THEMES = {
  meadow: { sky: 0x91cadd, fog: 0x91cadd, ground: 0x6fa665, road: 0xd8cdb2, wall: 0x7895a0, accent: 0xe79a51, prop: 0x4e8b57 },
  forest: { sky: 0x6fa99a, fog: 0x6fa99a, ground: 0x315e4d, road: 0x777b72, wall: 0x526b5e, accent: 0xd9a64c, prop: 0x1f5f40 },
  volcano: { sky: 0xb97a66, fog: 0xb97a66, ground: 0x4d2b31, road: 0x696064, wall: 0x64353d, accent: 0xf06a3e, prop: 0x9f382f },
  frost: { sky: 0xb8dbea, fog: 0xb8dbea, ground: 0x7899aa, road: 0xa7b5bd, wall: 0x5e7d91, accent: 0x65b9dc, prop: 0xd8f5ff },
  royal: { sky: 0xd9c88c, fog: 0xd9c88c, ground: 0x4d5945, road: 0x756d78, wall: 0x692e63, accent: 0xe5b948, prop: 0x8c477f },
};
const UNIT_COLORS = { soldier: 0x3d7dde, archer: 0x42b98e, shield: 0x696fd2, giant: 0xde803f, enemy: 0xc94b53, boss: 0xe0a52f };

export class BattleScene3D {
  constructor(canvas, onGateChoice) {
    if (!logic) throw new Error("Borgstorm 3D-logikken er ikke indlæst.");
    this.canvas = canvas;
    this.onGateChoice = onGateChoice;
    this.time = 0;
    this.steering = 0;
    this.targetX = 0;
    this.formationX = 0;
    this.formationZ = 2.7;
    this.gateZ = -12.2;
    this.lastGateKey = "";
    this.lastGateIndex = -1;
    this.lastLevelId = -1;
    this.lastUnitSignature = "";
    this.cameraShake = 0;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = matchMedia("(max-width: 720px)").matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    this.quality = { compact, actorCount: compact ? 6 : 12, enemyCount: compact ? 3 : 6, particles: compact ? 48 : 96 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 10, 0.1, 80);
    this.camera.position.set(0, 7.5, 11.4);
    this.camera.lookAt(0, 0, -7.2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !compact, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.2 : 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !compact;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(new THREE.HemisphereLight(0xe8f7ff, 0x385847, 2.1));
    this.sun = new THREE.DirectionalLight(0xfff4cf, 2.5);
    this.sun.position.set(-7, 10, 6);
    this.sun.castShadow = !compact;
    this.sun.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
    this.scene.add(this.sun);

    this.buildArena();
    this.buildGates();
    this.buildArmy();
    this.buildEncounter();
    this.buildVfx();
    this.resize = () => this.resizeRenderer();
    window.addEventListener("resize", this.resize);
    this.bindPointer();
    this.resizeRenderer();
    this.loadCharacterAsset();
  }

  buildArena() {
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6fa665, roughness: 1 });
    this.roadMaterial = new THREE.MeshStandardMaterial({ color: 0xd8cdb2, roughness: 0.94 });
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0x7895a0, roughness: 0.84 });
    this.accentMaterial = new THREE.MeshStandardMaterial({ color: 0xe79a51, roughness: 0.72 });
    this.propMaterial = new THREE.MeshStandardMaterial({ color: 0x4e8b57, roughness: 0.9 });

    const grass = new THREE.Mesh(new THREE.PlaneGeometry(46, 48), this.groundMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.08, -9);
    grass.receiveShadow = true;
    this.scene.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(11, 48), this.roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.03, -9);
    road.receiveShadow = true;
    this.scene.add(road);

    this.arenaWalls = [];
    this.themeProps = [];
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.2, 31), this.wallMaterial);
      wall.position.set(side * 6.05, 0.55, -8);
      wall.castShadow = !this.quality.compact;
      wall.receiveShadow = true;
      this.scene.add(wall);
      this.arenaWalls.push(wall);
      for (let index = 0; index < 12; index += 1) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 1.1), this.accentMaterial);
        step.position.set(side * 8.2, 0.15 + index * 0.075, 4 - index * 1.7);
        step.rotation.y = side * 0.12;
        this.scene.add(step);
      }
      for (let index = 0; index < 10; index += 1) {
        const prop = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.85, 7), this.wallMaterial);
        trunk.position.y = 0.42;
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.35, 7), this.propMaterial);
        crown.position.y = 1.25;
        crown.castShadow = !this.quality.compact;
        prop.add(trunk, crown);
        prop.position.set(side * (7.2 + (index % 3) * 0.9), 0, 6 - index * 2.35);
        prop.rotation.y = index * 1.17;
        this.scene.add(prop);
        this.themeProps.push({ root: prop, trunk, crown });
      }
    }

    this.fortress = new THREE.Group();
    const keep = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.8, 2.4), this.wallMaterial);
    keep.position.set(0, 2.35, -19.5);
    keep.castShadow = true;
    this.fortress.add(keep);
    for (const x of [-3.7, 3.7]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 6.2, 8), this.wallMaterial);
      tower.position.set(x, 3.05, -18.8);
      tower.castShadow = true;
      this.fortress.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.1, 8), this.accentMaterial);
      roof.position.set(x, 7.2, -18.8);
      this.fortress.add(roof);
    }
    this.scene.add(this.fortress);
  }

  makeLabel() {
    const texture = new THREE.CanvasTexture(document.createElement("canvas"));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.1, 1.12, 1);
    return { sprite, texture };
  }

  drawLabel(gate, choice) {
    const canvas = gate.label.texture.image;
    canvas.width = 512;
    canvas.height = 270;
    const ctx = canvas.getContext("2d");
    const palette = choice.type === "tower" ? ["#8f3f43", "#f3b86b"] : choice.type === "hazard" ? ["#4a4354", "#d9c3a0"] : choice.type === "recruit" ? ["#356e9c", "#bde5ff"] : ["#327e55", "#d9f1a6"];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(20,36,55,.9)";
    ctx.roundRect(20, 26, 472, 218, 36);
    ctx.fill();
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.fillStyle = "#fffaf0";
    ctx.font = "900 108px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(choice.label, 256, 118);
    ctx.fillStyle = palette[1];
    ctx.font = "800 34px Arial";
    ctx.fillText(choice.hint.toUpperCase(), 256, 187);
    gate.label.texture.needsUpdate = true;
  }

  gatePalette(choice) {
    if (choice.type === "tower") return { main: choice.boss ? 0x9a5238 : 0x8f4a45, accent: choice.boss ? 0xf2c14d : 0xd98a55, dark: 0x3a2930 };
    if (choice.type === "hazard") return { main: choice.hazardType === "fire" ? 0x8d3940 : 0x59535d, accent: choice.hazardType === "fire" ? 0xff9b42 : 0xd9c3a0, dark: 0x292733 };
    if (choice.type === "recruit") return { main: UNIT_COLORS[choice.unit] || 0x4589bd, accent: 0xc6edff, dark: 0x243d59 };
    const positive = choice.operation === "add" || choice.operation === "multiply";
    return { main: positive ? 0x3d9b68 : 0xad4858, accent: positive ? 0xd9f1a6 : 0xffc3ad, dark: positive ? 0x204f40 : 0x572d3b };
  }

  clearGateShape(gate) {
    const geometries = new Set();
    const materials = new Set();
    gate.shape.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    gate.shape.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    gate.materials = [];
  }

  buildGateShape(gate, choice) {
    this.clearGateShape(gate);
    const palette = this.gatePalette(choice);
    const material = (color, roughness = 0.72) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness });
      gate.materials.push(value);
      return value;
    };
    const main = material(palette.main);
    const accent = material(palette.accent, 0.62);
    const dark = material(palette.dark, 0.86);
    const add = (geometry, gateMaterial, x, y, z = 0, rz = 0, scale = null) => {
      const mesh = new THREE.Mesh(geometry, gateMaterial);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      if (scale) mesh.scale.set(...scale);
      mesh.castShadow = !this.quality.compact;
      gate.shape.add(mesh);
      return mesh;
    };
    const box = (width, height, x, y, gateMaterial = main, rz = 0, depth = 0.48) => add(new THREE.BoxGeometry(width, height, depth), gateMaterial, x, y, 0, rz);

    if (choice.type === "tower") {
      const enemyCount = Math.min(30, Math.max(1, Math.round(choice.value)));
      const columns = enemyCount <= 6 ? enemyCount : Math.min(6, Math.ceil(Math.sqrt(enemyCount * 1.45)));
      const bodyGeometry = new THREE.BoxGeometry(0.27, 0.42, 0.19);
      const headGeometry = new THREE.SphereGeometry(0.15, 8, 6);
      const helmetGeometry = new THREE.ConeGeometry(0.18, 0.2, 5);
      const bodies = new THREE.InstancedMesh(bodyGeometry, main, enemyCount);
      const heads = new THREE.InstancedMesh(headGeometry, accent, enemyCount);
      const helmets = new THREE.InstancedMesh(helmetGeometry, dark, enemyCount);
      const dummy = new THREE.Object3D();
      const scale = choice.boss ? 1.35 : enemyCount <= 6 ? 1.3 : 1;
      for (let index = 0; index < enemyCount; index += 1) {
        const row = Math.floor(index / columns);
        const rowCount = Math.min(columns, enemyCount - row * columns);
        const column = index % columns;
        const x = (column - (rowCount - 1) / 2) * 0.46 * scale;
        const z = row * 0.34;
        dummy.position.set(x, 0.34 * scale, z);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        bodies.setMatrixAt(index, dummy.matrix);
        dummy.position.y = 0.67 * scale;
        dummy.updateMatrix();
        heads.setMatrixAt(index, dummy.matrix);
        dummy.position.y = 0.83 * scale;
        dummy.updateMatrix();
        helmets.setMatrixAt(index, dummy.matrix);
      }
      for (const mesh of [bodies, heads, helmets]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = !this.quality.compact;
        gate.shape.add(mesh);
      }
    } else if (choice.type === "hazard" && choice.hazardType === "boulder") {
      add(new THREE.TorusGeometry(1.05, 0.3, 7, 16), main, 0, 1.34, 0);
      [[-1.13, 0.55, 0.52], [1.13, 0.55, 0.52], [0, 2.55, 0.58]].forEach(([x, y, size]) => add(new THREE.DodecahedronGeometry(size), accent, x, y, 0.05));
      box(1.42, 1.58, 0, 1.16, dark, 0, 0.34);
    } else if (choice.type === "hazard" && choice.hazardType === "fire") {
      box(0.5, 2.35, -1.05, 1.18, main, -0.08);
      box(0.5, 2.35, 1.05, 1.18, main, 0.08);
      box(2.35, 0.42, 0, 2.22, main);
      [-1.05, -0.35, 0.35, 1.05].forEach((x, index) => {
        add(new THREE.ConeGeometry(0.3, 0.88 + (index % 2) * 0.25, 6), accent, x, 2.76, 0.05);
        add(new THREE.ConeGeometry(0.15, 0.52, 6), material(0xffe06a, 0.55), x, 2.68, 0.18);
      });
    } else if (choice.type === "hazard") {
      box(0.45, 2.45, -1.08, 1.22, main, -0.12);
      box(0.45, 2.45, 1.08, 1.22, main, 0.12);
      box(2.4, 0.4, 0, 2.28, main);
      [-0.9, -0.45, 0, 0.45, 0.9].forEach((x) => {
        add(new THREE.ConeGeometry(0.23, 0.78, 5), accent, x, 0.39, 0.12);
        const upper = add(new THREE.ConeGeometry(0.21, 0.66, 5), accent, x, 1.9, 0.12);
        upper.rotation.z = Math.PI;
      });
    } else if (choice.type === "recruit" && choice.unit === "shield") {
      add(new THREE.TorusGeometry(1.08, 0.3, 8, 18), main, 0, 1.35, 0);
      const crest = add(new THREE.SphereGeometry(0.74, 12, 8), accent, 0, 2.05, -0.04, 0, [1, 0.72, 0.22]);
      crest.rotation.x = -0.1;
      box(1.35, 1.55, 0, 1.08, dark, 0, 0.35);
    } else if (choice.type === "recruit" && choice.unit === "archer") {
      for (const x of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.12, 0.12, 2.38, 8), main, x, 1.18, 0);
        add(new THREE.ConeGeometry(0.31, 0.72, 5), accent, x, 2.69, 0);
      }
      box(2.3, 0.35, 0, 2.18, main);
      box(1.45, 1.7, 0, 1.05, dark, 0, 0.34);
    } else if (choice.type === "recruit") {
      box(0.9, 2.75, -1.05, 1.37, main);
      box(0.9, 2.75, 1.05, 1.37, main);
      box(2.92, 0.68, 0, 2.5, accent);
      box(1.22, 1.72, 0, 0.92, dark, 0, 0.52);
    } else if (choice.operation === "multiply") {
      box(0.46, 2.35, -1.02, 1.15, main, -0.12);
      box(0.46, 2.35, 1.02, 1.15, main, 0.12);
      box(0.3, 1.3, -0.28, 2.58, accent, 0.68, 0.32);
      box(0.3, 1.3, 0.28, 2.58, accent, -0.68, 0.32);
    } else if (choice.operation === "divide") {
      box(0.46, 2.45, -1.15, 1.22, main);
      box(0.46, 2.45, 1.15, 1.22, main);
      box(2.65, 0.42, 0, 2.3, main);
      box(0.3, 1.95, 0, 1.15, accent);
      add(new THREE.SphereGeometry(0.22, 10, 8), accent, 0, 2.76, 0.05);
      add(new THREE.SphereGeometry(0.22, 10, 8), accent, 0, 0.22, 0.05);
    } else if (choice.operation === "subtract") {
      box(0.48, 2.48, -0.92, 1.23, main, -0.17);
      box(0.48, 2.48, 0.92, 1.23, main, 0.17);
      box(2.05, 0.48, 0, 2.02, main);
      box(1.18, 0.24, 0, 2.72, accent, 0, 0.32);
    } else {
      box(0.5, 2.4, -1.05, 1.2, main);
      box(0.5, 2.4, 1.05, 1.2, main);
      box(2.55, 0.44, 0, 2.25, main);
      box(0.3, 1.22, 0, 2.73, accent, 0, 0.32);
      box(1.22, 0.3, 0, 2.73, accent, 0, 0.32);
    }
  }

  buildGates() {
    this.gates = [-1, 1].map((side) => {
      const group = new THREE.Group();
      group.position.set(side * 3, 0, this.gateZ);
      const shape = new THREE.Group();
      group.add(shape);
      const label = this.makeLabel();
      label.sprite.position.set(0, 3.75, 0.15);
      group.add(label.sprite);
      this.scene.add(group);
      return { side, group, shape, label, materials: [] };
    });
  }

  buildArmy() {
    this.army = new THREE.Group();
    this.scene.add(this.army);
    const body = new THREE.BoxGeometry(0.22, 0.32, 0.16);
    const head = new THREE.SphereGeometry(0.12, 8, 6);
    const helmet = new THREE.ConeGeometry(0.15, 0.18, 5);
    this.bodyMesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: UNIT_COLORS.soldier, roughness: 0.68 }), 42);
    this.headMesh = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xf2c38e, roughness: 0.9 }), 42);
    this.helmetMesh = new THREE.InstancedMesh(helmet, new THREE.MeshStandardMaterial({ color: 0x2c558e, roughness: 0.57 }), 42);
    for (const mesh of [this.bodyMesh, this.headMesh, this.helmetMesh]) {
      mesh.castShadow = !this.quality.compact;
      mesh.receiveShadow = true;
      this.army.add(mesh);
    }
    this.riggedArmy = new THREE.Group();
    this.army.add(this.riggedArmy);
    this.marker = this.makeLabel();
    this.marker.sprite.scale.set(1.25, 0.67, 1);
    this.marker.sprite.position.set(0, 1.48, 0.2);
    this.army.add(this.marker.sprite);
    this.actors = [];
  }

  buildEncounter() {
    this.encounter = new THREE.Group();
    this.scene.add(this.encounter);
    this.enemyActors = [];
    this.hazards = new THREE.Group();
    for (let index = 0; index < 9; index += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.72, 5), new THREE.MeshStandardMaterial({ color: 0xd7c3a2, roughness: 0.7 }));
      spike.position.set((index % 3 - 1) * 0.46, 0.36, Math.floor(index / 3) * 0.43);
      spike.castShadow = !this.quality.compact;
      this.hazards.add(spike);
    }
    this.hazards.visible = false;
    this.encounter.add(this.hazards);
  }

  buildVfx() {
    this.particleCursor = 0;
    this.particleLife = new Float32Array(this.quality.particles);
    this.particleVelocity = Array.from({ length: this.quality.particles }, () => new THREE.Vector3());
    const positions = new Float32Array(this.quality.particles * 3);
    const colors = new Float32Array(this.quality.particles * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.particlePoints = new THREE.Points(geometry, new THREE.PointsMaterial({ size: this.quality.compact ? 0.13 : 0.17, vertexColors: true, transparent: true, opacity: 0.94, depthWrite: false }));
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
  }

  async loadCharacterAsset() {
    this.canvas.dataset.battle3dAssets = "loading";
    try {
      const gltf = await new GLTFLoader().loadAsync(CHARACTER_URL);
      this.characterAsset = { scene: gltf.scene, animations: gltf.animations, clips: new Map(gltf.animations.map((clip) => [clip.name, clip])) };
      this.createRiggedActors();
      this.canvas.dataset.battle3dAssets = "ready";
      this.canvas.dispatchEvent(new CustomEvent("battle3dassetsready"));
    } catch (error) {
      this.canvas.dataset.battle3dAssets = "fallback";
      console.warn("KayKit-figuren kunne ikke indlæses; bruger low-poly formation.", error);
    }
  }

  makeActor(type, enemy = false) {
    const root = cloneSkeleton(this.characterAsset.scene);
    const tint = new THREE.Color(UNIT_COLORS[enemy ? "enemy" : type] || UNIT_COLORS.soldier);
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = !this.quality.compact;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.material = object.material.clone();
      if (object.material.color) object.material.color.lerp(tint, enemy ? 0.42 : 0.2);
    });
    const scale = type === "giant" ? 0.62 : 0.46;
    root.scale.setScalar(scale);
    root.rotation.y = Math.PI;
    const mixer = new THREE.AnimationMixer(root);
    const actor = { root, mixer, type, enemy, action: null, actionName: "" };
    this.setActorAction(actor, enemy ? "idle" : "run");
    return actor;
  }

  createRiggedActors() {
    this.riggedArmy.clear();
    this.encounter.remove(...this.enemyActors.map((actor) => actor.root));
    this.actors = [];
    this.enemyActors = [];
    for (let index = 0; index < this.quality.actorCount; index += 1) {
      const actor = this.makeActor("soldier");
      this.riggedArmy.add(actor.root);
      this.actors.push(actor);
    }
    for (let index = 0; index < this.quality.enemyCount; index += 1) {
      const actor = this.makeActor("soldier", true);
      actor.root.visible = false;
      this.encounter.add(actor.root);
      this.enemyActors.push(actor);
    }
  }

  setActorAction(actor, actionName, once = false, restart = false) {
    if (!this.characterAsset || (actor.actionName === actionName && !restart)) return;
    const clip = this.characterAsset.clips.get(ACTIONS[actionName]);
    if (!clip) return;
    const next = actor.mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    if (actor.action) next.crossFadeFrom(actor.action, 0.16, true);
    next.play();
    actor.action = next;
    actor.actionName = actionName;
  }

  updateActorTypes(run) {
    if (!this.characterAsset) return;
    const signature = `${run.units.archer}-${run.units.shield}-${run.units.giant}`;
    if (signature === this.lastUnitSignature) return;
    this.lastUnitSignature = signature;
    const types = [];
    for (const type of ["giant", "shield", "archer"]) for (let index = 0; index < Math.min(this.quality.actorCount, run.units[type]); index += 1) types.push(type);
    while (types.length < this.quality.actorCount) types.push("soldier");
    this.actors.forEach((actor, index) => {
      const type = types[index];
      actor.type = type;
      const tint = new THREE.Color(UNIT_COLORS[type]);
      actor.root.scale.setScalar(type === "giant" ? 0.62 : 0.46);
      actor.root.traverse((object) => { if (object.isMesh && object.material.color) object.material.color.lerp(tint, 0.28); });
    });
  }

  arrangeArmy(run) {
    const columns = logic.formationColumns(run.army);
    const count = logic.visibleUnits(run.army);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 42; index += 1) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const active = index < count;
      dummy.position.set((column - (columns - 1) / 2) * 0.31, active ? 0.35 : -5, row * 0.28 + 0.7);
      dummy.rotation.y = Math.sin(this.time * 4 + index) * 0.06;
      dummy.scale.setScalar(active ? 1 : 0.001);
      dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(index, dummy.matrix);
      dummy.position.y += 0.26;
      dummy.updateMatrix();
      this.headMesh.setMatrixAt(index, dummy.matrix);
      dummy.position.y += 0.14;
      dummy.updateMatrix();
      this.helmetMesh.setMatrixAt(index, dummy.matrix);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.helmetMesh.instanceMatrix.needsUpdate = true;

    this.actors.forEach((actor, index) => {
      const actorColumns = this.quality.compact ? 3 : 4;
      actor.root.position.set((index % actorColumns - (actorColumns - 1) / 2) * 0.62, 0, Math.floor(index / actorColumns) * 0.62 - 0.55);
      actor.root.visible = index < Math.min(run.army, this.quality.actorCount);
      const action = run.state === "marching" ? (run.currentGate?.choices[run.selectedSide]?.type === "hazard" ? "block" : "attack") : run.state === "won" ? "cheer" : run.state === "lost" ? "death" : "run";
      this.setActorAction(actor, action, ["attack", "hit", "death"].includes(action));
    });
    this.updateActorTypes(run);
    this.drawArmyMarker(run.army);
  }

  drawArmyMarker(army) {
    const canvas = this.marker.texture.image;
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = "rgba(19,54,96,.9)";
    ctx.roundRect(26, 25, 204, 78, 34);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 61px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(army), 128, 65);
    this.marker.texture.needsUpdate = true;
  }

  bindPointer() {
    const move = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.targetX = logic.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 7.3, -3.45, 3.45);
    };
    this.canvas.addEventListener("pointerdown", (event) => { this.canvas.setPointerCapture?.(event.pointerId); move(event); });
    this.canvas.addEventListener("pointermove", (event) => { if (event.buttons || event.pointerType === "touch") move(event); });
  }

  setSteering(direction) { this.steering = logic.clamp(direction, -1, 1); }

  reset() {
    this.steering = 0;
    this.targetX = 0;
    this.formationX = 0;
    this.formationZ = 2.7;
    this.gateZ = -12.2;
    this.lastGateKey = "";
    this.lastGateIndex = -1;
    this.cameraShake = 0;
  }

  resizeRenderer() {
    const width = this.canvas.clientWidth || 960;
    const height = this.canvas.clientHeight || 600;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  applyTheme(run) {
    if (run.level.id === this.lastLevelId) return;
    this.lastLevelId = run.level.id;
    const theme = THEMES[run.level.region.id] || THEMES.meadow;
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, 13, 34);
    this.groundMaterial.color.setHex(theme.ground);
    this.roadMaterial.color.setHex(theme.road);
    this.wallMaterial.color.setHex(theme.wall);
    this.accentMaterial.color.setHex(theme.accent);
    this.propMaterial.color.setHex(theme.prop);
    this.fortress.visible = run.level.boss || run.level.id >= 16;
    this.themeProps.forEach(({ root, crown }, index) => {
      const region = run.level.region.id;
      crown.geometry.dispose();
      crown.geometry = region === "volcano" ? new THREE.DodecahedronGeometry(0.48 + (index % 3) * 0.08) : region === "frost" ? new THREE.ConeGeometry(0.42, 1.65, 5) : region === "royal" ? new THREE.ConeGeometry(0.32, 1.2, 4) : new THREE.ConeGeometry(0.48, 1.35, 7);
      root.scale.setScalar(region === "forest" ? 1.28 : region === "royal" ? 0.9 : 1);
    });
  }

  updateGateVisuals(run) {
    const gate = run.currentGate;
    if (!gate) return;
    this.canvas.dataset.battleEnemyPreviews = gate.choices.map((choice) => choice.type === "tower" ? String(Math.min(30, Math.max(1, Math.round(choice.value)))) : "0").join(",");
    const key = `${run.level.id}-${run.gateIndex}`;
    if (key !== this.lastGateKey) {
      this.lastGateKey = key;
      this.gates.forEach((sceneGate, side) => {
        this.drawLabel(sceneGate, gate.choices[side]);
        this.buildGateShape(sceneGate, gate.choices[side]);
      });
    }
    this.gates.forEach((sceneGate, side) => {
      const selected = run.selectedSide === side;
      sceneGate.group.visible = run.selectedSide === null || selected;
      sceneGate.group.position.z = this.gateZ;
      sceneGate.materials.forEach((material) => {
        material.emissive.setHex(selected ? 0x6b4517 : 0x000000);
        material.emissiveIntensity = selected ? 0.32 : 0;
      });
      sceneGate.group.scale.setScalar(selected ? 1.06 + Math.sin(this.time * 10) * 0.018 : 1);
    });
  }

  updateEncounter(run) {
    const choice = run.selectedSide === null ? null : run.currentGate?.choices[run.selectedSide];
    const laneX = run.selectedSide === 0 ? -3 : 3;
    this.encounter.position.set(laneX, 0, -4.25);
    this.hazards.visible = Boolean(choice?.type === "hazard");
    this.enemyActors.forEach((actor, index) => {
      const visible = Boolean(choice?.type === "tower" && index < Math.min(this.quality.enemyCount, Math.ceil(choice.value / 8)));
      actor.root.visible = visible;
      actor.root.position.set((index % 3 - 1) * 0.58, 0, Math.floor(index / 3) * 0.62);
      actor.root.scale.setScalar(choice?.boss ? 0.68 : 0.46);
      this.setActorAction(actor, run.state === "marching" ? "attack" : "idle", run.state === "marching");
    });
  }

  emit(outcome) {
    this.cameraShake = this.reducedMotion ? 0 : outcome.delta < 0 ? 0.34 : 0.18;
    const color = new THREE.Color(outcome.delta >= 0 ? 0xf8d06a : 0xdf5d62);
    const amount = this.quality.compact ? 14 : 28;
    for (let index = 0; index < amount; index += 1) this.spawnParticle(this.formationX, 0.65, -3.8, color, 2.8);
    if (this.characterAsset) {
      this.actors.forEach((actor, index) => this.setActorAction(actor, outcome.delta >= 0 ? "cheer" : index < Math.min(3, outcome.damage || 0) ? "hit" : "block", true, true));
      this.enemyActors.forEach((actor) => { if (actor.root.visible) this.setActorAction(actor, outcome.survived ? "death" : "cheer", true, true); });
    }
  }

  spawnParticle(x, y, z, color, force = 1) {
    const index = this.particleCursor++ % this.quality.particles;
    const position = this.particlePoints.geometry.attributes.position;
    const colors = this.particlePoints.geometry.attributes.color;
    position.setXYZ(index, x + (Math.random() - 0.5) * 1.3, y + Math.random() * 0.5, z + (Math.random() - 0.5));
    colors.setXYZ(index, color.r, color.g, color.b);
    this.particleVelocity[index].set((Math.random() - 0.5) * force, Math.random() * force + 0.4, (Math.random() - 0.5) * force);
    this.particleLife[index] = 0.55 + Math.random() * 0.75;
    position.needsUpdate = true;
    colors.needsUpdate = true;
  }

  updateParticles(dt, run) {
    const position = this.particlePoints.geometry.attributes.position;
    for (let index = 0; index < this.quality.particles; index += 1) {
      if (this.particleLife[index] <= 0) continue;
      this.particleLife[index] -= dt;
      const velocity = this.particleVelocity[index];
      velocity.y -= 4.8 * dt;
      position.setXYZ(index, position.getX(index) + velocity.x * dt, position.getY(index) + velocity.y * dt, position.getZ(index) + velocity.z * dt);
      if (this.particleLife[index] <= 0) position.setXYZ(index, 0, -5, 30);
    }
    if (run.state === "choosing" && !this.reducedMotion && Math.floor(this.time * 18) % 5 === 0) this.spawnParticle(this.formationX, 0.08, this.formationZ + 1.4, new THREE.Color(0xd7c7a8), 0.45);
    position.needsUpdate = true;
  }

  updateMixers(dt) {
    this.actors.forEach((actor) => actor.mixer.update(dt));
    this.enemyActors.forEach((actor) => actor.mixer.update(dt));
  }

  draw(run, dt) {
    this.time += dt;
    this.applyTheme(run);
    if (run.gateIndex !== this.lastGateIndex && run.state === "choosing") {
      this.lastGateIndex = run.gateIndex;
      this.formationZ = 2.7;
      this.gateZ = -12.2;
      this.targetX *= 0.35;
    }
    this.updateGateVisuals(run);
    if (run.state === "choosing") {
      this.targetX = logic.clamp(this.targetX + this.steering * dt * 4.2, -3.45, 3.45);
      this.formationX += (this.targetX - this.formationX) * Math.min(1, dt * 8);
      this.formationZ += (2.7 - this.formationZ) * Math.min(1, dt * 8);
      this.gateZ += dt * (this.reducedMotion ? 2.35 : 1.78);
      if (this.gateZ > -4.05) {
        const side = logic.laneForPosition(this.formationX);
        this.gateZ = -4.05;
        this.onGateChoice(side);
      }
    } else if (run.state === "marching") {
      const laneX = run.selectedSide === 0 ? -3 : 3;
      this.formationX += (laneX - this.formationX) * Math.min(1, dt * 12);
      this.formationZ += (2.4 - this.formationZ) * Math.min(1, dt * 12);
      this.gateZ += dt * 10.5;
    } else if (run.state === "ready") {
      this.formationZ = 2.7;
      this.gateZ = -12.2;
      this.formationX += (0 - this.formationX) * Math.min(1, dt * 7);
    }
    this.army.position.set(this.formationX, 0, this.formationZ);
    this.canvas.dataset.battleGateZ = this.gateZ.toFixed(2);
    this.canvas.dataset.battleArmyZ = this.formationZ.toFixed(2);
    this.arrangeArmy(run);
    this.updateEncounter(run);
    this.updateParticles(dt, run);
    this.updateMixers(dt);

    const shake = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake : 0;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.7);
    this.camera.position.x += (this.formationX * 0.16 + shake - this.camera.position.x) * Math.min(1, dt * 4.2);
    this.camera.position.y = 7.5 + Math.abs(shake) * 0.35;
    this.camera.lookAt(this.formationX * 0.13, 0.55, -6.6);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    window.removeEventListener("resize", this.resize);
    this.actors.forEach((actor) => actor.mixer.stopAllAction());
    this.enemyActors.forEach((actor) => actor.mixer.stopAllAction());
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose?.();
    });
    this.renderer.dispose();
  }
}

window.WutborgBattle3D = { BattleScene3D, CHARACTER_URL, ACTIONS };
