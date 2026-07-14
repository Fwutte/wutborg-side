(() => {
  "use strict";

  const data = window.WutborgBattleData;
  if (!data) return;
  const { LEVELS, UNIT_TYPES, resolveChoice } = data;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const STORAGE_KEY = "wutborg.borgstorm.progress.v2";

  class BattleRun {
    constructor(level = LEVELS[0], upgrades = {}) {
      this.load(level, upgrades);
    }

    load(level, upgrades = {}) {
      this.level = level;
      this.upgrades = { reinforcement: 0, armor: 0, banner: 0, ...upgrades };
      this.reset();
    }

    reset() {
      this.army = this.level.startingArmy + this.upgrades.reinforcement * 3;
      this.units = { soldier: this.army, archer: 0, shield: 0, giant: 0 };
      this.gateIndex = 0;
      this.state = "ready";
      this.selectedSide = null;
      this.marchTime = 0;
      this.elapsed = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.scoreValue = 0;
      this.lastOutcome = null;
    }

    start() {
      this.reset();
      this.state = "choosing";
      return this.currentGate;
    }

    get currentGate() { return this.level.gates[this.gateIndex] || null; }

    choose(side) {
      if (this.state !== "choosing" || ![0, 1].includes(side)) return false;
      this.selectedSide = side;
      this.state = "marching";
      this.marchTime = 0;
      return true;
    }

    update(dt) {
      if (["choosing", "marching"].includes(this.state)) this.elapsed += dt;
      if (this.state !== "marching") return null;
      this.marchTime += dt;
      if (this.marchTime < 0.72) return null;
      return this.resolve();
    }

    resolve() {
      if (this.state !== "marching" || this.selectedSide === null) return null;
      const choice = this.currentGate.choices[this.selectedSide];
      const outcome = resolveChoice(this.army, choice, {
        armor: this.upgrades.armor,
        archers: this.units.archer,
        shields: this.units.shield,
        giants: this.units.giant,
      });
      this.army = outcome.army;
      if (outcome.recruited) this.units[outcome.recruited] += choice.value;
      const specialUnits = this.units.archer + this.units.shield + this.units.giant;
      this.units.soldier = Math.max(0, this.army - Math.min(this.army, specialUnits));
      this.combo = choice.optimal ? this.combo + 1 : 0;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const comboFactor = 1 + this.combo * (0.1 + this.upgrades.banner * 0.025);
      this.scoreValue += Math.round((100 + this.army * 4) * comboFactor);
      this.lastOutcome = { ...outcome, choice, gateIndex: this.gateIndex, side: this.selectedSide, combo: this.combo };
      this.selectedSide = null;

      if (!outcome.survived) {
        this.state = "lost";
        return { type: "lost", ...this.lastOutcome };
      }
      this.gateIndex += 1;
      if (this.gateIndex >= this.level.gates.length) {
        this.state = "won";
        this.scoreValue += this.army * 100 + Math.max(0, 240 - Math.round(this.elapsed)) * 10;
        return { type: "won", ...this.lastOutcome, stars: this.stars };
      }
      this.state = "choosing";
      return { type: "continue", ...this.lastOutcome };
    }

    get stars() {
      if (this.state !== "won") return 0;
      const ratio = this.army / Math.max(1, this.level.parArmy);
      return ratio >= 0.8 ? 3 : ratio >= 0.45 ? 2 : 1;
    }

    get score() { return Math.max(0, Math.round(this.scoreValue)); }
  }

  class AudioManager {
    constructor() { this.enabled = true; this.context = null; this.musicClock = 0; this.noteIndex = 0; }
    getContext() {
      if (!this.enabled || typeof AudioContext === "undefined") return null;
      this.context ||= new AudioContext();
      if (this.context.state === "suspended") this.context.resume();
      return this.context;
    }
    tone(frequency, duration = 0.09, type = "triangle", volume = 0.035) {
      const context = this.getContext();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + duration);
    }
    update(dt, active) {
      if (!active || !this.enabled) return;
      this.musicClock += dt;
      if (this.musicClock < 1.35) return;
      this.musicClock = 0;
      const notes = [174, 220, 261, 220, 196, 247, 293, 247];
      this.tone(notes[this.noteIndex++ % notes.length], 0.22, "sine", 0.012);
    }
    toggle() { this.enabled = !this.enabled; if (!this.enabled && this.context) this.context.suspend(); return this.enabled; }
  }

  class ArenaRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.time = 0;
      this.particles = [];
      this.crowd = Array.from({ length: 170 }, (_, index) => ({ x: (index * 47) % 960, y: 42 + ((index * 29) % 140), size: 2 + (index % 3), shade: index % 4 }));
    }

    emit(outcome) {
      const positive = outcome.delta >= 0;
      const x = outcome.side === 0 ? 300 : 660;
      const colors = positive ? ["#65e0a8", "#ffe16a", "#fff"] : ["#ff6b52", "#f7a65b", "#fff0c4"];
      for (let index = 0; index < 28; index += 1) {
        this.particles.push({ x, y: 340, vx: (Math.random() - 0.5) * 230, vy: -70 - Math.random() * 180, life: 0.7 + Math.random() * 0.5, color: colors[index % colors.length], size: 3 + Math.random() * 6 });
      }
    }

    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      this.ctx.setTransform(width / 960, 0, 0, height / 600, 0, 0);
    }

    draw(run, dt) {
      this.time += dt;
      this.resize();
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 960, 600);
      this.drawArena(ctx, run.level.region, run.gateIndex);
      this.drawRoad(ctx, run.level.region, run.gateIndex);
      this.drawGate(ctx, run, 0);
      this.drawGate(ctx, run, 1);
      this.drawArmy(ctx, run);
      this.drawParticles(ctx, dt);
      if (run.level.boss && run.gateIndex === run.level.gates.length - 1) this.drawBossBanner(ctx);
    }

    drawArena(ctx, theme, gateIndex) {
      const sky = ctx.createLinearGradient(0, 0, 0, 600);
      sky.addColorStop(0, theme.sky); sky.addColorStop(0.42, theme.sky); sky.addColorStop(0.43, theme.arena); sky.addColorStop(1, "#2f3038");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 600);
      ctx.fillStyle = theme.arena; ctx.fillRect(0, 30, 960, 135);
      this.crowd.forEach((person) => {
        const color = [theme.accent, "#f3c66d", "#a83b54", "#eef5e8"][person.shade];
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(person.x, person.y + Math.sin(this.time * 3 + person.x + gateIndex) * 1.5, person.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = "rgba(31,28,37,.58)"; ctx.fillRect(0, 162, 960, 13);
      for (let side = 0; side < 2; side += 1) {
        const x = side ? 815 : 145;
        ctx.fillStyle = "rgba(25,39,54,.32)"; ctx.beginPath(); ctx.moveTo(x - 55, 176); ctx.lineTo(x + 55, 176); ctx.lineTo(x + 90, 600); ctx.lineTo(x - 90, 600); ctx.closePath(); ctx.fill();
      }
    }

    drawRoad(ctx, theme, gateIndex) {
      ctx.beginPath(); ctx.moveTo(304,600); ctx.lineTo(656,600); ctx.lineTo(572,176); ctx.lineTo(388,176); ctx.closePath(); ctx.fillStyle=theme.road; ctx.fill();
      ctx.strokeStyle="rgba(43,49,53,.5)"; ctx.lineWidth=4;
      const shift = (gateIndex * 11) % 45;
      for (let y=215+shift;y<610;y+=45) { const scale=(y-175)/425; ctx.beginPath(); ctx.moveTo(388-84*scale,y); ctx.lineTo(572+84*scale,y); ctx.stroke(); }
      ctx.fillStyle="#50555b"; ctx.beginPath(); ctx.moveTo(300,600);ctx.lineTo(328,600);ctx.lineTo(408,176);ctx.lineTo(382,176);ctx.closePath();ctx.fill(); ctx.beginPath();ctx.moveTo(632,600);ctx.lineTo(660,600);ctx.lineTo(578,176);ctx.lineTo(552,176);ctx.closePath();ctx.fill();
    }

    drawGate(ctx, run, side) {
      const gate = run.currentGate; if (!gate) return;
      const choice = gate.choices[side];
      const selected = run.selectedSide === side;
      const x = side === 0 ? 286 : 674; const y = 214; const width = 202; const height = 238;
      const palettes = { tower:["#dc8148","#753c3f"], bonus:[choice.operation === "add" || choice.operation === "multiply" ? "#48a370" : "#b34a58","#245445"], recruit:[choice.unit ? UNIT_TYPES[choice.unit].color : "#4f91c4","#244c67"], hazard:["#66616a","#352f3c"] };
      const palette = palettes[choice.type];
      ctx.save();
      if (selected) { const pulse=1+Math.sin(this.time*14)*.035; ctx.translate(x,y);ctx.scale(pulse,pulse);ctx.translate(-x,-y); }
      ctx.fillStyle=palette[0];ctx.strokeStyle=selected?"#fff3a2":palette[1];ctx.lineWidth=selected?9:5;this.roundRect(ctx,x-width/2,y,width,height,20);ctx.fill();ctx.stroke();
      if (choice.type === "tower") {
        ctx.fillStyle="rgba(74,45,44,.42)";for(let row=0;row<5;row+=1)ctx.fillRect(x-76,y+28+row*32,152,4);
        ctx.fillStyle=choice.boss?"#f6cf56":"#fbead6";ctx.fillRect(x-6,y+13,12,42);
      } else if (choice.type === "hazard") {
        ctx.fillStyle="#d8c5ac";for(let index=0;index<6;index+=1){ctx.beginPath();ctx.moveTo(x-72+index*28,y+72);ctx.lineTo(x-60+index*28,y+27);ctx.lineTo(x-48+index*28,y+72);ctx.fill();}
      } else {
        ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=8;ctx.beginPath();ctx.arc(x,y+62,43,Math.PI,0);ctx.stroke();
      }
      ctx.fillStyle="rgba(31,36,49,.76)";this.roundRect(ctx,x-67,y+91,134,82,17);ctx.fill();
      ctx.fillStyle="#fff8e2";ctx.font="900 53px Inter,system-ui,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(choice.label,x,y+133);
      ctx.font="800 14px Inter,system-ui,sans-serif";ctx.fillStyle="rgba(255,250,232,.9)";ctx.fillText(choice.hint.toUpperCase(),x,y+199);ctx.restore();
    }

    drawArmy(ctx, run) {
      const visible=Math.min(40,Math.max(4,Math.ceil(run.army/2))); const lane=run.selectedSide===null?0:run.selectedSide===0?-1:1; const progress=run.state==="marching"?clamp(run.marchTime/.72,0,1):0; const baseY=510-progress*190; const baseX=480+lane*progress*150;
      const specials=[]; Object.entries(run.units).forEach(([type,count])=>{if(type!=="soldier")for(let index=0;index<Math.min(8,count);index+=1)specials.push(type);});
      for(let index=0;index<visible;index+=1){const type=specials[index%specials.length]||"soldier";const column=index%7;const row=Math.floor(index/7);const x=baseX+(column-3)*15+Math.sin(this.time*6+index)*1.7;const y=baseY+row*14+Math.cos(this.time*6+index)*1.2;ctx.fillStyle=UNIT_TYPES[type].color;ctx.beginPath();ctx.arc(x,y,type==="giant"?9:7,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#173a78";ctx.lineWidth=2;ctx.stroke();ctx.fillStyle="#173a78";ctx.fillRect(x-2,y-13,4,8);}
      ctx.fillStyle="#163e73";this.roundRect(ctx,baseX-39,baseY+76,78,31,15);ctx.fill();ctx.fillStyle="#fff";ctx.font="900 18px Inter,system-ui,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(run.army),baseX,baseY+92);
    }

    drawParticles(ctx, dt) {
      this.particles = this.particles.filter((particle) => {
        particle.life -= dt; if (particle.life <= 0) return false;
        particle.vy += 300 * dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt;
        ctx.globalAlpha = clamp(particle.life,0,1); ctx.fillStyle=particle.color;ctx.beginPath();ctx.arc(particle.x,particle.y,particle.size,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;return true;
      });
    }

    drawBossBanner(ctx) { ctx.fillStyle="rgba(112,27,38,.86)";this.roundRect(ctx,362,86,236,47,18);ctx.fill();ctx.fillStyle="#ffe176";ctx.font="950 18px Inter,system-ui,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("⚔ BOSS-SLAG ⚔",480,110); }
    roundRect(ctx,x,y,width,height,radius){ctx.beginPath();ctx.roundRect(x,y,width,height,radius);}
  }

  class BattleGame {
    constructor() {
      this.canvas=document.getElementById("battle-canvas");this.audio=new AudioManager();this.progress=this.loadProgress();this.selectedLevel=Math.min(this.progress.unlockedLevel,LEVELS.length)-1;this.run=new BattleRun(LEVELS[this.selectedLevel],this.progress.upgrades);this.lastFrame=performance.now();this.savedResult=false;this.paused=false;this.renderer={draw(){},emit(){},reset(){}};this.is3D=false;this.canvas.dataset.battleRenderer="loading";
      this.els={menu:document.getElementById("battle-menu"),result:document.getElementById("battle-result"),pause:document.getElementById("battle-pause"),start:document.getElementById("battle-start"),retry:document.getElementById("battle-retry"),resume:document.getElementById("battle-resume"),menuButton:document.getElementById("battle-menu-button"),resultMenu:document.getElementById("battle-result-menu"),left:document.getElementById("battle-left"),right:document.getElementById("battle-right"),stage:document.getElementById("battle-stage"),level:document.getElementById("battle-level"),army:document.getElementById("battle-army"),combo:document.getElementById("battle-combo"),message:document.getElementById("battle-message"),best:document.getElementById("battle-best"),resultTitle:document.getElementById("battle-result-title"),resultCopy:document.getElementById("battle-result-copy"),resultStats:document.getElementById("battle-result-stats"),pauseButton:document.getElementById("battle-pause-button"),sound:document.getElementById("battle-sound"),levelGrid:document.getElementById("battle-level-grid"),campaignTitle:document.getElementById("battle-campaign-title"),campaignCopy:document.getElementById("battle-campaign-copy"),campaignProgress:document.getElementById("battle-campaign-progress"),coins:document.getElementById("battle-coins"),unitRoster:document.getElementById("battle-unit-roster")};
      this.bind();this.populateLevels();this.updateUpgradeUI();this.refresh();this.initializeRenderer();requestAnimationFrame(time=>this.loop(time));
    }

    async initializeRenderer(){try{const{BattleScene3D}=await import("./battle-gates-3d.js?v=20260714-borg6");this.renderer=new BattleScene3D(this.canvas,side=>this.choose(side));this.is3D=true;this.canvas.dataset.battleRenderer="3d";delete this.canvas.dataset.battle3dError;}catch(error){console.warn("Borgstorm 3D kunne ikke starte; bruger 2D-fallback.",error);this.renderer=new ArenaRenderer(this.canvas);this.is3D=false;this.canvas.dataset.battleRenderer="2d";this.canvas.dataset.battle3dError=error?.message||"Ukendt WebGL-fejl";}}

    loadProgress(){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");return{unlockedLevel:clamp(Number(saved.unlockedLevel)||1,1,LEVELS.length),stars:saved.stars&&typeof saved.stars==="object"?saved.stars:{},coins:Math.max(0,Number(saved.coins)||0),upgrades:{reinforcement:clamp(Number(saved.upgrades?.reinforcement)||0,0,5),armor:clamp(Number(saved.upgrades?.armor)||0,0,5),banner:clamp(Number(saved.upgrades?.banner)||0,0,5)}};}catch{return{unlockedLevel:1,stars:{},coins:0,upgrades:{reinforcement:0,armor:0,banner:0}};}}
    saveProgress(){localStorage.setItem(STORAGE_KEY,JSON.stringify(this.progress));}

    bind(){this.els.start.addEventListener("click",()=>this.start());this.els.retry.addEventListener("click",()=>this.start());this.els.menuButton.addEventListener("click",()=>this.showMenu());this.els.resultMenu.addEventListener("click",()=>this.showMenu());this.els.resume.addEventListener("click",()=>this.togglePause(false));this.els.pauseButton.addEventListener("click",()=>this.togglePause());this.els.sound.addEventListener("click",()=>{const enabled=this.audio.toggle();this.els.sound.textContent=`Lyd: ${enabled?"til":"fra"}`;});this.els.left.addEventListener("click",()=>this.choose(0));this.els.right.addEventListener("click",()=>this.choose(1));document.querySelectorAll("[data-battle-upgrade]").forEach(button=>button.addEventListener("click",()=>this.purchaseUpgrade(button.dataset.battleUpgrade)));window.addEventListener("keydown",event=>{if(event.code==="ArrowLeft"||event.code==="KeyA"){event.preventDefault();if(this.is3D)this.renderer.setSteering(-1);else this.choose(0);}if(event.code==="ArrowRight"||event.code==="KeyD"){event.preventDefault();if(this.is3D)this.renderer.setSteering(1);else this.choose(1);}if(event.code==="Escape")this.togglePause();});window.addEventListener("keyup",event=>{if(this.is3D&&["ArrowLeft","KeyA","ArrowRight","KeyD"].includes(event.code))this.renderer.setSteering(0);});document.addEventListener("visibilitychange",()=>{if(document.hidden&&["choosing","marching"].includes(this.run.state))this.togglePause(true);});}

    populateLevels(){this.els.levelGrid.replaceChildren();LEVELS.forEach((level,index)=>{const button=document.createElement("button");const stars=this.progress.stars[level.id]||0;const locked=level.id>this.progress.unlockedLevel;button.type="button";button.className=`campaign-level${level.boss?" boss":""}${index===this.selectedLevel?" selected":""}`;button.disabled=locked;button.setAttribute("aria-label",locked?`Bane ${level.id} låst`:`Bane ${level.id}: ${level.name}, ${stars} stjerner`);button.innerHTML=`<strong>${level.boss?"♛ ":""}${level.id}</strong><span>${locked?"Låst":level.name}</span><small>${locked?"🔒":"★".repeat(stars)+"☆".repeat(3-stars)}</small>`;button.addEventListener("click",()=>this.selectLevel(index));this.els.levelGrid.append(button);});this.updateCampaignSummary();}
    selectLevel(index){if(LEVELS[index].id>this.progress.unlockedLevel)return;this.selectedLevel=index;this.run.load(LEVELS[index],this.progress.upgrades);this.renderer.reset?.();this.populateLevels();this.refresh();}
    updateCampaignSummary(){const level=LEVELS[this.selectedLevel];const totalStars=Object.values(this.progress.stars).reduce((sum,value)=>sum+Number(value||0),0);this.els.campaignTitle.textContent=`Bane ${level.id}: ${level.name}`;this.els.campaignCopy.textContent=`${level.region.name} · ${level.gates.length} porte${level.boss?" · bosskamp":""} · start med ${level.startingArmy+this.progress.upgrades.reinforcement*3} soldater`;this.els.campaignProgress.textContent=`${totalStars}/60 stjerner · ${this.progress.unlockedLevel}/20 baner åbne`;this.els.coins.textContent=`${this.progress.coins} mønter`;this.els.start.textContent=level.boss?"Start bosskampen":"Start banen";}

    purchaseUpgrade(type){const rank=this.progress.upgrades[type];const cost=80+rank*60;if(rank>=5){this.setMessage("Denne opgradering er på maksimum.");return;}if(this.progress.coins<cost){this.setMessage(`Du mangler ${cost-this.progress.coins} mønter.`);return;}this.progress.coins-=cost;this.progress.upgrades[type]+=1;this.saveProgress();this.run.load(LEVELS[this.selectedLevel],this.progress.upgrades);this.audio.tone(660,.14,"triangle",.04);this.updateUpgradeUI();this.populateLevels();this.refresh();}
    updateUpgradeUI(){document.querySelectorAll("[data-battle-upgrade]").forEach(button=>{const type=button.dataset.battleUpgrade;const rank=this.progress.upgrades[type];const cost=80+rank*60;button.querySelector("strong").textContent=`Niveau ${rank}/5`;button.querySelector("small").textContent=rank>=5?"Maksimum":`${cost} mønter`;button.disabled=rank>=5;});}

    start(){this.run.load(LEVELS[this.selectedLevel],this.progress.upgrades);this.renderer.reset?.();this.run.start();this.savedResult=false;this.paused=false;this.els.menu.hidden=true;this.els.result.hidden=true;this.els.pause.hidden=true;this.audio.tone(392,.13,"square",.035);this.setMessage(this.is3D?"Træk hæren mod en port, eller styr med piletasterne.":"Vælg en port – byg en kombokæde med gode valg.");this.refresh();}
    showMenu(){this.run.load(LEVELS[this.selectedLevel],this.progress.upgrades);this.renderer.reset?.();this.paused=false;this.els.menu.hidden=false;this.els.result.hidden=true;this.els.pause.hidden=true;this.populateLevels();this.updateUpgradeUI();this.refresh();}
    choose(side){if(this.paused||!this.run.choose(side))return;this.audio.tone(side===0?294:330,.08,"triangle",.03);this.setMessage(side===0?"Hæren marcherer mod venstre...":"Hæren marcherer mod højre...");this.refresh();}
    togglePause(forcePause){if(!["choosing","marching"].includes(this.run.state))return;this.paused=forcePause===true?true:!this.paused;this.els.pause.hidden=!this.paused;this.els.pauseButton.textContent=this.paused?"Fortsæt":"Pause";}
    resolve(outcome){if(!outcome)return;this.renderer.emit(outcome);this.setMessage(`${outcome.message}${outcome.combo>1?` · ${outcome.combo}× combo!`:""}`);this.audio.tone(outcome.delta>=0?588:164,.12,outcome.delta>=0?"triangle":"sawtooth",.045);if(outcome.type==="continue")return;this.showResult(outcome.type==="won");}

    async showResult(won){this.els.result.hidden=false;this.els.resultTitle.textContent=won?(this.run.level.boss?"Borgen er besejret!":"Sejr!"):"Hæren blev slået";this.els.resultCopy.textContent=won?`Bane ${this.run.level.id} klaret med ${this.run.army} soldater tilbage.`:`Du nåede port ${this.run.gateIndex+1}. Prøv en anden rute eller opgradér hæren.`;this.els.resultStats.innerHTML=won?`<span><strong>${"★".repeat(this.run.stars)}${"☆".repeat(3-this.run.stars)}</strong><small>Stjerner</small></span><span><strong>${this.run.score.toLocaleString("da-DK")}</strong><small>Point</small></span><span><strong>${this.run.maxCombo}×</strong><small>Bedste combo</small></span>`:`<span><strong>${this.run.army}</strong><small>Soldater</small></span><span><strong>${this.run.gateIndex}/${this.run.level.gates.length}</strong><small>Porte</small></span>`;if(won&&!this.savedResult){this.savedResult=true;const oldStars=this.progress.stars[this.run.level.id]||0;const improvement=Math.max(0,this.run.stars-oldStars);this.progress.stars[this.run.level.id]=Math.max(oldStars,this.run.stars);this.progress.unlockedLevel=Math.max(this.progress.unlockedLevel,Math.min(LEVELS.length,this.run.level.id+1));this.progress.coins+=improvement*60;this.saveProgress();await window.WutborgHighscores?.submit({gameKey:"borgstorm",gameTitle:"Borgstorm",score:this.run.score,outcome:"victory",details:{level:this.run.level.id,soldiers:this.run.army,stars:this.run.stars,combo:this.run.maxCombo}});this.populateLevels();this.updateUpgradeUI();this.audio.tone(784,.35,"triangle",.05);}else if(!won)this.audio.tone(110,.4,"sawtooth",.04);this.refresh();}

    setMessage(message){this.els.message.textContent=message;}
    refresh(){const level=this.run.level;const gateNumber=Math.min(this.run.gateIndex+1,level.gates.length);this.els.stage.textContent=`${gateNumber}/${level.gates.length}`;this.els.level.textContent=`${level.id}/20`;this.els.army.textContent=this.run.army;this.els.combo.textContent=`${this.run.combo}×`;const gate=this.run.currentGate;this.els.left.disabled=this.run.state!=="choosing";this.els.right.disabled=this.run.state!=="choosing";this.els.left.querySelector("strong").textContent=gate?.choices[0].label||"–";this.els.left.querySelector("small").textContent=gate?.choices[0].hint||"Færdig";this.els.right.querySelector("strong").textContent=gate?.choices[1].label||"–";this.els.right.querySelector("small").textContent=gate?.choices[1].hint||"Færdig";this.els.pauseButton.disabled=!["choosing","marching"].includes(this.run.state);const best=window.WutborgHighscores?.best("borgstorm");this.els.best.textContent=best?`Bedste: ${Number(best.score).toLocaleString("da-DK")} point`:"Bedste: ingen endnu";this.els.unitRoster.innerHTML=Object.entries(this.run.units).filter(([,count])=>count>0).map(([type,count])=>`<span style="--unit:${UNIT_TYPES[type].color}">${UNIT_TYPES[type].icon} ${Math.min(count,this.run.army)}</span>`).join("");}
    loop(now){const dt=Math.min(.05,(now-this.lastFrame)/1000);this.lastFrame=now;if(!this.paused)this.resolve(this.run.update(dt));this.audio.update(dt,!this.paused&&["choosing","marching"].includes(this.run.state));this.refresh();this.renderer.draw(this.run,dt);requestAnimationFrame(time=>this.loop(time));}
  }

  window.WutborgBattle={data,BattleRun,ArenaRenderer,AudioManager};
  if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",()=>{if(document.getElementById("battle-canvas"))window.wutborgBattleGame=new BattleGame();});
})();
