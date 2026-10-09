export type Vec3 = [number,number,number];
export type TypeId = 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19;
export type Axis = 'x'|'y'|'z';
export type PortId = number;
export const CATALOG = [
  {type:1,name:'普通路径',icon:'▰',color:'#d9d0b8',description:'标准 1 × 1 × 1 方块'},
  {type:2,name:'楼梯',icon:'▟',color:'#cdbca2',description:'逐级升高的可行走楼梯'},
  {type:3,name:'旋转机关',icon:'↻',color:'#f4b4ac',description:'四臂手轮，拖拽旋转物体组'},
  {type:4,name:'平移机关',icon:'↔',color:'#78a9a0',description:'沿指定轴拖拽平移'},
  {type:5,name:'三棱柱半块',icon:'◭',color:'#d9d0b8',description:'方块沿对角面切开的 A / B 半块'},
  {type:6,name:'扭转路径',icon:'∿',color:'#b4a5be',description:'截面连续扭转的缎带道路'},
  {type:7,name:'圆弧路径',icon:'◔',color:'#87a7b5',description:'指定半径与角度的弧形道路'},
  {type:8,name:'踩踏开关',icon:'⊙',color:'#cf8f73',description:'踏上按钮，触发物体组动画'},
  {type:9,name:'出生记号',icon:'♙',color:'#88ac89',description:'点击已有路径表面设置出生位置'},
  {type:10,name:'出口记号',icon:'◎',color:'#c8b46d',description:'点击已有路径表面设置通关位置'},
  {type:11,name:'海面',icon:'≈',color:'#78babd',description:'低多边形切面，轻微波浪起伏'},
  {type:12,name:'纤细立柱',icon:'Ⅰ',color:'#e0d6bb',description:'逐个附着在路径或出生平台四角'},
  {type:13,name:'金顶旗亭',icon:'♜',color:'#f0dfac',description:'层叠金顶、细柱与飘带旗帜'},
  {type:14,name:'几何灌木',icon:'⬟',color:'#91aa58',description:'棱面灌木，可独立调整叶色'},
  {type:15,name:'城垛尖塔',icon:'♖',color:'#c8c3df',description:'方形塔身、城垛与四棱尖顶'},
  {type:16,name:'小花簇',icon:'✿',color:'#fff8df',description:'低矮花簇，花瓣与花心可调色'},
  {type:17,name:'梯子路径',icon:'☷',color:'#516c65',description:'贴墙连接高低道路，可上下攀爬'},
  {type:18,name:'拱门',icon:'∩',color:'#ded1b4',description:'有真实门洞的低多边形圆拱门'},
  {type:19,name:'方门',icon:'Π',color:'#d4c5ae',description:'方柱与门楣，可独立配色的装饰门'},
] as const;
export interface Motion { axis: Axis; min: number; max: number; step: number; targetGroup: string|null }
export interface Action { groupId: string; translation: Vec3; rotation: Vec3; duration: number; easing: 'linear'|'smooth' }
export interface ObjectColors { surface:string; hub:string; spokes:string; tips:string; base:string }
export const WHEEL_PALETTES:ReadonlyArray<{name:string;colors:ObjectColors}>=[
  {name:'珊瑚 · 鸢尾',colors:{surface:'#f4b4ac',hub:'#ed7657',spokes:'#aaa7e8',tips:'#ff8865',base:'#7c83cd'}},
  {name:'青玉 · 象牙',colors:{surface:'#c8d8c1',hub:'#418f8c',spokes:'#f0dfb9',tips:'#ecbc75',base:'#587c83'}},
  {name:'莓果 · 雾蓝',colors:{surface:'#b7c8df',hub:'#b85d80',spokes:'#bdd5e5',tips:'#e7a3b6',base:'#71658e'}},
];
const DECORATION_COLORS:Partial<Record<TypeId,Partial<ObjectColors>>>={
  13:{hub:'#eea22b',spokes:'#52bdad',tips:'#ffc651',base:'#9b855e'},
  14:{hub:'#b0bd68',base:'#6f8846'},
  15:{hub:'#cc97ad',spokes:'#fff1d8',base:'#9d96b8'},
  16:{hub:'#edc75c',spokes:'#7c9c53',base:'#91b16a'},
  17:{hub:'#a4b294'},
  18:{hub:'#caaa78',base:'#a3947e'},
  19:{hub:'#c5a969',base:'#9c907e'},
};
export const decorationColorFields:Partial<Record<TypeId,Array<[keyof ObjectColors,string]>>>={
  13:[['surface','亭柱'],['hub','金顶'],['spokes','旗帜'],['tips','顶饰'],['base','檐边与柱脚']],
  14:[['surface','灌木主色'],['hub','亮面叶色'],['base','暗面叶色']],
  15:[['surface','塔身'],['hub','尖顶'],['spokes','城垛'],['base','腰线与底座']],
  16:[['surface','花瓣'],['hub','花心'],['spokes','花茎'],['base','叶片']],
  17:[['surface','梯框'],['hub','横档']],
  18:[['surface','门柱与拱圈'],['hub','拱顶石'],['base','柱脚']],
  19:[['surface','门柱'],['hub','门楣'],['base','柱脚与柱头']],
};
export const isDecoration=(type:TypeId):boolean=>type>=11&&type!==17;
export const isBuiltDecoration=(type:TypeId):boolean=>type>=13&&type!==17;
export const MAX_TWIST=36000;
export type PathMarkerKind='spawn'|'exit';
export interface PathMarker {kind:PathMarkerKind;face:number}
export function defaultColors(type:TypeId):ObjectColors {return {...WHEEL_PALETTES[0]!.colors,surface:type===3?WHEEL_PALETTES[0]!.colors.surface:CATALOG.find(c=>c.type===type)!.color,...DECORATION_COLORS[type]};}
export type CornerId=0|1|2|3;
export interface PillarAttachment { pathId:string; corner:CornerId }
export interface WaterSettings { amplitude:number; speed:number; wavelength:number; facetSize?:number; contrast?:number; lightColor?:string; darkColor?:string }
export const defaultWater=():WaterSettings=>({amplitude:.08,speed:.65,wavelength:4});
/** Optional affine offset preserves world geometry when reparenting scaled/rotated nodes. */
export interface ParentOffset { basis?:number[]; order?:number }
export interface MapObject extends ParentOffset {
  id: string; type: TypeId; name: string; position: Vec3; rotation: Vec3; groupId: string|null;
  length: number; width: number; thickness: number; rise: number; steps: number; radius: number; arc: number; twist: number;
  prismHalf:'a'|'b'; arcTwist:number;
  /** Surface annotation, independent of road geometry. IDs 9/10 remain legacy aliases. */
  marker?:PathMarker;
  colors:ObjectColors; water:WaterSettings; attachment:PillarAttachment|null;
  motion: Motion; trigger: {mode:'once'|'toggle';actions:Action[]};
}
export interface MapGroup extends ParentOffset { id:string; name:string; pivot:Vec3; parentId?:string|null; position?:Vec3; rotation?:Vec3; scale?:Vec3 }
export interface OpticalLink { a:string; aEnd:PortId; b:string; bEnd:PortId }
export interface StaticPathPlan {version:1;batches:number[][]}
export interface ValleyMap {
  format:'haiyue-valley-map'; version:1; catalogVersion:1; id:string; name:string;
  objects:MapObject[]; groups:MapGroup[]; opticalLinks:OpticalLink[];
  /** Validated load-time hint; authoring serialization deliberately drops it. */
  renderPlan?:StaticPathPlan;
}
export const cloneMap = (map: ValleyMap): ValleyMap => structuredClone(map);
export function createObject(type:TypeId,id:string,position:Vec3=[0,0,0]): MapObject {
  return {id,type,name:type===9?'出生平台':type===10?'出口平台':CATALOG.find(x=>x.type===type)!.name,position:[...position],rotation:[0,0,0],groupId:null,
    length:type===11?16:type===12?.12:1,width:type===11?16:type===12?.12:type===17?.65:type>=18?.25:1,thickness:1,rise:type===17?2:type===12?1.8:type===13?2.8:type===15?3:type===16?.25:type>=18?1.7:1,steps:type===17?8:6,radius:2,arc:90,twist:90,arcTwist:0,prismHalf:'a',colors:defaultColors(type),water:defaultWater(),attachment:null,
    motion:{axis:type===4?'x':type===3?'z':'y',min:type===4?-3:-180,max:type===4?3:180,step:type===4?.5:90,targetGroup:null},trigger:{mode:'once',actions:[]}};
}
export function emptyMap():ValleyMap { return {format:'haiyue-valley-map',version:1,catalogVersion:1,id:'untitled',name:'未命名山谷',objects:[],groups:[],opticalLinks:[]}; }
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min=-1000,max=1000):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(x=>finite(x));
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const label=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=100;
export function parseMap(input:unknown):ValleyMap {
  if(record(input)&&input.format==='haiyue-valley-map'&&input.version===2)return parseCompactMap(input);
  if (!record(input)||input.format!=='haiyue-valley-map'||input.version!==1||input.catalogVersion!==1) throw new Error('不支持的地图格式或物体目录版本。');
  if(!identifier(input.id)||!label(input.name)||!Array.isArray(input.objects)||input.objects.length>500||!Array.isArray(input.groups)||input.groups.length>100||!Array.isArray(input.opticalLinks)||input.opticalLinks.length>1000) throw new Error('地图名称、ID 或对象数量无效。');
  const ids=new Set<string>(), groups=new Set<string>();
  const validBasis=(b:unknown)=>b===undefined||(Array.isArray(b)&&b.length===16&&b.every(v=>finite(v,-1e6,1e6))&&[3,7,11].every(i=>b[i]===0)&&b[15]===1&&invertibleMatrix(b));
  const validateOffset=(n:Record<string,unknown>)=>{if(n.order!==undefined&&!finite(n.order,0,10000))throw new Error('节点顺序无效。');if(!validBasis(n.basis))throw new Error('节点变换矩阵无效或不可逆。');};
  for(const g of input.groups) {
    if(!record(g)||!identifier(g.id)||groups.has(g.id)||!label(g.name)||!vector(g.pivot)) throw new Error('物体组 ID 重复或旋转轴心无效。');
    validateOffset(g);
    if((g.position!==undefined&&!vector(g.position))||(g.rotation!==undefined&&!vector(g.rotation))||(g.scale!==undefined&&(!vector(g.scale)||g.scale.some(v=>v<.01||v>100))))throw new Error('父节点变换无效，缩放必须介于 0.01 和 100。');
    groups.add(g.id);
  }
  const parentOf=(id:string):string|null=>(input.groups as MapGroup[]).find(g=>g.id===id)?.parentId??null;
  for(const g of input.groups){if(g.parentId!=null&&!groups.has(g.parentId))throw new Error('父节点不存在。');const path=new Set<string>();let id:string|null=g.id;while(id){if(path.has(id))throw new Error('父节点层级不能循环。');path.add(id);id=parentOf(id);}}
  for(const o of input.objects) {
    if(!record(o)||!identifier(o.id)||(ids.has(o.id)||groups.has(o.id))||!label(o.name)||!CATALOG.some(x=>x.type===o.type)) throw new Error('物体 ID 重复或包含未知物体编号。');
    ids.add(o.id);validateOffset(o);
    if(!vector(o.position)||!vector(o.rotation)||(o.groupId!==null&&!groups.has(o.groupId as string))) throw new Error(`物体 ${o.id} 的变换或组引用无效。`);
    if(o.arcTwist!==undefined&&!finite(o.arcTwist,-360,360))throw new Error(`${o.id}: 圆弧翻面角度无效。`);
    if(o.prismHalf!==undefined&&!['a','b'].includes(o.prismHalf as string)) throw new Error(`${o.id}: 三棱柱必须选择 A 或 B 半块。`);
    if(o.colors!==undefined&&(!record(o.colors)||Object.values(defaultColors(o.type as TypeId)).length!==Object.keys(o.colors).length||!Object.keys(defaultColors(o.type as TypeId)).every(k=>typeof (o.colors as Record<string,unknown>)[k]==='string'&&/^#[0-9a-f]{6}$/i.test((o.colors as Record<string,string>)[k]!))))throw new Error(`${o.id}: 配色必须包含五个 #RRGGBB 颜色。`);
    for(const key of ['length','width','thickness','radius']) if(!finite(o[key],.1,50)) throw new Error(`${o.id}: ${key} 必须介于 0.1 和 50。`);
    if(!finite(o.rise,-30,30)||!finite(o.steps,1,64)||!Number.isInteger(o.steps)||!finite(o.arc,5,330)||!finite(o.twist,-MAX_TWIST,MAX_TWIST)) throw new Error(`${o.id}: 路径参数无效。`);
    const marker=o.marker;if(marker!==undefined&&(!record(marker)||!['spawn','exit'].includes(marker.kind as string)||!canMarkPath(o as unknown as MapObject)||!walkSurfaces(o as unknown as MapObject).some(f=>f.face===marker.face)))throw new Error(`${o.id}: 路径记号或所在表面无效。`);
    if(o.water!==undefined&&(!record(o.water)||!finite(o.water.amplitude,0,.4)||!finite(o.water.speed,0,3)||!finite(o.water.wavelength,1,20)))throw new Error(`${o.id}: 海面起伏参数无效。`);
    if(record(o.water)){
      if((o.water.facetSize!==undefined&&!finite(o.water.facetSize,.2,4))||(o.water.contrast!==undefined&&!finite(o.water.contrast,0,1)))throw new Error(`${o.id}: 海面切面大小必须介于 0.2 和 4，色差强度介于 0 和 1。`);
      for(const key of ['lightColor','darkColor'])if(o.water[key]!==undefined&&(typeof o.water[key]!=='string'||!/^#[0-9a-f]{6}$/i.test(o.water[key] as string)))throw new Error(`${o.id}: 海面亮暗色必须为 #RRGGBB。`);
    }
    if((o.type===12||Number(o.type)>=13)&&!finite(o.rise,.1,20))throw new Error(`${o.id}: 构件高度必须介于 0.1 和 20。`);
    if(o.attachment!==undefined&&o.attachment!==null){const a=o.attachment;if(o.type!==12||!record(a)||!identifier(a.pathId)||![0,1,2,3].includes(a.corner as number)||o.groupId!==null)throw new Error(`${o.id}: 柱子的角点引用无效。`);}
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
  const dependencies=new Map<string,string[]>();for(const g of input.groups)dependencies.set(g.id,g.parentId?[g.parentId]:[]);
  const inside=(child:string,parent:string):boolean=>child===parent||!!parentOf(child)&&inside(parentOf(child)!,parent);
  for(const o of input.objects)if(o.type===3&&o.motion.targetGroup&&o.groupId&&!inside(o.groupId,o.motion.targetGroup))dependencies.get(o.motion.targetGroup)!.push(o.groupId);
  const visited=new Set<string>();const visit=(id:string,path:Set<string>)=>{if(visited.has(id))return;if(path.has(id))throw new Error('机关组依赖不能循环。');const next=new Set(path);next.add(id);for(const dep of dependencies.get(id)??[])visit(dep,next);visited.add(id);};for(const id of dependencies.keys())visit(id,new Set());
  const occupied=new Set<string>();
  for(const o of input.objects)if(o.attachment){const a=o.attachment,parent=input.objects.find(p=>p.id===a.pathId),key=`${a.pathId}:${a.corner}`;if(!parent||!canAttachPillar(parent.type)||occupied.has(key))throw new Error(`${o.id}: 柱子必须引用普通路径或出生平台的空闲角点。`);occupied.add(key);}
  for(const l of input.opticalLinks) {
    if(!record(l)||!ids.has(l.a as string)||!ids.has(l.b as string)||l.a===l.b||!Number.isInteger(l.aEnd)||!Number.isInteger(l.bEnd)) throw new Error('错觉接缝引用了不存在的物体或端点。');
    for(const [id,port] of [[l.a,l.aEnd],[l.b,l.bEnd]]) {
      const o=input.objects.find(o=>o.id===id) as MapObject;
      if(!pathPorts(o).some(p=>p.port===port))throw new Error(`物体 ${id} 不存在端口 ${port}。`);
    }
  }
  // Rebuild known fields to keep editor/runtime metadata out of the portable protocol.
  return {format:'haiyue-valley-map',version:1,catalogVersion:1,id:input.id,name:input.name,
    groups:input.groups.map(g=>({id:g.id,name:g.name,pivot:[...g.pivot] as Vec3,...(g.parentId!==undefined?{parentId:g.parentId}:{}),...(g.position?{position:[...g.position]}:{}),...(g.rotation?{rotation:[...g.rotation]}:{}),...(g.scale?{scale:[...g.scale]}:{}),...(g.basis?{basis:[...g.basis]}:{}),...(g.order!==undefined?{order:g.order}:{})})),
    opticalLinks:input.opticalLinks.map(l=>({a:l.a,aEnd:l.aEnd,b:l.b,bEnd:l.bEnd})),
    objects:input.objects.map(o=>({id:o.id,type:o.type,name:o.name,position:[...o.position] as Vec3,rotation:[...o.rotation] as Vec3,groupId:o.groupId,...(o.basis?{basis:[...o.basis]}:{}),...(o.order!==undefined?{order:o.order}:{}),
      ...(o.marker?{marker:{kind:o.marker.kind,face:o.marker.face}}:{}),
      length:o.length,width:o.width,thickness:o.thickness,rise:o.rise,steps:o.steps,radius:o.radius,arc:o.arc,twist:o.twist,arcTwist:o.arcTwist??0,prismHalf:o.prismHalf??'a',colors:o.colors?{...o.colors}:defaultColors(o.type),water:o.water?{...o.water}:defaultWater(),attachment:o.attachment?{pathId:o.attachment.pathId,corner:o.attachment.corner}:null,
      motion:{axis:o.motion.axis,min:o.motion.min,max:o.motion.max,step:o.motion.step,targetGroup:o.motion.targetGroup},
      trigger:{mode:o.trigger.mode,actions:o.trigger.actions.map((a:Action)=>({groupId:a.groupId,translation:[...a.translation] as Vec3,rotation:[...a.rotation] as Vec3,duration:a.duration,easing:a.easing}))}}))} as ValleyMap;
}
export function playIssues(map:ValleyMap):string[] {
  const issues:string[]=[];
  if(map.objects.filter(o=>pathMarker(o)?.kind==='spawn').length!==1) issues.push('试玩需要恰好一个出生记号。');
  if(!map.objects.some(o=>pathMarker(o)?.kind==='exit')) issues.push('试玩需要至少一个出口记号。');
  for(const o of map.objects.filter(o=>o.type===8)) {
    if(!o.trigger.actions.length) issues.push(`开关「${o.name}」尚未配置动作。`);
    for(const a of o.trigger.actions) if(!map.objects.some(x=>belongsToGroup(map,x.groupId,a.groupId))) issues.push(`开关目标组 ${a.groupId} 没有成员。`);
  }
  return issues;
}
export function serializeMap(map:ValleyMap):string { return JSON.stringify(parseMap(map),null,2)+'\n'; }

/** A controller animates all descendants, including pillars attached to their paths. */
export function analyzeStaticPaths(map:ValleyMap):StaticPathPlan {
  const moving=new Set<string>();for(const o of map.objects){if((o.type===3||o.type===4)&&o.motion.targetGroup)moving.add(o.motion.targetGroup);if(o.type===8)for(const a of o.trigger.actions)moving.add(a.groupId);}
  const dynamic=(o:MapObject):boolean=>{const host=o.attachment?map.objects.find(p=>p.id===o.attachment!.pathId)!:o;return [...moving].some(id=>belongsToGroup(map,host.groupId,id));};
  const materials=new Map<string,number[]>();map.objects.forEach((o,i)=>{if(![1,2,5,6,7,12].includes(o.type)||dynamic(o))return;const key=o.colors.surface.toLowerCase(),batch=materials.get(key)??[];batch.push(i);materials.set(key,batch);});return {version:1,batches:[...materials.values()]};
}
/** Compact v2 stores only deviations from the stable catalog-v1 defaults. No coordinate rounding. */
export function serializeCompactMap(map:ValleyMap):string {
  const source=parseMap(map),sparse=(value:Record<string,unknown>,base:Record<string,unknown>):Record<string,unknown>=>Object.fromEntries(Object.entries(value).flatMap(([key,v])=>{if(JSON.stringify(v)===JSON.stringify(base[key]))return [];return [[key,record(v)&&record(base[key])?sparse(v,base[key]):v]];}));
  return JSON.stringify({format:source.format,version:2,catalogVersion:1,id:source.id,name:source.name,objects:source.objects.map(o=>({id:o.id,type:o.type,...sparse(o as unknown as Record<string,unknown>,createObject(o.type,o.id) as unknown as Record<string,unknown>)})),...(source.groups.length?{groups:source.groups}:{}),...(source.opticalLinks.length?{opticalLinks:source.opticalLinks}:{}),render:analyzeStaticPaths(source)})+'\n';
}
function parseCompactMap(input:Record<string,unknown>):ValleyMap {
  if(input.catalogVersion!==1||!Array.isArray(input.objects)||input.objects.length>500)throw new Error('精简地图目录版本或对象数量无效。');
  const objects=input.objects.map(value=>{if(!record(value)||!identifier(value.id)||!CATALOG.some(c=>c.type===value.type))throw new Error('精简地图包含无效物体。');const base=createObject(value.type as TypeId,value.id);const o={...base,...value};for(const key of ['colors','motion','trigger','water'] as const){if(value[key]!==undefined&&!record(value[key]))throw new Error('精简地图参数无效。');o[key]={...base[key],...(value[key] as Record<string,unknown>|undefined)} as never;}return o;});
  const map=parseMap({...input,version:1,objects,groups:input.groups===undefined?[]:input.groups,opticalLinks:input.opticalLinks===undefined?[]:input.opticalLinks}),plan=analyzeStaticPaths(map);
  // Render hints never authorize freezing an animated object or changing its material.
  if(input.render!==undefined&&(!record(input.render)||input.render.version!==1||Object.keys(input.render).length!==2||JSON.stringify(input.render.batches)!==JSON.stringify(plan.batches)))throw new Error('精简地图的静态分析与构件不一致，请重新导出或移除 render 后导入。');
  map.renderPlan=plan;return map;
}

export const add=(a:Vec3,b:Vec3):Vec3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const mul=(a:Vec3,n:number):Vec3=>[a[0]*n,a[1]*n,a[2]*n];
export const length=(a:Vec3):number=>Math.hypot(...a);
export const mix=(a:Vec3,b:Vec3,t:number):Vec3=>add(a,mul(sub(b,a),t));
export const unit=(a:Vec3):Vec3=>mul(a,1/(length(a)||1));
export const project=(p:Vec3):[number,number]=>[(p[0]-p[2])/Math.SQRT2,(2*p[1]-p[0]-p[2])/Math.sqrt(6)];
export type Projection=(p:Vec3)=>[number,number];
export const snapPosition=(p:Vec3,step:number):Vec3=>p.map(v=>Math.round(v/step)*step||0) as Vec3;
export const RAD=Math.PI/180;
export function rotate(p:Vec3,r:Vec3):Vec3 {
  const [a,b,c]=r.map(x=>x*RAD) as Vec3;
  const x=p[0]*Math.cos(c)-p[1]*Math.sin(c), y=p[0]*Math.sin(c)+p[1]*Math.cos(c);
  const y2=y*Math.cos(a)-p[2]*Math.sin(a), z=y*Math.sin(a)+p[2]*Math.cos(a);
  return [x*Math.cos(b)+z*Math.sin(b),y2,-x*Math.sin(b)+z*Math.cos(b)];
}
export interface Sample { point:Vec3; up:Vec3; roll:number }
const surfaceSample=(point:Vec3):Sample=>({point,up:[0,1,0],roll:0});
const isFlat=(o:MapObject):boolean=>![2,6,7,17].includes(o.type);
/** Complementary right triangles of the same rectangular top face, x/L = z/W. */
export function prismOutline(o:MapObject):Vec3[] {
  const x=o.length/2,z=o.width/2;
  return o.prismHalf==='b'?[[-x,0,-z],[x,0,-z],[x,0,z]]:[[-x,0,-z],[x,0,z],[-x,0,z]];
}
export const isWalkable=(o:MapObject):boolean=>o.type<=10||o.type===17;
export const canAttachPillar=(type:TypeId):boolean=>type===1||type===9;
export function pathCorner(o:MapObject,corner:CornerId):Vec3 {const signs=[[-1,-1],[1,-1],[1,1],[-1,1]][corner]!;return [signs[0]!*o.length/2,0,signs[1]!*o.width/2];}
/** New corner pillars sit 0.1 cells inside each edge; explicit saved offsets remain unchanged. */
export function defaultPillarOffset(o:MapObject,corner:CornerId):Vec3 {
  const p=pathCorner(o,corner);return [-Math.sign(p[0])*Math.min(.1,o.length/2),0,-Math.sign(p[2])*Math.min(.1,o.width/2)];
}
export interface SurfacePort {port:PortId;index:number;face:number;cut:boolean}
export interface WalkSurface {face:number;center:number;indices:number[];corners:Vec3[];up:Vec3}
export const FACE_NAMES=['顶面','底面','X− 面','X+ 面','Z− 面','Z+ 面','斜切面'];
/** Each solid face is a separate route: changing gravity requires a connecting path. */
function solidTopology(o:MapObject):{samples:Sample[];ports:SurfacePort[];surfaces:WalkSurface[]} {
  const x=o.length/2,z=o.width/2,h=o.thickness,triangle=o.type===5;
  const outline:Vec3[]=triangle?prismOutline(o):[[-x,0,-z],[x,0,-z],[x,0,z],[-x,0,z]];
  const samples:Sample[]=[],ports:SurfacePort[]=[],surfaces:WalkSurface[]=[];
  const cut=(p:Vec3)=>triangle&&Math.abs(p[0]/o.length-p[2]/o.width)<1e-7;
  function face(id:number,corners:Vec3[],up:Vec3,edges:Array<{port:number;point:Vec3}>):void {
    const offset=samples.length,center=mul(corners.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/corners.length);
    samples.push({point:edges[0]!.point,up,roll:0},{point:center,up,roll:0},...edges.slice(1).map(e=>({point:e.point,up,roll:0})));
    const indices=edges.map((e,i)=>{const index=offset+(i===0?0:i+1);ports.push({port:e.port,index,face:id,cut:cut(e.point)});return index;});
    surfaces.push({face:id,center:offset+1,indices,corners,up});
  }
  const edgePort=(p:Vec3)=>Math.abs(p[0]+x)<1e-7?0:Math.abs(p[0]-x)<1e-7?1:Math.abs(p[2]+z)<1e-7?2:Math.abs(p[2]-z)<1e-7?3:4;
  const top=outline.map((a,i)=>{const point=mul(add(a,outline[(i+1)%outline.length]!),.5);return {port:edgePort(point),point};}).sort((a,b)=>a.port-b.port);
  face(0,outline,[0,1,0],top);face(1,outline.map(p=>[p[0],-h,p[2]]),[0,-1,0],top.map(e=>({port:10+e.port,point:[e.point[0],-h,e.point[2]]})));
  for(let i=0;i<outline.length;i++){
    const a=outline[i]!,b=outline[(i+1)%outline.length]!,up=unit([b[2]-a[2],0,a[0]-b[0]]),id=up[0]<-.999?2:up[0]>.999?3:up[2]<-.999?4:up[2]>.999?5:6;
    const bottomA:Vec3=[a[0],-h,a[2]],bottomB:Vec3=[b[0],-h,b[2]];
    face(id,[a,b,bottomB,bottomA],up,[{port:id*10,point:mul(add(a,bottomA),.5)},{port:id*10+1,point:mul(add(b,bottomB),.5)},{port:id*10+2,point:mul(add(a,b),.5)},{port:id*10+3,point:mul(add(bottomA,bottomB),.5)}]);
  }
  return {samples,ports,surfaces};
}
export function walkSurfaces(o:MapObject):WalkSurface[] {return isWalkable(o)&&isFlat(o)?solidTopology(o).surfaces:[];}
/** Legacy platforms keep their original body/transform but behave as marked roads. */
export function pathMarker(o:MapObject):PathMarker|null {return o.marker??(o.type===9?{kind:'spawn',face:0}:o.type===10?{kind:'exit',face:0}:null);}
export const canMarkPath=(o:MapObject):boolean=>isWalkable(o)&&isFlat(o);
export function markerIndex(o:MapObject):number {const marker=pathMarker(o);return walkSurfaces(o).find(f=>f.face===(marker?.face??0))?.center??centerIndex(o);}
export function clearPathMarker(o:MapObject):void {
  if(o.type===9||o.type===10){o.type=1;if(['出生平台','出口平台','出生记号','出口记号'].includes(o.name))o.name='普通路径';}
  delete o.marker;
}
/** Moving the spawn is one edit; all geometry, colors, IDs and attached columns stay intact. */
export function setPathMarker(map:ValleyMap,id:string,kind:PathMarkerKind|null,face=0):void {
  const o=map.objects.find(o=>o.id===id);
  if(!o||!canMarkPath(o)||!walkSurfaces(o).some(f=>f.face===face))throw new Error('请把记号放在已有普通路径的表面上。');
  if(kind==='spawn')for(const other of map.objects)if(other!==o&&pathMarker(other)?.kind==='spawn')clearPathMarker(other);
  clearPathMarker(o);if(kind)o.marker={kind,face};
}
/** Unit cells run from the negative-X end; a final partial cell keeps its own center. */
function twistCellParameters(o:MapObject):number[] {
  return Array.from({length:Math.ceil(o.length)},(_,i)=>(i+Math.min(i+1,o.length))/(2*o.length));
}
function curveParameters(o:MapObject):number[] {
  const count=o.type===6?2*Math.ceil(Math.max(32,Math.abs(o.twist)/7.5)/2):32;
  const parameters=Array.from({length:count+1},(_,i)=>i/count);
  if(o.type===6)parameters.push(...twistCellParameters(o));
  return parameters.sort((a,b)=>a-b).filter((t,i,all)=>i===0||t-all[i-1]!>1e-9);
}
/** Navigation and extrusion share the exact cell centers as well as the smooth curve samples. */
export function twistStopIndices(o:MapObject):number[] {
  if(o.type!==6)return [];
  const parameters=curveParameters(o);
  return twistCellParameters(o).map(t=>parameters.findIndex(p=>Math.abs(p-t)<1e-9));
}
export function localSamples(o:MapObject):Sample[] {
  if(!isWalkable(o))return [surfaceSample([0,0,0])];
  if(isFlat(o))return solidTopology(o).samples;
  if(o.type===17)return [surfaceSample([0,0,.5]),...Array.from({length:o.steps+1},(_,i)=>surfaceSample([0,i/o.steps*o.rise,.24])),surfaceSample([0,o.rise,0])];
  if(o.type===2) {
    const result:Sample[]=[{point:[-o.length/2,0,0],up:[0,1,0],roll:0}];
    for(let i=0;i<o.steps;i++) {
      result.push({point:[-o.length/2+i*o.length/o.steps,(i+1)*o.rise/o.steps,0],up:[0,1,0],roll:0});
      result.push({point:[-o.length/2+(i+1)*o.length/o.steps,(i+1)*o.rise/o.steps,0],up:[0,1,0],roll:0});
    }
    return result;
  }
  return curveParameters(o).map(t=>{
    const angle=(t-.5)*o.arc*RAD, roll=t*(o.type===6?o.twist:o.arcTwist)*RAD;
    return {point:o.type===7?[o.radius*Math.sin(angle),0,o.radius*(1-Math.cos(angle))]:[(t-.5)*o.length,(Math.cos(roll)-1)*o.thickness/2,Math.sin(roll)*o.thickness/2],up:o.type===7?[-Math.sin(angle)*Math.sin(roll),Math.cos(roll),Math.cos(angle)*Math.sin(roll)]:[0,Math.cos(roll),Math.sin(roll)],roll};
  });
}
/** Twists rotate the whole cross-section about the straight solid centerline. */
export function extrusionSamples(o:MapObject):Sample[] {return localSamples(o).map(s=>o.type===6?{...s,point:sub(s.point,mul(s.up,o.thickness/2))}:s);}
export const centerIndex=(o:MapObject):number=>!isWalkable(o)?0:isFlat(o)?1:o.type===6?curveParameters(o).findIndex(t=>Math.abs(t-.5)<1e-9):Math.floor(localSamples(o).length/2);
export function pathEdges(o:MapObject):Array<[number,number]> {
  if(!isWalkable(o))return [];
  if(isFlat(o))return walkSurfaces(o).flatMap(f=>f.indices.map(i=>[f.center,i] as [number,number]));
  return localSamples(o).slice(1).map((_,i)=>[i,i+1]);
}
export function pathPorts(o:MapObject):SurfacePort[] {
  if(!isWalkable(o))return [];
  if(isFlat(o))return solidTopology(o).ports;
  return [{port:0,index:0,face:0,cut:false},{port:1,index:localSamples(o).length-1,face:0,cut:false}];
}
export const PORT_NAMES:Record<PortId,string>={0:'顶面 X− / 起点',1:'顶面 X+ / 终点',2:'顶面 Z−',3:'顶面 Z+',4:'对角切面（各面自动匹配）'};
for(let face=1;face<=6;face++)for(let edge=0;edge<=4;edge++)PORT_NAMES[face*10+edge]=`${FACE_NAMES[face]} · ${face===1?['X−','X+','Z−','Z+','对角边'][edge]:`边 ${edge+1}`}`;
/** Resolve a mesh hit to the independently walkable face underneath it. */
export function surfaceIndexAt(map:ValleyMap,o:MapObject,poses:MapPoses,point:Vec3):number {
  if(o.type===6){
    // Undo the complete authored/animated affine frame, so width, banking and scaled
    // parent groups cannot push a click into a neighboring longitudinal cell.
    const frame=pointMatrix(p=>worldSample(map,o,surfaceSample(p),poses).point);
    const x=matrixPoint(inverseMatrix(frame),point)[0]+o.length/2,stops=twistStopIndices(o);
    return stops[Math.max(0,Math.min(stops.length-1,Math.floor(x+1e-7)))]!;
  }
  const surfaces=walkSurfaces(o);if(o.type===17){const samples=worldSamples(map,o,poses);return samples.reduce((best,s,i)=>length(sub(s.point,point))<length(sub(samples[best]!.point,point))?i:best,1);}if(!surfaces.length||o.type===8)return centerIndex(o);
  const samples=worldSamples(map,o,poses);let score=Infinity,index=centerIndex(o);
  for(const f of surfaces){const s=samples[f.center]!,d=sub(point,s.point),distance=Math.abs(d.reduce((n,v,i)=>n+v*s.up[i]!,0))+.001*length(d);if(distance<score){score=distance;index=f.center;}}
  return index;
}

/** Split a unit cube into independently editable half-cubes, offset along the camera ray. */
export function splitCube(map:ValleyMap,id:string,newId:string,depth=3):void {
  const cube=map.objects.find(o=>o.id===id);
  if(!cube||cube.type!==1||[cube.length,cube.width,cube.thickness].some(v=>Math.abs(v-1)>1e-6)||cube.rotation.some(v=>Math.abs(v)>1e-6))throw new Error('请选择未旋转的 1 × 1 × 1 普通方块进行拆分。');
  if(!identifier(newId)||map.objects.some(o=>o.id===newId)||!finite(depth,-30,30)||Math.abs(depth)<.5)throw new Error('半块 ID 或深度间隔无效，间隔至少为 0.5 格。');
  // Keep placed columns in the same world positions if their host is split.
  for(const pillar of map.objects.filter(o=>o.attachment?.pathId===id))detachPillar(map,pillar);
  const other=structuredClone(cube);other.id=newId;other.name+=' · B 半块';other.type=5;other.prismHalf='b';other.groupId=null;const parent=groupMatrix(map,cube.groupId);other.basis=multiplyMatrix(parent,cube.basis??identityMatrix());other.basis[12]!+=depth;other.basis[13]!+=depth;other.basis[14]!+=depth;
  if(other.basis.every((v,i)=>Math.abs(v-identityMatrix()[i]!)<1e-8||[12,13,14].includes(i))){other.position=matrixPoint(other.basis,other.position);delete other.basis;}
  cube.type=5;cube.prismHalf='a';cube.name+=' · A 半块';
  const onB=(port:number)=>[1,2,11,12].includes(port)||[3,4].includes(Math.floor(port/10));
  for(const link of map.opticalLinks){if(link.a===id&&onB(link.aEnd))link.a=newId;if(link.b===id&&onB(link.bEnd))link.b=newId;}
  // A marker belongs to exactly one resulting half, on the same physical face.
  delete other.marker;if(cube.marker&&!walkSurfaces(cube).some(f=>f.face===cube.marker!.face)){other.marker=cube.marker;delete cube.marker;}
  map.objects.push(other);map.opticalLinks.push({a:id,aEnd:4,b:newId,bEnd:4});
}
export interface GroupPose {translation:Vec3;rotation:Vec3}
export interface MapPoses {groups:Record<string,GroupPose>;mechanisms:Record<string,number>}
export const emptyPoses=():MapPoses=>({groups:{},mechanisms:{}});
const zeroPose=():GroupPose=>({translation:[0,0,0],rotation:[0,0,0]});
const axisIndex=(axis:Axis):number=>({x:0,y:1,z:2})[axis];
const axisVector=(axis:Axis):Vec3=>[axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Rotate a point/vector around the wheel's oriented spindle. */
export function wheelRotation(p:Vec3,axis:Vec3,degrees:number):Vec3 {
  const a=unit(axis),angle=degrees*RAD,c=Math.cos(angle),s=Math.sin(angle),dot=p[0]*a[0]+p[1]*a[1]+p[2]*a[2];
  return add(add(mul(p,c),mul(cross(a,p),s)),mul(a,dot*(1-c)));
}
/** Column-major affine helpers, kept in double precision for route matching. */
export const identityMatrix=():number[]=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const matrixPoint=(m:readonly number[],p:Vec3):Vec3=>[0,1,2].map(i=>m[i]!*p[0]+m[i+4]!*p[1]+m[i+8]!*p[2]+m[i+12]!) as Vec3;
export function pointMatrix(fn:(p:Vec3)=>Vec3):number[]{const p=fn([0,0,0]),axes=([[1,0,0],[0,1,0],[0,0,1]] as Vec3[]).map(v=>sub(fn(v),p));return [...axes[0]!,0,...axes[1]!,0,...axes[2]!,0,...p,1];}
const matrixAxes=(m:readonly number[]):Vec3[]=>[0,4,8].map(i=>m.slice(i,i+3) as Vec3);
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i]!,0);
export function affineDet(m:readonly number[]):number{const [x,y,z]=matrixAxes(m);return dot(x!,cross(y!,z!));}
export function invertibleMatrix(m:readonly number[]):boolean{const det=affineDet(m),magnitude=matrixAxes(m).reduce((n,v)=>n*length(v),1);return Number.isFinite(det)&&Math.abs(det)>Number.EPSILON*magnitude*8;}
export function inverseMatrix(m:readonly number[]):number[]{const [x,y,z]=matrixAxes(m),det=affineDet(m);if(!invertibleMatrix(m))throw new Error('节点变换不可逆。');const rows=[cross(y!,z!),cross(z!,x!),cross(x!,y!)].map(v=>mul(v,1/det));return pointMatrix(p=>rows.map(r=>dot(r,sub(p,m.slice(12,15) as Vec3))) as Vec3);}
export const multiplyMatrix=(a:readonly number[],b:readonly number[]):number[]=>pointMatrix(p=>matrixPoint(a,matrixPoint(b,p)));
export function normalMatrix(m:readonly number[],v:Vec3):Vec3{const inv=inverseMatrix(m);return unit([0,4,8].map(i=>v[0]*inv[i]!+v[1]*inv[i+1]!+v[2]*inv[i+2]!) as Vec3);}
export function belongsToGroup(map:ValleyMap,id:string|null|undefined,parent:string):boolean{const seen=new Set<string>();while(id&&!seen.has(id)){if(id===parent)return true;seen.add(id);id=map.groups.find(g=>g.id===id)?.parentId;}return false;}
/** Authored parent transforms wrap switch-local animation; wheel axes are evaluated in world space. */
export function groupPoint(map:ValleyMap,id:string,point:Vec3,poses:MapPoses,skipControls=new Set<string>()):Vec3 {
  const group=map.groups.find(g=>g.id===id)!,base=poses.groups[id]??zeroPose();
  const basePoint=(p:Vec3)=>{let v=add(add(rotate(sub(p,group.pivot),base.rotation),group.pivot),base.translation);v=add(rotate(v.map((x,i)=>x*(group.scale?.[i]??1)) as Vec3,group.rotation??[0,0,0]),group.position??[0,0,0]);if(group.basis)v=matrixPoint(group.basis,v);return group.parentId?groupPoint(map,group.parentId,v,poses,skipControls):v;};
  if(skipControls.has(id))return basePoint(point);
  const next=new Set(skipControls);next.add(id);
  const operations:Array<{axis:Vec3;angle:number;pivot:Vec3;translation:Vec3}>=[];
  const apply=(p:Vec3)=>operations.reduce((v,a)=>add(add(wheelRotation(sub(v,a.pivot),a.axis,a.angle),a.pivot),a.translation),p);
  for(const o of map.objects){if((o.type!==3&&o.type!==4)||o.motion.targetGroup!==id)continue;const amount=poses.mechanisms[o.id]??0;if(!amount)continue;
    const translation:Vec3=[0,0,0];let pivot:Vec3=[0,0,0],axis:Vec3=[0,1,0],angle=0;
    if(o.type===3){angle=amount;const center:Vec3=[0,-o.thickness/2,0],sample=(p:Vec3)=>{const v=objectSample(o,surfaceSample(p),poses).point;return o.groupId?groupPoint(map,o.groupId,v,poses,next):v;};pivot=sample(center);let tip=sample(add(center,axisVector(o.motion.axis)));if(belongsToGroup(map,o.groupId,id)){pivot=apply(pivot);tip=apply(tip);}axis=sub(tip,pivot);
    }else translation[axisIndex(o.motion.axis)]=amount;
    operations.push({axis,angle,pivot,translation});
  }
  return apply(basePoint(point));
}
export const groupMatrix=(map:ValleyMap,id:string|null,poses=emptyPoses()):number[]=>id?pointMatrix(p=>groupPoint(map,id,p,poses)):identityMatrix();
export function groupVector(map:ValleyMap,id:string,v:Vec3,poses:MapPoses):Vec3 {return sub(groupPoint(map,id,v,poses),groupPoint(map,id,[0,0,0],poses));}
export function objectPose(o:MapObject,poses:MapPoses):{position:Vec3;rotation:Vec3} {
  const position:[number,number,number]=[...o.position], rotation:[number,number,number]=[...o.rotation];
  if((o.type===3||o.type===4)&&!o.motion.targetGroup) {
    const v=poses.mechanisms[o.id]??0,index=axisIndex(o.motion.axis);
    if(o.type===3) rotation[index]!+=v; else position[index]!+=v;
  }
  return {position,rotation};
}
/** Handwheels and half-cube prisms rotate around the center of their containing block. */
export function objectSample(o:MapObject,s:Sample,poses:MapPoses):Sample {
  let point:Vec3,up:Vec3;
  if(o.type===3){
    const pivot:Vec3=[0,-o.thickness/2,0],axis=axisVector(o.motion.axis),angle=o.motion.targetGroup?0:poses.mechanisms[o.id]??0;
    point=add(pivot,rotate(wheelRotation(sub(s.point,pivot),axis,angle),o.rotation));up=rotate(wheelRotation(s.up,axis,angle),o.rotation);
  }else{
    const pivot:Vec3=o.type===5?[0,-o.thickness/2,0]:[0,0,0];
    point=add(pivot,rotate(sub(s.point,pivot),o.rotation));up=rotate(s.up,o.rotation);
  }
  point=add(point,objectPose(o,poses).position);if(o.basis){point=matrixPoint(o.basis,point);up=normalMatrix(o.basis,up);}
  return {point,up,roll:s.roll};
}
export function worldSample(map:ValleyMap,o:MapObject,s:Sample,poses:MapPoses):Sample {
  if(o.attachment){const parent=map.objects.find(p=>p.id===o.attachment!.pathId)!;let point=add(o.position,rotate(s.point,o.rotation)),up=rotate(s.up,o.rotation);if(o.basis){point=matrixPoint(o.basis,point);up=normalMatrix(o.basis,up);}return worldSample(map,parent,{point:add(pathCorner(parent,o.attachment.corner),point),up,roll:s.roll},poses);}
  let {point,up}=objectSample(o,s,poses);
  if(o.groupId){point=groupPoint(map,o.groupId,point,poses);up=normalMatrix(groupMatrix(map,o.groupId,poses),up);}
  return {point,up,roll:s.roll};
}
/** Preserve an attached column's authored pose when copying it alone or splitting its host. */
export function detachPillar(map:ValleyMap,pillar:MapObject):void {
  if(!pillar.attachment)return;
  const parent=map.objects.find(o=>o.id===pillar.attachment!.pathId)!;
  const matrix=multiplyMatrix(inverseMatrix(groupMatrix(map,parent.groupId)),pointMatrix(p=>worldSample(map,pillar,surfaceSample(p),emptyPoses()).point));
  const p=matrix.slice(12,15) as Vec3;pillar.position=p;pillar.rotation=[0,0,0];pillar.basis=multiplyMatrix(matrix,pointMatrix(v=>sub(v,p)));pillar.groupId=parent.groupId;pillar.attachment=null;
  if(pillar.basis.every((v,i)=>Math.abs(v-identityMatrix()[i]!)<1e-8))delete pillar.basis;
}
export function wheelFrame(map:ValleyMap,o:MapObject,poses:MapPoses):{center:Vec3;axis:Vec3;right:Vec3;up:Vec3;shaft:Vec3} {
  const localAxis=axisVector(o.motion.axis),reference:Vec3=o.motion.axis==='y'?[0,0,1]:[0,1,0],localRight=unit(cross(reference,localAxis)),localUp=cross(localAxis,localRight);
  const pivot:Vec3=[0,-o.thickness/2,0],body=worldSample(map,o,surfaceSample(pivot),poses).point;
  const transformVector=(v:Vec3)=>sub(worldSample(map,o,surfaceSample(add(pivot,!o.motion.targetGroup?wheelRotation(v,localAxis,-(poses.mechanisms[o.id]??0)):v)),poses).point,body);
  const shaft=transformVector(localAxis),axis=unit(shaft);let right=transformVector(localRight),up=transformVector(localUp);
  // The renderer adds the wheel spin once. Remove it here if the driven block/group already includes it.
  if(o.motion.targetGroup&&belongsToGroup(map,o.groupId,o.motion.targetGroup)){const angle=-(poses.mechanisms[o.id]??0);right=wheelRotation(right,axis,angle);up=wheelRotation(up,axis,angle);}
  const extent=[o.length,o.thickness,o.width][axisIndex(o.motion.axis)]!/2;
  return {center:add(body,mul(shaft,extent+.65)),axis,right,up,shaft};
}
export function waterWeights(time:number,water:WaterSettings):number[]{const t=time*water.speed;return [Math.cos(t),-Math.sin(t),Math.cos(.7*t),Math.sin(.7*t)];}
export function waterHeight(x:number,z:number,time:number,water:WaterSettings):number {const k=2*Math.PI/water.wavelength,t=time*water.speed;return water.amplitude*(.65*Math.sin(k*(x+.45*z)-t)+.35*Math.sin(k*(.6*x-.8*z)+.7*t));}
export function worldSamples(map:ValleyMap,o:MapObject,poses:MapPoses):Sample[]{
  if(o.attachment)return localSamples(o).map(s=>worldSample(map,o,s,poses));
  const matrix=o.groupId?groupMatrix(map,o.groupId,poses):null;
  return localSamples(o).map(s=>{const result=objectSample(o,s,poses);return matrix?{...result,point:matrixPoint(matrix,result.point),up:normalMatrix(matrix,result.up)}:result;});
}
function cutCorners(map:ValleyMap,o:MapObject,poses:MapPoses):Vec3[] {
  return [-o.thickness,0].flatMap(y=>[-1,1].map(sign=>worldSample(map,o,surfaceSample([sign*o.length/2,y,sign*o.width/2]),poses).point));
}
export function cutProjection(map:ValleyMap,o:MapObject,poses:MapPoses,project:Projection=defaultProjection):Array<[number,number]> {
  return cutCorners(map,o,poses).map(project);
}
const defaultProjection=project;
function matchingPhysicalCuts(map:ValleyMap,a:MapObject,b:MapObject,poses:MapPoses):boolean {
  const ap=cutCorners(map,a,poses),bp=cutCorners(map,b,poses);
  if(!ap.every(p=>bp.some(q=>length(sub(p,q))<.065)))return false;
  const u=sub(ap[1]!,ap[0]!),v=sub(ap[2]!,ap[0]!),normal=unit([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);
  const side=(o:MapObject)=>{const p=sub(worldSamples(map,o,poses)[centerIndex(o)]!.point,ap[0]!);return p.reduce((sum,x,i)=>sum+x*normal[i]!,0);};
  return side(a)*side(b)<-1e-8;
}
function matchingCutFaces(map:ValleyMap,a:MapObject,b:MapObject,poses:MapPoses,project:Projection):boolean {
  const ap=cutProjection(map,a,poses,project),bp=cutProjection(map,b,poses,project);
  if(!ap.every(p=>bp.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.055)))return false;
  let start=ap[0]!,end=ap[1]!,extent=0;
  for(const p of ap)for(const q of ap){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d>extent){extent=d;start=p;end=q;}}
  const side=(o:MapObject)=>{const p=project(worldSamples(map,o,poses)[centerIndex(o)]!.point);return (end[0]-start[0])*(p[1]-start[1])-(end[1]-start[1])*(p[0]-start[0]);};
  // Judge the actual transformed geometry, not just A/B labels: a rotated B can
  // occupy the same projected half as A and would leave half of the cube missing.
  return side(a)*side(b)<-1e-8;
}
export interface MapConnection {a:string;b:string;aIndex:number;bIndex:number;illusion:boolean}
export function connections(map:ValleyMap,poses:MapPoses,project:Projection=defaultProjection):MapConnection[] {
  const all=map.objects.filter(isWalkable).map(o=>({o,s:worldSamples(map,o,poses),ports:pathPorts(o)})),result:MapConnection[]=[],seen=new Set<string>();
  type Entry={o:MapObject;p:SurfacePort;s:Sample};
  const entries:Entry[]=all.flatMap(a=>a.ports.map(p=>({o:a.o,p,s:a.s[p.index]!}))),cells=new Map<string,Entry[]>(),cell=.065;
  const coords=(p:Vec3)=>p.map(v=>Math.floor(v/cell));
  for(const e of entries){const key=coords(e.s.point).join(':');if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(e);}
  const nearby=(p:Vec3)=>{const [x,y,z]=coords(p) as Vec3,out:Entry[]=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++)for(const e of cells.get([x+a,y+b,z+c].join(':'))??[])if(length(sub(e.s.point,p))<cell)out.push(e);return out;};
  const aligned=(a:Sample,b:Sample)=>a.up.reduce((n,v,i)=>n+v*b.up[i]!,0)>.995;
  function connect(a:Entry,b:Entry):void {
    if(a.o.id===b.o.id||!aligned(a.s,b.s))return;
    const pa=project(a.s.point),pb=project(b.s.point);if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1])>=.055)return;
    const key=[`${a.o.id}:${a.p.index}`,`${b.o.id}:${b.p.index}`].sort().join('|');if(seen.has(key))return;seen.add(key);
    result.push({a:a.o.id,b:b.o.id,aIndex:a.p.index,bIndex:b.p.index,illusion:length(sub(a.s.point,b.s.point))>=cell});
  }
  const cutPairs=new Map<string,boolean>();
  for(const a of entries)for(const b of nearby(a.s.point)){
    if(a.o.id===b.o.id)continue;
    if(a.o.type===5&&b.o.type===5&&a.p.port%10===4&&b.p.port%10===4){const key=[a.o.id,b.o.id].sort().join('|');if(!cutPairs.has(key))cutPairs.set(key,matchingPhysicalCuts(map,a.o,b.o,poses));if(!cutPairs.get(key))continue;}
    connect(a,b);
  }
  for(const link of map.opticalLinks){
    const a=all.find(a=>a.o.id===link.a),b=all.find(b=>b.o.id===link.b);if(!a||!b)continue;
    if(a.o.type===5&&b.o.type===5&&link.aEnd===4&&link.bEnd===4)continue; // Full cut portals are resolved below for every surface.
    for(const ap of a.ports.filter(p=>p.port===link.aEnd))for(const bp of b.ports.filter(p=>p.port===link.bEnd))connect({o:a.o,p:ap,s:a.s[ap.index]!},{o:b.o,p:bp,s:b.s[bp.index]!});
  }
  // Complementary projected cuts act as portals at their boundary. A road can
  // meet that boundary even when the near half has no horizontal walking face.
  const prisms=all.filter(a=>a.o.type===5);
  for(let i=0;i<prisms.length;i++)for(let j=i+1;j<prisms.length;j++){
    const a=prisms[i]!,b=prisms[j]!;if(!matchingCutFaces(map,a.o,b.o,poses,project))continue;
    const anchors=(p:typeof a)=>p.ports.filter(e=>e.cut).map(e=>p.s[e.index]!.point).filter((v,i,arr)=>arr.findIndex(w=>length(sub(v,w))<1e-7)===i);
    for(const ap of anchors(a))for(const bp of anchors(b)){
      const pa=project(ap),pb=project(bp);if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1])>=.055)continue;
      for(const ae of nearby(ap))for(const be of nearby(bp))connect(ae,be);
    }
  }
  return result;
}

