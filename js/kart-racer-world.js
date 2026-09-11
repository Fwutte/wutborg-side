import * as THREE from "./vendor/three/three.module.js";

import { surfaceTexture } from "./game-art-3d.js?v=20260911-art";
export const SCALE=.032;
export const world=(p,y=0)=>new THREE.Vector3((p.x-2200)*SCALE,(p.elevation||0)*SCALE+y,(p.y-2100)*SCALE);
export const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,...extra});
const TAU=Math.PI*2,yaw=h=>Math.PI/2-h;
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};

// All terrain, structures and decorations use the same road height as the karts.
export function createLandscape(r,track){
  const random=rng(track.theme==="garden"?27:track.theme==="coast"?61:91);
  const frost=track.theme==="frost",volcano=track.theme==="volcano",jungle=track.theme==="jungle";
  const night=track.theme==="night",coast=track.theme==="coast",scene=r.scene;
  const bridgeAt=s=>{const t=s/track.length;return t>track.bridge[0]&&t<track.bridge[1];};
  const terrainHeight=(p,road=track.nearest(p.x,p.y))=>{
    const falloff=1-smooth((road.distance-track.halfWidth-70)/390);
    if(bridgeAt(road.s))return coast?-1.3:0;
    return (coast?-1.3:0)+(road.elevation*SCALE+(coast?1.3:0))*falloff-.12;
  };
  r.groundHeight=p=>terrainHeight(p);
  const terrain=new THREE.PlaneGeometry(track.width*SCALE+80,track.height*SCALE+80,144,144);
  terrain.rotateX(-Math.PI/2);terrain.translate((track.cx-2200)*SCALE,0,(track.cy-2100)*SCALE);
  const position=terrain.attributes.position,colors=[];
  const grass=new THREE.Color(track.palette.grass),darkGrass=new THREE.Color(track.palette.grassDark);
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),z=position.getZ(i),p={x:x/SCALE+2200,y:z/SCALE+2100};
    const road=track.nearest(p.x,p.y);
    position.setY(i,terrainHeight(p,road));
    const color=grass.clone().lerp(darkGrass,.12+(Math.sin(x*.17)*Math.cos(z*.23)+1)*.08);
    color.multiplyScalar(.96+random()*.08);colors.push(color.r,color.g,color.b);
  }
  terrain.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));terrain.computeVertexNormals();
  const ground=r.mesh(terrain,material("#ffffff",{vertexColors:true,map:surfaceTexture(frost?"ice":"grass",70,70),roughness:frost?.62:.95}),scene);ground.castShadow=false;
  if(coast){
    const waterMat=material("#229eb5",{metalness:.32,roughness:.24});
    waterMat.onBeforeCompile=shader=>{
      shader.uniforms.waterTime=r.waterTime;
      shader.vertexShader="uniform float waterTime; varying vec2 vWaterUv;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\n vWaterUv=position.xy; transformed.z += sin(position.x*.8+waterTime)*cos(position.y*.5+waterTime*.6)*.045;");
      shader.fragmentShader="uniform float waterTime; varying vec2 vWaterUv;\n"+shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\n float wave=sin(vWaterUv.x*1.8+waterTime)*cos(vWaterUv.y*1.1+waterTime*.7); diffuseColor.rgb *= .97+wave*.065;");
    };
    const water=r.mesh(new THREE.PlaneGeometry(480,480,80,80),waterMat,scene,0,-.22,0);
    water.rotation.x=-Math.PI/2;water.castShadow=false;
    const foam=[];
    for(let i=0;i<160;i++){
      const p=track.at(random()*track.length,(i%2?1:-1)*(track.halfWidth+380)),v=world(p);
      if(terrainHeight(p)>-.3)continue;
      foam.push({x:v.x,y:-.15,z:v.z,ry:random()*TAU,sx:1+random()*2});
    }
    const f=r.instance(new THREE.BoxGeometry(1,.01,.035),new THREE.MeshBasicMaterial({color:"#b5f2e3",transparent:true,opacity:.5}),foam);f.castShadow=false;
  }
  const sky=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{top:{value:new THREE.Color(volcano?"#392f49":frost?"#619ebf":jungle?"#367d78":night?"#070e28":coast?"#519dc8":"#47a8d5")},bottom:{value:new THREE.Color(track.palette.sky)}},
    vertexShader:"varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:"uniform vec3 top;uniform vec3 bottom;varying vec3 vWorld;void main(){float h=clamp(normalize(vWorld).y*1.8,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
  });
  const dome=r.mesh(new THREE.SphereGeometry(290,32,20),sky,scene);dome.castShadow=dome.receiveShadow=false;
  const sun=r.mesh(new THREE.SphereGeometry(night?4:7,24,16),new THREE.MeshBasicMaterial({color:night?"#fff6cb":"#fff1cb"}),scene,-125,65,155);sun.castShadow=false;
  const trunks=[],crowns=[],rocks=[],flowers=[],stems=[],clouds=[],mountains=[],fences=[],posts=[];
  for(let i=0;i<570;i++){
    const p=track.at(random()*track.length,(i%2?1:-1)*(track.halfWidth+125+random()*510));
    const road=track.nearest(p.x,p.y);if(road.distance<track.halfWidth+105||bridgeAt(road.s))continue;
    const v=world(p),base=terrainHeight(p,road),height=2.3+random()*2.8;if(coast&&base<-.1)continue;
    trunks.push({x:v.x,y:base+height*.5,z:v.z,sx:coast?.14:.22,sy:height,sz:coast?.14:.22});
    if(coast){
      for(let leaf=0;leaf<7;leaf++){
        const a=leaf/7*TAU+i;
        crowns.push({x:v.x+Math.cos(a)*1.05,y:base+height+.12,z:v.z+Math.sin(a)*1.05,sx:1.85,sy:.19,sz:.52,ry:-a,rz:.12,color:i%2?"#25946e":"#56b77d"});
      }
    }else for(let n=0;n<3;n++){
      crowns.push({x:v.x+(n-1)*.62,y:base+height+.5+(n===1?.7:0),z:v.z+Math.sin(n*3)*.5,
        sx:1.25+height*.16,sy:1.4+height*.14,sz:1.3+height*.13,ry:random()*TAU,
        color:frost?(i%2?"#daeafa":"#a9ccdf"):volcano?"#56434a":jungle?(i%2?"#28664d":"#45845c"):night?(i%2?"#436a82":"#557c98"):["#379f68","#62b667","#95c969"][i%3]});
    }
    if(i%4===0)rocks.push({x:v.x+1.8,y:base+.4,z:v.z-1.5,sx:1.5,sy:.9,sz:1.2,ry:random()*TAU});
  }
  r.scatter(new THREE.CylinderGeometry(.65,1,1,7),material(coast?"#bd9267":"#81624c"),trunks);
  r.scatter(new THREE.SphereGeometry(1,r.compact?8:12,r.compact?6:8),material("#ffffff",{roughness:.88}),crowns);
  r.scatter(new THREE.DodecahedronGeometry(.7,0),material(night?"#69849d":"#b1b5a0"),rocks);
  if(!coast&&!frost&&!volcano)for(let i=0;i<1300;i++){
    const p=track.at(random()*track.length,(i%2?1:-1)*(track.halfWidth+85+random()*155));
    const road=track.nearest(p.x,p.y);if(road.distance<track.halfWidth+78||bridgeAt(road.s))continue;
    const v=world(p),base=terrainHeight(p,road),h=.15+random()*.23;
    stems.push({x:v.x,y:base+h/2,z:v.z,sy:h});
    flowers.push({x:v.x,y:base+h,z:v.z,sx:.09,sy:.07,sz:.09,color:night?"#a1c6f5":["#fff3a3","#ffadc9","#f9f5df","#c4a1f5"][i%4]});
  }
  r.instance(new THREE.CylinderGeometry(.012,.022,1,3),material("#368151"),stems);
  r.instance(new THREE.IcosahedronGeometry(1,0),material("#ffffff",{emissive:night?"#7189bd":"#000000",emissiveIntensity:.35}),flowers);
  for(let i=0;i<34;i++){
    const a=i/34*TAU,rad=145+random()*35,h=12+random()*27;
    mountains.push({x:Math.cos(a)*rad,y:h*.2-3,z:Math.sin(a)*rad,sx:19+random()*14,sy:h,sz:18+random()*15,ry:a,
      color:frost?"#c5dfed":volcano?"#604455":jungle?"#4d7d70":night?"#283d62":coast?"#7ea9af":i%2?"#6faf96":"#7bbc9f"});
  }
  r.instance(new THREE.IcosahedronGeometry(1,1),material("#ffffff",{flatShading:true}),mountains);
  for(let i=0;i<45;i++){
    const a=i/45*TAU,rad=105+random()*95,x=Math.cos(a)*rad,z=Math.sin(a)*rad,y=25+random()*15;
    for(let n=0;n<4;n++)clouds.push({x:x+(n-1.5)*2,y:y+Math.sin(n)*.8,z,sx:2.8+n*.3,sy:1.35+random(),sz:2.2});
  }
  const cm=r.instance(new THREE.SphereGeometry(1,10,7),material(night?"#344767":"#fff6e5",{roughness:1}),clouds);cm.castShadow=false;
  if(night){
    const stars=[];
    for(let i=0;i<220;i++){
      const a=random()*TAU,b=.2+random()*1.2;
      stars.push({x:240*Math.cos(a)*Math.cos(b),y:240*Math.sin(b),z:240*Math.sin(a)*Math.cos(b),sx:.14+random()*.14,sy:.14,sz:.14});
    }
    const st=r.instance(new THREE.OctahedronGeometry(1),new THREE.MeshBasicMaterial({color:"#d8e6ff"}),stars);st.castShadow=false;
  }
  for(let s=0;s<track.length;s+=42)for(const side of [-1,1]){
    const p=track.at(s,side*(track.halfWidth+68)),v=world(p,.45);
    fences.push({x:v.x,y:v.y,z:v.z,rx:-Math.atan(p.slope),ry:yaw(p.heading),color:Math.floor(s/210)%2?track.palette.edge:track.palette.accent});
    if(Math.floor(s/42)%4===0)posts.push({x:v.x,y:v.y-.12,z:v.z,ry:yaw(p.heading)});
  }
  r.instance(new THREE.BoxGeometry(.19,.38,1.4),material("#ffffff",{metalness:night?.3:.05}),fences);
  r.instance(new THREE.BoxGeometry(.18,.72,.18),material("#526878"),posts);
  if(night){
    const glow=fences.map(p=>({...p,y:p.y+.21}));
    const rail=r.instance(new THREE.BoxGeometry(.08,.045,1.4),new THREE.MeshBasicMaterial({color:"#8cf3ff"}),glow);rail.castShadow=false;
  }
  createBridge(r,track);
  if(track.tunnel)createTunnel(r,track);
  createLandmarks(r,track,terrainHeight,random);
  dressCourse(r,track,terrainHeight,random);
  const signs=new THREE.Group(),steel=material("#344653");
  for(let s=200;s<track.length;s+=740){
    const bend=window.WutborgKartData.angleDelta(track.at(s).heading,track.at(s+350).heading);
    if(Math.abs(bend)<.24)continue;
    const p=track.at(s,-Math.sign(bend)*(track.halfWidth+96)),g=new THREE.Group();
    r.box(g,steel,-.75,.85,0,.09,1.7,.09);r.box(g,steel,.75,.85,0,.09,1.7,.09);
    const sign=r.sign(bend>0?"› › ›":"‹ ‹ ‹",night?"#7242a5":"#f8df7a",night?"#ffffff":"#264054",2.6,.9);sign.position.y=1.7;g.add(sign);
    g.position.copy(world(p));g.rotation.y=yaw(p.heading)+Math.PI;signs.add(g);
  }
  scene.add(r.bake(signs));
}
function dressCourse(r,track,groundHeight,random){
  const frost=track.theme==="frost",lava=track.theme==="volcano",night=track.theme==="night",coast=track.theme==="coast";
  const grass=[],petals=[],leaves=[],cliffs=[],caps=[],crystals=[];
  const count=r.compact?650:1300;
  for(let i=0;i<count;i++){
    const p=track.at(random()*track.length,(i%2?1:-1)*(track.halfWidth+82+random()*245));
    const road=track.nearest(p.x,p.y);if(road.distance<track.halfWidth+77||road.distance>track.halfWidth+410)continue;
    const f=road.s/track.length;if(f>track.bridge[0]&&f<track.bridge[1])continue;
    const v=world(p),base=groundHeight(p);if(coast&&base<-.1)continue;
    const h=.12+random()*.34;
    if(frost){
      if(i%6===0)for(let n=0;n<3;n++)crystals.push({x:v.x+(n-1)*.2,y:base+.3+n*.07,z:v.z,sy:.6+n*.23,sx:.12,sz:.18,rz:(n-1)*.3,ry:i,color:i%2?"#a9edff":"#77b5eb"});
    }else if(lava){
      if(i%12===0)cliffs.push({x:v.x,y:base+.45,z:v.z,sx:.6,sy:.7,sz:.6,ry:i});
    }else{
      for(let n=0;n<3;n++)grass.push({x:v.x+(n-1)*.07,y:base+h*.45,z:v.z,sx:.035,sy:h,sz:.13,ry:i+n,rz:(n-1)*.35,color:night?"#5b8b96":coast?"#98b783":["#83b969","#599657","#b1ce75"][i%3]});
      if(i%10===0){
        for(let n=0;n<5;n++){const a=n/5*TAU;petals.push({x:v.x+Math.cos(a)*.12,y:base+.3,z:v.z+Math.sin(a)*.12,sx:.1,sy:.045,sz:.1,color:i%3?"#fff3cb":"#ffadbf"});}
        petals.push({x:v.x,y:base+.34,z:v.z,sx:.075,sy:.04,sz:.075,color:"#ffd866"});
      }
      if(i%13===0)for(let n=0;n<6;n++){
        const a=n/6*TAU;leaves.push({x:v.x+Math.cos(a)*.27,y:base+.23,z:v.z+Math.sin(a)*.27,sx:.46,sy:.075,sz:.14,ry:-a,rz:.3,color:night?"#698cb2":"#539469"});
      }
    }
  }
  if(grass.length)r.instance(new THREE.ConeGeometry(1,1,3),material("#ffffff",{roughness:1}),grass).castShadow=false;
  if(petals.length)r.instance(new THREE.SphereGeometry(1,6,4),material("#ffffff",{roughness:.75}),petals).castShadow=false;
  if(leaves.length)r.instance(new THREE.SphereGeometry(1,8,5),material("#ffffff",{roughness:.8}),leaves);
  if(crystals.length)r.instance(new THREE.ConeGeometry(1,1,5),material("#ffffff",{metalness:.25,roughness:.18,emissive:"#438ca5",emissiveIntensity:.15}),crystals);
  if(cliffs.length)r.instance(new THREE.DodecahedronGeometry(1),material("#4e3d4a",{map:surfaceTexture("stone"),roughness:.93}),cliffs);
  // Layered rock outcrops frame the route without entering the drivable corridor.
  const stone=material(frost?"#91b1c4":lava?"#514250":coast?"#d2c0a0":"#879994",{map:surfaceTexture("stone",2,3),bumpScale:.06});stone.bumpMap=stone.map;
  const outcrops=[];
  for(let i=0;i<40;i++){
    const p=track.at(track.length*i/40,(i%2?1:-1)*(track.halfWidth+420));
    if(track.nearest(p.x,p.y).distance<track.halfWidth+250)continue;
    const v=world(p),base=groundHeight(p);if(coast&&base<-.1)continue;
    for(let n=0;n<3;n++)outcrops.push({x:v.x+n*.8,y:base+1.1+n*.12,z:v.z,sx:2.1-n*.3,sy:2.8+n*.3,sz:2.5,ry:i*.8});
    if(frost)caps.push({x:v.x+.7,y:base+3.1,z:v.z,sx:2.8,sy:.5,sz:2.7,ry:i*.8});
  }
  r.instance(new THREE.DodecahedronGeometry(1,0),stone,outcrops);
  if(caps.length)r.instance(new THREE.SphereGeometry(1,12,8),material("#f3faff",{roughness:.65}),caps);
  // Streetlights give the neon course a stronger racing silhouette.
  if(night){
    const poles=[],arms=[],lights=[];
    for(let i=0;i<44;i++){
      const p=track.at(track.length*i/44,(i%2?1:-1)*(track.halfWidth+83)),v=world(p);
      poles.push({x:v.x,y:v.y+2.6,z:v.z,sy:5.2});
      const across=new THREE.Vector3(-Math.sin(p.heading),0,Math.cos(p.heading)).multiplyScalar(i%2?-1:1);
      arms.push({x:v.x+across.x*.55,y:v.y+5.15,z:v.z+across.z*.55,ry:yaw(p.heading)});
      lights.push({x:v.x+across.x*1.08,y:v.y+5.12,z:v.z+across.z*1.08,ry:yaw(p.heading)});
    }
    r.instance(new THREE.CylinderGeometry(.07,.12,1,6),material("#42526f",{metalness:.7,roughness:.3}),poles);
    r.instance(new THREE.BoxGeometry(1.3,.1,.13),material("#536681",{metalness:.6}),arms);
    r.instance(new THREE.BoxGeometry(.5,.075,.8),new THREE.MeshBasicMaterial({color:"#b2f4ff"}),lights).castShadow=false;
  }
}
function createBridge(r,track){
  const deck=[],supports=[],rails=[],[start,end]=track.bridge,night=track.theme==="night";
  for(let s=start*track.length;s<end*track.length;s+=80){
    const p=track.at(s),v=world(p),width=(track.halfWidth+68)*2*SCALE;
    deck.push({x:v.x,y:v.y-.23,z:v.z,rx:-Math.atan(p.slope),ry:yaw(p.heading),sx:width});
    if(Math.floor((s-start*track.length)/80)%3===0)for(const side of [-1,1]){
      const q=track.at(s,side*(track.halfWidth+48)),w=world(q),height=w.y+1;
      supports.push({x:w.x,y:height/2-1,z:w.z,sy:height});
    }
    for(const side of [-1,1]){
      const q=track.at(s,side*(track.halfWidth+72)),w=world(q,1.2);
      rails.push({x:w.x,y:w.y,z:w.z,rx:-Math.atan(p.slope),ry:yaw(p.heading)});
    }
  }
  r.instance(new THREE.BoxGeometry(1,.38,2.63),material(night?"#344663":"#c3ac8a"),deck);
  r.instance(new THREE.CylinderGeometry(.35,.6,1,8),material(night?"#516582":"#d3c6a7"),supports);
  r.instance(new THREE.BoxGeometry(.14,.14,2.67),material(track.palette.accent,{emissive:night?"#c168ee":"#000000",emissiveIntensity:.8}),rails);
}
function createTunnel(r,track){
  const [start,end]=track.tunnel,pos=[],radius=track.halfWidth*SCALE+2.6,segments=50,arches=20;
  const vertex=(s,a)=>world(track.at(s,-Math.cos(a)*radius/SCALE),Math.sin(a)*radius*1.6+.15);
  for(let i=0;i<segments;i++)for(let j=0;j<arches;j++){
    const a=j/arches*Math.PI,b=(j+1)/arches*Math.PI,s=(start+(end-start)*i/segments)*track.length,n=(start+(end-start)*(i+1)/segments)*track.length;
    for(const v of [vertex(s,a),vertex(n,a),vertex(s,b),vertex(s,b),vertex(n,a),vertex(n,b)])pos.push(v.x,v.y,v.z);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
  r.mesh(geo,material("#182643",{side:THREE.DoubleSide}),r.scene);
  const parts=new THREE.Group();
  for(let i=0;i<=12;i++){
    const p=track.at((start+(end-start)*i/12)*track.length),g=new THREE.Group();
    const ring=r.mesh(new THREE.TorusGeometry(radius-.10,.085,6,28,Math.PI),new THREE.MeshBasicMaterial({color:i%2?"#ba81ff":"#73effa"}),g,0,.15,0);ring.scale.y=1.6;ring.castShadow=false;
    g.position.copy(world(p));g.rotation.y=yaw(p.heading);parts.add(g);
  }
  r.scene.add(r.bake(parts));
}
function createLandmarks(r,track,groundHeight,random){
  const coast=track.theme==="coast",night=track.theme==="night",parts=new THREE.Group();
  const stone=material(night?"#425575":"#ece3cb"),paint=material(track.palette.accent),dark=material("#30465b"),wood=material("#ac7f5c"),gold=material("#f7cf6a",{metalness:.45,roughness:.3});
  const place=(g,s,offset)=>{
    const p=track.at(s*track.length,offset),v=world(p);v.y=Math.max(coast?-.05:0,groundHeight(p));
    g.position.copy(v);g.rotation.y=yaw(p.heading);parts.add(g);return g;
  };
  // A filled grandstand gives the start straight scale and a recognizable home.
  for(const side of [-1,1]){
    const stand=new THREE.Group();
    for(let row=0;row<5;row++)r.box(stand,row%2?paint:dark,0,.35+row*.38,row*.62,14,.4,.68);
    for(const x of [-7,0,7])r.box(stand,stone,x,2.15,1.4,.13,4.3,.16);
    r.box(stand,paint,0,4.25,1.4,15,.16,4.7);
    const sign=r.sign("WUTBORG RACING CLUB",track.palette.accent,"#ffffff",12,.65);sign.position.set(0,4.03,-1);stand.add(sign);
    const audienceMat=material("#ffffff");
    for(let row=0;row<5;row++)for(let seat=0;seat<24;seat++){
      const spectator=r.mesh(new THREE.SphereGeometry(.12,6,5),audienceMat,stand,(seat-11.5)*.55,.83+row*.38,row*.62);
      // Per-mesh colours are baked with a vertex attribute to keep this a single batch.
      const col=new THREE.Color(["#ffe8a4","#ee799a","#65d4cf","#a492df"][Math.floor(random()*4)]);
      const arr=new Float32Array(spectator.geometry.attributes.position.count*3);
      for(let i=0;i<arr.length;i+=3){arr[i]=col.r;arr[i+1]=col.g;arr[i+2]=col.b;}
      spectator.geometry.setAttribute("color",new THREE.BufferAttribute(arr,3));audienceMat.vertexColors=true;
    }
    place(stand,.012,side*(track.halfWidth+190));stand.rotation.y+=side*Math.PI/2;
  }
  if(["volcano","frost","jungle"].includes(track.theme)){createWildLandmarks(r,track,place,parts);r.scene.add(r.bake(parts));return;}
  const landmark=new THREE.Group();
  if(coast){
    const island=r.mesh(new THREE.SphereGeometry(4,18,12),stone,landmark,0,-.65,0);island.scale.y=.28;
    r.mesh(new THREE.CylinderGeometry(1.0,1.75,10,20),stone,landmark,0,5,0);
    for(const y of [2,5,8])r.mesh(new THREE.CylinderGeometry(1.8-y*.075,1.82-y*.075,.8,20),paint,landmark,0,y,0);
    r.mesh(new THREE.CylinderGeometry(1.9,1.9,.22,24),dark,landmark,0,10,0);
    r.mesh(new THREE.CylinderGeometry(.9,.9,1.4,12),material("#ffeba5",{emissive:"#ffbd4f",emissiveIntensity:1}),landmark,0,10.8,0);
    r.mesh(new THREE.ConeGeometry(1.6,1.2,20),paint,landmark,0,12,0);
    r.box(landmark,wood,3,.8,0,3,1.6,2.4);const roof=r.mesh(new THREE.ConeGeometry(2.5,1.4,4),paint,landmark,3,2,0);roof.rotation.y=Math.PI/4;
    place(landmark,track.landmark,track.halfWidth+310);
    // Harbour houses, awnings, umbrellas and small sailboats along the promenade.
    for(let i=0;i<13;i++){
      const house=new THREE.Group(),wall=material(["#f8cc94","#ed9a88","#a9d8d3","#f1e0ab"][i%4]);
      r.box(house,wall,0,1.4,0,3,2.8,3);
      const roof=r.mesh(new THREE.ConeGeometry(2.5,1.4,4),paint,house,0,3.3,0);roof.rotation.y=Math.PI/4;
      r.box(house,dark,-.7,1.5,1.51,.55,.8,.03);r.box(house,dark,.7,1.5,1.51,.55,.8,.03);
      r.box(house,wood,0,.65,1.52,.6,1.3,.04);place(house,.08+i*.009,-(track.halfWidth+220));house.rotation.y-=Math.PI/2;
    }
    for(let i=0;i<22;i++){
      const umbrella=new THREE.Group(),canopy=material(i%2?"#ff927e":"#f9e5ae");
      r.mesh(new THREE.CylinderGeometry(.035,.035,1.9,6),wood,umbrella,0,.95,0);
      r.mesh(new THREE.ConeGeometry(1.1,.5,12),canopy,umbrella,0,2,0);
      place(umbrella,.59+i*.009,track.halfWidth+145+(i%3)*45);
    }
    for(let i=0;i<6;i++){
      const p=track.at((.44+i*.017)*track.length,-(track.halfWidth+650)),boat=new THREE.Group();
      const hull=r.mesh(new THREE.SphereGeometry(1,12,8),paint,boat);hull.scale.set(.6,.3,1.5);
      r.mesh(new THREE.CylinderGeometry(.025,.025,2.5,6),stone,boat,0,1.1,0);
      const sail=r.mesh(new THREE.ConeGeometry(.95,1.9,3),stone,boat,0,1.3,0);sail.scale.z=.025;
      boat.position.copy(world({...p,elevation:0},-.04));boat.rotation.y=i*.7;parts.add(boat);
    }
  }else if(!night){
    r.box(landmark,stone,0,2.4,0,6,4.8,4.3);
    r.box(landmark,dark,0,1,2.16,1.3,2,.03);
    for(const x of [-3.2,3.2])for(const z of [-2.3,2.3]){
      r.mesh(new THREE.CylinderGeometry(.86,1,6,16),stone,landmark,x,3,z);
      r.mesh(new THREE.ConeGeometry(1.25,2.2,16),paint,landmark,x,7.1,z);
      r.mesh(new THREE.SphereGeometry(.15,8,6),gold,landmark,x,8.27,z);
    }
    for(let x=-2.5;x<=2.5;x++)r.box(landmark,stone,x,5.1,2,.48,.6,.5);
    place(landmark,track.landmark,track.halfWidth+310);
    for(let i=0;i<5;i++){
      const mill=new THREE.Group();r.mesh(new THREE.CylinderGeometry(.6,1.1,4.8,12),stone,mill,0,2.4,0);
      r.mesh(new THREE.ConeGeometry(1.25,1.6,12),paint,mill,0,5.4,0);
      const blades=new THREE.Group();
      for(let j=0;j<4;j++){const blade=r.box(blades,wood,0,1.05,0,.24,2.5,.10);blade.rotation.z=j*Math.PI/2;blade.position.set(-Math.sin(j*Math.PI/2)*1.05,Math.cos(j*Math.PI/2)*1.05,0);}
      blades.position.set(0,4,1.03);mill.add(blades);place(mill,.19+i*.014,-(track.halfWidth+250));
      // Moving blades remain separate from the static geometry batches.
      mill.updateMatrixWorld(true);blades.removeFromParent();blades.position.applyMatrix4(mill.matrixWorld);blades.rotation.y=mill.rotation.y;r.scene.add(blades);r.rotors.push(blades);
    }
  }else{
    r.mesh(new THREE.CylinderGeometry(2.5,3,5,12),stone,landmark,0,2.5,0);
    r.mesh(new THREE.SphereGeometry(2.9,24,12,0,TAU,0,Math.PI/2),material("#8c85bd",{metalness:.45,roughness:.25}),landmark,0,5,0);
    const telescope=r.mesh(new THREE.CylinderGeometry(.5,.65,4,12),dark,landmark,0,7,0);telescope.rotation.x=.8;
    const ring=r.mesh(new THREE.TorusGeometry(3.4,.11,8,40),new THREE.MeshBasicMaterial({color:"#adf9ff"}),landmark,0,4.8,0);ring.rotation.x=Math.PI/2;
    place(landmark,track.landmark,-(track.halfWidth+260));
    const towers=[],windows=[];
    for(let i=0;i<100;i++){
      const p=track.at(random()*track.length,(i%2?1:-1)*(track.halfWidth+270+random()*600)),road=track.nearest(p.x,p.y);
      if(road.distance<track.halfWidth+240)continue;
      const v=world(p),base=groundHeight(p),h=5+random()*15,w=2+random()*2;
      towers.push({x:v.x,y:base+h/2,z:v.z,sx:w,sy:h,sz:w,color:i%2?"#304566":"#415272"});
      for(let y=1;y<h;y+=.9)for(const side of [-1,1])windows.push({x:v.x+side*(w/2+.012),y:base+y,z:v.z,sx:.018,sy:.16,sz:w*.68,color:i%3?"#91ccef":"#d798ef"});
    }
    r.instance(new THREE.BoxGeometry(1,1,1),material("#ffffff",{metalness:.2}),towers);
    const wm=r.instance(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:"#ffffff"}),windows);wm.castShadow=false;
  }
  r.scene.add(r.bake(parts));
  // Balloons mark upcoming districts, visible over the trees from the road.
  for(let i=0;i<5;i++){
    const p=track.at((.08+i*.195)*track.length,track.halfWidth+330),g=new THREE.Group();
    const balloon=r.mesh(new THREE.SphereGeometry(1.8,20,14),material(["#ff8e72","#f4cf75","#a5a0f1"][i%3]),g,0,2,0);balloon.scale.y=1.25;
    r.mesh(new THREE.CylinderGeometry(.42,.34,.45,8),wood,g,0,-.65,0);
    for(const x of [-.3,.3])r.mesh(new THREE.CylinderGeometry(.013,.013,.9,4),stone,g,x,-.05,0);
    g.position.copy(world(p,12+i%2*5));r.scene.add(g);r.balloons.push({group:g,y:g.position.y});
  }
}

