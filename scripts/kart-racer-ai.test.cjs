const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
let seed=73;
const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const window={addEventListener(){}};
for(const file of ["kart-racer-data","kart-racer"]){
  // Run trusted game code in the host realm so deterministic race benchmarks stay fast.
  new Function("window","Math",fs.readFileSync(path.join(__dirname,"../js",file+".js"),"utf8"))(window,math);
}
const {TRACKS,DRIVERS,DIFFICULTIES,angleDelta,clamp}=window.WutborgKartData;
const {Race,RaceAI,EMPTY}=window.WutborgKart.testHooks;
let checks=0;
function test(name,run){run();checks++;console.log("  OK  "+name);}
function raceFor(track=TRACKS[0],difficulty="normal"){
  const race=new Race(track,DRIVERS,{difficulty});race.start("max");return race;
}
function position(kart,track,s,lateral=0,speed=300){
  const point=track.at(s,lateral);Object.assign(kart,point,{speed,velocityHeading:point.heading,road:track.nearest(point.x,point.y)});
}

test("rival profiles raise Sport and Expert pace without changing the player's car",()=>{
  const races=Object.keys(DIFFICULTIES).map(level=>raceFor(TRACKS[0],level));
  for(const race of races){assert.equal(race.player.speedFactor,1);assert.equal(race.player.driver.maxSpeed,360);}
  assert.ok(races[1].karts[1].speedFactor>1);assert.ok(races[2].karts[1].speedFactor>races[1].karts[1].speedFactor);
  assert.ok(races[0].karts[1].speedFactor<1);
});
test("Sport and Expert earn a launch boost while Hyggelig keeps a gentle start",()=>{
  for(const level of Object.keys(DIFFICULTIES)){
    const race=raceFor(TRACKS[0],level);race.countdown=1/60;race.update(1/60,EMPTY);
    assert.equal(race.karts[1].boostTimer,DIFFICULTIES[level].startBoost);assert.equal(race.player.boostTimer,0);
  }
});
test("the planner brakes earlier for ice using the same track geometry",()=>{
  const ice=TRACKS[4],dry={...ice,surfaceAt:()=>"asphalt"},ai=new RaceAI(),race=raceFor(ice),kart=race.karts[1];
  let s=ice.length*.2,maxCurve=0;
  for(let candidate=ice.length*.17;candidate<ice.length*.7;candidate+=20){const bend=Math.abs(ai.curvature(ice,candidate));if(bend>maxCurve){maxCurve=bend;s=candidate;}}
  position(kart,ice,s,0,480);kart.boostTimer=1;
  const iceInput=ai.inputFor(kart,ice),dryInput=ai.inputFor(kart,dry);
  assert.ok(Number(iceInput.brake)>Number(dryInput.brake)+.2,JSON.stringify({iceInput,dryInput,maxCurve}));
  assert.ok(Math.abs(iceInput.steer)<=1&&Number.isFinite(iceInput.steer));
  assert.equal(ai.planFor(ice),ai.planFor(ice),"track plans are reused");
});
test("rivals select a passing lane and avoid a predicted moving obstacle",()=>{
  const race=raceFor(),kart=race.karts[1],blocker=race.player;race.karts=[kart,blocker];
  position(kart,race.track,0);position(blocker,race.track,130);kart.aiPlanLane=0;
  const lane=race.ai.laneFor(kart,race.track,race,0);assert.ok(Math.abs(lane)>48&&Math.abs(lane)<race.track.halfWidth*.7);
  const hazardRace=raceFor(TRACKS[3]),driver=hazardRace.karts[1],obstacle=hazardRace.track.obstacles[0];hazardRace.karts=[driver];hazardRace.elapsed=10;
  position(driver,hazardRace.track,obstacle.s-120);driver.aiPlanLane=0;
  const hazardLane=hazardRace.ai.laneFor(driver,hazardRace.track,hazardRace,0);
  const predicted=Math.sin((10+.4)*1.3+obstacle.phase)*hazardRace.track.halfWidth*.7;
  assert.ok(Math.abs(hazardLane-predicted)>obstacle.radius+driver.radius+12);
});
test("item tactics hold redundant turbo and target exposed rivals",()=>{
  const race=raceFor(),kart=race.karts[1],victim=race.player;race.karts=[kart,victim];kart.aiItemTime=0;
  kart.item="mushroom";kart.boostTimer=1;assert.equal(race.ai.shouldUseItem(kart,race,500,380),false);
  kart.boostTimer=0;assert.equal(race.ai.shouldUseItem(kart,race,500,380),true);assert.equal(race.ai.shouldUseItem(kart,race,250,380),false);
  kart.item="redShell";kart.progress=100;victim.progress=200;victim.starTimer=1;
  const farther=raceFor().karts[2];farther.progress=300;race.karts.push(farther);
  assert.equal(race.ai.shouldUseItem(kart,race,500,380),false,"a vulnerable racer beyond a protected homing target must not trigger a wasted missile");
  victim.starTimer=0;assert.equal(race.ai.shouldUseItem(kart,race,500,380),true);race.karts=[kart,victim];
  kart.item="banana";victim.progress=500;assert.equal(race.ai.shouldUseItem(kart,race,500,380),false);
  victim.progress=0;victim.road.lateral=kart.road.lateral;assert.equal(race.ai.shouldUseItem(kart,race,500,380),true);
});
test("pickup lanes are pursued on safe approaches and skipped when the route is unsafe",()=>{
  const race=raceFor(),kart=race.karts[1];race.karts=[kart];race.coins=[];race.itemBoxes=[];
  position(kart,race.track,0);kart.aiPlanLane=0;
  const track={...race.track,obstacles:[],boostPads:[race.track.at(180,race.track.halfWidth*.4)]};
  assert.ok(Math.abs(race.ai.laneFor(kart,track,race,0)-track.halfWidth*.4)<1);
  assert.equal(race.ai.laneFor(kart,track,race,0,false),0);
});
test("boosting rivals brake before a curved launch instead of drifting into the ramp",()=>{
  const race=raceFor(TRACKS[4],"expert"),kart=race.karts[1];race.karts=[kart];
  position(kart,race.track,race.track.ramps[1].s-40,0,460);kart.boostTimer=1;
  const input=race.ai.inputFor(kart,race.track,race);
  assert.ok(input.brake>.5);assert.equal(input.drift,false);
});
test("charged AI drift releases turbo and waits before another drift",()=>{
  const race=raceFor(),kart=race.karts[1];
  let s=0;for(let i=0;i<race.track.length;i+=40)if(Math.abs(race.ai.curvature(race.track,i))>.0025){s=i;break;}
  position(kart,race.track,s,0,280);kart.drifting=true;kart.driftTimer=kart.aiProfile.driftCharge;kart.slipAngle=-.25;
  kart.driftDirection=Math.sign(race.ai.curvature(race.track,s+80+280*.34));
  const input=race.ai.inputFor(kart,race.track);assert.equal(input.drift,false);assert.ok(kart.aiDriftCooldown>1);
  kart.update(1/60,input,race.track);assert.ok(kart.boostTimer>0);assert.equal(kart.drifting,false);
});

