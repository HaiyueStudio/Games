export type Vec3 = [number,number,number];
export type TypeId = 1|2|3|4|5|6|7|8|9|10;
export type Axis = 'x'|'y'|'z';
export type PortId = 0|1|2|3|4;
export const CATALOG = [
  {type:1,name:'普通路径',icon:'▰',color:'#d9d0b8',description:'标准 1 × 1 × 1 方块'},
  {type:2,name:'楼梯',icon:'▟',color:'#cdbca2',description:'逐级升高的可行走楼梯'},
  {type:3,name:'旋转机关',icon:'↻',color:'#d4aa64',description:'拖拽旋转，可控制物体组'},
  {type:4,name:'平移机关',icon:'↔',color:'#78a9a0',description:'沿指定轴拖拽平移'},
  {type:5,name:'三棱柱半块',icon:'◭',color:'#d9d0b8',description:'方块沿对角面切开的 A / B 半块'},
  {type:6,name:'扭转路径',icon:'∿',color:'#b4a5be',description:'截面连续扭转的缎带道路'},
  {type:7,name:'圆弧路径',icon:'◔',color:'#87a7b5',description:'指定半径与角度的弧形道路'},
  {type:8,name:'踩踏开关',icon:'⊙',color:'#cf8f73',description:'踏上按钮，触发物体组动画'},
  {type:9,name:'出生平台',icon:'♙',color:'#88ac89',description:'旅行者开始的位置'},
  {type:10,name:'出口平台',icon:'▥',color:'#c8b46d',description:'到达这里完成关卡'},
] as const;
export interface Motion { axis: Axis; min: number; max: number; step: number; targetGroup: string|null }
export interface Action { groupId: string; translation: Vec3; rotation: Vec3; duration: number; easing: 'linear'|'smooth' }
export interface MapObject {
  id: string; type: TypeId; name: string; position: Vec3; rotation: Vec3; groupId: string|null;
  length: number; width: number; thickness: number; rise: number; steps: number; radius: number; arc: number; twist: number;
  prismHalf:'a'|'b';
  motion: Motion; trigger: {mode:'once'|'toggle';actions:Action[]};
}
export interface MapGroup { id:string; name:string; pivot:Vec3 }
export interface OpticalLink { a:string; aEnd:PortId; b:string; bEnd:PortId }
export interface ValleyMap {
  format:'haiyue-valley-map'; version:1; catalogVersion:1; id:string; name:string;
  objects:MapObject[]; groups:MapGroup[]; opticalLinks:OpticalLink[];
}
export const cloneMap = (map: ValleyMap): ValleyMap => structuredClone(map);
export function createObject(type:TypeId,id:string,position:Vec3=[0,0,0]): MapObject {
  return {id,type,name:CATALOG.find(x=>x.type===type)!.name,position:[...position],rotation:[0,0,0],groupId:null,
    length:1,width:1,thickness:1,rise:1,steps:6,radius:2,arc:90,twist:90,prismHalf:'a',
    motion:{axis:type===4?'x':'y',min:type===4?-3:-180,max:type===4?3:180,step:type===4?.5:90,targetGroup:null},trigger:{mode:'once',actions:[]}};
}
export function emptyMap():ValleyMap { return {format:'haiyue-valley-map',version:1,catalogVersion:1,id:'untitled',name:'未命名山谷',objects:[],groups:[],opticalLinks:[]}; }
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min=-1000,max=1000):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(x=>finite(x));
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const label=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=100;
export function parseMap(input:unknown):ValleyMap {
  if (!record(input)||input.format!=='haiyue-valley-map'||input.version!==1||input.catalogVersion!==1) throw new Error('不支持的地图格式或物体目录版本。');
  if(!identifier(input.id)||!label(input.name)||!Array.isArray(input.objects)||input.objects.length>500||!Array.isArray(input.groups)||input.groups.length>100||!Array.isArray(input.opticalLinks)||input.opticalLinks.length>1000) throw new Error('地图名称、ID 或对象数量无效。');
  const ids=new Set<string>(), groups=new Set<string>();
  for(const g of input.groups) {
    if(!record(g)||!identifier(g.id)||groups.has(g.id)||!label(g.name)||!vector(g.pivot)) throw new Error('物体组 ID 重复或旋转轴心无效。');
    groups.add(g.id);
  }
  for(const o of input.objects) {
    if(!record(o)||!identifier(o.id)||ids.has(o.id)||!label(o.name)||!CATALOG.some(x=>x.type===o.type)) throw new Error('物体 ID 重复或包含未知物体编号。');
    ids.add(o.id);
    if(!vector(o.position)||!vector(o.rotation)||(o.groupId!==null&&!groups.has(o.groupId as string))) throw new Error(`物体 ${o.id} 的变换或组引用无效。`);
    if(o.prismHalf!==undefined&&!['a','b'].includes(o.prismHalf as string)) throw new Error(`${o.id}: 三棱柱必须选择 A 或 B 半块。`);
    for(const key of ['length','width','thickness','radius']) if(!finite(o[key],.1,50)) throw new Error(`${o.id}: ${key} 必须介于 0.1 和 50。`);
    if(!finite(o.rise,-30,30)||!finite(o.steps,1,64)||!Number.isInteger(o.steps)||!finite(o.arc,5,330)||!finite(o.twist,-360,360)) throw new Error(`${o.id}: 路径参数无效。`);
    const m=o.motion;
    if(!record(m)||!['x','y','z'].includes(m.axis as string)||!finite(m.min,-360,360)||!finite(m.max,-360,360)||m.min>m.max||!finite(m.step,.1,360)||(m.targetGroup!==null&&!groups.has(m.targetGroup as string))) throw new Error(`${o.id}: 拖拽机关设置无效。`);
    const t=o.trigger;
    if(!record(t)||!['once','toggle'].includes(t.mode as string)||!Array.isArray(t.actions)||t.actions.length>20) throw new Error(`${o.id}: 开关配置无效。`);
    const targets=new Set<string>();
    for(const a of t.actions) {
      if(!record(a)||!groups.has(a.groupId as string)||targets.has(a.groupId as string)||!vector(a.translation)||!vector(a.rotation)||!finite(a.duration,.1,20)||!['linear','smooth'].includes(a.easing as string)) throw new Error(`${o.id}: 开关目标组、位移、旋转或时长无效（每组只允许一个动作）。`);
      targets.add(a.groupId as string);
    }
  }
  for(const l of input.opticalLinks) {
    if(!record(l)||!ids.has(l.a as string)||!ids.has(l.b as string)||l.a===l.b||![0,1,2,3,4].includes(l.aEnd as number)||![0,1,2,3,4].includes(l.bEnd as number)) throw new Error('错觉接缝引用了不存在的物体或端点。');
    for(const [id,port] of [[l.a,l.aEnd],[l.b,l.bEnd]]) {
      const o=input.objects.find(o=>o.id===id) as MapObject;
      if(!pathPorts(o).some(p=>p.port===port))throw new Error(`物体 ${id} 不存在端口 ${port}。`);
    }
  }
  // Rebuild known fields to keep editor/runtime metadata out of the portable protocol.
  return {format:'haiyue-valley-map',version:1,catalogVersion:1,id:input.id,name:input.name,
    groups:input.groups.map(g=>({id:g.id,name:g.name,pivot:[...g.pivot] as Vec3})),
    opticalLinks:input.opticalLinks.map(l=>({a:l.a,aEnd:l.aEnd,b:l.b,bEnd:l.bEnd})),
    objects:input.objects.map(o=>({id:o.id,type:o.type,name:o.name,position:[...o.position] as Vec3,rotation:[...o.rotation] as Vec3,groupId:o.groupId,
      length:o.length,width:o.width,thickness:o.thickness,rise:o.rise,steps:o.steps,radius:o.radius,arc:o.arc,twist:o.twist,prismHalf:o.prismHalf??'a',
      motion:{axis:o.motion.axis,min:o.motion.min,max:o.motion.max,step:o.motion.step,targetGroup:o.motion.targetGroup},
      trigger:{mode:o.trigger.mode,actions:o.trigger.actions.map((a:Action)=>({groupId:a.groupId,translation:[...a.translation] as Vec3,rotation:[...a.rotation] as Vec3,duration:a.duration,easing:a.easing}))}}))} as ValleyMap;
}
export function playIssues(map:ValleyMap):string[] {
  const issues:string[]=[];
  if(map.objects.filter(o=>o.type===9).length!==1) issues.push('试玩需要恰好一个出生平台（9）。');
  if(!map.objects.some(o=>o.type===10)) issues.push('试玩需要至少一个出口平台（10）。');
  for(const o of map.objects.filter(o=>o.type===8)) {
    if(!o.trigger.actions.length) issues.push(`开关「${o.name}」尚未配置动作。`);
    for(const a of o.trigger.actions) if(!map.objects.some(x=>x.groupId===a.groupId)) issues.push(`开关目标组 ${a.groupId} 没有成员。`);
  }
  return issues;
}
export function serializeMap(map:ValleyMap):string { return JSON.stringify(parseMap(map),null,2)+'\n'; }

