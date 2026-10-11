export type Vec3 = [number,number,number];
export type TypeId = 1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22;
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
  {type:20,name:'传送门',icon:'⟐',color:'#83bdb9',description:'附着路径表面，进入后从目标门出现'},
  {type:21,name:'水流',icon:'≋',color:'#459daf',description:'沿局部 X 方向流动的低多边形水道'},
  {type:22,name:'瀑布',icon:'⇣',color:'#66bcc5',description:'从顶部向下落的水幕与落水浪花'},
] as const;
export interface Motion { axis: Axis; min: number; max: number; step: number; targetGroup: string|null }
export interface Action { groupId: string; translation: Vec3; rotation: Vec3; duration: number; easing: 'linear'|'smooth' }
export type StateProperty='enabled'|'visible'|'walkable';
export type ObjectState=Record<StateProperty,boolean>;
export type Compare='eq'|'ne'|'gt'|'gte'|'lt'|'lte';
export type LogicValue=boolean|number;
export interface LogicVariable {id:string;name:string;initial:LogicValue;resetGroup?:string}
export type EventType='start'|'enter'|'leave'|'switch'|'portal'|'mechanism'|'group'|'variable'|'signal'|'checkpoint'|'restore'|'reset'|'departure'|'arrival'|'stage'|'dialogue'|'objective';
export interface LogicEvent {type:EventType;source:string|null;face?:number;stationId?:string;choiceId?:string}
export type ObjectiveStatus='hidden'|'active'|'done';
export interface StoryChoice {id:string;text:string;signal:string|null;condition:LogicCondition}
export interface StoryDialogue {id:string;name:string;speaker:string;lines:string[];choices:StoryChoice[];resetGroup?:string}
export interface StoryObjective {id:string;name:string;description:string;initial:ObjectiveStatus;resetGroup?:string}
export interface MapStory {dialogues:StoryDialogue[];objectives:StoryObjective[]}
export interface StoryState {objectives:Record<string,ObjectiveStatus>;seen:string[];choices:Record<string,string>;queue:Array<{dialogueId:string;token:number;line:number;active:boolean}>}
export interface ConditionTrace {label:string;passed:boolean;children:ConditionTrace[]}
export type LogicCondition=
  |{kind:'all';conditions:LogicCondition[]}|{kind:'any';conditions:LogicCondition[]}
  |{kind:'not';condition:LogicCondition}
  |{kind:'objective';objectiveId:string;status:ObjectiveStatus}|{kind:'dialogue';dialogueId:string;seen:boolean}
  |{kind:'variable';id:string;op:Compare;value:LogicValue}
  |{kind:'switch';objectId:string;value:boolean}
  |{kind:'state';objectId:string;property:StateProperty;value:boolean}
  |{kind:'mechanism';objectId:string;op:Compare;value:number}
  |{kind:'platform';groupId:string;stationId:string|null}|{kind:'stage';stageId:string;status:'active'|'visited'};
export type LogicAction=
  |{kind:'variable';id:string;operation:'set'|'add'|'toggle';value:LogicValue}
  |{kind:'state';targetId:string;property:StateProperty;value:boolean}
  |({kind:'move'}&Action)
  |{kind:'wait';duration:number}
  |{kind:'sequence';actions:LogicAction[]}|{kind:'parallel';actions:LogicAction[]}
  |{kind:'signal';name:string}
  |{kind:'message';text:string}
  |{kind:'dialogue';dialogueId:string}|{kind:'objective';objectiveId:string;status:ObjectiveStatus}
  |{kind:'rule';ruleId:string;enabled:boolean}
  |{kind:'platform';groupId:string;command:'go'|'pause'|'resume';stationId:string|null}|{kind:'stage';stageId:string}
  |{kind:'checkpoint';name:string}|{kind:'restore'}|{kind:'reset';groupId:string;returnPlayer:boolean};
