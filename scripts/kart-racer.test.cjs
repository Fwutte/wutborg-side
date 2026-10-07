const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
let seed=7;
const math=Object.create(Math);
math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const context={window:{addEventListener(){}},Math:math,console};
for(const file of ["js/kart-racer-data.js","js/kart-racer.js"])vm.runInNewContext(fs.readFileSync(path.join(root,file),"utf8"),context);
const {data,formatTime,testHooks}=context.window.WutborgKart;
const {Kart,Race,RaceAI,InputManager,KartGame,readSave,EMPTY}=testHooks;
const {TRACKS,DRIVERS,DIFFICULTIES,angleDelta}=data;
const gas={...EMPTY,accelerate:true};
let checks=0;
function test(name,run){run();checks++;console.log("  OK  "+name);}
function raceFor(track=TRACKS[0],options={}){const race=new Race(track,DRIVERS,options);race.start("max");return race;}
function position(race,k,s,offset=0){const p=race.track.at(s,offset);k.x=p.x;k.y=p.y;k.speed=200;race.elapsed+=1/60;race.updateKartProgress(k);}
function march(race,k,from,to,offset=0){const direction=Math.sign(to-from);for(let s=from+direction*8;direction*(to-s)>=0;s+=direction*8)position(race,k,s,offset);position(race,k,to,offset);}

