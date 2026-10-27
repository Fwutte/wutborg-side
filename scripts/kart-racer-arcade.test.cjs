const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let seed=409;
const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const window={addEventListener(){}},navigator={getGamepads:()=>[]};
for(const file of ['kart-racer-data','kart-racer'])new Function('window','navigator','Math',fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'))(window,navigator,math);
const {TRACKS,DRIVERS}=window.WutborgKartData;
const {Race,Kart,InputManager,EMPTY}=window.WutborgKart.testHooks;
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('  OK  '+name);};
const gas={...EMPTY,accelerate:true};
function raceFor(options={}){const r=new Race(TRACKS[0],DRIVERS,options);r.start('max');r.state='racing';return r;}
function place(k,t,s,lateral=0,speed=0){const p=t.at(s,lateral);Object.assign(k,p,{speed,velocityHeading:p.heading,road:t.nearest(p.x,p.y),raceDistance:s,progress:s,lastS:p.s,lastX:p.x,lastY:p.y});}

test('two item slots preserve order and never accept a third item',()=>{
 const r=raceFor(),k=r.player;
 assert.ok(r.giveItem(k,'banana'));assert.ok(r.giveItem(k,'redShell'));assert.equal(r.giveItem(k,'star'),false);
 assert.ok(r.useItem(k));assert.equal(k.item,'redShell');assert.equal(k.reserveItem,null);
 assert.ok(r.useItem(k));assert.equal(k.item,null);assert.equal(r.traps.length,1);assert.equal(r.shells.length,1);
});
test('triple turbo uses exactly three presses before promoting the reserve',()=>{
 const r=raceFor(),k=r.player;r.giveItem(k,'tripleTurbo');r.giveItem(k,'horn');
 for(const count of [2,1]){r.useItem(k);assert.equal(k.item,'tripleTurbo');assert.equal(k.itemCharges,count);}
 r.useItem(k);assert.equal(k.item,'horn');assert.equal(k.itemCharges,1);assert.equal(k.reserveItem,null);
});
test('double boxes award two items after one roulette and full inventories leave boxes available',()=>{
 const r=raceFor(),k=r.player;r.karts=[k];r.coins=[];
 const box=r.itemBoxes.find(b=>b.double);place(k,r.track,box.s,r.track.halfWidth*.55);k.x=box.x;k.y=box.y;
 r.updateObjects(1/60);assert.ok(k.pendingItem&&k.pendingReserve);assert.ok(k.itemRoulette>0);
 for(let i=0;i<50;i++)r.update(1/60,EMPTY);
 assert.ok(k.item&&k.reserveItem);box.cooldown=0;r.updateObjects(1/60);assert.equal(box.cooldown,0);assert.equal(k.itemRoulette,0);
});
test('using the front item during reserve roulette cannot duplicate or lose the earned item',()=>{
 const r=raceFor(),k=r.player;r.karts=[k];r.itemBoxes=[];r.coins=[];r.giveItem(k,'banana');
 k.pendingItem='star';k.itemRoulette=.1;r.useItem(k);
 for(let i=0;i<7;i++)r.update(1/60,EMPTY);
 assert.equal(k.item,'star');assert.equal(k.reserveItem,null);assert.equal(k.pendingItem,null);
});
test('a held defensive item intercepts a projectile, consumes once and promotes the reserve',()=>{
 const r=raceFor(),k=r.player,other=r.karts[1];r.itemBoxes=[];r.coins=[];place(k,r.track,900);place(other,r.track,300);
 r.giveItem(k,'banana');r.giveItem(k,'horn');k.defending=true;
 const guard=r.guardPosition(k);r.shells=[{...guard,heading:k.heading,speed:0,owner:other,life:4,homing:false,bounces:0}];
 r.updateObjects(1/60);assert.equal(r.shells.length,0);assert.equal(k.spinTimer,0);assert.equal(k.blocks,1);assert.equal(k.item,'horn');assert.equal(k.defending,false);
});
test('an undefended hit spins the kart; shielding never grants immunity to side impacts',()=>{
 const r=raceFor(),k=r.player,other=r.karts[1];r.itemBoxes=[];r.coins=[];place(k,r.track,900);place(other,r.track,300);
 r.giveItem(k,'shell');k.defending=true;r.shells=[{x:k.x,y:k.y,heading:k.heading,speed:0,owner:other,life:4,homing:false,bounces:0}];
 r.updateObjects(1/60);assert.ok(k.spinTimer>0);assert.equal(k.item,'shell');assert.equal(k.blocks,0);
});
test('rearward projectiles start behind the kart and do not acquire a forward homing target',()=>{
 const r=raceFor(),k=r.player;r.giveItem(k,'redShell');r.useItem(k,true);const s=r.shells[0];
 assert.ok((s.x-k.x)*Math.cos(k.heading)+(s.y-k.y)*Math.sin(k.heading)<0);assert.equal(s.homing,false);assert.equal(s.target,null);
});
test('defence, traps and shockwaves cannot cross separated road elevations',()=>{
 const r=raceFor(),k=r.player,other=r.karts[1];r.itemBoxes=[];r.coins=[];place(k,r.track,900);place(other,r.track,300);
 const nearest=r.track.nearest.bind(r.track);r.track={...r.track,nearest:(...args)=>({...nearest(...args),elevation:0})};k.elevation=100;
 r.giveItem(k,'shell');k.defending=true;r.shells=[{...r.guardPosition(k),heading:k.heading,speed:0,owner:other,life:4,homing:false,bounces:0}];
 r.traps=[{x:k.x,y:k.y,elevation:0,owner:other,life:4}];r.updateObjects(1/60);
 assert.equal(k.blocks,0);assert.equal(k.spinTimer,0);assert.equal(r.shells.length,1);assert.equal(r.traps.length,1);
 k.item='horn';r.useItem(k);assert.equal(r.shells.length,1);
});
test('shockwave clears nearby projectiles and respects rivals on a separate elevation',()=>{
 const r=raceFor(),k=r.player;place(k,r.track,900);r.karts.slice(1).forEach((v,i)=>{place(v,r.track,900+(i+1)*15);});
 const high=r.karts[2];high.elevation=k.elevation+100;r.giveItem(k,'horn');
 r.shells=[{x:k.x,y:k.y,life:4},{x:k.x+500,y:k.y,life:4}];r.useItem(k);
 assert.equal(r.shells.length,1);assert.ok(r.karts[1].spinTimer>0);assert.equal(high.spinTimer,0);assert.ok(k.waveTimer>0);
});
test('leaders receive no heavy catch-up weapons; a large gap improves a chasing driver\'s pool',()=>{
 const r=raceFor(),front=r.karts[0],chaser=r.karts[1];front.progress=2000;chaser.progress=1900;r.lastRankings=[front,chaser];r.elapsed=40;
 const leader=new Set(Array.from({length:150},()=>r.itemForRank(1,front)));assert.ok(!leader.has('star')&&!leader.has('lightning')&&!leader.has('tripleTurbo'));
 const close=Array.from({length:250},()=>r.itemForRank(2,chaser));assert.ok(!close.includes('star'));
 chaser.progress=0;const distant=Array.from({length:250},()=>r.itemForRank(2,chaser));assert.ok(distant.includes('star')&&distant.includes('tripleTurbo'));assert.ok(!distant.includes('lightning'));
});
test('lightning is excluded early and during its global supply cooldown',()=>{
 const r=raceFor(),k=r.karts[7];r.elapsed=4;assert.ok(!Array.from({length:300},()=>r.itemForRank(8,k)).includes('lightning'));
 r.elapsed=40;assert.ok(Array.from({length:300},()=>r.itemForRank(8,k)).includes('lightning'));
 r.giveItem(k,'lightning');r.useItem(k);assert.ok(!Array.from({length:300},()=>r.itemForRank(8,k)).includes('lightning'));
});
test('start boost rewards the 2 cue, including drift input with auto-accelerate',()=>{
 for(const autoGas of [false,true]){
  const r=raceFor({autoGas});r.state='countdown';
  for(let i=0;i<65;i++)r.update(1/60,{...EMPTY,accelerate:autoGas});
  for(let i=0;i<117;i++)r.update(1/60,{...gas,launch:autoGas});
  assert.equal(r.state,'racing');assert.ok(r.player.boostTimer>1.4);
 }
 const early=raceFor();early.state='countdown';for(let i=0;i<181;i++)early.update(1/60,gas);assert.equal(early.player.boostTimer,0);assert.ok(early.player.spinTimer>0);
});
const straight={length:100000,halfWidth:10000,surfaceAt:()=> 'asphalt',isShortcut:()=>false,slopeAt:()=>0,
 at:s=>({x:s,y:0,s,elevation:0,slope:0,heading:0}),nearest:(x,y)=>({x,y:0,s:x,index:0,elevation:0,slope:0,heading:0,lateral:y,distance:Math.abs(y)})};
