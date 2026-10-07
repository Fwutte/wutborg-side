const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const window={addEventListener(){}};
const navigator={getGamepads:()=>[]};
for(const file of ["kart-racer-data","kart-racer"])new Function("window","navigator",fs.readFileSync(path.join(__dirname,"../js",file+".js"),"utf8"))(window,navigator);
const {TRACKS,DRIVERS}=window.WutborgKartData;
const {Kart,Race,RaceGhost,KartGame,readSave,InputManager,EMPTY}=window.WutborgKart.testHooks;
let checks=0;
function test(name,run){run();checks++;console.log("  OK  "+name);}
function raceFor(){const r=new Race(TRACKS[0],DRIVERS,{mode:"single"});r.start("max");r.state="racing";r.karts=r.karts.slice(0,2);return r;}
function place(k,x=0,y=0,speed=300){Object.assign(k,{x,y,speed,heading:0,velocityHeading:0,elevation:0,airHeight:0,offroad:false,spinTimer:0,slipstream:0});}
function charge(r,seconds=1.4){for(let i=0;i<seconds*60;i++)r.updateSlipstreams(1/60);}
const straight={length:100000,halfWidth:10000,surfaceAt:()=>"asphalt",isShortcut:()=>false,slopeAt:()=>0,
  at:s=>({x:s,y:0,s,elevation:0,slope:0,heading:0}),
  nearest:(x,y)=>({x,y:0,s:x,index:0,elevation:0,slope:0,heading:0,lateral:y,distance:Math.abs(y)})};

