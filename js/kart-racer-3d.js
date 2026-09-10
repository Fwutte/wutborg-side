import * as THREE from "./vendor/three/three.module.js";
import { mergeGeometries } from "./vendor/three/addons/utils/BufferGeometryUtils.js";

const SCALE=.032, TAU=Math.PI*2;
const world=(p,y=0)=>new THREE.Vector3((p.x-1100)*SCALE,y,(p.y-1000)*SCALE);
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.8,flatShading:true,...extra});
const yaw=h=>Math.PI/2-h;
const damp=(a,b,rate,dt)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-rate*dt));
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

export class KartRacer3DRenderer {
  constructor(canvas){
    this.canvas=canvas;this.compact=matchMedia("(pointer:coarse), (max-width:760px)").matches;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.compact?1.4:1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
    this.renderer.shadowMap.enabled=!this.compact;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.camera=new THREE.PerspectiveCamera(62,1,.1,260);
    this.scene=null;this.currentRace=null;this.previewDriver=null;this.time=0;this.cameraReady=false;
    this.cameraHeading=0;this.target=new THREE.Vector3();this.scratch=new THREE.Object3D();
    this.contextLost=false;
    canvas.addEventListener("webglcontextlost",e=>{
      e.preventDefault();this.contextLost=true;
      window.wutborgKartGame?.togglePause(true);
      window.wutborgKartGame?.showToast("Grafikken genstarter. Løbet er sat på pause.");
    });
    canvas.addEventListener("webglcontextrestored",()=>{this.contextLost=false;this.currentRace=null;});
  }
  mesh(geometry,mat,parent,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  box(parent,mat,x,y,z,w,h,d){return this.mesh(new THREE.BoxGeometry(w,h,d),mat,parent,x,y,z);}
  bake(group){
    group.updateMatrixWorld(true);
    const batches=new Map();
    group.traverse(o=>{
      if(!o.isMesh)return;
      const list=batches.get(o.material)||[];const geo=o.geometry.clone().applyMatrix4(o.matrixWorld);
      list.push(geo);batches.set(o.material,list);
    });
    const result=new THREE.Group();
    for(const [mat,geos] of batches){
      const merged=mergeGeometries(geos,false);
      if(merged){const mesh=this.mesh(merged,mat,result);mesh.receiveShadow=true;}
      geos.forEach(g=>g.dispose());
    }
    group.traverse(o=>o.geometry?.dispose());return result;
  }
  disposeScene(){
    if(!this.scene)return;
    const geos=new Set(),mats=new Set(),textures=new Set();
    this.scene.traverse(o=>{
      o.shadow?.dispose?.();
      if(o.geometry)geos.add(o.geometry);
      for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){
        mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);
      }
    });
    geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }
  ribbon(track,left,right,height,mat,alternating=false){
    const pos=[],colors=[],uv=[],color=new THREE.Color();
    for(let i=0;i<512;i++){
      const s=i*track.step;
      const a=world(track.at(s,left),height),b=world(track.at(s,right),height);
      const c=world(track.at(s+track.step,left),height),d=world(track.at(s+track.step,right),height);
      const vertices=[a,b,c,b,d,c];
      color.set(alternating?(Math.floor(i/3)%2?track.palette.edge:track.palette.accent):"#ffffff");
      vertices.forEach(v=>{pos.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);});
      uv.push(0,s/110,1,s/110,0,(s+track.step)/110,1,s/110,1,(s+track.step)/110,0,(s+track.step)/110);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));geo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
    geo.computeVertexNormals();
    const mesh=this.mesh(geo,mat,this.scene);mesh.castShadow=false;return mesh;
  }
  instance(geo,mat,entries){
    const mesh=new THREE.InstancedMesh(geo,mat,entries.length);
    const dummy=this.scratch;
    entries.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx||0,p.ry||0,p.rz||0);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));
    });
    mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);return mesh;
  }
  sign(text,bg="#152c37",fg="#f0ffc6",width=6,height=1.3){
    const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext("2d");ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);
    ctx.fillStyle=fg;ctx.font="900 105px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,512,138,960);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  }
  createScene(race,driver){
    this.disposeScene();this.scene=new THREE.Scene();this.scene.background=new THREE.Color(race.track.palette.sky);
    this.scene.fog=new THREE.Fog(race.track.palette.fog,50,145);
    this.currentRace=race;this.previewDriver=driver?.id;this.cameraReady=false;
    this.karts=[];this.itemMeshes=[];this.coinMeshes=[];this.trapMeshes=[];this.shellMeshes=[];
    const track=race.track,night=track.theme==="night";
    this.scene.add(new THREE.HemisphereLight(night?0xb5cdff:0xe3f7ff,night?0x38476e:0x627752,night?2.6:2.2));
    const sun=new THREE.DirectionalLight(night?0xc2ceff:0xfff0d5,night?2.1:3.1);
    sun.position.set(-25,55,-35);sun.castShadow=!this.compact;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;
    sun.shadow.camera.near=.1;sun.shadow.camera.far=150;sun.shadow.bias=-.0003;sun.shadow.normalBias=.06;this.scene.add(sun);
    const ground=this.mesh(new THREE.PlaneGeometry(360,360),material(track.palette.grass),this.scene,0,-.08,0);
    ground.rotation.x=-Math.PI/2;ground.castShadow=false;
    if(track.theme==="coast"){
      const sea=this.mesh(new THREE.PlaneGeometry(320,320),material("#60bac3",{metalness:.18,roughness:.35}),this.scene,0,-.02,0);
      sea.rotation.x=-Math.PI/2;sea.castShadow=false;
      const island=this.mesh(new THREE.CircleGeometry(56,64),material(track.palette.grass),this.scene,0,0,0);island.rotation.x=-Math.PI/2;island.castShadow=false;
    }
    this.ribbon(track,-track.halfWidth-62,track.halfWidth+62,.01,material(track.palette.grassDark));
    this.ribbon(track,-track.halfWidth-18,track.halfWidth+18,.03,material(track.palette.edge));
    const asphaltCanvas=document.createElement("canvas");asphaltCanvas.width=128;asphaltCanvas.height=128;
    const ac=asphaltCanvas.getContext("2d");ac.fillStyle=track.palette.road;ac.fillRect(0,0,128,128);
    const random=rng(14);
    for(let i=0;i<2200;i++){ac.fillStyle=random()>.5?"rgba(255,255,255,.055)":"rgba(0,0,0,.055)";ac.fillRect(random()*128,random()*128,1,1);}
    const asphalt=new THREE.CanvasTexture(asphaltCanvas);asphalt.wrapS=asphalt.wrapT=THREE.RepeatWrapping;asphalt.colorSpace=THREE.SRGBColorSpace;asphalt.anisotropy=4;
    this.ribbon(track,-track.halfWidth,track.halfWidth,.048,material("#ffffff",{map:asphalt}));
    const curb=material("#ffffff",{vertexColors:true});
    this.ribbon(track,-track.halfWidth-18,-track.halfWidth,.055,curb,true);
    this.ribbon(track,track.halfWidth,track.halfWidth+18,.055,curb,true);
    const dashes=[];
    for(let s=0;s<track.length;s+=90){
      for(const offset of [-track.halfWidth+9,track.halfWidth-9]){
        const p=track.at(s,offset),v=world(p,.06);
        dashes.push({x:v.x,y:v.y,z:v.z,ry:yaw(p.heading)});
      }
    }
    const dash=this.instance(new THREE.BoxGeometry(.04,.008,.95),new THREE.MeshBasicMaterial({color:night?"#a1dfea":"#dedfd2"}),dashes);dash.castShadow=false;
    this.createStart(track);this.createScenery(track);
    for(const pad of track.boostPads){
      const g=new THREE.Group(),m=material("#42dec9",{emissive:"#13775e",emissiveIntensity:1});
      this.box(g,m,0,.075,0,2.35,.07,1.8);
      for(let j=-1;j<=1;j++){const arrow=this.sign("»","#42dec9","#faffbb",1.7,.55);arrow.rotation.x=-Math.PI/2;arrow.position.set(0,.12,j*.43);g.add(arrow);}
      g.position.copy(world(pad));g.rotation.y=yaw(pad.heading);this.scene.add(g);
    }
    const preview=race.karts.length?race.karts:[{driver:driver||window.WutborgKartData.DRIVERS[0],...track.at(-70,-25),speed:0}];
    preview.forEach(k=>{const visual=this.createKart(k.driver);this.karts.push(visual);this.scene.add(visual.group);});
    const boxMat=material("#77e5ef",{emissive:"#219fa4",emissiveIntensity:.55,metalness:.2,roughness:.25});
    for(const box of race.itemBoxes.length?race.itemBoxes:race.state==="ready"?track.itemBoxes:[]){
      const g=new THREE.Group();this.mesh(new THREE.BoxGeometry(.95,.95,.95),boxMat,g);
      const q=this.sign("?","#77e5ef","#154858",.66,.66);q.position.z=.483;g.add(q);
      const back=q.clone();back.rotation.y=Math.PI;back.position.z=-.483;g.add(back);
      g.position.copy(world(box,1));this.scene.add(g);this.itemMeshes.push(g);
    }
    const coinMat=material("#ffda64",{metalness:.65,roughness:.25,emissive:"#b67c19",emissiveIntensity:.25});
    for(const coin of race.coins.length?race.coins:race.state==="ready"?track.coins:[]){
      const g=new THREE.Group(),mesh=this.mesh(new THREE.CylinderGeometry(.31,.31,.09,16),coinMat,g);mesh.rotation.x=Math.PI/2;
      g.position.copy(world(coin,.7));this.scene.add(g);this.coinMeshes.push(g);
    }
    const particleGeo=new THREE.SphereGeometry(1,4,3),particleMat=new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.85,depthWrite:false});
    this.particles=new THREE.InstancedMesh(particleGeo,particleMat,160);this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particles.frustumCulled=false;
    this.particleState=Array.from({length:160},()=>({life:0}));this.particleCursor=0;
    this.scene.add(this.particles);
  }
  createStart(track){
    const root=new THREE.Group(),dark=material("#253a48"),accent=material(track.palette.accent),cream=material("#f5f0d8");
    const width=track.halfWidth*2*SCALE;
    for(const side of [-1,1]){
      this.box(root,dark,side*(width/2+.45),2.2,0,.4,4.4,.55);
      this.box(root,accent,side*(width/2+.45),.7,0,.65,1.4,.85);
    }
    this.box(root,dark,0,4.3,0,width+1.7,.85,.55);
    const banner=this.sign("WUTBORG  /  KART","#223a43","#eeffb8",width+.8,.72);banner.position.set(0,4.32,-.29);banner.rotation.y=Math.PI;root.add(banner);
    const front=banner.clone();front.position.z=.29;front.rotation.y=0;root.add(front);
    for(let row=0;row<2;row++)for(let col=0;col<12;col++){
      this.box(root,(row+col)%2?dark:cream,-width/2+(col+.5)*width/12,.065,(row-.5)*.38,width/12,.035,.38);
    }
    root.position.copy(world(track.start));root.rotation.y=yaw(track.heading);this.scene.add(root);
    const grids=[];
    for(let i=0;i<8;i++){
      const p=track.at(-38-Math.floor(i/2)*65,i%2?38:-38),v=world(p,.06);
      grids.push({x:v.x,y:v.y,z:v.z,ry:yaw(p.heading)});
    }
    const grid=this.instance(new THREE.BoxGeometry(1.5,.01,.07),new THREE.MeshBasicMaterial({color:"#dae0d6"}),grids);grid.castShadow=false;
  }
  createScenery(track){
    const random=rng(track.theme==="garden"?27:track.theme==="coast"?61:91),night=track.theme==="night";
    const trunks=[],crowns=[],rocks=[],hills=[],clouds=[],fences=[];
    for(let i=0;i<230;i++){
      const s=random()*track.length,side=i%2?1:-1,offset=side*(track.halfWidth+135+random()*380),p=track.at(s,offset);
      if(track.nearest(p.x,p.y).distance<track.halfWidth+95)continue;
      const v=world(p),height=1.5+random()*2.4;
      if(track.theme==="coast"&&Math.hypot(v.x,v.z)>53)continue;
      trunks.push({x:v.x,y:height*.42,z:v.z,sx:.18,sy:height*.85,sz:.18});
      if(track.theme==="coast"){
        for(let leaf=0;leaf<5;leaf++){
          const angle=leaf/5*TAU+i;
          crowns.push({x:v.x+Math.cos(angle)*.85,y:height*.85+.15,z:v.z+Math.sin(angle)*.85,sx:1.55,sy:.24,sz:.48,ry:-angle,color:i%2?"#4c9e7e":"#6aae83"});
        }
      }else crowns.push({x:v.x,y:height+1,z:v.z,sx:1+height*.2,sy:height*.6,sz:1+height*.2,ry:random()*TAU,color:night?(i%2?"#627b9a":"#516780"):(i%3?"#519970":"#91bd71")});
      if(i%5===0)rocks.push({x:v.x+1,y:.25,z:v.z-1,sx:1,sy:.6,sz:.8,ry:random()*TAU});
    }
    this.instance(new THREE.CylinderGeometry(1,1,1,5),material("#826f61"),trunks);
    this.instance(new THREE.IcosahedronGeometry(1,0),material("#ffffff"),crowns);
    this.instance(new THREE.DodecahedronGeometry(.6,0),material(night?"#60728b":"#a8b6a4"),rocks);
    for(let i=0;i<30;i++){
      const a=i/30*TAU,r=68+random()*22,h=6+random()*12;
      hills.push({x:Math.cos(a)*r,y:h*.3-2,z:Math.sin(a)*r,sx:10+random()*10,sy:h,sz:10+random()*10,ry:a,color:night?"#344c68":track.theme==="coast"?"#b3bdaa":i%2?"#85bba0":"#6fa58e"});
    }
    this.instance(new THREE.IcosahedronGeometry(1,0),material("#ffffff"),hills);
    for(let i=0;i<36;i++){
      const a=i/12*TAU,r=58+(i%3)*12;
      clouds.push({x:Math.cos(a)*r,y:22+(i%4)*2,z:Math.sin(a)*r,sx:4+(i%3),sy:1.2,sz:2.2});
    }
    const cloudMesh=this.instance(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:night?"#344864":"#fff5e5"}),clouds);cloudMesh.castShadow=false;
    const sun=this.mesh(new THREE.SphereGeometry(5,24,16),new THREE.MeshBasicMaterial({color:night?"#f2ebd0":"#fff2cd"}),this.scene,-60,39,65);sun.castShadow=false;
    for(let s=0;s<track.length;s+=42)for(const side of [-1,1]){
      // Low rails match the physical outer boundary, with space for recoverable run-off.
      const p=track.at(s,side*(track.halfWidth+68)),v=world(p,.42);
      fences.push({x:v.x,y:v.y,z:v.z,ry:yaw(p.heading),color:Math.floor(s/125)%2?track.palette.edge:track.palette.accent});
    }
    this.instance(new THREE.BoxGeometry(.18,.46,1.38),material("#ffffff"),fences);
    const posts=fences.filter((_,i)=>i%4===0).map(v=>({...v,y:.32}));
    this.instance(new THREE.BoxGeometry(.18,.64,.18),material("#61747a"),posts);
    for(let s=150;s<track.length;s+=500){
      const bend=window.WutborgKartData.angleDelta(track.at(s).heading,track.at(s+250).heading);
      if(Math.abs(bend)<.24)continue;
      const p=track.at(s,Math.sign(bend)*-(track.halfWidth+95));
      const g=new THREE.Group(),steel=material("#334857");
      this.box(g,steel,-.7,.9,0,.09,1.8,.09);this.box(g,steel,.7,.9,0,.09,1.8,.09);
      const sign=this.sign(bend>0?"› › ›":"‹ ‹ ‹",night?"#725194":"#f4df91",night?"#f6e5ff":"#3f5259",2.4,.85);sign.position.y=1.7;g.add(sign);
      g.position.copy(world(p));g.rotation.y=yaw(p.heading)+Math.PI;this.scene.add(g);
    }
    // Infield grandstand with coloured seats, canopies and a central timing tower.
    const stand=new THREE.Group(),structure=material("#e0d8bb"),roof=material(track.palette.accent),seats=material("#364f65");
    for(let row=0;row<4;row++)this.box(stand,row%2?roof:seats,0,.4+row*.43,row*.62,8,.35,.7);
    for(const x of [-4.3,4.3])this.box(stand,structure,x,1.8,1,.14,3.6,.16);
    this.box(stand,roof,0,3.6,1.1,9,.18,4.1);
    const label=this.sign("WUTBORG RACING",track.palette.accent,"#ffffff",7,.55);label.position.set(0,3.45,-1.05);label.rotation.y=Math.PI;stand.add(label);
    stand.position.copy(world(track.theme==="coast"?{x:1100,y:600}:{x:1000,y:1020}));this.scene.add(stand);
    if(track.theme==="coast"){
      const shore=this.mesh(new THREE.CircleGeometry(7.6,48),material("#f6e5ba"),this.scene,-3.2,.016,2.56);shore.rotation.x=-Math.PI/2;shore.castShadow=false;
      const lagoon=this.mesh(new THREE.CircleGeometry(6.85,48),material("#53bdc9",{roughness:.28,metalness:.28}),this.scene,-3.2,.025,2.56);lagoon.rotation.x=-Math.PI/2;lagoon.castShadow=false;
      for(const radius of [4.2,5.4,6.3]){
        const ripple=this.mesh(new THREE.TorusGeometry(radius,.025,3,64),new THREE.MeshBasicMaterial({color:"#d3f5df",transparent:true,opacity:.35}),this.scene,-3.2,.03,2.56);ripple.rotation.x=-Math.PI/2;ripple.castShadow=false;
      }
    }
    if(night){
      const towers=[],windows=[];
      for(let i=0;i<42;i++){
        const a=i/42*TAU,r=53+random()*12,h=4+random()*14,x=Math.cos(a)*r,z=Math.sin(a)*r;
        towers.push({x,y:h/2,z,sx:2+random()*2,sy:h,sz:2+random()*2});
        windows.push({x,y:h+.05,z,sx:2.2,sy:.09,sz:2.2});
      }
      this.instance(new THREE.BoxGeometry(1,1,1),material("#35435e"),towers);
      this.instance(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:"#d499fa"}),windows);
    }
  }
  createKart(driver){
    const group=new THREE.Group(),body=new THREE.Group(),parts=new THREE.Group();
    const paint=material(driver.color,{roughness:.35,metalness:.12}),accent=material(driver.accent,{roughness:.45});
    const dark=material("#202c3c"),metal=material("#91a7ae",{metalness:.65,roughness:.35}),visor=material("#162939",{metalness:.65,roughness:.18});
    this.box(parts,dark,0,.26,0,1.15,.18,1.9);
    this.box(parts,paint,0,.44,.25,1.07,.34,1.65);
    this.box(parts,paint,0,.40,1.0,1.27,.24,.38);
    this.box(parts,accent,0,.62,.67,.25,.025,.76);
    this.box(parts,dark,0,.64,-.22,.62,.34,.70);
    this.box(parts,paint,-.67,.4,-.17,.18,.32,.75);this.box(parts,paint,.67,.4,-.17,.18,.32,.75);
    this.box(parts,dark,-.43,.75,-.92,.09,.66,.12);this.box(parts,dark,.43,.75,-.92,.09,.66,.12);
    this.box(parts,paint,0,1.04,-.95,1.45,.12,.34);
    this.box(parts,accent,0,1.105,-.95,.4,.012,.34);
    this.box(parts,metal,0,.3,-1.03,1.28,.1,.1);
    // Driver: torso, a two-tone helmet and a dark wraparound visor.
    this.mesh(new THREE.CapsuleGeometry(.23,.28,3,8),accent,parts,0,.92,-.2);
    this.mesh(new THREE.SphereGeometry(.32,16,12),paint,parts,0,1.43,-.12);
    const stripe=this.mesh(new THREE.SphereGeometry(.325,12,10,0,TAU,0,.5),accent,parts,0,1.43,-.12);
    stripe.rotation.x=.12;
    const face=this.mesh(new THREE.SphereGeometry(.329,12,8,0,Math.PI,.9,.95),visor,parts,0,1.43,-.12);face.rotation.y=-Math.PI/2;
    for(const side of [-1,1]){
      const arm=this.mesh(new THREE.CapsuleGeometry(.09,.30,2,6),accent,parts,side*.26,1.02,.12);arm.rotation.x=.65;
      const pipe=this.mesh(new THREE.CylinderGeometry(.08,.08,.3,8),metal,parts,side*.43,.40,-1.05);pipe.rotation.x=Math.PI/2;
    }
    const steering=this.mesh(new THREE.TorusGeometry(.19,.035,6,12),dark,parts,0,.94,.38);steering.rotation.x=.6;
    body.add(this.bake(parts));group.add(body);
    const wheels=[];
    for(const z of [-.64,.69])for(const x of [-.73,.73]){
      const pivot=new THREE.Group();pivot.position.set(x,.3,z);
      const wheel=this.mesh(new THREE.CylinderGeometry(.29,.29,.23,12),dark,pivot);wheel.rotation.z=Math.PI/2;
      const hub=this.mesh(new THREE.CylinderGeometry(.14,.14,.245,10),metal,pivot);hub.rotation.z=Math.PI/2;
      body.add(pivot);wheels.push({pivot,front:z>0,wheel,hub});
    }
    const flames=[];
    for(const side of [-1,1]){
      const flame=this.mesh(new THREE.ConeGeometry(.16,.8,7),new THREE.MeshBasicMaterial({color:"#79e5ff"}),body,side*.43,.40,-1.48);
      flame.rotation.x=-Math.PI/2;flame.visible=false;flames.push(flame);
    }
    const shield=this.mesh(new THREE.SphereGeometry(1.35,20,12),new THREE.MeshBasicMaterial({color:"#ffe88f",wireframe:true,transparent:true,opacity:.16,depthWrite:false}),group,0,.8,0);shield.visible=false;shield.castShadow=false;
    const shadow=this.mesh(new THREE.CircleGeometry(1.1,20),new THREE.MeshBasicMaterial({color:"#172c2d",transparent:true,opacity:.23,depthWrite:false}),group,0,.018,0);
    shadow.rotation.x=-Math.PI/2;shadow.scale.y=1.3;shadow.castShadow=false;
    return {group,body,wheels,flames,shield};
  }
  emitParticle(position,color,vx=0,vz=0){
    const p=this.particleState[this.particleCursor++%this.particleState.length];
    Object.assign(p,{x:position.x,y:position.y,z:position.z,vx,vy:.6+Math.random(),vz,life:.32+Math.random()*.3,maxLife:.65,color});
  }
  sync(race,dt,options){
    const t=this.time,preview=!race.player;
    const list=preview?[{driver:options.driver,...race.track.at(-70,-25),speed:0,visualSteer:0}]:race.karts;
    list.forEach((k,i)=>{
      const e=this.karts[i];if(!e)return;
      e.group.position.copy(world(k,.04));
      e.group.rotation.y=yaw(k.heading);
      e.body.rotation.y=k.spinTimer>0?Math.sin(k.spinTimer*16)*Math.PI:k.drifting?-k.driftDirection*.15:0;
      e.body.rotation.z=damp(e.body.rotation.z,-(k.visualSteer||0)*Math.min(k.speed/600,.55)*.14,10,dt);
      e.body.position.y=(k.hop>0?Math.sin(k.hop/.25*Math.PI)*.25:0)+Math.sin(t*17+i)*Math.min(k.speed/18000,.02);
      e.wheels.forEach(w=>{if(w.front)w.pivot.rotation.y=-(k.visualSteer||0)*.36;w.wheel.rotation.x=t*k.speed*.02;});
      e.flames.forEach(f=>{f.visible=k.boostTimer>0;f.scale.y=1+Math.sin(t*38)*.22;});
      e.shield.visible=k.starTimer>0||k.invincibleTimer>0;e.shield.rotation.y=t;
      e.shield.material.color.set(k.starTimer>0?"#ffe88f":"#a3e6ff");
      e.shield.material.opacity=k.starTimer>0?.16:.07+Math.sin(t*12)*.035;
      if(!options.paused&&k.speed>100&&(k.drifting||k.boostTimer>0||k.offroad)){
        const color=k.offroad?race.track.palette.grass:k.boostTimer>0?"#79e5ff":k.driftTimer>=1.8?"#d99cff":k.driftTimer>=1.05?"#ffbd58":"#72deff";
        for(const side of [-1,1]){
          const p=new THREE.Vector3(side*.7,.20,-.8).applyAxisAngle(new THREE.Vector3(0,1,0),yaw(k.heading)).add(e.group.position);
          this.emitParticle(p,color,-Math.cos(k.heading)*2,-Math.sin(k.heading)*2);
        }
      }
    });
    this.itemMeshes.forEach((g,i)=>{
      g.visible=preview||Boolean(race.itemBoxes[i]&&race.itemBoxes[i].cooldown<=0);
      g.rotation.y=t*1.5+i;g.rotation.z=Math.sin(t*1.5+i)*.15;g.position.y=1+Math.sin(t*2.5+i)*.13;
    });
    this.coinMeshes.forEach((g,i)=>{g.visible=preview||Boolean(race.coins[i]&&race.coins[i].cooldown<=0);g.rotation.y=t*2.6;g.position.y=.7+Math.sin(t*3+i)*.1;});
    while(this.trapMeshes.length<race.traps.length){
      const m=this.mesh(new THREE.CylinderGeometry(.64,.7,.045,14),material("#2c2147",{metalness:.45,roughness:.18}),this.scene);
      m.castShadow=false;this.trapMeshes.push(m);
    }
    while(this.shellMeshes.length<race.shells.length){
      const m=this.mesh(new THREE.IcosahedronGeometry(.38,1),material("#82ffb5",{emissive:"#37b985",emissiveIntensity:.8}),this.scene);this.shellMeshes.push(m);
    }
    this.trapMeshes.forEach((m,i)=>{m.visible=Boolean(race.traps[i]);if(m.visible)m.position.copy(world(race.traps[i],.085));});
    this.shellMeshes.forEach((m,i)=>{
      const s=race.shells[i];m.visible=Boolean(s);if(!s)return;
      m.position.copy(world(s,.45));m.rotation.set(t*5,t*7,0);m.material.color.set(s.homing?"#ff8175":"#88efbd");
    });
    const dummy=this.scratch;
    this.particleState.forEach((p,i)=>{
      if(!options.paused)p.life=Math.max(0,p.life-dt);
      if(p.life>0){
        p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.vy-=dt*4;
        dummy.position.set(p.x,Math.max(.07,p.y),p.z);dummy.scale.setScalar(.085*p.life/p.maxLife);
        this.particles.setColorAt(i,new THREE.Color(p.color));
      }else{dummy.position.set(0,-100,0);dummy.scale.setScalar(0);}
      dummy.rotation.set(0,0,0);dummy.updateMatrix();this.particles.setMatrixAt(i,dummy.matrix);
    });
    this.particles.instanceMatrix.needsUpdate=true;if(this.particles.instanceColor)this.particles.instanceColor.needsUpdate=true;
  }
  updateCamera(race,dt){
    const p=race.player,portrait=this.camera.aspect<.9;
    let desired,look,fov;
    if(!p){
      const anchor=race.track.at(-45),position=world(anchor);
      const forward=new THREE.Vector3(Math.cos(anchor.heading),0,Math.sin(anchor.heading)),side=new THREE.Vector3(-forward.z,0,forward.x);
      desired=position.clone().addScaledVector(forward,-10.5).addScaledVector(side,-6+Math.sin(this.time*.12)*.6);desired.y=7.3;
      look=position.clone().addScaledVector(forward,4).addScaledVector(side,portrait?0:4.6);look.y=1;
      fov=portrait?65:57;
    }else{
      const delta=window.WutborgKartData.angleDelta(this.cameraHeading,p.heading);
      if(!this.cameraReady)this.cameraHeading=p.heading;else this.cameraHeading+=delta*(1-Math.exp(-7*dt));
      const forward=new THREE.Vector3(Math.cos(this.cameraHeading),0,Math.sin(this.cameraHeading)),position=world(p);
      const ratio=Math.min(1,Math.abs(p.speed)/400),boost=p.boostTimer>0;
      desired=position.clone().addScaledVector(forward,-(portrait?8.8:8.2)-ratio*.8);
      desired.y=(portrait?5.1:4.8)+ratio*.25;
      look=position.clone().addScaledVector(forward,portrait?5.5:7.5);look.y=.7;
      fov=(portrait?69:60)+ratio*5+(boost?5:0);
    }
    if(!this.cameraReady){this.camera.position.copy(desired);this.target.copy(look);this.cameraReady=true;}
    else{
      this.camera.position.lerp(desired,1-Math.exp(-10*dt));this.target.lerp(look,1-Math.exp(-14*dt));
    }
    this.camera.lookAt(this.target);this.camera.fov=damp(this.camera.fov,fov,6,dt);this.camera.updateProjectionMatrix();
  }
  draw(race,dt=.016,options={}){
    if(this.contextLost)return;
    if(!options.paused)this.time+=dt;
    if(!this.scene||race!==this.currentRace||(!race.player&&options.driver?.id!==this.previewDriver))this.createScene(race,options.driver);
    const w=Math.max(1,this.canvas.clientWidth),h=Math.max(1,this.canvas.clientHeight),pixel=this.renderer.getPixelRatio();
    if(this.canvas.width!==Math.round(w*pixel)||this.canvas.height!==Math.round(h*pixel)){
      this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
    }
    this.sync(race,options.paused?0:dt,options);
    this.updateCamera(race,options.paused?0:dt);
    this.renderer.render(this.scene,this.camera);
  }
}