test("six closed, distinct tracks; pickups and grid stay on the road",()=>{
  assert.equal(TRACKS.length,6);assert.equal(DRIVERS.length,8);
  for(const t of TRACKS){
    assert.equal(t.samples.length,1024);assert.ok(t.length>10000);
    const a=t.at(0),b=t.at(t.length);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.001);
    for(let s=0;s<t.length;s+=47){
      const p=t.at(s),n=t.nearest(p.x,p.y);
      assert.ok(n.distance<.001);
      assert.ok(Math.abs(angleDelta(p.heading,n.heading))<.08);
      assert.ok(t.isRoad(p.x,p.y));
    }
    for(const p of [...t.coins,...t.itemBoxes,...t.boostPads])assert.ok(t.isRoad(p.x,p.y));
    for(let i=0;i<8;i++){const k=new Kart(DRIVERS[i],i);k.reset(t);assert.ok(t.isRoad(k.x,k.y));}
  }
  assert.equal(new Set(TRACKS.map(t=>Math.round(t.length))).size,6);
});
test("expanded roads and hills remain continuous, wide and within their maps",()=>{
  for(const t of TRACKS){
    assert.equal(t.revision,6);assert.ok(t.bridge[0]<t.bridge[1]);
    assert.ok(Math.abs(t.elevationAt(-.01)-t.elevationAt(t.length+.01))<.01);
    assert.ok(Math.abs(t.slopeAt(-.01)-t.slopeAt(t.length+.01))<.001);
    let highest=0;
    for(let s=0;s<t.length;s+=37){
      const p=t.at(s),bend=Math.abs(angleDelta(p.heading,t.at(s+20).heading));
      assert.ok(20/Math.max(bend,.00001)>t.halfWidth+75,"both road edges must stay free of offset cusps");
      assert.ok(Math.abs(p.slope)<.25,"no abrupt hill faces");highest=Math.max(highest,p.elevation);
      for(const offset of [-t.halfWidth-62,t.halfWidth+62]){
        const edge=t.at(s,offset),near=t.nearest(edge.x,edge.y);
        assert.ok(Math.abs(near.distance-Math.abs(offset))<2,"run-off must not intersect another section");
        assert.ok(edge.x>t.bounds.minX&&edge.x<t.bounds.maxX&&edge.y>t.bounds.minY&&edge.y<t.bounds.maxY);
      }
    }
    assert.ok(highest>180);
  }
});
test("karts and recovery follow the same hill height as the road",()=>{
  for(const t of TRACKS){
    const k=new Kart(DRIVERS[0]);k.reset(t);
    const p=t.at(t.length*t.hills[0][0]);Object.assign(k,{...p,velocityHeading:p.heading,road:t.nearest(p.x,p.y),speed:200});
    k.update(1/60,gas,t);assert.equal(k.elevation,k.road.elevation);assert.ok(Number.isFinite(k.slope));
    k.recover(t);assert.equal(k.elevation,t.elevationAt(k.raceDistance));
  }
});
test("new course records are isolated while driver preferences are retained",()=>{
  const track=TRACKS[0],oldKey=track.id+":v5:normal";
  const saved=readSave({getItem:()=>JSON.stringify({records:{[oldKey]:{time:45}},settings:{driver:"luna",autoGas:true}})});
  const key=KartGame.prototype.recordKey.call({track,mode:"single",difficulty:"normal"});
  assert.equal(key,track.id+":v6:normal");assert.notEqual(key,oldKey);assert.equal(saved.records[key],undefined);assert.equal(saved.records[oldKey].time,45);
  assert.equal(saved.settings.driver,"luna");assert.equal(saved.settings.autoGas,true);
});
test("countdown, correct rear grid position and start boost timing",()=>{
  const r=raceFor(),x=r.player.x,y=r.player.y;assert.equal(r.player.rank,8);
  for(let i=0;i<120;i++)r.update(1/60,EMPTY);
  assert.equal(r.state,"countdown");assert.equal(r.elapsed,0);assert.equal(r.player.x,x);assert.equal(r.player.y,y);
  for(let i=0;i<61;i++)r.update(1/60,gas);
  assert.equal(r.state,"racing");assert.ok(r.player.boostTimer>1);
  const early=raceFor();for(let i=0;i<181;i++)early.update(1/60,gas);
  assert.equal(early.player.boostTimer,0,"holding gas from the beginning must not give a perfect start");
});
test("acceleration, braking, reverse and off-road slowdown",()=>{
  const k=new Kart(DRIVERS[0]);k.reset(TRACKS[0]);
  for(let i=0;i<60;i++)k.update(1/60,gas,TRACKS[0]);
  assert.ok(k.speed>150);const before=k.speed;
  for(let i=0;i<30;i++)k.update(1/60,{...EMPTY,brake:true},TRACKS[0]);
  assert.ok(k.speed<before-90);
  for(let i=0;i<120;i++)k.update(1/60,{...EMPTY,brake:true},TRACKS[0]);
  assert.ok(k.speed<0&&k.speed>=-95);
  k.reset(TRACKS[0]);const p=TRACKS[0].at(300,TRACKS[0].halfWidth+30);
  Object.assign(k,{x:p.x,y:p.y,heading:p.heading,velocityHeading:p.heading,speed:300,road:TRACKS[0].nearest(p.x,p.y)});
  k.update(1/60,gas,TRACKS[0]);assert.ok(k.offroad);assert.ok(k.speed<300);
});
test("drift builds charge, releases a turbo and cannot charge at rest",()=>{
  const k=new Kart(DRIVERS[0]);k.reset(TRACKS[0]);
  k.speed=250;k.update(1/60,{...gas,steer:1,drift:true},TRACKS[0]);k.update(1/60,{...gas,steer:1,drift:true},TRACKS[0]);
  assert.ok(k.drifting);k.driftTimer=1.85;k.update(1/60,gas,TRACKS[0]);
  assert.ok(k.boostTimer>1.3);assert.equal(k.boosts,1);assert.equal(k.drifting,false);
  k.reset(TRACKS[0]);k.update(1/60,{...EMPTY,steer:1,drift:true},TRACKS[0]);assert.equal(k.drifting,false);
  k.drifting=true;k.driftTimer=2;k.applySpin();assert.equal(k.boostTimer,0,"a hit must cancel a drift without granting a turbo");
});
test("laps count at the finish after all 12 gates, on asphalt and run-off",()=>{
  for(const offset of [0,TRACKS[0].halfWidth+30]){
    const r=raceFor(),k=r.player,L=r.track.length;r.state="racing";
    const start=k.raceDistance;
    march(r,k,start,L-15,offset);assert.equal(k.lap,0);
    march(r,k,L-15,L+20,offset);assert.equal(k.lap,1);
    march(r,k,L+20,3*L+20,offset);assert.equal(k.lap,3);assert.ok(k.finished);
    assert.equal(k.lapTimes.length,3);
    const frozen=k.finishTime;r.elapsed+=20;r.updateKartProgress(k);assert.equal(k.finishTime,frozen);
  }
});
test("backwards travel, finish-line oscillation and teleports cannot award laps",()=>{
  const r=raceFor(),k=r.player,L=r.track.length;r.state="racing";
  const start=k.raceDistance;
  march(r,k,start,-L-250);assert.equal(k.lap,0);assert.equal(k.gateCount,0);
  const tele=raceFor();tele.state="racing";
  for(let i=1;i<=36;i++)position(tele,tele.player,i*L/12+3);
  assert.equal(tele.player.lap,0);
  const line=raceFor();line.state="racing";
  march(line,line.player,line.player.raceDistance,20);
  for(let i=0;i<8;i++){march(line,line.player,20,-20);march(line,line.player,-20,20);}
  assert.equal(line.player.lap,0);
});
test("recovery returns to the unpassed gate without granting progress",()=>{
  const r=raceFor(),k=r.player;k.raceDistance=k.nextGate+700;k.x=9999;k.y=-9000;k.recover(r.track);
  assert.ok(r.track.isRoad(k.x,k.y));assert.ok(k.raceDistance<k.nextGate);
  const lap=k.lap;r.updateKartProgress(k);assert.equal(k.lap,lap);assert.ok(k.invincibleTimer>0);
});
test("all six items, protection, traps, homing targets and cooldowns",()=>{
  const r=raceFor();r.state="racing";const p=r.player;
  for(const item of ["mushroom","banana","shell","redShell","star"]){p.item=item;assert.equal(r.useItem(p),true);assert.equal(p.item,null);}
  assert.ok(p.boostTimer>0);assert.equal(r.traps.length,1);assert.equal(r.shells.length,2);
  assert.equal(r.shells[1].homing,true);assert.ok(r.shells[1].target.progress>p.progress);
  assert.ok(p.starTimer>5);assert.equal(p.applySpin(),false);
  p.item="lightning";r.useItem(p);assert.ok(r.karts.slice(1).every(k=>k.spinTimer>0));
  const c=r.coins[0];p.x=c.x;p.y=c.y;p.coins=9;r.updateObjects(1/60);assert.equal(p.coins,10);
  r.updateObjects(1/60);assert.equal(p.coins,10);assert.ok(c.cooldown>0);
  const box=r.itemBoxes[0];p.x=box.x;p.y=box.y;p.item=null;r.updateObjects(1/60);assert.ok(p.itemRoulette>0);assert.ok(box.cooldown>0);
});
test("overlapping karts separate without NaN or permanent speed loss",()=>{
  const r=raceFor(),a=r.karts[0],b=r.karts[1];b.x=a.x;b.y=a.y;a.speed=b.speed=200;
  r.resolveKartCollisions();assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius);
  assert.ok(Number.isFinite(a.x)&&Number.isFinite(b.y));assert.equal(a.speed,200);
});
test("finished racers stay ranked by finish time and the result freezes",()=>{
  const r=raceFor();r.state="racing";
  r.karts[1].finished=true;r.karts[1].finishTime=40;r.karts[1].progress=100;
  r.player.finished=true;r.player.finishTime=45;r.player.lapTimes=[15,14,16];r.player.progress=9000;r.elapsed=45;
  r.finish();assert.equal(r.result.position,2);assert.equal(r.result.bestLap,14);
  r.update(1,gas);assert.equal(r.elapsed,45);
});
test("time trial has one driver and no offensive pickups",()=>{
  const r=raceFor(TRACKS[0],{mode:"time"});assert.equal(r.karts.length,1);assert.equal(r.itemBoxes.length,0);assert.ok(r.coins.length>0);
});
test("keyboard/touch state clears and simultaneous pointers remain independent",()=>{
  const input=new InputManager();input.setControl("left",true,1);input.setControl("drift",true,2);input.setControl("item",true,3);
  let v=input.read(true);assert.equal(v.steer,-1);assert.ok(v.drift&&v.accelerate&&v.itemPressed);
  input.setControl("left",false,1);v=input.read();assert.equal(v.steer,0);assert.ok(v.drift);assert.equal(v.itemPressed,false);
  input.setControl("brake",true,4);assert.equal(input.read(true).accelerate,false);
  input.reset();assert.equal(input.read().drift,false);assert.equal(input.read().brake,false);
});
test("malformed or unavailable storage and time rounding",()=>{
  for(const value of ["{", "null", "5", '{"records":null,"settings":null}'])assert.ok(readSave({getItem:()=>value}).records);
  assert.ok(readSave({getItem(){throw Error("blocked");}}).records);
  assert.equal(formatTime(59.999),"1:00.00");assert.equal(formatTime(-1),"0:00.00");
});