export interface Waypoint extends Sample {objectId:string;index:number}
export function findRoute(map:ValleyMap,poses:MapPoses,from:{objectId:string;index:number},targetId:string,targetIndex?:number,project:Projection=defaultProjection):Waypoint[]|null {
  const samples=new Map(map.objects.map(o=>[o.id,worldSamples(map,o,poses)]));
  const target=samples.get(targetId); if(!target) return null;
  const targetObject=map.objects.find(o=>o.id===targetId)!;
  const targetIndices=targetIndex!==undefined?[targetIndex]:pathMarker(targetObject)?[markerIndex(targetObject)]:targetObject.type===8?[centerIndex(targetObject)]:walkSurfaces(targetObject).map(f=>f.center);
  if(!targetIndices.length)targetIndices.push(centerIndex(targetObject));
  const key=(id:string,i:number)=>`${id}:${i}`, start=key(from.objectId,from.index), ends=new Set(targetIndices.map(i=>key(targetId,i)));
  const nodes=new Map<string,Waypoint>(),edges=new Map<string,string[]>();
  for(const [id,path] of samples) {
    path.forEach((s,i)=>{const k=key(id,i);nodes.set(k,{...s,objectId:id,index:i});edges.set(k,[]);});
    for(const [a,b] of pathEdges(map.objects.find(o=>o.id===id)!)){edges.get(key(id,a))!.push(key(id,b));edges.get(key(id,b))!.push(key(id,a));}
  }
  if(!nodes.has(start)||![...ends].some(e=>nodes.has(e)))return null;
  for(const c of connections(map,poses,project)) {const a=key(c.a,c.aIndex),b=key(c.b,c.bIndex);edges.get(a)!.push(b);edges.get(b)!.push(a);}
  const parents=new Map<string,string|null>([[start,null]]),queue=[start];
  let end:string|undefined;
  for(let i=0;i<queue.length;i++){const current=queue[i]!;if(ends.has(current)){end=current;break;}for(const n of edges.get(current)!)if(!parents.has(n)){parents.set(n,current);queue.push(n);}}
  if(end===undefined)return null;
  const path:Waypoint[]=[];let current:string|null=end;
  while(current!==null&&current!==start) {path.unshift(nodes.get(current)!);current=parents.get(current)!;}
  // A triangular face is convex: pass directly between its entry and exit ports.
  // Its centroid is a stopping point, not a mandatory bend in a split-cube road.
  // Keep original port waypoints so optical transfers and mid-edge retargeting stay exact.
  return path.filter((point,i)=>{
    const before=i?path[i-1]!:nodes.get(start)!,after=path[i+1];
    if(!after||before.objectId!==point.objectId||after.objectId!==point.objectId)return true;
    const object=map.objects.find(o=>o.id===point.objectId)!;if(object.type!==5)return true;
    const face=walkSurfaces(object).find(f=>f.corners.length===3&&f.center===point.index);
    return !face||!face.indices.includes(before.index)||!face.indices.includes(after.index);
  });
}
interface Animation {groupId:string;from:GroupPose;to:GroupPose;elapsed:number;duration:number;easing:'linear'|'smooth'}
export class MapRuntime {
  readonly map:ValleyMap;
  readonly projection:Projection;
  readonly poses=emptyPoses(); readonly fired=new Set<string>(); readonly switches:Record<string,boolean>={};
  private animations:Animation[]=[]; private route:Waypoint[]=[];
  // Keep both ends of the occupied edge, even after reversing before reaching a waypoint.
  private segment:{a:Waypoint;b:Waypoint}|null=null;
  at:{objectId:string;index:number}; position:Vec3;up:Vec3=[0,1,0]; direction:Vec3=[1,0,0]; completed=false;
  message='点击道路行走；绕动手轮，拖动平移机关。';
  constructor(map:ValleyMap,projection:Projection=project) {
    this.map=map;this.projection=projection;
    const issues=playIssues(map); if(issues.length) throw new Error(issues.join('\n'));
    const start=map.objects.find(o=>pathMarker(o)?.kind==='spawn')!, s=worldSamples(map,start,this.poses); this.at={objectId:start.id,index:markerIndex(start)}; this.position=[...s[this.at.index]!.point];this.up=[...s[this.at.index]!.up];this.direction=unit(sub(s[this.at.index]!.point,s[walkSurfaces(start).find(f=>f.center===this.at.index)!.indices[0]!]!.point));
  }
  get walking():boolean {return this.route.length>0;}
  /** A stopped traveler holds the rung; reversing does not turn their back to the ladder. */
  get ladderFrame():{forward:Vec3;up:Vec3;descending:boolean}|null {
    const o=this.map.objects.find(o=>o.id===(this.segment?.a.objectId??this.at.objectId));if(o?.type!==17)return null;
    const a=this.segment?.a??{...worldSamples(this.map,o,this.poses)[this.at.index]!,...this.at},b=this.segment?.b??this.route[0]??a,last=localSamples(o).length-1;
    if(a.objectId!==b.objectId||a.index<1||b.index<1||a.index>=last||b.index>=last)return null;
    const origin=worldSample(this.map,o,surfaceSample([0,0,0]),this.poses).point;
    const vector=(p:Vec3)=>unit(sub(worldSample(this.map,o,surfaceSample(p),this.poses).point,origin)),up=vector([0,1,0]);
    return {forward:vector([0,0,-1]),up,descending:this.direction.reduce((sum,v,i)=>sum+v*up[i]!,0)<0};
  }
  get busy():boolean {return this.animations.length>0;}
  walkTo(id:string,targetIndex?:number):boolean {
    if(this.busy||this.completed) return false;
    let route:Waypoint[]|null=null;
    if(this.segment){
      // Rejoin the graph through either end of the current edge. Never jump back
      // to the last visited node or cut directly across a corner/curved surface.
      const {a,b}=this.segment,first=this.route[0],forward=first?.objectId===a.objectId&&first.index===a.index?a:b;
      let best=Infinity;
      for(const endpoint of [forward,forward===a?b:a]){
        const tail=findRoute(this.map,this.poses,{objectId:endpoint.objectId,index:endpoint.index},id,targetIndex,this.projection);if(!tail)continue;
        let cost=length(sub(endpoint.point,this.position)),previous=endpoint;
        for(const next of tail){cost+=this.isOpticalStep(previous.point,previous.objectId,next)?0:length(sub(next.point,previous.point));previous=next;}
        if(cost<best-1e-8){best=cost;route=[endpoint,...tail];}
      }
    }else route=findRoute(this.map,this.poses,this.at,id,targetIndex,this.projection);
    if(!route) {this.message='道路尚未连通。寻找开关，或调整机关。';return false;}
    this.route=route;this.message='旅行者正在前往新的道路。';return true;
  }
  private isOpticalStep(point:Vec3,objectId:string,next:Waypoint):boolean {
    const a=this.projection(next.point),b=this.projection(point);
    return next.objectId!==objectId&&length(sub(next.point,point))>.065&&Math.hypot(a[0]-b[0],a[1]-b[1])<.055;
  }
  canDrag(id:string):boolean {
    const o=this.map.objects.find(x=>x.id===id),at=this.map.objects.find(x=>x.id===this.at.objectId);
    return !!o&&(o.type===3||o.type===4)&&!this.walking&&!this.busy&&!this.completed&&(o.motion.targetGroup?!belongsToGroup(this.map,at?.groupId,o.motion.targetGroup):o.id!==this.at.objectId);
  }
  dragTo(id:string,value:number,snap=false):boolean {
    const o=this.map.objects.find(x=>x.id===id);if(!o||!this.canDrag(id)||!Number.isFinite(value))return false;
    if(snap)value=Math.round(value/o.motion.step)*o.motion.step;
    this.poses.mechanisms[id]=o.type===3?value:Math.max(o.motion.min,Math.min(o.motion.max,value));return true;
  }
  private enter():void {
    const o=this.map.objects.find(x=>x.id===this.at.objectId)!;
    if(pathMarker(o)?.kind==='exit'&&this.at.index===markerIndex(o)) {this.completed=true;this.route=[];this.message='山谷的另一侧，又多了一盏灯。';return;}
    if(this.at.index!==centerIndex(o)||o.type!==8||(o.trigger.mode==='once'&&this.fired.has(o.id)))return;
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
      const next=this.route[0]!,d=sub(next.point,this.position),distance=length(d);
      const optical=this.isOpticalStep(this.position,this.at.objectId,next);
      const cost=this.ladderFrame?2:1,travel=budget/cost;
      if(distance<=travel||optical) {
        if(!optical&&distance>.00001)this.direction=unit(d);
        this.position=[...next.point];this.up=[...next.up];this.at={objectId:next.objectId,index:next.index};this.route.shift();this.segment=null;budget-=optical?0:distance*cost;this.enter();
      } else {
        if(!this.segment){const o=this.map.objects.find(o=>o.id===this.at.objectId)!,sample=worldSamples(this.map,o,this.poses)[this.at.index]!;this.segment={a:{...sample,...this.at},b:next};}
        this.position=mix(this.position,next.point,travel/distance);this.up=unit(mix(this.up,next.up,travel/distance));this.direction=unit(d);budget=0;}
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
  make(1,'rotating-a',[3,0,1],{groupId:'turning',rotation:[0,90,0]});
  make(1,'rotating-center',[3,0,0],{groupId:'turning',rotation:[0,90,0]});
  make(1,'rotating-b',[3,0,-1],{groupId:'turning',rotation:[0,90,0]});
  make(10,'exit',[5,0,0]);
  map.groups=[{id:'sliding',name:'双桥平移组',pivot:[-.5,0,3]},{id:'turning',name:'回廊旋转组',pivot:[3,0,0]}];
  a.trigger.actions=[{groupId:'sliding',translation:[0,0,-3],rotation:[0,0,0],duration:1.5,easing:'smooth'}];
  b.trigger.actions=[{groupId:'turning',translation:[0,0,0],rotation:[0,-90,0],duration:1.4,easing:'smooth'}];
  return map;
}
export function catalogGarden():ValleyMap {
  const map=emptyMap();map.id='catalog-garden';map.name='物体目录 · 路径与装饰物';
  map.objects=CATALOG.filter(c=>c.type<=10).map((c,i)=>createObject(c.type,`sample-${c.type}`,[(i%5)*4-8,0,Math.floor(i/5)*5-2]));
  map.objects.find(o=>o.type===6)!.twist=180;
  map.objects.find(o=>o.type===6)!.length=3;map.objects.find(o=>o.type===6)!.thickness=.3;
  map.objects.find(o=>o.type===8)!.trigger.actions=[{groupId:'showcase',translation:[0,2,0],rotation:[0,90,0],duration:2,easing:'smooth'}];
  map.groups=[{id:'showcase',name:'演示组',pivot:[-8,0,-2]}];map.objects[0]!.groupId='showcase';const sea=createObject(11,'sample-11',[0,-3,1]);sea.length=24;sea.width=16;map.objects.push(sea,createObject(12,'sample-12',[8,0,6]),...CATALOG.filter(c=>c.type>=13&&c.type<=16).map((c,i)=>createObject(c.type,`sample-${c.type}`,[i*4-6,0,9])),createObject(17,'sample-17',[10,0,9]));return map;
}

/** Both halves share a projected cube, while their world positions are three cells apart. */
export function splitGarden():ValleyMap {
  const map=emptyMap();map.id='split-cube';map.name='分体方块 · 眼前一格，身处两地';
  map.objects=[createObject(9,'start',[-2,0,0]),createObject(1,'approach',[-1,0,0]),createObject(1,'half-a'),createObject(1,'beyond',[4,3,3]),createObject(10,'exit',[5,3,3])];
  splitCube(map,'half-a','half-b',3);return map;
}

/** A wheel around Z turns the upright bridge back into a horizontal road. */
export function seasideGarden():ValleyMap {
  const map=emptyMap();map.id='seaside-garden';map.name='潮汐回廊 · 转动海上的路';
  map.objects=[createObject(9,'start',[-2,0,0]),createObject(1,'approach',[-1,0,0]),createObject(1,'colonnade',[0,0,0]),createObject(1,'road-1',[1,0,0]),createObject(1,'road-2',[2,0,0]),createObject(3,'wheel',[3,0,0]),createObject(10,'exit',[6,0,0])];
  const wheel=map.objects.find(o=>o.id==='wheel')!;wheel.motion={axis:'z',min:-90,max:0,step:90,targetGroup:'bridge'};
  map.groups=[{id:'bridge',name:'海上转桥',pivot:[3,0,0]}];
  for(let i=1;i<=2;i++){const road=createObject(1,`bridge-${i}`,[2.5,i-.5,0]);road.rotation=[0,0,90];road.groupId='bridge';map.objects.push(road);}
  for(const corner of [0,1,2,3] as CornerId[]){const pillar=createObject(12,`pillar-${corner}`);pillar.rise=1.2;pillar.attachment={pathId:'colonnade',corner};map.objects.push(pillar);}
  const sea=createObject(11,'sea',[1,-2,0]);sea.length=18;sea.width=12;map.objects.push(sea);return map;
}

/** The user's two rotated A prisms: no authored optical links are needed. */
export function rotatedSeamGarden():ValleyMap {
  const map=emptyMap();map.id='rotated-seam';map.name='折角回廊 · 旋转半块接缝';
  const positions:Vec3[]=[[5,0,4],[6,0,4],[7,0,4],[8,0,4],[9,0,4],[10,0,4],[4,0,4],[3,0,4],[2,0,4],[2,0,3],[2,0,2],[7,5,7],[7,5,6]];
  map.objects=positions.map((p,i)=>createObject(i===5?9:i===12?10:i===10||i===11?5:1,`object-${i+1}`,p));
  map.objects[10]!.rotation=[90,0,-90];map.objects[11]!.rotation=[-90,-90,0];return map;
}
/** Enter a wall face through a quarter-twist or a banking arc. */
export function surfaceGarden(arc=false):ValleyMap {
  const map=emptyMap();map.id=arc?'arc-surfaces':'six-surfaces';map.name=arc?'弧光之径 · 转向墙面':'翻面之径 · 从地面走向墙面';
  const path=createObject(arc?7:6,'connector');path.length=3;path.thickness=.22;
  if(arc){path.rotation=[0,45,0];path.arcTwist=90;}
  const samples=worldSamples(map,path,emptyPoses()),first=samples[0]!,last=samples.at(-1)!;
  const start=createObject(9,'start',sub(first.point,arc?[0,0,-.5]:[.5,0,0]));if(arc)start.rotation=[0,90,0];
  const a=createObject(1,'wall-a',add(last.point,[.5,.5,-.5])),b=createObject(1,'wall-b',add(last.point,[1.5,.5,-.5]));
  const exit=createObject(10,'exit',add(last.point,[2.5,0,0]));exit.rotation=[90,0,0];
  map.objects=[start,path,a,b,exit];return map;
}

/** A small playable promenade with decorative architecture and planting. */
export function decorationGarden():ValleyMap {
  const map=emptyMap();map.id='decoration-garden';map.name='花园塔影 · 建筑与花木';
  map.objects=Array.from({length:7},(_,i)=>createObject(i===0?9:i===6?10:1,`road-${i}`,[i-3,0,1]));
  const ground=createObject(1,'garden-base',[0,0,-1.3]);ground.length=8;ground.width=3.4;ground.thickness=.35;ground.colors.surface='#b3c68b';map.objects.push(ground);
  map.objects.push(createObject(13,'pavilion',[-2.7,0,-1.8]),createObject(15,'tower',[2.6,0,-1.8]));
  for(const [i,x,z,h] of [[0,-1.3,-1.8,1.1],[1,0,-2.1,.8],[2,1.1,-1.6,1.2],[3,-.5,-.4,.7]]){const o=createObject(14,`bush-${i}`,[x!,0,z!]);o.rise=h!;o.length=.7;o.width=.65;o.rotation[1]=i!*31;map.objects.push(o);}
  for(const [i,x,z] of [[0,-1.5,-.6],[1,.6,-.5],[2,1.8,-2.3],[3,-.6,-2.5]])map.objects.push(createObject(16,`flowers-${i}`,[x!,0,z!]));
  const sea=createObject(11,'sea',[0,-1,0]);sea.length=16;sea.width=12;map.objects.push(sea);return map;
}

/** Two-storey courtyard: the lower and upper walk ports meet the ladder ends. */
export function ladderGarden():ValleyMap {
  const map=emptyMap();map.id='ladder-garden';map.name='攀光庭院 · 沿梯而上';
  const start=createObject(9,'start',[-1,0,1]),bottom=createObject(1,'landing',[0,0,1]),wall=createObject(1,'upper',[0,2,-.5]);wall.thickness=3;
  const ladder=createObject(17,'ladder'),road=createObject(1,'upper-road',[-1,2,-.5]),exit=createObject(10,'exit',[-2,2,-.5]);
  const sea=createObject(11,'sea',[0,-1.3,0]);sea.colors.surface='#439dac';sea.length=12;sea.width=10;
  map.objects=[start,bottom,wall,ladder,road,exit,sea];return map;
}


/** Two full turns, independent gate decorations and markers on ordinary roads. */
export function gateGarden():ValleyMap {
  const map=emptyMap();map.id='gate-garden';map.name='回旋门廊 · 两圈之后';
  const twist=createObject(6,'twist');twist.length=5;twist.twist=720;twist.thickness=.5;
  const start=createObject(1,'start',[-3,0,0]),exit=createObject(1,'exit',[3,0,0]);
  const arch=createObject(18,'arch',[-3.3,0,0]),square=createObject(19,'square',[3.3,0,0]);arch.rotation=[0,90,0];square.rotation=[0,90,0];
  map.objects=[start,twist,exit,arch,square];setPathMarker(map,'start','spawn');setPathMarker(map,'exit','exit');return map;
}