export const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
export const length=(a:Vec3):number=>Math.hypot(...a);
export const mix=(a:Vec3,b:Vec3,t:number):Vec3=>add(a,mul(sub(b,a),t));
export const unit=(a:Vec3):Vec3=>mul(a,1/(length(a)||1));
export const project=(p:Vec3):[number,number]=>[(p[0]-p[2])/Math.SQRT2,(2*p[1]-p[0]-p[2])/Math.sqrt(6)];
export const RAD=Math.PI/180;
export function rotate(p:Vec3,r:Vec3):Vec3 {
  const [a,b,c]=r.map(x=>x*RAD) as Vec3;
  const x=p[0]*Math.cos(c)-p[1]*Math.sin(c), y=p[0]*Math.sin(c)+p[1]*Math.cos(c);
  const y2=y*Math.cos(a)-p[2]*Math.sin(a), z=y*Math.sin(a)+p[2]*Math.cos(a);
  return [x*Math.cos(b)+z*Math.sin(b),y2,-x*Math.sin(b)+z*Math.cos(b)];
}
export interface Sample { point:Vec3; up:Vec3; roll:number }
const surfaceSample=(point:Vec3):Sample=>({point,up:[0,1,0],roll:0});
const isFlat=(o:MapObject):boolean=>![2,6,7].includes(o.type);
/** Complementary right triangles of the same rectangular top face, x/L = z/W. */
export function prismOutline(o:MapObject):Vec3[] {
  const x=o.length/2,z=o.width/2;
  return o.prismHalf==='b'?[[-x,0,-z],[x,0,-z],[x,0,z]]:[[-x,0,-z],[x,0,z],[-x,0,z]];
}
export function localSamples(o:MapObject):Sample[] {
  if(o.type===5){const sign=o.prismHalf==='b'?1:-1;return [[sign*o.length/2,0,0],[sign*o.length/6,0,-sign*o.width/6],[0,0,-sign*o.width/2],[0,0,0]].map(p=>surfaceSample(p as Vec3));}
  if(isFlat(o))return [[-o.length/2,0,0],[0,0,0],[o.length/2,0,0],[0,0,-o.width/2],[0,0,o.width/2]].map(p=>surfaceSample(p as Vec3));
  if(o.type===2) {
    const result:Sample[]=[{point:[-o.length/2,0,0],up:[0,1,0],roll:0}];
    for(let i=0;i<o.steps;i++) {
      result.push({point:[-o.length/2+i*o.length/o.steps,(i+1)*o.rise/o.steps,0],up:[0,1,0],roll:0});
      result.push({point:[-o.length/2+(i+1)*o.length/o.steps,(i+1)*o.rise/o.steps,0],up:[0,1,0],roll:0});
    }
    return result;
  }
  const count=o.type===6||o.type===7?32:2;
  return Array.from({length:count+1},(_,i)=>{
    const t=i/count, angle=(t-.5)*o.arc*RAD, roll=o.type===6?t*o.twist*RAD:0;
    return {point:o.type===7?[o.radius*Math.sin(angle),0,o.radius*(1-Math.cos(angle))]:[(t-.5)*o.length,0,0],up:[0,Math.cos(roll),Math.sin(roll)],roll};
  });
}
export const centerIndex=(o:MapObject):number=>isFlat(o)?1:Math.floor(localSamples(o).length/2);
export function pathEdges(o:MapObject):Array<[number,number]> {
  if(isFlat(o))return Array.from({length:localSamples(o).length},(_,i)=>i).filter(i=>i!==1).map(i=>[1,i]);
  return localSamples(o).slice(1).map((_,i)=>[i,i+1]);
}
export function pathPorts(o:MapObject):Array<{port:PortId;index:number}> {
  if(o.type===5)return [{port:o.prismHalf==='b'?1:0,index:0},{port:o.prismHalf==='b'?2:3,index:2},{port:4,index:3}];
  if(isFlat(o))return [{port:0,index:0},{port:1,index:2},{port:2,index:3},{port:3,index:4}];
  return [{port:0,index:0},{port:1,index:localSamples(o).length-1}];
}
export const PORT_NAMES:Record<PortId,string>={0:'X− / 起点',1:'X+ / 终点',2:'Z−',3:'Z+',4:'对角切面'};

