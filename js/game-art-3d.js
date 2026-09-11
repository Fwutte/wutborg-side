import * as THREE from "./vendor/three/three.module.js";

// Shared, generated-once materials: no extra downloads or per-frame canvas work.
export function surfaceTexture(kind, repeatX = 1, repeatY = repeatX) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  let seed = 7103;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = kind === "stone" ? "#777b7d" : "#c4c4c4";
  ctx.fillRect(0, 0, 256, 256);
  if (kind === "stone") {
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32 + 2, y = row * 32 + 2;
      const light = 66 + random() * 19;
      const shade = ctx.createLinearGradient(x, y, x + 60, y + 28);
      shade.addColorStop(0, `hsl(35 5% ${light + 9}%)`);
      shade.addColorStop(.35, `hsl(35 4% ${light}%)`);
      shade.addColorStop(1, `hsl(35 4% ${light - 12}%)`);
      ctx.fillStyle = shade; ctx.beginPath(); ctx.roundRect(x, y, 60, 28, 5); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.19)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 54, y + 2); ctx.stroke();
    }
  }
  for (let i = 0; i < 8500; i++) {
    const light = random() > .5;
    ctx.fillStyle = light ? "rgba(255,255,255,.09)" : "rgba(0,0,0,.09)";
    const x = random() * 256, y = random() * 256;
    ctx.fillRect(x, y, kind === "grass" ? .8 : 1.5, kind === "grass" ? 2 + random() * 5 : 1.5);
  }
  if (kind === "ice") {
    ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = .8;
    for (let i = 0; i < 16; i++) {
      let x = random() * 256, y = random() * 256;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += random() * 30 - 10; y += random() * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function reflectionEnvironment(renderer) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#638eb8"); sky.addColorStop(.42, "#dcecf8");
  sky.addColorStop(.5, "#fff6dd"); sky.addColorStop(.54, "#59654c"); sky.addColorStop(1, "#262f34");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "#fffaf0"; ctx.fillRect(82, 52, 100, 21); ctx.fillRect(344, 65, 60, 13);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  texture.dispose(); generator.dispose();
  return target;
}

export function glowTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d"), glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,255,255,1)"); glow.addColorStop(.12, "rgba(255,255,255,.85)");
  glow.addColorStop(.4, "rgba(255,255,255,.18)"); glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function softSprite(texture, color, width, opacity = .65) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true,
    opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sprite.scale.set(width, width, 1);
  return sprite;
}

export function instancedDecor(parent, geometry, material, entries, shadows = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(...entry.position); dummy.rotation.set(...(entry.rotation || [0, 0, 0]));
    dummy.scale.set(...(entry.scale || [1, 1, 1])); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
    if (entry.color) mesh.setColorAt(index, new THREE.Color(entry.color));
  });
  mesh.castShadow = shadows; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export function energyShieldMaterial(color, opacity) {
  const material = new THREE.MeshBasicMaterial({color,opacity,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  material.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec3 vShieldNormal;varying vec3 vShieldView;varying vec3 vShieldPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvShieldNormal=normalize(normalMatrix*normal);vShieldView=-(modelViewMatrix*vec4(position,1.)).xyz;vShieldPosition=position;");
    shader.fragmentShader = "varying vec3 vShieldNormal;varying vec3 vShieldView;varying vec3 vShieldPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\nfloat rim=pow(1.-abs(dot(normalize(vShieldNormal),normalize(vShieldView))),2.);float grid=pow(abs(sin(vShieldPosition.y*22.)),28.);diffuseColor.a*=.12+rim*2.5+grid*.3;diffuseColor.rgb+=vec3(.22,.3,.32)*rim;");
  };
  material.customProgramCacheKey = () => "wutborg-energy-shield-v1";
  return material;
}