export interface LogicRule {id:string;name:string;enabled:boolean;once:boolean;event:LogicEvent;condition:LogicCondition;actions:LogicAction[];resetGroup?:string}
export interface MapLogic {variables:LogicVariable[];rules:LogicRule[]}
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
  20:{hub:'#e3cf90',spokes:'#b7ffff',base:'#587d83'},
  21:{hub:'#b1e8de',base:'#2c708e'},
  22:{hub:'#e1fff0',base:'#39869c'},
};
export const decorationColorFields:Partial<Record<TypeId,Array<[keyof ObjectColors,string]>>>={
  13:[['surface','亭柱'],['hub','金顶'],['spokes','旗帜'],['tips','顶饰'],['base','檐边与柱脚']],
  14:[['surface','灌木主色'],['hub','亮面叶色'],['base','暗面叶色']],
  15:[['surface','塔身'],['hub','尖顶'],['spokes','城垛'],['base','腰线与底座']],
  16:[['surface','花瓣'],['hub','花心'],['spokes','花茎'],['base','叶片']],
  17:[['surface','梯框'],['hub','横档']],
  18:[['surface','门柱与拱圈'],['hub','拱顶石'],['base','柱脚']],
  19:[['surface','门柱'],['hub','门楣'],['base','柱脚与柱头']],
  20:[['surface','门框'],['hub','门顶'],['spokes','门内光幕'],['base','柱脚']],
  21:[['surface','水流主色'],['hub','流纹与泡沫'],['base','暗面水色']],
  22:[['surface','水幕主色'],['hub','落水流纹与浪花'],['base','暗面水色']],
};
export const isDecoration=(type:TypeId):boolean=>type>=11&&type!==17&&type!==20;
export const isBuiltDecoration=(type:TypeId):boolean=>type>=13&&type<=20&&type!==17;
export const isFlowDecoration=(type:TypeId):boolean=>type===21||type===22;
export const MAX_TWIST=36000;
export type PathMarkerKind='spawn'|'exit';
export interface PathMarker {kind:PathMarkerKind;face:number}
export interface PortalSettings {pathId:string|null;face:number;targetId:string|null;shape:'arch'|'square'}
export function defaultColors(type:TypeId):ObjectColors {return {...WHEEL_PALETTES[0]!.colors,surface:type===3?WHEEL_PALETTES[0]!.colors.surface:CATALOG.find(c=>c.type===type)!.color,...DECORATION_COLORS[type]};}
export type CornerId=0|1|2|3;
export interface PillarAttachment { pathId:string; corner:CornerId }
export interface WaterSettings { amplitude:number; speed:number; wavelength:number; facetSize?:number; contrast?:number; lightColor?:string; darkColor?:string }
export const defaultWater=(type?:TypeId):WaterSettings=>({amplitude:type===21||type===22?.03:.08,speed:.65,wavelength:4});
/** Optional affine offset preserves world geometry when reparenting scaled/rotated nodes. */
export interface ParentOffset { basis?:number[]; order?:number }
export interface MapObject extends ParentOffset {
  id: string; type: TypeId; name: string; position: Vec3; rotation: Vec3; groupId: string|null;
  length: number; width: number; thickness: number; rise: number; steps: number; radius: number; arc: number; twist: number;
  prismHalf:'a'|'b'; arcTwist:number;
  /** Surface annotation, independent of road geometry. IDs 9/10 remain legacy aliases. */
  marker?:PathMarker;
  checkpoint?:{name:string;face:number};
  portal?:PortalSettings;
  state?:Partial<ObjectState>;
  colors:ObjectColors; water:WaterSettings; attachment:PillarAttachment|null;
  motion: Motion; trigger: {mode:'once'|'toggle';actions:Action[]};
}
export interface PlatformStation {id:string;name:string;translation:Vec3;rotation:Vec3;duration:number;wait:number}
export interface PlatformSettings {stations:PlatformStation[];initialStation:string;mode:'manual'|'loop'|'pingpong';autoStart:boolean}
export interface StageCamera {target:Vec3;yaw:number;pitch:number;span:number;duration:number;lock:boolean}
export interface MapStage {id:string;name:string;groups:string[];entry:{objectId:string;face:number}|null;camera:StageCamera|null}
export interface SceneStages {initial:string;items:MapStage[]}
export interface PlatformState {stationId:string|null;targetId:string|null;from:GroupPose;elapsed:number;wait:number;reverse:boolean;running:boolean;paused:boolean;token:number|null;queue:Array<{stationId:string;token:number}>}
export interface MapGroup extends ParentOffset { platform?:PlatformSettings; id:string; name:string; pivot:Vec3; parentId?:string|null; position?:Vec3; rotation?:Vec3; scale?:Vec3 }
export interface OpticalLink { a:string; aEnd:PortId; b:string; bEnd:PortId }
export interface StaticPathPlan {version:1;batches:number[][]}
export interface ValleyMap {
  format:'haiyue-valley-map'; version:1; catalogVersion:1; id:string; name:string;
  objects:MapObject[]; groups:MapGroup[]; opticalLinks:OpticalLink[];
  logic?:MapLogic;stages?:SceneStages;story?:MapStory;
  /** Validated load-time hint; authoring serialization deliberately drops it. */
  renderPlan?:StaticPathPlan;
}
export const cloneMap = (map: ValleyMap): ValleyMap => structuredClone(map);
export function createObject(type:TypeId,id:string,position:Vec3=[0,0,0]): MapObject {
  return {id,type,name:type===9?'出生平台':type===10?'出口平台':CATALOG.find(x=>x.type===type)!.name,position:[...position],rotation:[0,0,0],groupId:null,
    length:type===11?16:type===21?4:type===22?2:type===12?.12:1,width:type===11?16:type===12?.12:type===17?.65:type>=18&&type<=20?.25:type===22?.18:1,thickness:1,rise:type===22?3:type===21?.1:type===17?2:type===12?1.8:type===13?2.8:type===15?3:type===16?.25:type>=18?1.7:1,steps:type===17?8:6,radius:2,arc:90,twist:90,arcTwist:0,prismHalf:'a',colors:defaultColors(type),water:defaultWater(type),attachment:null,
    ...(type===20?{portal:{pathId:null,face:0,targetId:null,shape:'arch' as const}}:{}),
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
    if(o.state!==undefined&&(!record(o.state)||Object.entries(o.state).some(([k,v])=>!['enabled','visible','walkable'].includes(k)||typeof v!=='boolean')))throw new Error(`${o.id}: 初始状态无效。`);
    if(!vector(o.position)||!vector(o.rotation)||(o.groupId!==null&&!groups.has(o.groupId as string))) throw new Error(`物体 ${o.id} 的变换或组引用无效。`);
    if(o.arcTwist!==undefined&&!finite(o.arcTwist,-360,360))throw new Error(`${o.id}: 圆弧翻面角度无效。`);
    if(o.prismHalf!==undefined&&!['a','b'].includes(o.prismHalf as string)) throw new Error(`${o.id}: 三棱柱必须选择 A 或 B 半块。`);
    if(o.colors!==undefined&&(!record(o.colors)||Object.values(defaultColors(o.type as TypeId)).length!==Object.keys(o.colors).length||!Object.keys(defaultColors(o.type as TypeId)).every(k=>typeof (o.colors as Record<string,unknown>)[k]==='string'&&/^#[0-9a-f]{6}$/i.test((o.colors as Record<string,string>)[k]!))))throw new Error(`${o.id}: 配色必须包含五个 #RRGGBB 颜色。`);
    for(const key of ['length','width','thickness','radius']) if(!finite(o[key],.1,50)) throw new Error(`${o.id}: ${key} 必须介于 0.1 和 50。`);
    if(!finite(o.rise,-30,30)||!finite(o.steps,1,64)||!Number.isInteger(o.steps)||!finite(o.arc,5,330)||!finite(o.twist,-MAX_TWIST,MAX_TWIST)) throw new Error(`${o.id}: 路径参数无效。`);
    const marker=o.marker;if(marker!==undefined&&(!record(marker)||!['spawn','exit'].includes(marker.kind as string)||!canMarkPath(o as unknown as MapObject)||!walkSurfaces(o as unknown as MapObject).some(f=>f.face===marker.face)))throw new Error(`${o.id}: 路径记号或所在表面无效。`);
    const checkpoint=o.checkpoint;if(checkpoint!==undefined&&(!record(checkpoint)||!label(checkpoint.name)||!canMarkPath(o as unknown as MapObject)||!walkSurfaces(o as unknown as MapObject).some(f=>f.face===checkpoint.face)))throw new Error(`${o.id}: 检查点名称或表面无效。`);
    const portal=o.portal;if(portal!==undefined&&(o.type!==20||!record(portal)||(portal.pathId!==null&&!identifier(portal.pathId))||(portal.targetId!==null&&!identifier(portal.targetId))||!finite(portal.face,0,6)||!Number.isInteger(portal.face)||!['arch','square'].includes(portal.shape as string)))throw new Error(`${o.id}: 传送门参数无效。`);
    if(record(portal)&&portal.pathId!==null&&(o.groupId!==null||o.position.some(v=>v!==0)||o.basis!==undefined))throw new Error(`${o.id}: 已附着传送门的位置由路径决定。`);
    if(o.water!==undefined&&(!record(o.water)||!finite(o.water.amplitude,0,o.type===21||o.type===22?.04:.4)||!finite(o.water.speed,0,3)||!finite(o.water.wavelength,1,20)))throw new Error(`${o.id}: 水体起伏参数无效。`);
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
  for(const o of input.objects)if(o.portal){const p=o.portal,host=input.objects.find(h=>h.id===p.pathId),target=input.objects.find(t=>t.id===p.targetId);
    if(p.pathId!==null&&(!host||!canMarkPath(host)||!walkSurfaces(host).some(f=>f.face===p.face)))throw new Error(`${o.id}: 传送门必须附着在有效路径表面。`);
    if(p.targetId!==null&&(!target||target.type!==20||target.id===o.id))throw new Error(`${o.id}: 请选择另一扇传送门。`);
    if(p.pathId){const key=`portal:${p.pathId}:${p.face}`;if(occupied.has(key))throw new Error('同一路径表面只能放置一扇传送门。');occupied.add(key);}
  }
  for(const o of input.objects)if(o.attachment){const a=o.attachment,parent=input.objects.find(p=>p.id===a.pathId),key=`${a.pathId}:${a.corner}`;if(!parent||!canAttachPillar(parent.type)||occupied.has(key))throw new Error(`${o.id}: 柱子必须引用普通路径或出生平台的空闲角点。`);occupied.add(key);}
  for(const l of input.opticalLinks) {
    if(!record(l)||!ids.has(l.a as string)||!ids.has(l.b as string)||l.a===l.b||!Number.isInteger(l.aEnd)||!Number.isInteger(l.bEnd)) throw new Error('错觉接缝引用了不存在的物体或端点。');
    for(const [id,port] of [[l.a,l.aEnd],[l.b,l.bEnd]]) {
      const o=input.objects.find(o=>o.id===id) as MapObject;
      if(!pathPorts(o).some(p=>p.port===port))throw new Error(`物体 ${id} 不存在端口 ${port}。`);
    }
  }
  const stages=input.stages===undefined?undefined:parseStages(input.stages,input.objects as MapObject[],input.groups as MapGroup[]);validatePlatforms(input.groups as MapGroup[],input.objects as MapObject[]);
  const story=input.story===undefined?undefined:parseStory(input.story,[...input.objects,...input.groups,...stages?.items??[]],input.groups as MapGroup[]);
  const logic=parseLogic(input.logic??{variables:[],rules:[]},input.objects as MapObject[],input.groups as MapGroup[],stages,story);
  // Rebuild known fields to keep editor/runtime metadata out of the portable protocol.
  return {format:'haiyue-valley-map',version:1,catalogVersion:1,id:input.id,name:input.name,
    ...(stages?{stages}:{}),
    ...(story?{story}:{}),...(input.logic!==undefined?{logic}:{}),
    groups:input.groups.map(g=>({id:g.id,name:g.name,...(g.platform?{platform:parsePlatform(g.platform)}:{}),pivot:[...g.pivot] as Vec3,...(g.parentId!==undefined?{parentId:g.parentId}:{}),...(g.position?{position:[...g.position]}:{}),...(g.rotation?{rotation:[...g.rotation]}:{}),...(g.scale?{scale:[...g.scale]}:{}),...(g.basis?{basis:[...g.basis]}:{}),...(g.order!==undefined?{order:g.order}:{})})),
    opticalLinks:input.opticalLinks.map(l=>({a:l.a,aEnd:l.aEnd,b:l.b,bEnd:l.bEnd})),
    objects:input.objects.map(o=>({id:o.id,type:o.type,name:o.name,position:[...o.position] as Vec3,rotation:[...o.rotation] as Vec3,groupId:o.groupId,...(o.basis?{basis:[...o.basis]}:{}),...(o.order!==undefined?{order:o.order}:{}),
      ...(o.marker?{marker:{kind:o.marker.kind,face:o.marker.face}}:{}),
      ...(o.checkpoint?{checkpoint:{name:o.checkpoint.name,face:o.checkpoint.face}}:{}),
      ...(o.state?{state:{...o.state}}:{}),
      ...(o.type===20?{portal:o.portal?{pathId:o.portal.pathId,face:o.portal.face,targetId:o.portal.targetId,shape:o.portal.shape}:{pathId:null,face:0,targetId:null,shape:'arch'}}:{}),
      length:o.length,width:o.width,thickness:o.thickness,rise:o.rise,steps:o.steps,radius:o.radius,arc:o.arc,twist:o.twist,arcTwist:o.arcTwist??0,prismHalf:o.prismHalf??'a',colors:o.colors?{...o.colors}:defaultColors(o.type),water:o.water?{...o.water}:defaultWater(o.type),attachment:o.attachment?{pathId:o.attachment.pathId,corner:o.attachment.corner}:null,
      motion:{axis:o.motion.axis,min:o.motion.min,max:o.motion.max,step:o.motion.step,targetGroup:o.motion.targetGroup},
      trigger:{mode:o.trigger.mode,actions:o.trigger.actions.map((a:Action)=>({groupId:a.groupId,translation:[...a.translation] as Vec3,rotation:[...a.rotation] as Vec3,duration:a.duration,easing:a.easing}))}}))} as ValleyMap;
}
export function playIssues(map:ValleyMap):string[] {
  const issues:string[]=[];
  if(map.objects.filter(o=>pathMarker(o)?.kind==='spawn').length!==1) issues.push('试玩需要恰好一个出生记号。');
  if(!map.objects.some(o=>pathMarker(o)?.kind==='exit')) issues.push('试玩需要至少一个出口记号。');
  for(const o of map.objects.filter(o=>o.type===20))if(!portalAnchor(map,o)||(o.portal?.targetId?!portalDestination(map,o):!map.objects.some(p=>p.portal?.targetId===o.id)))issues.push(`传送门「${o.name}」需要绑定路径并配置目的地，或作为其他门的接收端。`);
  for(const o of map.objects.filter(o=>o.type===8)) {
    if(!o.trigger.actions.length&&!map.logic?.rules.some(r=>conditionReferences(r.condition).includes(o.id)||r.event.type==='switch'&&(r.event.source===null||r.event.source===o.id))) issues.push(`开关「${o.name}」尚未配置动作或事件规则。`);
    for(const a of o.trigger.actions) if(!map.objects.some(x=>belongsToGroup(map,x.groupId,a.groupId))) issues.push(`开关目标组 ${a.groupId} 没有成员。`);
  }
  for(const g of map.groups.filter(g=>g.platform))if(!map.objects.some(o=>isWalkable(o)&&belongsToGroup(map,o.groupId,g.id)))issues.push(`移动平台「${g.name}」需要可行走的路径。`);
  const spawn=map.objects.find(o=>pathMarker(o)?.kind==='spawn');if(spawn&&(spawn.state?.visible===false||spawn.state?.walkable===false||map.stages&&!stageAllows(map,spawn,{...emptyPoses(),stageId:map.stages.initial})))issues.push('出生路径初始状态必须可见且可行走。');
  return issues;
}
export function serializeMap(map:ValleyMap):string { return JSON.stringify(parseMap(map),null,2)+'\n'; }

/** Rules are data only: bounded trees, typed values and validated references. */
function parseLogic(input:unknown,objects:MapObject[],groups:MapGroup[],stages?:SceneStages,story?:MapStory):MapLogic {
  const fail=(text:string):never=>{throw new Error(`关卡逻辑：${text}`);};
  if(!record(input)||!Array.isArray(input.variables)||input.variables.length>64||!Array.isArray(input.rules)||input.rules.length>100)return fail('最多 64 个变量、100 条规则。');
  const vars=new Map<string,LogicValue>(),rules=new Set<string>(),object=(id:unknown)=>objects.find(o=>o.id===id),group=(id:unknown)=>groups.some(g=>g.id===id);
  const stage=(id:unknown)=>stages?.items.some(s=>s.id===id),platform=(id:unknown)=>groups.find(g=>g.id===id)?.platform,station=(id:unknown,s:unknown)=>platform(id)?.stations.some(p=>p.id===s);
  const dialogue=(id:unknown)=>story?.dialogues.find(d=>d.id===id),objective=(id:unknown)=>story?.objectives.find(o=>o.id===id),storyId=(id:unknown)=>dialogue(id)||objective(id);
  const value=(v:unknown):v is LogicValue=>typeof v==='boolean'||finite(v,-1e9,1e9);
  const comparison=(op:unknown)=>['eq','ne','gt','gte','lt','lte'].includes(op as string);
  const property=(p:unknown)=>['enabled','visible','walkable'].includes(p as string);
  for(const v of input.variables){if(!record(v)||!identifier(v.id)||vars.has(v.id)||object(v.id)||group(v.id)||stage(v.id)||storyId(v.id)||!label(v.name)||!value(v.initial))return fail('变量 ID、名称或初值无效（ID 不可与节点重复）。');vars.set(v.id,v.initial);}
  for(const r of input.rules){if(!record(r)||!identifier(r.id)||rules.has(r.id)||vars.has(r.id)||object(r.id)||group(r.id)||stage(r.id)||storyId(r.id)||!label(r.name)||typeof r.enabled!=='boolean'||typeof r.once!=='boolean')return fail('规则 ID、名称或开关无效（ID 必须唯一）。');rules.add(r.id);}
  for(const item of [...input.variables,...input.rules])if(item.resetGroup!==undefined&&!group(item.resetGroup))return fail('重置归属必须引用有效父节点。');
  let count=0;
  const guard=(v:unknown,depth:number):Record<string,unknown>=>{if(!record(v)||depth>6||++count>2048)return fail('规则树过深或节点过多（最多 6 层、2048 个节点）。');return v;};
  const condition=(raw:unknown,depth=0):LogicCondition=>{
    const c=guard(raw,depth);
    if(c.kind==='all'||c.kind==='any'){if(!Array.isArray(c.conditions)||c.conditions.length>32)return fail('组合条件无效。');return {kind:c.kind,conditions:c.conditions.map(x=>condition(x,depth+1))};}
    if(c.kind==='objective'&&objective(c.objectiveId)&&['hidden','active','done'].includes(c.status as string))return {kind:'objective',objectiveId:c.objectiveId as string,status:c.status as ObjectiveStatus};
    if(c.kind==='dialogue'&&dialogue(c.dialogueId)&&typeof c.seen==='boolean')return {kind:'dialogue',dialogueId:c.dialogueId as string,seen:c.seen};
    if(c.kind==='not')return {kind:'not',condition:condition(c.condition,depth+1)};
    if(c.kind==='variable'){if(!vars.has(c.id as string)||!comparison(c.op)||!value(c.value)||typeof c.value!==typeof vars.get(c.id as string)||(typeof c.value==='boolean'&&!['eq','ne'].includes(c.op as string)))return fail('变量条件类型或比较符无效。');return {kind:'variable',id:c.id as string,op:c.op as Compare,value:c.value};}
    if(c.kind==='switch'&&object(c.objectId)?.type===8&&typeof c.value==='boolean')return {kind:'switch',objectId:c.objectId as string,value:c.value};
    if(c.kind==='state'&&object(c.objectId)&&property(c.property)&&typeof c.value==='boolean')return {kind:'state',objectId:c.objectId as string,property:c.property as StateProperty,value:c.value};
    if(c.kind==='platform'&&platform(c.groupId)&&(c.stationId===null||station(c.groupId,c.stationId)))return {kind:'platform',groupId:c.groupId as string,stationId:c.stationId as string|null};
    if(c.kind==='stage'&&stage(c.stageId)&&['active','visited'].includes(c.status as string))return {kind:'stage',stageId:c.stageId as string,status:c.status as 'active'|'visited'};
    if(c.kind==='mechanism'&&[3,4].includes(object(c.objectId)?.type??0)&&comparison(c.op)&&finite(c.value,-1e9,1e9))return {kind:'mechanism',objectId:c.objectId as string,op:c.op as Compare,value:c.value};
    return fail('条件类型或目标不存在。');
  };
  const actions=(raw:unknown,depth=0):LogicAction[]=>{
    if(!Array.isArray(raw)||raw.length>64)return fail('每组最多 64 个动作。');
    return raw.map<LogicAction>(raw=>{const a=guard(raw,depth);
      if(a.kind==='sequence')return {kind:'sequence',actions:actions(a.actions,depth+1)};
      if(a.kind==='parallel')return {kind:'parallel',actions:actions(a.actions,depth+1)};
      if(a.kind==='variable'){
        const initial=vars.get(a.id as string);if(initial===undefined||!['set','add','toggle'].includes(a.operation as string)||!value(a.value)||typeof a.value!==typeof initial||(a.operation==='add'&&typeof initial!=='number')||(a.operation==='toggle'&&typeof initial!=='boolean'))return fail('变量动作的操作或值类型无效。');
        return {kind:'variable',id:a.id as string,operation:a.operation as 'set'|'add'|'toggle',value:a.value};
      }
      if(a.kind==='state'&&(object(a.targetId)||group(a.targetId))&&property(a.property)&&typeof a.value==='boolean')return {kind:'state',targetId:a.targetId as string,property:a.property as StateProperty,value:a.value};
      if(a.kind==='move'&&group(a.groupId)&&!groups.some(g=>g.platform&&(belongsToGroup({groups} as ValleyMap,g.id,a.groupId as string)||belongsToGroup({groups} as ValleyMap,a.groupId as string,g.id)))&&vector(a.translation)&&vector(a.rotation)&&finite(a.duration,.1,60)&&['linear','smooth'].includes(a.easing as string))return {kind:'move',groupId:a.groupId as string,translation:[...a.translation],rotation:[...a.rotation],duration:a.duration,easing:a.easing as 'linear'|'smooth'};
      if(a.kind==='wait'&&finite(a.duration,0,300))return {kind:'wait',duration:a.duration};
      if(a.kind==='signal'&&identifier(a.name))return {kind:'signal',name:a.name};
      if(a.kind==='message'&&typeof a.text==='string'&&a.text.length<=300)return {kind:'message',text:a.text};
      if(a.kind==='rule'&&rules.has(a.ruleId as string)&&typeof a.enabled==='boolean')return {kind:'rule',ruleId:a.ruleId as string,enabled:a.enabled};
      if(a.kind==='platform'&&platform(a.groupId)&&['go','pause','resume'].includes(a.command as string)&&(a.command==='go'?station(a.groupId,a.stationId):a.stationId===null))return {kind:'platform',groupId:a.groupId as string,command:a.command as 'go'|'pause'|'resume',stationId:a.stationId as string|null};
      if(a.kind==='stage'&&stage(a.stageId))return {kind:'stage',stageId:a.stageId as string};
      if(a.kind==='dialogue'&&dialogue(a.dialogueId))return {kind:'dialogue',dialogueId:a.dialogueId as string};
      if(a.kind==='objective'&&objective(a.objectiveId)&&['hidden','active','done'].includes(a.status as string))return {kind:'objective',objectiveId:a.objectiveId as string,status:a.status as ObjectiveStatus};
      if(a.kind==='checkpoint'&&label(a.name))return {kind:'checkpoint',name:a.name};
      if(a.kind==='restore')return {kind:'restore'};
      if(a.kind==='reset'&&group(a.groupId)&&typeof a.returnPlayer==='boolean')return {kind:'reset',groupId:a.groupId as string,returnPlayer:a.returnPlayer};
      return fail('动作类型、参数或目标不存在。');
    });
  };
  for(const d of story?.dialogues??[])for(const c of d.choices)c.condition=condition(c.condition);
  return {variables:input.variables.map(v=>({id:v.id,name:v.name,initial:v.initial,...(v.resetGroup?{resetGroup:v.resetGroup}:{})})),rules:input.rules.map(r=>{
    const e=r.event;if(!record(e)||!['start','enter','leave','switch','portal','mechanism','group','variable','signal','checkpoint','restore','reset','departure','arrival','stage','dialogue','objective'].includes(e.type as string)||(e.source!==null&&!identifier(e.source)))return fail('事件无效。');
    if(e.type==='start'&&e.source!==null||e.type==='signal'&&e.source===null)return fail('开始事件不使用来源；信号事件必须有名称。');
    if(e.source!==null){const o=object(e.source);if((['enter','leave'].includes(e.type as string)&&(!o||!isWalkable(o)))||(e.type==='switch'&&o?.type!==8)||(e.type==='portal'&&o?.type!==20)||(e.type==='mechanism'&&![3,4].includes(o?.type??0))||(e.type==='group'&&!group(e.source))||(e.type==='variable'&&!vars.has(e.source as string)))return fail('事件来源不存在或类型不匹配。');}
    if(e.source!==null&&((['checkpoint','restore'].includes(e.type as string)&&(!object(e.source)||!isWalkable(object(e.source)!)))||(e.type==='reset'&&!group(e.source))))return fail('检查点或重置事件来源无效。');
    if(e.source!==null&&(['departure','arrival'].includes(e.type as string)?!platform(e.source):e.type==='stage'&&!stage(e.source)))return fail('平台或阶段事件来源无效。');
    if(e.source!==null&&(e.type==='dialogue'&&!dialogue(e.source)||e.type==='objective'&&!objective(e.source)))return fail('剧情事件来源无效。');
    if(e.choiceId!==undefined&&(e.type!=='dialogue'||!dialogue(e.source)?.choices.some(c=>c.id===e.choiceId)))return fail('对话选项来源无效。');
    if(e.stationId!==undefined&&(!['departure','arrival'].includes(e.type as string)||e.source===null||!station(e.source,e.stationId)))return fail('事件站点无效。');
    if(e.face!==undefined&&(!['enter','leave'].includes(e.type as string)||!finite(e.face,0,6)||!Number.isInteger(e.face)||(e.source!==null&&!walkSurfaces(object(e.source)!).some(f=>f.face===e.face))))return fail('事件表面无效。');
    return {id:r.id,name:r.name,enabled:r.enabled,once:r.once,...(r.resetGroup?{resetGroup:r.resetGroup}:{}),event:{type:e.type as EventType,source:e.source as string|null,...(e.choiceId!==undefined?{choiceId:e.choiceId as string}:{}),...(e.stationId!==undefined?{stationId:e.stationId as string}:{}),...(e.face!==undefined?{face:e.face as number}:{})},condition:condition(r.condition),actions:actions(r.actions)};
  })};
}
export function flattenActions(actions:LogicAction[]):LogicAction[] {return actions.flatMap(a=>a.kind==='sequence'||a.kind==='parallel'?[a,...flattenActions(a.actions)]:[a]);}
export function conditionReferences(c:LogicCondition):string[] {return c.kind==='all'||c.kind==='any'?c.conditions.flatMap(conditionReferences):c.kind==='not'?conditionReferences(c.condition):c.kind==='objective'?[c.objectiveId]:c.kind==='dialogue'?[c.dialogueId]:c.kind==='variable'?[c.id]:c.kind==='platform'?[c.groupId]:c.kind==='stage'?[c.stageId]:[c.objectId];}
/** Deletion cannot silently turn a missing condition into true. Remove dependent rules atomically. */
export function removeLogicReferences(map:ValleyMap,ids:Set<string>):void {
  if(map.logic)map.logic.variables=map.logic.variables.filter(v=>{if(v.resetGroup&&ids.has(v.resetGroup)){ids.add(v.id);return false;}return true;});
  if(map.story){map.story.objectives=map.story.objectives.filter(o=>{if(ids.has(o.id)||o.resetGroup&&ids.has(o.resetGroup)){ids.add(o.id);return false;}return true;});let again=true;while(again){again=false;map.story.dialogues=map.story.dialogues.filter(d=>{if(ids.has(d.id)||d.resetGroup&&ids.has(d.resetGroup)||d.choices.some(c=>conditionReferences(c.condition).some(id=>ids.has(id)))){ids.add(d.id);again=true;return false;}return true;});}}
  if(!map.logic)return;let changed=true;
  while(changed){changed=false;map.logic.rules=map.logic.rules.filter(r=>{
    const refs=[r.resetGroup??null,r.event.type==='signal'?null:r.event.source,...conditionReferences(r.condition),...flattenActions(r.actions).flatMap(a=>a.kind==='move'||a.kind==='reset'||a.kind==='platform'?[a.groupId]:a.kind==='stage'?[a.stageId]:a.kind==='dialogue'?[a.dialogueId]:a.kind==='objective'?[a.objectiveId]:a.kind==='state'?[a.targetId]:a.kind==='variable'?[a.id]:a.kind==='rule'?[a.ruleId]:[])];
    const missingChoice=r.event.type==='dialogue'&&r.event.choiceId&&!map.story?.dialogues.find(d=>d.id===r.event.source)?.choices.some(c=>c.id===r.event.choiceId);
    if(ids.has(r.id)||missingChoice||refs.some(id=>id!==null&&ids.has(id))){ids.add(r.id);changed=true;return false;}return true;
  });}
}

/** A controller animates all descendants, including pillars attached to their paths. */
export function analyzeStaticPaths(map:ValleyMap):StaticPathPlan {
  const moving=new Set<string>([...map.groups.filter(g=>g.platform).map(g=>g.id),...(map.stages?.items.flatMap(s=>s.groups)??[])]);for(const o of map.objects){if((o.type===3||o.type===4)&&o.motion.targetGroup)moving.add(o.motion.targetGroup);if(o.type===8)for(const a of o.trigger.actions)moving.add(a.groupId);}
  const changing=new Set<string>();for(const a of (map.logic?.rules??[]).flatMap(r=>flattenActions(r.actions))){if(a.kind==='move')moving.add(a.groupId);if(a.kind==='state'&&a.property==='visible'){if(map.groups.some(g=>g.id===a.targetId))moving.add(a.targetId);else changing.add(a.targetId);}}
  const dynamic=(o:MapObject):boolean=>{const host=o.attachment?map.objects.find(p=>p.id===o.attachment!.pathId)!:o;return o.state?.visible===false||host.state?.visible===false||changing.has(o.id)||changing.has(host.id)||[...moving].some(id=>belongsToGroup(map,host.groupId,id));};
  const materials=new Map<string,number[]>();map.objects.forEach((o,i)=>{if(![1,2,5,6,7,12].includes(o.type)||dynamic(o))return;const key=o.colors.surface.toLowerCase(),batch=materials.get(key)??[];batch.push(i);materials.set(key,batch);});return {version:1,batches:[...materials.values()]};
}
/** Compact v2 stores only deviations from the stable catalog-v1 defaults. No coordinate rounding. */
export function serializeCompactMap(map:ValleyMap):string {
  const source=parseMap(map),sparse=(value:Record<string,unknown>,base:Record<string,unknown>):Record<string,unknown>=>Object.fromEntries(Object.entries(value).flatMap(([key,v])=>{if(JSON.stringify(v)===JSON.stringify(base[key]))return [];return [[key,record(v)&&record(base[key])?sparse(v,base[key]):v]];}));
  return JSON.stringify({format:source.format,version:2,catalogVersion:1,id:source.id,name:source.name,objects:source.objects.map(o=>({id:o.id,type:o.type,...sparse(o as unknown as Record<string,unknown>,createObject(o.type,o.id) as unknown as Record<string,unknown>)})),...(source.logic?{logic:source.logic}:{}),...(source.story?{story:source.story}:{}),...(source.stages?{stages:source.stages}:{}),...(source.groups.length?{groups:source.groups}:{}),...(source.opticalLinks.length?{opticalLinks:source.opticalLinks}:{}),render:analyzeStaticPaths(source)})+'\n';
}
function parseCompactMap(input:Record<string,unknown>):ValleyMap {
  if(input.catalogVersion!==1||!Array.isArray(input.objects)||input.objects.length>500)throw new Error('精简地图目录版本或对象数量无效。');
  const objects=input.objects.map(value=>{if(!record(value)||!identifier(value.id)||!CATALOG.some(c=>c.type===value.type))throw new Error('精简地图包含无效物体。');const base=createObject(value.type as TypeId,value.id);const o={...base,...value};for(const key of ['colors','motion','trigger','water'] as const){if(value[key]!==undefined&&!record(value[key]))throw new Error('精简地图参数无效。');o[key]={...base[key],...(value[key] as Record<string,unknown>|undefined)} as never;}if(base.portal){if(value.portal!==undefined&&!record(value.portal))throw new Error('传送门参数无效。');o.portal={...base.portal,...(value.portal as Partial<PortalSettings>|undefined)};}return o;});
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
/** Portal anchors use road surface centers; their rendered frame shares this exact transform. */
export function portalAnchor(map:ValleyMap,gate:MapObject):{objectId:string;index:number}|null {
  const host=map.objects.find(o=>o.id===gate.portal?.pathId),face=host&&walkSurfaces(host).find(f=>f.face===gate.portal!.face);
  return host&&face?{objectId:host.id,index:face.center}:null;
}
export function portalDestination(map:ValleyMap,gate:MapObject):MapObject|null {
  const target=map.objects.find(o=>o.id===gate.portal?.targetId&&o.type===20&&o.id!==gate.id);
  return target&&portalAnchor(map,target)?target:null;
}
/** Attach without introducing an extra walkable cube or retaining a stale world-space offset. */
export function bindPortal(map:ValleyMap,id:string,pathId:string,face=0):void {
  const gate=map.objects.find(o=>o.id===id),host=map.objects.find(o=>o.id===pathId);
  if(gate?.type!==20||!host||!canMarkPath(host)||!walkSurfaces(host).some(f=>f.face===face))throw new Error('请把传送门放在已有路径的表面上。');
  gate.portal={...gate.portal!,pathId,face};gate.position=[0,0,0];gate.groupId=null;delete gate.basis;
}
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
  for(const gate of map.objects)if(gate.portal?.pathId===cube.id&&!walkSurfaces(cube).some(f=>f.face===gate.portal!.face))gate.portal.pathId=newId;
  delete other.checkpoint;if(cube.checkpoint&&!walkSurfaces(cube).some(f=>f.face===cube.checkpoint!.face)){other.checkpoint=cube.checkpoint;delete cube.checkpoint;}
  delete other.marker;if(cube.marker&&!walkSurfaces(cube).some(f=>f.face===cube.marker!.face)){other.marker=cube.marker;delete cube.marker;}
  map.objects.push(other);map.opticalLinks.push({a:id,aEnd:4,b:newId,bEnd:4});
}
export interface GroupPose {translation:Vec3;rotation:Vec3}
export interface MapPoses {story?:StoryState;platforms?:Record<string,PlatformState>;stageId?:string;visitedStages?:string[];groups:Record<string,GroupPose>;mechanisms:Record<string,number>;states?:Record<string,Partial<ObjectState>>}
export const emptyPoses=():MapPoses=>({groups:{},mechanisms:{}});
export function objectState(map:ValleyMap,o:MapObject,poses:MapPoses):ObjectState {
  const state={enabled:true,visible:true,walkable:true,...o.state,...poses.states?.[o.id]},hostId=o.attachment?.pathId??o.portal?.pathId;
  if(!stageAllows(map,o,poses))state.visible=false;
  if(hostId){const host=map.objects.find(x=>x.id===hostId);if(host&&!objectState(map,host,poses).visible)state.visible=false;}return state;
}
export const activePath=(map:ValleyMap,o:MapObject,poses:MapPoses):boolean=>{const s=objectState(map,o,poses);return isWalkable(o)&&s.visible&&s.walkable;};
export const activePortal=(map:ValleyMap,o:MapObject,poses:MapPoses):boolean=>{const s=objectState(map,o,poses),host=map.objects.find(h=>h.id===o.portal?.pathId);return o.type===20&&s.enabled&&s.visible&&!!host&&activePath(map,host,poses)&&!movingPlatform(map,host.id,poses);};
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
  if(o.portal?.pathId){
    const parent=map.objects.find(p=>p.id===o.portal!.pathId)!,face=walkSurfaces(parent).find(f=>f.face===o.portal!.face)!,center=localSamples(parent)[face.center]!.point;
    const y=face.up,x=unit(Math.abs(y[0])<.9?cross(y,[0,0,1]):cross(y,[0,1,0])),z=cross(x,y);
    const orient=(p:Vec3)=>add(add(mul(x,p[0]),mul(y,p[1])),mul(z,p[2]));
    return worldSample(map,parent,{point:add(center,orient(rotate(s.point,o.rotation))),up:orient(rotate(s.up,o.rotation)),roll:s.roll},poses);
  }
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
  if(o.attachment||o.portal?.pathId)return localSamples(o).map(s=>worldSample(map,o,s,poses));
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
  const all=map.objects.filter(o=>activePath(map,o,poses)).map(o=>({o,s:worldSamples(map,o,poses),ports:pathPorts(o)})),result:MapConnection[]=[],seen=new Set<string>();
  type Entry={o:MapObject;p:SurfacePort;s:Sample};
  const entries:Entry[]=all.flatMap(a=>a.ports.map(p=>({o:a.o,p,s:a.s[p.index]!}))),cells=new Map<string,Entry[]>(),cell=.065;
  const coords=(p:Vec3)=>p.map(v=>Math.floor(v/cell));
  for(const e of entries){const key=coords(e.s.point).join(':');if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(e);}
  const nearby=(p:Vec3)=>{const [x,y,z]=coords(p) as Vec3,out:Entry[]=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++)for(const e of cells.get([x+a,y+b,z+c].join(':'))??[])if(length(sub(e.s.point,p))<cell)out.push(e);return out;};
  const aligned=(a:Sample,b:Sample)=>a.up.reduce((n,v,i)=>n+v*b.up[i]!,0)>.995;
  function connect(a:Entry,b:Entry):void {
    if(a.o.id===b.o.id||!aligned(a.s,b.s)||!platformConnection(map,a.o.id,b.o.id,poses))return;
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

export interface Waypoint extends Sample {objectId:string;index:number;portalId?:string}
function navigationGraph(map:ValleyMap,poses:MapPoses,project:Projection){
  const samples=new Map(map.objects.filter(o=>activePath(map,o,poses)).map(o=>[o.id,worldSamples(map,o,poses)]));
  const key=(id:string,i:number)=>`${id}:${i}`;
  const nodes=new Map<string,Waypoint>(),edges=new Map<string,string[]>();
  for(const [id,path] of samples) {
    path.forEach((s,i)=>{const k=key(id,i);nodes.set(k,{...s,objectId:id,index:i});edges.set(k,[]);});
    for(const [a,b] of pathEdges(map.objects.find(o=>o.id===id)!)){edges.get(key(id,a))!.push(key(id,b));edges.get(key(id,b))!.push(key(id,a));}
  }
  for(const c of connections(map,poses,project)) {const a=key(c.a,c.aIndex),b=key(c.b,c.bIndex);edges.get(a)!.push(b);edges.get(b)!.push(a);}
  const portalEdges=new Map<string,string>();
  for(const gate of map.objects.filter(o=>o.type===20)){
    const a=portalAnchor(map,gate),destination=portalDestination(map,gate),b=destination&&portalAnchor(map,destination);
    if(!a||!b||!activePortal(map,gate,poses)||!activePortal(map,destination!,poses))continue;const from=key(a.objectId,a.index),to=key(b.objectId,b.index);
    if(from!==to&&!edges.get(from)!.includes(to)){edges.get(from)!.push(to);portalEdges.set(`${from}>${to}`,gate.id);}
  }
  return {nodes,edges,portalEdges};
}
export function findRoute(map:ValleyMap,poses:MapPoses,from:{objectId:string;index:number},targetId:string,targetIndex?:number,project:Projection=defaultProjection):Waypoint[]|null {
  const {nodes,edges,portalEdges}=navigationGraph(map,poses,project),key=(id:string,i:number)=>`${id}:${i}`,start=key(from.objectId,from.index);
  const targetObject=map.objects.find(o=>o.id===targetId);if(!targetObject||!activePath(map,targetObject,poses))return null;
  const targetIndices=targetIndex!==undefined?[targetIndex]:pathMarker(targetObject)?[markerIndex(targetObject)]:targetObject.type===8?[centerIndex(targetObject)]:walkSurfaces(targetObject).map(f=>f.center);
  if(!targetIndices.length)targetIndices.push(centerIndex(targetObject));const ends=new Set(targetIndices.map(i=>key(targetId,i)));
  if(!nodes.has(start)||![...ends].some(e=>nodes.has(e)))return null;
  const parents=new Map<string,string|null>([[start,null]]),queue=[start];
  let end:string|undefined;
  for(let i=0;i<queue.length;i++){const current=queue[i]!;if(ends.has(current)){end=current;break;}for(const n of edges.get(current)!)if(!parents.has(n)){parents.set(n,current);queue.push(n);}}
  if(end===undefined)return null;
  const path:Waypoint[]=[];let current:string|null=end;
  while(current!==null&&current!==start) {const previous:string|null=parents.get(current)!,portalId=portalEdges.get(`${previous}>${current}`);path.unshift({...nodes.get(current)!,...(portalId?{portalId}:{})});current=previous;}
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
interface Animation {token:number;groupId:string;from:GroupPose|null;to:GroupPose;elapsed:number;duration:number;easing:'linear'|'smooth'}
interface TaskProgress {started:boolean;done:boolean;until?:number;token?:number;children?:TaskProgress[];cursor?:number}
interface LogicMemory {time:number;variables:Record<string,LogicValue>;counts:Record<string,number>;enabled:Record<string,boolean>;jobs:Array<{ruleId:string;progress:TaskProgress}>}
export interface CheckpointData {
  format:'haiyue-valley-checkpoint';version:1;mapKey:string;name:string;at:{objectId:string;index:number};direction:Vec3;
  poses:MapPoses;switches:Record<string,boolean>;fired:string[];logic:LogicMemory;animations:Animation[];
  deferred:Array<{id:string;property:StateProperty;value:boolean}>;nextMotion:number;
}
type Recovery={kind:'restore';issuer:string|null}|{kind:'reset';groupId:string;returnPlayer:boolean;issuer:string|null};
const replaceRecord=<T>(target:Record<string,T>,source:Record<string,T>):void=>{for(const id of Object.keys(target))delete target[id];Object.assign(target,structuredClone(source));};
const progressOf=(task:LogicTask):TaskProgress=>({started:!!task.started,done:!!task.done,...(task.until!==undefined?{until:task.until}:{}),...(task.token!==undefined?{token:task.token}:{}),...(task.cursor!==undefined?{cursor:task.cursor}:{}),...(task.children?{children:task.children.map(progressOf)}:{})});
const taskFrom=(action:LogicAction,p:TaskProgress):LogicTask=>({...p,action,...(p.children&&('actions' in action)?{children:p.children.map((child,i)=>taskFrom(action.actions[i]!,child))}:{})} as LogicTask);
/** Tied to exact authored content, not only a reusable map ID. */
export function checkpointMapKey(map:ValleyMap):string {
  let a=2166136261,b=0x9e3779b9;for(const c of serializeMap(map)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),2246822519);}return `${map.id}:${(a>>>0).toString(16)}${(b>>>0).toString(16)}`;
}
/** Browser storage is untrusted. Reconstruct task continuations from authored actions only. */
export function parseCheckpoint(input:unknown,map:ValleyMap,mapKey=checkpointMapKey(map)):CheckpointData {
  const fail=():never=>{throw new Error('检查点损坏或不属于当前地图。');},integer=(n:unknown,max=1e12):n is number=>finite(n,0,max)&&Number.isSafeInteger(n);
  if(!record(input)||input.format!=='haiyue-valley-checkpoint'||input.version!==1||input.mapKey!==mapKey||!label(input.name)||!record(input.at)||!integer(input.at.index)||!vector(input.direction)||length(input.direction)<.01)return fail();
  const object=(id:unknown)=>map.objects.find(o=>o.id===id),group=(id:unknown)=>map.groups.some(g=>g.id===id),host=object(input.at.objectId);
  if(!host||!isWalkable(host)||!localSamples(host)[input.at.index])return fail();
  const pose=(v:unknown):GroupPose=>{if(!record(v)||!vector(v.translation)||!vector(v.rotation))return fail();return {translation:[...v.translation],rotation:[...v.rotation]};};
  const poses:MapPoses=emptyPoses();poses.states={};const p=input.poses;
  if(!record(p)||!record(p.groups)||!record(p.mechanisms)||!record(p.states))return fail();
  for(const [id,v] of Object.entries(p.groups)){if(!group(id))return fail();poses.groups[id]=pose(v);}
  for(const [id,v] of Object.entries(p.mechanisms)){const o=object(id);if(!o||![3,4].includes(o.type)||!finite(v,-1e12,1e12)||(o.type===4&&(v<o.motion.min||v>o.motion.max)))return fail();poses.mechanisms[id]=v;}
  for(const [id,v] of Object.entries(p.states)){if(!object(id)||!record(v)||Object.entries(v).some(([k,b])=>!['enabled','visible','walkable'].includes(k)||typeof b!=='boolean'))return fail();poses.states[id]={...v};}
  if(!record(input.switches)||!Array.isArray(input.fired)||new Set(input.fired).size!==input.fired.length)return fail();
  const switches:Record<string,boolean>={};for(const [id,v] of Object.entries(input.switches)){if(object(id)?.type!==8||typeof v!=='boolean')return fail();switches[id]=v;}
  if(input.fired.some(id=>object(id)?.type!==8)||!integer(input.nextMotion)||input.nextMotion<1||!Array.isArray(input.animations)||input.animations.length>4096)return fail();
  const tokens=new Set<number>(),animations:Animation[]=input.animations.map(a=>{
    if(!record(a)||!integer(a.token,input.nextMotion as number)||a.token<1||a.token===input.nextMotion||tokens.has(a.token)||!group(a.groupId)||!finite(a.duration,.1,60)||!finite(a.elapsed,0,a.duration)||!['linear','smooth'].includes(a.easing as string))return fail();tokens.add(a.token);
    if(a.from===null&&a.elapsed!==0)return fail();return {token:a.token,groupId:a.groupId as string,from:a.from===null?null:pose(a.from),to:pose(a.to),elapsed:a.elapsed,duration:a.duration,easing:a.easing as 'linear'|'smooth'};
  });
  parseJourneyMemory(p,map,poses,input.nextMotion as number,fail);if(!activePath(map,host,poses))return fail();
  const memory=parseStoryMemory(p.story,map,input.nextMotion as number,fail);if(memory)poses.story=memory;
  const l=input.logic,vars=map.logic?.variables??[],rules=map.logic?.rules??[];
  if(!record(l)||!finite(l.time,0,1e12)||!record(l.variables)||!record(l.counts)||!record(l.enabled)||!Array.isArray(l.jobs)||l.jobs.length>rules.length)return fail();
  const variables:Record<string,LogicValue>={},counts:Record<string,number>={},enabled:Record<string,boolean>={};
  if(Object.keys(l.variables).length!==vars.length||Object.keys(l.counts).length!==rules.length||Object.keys(l.enabled).length!==rules.length)return fail();
  for(const v of vars){const value=l.variables[v.id];if(typeof value!==typeof v.initial||!(typeof value==='boolean'||finite(value,-1e9,1e9)))return fail();variables[v.id]=value;}
  for(const r of rules){const count=l.counts[r.id],on=l.enabled[r.id];if(!integer(count,1e9)||typeof on!=='boolean')return fail();counts[r.id]=count;enabled[r.id]=on;}
  let nodes=0;const progress=(raw:unknown,action:LogicAction,depth=0):TaskProgress=>{
    if(!record(raw)||++nodes>4096||depth>8||typeof raw.started!=='boolean'||typeof raw.done!=='boolean'||Object.keys(raw).some(k=>!['started','done','until','token','cursor','children'].includes(k)))return fail();
    const out:TaskProgress={started:raw.started,done:raw.done};
    if(!raw.started){if(raw.done||Object.keys(raw).length!==2)return fail();return out;}
    if(action.kind==='wait'){if(!finite(raw.until,0,1e12))return fail();out.until=raw.until;}
    else if(action.kind==='move'||action.kind==='platform'||action.kind==='stage'||action.kind==='dialogue'){if(!integer(raw.token,input.nextMotion as number)||raw.token<1||raw.token===input.nextMotion)return fail();out.token=raw.token;}
    else if(action.kind==='sequence'||action.kind==='parallel'){
      if(!Array.isArray(raw.children)||raw.children.length!==action.actions.length||!integer(raw.cursor,action.actions.length))return fail();
      out.children=raw.children.map((p,i)=>progress(p,action.actions[i]!,depth+1));out.cursor=raw.cursor;
      if(raw.done&&!out.children.every(c=>c.done)||action.kind==='sequence'&&out.children.slice(0,out.cursor).some(c=>!c.done))return fail();
    }else if(!raw.done)return fail();
    if(Object.keys(raw).some(k=>!(k in out)))return fail();return out;
  };
  const jobIds=new Set<string>(),jobs=l.jobs.map(j=>{if(!record(j)||jobIds.has(j.ruleId as string))return fail();const r=rules.find(r=>r.id===j.ruleId);if(!r||!counts[r.id])return fail();jobIds.add(r.id);return {ruleId:r.id,progress:progress(j.progress,{kind:'sequence',actions:r.actions})};});
  if(!Array.isArray(input.deferred)||input.deferred.length>map.objects.length*2)return fail();
  const deferred=input.deferred.map(d=>{if(!record(d)||!object(d.id)||!isWalkable(object(d.id)!)||!['visible','walkable'].includes(d.property as string)||d.value!==false)return fail();return {id:d.id as string,property:d.property as StateProperty,value:false};});
  return {format:'haiyue-valley-checkpoint',version:1,mapKey,name:input.name,at:{objectId:host.id,index:input.at.index},direction:unit(input.direction),poses,switches,fired:[...input.fired] as string[],logic:{time:l.time,variables,counts,enabled,jobs},animations,deferred,nextMotion:input.nextMotion};
}
interface LogicHost {
  switches:Record<string,boolean>;poses:MapPoses;message:string;
  setState(targetId:string,property:StateProperty,value:boolean):void;
  queueMotion(action:Action):number;motionPending(token:number):boolean;
  platformCommand(groupId:string,command:'go'|'pause'|'resume',stationId:string|null):number;queueStage(stageId:string):number;
  queueDialogue(id:string):number;setObjective(id:string,status:ObjectiveStatus):void;
  requestCheckpoint(name:string):void;requestRecovery(recovery:Recovery):void;readonly recoveryPending:boolean;
}
interface LogicTask {action:LogicAction;started?:boolean;until?:number;token?:number;children?:LogicTask[];cursor?:number;done?:boolean}
const compare=(a:LogicValue,b:LogicValue,op:Compare):boolean=>op==='eq'?a===b:op==='ne'?a!==b:op==='gt'?a>b:op==='gte'?a>=b:op==='lt'?a<b:a<=b;
/** Deterministic, restartable scheduler. No scripts, wall-clock timers, or authoring-map mutations. */
export class LogicRunner {
  readonly variables:Record<string,LogicValue>={};readonly counts:Record<string,number>={};
  readonly enabled:Record<string,boolean>={};readonly recent:Array<{event:LogicEvent;rule:string;passed:boolean;trace:ConditionTrace;time:number}>=[];readonly events:Array<{event:LogicEvent;time:number}>=[];
  private queue:LogicEvent[]=[];private jobs=new Map<string,LogicTask>();private time=0;private operations=0;private flushing=false;
  error:string|null=null;
  private map:ValleyMap;private host:LogicHost;
  constructor(map:ValleyMap,host:LogicHost){this.map=map;this.host=host;for(const v of map.logic?.variables??[])this.variables[v.id]=v.initial;for(const r of map.logic?.rules??[])this.enabled[r.id]=r.enabled;}
  snapshot():unknown{return {variables:{...this.variables},counts:{...this.counts},enabled:{...this.enabled},active:[...this.jobs.keys()],recent:this.recent.slice(-20),error:this.error};}
  memory():LogicMemory{return {time:this.time,variables:{...this.variables},counts:Object.fromEntries((this.map.logic?.rules??[]).map(r=>[r.id,this.counts[r.id]??0])),enabled:{...this.enabled},jobs:[...this.jobs].map(([ruleId,task])=>({ruleId,progress:progressOf(task)}))};}
  restore(memory:LogicMemory):void {
    replaceRecord(this.variables,memory.variables);replaceRecord(this.counts,memory.counts);replaceRecord(this.enabled,memory.enabled);this.time=memory.time;this.error=null;this.queue=[];this.recent.length=0;this.events.length=0;this.jobs.clear();
    for(const j of memory.jobs){const rule=this.map.logic!.rules.find(r=>r.id===j.ruleId)!;this.jobs.set(j.ruleId,taskFrom({kind:'sequence',actions:rule.actions},structuredClone(j.progress)));}
  }
  resetScope(nodes:Set<string>,variables:Set<string>,rules:Set<string>,issuer:string|null):Set<number> {
    const tokens=new Set<number>(),touches=(t:LogicTask):boolean=>{
      if(t.done)return false;if(t.children)return t.children.some(touches);const a=t.action;
      return a.kind==='move'||a.kind==='reset'||a.kind==='platform'?nodes.has(a.groupId):a.kind==='state'?nodes.has(a.targetId):a.kind==='objective'?nodes.has(a.objectiveId):a.kind==='dialogue'?nodes.has(a.dialogueId):a.kind==='variable'?variables.has(a.id):a.kind==='rule'?rules.has(a.ruleId):'actions' in a?a.actions.some(action=>touches({action})):false;
    },collect=(t:LogicTask):void=>{if(t.token!==undefined&&!t.done)tokens.add(t.token);for(const child of t.children??[])collect(child);};
    for(const [id,task] of this.jobs)if(id===issuer||rules.has(id)||touches(task)){collect(task);this.jobs.delete(id);}
    for(const v of this.map.logic?.variables??[])if(variables.has(v.id))this.variables[v.id]=v.initial;
    for(const r of this.map.logic?.rules??[])if(rules.has(r.id)){delete this.counts[r.id];this.enabled[r.id]=r.enabled;}
    this.queue=this.queue.filter(e=>e.source===null||e.type==='signal'||!nodes.has(e.source)&&!variables.has(e.source));this.error=null;return tokens;
  }
  emit(event:LogicEvent):void{if(!this.error)this.queue.push({...event});}
  cancelMotion(token:number):void {
    const owns=(t:LogicTask):boolean=>t.token===token||!!t.children?.some(owns);
    for(const [id,task] of this.jobs)if(owns(task))this.jobs.delete(id);
  }
  condition(c:LogicCondition):boolean {
    if(c.kind==='all'||c.kind==='any')return c.kind==='all'?c.conditions.every(x=>this.condition(x)):c.conditions.some(x=>this.condition(x));
    if(c.kind==='not')return !this.condition(c.condition);
    if(c.kind==='objective')return this.host.poses.story?.objectives[c.objectiveId]===c.status;
    if(c.kind==='dialogue')return !!this.host.poses.story?.seen.includes(c.dialogueId)===c.seen;
    if(c.kind==='stage')return c.status==='active'?this.host.poses.stageId===c.stageId:!!this.host.poses.visitedStages?.includes(c.stageId);
    if(c.kind==='platform'){const p=this.host.poses.platforms?.[c.groupId];return !!p&&(c.stationId===null?p.targetId!==null:p.stationId===c.stationId&&p.targetId===null);}
    if(c.kind==='variable')return compare(this.variables[c.id]!,c.value,c.op);
    if(c.kind==='switch')return !!this.host.switches[c.objectId]===c.value;
    if(c.kind==='mechanism')return compare(this.host.poses.mechanisms[c.objectId]??0,c.value,c.op);
    const o=this.map.objects.find(o=>o.id===c.objectId)!;return objectState(this.map,o,this.host.poses)[c.property]===c.value;
  }
  private spend():void{if(++this.operations>2048)throw new Error('规则循环触发过多，已停止关卡逻辑。');}
  explain(c:LogicCondition):ConditionTrace {
    const children=c.kind==='all'||c.kind==='any'?c.conditions.map(x=>this.explain(x)):c.kind==='not'?[this.explain(c.condition)]:[];
    const name=(id:string)=>[...this.map.objects,...this.map.groups,...this.map.logic?.variables??[],...this.map.stages?.items??[],...this.map.story?.objectives??[],...this.map.story?.dialogues??[]].find(x=>x.id===id)?.name??id;
    let text:string;
    if(c.kind==='all'||c.kind==='any'||c.kind==='not')text=c.kind==='all'?'全部条件':c.kind==='any'?'任一条件':'取反';
    else if(c.kind==='variable')text=`${name(c.id)}：当前 ${this.variables[c.id]}，要求 ${c.op} ${c.value}`;
    else if(c.kind==='objective')text=`${name(c.objectiveId)}：当前 ${this.host.poses.story?.objectives[c.objectiveId]}，要求 ${c.status}`;
    else if(c.kind==='dialogue')text=`${name(c.dialogueId)}：已读 ${!!this.host.poses.story?.seen.includes(c.dialogueId)}，要求 ${c.seen}`;
    else if(c.kind==='switch')text=`${name(c.objectId)}：当前 ${!!this.host.switches[c.objectId]}，要求 ${c.value}`;
    else if(c.kind==='state')text=`${name(c.objectId)} · ${c.property}：当前 ${objectState(this.map,this.map.objects.find(o=>o.id===c.objectId)!,this.host.poses)[c.property]}，要求 ${c.value}`;
    else if(c.kind==='mechanism')text=`${name(c.objectId)}：当前 ${this.host.poses.mechanisms[c.objectId]??0}，要求 ${c.op} ${c.value}`;
    else if(c.kind==='platform'){const p=this.host.poses.platforms?.[c.groupId];text=`${name(c.groupId)}：${p?.targetId?'移动至 '+p.targetId:'停靠 '+p?.stationId}，要求 ${c.stationId??'移动中'}`;}
    else text=`阶段 ${name(c.stageId)} · ${c.status}：当前 ${this.host.poses.stageId??'无'}`;
    return {label:text,passed:this.condition(c),children};
  }
  debugVariable(id:string,value:LogicValue):void {
    const v=this.map.logic?.variables.find(v=>v.id===id);if(!v||typeof value!==typeof v.initial||typeof value==='number'&&!finite(value,-1e9,1e9))throw new Error('变量值的类型或范围不匹配。');
    if(this.variables[id]!==value){this.variables[id]=value;this.emit({type:'variable',source:id});}
  }
  debugSignal(name:string):void {if(!identifier(name))throw new Error('信号名称必须是有效 ID。');this.emit({type:'signal',source:name});}
  debugSnapshot(){
    const describe=(t:LogicTask):unknown=>({kind:t.action.kind,done:!!t.done,started:!!t.started,...(t.until===undefined?{}:{remaining:Math.max(0,t.until-this.time)}),...(t.token===undefined?{}:{waiting:this.host.motionPending(t.token)}),...(t.children?{children:t.children.map(describe)}:{})});
    return {time:this.time,events:this.events.slice(),pendingEvents:this.queue.length,rules:(this.map.logic?.rules??[]).map(r=>({id:r.id,name:r.name,status:this.jobs.has(r.id)?'正在执行':!this.enabled[r.id]?'已停用':r.once&&this.counts[r.id]?'单次规则已消耗':'等待事件',count:this.counts[r.id]??0,condition:this.explain(r.condition),task:this.jobs.has(r.id)?describe(this.jobs.get(r.id)!):null,last:this.recent.findLast(e=>e.rule===r.id)??null}))};
  }
  private advance(task:LogicTask,ruleId:string):boolean {
    if(this.host.recoveryPending)return false;
    if(task.done)return true;const a=task.action;
    if(!task.started){this.spend();task.started=true;
      if(a.kind==='wait')task.until=this.time+a.duration;
      else if(a.kind==='move')task.token=this.host.queueMotion(a);
      else if(a.kind==='platform')task.token=this.host.platformCommand(a.groupId,a.command,a.stationId);
      else if(a.kind==='dialogue')task.token=this.host.queueDialogue(a.dialogueId);
      else if(a.kind==='objective')this.host.setObjective(a.objectiveId,a.status);
      else if(a.kind==='stage')task.token=this.host.queueStage(a.stageId);
      else if(a.kind==='parallel'||a.kind==='sequence'){task.children=a.actions.map(action=>({action}));task.cursor=0;}
      else if(a.kind==='variable'){
        const old=this.variables[a.id]!,next=a.operation==='toggle'?!old:a.operation==='add'?(old as number)+(a.value as number):a.value;
        if(typeof next==='number'&&(!Number.isFinite(next)||Math.abs(next)>1e9))throw new Error('关卡变量超过数值范围，已停止关卡逻辑。');
        if(old!==next){this.variables[a.id]=next;this.emit({type:'variable',source:a.id});}
      }else if(a.kind==='state')this.host.setState(a.targetId,a.property,a.value);
      else if(a.kind==='message')this.host.message=a.text;
      else if(a.kind==='signal')this.emit({type:'signal',source:a.name});
      else if(a.kind==='rule')this.enabled[a.ruleId]=a.enabled;
      else if(a.kind==='checkpoint')this.host.requestCheckpoint(a.name);
      else if(a.kind==='restore')this.host.requestRecovery({kind:'restore',issuer:ruleId});
      else if(a.kind==='reset')this.host.requestRecovery({kind:'reset',groupId:a.groupId,returnPlayer:a.returnPlayer,issuer:ruleId});
    }
    if(a.kind==='wait')task.done=this.time+1e-9>=task.until!;
    else if(a.kind==='move'||a.kind==='platform'||a.kind==='stage'||a.kind==='dialogue')task.done=!this.host.motionPending(task.token!);
    else if(a.kind==='parallel'){const done=task.children!.map(child=>this.advance(child,ruleId));task.done=done.every(Boolean);}
    else if(a.kind==='sequence'){while(task.cursor!<task.children!.length&&this.advance(task.children![task.cursor!]!,ruleId))task.cursor!++;task.done=task.cursor===task.children!.length;}
    else task.done=true;return task.done;
  }
  tick(dt:number):void {this.time+=dt;this.flush();}
  flush():void {
    if(this.flushing||this.error||this.host.recoveryPending)return;this.flushing=true;this.operations=0;
    try{
      let progress=true;
      while(progress&&!this.host.recoveryPending){progress=false;
        const event=this.queue.shift();if(event){this.spend();this.events.push({event:{...event},time:this.time});if(this.events.length>80)this.events.shift();
          // Evaluate every rule before any of this event's actions change shared state.
          const matches=(this.map.logic?.rules??[]).filter(r=>this.enabled[r.id]&&!this.jobs.has(r.id)&&(!r.once||!this.counts[r.id])&&r.event.type===event.type&&(r.event.source===null||r.event.source===event.source)&&(r.event.face===undefined||r.event.face===event.face)&&(r.event.choiceId===undefined||r.event.choiceId===event.choiceId)&&(r.event.stationId===undefined||r.event.stationId===event.stationId));
          for(const r of matches){const passed=this.condition(r.condition);this.recent.push({event:{...event},rule:r.id,passed,trace:this.explain(r.condition),time:this.time});if(passed){this.counts[r.id]=(this.counts[r.id]??0)+1;this.jobs.set(r.id,{action:{kind:'sequence',actions:r.actions}});}}
        }
        this.recent.splice(0,Math.max(0,this.recent.length-20));
        for(const [id,task] of this.jobs)if(this.advance(task,id)){this.jobs.delete(id);progress=true;}
        if(this.queue.length)progress=true;
      }
    }catch(e){this.error=e instanceof Error?e.message:String(e);this.host.message=this.error;this.queue=[];this.jobs.clear();}
    finally{this.flushing=false;}
  }
}
export class MapRuntime {
  readonly map:ValleyMap;
  readonly projection:Projection;
  readonly poses=emptyPoses(); readonly fired=new Set<string>(); readonly switches:Record<string,boolean>={};
  readonly logic:LogicRunner;
  readonly mapKey:string;private origin!:CheckpointData;private checkpoint:CheckpointData|null=null;
  checkpointRevision=0;recoveryVersion=0;
  private checkpointRequest:string|null=null;private checkpointPrepared=false;private savingCheckpoint=false;private recovery:Recovery|null=null;private automaticRecoveries=0;
  private stageQueue:Array<{stageId:string;token:number}>=[];private stageTransition:{token:number;elapsed:number;duration:number}|null=null;stageRevision=0;
  private originStageQueue:Array<{stageId:string;token:number}>=[];
  debugPaused=false;
  private platformMembers=new Map<string,MapObject[]>();
  private nextMotion=1;private deferredStates=new Map<string,{id:string;property:StateProperty;value:boolean}>();
  private occupiedSurface:{id:string;face:number}|null=null;
  private animations:Animation[]=[]; private route:Waypoint[]=[];
  private transfer:{gateId:string;destinationId:string;next:Waypoint;elapsed:number;arrived:boolean}|null=null;
  private pendingTarget:{id:string;index?:number}|null=null;
  get portalState():{from:string;to:string;phase:'entering'|'appearing';scale:number}|null {
    if(!this.transfer)return null;const t=this.transfer.elapsed,phase=t<.4?'entering':'appearing',x=Math.max(0,Math.min(1,phase==='entering'?1-t/.4:(t-.4)/.4));
    return {from:this.transfer.gateId,to:this.transfer.destinationId,phase,scale:x*x*(3-2*x)};
  }
  // Keep both ends of the occupied edge, even after reversing before reaching a waypoint.
  private segment:{a:Waypoint;b:Waypoint}|null=null;
  at:{objectId:string;index:number}; position:Vec3;up:Vec3=[0,1,0]; direction:Vec3=[1,0,0]; completed=false;
  message='点击道路行走；绕动手轮，拖动平移机关。';
  constructor(map:ValleyMap,projection:Projection=project) {
    this.map=map;this.projection=projection;this.poses.states={};this.initializeJourney();
    const issues=playIssues(map); if(issues.length) throw new Error(issues.join('\n'));
    const start=map.objects.find(o=>pathMarker(o)?.kind==='spawn')!, s=worldSamples(map,start,this.poses); this.at={objectId:start.id,index:markerIndex(start)}; this.position=[...s[this.at.index]!.point];this.up=[...s[this.at.index]!.up];this.direction=unit(sub(s[this.at.index]!.point,s[walkSurfaces(start).find(f=>f.center===this.at.index)!.indices[0]!]!.point));
    this.mapKey=checkpointMapKey(map);this.logic=new LogicRunner(map,this);this.origin=this.capture('起点');this.logic.emit({type:'start',source:null});this.logic.flush();this.surfaceEvents();if(this.poses.stageId)this.logic.emit({type:'stage',source:this.poses.stageId});this.logic.flush();
    if(!this.recoveryPending&&!this.logic.error){this.origin=this.capture('起点');this.originStageQueue=structuredClone(this.stageQueue);}if(start.checkpoint&&walkSurfaces(start).find(f=>f.face===start.checkpoint!.face)?.center===this.at.index)this.requestCheckpoint(start.checkpoint.name);this.finishCheckpoint();
  }
  get recoveryPending():boolean{return this.recovery!==null;}
  get checkpointInfo():{name:string;objectId:string;index:number}|null{return this.checkpoint?{name:this.checkpoint.name,...this.checkpoint.at}:null;}
  exportCheckpoint():CheckpointData|null{return this.checkpoint?structuredClone(this.checkpoint):null;}
  loadCheckpoint(input:unknown):boolean {
    try{const saved=parseCheckpoint(input,this.map,this.mapKey);this.checkpoint=saved;this.checkpointRevision++;return this.restoreCheckpoint();}catch{return false;}
  }
  private capture(name:string):CheckpointData{return {format:'haiyue-valley-checkpoint',version:1,mapKey:this.mapKey,name,at:{...this.at},direction:[...this.direction],poses:structuredClone(this.poses),switches:{...this.switches},fired:[...this.fired],logic:this.logic.memory(),animations:structuredClone(this.animations),deferred:structuredClone([...this.deferredStates.values()]),nextMotion:this.nextMotion};}
  requestCheckpoint(name:string):void {if(!this.completed&&!this.savingCheckpoint&&label(name)){this.checkpointRequest=name;this.checkpointPrepared=false;}}
  private finishCheckpoint():void {
    if(this.checkpointRequest===null||this.segment||this.transfer||this.recoveryPending||this.completed||this.logic.error||this.sceneTransition)return;
    const name=this.checkpointRequest;
    if(!this.checkpointPrepared){this.checkpointPrepared=true;this.savingCheckpoint=true;this.logic.emit({type:'checkpoint',source:this.at.objectId});this.logic.flush();this.savingCheckpoint=false;}
    if(this.recoveryPending||this.logic.error){this.checkpointRequest=null;this.checkpointPrepared=false;return;}
    // A checkpoint event can itself request a stage change. Capture after that
    // transition without replaying the save event or losing its pending action.
    if(this.sceneTransition)return;
    this.checkpointRequest=null;this.checkpointPrepared=false;
    this.checkpoint=this.capture(name);this.checkpointRevision++;this.message=`检查点已保存：${name}。`;
  }
  requestRecovery(recovery:Recovery):void {if(!this.recovery)this.recovery=recovery;}
  restoreCheckpoint():boolean {this.automaticRecoveries=0;this.recovery={kind:'restore',issuer:null};return this.applyRecovery();}
  resetGroup(groupId:string,returnPlayer=false):boolean {
    if(!this.map.groups.some(g=>g.id===groupId))return false;this.automaticRecoveries=0;this.recovery={kind:'reset',groupId,returnPlayer,issuer:null};return this.segment||this.transfer?true:this.applyRecovery();
  }
  private stand(at:{objectId:string;index:number}):void {
    this.at={...at};const o=this.map.objects.find(o=>o.id===at.objectId)!,s=worldSamples(this.map,o,this.poses)[at.index]!;this.position=[...s.point];this.up=[...s.up];
    this.occupiedSurface={id:o.id,face:walkSurfaces(o).find(f=>f.center===at.index||f.indices.includes(at.index))?.face??0};
  }
  private applyRecovery():boolean {
    const request=this.recovery;if(!request)return false;if(request.kind==='reset'&&(this.segment||this.transfer))return false;
    this.recovery=null;this.checkpointRequest=null;this.checkpointPrepared=false;
    if(request.issuer&&++this.automaticRecoveries>8){this.logic.error='连续重置过多，请检查恢复事件规则。';this.message=this.logic.error;return false;}
    if(request.kind==='restore'){
      const saved=this.checkpoint??this.origin;
      replaceRecord(this.poses.groups,saved.poses.groups);replaceRecord(this.poses.mechanisms,saved.poses.mechanisms);this.poses.states=structuredClone(saved.poses.states??{});
      replaceRecord(this.switches,saved.switches);this.fired.clear();for(const id of saved.fired)this.fired.add(id);this.logic.restore(saved.logic);
      this.animations=structuredClone(saved.animations);this.nextMotion=saved.nextMotion;this.deferredStates=new Map(saved.deferred.map(d=>[`${d.id}:${d.property}`,structuredClone(d)]));this.direction=[...saved.direction];
      if(saved.poses.story)this.poses.story=structuredClone(saved.poses.story);else delete this.poses.story;this.poses.platforms=structuredClone(saved.poses.platforms??{});if(saved.poses.stageId)this.poses.stageId=saved.poses.stageId;else delete this.poses.stageId;if(saved.poses.visitedStages)this.poses.visitedStages=[...saved.poses.visitedStages];else delete this.poses.visitedStages;this.stageQueue=this.checkpoint?[]:structuredClone(this.originStageQueue);this.stageTransition=null;this.stageRevision++;
      this.route=[];this.segment=null;this.transfer=null;this.pendingTarget=null;this.completed=false;this.stand(saved.at);this.recoveryVersion++;
      this.message=`已返回${saved.name}。`;this.logic.emit({type:'restore',source:saved.at.objectId});return true;
    }
    const groups=new Set(this.map.groups.filter(g=>belongsToGroup(this.map,g.id,request.groupId)).map(g=>g.id));if(!groups.size)return false;
    const objects=new Set(this.map.objects.filter(o=>{const host=this.map.objects.find(h=>h.id===(o.attachment?.pathId??o.portal?.pathId))??o;return !!host.groupId&&groups.has(host.groupId)||!!o.motion.targetGroup&&groups.has(o.motion.targetGroup)||o.trigger.actions.some(a=>groups.has(a.groupId));}).map(o=>o.id));
    const storyNodes=[...this.map.story?.objectives??[],...this.map.story?.dialogues??[]].filter(s=>s.resetGroup&&groups.has(s.resetGroup)).map(s=>s.id);
    const nodes=new Set([...groups,...objects,...storyNodes]),variables=new Set((this.map.logic?.variables??[]).filter(v=>v.resetGroup&&groups.has(v.resetGroup)).map(v=>v.id)),rules=new Set((this.map.logic?.rules??[]).filter(r=>r.resetGroup&&groups.has(r.resetGroup)).map(r=>r.id));
    const poses=structuredClone(this.poses);for(const id of groups){delete poses.groups[id];const g=this.map.groups.find(g=>g.id===id)!;if(g.platform){poses.platforms??={};poses.platforms[id]=initialPlatform(g.platform);poses.groups[id]=stationPose(g.platform,g.platform.initialStation);}}for(const id of objects){delete poses.mechanisms[id];delete poses.states?.[id];}
    const valid=(at:{objectId:string;index:number})=>{const o=this.map.objects.find(o=>o.id===at.objectId);return !!o&&!!localSamples(o)[at.index]&&activePath(this.map,o,poses);};
    const anchor=this.checkpoint?.at??this.origin.at,candidates=request.returnPlayer?[anchor,this.origin.at]:[this.at,anchor,this.origin.at],landing=candidates.find(valid);
    if(!landing){this.logic.resetScope(new Set(),new Set(),new Set(),request.issuer);this.message='重置后没有安全落点，请设置可行走的检查点。';return false;}
    const cancelled=this.logic.resetScope(nodes,variables,rules,request.issuer);
    if(poses.story){const state=poses.story;state.queue=state.queue.filter(q=>!cancelled.has(q.token)&&!nodes.has(q.dialogueId));state.seen=state.seen.filter(id=>!nodes.has(id));for(const id of storyNodes)delete state.choices[id];for(const o of this.map.story!.objectives)if(nodes.has(o.id))state.objectives[o.id]=o.initial;}
    if(poses.story)this.poses.story=poses.story;
    this.animations=this.animations.filter(a=>!groups.has(a.groupId)&&!cancelled.has(a.token));this.stageQueue=this.stageQueue.filter(s=>!cancelled.has(s.token));
    for(const state of Object.values(poses.platforms??{})){state.queue=state.queue.filter(q=>!cancelled.has(q.token));if(state.token!==null&&cancelled.has(state.token)){state.paused=true;state.token=null;}}
    this.poses.platforms=poses.platforms??{};
    replaceRecord(this.poses.groups,poses.groups);replaceRecord(this.poses.mechanisms,poses.mechanisms);this.poses.states=poses.states??{};
    for(const id of objects){delete this.switches[id];this.fired.delete(id);}for(const [key,d] of this.deferredStates)if(objects.has(d.id))this.deferredStates.delete(key);
    this.route=[];this.segment=null;this.pendingTarget=null;this.completed=false;this.stand(landing);this.recoveryVersion++;
    this.message='所选区域已重置，其他区域的进度已保留。';this.logic.emit({type:'reset',source:request.groupId});return true;
  }
  private initializeJourney():void {
    if(this.map.story)this.poses.story=initialStory(this.map.story);
    this.poses.platforms={};for(const g of this.map.groups)if(g.platform){this.poses.platforms[g.id]=initialPlatform(g.platform);this.poses.groups[g.id]=stationPose(g.platform,g.platform.initialStation);}
    for(const o of this.map.objects){const id=platformGroup(this.map,o.id);if(id){const members=this.platformMembers.get(id)??[];members.push(o);this.platformMembers.set(id,members);}}
    if(this.map.stages){this.poses.stageId=this.map.stages.initial;this.poses.visitedStages=[this.map.stages.initial];}
  }
  get sceneTransition():boolean{return !!this.stageTransition||this.stageQueue.length>0;}
  get currentStage():MapStage|null{return this.map.stages?.items.find(s=>s.id===this.poses.stageId)??null;}
  get stageCameraProgress():number{return this.stageTransition?Math.min(1,this.stageTransition.elapsed/Math.max(.001,this.stageTransition.duration)):1;}
  get cameraLocked():boolean{return this.debugPaused||this.dialogueActive||this.sceneTransition||!!this.currentStage?.camera?.lock;}
  platformCommand(groupId:string,command:'go'|'pause'|'resume',stationId:string|null):number {
    const token=this.nextMotion++,p=this.poses.platforms?.[groupId],g=this.map.groups.find(g=>g.id===groupId);if(!p||!g?.platform)return token;
    if(command==='pause'){p.paused=true;p.running=false;return token;}
    if(command==='resume'){p.paused=false;p.running=true;return token;}
    if(g.platform.stations.some(s=>s.id===stationId)&&p.queue.length<64){p.queue.push({stationId:stationId!,token});p.paused=false;}
    else this.message='平台站点不存在或请求过多。';return token;
  }
  queueStage(stageId:string):number {const token=this.nextMotion++;if(this.map.stages?.items.some(s=>s.id===stageId)&&this.stageQueue.length<32)this.stageQueue.push({stageId,token});return token;}
  get dialogueActive():boolean{return !!this.poses.story?.queue[0]?.active;}
  dialogueSnapshot(){
    const q=this.poses.story?.queue[0],d=q?.active?this.map.story?.dialogues.find(d=>d.id===q.dialogueId):null;
    return d&&q?{id:d.id,name:d.name,speaker:d.speaker,text:d.lines[q.line]!,line:q.line,total:d.lines.length,choices:q.line===d.lines.length-1?d.choices.map(c=>({id:c.id,text:c.text,enabled:this.logic.condition(c.condition)})):[]}:null;
  }
  queueDialogue(id:string):number {
    if(!this.map.story?.dialogues.some(d=>d.id===id)||!this.poses.story)throw new Error('对话不存在。');
    if(this.poses.story.queue.length>=32)throw new Error('等待播放的对话过多，请检查剧情规则。');
    const token=this.nextMotion++;this.poses.story.queue.push({dialogueId:id,token,line:0,active:false});return token;
  }
  private beginDialogue():void {
    const q=this.poses.story?.queue[0];if(!q||q.active||this.completed||this.segment||this.transfer||this.sceneTransition||this.animations.length||movingPlatform(this.map,this.at.objectId,this.poses))return;
    q.active=true;this.route=[];this.pendingTarget=null;this.recoveryVersion++;
  }
  advanceDialogue(choiceId?:string):boolean {
    const state=this.poses.story,q=state?.queue[0],d=q&&this.map.story?.dialogues.find(d=>d.id===q.dialogueId);if(!state||!q?.active||!d||this.debugPaused)return false;
    if(q.line<d.lines.length-1){if(choiceId)return false;q.line++;return true;}
    const choice=choiceId?d.choices.find(c=>c.id===choiceId):undefined;
    if(choiceId&&(!choice||!this.logic.condition(choice.condition)))return false;
    if(!choice&&d.choices.some(c=>this.logic.condition(c.condition)))return false;
    state.queue.shift();if(!state.seen.includes(d.id))state.seen.push(d.id);if(choice)state.choices[d.id]=choice.id;
    this.logic.emit({type:'dialogue',source:d.id,...(choice?{choiceId:choice.id}:{})});if(choice?.signal)this.logic.emit({type:'signal',source:choice.signal});
    this.logic.flush();this.beginDialogue();return true;
  }
  setObjective(id:string,status:ObjectiveStatus):void {
    if(!this.map.story?.objectives.some(o=>o.id===id)||!['hidden','active','done'].includes(status))throw new Error('旅途目标不存在或状态无效。');
    const state=this.poses.story!;if(state.objectives[id]!==status){state.objectives[id]=status;this.logic.emit({type:'objective',source:id});}
  }
  debugStep():void {const paused=this.debugPaused;this.debugPaused=false;try{this.tick(.05);}finally{this.debugPaused=paused;}}
  private tickJourney(dt:number):void {
    if(this.stageTransition){this.stageTransition.elapsed+=dt;if(this.stageTransition.elapsed>=this.stageTransition.duration)this.stageTransition=null;}
    if(this.stageTransition||this.recoveryPending)return;
    for(const g of this.map.groups){const config=g.platform,p=this.poses.platforms?.[g.id];if(!config||!p||p.paused)continue;
      const members=this.platformMembers.get(g.id)??[];if(!members.some(o=>activePath(this.map,o,this.poses)))continue;
      // Finish the occupied edge or portal before the deck can depart, even when a
      // third-party rule called it while the traveler was boarding or leaving.
      if(this.segment&&[this.segment.a,this.segment.b].some(w=>platformGroup(this.map,w.objectId)===g.id)||this.transfer&&[this.at,this.transfer.next].some(w=>platformGroup(this.map,w.objectId)===g.id))continue;
      if(p.targetId===null){
        if(p.wait>0){p.wait=Math.max(0,p.wait-dt);if(p.wait>0)continue;}
        let request=p.queue.shift();
        if(!request&&p.running&&config.mode!=='manual'){
          let index=config.stations.findIndex(s=>s.id===p.stationId)+(p.reverse?-1:1);
          if(config.mode==='loop')index=(index+config.stations.length)%config.stations.length;
          else if(index<0||index>=config.stations.length){p.reverse=!p.reverse;index=config.stations.findIndex(s=>s.id===p.stationId)+(p.reverse?-1:1);}
          request={stationId:config.stations[index]!.id,token:this.nextMotion++};
        }
        if(!request)continue;if(request.stationId===p.stationId)continue;
        p.targetId=request.stationId;p.stationId=null;p.token=request.token;p.elapsed=0;p.from=structuredClone(this.poses.groups[g.id]!);
        if(this.route.some(w=>platformGroup(this.map,w.objectId)===g.id))this.route=this.segment&&this.route[0]?[this.route[0]]:[];
        if(platformGroup(this.map,this.at.objectId)===g.id){this.route=[];this.pendingTarget=null;this.message='平台正在移动，请等待停靠。';}
        this.logic.emit({type:'departure',source:g.id,stationId:p.targetId});
      }
      const rider=platformGroup(this.map,this.at.objectId)===g.id?this.map.objects.find(o=>o.id===this.at.objectId)!:null;
      const oldFrame=rider?pointMatrix(point=>worldSample(this.map,rider,surfaceSample(point),this.poses).point):null;
      const facing=oldFrame?matrixPoint(inverseMatrix(oldFrame),add(matrixPoint(oldFrame,[0,0,0]),this.direction)):null;
      const destination=config.stations.find(s=>s.id===p.targetId)!;p.elapsed=Math.min(destination.duration,p.elapsed+dt);const x=p.elapsed/destination.duration,t=x*x*(3-2*x);
      this.poses.groups[g.id]={translation:mix(p.from.translation,destination.translation,t),rotation:mix(p.from.rotation,destination.rotation,t)};
      if(rider&&facing){this.stand(this.at);this.direction=unit(sub(worldSample(this.map,rider,surfaceSample(facing),this.poses).point,worldSample(this.map,rider,surfaceSample([0,0,0]),this.poses).point));}
      if(p.elapsed>=destination.duration){p.stationId=destination.id;p.targetId=null;p.token=null;p.elapsed=0;p.wait=destination.wait;this.message=`平台已停靠：${destination.name}。`;this.logic.emit({type:'arrival',source:g.id,stationId:destination.id});}
    }
  }
  private applyStage():void {
    if(!this.stageQueue.length||this.stageTransition||this.segment||this.transfer||this.animations.length||movingPlatform(this.map,this.at.objectId,this.poses))return;
    const request=this.stageQueue.shift()!,stage=this.map.stages!.items.find(s=>s.id===request.stageId)!;if(stage.id===this.poses.stageId)return;
    const poses={...this.poses,stageId:stage.id},entry=stage.entry,object=entry?this.map.objects.find(o=>o.id===entry.objectId)!:this.map.objects.find(o=>o.id===this.at.objectId)!;
    const at=entry?{objectId:entry.objectId,index:walkSurfaces(object).find(f=>f.face===entry.face)!.center}:this.at;
    if(!activePath(this.map,object,poses)||movingPlatform(this.map,object.id,poses)){this.logic.cancelMotion(request.token);this.message='阶段切换需要可行走且已停靠的入口，本次动作链已取消。';return;}
    this.poses.stageId=stage.id;this.poses.visitedStages??=[];if(!this.poses.visitedStages.includes(stage.id))this.poses.visitedStages.push(stage.id);
    this.route=[];this.pendingTarget=null;this.stand(at);this.stageRevision++;this.recoveryVersion++;
    const duration=stage.camera?.duration??0;if(duration>0)this.stageTransition={token:request.token,elapsed:0,duration};
    this.message=`进入场景：${stage.name}。`;this.logic.emit({type:'stage',source:stage.id});
  }
  queueMotion(action:Action):number {
    const token=this.nextMotion++;this.animations.push({token,groupId:action.groupId,from:null,to:{translation:[...action.translation],rotation:[...action.rotation]},elapsed:0,duration:action.duration,easing:action.easing});return token;
  }
  motionPending(token:number):boolean{return !!this.poses.story?.queue.some(q=>q.token===token)||this.animations.some(a=>a.token===token)||this.stageQueue.some(s=>s.token===token)||this.stageTransition?.token===token||Object.values(this.poses.platforms??{}).some(p=>p.token===token||p.queue.some(q=>q.token===token));}
  private occupied(id:string):boolean {
    const gate=this.transfer&&this.map.objects.find(o=>o.id===this.transfer!.gateId);
    return this.at.objectId===id||this.segment?.a.objectId===id||this.segment?.b.objectId===id||this.transfer?.next.objectId===id||gate?.portal?.pathId===id;
  }
  setState(targetId:string,property:StateProperty,value:boolean):void {
    const group=this.map.groups.some(g=>g.id===targetId);
    for(const o of this.map.objects){const host=this.map.objects.find(h=>h.id===(o.attachment?.pathId??o.portal?.pathId))??o;
      if(o.id!==targetId&&!(group&&belongsToGroup(this.map,host.groupId,targetId)))continue;
      const key=`${o.id}:${property}`;this.deferredStates.delete(key);
      if(!value&&property!=='enabled'&&isWalkable(o)&&this.occupied(o.id)){this.deferredStates.set(key,{id:o.id,property,value});continue;}
      this.poses.states??={};this.poses.states[o.id]={...this.poses.states[o.id],[property]:value};
    }
  }
  private applyDeferredStates():void {for(const [key,s] of this.deferredStates)if(!this.occupied(s.id)){this.deferredStates.delete(key);this.setState(s.id,s.property,s.value);}}
  logicSnapshot():unknown{return {story:structuredClone(this.poses.story??null),debugPaused:this.debugPaused,stage:this.poses.stageId??null,visitedStages:this.poses.visitedStages??[],platforms:structuredClone(this.poses.platforms??{}),sceneTransition:this.sceneTransition,checkpoint:this.checkpointInfo,recoveryVersion:this.recoveryVersion,recovery:this.recovery,rules:this.logic.snapshot(),deferred:[...this.deferredStates.values()],states:Object.fromEntries(this.map.objects.map(o=>[o.id,objectState(this.map,o,this.poses)]))};}
  private surfaceEvents():void {
    const o=this.map.objects.find(o=>o.id===this.at.objectId)!,face=walkSurfaces(o).find(f=>f.center===this.at.index||f.indices.includes(this.at.index))?.face??0;
    if(this.occupiedSurface?.id===o.id&&this.occupiedSurface.face===face)return;
    if(this.occupiedSurface)this.logic.emit({type:'leave',source:this.occupiedSurface.id,face:this.occupiedSurface.face});
    this.occupiedSurface={id:o.id,face};this.logic.emit({type:'enter',source:o.id,face});this.applyDeferredStates();
  }
  get walking():boolean {return this.route.length>0||this.transfer!==null;}
  /** A stopped traveler holds the rung; reversing does not turn their back to the ladder. */
  get ladderFrame():{forward:Vec3;up:Vec3;descending:boolean}|null {
    const o=this.map.objects.find(o=>o.id===(this.segment?.a.objectId??this.at.objectId));if(o?.type!==17)return null;
    const a=this.segment?.a??{...worldSamples(this.map,o,this.poses)[this.at.index]!,...this.at},b=this.segment?.b??this.route[0]??a,last=localSamples(o).length-1;
    if(a.objectId!==b.objectId||a.index<1||b.index<1||a.index>=last||b.index>=last)return null;
    const origin=worldSample(this.map,o,surfaceSample([0,0,0]),this.poses).point;
    const vector=(p:Vec3)=>unit(sub(worldSample(this.map,o,surfaceSample(p),this.poses).point,origin)),up=vector([0,1,0]);
    return {forward:vector([0,0,-1]),up,descending:this.direction.reduce((sum,v,i)=>sum+v*up[i]!,0)<0};
  }
  get busy():boolean {return this.debugPaused||this.dialogueActive||this.animations.length>0||this.transfer!==null||this.sceneTransition||!!movingPlatform(this.map,this.at.objectId,this.poses);}
  walkTo(id:string,targetIndex?:number):boolean {
    this.automaticRecoveries=0;
    if(this.transfer){this.pendingTarget={id,...(targetIndex===undefined?{}:{index:targetIndex})};return true;}
    if(this.busy||this.completed) return false;
    const target=this.map.objects.find(o=>o.id===id);
    const routeFrom=(from:{objectId:string;index:number}):Waypoint[]|null=>{
      if(target?.type!==20)return findRoute(this.map,this.poses,from,id,targetIndex,this.projection);
      const anchor=portalAnchor(this.map,target),destination=portalDestination(this.map,target),end=destination&&portalAnchor(this.map,destination);
      if(!anchor||!end||!activePortal(this.map,target,this.poses)||!activePortal(this.map,destination!,this.poses))return null;
      const route=findRoute(this.map,this.poses,from,anchor.objectId,anchor.index,this.projection),host=this.map.objects.find(o=>o.id===end.objectId)!;
      return route&&[...route,{...worldSamples(this.map,host,this.poses)[end.index]!,...end,portalId:target.id}];
    };
    let route:Waypoint[]|null=null;
    if(this.segment){
      // Rejoin the graph through either end of the current edge. Never jump back
      // to the last visited node or cut directly across a corner/curved surface.
      const {a,b}=this.segment,first=this.route[0],forward=first?.objectId===a.objectId&&first.index===a.index?a:b;
      let best=Infinity;
      for(const endpoint of [forward,forward===a?b:a]){
        const tail=routeFrom(endpoint);if(!tail)continue;
        let cost=length(sub(endpoint.point,this.position)),previous=endpoint;
        for(const next of tail){cost+=next.portalId?2.08:this.isOpticalStep(previous.point,previous.objectId,next)?0:length(sub(next.point,previous.point));previous=next;}
        if(cost<best-1e-8){best=cost;route=[endpoint,...tail];}
      }
    }else route=routeFrom(this.at);
    if(!route) {this.message='道路尚未连通。寻找开关，或调整机关。';return false;}
    this.route=route;this.message='旅行者正在前往新的道路。';return true;
  }
  private isOpticalStep(point:Vec3,objectId:string,next:Waypoint):boolean {
    const a=this.projection(next.point),b=this.projection(point);
    return next.objectId!==objectId&&length(sub(next.point,point))>.065&&Math.hypot(a[0]-b[0],a[1]-b[1])<.055;
  }
  canDrag(id:string):boolean {
    const o=this.map.objects.find(x=>x.id===id),at=this.map.objects.find(x=>x.id===this.at.objectId);
    return !!o&&objectState(this.map,o,this.poses).enabled&&objectState(this.map,o,this.poses).visible&&(o.type===3||o.type===4)&&!this.walking&&!this.busy&&!this.completed&&(o.motion.targetGroup?!belongsToGroup(this.map,at?.groupId,o.motion.targetGroup):o.id!==this.at.objectId);
  }
  dragTo(id:string,value:number,snap=false):boolean {
    const o=this.map.objects.find(x=>x.id===id);if(!o||!this.canDrag(id)||!Number.isFinite(value))return false;
    this.automaticRecoveries=0;if(snap)value=Math.round(value/o.motion.step)*o.motion.step;
    this.poses.mechanisms[id]=o.type===3?value:Math.max(o.motion.min,Math.min(o.motion.max,value));if(snap){this.logic.emit({type:'mechanism',source:id});this.logic.flush();}return true;
  }
  private enter():void {
    this.surfaceEvents();this.logic.flush();
    const o=this.map.objects.find(x=>x.id===this.at.objectId)!;
    if(this.recoveryPending)return;
    if(o.checkpoint&&this.at.index===walkSurfaces(o).find(f=>f.face===o.checkpoint!.face)?.center)this.requestCheckpoint(o.checkpoint.name);
    if(this.finishAtExit())return;
    if(pathMarker(o)?.kind==='exit'&&this.at.index===markerIndex(o))this.message='出口尚未开启。寻找机关。';
    if(this.at.index!==centerIndex(o)||o.type!==8||!objectState(this.map,o,this.poses).enabled||(o.trigger.mode==='once'&&this.fired.has(o.id)))return;
    this.fired.add(o.id); const on=!this.switches[o.id]; this.switches[o.id]=on;
    for(const a of o.trigger.actions)this.queueMotion(on?a:{...a,translation:[0,0,0],rotation:[0,0,0]});
    if(o.trigger.actions.length){this.route=[];this.message='开关已触发。物体组正在移动，稍后再选择道路。';}
    this.logic.emit({type:'switch',source:o.id});this.logic.flush();
  }
  private finishAtExit():boolean {
    if(this.segment||this.transfer||this.poses.story?.queue.length)return false;const o=this.map.objects.find(o=>o.id===this.at.objectId)!;
    if(pathMarker(o)?.kind!=='exit'||this.at.index!==markerIndex(o)||!objectState(this.map,o,this.poses).enabled)return false;
    this.completed=true;this.route=[];this.message='山谷的另一侧，又多了一盏灯。';return true;
  }
  tick(delta:number):void {
    if(this.recovery?.kind==='restore'){this.applyRecovery();return;}
    if(this.debugPaused)return;
    this.beginDialogue();if(this.dialogueActive){if(this.recoveryPending)this.applyRecovery();else this.finishCheckpoint();return;}
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;
    if(!this.completed)this.tickJourney(dt);this.step(delta);if(this.recoveryPending)this.applyRecovery();else {this.applyStage();this.finishCheckpoint();}
  }
  private step(delta:number):void {
    if(this.completed)return;
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;this.applyDeferredStates();if(!this.completed)this.logic.tick(dt);
    if(this.recovery?.kind==='restore'||(this.recoveryPending||this.stageTransition)&&!this.segment&&!this.transfer)return;
    if(this.finishAtExit())return;
    if(this.transfer){
      const t=this.transfer;t.elapsed+=dt;
      if(t.elapsed>=.4&&!t.arrived){
        t.arrived=true;const host=this.map.objects.find(o=>o.id===t.next.objectId)!,sample=worldSamples(this.map,host,this.poses)[t.next.index]!;
        this.at={objectId:t.next.objectId,index:t.next.index};this.position=[...sample.point];this.up=[...sample.up];
        const gate=this.map.objects.find(o=>o.id===t.destinationId)!;this.direction=unit(sub(worldSample(this.map,gate,surfaceSample([0,0,1]),this.poses).point,this.position));
      }
      if(t.elapsed>=.8){this.transfer=null;this.message='已穿过传送门。';this.logic.emit({type:'portal',source:t.gateId});this.enter();const pending=this.pendingTarget;this.pendingTarget=null;if(pending)this.walkTo(pending.id,pending.index);}
      return;
    }
    if(this.animations.length&&!this.segment) {
      this.route=[];const active=new Set<string>(),finished:Animation[]=[];
      for(const a of this.animations){if(active.has(a.groupId))continue;active.add(a.groupId);
        a.from??=structuredClone(this.poses.groups[a.groupId]??zeroPose());a.elapsed+=dt;const x=Math.min(1,a.elapsed/a.duration),t=a.easing==='smooth'?x*x*(3-2*x):x;
        this.poses.groups[a.groupId]={translation:mix(a.from.translation,a.to.translation,t),rotation:mix(a.from.rotation,a.to.rotation,t)};
        if(a.elapsed>=a.duration)finished.push(a);
      }
      this.animations=this.animations.filter(a=>!finished.includes(a));
      const o=this.map.objects.find(x=>x.id===this.at.objectId)!;const sample=worldSamples(this.map,o,this.poses)[this.at.index]!;this.position=[...sample.point];this.up=[...sample.up];
      if(!this.busy)this.message='机关已就位。点击新的道路继续前行。';
      for(const a of finished)this.logic.emit({type:'group',source:a.groupId});this.logic.flush();return;
    }
    if(!this.segment&&(this.stageQueue.length||this.poses.story?.queue.length||movingPlatform(this.map,this.at.objectId,this.poses)))return;
    let budget=dt*2.6;
    while(this.route.length&&budget>0) {
      const next=this.route[0]!;if(!this.segment&&!platformConnection(this.map,this.at.objectId,next.objectId,this.poses)){this.route=[];this.message='平台正在移动，请等待停靠。';break;}if(!activePath(this.map,this.map.objects.find(o=>o.id===next.objectId)!,this.poses)){this.route=[];this.segment=null;this.message='前方道路已关闭，请选择其他道路。';break;}const d=sub(next.point,this.position),distance=length(d);
      if(next.portalId){
        const gate=this.map.objects.find(o=>o.id===next.portalId)!,destination=portalDestination(this.map,gate);
        if(!destination||!activePortal(this.map,gate,this.poses)||!activePortal(this.map,destination,this.poses)){this.route=[];this.message='传送门目的地未就绪。';break;}
        this.route.shift();this.segment=null;this.transfer={gateId:gate.id,destinationId:destination.id,next,elapsed:0,arrived:false};
        this.direction=unit(sub(this.position,worldSample(this.map,gate,surfaceSample([0,0,1]),this.poses).point));this.message='正在穿过传送门。';break;
      }
      const optical=this.isOpticalStep(this.position,this.at.objectId,next);
      const cost=this.ladderFrame?2:1,travel=budget/cost;
      if(distance<=travel||optical) {
        if(!optical&&distance>.00001)this.direction=unit(d);
        this.position=[...next.point];this.up=[...next.up];this.at={objectId:next.objectId,index:next.index};this.route.shift();this.segment=null;budget-=optical?0:distance*cost;this.enter();if(this.animations.length||this.checkpointRequest!==null||this.recoveryPending||this.sceneTransition)break;
      } else {
        if(!this.segment){const o=this.map.objects.find(o=>o.id===this.at.objectId)!,sample=worldSamples(this.map,o,this.poses)[this.at.index]!;this.segment={a:{...sample,...this.at},b:next};}
        this.position=mix(this.position,next.point,travel/distance);this.up=unit(mix(this.up,next.up,travel/distance));this.direction=unit(d);budget=0;}
    }
  }
}

/** Demonstration: step on two switches to translate, then rotate, grouped roads. */
export function logicGarden():ValleyMap {
  const map=emptyMap();map.id='logic-garden';map.name='双灯之约 · 事件、条件与动作';
  map.objects=[createObject(9,'start',[-3,0,0]),createObject(8,'first',[-2,0,0]),createObject(1,'middle',[-1,0,0]),createObject(8,'second',[0,0,0]),createObject(1,'gate-road',[1,0,0]),createObject(1,'arrival',[5,0,0]),createObject(10,'exit',[6,0,0]),createObject(3,'wheel',[-1,0,1])];
  map.objects.find(o=>o.id==='first')!.name='第一盏灯';map.objects.find(o=>o.id==='second')!.name='第二盏灯';
  for(const o of map.objects.filter(o=>o.type===8))o.trigger.mode='toggle';
  map.objects.find(o=>o.id==='wheel')!.state={enabled:false};map.objects.find(o=>o.id==='exit')!.state={enabled:false};
  const gate=createObject(20,'gate-a'),destination=createObject(20,'gate-b');map.objects.push(gate,destination);bindPortal(map,gate.id,'gate-road');bindPortal(map,destination.id,'arrival');gate.portal!.targetId=destination.id;destination.portal!.targetId=gate.id;gate.state={enabled:false};
  map.groups=[{id:'lanterns',name:'升起的花灯',pivot:[0,0,2]}];const flower=createObject(16,'light',[0,0,2]);flower.groupId='lanterns';map.objects.push(flower);
  const sea=createObject(11,'sea',[1,-2,0]);sea.length=15;sea.width=8;map.objects.push(sea);
  const rule=(id:string,name:string,event:LogicEvent,condition:LogicCondition,actions:LogicAction[]):LogicRule=>({id,name,enabled:true,once:true,event,condition,actions});
  map.logic={variables:[{id:'progress',name:'点灯进度',initial:0},{id:'visits',name:'穿门次数',initial:0}],rules:[
    rule('welcome','旅行者的约定',{type:'start',source:null},{kind:'all',conditions:[]},[{kind:'message',text:'先点亮第一盏灯，再点亮第二盏灯，门才会回应。'}]),
    rule('first-light','记录第一盏灯',{type:'switch',source:'first'},{kind:'variable',id:'progress',op:'eq',value:0},[{kind:'variable',id:'progress',operation:'set',value:1},{kind:'message',text:'第一盏灯已亮。继续向右，点亮第二盏灯。'}]),
    rule('second-light','两盏灯共同回应',{type:'switch',source:'second'},{kind:'all',conditions:[{kind:'variable',id:'progress',op:'eq',value:1},{kind:'switch',objectId:'first',value:true},{kind:'switch',objectId:'second',value:true}]},[{kind:'variable',id:'progress',operation:'set',value:2}]),
    rule('open-gate','升起花灯，展开机关',{type:'variable',source:'progress'},{kind:'variable',id:'progress',op:'eq',value:2},[
      {kind:'message',text:'两盏灯相互回应，远处的门正在苏醒。'},{kind:'wait',duration:.3},
      {kind:'parallel',actions:[{kind:'move',groupId:'lanterns',translation:[0,1,0],rotation:[0,90,0],duration:.8,easing:'smooth'},{kind:'wait',duration:.6}]},
      {kind:'state',targetId:'gate-a',property:'enabled',value:true},{kind:'state',targetId:'wheel',property:'enabled',value:true},{kind:'message',text:'门已开启。穿过光幕，前往另一座岛。'}]),
    {...rule('arrived','抵达彼岸',{type:'portal',source:'gate-a'},{kind:'all',conditions:[]},[{kind:'variable',id:'visits',operation:'add',value:1},{kind:'state',targetId:'exit',property:'enabled',value:true},{kind:'message',text:'约定已经完成。沿着道路走向出口。'}]),once:false},
  ]};return map;
}
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

/** Disconnected courtyards joined only by two doors, with a stream spilling into the sea. */
export function portalGarden():ValleyMap {
  const map=emptyMap();map.id='portal-garden';map.name='潮声之门 · 去往看不见的庭院';
  const start=createObject(1,'start',[-4,1,1]),a=createObject(1,'door-road-a',[-3,1,1]),b=createObject(1,'door-road-b',[2,2,-2]),road=createObject(1,'after-door',[3,2,-2]),exit=createObject(1,'exit',[4,2,-2]);
  const gateA=createObject(20,'portal-a'),gateB=createObject(20,'portal-b');gateA.name='潮汐门';gateB.name='山谷门';gateA.rotation=[0,90,0];gateB.rotation=[0,-90,0];gateB.portal!.shape='square';gateB.colors.surface='#c5adc6';
  const stream=createObject(21,'stream',[-2,1,-.3]);stream.length=4;stream.width=.7;
  const fall=createObject(22,'waterfall',[0,1,-.3]);fall.length=.7;fall.rise=2.5;fall.rotation=[0,90,0];
  const sea=createObject(11,'sea',[0,-1.5,0]);sea.length=17;sea.width=12;sea.colors.surface='#398d9d';
  const bank=createObject(1,'waterway-support',[-2,.96,-.3]);bank.length=4;bank.width=1;bank.thickness=.6;bank.colors.surface='#96a48b';
  map.objects=[start,a,b,road,exit,gateA,gateB,bank,stream,fall,sea];setPathMarker(map,'start','spawn');setPathMarker(map,'exit','exit');
  bindPortal(map,gateA.id,a.id);bindPortal(map,gateB.id,b.id);gateA.portal!.targetId=gateB.id;gateB.portal!.targetId=gateA.id;return map;
}

/** A reusable checkpoint with two independently resettable puzzle regions. */
export function checkpointGarden():ValleyMap {
  const map=emptyMap();map.id='checkpoint-garden';map.name='归途灯塔 · 可以重新出发的旅程';
  map.groups=[{id:'west',name:'西庭 · 青灯',pivot:[0,0,0]},{id:'east',name:'东庭 · 金灯',pivot:[0,0,0]}];
  const start=createObject(1,'start',[-3,0,0]),beacon=createObject(1,'beacon',[-2,0,0]),crossing=createObject(1,'crossing',[-1,0,0]);beacon.checkpoint={name:'归途灯塔',face:0};beacon.colors.surface='#8cbbc0';
  const west=createObject(8,'west-switch',[-1,0,1]),east=createObject(8,'east-switch',[-1,0,-1]);west.groupId='west';east.groupId='east';
  const towerA=createObject(13,'west-lamp',[0,0,2]),towerB=createObject(15,'east-lamp',[0,0,-2]);towerA.groupId='west';towerB.groupId='east';towerA.length=.7;towerA.width=.7;towerA.rise=1.5;towerB.length=.7;towerB.width=.7;towerB.rise=1.5;
  const road=createObject(1,'bridge',[0,0,0]),exit=createObject(1,'exit',[1,0,0]);exit.state={enabled:false};road.colors.surface='#c4b280';
  const sea=createObject(11,'sea',[0,-1.3,0]);sea.length=12;sea.width=10;sea.colors.surface='#539ba2';
  map.objects=[start,beacon,crossing,west,east,towerA,towerB,road,exit,sea];setPathMarker(map,start.id,'spawn');setPathMarker(map,exit.id,'exit');
  const lit=(id:string):LogicCondition=>({kind:'variable',id,op:'eq',value:true});
  map.logic={variables:[{id:'west-lit',name:'青灯已点亮',initial:false,resetGroup:'west'},{id:'east-lit',name:'金灯已点亮',initial:false,resetGroup:'east'}],rules:[
    ...(['west','east'] as const).map(id=>({id:`light-${id}`,name:id==='west'?'点亮青灯':'点亮金灯',enabled:true,once:true,resetGroup:id,event:{type:'switch' as const,source:`${id}-switch`},condition:{kind:'all' as const,conditions:[]},actions:[{kind:'variable' as const,id:`${id}-lit`,operation:'set' as const,value:true},{kind:'message' as const,text:'灯已点亮。可以重试此区域，另一盏灯会保留。'}]})),
    {id:'unlock',name:'双灯开门',enabled:true,once:false,event:{type:'variable',source:null},condition:{kind:'all',conditions:[lit('west-lit'),lit('east-lit')]},actions:[{kind:'state',targetId:'exit',property:'enabled',value:true}]},
    {id:'after-reset',name:'重试后重新检查出口',enabled:true,once:false,event:{type:'reset',source:null},condition:{kind:'any',conditions:[{kind:'not',condition:lit('west-lit')},{kind:'not',condition:lit('east-lit')}]},actions:[{kind:'state',targetId:'exit',property:'enabled',value:false}]}
  ]};return map;
}


export function defaultPlatform():PlatformSettings {return {initialStation:'station-1',mode:'manual',autoStart:false,stations:[{id:'station-1',name:'下层站',translation:[0,0,0],rotation:[0,0,0],duration:2,wait:1},{id:'station-2',name:'上层站',translation:[0,2,0],rotation:[0,0,0],duration:2,wait:1}]};}
export const defaultStageCamera=():StageCamera=>({target:[0,0,0],yaw:45,pitch:54.73561,span:12,duration:1,lock:true});
function parsePlatform(raw:unknown):PlatformSettings {
  const fail=():never=>{throw new Error('移动平台需要 2～16 个有效站点、初始站点和运行方式。');};
  if(!record(raw)||!Array.isArray(raw.stations)||raw.stations.length<2||raw.stations.length>16||!['manual','loop','pingpong'].includes(raw.mode as string)||typeof raw.autoStart!=='boolean')return fail();
  const ids=new Set<string>(),stations=raw.stations.map(s=>{if(!record(s)||!identifier(s.id)||ids.has(s.id)||!label(s.name)||!vector(s.translation)||!vector(s.rotation)||!finite(s.duration,.1,60)||!finite(s.wait,.1,300))return fail();ids.add(s.id);return {id:s.id,name:s.name,translation:[...s.translation] as Vec3,rotation:[...s.rotation] as Vec3,duration:s.duration,wait:s.wait};});
  if(!ids.has(raw.initialStation as string))return fail();return {initialStation:raw.initialStation as string,mode:raw.mode as PlatformSettings['mode'],autoStart:raw.autoStart,stations};
}
function parseStages(raw:unknown,objects:MapObject[],groups:MapGroup[]):SceneStages {
  const fail=():never=>{throw new Error('场景阶段的名称、物体组、入口或镜头设置无效。');};
  if(!record(raw)||!Array.isArray(raw.items)||raw.items.length<1||raw.items.length>32)return fail();
  const ids=new Set<string>(),items=raw.items.map(s=>{
    if(!record(s)||!identifier(s.id)||ids.has(s.id)||objects.some(o=>o.id===s.id)||groups.some(g=>g.id===s.id)||!label(s.name)||!Array.isArray(s.groups)||s.groups.length>100||new Set(s.groups).size!==s.groups.length||s.groups.some(id=>!groups.some(g=>g.id===id)))return fail();ids.add(s.id);
    let entry:MapStage['entry']=null,camera:StageCamera|null=null;
    if(s.entry!==null){const e=s.entry;if(!record(e))return fail();const o=objects.find(o=>o.id===e.objectId);if(!o||!canMarkPath(o)||!walkSurfaces(o).some(f=>f.face===e.face))return fail();entry={objectId:o.id,face:e.face as number};}
    if(s.camera!==null){const c=s.camera;if(!record(c)||!vector(c.target)||!finite(c.yaw,-36000,36000)||!finite(c.pitch,10,80)||!finite(c.span,3,150)||!finite(c.duration,0,10)||typeof c.lock!=='boolean')return fail();camera={target:[...c.target],yaw:c.yaw,pitch:c.pitch,span:c.span,duration:c.duration,lock:c.lock};}
    return {id:s.id,name:s.name,groups:[...s.groups] as string[],entry,camera};
  });if(!ids.has(raw.initial as string))return fail();
  const map={groups,objects} as ValleyMap,controlled=[...new Set(items.flatMap(s=>s.groups))];
  if(controlled.some(id=>controlled.some(other=>id!==other&&belongsToGroup(map,id,other))))throw new Error('阶段控制的物体组不能相互嵌套；请把共同父节点或独立区域加入阶段。');
  return {initial:raw.initial as string,items};
}
function validatePlatforms(groups:MapGroup[],objects:MapObject[]):void {
  const map={groups,objects} as ValleyMap,platforms=groups.filter(g=>g.platform);
  for(const g of platforms){parsePlatform(g.platform);if(platforms.some(other=>other!==g&&belongsToGroup(map,g.id,other.id)))throw new Error('移动平台不能嵌套。');}
  const overlaps=(id:string)=>platforms.some(g=>belongsToGroup(map,g.id,id)||belongsToGroup(map,id,g.id));
  for(const o of objects)if(o.motion.targetGroup&&overlaps(o.motion.targetGroup)||o.trigger.actions.some(a=>overlaps(a.groupId)))throw new Error('移动平台由站点控制，请使用平台动作，不要同时绑定拖拽或旧式组动画。');
}
export function platformGroup(map:ValleyMap,objectId:string):string|null {
  const o=map.objects.find(o=>o.id===objectId);if(!o)return null;const host=map.objects.find(h=>h.id===(o.attachment?.pathId??o.portal?.pathId))??o;
  return map.groups.find(g=>g.platform&&belongsToGroup(map,host.groupId,g.id))?.id??null;
}
export function movingPlatform(map:ValleyMap,id:string,poses:MapPoses):string|null {const group=platformGroup(map,id);return group&&poses.platforms?.[group]?.targetId?group:null;}
function platformConnection(map:ValleyMap,a:string,b:string,poses:MapPoses):boolean {const x=platformGroup(map,a),y=platformGroup(map,b);return x===y||!(x&&poses.platforms?.[x]?.targetId||y&&poses.platforms?.[y]?.targetId);}
export function stageAllows(map:ValleyMap,o:MapObject,poses:MapPoses):boolean {
  if(!map.stages||poses.stageId===undefined)return true;
  const host=map.objects.find(h=>h.id===(o.attachment?.pathId??o.portal?.pathId))??o,controlled=map.stages.items.flatMap(s=>s.groups),active=map.stages.items.find(s=>s.id===poses.stageId)!.groups;
  return !controlled.some(id=>belongsToGroup(map,host.groupId,id))||active.some(id=>belongsToGroup(map,host.groupId,id));
}
function stationPose(p:PlatformSettings,id:string):GroupPose {const s=p.stations.find(s=>s.id===id)!;return {translation:[...s.translation],rotation:[...s.rotation]};}
function initialPlatform(p:PlatformSettings):PlatformState {return {stationId:p.initialStation,targetId:null,from:stationPose(p,p.initialStation),elapsed:0,wait:p.stations.find(s=>s.id===p.initialStation)!.wait,reverse:false,running:p.autoStart,paused:false,token:null,queue:[]};}
function parseJourneyMemory(raw:Record<string,unknown>,map:ValleyMap,poses:MapPoses,nextMotion:number,fail:()=>never):void {
  if(map.stages){if(!map.stages.items.some(s=>s.id===raw.stageId)||!Array.isArray(raw.visitedStages)||!raw.visitedStages.includes(raw.stageId)||new Set(raw.visitedStages).size!==raw.visitedStages.length||raw.visitedStages.some(id=>!map.stages!.items.some(s=>s.id===id)))return fail();poses.stageId=raw.stageId as string;poses.visitedStages=[...raw.visitedStages] as string[];}
  else if(raw.stageId!==undefined||raw.visitedStages!==undefined)return fail();
  const groups=map.groups.filter(g=>g.platform);if(raw.platforms===undefined&&!groups.length)return;
  if(!record(raw.platforms)||Object.keys(raw.platforms).length!==groups.length)return fail();poses.platforms={};const tokens=new Set<number>();
  const token=(t:unknown):t is number=>finite(t,1,nextMotion-1)&&Number.isInteger(t)&&!tokens.has(t)&&!!tokens.add(t);
  for(const g of groups){const p=raw.platforms[g.id],c=g.platform!,station=(id:unknown)=>c.stations.find(s=>s.id===id);
    if(!record(p)||!record(p.from)||!vector(p.from.translation)||!vector(p.from.rotation)||!finite(p.wait,0,300)||typeof p.running!=='boolean'||typeof p.paused!=='boolean'||typeof p.reverse!=='boolean'||!Array.isArray(p.queue)||p.queue.length>64||!finite(p.elapsed,0,60))return fail();
    if(p.targetId===null?(!station(p.stationId)||p.token!==null||p.elapsed!==0):(p.stationId!==null||!station(p.targetId)||p.elapsed>station(p.targetId)!.duration||p.token!==null&&!token(p.token)))return fail();
    const queue=p.queue.map(q=>{if(!record(q)||!station(q.stationId)||!token(q.token))return fail();return {stationId:q.stationId as string,token:q.token};});
    poses.platforms[g.id]={stationId:p.stationId as string|null,targetId:p.targetId as string|null,from:{translation:[...p.from.translation],rotation:[...p.from.rotation]},elapsed:p.elapsed,wait:p.wait,reverse:p.reverse,running:p.running,paused:p.paused,token:p.token as number|null,queue};
  }
}


/** Ride to the upper landing, reveal a second courtyard, then return through a checkpoint. */
export function journeyGarden():ValleyMap {
  const map=emptyMap();map.id='journey-garden';map.name='云阶渡庭 · 平台与分阶段场景';
  const platform=defaultPlatform();platform.stations[0]!.wait=.3;platform.stations[1]!.wait=1;platform.stations[1]!.translation=[0,2,0];
  map.groups=[{id:'lift',name:'云梯平台',pivot:[0,0,0],platform},{id:'courtyard',name:'第二庭院',pivot:[0,0,0]}];
  const start=createObject(1,'start',[-2,0,0]),road=createObject(1,'lower',[-1,0,0]),deck=createObject(1,'deck',[0,0,0]),upper=createObject(1,'upper',[1,2,0]),gate=createObject(8,'reveal',[2,2,0]),entry=createObject(1,'garden-entry',[3,2,0]),exit=createObject(1,'exit',[4,2,0]);deck.groupId='lift';deck.colors.surface='#80abb0';upper.checkpoint={name:'云端灯塔',face:0};entry.groupId='courtyard';exit.groupId='courtyard';
  const flowers=createObject(16,'flowers',[3,2,-.3]);flowers.groupId='courtyard';const tower=createObject(15,'tower',[3,2,-1.2]);tower.groupId='courtyard';tower.rise=2;
  const sea=createObject(11,'sea',[0,-1.4,0]);sea.length=16;sea.width=10;map.objects=[start,road,deck,upper,gate,entry,exit,flowers,tower,sea];setPathMarker(map,start.id,'spawn');setPathMarker(map,exit.id,'exit');
  map.stages={initial:'ascent',items:[{id:'ascent',name:'乘云而上',groups:[],entry:null,camera:{...defaultStageCamera(),target:[0,.7,0],span:10}},{id:'garden',name:'打开庭院',groups:['courtyard'],entry:null,camera:{...defaultStageCamera(),target:[2,1.7,0],yaw:65,span:10,duration:1.2}}]};
  const rule=(id:string,event:LogicEvent,actions:LogicAction[]):LogicRule=>({id,name:id,enabled:true,once:false,event,condition:{kind:'all',conditions:[]},actions});
  map.logic={variables:[],rules:[rule('ride',{type:'enter',source:'deck',face:0},[{kind:'wait',duration:.35},{kind:'platform',groupId:'lift',command:'go',stationId:'station-2'}]),rule('reveal-garden',{type:'switch',source:'reveal'},[{kind:'stage',stageId:'garden'},{kind:'message',text:'庭院已展开，新的灯光在前方等你。'}])]};
  return map;
}


function parseStory(raw:unknown,reserved:Array<{id:string}>,groups:MapGroup[]):MapStory {
  const fail=():never=>{throw new Error('剧情配置无效：最多 64 段对话、32 个目标；ID 必须唯一，文字及条件必须有效。');};
  if(!record(raw)||!Array.isArray(raw.dialogues)||raw.dialogues.length>64||!Array.isArray(raw.objectives)||raw.objectives.length>32)return fail();
  const ids=new Set(reserved.map(x=>x.id)),check=(v:unknown):Record<string,unknown>=>{if(!record(v)||!identifier(v.id)||ids.has(v.id)||!label(v.name)||v.resetGroup!==undefined&&!groups.some(g=>g.id===v.resetGroup))return fail();ids.add(v.id);return v;};
  if(new Set(JSON.stringify(raw)).size>6000||JSON.stringify(raw).length>150000)return fail();
  const dialogues=raw.dialogues.map(raw=>{const d=check(raw);if(typeof d.speaker!=='string'||d.speaker.length>60||!Array.isArray(d.lines)||!d.lines.length||d.lines.length>32||d.lines.some(t=>typeof t!=='string'||!t.trim()||t.length>300)||!Array.isArray(d.choices)||d.choices.length>4)return fail();
    const choices=new Set<string>();return {id:d.id as string,name:d.name as string,speaker:d.speaker,lines:[...d.lines] as string[],choices:d.choices.map(c=>{if(!record(c)||!identifier(c.id)||choices.has(c.id)||typeof c.text!=='string'||!c.text.trim()||c.text.length>60||c.signal!==null&&!identifier(c.signal)||!record(c.condition))return fail();choices.add(c.id);return {id:c.id,text:c.text,signal:c.signal as string|null,condition:structuredClone(c.condition) as unknown as LogicCondition};}),...(d.resetGroup?{resetGroup:d.resetGroup as string}:{})};});
  const objectives=raw.objectives.map(raw=>{const o=check(raw);if(typeof o.description!=='string'||o.description.length>300||!['hidden','active','done'].includes(o.initial as string))return fail();return {id:o.id as string,name:o.name as string,description:o.description,initial:o.initial as ObjectiveStatus,...(o.resetGroup?{resetGroup:o.resetGroup as string}:{})};});return {dialogues,objectives};
}
function initialStory(story:MapStory):StoryState{return {objectives:Object.fromEntries(story.objectives.map(o=>[o.id,o.initial])),seen:[],choices:{},queue:[]};}
function parseStoryMemory(raw:unknown,map:ValleyMap,nextMotion:number,fail:()=>never):StoryState|undefined {
  if(!map.story){if(raw!==undefined)return fail();return undefined;}
  const story=map.story;if(!record(raw)||!record(raw.objectives)||Object.keys(raw.objectives).length!==story.objectives.length||story.objectives.some(o=>!['hidden','active','done'].includes((raw.objectives as Record<string,unknown>)[o.id] as string))||!Array.isArray(raw.seen)||new Set(raw.seen).size!==raw.seen.length||raw.seen.some(id=>!story.dialogues.some(d=>d.id===id))||!record(raw.choices)||Object.entries(raw.choices).some(([id,c])=>!(raw.seen as unknown[]).includes(id)||!story.dialogues.find(d=>d.id===id)?.choices.some(x=>x.id===c))||!Array.isArray(raw.queue)||raw.queue.length>32)return fail();
  const tokens=new Set<number>(),queue=raw.queue.map((q,i)=>{const d=record(q)&&story.dialogues.find(d=>d.id===q.dialogueId);if(!record(q)||!d||!finite(q.token,1,nextMotion-1)||!Number.isSafeInteger(q.token)||tokens.has(q.token)||!finite(q.line,0,d.lines.length-1)||!Number.isInteger(q.line)||typeof q.active!=='boolean'||i>0&&q.active||!q.active&&q.line!==0)return fail();tokens.add(q.token);return {dialogueId:d.id,token:q.token,line:q.line,active:q.active};});
  return {objectives:{...raw.objectives} as Record<string,ObjectiveStatus>,seen:[...raw.seen] as string[],choices:{...raw.choices} as Record<string,string>,queue};
}

/** Current-pose connectivity only: it never claims a puzzle is unsolvable in future states. */
export function inspectNavigation(map:ValleyMap,poses:MapPoses,from:{objectId:string;index:number},project:Projection=defaultProjection){
  const graph=navigationGraph(map,poses,project),start=`${from.objectId}:${from.index}`,visited=new Set<string>(),queue=graph.nodes.has(start)?[start]:[];if(queue.length)visited.add(start);
  for(let i=0;i<queue.length;i++)for(const next of graph.edges.get(queue[i]!)??[])if(!visited.has(next)){visited.add(next);queue.push(next);}
  const surfaces=map.objects.filter(isWalkable).flatMap(o=>{const samples=worldSamples(map,o,poses),state=objectState(map,o,poses);return walkSurfaces(o).map(f=>({id:o.id,face:f.face,index:f.center,point:samples[f.center]!.point,reachable:visited.has(`${o.id}:${f.center}`),reason:!state.visible?'当前隐藏':!state.walkable?'禁止通行':movingPlatform(map,o.id,poses)?'平台途中，外部连接关闭':visited.has(`${o.id}:${f.center}`)?'当前可达':'与当前位置不连通'}));});
  const links:Array<{a:Vec3;b:Vec3;portal:boolean}>=[];for(const [a,neighbors] of graph.edges)for(const b of neighbors)if(a<b||graph.portalEdges.has(`${a}>${b}`))links.push({a:graph.nodes.get(a)!.point,b:graph.nodes.get(b)!.point,portal:graph.portalEdges.has(`${a}>${b}`)});
  const exits=map.objects.filter(o=>pathMarker(o)?.kind==='exit').map(o=>({id:o.id,reachable:visited.has(`${o.id}:${markerIndex(o)}`),enabled:objectState(map,o,poses).enabled}));
  const portals=map.objects.filter(o=>o.type===20).map(o=>({id:o.id,ready:activePortal(map,o,poses)&&!!portalDestination(map,o)&&activePortal(map,portalDestination(map,o)!,poses),reason:!o.portal?.pathId?'未绑定路径':!o.portal.targetId?'没有出站目标':movingPlatform(map,o.portal.pathId,poses)?'平台途中':!activePortal(map,o,poses)?'入口关闭或隐藏':!portalDestination(map,o)||!activePortal(map,portalDestination(map,o)!,poses)?'目的地未就绪':'可传送'}));
  return {surfaces,links,exits,portals,issues:playIssues(map)};
}

/** An original short scene about returning to the valley, listening, and opening the gate. */
export function storyGarden():ValleyMap {
  const map=emptyMap();map.id='story-garden';map.name='未画完的地图 · 剧情与调试';
  map.groups=[{id:'prison',name:'高塔庭院',pivot:[0,0,0]}];
  const start=createObject(1,'start',[-2,0,0]),beacon=createObject(1,'beacon',[-1,0,0]),plate=createObject(8,'lamp',[0,0,0]),road=createObject(1,'road',[1,0,0]),exit=createObject(1,'exit',[2,0,0]);plate.groupId='prison';exit.state={enabled:false};beacon.checkpoint={name:'重读地图',face:0};
  const arch=createObject(18,'gate',[2,0,0]);arch.rotation=[0,90,0];const sea=createObject(11,'sea',[0,-1.4,0]);sea.length=12;sea.width=9;sea.colors.surface='#559daa';map.objects=[start,beacon,plate,road,exit,arch,sea];setPathMarker(map,'start','spawn');setPathMarker(map,'exit','exit');
  const always:LogicCondition={kind:'all',conditions:[]};
  map.story={objectives:[{id:'show-light',name:'让守碑人亲眼看见',description:'走到庭院中央，点亮石灯。',initial:'active',resetGroup:'prison'},{id:'open-valley',name:'把山口留给风',description:'邀请守碑人一起走出高塔。',initial:'hidden'}],dialogues:[
    {id:'homecoming',name:'归来者',speaker:'微',lines:['我从奇异的几何世界回来，带着一张还没画完的地图。','守碑人说：祖训里没有这些道路。于是，他们把我关进高塔。','可那位看守总在夜里问我：谷外的河，真的有名字吗？'],choices:[{id:'invite',text:'请他一起看一看。',signal:'invite-keeper',condition:always},{id:'listen',text:'先听听他害怕什么。',signal:'listen-keeper',condition:always}]},
    {id:'fear',name:'旧地图',speaker:'守碑人',lines:['我守的也许不是石碑，是害怕自己一直走错了路。','微把灯放在窗边：我们可以一起试一次。'],choices:[]},
    {id:'witness',name:'一盏灯之后',speaker:'守碑人',resetGroup:'prison',lines:['光照到了旧地图之外。原来，没有记载的路，也可以走。','锁是我上的。这一次，让我来开。'],choices:[{id:'leave',text:'把新的地图留给大家。',signal:'open-gate',condition:{kind:'objective',objectiveId:'show-light',status:'done'}}]},
    {id:'outro',name:'留白',speaker:'微',lines:['我没有烧掉旧地图，只在边缘留了一片空白。','有人愿意留在谷里，也有人开始问河的名字。山口的灯，不止一盏了。'],choices:[]}
  ]};
  const rule=(id:string,event:LogicEvent,actions:LogicAction[],condition:LogicCondition=always):LogicRule=>({id,name:id,enabled:true,once:true,event,condition,actions});
  map.logic={variables:[{id:'keeper-trust',name:'守碑人的信任',initial:0}],rules:[
    rule('opening',{type:'start',source:null},[{kind:'dialogue',dialogueId:'homecoming'}]),
    rule('listening',{type:'signal',source:'listen-keeper'},[{kind:'variable',id:'keeper-trust',operation:'set',value:1},{kind:'dialogue',dialogueId:'fear'}]),
    rule('inviting',{type:'signal',source:'invite-keeper'},[{kind:'variable',id:'keeper-trust',operation:'set',value:1}]),
    {...rule('light',{type:'switch',source:'lamp'},[{kind:'objective',objectiveId:'show-light',status:'done'},{kind:'dialogue',dialogueId:'witness'}]),resetGroup:'prison'},
    rule('opening-gate',{type:'signal',source:'open-gate'},[{kind:'objective',objectiveId:'open-valley',status:'active'},{kind:'state',targetId:'exit',property:'enabled',value:true}],{kind:'all',conditions:[{kind:'objective',objectiveId:'show-light',status:'done'},{kind:'variable',id:'keeper-trust',op:'gte',value:1}]}),
    rule('ending',{type:'enter',source:'road',face:0},[{kind:'dialogue',dialogueId:'outro'},{kind:'objective',objectiveId:'open-valley',status:'done'}],{kind:'state',objectId:'exit',property:'enabled',value:true})
  ]};return map;
}