/** Split a unit cube into independently editable half-cubes, offset along the camera ray. */
export function splitCube(map:ValleyMap,id:string,newId:string,depth=3):void {
  const cube=map.objects.find(o=>o.id===id);
  if(!cube||cube.type!==1||[cube.length,cube.width,cube.thickness].some(v=>Math.abs(v-1)>1e-6)||cube.rotation.some(v=>Math.abs(v)>1e-6))throw new Error('请选择未旋转的 1 × 1 × 1 普通方块进行拆分。');
  if(!identifier(newId)||map.objects.some(o=>o.id===newId)||!finite(depth,-30,30)||Math.abs(depth)<.5)throw new Error('半块 ID 或深度间隔无效，间隔至少为 0.5 格。');
  const other=structuredClone(cube);other.id=newId;other.name+=' · B 半块';other.type=5;other.prismHalf='b';other.groupId=null;other.position=add(cube.position,[depth,depth,depth]);
  cube.type=5;cube.prismHalf='a';cube.name+=' · A 半块';
  for(const link of map.opticalLinks){if(link.a===id&&(link.aEnd===1||link.aEnd===2))link.a=newId;if(link.b===id&&(link.bEnd===1||link.bEnd===2))link.b=newId;}
  map.objects.push(other);map.opticalLinks.push({a:id,aEnd:4,b:newId,bEnd:4});
}
export interface GroupPose {translation:Vec3;rotation:Vec3}
export interface MapPoses {groups:Record<string,GroupPose>;mechanisms:Record<string,number>}
export const emptyPoses=():MapPoses=>({groups:{},mechanisms:{}});
const zeroPose=():GroupPose=>({translation:[0,0,0],rotation:[0,0,0]});
const axisIndex=(axis:Axis):number=>({x:0,y:1,z:2})[axis];
export function effectiveGroup(map:ValleyMap,id:string,poses:MapPoses):GroupPose {
  const pose=structuredClone(poses.groups[id]??zeroPose());
  for(const o of map.objects) if((o.type===3||o.type===4)&&o.motion.targetGroup===id) {
    const v=poses.mechanisms[o.id]??0, index=axisIndex(o.motion.axis);
    if(o.type===3) pose.rotation[index]!+=v; else pose.translation[index]!+=v;
  }
  return pose;
}
export function objectPose(o:MapObject,poses:MapPoses):{position:Vec3;rotation:Vec3} {
  const position:[number,number,number]=[...o.position], rotation:[number,number,number]=[...o.rotation];
  if((o.type===3||o.type===4)&&!o.motion.targetGroup) {
    const v=poses.mechanisms[o.id]??0,index=axisIndex(o.motion.axis);
    if(o.type===3) rotation[index]!+=v; else position[index]!+=v;
  }
  return {position,rotation};
}
export function worldSample(map:ValleyMap,o:MapObject,s:Sample,poses:MapPoses):Sample {
  const transform=objectPose(o,poses); let point=add(rotate(s.point,transform.rotation),transform.position),up=rotate(s.up,transform.rotation);
  if(o.groupId) {
    const group=map.groups.find(g=>g.id===o.groupId)!,pose=effectiveGroup(map,group.id,poses);
    point=add(add(rotate(sub(point,group.pivot),pose.rotation),group.pivot),pose.translation); up=rotate(up,pose.rotation);
  }
  return {point,up,roll:s.roll};
}
export const worldSamples=(map:ValleyMap,o:MapObject,poses:MapPoses):Sample[]=>localSamples(o).map(s=>worldSample(map,o,s,poses));
export function cutProjection(map:ValleyMap,o:MapObject,poses:MapPoses):Array<[number,number]> {
  return [-o.thickness,0].flatMap(y=>[-1,1].map(sign=>project(worldSample(map,o,surfaceSample([sign*o.length/2,y,sign*o.width/2]),poses).point)));
}
function matchingCutFaces(map:ValleyMap,a:MapObject,b:MapObject,poses:MapPoses):boolean {
  const ap=cutProjection(map,a,poses),bp=cutProjection(map,b,poses);
  if(!ap.every(p=>bp.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.055)))return false;
  let start=ap[0]!,end=ap[1]!,extent=0;
  for(const p of ap)for(const q of ap){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d>extent){extent=d;start=p;end=q;}}
  const side=(o:MapObject)=>{const p=project(worldSamples(map,o,poses)[centerIndex(o)]!.point);return (end[0]-start[0])*(p[1]-start[1])-(end[1]-start[1])*(p[0]-start[0]);};
  // Judge the actual transformed geometry, not just A/B labels: a rotated B can
  // occupy the same projected half as A and would leave half of the cube missing.
  return side(a)*side(b)<-1e-8;
}
export interface MapConnection {a:string;b:string;aIndex:number;bIndex:number;illusion:boolean}
export function connections(map:ValleyMap,poses:MapPoses):MapConnection[] {
  const all=map.objects.map(o=>({o,s:worldSamples(map,o,poses),ports:pathPorts(o)})), result:MapConnection[]=[];
  const authoredPorts=new Set(map.opticalLinks.flatMap(l=>[`${l.a}:${l.aEnd}|${l.b}:${l.bEnd}`,`${l.b}:${l.bEnd}|${l.a}:${l.aEnd}`]));
  for(let i=0;i<all.length;i++) for(let j=i+1;j<all.length;j++) {
    const a=all[i]!,b=all[j]!;
    for(const ae of a.ports) for(const be of b.ports) {
      const ai=ae.index,bi=be.index,ap=a.s[ai]!.point,bp=b.s[bi]!.point;
      const physical=length(sub(ap,bp))<.065;
      const authored=authoredPorts.has(`${a.o.id}:${ae.port}|${b.o.id}:${be.port}`);
      const u=project(ap),v=project(bp),optical=authored&&Math.hypot(u[0]-v[0],u[1]-v[1])<.055;
      const cutMatch=ae.port!==4||be.port!==4||matchingCutFaces(map,a.o,b.o,poses);
      if((physical||optical)&&cutMatch) result.push({a:a.o.id,b:b.o.id,aIndex:ai,bIndex:bi,illusion:!physical});
    }
  }
  return result;
}
export interface Waypoint extends Sample {objectId:string;index:number}
export function findRoute(map:ValleyMap,poses:MapPoses,from:{objectId:string;index:number},targetId:string,targetIndex?:number):Waypoint[]|null {
  const samples=new Map(map.objects.map(o=>[o.id,worldSamples(map,o,poses)]));
  const target=samples.get(targetId); if(!target) return null;
  const key=(id:string,i:number)=>`${id}:${i}`, start=key(from.objectId,from.index), end=key(targetId,targetIndex??centerIndex(map.objects.find(o=>o.id===targetId)!));
  const nodes=new Map<string,Waypoint>(),edges=new Map<string,string[]>();
  for(const [id,path] of samples) {
    path.forEach((s,i)=>{const k=key(id,i);nodes.set(k,{...s,objectId:id,index:i});edges.set(k,[]);});
    for(const [a,b] of pathEdges(map.objects.find(o=>o.id===id)!)){edges.get(key(id,a))!.push(key(id,b));edges.get(key(id,b))!.push(key(id,a));}
  }
  if(!nodes.has(start)||!nodes.has(end)) return null;
  for(const c of connections(map,poses)) {const a=key(c.a,c.aIndex),b=key(c.b,c.bIndex);edges.get(a)!.push(b);edges.get(b)!.push(a);}
  const parents=new Map<string,string|null>([[start,null]]),queue=[start];
  for(let i=0;i<queue.length;i++) for(const n of edges.get(queue[i]!)!) if(!parents.has(n)) {parents.set(n,queue[i]!);queue.push(n);}
  if(!parents.has(end)) return null;
  const path:Waypoint[]=[];let current:string|null=end;
  while(current!==null&&current!==start) {path.unshift(nodes.get(current)!);current=parents.get(current)!;}
  return path;
}
interface Animation {groupId:string;from:GroupPose;to:GroupPose;elapsed:number;duration:number;easing:'linear'|'smooth'}
export class MapRuntime {
  readonly map:ValleyMap;
  readonly poses=emptyPoses(); readonly fired=new Set<string>(); readonly switches:Record<string,boolean>={};
  private animations:Animation[]=[]; private route:Waypoint[]=[];
  at:{objectId:string;index:number}; position:Vec3;up:Vec3=[0,1,0]; direction:Vec3=[1,0,0]; completed=false;
  message='点击道路行走；拖拽金色与青色机关。';
  constructor(map:ValleyMap) {
    this.map=map;
    const issues=playIssues(map); if(issues.length) throw new Error(issues.join('\n'));
    const start=map.objects.find(o=>o.type===9)!, s=worldSamples(map,start,this.poses); this.at={objectId:start.id,index:centerIndex(start)}; this.position=[...s[this.at.index]!.point];this.up=[...s[this.at.index]!.up];this.direction=unit(sub(s[1]!.point,s[0]!.point));
  }
  get walking():boolean {return this.route.length>0;}
  get busy():boolean {return this.animations.length>0;}
  walkTo(id:string):boolean {
    if(this.walking||this.busy||this.completed) return false;
    const route=findRoute(this.map,this.poses,this.at,id);
    if(!route) {this.message='道路尚未连通。寻找开关，或调整机关。';return false;}
    this.route=route; this.message='旅行者正在前往新的道路。';return true;
  }
  canDrag(id:string):boolean {
    const o=this.map.objects.find(x=>x.id===id),at=this.map.objects.find(x=>x.id===this.at.objectId);
    return !!o&&(o.type===3||o.type===4)&&!this.walking&&!this.busy&&!this.completed&&(o.motion.targetGroup?at?.groupId!==o.motion.targetGroup:o.id!==this.at.objectId);
  }
  dragTo(id:string,value:number,snap=false):boolean {
    const o=this.map.objects.find(x=>x.id===id);if(!o||!this.canDrag(id))return false;
    if(snap)value=Math.round(value/o.motion.step)*o.motion.step;
    this.poses.mechanisms[id]=Math.max(o.motion.min,Math.min(o.motion.max,value));return true;
  }
  private enter():void {
    const o=this.map.objects.find(x=>x.id===this.at.objectId)!;
    if(this.at.index!==centerIndex(o))return;
    if(o.type===10) {this.completed=true;this.route=[];this.message='山谷的另一侧，又多了一盏灯。';return;}
    if(o.type!==8||(o.trigger.mode==='once'&&this.fired.has(o.id)))return;
    this.fired.add(o.id); const on=!this.switches[o.id]; this.switches[o.id]=on;
    this.animations=o.trigger.actions.map(a=>({groupId:a.groupId,from:structuredClone(this.poses.groups[a.groupId]??zeroPose()),to:on?{translation:[...a.translation],rotation:[...a.rotation]}:zeroPose(),elapsed:0,duration:a.duration,easing:a.easing}));
    this.route=[];this.message='开关已触发。物体组正在移动，稍后再选择道路。';
  }
  tick(delta:number):void {
    const dt=Math.max(0,Math.min(.1,delta));
    if(this.busy) {
      for(const a of this.animations) {a.elapsed+=dt;const x=Math.min(1,a.elapsed/a.duration),t=a.easing==='smooth'?x*x*(3-2*x):x;this.poses.groups[a.groupId]={translation:mix(a.from.translation,a.to.translation,t),rotation:mix(a.from.rotation,a.to.rotation,t)};}
      this.animations=this.animations.filter(a=>a.elapsed<a.duration);
      const o=this.map.objects.find(x=>x.id===this.at.objectId)!;const s=worldSamples(this.map,o,this.poses)[this.at.index]!;this.position=[...s.point];this.up=[...s.up];
      if(!this.busy)this.message='机关已就位。点击新的道路继续前行。';
      return;
    }
    let budget=dt*2.6;
    while(this.route.length&&budget>0) {
      const next=this.route[0]!,d=sub(next.point,this.position),distance=length(d),a=project(next.point),b=project(this.position);
      const optical=Math.hypot(a[0]-b[0],a[1]-b[1])<.00001&&next.objectId!==this.at.objectId;
      if(distance<=budget||optical) {
        if(!optical&&distance>.00001)this.direction=unit(d);
        this.position=[...next.point];this.up=[...next.up];this.at={objectId:next.objectId,index:next.index};this.route.shift();budget-=optical?0:distance;this.enter();
      } else {this.position=mix(this.position,next.point,budget/distance);this.up=unit(mix(this.up,next.up,budget/distance));this.direction=unit(d);budget=0;}
    }
  }
}