function kartFor(){const k=new Kart(DRIVERS[0]);k.reset(straight);k.speed=280;return k;}
test('braking inside a drift reduces speed without discarding its charge',()=>{
 const k=kartFor();for(let i=0;i<40;i++)k.update(1/60,{...gas,steer:.7,drift:true},straight);const before=k.speed,charge=k.driftTimer;
 for(let i=0;i<10;i++)k.update(1/60,{...gas,steer:.7,drift:true,brake:true},straight);
 assert.ok(k.drifting);assert.ok(k.speed<before);assert.ok(k.driftTimer>=charge);
});
test('an early airborne drift press latches a trick until landing; late presses do not',()=>{
 const k=kartFor();k.airHeight=1;k.airVelocity=160;k.trickWindow=.38;
 k.update(1/60,{...gas,drift:true},straight);assert.ok(k.trickReady);
 for(let i=0;i<100&&k.airHeight>0;i++)k.update(1/60,gas,straight);
 assert.equal(k.tricks,1);assert.ok(k.boostTimer>.9);assert.equal(k.boostKind,'TRICK-TURBO');
 const late=kartFor();late.airHeight=25;late.airVelocity=-70;late.trickWindow=0;late.update(1/60,{...gas,drift:true},straight);assert.equal(late.trickReady,false);
});
test('turbo retains speed over off-road while ordinary driving slows down',()=>{
 const offroad={...straight,halfWidth:10},plain=kartFor(),boosted=kartFor();plain.y=boosted.y=100;plain.road=boosted.road=offroad.nearest(0,100);boosted.boostTimer=1.7;
 for(let i=0;i<30;i++){plain.update(1/60,gas,offroad);boosted.update(1/60,gas,offroad);}
 assert.ok(boosted.speed>plain.speed+100);
});
test('time trial has three turbo uses and no offensive pickups or reserve',()=>{
 const r=raceFor({mode:'time'}),k=r.player;assert.equal(k.item,'tripleTurbo');assert.equal(k.itemCharges,3);assert.equal(k.reserveItem,null);assert.equal(r.itemBoxes.length,0);
 for(let i=0;i<3;i++)assert.ok(r.useItem(k));assert.equal(k.item,null);assert.equal(r.useItem(k),false);
});
test('touch and gamepad defence are held controls and clear on reset/disconnect',()=>{
 const input=new InputManager();input.setControl('defend',true,2);assert.equal(input.read().defend,true);input.reset();assert.equal(input.read().defend,false);
 const pad={connected:true,buttons:Array.from({length:16},()=>({pressed:false,value:0})),axes:[0]};navigator.getGamepads=()=>[pad];pad.buttons[4].pressed=true;assert.equal(input.read().defend,true);pad.connected=false;assert.equal(input.read().defend,false);
});
test('finished races reject item activation and restarting resets the entire arcade state',()=>{
 const r=raceFor(),k=r.player;r.giveItem(k,'horn');r.state='finished';assert.equal(r.useItem(k),false);k.blocks=4;k.tricks=2;k.defending=true;r.start('max');
 assert.equal(r.player.item,null);assert.equal(r.player.reserveItem,null);assert.equal(r.player.tricks,0);assert.equal(r.player.blocks,0);assert.equal(r.player.defending,false);
});
console.log(`Arcade: ${checks} checks passed.`);