// An unbounded flat road isolates handling from barriers, pickups and course curvature.
function handlingTrack(surface="asphalt"){
  return {halfWidth:100000,surfaceAt:()=>surface,isShortcut:()=>false,slopeAt:()=>0,
    at:s=>({x:s,y:0,s,elevation:0,slope:0,heading:0}),
    nearest:(x,y)=>({x,y:0,s:x,index:0,elevation:0,slope:0,heading:0,lateral:y,distance:Math.abs(y)})};
}
function handlingKart(speed=0,track=handlingTrack()){
  const kart=new Kart(DRIVERS[0]);kart.reset(track);
  Object.assign(kart,{x:0,y:0,heading:0,velocityHeading:0,speed,road:track.nearest(0,0)});
  return kart;
}
function drive(kart,track,input,seconds){for(let i=0;i<Math.round(seconds*60);i++)kart.update(1/60,input,track);}

test("stationary steering cannot rotate a kart and reverse steering changes direction",()=>{
  const track=handlingTrack(),parked=handlingKart(0,track);
  drive(parked,track,{...EMPTY,steer:1},1);assert.equal(parked.heading,0);assert.equal(parked.speed,0);
  const forward=handlingKart(80,track),reverse=handlingKart(-80,track);
  drive(forward,track,{...EMPTY,steer:1},.3);drive(reverse,track,{...EMPTY,steer:1},.3);
  assert.ok(forward.heading>.05);assert.ok(reverse.heading<-.05);
});
test("high-speed steering reduces wheel angle and respects available grip",()=>{
  const track=handlingTrack(),slow=handlingKart(80,track),fast=handlingKart(480,track);
  drive(slow,track,{...EMPTY,steer:1},.3);drive(fast,track,{...EMPTY,steer:1},.3);
  assert.ok(Math.abs(fast.steeringAngle)<Math.abs(slow.steeringAngle)*.65);
  assert.ok(Math.abs(fast.yawRate)*Math.abs(fast.speed)<900,"full steering at boost speed has a finite grip budget");
  const heading=fast.heading;drive(fast,track,EMPTY,.6);
  assert.ok(Math.abs(fast.yawRate)<.12,"steering recenters after releasing the key");assert.ok(fast.heading>heading);
});
test("partial throttle and brake remain proportional; braking pauses before reverse",()=>{
  const track=handlingTrack(),full=handlingKart(0,track),partial=handlingKart(0,track);
  drive(full,track,gas,1);drive(partial,track,{...gas,accelerate:.35},1);
  assert.ok(partial.speed>30&&partial.speed<full.speed*.55);
  const hard=handlingKart(250,track),soft=handlingKart(250,track);
  drive(hard,track,{...EMPTY,brake:true},.3);drive(soft,track,{...EMPTY,brake:.3},.3);
  assert.ok(hard.speed<soft.speed-50);
  const reverse=handlingKart(0,track);drive(reverse,track,{...EMPTY,brake:true},.2);assert.equal(reverse.speed,0);
  drive(reverse,track,{...EMPTY,brake:true},1);assert.ok(reverse.speed<-50&&reverse.speed>=-95);
  drive(reverse,track,gas,.1);assert.ok(reverse.speed<=0,"gas brakes reverse motion before driving forwards");
  drive(reverse,track,gas,1);assert.ok(reverse.speed>100);
});
test("boost expiration decelerates smoothly instead of snapping to a speed cap",()=>{
  const track=handlingTrack(),kart=handlingKart(470,track);kart.boostTimer=.001;
  kart.update(1/60,gas,track);assert.ok(kart.speed>450&&kart.speed<470);
  drive(kart,track,gas,3);assert.ok(kart.speed<=kart.driver.maxSpeed+1);
});
test("drift responds to countersteer, restores grip and cannot charge on a straight",()=>{
  const track=handlingTrack(),kart=handlingKart(280,track);
  drive(kart,track,{...gas,steer:.7,drift:true},.7);
  assert.ok(kart.drifting&&kart.driftTimer>.3);assert.ok(kart.slipAngle<-.15);
  const yawBefore=kart.yawRate;drive(kart,track,{...gas,steer:-1,drift:true},.3);
  assert.ok(kart.yawRate<yawBefore-.4,"opposite steering controls the slide");
  const charge=kart.driftTimer;drive(kart,track,{...gas,steer:-1,drift:true},.1);assert.equal(kart.driftTimer,charge);
  drive(kart,track,gas,1);assert.equal(kart.drifting,false);assert.ok(Math.abs(kart.slipAngle)<.05);
  const straight=handlingKart(280,track);drive(straight,track,{...gas,drift:true},1);
  assert.equal(straight.driftTimer,0);assert.equal(straight.boostTimer,0);
});
test("ice has less cornering grip and airborne steering preserves momentum",()=>{
  const asphalt=handlingTrack(),ice=handlingTrack("ice"),dry=handlingKart(300,asphalt),icy=handlingKart(300,ice);
  drive(dry,asphalt,{...gas,steer:1},.6);drive(icy,ice,{...gas,steer:1},.6);
  assert.ok(Math.abs(icy.slipAngle)>Math.abs(dry.slipAngle)*1.3);assert.ok(icy.yawRate<dry.yawRate);
  const air=handlingKart(300,asphalt);air.airHeight=200;air.airVelocity=100;
  drive(air,asphalt,{...gas,steer:1,drift:true},.5);
  assert.ok(Math.abs(air.y)<.00001);assert.ok(Math.abs(air.speed-300)<.00001);assert.ok(air.heading<.15);
  assert.equal(air.driftTimer,0);assert.equal(air.airHeight>0,true);
});
test("barrier glances preserve tangent speed and a head-on contact removes outward motion",()=>{
  const track=handlingTrack();track.halfWidth=100;
  const glancing=handlingKart(300,track);glancing.y=163;glancing.velocityHeading=.15;glancing.road=track.nearest(glancing.x,glancing.y);
  glancing.update(1/60,EMPTY,track);const v=glancing.velocity();
  assert.ok(glancing.y<=162.01);assert.ok(v.x>270&&v.y<=0);
  const headOn=handlingKart(300,track);headOn.y=163;headOn.heading=headOn.velocityHeading=Math.PI/2;headOn.road=track.nearest(headOn.x,headOn.y);
  headOn.update(1/60,EMPTY,track);assert.ok(headOn.velocity().y<=0&&Math.abs(headOn.speed)<30);
});
test("kart collision impulses conserve momentum without adding kinetic energy",()=>{
  const race=raceFor(),a=race.karts[0],b=race.karts[1];race.karts=[a,b];
  Object.assign(a,{x:0,y:0,heading:0,velocityHeading:0,speed:300});Object.assign(b,{x:30,y:0,heading:0,velocityHeading:0,speed:100});
  const momentum=a.speed*a.driver.weight+b.speed*b.driver.weight;
  const energy=a.speed**2*a.driver.weight+b.speed**2*b.driver.weight;
  race.resolveKartCollisions();
  assert.ok(Math.abs(a.velocity().x*a.driver.weight+b.velocity().x*b.driver.weight-momentum)<.00001);
  assert.ok(a.speed**2*a.driver.weight+b.speed**2*b.driver.weight<energy);
  assert.ok(b.velocity().x>a.velocity().x,"cars separate after impact");
});
test("reverse travel warns about wrong way and recovery clears handling state",()=>{
  const track=handlingTrack(),kart=handlingKart(-90,track);
  drive(kart,track,{...EMPTY,brake:true},1);assert.ok(kart.wrongWay>.7);
  Object.assign(kart,{yawRate:2,steer:1,reverseHold:1,slipAngle:.5,longitudinalAcceleration:150,lateralAcceleration:250});
  kart.recover(track);assert.equal(kart.yawRate,0);assert.equal(kart.steer,0);assert.equal(kart.reverseHold,0);assert.equal(kart.slipAngle,0);assert.equal(kart.previousPose,null);
});
test("gamepad deadzone, analog triggers, D-pad and reconnecting item edges",()=>{
  const pad={connected:true,axes:[.08],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
  context.navigator={getGamepads:()=>[null,pad]};
  try{
    const input=new InputManager();assert.equal(input.read().steer,0);
    pad.axes[0]=.5;pad.buttons[7].value=.4;
    let controls=input.read();assert.ok(controls.steer>.1&&controls.steer<.4);assert.equal(controls.accelerate,.4);
    pad.buttons[6].value=.3;controls=input.read();assert.equal(controls.brake,.3);assert.equal(controls.accelerate,false);
    pad.buttons[14].pressed=true;assert.equal(input.read().steer,-1);
    pad.buttons[2].pressed=true;assert.equal(input.read().itemPressed,true);assert.equal(input.read().itemPressed,false);
    pad.connected=false;controls=input.read();assert.equal(controls.brake,false);assert.equal(controls.steer,0);
    pad.connected=true;assert.equal(input.read().itemPressed,true);
  }finally{delete context.navigator;}
});
test("fixed-step handling stays stable across 30, 60 and 144 Hz render schedules",()=>{
  function simulate(fps){
    const track=handlingTrack(),kart=handlingKart(0,track);let accumulator=0,ticks=0;
    for(let frame=0;frame<fps*6;frame++){
      accumulator+=1/fps;
      while(accumulator+1e-9>=1/60){const seconds=ticks/60;kart.update(1/60,{...gas,steer:seconds>1&&seconds<3?.7:0,drift:seconds>1.5&&seconds<2.5},track);accumulator-=1/60;ticks++;}
    }
    assert.equal(ticks,360);return kart;
  }
  const baseline=simulate(60);
  for(const fps of [30,144]){const kart=simulate(fps);assert.ok(Math.hypot(kart.x-baseline.x,kart.y-baseline.y)<.000001);assert.equal(kart.heading,baseline.heading);}
});

for(const difficulty of Object.keys(DIFFICULTIES))for(const track of TRACKS){
  test(`all eight drivers finish ${track.name} / ${difficulty} without respawning`,()=>{
    seed=73;
    const r=raceFor(track,{difficulty});r.state="racing";r.player.isAI=true;
    for(let frame=0;frame<60*(track.length*3/180+40)&&!r.karts.every(k=>k.finished);frame++){
      r.state="racing";r.update(1/60);
      assert.ok(r.karts.every(k=>Number.isFinite(k.x)&&Number.isFinite(k.y)));
    }
    assert.ok(r.karts.every(k=>k.finished),JSON.stringify(r.karts.map(k=>({id:k.driver.id,lap:k.lap,gate:k.gateCount}))));
    assert.ok(r.karts.every(k=>k.recoveries===0),"AI should navigate without emergency recovery");
    assert.equal(new Set(r.karts.map(k=>k.rank)).size,8);
  });
}
console.log(`Kart: ${checks} behavior checks passed, including 18 complete eight-driver races.`);
