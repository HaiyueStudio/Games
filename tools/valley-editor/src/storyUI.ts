import {button,type HYDialog,type HYInput,type HYSelect} from './ui';
import type {ValleyAuthoring} from './document';
import type {LogicUI} from './logicUI';
import {removeLogicReferences,type MapRuntime,type MapStory,type StoryDialogue,type StoryObjective} from '../../../games/valley-of-light/map/model';
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
export class StoryUI {
  private dialog=document.getElementById('story-dialog') as HYDialog;private selected='';
  constructor(private author:ValleyAuthoring,private runtime:()=>MapRuntime|null,private logic:LogicUI){document.getElementById('close-story')!.onclick=()=>this.dialog.close();document.getElementById('story-undo')!.onclick=()=>this.edit(()=>this.author.platform.history.undo());document.getElementById('story-redo')!.onclick=()=>this.edit(()=>this.author.platform.history.redo());}
  open():void{this.dialog.showModal();this.refresh();}
  private edit(fn:()=>void):void{if(this.runtime())return;try{document.getElementById('story-error')!.textContent='';fn();}catch(e){document.getElementById('story-error')!.textContent=String(e);}this.refresh();}
  private change(fn:(s:MapStory)=>void):void{this.edit(()=>this.author.change('编辑剧情',m=>{m.story??={dialogues:[],objectives:[]};fn(m.story);removeLogicReferences(m,new Set());}));}
  private id(prefix:string):string{const m=this.author.map,ids=[...m.objects,...m.groups,...m.logic?.variables??[],...m.logic?.rules??[],...m.stages?.items??[],...m.story?.dialogues??[],...m.story?.objectives??[]].map(x=>x.id);let i=1;while(ids.includes(`${prefix}-${i}`))i++;return `${prefix}-${i}`;}
  private btn(text:string,fn:()=>void,readonly=false):HTMLElement{const b=button(text,()=>readonly?fn():this.edit(fn));b.toggleAttribute('disabled',!!this.runtime()&&!readonly);return b;}
  private field(host:HTMLElement,label:string,value:string,change:(v:string)=>void,options?:Array<[string,string]>):void{const row=node('label','','field'),e=document.createElement(options?'hy-select':'hy-input') as HYSelect|HYInput;if(options)(e as HYSelect).options=options.map(([value,label])=>({value,label}));e.value=value;e.disabled=!!this.runtime();e.setAttribute('aria-label',label);e.addEventListener('value-change',()=>this.edit(()=>change(e.value)));row.append(node('span',label),e);host.append(row);}
  refresh():void {
    if(!this.dialog.open)return;const list=document.getElementById('story-list')!,detail=document.getElementById('story-detail')!,story=this.author.map.story??{dialogues:[],objectives:[]};list.replaceChildren();detail.replaceChildren();
    for(const id of ['story-undo','story-redo'])document.getElementById(id)!.toggleAttribute('disabled',!!this.runtime());
    list.append(node('h3','对话'));for(const d of story.dialogues)list.append(this.btn(d.name,()=>{this.selected=d.id;this.refresh();},true));const add=this.btn('＋ 对话',()=>{const id=this.id('dialogue');this.selected=id;this.change(s=>s.dialogues.push({id,name:'新对话',speaker:'微',lines:['地图之外，还有什么？'],choices:[]}));});add.id='story-add-dialogue';list.append(add,node('h3','旅途目标'));for(const o of story.objectives)list.append(this.btn(o.name,()=>{this.selected=o.id;this.refresh();},true));const addObjective=this.btn('＋ 目标',()=>{const id=this.id('objective');this.selected=id;this.change(s=>s.objectives.push({id,name:'新的目标',description:'去看看山谷之外的世界。',initial:'hidden'}));});addObjective.id='story-add-objective';list.append(addObjective);
    const source=[...story.dialogues,...story.objectives].find(x=>x.id===this.selected)??story.dialogues[0]??story.objectives[0];if(!source){detail.append(node('p','先创建对话和旅途目标，再到「事件与动作」里配置播放时机。'));return;}this.selected=source.id;
    const item=structuredClone(source),save=()=>this.change(s=>{if('lines' in item)s.dialogues=s.dialogues.map(x=>x.id===item.id?item:x);else s.objectives=s.objectives.map(x=>x.id===item.id?item:x);});
    detail.dataset.story=item.id;this.field(detail,'名称',item.name,v=>{item.name=v;save();});this.field(detail,'重置归属',item.resetGroup??'',v=>{if(v)item.resetGroup=v;else delete item.resetGroup;save();},[['','全局'],...this.author.map.groups.map(g=>[g.id,g.name] as [string,string])]);
    if('lines' in item)this.dialogue(detail,item,save);else this.objective(detail,item,save);
    detail.append(node('small',item.id,'muted'),this.btn('删除及依赖规则',()=>this.author.change('删除剧情',m=>{m.story!.dialogues=m.story!.dialogues.filter(x=>x.id!==item.id);m.story!.objectives=m.story!.objectives.filter(x=>x.id!==item.id);removeLogicReferences(m,new Set([item.id]));})));
  }
  private objective(host:HTMLElement,o:StoryObjective,save:()=>void):void {this.field(host,'目标说明',o.description,v=>{o.description=v;save();});this.field(host,'初始目标状态',o.initial,v=>{o.initial=v as typeof o.initial;save();},[['hidden','隐藏'],['active','进行中'],['done','已完成']]);}
  private dialogue(host:HTMLElement,d:StoryDialogue,save:()=>void):void {
    this.field(host,'说话者',d.speaker,v=>{d.speaker=v;save();});d.lines.forEach((line,i)=>{const card=node('div','','logic-card');card.dataset.line=String(i);this.field(card,`台词 ${i+1}`,line,v=>{d.lines[i]=v;save();});if(d.lines.length>1)card.append(this.btn('删除台词',()=>{d.lines.splice(i,1);save();}));if(i)card.append(this.btn('上移',()=>{[d.lines[i-1],d.lines[i]]=[d.lines[i]!,d.lines[i-1]!];save();}));host.append(card);});if(d.lines.length<32)host.append(this.btn('＋ 台词',()=>{d.lines.push('新的发现。');save();}));
    host.append(node('h3','结尾选项'),node('p','选项发送信号，可在「事件与动作」接续剧情、机关或阶段。所有选项未解锁时允许结束对话。','muted'));
    d.choices.forEach((c,i)=>{const card=node('div','','logic-card');card.dataset.choice=c.id;host.append(card);this.field(card,'选项文字',c.text,v=>{c.text=v;save();});this.field(card,'发送信号',c.signal??'',v=>{c.signal=v||null;save();});this.logic.conditionUI(card,c.condition,v=>{c.condition=v;save();},save,0);card.append(this.btn('删除选项',()=>{d.choices.splice(i,1);save();}),node('small',c.id,'muted'));});
    if(d.choices.length<4)host.append(this.btn('＋ 选项',()=>{let n=1;while(d.choices.some(c=>c.id===`choice-${n}`))n++;d.choices.push({id:`choice-${n}`,text:'一起出发。',signal:null,condition:{kind:'all',conditions:[]}});save();}));
  }
}