// Frozen version-5 controller: the comparison uses identical physics, tracks and pickups.
class PreviousAI {
  inputFor(kart,track){
    const target=track.at(kart.road.s+85+Math.max(0,kart.speed)*.36,kart.aiLane);
    const delta=angleDelta(kart.heading,Math.atan2(target.y-kart.y,target.x-kart.x));
    const bend=Math.abs(angleDelta(track.at(kart.road.s+30).heading,track.at(kart.road.s+200).heading));
    const speed=kart.driver.maxSpeed*kart.speedFactor*clamp(1-bend*.28,.53,1);
    return {steer:clamp(delta*2.5,-1,1),accelerate:kart.speed<speed+8,brake:kart.speed>speed+35,
      drift:bend>.35&&bend<1.2&&Math.abs(delta)>.16&&kart.speed>200&&kart.driftTimer<1.9,itemPressed:false};
  }
}
function lap(track,level,previous=false){
  seed=73;const race=new Race(track,DRIVERS,{mode:"time",difficulty:level});race.start("max");
  const kart=race.player;kart.isAI=true;kart.speedFactor=previous?.91:DIFFICULTIES[level].speed;
  if(previous)race.ai=new PreviousAI();
  race.lapTarget=3;race.state="racing";
  let offroad=0,hits=0;
  for(let frame=0;frame<60*180&&!kart.finished;frame++){const spinning=kart.spinTimer;race.update(1/60);if(kart.offroad)offroad++;if(kart.spinTimer>spinning)hits++;}
  assert.ok(kart.finished&&kart.recoveries===0,`${track.name}/${level} must finish cleanly`);
  return {seconds:kart.finishTime,boosts:kart.boosts,offroad,hits};
}
let oldTotal=0,sportTotal=0,expertTotal=0;
for(const track of TRACKS){
  test(`Sport beats the previous rival controller on ${track.name}`,()=>{
    const previous=lap(track,"normal",true),sport=lap(track,"normal"),expert=lap(track,"expert");
    console.log(`      three laps: previous ${previous.seconds.toFixed(2)}s, Sport ${sport.seconds.toFixed(2)}s, Expert ${expert.seconds.toFixed(2)}s; Sport/Expert boosts ${sport.boosts}/${expert.boosts}, offroad frames ${sport.offroad}/${expert.offroad}, hits ${sport.hits}/${expert.hits}`);
    assert.ok(sport.seconds<previous.seconds*.9,"Sport must be at least 10% faster than the previous AI");
    assert.ok(expert.seconds<sport.seconds,"Expert must stay faster on every course, including ice and ramps");
    oldTotal+=previous.seconds;sportTotal+=sport.seconds;expertTotal+=expert.seconds;
  });
}
assert.ok(sportTotal<oldTotal*.88,"Sport must improve aggregate lap time by at least 12%");
assert.ok(expertTotal<sportTotal*.96,"Expert must improve aggregate lap time by at least 4% over Sport");
console.log(`AI: ${checks} checks passed. Sport ${(100*(1-sportTotal/oldTotal)).toFixed(1)}% faster than previous; Expert ${(100*(1-expertTotal/sportTotal)).toFixed(1)}% faster than Sport.`);
