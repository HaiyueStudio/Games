import type {EditorBatch,EditorCommand,ObjectPatch} from '../src/api';
import {rotate,add,type Vec3,type LogicRule} from '../../../games/valley-of-light/map/model';

export interface MonumentSource {
  format:'mixandjam-monument-scene';version:1;
  source:{repository:string;scene:string;sha256:string;license:string;copyright:string;retrieved:string};
  spawn:Vec3;camera:{position:Vec3;rotation:Vec3};
  pivots:Array<{id:string;name:string;position:Vec3;rotation:Vec3}>;
  paths:Array<{componentId:string;id:string;name:string;parentId:string;position:Vec3;rotation:Vec3;scale:Vec3;stair:boolean;button:boolean;moving:boolean;walkOffset:number;stairOffset:number;paths:Array<{target:string;active:boolean}>}>;
  conditions:Array<{name:string;angles:Array<{pivotId:string;rotation:Vec3}>;edges:Array<{from:string;to:string}>}>;
}
export const sourcePathId=(p:MonumentSource['paths'][number])=>'mv-'+(p.name==='x'?'hidden-'+p.id:p.name);
const mirror=([x,y,z]:Vec3):Vec3=>[x,y,-z];
/** Convert the published navigation layout; scenery is rebuilt with editable catalog pieces. */
export function mixAndJamRecipe(data:MonumentSource):EditorBatch {
  if(data.format!=='mixandjam-monument-scene'||data.version!==1||data.paths.length!==31||data.pivots.length!==2||data.conditions.length!==7)throw new Error('不支持的来源场景，请先重新提取和审核。');
  const center=data.pivots.find(p=>p.name==='CenterPivot')!,right=data.pivots.find(p=>p.name==='RightPivot')!;
  const commands:EditorCommand[]=[{op:'map.create',id:'mixandjam-monument',name:'错视旋塔 · 开源场景转换'}];
  for(const [id,name,position] of [['source-center','中央载人转台',mirror(center.position)],['source-right','开关翻折桥',mirror(right.position)],['fixed','来源固定道路',[0,0,0]],['scenery','补建塔身与装饰',[0,0,0]]] as const)commands.push({op:'group.create',group:{id,name,position:[...position],pivot:[0,0,0]}});
  const stone='#e5e1c9',wall='#9cb8b5';
  const put=(id:string,type:1|3|8|11|12|13|18|19,position:Vec3,patch:ObjectPatch={})=>commands.push({op:'object.create',object:{id,type,position,colors:{surface:stone},...patch}});
  for(const p of data.paths){
    if(p.scale.some(v=>v!==1)||p.paths.some(e=>!data.paths.some(p=>p.id===e.target)))throw new Error('来源路径缩放或引用无效。');
    const rotation:Vec3=[-p.rotation[0],-p.rotation[1],p.rotation[2]],groupId=p.parentId===center.id?'source-center':p.parentId===right.id?'source-right':'fixed';
    // Unity cubes use their solid center. Valley cubes use the rotated top-face center.
    const position=add(mirror(p.position),rotate([0,p.walkOffset,0],rotation));
    const o:{id:string;type:1|2|8}&ObjectPatch={id:sourcePathId(p),name:p.button?'翻折桥开关':p.name==='18final'?'终点高台':`来源路径 ${p.name}`,type:p.stair?2:p.button?8:1,position,rotation,groupId,colors:{surface:stone}};
    if(p.stair){o.position=[p.position[0],p.position[1]-.5,-p.position[2]];o.rotation=[0,p.rotation[1]===-90?180:90,0];o.length=1;o.rise=1;o.steps=4;o.thickness=.3;}
    if(p.name==='x')o.state={walkable:false};
    if(p.name==='16')o.state={visible:false,walkable:false};
    if(p.button)o.trigger={mode:'once',actions:[{groupId:'source-right',translation:[0,0,0],rotation:[0,0,90],duration:1.2,easing:'smooth'}]};
    commands.push({op:'object.create',object:o});
  }
  // Source PlayerController starts on path 1. Its source exit is named 18final.
  const spawn=data.paths.find(p=>!p.stair&&Math.hypot(p.position[0]-data.spawn[0],p.position[1]+p.walkOffset-data.spawn[1],p.position[2]-data.spawn[2])<.01);
  if(!spawn)throw new Error('出生位置没有对应来源路径。');
  commands.push({op:'marker.set',id:sourcePathId(spawn),kind:'spawn'},{op:'marker.set',id:'mv-18final',kind:'exit'});
  put('source-wheel',3,[0,14.15,0],{name:'载人转台手轮',thickness:.4,motion:{axis:'y',step:90,targetGroup:'source-center',carryRider:true},colors:{surface:stone,hub:'#679d9c',spokes:'#e9c775',tips:'#699fa1',base:wall}});
  const solid=(id:string,p:Vec3,l:number,w:number,h:number,color=wall)=>put(id,1,p,{name:'塔身 · '+id,groupId:'scenery',length:l,width:w,thickness:h,colors:{surface:color},state:{walkable:false}});
  solid('foundation',[-.5,-.55,0],10,9,.65,'#b1c4b6');
  solid('left-tower',[-4,6,0],1,1,6.5);solid('right-tower',[4,6,0],1,1,6.5);
  solid('middle-pier',[0,5.95,-4],1,1,6.45);solid('middle-arm',[0,5.95,-5],1,3,.7);
  // Two narrow arches support the final block without hiding the stairs below it.
  for(const [id,p,r] of [['end-arch-a',[-4,6.5,0],0],['end-arch-b',[-4,6.5,0],90]] as const)put(id,18,[...p],{groupId:'scenery',length:1.05,width:.12,rise:6.45,rotation:[0,r,0],colors:{surface:wall}});
  solid('drum',[0,4.95,0],1.7,1.7,5.5);
  for(const x of [-.42,.42])for(const z of [-.42,.42])put(`axle-${x<0?'l':'r'}-${z<0?'n':'s'}`,12,[x,0,z],{groupId:'source-center',width:.11,rise:8.7,colors:{surface:wall}});
  for(const p of data.paths.filter(p=>p.stair))solid('stair-support-'+p.name,[p.position[0],p.position[1]-.5,-p.position[2]],1,1,Math.max(.1,p.position[1]),'#b6c7bc');
  put('finish-gate',19,[-4,13.5,0],{groupId:'scenery',length:.82,width:.15,rise:1.7,colors:{surface:'#e8d8a4',hub:'#7bbfba'}});
  put('sea',11,[0,-1.3,-.6],{groupId:'scenery',length:20,width:19,colors:{surface:'#6aafbb'},water:{amplitude:.035,speed:.35,wavelength:5}});
  const rule=(id:string,event:LogicRule['event'],actions:LogicRule['actions']):LogicRule=>({id,name:id,enabled:true,once:true,event,condition:{kind:'all',conditions:[]},actions});
  commands.push({op:'map.configure',settings:{appearance:{background:'#d9ebe5',ambientIntensity:1.4},opticalLinks:[{a:'mv-p3',aEnd:0,b:'mv-u_1',bEnd:1}],logic:{variables:[],rules:[
    rule('source-intro',{type:'start',source:null},[{kind:'message',text:'沿台阶上到左岸。手轮转到 90° 接住下层桥，站上桥后继续转动。'}]),
    rule('source-unfold',{type:'switch',source:'mv-17button'},[{kind:'wait',duration:1.2},{kind:'state',targetId:'mv-16',property:'visible',value:true},{kind:'state',targetId:'mv-16',property:'walkable',value:true},{kind:'message',text:'翻折桥已展开。乘转台回到中间长廊，在默认视角下寻找上层的错视接缝。'}]),
    rule('source-top',{type:'enter',source:'mv-u_1',face:0},[{kind:'message',text:'你已跨过错视接缝。留在上层转台，转到 180° 后前往终点。'}])
  ]}}});
  return {apiVersion:1,label:'转换 Mix and Jam 开源关卡数据',commands};
}
