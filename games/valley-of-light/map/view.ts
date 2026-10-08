import { TRAVELER_SIZE_MULTIPLIER } from '../traveler';
import { BasicMaterial, Camera3D, CartesianTransform3D, DirectionalLight, Entity, EnvironmentLight, HaiyueEngine, Mesh3D, OrbitControl, PbrMaterial, SphericalTransform3D, createBox3D, createPlane3D, type Scene } from '@haiyue/engine';
import { createCylinder3D, createPathExtrusion3D, Geometry3D } from '@haiyue/engine/geometry';
import { applyGltfAnimationClip, createGltfPlugin, GltfModelComponent } from '@haiyue/extensions/gltf';
import { mat4 } from 'wgpu-matrix';
import { Ray, type RayHit } from '@haiyue/engine/math';
import { RAD, add, length, connections, groupPoint, emptyPoses, localSamples, objectSample, isWalkable, pathCorner, rotate, sub, mul, wheelFrame, waterWeights, surfaceIndexAt, walkSurfaces, prismOutline, unit, worldSample, worldSamples, type MapObject, type MapPoses, type MapRuntime, type CornerId, type ValleyMap, type Vec3 } from './model';
import { analyzeStaticPaths, canAttachPillar, defaultPillarOffset } from './model';
import { startStaticCompilation, type StaticPrimitive, type StaticCompilation } from './staticCompiler';
import { seaGeometry } from './scenery';
import { beginWheelDrag, type Point2, type WheelDrag } from './wheelDrag';
import { advanceWheelState, createWheelState, wheelShape, WHEEL_FOLD_DURATION, type WheelState } from './wheelState';

