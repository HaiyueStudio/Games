import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiImage, GuiLabel, type GuiRect } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import { speed, type Round } from '../rules/model';
import { hudFrame } from './layout';

const ASSETS = ['music', 'music-off', 'pause', 'play', 'life', 'life-empty', 'button-icon', 'button-primary', 'hud-chip', 'leaderboard'] as const;
type Asset = typeof ASSETS[number];
export type HudAssets = Record<Asset, HTMLImageElement>;
export async function loadHudAssets(): Promise<HudAssets> {
  const entries = await Promise.all(ASSETS.map(async name => {
    const response=await fetch(`./assets/ui/${name}.svg`);
    if(!response.ok)throw new Error(`Glass Rush UI ${name}: HTTP ${response.status}`);
    const url=URL.createObjectURL(new Blob([await response.text()],{type:'image/svg+xml'}));
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch (error) { throw new Error(`Glass Rush UI ${name}: ${String(error)}`,{cause:error}); } finally { URL.revokeObjectURL(url); }
    return [name, image] as const;
  }));
  return Object.fromEntries(entries) as HudAssets;
}

const CHARS = '玻璃疾驰已碎裂暂停生存最佳秒开始挑战继续再来一次本机排行承受三次撞击第四次碎裂保存本地纪录暂无刷新、，·';
export class GlassHud {
  private readonly hud: GameHud;
  private readonly overlay: GuiElement[] = [];
  private readonly timer: GuiLabel;
  private readonly velocity: GuiLabel;
  private readonly title: GuiLabel;
  private readonly subtitle: GuiLabel;
  private readonly values: GuiLabel[] = [];
  private readonly lives: GuiImage[] = [];
  private readonly music: ReturnType<GlassHud['iconButton']>;
  private readonly pause: ReturnType<GlassHud['iconButton']>;
  private readonly start: GuiButton;
  private readonly startLabel: GuiLabel;
  private remaining = 4;
  private overlayVisible = true;
  private muted = false;
  private paused = false;
  constructor(private readonly engine: HaiyueEngine, world: World, private readonly assets: HudAssets, callbacks: { action(): void; toggleMusic(): void }) {
    this.hud = new GameHud(engine, world, CHARS, 1000, 700);
    this.hud.root.theme.colors.primary = '#b5c8ff';
    this.pin(new GuiImage({ source: assets['hud-chip'], sourceKey: 'glass:hud-chip', pointerFilter: 'ignore' }), (w,h) => hudFrame(w,h).timer);
    this.label('GLASS / RUSH', (w) => ({ x: w<360?16:20, y: 20, width: w<360?94:w<600?100:180, height: 25 }), w => w<360?11.5:w<600?13:19, '#def9ff', 'left');
    for (let i=0;i<4;i++) this.lives.push(this.pin(new GuiImage({ id: `life-${i}`, source: assets.life, sourceKey: 'glass:life', pointerFilter: 'ignore' }), (w) => ({ x: 15+i*(w<600?25:29), y: w<600?48:51, width: w<600?27:31, height: w<600?27:31 })));
    this.timer=this.label('', (w,h) => { const r=hudFrame(w,h).timer; return {...r,y:r.y+5,height:36}; }, w=>w<360?21:w<600?25:31, '#f2fdff');
    this.velocity=this.label('', (w,h) => { const r=hudFrame(w,h).timer;return {...r,y:r.y+39,height:22}; }, w=>w<600?11:12, '#8bb9d5');
    this.music=this.iconButton('music-toggle','music',callbacks.toggleMusic,(w,h)=>hudFrame(w,h).music);
    this.pause=this.iconButton('pause-toggle','pause',callbacks.action,(w,h)=>hudFrame(w,h).pause);
    this.overlay.push(this.pin(new GuiImage({ id:'leaderboard-panel',source:assets.leaderboard,sourceKey:'glass:leaderboard',pointerFilter:'ignore' }), (w,h)=>hudFrame(w,h).card));
    this.overlay.push(this.cardLabel('NEON / SURVIVAL',.035,.035,.93,.045,()=>11,'#8ab9da'));
    this.title=this.cardLabel('玻璃疾驰',.06,.083,.88,.1,(_w,h)=>Math.min(36,hudFrame(_w,h).card.height*.075),'#f0fbff');
    this.subtitle=this.cardLabel('',.06,.19,.88,.055,(_w,h)=>Math.min(14,hudFrame(_w,h).card.height*.032),'#9bbbd4');
    this.overlay.push(this.title,this.subtitle,this.cardLabel('本机排行 / TOP 5',.1,.268,.8,.045,()=>13,'#a4c9ee'));
    for(let i=0;i<5;i++) {
      const color=i===0?'#f8dba7':i===1?'#a9e8f3':'#8d9ebc';
      this.overlay.push(this.cardLabel(String(i+1).padStart(2,'0'),.105,.344+i/12,.14,.061,()=>15,color,'left'));
      const value=this.cardLabel('',.28,.344+i/12,.6,.061,()=>17,i===0?'#f4e5cc':'#d6e4f6','right');
      this.values.push(value);this.overlay.push(value);
    }
    this.start=this.pin(this.skinnedButton('start-challenge',callbacks.action,'button-primary'),(w,h)=>hudFrame(w,h).action);
    const play=this.start.add(new GuiImage({source:assets.play,sourceKey:'glass:play',pointerFilter:'ignore'}));
    play.layout=r=>{play.rect=this.primaryContent(r).icon;};
    this.startLabel=this.start.add(new GuiLabel({text:'开始挑战',disabled:true,pointerFilter:'ignore',textAlign:'center',fontSize:19,style:{color:'#ffffff',padding:0}}));
    this.startLabel.layout=r=>{const content=this.primaryContent(r);this.startLabel.rect=content.text;this.startLabel.setFontSize(content.font);};
    this.overlay.push(this.start,this.cardLabel('LOCAL RECORDS',.1,.956,.8,.026,()=>9,'#607b9f'));
  }
  get root() { return this.hud.root; }
  private primaryContent(r:GuiRect) {
    const unit=this.root.viewport.width/Math.max(1,this.engine.canvas!.clientWidth),gap=10*unit;
    const font=Math.min(20*unit,r.height*.35),size=Math.min(30*unit,r.height*.55),textWidth=font*(this.startLabel?.text.length??4),left=r.x+(r.width-size-gap-textWidth)/2;
    return {font,icon:{x:left,y:r.y+(r.height-size)/2,width:size,height:size},text:{x:left+size+gap,y:r.y,width:textWidth,height:r.height}};
  }
  private pin<T extends GuiElement>(node:T, rect:(width:number,height:number)=>GuiRect):T {
    node.layout=parent=>{
      const scale=parent.width/Math.max(1,this.engine.canvas!.clientWidth), r=rect(parent.width/scale,parent.height/scale);
      Object.assign(node.rect,{x:parent.x+r.x*scale,y:parent.y+r.y*scale,width:r.width*scale,height:r.height*scale});
      for(const child of node.children)child.layout(node.rect);
    };
    return this.hud.root.add(node);
  }
  private label(text:string,rect:(w:number,h:number)=>GuiRect,font:(w:number,h:number)=>number,color:string,align:'left'|'center'|'right'='center') {
    const node=this.pin(new GuiLabel({text,disabled:true,pointerFilter:'ignore',textAlign:align,fontSize:16,style:{color,padding:0}}),rect);
    const layout=node.layout.bind(node);node.layout=p=>{layout(p);const s=p.width/Math.max(1,this.engine.canvas!.clientWidth);node.setFontSize(font(p.width/s,p.height/s)*s);};
    return node;
  }
  private cardLabel(text:string,x:number,y:number,w:number,h:number,font:(w:number,h:number)=>number,color:string,align:'left'|'center'|'right'='center') {
    return this.label(text,(width,height)=>{const c=hudFrame(width,height).card;return {x:c.x+x*c.width,y:c.y+y*c.height,width:w*c.width,height:Math.max(18,h*c.height)};},font,color,align);
  }
  private skinnedButton(id:string,onClick:()=>void,asset:'button-icon'|'button-primary') {
    const button=new GuiButton({id,text:'',onClick,onPointerEnter:()=>skin.setTint('#ffffff'),onPointerLeave:()=>skin.setTint('#e2eaff'),onPointerDown:()=>skin.setTint('#829ec7'),onPointerUp:()=>skin.setTint('#ffffff'),style:{backgroundColor:'#00000000',hoverBackgroundColor:'#00000000',borderColor:'#00000000',padding:0,radius:18}});
    const skin=button.add(new GuiImage({source:this.assets[asset],sourceKey:`glass:${asset}`,pointerFilter:'ignore',tint:'#e2eaff'}));
    skin.layout=r=>{skin.rect={...r};};return button;
  }
  private iconButton(id:string,asset:'music'|'pause',onClick:()=>void,rect:(w:number,h:number)=>GuiRect) {
    const button=this.pin(this.skinnedButton(id,onClick,'button-icon'),rect);
    const image=button.add(new GuiImage({source:this.assets[asset],sourceKey:`glass:${asset}`,pointerFilter:'ignore'}));
    image.layout=r=>{const s=r.width*.56;image.rect={x:r.x+(r.width-s)/2,y:r.y+(r.height-s)/2,width:s,height:s};};return {button,image};
  }
  sync(round:Round,records:number[],muted:boolean,allowOverlay=true):void {
    this.muted=muted;this.paused=round.phase==='paused';this.remaining=Math.max(0,4-round.hits);this.overlayVisible=allowOverlay&&round.phase!=='playing';
    this.timer.setText(`${round.time.toFixed(2)} s`);this.velocity.setText(`${speed(round).toFixed(1)} m/s`);
    this.music.image.setSource(this.assets[muted?'music-off':'music'],`glass:${muted?'music-off':'music'}`);
    this.pause.image.setSource(this.assets[this.paused?'play':'pause'],`glass:${this.paused?'play':'pause'}`);
    this.pause.button.setDisabled(round.phase!=='playing'&&!this.paused);
    this.pause.image.setTint(round.phase==='playing'||this.paused?'#ffffff':'#65728e');
    for(let i=0;i<4;i++)this.lives[i]!.setSource(this.assets[i<this.remaining?'life':'life-empty'],`glass:${i<this.remaining?'life':'life-empty'}`);
    for(const node of this.overlay)node.setVisible(this.overlayVisible);
    this.title.setText(round.phase==='over'?'玻璃已碎裂':this.paused?'已暂停':'玻璃疾驰');
    this.subtitle.setText(round.phase==='over'?`生存 ${round.time.toFixed(2)} 秒 · 最佳 ${records[0]?.toFixed(2)??'0.00'} 秒`:this.paused?'继续挑战，刷新最佳纪录':'承受三次撞击，第四次碎裂');
    this.startLabel.setText(this.paused?'继续':round.phase==='over'?'再来一次':'开始挑战');
    this.values.forEach((node,i)=>node.setText(records[i]===undefined?'--.--   s':`${records[i]!.toFixed(2)}   s`));
    this.root.root.markDirty();
  }
  hit(x:number,y:number,canvas:HTMLCanvasElement) { return this.hud.hit(x,y,canvas); }
  snapshot() { const data=this.hud.snapshot();return {...data,nodes:data.nodes.map((node,i)=>({...node,id:this.root.root.children[i]!.id}))}; }
  get state() { return {remainingBalls:this.remaining,overlay:this.overlayVisible,musicIcon:this.muted?'music-off':'music',pauseIcon:this.paused?'play':'pause',musicRect:{...this.music.button.rect},pauseRect:{...this.pause.button.rect}}; }
}
