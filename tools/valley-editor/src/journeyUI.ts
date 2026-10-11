import {button,type HYDialog,type HYInput,type HYSelect} from './ui';
import type {ValleyAuthoring} from './document';
import {canMarkPath,defaultPlatform,defaultStageCamera,FACE_NAMES,flattenActions,removeLogicReferences,walkSurfaces,type MapStage,type MapRuntime,type StageCamera,type ValleyMap,type Vec3} from '../../../games/valley-of-light/map/model';

const node=(tag:string,text='',className=''):HTMLElement=>{const e=document.createElement(tag);e.textContent=text;e.className=className;return e;};
/** Platform stations belong to their parent node; stage membership is map-level data. */
export class JourneyUI {
  private dialog=document.getElementById('journey-dialog') as HYDialog;
  private selected='';
  constructor(private author:ValleyAuthoring,private runtime:()=>MapRuntime|null,private camera:()=>StageCamera,private preview:(camera:StageCamera)=>void){
    document.getElementById('close-journey')!.addEventListener('click',()=>this.dialog.close());
    document.getElementById('journey-undo')!.addEventListener('click',()=>this.edit(()=>this.author.platform.history.undo()));
    document.getElementById('journey-redo')!.addEventListener('click',()=>this.edit(()=>this.author.platform.history.redo()));
  }
  open(group?:string):void{if(group)this.selected=group;this.dialog.showModal();this.refresh();}
  private edit(fn:()=>void):void{if(this.runtime())return;try{document.getElementById('journey-error')!.textContent='';fn();}catch(e){document.getElementById('journey-error')!.textContent=String(e);}this.refresh();}
  private change(fn:(map:ValleyMap)=>void):void{this.edit(()=>this.author.change('修改平台与场景阶段',fn));}
  private btn(text:string,fn:()=>void):HTMLElement{const e=button(text,()=>this.edit(fn));e.toggleAttribute('disabled',!!this.runtime());return e;}
  private field(host:HTMLElement,label:string,control:HTMLElement):void{control.setAttribute('aria-label',label);const e=node('label','','field');e.append(node('span',label),control);host.append(e);}
  private input(value:string|number,fn:(v:string)=>void):HYInput{const e=document.createElement('hy-input') as HYInput;e.type=typeof value==='number'?'number':'text';e.value=String(value);e.disabled=!!this.runtime();e.setAttribute('step','any');e.addEventListener('input',()=>{document.getElementById('journey-error')!.textContent='';});e.addEventListener('value-change',()=>this.edit(()=>fn(e.value)));return e;}
  private select(options:Array<[string,string]>,value:string,fn:(v:string)=>void):HYSelect{const e=document.createElement('hy-select') as HYSelect;e.options=options.map(([value,label])=>({value,label}));e.value=value;e.disabled=!!this.runtime();e.addEventListener('value-change',()=>this.edit(()=>fn(e.value)));return e;}
  private vector(host:HTMLElement,label:string,value:Vec3,fn:(v:Vec3)=>void):void{const row=node('div','','triple');value.forEach((n,i)=>this.field(row,`${label} ${['X','Y','Z'][i]}`,this.input(n,v=>{const next:Vec3=[...value];next[i]=Number(v);fn(next);})));host.append(row);}
  private id(prefix:string):string{const m=this.author.map,used=[...m.groups,...m.objects,...m.logic?.variables??[],...m.logic?.rules??[],...m.stages?.items??[],...m.story?.dialogues??[],...m.story?.objectives??[]].map(x=>x.id);let i=1;while(used.includes(`${prefix}-${i}`))i++;return `${prefix}-${i}`;}
  private prunePlatform(map:ValleyMap,id:string,stationId?:string):void{
    if(!map.logic)return;const ids=new Set<string>();const condition=(c:typeof map.logic.rules[number]['condition']):boolean=>c.kind==='all'||c.kind==='any'?c.conditions.some(condition):c.kind==='not'?condition(c.condition):c.kind==='platform'&&c.groupId===id&&(!stationId||c.stationId===stationId);
    map.logic.rules=map.logic.rules.filter(r=>{const used=condition(r.condition)||['departure','arrival'].includes(r.event.type)&&r.event.source===id&&(!stationId||r.event.stationId===stationId)||flattenActions(r.actions).some(a=>a.kind==='platform'&&a.groupId===id&&(!stationId||a.stationId===stationId));if(used)ids.add(r.id);return !used;});removeLogicReferences(map,ids);
  }
  refresh():void{
    if(!this.dialog.open)return;const platforms=document.getElementById('journey-platforms')!,stages=document.getElementById('journey-stages')!;platforms.replaceChildren();stages.replaceChildren();
    for(const id of ['journey-undo','journey-redo'])document.getElementById(id)!.toggleAttribute('disabled',!!this.runtime());
    this.platformUI(platforms);this.stagesUI(stages);
  }
  private platformUI(host:HTMLElement):void{
    const map=this.author.map;if(!map.groups.length){host.append(node('p','先把平台的路径和装饰物编组，再配置站点。','muted'));return;}
    if(!map.groups.some(g=>g.id===this.selected))this.selected=map.groups[0]!.id;
    this.field(host,'平台父节点',this.select(map.groups.map(g=>[g.id,g.name]),this.selected,v=>{this.selected=v;this.refresh();}));
    const g=map.groups.find(g=>g.id===this.selected)!;const update=(fn:(p:NonNullable<typeof g.platform>)=>void)=>this.change(m=>fn(m.groups.find(x=>x.id===g.id)!.platform!));
    this.field(host,'作为移动平台',this.select([['false','否'],['true','是']],String(!!g.platform),v=>this.change(m=>{const next=m.groups.find(x=>x.id===g.id)!;if(v==='true')next.platform=defaultPlatform();else{delete next.platform;this.prunePlatform(m,g.id);}})));
    if(!g.platform)return;const p=g.platform;
    this.field(host,'运行方式',this.select([['manual','事件呼叫'],['pingpong','往返运行'],['loop','循环运行']],p.mode,v=>update(p=>p.mode=v as typeof p.mode)));
    this.field(host,'进入关卡自动运行',this.select([['false','否'],['true','是']],String(p.autoStart),v=>update(p=>p.autoStart=v==='true')));
    this.field(host,'初始站点',this.select(p.stations.map(s=>[s.id,s.name]),p.initialStation,v=>update(p=>p.initialStation=v)));
    host.append(node('p','站点坐标是相对父节点初始姿态的位移与旋转。平台停靠时上下客，途中暂停也不会连接外部道路。暂停、继续、呼叫及到站后的处理在「事件与动作」配置。','muted'));
    for(const stop of p.stations){const card=node('div','','logic-card');card.dataset.station=stop.id;host.append(card);const change=(fn:(s:typeof stop)=>void)=>update(p=>fn(p.stations.find(s=>s.id===stop.id)!));
      this.field(card,'站点名称',this.input(stop.name,v=>change(s=>s.name=v)));this.vector(card,'位移',stop.translation,v=>change(s=>s.translation=v));this.vector(card,'旋转',stop.rotation,v=>change(s=>s.rotation=v));
      this.field(card,'到达此站用时（秒）',this.input(stop.duration,v=>change(s=>s.duration=Number(v))));this.field(card,'停站时间（秒）',this.input(stop.wait,v=>change(s=>s.wait=Number(v))));
      if(p.stations.length>2)card.append(this.btn('删除站点及依赖规则',()=>this.change(m=>{const p=m.groups.find(x=>x.id===g.id)!.platform!;p.stations=p.stations.filter(s=>s.id!==stop.id);if(p.initialStation===stop.id)p.initialStation=p.stations[0]!.id;this.prunePlatform(m,g.id,stop.id);})));card.append(node('small',stop.id,'muted'));
    }
    if(p.stations.length<16)host.append(this.btn('＋ 站点',()=>update(p=>{let i=1;while(p.stations.some(s=>s.id===`station-${i}`))i++;p.stations.push({...structuredClone(p.stations.at(-1)!),id:`station-${i}`,name:`站点 ${i}`});})));
  }
  private stagesUI(host:HTMLElement):void{
    const map=this.author.map,items=map.stages?.items??[];
    host.append(node('p','未加入任何阶段的物体组始终保留。每个阶段列出要显示的区域，可包含之前区域。切换动作等待角色当前行走段和传送完成；若隐藏脚下道路，需要设置有效入口。','muted'));
    if(map.stages)this.field(host,'初始阶段',this.select(items.map(s=>[s.id,s.name]),map.stages.initial,v=>this.change(m=>m.stages!.initial=v)));
    for(const stage of items){const card=node('div','','logic-card');card.dataset.stage=stage.id;host.append(card);const change=(fn:(s:MapStage)=>void)=>this.change(m=>fn(m.stages!.items.find(s=>s.id===stage.id)!));
      this.field(card,'阶段名称',this.input(stage.name,v=>change(s=>s.name=v)));
      for(const id of stage.groups)card.append(this.btn(`移除显示区域 · ${map.groups.find(g=>g.id===id)!.name}`,()=>change(s=>s.groups=s.groups.filter(g=>g!==id))));
      this.field(card,'加入显示区域',this.select([['','选择父节点'],...map.groups.filter(g=>!stage.groups.includes(g.id)).map(g=>[g.id,g.name] as [string,string])],'',v=>{if(v)change(s=>s.groups.push(v));}));
      this.field(card,'阶段入口',this.select([['','保留角色所在位置'],...map.objects.filter(canMarkPath).map(o=>[o.id,`${o.name} · ${o.id}`] as [string,string])],stage.entry?.objectId??'',v=>change(s=>{s.entry=v?{objectId:v,face:walkSurfaces(map.objects.find(o=>o.id===v)!)[0]!.face}:null;})));
      if(stage.entry)this.field(card,'入口表面',this.select(walkSurfaces(map.objects.find(o=>o.id===stage.entry!.objectId)!).map(f=>[String(f.face),FACE_NAMES[f.face]!] as [string,string]),String(stage.entry.face),v=>change(s=>s.entry!.face=Number(v))));
      this.field(card,'阶段镜头',this.select([['false','保留当前镜头'],['true','指定镜头']],String(!!stage.camera),v=>change(s=>s.camera=v==='true'?defaultStageCamera():null)));
      if(stage.camera){const camera=stage.camera;this.vector(card,'镜头目标',camera.target,v=>change(s=>s.camera!.target=v));
        for(const [key,label] of [['yaw','水平角度'],['pitch','俯视角度'],['span','可见高度（格）'],['duration','切换用时（秒）']] as const)this.field(card,label,this.input(camera[key],v=>change(s=>s.camera![key]=Number(v))));
        this.field(card,'锁定镜头',this.select([['true','是'],['false','否']],String(camera.lock),v=>change(s=>s.camera!.lock=v==='true')));
        card.append(this.btn('使用当前视角',()=>change(s=>s.camera={...this.camera(),duration:camera.duration,lock:camera.lock})),this.btn('预览镜头',()=>this.preview(camera)));
      }
      card.append(this.btn('删除阶段及依赖规则',()=>this.change(m=>{m.stages!.items=m.stages!.items.filter(s=>s.id!==stage.id);if(!m.stages!.items.length)delete m.stages;else if(m.stages!.initial===stage.id)m.stages!.initial=m.stages!.items[0]!.id;removeLogicReferences(m,new Set([stage.id]));})),node('small',stage.id,'muted'));
    }
    if(items.length<32)host.append(this.btn('＋ 场景阶段',()=>this.change(m=>{const id=this.id('stage');m.stages??={initial:id,items:[]};m.stages.items.push({id,name:`阶段 ${m.stages.items.length+1}`,groups:[],entry:null,camera:null});})));
  }
}
