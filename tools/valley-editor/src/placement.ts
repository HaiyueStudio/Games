import { add, createObject, emptyPoses, extrusionSamples, isWalkable, length, localSamples, mul, objectSample, pathPorts, rotate, snapPosition, sub, unit, walkSurfaces, worldSample, worldSamples, type MapObject, type TypeId, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';

type Point=[number,number];
interface Anchor {id:string;point:Vec3;out:Vec3}
interface Face {point:Vec3;normal:Vec3;corners:Vec3[];top:boolean;x:Vec3;y:Vec3}
export interface Placement {position:Vec3;rotation:Vec3;sourceId:string|null;mode:'edge'|'surface'|'layer';height:number;blocked:boolean}
interface PlacementFrame {ground:(height:number)=>Vec3;screen:(point:Vec3)=>Point;hit:{id:string;point:Vec3;normal:Vec3}|null;height:number;step:number;heldHeight?:number|undefined}
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i]!,0);
const clean=(p:Vec3):Vec3=>p.map(v=>Math.round(v*1e9)/1e9||0) as Vec3;

const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const tangent=(v:Vec3,n:Vec3):Vec3=>unit(sub(v,mul(n,dot(v,n))));
/** Match the actual face orientation, including rotated parent groups. */
function faceRotation(face:Face):Vec3 {
  const n=face.normal,y=face.top?mul(n,dot(n,face.y)<0?-1:1):tangent(face.y,n),x=face.top?tangent(face.x,y):n,z=unit(cross(x,y));
  const pitch=Math.asin(Math.max(-1,Math.min(1,-z[1]))),locked=Math.abs(Math.cos(pitch))<1e-7;
  return clean([pitch,locked?Math.atan2(-x[2],x[0]):Math.atan2(z[0],z[2]),locked?0:Math.atan2(x[1],y[1])].map(v=>v*180/Math.PI) as Vec3);
}

/** Bounds of the road body, excluding decorative handles, flags and gates. */
function bodyPoints(o:MapObject):Vec3[] {
  const surfaces=walkSurfaces(o);if(surfaces.length)return surfaces.flatMap(f=>f.corners);
  if(o.type===2)return Array.from({length:o.steps},(_,i)=>[i,i+1].flatMap(x=>[0,-o.thickness].flatMap(y=>[-1,1].map(z=>[(x/o.steps-.5)*o.length,(i+1)*o.rise/o.steps+y,z*o.width/2] as Vec3)))).flat();
  const samples=localSamples(o),spine=extrusionSamples(o);
  return samples.flatMap((s,i)=>{const forward=unit(sub(spine[Math.min(spine.length-1,i+1)]!.point,spine[Math.max(0,i-1)]!.point)),right=unit(cross(forward,s.up));return [-1,1].flatMap(sign=>[0,-o.thickness].map(y=>add(s.point,add(mul(right,sign*o.width/2),mul(s.up,y)))));});
}
function atEdge(type:TypeId,edge:Anchor):Placement {
  const prototype=createObject(type,'preview'),samples=localSamples(prototype),entry=samples[pathPorts(prototype)[0]!.index]!,forward=type===7?sub(samples[1]!.point,entry.point):[1,0,0] as Vec3;
  const yaw=(Math.atan2(forward[2],forward[0])-Math.atan2(edge.out[2],edge.out[0]))*180/Math.PI,rotation=clean([0,((yaw+540)%360)-180,0]);
  return {position:clean(sub(edge.point,rotate(entry.point,rotation))),rotation,sourceId:edge.id,mode:'edge',height:edge.point[1],blocked:false};
}

