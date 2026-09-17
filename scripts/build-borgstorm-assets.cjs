// Keep original geometry, skins, materials and textures; drop unused animation data.
// Original CC0 files remain intact for the other games and legacy checks.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../assets/borgstorm-3d');
const output = path.join(root, 'optimized');
const clips = new Set(['Idle', 'Running_A', '1H_Melee_Attack_Slice_Horizontal', '1H_Ranged_Shooting', '2H_Melee_Attack_Chop', 'Block', 'Death_A', 'Cheer']);
fs.mkdirSync(output, { recursive: true });
for (const filename of ['Knight.glb', 'Rogue_Hooded.glb', 'Barbarian.glb', 'Rogue.glb']) {
  const source = fs.readFileSync(path.join(root, 'kaykit-adventurers', filename));
  if (source.subarray(0, 4).toString() !== 'glTF') throw Error('Invalid source ' + filename);
  const jsonLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  if (gltf.buffers.length !== 1 || gltf.buffers[0].uri) throw Error('Expected one embedded buffer');
  const binaryStart = 20 + jsonLength + 8;
  const binary = source.subarray(binaryStart, binaryStart + source.readUInt32LE(20 + jsonLength));
  gltf.animations = gltf.animations.filter(a => clips.has(a.name));
  const used = new Set();
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    Object.values(p.attributes).forEach(i => used.add(i));
    if (p.indices !== undefined) used.add(p.indices);
    for (const target of p.targets || []) Object.values(target).forEach(i => used.add(i));
  }
  for (const skin of gltf.skins || []) if (skin.inverseBindMatrices !== undefined) used.add(skin.inverseBindMatrices);
  for (const a of gltf.animations) for (const s of a.samplers) { used.add(s.input); used.add(s.output); }
  const indices = [...used].sort((a,b) => a-b), accessMap = new Map(indices.map((i,j) => [i,j]));
  const views = new Set();
  gltf.accessors = indices.map(i => gltf.accessors[i]);
  for (const a of gltf.accessors) {
    if (a.bufferView !== undefined) views.add(a.bufferView);
    if (a.sparse) { views.add(a.sparse.indices.bufferView); views.add(a.sparse.values.bufferView); }
  }
  for (const image of gltf.images || []) if (image.bufferView !== undefined) views.add(image.bufferView);
  const viewIndices = [...views].sort((a,b) => a-b), viewMap = new Map(viewIndices.map((i,j) => [i,j]));
  const chunks = []; let offset = 0;
  gltf.bufferViews = viewIndices.map(i => {
    const original = gltf.bufferViews[i], padding = (4 - offset % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
    const bytes = binary.subarray(original.byteOffset || 0, (original.byteOffset || 0) + original.byteLength);
    if (bytes.length !== original.byteLength) throw Error('Truncated buffer');
    const view = { ...original, buffer: 0, byteOffset: offset };
    chunks.push(bytes); offset += bytes.length; return view;
  });
  for (const a of gltf.accessors) {
    if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
    if (a.sparse) { a.sparse.indices.bufferView = viewMap.get(a.sparse.indices.bufferView); a.sparse.values.bufferView = viewMap.get(a.sparse.values.bufferView); }
  }
  for (const image of gltf.images || []) if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = accessMap.get(p.attributes[k]);
    if (p.indices !== undefined) p.indices = accessMap.get(p.indices);
    for (const target of p.targets || []) for (const k of Object.keys(target)) target[k] = accessMap.get(target[k]);
  }
  for (const skin of gltf.skins || []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessMap.get(skin.inverseBindMatrices);
  for (const a of gltf.animations) for (const s of a.samplers) { s.input = accessMap.get(s.input); s.output = accessMap.get(s.output); }
  gltf.buffers[0].byteLength = offset;
  gltf.asset.generator = 'Wutborg animation subset (geometry unchanged)';
  const rawJSON = Buffer.from(JSON.stringify(gltf)), json = Buffer.concat([rawJSON, Buffer.alloc((4 - rawJSON.length % 4) % 4, 32)]);
  const bin = Buffer.concat([...chunks, Buffer.alloc((4 - offset % 4) % 4)]);
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28 + json.length + bin.length,8); header.writeUInt32LE(json.length,12); header.write('JSON',16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length,0); binHeader.write('BIN\0',4);
  const result = Buffer.concat([header, json, binHeader, bin]);
  fs.writeFileSync(path.join(output, filename), result);
  console.log(`${filename}: ${source.length.toLocaleString()} → ${result.length.toLocaleString()} bytes (${gltf.animations.length} clips, original mesh detail)`);
}
