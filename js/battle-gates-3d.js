import * as THREE from "./vendor/three/three.module.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "./vendor/three/addons/utils/SkeletonUtils.js";

const logic = window.WutborgBattle3DLogic;
const CHARACTER_FILES = {
  soldier: "Knight.glb",
  shield: "Knight.glb",
  archer: "Rogue_Hooded.glb",
  giant: "Barbarian.glb",
  enemy: "Rogue.glb",
  boss: "Barbarian.glb",
};
const CHARACTER_URLS = Object.fromEntries(Object.entries(CHARACTER_FILES).map(([type, file]) => [type, new URL(`../assets/borgstorm-3d/kaykit-adventurers/${file}`, import.meta.url).href]));
const CHARACTER_URL = CHARACTER_URLS.soldier;
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
    this.gateStartZ = -12.2;
    this.visualRunState = "ready";
    this.worldScroll = 0;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = compact ? 1.08 : 1.14;
    this.renderer.shadowMap.enabled = !compact;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.hemisphere = new THREE.HemisphereLight(0xe8f7ff, 0x385847, 2.25);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xfff4cf, 2.5);
    this.sun.position.set(-7, 10, 6);
    this.sun.castShadow = !compact;
    this.sun.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
    this.scene.add(this.sun);
    this.fillLight = new THREE.DirectionalLight(0x8fc9ff, 0.72);
    this.fillLight.position.set(7, 5, 9);
    this.scene.add(this.fillLight);

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
    this.pavingMaterial = new THREE.MeshStandardMaterial({ color: 0xb9ad92, roughness: 1 });
    this.hillMaterial = new THREE.MeshStandardMaterial({ color: 0x557b68, roughness: 1, flatShading: true });
    this.flagMaterial = new THREE.MeshStandardMaterial({ color: 0xe79a51, roughness: 0.72, side: THREE.DoubleSide });

    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x5aa8ce) },
        bottomColor: { value: new THREE.Color(0xd7edf0) },
      },
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "varying vec2 vUv;uniform vec3 topColor;uniform vec3 bottomColor;void main(){float t=smoothstep(0.02,1.0,vUv.y);gl_FragColor=vec4(mix(bottomColor,topColor,t),1.0);}",
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(72, 38), this.skyMaterial);
    this.sky.position.set(0, 10.5, -36);
    this.sky.renderOrder = -20;
    this.scene.add(this.sky);

    this.hills = [];
    [-16, -10, -5, 2, 9, 15].forEach((x, index) => {
      const height = 5.4 + (index % 3) * 1.35;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(5.8 + (index % 2), height, 7), this.hillMaterial);
      hill.position.set(x, height * 0.38 - 0.3, -27 - (index % 2) * 2.3);
      hill.rotation.y = index * 0.72;
      this.scene.add(hill);
      this.hills.push(hill);
    });

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

    this.roadMarks = [];
    for (let index = 0; index < 17; index += 1) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(9.65, 0.045, 0.12), this.pavingMaterial);
      const baseZ = -23 + index * 2.05;
      mark.position.set(0, 0.005, baseZ);
      mark.receiveShadow = true;
      this.scene.add(mark);
      this.roadMarks.push({ mesh: mark, baseZ });
    }
    for (const x of [-5.24, 5.24]) {
      const roadEdge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 48), this.pavingMaterial);
      roadEdge.position.set(x, 0.04, -9);
      roadEdge.receiveShadow = true;
      this.scene.add(roadEdge);
    }

    this.laneGlows = [-1, 1].map((side) => {
      const material = new THREE.MeshBasicMaterial({ color: 0x56c9ff, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.55, 22), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(side * 2.55, 0.025, -5.2);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      return { side, mesh, material };
    });

    this.arenaWalls = [];
    this.themeProps = [];
    this.trackProps = [];
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
      for (let index = 0; index < 7; index += 1) {
        const root = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.36, 8), this.wallMaterial);
        base.position.y = 0.18;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.8, 7), this.pavingMaterial);
        pole.position.y = 1.18;
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.48, 4, 2), this.flagMaterial);
        flag.position.set(-side * 0.4, 1.78, 0);
        root.add(base, pole, flag);
        const baseZ = -19 + index * 5.1 + (side > 0 ? 2.4 : 0);
        root.position.set(side * 5.72, 0, baseZ);
        this.scene.add(root);
        this.trackProps.push({ root, flag, side, baseZ, phase: index * 0.83 + side });
      }
    }

    this.fortress = new THREE.Group();
    const keep = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.8, 2.4), this.wallMaterial);
    keep.position.set(0, 2.35, -19.5);
    keep.castShadow = true;
    this.fortress.add(keep);
    const opening = new THREE.Mesh(new THREE.BoxGeometry(2.35, 3.35, 0.26), new THREE.MeshStandardMaterial({ color: 0x182537, roughness: 1 }));
    opening.position.set(0, 1.62, -18.22);
    this.fortress.add(opening);
    for (let x = -3.65; x <= 3.65; x += 1.45) {
      const battlement = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 2.65), this.wallMaterial);
      battlement.position.set(x, 5.02, -19.5);
      this.fortress.add(battlement);
    }
    for (const x of [-3.7, 3.7]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 6.2, 8), this.wallMaterial);
      tower.position.set(x, 3.05, -18.8);
      tower.castShadow = true;
      this.fortress.add(tower);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.1, 8), this.accentMaterial);
      roof.position.set(x, 7.2, -18.8);
      this.fortress.add(roof);
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.1), this.flagMaterial);
    banner.position.set(0, 4.05, -18.18);
    this.fortress.add(banner);
    this.scene.add(this.fortress);
  }

  makeBlobShadow(width, depth, opacity = 0.3) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 61);
    gradient.addColorStop(0, `rgba(10,24,35,${opacity})`);
    gradient.addColorStop(0.58, `rgba(10,24,35,${opacity * 0.52})`);
    gradient.addColorStop(1, "rgba(10,24,35,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 1 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    shadow.renderOrder = 2;
    return shadow;
  }

  makeLabel() {
    const texture = new THREE.CanvasTexture(document.createElement("canvas"));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(this.quality.compact ? 2.48 : 2.25, this.quality.compact ? 1.31 : 1.2, 1);
    return { sprite, texture };
  }

  drawLabel(gate, choice) {
    const canvas = gate.label.texture.image;
    canvas.width = 512;
    canvas.height = 270;
    const ctx = canvas.getContext("2d");
    const palette = choice.type === "tower" ? ["#7d2831", "#ffbd63"] : choice.type === "hazard" ? ["#383344", "#ead5b2"] : choice.type === "recruit" ? ["#236b9d", "#bdeaff"] : ["#23734c", "#ddf4a0"];
    const category = choice.type === "tower" ? (choice.boss ? "BOSS" : "FJENDER") : choice.type === "hazard" ? "FARE" : choice.type === "recruit" ? "FORSTÆRKNING" : "BONUS";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = "rgba(7,17,28,.55)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 12;
    const panel = ctx.createLinearGradient(0, 26, 0, 244);
    panel.addColorStop(0, palette[0]);
    panel.addColorStop(1, "#14283b");
    ctx.fillStyle = panel;
    ctx.roundRect(20, 26, 472, 218, 36);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = palette[1];
    ctx.roundRect(154, 13, 204, 47, 20);
    ctx.fill();
    ctx.fillStyle = "#14283b";
    ctx.font = "900 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(category, 256, 37);
    ctx.fillStyle = "#fffaf0";
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;
    ctx.font = "900 104px Arial";
    ctx.fillText(choice.label, 256, 126);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = palette[1];
    ctx.font = "900 32px Arial";
    ctx.fillText(choice.hint.toUpperCase(), 256, 199);
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
    gate.previewActors?.forEach((actor) => actor.mixer.stopAllAction());
    gate.shape.traverse((object) => {
      if (object.geometry && !object.userData.sharedCharacterAsset) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
    });
    gate.shape.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    gate.materials = [];
    gate.previewActors = [];
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
      if (this.characterAssets) {
        main.dispose();
        accent.dispose();
        dark.dispose();
        gate.materials = [];
        const renderCount = choice.boss ? 1 : Math.min(enemyCount, this.quality.compact ? 6 : 10);
        const columns = renderCount <= 5 ? renderCount : Math.min(5, Math.ceil(Math.sqrt(renderCount * 1.5)));
        for (let index = 0; index < renderCount; index += 1) {
          const actor = this.makeActor(choice.boss ? "boss" : "enemy", true);
          const row = Math.floor(index / columns);
          const rowCount = Math.min(columns, renderCount - row * columns);
          const column = index % columns;
          actor.root.position.set((column - (rowCount - 1) / 2) * (choice.boss ? 0 : 0.52), 0, row * 0.5);
          actor.root.rotation.y = 0;
          actor.root.scale.setScalar(choice.boss ? 0.82 : 0.48);
          actor.root.traverse((object) => { if (object.isMesh) gate.materials.push(object.material); });
          gate.shape.add(actor.root);
          gate.previewActors.push(actor);
        }
      } else {
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
      const shadow = this.makeBlobShadow(4, 2.25, 0.34);
      shadow.position.z = 0.4;
      group.add(shadow);
      this.scene.add(group);
      return { side, group, shape, label, shadow, materials: [], previewActors: [] };
    });
  }

  buildArmy() {
    this.army = new THREE.Group();
    this.scene.add(this.army);
    this.armyShadow = this.makeBlobShadow(4.4, 3.25, 0.34);
    this.armyShadow.position.z = 1.1;
    this.army.add(this.armyShadow);
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
      const loader = new GLTFLoader();
      const uniqueTypes = ["soldier", "archer", "giant", "enemy"];
      const loaded = await Promise.all(uniqueTypes.map(async (type) => {
        const gltf = await loader.loadAsync(CHARACTER_URLS[type]);
        return [type, { scene: gltf.scene, animations: gltf.animations, clips: new Map(gltf.animations.map((clip) => [clip.name, clip])) }];
      }));
      this.characterAssets = Object.fromEntries(loaded);
      this.characterAssets.shield = this.characterAssets.soldier;
      this.characterAssets.boss = this.characterAssets.giant;
      this.characterAsset = this.characterAssets.soldier;
      this.createRiggedActors();
      for (const mesh of [this.bodyMesh, this.headMesh, this.helmetMesh]) mesh.visible = false;
      this.lastGateKey = "";
      this.canvas.dataset.battle3dAssets = "ready";
      this.canvas.dataset.battle3dCharacterSet = "knight,rogue-hooded,barbarian,rogue";
      this.canvas.dispatchEvent(new CustomEvent("battle3dassetsready"));
    } catch (error) {
      for (const mesh of [this.bodyMesh, this.headMesh, this.helmetMesh]) mesh.visible = true;
      this.canvas.dataset.battle3dAssets = "fallback";
      console.warn("KayKit-figuren kunne ikke indlæses; bruger low-poly formation.", error);
    }
  }

  makeActor(type, enemy = false) {
    const assetKey = enemy ? (type === "boss" ? "boss" : "enemy") : type;
    const asset = this.characterAssets?.[assetKey] || this.characterAsset;
    const root = cloneSkeleton(asset.scene);
    const tint = new THREE.Color(UNIT_COLORS[enemy ? "enemy" : type] || UNIT_COLORS.soldier);
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = !this.quality.compact;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.userData.sharedCharacterAsset = true;
      object.material = object.material.clone();
      if (object.material.color) object.material.color.lerp(tint, enemy ? 0.42 : 0.2);
    });
    const scale = type === "giant" || type === "boss" ? 0.68 : 0.46;
    root.scale.setScalar(scale);
    root.rotation.y = Math.PI;
    const mixer = new THREE.AnimationMixer(root);
    const actor = { root, mixer, clips: asset.clips, assetKey, type, enemy, action: null, actionName: "" };
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
  }

  setActorAction(actor, actionName, once = false, restart = false) {
    if (!this.characterAsset || (actor.actionName === actionName && !restart)) return;
    const clip = actor.clips.get(ACTIONS[actionName]);
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
      if (actor.assetKey === type || (type === "shield" && actor.assetKey === "shield")) return;
      const replacement = this.makeActor(type);
      replacement.root.position.copy(actor.root.position);
      replacement.root.visible = actor.root.visible;
      actor.mixer.stopAllAction();
      actor.root.traverse((object) => { if (object.isMesh) object.material.dispose(); });
      this.riggedArmy.remove(actor.root);
      this.riggedArmy.add(replacement.root);
      this.actors[index] = replacement;
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

    this.updateActorTypes(run);
    this.actors.forEach((actor, index) => {
      const actorColumns = this.quality.compact ? 3 : 4;
      actor.root.position.set((index % actorColumns - (actorColumns - 1) / 2) * 0.62, 0, Math.floor(index / actorColumns) * 0.62 - 0.55);
      actor.root.visible = index < Math.min(run.army, this.quality.actorCount);
      const action = run.state === "marching" ? (run.currentGate?.choices[run.selectedSide]?.type === "hazard" ? "block" : "attack") : run.state === "won" ? "cheer" : run.state === "lost" ? "death" : "run";
      this.setActorAction(actor, action, ["attack", "hit", "death"].includes(action));
    });
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
    this.gateStartZ = -12.2;
    this.visualRunState = "ready";
    this.worldScroll = 0;
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
    this.scene.fog = new THREE.Fog(theme.fog, 15, 43);
    this.groundMaterial.color.setHex(theme.ground);
    this.roadMaterial.color.setHex(theme.road);
    this.wallMaterial.color.setHex(theme.wall);
    this.accentMaterial.color.setHex(theme.accent);
    this.propMaterial.color.setHex(theme.prop);
    this.flagMaterial.color.setHex(theme.accent);
    this.pavingMaterial.color.copy(new THREE.Color(theme.road).offsetHSL(0, -0.04, -0.11));
    this.hillMaterial.color.copy(new THREE.Color(theme.prop).lerp(new THREE.Color(theme.sky), 0.28));
    this.skyMaterial.uniforms.topColor.value.copy(new THREE.Color(theme.sky).offsetHSL(0.015, 0.08, -0.09));
    this.skyMaterial.uniforms.bottomColor.value.copy(new THREE.Color(theme.fog).offsetHSL(0, -0.08, 0.14));
    this.hemisphere.color.copy(new THREE.Color(theme.sky).offsetHSL(0, -0.04, 0.18));
    this.hemisphere.groundColor.copy(new THREE.Color(theme.ground).offsetHSL(0, -0.08, -0.12));
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
      const transition = run.state === "marching" ? logic.clamp(run.marchTime / 0.92, 0, 1) : 0;
      const opacity = run.selectedSide === null ? 1 : selected ? 1 - logic.clamp((transition - 0.64) / 0.36, 0, 1) : 1 - logic.clamp(transition / 0.24, 0, 1);
      sceneGate.group.visible = opacity > 0.015;
      sceneGate.group.position.x = sceneGate.side * 3 * (selected ? 1 - transition * 0.28 : 1);
      sceneGate.group.position.z = this.gateZ;
      sceneGate.materials.forEach((material) => {
        material.emissive?.setHex(selected ? 0x6b4517 : 0x000000);
        if ("emissiveIntensity" in material) material.emissiveIntensity = selected ? 0.32 : 0;
        material.transparent = opacity < 0.999;
        material.opacity = opacity;
        material.depthWrite = opacity > 0.42;
      });
      sceneGate.label.sprite.material.opacity = opacity;
      sceneGate.shadow.material.opacity = opacity * (selected ? 0.86 : 0.62);
      const pulse = selected ? Math.sin(this.time * 10) * 0.018 * (1 - transition) : 0;
      sceneGate.group.scale.setScalar(selected ? 1.045 + pulse - transition * 0.075 : 1 - transition * 0.08);
    });
    this.canvas.dataset.battleTransition = run.state === "marching" ? (run.marchTime / 0.92).toFixed(2) : "0.00";
  }

  updateEnvironment(run, dt) {
    const moving = run.state === "choosing" || run.state === "marching";
    const speed = !moving ? 0 : run.state === "marching" ? 5.2 : this.reducedMotion ? 0.75 : 1.6;
    this.worldScroll = (this.worldScroll + dt * speed) % 34.85;
    const wrapZ = (baseZ) => ((baseZ + this.worldScroll + 24) % 34.85) - 24;
    this.roadMarks.forEach(({ mesh, baseZ }) => { mesh.position.z = wrapZ(baseZ); });
    this.trackProps.forEach(({ root, flag, side, baseZ, phase }) => {
      root.position.z = wrapZ(baseZ);
      flag.rotation.z = side * (0.06 + Math.sin(this.time * 2.8 + phase) * (this.reducedMotion ? 0.025 : 0.1));
      flag.position.x = -side * (0.4 + Math.sin(this.time * 3.3 + phase) * 0.035);
    });

    const choices = run.currentGate?.choices || [];
    this.laneGlows.forEach((lane, index) => {
      const choice = choices[index];
      const color = choice ? this.gatePalette(choice).accent : 0x56c9ff;
      lane.material.color.setHex(color);
      const laneX = lane.side * 2.55;
      const proximity = 1 - logic.clamp(Math.abs(this.formationX - laneX) / 4.1, 0, 1);
      const selected = run.selectedSide === index;
      const transition = run.state === "marching" ? logic.clamp(run.marchTime / 0.92, 0, 1) : 0;
      const targetOpacity = run.state === "choosing" ? 0.045 + proximity * 0.12 : selected ? 0.18 * (1 - transition) : 0.018;
      lane.material.opacity += (targetOpacity - lane.material.opacity) * Math.min(1, dt * 8);
      lane.mesh.position.z = -5.2 + Math.sin(this.time * 1.4 + index) * 0.08;
    });
  }

  updateEncounter(run) {
    this.hazards.visible = false;
    this.enemyActors.forEach((actor) => { actor.root.visible = false; });
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
    this.gates.forEach((gate) => gate.previewActors.forEach((actor) => actor.mixer.update(dt)));
  }

  draw(run, dt) {
    this.time += dt;
    this.applyTheme(run);
    if (run.gateIndex !== this.lastGateIndex && run.state === "choosing") {
      this.lastGateIndex = run.gateIndex;
      this.formationZ = 2.7;
      this.gateZ = -12.2;
      this.gateStartZ = -12.2;
      this.targetX *= 0.35;
    }
    if (run.state === "marching" && this.visualRunState !== "marching") this.gateStartZ = this.gateZ;
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
      const laneX = run.selectedSide === 0 ? -1.95 : 1.95;
      const transition = logic.clamp(run.marchTime / 0.92, 0, 1);
      const eased = 1 - Math.pow(1 - transition, 3);
      this.formationX += (laneX - this.formationX) * Math.min(1, dt * 12);
      this.formationZ += (2.4 - this.formationZ) * Math.min(1, dt * 12);
      this.gateZ = this.gateStartZ + (-2.15 - this.gateStartZ) * eased;
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
    this.updateEnvironment(run, dt);
    this.updateParticles(dt, run);
    this.updateMixers(dt);

    const shake = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake : 0;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.7);
    this.camera.position.x += (this.formationX * 0.38 + shake - this.camera.position.x) * Math.min(1, dt * 4.2);
    this.camera.position.y = 7.5 + Math.abs(shake) * 0.35;
    this.camera.lookAt(this.formationX * 0.22, 0.55, -6.6);
    this.renderer.render(this.scene, this.camera);
    this.visualRunState = run.state;
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
