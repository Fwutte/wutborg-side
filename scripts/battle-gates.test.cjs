const assert = require('node:assert/strict');
(async () => {
  const { Run, LEVELS, REGIONS, normalizeProgress, buyUpgrade, awardVictory, DIFFICULTIES } = await import('../js/borgstorm/core.mjs');
  assert.equal(LEVELS.length, 20);
  assert.equal(REGIONS.length, 5);
  assert.deepEqual(LEVELS.filter(l=>l.boss).map(l=>l.id), [4,8,12,16,20]);
  assert.ok(REGIONS.every((_,i)=>LEVELS.filter(l=>l.region===i).length===4));
  function value(run,c){
    if(c.type==='multiply')return run.army*c.value;
    if(c.type==='add'||c.type==='recruit')return run.army+c.value;
    return run.army-(c.type==='hazard'?2:4);
  }
  function play(level, difficulty='normal', options={}) {
    const r = new Run(level, options.upgrades, difficulty); r.start();
    let chosen=-1; const phases=new Set();
    for(let i=0;i<30000&&r.active;i++) {
      if(r.state==='running'&&chosen!==r.gateIndex){
        chosen=r.gateIndex;
        const side=options.side ?? (value(r,r.gate[0])>=value(r,r.gate[1])?0:1);
        r.choose(side);
      }
      if(r.combat){
        if(r.state==='siege') phases.add(r.combat.phase);
        if(r.combat.warning>0&&!options.noDodge)r.steer(r.combat.lane>=0?-1:1);
        if(options.abilities){r.ability('volley');if(r.combat.warning>0)r.ability('shield');}
      }
      r.update(options.dt||1/60); r.events.splice(0);
      assert.equal(r.army,Object.values(r.units).reduce((a,b)=>a+b,0));
      assert.ok(Object.values(r.units).every(n=>Number.isInteger(n)&&n>=0));
      assert.ok(r.army<=399);
    }
    return {r,phases};
  }
  let simulations=0;
  for(const difficulty of Object.keys(DIFFICULTIES))for(const level of LEVELS){
    const {r,phases}=play(level,difficulty);
    assert.equal(r.state,'won',`${difficulty} level ${level.id} is winnable without upgrades`);
    assert.ok(r.stars>=1&&r.stars<=3);
    assert.equal(phases.size,3,`castle ${level.id} has all three attack phases`);
    simulations++;
  }
  for(const side of [0,1])for(const level of LEVELS){
    const {r}=play(level,'normal',{side,abilities:true});
    assert.ok(['won','lost'].includes(r.state),'every route terminates');simulations++;
  }
  const low=play(LEVELS[19],'veteran',{noDodge:true,side:1}).r;
  const good=play(LEVELS[19],'veteran',{side:1}).r;
  assert.ok(good.army>low.army,'dodging preserves more troops');
  const one = new Run(LEVELS[0]);one.start();one.beginSiege();one.units={soldier:1,archer:0,shield:0,giant:0};
  for(let i=0;i<2000&&one.active;i++)one.update(1/60);
  assert.equal(one.state,'lost','an unattended weak army can lose');
  const paused=new Run(LEVELS[0]);paused.start();paused.pause(true);
  const before=JSON.stringify(paused);paused.update(20);paused.choose(1);paused.steer(1);paused.ability('shield');
  assert.equal(JSON.stringify(paused),before,'pause freezes all input and simulation');
  paused.pause(false);paused.update(.1);assert.ok(paused.elapsed>0);
  const ability=new Run(LEVELS[0]);ability.start();assert.equal(ability.ability('volley'),false);ability.beginSiege();
  const health=ability.combat.health;assert.equal(ability.ability('volley'),true);assert.ok(ability.combat.health<health);
  const after=ability.combat.health;assert.equal(ability.ability('volley'),false);assert.equal(ability.combat.health,after);
  assert.equal(ability.ability('unknown'),false);assert.equal(ability.ability('shield'),true);
  for(let i=0;i<10;i++)ability.update(1/60);assert.ok(ability.shieldTime>0);
  const troops=new Run(LEVELS[0]);troops.addUnits('archer',20);troops.addUnits('shield',15);troops.addUnits('giant',4);
  troops.damage(51);assert.equal(troops.army,12);assert.ok(troops.units.archer<20);
  troops.addUnits('soldier',1000);assert.equal(troops.army,399);troops.damage(900);assert.equal(troops.army,0);
  const p=normalizeProgress({coins:400,unlockedLevel:7,stars:{1:2},upgrades:{armor:2}});
  assert.equal(p.unlockedLevel,7);assert.equal(p.stars[1],2);assert.equal(p.upgrades.armor,2);
  assert.equal(buyUpgrade(p,'armor'),true);assert.equal(p.coins,200);assert.equal(p.upgrades.armor,3);
  assert.equal(buyUpgrade(p,'armor'),false);assert.equal(buyUpgrade(p,'toString'),false);
  const run=play(LEVELS[0]).r,reward=awardVictory(p,run);assert.ok(reward>=20);const balance=p.coins;
  assert.equal(awardVictory(p,run),0);assert.equal(p.coins,balance,'victory paid once');
  const replay=play(LEVELS[0]).r;assert.equal(awardVictory(p,replay),20,'replay rewards prevent economy dead ends');
  assert.equal(awardVictory(p,one),0,'defeats never earn victory rewards');
  const bad=normalizeProgress({coins:'Infinity',unlockedLevel:200,stars:{1:999,2:-1},upgrades:{armor:2.9,reinforcement:-2},difficulty:'hacked'});
  assert.equal(bad.coins,0);assert.equal(bad.unlockedLevel,20);assert.equal(bad.stars[1],3);assert.equal(bad.stars[2],0);assert.equal(bad.upgrades.armor,2);assert.equal(bad.difficulty,'normal');
  for(const input of [null,[],0,'bad'])assert.equal(normalizeProgress(input).unlockedLevel,1);
  const a=play(LEVELS[7],'normal',{dt:1/30}).r,b=play(LEVELS[7],'normal',{dt:1/120}).r;
  assert.equal(a.state,b.state);assert.equal(a.army,b.army,'30 and 120 Hz have the same outcome');
  const invalid=new Run();invalid.start();invalid.update(NaN);invalid.update(Infinity);invalid.update(-1);assert.equal(invalid.elapsed,0);
  console.log(`Borgstorm v3: ${simulations} campaign simulations, five bosses, three difficulties, combat, specialist casualties, abilities, pause, 30/120 Hz, migration and economy passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