/** Place against the picked physical face; use nearby road edges only in empty space. */
export class PathPlacement {
  private cachedMap:ValleyMap|null=null;private edges:Anchor[]=[];private faces=new Map<string,Face[]>();
  constructor(private readonly getMap:()=>ValleyMap){}
  private refresh():void {
    const map=this.getMap();if(map===this.cachedMap)return;this.cachedMap=map;this.edges=[];this.faces.clear();
    const poses=emptyPoses();
    for(const o of map.objects.filter(isWalkable)){
      const samples=worldSamples(map,o,poses),faces=walkSurfaces(o),world=(point:Vec3)=>worldSample(map,o,{point,up:[0,1,0],roll:0},poses).point,origin=world([0,0,0]),x=unit(sub(world([1,0,0]),origin)),y=unit(sub(world([0,1,0]),origin));
      this.faces.set(o.id,faces.map(f=>({point:samples[f.center]!.point,normal:samples[f.center]!.up,corners:f.corners.map(world),top:f.face<=1,x,y})));
      for(const face of faces){
        if(samples[face.center]!.up[1]<.999)continue;
        const center=samples[face.center]!.point,corners=face.corners.map(point=>worldSample(map,o,{point,up:face.up,roll:0},poses).point);
        for(const port of pathPorts(o).filter(p=>p.face===face.face&&!p.cut)){
          const point=samples[port.index]!.point;
          for(let i=0;i<corners.length;i++){
            const a=corners[i]!,b=corners[(i+1)%corners.length]!;if(length(sub(mul(add(a,b),.5),point))>1e-6)continue;
            const edge=sub(b,a);let out=unit([edge[2],0,-edge[0]]);if(dot(out,sub(point,center))<0)out=mul(out,-1);
            this.edges.push({id:o.id,point,out});break;
          }
        }
      }
      if(!faces.length)for(const port of pathPorts(o)){
        const s=samples[port.index]!;if(s.up[1]<.999)continue;
        const inner=samples[port.index===0?Math.min(2,samples.length-1):Math.max(0,port.index-2)]!,delta=sub(s.point,inner.point),out=unit([delta[0],0,delta[2]]);
        if(length(out)>.9)this.edges.push({id:o.id,point:s.point,out});
      }
    }
  }
  private attach(type:TypeId,hit:NonNullable<PlacementFrame['hit']>,face:Face,step:number):Placement {
    const rotation=faceRotation(face),prototype=createObject(type,'preview'),poses=emptyPoses();
    // Use the new construct's geometry bounds, not its anchor (which is at the top).
    const points=bodyPoints(prototype);
    prototype.rotation=rotation;
    const axes:Vec3[]=[[1,0,0],[0,1,0],[0,0,1]],basis=axes.map(a=>rotate(a,rotation)),bounds=axes.map((_,i)=>[Math.min(...points.map(p=>p[i]!)),Math.max(...points.map(p=>p[i]!))]),middle=bounds.map(([a,b])=>(a!+b!)/2) as Vec3;
    let contact=[...face.point] as Vec3;
    for(let i=0;i<3;i++){
      const axis=basis[i]!;if(Math.abs(dot(axis,face.normal))>.99)continue;
      const values=face.corners.map(p=>dot(sub(p,face.point),axis)),half=(bounds[i]![1]!-bounds[i]![0]!)/2,lo=Math.min(...values)+half,hi=Math.max(...values)-half;
      const value=lo>=hi?(lo+hi)/2:Math.max(lo,Math.min(hi,lo+Math.round((dot(sub(hit.point,face.point),axis)-lo)/step)*step));
      contact=add(contact,mul(axis,value));
    }
    const radius=basis.reduce((n,axis,i)=>n+Math.abs(dot(axis,face.normal))*(bounds[i]![1]!-bounds[i]![0]!)/2,0),offset=objectSample(prototype,{point:middle,up:[0,1,0],roll:0},poses).point,position=clean(sub(add(contact,mul(face.normal,radius)),offset));
    return {position,rotation,sourceId:hit.id,mode:'surface',height:position[1],blocked:false};
  }
  resolve(type:TypeId,p:Point,frame:PlacementFrame):Placement {
    this.refresh();let best:Anchor|undefined,score=Infinity;
    const hit=type<=10||type>=13?frame.hit:null;
    if(hit){
      const faces=this.faces.get(hit.id)??[];
      // Distance identifies the physical face even for two-sided prism caps whose winding differs.
      const face=faces.reduce<Face|undefined>((best,f)=>{
        const rank=(v:Face)=>Math.abs(dot(sub(hit.point,v.point),v.normal))+.01*(1-Math.abs(dot(hit.normal,v.normal)));
        return !best||rank(f)<rank(best)?f:best;
      },undefined);
      if(face){
        if(type===17){
          let up=face.y,out=face.normal,top=[...face.point] as Vec3;
          if(Math.abs(dot(up,out))>.9){
            up=out;const edges=face.corners.map((a,i)=>{const b=face.corners[(i+1)%face.corners.length]!,point=mul(add(a,b),.5);return {point,edge:sub(b,a)};}).sort((a,b)=>length(sub(a.point,hit.point))-length(sub(b.point,hit.point))),edge=edges[0]!;top=edge.point;out=unit(cross(edge.edge,up));if(dot(out,sub(top,face.point))<0)out=mul(out,-1);
          }else{const height=Math.max(...face.corners.map(p=>dot(sub(p,face.point),up)));top=add(top,mul(up,height));}
          const x=unit(cross(up,out)),rotation=faceRotation({...face,top:true,x,y:up,normal:up}),values=face.corners.map(p=>dot(sub(p,top),x)),shift=Math.round(dot(sub(hit.point,top),x)/frame.step)*frame.step;
          top=add(top,mul(x,Math.max(Math.min(...values),Math.min(Math.max(...values),shift))));
          const position=clean(add(sub(top,mul(up,createObject(17,'preview').rise)),mul(out,.02)));
          return {position,rotation,sourceId:hit.id,mode:'surface',height:position[1],blocked:false};
        }
        if(type>=13&&type<=16){
          const rotation=faceRotation({...face,top:true,x:Math.abs(dot(face.x,face.normal))>.99?face.y:face.x,y:face.normal}),axes:Vec3[]=[rotate([1,0,0],rotation),rotate([0,0,1],rotation)];let position=[...face.point] as Vec3;
          for(const axis of axes){const values=face.corners.map(p=>dot(sub(p,face.point),axis)),amount=Math.round(dot(sub(hit.point,face.point),axis)/frame.step)*frame.step;position=add(position,mul(axis,Math.max(Math.min(...values),Math.min(Math.max(...values),amount))));}
          return {position:clean(position),rotation,sourceId:hit.id,mode:'surface',height:position[1],blocked:false};
        }
        // Stairs/curves connect at their entrance on a horizontal road edge.
        // A body-center attachment would lower the entrance by half a step.
        if([2,6,7].includes(type)){
          const edge=this.edges.filter(e=>e.id===hit.id&&dot(e.out,face.normal)>.999).sort((a,b)=>length(sub(a.point,hit.point))-length(sub(b.point,hit.point)))[0];
          if(edge)return atEdge(type,edge);
        }
        return this.attach(type,hit,face,frame.step);
      }
    }
    if(type<=10)for(const edge of this.edges){
      // A visible road wins over an edge belonging to a different depth layer.
      if(frame.hit&&frame.hit.id!==edge.id)continue;
      const d=sub(frame.ground(edge.point[1]),edge.point),along=dot(d,edge.out),across=Math.abs(d[0]*edge.out[2]-d[2]*edge.out[0]);
      if(along<-.18||along>1.05||across>.5)continue;
      const center=frame.screen(add(edge.point,mul(edge.out,.5))),distance=Math.hypot(center[0]-p[0],center[1]-p[1]);
      if(distance<score){score=distance;best=edge;}
    }
    if(best)return atEdge(type,best);
    if(hit&&type>=13)return {position:clean(hit.point),rotation:[0,0,0],sourceId:hit.id,mode:'surface',height:hit.point[1],blocked:false};
    if(hit){const normal=unit(hit.normal),top=Math.abs(normal[1])>.999;return this.attach(type,hit,{point:hit.point,normal,corners:[hit.point],top,x:[1,0,0],y:[0,1,0]},frame.step);}
    const height=frame.heldHeight??frame.height,position=snapPosition(frame.ground(height),frame.step);position[1]=height-(type===11?2:0);
    return {position:clean(position),rotation:[0,0,0],sourceId:null,mode:'layer',height,blocked:false};
  }
}
