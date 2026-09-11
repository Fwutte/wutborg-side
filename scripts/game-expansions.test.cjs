const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {window:{addEventListener(){}},console,Math};
for (const file of ['kart-racer-data','kart-racer','pips-skybound-data','pips-skybound','battle-gates-data','battle-gates']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context);
}
const {TRACKS,DRIVERS}=context.window.WutborgKartData;
const {Kart,Race,EMPTY}=context.window.WutborgKart.testHooks;
for(const track of TRACKS.slice(3)) {
  const race=new Race(track,DRIVERS,{mode:'time'});race.start('max');race.state='racing';
  const kart=race.player,ramp=track.ramps[0];
  Object.assign(kart,ramp,{speed:250,velocityHeading:ramp.heading,road:track.nearest(ramp.x,ramp.y)});
  race.updateObjects(1/60);assert.ok(kart.airVelocity>0,'ramps launch a moving kart');
  const originalVelocity=kart.airVelocity;race.updateObjects(1/60);assert.equal(kart.airVelocity,originalVelocity,'one launch per pass');
  kart.airHeight=1;kart.airVelocity=-160;kart.update(1/60,{...EMPTY,drift:true},track);
  assert.equal(kart.airHeight,0);assert.ok(kart.boostTimer>0,'timed landing awards turbo');
  const p=track.at(track.length*(track.shortcut[0]+track.shortcut[1])/2,-track.halfWidth-30);
  Object.assign(kart,p,{speed:220,velocityHeading:p.heading,road:track.nearest(p.x,p.y)});
  kart.update(1/60,EMPTY,track);assert.ok(kart.shortcut);assert.equal(kart.offroad,false);
  const obstacle=track.obstacleAt(track.obstacles[0],race.elapsed);
  Object.assign(kart,obstacle,{spinTimer:0,invincibleTimer:0,airHeight:40});race.updateObjects(1/60);assert.equal(kart.spinTimer,0);
  kart.airHeight=0;race.updateObjects(1/60);assert.ok(kart.spinTimer>0,'grounded collision is harmful');
}
const ice=TRACKS.find(t=>t.theme==='frost');assert.equal(ice.surfaceAt(ice.length*.3),'ice');assert.equal(ice.surfaceAt(0),'asphalt');

const mario=context.window.PipsSkybound;
const {Level,Player,Enemy,TileMap,Game}=mario.testHooks;
const state={audio:{play(){}},player:new Player(0,0),completeLevel(secret){this.secret=secret;},damagePlayer(){this.damage=(this.damage||0)+1;}};
const definition=mario.LEVEL_DEFINITIONS[10],level=new Level(definition,state);
const spring=level.springs[0];Object.assign(state.player,{x:spring.x,y:spring.y-35,vy:0});level.updateAdventure(1/60);assert.ok(state.player.vy<-900);
const bridge=level.platforms[0];Object.assign(state.player,{x:bridge.x+20,y:bridge.y-44,previousBottom:bridge.y,vy:20});
const oldX=state.player.x;level.updateAdventure(1/60);assert.equal(state.player.grounded,true);assert.equal(state.player.y+44,bridge.y);assert.notEqual(state.player.x,oldX,'moving bridge carries player');
bridge.age=.66;Object.assign(state.player,{y:bridge.y-44,previousBottom:bridge.y,vy:0});level.updateAdventure(1/60);assert.ok(bridge.fall>0);
for(let i=0;i<170;i++)level.updateAdventure(1/60);assert.equal(bridge.fall,0,'crumbling bridge returns after falling');
const secret=level.secrets[0];Object.assign(state.player,{x:secret.x,y:secret.y});level.updateAdventure(1/60);assert.equal(state.secret,true);
for(const def of mario.LEVEL_DEFINITIONS){assert.ok(def.entities.some(e=>e.type==='spring'));assert.ok(def.entities.some(e=>e.type==='platform'));assert.equal(def.entities.some(e=>e.type==='secret'),def.stage<4);}
const map=new TileMap({map:Array.from({length:14},(_,y)=>(y>=11?'X':'.').repeat(120))},{});
const boss=new Enemy(1000,432,'boss',{hits:4});boss.awake=true;boss.attackClock=.01;boss.update(.02,map,1000,{x:800,w:34});assert.equal(boss.shots.length,2);
boss.shots=[];boss.hitsRemaining=2;boss.attackClock=.01;boss.update(.02,map,1000,{x:800,w:34});assert.equal(boss.shots.length,3,'second phase adds projectile spread');
boss.hurtTimer=1;boss.stomp();assert.equal(boss.hitsRemaining,2,'boss cannot be hit every frame');
const completion={state:'playing',transition:0,levelIndex:0,timeLeft:50,score:0,player:{x:0,w:34,y:0},unlockLevel(i){this.unlocked=i;},addScore(n){this.score+=n;},input:{releaseAll(){}},audio:{play(){},stopMusic(){}},burst(){}};
Game.prototype.completeLevel.call(completion,true);assert.equal(completion.unlocked,2);assert.equal(completion.secretClear,true);

const {BattleRun,data}=context.window.WutborgBattle;
function battle(dodge=false,shield=false){
  const level={startingArmy:40,gates:[{choices:[{type:'tower',value:20,optimal:true},{type:'tower',value:60}]}],parArmy:20};
  const run=new BattleRun(level);run.start();run.choose(0);assert.equal(run.update(1).type,'battle');
  let warning=false;
  for(let i=0;i<1800&&run.state==='battling';i++){
    if(run.combat.warning>0){warning=true;if(dodge)run.battleX=run.combat.targetX>0?-1:1;if(shield)run.ability('shield');}
    run.update(1/60);
  }
  assert.ok(warning,'battle lasts long enough for a telegraphed attack');assert.equal(run.state,'won');return run;
}
assert.ok(battle(true).army>battle().army,'dodging saves soldiers');assert.ok(battle(false,true).army>battle().army,'shield wall reduces losses');
const abilityLevel={...data.LEVELS[0],gates:[{choices:[{type:'tower',value:30}]}]};
const abilityRun=new BattleRun(abilityLevel);abilityRun.start();abilityRun.choose(0);abilityRun.update(1);
assert.equal(abilityRun.ability('volley'),true);const health=abilityRun.combat.health;assert.equal(abilityRun.ability('volley'),false);assert.equal(abilityRun.combat.health,health,'cooldown prevents repeated volley');
// Exercise the complete campaign through the actual timed combat path.
for(const level of data.LEVELS){
  const run=new BattleRun(level);run.start();const phases=new Set();
  for(let tick=0;tick<18000&&!['won','lost'].includes(run.state);tick++){
    if(run.state==='choosing')run.choose(level.safeRoute[run.gateIndex]);
    if(run.state==='battling'){phases.add(run.combat.phase);if(run.combat.warning>0)run.battleX=run.combat.targetX>0?-1:1;}
    run.update(1/60);
  }
  assert.equal(run.state,'won',`campaign level ${level.id} remains beatable`);
  if(level.boss)assert.equal(phases.size,3,'sieges traverse all three phases');
}
console.log('Expansion tests: ramps, landing boost, side routes, ice, hazards, platforms, springs, secrets, boss phases, dodge, shield, volley and campaign passed.');
