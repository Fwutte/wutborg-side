import * as THREE from "./vendor/three/three.module.js";
import { mergeGeometries } from "./vendor/three/addons/utils/BufferGeometryUtils.js";

import { SCALE, world, material, createLandscape } from "./kart-racer-world.js?v=20260911-art";
import { reflectionEnvironment, glowTexture, softSprite, energyShieldMaterial } from "./game-art-3d.js?v=20260911-art";
const TAU=Math.PI*2;
const yaw=h=>Math.PI/2-h;
const damp=(a,b,rate,dt)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-rate*dt));
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

export class KartRacer3DRenderer {
  constructor(canvas){
    this.canvas=canvas;this.compact=matchMedia("(pointer:coarse), (max-width:760px)").matches;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.compact?1.4:1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.enabled=!this.compact;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.camera=new THREE.PerspectiveCamera(62,1,.1,420);
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
      const list=batches.get(o.material)||[];const geo=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);
      list.push(geo);batches.set(o.material,list);
    });
    const result=new THREE.Group();
    for(const [mat,geos] of batches){
      const merged=mergeGeometries(geos,false);
      if(!merged)throw new Error("Kart geometry could not be batched");
      const mesh=this.mesh(merged,mat,result);mesh.receiveShadow=true;
      geos.forEach(g=>g.dispose());
    }
    group.traverse(o=>o.geometry?.dispose());return result;
  }
  disposeScene(){
    if(!this.scene)return;
    this.environmentTarget?.dispose();
    const geos=new Set(),mats=new Set(),textures=new Set();
    this.scene.traverse(o=>{
      o.shadow?.dispose?.();
      if(o.isInstancedMesh)o.dispose();
      if(o.geometry)geos.add(o.geometry);
      for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){
        mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);
      }
    });
    geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }
  ribbon(track,left,right,height,mat,alternating=false){
    const pos=[],colors=[],uv=[],color=new THREE.Color();
    for(let i=0;i<track.samples.length;i++){
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
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx||0,p.ry||0,p.rz||0,"YXZ");dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));
    });
    mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);return mesh;
  }
  scatter(geo,mat,entries){
    // Separate world cells let both the camera and shadow pass cull distant trees.
    const cells=new Map(),group=new THREE.Group();
    for(const entry of entries){const key=`${Math.floor(entry.x/28)},${Math.floor(entry.z/28)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(entry);}
    for(const cell of cells.values())group.add(this.instance(geo,mat,cell));
    this.scene.add(group);return group;
  }
  sign(text,bg="#152c37",fg="#f0ffc6",width=6,height=1.3){
    const canvas=document.createElement("canvas");canvas.width=Math.min(2048,Math.round(256*width/height));canvas.height=256;
    const ctx=canvas.getContext("2d");ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,256);
    ctx.fillStyle=fg;ctx.font="900 174px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(text,canvas.width/2,139,canvas.width*.93);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  }
  createScene(race,driver){
    this.disposeScene();this.scene=new THREE.Scene();this.scene.background=new THREE.Color(race.track.palette.sky);
    this.scene.fog=new THREE.Fog(race.track.palette.fog,85,230);
    this.environmentTarget=reflectionEnvironment(this.renderer);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.65;
    this.artGlow=glowTexture();
    this.currentRace=race;this.previewDriver=driver?.id;this.cameraReady=false;
    this.balloons=[];this.rotors=[];this.waterTime={value:0};
    this.karts=[];this.itemMeshes=[];this.coinMeshes=[];this.trapMeshes=[];this.shellMeshes=[];
    const track=race.track,night=track.theme==="night";
    this.scene.add(new THREE.HemisphereLight(night?0xb5cdff:0xe3f7ff,night?0x38476e:0x627752,night?1.5:1.2));
    const sun=new THREE.DirectionalLight(night?0xc2ceff:0xfff0d5,night?2.2:3.4);
    sun.position.set(-25,55,-35);sun.castShadow=!this.compact;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-32;sun.shadow.camera.right=32;sun.shadow.camera.top=32;sun.shadow.camera.bottom=-32;
    sun.shadow.camera.near=.1;sun.shadow.camera.far=150;sun.shadow.bias=-.0003;sun.shadow.normalBias=.06;this.scene.add(sun);this.scene.add(sun.target);this.sun=sun;
    this.ribbon(track,-track.halfWidth-62,track.halfWidth+62,.01,material(track.palette.grassDark));
    this.ribbon(track,-track.halfWidth-18,track.halfWidth+18,.03,material(track.palette.edge));
    const asphaltCanvas=document.createElement("canvas");asphaltCanvas.width=128;asphaltCanvas.height=128;
    const ac=asphaltCanvas.getContext("2d");ac.fillStyle=track.palette.road;ac.fillRect(0,0,128,128);
    const random=rng(14);
    for(let i=0;i<2200;i++){ac.fillStyle=random()>.5?"rgba(255,255,255,.055)":"rgba(0,0,0,.055)";ac.fillRect(random()*128,random()*128,1,1);}
    const asphalt=new THREE.CanvasTexture(asphaltCanvas);asphalt.wrapS=asphalt.wrapT=THREE.RepeatWrapping;asphalt.colorSpace=THREE.SRGBColorSpace;asphalt.anisotropy=4;
    this.ribbon(track,-track.halfWidth,track.halfWidth,.048,material("#ffffff",{map:asphalt,roughness:track.theme==="frost"?.23:.82,metalness:track.theme==="frost"?.25:.03,bumpMap:asphalt,bumpScale:.018}));
    const curb=material("#ffffff",{vertexColors:true});
    this.ribbon(track,-track.halfWidth-18,-track.halfWidth,.055,curb,true);
    this.ribbon(track,track.halfWidth,track.halfWidth+18,.055,curb,true);
    const dashes=[];
    for(let s=0;s<track.length;s+=90){
      for(const offset of [-track.halfWidth+9,track.halfWidth-9]){
        const p=track.at(s,offset),v=world(p,.06);
        dashes.push({x:v.x,y:v.y,z:v.z,rx:-Math.atan(p.slope),ry:yaw(p.heading)});
      }
    }
    const dash=this.instance(new THREE.BoxGeometry(.04,.008,.95),new THREE.MeshBasicMaterial({color:night?"#a1dfea":"#dedfd2"}),dashes);dash.castShadow=false;
    this.createStart(track);this.createScenery(track);this.createCourseFeatures(track);
    for(const pad of track.boostPads){
      const g=new THREE.Group(),m=material("#42dec9",{emissive:"#13775e",emissiveIntensity:1});
      this.box(g,m,0,.075,0,2.35,.07,1.8);
      const arrowMat=new THREE.MeshBasicMaterial({color:"#faffbb"});
      for(let j=-1;j<=1;j++)for(const side of [-1,1]){
        const bar=this.box(g,arrowMat,side*.34,.125,j*.47,.82,.02,.12);bar.rotation.y=side*Math.PI/6;
      }
      const baked=this.bake(g);baked.position.copy(world(pad));baked.rotation.set(-Math.atan(pad.slope),yaw(pad.heading),0,"YXZ");this.scene.add(baked);
    }
    const preview=race.karts.length?race.karts:[{driver:driver||window.WutborgKartData.DRIVERS[0],...track.at(-70,-25),speed:0}];
    preview.forEach(k=>{const visual=this.createKart(k.driver);this.karts.push(visual);this.scene.add(visual.group);});
    const boxMat=material("#8af6eb",{emissive:"#36bdb4",emissiveIntensity:.35,metalness:.4,roughness:.14});
    const boxFrame=material("#efffb8",{emissive:"#8bf4cd",emissiveIntensity:.6});
    for(const box of race.itemBoxes.length?race.itemBoxes:race.state==="ready"?track.itemBoxes:[]){
      const g=new THREE.Group();this.mesh(this.roundedGeometry(.94,.94,.94,.10),boxMat,g);
      for(const x of [-.52,.52])for(const y of [-.52,.52])this.box(g,boxFrame,x,y,0,.055,.055,1.09);
      for(const x of [-.52,.52])for(const z of [-.52,.52])this.box(g,boxFrame,x,0,z,.055,1.09,.055);
      for(const y of [-.52,.52])for(const z of [-.52,.52])this.box(g,boxFrame,0,y,z,1.09,.055,.055);
      const q=this.sign("?","#77e5ef","#154858",.66,.66);q.position.z=.483;g.add(q);
      for(let side=1;side<4;side++){const face=q.clone();face.rotation.y=side*Math.PI/2;face.position.set(Math.sin(side*Math.PI/2)*.483,0,Math.cos(side*Math.PI/2)*.483);g.add(face);}
      g.userData.baseY=(box.elevation||0)*SCALE;
      const baked=this.bake(g);baked.userData.baseY=g.userData.baseY;
      baked.position.copy(world(box,1));const aura=softSprite(this.artGlow,0x8effee,2.2,.24);baked.add(aura);this.scene.add(baked);this.itemMeshes.push(baked);
    }
    const coinMat=material("#ffda64",{metalness:.65,roughness:.25,emissive:"#b67c19",emissiveIntensity:.25});
    for(const coin of race.coins.length?race.coins:race.state==="ready"?track.coins:[]){
      const g=new THREE.Group(),mesh=this.mesh(new THREE.CylinderGeometry(.31,.31,.09,16),coinMat,g);mesh.rotation.x=Math.PI/2;
      const rim=this.mesh(new THREE.TorusGeometry(.265,.025,6,20),material("#ffefad",{metalness:.7,roughness:.2}),g,0,0,.057);
      const back=rim.clone();back.position.z=-.057;g.add(back);
      const emblem=this.mesh(new THREE.OctahedronGeometry(.15),coinMat,g,0,0,.065);emblem.scale.set(.65,1,.18);
      const baked=this.bake(g);baked.userData.baseY=(coin.elevation||0)*SCALE;
      baked.position.copy(world(coin,.7));this.scene.add(baked);this.coinMeshes.push(baked);
    }
    const particleGeo=new THREE.SphereGeometry(1,4,3),particleMat=new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:.85,depthWrite:false});
    this.particles=new THREE.InstancedMesh(particleGeo,particleMat,160);this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particles.frustumCulled=false;
    this.particleState=Array.from({length:160},()=>({life:0}));this.particleCursor=0;
    this.scene.add(this.particles);
    const skidGeometry=new THREE.PlaneGeometry(.095,.32);skidGeometry.rotateX(-Math.PI/2);
    this.skids=new THREE.InstancedMesh(skidGeometry,new THREE.MeshBasicMaterial({color:"#1c2835",transparent:true,opacity:.25,depthWrite:false}),480);
    this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.skids.frustumCulled=false;this.skidCursor=0;
    this.scratch.scale.setScalar(0);this.scratch.updateMatrix();
    for(let i=0;i<480;i++)this.skids.setMatrixAt(i,this.scratch.matrix);
    this.scene.add(this.skids);
  }
  createCourseFeatures(track){
    this.obstacleMeshes=[];
    for(const ramp of track.ramps){
      const g=new THREE.Group(),board=this.box(g,material("#ef9950"),0,.22,0,3.8,.16,2.9);board.rotation.x=-.2;
      for(const z of [-.8,0,.8]){const stripe=this.box(g,material("#fff1b0"),0,.26+z*.2,z,3.6,.04,.18);stripe.rotation.x=-.2;}
      const sign=this.sign("HOP", "#293c50", "#ffe69a",1.7,.65);sign.position.set(-2.5,1.4,0);g.add(sign);
      g.position.copy(world(ramp));g.rotation.y=yaw(ramp.heading);this.scene.add(this.bake(g));
    }
    if(track.shortcut){
      const entries=[];
      for(let s=track.shortcut[0]*track.length;s<track.shortcut[1]*track.length;s+=26){const p=track.at(s,-track.halfWidth-30),v=world(p,.07);entries.push({x:v.x,y:v.y,z:v.z,ry:yaw(p.heading),rx:-Math.atan(p.slope)});}
      this.instance(new THREE.BoxGeometry(1.5,.045,.86),material("#b9b575"),entries);
      for(const f of track.shortcut){const p=track.at(f*track.length,-track.halfWidth-35),sign=this.sign("GENVEJ →", "#283d37", "#ffee8b",2.9,.65);sign.position.copy(world(p,1.3));sign.rotation.y=yaw(p.heading)+Math.PI;this.scene.add(sign);}
    }
    for(const obstacle of track.obstacles){
      const g=new THREE.Group(),mat=material(obstacle.kind==="snowball"?"#f1fbff":obstacle.kind==="log"?"#795439":"#614c52");
      const geo=obstacle.kind==="log"?new THREE.CylinderGeometry(.48,.48,2,10):new THREE.DodecahedronGeometry(.74,1);
      const mesh=this.mesh(geo,mat,g,0,.7,0);if(obstacle.kind==="log")mesh.rotation.z=Math.PI/2;
      const ring=this.mesh(new THREE.RingGeometry(.85,1.0,24),new THREE.MeshBasicMaterial({color:"#ffc96b",transparent:true,opacity:.7,side:THREE.DoubleSide}),g,0,.09,0);ring.rotation.x=-Math.PI/2;
      this.scene.add(g);this.obstacleMeshes.push({group:g,mesh,obstacle});
    }
    const positions=[];for(let i=0;i<130;i++)positions.push((i*17%60)-30,2+i*13%18,(i*23%60)-30);
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    this.weather=new THREE.Points(geo,new THREE.PointsMaterial({color:track.theme==="volcano"?"#ffb759":track.theme==="frost"?"#ffffff":"#dff697",size:track.theme==="frost"?.12:.06,transparent:true,opacity:.65,depthWrite:false}));
    this.weather.visible=["volcano","frost","jungle"].includes(track.theme);this.scene.add(this.weather);
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
      grids.push({x:v.x,y:v.y,z:v.z,rx:-Math.atan(p.slope),ry:yaw(p.heading)});
    }
    const grid=this.instance(new THREE.BoxGeometry(1.5,.01,.07),new THREE.MeshBasicMaterial({color:"#dae0d6"}),grids);grid.castShadow=false;
  }
  createScenery(track){createLandscape(this,track);}
  roundedGeometry(w,h,d,r=.09){
    r=Math.min(r,w/4,h/4,d/4);
    const x=w/2-r,y=h/2-r,c=r*.5,shape=new THREE.Shape();
    shape.moveTo(-x+c,-y);shape.lineTo(x-c,-y);shape.quadraticCurveTo(x,-y,x,-y+c);
    shape.lineTo(x,y-c);shape.quadraticCurveTo(x,y,x-c,y);shape.lineTo(-x+c,y);
    shape.quadraticCurveTo(-x,y,-x,y-c);shape.lineTo(-x,-y+c);shape.quadraticCurveTo(-x,-y,-x+c,-y);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:3,steps:1,curveSegments:4});
    geo.translate(0,0,-(d-2*r)/2);geo.computeVertexNormals();return geo;
  }
  createKart(driver){
    const group=new THREE.Group(),body=new THREE.Group(),parts=new THREE.Group();
    const paint=new THREE.MeshPhysicalMaterial({color:driver.color,roughness:.28,metalness:.22,clearcoat:1,clearcoatRoughness:.2});
    const accent=material(driver.accent,{roughness:.36}),dark=material("#182735",{roughness:.86});
    const metal=material("#bad0d7",{metalness:.8,roughness:.23}),visor=material("#103d52",{metalness:.65,roughness:.1});
    const round=(mat,x,y,z,w,h,d,r=.10)=>this.mesh(this.roundedGeometry(w,h,d,r),mat,parts,x,y,z);
    round(dark,0,.27,0,1.22,.2,2.12,.07);
    round(paint,0,.43,.17,1.13,.40,1.82,.14);
    const nose=round(paint,0,.43,.99,1.28,.26,.62,.10);nose.rotation.x=.1;
    round(accent,0,.655,.72,.18,.025,.87,.006);
    round(dark,0,.70,-.35,.61,.59,.55,.10);
    round(accent,0,.96,-.58,.49,.19,.1,.035);
    for(const side of [-1,1]){
      round(paint,side*.69,.42,-.22,.32,.32,.95,.09);
      round(accent,side*.85,.44,-.22,.015,.065,.60,.004);
      round(dark,side*.40,.77,-.99,.075,.61,.12,.02);
      const suspension=this.mesh(new THREE.CylinderGeometry(.035,.035,1.43,8),metal,parts,0,.3,side*.65);suspension.rotation.z=Math.PI/2;
      const lamp=material("#f9ffdc",{emissive:"#e4ffac",emissiveIntensity:.6});
      round(lamp,side*.39,.47,1.31,.22,.06,.027,.009);
      round(material("#ff5b56",{emissive:"#fc3930",emissiveIntensity:.65}),side*.40,.49,-.98,.18,.06,.028,.008);
    }
    round(paint,0,1.12,-1.04,1.57,.13,.45,.045);
    for(const side of [-1,1])round(paint,side*.76,1.15,-1.04,.07,.21,.47,.02);
    round(accent,0,1.19,-1.04,.23,.015,.36,.004);
    round(metal,0,.29,-1.13,1.36,.1,.1,.03);
    // Tailored suit, gloves, helmet trim and a glossy wraparound visor.
    this.mesh(new THREE.CapsuleGeometry(.235,.29,4,12),accent,parts,0,.97,-.21);
    this.mesh(new THREE.SphereGeometry(.345,24,16),paint,parts,0,1.49,-.13);
    const stripe=this.mesh(new THREE.SphereGeometry(.350,20,12,0,TAU,0,.48),accent,parts,0,1.49,-.13);stripe.rotation.x=.12;
    const face=this.mesh(new THREE.SphereGeometry(.354,20,12,0,Math.PI,.85,.92),visor,parts,0,1.49,-.13);face.rotation.y=0;
    const glint=this.mesh(new THREE.SphereGeometry(.357,12,6,0,.80,.94,.08),material("#bcf3f4",{metalness:.5,roughness:.15}),parts,0,1.49,-.13);glint.rotation.y=.9;
    for(const side of [-1,1]){
      const arm=this.mesh(new THREE.CapsuleGeometry(.095,.31,3,9),accent,parts,side*.27,1.07,.14);arm.rotation.x=.67;
      this.mesh(new THREE.SphereGeometry(.11,10,7),dark,parts,side*.24,.94,.31);
      const pipe=this.mesh(new THREE.CylinderGeometry(.105,.105,.36,12),metal,parts,side*.43,.42,-1.11);pipe.rotation.x=Math.PI/2;
      const opening=this.mesh(new THREE.CircleGeometry(.08,12),dark,parts,side*.43,.42,-1.30);opening.rotation.y=Math.PI;
    }
    const steering=this.mesh(new THREE.TorusGeometry(.21,.032,8,16),dark,parts,0,.98,.39);steering.rotation.x=.65;
    const number=String(window.WutborgKartData.DRIVERS.indexOf(driver)+1).padStart(2,"0");
    const plate=this.sign(number,driver.color,"#ffffff",.35,.24);plate.position.set(0,.52,-.76);plate.rotation.y=Math.PI;parts.add(plate);
    body.add(this.bake(parts));group.add(body);
    const wheels=[],rubber=material("#19212b",{roughness:.98});
    for(const z of [-.68,.74])for(const x of [-.80,.80]){
      const pivot=new THREE.Group();pivot.position.set(x,.32,z);
      const pieces=new THREE.Group();
      const tire=this.mesh(new THREE.TorusGeometry(.235,.105,10,20),rubber,pieces);tire.rotation.y=Math.PI/2;tire.scale.z=1.25;
      const hub=this.mesh(new THREE.CylinderGeometry(.19,.19,.25,16),metal,pieces);hub.rotation.z=Math.PI/2;
      for(const side of [-1,1]){
        const disk=this.mesh(new THREE.CircleGeometry(.145,16),dark,pieces,side*.132,0,0);disk.rotation.y=side*Math.PI/2;
        for(let i=0;i<5;i++){
          const a=i/5*TAU,spoke=this.box(pieces,metal,side*.14,Math.sin(a)*.065,Math.cos(a)*.065,.025,.035,.15);spoke.rotation.x=-a;
        }
        const cap=this.mesh(new THREE.SphereGeometry(.065,10,6),accent,pieces,side*.15,0,0);cap.scale.x=.3;
      }
      for(let tread=0;tread<20;tread++){const a=tread/20*TAU;const strip=this.box(pieces,dark,0,Math.sin(a)*.327,Math.cos(a)*.327,.22,.035,.045);strip.rotation.x=-a;}
      const wheel=this.bake(pieces);pivot.add(wheel);body.add(pivot);wheels.push({pivot,front:z>0,wheel});
    }
    const flames=[];
    for(const side of [-1,1]){
      const flame=this.mesh(new THREE.ConeGeometry(.18,.95,10),new THREE.MeshBasicMaterial({color:"#7cecff"}),body,side*.43,.42,-1.70);
      flame.rotation.x=-Math.PI/2;flame.visible=false;flames.push(flame);
      const flare=softSprite(this.artGlow,0x63dfff,1.4,.7);flare.position.set(side*.43,.42,-1.45);body.add(flare);flare.visible=false;flames.push(flare);
    }
    const shield=this.mesh(new THREE.SphereGeometry(1.45,24,16),energyShieldMaterial("#ffe88f",.22),group,0,.8,0);shield.visible=false;shield.castShadow=false;
    const shadow=this.mesh(new THREE.PlaneGeometry(3.1,3.1),new THREE.MeshBasicMaterial({map:this.artGlow,color:"#071824",transparent:true,opacity:.5,depthWrite:false}),group,0,.018,0);
    shadow.rotation.x=-Math.PI/2;shadow.scale.y=1.35;shadow.castShadow=false;
    return {group,body,wheels,flames,shield};
  }
  emitParticle(position,color,vx=0,vz=0){
    const p=this.particleState[this.particleCursor++%this.particleState.length];
    Object.assign(p,{x:position.x,y:position.y,z:position.z,vx,vy:.6+Math.random(),vz,life:.32+Math.random()*.3,maxLife:.65,color});
  }
  sync(race,dt,options){
    const t=this.time,preview=!race.player;
    this.obstacleMeshes?.forEach(({group,mesh,obstacle})=>{group.position.copy(world(race.track.obstacleAt(obstacle,race.elapsed)));mesh.rotation.x=t*2;});
    if(this.weather){this.weather.position.copy(world(race.player||race.track.start));const pos=this.weather.geometry.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,2+(i*13+t*(race.track.theme==="volcano"?1.4:-1.2)+2000)%18);pos.needsUpdate=true;}
    this.waterTime.value=t;
    this.balloons.forEach((b,i)=>{b.group.position.y=b.y+Math.sin(t*.55+i)*.45;b.group.rotation.z=Math.sin(t*.3+i)*.03;});
    this.rotors.forEach((g,i)=>g.rotation.z=t*.55+i);
    const list=preview?[{driver:options.driver,...race.track.at(-70,-25),speed:0,visualSteer:0}]:race.karts;
    list.forEach((k,i)=>{
      const e=this.karts[i];if(!e)return;
      e.group.position.copy(world(k,.04+(k.airHeight||0)*SCALE));
      e.group.rotation.set(-Math.atan(k.slope||0),yaw(k.heading),0,"YXZ");
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
          if(k.drifting&&!k.offroad&&dt>0){
            this.scratch.position.copy(p);this.scratch.position.y=e.group.position.y+.025;
            this.scratch.rotation.set(-Math.atan(k.slope||0),yaw(k.velocityHeading),0,"YXZ");this.scratch.scale.set(1,1,Math.max(.5,k.speed*dt*SCALE/.32));this.scratch.updateMatrix();
            this.skids.setMatrixAt(this.skidCursor++%480,this.scratch.matrix);this.skids.instanceMatrix.needsUpdate=true;
          }
        }
      }
    });
    this.itemMeshes.forEach((g,i)=>{
      g.visible=preview||Boolean(race.itemBoxes[i]&&race.itemBoxes[i].cooldown<=0);
      g.rotation.y=t*1.5+i;g.rotation.z=Math.sin(t*1.5+i)*.15;g.position.y=g.userData.baseY+1+Math.sin(t*2.5+i)*.13;
    });
    this.coinMeshes.forEach((g,i)=>{g.visible=preview||Boolean(race.coins[i]&&race.coins[i].cooldown<=0);g.rotation.y=t*2.6;g.position.y=g.userData.baseY+.7+Math.sin(t*3+i)*.1;});
    while(this.trapMeshes.length<race.traps.length){
      const m=this.mesh(new THREE.CylinderGeometry(.64,.7,.045,14),material("#2c2147",{metalness:.45,roughness:.18}),this.scene);
      m.castShadow=false;this.trapMeshes.push(m);
    }
    while(this.shellMeshes.length<race.shells.length){
      const m=this.mesh(new THREE.IcosahedronGeometry(.38,1),material("#82ffb5",{emissive:"#37b985",emissiveIntensity:.8}),this.scene);this.shellMeshes.push(m);
    }
    this.trapMeshes.forEach((m,i)=>{m.visible=Boolean(race.traps[i]);if(m.visible){const p=race.traps[i],road=race.track.nearest(p.x,p.y);m.position.copy(world({...p,elevation:road.elevation},.085));}});
    this.shellMeshes.forEach((m,i)=>{
      const s=race.shells[i];m.visible=Boolean(s);if(!s)return;
      const road=race.track.nearest(s.x,s.y,s.roadIndex);m.position.copy(world({...s,elevation:road.elevation},.45));m.rotation.set(t*5,t*7,0);m.material.color.set(s.homing?"#ff8175":"#88efbd");
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
      desired=position.clone().addScaledVector(forward,-10.5).addScaledVector(side,-6+Math.sin(this.time*.12)*.6);desired.y=position.y+7.3;
      look=position.clone().addScaledVector(forward,4).addScaledVector(side,portrait?0:4.6);look.y=position.y+1;
      fov=portrait?65:57;
    }else{
      const delta=window.WutborgKartData.angleDelta(this.cameraHeading,p.heading);
      if(!this.cameraReady)this.cameraHeading=p.heading;else this.cameraHeading+=delta*(1-Math.exp(-7*dt));
      const forward=new THREE.Vector3(Math.cos(this.cameraHeading),0,Math.sin(this.cameraHeading)),position=world(p);
      const ratio=Math.min(1,Math.abs(p.speed)/400),boost=p.boostTimer>0;
      desired=position.clone().addScaledVector(forward,-(portrait?8.8:8.2)-ratio*.8);
      desired.y=position.y+(portrait?5.1:4.8)+ratio*.25;
      const behind=race.track.at(p.road.s-290);desired.y=Math.max(desired.y,behind.elevation*SCALE+2.5);
      look=position.clone().addScaledVector(forward,portrait?5.5:7.5);look.y=race.track.elevationAt(p.road.s+200)*SCALE+.7;
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
    this.sun.position.copy(this.target).add(new THREE.Vector3(-25,55,-35));this.sun.target.position.copy(this.target);
    this.renderer.render(this.scene,this.camera);
  }
}
