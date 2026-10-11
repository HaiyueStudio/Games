import { button, type HYDialog, type HYInput, type HYSelect, type HYSplit } from './ui';
import type { ValleyAuthoring } from './document';
import { FACE_NAMES, isWalkable, removeLogicReferences, walkSurfaces, type Compare, type EventType, type LogicAction, type LogicCondition, type LogicRule, type LogicValue, type MapRuntime, type StateProperty, type Vec3 } from '../../../games/valley-of-light/map/model';

const node=(tag:string,text='',className=''):HTMLElement=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
const events:Array<[EventType,string]>=[['start','关卡开始'],['enter','进入路径表面'],['leave','离开路径表面'],['switch','踩踏开关'],['portal','传送完成'],['mechanism','拖拽机关松手归位'],['group','物体组动画完成'],['variable','变量变化'],['signal','收到自定义信号'],['checkpoint','检查点保存'],['restore','返回检查点'],['reset','局部重置完成'],['departure','平台出发'],['arrival','平台到站'],['stage','进入场景阶段'],['dialogue','对话结束'],['objective','目标状态改变']];
const properties:Array<[StateProperty,string]>=[['enabled','可用（机关、开关、门、出口）'],['visible','可见'],['walkable','可行走（路径）']];
const comparisons:Array<[Compare,string]>=[['eq','等于'],['ne','不等于'],['gt','大于'],['gte','大于等于'],['lt','小于'],['lte','小于等于']];