function createWildLandmarks(r,track,place,parts){
  const lava=track.theme==="volcano",snow=track.theme==="frost";
  const stone=material(lava?"#473748":snow?"#d4e9f4":"#8b9472"),glow=material(lava?"#ffad45":snow?"#b4edff":"#ffd17c",{emissive:lava?"#fc5122":snow?"#62c9ef":"#5c7c49",emissiveIntensity:lava?1.6:.35,metalness:snow?.35:0,roughness:snow?.15:.8});
  for(let i=0;i<12;i++){
    const g=new THREE.Group();
    if(lava){
      r.mesh(new THREE.CylinderGeometry(1.7,7,10,11),stone,g,0,4.5,0);
      const pool=r.mesh(new THREE.CircleGeometry(1.6,24),glow,g,0,9.52,0);pool.rotation.x=-Math.PI/2;
      for(let n=0;n<5;n++){const crack=r.box(g,glow,Math.sin(n*2)*2,6-n,.6+n*.5,.2,2,.2);crack.rotation.z=n*.7;}
    }else if(snow){
      for(let n=0;n<5;n++){const crystal=r.mesh(new THREE.ConeGeometry(.65,4+n%3,5),n%2?stone:glow,g,(n-2)*.9,2+n%3*.4,Math.sin(n)*.7);crystal.rotation.z=(n-2)*.12;}
    }else{
      for(let n=0;n<5;n++)r.box(g,stone,0,n*.65,0,6-n,.65,6-n);
      for(const x of [-1.3,1.3])r.box(g,stone,x,4,0,.65,2,.7);
      r.box(g,stone,0,5.1,0,3.6,.65,1);r.box(g,glow,0,3.7,.45,.6,.8,.05);
    }
    place(g,.04+i*.077,(i%2?1:-1)*(track.halfWidth+185));
  }
  const main=new THREE.Group();
  if(lava){r.mesh(new THREE.CylinderGeometry(5,23,26,18),stone,main,0,12,0);const pool=r.mesh(new THREE.CircleGeometry(5,32),glow,main,0,25.05,0);pool.rotation.x=-Math.PI/2;}
  else if(snow){for(let i=0;i<6;i++){const peak=r.mesh(new THREE.ConeGeometry(7,18+i%3*4,5),i%2?glow:stone,main,(i-2.5)*6,9,Math.sin(i)*5);peak.rotation.z=(i-2.5)*.07;}}
  else{for(let i=0;i<7;i++)r.box(main,stone,0,i*1.2,0,19-i*2,1.2,19-i*2);r.box(main,glow,0,9,3,2,2,.1);}
  place(main,track.landmark,-(track.halfWidth+650));
}
