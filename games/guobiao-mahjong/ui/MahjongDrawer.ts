import {GuiButton,GuiElement,GuiImage,GuiLabel,GuiModal,GuiScrollView,GuiSelect,GuiSlider,type GuiRoot} from '@haiyue/engine/gui';
import type {MatchController} from '../app/MatchController';
import {seat,WINDS,type Observation,type Seat} from '../rules/types';
import {iconUv,panelSkin,type UiArt} from './UiArt';
export type DrawerSection='ranking'|'settings';
export class MahjongDrawer{
  private readonly modal:GuiModal;private readonly closeButton:GuiButton;private readonly select:GuiSelect<number>;private readonly slider:GuiSlider;private readonly delay:GuiLabel;
  private readonly ranking:GuiElement[]=[];private readonly settings:GuiElement[]=[];private readonly names:GuiLabel[]=[];private readonly scores:GuiLabel[]=[];private readonly logs:GuiLabel[]=[];
  private readonly scroll:GuiScrollView;
  private readonly round:GuiLabel;private readonly subtitle:GuiLabel;
  private section:DrawerSection='settings';private resume=false;private epoch=-1;
  constructor(root:GuiRoot,private readonly canvas:HTMLCanvasElement,private readonly game:MatchController,art:UiArt,onModels:()=>void,onExport:()=>void,onCoach:()=>void){
    this.modal=root.add(new GuiModal({id:'mahjong-drawer',visible:false,title:'牌局设置',message:'',showCloseButton:false,showConfirmButton:false,showCancelButton:false,closeOnBackdrop:true,backdropColor:'#020b0866',style:panelSkin(art),onClose:()=>{if(this.resume&&this.epoch===game.presentationEpoch)game.pause(false);this.resume=false}}));
    const label=(text:string,y:number,font=14,color='#a9bca7',group=this.settings)=>{const n=this.modal.add(new GuiLabel({text,pointerFilter:'ignore',style:{color,padding:0}}));Object.assign(n,{drawerY:y,drawerFont:font});group.push(n);return n};
    const button=(text:string,y:number,click:()=>void)=>{const n=this.modal.add(new GuiButton({id:'drawer-'+text,text,onClick:click,style:{backgroundColor:'#183d2bda',hoverBackgroundColor:'#2b5d42',borderColor:'#72825b',color:'#eee8cb',radius:10}}));Object.assign(n,{drawerY:y,drawerHeight:44});this.settings.push(n);return n};
    this.closeButton=this.modal.add(new GuiButton({id:'drawer-close',text:'',onClick:()=>this.close(),style:{backgroundColor:'#0a271bcf',hoverBackgroundColor:'#2f5640',borderColor:'#8a8e5b',radius:18,padding:0}}));
    const closeImage=this.closeButton.add(new GuiImage({source:art.icons,sourceKey:'mahjong:ui-icons:v1',uv:iconUv('close'),pointerFilter:'ignore',tint:'#e8d198'}));closeImage.layout=p=>Object.assign(closeImage.rect,{x:p.x+8,y:p.y+8,width:p.width-16,height:p.height-16});
    this.subtitle=label('累计和牌番数 / 比赛分',88,12,'#bdba90',this.ranking);
    for(let i=0;i<4;i++){
      const bg=this.modal.add(new GuiElement({pointerFilter:'ignore',style:{backgroundColor:i===0?'#705d264d':'#071d17bd',borderColor:i===0?'#b79b57':'#3b5942',radius:12}}));Object.assign(bg,{drawerY:130+i*96,drawerHeight:82});this.ranking.push(bg);
      this.names.push(label('',141+i*96,16,i===0?'#f2d48b':'#e2e9d9',this.ranking));this.scores.push(label('',175+i*96,19,'#d6d5b3',this.ranking));Object.assign(this.names[i]!,{drawerInset:40});Object.assign(this.scores[i]!,{drawerInset:40});
    }
    label('座位与模式',86,12);
    this.select=this.modal.add(new GuiSelect<number>({id:'seat-select',options:[...WINDS.map((wind,i)=>({label:wind+'位 · 玩家',value:i})),{label:'四家 AI · 观战',value:-1}],value:game.human??-1,onChange:v=>{game.setHuman(v<0?null:v as Seat);this.epoch=game.presentationEpoch},style:{backgroundColor:'#183d2be8',borderColor:'#697b55',radius:8}}));Object.assign(this.select,{drawerY:112,drawerHeight:36});this.settings.push(this.select);
    button('AI 模型',173,()=>{this.close();onModels()});button('策略分析',227,()=>{this.close();onCoach()});button('导出回放',281,onExport);
    this.delay=label('',348,12);this.slider=this.modal.add(new GuiSlider({id:'ai-delay',min:0,max:5000,step:100,value:game.delayMs,onChange:v=>game.setDelay(v),style:{backgroundColor:'#41664b',color:'#eccb83'}}));Object.assign(this.slider,{drawerY:384,drawerHeight:20});this.settings.push(this.slider);
    label('牌局记录',440,18,'#e4d49e');for(let i=0;i<6;i++)this.logs.push(label('',479+i*29,12));
    const reset=button('新比赛',-82,()=>{game.reset(Date.now()>>>0);this.close()});reset.setStyle({borderColor:'#bd995a',color:'#f0d59b'});
    this.round=label('',-128,12,'#a1b59c',[]);
    this.scroll=this.modal.add(new GuiScrollView({id:'drawer-scroll',x:0,y:0,width:'100%',height:'100%',axis:'vertical',showScrollbar:true,inertia:true,style:{padding:0}}));
    for(const n of [...this.ranking,...this.settings]){
      const a=n as GuiElement&{drawerY:number;drawerHeight?:number;drawerFont?:number;drawerInset?:number};if(a.drawerY<0)continue;
      this.modal.remove(n);this.scroll.add(n);
      n.layout=p=>{const scale=root.viewport.width/Math.max(1,canvas.clientWidth),inset=(a.drawerInset??26)-26;Object.assign(n.rect,{x:p.x+inset*scale,y:p.y+(a.drawerY-80)*scale,width:p.width-inset*2*scale,height:(a.drawerHeight??26)*scale});if(n instanceof GuiLabel)n.setFontSize((a.drawerFont??14)*scale);for(const c of n.children)c.layout(n.rect)};
    }

    this.modal.layout=p=>{
      const scale=p.width/Math.max(1,canvas.clientWidth),width=Math.min(340,canvas.clientWidth-24),height=Math.max(280,canvas.clientHeight-24),left=this.section==='ranking'?12:canvas.clientWidth-width-12;
      Object.assign(this.modal.rect,p);Object.assign(this.modal.dialogRect,{x:p.x+left*scale,y:p.y+12*scale,width:width*scale,height:height*scale});
      const place=(n:GuiElement,x:number,y:number,w:number,h:number,font=14)=>{const r=this.modal.dialogRect;Object.assign(n.rect,{x:r.x+x*scale,y:r.y+y*scale,width:w*scale,height:h*scale});if(n instanceof GuiLabel)n.setFontSize(font*scale);if(n!==this.scroll)for(const c of n.children)c.layout(n.rect)};
      place(this.modal.titleLabel,40,27,width-108,35,23);place(this.modal.messageLabel,-2000,0,1,1);place(this.closeButton,width-62,25,36,36);
      for(const n of this.settings){const a=n as GuiElement&{drawerY:number;drawerHeight?:number};if(a.drawerY<0)place(n,26,height+a.drawerY,width-52,a.drawerHeight??26)}
      this.scroll.setContentHeight((this.section==='ranking'?440:600)*scale);place(this.scroll,26,80,width-52,Math.max(60,height-228));this.scroll.layout({...this.scroll.rect});
      place(this.round,26,height-128,width-52,26,12);
    };
  }
  open(section:DrawerSection){if(!this.modal.visible){this.resume=this.game.started&&!this.game.paused;this.epoch=this.game.presentationEpoch;this.game.pause(true)}if(this.section!==section)this.scroll.scrollTo(0);this.section=section;this.modal.setTitle(section==='ranking'?'本场排名':'牌局设置');this.ranking.forEach(n=>n.setVisible(section==='ranking'));this.settings.forEach(n=>n.setVisible(section==='settings'));this.modal.show()}
  close(){this.modal.close()}
  get visible(){return this.modal.visible}
  get dock(){return this.visible?(this.section==='ranking'?'left':'right'):'none' as const}
  sync(o:Observation,animating:boolean){
    if(!this.visible)return;const ranked=o.players.map((p,i)=>({...p,seat:i})).sort((a,b)=>b.fan-a.fan||b.score-a.score);
    ranked.forEach((p,i)=>{this.names[i]!.setText(`${i+1}   ${p.seat===this.game.human?'你':p.name}`);this.scores[i]!.setText(`${p.fan} 番    /    ${p.score>0?'+':''}${p.score} 分`)});
    this.subtitle.setText('累计和牌番数 / 比赛分');this.select.setValue(this.game.human??-1);this.select.setDisabled(this.game.thinking||animating);this.slider.setValue(Math.min(5000,this.game.delayMs));this.delay.setText(`计算后等待 ${(this.game.delayMs/1000).toFixed(1)} 秒`);
    const events=o.events.filter(e=>e.type!=='draw').slice(-6);this.logs.forEach((n,i)=>{n.setText(events[i]?`${WINDS[seat(events[i]!.seat-o.dealer)]}  ${events[i]!.text}`:'');n.setVisible(this.section==='settings')});
    this.round.setText(`${WINDS[o.roundWind]}风圈 · 第 ${o.handIndex+1} / 16 局`);
  }
  snapshot(){return {renderer:'engine-gui-drawer',visible:this.visible,section:this.section,dock:this.dock,rect:{...this.modal.dialogRect},closeRect:{...this.closeButton.rect},seatRect:{...this.select.rect},sliderRect:{...this.slider.rect}}}
}
