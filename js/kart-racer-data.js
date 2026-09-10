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
    const length = distances.at(-1), samples = [], segments = 512;
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
    const track = { ...config, length, samples, step: length/segments, cx: 1100, cy: 1000, width: 2200, height: 2000 };
    track.at = function(s, offset = 0) {
      const f = mod(s, length)/this.step, i = Math.floor(f), a = samples[i], b = samples[(i+1)%segments];
      const heading = a.heading+angleDelta(a.heading,b.heading)*(f-i);
      return { x: lerp(a.x,b.x,f-i)-Math.sin(heading)*offset, y: lerp(a.y,b.y,f-i)+Math.cos(heading)*offset, heading, s: mod(s,length) };
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
      return best;
    };
    track.isRoad = (x,y) => track.nearest(x,y).distance <= track.halfWidth;
    track.start = track.at(0);
    track.heading = track.start.heading;
    track.itemBoxes = [.13,.39,.66,.88].flatMap((t,i) => [-.55,0,.55].map((lane,n) => ({ ...track.at(t*length,lane*track.halfWidth), id: `box-${i}-${n}` })));
    track.coins = [.07,.24,.49,.74,.94].flatMap((t,i) => [0,1,2,3,4].map(n => ({ ...track.at((t+n*.008)*length,(i%2?1:-1)*track.halfWidth*.42), id: `coin-${i}-${n}` })));
    track.boostPads = [.30,.58,.81].map(t => track.at(t*length,-track.halfWidth*.35));
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
    makeTrack({ id:"clover-circuit", name:"Kløversløjfen", short:"Kløver", number:"01", theme:"garden", difficulty:"Let", subtitle:"Grønne bakker. Store driftsving.", halfWidth:108,
      palette:{ sky:"#b5e2e9", grass:"#77b98b", grassDark:"#458768", road:"#586879", edge:"#f9edcb", accent:"#ff725a", fog:"#b5dcd8" },
      points:[[820,290],[1320,290],[1710,450],[1860,850],[1640,1130],[1690,1510],[1280,1730],[870,1580],[610,1310],[300,1070],[360,650],[540,330]] }),
    makeTrack({ id:"sunset-bay", name:"Solskinsbugten", short:"Bugten", number:"02", theme:"coast", difficulty:"Mellem", subtitle:"Havbrise. Chikaner. Fuld fart.", halfWidth:98,
      palette:{ sky:"#f9d0aa", grass:"#e9c789", grassDark:"#be986c", road:"#776d78", edge:"#fff2d5", accent:"#59cdd1", fog:"#f1ceb5" },
      points:[[680,290],[1190,250],[1710,420],[1890,770],[1740,1040],[1410,920],[1250,1240],[1540,1580],[1120,1760],[580,1610],[300,1240],[540,880],[300,580]] }),
    makeTrack({ id:"midnight-crown", name:"Midnatskronen", short:"Midnat", number:"03", theme:"night", difficulty:"Svær", subtitle:"Neonlys. Hårnåle. Ingen slinger.", halfWidth:90,
      palette:{ sky:"#141e39", grass:"#2f4260", grassDark:"#223149", road:"#46516d", edge:"#9cefff", accent:"#c98cff", fog:"#233752" },
      points:[[790,270],[1300,250],[1830,470],[1710,850],[1320,720],[1100,1040],[1680,1290],[1680,1640],[1250,1760],[840,1480],[360,1610],[280,1210],[630,900],[340,620]] }),
  ];
  const DIFFICULTIES = { relaxed:{ name:"Hyggelig", speed:.79 }, normal:{ name:"Sport", speed:.91 }, expert:{ name:"Ekspert", speed:1.02 } };
  const CUP_POINTS = [15,12,10,8,6,4,2,1];
  window.WutborgKartData = { DRIVERS, ITEM_TYPES, TRACKS, DIFFICULTIES, CUP_POINTS, TAU, clamp, mod, lerp, normalizeAngle, angleDelta };
})();
