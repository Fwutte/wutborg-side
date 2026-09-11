(() => {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (v, n) => ((v % n) + n) % n;
  const normalizeAngle = a => mod(a, TAU);
  const angleDelta = (a, b) => mod(b - a + Math.PI, TAU) - Math.PI;
  const lerp = (a, b, t) => a + (b - a) * t;
  // A uniform cubic B-spline rounds the control polygon without tight offset cusps.
  const spline = (a, b, c, d, t) => ((1-t)**3*a+(3*t**3-6*t*t+4)*b+(-3*t**3+3*t*t+3*t+1)*c+t**3*d)/6;
  // Arc-length samples are shared by physics, AI, rendering and the minimap.
  function makeTrack(config) {
    const raw = [], points = config.points, count = points.length;
    for (let i = 0; i < count * 80; i++) {
      const n = Math.floor(i / 80), t = (i % 80) / 80;
      const p = [-1, 0, 1, 2].map(o => points[mod(n + o, count)]);
      raw.push({ x: spline(...p.map(v => v[0]), t), y: spline(...p.map(v => v[1]), t) });
    }
    raw.push({ ...raw[0] });
    const distances = [0];
    for (let i = 1; i < raw.length; i++) distances.push(distances[i-1] + Math.hypot(raw[i].x-raw[i-1].x, raw[i].y-raw[i-1].y));
    const length = distances.at(-1), samples = [], segments = 1024;
    let cursor = 0;
    for (let i = 0; i < segments; i++) {
      const s = i * length / segments;
      while (distances[cursor+1] < s) cursor++;
      const t = (s-distances[cursor]) / (distances[cursor+1]-distances[cursor]);
      samples.push({ x: lerp(raw[cursor].x, raw[cursor+1].x, t), y: lerp(raw[cursor].y, raw[cursor+1].y, t), s });
    }
    samples.forEach((p,i) => {
      const a=samples[mod(i-1,segments)],b=samples[(i+1)%segments];
      p.heading=Math.atan2(b.y-a.y,b.x-a.x);
    });
    const xs=samples.map(p=>p.x),ys=samples.map(p=>p.y),padding=config.halfWidth+160;
    const bounds={minX:Math.min(...xs)-padding,maxX:Math.max(...xs)+padding,minY:Math.min(...ys)-padding,maxY:Math.max(...ys)+padding};
    const track = { ...config, revision:4, length, samples, bounds, step:length/segments,
      cx:(bounds.minX+bounds.maxX)/2,cy:(bounds.minY+bounds.maxY)/2,width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY };
    // Cosine hills join the start/finish seamlessly and keep every gradient driveable.
    track.elevationAt = function(s) {
      const t=mod(s,length)/length;
      return 12+this.hills.reduce((height,[center,radius,rise])=>{
        const d=Math.abs(mod(t-center+.5,1)-.5)/radius;
        return height+(d<1?rise*(1+Math.cos(d*Math.PI))/2:0);
      },0);
    };
    track.slopeAt = s => (track.elevationAt(s+8)-track.elevationAt(s-8))/16;
    track.at = function(s, offset = 0) {
      const f = mod(s, length)/this.step, i = Math.floor(f), a = samples[i], b = samples[(i+1)%segments];
      const heading = a.heading+angleDelta(a.heading,b.heading)*(f-i);
      return { x: lerp(a.x,b.x,f-i)-Math.sin(heading)*offset, y: lerp(a.y,b.y,f-i)+Math.cos(heading)*offset, heading, s: mod(s,length), elevation:this.elevationAt(s), slope:this.slopeAt(s) };
    };
    track.nearest = function(x, y, hint) {
      let best = null, bestD = Infinity;
      const scan = (center, radius) => {
        for (let j = center-radius; j <= center+radius; j++) {
          const i = mod(j,segments), a = samples[i], b = samples[(i+1)%segments];
          const dx = b.x-a.x, dy = b.y-a.y, t = clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
          const px = a.x+dx*t, py = a.y+dy*t, d = (x-px)**2+(y-py)**2;
          if (d < bestD) {
            bestD = d;
            best = { x:px, y:py, s:mod((i+t)*this.step,length), index:i, heading:Math.atan2(dy,dx), lateral:((y-py)*dx-(x-px)*dy)/Math.hypot(dx,dy), distance:Math.sqrt(d) };
          }
        }
      };
      if (Number.isInteger(hint)) scan(hint,12);
      if (!best || best.distance > this.halfWidth*2) scan(segments/2,segments/2);
      best.elevation=this.elevationAt(best.s);best.slope=this.slopeAt(best.s);
      return best;
    };
    track.isRoad = (x,y) => track.nearest(x,y).distance <= track.halfWidth;
    track.surfaceAt = s => track.theme === "frost" && s / length > .16 && s / length < .72 ? "ice" : "asphalt";
    track.shortcut = config.shortcut || null;
    track.isShortcut = road => Boolean(track.shortcut && road.s / length > track.shortcut[0] && road.s / length < track.shortcut[1] && Math.abs(road.lateral + track.halfWidth + 30) < 24);
    track.ramps = (config.ramps || []).map(t => ({...track.at(t * length), fraction:t}));
    track.obstacles = (config.obstacles || []).map((t,i) => ({s:t*length, phase:i*2, radius:23, kind:track.theme === "frost" ? "snowball" : track.theme === "jungle" ? "log" : "boulder"}));
    track.obstacleAt = (o,time) => track.at(o.s, Math.sin(time * 1.3 + o.phase) * track.halfWidth * .7);
    track.start = track.at(0);
    track.heading = track.start.heading;
    track.itemBoxes = [.09,.23,.38,.54,.69,.85].flatMap((t,i) => [-.55,0,.55].map((lane,n) => ({ ...track.at(t*length,lane*track.halfWidth), id: `box-${i}-${n}` })));
    track.coins = [.04,.17,.30,.44,.60,.76,.91].flatMap((t,i) => [0,1,2,3,4].map(n => ({ ...track.at(t*length+n*48,(i%2?1:-1)*track.halfWidth*.42), id: `coin-${i}-${n}` })));
    track.boostPads = [.14,.32,.48,.64,.80,.94].map((t,i) => track.at(t*length,(i%2?1:-1)*track.halfWidth*.35));
    return track;
  }
  const DRIVERS = [
    { id:"max", name:"Max", color:"#f45140", accent:"#ffdb7c", className:"Allround", maxSpeed:360, acceleration:220, handling:2.5, weight:1 },
    { id:"luna", name:"Luna", color:"#8d76ef", accent:"#e2d8ff", className:"Smidig", maxSpeed:346, acceleration:245, handling:2.8, weight:.85 },
    { id:"freja", name:"Freja", color:"#f080a8", accent:"#fff0d6", className:"Lynstart", maxSpeed:342, acceleration:260, handling:2.65, weight:.8 },
    { id:"otto", name:"Otto", color:"#f0bc41", accent:"#ffedba", className:"Topfart", maxSpeed:383, acceleration:196, handling:2.28, weight:1.3 },
    { id:"nova", name:"Nova", color:"#46c59b", accent:"#d0ffeb", className:"Smidig", maxSpeed:350, acceleration:240, handling:2.75, weight:.85 },
    { id:"bjorn", name:"Bjørn", color:"#5494e6", accent:"#d6ecff", className:"Stærk", maxSpeed:378, acceleration:204, handling:2.3, weight:1.4 },
    { id:"alma", name:"Alma", color:"#f88b43", accent:"#ffe5b8", className:"Allround", maxSpeed:358, acceleration:230, handling:2.55, weight:1 },
    { id:"storm", name:"Storm", color:"#aabacb", accent:"#f3fcff", className:"Topfart", maxSpeed:380, acceleration:198, handling:2.35, weight:1.2 },
  ];
  const ITEM_TYPES = {
    mushroom:{ name:"Turbo", icon:"»", color:"#ffbe54", help:"Et ekstra skud fart" },
    banana:{ name:"Oliespor", icon:"●", color:"#b69cff", help:"Læg en fælde bag dig" },
    shell:{ name:"Puls", icon:"◆", color:"#73e4b0", help:"Skyd lige frem" },
    redShell:{ name:"Raket", icon:"➤", color:"#ff786b", help:"Følger en rival foran dig" },
    star:{ name:"Stjerneskjold", icon:"★", color:"#ffe27a", help:"Fart og beskyttelse i 5 sekunder" },
    lightning:{ name:"Lyn", icon:"ϟ", color:"#8bdfff", help:"Sæt rivalerne ud af spil" },
  };
  const TRACKS = [
    makeTrack({ id:"clover-circuit", name:"Kløversløjfen", short:"Kløver", number:"01", theme:"garden", difficulty:"Let", subtitle:"Stadion · blomsterdal · slotsbakke", halfWidth:118,
      hills:[[.23,.16,150],[.57,.13,105],[.81,.12,190]],bridge:[.78,.84],landmark:.79,
      palette:{ sky:"#b5e2e9", grass:"#77b98b", grassDark:"#458768", road:"#586879", edge:"#f9edcb", accent:"#ff725a", fog:"#b5dcd8" },
      points:[[1300,400],[2100,400],[3000,460],[3700,780],[4060,1390],[3800,1950],[3180,2060],[3170,2650],[3670,3100],[3150,3570],[2340,3550],[1940,2990],[1240,3140],[640,2780],[400,2200],[800,1590],[470,1010],[740,440]] }),
    makeTrack({ id:"sunset-bay", name:"Solskinsbugten", short:"Bugten", number:"02", theme:"coast", difficulty:"Mellem", subtitle:"Havnepromenade · kystbro · fyrtårn", halfWidth:114,
      hills:[[.21,.14,100],[.49,.16,220],[.77,.12,145]],bridge:[.44,.54],landmark:.51,
      palette:{ sky:"#f9d0aa", grass:"#e9c789", grassDark:"#be986c", road:"#776d78", edge:"#fff2d5", accent:"#59cdd1", fog:"#f1ceb5" },
      points:[[1300,400],[2200,400],[3100,450],[4000,850],[4200,1500],[3650,1930],[3050,1630],[2710,2050],[3100,2700],[3830,3010],[3650,3600],[2850,3850],[2000,3620],[1600,2950],[1050,3350],[430,2900],[400,2200],[950,1750],[550,1150],[600,600]] }),
    makeTrack({ id:"midnight-crown", name:"Midnatskronen", short:"Midnat", number:"03", theme:"night", difficulty:"Svær", subtitle:"Neonby · stjernetunnel · himmelbro", halfWidth:112,
      hills:[[.21,.14,210],[.51,.18,320],[.83,.12,180]],bridge:[.46,.55],landmark:.28,tunnel:[.69,.75],
      palette:{ sky:"#141e39", grass:"#2f4260", grassDark:"#223149", road:"#46516d", edge:"#9cefff", accent:"#c98cff", fog:"#233752" },
      points:[[1500,450],[2450,400],[3400,650],[4250,1000],[4100,1740],[3480,1850],[2880,1500],[2450,1940],[3000,2400],[4070,2620],[4200,3370],[3500,3920],[2700,3650],[2240,3050],[1640,3370],[1000,3770],[400,3250],[480,2570],[1100,2260],[1270,1700],[650,1460],[450,900],[750,450]] }),
  ];
  TRACKS.push(
    makeTrack({id:"volcano-run",name:"Vulkanpasset",short:"Vulkan",number:"04",theme:"volcano",difficulty:"Svær",subtitle:"Lavakrater · springramper · rullende klipper",halfWidth:118,
      hills:[[.2,.17,220],[.52,.18,260],[.82,.14,195]],bridge:[.48,.56],landmark:.51,ramps:[.12,.45,.78],obstacles:[.26,.64],shortcut:[.32,.39],
      palette:{sky:"#d88965",grass:"#534147",grassDark:"#342e3c",road:"#494355",edge:"#ffbc69",accent:"#ff7542",fog:"#c08176"},
      points:[[1400,400],[2350,400],[3370,600],[4050,1200],[4050,2000],[3420,2470],[3700,3210],[3010,3740],[2150,3600],[1600,3000],[850,3150],[400,2480],[650,1600],[430,970],[750,450]]}),
    makeTrack({id:"frost-peaks",name:"Frosttinderne",short:"Frost",number:"05",theme:"frost",difficulty:"Mellem",subtitle:"Glat is · snebolde · krystalbro",halfWidth:122,
      hills:[[.24,.18,240],[.52,.16,210],[.82,.16,200]],bridge:[.46,.55],landmark:.5,ramps:[.1,.76],obstacles:[.33,.65],shortcut:[.38,.44],
      palette:{sky:"#b9d9ec",grass:"#e0edf4",grassDark:"#9cb9d4",road:"#8ebbd1",edge:"#f7ffff",accent:"#648ddd",fog:"#b7d6e8"},
      points:[[1300,450],[2400,400],[3420,650],[4070,1280],[3810,2060],[3200,2270],[3400,3130],[2670,3700],[1770,3500],[1380,2840],[650,2810],[400,2050],[840,1440],[500,850],[850,420]]}),
    makeTrack({id:"jungle-trail",name:"Junglestien",short:"Jungle",number:"06",theme:"jungle",difficulty:"Svær",subtitle:"Tempelruiner · træstammer · smalle genveje",halfWidth:116,
      hills:[[.24,.16,200],[.53,.19,240],[.83,.13,185]],bridge:[.49,.58],landmark:.53,ramps:[.1,.47,.8],obstacles:[.22,.68],shortcut:[.33,.42],
      palette:{sky:"#b8d4bc",grass:"#528f65",grassDark:"#294c49",road:"#897b58",edge:"#e1cf92",accent:"#f6c75c",fog:"#9ec4a7"},
      points:[[1300,400],[2300,400],[3330,570],[4090,1110],[4150,1910],[3450,2180],[3110,2710],[3460,3370],[2750,3850],[1860,3570],[1460,2930],[750,3040],[390,2300],[860,1700],[460,1020],[710,490]]})
  );
  const DIFFICULTIES = { relaxed:{ name:"Hyggelig", speed:.79 }, normal:{ name:"Sport", speed:.91 }, expert:{ name:"Ekspert", speed:1.02 } };
  const CUP_POINTS = [15,12,10,8,6,4,2,1];
  window.WutborgKartData = { DRIVERS, ITEM_TYPES, TRACKS, DIFFICULTIES, CUP_POINTS, TAU, clamp, mod, lerp, normalizeAngle, angleDelta };
})();
