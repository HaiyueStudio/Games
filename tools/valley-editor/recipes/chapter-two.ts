import type {EditorBatch,EditorCommand,ObjectPatch,ValleyEditorApi} from '../src/api';
import type {TypeId,Vec3,LogicRule} from '../../../games/valley-of-light/map/model';

/** Screenshot-based reconstruction. Hidden routes and the two-step puzzle are authored here. */
export function chapterTwoRecipe():EditorBatch {
  const commands:EditorCommand[]=[{op:'map.create',id:'chapter-two-garden',name:'第二关 · 旋庭（截图重建）'}];
  const stone='#e2dfb4',wall='#b6c59b',grass='#d4e984',dark='#465c44';
  const group=(id:string,name:string,parentId:string|null=null)=>commands.push({op:'group.create',group:{id,name,parentId,pivot:[0,0,0]}});
  group('architecture','庭院建筑');group('garden','草地、花与灌木');group('turntable','同轴双层转桥');group('lower-bridge','下层折桥','turntable');group('upper-bridge','上层折桥','turntable');group('fixed-paths','固定道路');group('pavilions','三座金顶亭');
  const object=(id:string,type:TypeId,position:Vec3,patch:ObjectPatch={})=>commands.push({op:'object.create',object:{id:id.replaceAll('.','_'),type,position,colors:{surface:stone},...patch}});
  const path=(id:string,p:Vec3,patch:ObjectPatch={})=>object(id,1,p,{groupId:'fixed-paths',thickness:.35,...patch});
  const solid=(id:string,p:Vec3,length:number,width:number,thickness:number,surface=wall,patch:ObjectPatch={})=>object(id,1,p,{name:'建筑 · '+id,groupId:'architecture',length:Math.max(.1,length),width:Math.max(.1,width),thickness:Math.max(.1,thickness),colors:{surface},state:{walkable:false},...patch});
  const plant=(id:string,p:Vec3,w:number,h:number,turn=0)=>object(id,14,p,{groupId:'garden',length:w,width:w,rise:h,rotation:[0,turn,0],colors:{surface:'#a9c86e',hub:'#c6d578',base:'#819c59'}});
  // A large low island, with a raised cloister in its center.
  solid('island',[0,-.22,.3],10,9.4,.18,'#e5e79a',{groupId:'garden'});
  solid('cloister',[0,1.2,0],5.6,5.6,1.6,wall);solid('lawn',[0,1.24,0],5.65,5.65,.04,grass,{groupId:'garden'});
  for(const side of [0,1])for(let i=0;i<8;i++){
    const t=-2.35+i*.67;solid(`cloister-window-${side}-${i}`,side?[2.807,.88,t]:[t,.88,2.807],side?.035:.17,side?.17:.035,.91,dark);
    object(`cloister-arch-${side}-${i}`,18,side?[2.83,-.02,t]:[t,-.02,2.83],{groupId:'architecture',length:.38,width:.1,rise:1.12,rotation:[0,side?90:0,0],colors:{surface:stone,hub:stone,base:stone}});
  }
  // Round drum and parapet assembled from standard half-circle paths. They are scenery only.
  for(const side of [0,1])for(const lip of [false,true])object(`drum-${side}-${lip?'rim':'wall'}`,7,[0,lip?2.96:2.84,side?1.2:-1.2],{name:lip?'圆塔檐环':'中央圆塔',groupId:'architecture',radius:1.2,arc:180,width:lip?.3:.18,thickness:lip?.14:1.6,rotation:[0,side?180:0,0],colors:{surface:lip?stone:wall},state:{walkable:false}});
  for(let i=0;i<5;i++){const a=(i*28+12)*Math.PI/180;solid(`drum-window-${i}`,[Math.sin(a)*1.301,1.95,Math.cos(a)*1.301],.13,.035,.52,dark,{rotation:[0,i*28+12,0]});}

  // Front ladder -> right landing. The wheel starts in a disconnected position.
  path('start',[4,0,2.5],{name:'入口石台',thickness:.65,checkpoint:{name:'花园入口',face:0}});path('ladder-foot',[4,0,1.5],{thickness:.65});
  path('entry',[4,3,0],{name:'下层东岸',thickness:3.65});object('entry-ladder',17,[4,0,.5],{name:'入口竖梯',groupId:'fixed-paths',rise:3,steps:12,colors:{surface:dark,hub:wall}});
  path('lower-center',[0,3,0],{name:'圆塔转心'});
  for(let i=1;i<=3;i++){path(`lower-west-${i}`,[-i,3,0],{name:'下层转桥 · 西臂',groupId:'lower-bridge'});path(`lower-south-${i}`,[0,3,i],{name:'下层转桥 · 南臂',groupId:'lower-bridge'});}
  path('south-bank',[0,3,4],{name:'下层南岸'});for(let i=1;i<=2;i++)path(`switch-road-${i}`,[-i,3,4]);
  object('garden-switch',8,[-3,3,4],{name:'庭院开关',groupId:'fixed-paths',thickness:.35,colors:{surface:stone}});
  path('west-pavilion',[-3,6,2.5],{name:'西亭落脚点',checkpoint:{name:'西亭',face:0}});
  object('west-ladder',17,[-3,3,3],{name:'西塔竖梯',groupId:'fixed-paths',rise:3,steps:12,colors:{surface:dark,hub:wall}});
  // The upper deck joins west to north only after the second wheel adjustment.
  path('west-walk',[-3,6,1.25],{width:1.5});path('west-bank',[-3,6,0],{name:'上层西岸'});
  for(let i=1;i<=2;i++){path(`upper-west-${i}`,[-i,6,0],{groupId:'upper-bridge'});path(`upper-north-${i}`,[0,6,-i],{groupId:'upper-bridge'});}
  object('wheel',3,[0,6,0],{name:'双层转桥手轮',groupId:'fixed-paths',thickness:.35,motion:{axis:'y',targetGroup:'turntable',step:90},colors:{surface:stone,hub:'#b8d1b4',spokes:'#ffc14f',tips:'#97b69c',base:'#91ad8c'}});
  path('north-bank',[0,6,-3],{name:'上层北岸'});for(const i of [-2,-1,1,2])path(`north-walk-${i}`,[i,6,-3]);
  path('exit',[-3,6,-3],{name:'归途金亭',state:{enabled:false}});path('east-pavilion',[3,6,-3],{name:'东亭观景台'});
  commands.push({op:'marker.set',id:'start',kind:'spawn'},{op:'marker.set',id:'exit',kind:'exit'});

  // Open tall arches, slim columns, towers and three matching gold roofs.
  solid('east-tower',[3,5.7,-3],1,1,5.95);solid('west-tower-foot',[-3,2.65,2.5],1,1,2.9);
  for(const side of [0,1])object(`west-tall-arch-${side}`,18,[-3,2.7,2.5],{groupId:'architecture',length:1.08,width:.13,rise:2.95,rotation:[0,side?90:0,0],colors:{surface:stone,hub:stone,base:wall}});
  for(const x of [-.38,.38])for(const z of [-.38,.38])object(`axle-pillar-${x}-${z}`,12,[x,3,z],{name:'转心细柱',groupId:'architecture',width:.1,rise:2.68,colors:{surface:wall}});
  for(const [id,x,z] of [['west',-3,2.5],['east',3,-3],['goal',-3,-3]] as const)object(`pavilion-${id}`,13,[x,6,z],{name:id==='goal'?'终点金顶亭':'金顶旗亭',groupId:'pavilions',length:1.4,width:1.4,rise:3.5,rotation:[0,180,0],colors:{surface:'#d4dcba',base:'#b2bd92',hub:'#ffb52c',spokes:'#48bfb3',tips:'#ffc84b'}});
  for(const x of [2.495,3.505])for(const y of [2,4.4])solid(`east-window-${x}-${y}`,[x,y,-3],.035,.18,.65,dark);
  solid('goal-plinth',[-3,5.65,-3],1,1,.55,stone);
  // A repeatable scatter, deliberately clear of all landings and ladders.
  const shrubs:Array<[number,number,number,number]>=[[-4,3.5,.48,1.7],[-4.1,2,.35,2],[-3.8,1,.6,.8],[-2.8,4.8,.4,1.4],[-1.8,4.8,.65,.7],[-.9,4.9,.4,1.5],[.1,4.5,.5,1.3],[1.4,4.3,.42,1.9],[2.3,4.8,.55,.8],[4.3,-2,.55,1.2],[4.2,-.9,.4,1.8],[-4,-2,.42,1.1],[-4.3,-.4,.5,1.5],[3.6,-3.9,.5,.7],[-2.2,1.8,.45,.8],[1.8,1.5,.5,.9],[-1.8,-1.9,.5,1.0]];
  shrubs.forEach(([x,z,w,h],i)=>plant(`shrub-${i}`,[x,Math.abs(x)<2.7&&Math.abs(z)<2.7?1.25:-.12,z],w,h,i*47));
  for(let i=0;i<28;i++){const a=i*2.39996323,r=3.4+(i%4)*.38,x=Math.cos(a)*r,z=Math.sin(a)*r+.15;if(x>2.9&&z>.7&&z<3.1)continue;object(`flowers-${i}`,16,[x,-.11,z],{groupId:'garden',length:.58,width:.58,rise:.13,rotation:[0,i*21,0],colors:{surface:'#fffdf1',hub:'#f5e291',base:grass,spokes:'#9cbe6b'}});}
  for(const [i,p] of [[0,[-1.7,1.26,1.6]],[1,[1.7,1.26,1.6]],[2,[1.5,1.26,-1.7]],[3,[-1.8,1.26,-1.5]]] as const)object(`terrace-flowers-${i}`,16,[...p],{groupId:'garden',length:.75,width:.75,rise:.16});
  const rule=(id:string,event:LogicRule['event'],actions:LogicRule['actions'],condition:LogicRule['condition']={kind:'all',conditions:[]}):LogicRule=>({id,name:id,enabled:true,once:true,event,condition,actions});
  commands.push({op:'map.configure',settings:{appearance:{background:'#fae7a0',ambientIntensity:1.8},logic:{variables:[],rules:[
    rule('intro',{type:'start',source:null},[{kind:'wait',duration:.15},{kind:'message',text:'攀上入口竖梯。绕动中央手轮，将下层折桥接到东岸与南岸。'}]),
    rule('garden-open',{type:'switch',source:'garden-switch'},[{kind:'state',targetId:'exit',property:'enabled',value:true},{kind:'message',text:'西塔已经开放。攀上西塔，再旋转手轮，把上层西岸接向北岸。'}]),
    rule('upper-hint',{type:'enter',source:'west-pavilion',face:0},[{kind:'message',text:'站在固定西亭调节手轮。上层西臂与北臂相接后，前往远处金顶亭。'}])
  ]}}});
  return {apiVersion:1,label:'通过 API 搭建第二关旋庭',commands};
}
export function buildChapterTwo(api:ValleyEditorApi):void {api.apply(chapterTwoRecipe());api.fit();}
