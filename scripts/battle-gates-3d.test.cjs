const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'battle-gates.html'),'utf8');
const files=['core.mjs','scene.mjs','audio.mjs','game.mjs'];
const {spawnSync}=require('node:child_process');
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,'js/borgstorm',file)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
assert.match(html,/js\/borgstorm\/game\.mjs\?v=/);
assert.match(html,/viewport-fit=cover/);
const source=fs.readFileSync(path.join(root,'js/borgstorm/game.mjs'),'utf8');
const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.has(id),`controller element #${id} exists`);
for(const file of ['Knight.glb','Rogue_Hooded.glb','Barbarian.glb','Rogue.glb']){
  const glb=fs.readFileSync(path.join(root,'assets/borgstorm-3d/optimized',file));
  assert.equal(glb.subarray(0,4).toString(),'glTF');
  assert.equal(glb.readUInt32LE(8),glb.length,'GLB declares its actual file length');
  assert.ok(glb.length<800000,'Optimized animation data stays below 800 KB');
  const model=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString().replace(/\0+$/,''));
  const clips=model.animations.map(a=>a.name);
  for(const name of ['Idle','Running_A','1H_Melee_Attack_Slice_Horizontal','Cheer','Death_A'])assert.ok(clips.includes(name),file+' supports '+name);
  for(const accessor of model.accessors)if(accessor.bufferView!==undefined)assert.ok(model.bufferViews[accessor.bufferView],'Accessor references a retained buffer');
  for(const animation of model.animations)for(const sampler of animation.samplers){assert.ok(model.accessors[sampler.input]);assert.ok(model.accessors[sampler.output]);}
  for(const view of model.bufferViews)assert.ok(view.byteOffset+view.byteLength<=model.buffers[0].byteLength,'Buffer view remains within packed binary');
}
console.log('Borgstorm v3 graphics: module syntax, page integration, viewport and all four animated character assets passed. Live graphics and UI are covered by borgstorm.browser-test.html.');
