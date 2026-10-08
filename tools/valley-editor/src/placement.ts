import { add, createObject, emptyPoses, isWalkable, length, localSamples, mul, pathPorts, rotate, snapPosition, sub, unit, walkSurfaces, worldSample, worldSamples, type TypeId, type ValleyMap, type Vec3 } from '../../../games/valley-of-light/map/model';

type Point=[number,number];
interface Anchor {id:string;point:Vec3;out:Vec3}
export interface Placement {position:Vec3;rotation:Vec3;sourceId:string|null;mode:'edge'|'surface'|'layer';height:number;blocked:boolean}
interface PlacementFrame {ground:(height:number)=>Vec3;screen:(point:Vec3)=>Point;hit:{id:string;point:Vec3}|null;height:number;step:number;heldHeight?:number|undefined}
const dot=(a:Vec3,b:Vec3)=>a.reduce((n,v,i)=>n+v*b[i]!,0);
const clean=(p:Vec3):Vec3=>p.map(v=>Math.round(v*1e9)/1e9||0) as Vec3;

/** Editor placement uses real horizontal road edges, never projected illusion links. */
export class PathPlacement {
  private cachedMap:ValleyMap|null=null;private edges:Anchor[]=[];private heights=new Map<string,number>();private centers=new Map<string,Vec3>();
  constructor(private readonly getMap:()=>ValleyMap){}
  private refresh():void {
    const map=this.getMap();if(map===this.cachedMap)return;this.cachedMap=map;this.edges=[];this.heights.clear();this.centers.clear();
    const poses=emptyPoses();
    for(const o of map.objects.filter(isWalkable)){
      const samples=worldSamples(map,o,poses),faces=walkSurfaces(o);
      for(const face of faces){
        if(samples[face.center]!.up[1]<.999)continue;
        const center=samples[face.center]!.point,corners=face.corners.map(point=>worldSample(map,o,{point,up:face.up,roll:0},poses).point);this.heights.set(o.id,center[1]);this.centers.set(o.id,center);
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
  resolve(type:TypeId,p:Point,frame:PlacementFrame):Placement {
    this.refresh();let best:Anchor|undefined,score=Infinity;
    if(type<=10)for(const edge of this.edges){
      // A visible road wins over an edge belonging to a different depth layer.
      if(frame.hit&&frame.hit.id!==edge.id)continue;
      const d=sub(frame.ground(edge.point[1]),edge.point),along=dot(d,edge.out),across=Math.abs(d[0]*edge.out[2]-d[2]*edge.out[0]);
      if(along<-.18||along>1.05||across>.5)continue;
      const center=frame.screen(add(edge.point,mul(edge.out,.5))),distance=Math.hypot(center[0]-p[0],center[1]-p[1]);
      if(distance<score){score=distance;best=edge;}
    }
    if(best){
      const prototype=createObject(type,'preview'),samples=localSamples(prototype),entry=samples[pathPorts(prototype)[0]!.index]!,forward=type===7?sub(samples[1]!.point,entry.point):[1,0,0] as Vec3;
      const yaw=(Math.atan2(forward[2],forward[0])-Math.atan2(best.out[2],best.out[0]))*180/Math.PI,rotation=clean([0,((yaw+540)%360)-180,0]);
      return {position:clean(sub(best.point,rotate(entry.point,rotation))),rotation,sourceId:best.id,mode:'edge',height:best.point[1],blocked:false};
    }
    const source=type<=10?frame.hit:null,height=source?(this.heights.get(source.id)??source.point[1]):frame.heldHeight??frame.height,position=source&&this.centers.has(source.id)?[...this.centers.get(source.id)!] as Vec3:snapPosition(frame.ground(height),frame.step);
    position[1]=height-(type===11?2:0);
    return {position:clean(position),rotation:[0,0,0],sourceId:source?.id??null,mode:source?'surface':'layer',height,blocked:!!source&&type===1};
  }
}