const color=(s:string):[number,number,number,number]=>[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255,1];
function matrix(p:Vec3,r:Vec3):Float32Array {return mat4.multiply(mat4.translation(p),mat4.multiply(mat4.rotationY(r[1]*RAD),mat4.multiply(mat4.rotationX(r[0]*RAD),mat4.rotationZ(r[2]*RAD)))) as Float32Array;}
export class MapView {
  readonly scene:Scene; readonly camera=new Camera3D({type:'orthographic',near:.1,far:500,left:-10,right:10,top:8,bottom:-8});
  readonly model:GltfModelComponent; readonly actorTransform=new CartesianTransform3D();
  readonly orbitTransform=new SphericalTransform3D({radius:150,theta:Math.PI/4,phi:Math.acos(1/Math.sqrt(3)),target:[0,0,0]});
  private orbit:OrbitControl|null=null;private orbitRegion='';
  private actor:Entity; private root=new Entity('Map objects'); private objects=new Map<string,{entity:Entity;transform:CartesianTransform3D;material:PbrMaterial;button:CartesianTransform3D|null;wheel:CartesianTransform3D|null;mount:CartesianTransform3D|null}>();
  private groupTransforms=new Map<string,CartesianTransform3D>(); private map:ValleyMap|null=null;
  private readonly pickRay=new Ray();private readonly pickHit:RayHit={distance:Infinity,point:new Float32Array(3),normal:new Float32Array(3)};
  private pickMeshes:Array<{id:string;entity:Entity;mesh:Mesh3D}>=[];
  private readonly occlusionRay=new Ray();
  private portalMap:ValleyMap|null=null;private portalKey='';
  private portals:Array<{a:string;b:string;from:Vec3;to:Vec3;up:Vec3}>=[];
  private travelerPresentation={position:[0,0,0] as Vec3,logicalScreen:[0,0] as [number,number],depthOffset:0,occluders:[] as string[]};
  private box=createBox3D(); private disk=createCylinder3D({radiusTop:.32,radiusBottom:.32,height:.1,radialSegments:32});
  private materials=new Map<string,PbrMaterial>(); private animationTime=0; private animation='Idle';
  private waters=new Map<string,Geometry3D>(); private waterTime=0;
  private wheelVisuals=new Map<string,{state:WheelState;arms:Array<{axis:'x'|'y';sign:number;spoke:CartesianTransform3D;grip:CartesianTransform3D}>}>();
  private cancelCompilation:(()=>void)|null=null;private generation=0;
  private syncMap:ValleyMap|null=null;private syncKey='';private syncCount=0;
  private optimization:{state:'off'|'pending'|'ready'|'error';objects:number;stats:StaticCompilation['stats']|null;error?:string}={state:'off',objects:0,stats:null};
  performanceSnapshot():unknown{return {...this.optimization,syncCount:this.syncCount};}
  scale=45;centerX=0;centerY=0;width=1;height=1;
  constructor(readonly engine:HaiyueEngine,modelUrl:string,guiChars='') {
    const camera=new Entity('Map orthographic camera').addComponent(this.camera).addComponent(this.orbitTransform);
    this.scene=engine.createScene({name:'Valley map',camera,view:{clearColor:{r:.9,g:.927,b:.902,a:1}},render3D:true,render2D:false,gui:guiChars?{loadOp:'load',font:{chars:guiChars,fontFamily:'Microsoft YaHei, sans-serif',fontSize:32,atlasSize:2048}}:false});
    this.scene.installPlugin(createGltfPlugin());
    // Real cast shadows disclose the hidden depth offset at optical seams. Keep face lighting only.
    this.scene.add(new Entity('Map sunlight').addComponent(new DirectionalLight({direction:[-.5,-1,-.3],intensity:2.4,color:[1,.96,.85],castShadow:false})));
    this.scene.add(new Entity('Map skylight').addComponent(new EnvironmentLight({intensity:.85,diffuseColor:[.75,.85,.8]})));
    this.scene.add(this.root);
    this.model=new GltfModelComponent({src:modelUrl,autoLoad:true,clearPrevious:true});
    this.actor=new Entity('Traveler').addComponent(this.actorTransform).addComponent(this.model); this.actor.disabled=true;this.scene.add(this.actor);
    // A small surface-local contact shadow follows the traveler through seams and onto wall faces.
    const shadow=document.createElement('canvas');shadow.width=shadow.height=64;
    const context=shadow.getContext('2d')!,gradient=context.createRadialGradient(32,32,3,32,32,31);
    gradient.addColorStop(0,'rgba(31,39,30,0.25)');gradient.addColorStop(.4,'rgba(31,39,30,0.15)');gradient.addColorStop(1,'rgba(31,39,30,0)');context.fillStyle=gradient;context.fillRect(0,0,64,64);
    this.actor.addChild(new Entity('Traveler contact shadow').addComponent(new CartesianTransform3D({position:[0,.008,0],scale:[.6,1,.45]})).addComponent(new Mesh3D(createPlane3D({width:1,height:1,normal:'y'}),new BasicMaterial({texture:shadow,blending:'normal',depthWrite:false,cullMode:'none'}))));
  }
  private material(hex:string):PbrMaterial {let m=this.materials.get(hex);if(!m){m=new PbrMaterial({baseColor:color(hex),roughness:.92,metallic:0});this.materials.set(hex,m);}return m;}
  private part(parent:Entity,name:string,p:Vec3,s:Vec3,hex:string,geometry:Geometry3D=this.box):CartesianTransform3D {
    const t=new CartesianTransform3D({position:p,scale:s});parent.addChild(new Entity(name).addComponent(t).addComponent(new Mesh3D(geometry,this.material(hex))));return t;
  }
  wheelCenter(o:MapObject,poses=emptyPoses()):Vec3 {return wheelFrame(this.map!,o,poses).center;}
  private handwheel(parent:Entity,o:MapObject):{wheel:CartesianTransform3D;mount:CartesianTransform3D} {
    const {base,hub,spokes,tips}=o.colors,mount=new CartesianTransform3D(),assembly=new Entity('Coaxial wheel mount').addComponent(mount);parent.addChild(assembly);
    const socket=this.part(assembly,'Octagonal wall socket',[0,0,-.57],[1,1,1],base,createCylinder3D({radiusTop:.25,radiusBottom:.25,height:.16,radialSegments:8}));socket.setRotation(Math.PI/2,0,0);
    this.part(assembly,'Square spindle',[0,0,-.33],[.17,.17,.48],spokes);
    const transform=new CartesianTransform3D(),wheel=new Entity('Four-arm handwheel').addComponent(transform);assembly.addChild(wheel);
    // A chamfered block with a through-hole, rather than a rounded torus.
    const outline:Array<[number,number]>=[[-.2,-.32],[.2,-.32],[.32,-.2],[.32,.2],[.2,.32],[-.2,.32],[-.32,.2],[-.32,-.2]];
    const hole=outline.map(([x,y])=>{const r=.155/Math.hypot(x,y);return [x*r,y*r] as [number,number];});
    const path=[{position:[0,0,-.14] as Vec3},{position:[0,0,.14] as Vec3}];
    this.part(wheel,'Octagonal hub walls',[0,0,0],[1,1,1],hub,createPathExtrusion3D({path,shape:[...outline].reverse()}));
    this.part(wheel,'Through-hole walls',[0,0,0],[1,1,1],hub,createPathExtrusion3D({path,shape:hole}));
    const positions:number[]=[],normals:number[]=[];
    for(const z of [-.14,.14])for(let i=0;i<8;i++){
      const j=(i+1)%8,a=outline[i]!,b=outline[j]!,c=hole[j]!,d=hole[i]!;
      for(const p of [a,b,c,a,c,d]){positions.push(p[0],p[1],z);normals.push(0,0,Math.sign(z));}
    }
    this.part(wheel,'Flat annular hub faces',[0,0,0],[1,1,1],hub,new Geometry3D({positions:new Float32Array(positions),normals:new Float32Array(normals),cullMode:'none'}));
    const arms:Array<{axis:'x'|'y';sign:number;spoke:CartesianTransform3D;grip:CartesianTransform3D}>=[];
    for(const sign of [-1,1])for(const axis of ['x','y'] as const){
      const horizontal=axis==='x';
      const spoke=this.part(wheel,'Retractable square spoke',horizontal?[sign*.47,0,0]:[0,sign*.47,0],horizontal?[.4,.1,.1]:[.1,.4,.1],spokes);
      const grip=this.part(wheel,'Retractable cube grip',horizontal?[sign*.76,0,0]:[0,sign*.76,0],[.24,.24,.24],tips);
      arms.push({axis,sign,spoke,grip});
    }
    this.wheelVisuals.set(o.id,{state:createWheelState(),arms});
    this.registerPickMeshes(assembly,o.id);return {wheel:transform,mount};
  }
  setMap(map:ValleyMap,fit=false,optimize=false):void {
    this.cancelCompilation?.();this.cancelCompilation=null;this.generation++;this.syncMap=null;this.optimization={state:'off',objects:0,stats:null};
    this.scene.remove(this.root);this.root.destroy();this.root=new Entity('Map objects');this.scene.add(this.root);this.objects.clear();this.groupTransforms.clear();this.waters.clear();this.wheelVisuals.clear();this.pickMeshes=[];this.map=map;this.portalMap=null;
    const groups=new Map<string,Entity>();
    for(const g of map.groups){const t=new CartesianTransform3D(),e=new Entity(g.name).addComponent(t);this.root.addChild(e);groups.set(g.id,e);this.groupTransforms.set(g.id,t);}
    for(const o of map.objects) {
      const t=new CartesianTransform3D(),e=new Entity(`${o.type} · ${o.name}`).addComponent(t),hex=o.colors.surface;
      (o.groupId&&!o.attachment?groups.get(o.groupId)!:this.root).addChild(e);
      const m=new PbrMaterial({baseColor:color(hex),roughness:o.type===11?.3:.92,metallic:o.type===11?.1:0});let button:CartesianTransform3D|null=null,wheel:CartesianTransform3D|null=null,mount:CartesianTransform3D|null=null;
      if(o.type===11){const geometry=seaGeometry(o);e.addComponent(new Mesh3D(geometry,m));this.waters.set(o.id,geometry);}
      else if(o.type===12){
        for(const [name,y,height,radius] of [['Slender pillar',o.rise/2,o.rise,o.width/2],['Pillar foot',.035,.07,o.width*.8],['Pillar capital',o.rise-.025,.05,o.width*.75]] as const)e.addChild(new Entity(name).addComponent(new CartesianTransform3D({position:[0,y,0]})).addComponent(new Mesh3D(createCylinder3D({radiusTop:radius,radiusBottom:radius,height,radialSegments:12}),m)));
      }
      else if(o.type===2){for(let i=0;i<o.steps;i++){const y=(i+1)*o.rise/o.steps;e.addChild(new Entity('Stair tread').addComponent(new CartesianTransform3D({position:[-o.length/2+(i+.5)*o.length/o.steps,y-o.thickness/2,0],scale:[o.length/o.steps,o.thickness,o.width]})).addComponent(new Mesh3D(this.box,m)));}}
      else if(o.type===5) {
        const outline=prismOutline(o);
        // Vertical extrusion: the engine's Y-tangent frame uses right=-X, up=Z.
        const geometry=createPathExtrusion3D({path:[{position:[0,-o.thickness,0]},{position:[0,0,0]}],shape:outline.map(p=>[-p[0],p[2]] as [number,number])});
        e.addComponent(new Mesh3D(geometry,m));
        for(const y of [-o.thickness,0]){
          const cap=new Geometry3D({positions:new Float32Array(outline.flatMap(p=>[p[0],y,p[2]])),normals:new Float32Array(outline.flatMap(()=>[0,y===0?1:-1,0])),cullMode:'none'});
          e.addChild(new Entity('Half-cube triangular cap').addComponent(new CartesianTransform3D()).addComponent(new Mesh3D(cap,m)));
        }
      }
      else if([6,7].includes(o.type)) {
        const shape:Array<[number,number]>=[[-o.width/2,0],[o.width/2,0],[o.width/2,-o.thickness],[-o.width/2,-o.thickness]];
        const samples=localSamples(o),geometry=createPathExtrusion3D({path:samples.map(s=>({position:s.point,roll:s.roll})),shape});
        // The public extrusion builds the sides. Close each end in its actual tangent/roll frame.
        e.addComponent(new Mesh3D(geometry,m));
        for(const i of [0,samples.length-1]) {
          const s=samples[i]!,a=samples[Math.max(0,i-1)]!.point,b=samples[Math.min(samples.length-1,i+1)]!.point;
          const frame=mat4.multiply(matrix(s.point,[s.roll/RAD,-Math.atan2(b[2]-a[2],b[0]-a[0])/RAD,0]),mat4.translation([0,-o.thickness/2,0]));
          const transform=new CartesianTransform3D();transform.setMatrix(mat4.multiply(frame,mat4.scaling([.015,o.thickness,o.width])));
          e.addChild(new Entity('Path end').addComponent(transform).addComponent(new Mesh3D(this.box,m)));
        }
      } else {const p=new Entity('Walkable surface').addComponent(new CartesianTransform3D({position:[0,-o.thickness/2,0],scale:[o.length,o.thickness,o.width]})).addComponent(new Mesh3D(this.box,m));e.addChild(p);}
      if(o.type===3)({wheel,mount}=this.handwheel(this.root,o));
      if(o.type===4)for(const x of [-.22,0,.22])this.part(e,'Slide grip',[x,.04,0],[.065,.08,o.width*.7],'#f1f0d9');
      if(o.type===8){button=this.part(e,'Pressure plate',[0,.075,0],[1,1,1],'#dd805d',this.disk);this.part(e,'Switch center',[0,.14,0],[.13,.02,.13],'#fff0c0');}
      if(o.type===9){this.part(e,'Start marker',[0,.02,0],[.28,.04,.28],'#ebf1bb');this.part(e,'Start pennant',[-o.length*.3,.36,-o.width*.3],[.04,.72,.04],'#769486');}
      if(o.type===10){for(const z of [-o.width*.38,o.width*.38])this.part(e,'Exit column',[o.length*.3,.65,z],[.16,1.3,.16],'#eaddb9');this.part(e,'Exit lintel',[o.length*.3,1.38,0],[.25,.22,o.width],'#dac17f');e.addChild(new Entity('Exit light').addComponent(new CartesianTransform3D({position:[o.length*.3,.62,0],scale:[.035,1.2,o.width*.6]})).addComponent(new Mesh3D(this.box,new BasicMaterial({color:[1,.92,.63,1]}))));}
      this.objects.set(o.id,{entity:e,transform:t,material:m,button,wheel,mount});this.registerPickMeshes(e,o.id);
    }
    this.sync(map,emptyPoses());if(fit)this.fit();if(optimize)this.compileStatic(map);
  }
  private compileStatic(map:ValleyMap):void {
    const plan=map.renderPlan??analyzeStaticPaths(map),ids=new Set(plan.batches.flat().map(i=>map.objects[i]!.id));
    const sources=this.pickMeshes.filter(p=>ids.has(p.id)),generation=this.generation;
    this.optimization={state:'pending',objects:ids.size,stats:null};
    const primitives:StaticPrimitive[]=sources.map(({id,entity,mesh})=>{
      let world=mat4.identity();const chain:Entity[]=[];for(let parent:Entity|null=entity;parent;parent=parent.parent)chain.unshift(parent);
      for(const parent of chain){const transform=parent.getComponent(CartesianTransform3D);if(transform)world=mat4.multiply(world,transform.localMatrix);}
      const g=mesh.geometry;return {positions:g.positions.slice(),normals:g.normals?.slice()??null,indices:g.indices?.slice()??null,matrix:Array.from(world),box:g===this.box,color:map.objects.find(o=>o.id===id)!.colors.surface,cullMode:g.cullMode??'back',frontFace:g.frontFace??'ccw'};
    });
    this.cancelCompilation=startStaticCompilation(primitives,result=>{
      if(generation!==this.generation)return;
      // Keep source entities/geometry for exact per-object picking and optical depth correction.
      // Only their render components are replaced by the immutable material batches.
      for(const batch of result.batches)this.root.addChild(new Entity('Static path batch').addComponent(new CartesianTransform3D()).addComponent(new Mesh3D(new Geometry3D(batch),this.material(batch.color))));
      for(const {entity,mesh} of sources)entity.removeComponent(mesh);
      this.optimization={state:'ready',objects:ids.size,stats:result.stats};this.cancelCompilation=null;
    },error=>{if(generation!==this.generation)return;this.optimization={state:'error',objects:ids.size,stats:null,error};this.cancelCompilation=null;});
  }
  sync(map:ValleyMap,poses:MapPoses,selected:readonly string[]=[]):void {
    const key=JSON.stringify([poses,selected]);if(this.syncMap===map&&this.syncKey===key)return;
    this.syncMap=map;this.syncKey=key;this.syncCount++;this.map=map;
    for(const g of map.groups){const p=groupPoint(map,g.id,[0,0,0],poses),x=sub(groupPoint(map,g.id,[1,0,0],poses),p),y=sub(groupPoint(map,g.id,[0,1,0],poses),p),z=sub(groupPoint(map,g.id,[0,0,1],poses),p);this.groupTransforms.get(g.id)?.setMatrix(new Float32Array([...x,0,...y,0,...z,0,...p,1]));}
    for(const o of map.objects){const r=this.objects.get(o.id);if(!r)continue;
      const sample=(point:Vec3)=>o.attachment?worldSample(map,o,{point,up:[0,1,0],roll:0},poses).point:objectSample(o,{point,up:[0,1,0],roll:0},poses).point;
      const p=sample([0,0,0]),x=sub(sample([1,0,0]),p),y=sub(sample([0,1,0]),p),z=sub(sample([0,0,1]),p);
      r.transform.setMatrix(new Float32Array([...x,0,...y,0,...z,0,...p,1]));r.material.baseColor=color(o.colors.surface);r.material.emissiveFactor=selected.includes(o.id)?[.12,.09,.015]:[0,0,0];
      if(r.mount){const f=wheelFrame(map,o,poses);r.mount.setMatrix(new Float32Array([...f.right,0,...f.up,0,...f.shaft,0,...f.center,1]));r.wheel!.setRotation(0,0,(poses.mechanisms[o.id]??0)*RAD);}
    }
  }

