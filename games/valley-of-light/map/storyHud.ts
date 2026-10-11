import {Entity,type HaiyueEngine} from '@haiyue/engine';
import {GuiButton,GuiLabel,GuiModal,GuiRoot,GuiElement,GuiSystem,type GuiRect} from '@haiyue/engine/gui';
import type {MapRuntime,ValleyMap} from './model';
import type {MapView} from './view';
export const storyCharacters=(map:ValleyMap):string=>Array.from(new Set('旅途目标正文旅途手记进行中已完成暂无目标尚未读过对话继续结束关闭选项暂未解锁下一页上一页 /0123456789·：'+JSON.stringify(map.story??{}))).join('');
class StoryRoot extends GuiRoot {
  override hitTest(x:number,y:number):GuiElement|null {const hit=super.hitTest(x,y);return hit===this.root?null:hit;}
}
class StoryPanel extends GuiModal {
  readonly body=this.add(new GuiElement());private page=0;private pages=1;private previous=this.add(new GuiButton({text:'正文上一页',onClick:()=>{this.page=Math.max(0,this.page-1);this.markDirty();}}));private next=this.add(new GuiButton({text:'正文下一页',onClick:()=>{this.page=Math.min(this.pages-1,this.page+1);this.markDirty();}}));readonly answers:GuiButton[]=[];private text='';private key='';
  constructor(){super({width:620,height:420,showCloseButton:false,showConfirmButton:false,showCancelButton:false,closeOnBackdrop:false,backdropColor:'rgba(40,57,54,0.28)',style:{backgroundColor:'#fffdf0',borderColor:'#c7d6c3',color:'#35564e'}});this.messageLabel.setVisible(false);this.titleLabel.setFontSize(20);}
  content(text:string,answers:Array<{text:string;disabled:boolean;click:()=>void}>):void {this.text=text;for(const b of this.answers)this.remove(b);this.answers.length=0;for(const a of answers)this.answers.push(this.add(new GuiButton({text:a.text,disabled:a.disabled,style:{color:'#35564e'},onClick:a.click})));this.page=0;this.markDirty();}
  override layout(parent:GuiRect):void {
    super.layout(parent);const r=this.dialogRect,w=r.width-48,bottom=r.y+r.height-18,buttonHeight=36,gap=6,bodyHeight=Math.max(40,r.height-100-this.answers.length*(buttonHeight+gap));
    this.body.rect={x:r.x+24,y:r.y+64,width:w,height:bodyHeight};
    const lines:string[]=[];for(const p of this.text.split('\n')){let line='',size=0;for(const c of p){const cw=/[ -~]/.test(c)?8:15;if(size+cw>w-16&&line){lines.push(line);line='';size=0;}line+=c;size+=cw;}lines.push(line);}
    const perPage=Math.max(1,Math.floor((bodyHeight-36)/25));this.pages=Math.max(1,Math.ceil(lines.length/perPage));this.page=Math.min(this.page,this.pages-1);const key=this.text+'|'+w+'|'+this.page+'|'+perPage;
    if(key!==this.key){this.key=key;for(const c of [...this.body.children])this.body.remove(c);lines.slice(this.page*perPage,(this.page+1)*perPage).forEach(text=>this.body.add(new GuiLabel({text,fontSize:15,style:{color:'#35564e'}})));}
    this.body.children.forEach((c,i)=>{c.rect={x:r.x+24,y:r.y+64+i*25,width:w,height:25};});
    this.previous.setVisible(this.pages>1);this.next.setVisible(this.pages>1);this.previous.setDisabled(this.page===0);this.next.setDisabled(this.page>=this.pages-1);this.previous.rect={x:r.x+24,y:r.y+64+bodyHeight-34,width:132,height:30};this.next.rect={x:r.x+168,y:r.y+64+bodyHeight-34,width:132,height:30};
    this.answers.forEach((b,i)=>{b.rect={x:r.x+24,y:bottom-(this.answers.length-i)*(buttonHeight+gap),width:w,height:buttonHeight};});
  }
}
/** Both editor preview and standalone play use Engine GUI, with bounded lifecycle. */
export class StoryHud {
  private root=new StoryRoot({theme:{fontSize:14,colors:{text:'#35564e',textMuted:'#718774',primary:'#397568',danger:'#a87359',background:'#e6ece4',surface:'#fffdf0',border:'#c7d6c3',hover:'#e1ead8',active:'#c5d9bd',disabled:'#93a18b'}}});
  private entity=new Entity('Valley story HUD').addComponent(this.root);private panel=this.root.add(new StoryPanel());private key='';private journal=false;private page=0;private system:GuiSystem|null=null;
  private journalButton=this.root.add(new GuiButton({text:'旅途手记',x:20,y:160,width:104,height:34,onClick:()=>{this.journal=true;this.page=0;this.key='';}}));
  constructor(private view:MapView,engine:HaiyueEngine,private runtime:()=>MapRuntime|null,private map:ValleyMap,ownedSystem=false){
    if(ownedSystem){this.system=new GuiSystem(engine,{loadOp:'load',font:{chars:storyCharacters(map),fontFamily:'Microsoft YaHei, sans-serif',fontSize:28,atlasSize:4096}});view.scene.addSystem(this.system);}
    view.scene.add(this.entity);
  }
  get blocking():boolean{return this.journal||!!this.runtime()?.dialogueActive;}
  hit(x:number,y:number):boolean{return this.blocking||x>=20&&x<=124&&y>=160&&y<=194;}
  tick():void {
    const r=this.runtime();if(!r){this.root.root.setVisible(false);return;}this.root.root.setVisible(true);const d=r.dialogueSnapshot(),key=JSON.stringify([d,r.debugPaused,r.poses.story?.objectives,r.poses.story?.seen,this.journal,this.page,r.recoveryVersion]);
    if(key===this.key)return;this.key=key;this.panel.setVisible(!!d||this.journal);this.journalButton.setDisabled(!!d||r.debugPaused);
    if(d){this.journal=false;this.panel.setTitle(`${d.speaker||d.name} · ${d.line+1} / ${d.total}`);const options=d.choices.map(c=>({text:c.text,disabled:!c.enabled||r.debugPaused,click:()=>{r.advanceDialogue(c.id);}}));
      if(!options.length||!d.choices.some(c=>c.enabled))options.push({text:d.line<d.total-1?'继续':d.choices.length?'选项暂未解锁 · 结束':'结束',disabled:r.debugPaused,click:()=>{r.advanceDialogue();}});this.panel.content(d.text,options);
    }else if(this.journal){const entries=['旅途目标\n'+(this.map.story?.objectives.filter(o=>r.poses.story?.objectives[o.id]!=='hidden').map(o=>`${r.poses.story?.objectives[o.id]==='done'?'已完成':'进行中'} · ${o.name}\n${o.description}`).join('\n\n')||'暂无目标'),...(r.poses.story?.seen??[]).map(id=>{const d=this.map.story!.dialogues.find(d=>d.id===id)!;const choice=d.choices.find(c=>c.id===r.poses.story?.choices[id]);return `${d.name} · ${d.speaker}\n\n${d.lines.join('\n\n')}${choice?'\n\n'+choice.text:''}`;})];this.page=Math.min(this.page,entries.length-1);this.panel.setTitle(`旅途手记 · ${this.page+1} / ${entries.length}`);const buttons=[];if(this.page>0)buttons.push({text:'上一页',disabled:false,click:()=>{this.page--;}});if(this.page<entries.length-1)buttons.push({text:'下一页',disabled:false,click:()=>{this.page++;}});buttons.push({text:'关闭',disabled:false,click:()=>{this.journal=false;}});this.panel.content(entries[this.page]!,buttons);}
  }
  snapshot(){return {dialogue:this.runtime()?.dialogueSnapshot(),journal:this.journal,button:this.journalButton.rect,choices:this.panel.visible?this.panel.answers.map(b=>({text:b.text,disabled:b.disabled,rect:{...b.rect}})):[]};}
  dispose():void{this.view.scene.remove(this.entity);this.entity.destroy();if(this.system){this.view.scene.world.removeSystem(this.system);this.system.destroy();this.system=null;}}
}
