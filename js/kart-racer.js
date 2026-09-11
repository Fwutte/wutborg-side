(() => {
  "use strict";
  const data=window.WutborgKartData;
  if(!data)return;
  const {DRIVERS,ITEM_TYPES,TRACKS,DIFFICULTIES,CUP_POINTS,TAU,clamp,mod,lerp,angleDelta}=data;
  const STEP=1/60,STORAGE_KEY="wutborg.kart.v2";
  const EMPTY={steer:0,accelerate:false,brake:false,drift:false,itemPressed:false};
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const formatTime=seconds=>{
    const cs=Math.round(Math.max(0,Number(seconds)||0)*100);
    return `${Math.floor(cs/6000)}:${String(Math.floor(cs/100)%60).padStart(2,"0")}.${String(cs%100).padStart(2,"0")}`;
  };
  const readSave=storage=>{
    try {
      const raw=JSON.parse(storage.getItem(STORAGE_KEY)||"{}");
      return {records:raw&&typeof raw.records==="object"&&raw.records&&!Array.isArray(raw.records)?raw.records:{},settings:raw&&typeof raw.settings==="object"&&raw.settings&&!Array.isArray(raw.settings)?raw.settings:{}};
    }catch{return {records:{},settings:{}};}
  };
  class Kart {
    constructor(driver,index=0,isAI=false){this.driver=driver;this.index=index;this.isAI=isAI;this.radius=19;}
    reset(track,slot=this.index){
      const s=-38-Math.floor(slot/2)*65-(slot%2)*4,p=track.at(s,slot%2?38:-38);
      Object.assign(this,{x:p.x,y:p.y,elevation:p.elevation,slope:p.slope,heading:p.heading,velocityHeading:p.heading,speed:0,steer:0,visualSteer:0,
        spinTimer:0,boostTimer:0,starTimer:0,invincibleTimer:0,driftTimer:0,driftDirection:0,drifting:false,
        coins:0,item:null,pendingItem:null,itemRoulette:0,finished:false,finishTime:0,lap:0,lapTimes:[],lapStarted:0,
        progress:s,raceDistance:s,nextGate:track.length/12,gateCount:0,lastS:p.s,lastX:p.x,lastY:p.y,
        road:track.nearest(p.x,p.y),wrongWay:0,offroad:false,boosts:0,recoveries:0,stuckTime:0,hop:0,
        airHeight:0,airVelocity:0,rampCooldown:0,surface:"asphalt",shortcut:false,speedFactor:1,aiLane:(slot%3-1)*24,aiItemTime:2+slot*.37});
    }
    cancelDrift(){this.drifting=false;this.driftTimer=0;this.driftDirection=0;}
    applySpin(duration=.85){
      if(this.starTimer>0||this.invincibleTimer>0||this.finished)return false;
      this.cancelDrift();this.spinTimer=duration;this.invincibleTimer=duration+1.3;this.speed*=.38;this.coins=Math.max(0,this.coins-2);
      return true;
    }
    releaseDrift(){
      const charge=this.driftTimer,boost=charge>=1.8?1.4:charge>=1.05?.9:charge>=.5?.5:0;
      if(this.drifting&&boost){this.boostTimer=Math.max(this.boostTimer,boost);this.boosts++;}
      this.cancelDrift();return boost;
    }
    recover(track){
      const safe=Math.min(this.raceDistance,this.nextGate-12),p=track.at(safe);
      this.raceDistance=safe;this.progress=safe;
      this.x=p.x;this.y=p.y;this.elevation=p.elevation;this.slope=p.slope;this.heading=p.heading;this.velocityHeading=p.heading;
      this.lastS=p.s;this.lastX=p.x;this.lastY=p.y;this.road=track.nearest(p.x,p.y);
      this.airHeight=0;this.airVelocity=0;this.speed=50;this.invincibleTimer=1.8;this.spinTimer=0;this.cancelDrift();this.recoveries++;this.stuckTime=0;
    }
    update(dt,input,track,assist=false){
      for(const key of ["spinTimer","boostTimer","starTimer","invincibleTimer","hop","rampCooldown"])this[key]=Math.max(0,this[key]-dt);
      const ratio=clamp(Math.abs(this.speed)/this.driver.maxSpeed,0,1);
      this.steer=lerp(this.steer,input.steer,1-Math.exp(-12*dt));
      const boosting=this.boostTimer>0||this.starTimer>0;
      const top=(this.driver.maxSpeed+this.coins*2.5)*this.speedFactor+(boosting?125:0);
      if(this.spinTimer>0){this.speed*=Math.exp(-1.8*dt);}
      else{
        const wants=input.drift&&!input.brake&&this.speed>130&&(this.drifting||Math.abs(this.steer)>.22);
        if(wants){
          if(!this.drifting){this.driftDirection=Math.sign(this.steer);this.hop=.25;}
          this.drifting=true;this.driftTimer=clamp(this.driftTimer+dt*(this.offroad?.15:1),0,2.4);
        }else if(this.drifting){
          if(input.brake||this.speed<120||this.offroad)this.cancelDrift();else this.releaseDrift();
        }
        if(input.brake)this.speed-=310*dt;
        else if(input.accelerate||boosting)this.speed+=(this.driver.acceleration+(boosting?240:0))*dt;
        else this.speed*=Math.exp(-.85*dt);
        this.speed=clamp(this.speed,-95,top);
        const turn=this.drifting?this.driftDirection*.28+this.steer*.88:this.steer;
        this.heading+=turn*this.driver.handling*(.22+ratio*.56)*dt*(this.speed>=0?1:-.7);
        if(assist&&this.road.distance>track.halfWidth*.73&&Math.abs(angleDelta(this.heading,this.road.heading))<1.1&&this.speed>80){
          const desired=this.road.heading-clamp(this.road.lateral/track.halfWidth,-1,1)*.36;
          this.heading+=clamp(angleDelta(this.heading,desired),-dt*.75,dt*.75);
        }
        if(this.drifting)this.speed*=Math.exp(-.025*dt);
      }
      this.surface=track.surfaceAt(this.road.s);
      const slip=this.drifting?-this.driftDirection*.25:0,grip=this.airHeight>0?3:this.surface==="ice"?(this.drifting?2.8:4.5):this.drifting?5:14;
      this.velocityHeading+=angleDelta(this.velocityHeading,this.heading+slip)*(1-Math.exp(-grip*dt));
      this.x+=Math.cos(this.velocityHeading)*this.speed*dt;this.y+=Math.sin(this.velocityHeading)*this.speed*dt;
      this.road=track.nearest(this.x,this.y,this.road?.index);this.elevation=this.road.elevation;this.slope=this.road.slope;this.shortcut=track.isShortcut(this.road);this.offroad=this.road.distance>track.halfWidth&&!this.shortcut;
      if(this.shortcut)this.boostTimer=Math.max(this.boostTimer,.28);
      if(this.airHeight>0||this.airVelocity>0){this.airVelocity-=280*dt;this.airHeight=Math.max(0,this.airHeight+this.airVelocity*dt);if(this.airHeight===0){this.airVelocity=0;if(input.drift&&this.speed>120){this.boostTimer=Math.max(this.boostTimer,.85);this.boosts++;}}}
      if(this.offroad&&this.airHeight===0)this.speed*=Math.exp(-(this.starTimer>0?.15:2.1)*dt);
      const wall=track.halfWidth+62;
      if(this.road.distance>wall){
        const excess=this.road.distance-wall,side=Math.sign(this.road.lateral);
        this.x+=Math.sin(this.road.heading)*side*excess;this.y-=Math.cos(this.road.heading)*side*excess;
        this.speed*=.76;this.velocityHeading+=angleDelta(this.velocityHeading,this.road.heading)*.12;
      }
      this.wrongWay=this.speed>65&&Math.abs(angleDelta(this.velocityHeading,this.road.heading))>2?this.wrongWay+dt:Math.max(0,this.wrongWay-dt*3);
      this.stuckTime=this.isAI&&Math.abs(this.speed)<45?this.stuckTime+dt:0;
      if(this.stuckTime>2.5)this.recover(track);
      this.visualSteer=lerp(this.visualSteer,this.steer,1-Math.exp(-10*dt));
    }
  }
  class RaceAI {
    inputFor(kart,track){
      const target=track.at(kart.road.s+85+Math.max(0,kart.speed)*.36,kart.aiLane);
      const delta=angleDelta(kart.heading,Math.atan2(target.y-kart.y,target.x-kart.x));
      const bend=Math.abs(angleDelta(track.at(kart.road.s+30).heading,track.at(kart.road.s+200).heading));
      const targetSpeed=kart.driver.maxSpeed*kart.speedFactor*clamp(1-bend*.28,.53,1);
      return {steer:clamp(delta*2.5,-1,1),accelerate:kart.speed<targetSpeed+8,brake:kart.speed>targetSpeed+35,
        drift:bend>.35&&bend<1.2&&Math.abs(delta)>.16&&kart.speed>200&&kart.driftTimer<1.9,
        itemPressed:Boolean(kart.item&&kart.aiItemTime<=0)};
    }
  }
  class Race {
    constructor(track,drivers=DRIVERS,options={}){
      this.track=track;this.drivers=drivers;this.options=options;this.ai=new RaceAI();this.lapTarget=3;
      this.state="ready";this.elapsed=0;this.countdown=3;this.karts=[];this.lastRankings=[];this.traps=[];this.shells=[];
      this.itemBoxes=[];this.coins=[];this.player=null;this.result=null;this.events=[];this.startCharge=0;this.startTooEarly=false;
    }
    start(driverId){
      const driver=this.drivers.find(d=>d.id===driverId)||this.drivers[0];
      const lineup=this.options.mode==="time"?[driver]:[driver,...this.drivers.filter(d=>d!==driver)];
      this.karts=lineup.map((d,i)=>new Kart(d,i,i>0));
      this.karts.forEach((k,i)=>{
        k.reset(this.track,lineup.length===1?0:i===0?7:i-1);
        k.speedFactor=k.isAI?(DIFFICULTIES[this.options.difficulty]||DIFFICULTIES.normal).speed*(.98+i*.005):1;
      });
      this.player=this.karts[0];this.state="countdown";this.elapsed=0;this.countdown=3;this.result=null;this.events=[];
      this.traps=[];this.shells=[];this.startCharge=0;this.startTooEarly=false;
      this.itemBoxes=this.options.mode==="time"?[]:this.track.itemBoxes.map(p=>({...p,cooldown:0}));
      this.coins=this.track.coins.map(p=>({...p,cooldown:0}));this.updateRankings();
    }
    update(dt,input=EMPTY){
      if(this.state!=="countdown"&&this.state!=="racing")return;
      if(this.state==="countdown"){
        if(input.accelerate&&!this.options.autoGas){if(this.countdown>1.15)this.startTooEarly=true;else this.startCharge+=dt;}
        else if(!input.accelerate){this.startTooEarly=false;this.startCharge=0;}
        this.countdown=Math.max(0,this.countdown-dt);
        if(this.countdown===0){this.state="racing";if(!this.startTooEarly&&this.startCharge>.18){this.player.boostTimer=1.35;this.events.push("Perfekt start!");}}
        return;
      }
      this.elapsed+=dt;
      this.itemBoxes.forEach(o=>o.cooldown=Math.max(0,o.cooldown-dt));this.coins.forEach(o=>o.cooldown=Math.max(0,o.cooldown-dt));
      this.karts.forEach(k=>{
        if(k.finished){k.speed*=Math.exp(-2*dt);return;}
        k.aiItemTime-=dt;
        const controls=k.isAI?this.ai.inputFor(k,this.track):input;
        k.update(dt,controls,this.track,!k.isAI&&this.options.assist);
        if(k.itemRoulette>0){k.itemRoulette=Math.max(0,k.itemRoulette-dt);if(!k.itemRoulette){k.item=k.pendingItem;k.pendingItem=null;}}
        if(controls.itemPressed&&this.useItem(k))k.aiItemTime=2.2+Math.random()*2;
      });
      this.resolveKartCollisions();this.updateObjects(dt);this.karts.forEach(k=>this.updateKartProgress(k));this.updateRankings();
      if(this.player.finished)this.finish();
    }
    updateKartProgress(k){
      if(k.finished)return;
      const road=this.track.nearest(k.x,k.y,k.road?.index),L=this.track.length;
      const ds=mod(road.s-k.lastS+L/2,L)-L/2,movement=Math.hypot(k.x-k.lastX,k.y-k.lastY);
      // Reject teleports and skipped sectors. Backwards travel subtracts distance.
      if(movement<45&&Math.abs(ds)<60){
        k.raceDistance+=ds;
        if(ds>0&&road.distance<=this.track.halfWidth+64&&k.raceDistance>=k.nextGate&&k.raceDistance-k.nextGate<65){
          k.gateCount++;k.nextGate+=L/12;
          if(k.gateCount%12===0){
            k.lap++;k.lapTimes.push(this.elapsed-k.lapStarted);k.lapStarted=this.elapsed;
            if(k===this.player&&k.lap<this.lapTarget)this.events.push(k.lap===2?"Sidste omgang!":`Omgang ${k.lap+1} · Godt kørt!`);
            if(k.lap>=this.lapTarget){k.finished=true;k.finishTime=this.elapsed;}
          }
        }
      }
      k.lastS=road.s;k.lastX=k.x;k.lastY=k.y;k.road=road;k.progress=Math.min(k.raceDistance,k.nextGate);
    }
    updateRankings(){
      this.lastRankings=[...this.karts].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress);
      this.lastRankings.forEach((k,i)=>k.rank=i+1);
    }
    resolveKartCollisions(){
      for(let i=0;i<this.karts.length;i++)for(let j=i+1;j<this.karts.length;j++){
        const a=this.karts[i],b=this.karts[j];if(a.finished||b.finished)continue;
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.radius+b.radius;if(d>=min||Math.abs(a.airHeight-b.airHeight)>24)continue;
        const nx=d>.001?dx/d:1,ny=d>.001?dy/d:0,overlap=min-d+.1,total=a.driver.weight+b.driver.weight;
        a.x-=nx*overlap*b.driver.weight/total;a.y-=ny*overlap*b.driver.weight/total;
        b.x+=nx*overlap*a.driver.weight/total;b.y+=ny*overlap*a.driver.weight/total;
        const closing=(Math.cos(a.velocityHeading)*a.speed-Math.cos(b.velocityHeading)*b.speed)*nx+(Math.sin(a.velocityHeading)*a.speed-Math.sin(b.velocityHeading)*b.speed)*ny;
        if(closing>0){a.speed*=.965;b.speed=Math.min(b.driver.maxSpeed+100,b.speed+closing*.08);}
        if(a.starTimer>0)b.applySpin();if(b.starTimer>0)a.applySpin();
      }
    }
    itemForRank(rank){
      const pool=rank>=6?["mushroom","star","redShell","lightning"]:rank>=3?["mushroom","redShell","shell","star"]:["banana","shell","mushroom","banana"];
      return pool[Math.floor(Math.random()*pool.length)];
    }
    useItem(k){
      if(this.state!=="racing"||!k.item||k.spinTimer>0||k.finished)return false;
      const item=k.item;k.item=null;
      if(item==="mushroom")k.boostTimer=Math.max(k.boostTimer,1.7);
      if(item==="star"){k.starTimer=5.5;k.boostTimer=5.5;}
      if(item==="lightning")this.karts.filter(v=>v!==k).forEach(v=>v.applySpin(1.1));
      if(item==="banana")this.traps.push({x:k.x-Math.cos(k.heading)*42,y:k.y-Math.sin(k.heading)*42,owner:k,life:18});
      if(item==="shell"||item==="redShell"){
        const target=this.lastRankings.filter(v=>v!==k&&!v.finished&&v.progress>k.progress).sort((a,b)=>a.progress-b.progress)[0]||null;
        this.shells.push({x:k.x+Math.cos(k.heading)*42,y:k.y+Math.sin(k.heading)*42,heading:k.heading,speed:560,owner:k,life:7,homing:item==="redShell",target,bounces:0});
      }
      return true;
    }
    updateObjects(dt){
      for(const k of this.karts){
        if(k.finished)continue;
        for(const box of this.itemBoxes)if(box.cooldown<=0&&!k.item&&!k.itemRoulette&&distance(k,box)<34){box.cooldown=4;k.pendingItem=this.itemForRank(k.rank);k.itemRoulette=.8;}
        for(const coin of this.coins)if(coin.cooldown<=0&&distance(k,coin)<29){coin.cooldown=5;k.coins=Math.min(10,k.coins+1);}
        for(const ramp of this.track.ramps)if(k.speed>150&&k.rampCooldown===0&&k.airHeight===0&&distance(k,ramp)<55){k.airVelocity=160;k.airHeight=.1;k.rampCooldown=2;if(k===this.player)this.events.push("Hop! Hold drift ved landing for turbo");}
        for(const obstacle of this.track.obstacles)if(k.airHeight<28&&distance(k,this.track.obstacleAt(obstacle,this.elapsed))<k.radius+obstacle.radius)k.applySpin(.6);
        for(const pad of this.track.boostPads)if(distance(k,pad)<44)k.boostTimer=Math.max(k.boostTimer,.65);
      }
      this.traps=this.traps.filter(t=>{
        t.life-=dt;const hit=this.karts.find(k=>k!==t.owner&&!k.finished&&distance(k,t)<k.radius+17);
        if(hit)hit.applySpin();return t.life>0&&!hit;
      });
      for(const s of this.shells){
        s.life-=dt;
        if(s.homing&&s.target&&!s.target.finished){
          const road=this.track.nearest(s.x,s.y,s.roadIndex);s.roadIndex=road.index;
          const target=distance(s,s.target)<200?s.target:this.track.at(road.s+130);
          s.heading+=clamp(angleDelta(s.heading,Math.atan2(target.y-s.y,target.x-s.x)),-dt*5,dt*5);
        }
        s.x+=Math.cos(s.heading)*s.speed*dt;s.y+=Math.sin(s.heading)*s.speed*dt;
        const road=this.track.nearest(s.x,s.y,s.roadIndex);s.roadIndex=road.index;
        if(road.distance>this.track.halfWidth){
          s.heading=2*road.heading-s.heading;
          const p=this.track.at(road.s,Math.sign(road.lateral)*(this.track.halfWidth-3));s.x=p.x;s.y=p.y;
          if(++s.bounces>4)s.life=0;
        }
      }
      this.shells=this.shells.filter(s=>{
        const hit=this.karts.find(k=>k!==s.owner&&!k.finished&&distance(k,s)<k.radius+15);
        if(hit)hit.applySpin(.9);return s.life>0&&!hit;
      });
    }
    finish(){
      this.updateRankings();
      this.result={position:this.player.rank,time:this.player.finishTime,score:Math.max(1000,Math.round(150000-this.elapsed*450+(9-this.player.rank)*5000)),bestLap:Math.min(...this.player.lapTimes)};
      this.state="finished";
    }
  }
  class InputManager {
    constructor(){
      this.keys=new Set();this.pointers=new Map();this.itemPressed=false;this.enabled=false;this.previousItem=false;
      if(typeof document==="undefined")return;
      window.addEventListener("keydown",e=>{
        if(!this.enabled||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target?.tagName))return;
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","ShiftLeft","ShiftRight","KeyW","KeyA","KeyS","KeyD","KeyX","KeyZ"].includes(e.code)){
          e.preventDefault();if((e.code==="Space"||e.code==="KeyZ")&&!this.keys.has(e.code))this.itemPressed=true;this.keys.add(e.code);
        }
      });
      window.addEventListener("keyup",e=>this.keys.delete(e.code));
    }
    setControl(name,active,pointer=0){
      if(active){this.pointers.set(pointer,name);if(name==="item")this.itemPressed=true;}else this.pointers.delete(pointer);
    }
    read(autoGas=false){
      const held=(...names)=>names.some(n=>this.keys.has(n)||[...this.pointers.values()].includes(n));
      let steer=Number(held("ArrowRight","KeyD","right"))-Number(held("ArrowLeft","KeyA","left"));
      let accelerate=autoGas||held("ArrowUp","KeyW","accelerate"),brake=held("ArrowDown","KeyS","brake"),drift=held("ShiftLeft","ShiftRight","KeyX","drift");
      const pad=typeof navigator!=="undefined"?navigator.getGamepads?.()?.[0]:null;
      if(pad){
        if(Math.abs(pad.axes[0])>.14)steer=pad.axes[0];
        accelerate ||= pad.buttons[7]?.pressed||pad.buttons[0]?.pressed;
        brake ||= pad.buttons[6]?.pressed;drift ||= pad.buttons[5]?.pressed;
        const item=Boolean(pad.buttons[2]?.pressed);if(item&&!this.previousItem)this.itemPressed=true;this.previousItem=item;
      }
      const input={steer,accelerate:accelerate&&!brake,brake,drift,itemPressed:this.itemPressed};
      this.itemPressed=false;return input;
    }
    reset(){this.keys.clear();this.pointers.clear();this.itemPressed=false;this.previousItem=false;}
  }
  class AudioManager {
    constructor(){this.enabled=true;this.context=null;}
    unlock(){
      if(!this.enabled)return;
      try{
        const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
        if(!this.context){
          this.context=new AC();this.master=this.context.createGain();this.master.gain.value=.32;this.master.connect(this.context.destination);
          this.engine=this.context.createOscillator();this.engine.type="sawtooth";
          this.filter=this.context.createBiquadFilter();this.filter.type="lowpass";this.filter.frequency.value=380;
          this.gain=this.context.createGain();this.gain.gain.value=0;
          this.engine.connect(this.filter);this.filter.connect(this.gain);this.gain.connect(this.master);this.engine.start();
        }
        this.context.resume().catch(()=>{});
      }catch{/* Audio is optional. */}
    }
    tone(frequency,duration=.1,type="sine",volume=.2){
      if(!this.enabled||!this.context)return;
      const t=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();
      o.type=type;o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
      o.connect(g);g.connect(this.master);o.start();o.stop(t+duration);o.onended=()=>{o.disconnect();g.disconnect();};
    }
    update(player,active){
      if(!this.context)return;
      const t=this.context.currentTime,speed=Math.abs(player?.speed||0);
      this.gain.gain.setTargetAtTime(active&&this.enabled ? .035+speed/18000 : 0,t,.08);
      this.engine.frequency.setTargetAtTime(42+speed*.26+(player?.boostTimer>0?35:0),t,.07);
      this.filter.frequency.setTargetAtTime(player?.drifting?950:400+speed,t,.1);
    }
  }
  class FallbackRenderer {
    constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext("2d");}
    draw(race){
      const c=this.canvas,w=c.clientWidth,h=c.clientHeight,dpr=Math.min(window.devicePixelRatio||1,1.5);
      if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
      const ctx=this.ctx,t=race.track,p=race.player,scale=p?Math.min(w/850,h/900):Math.min(w/(t.width+200),h/(t.height+200));
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=t.palette.grass;ctx.fillRect(0,0,w,h);
      ctx.translate(w/2,h*.58);ctx.scale(scale,scale);ctx.translate(-(p?.x??t.cx),-(p?.y??t.cy));
      const road=(width,color)=>{ctx.beginPath();t.samples.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.stroke();};
      road(t.halfWidth*2+26,t.palette.edge);road(t.halfWidth*2,t.palette.road);
      if(t.shortcut){ctx.beginPath();for(let s=t.shortcut[0]*t.length;s<t.shortcut[1]*t.length;s+=20){const q=t.at(s,-t.halfWidth-30);s===t.shortcut[0]*t.length?ctx.moveTo(q.x,q.y):ctx.lineTo(q.x,q.y);}ctx.strokeStyle="#c7be79";ctx.lineWidth=46;ctx.stroke();}
      for(const ramp of t.ramps){ctx.save();ctx.translate(ramp.x,ramp.y);ctx.rotate(ramp.heading);ctx.fillStyle="#ec9c4f";ctx.fillRect(-42,-52,84,104);ctx.strokeStyle="#fff1b3";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-20,-32);ctx.lineTo(15,0);ctx.lineTo(-20,32);ctx.stroke();ctx.restore();}
      for(const o of t.obstacles){const q=t.obstacleAt(o,race.elapsed);ctx.fillStyle=o.kind==="snowball"?"#fffaf0":"#634e49";ctx.beginPath();ctx.arc(q.x,q.y,o.radius,0,TAU);ctx.fill();ctx.strokeStyle="#ffd27c";ctx.lineWidth=4;ctx.stroke();}
      const start=t.at(0);ctx.save();ctx.translate(start.x,start.y);ctx.rotate(start.heading);ctx.fillStyle="white";ctx.fillRect(-8,-t.halfWidth,16,t.halfWidth*2);ctx.restore();
      for(const coin of race.coins)if(!coin.cooldown){ctx.beginPath();ctx.arc(coin.x,coin.y,13,0,TAU);ctx.fillStyle="#ffdb5d";ctx.fill();}
      for(const box of race.itemBoxes)if(!box.cooldown){ctx.fillStyle="#7addec";ctx.fillRect(box.x-18,box.y-18,36,36);}
      for(const pad of t.boostPads){ctx.save();ctx.translate(pad.x,pad.y);ctx.rotate(pad.heading);ctx.fillStyle="#5ae6d3";ctx.fillRect(-25,-35,50,70);ctx.restore();}
      for(const trap of race.traps){ctx.beginPath();ctx.arc(trap.x,trap.y,20,0,TAU);ctx.fillStyle="#302443";ctx.fill();}
      for(const shell of race.shells){ctx.beginPath();ctx.arc(shell.x,shell.y,13,0,TAU);ctx.fillStyle=shell.homing?"#ff695e":"#85ffa7";ctx.fill();}
      for(const k of [...race.karts].reverse()){
        ctx.save();ctx.translate(k.x,k.y);ctx.rotate(k.heading);ctx.scale(1+(k.airHeight||0)/190,1+(k.airHeight||0)/190);ctx.fillStyle="#192131";ctx.fillRect(-26,-24,16,48);ctx.fillRect(15,-24,14,48);
        ctx.fillStyle=k.driver.color;ctx.fillRect(-30,-17,65,34);ctx.fillStyle=k.driver.accent;ctx.fillRect(-5,-12,20,24);
        if(k===p){ctx.strokeStyle="white";ctx.lineWidth=3;ctx.strokeRect(-33,-27,71,54);}ctx.restore();
      }
    }
  }
  class KartGame {
    constructor(renderer,canvas){
      this.renderer=renderer;this.canvas=canvas;this.input=new InputManager();this.audio=new AudioManager();
      try{this.save=readSave(localStorage);}catch{this.save={records:{},settings:{}};}
      const s=this.save.settings;
      this.selectedDriver=DRIVERS.some(d=>d.id===s.driver)?s.driver:"max";
      this.selectedTrackId=TRACKS.some(t=>t.id===s.track)?s.track:TRACKS[0].id;
      this.mode=["single","cup","time"].includes(s.mode)?s.mode:"single";
      this.difficulty=DIFFICULTIES[s.difficulty]?s.difficulty:"normal";
      this.autoGas=typeof s.autoGas==="boolean"?s.autoGas:matchMedia("(pointer:coarse)").matches;
      this.assist=s.assist!==false;this.audio.enabled=s.sound!==false;
      this.track=TRACKS.find(t=>t.id===this.selectedTrackId);this.race=new Race(this.track);
      this.paused=false;this.cup=null;this.lastTime=0;this.accumulator=0;this.lastUI=0;this.resultSaved=false;this.toastUntil=0;
      this.$=id=>document.getElementById(id);
      this.$("kart-autogas").checked=this.autoGas;this.$("kart-assist").checked=this.assist;this.$("kart-difficulty").value=this.difficulty;
      this.populateMenu();this.bindUI();this.showMenu();requestAnimationFrame(t=>this.loop(t));
    }
    persist(){
      this.save.settings={driver:this.selectedDriver,track:this.selectedTrackId,mode:this.mode,difficulty:this.difficulty,autoGas:this.autoGas,assist:this.assist,sound:this.audio.enabled};
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.save));}catch{/* Storage is optional. */}
    }
    trackSVG(track){
      const scale=Math.min(92/track.width,84/track.height),x=v=>50+(v-track.cx)*scale,y=v=>46+(v-track.cy)*scale;
      const path=track.samples.filter((_,i)=>i%6===0).map((p,i)=>`${i?"L":"M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ")+" Z";
      return `<svg viewBox="0 0 100 92" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="${x(track.start.x)}" cy="${y(track.start.y)}" r="4" fill="#eff8df"/></svg>`;
    }
    populateMenu(){
      this.$("track-select").innerHTML=TRACKS.map(t=>`<button type="button" class="track-choice" data-track="${t.id}" aria-pressed="false"><span class="track-number">${t.number}</span>${this.trackSVG(t)}<strong>${t.short}</strong><small>${t.difficulty} · ${(t.length*.032/1000).toFixed(2).replace(".",",")} km</small></button>`).join("");
      this.$("driver-select").innerHTML=DRIVERS.map(d=>`<button type="button" class="driver-choice" data-driver="${d.id}" aria-label="${d.name} · ${d.className}" aria-pressed="false" style="--driver:${d.color};--accent:${d.accent}"><span class="driver-helmet"><i></i></span><strong>${d.name}</strong></button>`).join("");
      this.syncMenu();
    }
    syncMenu(){
      document.querySelectorAll("[data-track]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.track===this.selectedTrackId)));
      document.querySelectorAll("[data-driver]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.driver===this.selectedDriver)));
      document.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===this.mode)));
      const d=DRIVERS.find(d=>d.id===this.selectedDriver);
      this.$("driver-name").textContent=d.name;this.$("driver-class").textContent=d.className;
      this.$("stat-speed").style.width=`${d.maxSpeed-290}%`;
      this.$("stat-acceleration").style.width=`${(d.acceleration-140)/1.3}%`;
      this.$("stat-handling").style.width=`${(d.handling-1.7)/1.2*100}%`;
      this.$("track-name").textContent=this.track.name;this.$("track-subtitle").textContent=this.track.subtitle;
      this.$("kart-start").innerHTML=this.mode==="cup"?'Start Grand Prix <span>↗</span>':'Ud på banen <span>↗</span>';
      this.$("mode-description").textContent=this.mode==="cup"?"Seks baner. Saml point og vind pokalen.":this.mode==="time"?"Kun dig og uret. Find den perfekte linje.":"Tre omgange. Syv rivaler. Ét målflag.";
      this.$("kart-difficulty").disabled=this.mode==="time";
      const record=this.save.records[this.recordKey()];
      this.$("kart-best").textContent=Number.isFinite(record?.time)?`Din rekord · ${formatTime(record.time)}`:"Din første rekord venter";
      this.$("kart-sound").textContent=this.audio.enabled?"Lyd til":"Lyd fra";this.$("kart-sound").setAttribute("aria-pressed",String(this.audio.enabled));
    }
    recordKey(){return `${this.track.id}:v${this.track.revision}:${this.mode==="time"?"time":this.difficulty}`;}
    bindUI(){
      this.$("track-select").addEventListener("click",e=>{
        const b=e.target.closest("[data-track]");if(!b)return;
        this.selectedTrackId=b.dataset.track;this.track=TRACKS.find(t=>t.id===this.selectedTrackId);this.race=new Race(this.track);this.syncMenu();this.persist();
      });
      this.$("driver-select").addEventListener("click",e=>{
        const b=e.target.closest("[data-driver]");if(!b)return;
        this.selectedDriver=b.dataset.driver;this.syncMenu();this.persist();
      });
      document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>{this.mode=b.dataset.mode;this.syncMenu();this.persist();}));
      this.$("kart-difficulty").addEventListener("change",e=>{this.difficulty=e.target.value;this.syncMenu();this.persist();});
      this.$("kart-autogas").addEventListener("change",e=>{this.autoGas=e.target.checked;this.persist();});
      this.$("kart-assist").addEventListener("change",e=>{this.assist=e.target.checked;this.persist();});
      this.$("kart-start").addEventListener("click",()=>{this.cup=this.mode==="cup"?{round:0,points:Object.fromEntries(DRIVERS.map(d=>[d.id,0]))}:null;this.startRace();});
      this.$("kart-retry").addEventListener("click",()=>{if(this.cup)this.cup={round:0,points:Object.fromEntries(DRIVERS.map(d=>[d.id,0]))};this.startRace();});
      this.$("kart-next").addEventListener("click",()=>{if(this.cup&&this.cup.round<TRACKS.length-1){this.cup.round++;this.startRace();}});
      this.$("kart-resume").addEventListener("click",()=>this.togglePause(false));
      this.$("kart-restart").addEventListener("click",()=>this.startRace());
      this.$("kart-menu-button").addEventListener("click",()=>this.showMenu());
      this.$("kart-menu-button-result").addEventListener("click",()=>this.showMenu());
      this.$("kart-pause-button").addEventListener("click",()=>this.togglePause());
      this.$("kart-pause-floating").addEventListener("click",()=>this.togglePause());
      this.$("kart-sound").addEventListener("click",()=>{this.audio.enabled=!this.audio.enabled;this.audio.unlock();this.syncMenu();this.persist();});
      this.$("kart-fullscreen").addEventListener("click",async()=>{
        try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
        catch{this.showToast("Fuldskærm understøttes ikke i denne browser.");}
      });
      window.addEventListener("keydown",e=>{
        if(e.code==="Escape"){e.preventDefault();this.togglePause();}
        if(e.code==="Tab"&&(this.paused||this.race.state==="finished")){
          const panel=this.$(this.paused?"kart-pause":"kart-result");
          const buttons=[...panel.querySelectorAll("button")].filter(b=>!b.hidden&&!b.disabled);
          const first=buttons[0],last=buttons.at(-1);
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
        }
        if(e.code==="KeyR"&&this.input.enabled&&!e.repeat){this.race.player.recover(this.track);this.showToast("Tilbage på banen");}
      });
      const pause=()=>{if(["countdown","racing"].includes(this.race.state))this.togglePause(true);this.input.reset();};
      window.addEventListener("blur",pause);
      document.addEventListener("visibilitychange",()=>{if(document.hidden)pause();});
      document.querySelectorAll("[data-kart-control]").forEach(b=>{
        b.addEventListener("pointerdown",e=>{e.preventDefault();if(!this.input.enabled)return;b.setPointerCapture(e.pointerId);this.input.setControl(b.dataset.kartControl,true,e.pointerId);b.classList.add("pressed");});
        const release=e=>{this.input.setControl(b.dataset.kartControl,false,e.pointerId);b.classList.remove("pressed");};
        b.addEventListener("pointerup",release);b.addEventListener("pointercancel",release);b.addEventListener("lostpointercapture",release);
      });
      this.$("kart-item").addEventListener("click",()=>{if(this.input.enabled)this.input.itemPressed=true;});
    }
    startRace(){
      this.audio.unlock();
      this.track=this.cup?TRACKS[this.cup.round]:TRACKS.find(t=>t.id===this.selectedTrackId);
      this.race=new Race(this.track,DRIVERS,{mode:this.mode,difficulty:this.difficulty,assist:this.assist,autoGas:this.autoGas});
      this.race.start(this.selectedDriver);this.paused=false;this.resultSaved=false;this.accumulator=0;this.lastCountdown=4;
      this.input.reset();this.input.enabled=true;this.$("kart-menu").hidden=true;this.$("kart-result").hidden=true;this.$("kart-pause").hidden=true;
      document.body.classList.add("kart-racing");document.body.classList.remove("kart-paused");
      this.$("race-label").textContent=this.cup?`GRAND PRIX · ${this.cup.round+1}/${TRACKS.length} · ${this.track.name}`:this.track.name;
      this.$("kart-pause-button").textContent="Pause";this.$("kart-pause-button").disabled=false;
      this.$("kart-touch-gas").hidden=this.autoGas;
      this.canvas.focus({preventScroll:true});this.showToast(this.autoGas?"Autogas er til · Du styrer og drifter":"Giv gas ved 1 for startturbo");
    }
    showMenu(){
      this.paused=false;this.cup=null;this.input.reset();this.input.enabled=false;
      this.track=TRACKS.find(t=>t.id===this.selectedTrackId);this.race=new Race(this.track);
      this.$("kart-menu").hidden=false;this.$("kart-result").hidden=true;this.$("kart-pause").hidden=true;
      document.body.classList.remove("kart-racing","kart-paused","kart-boosting");
      this.$("kart-pause-button").disabled=true;this.$("kart-pause-button").textContent="Pause";
      this.$("kart-toast").classList.remove("visible");this.toastUntil=0;
      this.syncMenu();this.$("kart-start").focus({preventScroll:true});
    }
    togglePause(value){
      if(!["racing","countdown"].includes(this.race.state))return;
      this.paused=typeof value==="boolean"?value:!this.paused;
      this.input.reset();this.input.enabled=!this.paused;this.accumulator=0;
      this.$("kart-pause").hidden=!this.paused;document.body.classList.toggle("kart-paused",this.paused);
      this.$("kart-pause-button").textContent=this.paused?"Fortsæt":"Pause";
      if(this.paused)this.$("kart-resume").focus({preventScroll:true});else{this.audio.unlock();this.canvas.focus({preventScroll:true});}
    }
    showResult(){
      this.resultSaved=true;this.input.enabled=false;this.input.reset();
      const result=this.race.result,key=this.recordKey(),old=this.save.records[key];
      const record=!Number.isFinite(old?.time)||result.time<old.time;
      this.save.records[key]={time:Math.min(Number.isFinite(old?.time)?old.time:Infinity,result.time),lap:Math.min(Number.isFinite(old?.lap)?old.lap:Infinity,result.bestLap)};this.persist();
      if(this.cup)this.race.lastRankings.forEach((k,i)=>this.cup.points[k.driver.id]+=CUP_POINTS[i]);
      const finishingRank=id=>this.race.karts.find(k=>k.driver.id===id)?.rank||8;
      const cupDone=this.cup?.round===TRACKS.length-1,standings=this.cup?[...DRIVERS].sort((a,b)=>this.cup.points[b.id]-this.cup.points[a.id]||finishingRank(a.id)-finishingRank(b.id)):null;
      const cupRank=standings?standings.findIndex(d=>d.id===this.selectedDriver)+1:0;
      this.$("result-kicker").textContent=cupDone?"GRAND PRIX · SAMLET RESULTAT":record?"NY PERSONLIG REKORD":"MÅLFLAG";
      this.$("kart-result-title").textContent=cupDone?(cupRank===1?"Pokalen er din!":`Nr. ${cupRank} i Grand Prix`):this.mode==="time"?"Godt kørt!":result.position===1?"Sejren er din!":`Du blev nr. ${result.position}`;
      this.$("result-medal").textContent=cupDone?String(cupRank):String(result.position);
      this.$("kart-result-copy").textContent=`${this.track.name} · ${this.race.player.driver.name}`;
      this.$("result-time").textContent=formatTime(result.time);this.$("result-lap").textContent=formatTime(result.bestLap);
      const rows=this.cup?standings.map((d,i)=>({driver:d,rank:i+1,value:`${this.cup.points[d.id]} point`})):this.race.lastRankings.map(k=>({driver:k.driver,rank:k.rank,value:k.finished?formatTime(k.finishTime):"På banen"}));
      this.$("result-standings").innerHTML=rows.map(r=>`<li class="${r.driver.id===this.selectedDriver?"is-player":""}"><span>${r.rank.toString().padStart(2,"0")}</span><i style="--driver:${r.driver.color}"></i><strong>${r.driver.name}${r.driver.id===this.selectedDriver?" · dig":""}</strong><b>${r.value}</b></li>`).join("");
      this.$("kart-next").hidden=!this.cup||cupDone;this.$("kart-retry").hidden=Boolean(this.cup&&!cupDone);
      this.$("kart-retry").textContent=cupDone?"Kør Grand Prix igen":"Kør igen";
      this.$("kart-result").hidden=false;this.$(this.cup&&!cupDone?"kart-next":"kart-retry").focus({preventScroll:true});
      this.audio.tone(523,.18);setTimeout(()=>this.audio.tone(659,.18),160);setTimeout(()=>this.audio.tone(784,.4),320);
      if(this.mode!=="time")try{
        const submission=window.WutborgHighscores?.submit({gameKey:"wutborg-kart",gameTitle:"Wutborg Kart",playerName:this.race.player.driver.name,score:result.score,outcome:result.position===1?"won":"completed",details:{version:4,track:this.track.id,difficulty:this.difficulty,position:result.position,seconds:Math.round(result.time*100)/100}});
        submission?.catch(()=>{});
      }catch{/* Local results work offline. */}
    }
    update(dt){
      if(this.paused)return;
      const player=this.race.player,coins=player?.coins||0,boosts=player?.boosts||0,spin=player?.spinTimer||0,state=this.race.state;
      this.race.update(dt,this.input.enabled?this.input.read(this.autoGas):EMPTY);
      if(this.race.state==="countdown"){
        const n=Math.ceil(this.race.countdown);if(n!==this.lastCountdown){this.lastCountdown=n;this.audio.tone(420,.08,"sine",.14);}
      }
      if(state==="countdown"&&this.race.state==="racing")this.audio.tone(840,.3,"triangle");
      if(player?.coins>coins)this.audio.tone(1200,.08);
      if(player?.boosts>boosts){this.audio.tone(720,.2,"triangle");this.showToast(player.boostTimer>=1.2?"Super-turbo!":"Mini-turbo!");}
      if(player?.spinTimer>spin)this.audio.tone(120,.2,"sawtooth",.08);
      while(this.race.events.length)this.showToast(this.race.events.shift());
      if(this.race.state==="finished"&&!this.resultSaved)this.showResult();
    }
    showToast(text){this.$("kart-toast").textContent=text;this.$("kart-toast").classList.add("visible");this.toastUntil=performance.now()+2400;}
    updateUI(now){
      const p=this.race.player;if(!p)return;
      this.$("kart-position").textContent=this.mode==="time"?"TT":p.rank;this.$("position-total").textContent=this.mode==="time"?"TIDSKØRSEL":`/ ${this.race.karts.length}`;
      this.$("kart-lap").textContent=`${Math.min(3,p.lap+1)} / 3`;this.$("kart-time").textContent=formatTime(this.race.elapsed);
      this.$("kart-speed").textContent=String(Math.round(Math.abs(p.speed)*.52));this.$("kart-coins").textContent=String(p.coins).padStart(2,"0");
      this.$("speed-ring").style.setProperty("--speed",`${clamp(Math.abs(p.speed)/500*260,0,260)}deg`);
      this.$("kart-lap-time").textContent=formatTime(this.race.elapsed-p.lapStarted);this.$("kart-wrong-way").hidden=p.wrongWay<.7;
      const roulette=p.itemRoulette>0,item=roulette?Object.values(ITEM_TYPES)[Math.floor(now/85)%6]:ITEM_TYPES[p.item];
      this.$("item-icon").textContent=item?.icon||"?";this.$("item-name").textContent=roulette?"Finder item…":item?.name||"Saml en itemboks";
      this.$("kart-item").style.setProperty("--item",item?.color||"#a3b4bf");this.$("kart-item").classList.toggle("has-item",Boolean(p.item));
      this.$("item-hint").textContent=p.item?"SPACE / TRYK":roulette?"…":"PÅ BANEN";
      this.$("kart-item").setAttribute("aria-label",item?`Brug ${item.name}: ${item.help}`:"Ingen item. Saml en itemboks på banen.");
      this.$("touch-item-icon").textContent=item?.icon||"◆";
      const charge=p.drifting?p.driftTimer/1.8:0,level=charge>=1?3:charge>=.58?2:1;
      this.$("drift-fill").style.width=`${Math.min(1,charge)*100}%`;this.$("drift-meter").dataset.level=String(level);
      this.$("drift-label").textContent=p.drifting?(charge>=.28?"SLIP FOR TURBO":"LADER TURBO"):p.boostTimer>0?"TURBO!":p.offroad?"TILBAGE PÅ ASFALTEN":"SHIFT · DRIFT";
      this.$("drift-meter").classList.toggle("active",p.drifting||p.boostTimer>0);
      this.$("kart-countdown").hidden=this.race.state!=="countdown"&&!(this.race.state==="racing"&&this.race.elapsed<.7);
      this.$("kart-countdown").textContent=this.race.state==="countdown"?Math.ceil(this.race.countdown):"KØR!";
      document.body.classList.toggle("kart-boosting",p.boostTimer>0&&!this.paused);this.drawMinimap();
    }
    drawMinimap(){
      const canvas=this.$("kart-minimap"),ctx=canvas.getContext("2d"),t=this.track;
      const scale=Math.min(196/t.width,176/t.height),x=v=>110+(v-t.cx)*scale,y=v=>100+(v-t.cy)*scale;
      ctx.clearRect(0,0,220,200);ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();
      t.samples.forEach((p,i)=>i?ctx.lineTo(x(p.x),y(p.y)):ctx.moveTo(x(p.x),y(p.y)));ctx.closePath();
      ctx.strokeStyle="rgba(255,255,255,.2)";ctx.lineWidth=13;ctx.stroke();ctx.strokeStyle="#a9bec1";ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle="#edffb1";ctx.fillRect(x(t.start.x)-3,y(t.start.y)-6,6,12);
      for(const k of [...this.race.karts].reverse()){
        ctx.beginPath();ctx.arc(x(k.x),y(k.y),k===this.race.player?5.5:3.7,0,TAU);ctx.fillStyle=k.driver.color;ctx.fill();
        if(k===this.race.player){ctx.strokeStyle="#fff";ctx.lineWidth=2.5;ctx.stroke();}
      }
    }
    loop(timestamp){
      const dt=Math.min(.1,Math.max(0,(timestamp-(this.lastTime||timestamp))/1000));this.lastTime=timestamp;
      if(!this.paused){this.accumulator=Math.min(this.accumulator+dt,.1);while(this.accumulator>=STEP){this.update(STEP);this.accumulator-=STEP;}}
      this.audio.update(this.race.player,!this.paused&&this.race.state==="racing");
      this.renderer.draw(this.race,dt,{paused:this.paused,driver:DRIVERS.find(d=>d.id===this.selectedDriver)});
      if(timestamp-this.lastUI>65){this.updateUI(timestamp);this.lastUI=timestamp;}
      if(this.toastUntil&&timestamp>this.toastUntil){this.$("kart-toast").classList.remove("visible");this.toastUntil=0;}
      requestAnimationFrame(t=>this.loop(t));
    }
  }
  window.WutborgKart={data,formatTime,testHooks:{Kart,Race,RaceAI,InputManager,KartGame,readSave,EMPTY}};
  if(typeof document!=="undefined")window.addEventListener("DOMContentLoaded",async()=>{
    let canvas=document.getElementById("kart-canvas");if(!canvas)return;
    let renderer;
    try{
      const module=await import("./kart-racer-3d.js?v=20260911-expansion");
      renderer=new module.KartRacer3DRenderer(canvas);
    }catch(error){
      console.warn("3D er ikke tilgængelig. Starter 2D-visningen.",error);
      const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;
      renderer=new FallbackRenderer(canvas);document.getElementById("renderer-status").textContent="2D · Kompatibel visning";
    }
    window.wutborgKartGame=new KartGame(renderer,canvas);
    document.getElementById("kart-loading").hidden=true;
  });
})();
