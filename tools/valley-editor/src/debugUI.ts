import {button,type HYDialog,type HYInput,type HYSelect} from './ui';
import {inspectNavigation,type MapRuntime,type ConditionTrace} from '../../../games/valley-of-light/map/model';
import type {MapView} from '../../../games/valley-of-light/map/view';
const node=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
export class DebugUI {
  private dialog=document.getElementById('debug-dialog') as HYDialog;private elapsed=0;private previous:MapRuntime|null=null;private overlay=false;private nav:ReturnType<typeof inspectNavigation>|null=null;private navKey='';private drawKey='';private pauseButton:HTMLElement|null=null;
  constructor(private runtime:()=>MapRuntime|null,private view:MapView){document.getElementById('close-debug')!.onclick=()=>this.dialog.close();}
  open():void{this.dialog.showModal();this.controls();this.refresh(true);}
  private run(fn:()=>void):void {try{document.getElementById('debug-error')!.textContent='';fn();}catch(e){document.getElementById('debug-error')!.textContent=String(e);}this.refresh(true);}
  private select(label:string,options:Array<[string,string]>):HYSelect{const e=document.createElement('hy-select') as HYSelect;e.options=options.map(([value,label])=>({value,label}));e.value=options[0]?.[0]??'';e.setAttribute('aria-label',label);return e;}
  private input(label:string,value:string):HYInput{const e=document.createElement('hy-input') as HYInput;e.value=value;e.setAttribute('aria-label',label);return e;}
  private controls():void {
    const host=document.getElementById('debug-controls')!,r=this.runtime();host.replaceChildren();this.previous=r;this.navKey='';this.nav=null;this.drawKey='';
    if(!r){host.append(node('p','请先开始试玩。调试只改变本次运行，不写回地图；暂停状态下可单步推进 0.05 秒。'));return;}
    this.pauseButton=button(r.debugPaused?'继续运行':'暂停运行',()=>this.run(()=>{r.debugPaused=!r.debugPaused;}));this.pauseButton.id='debug-pause';const step=button('单步 0.05 秒',()=>this.run(()=>{r.debugPaused=true;r.debugStep();}));step.id='debug-step';host.append(this.pauseButton,step);
    const overlay=button(this.overlay?'关闭连通预览':'显示连通预览',()=>this.run(()=>{this.overlay=!this.overlay;overlay.textContent=this.overlay?'关闭连通预览':'显示连通预览';}));overlay.id='debug-overlay-toggle';host.append(overlay,node('p','绿点：当前可达面；橙点：当前不可达面；虚线：传送。这里只分析当前姿态，机关改变后可能出现新路。','muted'));
    const vars=r.map.logic?.variables??[];if(vars.length){const row=node('div','','row'),select=this.select('调试变量',vars.map(v=>[v.id,v.name])),value=this.input('调试变量值',String(r.logic.variables[select.value]));select.addEventListener('value-change',()=>{value.value=String(r.logic.variables[select.value]);});row.append(select,value,button('应用变量',()=>this.run(()=>{const original=r.logic.variables[select.value];if(typeof original==='boolean'&&!['true','false'].includes(value.value))throw new Error('布尔变量请填写 true 或 false。');if(typeof original==='number'&&!value.value.trim())throw new Error('请输入数字。');r.logic.debugVariable(select.value,typeof original==='boolean'?value.value==='true':Number(value.value));})));host.append(row);}
    const row=node('div','','row'),signal=this.input('调试信号','open-gate');row.append(signal,button('发送信号',()=>this.run(()=>r.logic.debugSignal(signal.value))));host.append(row);
    host.append(button('导出调试快照',()=>{const blob=new Blob([JSON.stringify({mapId:r.map.id,state:r.logicSnapshot(),rules:r.logic.debugSnapshot(),navigation:this.nav},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${r.map.id}-debug.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
  }
  tick(dt:number,blocked=false):void {
    const r=this.runtime();if(r!==this.previous){this.controls();if(!r){this.overlay=false;this.nav=null;document.getElementById('debug-overlay')!.replaceChildren();}}
    this.elapsed+=dt;if(this.elapsed>=.35){this.elapsed=0;if(this.dialog.open||this.overlay)this.refresh(false);}
    document.getElementById('debug-overlay')!.toggleAttribute('hidden',!this.overlay||!r||blocked);
    if(this.overlay&&r&&!blocked)this.draw();
  }
  private trace(host:HTMLElement,t:ConditionTrace):void {const item=node('div',`${t.passed?'✓':'×'} ${t.label}`,t.passed?'debug-pass':'debug-fail');host.append(item);if(t.children.length){const children=node('div','','debug-indent');item.append(children);for(const c of t.children)this.trace(children,c);}}
  private refresh(force:boolean):void {
    const r=this.runtime(),report=document.getElementById('debug-report')!,svg=document.getElementById('debug-overlay')!;svg.toggleAttribute('hidden',!this.overlay||!r);if(!r){report.replaceChildren();return;}
    if(this.pauseButton)this.pauseButton.textContent=r.debugPaused?'继续运行':'暂停运行';
    const key=JSON.stringify([r.at,r.poses,this.view.cameraSettings()]);if(force||key!==this.navKey){this.nav=inspectNavigation(r.map,r.poses,r.at,this.view.project);this.navKey=key;}
    if(!this.dialog.open)return;report.replaceChildren();const debug=r.logic.debugSnapshot(),nav=this.nav!;
    report.append(node('h3',`${r.debugPaused?'已暂停':'运行中'} · 模拟时间 ${debug.time.toFixed(2)} 秒 · 待处理事件 ${debug.pendingEvents}`));if(r.logic.error)report.append(node('p',r.logic.error,'logic-error'));
    for(const v of r.map.logic?.variables??[])report.append(node('div',`${v.name}：${r.logic.variables[v.id]}`));
    report.append(node('h3',`道路诊断 · ${nav.surfaces.filter(s=>s.reachable).length} / ${nav.surfaces.length} 面当前可达`));for(const issue of nav.issues)report.append(node('p',issue,'debug-fail'));for(const e of nav.exits)report.append(node('div',`出口 ${e.id}：${e.reachable?'有路线':'当前无路线'} · ${e.enabled?'已启用':'未解锁'}`));for(const p of nav.portals)report.append(node('div',`门 ${p.id}：${p.reason}`));
    for(const rule of debug.rules){const card=node('details','','logic-card') as HTMLDetailsElement;card.open=true;card.append(node('summary',`${rule.name} · ${rule.status} · ${rule.count} 次`));this.trace(card,rule.condition);if(rule.task)card.append(node('pre',JSON.stringify(rule.task,null,2),'debug-task'));if(rule.last){card.append(node('small',`上次事件 ${rule.last.time.toFixed(2)} 秒 · ${rule.last.event.type} · ${rule.last.passed?'满足':'未满足'}`));if(!rule.last.passed)this.trace(card,rule.last.trace);}report.append(card);}
    report.append(node('h3','最近事件（最多 80 条）'));for(const e of debug.events.slice(-30).reverse())report.append(node('div',`${e.time.toFixed(2)} · ${e.event.type} · ${e.event.source??'关卡'}${e.event.choiceId?' / '+e.event.choiceId:''}`));
  }
  private draw():void {
    const key=JSON.stringify([this.navKey,this.view.cameraSettings(),this.view.width,this.view.height]);if(key===this.drawKey)return;this.drawKey=key;
    const svg=document.getElementById('debug-overlay')!;svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${this.view.width} ${this.view.height}`);if(!this.nav)return;
    const element=(tag:string,attrs:Record<string,string>)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
    for(const l of this.nav.links){const a=this.view.screen(l.a),b=this.view.screen(l.b);element('line',{x1:String(a[0]),y1:String(a[1]),x2:String(b[0]),y2:String(b[1]),stroke:l.portal?'#7355b7':'#53918a','stroke-width':'1','stroke-opacity':'.5',...(l.portal?{'stroke-dasharray':'5 4'}:{})});}
    for(const s of this.nav.surfaces){if(s.reason==='当前隐藏')continue;const p=this.view.screen(s.point);element('circle',{cx:String(p[0]),cy:String(p[1]),r:s.reachable?'3.5':'2.5',fill:s.reachable?'#208765':'#ce7b34',stroke:'#fff','stroke-width':'.7'});}
  }
  snapshot(){return {paused:!!this.runtime()?.debugPaused,overlay:this.overlay,navigation:this.nav,rules:this.runtime()?.logic.debugSnapshot()??null};}
}
