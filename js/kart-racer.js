(() => {
  "use strict";
  const data=window.WutborgKartData;
  if(!data)return;
  const {DRIVERS,ITEM_TYPES,TRACKS,DIFFICULTIES,CUP_POINTS,TAU,clamp,mod,lerp,angleDelta}=data;
  const STEP=1/60,STORAGE_KEY="wutborg.kart.v2";
  const EMPTY={steer:0,accelerate:false,brake:false,drift:false,itemPressed:false,lookBack:false};
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const formatTime=seconds=>{
    const cs=Math.round(Math.max(0,Number(seconds)||0)*100);
    return `${Math.floor(cs/6000)}:${String(Math.floor(cs/100)%60).padStart(2,"0")}.${String(cs%100).padStart(2,"0")}`;
  };
  const readSave=storage=>{
    try {
      const raw=JSON.parse(storage.getItem(STORAGE_KEY)||"{}");
      const ghosts=Object.fromEntries(Object.entries(raw?.ghosts||{}).filter(([key,value])=>key.length<100&&RaceGhost.valid(value)).sort((a,b)=>b[1].savedAt-a[1].savedAt).slice(0,4));
      return {records:raw&&typeof raw.records==="object"&&raw.records&&!Array.isArray(raw.records)?raw.records:{},settings:raw&&typeof raw.settings==="object"&&raw.settings&&!Array.isArray(raw.settings)?raw.settings:{},ghosts};
    }catch{return {records:{},settings:{},ghosts:{}};}
  };
  class RaceGhost {
    constructor(saved=null){this.saved=RaceGhost.valid(saved)?saved:null;this.frames=[];this.nextSample=0;}
    static valid(saved){
      if(!saved||!Number.isFinite(saved.time)||saved.time<=0||saved.time>600||!Number.isFinite(saved.savedAt)||!Array.isArray(saved.frames)||saved.frames.length<2||saved.frames.length>6002)return false;
      let previous=-1,progress=-Infinity;
      for(const f of saved.frames){
        if(!Array.isArray(f)||f.length!==7||!f.every(Number.isFinite)||f[0]<=previous||f[0]<0||f[0]>saved.time+.002||Math.abs(f[1])>20000||Math.abs(f[2])>20000||Math.abs(f[3])>10000||Math.abs(f[4])>2000||f[5]<0||f[5]>1000||f[6]<progress||Math.abs(f[6])>1000000)return false;
        previous=f[0];progress=f[6];
      }
      return saved.frames[0][0]===0&&Math.abs(previous-saved.time)<.002;
    }
    capture(time,kart,force=false){
      if(time>600||this.frames.length>=6002||(!force&&time+1e-6<this.nextSample))return;
      const rounded=value=>Math.round(value*1000)/1000,last=this.frames.at(-1);
      if(last&&rounded(time)<=last[0])return;
      this.frames.push([rounded(time),rounded(kart.x),rounded(kart.y),rounded(kart.heading),rounded(kart.elevation),rounded(kart.airHeight),Math.max(last?.[6]??-Infinity,rounded(kart.progress))]);
      this.nextSample=time+.1;
    }
    pose(time){
      if(!this.saved||time>this.saved.time)return null;
      const frames=this.saved.frames;
      let low=0,high=frames.length-1;
      while(low+1<high){const mid=(low+high)>>1;if(frames[mid][0]<=time)low=mid;else high=mid;}
      const a=frames[low],b=frames[high],alpha=clamp((time-a[0])/(b[0]-a[0]),0,1);
      return {x:lerp(a[1],b[1],alpha),y:lerp(a[2],b[2],alpha),heading:a[3]+angleDelta(a[3],b[3])*alpha,elevation:lerp(a[4],b[4],alpha),airHeight:lerp(a[5],b[5],alpha),progress:lerp(a[6],b[6],alpha)};
    }
    timeAtProgress(progress){
      if(!this.saved)return null;
      const frames=this.saved.frames;if(progress<=frames[0][6])return 0;
      let low=0,high=frames.length-1;
      while(low+1<high){const mid=(low+high)>>1;if(frames[mid][6]<progress)low=mid;else high=mid;}
      const a=frames[low],b=frames[high],span=b[6]-a[6];
      return lerp(a[0],b[0],span>0?clamp((progress-a[6])/span,0,1):0);
    }
    complete(time,recoveries=0){
      if(recoveries||this.saved&&time>=this.saved.time)return null;
      const saved={time,savedAt:Date.now(),frames:this.frames};return RaceGhost.valid(saved)?saved:null;
    }
  }
  class Kart {
    constructor(driver,index=0,isAI=false){this.driver=driver;this.index=index;this.isAI=isAI;this.radius=19;}
    reset(track,slot=this.index){
      const s=-38-Math.floor(slot/2)*65-(slot%2)*4,p=track.at(s,slot%2?38:-38);
      Object.assign(this,{x:p.x,y:p.y,elevation:p.elevation,slope:p.slope,heading:p.heading,velocityHeading:p.heading,speed:0,steer:0,visualSteer:0,
        spinTimer:0,boostTimer:0,starTimer:0,invincibleTimer:0,driftTimer:0,driftDirection:0,drifting:false,
        coins:0,item:null,pendingItem:null,itemRoulette:0,finished:false,finishTime:0,lap:0,lapTimes:[],lapStarted:0,
        progress:s,raceDistance:s,nextGate:track.length/12,gateCount:0,lastS:p.s,lastX:p.x,lastY:p.y,
        road:track.nearest(p.x,p.y),wrongWay:0,offroad:false,boosts:0,recoveries:0,stuckTime:0,hop:0,
        airHeight:0,airVelocity:0,rampCooldown:0,surface:"asphalt",shortcut:false,speedFactor:1,aiLane:(slot%3-1)*24,aiItemTime:2+slot*.37,
        yawRate:0,steeringAngle:0,reverseHold:0,slipAngle:0,longitudinalAcceleration:0,lateralAcceleration:0,wheelTravel:0,previousPose:null,
        aiProfile:DIFFICULTIES.normal,aiPlanTimer:0,aiPlanLane:0,aiTargetLane:slot%2?38:-38,aiDriftCooldown:0,aiHazardSpeed:Infinity,
        slipstream:0,slipstreamTarget:null,gear:1,rpm:1200,shiftTimer:0,throttle:0});
    }
    cancelDrift(){this.drifting=false;this.driftTimer=0;this.driftDirection=0;}
    applySpin(duration=.85){
      if(this.starTimer>0||this.invincibleTimer>0||this.finished)return false;
      this.cancelDrift();this.yawRate=0;this.spinTimer=duration;this.invincibleTimer=duration+1.3;this.speed*=.38;this.coins=Math.max(0,this.coins-2);
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
      this.airHeight=0;this.airVelocity=0;this.speed=50;this.yawRate=0;this.steer=0;this.visualSteer=0;this.steeringAngle=0;this.reverseHold=0;this.slipAngle=0;
      this.previousPose=null;this.longitudinalAcceleration=0;this.lateralAcceleration=0;this.invincibleTimer=1.8;this.spinTimer=0;this.cancelDrift();this.slipstream=0;this.slipstreamTarget=null;this.gear=1;this.rpm=1200;this.shiftTimer=0;this.recoveries++;this.stuckTime=0;
    }
    velocity(){return {x:Math.cos(this.velocityHeading)*this.speed,y:Math.sin(this.velocityHeading)*this.speed};}
    setVelocity(x,y){
      // Keep speed signed for reverse, while preserving lateral collision momentum.
      const magnitude=Math.hypot(x,y),sign=x*Math.cos(this.heading)+y*Math.sin(this.heading)<0?-1:1;
      this.speed=magnitude*sign;
      if(magnitude>.001)this.velocityHeading=Math.atan2(y*sign,x*sign);
    }
    updateDrivetrain(dt,throttle){
      // Automatic gearbox with hysteresis: engine feedback follows load and each shift.
      const limits=[.24,.42,.60,.79,1.12],speed=Math.abs(this.speed);
      this.throttle=throttle;this.shiftTimer=Math.max(0,this.shiftTimer-dt);
      if(this.speed<-3){this.gear=-1;}
      else if(speed<3&&!throttle){this.gear=0;}
      else{
        if(this.gear<1)this.gear=1;
        if(!this.shiftTimer){
          const before=this.gear;
          if(this.gear<5&&speed>this.driver.maxSpeed*limits[this.gear-1]*.97)this.gear++;
          else if(this.gear>1&&speed<this.driver.maxSpeed*limits[this.gear-2]*.78)this.gear--;
          if(before!==this.gear)this.shiftTimer=.18;
        }
      }
      const limit=this.gear<0?95:this.driver.maxSpeed*limits[Math.max(0,this.gear-1)];
      let target=1200+clamp(speed/limit,0,1.05)*6400+throttle*400;
      if(this.airHeight>0||this.spinTimer>0)target=Math.max(target,1200+throttle*6400);
      if(this.shiftTimer>0)target*=.84;
      this.rpm=lerp(this.rpm,clamp(target,1200,8200),1-Math.exp(-12*dt));
    }
    update(dt,input,track,assist=false){
      this.previousPose={x:this.x,y:this.y,elevation:this.elevation,heading:this.heading,airHeight:this.airHeight};
      for(const key of ["spinTimer","boostTimer","starTimer","invincibleTimer","hop","rampCooldown"])this[key]=Math.max(0,this[key]-dt);
      const throttle=clamp(Number(input.accelerate)||0,0,1),brake=clamp(Number(input.brake)||0,0,1),steer=clamp(Number(input.steer)||0,-1,1);
      const oldVelocity=this.velocity(),oldSpeed=this.speed,grounded=this.airHeight===0&&this.airVelocity<=0;
      this.surface=track.surfaceAt(this.road.s);
      this.shortcut=track.isShortcut(this.road);this.offroad=this.road.distance>track.halfWidth&&!this.shortcut;
      const ratio=clamp(Math.abs(this.speed)/this.driver.maxSpeed,0,1.5);
      // Quick countersteer and centering; gentler turn-in at high speed on digital controls.
      const steerRate=this.steer*steer<0?16:Math.abs(steer)<Math.abs(this.steer)?14:10-ratio*2;
      this.steer=lerp(this.steer,steer,1-Math.exp(-steerRate*dt));
      const boosting=this.boostTimer>0||this.starTimer>0;
      const tow=grounded&&!this.offroad&&this.speed>0?this.slipstream:0;
      const top=(this.driver.maxSpeed+this.coins*2.5)*this.speedFactor+(boosting?125:0)+tow*22;
      let vx=oldVelocity.x,vy=oldVelocity.y;
      if(this.spinTimer>0){
        vx*=Math.exp(-1.8*dt);vy*=Math.exp(-1.8*dt);this.yawRate=0;
      }else{
        const wants=grounded&&input.drift&&!brake&&!this.offroad&&this.speed>130&&(this.drifting||Math.abs(this.steer)>.22);
        if(wants){
          if(!this.drifting){this.driftDirection=Math.sign(this.steer);this.hop=.25;}
          this.drifting=true;
          // Charge only a real slide through a turn, rather than a held button on a straight.
          if(Math.abs(this.slipAngle)>.1&&this.steer*this.driftDirection>-.35)this.driftTimer=clamp(this.driftTimer+dt,0,2.4);
        }else if(this.drifting&&grounded){
          if(brake||this.speed<120||this.offroad)this.cancelDrift();else this.releaseDrift();
        }
        const c=Math.cos(this.heading),s=Math.sin(this.heading);
        let forward=vx*c+vy*s,lateral=-vx*s+vy*c;
        const surfaceGrip=this.offroad?.55:this.surface==="ice"?.55:1;
        const traction=760*surfaceGrip*(.92+this.driver.handling*.032);
        let drive=0;
        if(grounded){
          if(brake){
            if(forward>4){drive=-440*brake;this.reverseHold=0;}
            else{
              if(forward>0)forward=0;
              this.reverseHold+=dt;
              if(this.reverseHold>=.25)drive=-this.driver.acceleration*.62*brake;
            }
          }else{
            this.reverseHold=0;
            if(throttle||boosting)drive=forward<-4?380*(throttle||1):(this.driver.acceleration+(boosting?240:0)+tow*30)*(boosting?1:throttle)*Math.max(.25,1-.65*(Math.max(0,forward)/top)**2);
          }
          const resistance=8+Math.abs(forward)*((throttle||boosting)?.08:.28)+forward*forward*.00015;
          if(forward>=top&&drive>0)drive=Math.min(drive,resistance);
          const slowdown=Math.min(Math.abs(forward),resistance*dt);
          forward-=Math.sign(forward)*slowdown;
          // Hills load the engine; the reverse input always brakes before selecting reverse.
          const hill=-track.slopeAt(this.road.s)*100;
          const powered=forward+(clamp(drive,-traction,traction)+hill)*dt;
          forward=brake&&drive<0&&forward>0?Math.max(0,powered):throttle&&forward<0?Math.min(0,powered):powered;
          if(forward>top)forward=top+(forward-top)*Math.exp(-3*dt);
          forward=Math.max(-95,forward);
        }
        this.steeringAngle=this.steer*.62/(1+Math.abs(forward)/300*.95);
        let requestedYaw=forward/62*Math.tan(this.steeringAngle)*(this.driver.handling/2.5);
        if(this.drifting)requestedYaw+=this.driftDirection*.32*clamp(forward/200,0,1);
        // A bicycle steering model bounded by the tyres' lateral acceleration budget.
        const yawLimit=traction/Math.max(80,Math.abs(forward))*(this.drifting?1.12:1);
        requestedYaw=clamp(requestedYaw,-yawLimit,yawLimit);
        if(!grounded)requestedYaw=this.steer*.18;
        if(assist&&grounded&&!this.drifting&&Math.abs(steer)<.15&&this.road.distance>track.halfWidth*.73&&Math.abs(angleDelta(this.heading,this.road.heading))<1.1&&forward>80){
          const desired=this.road.heading-clamp(this.road.lateral/track.halfWidth,-1,1)*.36;
          requestedYaw+=clamp(angleDelta(this.heading,desired)*2,-.45,.45);
        }
        this.yawRate=lerp(this.yawRate,requestedYaw,1-Math.exp(-(grounded?9:3)*dt));
        const rotation=this.yawRate*dt;
        this.heading+=rotation;
        // Rotate the body axes without rotating its momentum. Tyres then pull the velocity
        // toward the new heading, with less rear grip during drift and on ice.
        const bodyForward=forward*Math.cos(rotation)+lateral*Math.sin(rotation);
        lateral=-forward*Math.sin(rotation)+lateral*Math.cos(rotation);forward=bodyForward;
        if(grounded){
          const driftSlip=this.drifting?this.driftDirection*(.18+Math.max(0,this.steer*this.driftDirection)*.13):0;
          const targetLateral=-Math.abs(forward)*driftSlip;
          const grip=(this.drifting?5.2:15)*surfaceGrip;
          // Braking/acceleration and cornering share the available tyre grip.
          const remainingGrip=Math.sqrt(Math.max(0,traction*traction-Math.min(Math.abs(drive),traction*.9)**2));
          lateral+=clamp((targetLateral-lateral)*(1-Math.exp(-grip*dt)),-remainingGrip*dt,remainingGrip*dt);
          if(this.drifting)forward*=Math.exp(-.055*dt);
          if(this.offroad) {const drag=Math.exp(-(this.starTimer>0?.15:2.1)*dt);forward*=drag;lateral*=drag;}
        }
        const nc=Math.cos(this.heading),ns=Math.sin(this.heading);
        vx=forward*nc-lateral*ns;vy=forward*ns+lateral*nc;
      }
      this.setVelocity(vx,vy);
      this.x+=vx*dt;this.y+=vy*dt;
      this.road=track.nearest(this.x,this.y,this.road?.index);this.elevation=this.road.elevation;this.slope=this.road.slope;this.shortcut=track.isShortcut(this.road);this.offroad=this.road.distance>track.halfWidth&&!this.shortcut;
      if(this.shortcut)this.boostTimer=Math.max(this.boostTimer,.28);
      if(this.airHeight>0||this.airVelocity>0){this.airVelocity-=280*dt;this.airHeight=Math.max(0,this.airHeight+this.airVelocity*dt);if(this.airHeight===0){this.airVelocity=0;if(input.drift&&this.speed>120){this.boostTimer=Math.max(this.boostTimer,.85);this.boosts++;}}}
      const wall=track.halfWidth+62;
      if(this.road.distance>wall){
        const excess=this.road.distance-wall,side=Math.sign(this.road.lateral);
        this.x+=Math.sin(this.road.heading)*side*excess;this.y-=Math.cos(this.road.heading)*side*excess;
        const nx=-Math.sin(this.road.heading)*side,ny=Math.cos(this.road.heading)*side,outward=vx*nx+vy*ny;
        // Remove only momentum into the barrier; glancing contacts retain forward speed.
        if(outward>0)this.setVelocity(vx-nx*outward*1.08,vy-ny*outward*1.08);
        this.road=track.nearest(this.x,this.y,this.road.index);this.elevation=this.road.elevation;this.slope=this.road.slope;
      }
      const finalVelocity=this.velocity(),ax=(finalVelocity.x-oldVelocity.x)/dt,ay=(finalVelocity.y-oldVelocity.y)/dt;
      this.longitudinalAcceleration=lerp(this.longitudinalAcceleration,ax*Math.cos(this.heading)+ay*Math.sin(this.heading),1-Math.exp(-8*dt));
      this.lateralAcceleration=lerp(this.lateralAcceleration,-ax*Math.sin(this.heading)+ay*Math.cos(this.heading),1-Math.exp(-8*dt));
      this.slipAngle=angleDelta(this.heading,this.velocityHeading);this.wheelTravel+=(oldSpeed+this.speed)*.5*dt;
      this.updateDrivetrain(dt,boosting?1:throttle);
      const alongRoad=finalVelocity.x*Math.cos(this.road.heading)+finalVelocity.y*Math.sin(this.road.heading);
      this.wrongWay=alongRoad<-65?this.wrongWay+dt:Math.max(0,this.wrongWay-dt*3);
      this.stuckTime=this.isAI&&Math.abs(this.speed)<45?this.stuckTime+dt:0;
      if(this.stuckTime>2.5)this.recover(track);
      this.visualSteer=lerp(this.visualSteer,this.steer,1-Math.exp(-10*dt));
    }
  }
  class RaceAI {
    constructor(){this.plans=new WeakMap();}
    planFor(track){
      let plan=this.plans.get(track);if(plan)return plan;
      const count=track.samples.length,span=Math.max(1,Math.round(28/track.step));
      plan=track.samples.map((p,i)=>angleDelta(track.samples[mod(i-span,count)].heading,track.samples[mod(i+span,count)].heading)/(2*span*track.step));
      this.plans.set(track,plan);return plan;
    }
    curvature(track,s){
      const plan=this.planFor(track),position=mod(s,track.length)/track.step,index=Math.floor(position);
      return lerp(plan[index],plan[(index+1)%plan.length],position-index);
    }
    laneFor(kart,track,race,ideal,allowPickups=true){
      kart.aiHazardSpeed=Infinity;if(!race)return ideal;
      const hazards=[],ahead=s=>mod(s-kart.road.s+track.length/2,track.length)-track.length/2;
      for(const other of race.karts){
        if(other===kart||other.finished)continue;
        const gap=ahead(other.road.s);
        if(gap>-45&&gap<320)hazards.push({gap,lateral:other.road.lateral,radius:48});
      }
      for(const obstacle of track.obstacles){
        const gap=ahead(obstacle.s);if(gap<-35||gap>400)continue;
        const arrival=race.elapsed+Math.max(0,gap)/Math.max(100,kart.speed);
        hazards.push({gap,lateral:Math.sin(arrival*1.3+obstacle.phase)*track.halfWidth*.7,radius:obstacle.radius+kart.radius+17});
      }
      for(const trap of race.traps){
        const road=trap.road||(trap.road=track.nearest(trap.x,trap.y)),gap=ahead(road.s);
        if(gap>-25&&gap<320)hazards.push({gap,lateral:road.lateral,radius:45});
      }
      for(const hazard of hazards)if(hazard.gap>=0&&hazard.gap<130&&Math.abs(kart.road.lateral-hazard.lateral)<hazard.radius){
        kart.aiHazardSpeed=Math.min(kart.aiHazardSpeed,Math.sqrt(160*160+500*Math.max(0,hazard.gap-40)));
      }
      let pickup=null,pickupScore=0;
      const consider=(objects,priority)=>{
        for(const object of objects){
          if(object.cooldown>0)continue;
          const gap=ahead(object.s);if(gap<-25||gap>380)continue;
          // Pickups already carry their arc position and heading; avoid a full
          // 1,024-segment road search in every rival's planning tick.
          const center=track.at(object.s),lateral=(object.y-center.y)*Math.cos(object.heading)-(object.x-center.x)*Math.sin(object.heading);
          const score=priority-gap*.002-Math.abs(lateral-ideal)*.008;
          if(score>pickupScore){pickupScore=score;pickup=lateral;}
        }
      };
      if(allowPickups){
        consider(track.boostPads,2.5);
        if(!kart.item&&!kart.itemRoulette)consider(race.itemBoxes,3);
        if(kart.coins<10)consider(race.coins,2);
      }
      const candidates=[ideal,kart.aiPlanLane,-track.halfWidth*.56,0,track.halfWidth*.56];
      if(pickup!==null)candidates.push(pickup);
      let best=ideal,bestCost=Infinity;
      for(const lane of candidates){
        let cost=Math.abs(lane-ideal)*.015+Math.abs(lane-kart.aiPlanLane)*.008;
        if(pickup!==null)cost+=Math.abs(lane-pickup)*.045;
        for(const hazard of hazards){
          const separation=Math.abs(lane-hazard.lateral);
          if(separation<hazard.radius)cost+=(1-separation/hazard.radius)*(hazard.gap<180?12:7);
        }
        if(cost<bestCost){best=lane;bestCost=cost;}
      }
      return clamp(best,-track.halfWidth*.65,track.halfWidth*.65);
    }
    shouldUseItem(kart,race,cornerSpeed,cruise){
      if(!kart.item||kart.aiItemTime>0||kart.spinTimer>0||kart.airHeight>0)return false;
      if(kart.item==="mushroom")return kart.boostTimer<.1&&cornerSpeed>cruise*.94&&!kart.offroad;
      if(kart.item==="star")return kart.starTimer<.1;
      if(!race)return true;
      const rivals=race.karts.filter(k=>k!==kart&&!k.finished&&k.starTimer<=0&&k.invincibleTimer<=0);
      if(kart.item==="lightning")return rivals.length>0;
      if(kart.item==="redShell"){
        const target=race.karts.filter(k=>k!==kart&&!k.finished&&k.progress>kart.progress).sort((a,b)=>a.progress-b.progress)[0];
        return Boolean(target&&target.starTimer<=0&&target.invincibleTimer<=0);
      }
      if(kart.item==="banana")return rivals.some(k=>kart.progress-k.progress>0&&kart.progress-k.progress<300&&Math.abs(k.road.lateral-kart.road.lateral)<60);
      return rivals.some(k=>k.progress>kart.progress&&distance(k,kart)<650&&Math.abs(angleDelta(kart.heading,Math.atan2(k.y-kart.y,k.x-kart.x)))<.4);
    }
    inputFor(kart,track,race=null,dt=STEP){
      const profile=kart.aiProfile||DIFFICULTIES.normal,speed=Math.max(0,kart.speed),lookahead=80+speed*.34;
      const bend=this.curvature(track,kart.road.s+lookahead);
      const cruise=(kart.driver.maxSpeed+kart.coins*2.5)*kart.speedFactor+(kart.boostTimer>0||kart.starTimer>0?125:0)+kart.slipstream*22;
      let targetSpeed=cruise,cornerSpeed=Infinity;
      // Brake for the tightest upcoming corner, including reduced grip on future ice.
      for(let ahead=0;ahead<=560;ahead+=80){
        const s=kart.road.s+ahead,grip=track.surfaceAt(mod(s,track.length))==="ice"?.55:1;
        const limit=Math.sqrt(760*profile.cornerGrip*grip/Math.max(.0001,Math.abs(this.curvature(track,s))));
        cornerSpeed=Math.min(cornerSpeed,limit);
        targetSpeed=Math.min(targetSpeed,Math.sqrt(limit*limit+2*300*Math.max(0,ahead-65)));
      }
      // Airborne momentum cannot follow a curved road. Set up a controlled take-off
      // rather than arriving at a ramp at boost speed and running wide on landing.
      let launchAhead=false;
      for(const ramp of track.ramps){
        const gap=mod(ramp.s-kart.road.s+track.length/2,track.length)-track.length/2;
        if(gap<0||gap>420)continue;
        let landingBend=0;for(let ahead=0;ahead<=400;ahead+=80)landingBend=Math.max(landingBend,Math.abs(this.curvature(track,ramp.s+ahead)));
        const launchSpeed=clamp(Math.sqrt(track.halfWidth*.85/Math.max(.0001,landingBend*.66)),220,340);
        targetSpeed=Math.min(targetSpeed,Math.sqrt(launchSpeed*launchSpeed+600*Math.max(0,gap-65)));
        if(gap<180)launchAhead=true;
      }
      kart.aiPlanTimer-=dt;kart.aiDriftCooldown=Math.max(0,kart.aiDriftCooldown-dt);
      if(kart.aiPlanTimer<=0){
        const ideal=launchAhead?0:kart.aiLane*.45+clamp(bend*550,-1,1)*track.halfWidth*.28;
        const safePickup=!launchAhead&&kart.airHeight===0&&kart.surface!=="ice"&&Math.abs(bend)<.0018;
        kart.aiPlanLane=this.laneFor(kart,track,race,ideal,safePickup);kart.aiPlanTimer=.14;
      }
      kart.aiTargetLane=lerp(kart.aiTargetLane,kart.aiPlanLane,1-Math.exp(-5*dt));
      targetSpeed=Math.min(targetSpeed,kart.aiHazardSpeed);
      const target=track.at(kart.road.s+lookahead,kart.aiTargetLane),dx=target.x-kart.x,dy=target.y-kart.y;
      const trackingHeading=kart.heading+clamp(kart.slipAngle,-.6,.6)*.35;
      const delta=angleDelta(trackingHeading,Math.atan2(dy,dx));
      const yaw=2*speed*Math.sin(delta)/Math.max(60,Math.hypot(dx,dy))-(kart.drifting?kart.driftDirection*.32:0);
      const wheelAngle=Math.atan(62*yaw/Math.max(speed,60)*2.5/kart.driver.handling);
      const steer=clamp(wheelAngle*(1+speed/300*.95)/.62,-1,1);
      const unsafe=kart.offroad||Math.abs(kart.road.lateral)>track.halfWidth*.7;
      if(unsafe)targetSpeed=Math.min(targetSpeed,180);
      const brake=speed>targetSpeed+12?clamp((speed-targetSpeed-8)/65,0,1):false;
      let drift=!brake&&!unsafe&&!launchAhead&&kart.airHeight===0&&kart.surface!=="ice"&&speed>210&&kart.boostTimer<.1&&kart.aiDriftCooldown===0&&Math.abs(bend)>.0017&&Math.abs(steer)>.26;
      if(kart.drifting){
        drift=!brake&&!unsafe&&!launchAhead&&Math.sign(bend)===kart.driftDirection&&Math.abs(bend)>.001&&kart.driftTimer<profile.driftCharge;
        if(!drift)kart.aiDriftCooldown=1.1;
      }
      return {steer,accelerate:brake?false:clamp((targetSpeed-speed)/24+.35,0,1),brake,
        drift,itemPressed:this.shouldUseItem(kart,race,cornerSpeed,cruise)};
    }
  }
  class Race {
    constructor(track,drivers=DRIVERS,options={}){
      this.track=track;this.drivers=drivers;this.options=options;this.ai=new RaceAI();this.lapTarget=3;
      this.state="ready";this.elapsed=0;this.countdown=3;this.karts=[];this.lastRankings=[];this.traps=[];this.shells=[];
      this.itemBoxes=[];this.coins=[];this.player=null;this.result=null;this.events=[];this.startCharge=0;this.startTooEarly=false;this.lapFeedback=null;this.ghost=null;
    }
    start(driverId){
      const driver=this.drivers.find(d=>d.id===driverId)||this.drivers[0];
      const lineup=this.options.mode==="time"?[driver]:[driver,...this.drivers.filter(d=>d!==driver)];
      this.karts=lineup.map((d,i)=>new Kart(d,i,i>0));
      this.karts.forEach((k,i)=>{
        k.reset(this.track,lineup.length===1?0:i===0?7:i-1);
        k.aiProfile=DIFFICULTIES[this.options.difficulty]||DIFFICULTIES.normal;
        k.speedFactor=k.isAI?k.aiProfile.speed*(.985+i*.004):1;
        k.aiItemTime=k.aiProfile.itemDelay+i*.13;
      });
      this.player=this.karts[0];this.state="countdown";this.elapsed=0;this.countdown=3;this.result=null;this.events=[];this.lapFeedback=null;
      this.traps=[];this.shells=[];this.startCharge=0;this.startTooEarly=false;
      this.itemBoxes=this.options.mode==="time"?[]:this.track.itemBoxes.map(p=>({...p,cooldown:0}));
      this.coins=this.track.coins.map(p=>({...p,cooldown:0}));this.updateRankings();
      this.ghost=this.options.mode==="time"?new RaceGhost(this.options.ghost):null;this.ghost?.capture(0,this.player);
    }
    update(dt,input=EMPTY){
      if(this.state!=="countdown"&&this.state!=="racing")return;
      if(this.state==="countdown"){
        if(input.accelerate&&!this.options.autoGas){if(this.countdown>1.15)this.startTooEarly=true;else this.startCharge+=dt;}
        else if(!input.accelerate){this.startTooEarly=false;this.startCharge=0;}
        this.countdown=Math.max(0,this.countdown-dt);
        if(this.countdown===0){
          this.state="racing";
          for(const kart of this.karts)if(kart.isAI)kart.boostTimer=kart.aiProfile.startBoost;
          if(!this.startTooEarly&&this.startCharge>.18){this.player.boostTimer=1.35;this.events.push("Perfekt start!");}
        }
        return;
      }
      this.elapsed+=dt;
      this.updateSlipstreams(dt);
      this.itemBoxes.forEach(o=>o.cooldown=Math.max(0,o.cooldown-dt));this.coins.forEach(o=>o.cooldown=Math.max(0,o.cooldown-dt));
      this.karts.forEach(k=>{
        if(k.finished){k.speed*=Math.exp(-2*dt);return;}
        k.aiItemTime-=dt;
        const controls=k.isAI?this.ai.inputFor(k,this.track,this,dt):input;
        k.update(dt,controls,this.track,!k.isAI&&this.options.assist);
        if(k.itemRoulette>0){k.itemRoulette=Math.max(0,k.itemRoulette-dt);if(!k.itemRoulette){k.item=k.pendingItem;k.pendingItem=null;}}
        if(controls.itemPressed&&this.useItem(k))k.aiItemTime=k.aiProfile.itemDelay;
      });
      this.resolveKartCollisions();this.updateObjects(dt);this.karts.forEach(k=>this.updateKartProgress(k));this.updateRankings();
      this.ghost?.capture(this.elapsed,this.player,this.player.finished);
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
            const time=this.elapsed-k.lapStarted,best=Math.min(...k.lapTimes,Number.isFinite(this.options.bestLap)?this.options.bestLap:Infinity);
            k.lap++;k.lapTimes.push(time);k.lapStarted=this.elapsed;
            if(k===this.player)this.lapFeedback={lap:k.lap,time,delta:Number.isFinite(best)?time-best:null,isBest:time<best,at:this.elapsed};
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
    updateSlipstreams(dt){
      // Read the whole field before integrating anyone, so player and AI get the same tow.
      for(const k of this.karts){
        let target=null,best=Infinity;
        if(!k.finished&&k.speed>140&&!k.offroad&&!k.spinTimer&&k.airHeight<4){
          for(const other of this.karts){
            if(other===k||other.finished||other.speed<140||other.offroad||other.spinTimer||other.airHeight>=4)continue;
            if(Math.abs((k.elevation+k.airHeight)-(other.elevation+other.airHeight))>15||Math.abs(angleDelta(k.velocityHeading,other.velocityHeading))>.25)continue;
            const dx=other.x-k.x,dy=other.y-k.y,forward=dx*Math.cos(k.velocityHeading)+dy*Math.sin(k.velocityHeading),lateral=-dx*Math.sin(k.velocityHeading)+dy*Math.cos(k.velocityHeading);
            if(forward>60&&forward<300&&Math.abs(lateral)<28+forward*.055&&Math.abs(angleDelta(k.heading,k.velocityHeading))<.25&&forward<best){target=other;best=forward;}
          }
        }
        k.slipstreamTarget=target;k.slipstream=clamp(k.slipstream+dt*(target?1/1.3:-2),0,1);
      }
    }
    proximity(k=this.player){
      if(!k)return [];
      const c=Math.cos(k.heading),s=Math.sin(k.heading);
      return this.karts.filter(o=>o!==k&&!o.finished&&Math.abs(o.elevation+o.airHeight-k.elevation-k.airHeight)<24).map(o=>{
        const dx=o.x-k.x,dy=o.y-k.y;return {kart:o,forward:dx*c+dy*s,lateral:-dx*s+dy*c};
      }).filter(o=>o.forward>-150&&o.forward<220&&Math.abs(o.lateral)<135);
    }
    resolveKartCollisions(){
      for(let i=0;i<this.karts.length;i++)for(let j=i+1;j<this.karts.length;j++){
        const a=this.karts[i],b=this.karts[j];if(a.finished||b.finished)continue;
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=a.radius+b.radius;if(d>=min||Math.abs(a.elevation+a.airHeight-b.elevation-b.airHeight)>24)continue;
        const nx=d>.001?dx/d:1,ny=d>.001?dy/d:0,overlap=min-d+.1,total=a.driver.weight+b.driver.weight;
        a.x-=nx*overlap*b.driver.weight/total;a.y-=ny*overlap*b.driver.weight/total;
        b.x+=nx*overlap*a.driver.weight/total;b.y+=ny*overlap*a.driver.weight/total;
        const av=a.velocity(),bv=b.velocity(),closing=(av.x-bv.x)*nx+(av.y-bv.y)*ny;
        if(closing>0){
          const impulse=closing*1.18/(1/a.driver.weight+1/b.driver.weight);
          a.setVelocity(av.x-nx*impulse/a.driver.weight,av.y-ny*impulse/a.driver.weight);
          b.setVelocity(bv.x+nx*impulse/b.driver.weight,bv.y+ny*impulse/b.driver.weight);
        }
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
        for(const box of this.itemBoxes)if(k.airHeight<32&&box.cooldown<=0&&!k.item&&!k.itemRoulette&&distance(k,box)<34){box.cooldown=4;k.pendingItem=this.itemForRank(k.rank);k.itemRoulette=.8;}
        for(const coin of this.coins)if(k.airHeight<32&&coin.cooldown<=0&&distance(k,coin)<29){coin.cooldown=5;k.coins=Math.min(10,k.coins+1);}
        for(const ramp of this.track.ramps)if(k.speed>150&&k.rampCooldown===0&&k.airHeight===0&&distance(k,ramp)<55){k.airVelocity=160;k.airHeight=.1;k.rampCooldown=2;if(k===this.player)this.events.push("Hop! Hold drift ved landing for turbo");}
        for(const obstacle of this.track.obstacles)if(k.airHeight<28&&distance(k,this.track.obstacleAt(obstacle,this.elapsed))<k.radius+obstacle.radius)k.applySpin(.6);
        for(const pad of this.track.boostPads)if(k.airHeight<4&&distance(k,pad)<44)k.boostTimer=Math.max(k.boostTimer,.65);
      }
      this.traps=this.traps.filter(t=>{
        t.life-=dt;const hit=this.karts.find(k=>k!==t.owner&&!k.finished&&k.airHeight<22&&distance(k,t)<k.radius+17);
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
        const hit=this.karts.find(k=>k!==s.owner&&!k.finished&&k.airHeight<28&&distance(k,s)<k.radius+15);
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
      this.keys=new Set();this.pointers=new Map();this.itemPressed=false;this.enabled=false;this.previousItem=false;this.recoveryPressed=false;this.commandPad=null;this.previousCommands={pause:false,recover:false};
      if(typeof document==="undefined")return;
      window.addEventListener("keydown",e=>{
        if(!this.enabled||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target?.tagName))return;
        if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","ShiftLeft","ShiftRight","KeyW","KeyA","KeyS","KeyD","KeyX","KeyZ","KeyC"].includes(e.code)){
          e.preventDefault();if((e.code==="Space"||e.code==="KeyZ")&&!this.keys.has(e.code))this.itemPressed=true;this.keys.add(e.code);
        }
      });
      window.addEventListener("keyup",e=>this.keys.delete(e.code));
    }
    setControl(name,active,pointer=0){
      if(active){this.pointers.set(pointer,name);if(name==="item")this.itemPressed=true;if(name==="recover")this.recoveryPressed=true;}else this.pointers.delete(pointer);
    }
    readCommands(){
      const commands={pause:false,recover:this.recoveryPressed};this.recoveryPressed=false;
      const pad=typeof navigator!=="undefined"?Array.from(navigator.getGamepads?.()||[]).find(p=>p&&p.connected!==false):null;
      if(!pad){this.commandPad=null;return commands;}
      const signature=`${pad.index||0}:${pad.id||"gamepad"}`,pressed={pause:Boolean(pad.buttons[9]?.pressed),recover:Boolean(pad.buttons[1]?.pressed)};
      // Seed held buttons on connect; a held Start must not toggle again after pause/reset.
      if(this.commandPad===signature){commands.pause=pressed.pause&&!this.previousCommands.pause;commands.recover ||= pressed.recover&&!this.previousCommands.recover;}
      this.commandPad=signature;this.previousCommands=pressed;return commands;
    }
    read(autoGas=false){
      const held=(...names)=>names.some(n=>this.keys.has(n)||[...this.pointers.values()].includes(n));
      let steer=Number(held("ArrowRight","KeyD","right"))-Number(held("ArrowLeft","KeyA","left"));
      let accelerate=autoGas||held("ArrowUp","KeyW","accelerate"),brake=held("ArrowDown","KeyS","brake"),drift=held("ShiftLeft","ShiftRight","KeyX","drift"),lookBack=held("KeyC","lookBack");
      const pad=typeof navigator!=="undefined"?Array.from(navigator.getGamepads?.()||[]).find(p=>p&&p.connected!==false):null;
      if(pad){
        const axis=clamp(Number(pad.axes[0])||0,-1,1),deadzone=.12;
        const normalized=Math.sign(axis)*Math.max(0,(Math.abs(axis)-deadzone)/(1-deadzone));
        const stick=normalized*.65+normalized**3*.35;
        const digital=Number(Boolean(pad.buttons[15]?.pressed))-Number(Boolean(pad.buttons[14]?.pressed));
        const padSteer=digital||stick;if(Math.abs(padSteer)>Math.abs(steer))steer=padSteer;
        const trigger=index=>clamp(Number(pad.buttons[index]?.value??Number(Boolean(pad.buttons[index]?.pressed)))||0,0,1);
        accelerate=Math.max(Number(accelerate),trigger(7),Number(Boolean(pad.buttons[0]?.pressed)));
        brake=Math.max(Number(brake),trigger(6));drift ||= pad.buttons[5]?.pressed;lookBack ||= pad.buttons[3]?.pressed;
        const item=Boolean(pad.buttons[2]?.pressed);if(item&&!this.previousItem)this.itemPressed=true;this.previousItem=item;
      }else this.previousItem=false;
      const input={steer,accelerate:brake?false:accelerate,brake,drift,itemPressed:this.itemPressed,lookBack:Boolean(lookBack)};
      this.itemPressed=false;return input;
    }
    reset(){this.keys.clear();this.pointers.clear();this.itemPressed=false;this.previousItem=false;this.recoveryPressed=false;}
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
          const buffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate),samples=buffer.getChannelData(0);
          for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
          this.tyres=this.context.createBufferSource();this.tyres.buffer=buffer;this.tyres.loop=true;
          this.tyreFilter=this.context.createBiquadFilter();this.tyreFilter.type="bandpass";this.tyreFilter.frequency.value=1300;this.tyreFilter.Q.value=.7;
          this.tyreGain=this.context.createGain();this.tyreGain.gain.value=0;
          this.tyres.connect(this.tyreFilter);this.tyreFilter.connect(this.tyreGain);this.tyreGain.connect(this.master);this.tyres.start();
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
      const audible=active&&this.enabled,load=player?.throttle||0;
      this.gain.gain.setTargetAtTime(audible ? (.035+load*.035)*(player?.shiftTimer>0?.7:1) : 0,t,.06);
      this.engine.frequency.setTargetAtTime(28+(player?.rpm||1200)/42,t,.035);
      this.filter.frequency.setTargetAtTime(350+load*850+speed*.8,t,.08);
      const sliding=player&&player.airHeight===0&&speed>80?clamp((Math.abs(player.slipAngle)-.08)*2+Math.abs(player.lateralAcceleration)/1800,0,1):0;
      this.tyreGain.gain.setTargetAtTime(audible?sliding*.085:0,t,.06);
      this.tyreFilter.frequency.setTargetAtTime(player?.offroad?550:player?.surface==="ice"?1900:1100+sliding*750,t,.1);
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
      const ghost=race.ghost?.pose(race.elapsed);
      if(ghost){ctx.save();ctx.translate(ghost.x,ghost.y);ctx.rotate(ghost.heading);ctx.globalAlpha=.35;ctx.fillStyle="#a3f4ff";ctx.fillRect(-30,-17,65,34);ctx.strokeStyle="#efffff";ctx.lineWidth=3;ctx.strokeRect(-33,-27,71,54);ctx.restore();}
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
      try{this.save=readSave(localStorage);}catch{this.save={records:{},settings:{},ghosts:{}};}
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
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.save));}catch(error){
        // Shed only cached replays on quota errors; records/preferences remain available.
        if(error?.name!=="QuotaExceededError")return;
        for(const [key] of Object.entries(this.save.ghosts||{}).sort((a,b)=>a[1].savedAt-b[1].savedAt)){
          delete this.save.ghosts[key];
          try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.save));break;}catch{/* Storage is optional. */}
        }
      }
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
      this.$("mode-description").textContent=this.mode==="cup"?"Seks baner. Saml point og vind pokalen.":this.mode==="time"?"Kør mod din egen ghost. Gennemfør tre omgange uden at bruge Tilbage for at gemme dit bedste løb.":"Tre omgange. Syv rivaler. Ét målflag.";
      this.$("kart-difficulty").disabled=this.mode==="time";
      const record=this.save.records[this.recordKey()];
      this.$("kart-best").textContent=Number.isFinite(record?.time)&&record.time>0?`Din rekord · ${formatTime(record.time)}`:"Din første rekord venter";
      const ghost=this.save.ghosts?.[this.ghostKey()];if(this.mode==="time"&&ghost)this.$("kart-best").textContent+=` · ${d.name}s ghost ${formatTime(ghost.time)}`;
      this.$("kart-sound").textContent=this.audio.enabled?"Lyd til":"Lyd fra";this.$("kart-sound").setAttribute("aria-pressed",String(this.audio.enabled));
    }
    recordKey(){return `${this.track.id}:v${this.track.revision}:${this.mode==="time"?"time":this.difficulty}`;}
    ghostKey(){return `${this.track.id}:v${this.track.revision}:time:${this.selectedDriver}`;}
    focusDriving(){if(this.input.enabled&&!this.paused)this.canvas.focus({preventScroll:true});}
    clearControls(){this.input.reset();this.lookBack=false;document.querySelectorAll("[data-kart-control].pressed").forEach(button=>button.classList.remove("pressed"));}
    recoverPlayer(){if(this.input.enabled&&this.race.state==="racing"){this.race.player.recover(this.track);this.showToast("Tilbage på banen");this.focusDriving();}}
    handleCommands(){
      const commands=this.input.readCommands();
      if(commands.pause){
        if(["racing","countdown"].includes(this.race.state))this.togglePause();
        else if(this.race.state==="ready")this.$("kart-start").click();
        else if(this.race.state==="finished")this.$(this.cup&&this.cup.round<TRACKS.length-1?"kart-next":"kart-retry").click();
      }
      if(commands.recover)this.recoverPlayer();
    }
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
      this.$("kart-sound").addEventListener("click",()=>{this.audio.enabled=!this.audio.enabled;this.audio.unlock();this.syncMenu();this.persist();this.focusDriving();});
      this.$("kart-fullscreen").addEventListener("click",async()=>{
        try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
        catch{this.showToast("Fuldskærm understøttes ikke i denne browser.");}
        finally{this.focusDriving();}
      });
      window.addEventListener("keydown",e=>{
        if(e.code==="Escape"&&!e.repeat){e.preventDefault();this.togglePause();}
        if(e.code==="Tab"&&(this.paused||this.race.state==="finished")){
          const panel=this.$(this.paused?"kart-pause":"kart-result");
          const buttons=[...panel.querySelectorAll("button")].filter(b=>!b.hidden&&!b.disabled);
          const first=buttons[0],last=buttons.at(-1);
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
        }
        if(e.code==="KeyR"&&!e.repeat)this.recoverPlayer();
      });
      const pause=()=>{if(["countdown","racing"].includes(this.race.state))this.togglePause(true);this.clearControls();};
      window.addEventListener("blur",pause);
      document.addEventListener("visibilitychange",()=>{if(document.hidden)pause();});
      document.querySelectorAll("[data-kart-control]").forEach(b=>{
        b.addEventListener("pointerdown",e=>{e.preventDefault();if(!this.input.enabled)return;b.setPointerCapture(e.pointerId);this.input.setControl(b.dataset.kartControl,true,e.pointerId);b.classList.add("pressed");});
        const release=e=>{this.input.setControl(b.dataset.kartControl,false,e.pointerId);b.classList.remove("pressed");};
        b.addEventListener("pointerup",release);b.addEventListener("pointercancel",release);b.addEventListener("lostpointercapture",release);
      });
      this.$("kart-item").addEventListener("click",()=>{if(this.input.enabled){this.input.itemPressed=true;this.canvas.focus({preventScroll:true});}});
    }
    startRace(){
      this.audio.unlock();
      this.track=this.cup?TRACKS[this.cup.round]:TRACKS.find(t=>t.id===this.selectedTrackId);
      const bestLap=this.save.records[this.recordKey()]?.lap;
      this.race=new Race(this.track,DRIVERS,{mode:this.mode,difficulty:this.difficulty,assist:this.assist,autoGas:this.autoGas,bestLap:Number.isFinite(bestLap)&&bestLap>0?bestLap:undefined,ghost:this.save.ghosts?.[this.ghostKey()]});
      this.race.start(this.selectedDriver);this.paused=false;this.resultSaved=false;this.lookBack=false;this.accumulator=0;this.lastCountdown=4;
      this.clearControls();this.input.enabled=true;this.$("kart-menu").hidden=true;this.$("kart-result").hidden=true;this.$("kart-pause").hidden=true;
      document.body.classList.add("kart-racing");document.body.classList.remove("kart-paused");
      this.$("race-label").textContent=this.cup?`GRAND PRIX · ${this.cup.round+1}/${TRACKS.length} · ${this.track.name}`:this.track.name;
      this.$("kart-pause-button").textContent="Pause";this.$("kart-pause-button").disabled=false;
      this.$("kart-touch-gas").hidden=this.autoGas;
      this.canvas.focus({preventScroll:true});this.updateUI(performance.now());this.showToast(this.autoGas?"Autogas er til · Du styrer og drifter":"Giv gas ved 1 for startturbo");
    }
    showMenu(){
      this.paused=false;this.cup=null;this.clearControls();this.input.enabled=false;
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
      this.clearControls();this.input.enabled=!this.paused;this.accumulator=0;
      this.$("kart-pause").hidden=!this.paused;document.body.classList.toggle("kart-paused",this.paused);
      this.$("kart-pause-button").textContent=this.paused?"Fortsæt":"Pause";
      if(this.paused)this.$("kart-resume").focus({preventScroll:true});else{this.audio.unlock();this.canvas.focus({preventScroll:true});}
    }
    showResult(){
      if(this.resultSaved)return;
      this.resultSaved=true;this.input.enabled=false;this.clearControls();
      const result=this.race.result,key=this.recordKey(),old=this.save.records[key];
      const record=!Number.isFinite(old?.time)||old.time<=0||result.time<old.time;
      this.save.records[key]={time:Math.min(Number.isFinite(old?.time)&&old.time>0?old.time:Infinity,result.time),lap:Math.min(Number.isFinite(old?.lap)&&old.lap>0?old.lap:Infinity,result.bestLap)};
      const ghost=this.race.ghost?.complete(result.time,this.race.player.recoveries);
      if(ghost){
        this.save.ghosts||={};this.save.ghosts[this.ghostKey()]=ghost;
        const keys=Object.keys(this.save.ghosts).sort((a,b)=>this.save.ghosts[b].savedAt-this.save.ghosts[a].savedAt);
        keys.slice(4).forEach(k=>delete this.save.ghosts[k]);
      }
      this.persist();
      if(this.cup)this.race.lastRankings.forEach((k,i)=>this.cup.points[k.driver.id]+=CUP_POINTS[i]);
      const finishingRank=id=>this.race.karts.find(k=>k.driver.id===id)?.rank||8;
      const cupDone=this.cup?.round===TRACKS.length-1,standings=this.cup?[...DRIVERS].sort((a,b)=>this.cup.points[b.id]-this.cup.points[a.id]||finishingRank(a.id)-finishingRank(b.id)):null;
      const cupRank=standings?standings.findIndex(d=>d.id===this.selectedDriver)+1:0;
      this.$("result-kicker").textContent=cupDone?"GRAND PRIX · SAMLET RESULTAT":record?"NY PERSONLIG REKORD":"MÅLFLAG";
      this.$("kart-result-title").textContent=cupDone?(cupRank===1?"Pokalen er din!":`Nr. ${cupRank} i Grand Prix`):this.mode==="time"?"Godt kørt!":result.position===1?"Sejren er din!":`Du blev nr. ${result.position}`;
      this.$("result-medal").textContent=cupDone?String(cupRank):String(result.position);
      this.$("kart-result-copy").textContent=`${this.track.name} · ${this.race.player.driver.name}`;
      this.$("result-time").textContent=formatTime(result.time);this.$("result-lap").textContent=formatTime(result.bestLap);
      this.$("result-laps").innerHTML=this.race.player.lapTimes.map((time,i)=>`<li${time===result.bestLap?' class="best-lap"':""}><span>Omgang ${i+1}</span><b>${formatTime(time)}</b>${time===result.bestLap?"<small>BEDST</small>":""}</li>`).join("");
      const rows=this.cup?standings.map((d,i)=>({driver:d,rank:i+1,value:`${this.cup.points[d.id]} point`})):this.race.lastRankings.map(k=>({driver:k.driver,rank:k.rank,value:k.finished?formatTime(k.finishTime):"På banen"}));
      this.$("result-standings").innerHTML=rows.map(r=>`<li class="${r.driver.id===this.selectedDriver?"is-player":""}"><span>${r.rank.toString().padStart(2,"0")}</span><i style="--driver:${r.driver.color}"></i><strong>${r.driver.name}${r.driver.id===this.selectedDriver?" · dig":""}</strong><b>${r.value}</b></li>`).join("");
      this.$("kart-next").hidden=!this.cup||cupDone;this.$("kart-retry").hidden=Boolean(this.cup&&!cupDone);
      this.$("kart-retry").textContent=cupDone?"Kør Grand Prix igen":"Kør igen";
      this.$("kart-result").hidden=false;this.$(this.cup&&!cupDone?"kart-next":"kart-retry").focus({preventScroll:true});
      this.audio.tone(523,.18);setTimeout(()=>this.audio.tone(659,.18),160);setTimeout(()=>this.audio.tone(784,.4),320);
      if(this.mode!=="time")try{
        const submission=window.WutborgHighscores?.submit({gameKey:"wutborg-kart",gameTitle:"Wutborg Kart",playerName:this.race.player.driver.name,score:result.score,outcome:result.position===1?"won":"completed",details:{version:this.track.revision,track:this.track.id,difficulty:this.difficulty,position:result.position,seconds:Math.round(result.time*100)/100}});
        submission?.catch(()=>{});
      }catch{/* Local results work offline. */}
    }
    update(dt){
      if(this.paused)return;
      const player=this.race.player,coins=player?.coins||0,boosts=player?.boosts||0,spin=player?.spinTimer||0,state=this.race.state;
      const controls=this.input.enabled?this.input.read(this.autoGas):EMPTY;this.lookBack=controls.lookBack;
      this.race.update(dt,controls);
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
      this.$("position-total").parentElement.classList.toggle("time-trial",this.mode==="time");
      this.$("kart-lap").textContent=`${Math.min(3,p.lap+1)} / 3`;this.$("kart-time").textContent=formatTime(this.race.elapsed);
      this.$("kart-speed").textContent=String(Math.round(Math.abs(p.speed)*.52));this.$("kart-coins").textContent=String(p.coins).padStart(2,"0");
      this.$("speed-ring").style.setProperty("--speed",`${clamp(Math.abs(p.speed)/500*260,0,260)}deg`);
      this.$("kart-lap-time").textContent=formatTime(this.race.elapsed-p.lapStarted);this.$("kart-wrong-way").hidden=p.wrongWay<.7;
      this.$("kart-gear").textContent=p.gear<0?"R":p.gear===0?"N":String(p.gear);
      this.$("rpm-fill").style.width=`${clamp((p.rpm-1200)/6600,0,1)*100}%`;
      this.$("rpm-meter").classList.toggle("redline",p.rpm>7100);
      const best=Math.min(...p.lapTimes,Number.isFinite(this.race.options.bestLap)?this.race.options.bestLap:Infinity);
      this.$("kart-best-lap").textContent=Number.isFinite(best)?formatTime(best):"—";
      const feedback=this.race.lapFeedback,banner=this.$("lap-feedback");
      banner.hidden=!feedback||this.race.elapsed-feedback.at>5;
      if(feedback){
        this.$("lap-feedback-title").textContent=feedback.isBest?"BEDSTE OMGANG":`OMGANG ${feedback.lap}`;
        this.$("lap-feedback-time").textContent=formatTime(feedback.time);
        const delta=feedback.delta;
        this.$("lap-feedback-delta").textContent=delta===null?"Din første omgang":`${delta>0?"+":"−"}${Math.abs(delta).toFixed(2)} s mod bedste`;
        banner.dataset.faster=String(feedback.isBest);
      }
      this.$("draft-meter").hidden=p.slipstream<.02;
      this.$("draft-fill").style.width=`${p.slipstream*100}%`;
      this.$("draft-label").textContent=p.slipstream>.95?"SLIPSTRØM · OVERHAL!":"SLIPSTRØM";
      const ahead=this.race.lastRankings[p.rank-2];
      this.$("rival-gap").hidden=this.mode==="time";
      this.$("ghost-status").hidden=this.mode!=="time";
      const savedGhost=this.race.ghost?.saved;
      this.$("ghost-name").textContent=savedGhost?`DIN GHOST · ${formatTime(savedGhost.time)}`:"DIN FØRSTE GHOST";
      const reference=this.race.ghost?.timeAtProgress(p.progress),ghostDelta=reference===null||reference===undefined?null:this.race.elapsed-reference;
      this.$("ghost-delta").textContent=ghostDelta===null?"Kør tre omgange uden at bruge Tilbage":Math.abs(ghostDelta)<.005?"På niveau med din ghost":`${ghostDelta>0?"+":"−"}${Math.abs(ghostDelta).toFixed(2)} s · ${ghostDelta>0?"bagud":"foran"}`;
      this.$("ghost-status").dataset.faster=String(ghostDelta!==null&&ghostDelta<=0);
      this.$("rival-name").textContent=ahead?`${ahead.rank} · ${ahead.driver.name}`:"Du fører løbet";
      this.$("rival-distance").textContent=ahead?(ahead.finished?"Har krydset målet":`≈ ${Math.max(0,(ahead.progress-p.progress)/Math.max(100,p.speed,ahead.speed)).toFixed(1)} s foran`):"Hold din linje";
      this.drawRadar();
      const roulette=p.itemRoulette>0,item=roulette?Object.values(ITEM_TYPES)[Math.floor(now/85)%6]:ITEM_TYPES[p.item];
      this.$("kart-item").hidden=this.mode==="time";document.querySelector('[data-kart-control="item"]').hidden=this.mode==="time";
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
    drawRadar(){
      const canvas=this.$("kart-radar"),ctx=canvas.getContext("2d"),near=this.race.proximity();
      this.$("proximity-radar").hidden=this.mode==="time";
      ctx.clearRect(0,0,90,110);ctx.fillStyle="#ffffff0d";ctx.fillRect(24,0,42,110);
      ctx.setLineDash([3,5]);ctx.strokeStyle="#ffffff35";ctx.beginPath();ctx.moveTo(45,0);ctx.lineTo(45,110);ctx.stroke();ctx.setLineDash([]);
      for(const o of near){ctx.fillStyle=o.kart.driver.color;ctx.fillRect(45+o.lateral*.24-4,65-o.forward*.24-6,8,12);}
      ctx.fillStyle="#efffce";ctx.fillRect(40,59,10,14);ctx.strokeStyle="#fff";ctx.strokeRect(40,59,10,14);
      for(const side of [-1,1])this.$(side<0?"proximity-left":"proximity-right").hidden=!near.some(o=>Math.abs(o.forward)<70&&o.lateral*side>15&&Math.abs(o.lateral)<100);
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
      this.handleCommands();
      const dt=Math.min(.1,Math.max(0,(timestamp-(this.lastTime||timestamp))/1000));this.lastTime=timestamp;
      if(!this.paused){this.accumulator=Math.min(this.accumulator+dt,.1);while(this.accumulator>=STEP){this.update(STEP);this.accumulator-=STEP;}}
      this.audio.update(this.race.player,!this.paused&&this.race.state==="racing");
      this.renderer.draw(this.race,dt,{paused:this.paused,lookBack:Boolean(this.lookBack&&!this.paused&&this.race.state==="racing"),alpha:this.paused?1:this.accumulator/STEP,driver:DRIVERS.find(d=>d.id===this.selectedDriver)});
      if(timestamp-this.lastUI>65){this.updateUI(timestamp);this.lastUI=timestamp;}
      if(this.toastUntil&&timestamp>this.toastUntil){this.$("kart-toast").classList.remove("visible");this.toastUntil=0;}
      requestAnimationFrame(t=>this.loop(t));
    }
  }
  window.WutborgKart={data,formatTime,testHooks:{Kart,Race,RaceAI,RaceGhost,InputManager,AudioManager,KartGame,readSave,EMPTY}};
  if(typeof document!=="undefined")window.addEventListener("DOMContentLoaded",async()=>{
    let canvas=document.getElementById("kart-canvas");if(!canvas)return;
    let renderer;
    try{
      const module=await import("./kart-racer-3d.js?v=20261007-ghost");
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