  tick(dt:number,runtime:MapRuntime|null):void {
    this.waterTime+=dt;for(const [id,geometry] of this.waters){const o=this.map?.objects.find(o=>o.id===id);if(o)geometry.setMorphWeights(waterWeights(this.waterTime,o.water));}
    // Availability is independent of the cached map transforms and the wheel's rotation angle.
    for(const [id,visual] of this.wheelVisuals){
      if(!advanceWheelState(visual.state,runtime?!runtime.canDrag(id):false,dt))continue;
      const shape=wheelShape(visual.state.open);
      for(const {axis,sign,spoke,grip} of visual.arms){
        const horizontal=axis==='x';spoke.setPosition(horizontal?sign*shape.spokeCenter:0,horizontal?0:sign*shape.spokeCenter,0);
        spoke.setScale(horizontal?shape.spokeLength:.1,horizontal?.1:shape.spokeLength,.1);
        grip.setPosition(horizontal?sign*shape.gripCenter:0,horizontal?0:sign*shape.gripCenter,0);grip.setScale(shape.gripSize,shape.gripSize,shape.gripSize);
      }
    }
    this.actor.disabled=!runtime;if(!runtime)return;
    this.sync(runtime.map,runtime.poses);
    for(const [id,r]of this.objects)if(r.button)r.button.setPosition(0,runtime.switches[id] ? .02 : .075,0);
    const y=unit(runtime.up),forward=unit(runtime.direction),z:Vec3=[-forward[0],-forward[1],-forward[2]];
    // Vertical stair risers can align travel and up; keep a non-degenerate character frame.
    let x=unit([y[1]*z[2]-y[2]*z[1],y[2]*z[0]-y[0]*z[2],y[0]*z[1]-y[1]*z[0]]);
    if(Math.hypot(...x)<.5)x=unit(Math.abs(y[0])<.9?[0,y[2],-y[1]]:[-y[2],0,y[0]]);
    const back=unit([x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]]);
    const s=.7*TRAVELER_SIZE_MULTIPLIER,p=this.visibleTravelerPosition(runtime);this.actorTransform.setMatrix(new Float32Array([x[0]*s,x[1]*s,x[2]*s,0,y[0]*s,y[1]*s,y[2]*s,0,back[0]*s,back[1]*s,back[2]*s,0,p[0],p[1],p[2],1]));
    const name=runtime.walking?'Walk':'Idle';if(name!==this.animation){this.animation=name;this.animationTime=0;}this.animationTime+=dt;
    const clip=this.model.runtimeAnimationClips.find(c=>c.name===name);if(clip)applyGltfAnimationClip(clip,this.animationTime);
  }
  /** Only valid nearby optical portals may correct draw depth; navigation stays in world space. */
  private visibleTravelerPosition(runtime:MapRuntime):Vec3 {
    const camera=this.orbitTransform.localMatrix,depth:Vec3=[camera[8]!,camera[9]!,camera[10]!],right:Vec3=[camera[0]!,camera[1]!,camera[2]!];
    const key=JSON.stringify([runtime.poses,Array.from(camera.slice(0,12))]);
    if(this.portalMap!==runtime.map||this.portalKey!==key){
      this.portalMap=runtime.map;this.portalKey=key;
      const objects=new Map(runtime.map.objects.map(o=>[o.id,o])),samples=new Map<string,ReturnType<typeof worldSamples>>();
      const sample=(id:string,index:number)=>{if(!samples.has(id))samples.set(id,worldSamples(runtime.map,objects.get(id)!,runtime.poses));return samples.get(id)![index]!;};
      this.portals=connections(runtime.map,runtime.poses,this.project).filter(c=>c.illusion).map(c=>({a:c.a,b:c.b,from:sample(c.a,c.aIndex).point,to:sample(c.b,c.bIndex).point,up:sample(c.a,c.aIndex).up}));
    }
    const nearby=this.portals.filter(p=>Math.min(length(sub(runtime.position,p.from)),length(sub(runtime.position,p.to)))<1.15&&p.up.reduce((sum,v,i)=>sum+v*runtime.up[i]!,0)>.995);
    const allowed=new Set(nearby.flatMap(p=>[p.a,p.b])),meshes=this.pickMeshes.filter(p=>allowed.has(p.id));
    const reach=nearby.reduce((max,p)=>Math.max(max,length(sub(p.to,p.from))+1),0),occluders=new Set<string>();let offset=0;
    // Probe the traveler's silhouette, not only the feet: a slanted half can cover
    // the head or legs before the route's point-sized waypoint reaches the seam.
    for(const h of [.06,.2,.36,.52,.7])for(const width of [-.18,0,.18]){
      if(!meshes.length)break;
      const probe=add(add(runtime.position,mul(runtime.up,h*TRAVELER_SIZE_MULTIPLIER)),mul(right,width*TRAVELER_SIZE_MULTIPLIER));
      this.occlusionRay.origin.set(add(probe,mul(depth,reach)));this.occlusionRay.direction.set(mul(depth,-1));
      for(const {id,entity,mesh}of meshes){
        const hit=this.occlusionRay.intersectMesh(mesh.geometry,this.scene.world.frameData.transforms.getWorldMatrix(entity),{useBVH:true},this.pickHit);
        if(!hit)continue;const ahead=reach-hit.distance;
        if(ahead>.025){offset=Math.max(offset,ahead+.22);occluders.add(id);}
      }
    }
    // Orthographic depth motion preserves every projected point exactly. Keep depth
    // testing enabled so unrelated walls, doors and decorations still occlude normally.
    const position=add(runtime.position,mul(depth,offset));this.travelerPresentation={position,logicalScreen:this.screen(runtime.position),depthOffset:offset,occluders:[...occluders]};return position;
  }
  travelerSnapshot():unknown {const m=this.actorTransform.localMatrix,position:Vec3=[m[12]!,m[13]!,m[14]!];return {...this.travelerPresentation,position,screen:this.screen(position)};}
  resize(w:number,h:number):void {if(w===this.width&&h===this.height)return;this.centerX+=(w-this.width)/2;this.centerY+=(h-this.height)/2;this.width=w;this.height=h;this.cameraBounds();}
  setOrbitEnabled(canvas:HTMLCanvasElement,enabled:boolean,inputRegion?:{x:number;y:number;width:number;height:number}):void {
    const key=JSON.stringify(inputRegion);if(this.orbitRegion!==key){this.orbit?.dispose();this.orbit=null;this.orbitRegion=key;}
    if(enabled&&!this.orbit)this.orbit=new OrbitControl(canvas,this.orbitTransform,{enablePan:false,enableZoom:false,minPhi:10*RAD,maxPhi:80*RAD,...(inputRegion?{inputRegion}:{})});
    else if(!enabled&&this.orbit){this.orbit.dispose();this.orbit=null;}
  }
  dispose():void {this.orbit?.dispose();this.orbit=null;this.cancelCompilation?.();this.cancelCompilation=null;this.generation++;}
  resetAngle():void {this.orbitTransform.set(150,Math.PI/4,Math.acos(1/Math.sqrt(3)));this.fit();}
  /** Read the engine camera basis so picking and optical seams match rendering. */
  project=(p:Vec3):[number,number]=>{const m=this.orbitTransform.localMatrix;return [p[0]*m[0]!+p[1]*m[1]!+p[2]*m[2]!,p[0]*m[4]!+p[1]*m[5]!+p[2]*m[6]!];};
  fit():void {
    if(!this.map?.objects.length){this.orbitTransform.setTarget(0,0,0);this.centerX=this.width/2;this.centerY=this.height/2;this.scale=40;this.cameraBounds();return;}
    const objects=this.map.objects.some(isWalkable)?this.map.objects.filter(o=>o.type!==11):this.map.objects;
    const world=objects.flatMap(o=>o.type===11?([0,1,2,3] as CornerId[]).map(c=>worldSample(this.map!,o,{point:pathCorner(o,c),up:[0,1,0],roll:0},emptyPoses()).point):o.type===12?[worldSample(this.map!,o,{point:[0,0,0],up:[0,1,0],roll:0},emptyPoses()).point,worldSample(this.map!,o,{point:[0,o.rise,0],up:[0,1,0],roll:0},emptyPoses()).point]:worldSamples(this.map!,o,emptyPoses()).map(s=>s.point));
    const focus=[0,1,2].map(i=>(Math.min(...world.map(p=>p[i]!))+Math.max(...world.map(p=>p[i]!)))/2) as Vec3;this.orbitTransform.setTarget(...focus);
    const points=world.map(p=>this.project([p[0]-focus[0],p[1]-focus[1],p[2]-focus[2]]));
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs)-1.2,maxX=Math.max(...xs)+1.2,minY=Math.min(...ys)-1.2,maxY=Math.max(...ys)+2;
    this.scale=Math.max(8,Math.min(85,(this.width-60)/(maxX-minX),(this.height-100)/(maxY-minY)));this.centerX=this.width/2-(minX+maxX)/2*this.scale;this.centerY=this.height/2+(minY+maxY)/2*this.scale;this.cameraBounds();
  }
  pan(dx:number,dy:number):void {this.centerX+=dx;this.centerY+=dy;this.cameraBounds();}
  zoom(factor:number,x=this.width/2,y=this.height/2):void {const next=Math.max(8,Math.min(150,this.scale*factor)),r=next/this.scale;this.centerX=x-(x-this.centerX)*r;this.centerY=y-(y-this.centerY)*r;this.scale=next;this.cameraBounds();}
  private cameraBounds():void {this.camera.orthoLeft=-this.centerX/this.scale;this.camera.orthoRight=(this.width-this.centerX)/this.scale;this.camera.orthoTop=this.centerY/this.scale;this.camera.orthoBottom=-(this.height-this.centerY)/this.scale;}
  screen(p:Vec3):[number,number]{const t=this.orbitTransform.target,[u,v]=this.project([p[0]-t[0]!,p[1]-t[1]!,p[2]-t[2]!]);return [this.centerX+u*this.scale,this.centerY-v*this.scale];}
  ground(x:number,y:number,height:number):Vec3 {const m=this.orbitTransform.localMatrix,t=this.orbitTransform.target,h=height-t[1]!,u=(x-this.centerX)/this.scale-h*m[1]!,v=(this.centerY-y)/this.scale-h*m[5]!,det=m[0]!*m[6]!-m[2]!*m[4]!;return [t[0]!+(u*m[6]!-v*m[2]!)/det,height,t[2]!+(v*m[0]!-u*m[4]!)/det];}
  axisDelta(dx:number,dy:number,axis:'x'|'y'|'z'):number{const v:Vec3=[axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0],[u,w]=this.project(v);return (dx*u-dy*w)/(this.scale*Math.max(.01,u*u+w*w));}
  cornerPoints(selection?:readonly string[]):Array<{pathId:string;corner:CornerId;screen:Point2}> {
    return (this.map?.objects??[]).filter(o=>canAttachPillar(o.type)&&(selection===undefined||selection.some(id=>id===o.id||this.map?.objects.find(p=>p.id===id)?.attachment?.pathId===o.id))).flatMap(o=>([0,1,2,3] as CornerId[]).map(corner=>{
      const pillar=this.map!.objects.find(p=>p.attachment?.pathId===o.id&&p.attachment.corner===corner);
      const point=pillar?[0,0,0] as Vec3:add(pathCorner(o,corner),defaultPillarOffset(o,corner));
      return {pathId:o.id,corner,screen:this.screen(worldSample(this.map!,pillar??o,{point,up:[0,1,0],roll:0},emptyPoses()).point)};
    }));
  }
  pickCorner(x:number,y:number,selection?:readonly string[]):{pathId:string;corner:CornerId}|null {let best=22,result:null|{pathId:string;corner:CornerId}=null;for(const c of this.cornerPoints(selection)){const d=Math.hypot(x-c.screen[0],y-c.screen[1]);if(d<best){best=d;result=c;}}return result;}
  wheelProjection(o:MapObject,poses=emptyPoses()):{center:Point2;right:Point2;up:Point2;direction:number;axis:Vec3} {
    const f=wheelFrame(this.map!,o,poses),angle=(poses.mechanisms[o.id]??0)*RAD;
    const right=this.project(add(mul(f.right,Math.cos(angle)),mul(f.up,Math.sin(angle)))),up=this.project(add(mul(f.right,-Math.sin(angle)),mul(f.up,Math.cos(angle))));
    right[0]*=this.scale;right[1]*=-this.scale;up[0]*=this.scale;up[1]*=-this.scale;
    const det=right[0]*up[1]-right[1]*up[0];return {center:this.screen(f.center),right,up,axis:f.axis,direction:Math.abs(det)<this.scale*this.scale*.06?0:Math.sign(det)};
  }
  canTurnWheel(id:string):boolean{return this.wheelVisuals.get(id)?.state.disabled===false;}
  wheelSnapshot():unknown{return Object.fromEntries([...this.wheelVisuals].map(([id,v])=>[id,{disabled:v.state.disabled,open:v.state.open,animating:v.state.elapsed<WHEEL_FOLD_DURATION,gripPositions:v.arms.map(a=>Array.from(a.grip.localMatrix.slice(12,15)))}]));}
  pickWheel(x:number,y:number,poses=emptyPoses()):string|null {
    let result:string|null=null,best=Infinity;for(const o of this.map?.objects??[]){if(o.type!==3)continue;const f=this.wheelProjection(o,poses);if(!f.direction)continue;const dx=x-f.center[0],dy=y-f.center[1],det=f.right[0]*f.up[1]-f.right[1]*f.up[0],u=(dx*f.up[1]-dy*f.up[0])/det,v=(dy*f.right[0]-dx*f.right[1])/det,pad=7/this.scale;
      const shape=wheelShape(this.wheelVisuals.get(o.id)?.state.open??1),reach=shape.gripCenter+shape.gripSize/2+pad,halfWidth=shape.gripSize/2+pad;
      if((Math.abs(u)<.36+pad&&Math.abs(v)<.36+pad)||(Math.abs(u)<halfWidth&&Math.abs(v)<reach)||(Math.abs(v)<halfWidth&&Math.abs(u)<reach)){const d=Math.hypot(dx,dy);if(d<best){result=o.id;best=d;}}
    }return result;
  }
  beginWheel(id:string,point:Point2,poses=emptyPoses()):WheelDrag|null {const o=this.map?.objects.find(o=>o.id===id);if(!o||o.type!==3||!this.canTurnWheel(id)||this.pickWheel(...point,poses)!==id)return null;const f=this.wheelProjection(o,poses);return beginWheelDrag(point,f.center,poses.mechanisms[id]??0,f.direction);}
  waterSnapshot():unknown{return {time:this.waterTime,surfaces:[...this.waters].map(([id,g])=>({id,weights:Array.from(g.morphWeights),gpu:g.morphUseGpu}))};}
  private registerPickMeshes(entity:Entity,id:string):void {
    const mesh=entity.getComponent(Mesh3D);if(mesh)this.pickMeshes.push({id,entity,mesh});
    for(const child of entity.children)this.registerPickMeshes(child,id);
  }
  /** Select the frontmost rendered surface, including prism sides and rotated caps. */
  surfaceTargets(poses=emptyPoses()):unknown {return Object.fromEntries((this.map?.objects??[]).map(o=>{const samples=worldSamples(this.map!,o,poses);return [o.id,walkSurfaces(o).map(f=>({face:f.face,index:f.center,point:samples[f.center]!.point,up:samples[f.center]!.up,screen:this.screen(samples[f.center]!.point)}))];}));}
  pick(x:number,y:number,poses=emptyPoses(),decorations=true):string|null {return this.pickTarget(x,y,poses,decorations)?.id??null;}
  pickTarget(x:number,y:number,poses=emptyPoses(),decorations=true):{id:string;index:number;point:Vec3}|null {
    if(!this.map||this.width<=0||this.height<=0)return null;
    // This viewport is orthographic: offset the ray origin on the camera plane,
    // keeping all directions parallel to the rendered camera's forward vector.
    const m=this.orbitTransform.localMatrix,u=(x-this.centerX)/this.scale,v=(this.centerY-y)/this.scale;
    this.pickRay.origin.set([m[12]!+m[0]!*u+m[4]!*v,m[13]!+m[1]!*u+m[5]!*v,m[14]!+m[2]!*u+m[6]!*v]);
    this.pickRay.direction.set([-m[8]!,-m[9]!,-m[10]!]);
    const allowed=new Set(this.map.objects.filter(o=>decorations||isWalkable(o)).map(o=>o.id));
    let nearest=Infinity,result:string|null=null,point:Vec3=[0,0,0];
    for(const {id,entity,mesh} of this.pickMeshes){
      if(!allowed.has(id))continue;
      let hidden=false;for(let parent:Entity|null=entity;parent;parent=parent.parent)if(parent.disabled||parent.destroyed){hidden=true;break;}
      if(hidden)continue;
      const hit=this.pickRay.intersectMesh(mesh.geometry,this.scene.world.frameData.transforms.getWorldMatrix(entity),{useBVH:true},this.pickHit);
      if(hit&&hit.distance<nearest){nearest=hit.distance;result=id;point=[hit.point[0]!,hit.point[1]!,hit.point[2]!];}
    }
    return result?{id:result,point,index:surfaceIndexAt(this.map,this.map.objects.find(o=>o.id===result)!,poses,point)}:null;
  }
}
