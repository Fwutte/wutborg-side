import * as T from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from '../vendor/three/addons/utils/SkeletonUtils.js';
import { reflectionEnvironment, surfaceTexture, glowTexture, energyShieldMaterial } from '../game-art-3d.js';
import { REGIONS, clamp } from './core.mjs';

const gold = 0xdab56e;
const dummy = new T.Object3D();
const palette = [0x517fa4, 0x668d55, 0x797fac, 0xb78251];

export class Scene {
  constructor(canvas) {
    this.canvas = canvas; this.time = 0; this.region = -1; this.gateKey = ''; this.particles = []; this.shake = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.compact = matchMedia('(max-width: 700px)').matches;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.compact ? 1.5 : 1.75));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = !this.compact;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.world = new T.Scene();
    this.environmentTarget = reflectionEnvironment(this.renderer);
    this.world.environment = this.environmentTarget.texture;
    this.world.environmentIntensity = .45;
    this.camera = new T.PerspectiveCamera(42, 1, .1, 160);
    this.world.add(new T.HemisphereLight(0xfff8e0, 0x455d51, 1.65));
    this.sun = new T.DirectionalLight(0xffe6b7, 3.2);
    this.sun.position.set(-12, 22, 12); this.sun.castShadow = !this.compact;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 25, bottom: -25, near: 1, far: 70 });
    this.sun.shadow.normalBias = .045;
    this.world.add(this.sun);
    this.geometry = {
      box: new T.BoxGeometry(1, 1, 1), cone: new T.ConeGeometry(1, 1, 6),
      sphere: new T.IcosahedronGeometry(1, 0), cylinder: new T.CylinderGeometry(1, 1, 1, 8),
    };
    this.materials = new Map();
    this.environment = new T.Group(); this.world.add(this.environment);
    this.makeLandscape(); this.makeCastle(); this.makeTroops(); this.makeGates(); this.makeEffects();
    this.dressWorld(); this.loadActors();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    this.resize();
  }
  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new T.MeshStandardMaterial({ color, roughness: .88, flatShading: true }));
    return this.materials.get(color);
  }
  mesh(parent, type, color, x, y, z, sx, sy, sz) {
    const mesh = new T.Mesh(this.geometry[type], this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  makeLandscape() {
    this.ground = this.mesh(this.environment, 'box', 0x66865a, 0, -.55, -25, 140, 1, 160);
    this.road = this.mesh(this.environment, 'box', 0xd0bb8b, 0, -.035, -17, 10.8, .16, 70);
    for (const side of [-1, 1]) {
      this.mesh(this.environment, 'box', 0xc7b68e, side * 5.6, .03, -17, .32, .25, 70);
      for (let i = 0; i < 30; i++) this.mesh(this.environment, 'box', 0xabac90, side * 5.7, .19, 11 - i * 2.2, .62, .3, .5);
    }
    this.trees = []; this.props = [];
    for (let i = 0; i < 64; i++) {
      const side = i % 2 ? -1 : 1, x = side * (8 + (i * 13 % 21)), z = 15 - (i * 7.3 % 80);
      const tree = new T.Group(); tree.position.set(x, 0, z);
      const s = .8 + (i % 5) * .21; tree.scale.setScalar(s);
      this.mesh(tree, 'cylinder', 0x796149, 0, .8, 0, .18, 1.6, .18);
      const crown = this.mesh(tree, 'cone', 0x365f45, 0, 2, 0, 1.15, 2.4, 1.15);
      const top = this.mesh(tree, 'cone', 0x426e4c, 0, 2.95, 0, .82, 1.9, .82);
      this.environment.add(tree); this.trees.push({ crown, top });
      this.props.push({ mesh: tree, base: z });
    }
    for (let i = 0; i < 34; i++) {
      const x = (i % 2 ? -1 : 1) * (6.8 + i * 3.7 % 16), z = 8 - i * 3.3 % 62;
      const rock = this.mesh(this.environment, 'sphere', 0x9fa68c, x, .3, z, .5 + i % 3 * .25, .5, .65);
      rock.rotation.y = i; this.props.push({ mesh: rock, base: z });
    }
    this.hills = [];
    for (let i = 0; i < 13; i++) {
      const hill = this.mesh(this.environment, 'cone', 0x7e9d86, -55 + i * 9, 4, -60 - i % 3 * 8, 12 + i % 3 * 3, 18 + i % 4 * 4, 13);
      hill.rotation.y = i; this.hills.push(hill);
    }
    this.clouds = new T.Group();
    for (let i = 0; i < 12; i++) this.mesh(this.clouds, 'sphere', 0xe6e6d4, -42 + i * 9, 17 + i % 3 * 2, -47 - i % 2 * 8, 6, 1.3, 2.4);
    this.world.add(this.clouds);
    // Flower patches add scale without textures or network assets.
    const flowers = new T.InstancedMesh(this.geometry.sphere, this.material(0xe4d798), 130);
    for (let i = 0; i < 130; i++) {
      dummy.position.set((i % 2 ? -1 : 1) * (6.4 + i * .87 % 9), .17, 10 - i * 1.83 % 52);
      dummy.scale.set(.11, .16, .11); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix);
    }
    this.environment.add(flowers);
  }
  makeCastle() {
    this.castle = new T.Group(); this.castle.position.z = -27; this.world.add(this.castle);
    const stone = 0xd3c9ac, shadowStone = 0xacae9b, roof = 0x476b72;
    this.mesh(this.castle, 'box', shadowStone, 0, 2.2, 0, 11, 4.4, 2);
    this.mesh(this.castle, 'box', stone, 0, 5.4, -.4, 5, 6.8, 4);
    this.mesh(this.castle, 'cone', roof, 0, 10.25, -.4, 4.1, 3.1, 3.3).rotation.y = Math.PI / 4;
    this.door = this.mesh(this.castle, 'box', 0x574e42, 0, 1.6, 1.08, 2.2, 3.2, .22);
    this.mesh(this.castle, 'box', gold, 0, 1.6, 1.24, .13, 3.2, .1);
    for (const x of [-5.1, 5.1]) {
      this.mesh(this.castle, 'cylinder', stone, x, 3, 0, 1.35, 6, 1.35);
      this.mesh(this.castle, 'cylinder', shadowStone, x, 5.7, 0, 1.6, .45, 1.6);
      this.mesh(this.castle, 'cone', roof, x, 7.2, 0, 1.9, 2.8, 1.9);
      for (let j = 0; j < 4; j++) this.mesh(this.castle, 'box', gold, x, 1.3 + j * 1.05, 1.32, .18, .15, .1);
    }
    for (let i = 0; i < 12; i++) this.mesh(this.castle, 'box', stone, -5.35 + i * .97, 4.65, 1, .55, .65, .9);
    for (const x of [-1.35, 1.35]) {
      this.mesh(this.castle, 'box', 0x4b5a54, x, 6.3, 1.64, .55, 1.4, .12);
      this.mesh(this.castle, 'box', gold, x, 5, 1.68, .85, .15, .12);
    }
    this.mesh(this.castle, 'cylinder', 0x7b7160, 0, 12, -.4, .075, 3, .075);
    this.flag = this.mesh(this.castle, 'box', 0xb44f43, .75, 12.6, -.4, 1.5, .9, .08);
    this.mesh(this.castle, 'box', gold, .7, 12.6, -.33, .23, .6, .02);
  }
  troopBatch(color, count) {
    const group = new T.Group(); this.world.add(group);
    const parts = [
      ['box', color, [0, .51, 0], [.37, .48, .28]],
      ['sphere', 0xe7c49a, [0, .91, 0], [.18, .19, .17]],
      ['box', 0xddd8bd, [0, 1.03, .025], [.39, .13, .34]],
      ['box', 0x394b50, [-.115, .17, 0], [.13, .3, .17]],
      ['box', 0x394b50, [.115, .17, 0], [.13, .3, .17]],
      ['box', 0xe2dfcd, [-.27, .58, -.05], [.055, .62, .065]],
      ['box', color, [.25, .56, -.12], [.23, .36, .1]],
    ].map(([type, color, offset, scale]) => {
      const mesh = new T.InstancedMesh(this.geometry[type], this.material(color), count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.castShadow = true; mesh.frustumCulled = false;
      group.add(mesh); return { mesh, offset, scale };
    });
    return { group, parts, count };
  }
  makeTroops() {
    this.armies = palette.map(c => this.troopBatch(c, 72));
    this.enemies = this.troopBatch(0xb94e45, 32);
    this.banner = new T.Group(); this.world.add(this.banner);
    this.mesh(this.banner, 'cylinder', 0x766044, 0, 1.7, 0, .045, 3.4, .045);
    this.mesh(this.banner, 'box', 0x476f92, .37, 2.85, 0, .8, .65, .08);
    this.mesh(this.banner, 'box', gold, .38, 2.85, -.05, .16, .4, .03);
  }
  async loadActors() {
    const loader = new GLTFLoader();
    const files = { soldier: 'Knight.glb', archer: 'Rogue_Hooded.glb', giant: 'Barbarian.glb', enemy: 'Rogue.glb' };
    this.assets = {}; this.actors = []; this.enemyActors = []; this.actorSignature = '';
    this.canvas.dataset.characters = 'loading';
    const loaded = await Promise.allSettled(Object.entries(files).map(async ([kind, file]) => {
      const gltf = await loader.loadAsync(new URL(`../../assets/borgstorm-3d/optimized/${file}`, import.meta.url).href);
      if (this.disposed) { gltf.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); return; }
      this.assets[kind] = { scene: gltf.scene, clips: new Map(gltf.animations.map(a => [a.name, a])) };
    }));
    this.assets.shield = this.assets.soldier;
    if (this.assets.enemy && !this.disposed) this.enemyActors = Array.from({ length: this.compact ? 12 : 18 }, (_, i) => this.makeActor('enemy', i));
    if (this.assets.giant && !this.disposed) { this.bossActor = this.makeActor('giant', 0); this.bossActor.root.scale.setScalar(1.35); }
    this.canvas.dataset.characters = loaded.every(r => r.status === 'fulfilled') ? 'ready' : 'partial';
  }
  makeActor(kind, index) {
    const asset = this.assets[kind]; if (!asset) return null;
    const root = cloneSkeleton(asset.scene);
    root.traverse(o => {
      if (!o.isMesh) return;
      const equipment = /^(1H_|2H_|Knife|Throwable|Mug|Badge_Shield|Rectangle_Shield|Round_Shield|Spike_Shield|Barbarian_Round_Shield)/;
      const loadout = { soldier: ['1H_Sword', 'Round_Shield'], shield: ['1H_Sword', 'Rectangle_Shield'], archer: ['1H_Crossbow'], giant: ['2H_Axe'], enemy: ['Knife', 'Knife_Offhand'] };
      if (equipment.test(o.name)) o.visible = loadout[kind].includes(o.name);
      o.castShadow = !this.compact; o.receiveShadow = true; o.frustumCulled = false;
      o.material = o.material.clone(); o.material.roughness = .66;
      const tint = kind === 'enemy' ? 0xc05e52 : palette[['soldier', 'archer', 'shield', 'giant'].indexOf(kind)] || palette[0];
      o.material.color?.lerp(new T.Color(tint), kind === 'enemy' ? .25 : .08);
      if (/Cape/.test(o.name)) { o.material.map = null; o.material.color.set(kind === 'enemy' ? 0x9e463e : kind === 'archer' ? 0x547349 : 0x456f9a); }
    });
    root.scale.setScalar(kind === 'giant' ? .75 : .56); this.world.add(root);
    return { root, mixer: new T.AnimationMixer(root), clips: asset.clips, kind, index, action: null, name: '' };
  }
  animateActor(actor, name, dt) {
    if (actor.name !== name) {
      const clip = actor.clips.get(name) || actor.clips.get('Idle');
      const next = actor.mixer.clipAction(clip); next.reset(); next.time = actor.index * .071 % clip.duration;
      if (actor.action) next.crossFadeFrom(actor.action, .2, false);
      next.play(); actor.action = next; actor.name = name;
    }
    if (!this.reduced) actor.mixer.update(dt);
  }
  drawActors(run, dt, menu) {
    if (!this.assets.soldier || this.disposed) return false;
    const limit = this.compact ? 22 : 36, total = Math.min(limit, run.army), types = [];
    for (const kind of ['giant', 'shield', 'archer']) {
      const count = run.units[kind] ? Math.max(1, Math.round(total * run.units[kind] / run.army)) : 0;
      for (let i = 0; i < count && types.length < total; i++) types.push(this.assets[kind] ? kind : 'soldier');
    }
    while (types.length < total) types.push('soldier');
    const signature = types.join(',');
    if (signature !== this.actorSignature) {
      for (const a of this.actors) { a.mixer.stopAllAction(); a.root.traverse(o => { if (o.isMesh) { o.skeleton?.dispose(); o.material.dispose(); } }); this.world.remove(a.root); }
      this.actors = types.map((kind, i) => this.makeActor(kind, i)); this.actorSignature = signature;
    }
    const battle = ['encounter', 'siege'].includes(run.state), columns = Math.min(6, total);
    this.actors.forEach((actor, i) => {
      const row = Math.floor(i / columns), x = (i % columns - (columns - 1) / 2) * .68;
      actor.root.position.set(x + (menu ? -2 : run.x * 3.2), 0, -1.5 + row * .67);
      actor.root.rotation.y = Math.PI + (menu ? -.15 : 0);
      const attack = actor.kind === 'archer' ? '1H_Ranged_Shooting' : actor.kind === 'giant' ? '2H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Horizontal';
      const action = run.state === 'won' ? 'Cheer' : run.state === 'lost' ? 'Death_A' : menu ? 'Idle' : run.shieldTime > 0 ? 'Block' : battle ? attack : 'Running_A';
      this.animateActor(actor, action, dt);
    });
    this.banner.position.z = -1.5 + Math.ceil(total / columns) * .67;
    return true;
  }
  dressWorld() {
    this.textures = { stone: surfaceTexture('stone', 3, 2), road: surfaceTexture('stone', 3, 19), grass: surfaceTexture('grass', 30, 30), glow: glowTexture() };
    for (const color of [0xd3c9ac, 0xacae9b]) {
      const material = this.material(color); material.map = this.textures.stone; material.bumpMap = this.textures.stone; material.bumpScale = .08;
    }
    const trim = 0xc8b584, darkTrim = 0x8a8a70;
    // Layered masonry, buttresses and arched entry make the castle a destination.
    for (const side of [-1, 1]) {
      for (let j = 0; j < 3; j++) this.mesh(this.castle, 'box', darkTrim, side * (1.75 + j * 1.14), 1.3, 1.12, .25, 2.6, .62);
      for (const y of [1, 3.4, 5.2]) this.mesh(this.castle, 'cylinder', trim, side * 5.1, y, 0, 1.4, .18, 1.4);
      this.mesh(this.castle, 'box', 0x3f6176, side * 3.1, 3.1, 1.13, .75, 1.9, .07);
      this.mesh(this.castle, 'box', gold, side * 3.1, 3.1, 1.18, .14, 1.05, .035);
      this.mesh(this.castle, 'box', trim, side * 3.1, 4.1, 1.19, 1.02, .12, .2);
    }
    const arch = new T.Mesh(new T.TorusGeometry(1.38, .23, 6, 18, Math.PI), this.material(trim));
    arch.position.set(0, 2.48, 1.23); this.castle.add(arch);
    for (const x of [-1.38, 1.38]) this.mesh(this.castle, 'box', trim, x, 1.22, 1.23, .44, 2.5, .45);
    for (let i = 0; i < 7; i++) this.mesh(this.door, 'box', 0x927f53, -.45 + i * .15, 0, .7, .035, 1, .2);
    this.torches = [];
    for (const x of [-2, 2]) {
      this.mesh(this.castle, 'box', 0x615846, x, 2, 1.5, .15, .6, .45);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: this.textures.glow, color: 0xffc576, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      glow.position.set(x, 2.5, 1.8); glow.scale.set(1.8, 2.1, 1); this.castle.add(glow); this.torches.push(glow);
      this.mesh(this.castle, 'sphere', 0xffd38c, x, 2.35, 1.7, .14, .28, .14);
    }
    // Low shrubs, rounded deciduous canopies and grass tufts soften the geometric scenery.
    this.canopies = [];
    this.trees.forEach((tree, i) => {
      if (i % 3) return;
      const group = tree.crown.parent;
      const a = this.mesh(group, 'sphere', 0x547a48, .15, 2.3, 0, 1.6, 1.4, 1.5);
      const b = this.mesh(group, 'sphere', 0x668853, -.75, 2.1, .15, 1, 1, 1.2);
      this.canopies.push({ a, b, tree });
    });
    const grass = new T.InstancedMesh(new T.ConeGeometry(.12, .4, 3), this.material(0x819660), this.compact ? 250 : 650);
    for (let i = 0; i < grass.count; i++) {
      dummy.position.set((i % 2 ? -1 : 1) * (6.1 + i * 1.17 % 12), .2, 12 - i * .637 % 58);
      dummy.rotation.set(0, i, (i % 3 - 1) * .12); dummy.scale.setScalar(.5 + i % 5 * .25); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    }
    this.environment.add(grass);
    const motes = new T.BufferGeometry(), positions = new Float32Array(85 * 3);
    for (let i = 0; i < 85; i++) { positions[i * 3] = Math.sin(i * 19) * 17; positions[i * 3 + 1] = 1 + i % 11 * .6; positions[i * 3 + 2] = 8 - i % 31; }
    motes.setAttribute('position', new T.BufferAttribute(positions, 3));
    this.motes = new T.Points(motes, new T.PointsMaterial({ color: 0xffe0a1, map: this.textures.glow, size: .13, transparent: true, opacity: .7, depthWrite: false, blending: T.AdditiveBlending }));
    this.world.add(this.motes);
    this.shield.material.dispose(); this.shield.material = energyShieldMaterial(0x8ddfff, .6);
    this.arrows = new T.InstancedMesh(new T.ConeGeometry(.04, .7, 4), this.material(0xf3d99a), 16);
    this.arrows.frustumCulled = false; this.arrows.visible = false; this.world.add(this.arrows); this.volleyTime = 0;
    this.towerParts = this.castle.children.filter(o => Math.abs(o.position.x) > 4.5).map(o => ({ mesh: o, y: o.position.y, rotation: o.rotation.z }));
    this.rubble = new T.Group(); this.castle.add(this.rubble);
    for (let i = 0; i < 24; i++) {
      const rock = this.mesh(this.rubble, 'box', 0xacae9b, Math.sin(i * 7) * 4.3, .12 + i % 3 * .12, 2 + Math.cos(i * 17) * 1.5, .35 + i % 3 * .12, .35, .4);
      rock.rotation.set(i * .3, i, i * .17);
    }
    this.rubble.visible = false;
    const riverPositions = [], riverNormals = [], riverUVs = [];
    for (let i = 0; i < 75; i++) {
      const z = 17 - i, a = -13 + Math.sin(z * .12) * 2.3, b = -13 + Math.sin((z - 1) * .12) * 2.3;
      riverPositions.push(a - 1.6, .03, z, a + 1.6, .03, z, b + 1.6, .03, z - 1, a - 1.6, .03, z, b + 1.6, .03, z - 1, b - 1.6, .03, z - 1);
      riverUVs.push(0,i/10,1,i/10,1,(i+1)/10,0,i/10,1,(i+1)/10,0,(i+1)/10);
      for(let n=0;n<6;n++)riverNormals.push(0,1,0);
    }
    const riverGeometry = new T.BufferGeometry();
    riverGeometry.setAttribute('position',new T.Float32BufferAttribute(riverPositions,3));riverGeometry.setAttribute('normal',new T.Float32BufferAttribute(riverNormals,3));riverGeometry.setAttribute('uv',new T.Float32BufferAttribute(riverUVs,2));
    this.river = new T.Mesh(riverGeometry,new T.MeshStandardMaterial({color:0x629f9b,roughness:.24,metalness:.3,side:T.DoubleSide}));this.world.add(this.river);
    const bridge = new T.Group(); this.environment.add(bridge);
    this.mesh(bridge,'box',0xc7b68e,-13,.35,-7,7,.45,2.1);
    for (const z of [-8,-6]) for(let i=0;i<9;i++)this.mesh(bridge,'box',0xacae9b,-16+i*.75,.85,z,.45,.7,.25);
  }
  optimizeEnvironment() {
    for (const mesh of this.environmentInstances || []) { this.world.remove(mesh); mesh.dispose(); }
    this.environmentInstances = [];
    this.environment.updateMatrixWorld(true);
    const buckets = new Map(), instances = [];
    this.environment.traverse(o => {
      if (o.isInstancedMesh) { instances.push(o); return; }
      if (!o.isMesh || !o.visible || !o.parent.visible) return;
      const key = `${o.geometry.uuid}/${o.material.uuid}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    });
    for (const o of instances) this.world.add(o);
    for (const objects of buckets.values()) {
      const batch = new T.InstancedMesh(objects[0].geometry, objects[0].material, objects.length);
      objects.forEach((o, i) => batch.setMatrixAt(i, o.matrixWorld));
      batch.castShadow = true; batch.receiveShadow = true; this.world.add(batch); this.environmentInstances.push(batch);
    }
    this.environment.visible = false;
  }
  label(text, subtitle, color) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = '#203b37'; c.beginPath(); c.roundRect(8, 8, 496, 240, 28); c.fill();
    c.strokeStyle = color; c.lineWidth = 5; c.stroke();
    c.fillStyle = color; c.font = 'bold 98px system-ui'; c.textAlign = 'center'; c.fillText(text, 256, 131);
    c.fillStyle = '#fff7dc'; c.font = '28px system-ui'; c.fillText(subtitle, 256, 196);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(3.7, 1.85, 1); sprite.position.y = 3.6; sprite.renderOrder = 5;
    return sprite;
  }
  makeGates() {
    this.gates = [-1, 1].map(side => {
      const group = new T.Group(); group.position.x = side * 2.65; this.world.add(group);
      const material = new T.MeshStandardMaterial({ color: 0x71bd9e, emissive: 0x214634, emissiveIntensity: .3, roughness: .45 });
      for (const x of [-2.15, 2.15]) {
        const post = new T.Mesh(this.geometry.box, material); post.position.set(x, 1.2, 0); post.scale.set(.18, 2.5, .18); group.add(post);
      }
      const beam = new T.Mesh(this.geometry.box, material); beam.position.y = 2.4; beam.scale.set(4.4, .2, .2); group.add(beam);
      const veil = new T.Mesh(new T.PlaneGeometry(4.2, 2.35), new T.MeshBasicMaterial({ color: 0x9fd7b0, transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false }));
      veil.position.y = 1.2; group.add(veil);
      return { group, material, veil, label: null };
    });
  }
  makeEffects() {
    this.warning = new T.Mesh(new T.PlaneGeometry(3.6, 6), new T.MeshBasicMaterial({ color: 0xf34c32, transparent: true, opacity: .5, side: T.DoubleSide, depthWrite: false }));
    this.warning.rotation.x = -Math.PI / 2; this.warning.position.y = .16; this.world.add(this.warning);
    this.warningRing = new T.Mesh(new T.RingGeometry(.7, .85, 40), new T.MeshBasicMaterial({ color: 0xffe6a5, side: T.DoubleSide, transparent: true }));
    this.warningRing.rotation.x = -Math.PI / 2; this.warningRing.position.y = .18; this.world.add(this.warningRing);
    this.shield = new T.Mesh(new T.SphereGeometry(2.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: 0x9bdbea, wireframe: true, transparent: true, opacity: .45 }));
    this.world.add(this.shield);
    this.particleMesh = new T.InstancedMesh(this.geometry.sphere, new T.MeshBasicMaterial({ color: 0xf9dda0 }), 100);
    this.particleMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.particleMesh.frustumCulled = false; this.world.add(this.particleMesh);
  }
  burst(x, z, color = gold) {
    for (let i = 0; i < 24 && this.particles.length < 100; i++) this.particles.push({ x, y: .6, z, vx: (Math.random() - .5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - .5) * 5, life: .7 + Math.random() * .5 });
    this.particleMesh.material.color.set(color);
  }
  event(e, run) {
    if (['gain', 'hit', 'dodge', 'clear'].includes(e.type)) this.burst(run.x * 3.6, 3, e.type === 'hit' ? 0xeea17e : 0xe9d999);
    if (e.type === 'hit' && !this.reduced) this.shake = .2;
    if (e.type === 'volley') { this.burst(run.x * 3.6, 0, 0xd9ecb9); this.volleyTime = .7; }
    if (e.type === 'won') { this.burst(-2, -8); this.burst(2, -8); }
  }
  setRegion(index) {
    if (this.region === index) return;
    this.region = index; const p = REGIONS[index];
    this.world.background = new T.Color(p.sky); this.world.fog = new T.Fog(p.sky, 35, 100);
    this.material(0x476b72).color.set([0x476b72,0x345e4f,0x583d3a,0x63869b,0xa4874c][index]);
    this.sun.color.set(index === 3 ? 0xe3f2ff : index === 2 ? 0xffc89d : 0xffe6b7);
    this.ground.material = this.material(p.ground); this.road.material = this.material(p.road);
    if (this.textures) {
      this.ground.material.map = this.textures.grass;
      this.road.material.map = this.textures.road; this.road.material.bumpMap = this.textures.road; this.road.material.bumpScale = .05;
    }
    for (const tree of this.trees) { tree.crown.material = this.material(p.tree); tree.top.material = this.material(new T.Color(p.tree).multiplyScalar(1.15).getHex()); }
    for (const hill of this.hills) hill.material = this.material(new T.Color(p.ground).lerp(new T.Color(p.sky), .4).getHex());
    for (const canopy of this.canopies || []) {
      canopy.a.visible = canopy.b.visible = index !== 3; canopy.tree.crown.visible = canopy.tree.top.visible = index === 3;
      canopy.a.material = this.material(new T.Color(p.tree).multiplyScalar(1.15).getHex());
      canopy.b.material = this.material(new T.Color(p.tree).multiplyScalar(1.4).getHex());
    }
    if (this.river) {
      this.river.material.color.set(index === 2 ? 0xdc6b32 : index === 3 ? 0x9acbd7 : 0x629f9b);
      this.river.material.emissive.set(index === 2 ? 0x9d260a : 0x000000);
      this.river.material.emissiveIntensity = index === 2 ? .75 : 0;
      this.motes.material.color.set(index === 2 ? 0xff994a : index === 3 ? 0xe1f7ff : 0xffe0a1);
      this.motes.material.size = index === 3 ? .22 : .13;
    }
    // Rebuild only when the biome changes; hundreds of trees and rocks share a few draw calls.
    this.environment.visible = true; this.optimizeEnvironment();
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < .8 ? 54 : 42;
    this.camera.updateProjectionMatrix();
  }
  updateBatch(batch, positions, time, attacking = false) {
    for (const part of batch.parts) {
      part.mesh.count = positions.length;
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i], bob = this.reduced ? 0 : Math.sin(time * (attacking ? 12 : 9) + i * 1.7) * .055;
        dummy.position.set(p.x + part.offset[0] * p.s, (part.offset[1] + bob) * p.s, p.z + part.offset[2] * p.s);
        dummy.scale.set(part.scale[0] * p.s, part.scale[1] * p.s, part.scale[2] * p.s);
        dummy.rotation.set(0, p.enemy ? Math.PI : 0, 0); dummy.updateMatrix(); part.mesh.setMatrixAt(i, dummy.matrix);
      }
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  draw(run, dt, menu = false) {
    this.time += dt; this.setRegion(run.level.region);
    const battle = ['siege', 'encounter'].includes(run.state), t = this.time;
    const portrait = this.camera.aspect < .8;
    const cameraTarget = menu ? new T.Vector3(portrait ? 10 : 16, portrait ? 19 : 17, portrait ? 24 : 22) : new T.Vector3(run.x * .4, portrait ? 16 : 14, portrait ? 20 : 18);
    this.camera.position.lerp(cameraTarget, Math.min(1, dt * 3 + .02));
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake) this.camera.position.x += Math.sin(t * 70) * this.shake;
    this.camera.lookAt(menu ? -1.5 : 0, 0, menu ? -9 : -4);
    this.castle.position.z += ((menu ? -15 : battle && run.state === 'siege' ? -10 : -32) - this.castle.position.z) * Math.min(1, dt * 2 + .01);
    this.flag.rotation.y = this.reduced ? 0 : Math.sin(t * 2) * .16;
    this.flag.material = this.material(run.state === 'won' ? 0x537c98 : 0xb44f43);
    this.door.scale.y = run.state === 'siege' && run.combat.phase > 0 || run.state === 'won' ? .3 : 3.2;
    const moving = run.state === 'running' && !menu;
    if (moving && !this.reduced) this.textures.road.offset.y += dt * .13;
    this.clouds.position.x = this.reduced ? 0 : Math.sin(t * .02) * 4;
    const keys = ['soldier', 'archer', 'shield', 'giant'];
    const all = Math.min(72, run.army); let count = 0;
    keys.forEach((kind, kindIndex) => {
      const amount = kindIndex === 3 ? all - count : Math.min(all - count, Math.round(all * run.units[kind] / Math.max(1, run.army)));
      const positions = Array.from({ length: amount }, (_, i) => {
        const n = count + i, col = n % 8, row = Math.floor(n / 8);
        return { x: (col - Math.min(7, all - 1) / 2) * .47 + (menu ? -2 : run.x * 3.2), z: -1.5 + row * .45, s: kind === 'giant' ? 1.2 : .82 };
      });
      count += amount; this.updateBatch(this.armies[kindIndex], positions, t, battle);
    });
    this.banner.position.set((menu ? -2 : run.x * 3.2) - .1, 0, -1.5 + Math.ceil(all / 8) * .45);
    const rigged = this.drawActors(run, dt, menu);
    this.armies.forEach(a => { a.group.visible = !rigged; });
    const enemies = battle && !run.combat.hazard ? Math.max(1, Math.ceil(24 * run.combat.health / run.combat.maxHealth)) : menu ? 10 : 0;
    this.updateBatch(this.enemies, Array.from({ length: enemies }, (_, i) => ({ x: (i % 6 - 2.5) * .62, z: -4 - Math.floor(i / 6) * .58, s: .9, enemy: true })), t, battle);
    this.enemies.group.visible = !this.enemyActors?.length;
    this.enemyActors?.forEach((a, i) => {
      a.root.visible = i < enemies;
      if (!a.root.visible) return;
      a.root.position.set((i % 6 - 2.5) * .73, 0, -5 - Math.floor(i / 6) * .7); a.root.rotation.y = 0;
      this.animateActor(a, battle ? '1H_Melee_Attack_Slice_Horizontal' : 'Idle', dt);
    });
    const breached = run.state === 'siege' && run.combat.phase >= 1 || run.state === 'won';
    const finalPhase = run.state === 'siege' && run.combat.phase === 2;
    const phaseKey = run.state === 'siege' ? run.combat.phase : -1;
    if (phaseKey !== this.lastPhase) {
      if (phaseKey > 0) { this.burst(-2, -7, 0xdcc8a1); this.burst(2, -7, 0xdcc8a1); if (!this.reduced) this.shake = .13; }
      this.lastPhase = phaseKey;
    }
    this.rubble.visible = breached;
    for (const part of this.towerParts) {
      const collapse = finalPhase || run.state === 'won';
      part.mesh.position.y += ((collapse ? part.y * .65 : part.y) - part.mesh.position.y) * Math.min(1, dt * 2.5);
      part.mesh.rotation.z += ((collapse ? Math.sign(part.mesh.position.x) * .12 : part.rotation) - part.mesh.rotation.z) * Math.min(1, dt * 2.5);
    }
    if (this.bossActor) {
      this.bossActor.root.visible = finalPhase;
      this.bossActor.root.position.set(0, 0, -6.1); this.bossActor.root.rotation.y = 0;
      if (finalPhase) this.animateActor(this.bossActor, '2H_Melee_Attack_Chop', dt);
    }
    const key = `${run.level.id}-${run.gateIndex}`;
    if (key !== this.gateKey && run.gate) {
      this.gateKey = key;
      this.gates.forEach((g, i) => {
        const c = run.gate[i], bad = ['enemy', 'hazard'].includes(c.type), color = bad ? '#f4ae94' : c.type === 'recruit' ? '#c2d4ff' : '#cfecae';
        if (g.label) { g.group.remove(g.label); g.label.material.map.dispose(); g.label.material.dispose(); }
        g.label = this.label(c.label, c.name, color); g.group.add(g.label);
        g.material.color.set(color); g.veil.material.color.set(color);
      });
    }
    for (const g of this.gates) { g.group.visible = run.state === 'running' && !menu; g.group.position.z = -19 + run.travel * 18; }
    const warning = battle && run.combat.warning > 0;
    this.warning.visible = this.warningRing.visible = Boolean(warning);
    if (warning) {
      this.warning.position.set(run.combat.lane * 3.2, .16, 1);
      this.warning.material.opacity = .28 + Math.sin(t * 16) * .12;
      this.warningRing.position.set(run.combat.lane * 3.2, .18, 1);
      this.warningRing.scale.setScalar(1 + run.combat.warning * 1.2);
    }
    this.shield.visible = run.shieldTime > 0; this.shield.position.set(run.x * 3.2, 0, .6);
    this.shield.rotation.y = t * .25;
    for (let i = 0; i < this.torches.length; i++) this.torches[i].material.opacity = .7 + Math.sin(t * 9 + i) * .12;
    if (!this.reduced) this.motes.position.y = Math.sin(t * .2) * .4;
    this.volleyTime = Math.max(0, this.volleyTime - dt); this.arrows.visible = this.volleyTime > 0;
    if (this.volleyTime > 0) {
      const p = 1 - this.volleyTime / .7;
      for (let i = 0; i < 16; i++) {
        dummy.position.set((i % 8 - 3.5) * .4 + run.x * 3.2 * (1 - p), 1 + Math.sin(p * Math.PI) * 4, 3 - p * 11 + Math.floor(i / 8) * .6);
        dummy.rotation.set(-Math.PI / 2 + Math.cos(p * Math.PI) * .7, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); this.arrows.setMatrixAt(i, dummy.matrix);
      }
      this.arrows.instanceMatrix.needsUpdate = true;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    this.particleMesh.count = this.particles.length;
    this.particles.forEach((p, i) => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= dt * 8;
      dummy.position.set(p.x, Math.max(.1, p.y), p.z); dummy.scale.setScalar(Math.max(.01, p.life * .12)); dummy.rotation.set(t, 0, t); dummy.updateMatrix(); this.particleMesh.setMatrixAt(i, dummy.matrix);
    });
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.world, this.camera);
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    const geometries = new Set(), materials = new Set();
    this.world.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    for (const g of geometries) g.dispose();
    for (const m of materials) { m.map?.dispose(); m.dispose(); }
    for (const a of [...(this.actors || []), ...(this.enemyActors || []), ...(this.bossActor ? [this.bossActor] : [])]) { a.mixer.stopAllAction(); a.root.traverse(o => o.skeleton?.dispose()); }
    for (const t of Object.values(this.textures || {})) t.dispose();
    this.environmentTarget?.dispose();
    this.renderer.dispose();
  }
}

// Fully playable fallback for browsers where WebGL is unavailable.
export class FlatScene {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.time = 0; }
  event() {}
  resize() {}
  draw(run, dt, menu = false) {
    this.time += dt;
    const box = this.canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(box.width * ratio), h = Math.round(box.height * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const c = this.ctx; c.setTransform(w / 800, 0, 0, h / 700, 0, 0);
    c.fillStyle = '#' + REGIONS[run.level.region].sky.toString(16).padStart(6, '0'); c.fillRect(0, 0, 800, 700);
    c.fillStyle = '#' + REGIONS[run.level.region].ground.toString(16).padStart(6, '0'); c.fillRect(0, 210, 800, 490);
    c.fillStyle = '#d3c49f'; c.beginPath(); c.moveTo(295, 210); c.lineTo(505, 210); c.lineTo(770, 700); c.lineTo(30, 700); c.fill();
    c.fillStyle = '#d9d0b7'; c.fillRect(285, 130, 230, 115); c.fillRect(270, 85, 60, 160); c.fillRect(470, 85, 60, 160);
    c.fillStyle = '#496d73'; for (const x of [265, 465]) { c.beginPath(); c.moveTo(x, 90); c.lineTo(x + 35, 35); c.lineTo(x + 70, 90); c.fill(); }
    c.fillStyle = '#605647'; c.fillRect(375, 175, 50, 70);
    if (run.gate && run.state === 'running' && !menu) run.gate.forEach((g, i) => {
      const x = i ? 580 : 220, y = 300 + run.travel * 150;
      c.fillStyle = '#244239'; c.fillRect(x - 135, y - 70, 270, 110);
      c.textAlign = 'center'; c.fillStyle = ['enemy', 'hazard'].includes(g.type) ? '#f7b39b' : '#d3eaa8'; c.font = 'bold 47px system-ui'; c.fillText(g.label, x, y - 18);
      c.fillStyle = '#fff7df'; c.font = '20px system-ui'; c.fillText(g.name, x, y + 17);
    });
    if (run.combat?.warning > 0) { c.fillStyle = '#f3544677'; c.fillRect(400 + run.combat.lane * 220 - 95, 420, 190, 280); }
    const n = Math.min(60, run.army);
    for (let i = 0; i < n; i++) {
      const x = 400 + run.x * 220 + (i % 8 - Math.min(7, n - 1) / 2) * 18, y = 520 + Math.floor(i / 8) * 17;
      c.fillStyle = '#497ba0'; c.fillRect(x - 6, y - 8, 12, 17); c.fillStyle = '#efcd9c'; c.beginPath(); c.arc(x, y - 12, 5, 0, Math.PI * 2); c.fill();
    }
    if (run.shieldTime > 0) { c.strokeStyle = '#b9e9ff'; c.lineWidth = 4; c.beginPath(); c.ellipse(400 + run.x * 220, 570, 105, 80, 0, 0, Math.PI * 2); c.stroke(); }
  }
  dispose() {}
}