/** Every edit goes through the existing document/history, never the live runtime. */
export class LogicUI {
  private selected='';private elapsed=0;
  private dialog=document.getElementById('logic-dialog') as HYDialog;
  constructor(private author:ValleyAuthoring,private runtime:()=>MapRuntime|null,private status:(text:string)=>void){
    document.getElementById('close-logic')!.addEventListener('click',()=>this.dialog.close());
    document.getElementById('logic-undo')!.addEventListener('click',()=>this.edit(()=>this.author.platform.history.undo()));
    document.getElementById('logic-redo')!.addEventListener('click',()=>this.edit(()=>this.author.platform.history.redo()));
    (document.getElementById('logic-layout') as HYSplit).ratio=.28;
  }
  open():void{this.dialog.showModal();this.refresh();}
  private edit(action:()=>void):void{if(this.runtime())return;try{document.getElementById('logic-error')!.textContent='';action();}catch(e){const text=String(e);this.status(text);document.getElementById('logic-error')!.textContent=text;this.refresh();}}
  private btn(text:string,action:()=>void,edit=true):HTMLElement{const b=button(text,()=>edit?this.edit(action):action());b.toggleAttribute('disabled',edit&&!!this.runtime());return b;}
  private field(host:HTMLElement,title:string,input:HTMLElement):void{const f=node('label','','field');input.setAttribute('aria-label',title);f.append(node('span',title),input);host.append(f);}
  private input(value:string|number,change:(value:string)=>void,numeric=false):HYInput{const c=document.createElement('hy-input') as HYInput;c.type=numeric?'number':'text';c.value=String(value);c.disabled=!!this.runtime();if(numeric)c.setAttribute('step','.1');c.addEventListener('value-change',()=>this.edit(()=>change(c.value)));return c;}
  private select(options:Array<[string,string]>,value:string,change:(value:string)=>void):HYSelect{const c=document.createElement('hy-select') as HYSelect;c.options=options.map(([value,label])=>({value,label}));c.value=value;c.disabled=!!this.runtime();c.addEventListener('value-change',()=>this.edit(()=>change(c.value)));return c;}
  private bool(value:boolean,change:(value:boolean)=>void):HYSelect{return this.select([['true','是'],['false','否']],String(value),v=>change(v==='true'));}
  private value(value:LogicValue,change:(value:LogicValue)=>void):HTMLElement{return typeof value==='boolean'?this.bool(value,change):this.input(value,v=>change(Number(v)),true);}
  private objects(filter=(o:typeof this.author.map.objects[number])=>!!o):Array<[string,string]>{return this.author.map.objects.filter(filter).map(o=>[o.id,`${o.name} · ${o.id}`]);}
  private groups():Array<[string,string]>{return this.author.map.groups.map(g=>[g.id,`${g.name} · ${g.id}`]);}
  private platforms():Array<[string,string]>{return this.author.map.groups.filter(g=>g.platform).map(g=>[g.id,g.name]);}
  private stages():Array<[string,string]>{return (this.author.map.stages?.items??[]).map(s=>[s.id,s.name]);}
  private stations(id:string):Array<[string,string]>{return (this.author.map.groups.find(g=>g.id===id)?.platform?.stations??[]).map(s=>[s.id,s.name]);}
  private dialogues():Array<[string,string]>{return (this.author.map.story?.dialogues??[]).map(d=>[d.id,d.name]);}
  private objectives():Array<[string,string]>{return (this.author.map.story?.objectives??[]).map(o=>[o.id,o.name]);}
  private variables():Array<[string,string]>{return (this.author.map.logic?.variables??[]).map(v=>[v.id,`${v.name} · ${v.id}`]);}
  private id(prefix:string):string{const map=this.author.map,ids=new Set([...map.objects,...map.groups,...map.logic?.rules??[],...map.logic?.variables??[],...map.stages?.items??[],...map.story?.dialogues??[],...map.story?.objectives??[]].map(v=>v.id));let n=1;while(ids.has(`${prefix}-${n}`))n++;return `${prefix}-${n}`;}
  private save(rule:LogicRule):void{this.author.change('修改关卡规则',map=>{map.logic!.rules=map.logic!.rules.map(r=>r.id===rule.id?rule:r);});}
  refresh():void{
    if(!this.dialog.open)return;
    for(const id of ['logic-undo','logic-redo'])document.getElementById(id)!.toggleAttribute('disabled',!!this.runtime());
    const list=document.getElementById('logic-list')!,detail=document.getElementById('logic-detail')!;list.replaceChildren();detail.replaceChildren();
    const logic=this.author.map.logic??{variables:[],rules:[]};
    list.append(node('h3','关卡变量'));
    for(const v of logic.variables){const card=node('div','','logic-card');card.dataset.variable=v.id;
      this.field(card,'变量名称',this.input(v.name,name=>this.author.change('修改变量名称',m=>m.logic!.variables.find(x=>x.id===v.id)!.name=name)));
      this.field(card,'类型',this.select([['number','数字'],['boolean','开关']],typeof v.initial,type=>this.author.change('修改变量类型',m=>m.logic!.variables.find(x=>x.id===v.id)!.initial=type==='number'?0:false)));
      this.field(card,'重置归属',this.select([['','全局（局部重置时保留）'],...this.groups()],v.resetGroup??'',id=>this.author.change('设置变量重置归属',m=>{const variable=m.logic!.variables.find(x=>x.id===v.id)!;if(id)variable.resetGroup=id;else delete variable.resetGroup;})));
      this.field(card,'初始值',this.value(v.initial,value=>this.author.change('修改变量初值',m=>m.logic!.variables.find(x=>x.id===v.id)!.initial=value)));
      card.append(node('small',v.id),this.btn('删除变量及依赖规则',()=>this.author.change('删除变量及依赖规则',m=>{m.logic!.variables=m.logic!.variables.filter(x=>x.id!==v.id);removeLogicReferences(m,new Set([v.id]));})));list.append(card);
    }
    const addVar=this.btn('＋ 添加变量',()=>this.author.change('添加关卡变量',m=>{m.logic??={variables:[],rules:[]};m.logic.variables.push({id:this.id('var'),name:'进度',initial:0});}));addVar.id='logic-add-variable';list.append(addVar,node('h3','事件规则'));
    if(!logic.rules.some(r=>r.id===this.selected))this.selected=logic.rules[0]?.id??'';
    for(const r of logic.rules){const b=this.btn(`${r.enabled?'●':'○'} ${r.name}`,()=>{this.selected=r.id;this.refresh();},false);b.className=`wide ${r.id===this.selected?'selected':''}`;b.dataset.rule=r.id;list.append(b);}
    const addRule=this.btn('＋ 添加规则',()=>{const id=this.id('rule');this.selected=id;this.author.change('添加关卡规则',m=>{m.logic??={variables:[],rules:[]};m.logic.rules.push({id,name:'新规则',enabled:true,once:true,event:{type:'start',source:null},condition:{kind:'all',conditions:[]},actions:[{kind:'message',text:'机关已响应。'}]});});});addRule.id='logic-add-rule';list.append(addRule);
    const original=logic.rules.find(r=>r.id===this.selected);if(!original){detail.append(node('p','添加规则后，依次设置事件、条件和动作。','muted'));this.debug();return;}
    const r=structuredClone(original),save=()=>this.save(r),heading=node('div','','row');heading.append(node('h3','规则设置'),this.btn('复制规则',()=>{const copy=structuredClone(r);copy.id=this.id('rule');copy.name=(copy.name+' 副本').slice(0,100);this.selected=copy.id;this.author.change('复制关卡规则',m=>m.logic!.rules.push(copy));}),this.btn('删除规则',()=>this.author.change('删除关卡规则',m=>{m.logic!.rules=m.logic!.rules.filter(x=>x.id!==r.id);removeLogicReferences(m,new Set([r.id]));})));detail.append(heading);
    this.field(detail,'规则名称',this.input(r.name,v=>{r.name=v;save();}));
    this.field(detail,'重置归属',this.select([['','全局（局部重置时保留）'],...this.groups()],r.resetGroup??'',v=>{if(v)r.resetGroup=v;else delete r.resetGroup;save();}));
    const flags=node('div','','grid2');this.field(flags,'启用规则',this.bool(r.enabled,v=>{r.enabled=v;save();}));this.field(flags,'只执行一次',this.bool(r.once,v=>{r.once=v;save();}));detail.append(flags,node('h3','1 · 事件'));
    this.field(detail,'何时触发',this.select(events,r.event.type,v=>{r.event={type:v as EventType,source:v==='signal'?'signal-1':null};save();}));
    if(r.event.type==='signal')this.field(detail,'信号名称（英文、数字、短横线）',this.input(r.event.source??'',v=>{r.event.source=v;save();}));
    else if(r.event.type!=='start'){
      const type=r.event.type,options=type==='dialogue'?this.dialogues():type==='objective'?this.objectives():type==='stage'?this.stages():type==='departure'||type==='arrival'?this.platforms():type==='variable'?this.variables():type==='group'||type==='reset'?this.groups():this.objects(o=>type==='switch'?o.type===8:type==='portal'?o.type===20:type==='mechanism'?[3,4].includes(o.type):isWalkable(o));
      this.field(detail,'事件来源',this.select([['','任意来源'],...options],r.event.source??'',v=>{r.event.source=v||null;delete r.event.face;delete r.event.stationId;delete r.event.choiceId;save();}));
      if(type==='dialogue'&&r.event.source)this.field(detail,'对话选项',this.select([['','任意结尾'],...(this.author.map.story?.dialogues.find(d=>d.id===r.event.source)?.choices??[]).map(c=>[c.id,c.text] as [string,string])],r.event.choiceId??'',v=>{if(v)r.event.choiceId=v;else delete r.event.choiceId;save();}));
      if((type==='departure'||type==='arrival')&&r.event.source)this.field(detail,'站点（出发事件指目的站）',this.select([['','任意站点'],...this.stations(r.event.source)],r.event.stationId??'',v=>{if(v)r.event.stationId=v;else delete r.event.stationId;delete r.event.choiceId;save();}));
      if(type==='enter'||type==='leave'){const o=this.author.map.objects.find(o=>o.id===r.event.source);const faces=o?walkSurfaces(o).map(f=>f.face):[0,1,2,3,4,5,6];this.field(detail,'表面',this.select([['','任意表面'],...faces.map(f=>[String(f),FACE_NAMES[f]!] as [string,string])],r.event.face===undefined?'':String(r.event.face),v=>{if(v==='')delete r.event.face;else r.event.face=Number(v);save();}));}
    }
    detail.append(node('h3','2 · 条件'));this.conditionUI(detail,r.condition,c=>{r.condition=c;save();},save,0);
    detail.append(node('h3','3 · 动作（从上到下执行）'));this.actionsUI(detail,r.actions,save,0);
    detail.append(node('p','条件只在事件发生时判断；未满足时不会消耗“只执行一次”。正在执行的规则不会重复启动。组动画是相对初始姿态的目标偏移。','muted'));this.debug();
  }
  conditionDefault(kind:string):LogicCondition {
    const o=this.author.map.objects;
    if(kind==='dialogue')return {kind:'dialogue',dialogueId:this.dialogues()[0]![0],seen:true};
    if(kind==='objective')return {kind:'objective',objectiveId:this.objectives()[0]![0],status:'done'};
    if(kind==='platform')return {kind:'platform',groupId:this.platforms()[0]![0],stationId:this.stations(this.platforms()[0]![0])[0]![0]};
    if(kind==='stage')return {kind:'stage',stageId:this.stages()[0]![0],status:'active'};
    if(kind==='not')return {kind:'not',condition:{kind:'all',conditions:[]}};
    if(kind==='variable'){const v=this.author.map.logic!.variables[0]!;return {kind:'variable',id:v.id,op:'eq',value:v.initial};}
    if(kind==='switch')return {kind:'switch',objectId:o.find(o=>o.type===8)!.id,value:true};
    if(kind==='state')return {kind:'state',objectId:o[0]!.id,property:'enabled',value:true};
    if(kind==='mechanism')return {kind:'mechanism',objectId:o.find(o=>[3,4].includes(o.type))!.id,op:'eq',value:90};
    return {kind:kind==='any'?'any':'all',conditions:[]};
  }
  conditionUI(host:HTMLElement,c:LogicCondition,replace:(c:LogicCondition)=>void,save:()=>void,depth:number):void{
    const card=node('div','','logic-card condition');host.append(card);
    const options:Array<[string,string]>=[['all','全部满足（空 = 无限制）'],['any','任一满足'],['not','取反']];
    if(this.dialogues().length)options.push(['dialogue','对话是否已读']);if(this.objectives().length)options.push(['objective','旅途目标状态']);
    if(this.platforms().length)options.push(['platform','平台停靠 / 移动']);if(this.stages().length)options.push(['stage','当前 / 已到达阶段']);
    if(this.variables().length)options.push(['variable','变量比较']);if(this.objects(o=>o.type===8).length)options.push(['switch','开关状态']);if(this.objects().length)options.push(['state','物体状态']);if(this.objects(o=>[3,4].includes(o.type)).length)options.push(['mechanism','机关角度 / 位移']);
    this.field(card,'条件类型',this.select(options.filter(([k])=>depth<5||!['all','any','not'].includes(k)||k===c.kind),c.kind,v=>replace(this.conditionDefault(v))));
    if(c.kind==='all'||c.kind==='any'){
      c.conditions.forEach((child,i)=>{const wrap=node('div','','logic-child');card.append(wrap);this.conditionUI(wrap,child,v=>{c.conditions[i]=v;save();},save,depth+1);wrap.append(this.btn('移除条件',()=>{c.conditions.splice(i,1);save();}));});
      if(depth<5)card.append(this.btn('＋ 条件',()=>{c.conditions.push(this.conditionDefault(this.variables().length?'variable':'all'));save();}));return;
    }
    if(c.kind==='not'){this.conditionUI(card,c.condition,v=>{c.condition=v;save();},save,depth+1);return;}
    if(c.kind==='dialogue'){this.field(card,'对话',this.select(this.dialogues(),c.dialogueId,v=>{c.dialogueId=v;save();}));this.field(card,'已读',this.bool(c.seen,v=>{c.seen=v;save();}));return;}
    if(c.kind==='objective'){this.field(card,'旅途目标',this.select(this.objectives(),c.objectiveId,v=>{c.objectiveId=v;save();}));this.field(card,'目标状态',this.select([['hidden','隐藏'],['active','进行中'],['done','已完成']],c.status,v=>{c.status=v as typeof c.status;save();}));return;}
    if(c.kind==='platform'){this.field(card,'移动平台',this.select(this.platforms(),c.groupId,v=>{c.groupId=v;c.stationId=null;save();}));this.field(card,'停靠站点',this.select([['','正在移动（含暂停途中）'],...this.stations(c.groupId)],c.stationId??'',v=>{c.stationId=v||null;save();}));return;}
    if(c.kind==='stage'){this.field(card,'场景阶段',this.select(this.stages(),c.stageId,v=>{c.stageId=v;save();}));this.field(card,'阶段条件',this.select([['active','当前阶段'],['visited','曾经到达']],c.status,v=>{c.status=v as 'active'|'visited';save();}));return;}
    if(c.kind==='variable')this.field(card,'变量',this.select(this.variables(),c.id,v=>{c.id=v;c.value=this.author.map.logic!.variables.find(x=>x.id===v)!.initial;c.op='eq';save();}));
    else this.field(card,'目标物体',this.select(this.objects(o=>c.kind==='switch'?o.type===8:c.kind==='mechanism'?[3,4].includes(o.type):true),c.objectId,v=>{c.objectId=v;save();}));
    if(c.kind==='state')this.field(card,'状态属性',this.select(properties,c.property,v=>{c.property=v as StateProperty;save();}));
    if(c.kind==='variable'||c.kind==='mechanism')this.field(card,'比较',this.select(typeof c.value==='boolean'?comparisons.slice(0,2):comparisons,c.op,v=>{c.op=v as Compare;save();}));
    this.field(card,'期望值',this.value(c.value,v=>{c.value=v as never;save();}));
  }
  private actionDefault(kind:string):LogicAction {
    if(kind==='dialogue')return {kind:'dialogue',dialogueId:this.dialogues()[0]![0]};
    if(kind==='objective')return {kind:'objective',objectiveId:this.objectives()[0]![0],status:'active'};
    if(kind==='platform')return {kind:'platform',groupId:this.platforms()[0]![0],command:'go',stationId:this.stations(this.platforms()[0]![0])[0]![0]};
    if(kind==='stage')return {kind:'stage',stageId:this.stages()[0]![0]};
    if(kind==='variable'){const v=this.author.map.logic!.variables[0]!;return {kind:'variable',id:v.id,operation:'set',value:v.initial};}
    if(kind==='state')return {kind:'state',targetId:this.author.map.objects[0]?.id??this.author.map.groups[0]!.id,property:'enabled',value:true};
    if(kind==='move')return {kind:'move',groupId:this.author.map.groups[0]!.id,translation:[0,0,0],rotation:[0,0,0],duration:1,easing:'smooth'};
    if(kind==='sequence'||kind==='parallel')return {kind,actions:[]};
    if(kind==='wait')return {kind:'wait',duration:1};if(kind==='signal')return {kind:'signal',name:'signal-1'};
    if(kind==='checkpoint')return {kind:'checkpoint',name:'旅途灯塔'};if(kind==='restore')return {kind:'restore'};if(kind==='reset')return {kind:'reset',groupId:this.author.map.groups[0]!.id,returnPlayer:true};
    if(kind==='rule')return {kind:'rule',ruleId:this.author.map.logic!.rules[0]!.id,enabled:true};
    return {kind:'message',text:'机关已响应。'};
  }
  private actionsUI(host:HTMLElement,actions:LogicAction[],save:()=>void,depth:number):void{
    actions.forEach((a,i)=>{const card=node('div','','logic-card action');card.dataset.action=String(i);host.append(card);
      const row=node('div','','row');row.append(node('b',`${i+1}`));
      if(i)row.append(this.btn('↑',()=>{[actions[i-1],actions[i]]=[actions[i]!,actions[i-1]!];save();}));if(i<actions.length-1)row.append(this.btn('↓',()=>{[actions[i],actions[i+1]]=[actions[i+1]!,actions[i]!];save();}));row.append(this.btn('移除动作',()=>{actions.splice(i,1);save();}));card.append(row);
      const options:Array<[string,string]>=[['message','显示提示'],['wait','等待'],['signal','发送信号'],['rule','启停规则'],['checkpoint','保存检查点'],['restore','返回检查点（整体恢复）']];
      if(this.dialogues().length)options.push(['dialogue','播放对话（等待结束）']);if(this.objectives().length)options.push(['objective','设置旅途目标']);
      if(this.platforms().length)options.push(['platform','平台运行 / 呼叫']);if(this.stages().length)options.push(['stage','切换场景阶段']);
      if(depth<5)options.push(['sequence','顺序执行'],['parallel','并行执行']);if(this.variables().length)options.push(['variable','修改变量']);if(this.objects().length||this.groups().length)options.push(['state','设置物体 / 组状态']);if(this.groups().length)options.push(['move','物体组位移 / 旋转'],['reset','局部重置']);
      this.field(card,'动作类型',this.select(options,a.kind,v=>{actions[i]=this.actionDefault(v);save();}));
      if(a.kind==='sequence'||a.kind==='parallel'){this.actionsUI(card,a.actions,save,depth+1);return;}
      if(a.kind==='dialogue')this.field(card,'播放对话',this.select(this.dialogues(),a.dialogueId,v=>{a.dialogueId=v;save();}));
      else if(a.kind==='objective'){this.field(card,'旅途目标',this.select(this.objectives(),a.objectiveId,v=>{a.objectiveId=v;save();}));this.field(card,'目标状态',this.select([['hidden','隐藏'],['active','进行中'],['done','已完成']],a.status,v=>{a.status=v as typeof a.status;save();}));}
      else if(a.kind==='platform'){this.field(card,'移动平台',this.select(this.platforms(),a.groupId,v=>{a.groupId=v;a.stationId=a.command==='go'?this.stations(v)[0]![0]:null;save();}));this.field(card,'平台指令',this.select([['go','前往站点（等待到站）'],['pause','暂停'],['resume','继续运行']],a.command,v=>{a.command=v as typeof a.command;a.stationId=v==='go'?this.stations(a.groupId)[0]![0]:null;save();}));if(a.command==='go')this.field(card,'目的站',this.select(this.stations(a.groupId),a.stationId!,v=>{a.stationId=v;save();}));}
      else if(a.kind==='stage')this.field(card,'场景阶段',this.select(this.stages(),a.stageId,v=>{a.stageId=v;save();}));
      else if(a.kind==='checkpoint')this.field(card,'检查点名称',this.input(a.name,v=>{a.name=v;save();}));
      else if(a.kind==='restore')card.append(node('p','恢复最近检查点的角色、机关、变量与规则任务；没有检查点时回到起点。此动作结束当前规则执行。','muted'));
      else if(a.kind==='reset'){this.field(card,'重置区域（父节点）',this.select(this.groups(),a.groupId,v=>{a.groupId=v;save();}));this.field(card,'角色返回检查点',this.bool(a.returnPlayer,v=>{a.returnPlayer=v;save();}));card.append(node('p','重置该节点及后代、关联机关和开关。变量与规则按「重置归属」恢复初始值；其他区域保持当前状态。','muted'));}
      else if(a.kind==='message')this.field(card,'提示文字',this.input(a.text,v=>{a.text=v;save();}));
      else if(a.kind==='signal')this.field(card,'信号名称',this.input(a.name,v=>{a.name=v;save();}));
      else if(a.kind==='wait')this.field(card,'等待秒数',this.input(a.duration,v=>{a.duration=Number(v);save();},true));
      else if(a.kind==='rule'){this.field(card,'目标规则',this.select((this.author.map.logic?.rules??[]).map(r=>[r.id,r.name]),a.ruleId,v=>{a.ruleId=v;save();}));this.field(card,'启用',this.bool(a.enabled,v=>{a.enabled=v;save();}));}
      else if(a.kind==='variable'){
        this.field(card,'变量',this.select(this.variables(),a.id,v=>{a.id=v;a.value=this.author.map.logic!.variables.find(x=>x.id===v)!.initial;a.operation='set';save();}));
        this.field(card,'操作',this.select([['set','设置'],typeof a.value==='number'?['add','增减']:['toggle','切换']],a.operation,v=>{a.operation=v as typeof a.operation;save();}));
        if(a.operation!=='toggle')this.field(card,'值',this.value(a.value,v=>{a.value=v;save();}));
      }else if(a.kind==='state'){
        this.field(card,'目标物体 / 父节点',this.select([...this.objects(),...this.groups().map(([id,name])=>[id,`组 · ${name}`] as [string,string])],a.targetId,v=>{a.targetId=v;save();}));this.field(card,'状态属性',this.select(properties,a.property,v=>{a.property=v as StateProperty;save();}));this.field(card,'设为',this.bool(a.value,v=>{a.value=v;save();}));
      }else if(a.kind==='move'){
        this.field(card,'目标组',this.select(this.groups(),a.groupId,v=>{a.groupId=v;save();}));
        for(const [key,title] of [['translation','目标位移'],['rotation','目标旋转（度）']] as const){const vector=node('div','','triple');for(let j=0;j<3;j++)this.field(vector,['X','Y','Z'][j]!,this.input(a[key][j]!,v=>{const next:Vec3=[...a[key]];next[j]=Number(v);a[key]=next;save();},true));this.field(card,title,vector);}
        this.field(card,'动画秒数',this.input(a.duration,v=>{a.duration=Number(v);save();},true));this.field(card,'缓动',this.select([['smooth','平滑'],['linear','匀速']],a.easing,v=>{a.easing=v as typeof a.easing;save();}));
      }
    });if(depth<6)host.append(this.btn('＋ 动作',()=>{actions.push({kind:'message',text:'机关已响应。'});save();}));
  }
  tick(dt:number):void{this.elapsed+=dt;if(this.elapsed>.2){this.elapsed=0;this.debug();}}
  private debug():void{
    if(!this.dialog.open)return;const host=document.getElementById('logic-debug')!,runtime=this.runtime();host.replaceChildren();
    host.append(node('h3',runtime?'试玩 · 实时状态':'调试说明'));
    if(!runtime){host.append(node('p','试玩时打开此面板，可查看变量值、执行次数与最近的条件判断。停止试玩后恢复编辑。删除目标节点、变量或规则时，会同时删除依赖它们的规则；可撤销。','muted'));return;}
    host.append(node('div',runtime.checkpointInfo?`最近检查点：${runtime.checkpointInfo.name}`:'尚无检查点，恢复将回到起点'));
    host.append(node('div',`当前阶段：${runtime.currentStage?.name??'未分阶段'}`));for(const g of runtime.map.groups.filter(g=>g.platform)){const p=runtime.poses.platforms?.[g.id];host.append(node('div',`${g.name}：${p?.targetId?'移动至 '+p.targetId:'停靠 '+p?.stationId}${p?.paused?'（暂停）':''}`));}
    const runner=runtime.logic;if(runner.error)host.append(node('p',runner.error,'logic-error'));
    for(const v of runtime.map.logic?.variables??[])host.append(node('div',`${v.name}：${runner.variables[v.id]}`));
    for(const r of runtime.map.logic?.rules??[])host.append(node('div',`${r.name}：${runner.enabled[r.id]?'启用':'停用'} · 已执行 ${runner.counts[r.id]??0} 次`));
    for(const entry of runner.recent.slice(-8).reverse()){const name=runtime.map.logic!.rules.find(r=>r.id===entry.rule)!.name;host.append(node('small',`${name} · ${events.find(([t])=>t===entry.event.type)?.[1]} · ${entry.passed?'条件满足':'条件未满足'}`));}
  }
}
