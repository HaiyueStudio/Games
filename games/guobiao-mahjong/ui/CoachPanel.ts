import {GuiButton,GuiElement,GuiImage,GuiLabel,GuiScrollView,GuiSelect,type GuiRoot} from '@haiyue/engine/gui';
import type {CoachSystem} from '../ai/coaching/CoachSystem';
import {TILE_NAMES,WINDS,seat} from '../rules/types';
import {iconUv,panelSkin,type UiArt} from './UiArt';
import type {CoachLog} from '../ai/coaching/types';
import {wrapCoachText} from './coachText';
/** Non-modal native GUI: the player can keep playing while analysis and logs update. */
export class CoachPanel{
  private readonly panel:GuiElement;private readonly title:GuiLabel;private readonly status:GuiLabel;private readonly advice:GuiLabel;private readonly notice:GuiLabel;
  private readonly close:GuiButton;private readonly auto:GuiButton;private readonly refresh:GuiButton;private readonly followButton:GuiButton;private readonly clear:GuiButton;private readonly save:GuiButton;private readonly quality:GuiSelect<number>;private readonly scroll:GuiScrollView;
  private readonly pool:GuiLabel[]=[];private lines:Array<{text:string;color:string}>=[];
  private wanted=false;private follow=true;private stick=false;private logVersion=-1;private wrapWidth=0;private shownStart=-1;private version=-1;private rowHeight=18;
  constructor(private readonly root:GuiRoot,private readonly canvas:HTMLCanvasElement,readonly coach:CoachSystem,art:UiArt){
    this.panel=root.add(new GuiElement({id:'coach-panel',visible:false,pointerFilter:'stop',style:panelSkin(art)}));
    const label=(text:string,color='#c4d5c4')=>this.panel.add(new GuiLabel({text,pointerFilter:'ignore',style:{color,padding:0}}));
    const button=(id:string,text:string,click:()=>void)=>this.panel.add(new GuiButton({id,text,onClick:click,style:{backgroundColor:'#173c2c',hoverBackgroundColor:'#2b6043',borderColor:'#6e805b',color:'#e9d8aa',radius:7,padding:0,fontSize:11}}));
    this.title=label('策略分析','#ead093');this.status=label('正在准备公开信息分析','#adc5b0');this.advice=label('灯泡打开分析日志','#f1dca1');
    this.close=button('coach-close','',()=>this.hide());const image=this.close.add(new GuiImage({source:art.icons,sourceKey:'mahjong:ui-icons:v1',uv:iconUv('close'),pointerFilter:'ignore',tint:'#e7d39a'}));image.layout=p=>Object.assign(image.rect,{x:p.x+8,y:p.y+8,width:p.width-16,height:p.height-16});
    this.auto=button('coach-auto','自动：开',()=>coach.setEnabled(!coach.automatic));this.refresh=button('coach-refresh','重新分析',()=>coach.refresh());
    this.quality=this.panel.add(new GuiSelect<number>({id:'coach-quality',value:64,options:[{label:'标准 64路',value:64},{label:'精细 192路',value:192}],onChange:n=>coach.setSamples(n),style:{backgroundColor:'#173c2c',borderColor:'#6e805b',fontSize:11}}));
    this.followButton=button('coach-follow','跟随最新',()=>{this.follow=true;this.stick=true});this.clear=button('coach-clear','清空',()=>coach.clearLog());
    this.save=button('coach-export','导出日志',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(coach.exportLog(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mahjong-analysis-log.json';a.click();URL.revokeObjectURL(url)});
    this.notice=label('对手牌型为推测 · 风险分不是放铳概率','#a1b7a2');
    this.scroll=this.panel.add(new GuiScrollView({id:'coach-log',x:0,y:0,width:'100%',height:'100%',axis:'vertical',contentHeight:1,showScrollbar:true,inertia:true,style:{padding:0,backgroundColor:'#051b1480'}}));
    this.panel.layout=p=>{
      const scale=p.width/Math.max(1,canvas.clientWidth),w=canvas.clientWidth,h=canvas.clientHeight,width=Math.min(w<1100?380:352,w-24),height=w>=1100?h-108:Math.min(h-110,Math.max(300,h*.63)),x=w>=1100?w-width-12:(w-width)/2,y=w>=1100?78:Math.max(72,h-height-92);
      Object.assign(this.panel.rect,{x:p.x+x*scale,y:p.y+y*scale,width:width*scale,height:height*scale});
      const place=(node:GuiElement,xx:number,yy:number,ww:number,hh:number,font=11)=>{Object.assign(node.rect,{x:this.panel.rect.x+xx*scale,y:this.panel.rect.y+yy*scale,width:ww*scale,height:hh*scale});if(node instanceof GuiLabel)node.setFontSize(font*scale);else if(node.style.fontSize!==font*scale)node.setStyle({fontSize:font*scale});if(node!==this.scroll)for(const c of node.children)c.layout(node.rect)};
      place(this.title,18,14,width-76,28,20);place(this.close,width-49,11,32,32);place(this.status,18,47,width-36,18,10);place(this.advice,18,68,width-36,24,12);
      place(this.auto,16,100,73,28);place(this.refresh,96,100,76,28);place(this.quality,180,100,width-196,28);
      place(this.followButton,16,height-61,84,26);place(this.clear,108,height-61,52,26);place(this.save,width-108,height-61,92,26);
      place(this.notice,16,height-29,width-32,20,10);place(this.scroll,16,138,width-32,Math.max(35,height-211));
      this.rebuildLines(width-46);this.rowHeight=18*scale;this.scroll.setContentHeight(Math.max(this.scroll.rect.height,this.lines.length*this.rowHeight+8));this.scroll.layout({...this.scroll.rect});
      if(this.stick){this.scroll.scrollTo(this.scroll.maxScrollY);this.stick=false}this.paintRows();
    };
  }
  private rebuildLines(width:number){
    if(this.logVersion===this.coach.logVersion&&this.wrapWidth===width)return;
    const atEnd=this.scroll.maxScrollY-this.scroll.scrollY<26;
    if(this.logVersion>=0&&this.follow&&!atEnd&&!this.stick)this.follow=false;
    const colors:Record<CoachLog['kind'],string>={建议:'#f0d391',路线:'#bad9af',防守:'#e0ae88',对手:'#a9c4cf',试算:'#b5cbb6',系统:'#d3bd9c'};
    this.lines=this.coach.logs.flatMap(log=>[
      {text:`[${WINDS[log.roundWind]}圈 ${log.handIndex+1}局 · ${log.revision}] ${log.kind}`,color:colors[log.kind]},
      ...wrapCoachText(log.text,Math.max(12,width/11.5)).map(text=>({text,color:'#d0dcc9'})),{text:'',color:'#d0dcc9'}]);
    if(!this.lines.length)this.lines=[{text:'每次牌局信息变化后自动输出建议。',color:'#adc4ad'},{text:'可关闭本框，后台仍会继续分析。',color:'#adc4ad'}];
    this.logVersion=this.coach.logVersion;this.wrapWidth=width;this.shownStart=-1;if(this.follow)this.stick=true;
  }
  private paintRows(){
    const count=Math.min(160,Math.ceil(this.scroll.rect.height/Math.max(1,this.rowHeight))+2),start=Math.max(0,Math.floor(this.scroll.scrollY/Math.max(1,this.rowHeight))-1);
    while(this.pool.length<count){const index=this.pool.length,n=this.scroll.add(new GuiLabel({text:'',pointerFilter:'ignore',style:{padding:0,color:'#d0dcc9'}}));n.layout=()=>{const scale=this.root.viewport.width/Math.max(1,this.canvas.clientWidth),first=Math.max(0,Math.floor(this.scroll.scrollY/Math.max(1,this.rowHeight))-1),line=this.lines[first+index];n.setVisible(!!line);if(line){n.setText(line.text);if(n.style.color!==line.color)n.setStyle({color:line.color})}Object.assign(n.rect,{x:this.scroll.rect.x+5*scale,y:this.scroll.rect.y+(first+index)*this.rowHeight-this.scroll.scrollY,width:this.scroll.rect.width-13*scale,height:this.rowHeight});n.setFontSize(11.5*scale)};this.pool.push(n)}
    const changed=start!==this.shownStart;this.shownStart=start;
    for(let i=0;i<this.pool.length;i++){const n=this.pool[i]!,line=this.lines[start+i];n.setVisible(i<count&&!!line);if(line){if(changed||n.text!==line.text){n.setText(line.text);if(n.style.color!==line.color)n.setStyle({color:line.color})}n.layout(this.scroll.rect)}}
  }
  sync(blocked:boolean){
    this.panel.setVisible(this.wanted&&!blocked);if(!this.panel.visible)return;
    if(this.version!==this.coach.version){this.version=this.coach.version;this.status.setText(this.coach.message+' · '+this.coach.logs.length+'条'+(this.coach.droppedEntries?'（保留最近400条）':''));this.auto.setText(this.coach.automatic?'自动：开':'自动：关');this.quality.setValue(this.coach.sampleCount);
      const r=this.coach.report,c=r?.candidates[0];this.advice.setText(r?.recommendation?.type==='hu'?'建议立即胡牌':c?`${c.action.type==='discard'?'建议打'+TILE_NAMES[c.action.tile!]:'建议'+(c.action.type==='pass'?'过':'副露')} · ${c.shanten===0?'听牌':c.shanten+'向听'} · 风险${c.risk}分`:r?.summary??'等待新局面');
      this.title.setText(`策略分析 · ${this.coach.report?WINDS[seat(this.coach.report.seat)]:''}位`);
    }
    this.panel.layout(this.root.viewport);if(this.follow&&this.scroll.maxScrollY-this.scroll.scrollY>30&&!this.stick)this.follow=false;this.followButton.setText(this.follow?'跟随最新':'恢复跟随');
  }
  raise(){if(this.visible&&this.root.root.children.at(-1)!==this.panel){this.root.remove(this.panel);this.root.add(this.panel)}}
  open(){this.wanted=true;this.stick=this.follow;this.panel.setVisible(true);this.coach.refresh();this.raise()}
  hide(){this.wanted=false;this.panel.setVisible(false)}
  get visible(){return this.panel.visible}
  snapshot(){return {renderer:'engine-gui-live-coach',visible:this.visible,wanted:this.wanted,modal:false,following:this.follow,rect:{...this.panel.rect},closeRect:{...this.close.rect},scrollRect:{...this.scroll.rect},refreshRect:{...this.refresh.rect},autoRect:{...this.auto.rect},followRect:{...this.followButton.rect},clearRect:{...this.clear.rect},qualityRect:{...this.quality.rect},renderedRows:this.pool.filter(n=>n.visible).length,totalLines:this.lines.length,scrollY:this.scroll.scrollY,maxScrollY:this.scroll.maxScrollY}}
}