/** Demonstration: step on two switches to translate, then rotate, grouped roads. */
export function switchGarden():ValleyMap {
  const map=emptyMap();map.id='switch-garden';map.name='开关花园 · 把断桥交给光';
  const make=(type:TypeId,id:string,p:Vec3,patch:Partial<MapObject>={})=>{const o={...createObject(type,id,p),...patch};map.objects.push(o);return o;};
  make(9,'start',[-3,0,0]);
  const a=make(8,'switch-lift',[-2,0,0],{name:'开关一 · 平移双桥'});
  make(1,'moving-a',[-1,0,3],{groupId:'sliding'});make(1,'moving-b',[0,0,3],{groupId:'sliding'});
  const b=make(8,'switch-turn',[1,0,0],{name:'开关二 · 转动回廊'});
  make(1,'rotating-a',[2.5,0,.5],{groupId:'turning',rotation:[0,90,0]});
  make(1,'rotating-b',[2.5,0,-.5],{groupId:'turning',rotation:[0,90,0]});
  make(10,'exit',[4,0,0]);
  map.groups=[{id:'sliding',name:'双桥平移组',pivot:[-.5,0,3]},{id:'turning',name:'回廊旋转组',pivot:[2.5,0,0]}];
  a.trigger.actions=[{groupId:'sliding',translation:[0,0,-3],rotation:[0,0,0],duration:1.5,easing:'smooth'}];
  b.trigger.actions=[{groupId:'turning',translation:[0,0,0],rotation:[0,-90,0],duration:1.4,easing:'smooth'}];
  return map;
}
export function catalogGarden():ValleyMap {
  const map=emptyMap();map.id='catalog-garden';map.name='物体目录 · 十种标准构件';
  map.objects=CATALOG.map((c,i)=>createObject(c.type,`sample-${c.type}`,[(i%5)*3.5-7,0,Math.floor(i/5)*5-2.5]));
  map.objects.find(o=>o.type===6)!.twist=180;
  map.objects.find(o=>o.type===6)!.length=3;map.objects.find(o=>o.type===6)!.thickness=.3;
  map.objects.find(o=>o.type===8)!.trigger.actions=[{groupId:'showcase',translation:[0,2,0],rotation:[0,90,0],duration:2,easing:'smooth'}];
  map.groups=[{id:'showcase',name:'演示组',pivot:[-7,0,-2.5]}];map.objects[0]!.groupId='showcase';return map;
}

/** Both halves share a projected cube, while their world positions are three cells apart. */
export function splitGarden():ValleyMap {
  const map=emptyMap();map.id='split-cube';map.name='分体方块 · 眼前一格，身处两地';
  map.objects=[createObject(9,'start',[-2,0,0]),createObject(1,'approach',[-1,0,0]),createObject(1,'half-a'),createObject(1,'beyond',[4,3,3]),createObject(10,'exit',[5,3,3])];
  splitCube(map,'half-a','half-b',3);return map;
}
