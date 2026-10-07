import { Entity, type HaiyueEngine, type World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiImage, GuiLabel, GuiRoot, GuiSystem, type GuiRect } from '@haiyue/engine/gui';
import { parseFntJson, type BitmapFontData } from '@haiyue/engine/font';
import type { Control } from '../pinball/rules';
import { advanceScroll, newScroll, turnScroll } from './guiRules';
import { InkGuiEffects } from './InkGuiEffects';

const HELP = [
  '一滴墨，游山河',
  'A / ←  左挡板       D / →  右挡板',
  'W / ↑  一键发球；S / ↓ 按住蓄力，松开发球。',
  '手机：按住下方两侧挡板，接住落下的墨球。',
  '采莲 · 每朵 +250',
  '莲花会反弹墨球。集齐三朵，额外 +2000。',
  '灵珠生辉 · 仙鹤展翅',
  '连续撞击提高连击；点亮三鹤，额外 +1500。',
  '龙吟鱼跃 · 金蟾护卷',
  '龙口含住墨球后喷出，得 +500 分。',
  '金蟾救球后潜水 30 秒，空缺处要小心！',
  '三颗墨球落水后结束。P 暂停，R 重玩。',
];
const COPY = HELP.join('')+'墨迹未干，山河静候。或按住下方蓄墨再来一局。'+'墨游本局得分最高纪录龙鲤水墨弹球墨随心动第球连击暂歇静观山水继续游戏重玩本卷玩法与设置返回画卷声音开启关闭山水动效一卷已成再续山河按发球蓄墨左挡板右挡板按住蓄力松开发球帮助设置暂停载入●○Ⅱ↻×·←→↑↓';
export const INK_GUI_GLYPHS = [...new Set(Array.from(Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('')+COPY))].join('');
interface Actions { pause():void; resume():void; restart():void; help():void; sound():void; ambient():void; press(control:Control,id:number):void; release(id:number,cancel:boolean):void }
export interface InkHudState {score:number;best:number;balls:number;combo:number;charge:number;phase:string;paused:boolean;sound:boolean;ambient:boolean}
const PAPER='#eeeadd', INK='#454e40', MUTED='#777e6b', IVORY='#f1efdf';
type Rect = [number,number,number,number];
function place(e:GuiElement,r:GuiRect):void {e.rect=r;for(const child of e.children)child.layout(r);}
/** All numeric design positions scale against a 600 × 1200 portrait surface. */
export class InkGui {
  readonly system:GuiSystem;
  readonly effects:InkGuiEffects;
  readonly scroll=newScroll();
  private clock=0;
  private skinClock=0;
  private roots:GuiRoot[]=[];
  private buttons=new Map<string,GuiButton>();
  private activate=new Map<string,()=>void>();
  private skins=new Map<GuiButton,GuiImage>();
  private labels=new Map<string,GuiLabel>();
  private readonly hud:GuiRoot;
  private readonly help:GuiRoot;
  private readonly roll:GuiRoot;
  private readonly modal:GuiRoot;
  private readonly topCover:GuiElement;
  private readonly bottomCover:GuiElement;
  private readonly upperRod:GuiElement;
  private readonly lowerRod:GuiElement;
  private readonly banner:GuiElement;
  private readonly power:GuiElement;
  private readonly scoreDigits:GuiImage[]=[];
  private readonly bestDigits:GuiImage[]=[];
  private readonly floaters:Array<{label:GuiLabel;x:number;y:number;since:number}>=[];
  private readonly assets=new Map<string,HTMLImageElement>();
  private font!:BitmapFontData;
  private lastCharge=-1;
  private displayedScore=''; private displayedBest='';
  private current:InkHudState | null=null;
  private focusId='pause';
  private abort=new AbortController();
  constructor(private engine:HaiyueEngine,private world:World,private actions:Actions){
    this.system=new GuiSystem(engine,{loadOp:'load',font:{chars:INK_GUI_GLYPHS,fontFamily:'Kaiti SC, STKaiti, KaiTi, serif',fontSize:36,atlasSize:2048,padding:3}});
    this.effects=new InkGuiEffects(engine);
    this.hud=this.root('Ink HUD');
    this.image(this.hud.root,'title', [24,30,158,80]);
    this.label(this.hud.root,'edition','龙 鲤 · 水 墨 弹 球',[24,116,160,24],13,MUTED);
    this.image(this.hud.root,'score',[203,26,294,98]);
    this.label(this.hud.root,'score-caption','本 局 得 分',[225,12,250,20],14,INK);
    for(let i=0;i<6;i++)this.scoreDigits.push(this.image(this.hud.root,'digits',[244+i*31,56,29,39]));
    this.label(this.hud.root,'record-caption','最高纪录',[245,117,92,20],13,MUTED);
    for(let i=0;i<6;i++){ const digit=this.image(this.hud.root,'digits',[345+i*12,120,11,14]);digit.setTint('#535b49');this.bestDigits.push(digit); }
    this.button(this.hud.root,'pause','Ⅱ',[520,21,64,64],()=>actions.pause(),'drop',25);
    this.button(this.hud.root,'help','?',[524,88,56,56],()=>actions.help(),'drop',24);
    this.label(this.hud.root,'balls','',[24,1060,310,28],17,'#875346');
    this.label(this.hud.root,'combo','墨随心动',[347,1060,225,28],17,MUTED);
    this.label(this.hud.root,'board-left','A / ←',[132,944,94,24],14,MUTED);
    this.label(this.hud.root,'board-right','D / →',[361,944,94,24],14,MUTED);
    const track=this.shape(this.hud.root,[28,1094,544,3],'#92998040');
    this.power=this.shape(this.hud.root,[28,1094,0,3],'#985641');
    void track;
    for(const [id,text,r] of [['left','← 左挡板',[13,1110,178,62]],['charge','蓄墨 · 发球',[200,1110,200,67]],['right','右挡板 →',[409,1110,178,62]]] as [Control,string,Rect][]){
      const b=this.button(this.hud.root,id,text,r,()=>{},'score',19);
      b.on('pointerdown',e=>actions.press(id,e.detail.pointerId));
      b.on('pointerup',e=>actions.release(e.detail.pointerId,e.detail.nativeEvent.type==='pointercancel'));
    }
    this.label(this.hud.root,'hint','W / ↑ 发球 · S / ↓ 蓄力 · P 暂停',[42,1178,516,19],13,MUTED);
    this.banner=this.hud.add(new GuiElement({disabled:true}));this.box(this.banner,[65,675,470,102]);
    this.image(this.banner,'score',[0,0,470,102]);
    this.label(this.banner,'banner-title','一滴墨，游山河。',[20,29,430,30],23,IVORY);
    this.label(this.banner,'banner-detail','按 W / ↑ 发球，或按住下方蓄墨',[14,62,442,22],14,IVORY);
    for(let i=0;i<12;i++){const label=this.label(this.hud.root,`float-${i}`,'',[0,0,120,32],22,'#8e4737');label.setVisible(false);this.floaters.push({label,x:0,y:0,since:-100});}

    this.help=this.root('Ink help scroll');
    this.shape(this.help.root,[8,154,584,892],PAPER);
    const art=this.image(this.help.root,'landscape',[8,154,584,892]);art.setTint('#ffffff10');
    this.label(this.help.root,'help-title','玩法与设置',[60,194,480,55],34,INK);
    HELP.forEach((text,i)=>{const headings=[0,4,6,8].includes(i);this.label(this.help.root,`help-${i}`,text,[48,272+i*43,504,32],headings?22:19,headings?'#815140':INK);});
    this.shape(this.help.root,[65,817,470,1],'#a2a68e70');
    this.button(this.help.root,'sound','声音 · 开启',[65,837,226,76],()=>actions.sound());
    this.button(this.help.root,'ambient','山水动效 · 开启',[309,837,226,76],()=>actions.ambient(), 'score',18);
    this.button(this.help.root,'help-back','返回画卷',[180,942,240,80],()=>actions.help());
    this.help.root.setVisible(false);
    this.boardHitRegion(this.help);

    this.roll=this.root('Ink scroll rollers',true);
    this.topCover=this.shape(this.roll.root,[0,150,600,0],PAPER);
    this.bottomCover=this.shape(this.roll.root,[0,1050,600,0],PAPER);
    this.upperRod=this.shape(this.roll.root,[3,145,594,9],'#a0a58e');
    this.lowerRod=this.shape(this.roll.root,[3,1046,594,9],'#a0a58e');
    this.modal=this.root('Ink pause panel');
    this.shape(this.modal.root,[0,150,600,900],'#eae7dcaa');
    this.shape(this.modal.root,[57,408,486,391],'#e5e1d0');
    this.shape(this.modal.root,[63,414,474,379],PAPER);
    this.label(this.modal.root,'pause-title','暂歇 · 静观山水',[80,447,440,48],32,INK);
    this.label(this.modal.root,'pause-copy','墨迹未干，山河静候。',[85,503,430,28],19,MUTED);
    this.button(this.modal.root,'resume','继续游戏',[157,553,286,95],()=>actions.resume());
    this.button(this.modal.root,'restart','重玩本卷',[157,656,286,95],()=>actions.restart());
    this.modal.root.setVisible(false);
    this.boardHitRegion(this.modal);
    const fx=this.root('Ink GUI diffusion',true);
    const effect=fx.add(new GuiImage({source:this.effects.texture,disabled:true}));this.box(effect,[0,0,600,1200]);
    this.world.addSystem(this.system);
    window.addEventListener('keydown',e=>{
      if(e.code==='Tab'){e.preventDefault();const ids=this.activeButtons();if(!ids.length)return;this.buttons.get(this.focusId)?.handleBlur();const i=ids.indexOf(this.focusId);this.focusId=ids[(i+(e.shiftKey?ids.length-1:1))%ids.length]!;this.buttons.get(this.focusId)?.handleFocus();}
      if(e.code==='Enter'&&!e.repeat&&this.activeButtons().includes(this.focusId)){e.preventDefault();this.burst(this.buttons.get(this.focusId)!);this.activate.get(this.focusId)?.();}
    },{signal:this.abort.signal});
  }
  async init():Promise<void>{
    const files={title:'title-moyou-transparent.png',score:'score-panel.png',drop:'ink-drop-button.png',digits:'brush-digits.png',landscape:'landscape-plate.png'};
    await Promise.all(Object.entries(files).map(async([key,file])=>{const img=new Image();img.src=`./assets/${file}`;await img.decode();this.assets.set(key,img);}));
    const response=await fetch('./assets/brush-digits.fnt.json');if(!response.ok)throw new Error('Score bitmap font missing');this.font=parseFntJson(await response.json());
    this.effects.initSkins(this.assets.get('score')!,this.assets.get('drop')!);
    for(const root of this.roots){const visit=(e:GuiElement)=>{if(e instanceof GuiImage&&e.sourceKey)e.setSource(this.effects.skin(e.sourceKey)??this.assets.get(e.sourceKey)!,e.sourceKey);e.children.forEach(visit);};visit(root.root);}
    this.effects.render(0);
  }
  private boardHitRegion(root:GuiRoot):void {
    const hit=root.root.hitTest.bind(root.root);
    root.root.hitTest=(x,y)=>y<this.engine.displayWidth*.25 || y>this.engine.displayWidth*1.75 ? null : hit(x,y);
  }
  private root(name:string,disabled=false):GuiRoot {const root=new GuiRoot({id:name,disabled,theme:{fontSize:18,colors:{background:'#00000000',surface:'#00000000',border:'#00000000',primary:INK,text:INK,textMuted:MUTED,hover:'#00000000',active:INK,disabled:MUTED,danger:'#874b3e'}}});const e=new Entity(name);e.addComponent(root);this.world.addEntity(e);this.roots.push(root);return root;}
  private box(e:GuiElement,r:Rect):void {e.layout=p=>{const scale=this.engine.displayWidth/600;place(e,{x:p.x+r[0]*scale,y:p.y+r[1]*scale,width:r[2]*scale,height:r[3]*scale});};e.markDirty();}
  private shape(parent:GuiElement,r:Rect,color:string):GuiElement {const e=parent.add(new GuiElement({disabled:true,style:{backgroundColor:color,borderColor:'#00000000',radius:0}}));this.box(e,r);return e;}
  private image(parent:GuiElement,key:string,r:Rect):GuiImage {const e=parent.add(new GuiImage({sourceKey:key,disabled:true}));this.box(e,r);return e;}
  private label(parent:GuiElement,id:string,text:string,r:Rect,size:number,color:string):GuiLabel {const e=parent.add(new GuiLabel({id,text,fontSize:size,textAlign:'center',style:{color,padding:0}}));e.layout=p=>{const scale=this.engine.displayWidth/600;e.fontSize=size*scale;place(e,{x:p.x+r[0]*scale,y:p.y+r[1]*scale,width:r[2]*scale,height:r[3]*scale});};this.labels.set(id,e);return e;}
  private button(parent:GuiElement,id:string,text:string,r:Rect,click:()=>void,skin='score',size=22):GuiButton {
    const b=parent.add(new GuiButton({id,text:'',style:{backgroundColor:'#00000000',hoverBackgroundColor:'#00000000',borderColor:'#00000000',radius:0},onClick:()=>click()}));this.box(b,r);this.buttons.set(id,b);this.activate.set(id,click);
    const img=this.image(b,skin,[0,0,r[2],r[3]]);this.skins.set(b,img);
    this.label(b,`button-${id}`,text,[0,0,r[2],r[3]],size,IVORY);
    b.on('pointerdown',()=>{this.burst(b);img.setTint('#b7c6a6');});b.on('pointerup',()=>img.setTint('#ffffff'));b.on('pointerleave',()=>img.setTint('#ffffff'));return b;
  }
  private burst(b:GuiButton):void {const scale=600/this.engine.displayWidth;this.effects.burst((b.rect.x+b.rect.width*.5)*scale,(b.rect.y+b.rect.height*.5)*scale,this.clock,Math.max(45,b.rect.width*scale*.48));}
  turnHelp():boolean{return turnScroll(this.scroll,this.scroll.page==='game'?'help':'game',this.clock);}
  get busy():boolean{return this.scroll.phase!=='idle';}
  get helping():boolean{return this.scroll.page==='help'||this.scroll.target==='help'||this.busy;}
  private digits(nodes:GuiImage[],value:string):void {nodes.forEach((node,i)=>{const g=this.font.chars.get(value.charCodeAt(i))!;node.setUv([g.x/this.font.scaleW,g.y/this.font.scaleH,g.width/this.font.scaleW,g.height/this.font.scaleH]);});}
  sync(s:InkHudState):void {
    this.current=s;
    const score=String(s.score).padStart(6,'0'),best=String(s.best).padStart(6,'0');
    if(score!==this.displayedScore){this.displayedScore=score;this.digits(this.scoreDigits,score.slice(-6));}
    if(best!==this.displayedBest){this.displayedBest=best;this.digits(this.bestDigits,best.slice(-6));}
    this.labels.get('button-help')!.setText(this.scroll.page==='help'?'←':'?');
    this.labels.get('balls')!.setText('● '.repeat(s.balls)+'○ '.repeat(3-s.balls)+` 第 ${Math.min(3,4-s.balls)} 球`);
    this.labels.get('combo')!.setText(s.combo>1?`×${s.combo} 连击`:'墨随心动');
    if(s.charge!==this.lastCharge){this.lastCharge=s.charge;this.box(this.power,[28,1094,544*s.charge,3]);}
    this.labels.get('button-sound')!.setText(`声音 · ${s.sound?'开启':'关闭'}`);
    this.labels.get('button-ambient')!.setText(`山水动效 · ${s.ambient?'开启':'关闭'}`);
    this.banner.setVisible(!s.paused&&s.phase!=='playing'&&!this.helping);
    this.labels.get('banner-title')!.setText(s.phase==='over'?'一卷已成，再续山河。':'一滴墨，游山河。');
    this.labels.get('banner-detail')!.setText(s.phase==='over'?`本局 ${s.score} 分 · 按 W / ↑ 再来一局`:'按 W / ↑ 发球，或按住下方蓄墨');
    this.modal.root.setVisible(s.paused&&!this.helping);
    for(const id of ['left','right','charge'])this.buttons.get(id)!.setDisabled(s.paused||this.helping);
    this.buttons.get('pause')!.setDisabled(this.helping);
    this.buttons.get('help')!.setDisabled(this.busy);
  }
  animate(delta:number):void {
    this.clock+=Math.max(0,delta);const previous=this.scroll.open;advanceScroll(this.scroll,this.clock);
    this.help.root.setVisible(this.scroll.page==='help');
    if(previous!==this.scroll.open){const h=(1-this.scroll.open)*450;this.box(this.topCover,[0,150,600,h]);this.box(this.bottomCover,[0,1050-h,600,h]);this.box(this.upperRod,[3,145+h,594,9]);this.box(this.lowerRod,[3,1046-h,594,9]);this.roll.root.markDirty();}
    for(const f of this.floaters){const age=this.clock-f.since;f.label.setVisible(age<.75&&!this.helping&&!this.current?.paused);if(age<.75){this.box(f.label,[f.x-60,f.y-age*50,120,32]);f.label.setStyle({color:`rgba(135,66,49,${Math.max(0,1-age/.75)})`});}}
    for(const [b,img] of this.skins)img.setTint(b.pressed?'#b7c6a6':b.hovered?'#e0e7d7':'#ffffff');
    if(this.current?.ambient && !this.current.paused)this.skinClock+=Math.max(0,delta);
    this.effects.renderSkins(this.skinClock);
    this.effects.render(this.clock);
  }
  feedback(x:number,y:number,points:number):void {const f=this.floaters.reduce((a,b)=>a.since<b.since?a:b);f.x=x+300;f.y=600-y-38;f.since=this.clock;f.label.setText(`+${points}`);}
  reset():void {Object.assign(this.scroll,newScroll());for(const f of this.floaters)f.since=-100;this.box(this.topCover,[0,150,600,0]);this.box(this.bottomCover,[0,1050,600,0]);this.box(this.upperRod,[3,145,594,9]);this.box(this.lowerRod,[3,1046,594,9]);this.help.root.setVisible(false);this.modal.root.setVisible(false);}
  private activeButtons():string[]{if(this.busy)return[];if(this.scroll.page==='help')return['sound','ambient','help-back','help'];if(this.current?.paused)return['resume','restart','help'];return['pause','help'];}
  snapshot(){return{renderer:'engine-gui',scroll:{...this.scroll},pauseVisible:this.modal.root.visible,score:this.displayedScore,best:this.displayedBest,bitmapGlyphs:this.scoreDigits.length+this.bestDigits.length,buttonBursts:this.effects.active,effectPasses:this.effects.passes,skinPasses:this.effects.skinPasses,viewport:{...this.hud.viewport},buttons:Object.fromEntries([...this.buttons].map(([id,b])=>[id,{...b.rect}])),activeButtons:this.activeButtons(),settings:{sound:this.current?.sound,ambient:this.current?.ambient}};}
  dispose():void{this.abort.abort();this.effects.dispose();}
}
