import { BasicMaterial, Camera3D, CartesianTransform3D, DirectionalLight, Entity, EnvironmentLight, HaiyueEngine, Mesh3D, OrbitControl, PbrMaterial, SphericalTransform3D, createBox3D, type Scene } from '@haiyue/engine';
import { createCylinder3D, createPathExtrusion3D, Geometry3D } from '@haiyue/engine/geometry';
import { applyGltfAnimationClip, createGltfPlugin, GltfModelComponent } from '@haiyue/extensions/gltf';
import { mat4 } from 'wgpu-matrix';
import { RAD, add, effectiveGroup, emptyPoses, localSamples, objectPose, pathEdges, pathPorts, prismOutline, unit, worldSample, worldSamples, type MapObject, type MapPoses, type MapRuntime, type ValleyMap, type Vec3 } from './model';

const color=(s:string):[number,number,number,number]=>[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255,1];
function matrix(p:Vec3,r:Vec3):Float32Array {return mat4.multiply(mat4.translation(p),mat4.multiply(mat4.rotationY(r[1]*RAD),mat4.multiply(mat4.rotationX(r[0]*RAD),mat4.rotationZ(r[2]*RAD)))) as Float32Array;}
export class MapView {
  readonly scene:Scene; readonly camera=new Camera3D({type:'orthographic',near:.1,far:500,left:-10,right:10,top:8,bottom:-8});
  readonly model:GltfModelComponent; readonly actorTransform=new CartesianTransform3D();
  readonly orbitTransform=new SphericalTransform3D({radius:150,theta:Math.PI/4,phi:Math.acos(1/Math.sqrt(3)),target:[0,0,0]});
  private orbit:OrbitControl|null=null;private orbitRegion='';
  private actor:Entity; private root=new Entity('Map objects'); private objects=new Map<string,{entity:Entity;transform:CartesianTransform3D;material:PbrMaterial;button:CartesianTransform3D|null;wheel:CartesianTransform3D|null}>();
  private groupTransforms=new Map<string,CartesianTransform3D>(); private map:ValleyMap|null=null;
  private box=createBox3D(); private disk=createCylinder3D({radiusTop:.32,radiusBottom:.32,height:.1,radialSegments:32});
  private materials=new Map<string,PbrMaterial>(); private animationTime=0; private animation='Idle';
  scale=45;centerX=0;centerY=0;width=1;height=1;
  constructor(readonly engine:HaiyueEngine,modelUrl:string,guiChars='') {
    const camera=new Entity('Map orthographic camera').addComponent(this.camera).addComponent(this.orbitTransform);
    this.scene=engine.createScene({name:'Valley map',camera,view:{clearColor:{r:.9,g:.927,b:.902,a:1}},render3D:true,render2D:false,gui:guiChars?{loadOp:'load',font:{chars:guiChars,fontFamily:'Microsoft YaHei, sans-serif',fontSize:32,atlasSize:2048}}:false});
    this.scene.installPlugin(createGltfPlugin());
    this.scene.add(new Entity('Map sunlight').addComponent(new DirectionalLight({direction:[-.5,-1,-.3],intensity:2.4,color:[1,.96,.85]})));
    this.scene.add(new Entity('Map skylight').addComponent(new EnvironmentLight({intensity:.85,diffuseColor:[.75,.85,.8]})));
    this.scene.add(this.root);
    this.model=new GltfModelComponent({src:modelUrl,autoLoad:true,clearPrevious:true});
    this.actor=new Entity('Traveler').addComponent(this.actorTransform).addComponent(this.model); this.actor.disabled=true;this.scene.add(this.actor);
  }
  private material(hex:string):PbrMaterial {let m=this.materials.get(hex);if(!m){m=new PbrMaterial({baseColor:color(hex),roughness:.92,metallic:0});this.materials.set(hex,m);}return m;}
  private part(parent:Entity,name:string,p:Vec3,s:Vec3,hex:string,geometry:Geometry3D=this.box):CartesianTransform3D {
    const t=new CartesianTransform3D({position:p,scale:s});parent.addChild(new Entity(name).addComponent(t).addComponent(new Mesh3D(geometry,this.material(hex))));return t;
  }
  wheelCenter(o:MapObject,poses=emptyPoses()):Vec3 {return worldSample(this.map!,o,{point:[0,-o.thickness/2,o.width/2+.65],up:[0,1,0],roll:0},poses).point;}
  private handwheel(parent:Entity,o:MapObject):CartesianTransform3D {
    const {base,hub,spokes,tips}=o.colors,y=-o.thickness/2,z=o.width/2;
    const socket=this.part(parent,'Octagonal wall socket',[0,y,z+.08],[1,1,1],base,createCylinder3D({radiusTop:.25,radiusBottom:.25,height:.16,radialSegments:8}));
    socket.setRotation(Math.PI/2,0,0);
    this.part(parent,'Square spindle',[0,y,z+.32],[.17,.17,.48],spokes);
    const transform=new CartesianTransform3D({position:[0,y,z+.65]}),wheel=new Entity('Four-arm handwheel').addComponent(transform);parent.addChild(wheel);
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
    for(const sign of [-1,1]){
      this.part(wheel,'Horizontal square spoke',[sign*.47,0,0],[.4,.1,.1],spokes);
      this.part(wheel,'Vertical square spoke',[0,sign*.47,0],[.1,.4,.1],spokes);
      this.part(wheel,'Horizontal cube grip',[sign*.76,0,0],[.24,.24,.24],tips);
      this.part(wheel,'Vertical cube grip',[0,sign*.76,0],[.24,.24,.24],tips);
    }
    return transform;
  }
  setMap(map:ValleyMap,fit=false):void {
    this.scene.remove(this.root);this.root.destroy();this.root=new Entity('Map objects');this.scene.add(this.root);this.objects.clear();this.groupTransforms.clear();this.map=map;
    const groups=new Map<string,Entity>();
    for(const g of map.groups){const t=new CartesianTransform3D(),e=new Entity(g.name).addComponent(t);this.root.addChild(e);groups.set(g.id,e);this.groupTransforms.set(g.id,t);}
    for(const o of map.objects) {
      const t=new CartesianTransform3D(),e=new Entity(`${o.type} · ${o.name}`).addComponent(t),hex=o.colors.surface;
      (o.groupId?groups.get(o.groupId)!:this.root).addChild(e);
      const m=new PbrMaterial({baseColor:color(hex),roughness:.92,metallic:0});let button:CartesianTransform3D|null=null,wheel:CartesianTransform3D|null=null;
      if(o.type===2){for(let i=0;i<o.steps;i++){const y=(i+1)*o.rise/o.steps;e.addChild(new Entity('Stair tread').addComponent(new CartesianTransform3D({position:[-o.length/2+(i+.5)*o.length/o.steps,y-o.thickness/2,0],scale:[o.length/o.steps,o.thickness,o.width]})).addComponent(new Mesh3D(this.box,m)));}}
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
      if(o.type===3)wheel=this.handwheel(e,o);
      if(o.type===4)for(const x of [-.22,0,.22])this.part(e,'Slide grip',[x,.04,0],[.065,.08,o.width*.7],'#f1f0d9');
      if(o.type===8){button=this.part(e,'Pressure plate',[0,.075,0],[1,1,1],'#dd805d',this.disk);this.part(e,'Switch center',[0,.14,0],[.13,.02,.13],'#fff0c0');}
      if(o.type===9){this.part(e,'Start marker',[0,.02,0],[.28,.04,.28],'#ebf1bb');this.part(e,'Start pennant',[-o.length*.3,.36,-o.width*.3],[.04,.72,.04],'#769486');}
      if(o.type===10){for(const z of [-o.width*.38,o.width*.38])this.part(e,'Exit column',[o.length*.3,.65,z],[.16,1.3,.16],'#eaddb9');this.part(e,'Exit lintel',[o.length*.3,1.38,0],[.25,.22,o.width],'#dac17f');e.addChild(new Entity('Exit light').addComponent(new CartesianTransform3D({position:[o.length*.3,.62,0],scale:[.035,1.2,o.width*.6]})).addComponent(new Mesh3D(this.box,new BasicMaterial({color:[1,.92,.63,1]}))));}
      const samples=localSamples(o);for(const port of pathPorts(o).filter(p=>p.port!==4))this.part(e,'Port',add(samples[port.index]!.point,[0,.018,0]),[.065,.025,.065],'#f8ebbe');
      this.objects.set(o.id,{entity:e,transform:t,material:m,button,wheel});
    }
    this.sync(map,emptyPoses());if(fit)this.fit();
  }
  sync(map:ValleyMap,poses:MapPoses,selected:readonly string[]=[]):void {
    this.map=map;
    for(const g of map.groups){const pose=effectiveGroup(map,g.id,poses);this.groupTransforms.get(g.id)?.setMatrix(mat4.multiply(matrix(add(g.pivot,pose.translation),pose.rotation),mat4.translation(g.pivot.map(v=>-v))));}
    for(const o of map.objects){const r=this.objects.get(o.id);if(!r)continue;const p=objectPose(o,poses);r.transform.setMatrix(matrix(p.position,p.rotation));r.material.baseColor=color(o.colors.surface);r.material.emissiveFactor=selected.includes(o.id)?[.12,.09,.015]:[0,0,0];r.wheel?.setRotation(0,0,(poses.mechanisms[o.id]??0)*RAD);}
  }
  tick(dt:number,runtime:MapRuntime|null):void {
    this.actor.disabled=!runtime;if(!runtime)return;
    this.sync(runtime.map,runtime.poses);
    for(const [id,r]of this.objects)if(r.button)r.button.setPosition(0,runtime.switches[id] ? .02 : .075,0);
    const y=unit(runtime.up),forward=unit(runtime.direction),z:Vec3=[-forward[0],-forward[1],-forward[2]];
    // Vertical stair risers can align travel and up; keep a non-degenerate character frame.
    let x=unit([y[1]*z[2]-y[2]*z[1],y[2]*z[0]-y[0]*z[2],y[0]*z[1]-y[1]*z[0]]);
    if(Math.hypot(...x)<.5)x=unit(Math.abs(y[0])<.9?[0,y[2],-y[1]]:[-y[2],0,y[0]]);
    const back=unit([x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]]);
    const s=.7,p=runtime.position;this.actorTransform.setMatrix(new Float32Array([x[0]*s,x[1]*s,x[2]*s,0,y[0]*s,y[1]*s,y[2]*s,0,back[0]*s,back[1]*s,back[2]*s,0,p[0],p[1],p[2],1]));
    const name=runtime.walking?'Walk':'Idle';if(name!==this.animation){this.animation=name;this.animationTime=0;}this.animationTime+=dt;
    const clip=this.model.runtimeAnimationClips.find(c=>c.name===name);if(clip)applyGltfAnimationClip(clip,this.animationTime);
  }
  resize(w:number,h:number):void {if(w===this.width&&h===this.height)return;this.centerX+=(w-this.width)/2;this.centerY+=(h-this.height)/2;this.width=w;this.height=h;this.cameraBounds();}
  setOrbitEnabled(canvas:HTMLCanvasElement,enabled:boolean,inputRegion?:{x:number;y:number;width:number;height:number}):void {
    const key=JSON.stringify(inputRegion);if(this.orbitRegion!==key){this.dispose();this.orbitRegion=key;}
    if(enabled&&!this.orbit)this.orbit=new OrbitControl(canvas,this.orbitTransform,{enablePan:false,enableZoom:false,minPhi:10*RAD,maxPhi:80*RAD,...(inputRegion?{inputRegion}:{})});
    else if(!enabled&&this.orbit){this.orbit.dispose();this.orbit=null;}
  }
  dispose():void {this.orbit?.dispose();this.orbit=null;}
  resetAngle():void {this.orbitTransform.set(150,Math.PI/4,Math.acos(1/Math.sqrt(3)));this.fit();}
  /** Read the engine camera basis so picking and optical seams match rendering. */
  project=(p:Vec3):[number,number]=>{const m=this.orbitTransform.localMatrix;return [p[0]*m[0]!+p[1]*m[1]!+p[2]*m[2]!,p[0]*m[4]!+p[1]*m[5]!+p[2]*m[6]!];};
  fit():void {
    if(!this.map?.objects.length){this.orbitTransform.setTarget(0,0,0);this.centerX=this.width/2;this.centerY=this.height/2;this.scale=40;this.cameraBounds();return;}
    const world=this.map.objects.flatMap(o=>worldSamples(this.map!,o,emptyPoses()).map(s=>s.point));
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
  pick(x:number,y:number,poses=emptyPoses()):string|null {
    if(!this.map)return null;let best=Infinity,result:string|null=null;
    for(const o of this.map.objects){const path=worldSamples(this.map,o,poses).map(s=>this.screen(s.point));let d=Infinity;
      for(const [i,j] of pathEdges(o)){const a=path[i]!,b=path[j]!,dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));}
      if(o.type===3){const c=this.screen(this.wheelCenter(o,poses)),wheelDistance=Math.hypot(x-c[0],y-c[1]);if(wheelDistance<this.scale*.85)d=Math.min(d,wheelDistance*.4);}
      if(d<Math.max(14,o.width*this.scale*.42)&&d<best){best=d;result=o.id;}
    }return result;
  }
}
