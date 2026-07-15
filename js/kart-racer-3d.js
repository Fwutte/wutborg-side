import * as THREE from "./vendor/three/three.module.js";
import { GLTFLoader } from "./vendor/three/addons/loaders/GLTFLoader.js";

const TAU = Math.PI * 2;
const WORLD_SCALE = 0.025;
const ASSET_ROOT = "assets/kart/kenney-racing-3d";

const toColor = (value, fallback) => new THREE.Color(value || fallback);
const worldPosition = (track, point, height = 0) => new THREE.Vector3(
  (point.x - track.cx) * WORLD_SCALE,
  height,
  -(point.y - track.cy) * WORLD_SCALE,
);
const forwardFromHeading = (heading) => new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));

class KartRacer3DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.compact = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.compact,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.compact ? 1.35 : 1.8));
    this.camera = new THREE.PerspectiveCamera(58, 16 / 10, 0.08, 220);
    this.loader = new GLTFLoader();
    this.scene = null;
    this.trackId = null;
    this.currentRace = null;
    this.cameraReady = false;
    this.assetVersion = 0;
    this.builtAssetVersion = -1;
    this.templates = new Map();
    this.kartGroups = [];
    this.itemMeshes = [];
    this.coinMeshes = [];
    this.trapMeshes = [];
    this.shellMeshes = [];
    this.clock = new THREE.Clock();
    this.loadAssets();
  }

  async loadModel(name) {
    return new Promise((resolve, reject) => {
      this.loader.load(`${ASSET_ROOT}/${name}`, (gltf) => resolve(gltf.scene), undefined, reject);
    });
  }

  async loadAssets() {
    const files = [
      "raceCarWhite.glb", "treeLarge.glb", "treeSmall.glb", "grandStand.glb",
      "overheadRoundColored.glb", "barrierRed.glb", "barrierWhite.glb",
    ];
    const loaded = await Promise.allSettled(files.map((name) => this.loadModel(name)));
    loaded.forEach((result, index) => {
      if (result.status === "fulfilled") this.templates.set(files[index], result.value);
    });
    this.assetVersion += 1;
  }

  disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  }

  createScene(race) {
    const track = race.track;
    this.disposeScene();
    this.scene = new THREE.Scene();
    this.scene.add(this.camera);
    this.scene.background = toColor(track.palette.sky, "#aee7ff");
    this.scene.fog = new THREE.Fog(track.palette.sky, 24, 75);
    this.trackId = track.id;
    this.builtAssetVersion = this.assetVersion;
    this.cameraReady = false;
    this.kartGroups = [];
    this.itemMeshes = [];
    this.coinMeshes = [];
    this.trapMeshes = [];
    this.shellMeshes = [];

    this.scene.add(new THREE.HemisphereLight(0xdff4ff, 0x3c6d42, 2.35));
    const sun = new THREE.DirectionalLight(0xfff3d2, 2.1);
    sun.position.set(-18, 28, -12);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ color: track.palette.grass, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    this.scene.add(ground);

    this.createRoad(track);
    this.createBoostPads(track);
    this.createItems(race);
    this.createTrackDecor(track);
    race.karts.forEach((kart, index) => {
      const visual = this.createKart(kart.driver, index === 0);
      this.kartGroups.push(visual);
      if (index !== 0) this.scene.add(visual.group);
    });
  }

  createRoad(track) {
    const outerX = track.outerRx * WORLD_SCALE;
    const outerZ = track.outerRy * WORLD_SCALE;
    const innerX = track.innerRx * WORLD_SCALE;
    const innerZ = track.innerRy * WORLD_SCALE;
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, outerX, outerZ, 0, TAU, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, innerX, innerZ, 0, TAU, true, 0);
    shape.holes.push(hole);
    const road = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 128),
      new THREE.MeshStandardMaterial({ color: track.palette.road, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0;
    this.scene.add(road);

    const innerGrass = new THREE.Mesh(
      new THREE.CircleGeometry(1, 128),
      new THREE.MeshStandardMaterial({ color: track.palette.grassDark, roughness: 1 }),
    );
    innerGrass.scale.set(innerX, innerZ, 1);
    innerGrass.rotation.x = -Math.PI / 2;
    innerGrass.position.y = 0.012;
    this.scene.add(innerGrass);

    const curbGeometry = new THREE.BoxGeometry(0.78, 0.1, 0.22);
    const curbMaterials = [
      new THREE.MeshStandardMaterial({ color: 0xf5f1dc, roughness: 0.72 }),
      new THREE.MeshStandardMaterial({ color: track.palette.barrier, roughness: 0.72 }),
    ];
    const curbMatrices = [[], []];
    for (let index = 0; index < 72; index += 1) {
      const angle = (index / 72) * TAU;
      const tangent = track.tangentAt(angle);
      const outer = { x: track.cx + Math.cos(angle) * (track.outerRx - 5), y: track.cy + Math.sin(angle) * (track.outerRy - 5) };
      const inner = { x: track.cx + Math.cos(angle) * (track.innerRx + 5), y: track.cy + Math.sin(angle) * (track.innerRy + 5) };
      [outer, inner].forEach((point, edge) => {
        const matrix = new THREE.Matrix4();
        const position = worldPosition(track, point, 0.08);
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tangent + (edge ? Math.PI : 0), 0));
        matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1));
        curbMatrices[index % 2].push(matrix);
      });
    }
    curbMatrices.forEach((matrices, materialIndex) => {
      const mesh = new THREE.InstancedMesh(curbGeometry, curbMaterials[materialIndex], matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    });

    const dashGeometry = new THREE.BoxGeometry(0.95, 0.025, 0.055);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.58 });
    const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, 32);
    for (let index = 0; index < 32; index += 1) {
      const angle = (index / 32) * TAU;
      const point = track.pointAt(angle);
      const matrix = new THREE.Matrix4();
      matrix.compose(
        worldPosition(track, point, 0.03),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, track.tangentAt(angle), 0)),
        new THREE.Vector3(1, 1, 1),
      );
      dashes.setMatrixAt(index, matrix);
    }
    this.scene.add(dashes);
    this.createStartLine(track);
  }

  createStartLine(track) {
    const roadWidth = ((track.outerRx - track.innerRx) * WORLD_SCALE) * 0.82;
    const tileSize = roadWidth / 8;
    const normal = new THREE.Vector3(-Math.sin(track.heading), 0, -Math.cos(track.heading));
    const start = worldPosition(track, track.start, 0.045);
    for (let index = -4; index < 4; index += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(tileSize, 0.035, 0.34),
        new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? 0xfff8e9 : 0x273044 }),
      );
      tile.position.copy(start).addScaledVector(normal, (index + 0.5) * tileSize);
      tile.rotation.y = track.heading - Math.PI / 2;
      this.scene.add(tile);
    }
  }

  createBoostPads(track) {
    const material = new THREE.MeshStandardMaterial({ color: 0x26d5f2, emissive: 0x095b7b, emissiveIntensity: 1.4, roughness: 0.4 });
    track.boostPads.forEach((pad) => {
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 1.05), material);
      group.add(base);
      [-0.32, 0.32].forEach((offset) => {
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0xfff46a }));
        arrow.rotation.x = Math.PI / 2;
        arrow.position.set(offset, 0.08, -0.05);
        group.add(arrow);
      });
      group.position.copy(worldPosition(track, pad, 0.055));
      group.rotation.y = track.tangentAt(pad.angle) - Math.PI / 2;
      this.scene.add(group);
    });
  }

  createItems(race) {
    race.itemBoxes.forEach((box) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.68, 0.68),
        new THREE.MeshStandardMaterial({ color: 0x4ed9f6, emissive: 0x146a8d, emissiveIntensity: 1.8, transparent: true, opacity: 0.84, roughness: 0.3 }),
      );
      mesh.position.copy(worldPosition(race.track, box, 0.58));
      this.itemMeshes.push(mesh);
      this.scene.add(mesh);
    });
    race.coins.forEach((coin) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.08, 18),
        new THREE.MeshStandardMaterial({ color: 0xffd447, emissive: 0x9e5208, emissiveIntensity: 0.85, metalness: 0.55, roughness: 0.28 }),
      );
      mesh.rotation.z = Math.PI / 2;
      mesh.position.copy(worldPosition(race.track, coin, 0.48));
      this.coinMeshes.push(mesh);
      this.scene.add(mesh);
    });
  }

  cloneTemplate(name, tint = null) {
    const template = this.templates.get(name);
    if (!template) return null;
    const clone = template.clone(true);
    clone.traverse((object) => {
      if (!object.isMesh) return;
      object.material = object.material.clone();
      if (tint && object.material.color) {
        const brightness = object.material.color.r + object.material.color.g + object.material.color.b;
        if (brightness > 1.15) object.material.color.lerp(tint, 0.82);
      }
    });
    return clone;
  }

  createKart(driver, isPlayer) {
    const group = new THREE.Group();
    const visual = new THREE.Group();
    group.add(visual);
    let model = this.cloneTemplate("raceCarWhite.glb", new THREE.Color(driver.color));
    if (model) {
      const initialBox = new THREE.Box3().setFromObject(model);
      const size = initialBox.getSize(new THREE.Vector3());
      const scale = 1.58 / Math.max(size.x, size.z);
      model.scale.setScalar(scale);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y + 0.03, -center.z);
      visual.add(model);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.42, 1.9),
        new THREE.MeshStandardMaterial({ color: driver.color, roughness: 0.45, metalness: 0.08 }),
      );
      body.position.y = 0.38;
      visual.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.42, 0.72),
        new THREE.MeshStandardMaterial({ color: driver.accent, roughness: 0.5 }),
      );
      cabin.position.set(0, 0.74, 0.05);
      visual.add(cabin);
      const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.9 });
      [[-0.68, -0.55], [0.68, -0.55], [-0.68, 0.58], [0.68, 0.58]].forEach(([x, z]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.2, 12), wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.25, z);
        visual.add(wheel);
      });
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.85, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.9 }),
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0, 0.32, -1.08);
    flame.visible = false;
    visual.add(flame);

    if (isPlayer) {
      visual.traverse((object) => { object.frustumCulled = false; });
    }

    return { group, visual, flame };
  }

  createTrackDecor(track) {
    const treeNames = ["treeLarge.glb", "treeSmall.glb"];
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * TAU + 0.11;
      const radiusX = track.outerRx + 115 + (index % 3) * 22;
      const radiusY = track.outerRy + 95 + (index % 2) * 25;
      const point = { x: track.cx + Math.cos(angle) * radiusX, y: track.cy + Math.sin(angle) * radiusY };
      const tree = this.cloneTemplate(treeNames[index % 2]);
      if (!tree) continue;
      tree.position.copy(worldPosition(track, point, 0));
      tree.rotation.y = angle * 1.7;
      tree.scale.setScalar(1.15 + (index % 4) * 0.12);
      this.scene.add(tree);
    }
    const stand = this.cloneTemplate("grandStand.glb");
    if (stand) {
      stand.position.set(0, 0, 0);
      stand.scale.setScalar(1.45);
      stand.rotation.y = track.startAngle + Math.PI / 2;
      this.scene.add(stand);
    }
  }

  ensureObjectMeshes(race) {
    while (this.trapMeshes.length < race.traps.length) {
      const trap = new THREE.Group();
      const peelMaterial = new THREE.MeshStandardMaterial({ color: 0xffdf45, roughness: 0.7 });
      for (let index = 0; index < 3; index += 1) {
        const peel = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.65, 6), peelMaterial);
        peel.rotation.z = (index / 3) * TAU;
        peel.position.y = 0.18;
        trap.add(peel);
      }
      this.trapMeshes.push(trap);
      this.scene.add(trap);
    }
    while (this.shellMeshes.length < race.shells.length) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x54c96b, roughness: 0.45, metalness: 0.05 }),
      );
      this.shellMeshes.push(shell);
      this.scene.add(shell);
    }
  }

  syncRace(race, elapsed) {
    race.karts.forEach((kart, index) => {
      const entry = this.kartGroups[index];
      if (!entry) return;
      entry.group.position.copy(worldPosition(race.track, kart, 0.035));
      entry.group.rotation.y = kart.heading + Math.PI / 2;
      entry.visual.rotation.z = THREE.MathUtils.lerp(entry.visual.rotation.z, kart.drifting ? -kart.driftDirection * 0.1 : 0, 0.18);
      entry.visual.position.y = Math.sin(elapsed * 12 + index) * Math.min(Math.abs(kart.speed) / 9000, 0.035);
      entry.flame.visible = kart.boostTimer > 0 || kart.starTimer > 0;
      entry.flame.scale.y = 0.82 + Math.sin(elapsed * 29 + index) * 0.24;
      entry.visual.traverse((object) => {
        if (!object.isMesh || !object.material?.emissive) return;
        object.material.emissiveIntensity = kart.starTimer > 0 ? 0.7 + Math.sin(elapsed * 22) * 0.3 : 0;
      });
    });
    this.itemMeshes.forEach((mesh, index) => {
      const box = race.itemBoxes[index];
      mesh.visible = Boolean(box && box.cooldown <= 0);
      mesh.rotation.y = elapsed * 1.8 + index;
      mesh.rotation.x = Math.sin(elapsed * 1.4 + index) * 0.22;
    });
    this.coinMeshes.forEach((mesh, index) => {
      const coin = race.coins[index];
      mesh.visible = Boolean(coin && coin.cooldown <= 0);
      mesh.rotation.y = elapsed * 3 + index;
      mesh.position.y = 0.5 + Math.sin(elapsed * 3 + index) * 0.09;
    });
    this.ensureObjectMeshes(race);
    this.trapMeshes.forEach((mesh, index) => {
      const trap = race.traps[index];
      mesh.visible = Boolean(trap);
      if (trap) mesh.position.copy(worldPosition(race.track, trap, 0.02));
    });
    this.shellMeshes.forEach((mesh, index) => {
      const shell = race.shells[index];
      mesh.visible = Boolean(shell);
      if (!shell) return;
      mesh.position.copy(worldPosition(race.track, shell, 0.32));
      mesh.rotation.y += 0.2;
      mesh.material.color.set(shell.color || "#54c96b");
    });
  }

  updateCamera(race) {
    const player = race.player || race.karts[0];
    if (!player) return;
    const position = worldPosition(race.track, player, 0.22);
    const forward = forwardFromHeading(player.heading);
    const speedRatio = Math.min(1, Math.abs(player.speed) / Math.max(1, player.driver.maxSpeed));
    const landscape = this.camera.aspect > 1.2;
    const desired = position.clone().addScaledVector(forward, landscape ? -6.7 - speedRatio * 0.7 : -4.25 - speedRatio * 0.85);
    desired.y = landscape ? 4.15 + speedRatio * 0.2 : 2.45 + speedRatio * 0.28;
    const lookAt = position.clone().addScaledVector(forward, landscape ? 0.25 + speedRatio * 0.35 : 2.7 + speedRatio * 2.2);
    lookAt.y = landscape ? 0.82 : 0.58;
    if (!this.cameraReady) {
      this.camera.position.copy(desired);
      this.cameraReady = true;
    } else {
      this.camera.position.lerp(desired, 0.14);
    }
    this.camera.lookAt(lookAt);
    const targetFov = 56 + speedRatio * 8 + (player.boostTimer > 0 ? 4 : 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.08);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const targetWidth = Math.round(width * this.renderer.getPixelRatio());
    const targetHeight = Math.round(height * this.renderer.getPixelRatio());
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  draw(race) {
    const raceChanged = this.currentRace !== race;
    this.currentRace = race;
    if (!this.scene || raceChanged || this.trackId !== race.track.id || this.builtAssetVersion !== this.assetVersion || this.kartGroups.length !== race.karts.length) this.createScene(race);
    this.resize();
    const elapsed = this.clock.getElapsedTime();
    this.syncRace(race, elapsed);
    this.updateCamera(race);
    this.renderer.render(this.scene, this.camera);
  }
}

window.WutborgKart3DRenderer = KartRacer3DRenderer;