test("slipstream builds behind another moving car and fades when its wake is lost",()=>{
  const r=raceFor(),[p,other]=r.karts;place(p);place(other,150);charge(r);
  assert.equal(p.slipstream,1);assert.equal(p.slipstreamTarget,other);assert.equal(other.slipstream,0);
  other.y=150;charge(r,.6);assert.equal(p.slipstream,0);assert.equal(p.slipstreamTarget,null);
});
test("slipstream rejects oncoming, airborne, stopped, distant and separated cars",()=>{
  for(const change of [{velocityHeading:Math.PI},{airHeight:40},{speed:50},{x:350},{y:100},{elevation:30},{offroad:true},{finished:true}]){
    const r=raceFor();place(r.player);place(r.karts[1],150);Object.assign(r.karts[1],change);charge(r);assert.equal(r.player.slipstream,0,JSON.stringify(change));
  }
  const r=raceFor();place(r.player);place(r.karts[1],150);r.player.speed=-200;charge(r);assert.equal(r.player.slipstream,0);
});
test("nearest valid wake wins and all drivers can earn a tow",()=>{
  const r=raceFor(),third=new Kart(DRIVERS[2],2,true);third.reset(TRACKS[0]);r.karts.push(third);
  place(r.player,300);place(r.karts[1]);place(third,150);charge(r);
  assert.equal(r.karts[1].slipstreamTarget,third);assert.equal(third.slipstreamTarget,r.player);assert.equal(third.slipstream,1);
});
test("slipstream gives a bounded acceleration advantage without granting a turbo item",()=>{
  const solo=new Kart(DRIVERS[0]),tow=new Kart(DRIVERS[0]);
  for(const k of [solo,tow]){k.reset(straight);place(k,0,0,300);k.road=straight.nearest(0,0);}
  for(let i=0;i<300;i++){tow.slipstream=1;solo.update(1/60,{...EMPTY,accelerate:true},straight);tow.update(1/60,{...EMPTY,accelerate:true},straight);}
  assert.ok(tow.speed>solo.speed+8);assert.ok(tow.speed<solo.speed+35);assert.equal(tow.boostTimer,0);assert.equal(tow.boosts,0);
  tow.recover(straight);assert.equal(tow.slipstream,0);assert.equal(tow.slipstreamTarget,null);
});
test("proximity uses physical positions and excludes elevated or finished opponents",()=>{
  const r=raceFor();place(r.player);place(r.karts[1],20,-50);
  assert.equal(r.proximity()[0].lateral,-50);assert.equal(r.proximity()[0].forward,20);
  r.player.heading=Math.PI/2;assert.ok(r.proximity()[0].forward<0);
  r.karts[1].elevation=40;assert.equal(r.proximity().length,0);
  r.karts[1].elevation=0;r.karts[1].finished=true;assert.equal(r.proximity().length,0);
});
test("automatic gears shift up, avoid hunting, and select reverse and neutral",()=>{
  const k=new Kart(DRIVERS[0]);k.reset(straight);k.speed=100;
  for(let i=0;i<60;i++)k.updateDrivetrain(1/60,1);
  assert.equal(k.gear,2);const rpm=k.rpm;
  for(let i=0;i<60;i++){k.speed=i%2?85:90;k.updateDrivetrain(1/60,1);}assert.equal(k.gear,2);
  k.speed=50;for(let i=0;i<30;i++)k.updateDrivetrain(1/60,0);assert.equal(k.gear,1);
  k.speed=-40;k.updateDrivetrain(1/60,0);assert.equal(k.gear,-1);
  k.speed=0;for(let i=0;i<60;i++)k.updateDrivetrain(1/60,0);assert.equal(k.gear,0);assert.ok(k.rpm<1201);assert.ok(rpm>1200);
  k.recover(straight);assert.equal(k.gear,1);assert.equal(k.shiftTimer,0);
});
test("engine RPM drops after upshift and rises under airborne throttle",()=>{
  const k=new Kart(DRIVERS[0]);k.reset(straight);k.speed=DRIVERS[0].maxSpeed*.24*.96;
  for(let i=0;i<60;i++)k.updateDrivetrain(1/60,1);const before=k.rpm;
  k.speed=DRIVERS[0].maxSpeed*.24;for(let i=0;i<10;i++)k.updateDrivetrain(1/60,1);
  assert.equal(k.gear,2);assert.ok(k.rpm<before-1000);
  k.speed=20;k.airHeight=40;for(let i=0;i<60;i++)k.updateDrivetrain(1/60,1);assert.ok(k.rpm>7500);
});
test("lap feedback compares a completed lap with the earlier personal best",()=>{
  const r=raceFor(),k=r.player,L=r.track.length;r.options.bestLap=32;
  function finishLap(number,time){
    const before=r.track.at(L-8),after=r.track.at(4);
    Object.assign(k,{x:after.x,y:after.y,lastX:before.x,lastY:before.y,lastS:before.s,road:r.track.nearest(before.x,before.y),raceDistance:number*L-8,nextGate:number*L,gateCount:number*12-1});
    r.elapsed=time;r.updateKartProgress(k);
  }
  finishLap(1,30);assert.equal(r.lapFeedback.time,30);assert.equal(r.lapFeedback.delta,-2);assert.equal(r.lapFeedback.isBest,true);
  finishLap(2,64);assert.equal(r.lapFeedback.time,34);assert.equal(r.lapFeedback.delta,4);assert.equal(r.lapFeedback.isBest,false);
  finishLap(3,93);assert.equal(r.lapFeedback.time,29);assert.equal(r.lapFeedback.delta,-1);assert.equal(r.lapFeedback.lap,3);
});
test("a high jump clears floor traps and shells without consuming them",()=>{
  const r=raceFor(),k=r.player;r.karts=[k];k.airHeight=60;r.itemBoxes=[];r.coins=[];
  r.traps=[{x:k.x,y:k.y,owner:null,life:10}];r.shells=[{x:k.x,y:k.y,heading:0,speed:0,owner:null,life:5,bounces:0}];
  r.updateObjects(0);assert.equal(k.spinTimer,0);assert.equal(r.traps.length,1);assert.equal(r.shells.length,1);
  k.airHeight=0;r.updateObjects(0);assert.ok(k.spinTimer>0);assert.equal(r.traps.length,0);assert.equal(r.shells.length,0);
});
test("high jumps cannot collect ground pickups or trigger a pad",()=>{
  const r=raceFor(),k=r.player;r.karts=[k];r.track={...r.track,boostPads:[{x:k.x,y:k.y}],ramps:[],obstacles:[]};
  r.itemBoxes=[{x:k.x,y:k.y,cooldown:0}];r.coins=[{x:k.x,y:k.y,cooldown:0}];k.airHeight=60;
  r.updateObjects(0);assert.equal(k.coins,0);assert.equal(k.itemRoulette,0);assert.equal(k.boostTimer,0);
  k.airHeight=0;r.updateObjects(0);assert.equal(k.coins,1);assert.ok(k.itemRoulette>0);assert.ok(k.boostTimer>0);
});
test("rear view can be held from keyboard or touch and reset never latches it",()=>{
  const input=new InputManager();input.keys.add("KeyC");assert.equal(input.read().lookBack,true);input.reset();assert.equal(input.read().lookBack,false);
  input.setControl("lookBack",true,4);input.setControl("accelerate",true,5);assert.equal(input.read().lookBack,true);assert.equal(input.read().accelerate,true);
  input.setControl("lookBack",false,4);assert.equal(input.read().lookBack,false);assert.equal(input.read().accelerate,true);
});
test("controller Y holds rear view while RT remains available, and disconnect clears it",()=>{
  const pad={connected:true,axes:[0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
  try{
    const input=new InputManager();pad.buttons[3].pressed=true;pad.buttons[7].value=.6;
    assert.equal(input.read().lookBack,true);assert.equal(input.read().accelerate,.6);
    pad.buttons[3].pressed=false;assert.equal(input.read().lookBack,false);
    pad.buttons[3].pressed=true;pad.connected=false;assert.equal(input.read().lookBack,false);
  }finally{navigator.getGamepads=()=>[];}
});
test("gamepad commands fire once across resets and never auto-fire on connect",()=>{
  const pad={id:"test",index:0,connected:true,axes:[0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[pad];
  try{
    const input=new InputManager();pad.buttons[9].pressed=true;assert.equal(input.readCommands().pause,false);
    pad.buttons[9].pressed=false;input.readCommands();pad.buttons[9].pressed=true;assert.equal(input.readCommands().pause,true);
    input.reset();assert.equal(input.readCommands().pause,false);
    pad.buttons[1].pressed=true;assert.equal(input.readCommands().recover,true);assert.equal(input.readCommands().recover,false);
    pad.connected=false;input.readCommands();pad.connected=true;assert.equal(input.readCommands().pause,false);assert.equal(input.readCommands().recover,false);
  }finally{navigator.getGamepads=()=>[];}
});
test("touch recovery is consumed once and cancelled by input reset",()=>{
  const input=new InputManager();input.setControl("recover",true,4);assert.equal(input.readCommands().recover,true);assert.equal(input.readCommands().recover,false);
  input.setControl("recover",true,4);input.reset();assert.equal(input.readCommands().recover,false);
});
test("cars on separate elevations cannot collide through bridges",()=>{
  const r=raceFor(),[a,b]=r.karts;place(a);place(b);b.elevation=60;
  r.resolveKartCollisions();assert.equal(a.x,0);assert.equal(b.x,0);
  b.airHeight=0;b.elevation=0;a.airHeight=60;r.resolveKartCollisions();assert.equal(a.x,0);
  a.airHeight=0;r.resolveKartCollisions();assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>38);
});
const ghostFixture=()=>({time:2,savedAt:1,frames:[[0,0,0,3.1,0,0,-10],[1,100,0,-3.1,10,20,90],[2,200,50,-3,20,0,190]]});
test("ghost interpolation follows position, jump height and the shortest heading arc",()=>{
  const ghost=new RaceGhost(ghostFixture()),pose=ghost.pose(.5);
  assert.equal(pose.x,50);assert.equal(pose.elevation,5);assert.equal(pose.airHeight,10);assert.ok(Math.abs(pose.heading-Math.PI)<.001);
  assert.equal(ghost.pose(3),null);assert.equal(ghost.timeAtProgress(40),.5);assert.equal(ghost.timeAtProgress(500),2);
});
test("ghost delta finds first progress crossing even when the recorded car reverses",()=>{
  const record=ghostFixture();record.frames[1][6]=-10;
  const ghost=new RaceGhost(record);assert.equal(ghost.timeAtProgress(-10),0);assert.equal(ghost.timeAtProgress(90),1.5);
});
test("ghost capture has bounded samples, completes exact endpoints and rejects assisted/slower runs",()=>{
  const k=new Kart(DRIVERS[0]);k.reset(straight);const ghost=new RaceGhost();
  for(let frame=0;frame<=120;frame++){k.x=frame*2;k.progress=k.x;ghost.capture(frame/60,k,frame===120);}
  const saved=ghost.complete(2);assert.ok(RaceGhost.valid(saved));assert.ok(saved.frames.length<=22);assert.equal(saved.frames[0][0],0);assert.equal(saved.frames.at(-1)[0],2);
  assert.equal(ghost.complete(2,1),null);ghost.saved=saved;assert.equal(ghost.complete(3),null);
});
test("malformed and excessive replay data is discarded without losing records/preferences",()=>{
  const bad=[null,{}, {...ghostFixture(),time:-1},{...ghostFixture(),frames:[[0,0,0,0,0,0,0],[0,1,1,1,1,1,1]]},{...ghostFixture(),frames:[[0,0,0,0,0,0,0],[2,100000,0,0,0,0,1]]}];
  for(const record of bad){assert.equal(RaceGhost.valid(record),false);assert.equal(new RaceGhost(record).saved,null);}
  const records=Object.fromEntries(Array.from({length:6},(_,i)=>[String(i),{...ghostFixture(),savedAt:i}]));records.bad={frames:"broken"};
  const saved=readSave({getItem:()=>JSON.stringify({ghosts:records,records:{best:{time:2}},settings:{driver:"luna"}})});
  assert.equal(Object.keys(saved.ghosts).length,4);assert.equal(saved.ghosts.bad,undefined);assert.equal(saved.records.best.time,2);assert.equal(saved.settings.driver,"luna");
});
test("ghost keys isolate track revision and chosen driver; replay is not a racing opponent",()=>{
  const key=KartGame.prototype.ghostKey.call({track:TRACKS[0],selectedDriver:"max"});
  assert.notEqual(key,KartGame.prototype.ghostKey.call({track:TRACKS[0],selectedDriver:"luna"}));
  assert.notEqual(key,KartGame.prototype.ghostKey.call({track:TRACKS[1],selectedDriver:"max"}));
  const r=new Race(TRACKS[0],DRIVERS,{mode:"time",ghost:ghostFixture()});r.start("max");assert.equal(r.karts.length,1);assert.ok(r.ghost.saved);
  const before=JSON.stringify({x:r.player.x,y:r.player.y,coins:r.player.coins,progress:r.player.progress});r.ghost.pose(1);
  assert.equal(JSON.stringify({x:r.player.x,y:r.player.y,coins:r.player.coins,progress:r.player.progress}),before);
  r.start("luna");assert.equal(r.ghost.frames.length,1);
});
test("storage quota evicts the oldest replay while preserving records and preferences",()=>{
  const original=global.localStorage;let stored;
  global.localStorage={setItem(key,value){const save=JSON.parse(value);if(Object.keys(save.ghosts).length>1){const error=Error('quota');error.name='QuotaExceededError';throw error;}stored=save;}};
  try{
    const game={save:{records:{best:{time:10}},ghosts:{old:{...ghostFixture(),savedAt:1},middle:{...ghostFixture(),savedAt:2},newest:{...ghostFixture(),savedAt:3}}},selectedDriver:'max',selectedTrackId:TRACKS[0].id,mode:'time',difficulty:'normal',autoGas:false,assist:true,audio:{enabled:false}};
    KartGame.prototype.persist.call(game);assert.deepEqual(Object.keys(stored.ghosts),['newest']);assert.equal(stored.records.best.time,10);assert.equal(stored.settings.driver,'max');
  }finally{if(original===undefined)delete global.localStorage;else global.localStorage=original;}
});
console.log(`Racing: ${checks} gameplay checks passed.`);
