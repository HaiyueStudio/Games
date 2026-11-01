import { InkArt, INK_FONT } from '../art/InkArt';
import { BoardPreview } from '../art/BoardPreview';
import { boardCenter, boardPlaneSize, boardAngle, hexPlaneSize } from '../art/hexGeometry';
import { INK, PAPER, inkHash, inkNoise } from '../art/inkNoise';
import { lifeLevel } from './LifeRun';
import { MODE_CHOICES, SCROLL_CLOSE_MS, SCROLL_OPEN_MS, PREVIEW_CHANGE_MS, wrappedIndex, scrollAmount, previewAlpha,
  type GameMode, type SelectionChoice } from './SelectionRules';
import type { DrawingLevel } from './VersusView';
import type { Point, Rect } from './BoardInteraction';

type Phase='closed'|'closing-menu'|'opening-menu'|'browse'|'closing-game'|'waiting'|'opening-game'|'closing-back'|'opening-back';
type Hit='board-prev'|'board-next'|'mode-prev'|'mode-next'|'start'|'back';
interface Options {
  art: InkArt; levels: DrawingLevel[]; now: ()=>number;
  apply: (choice: SelectionChoice)=>Promise<void>; resumed: ()=>void; announce: (text:string)=>void;
}
const surface=(w:number,h:number)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const copy=(source:HTMLCanvasElement)=>{const c=surface(source.width,source.height);c.getContext('2d')!.drawImage(source,0,0);return c;};

/** A canvas-native page, also visible and interactive inside Game OS screen textures. */
export class BoardSelector {
  readonly canvas=surface(1,1);
  readonly previews=new BoardPreview();
  phase: Phase='closed';
  choice: SelectionChoice={mode:'solo',board:0,seed:0};
  redrawn=false;
  private readonly options: Options;
  private started=0;
  private readonly page=surface(1,1);
  private readonly hero=surface(720,560);
  private readonly incoming=surface(720,560);
  private readonly scratch=surface(720,560);
  private readonly mask=surface(144,112);
  private readonly noise=new Float32Array(144*112);
  private readonly maskPixels: ImageData;
  private readonly startInk: HTMLCanvasElement;
  private readonly sketches=new Map<string,HTMLCanvasElement>();
  private readonly hits=new Map<Hit,Rect>();
  private entry:HTMLCanvasElement|null=null;
  private previous: HTMLCanvasElement | null=null;
  private changeAt=-Infinity;
  private direction=1;
  private pointerPoint: Point | null=null;
  private width=1;
  private height=1;
  private dirty=true;
  private frame=-1;
  private request=0;
  private disposed=false;
  private cancelQueued=false;
  private error='';
  constructor(options:Options) {
    this.options=options;this.startInk=options.art.panel('dark',240,58);
    this.maskPixels=this.mask.getContext('2d')!.createImageData(144,112);
    for(let y=0;y<112;y++)for(let x=0;x<144;x++)this.noise[y*144+x]=inkNoise(x/10,y/10,817)*.7+inkNoise(x/3,y/3,829)*.3;
  }
  get visible(): boolean {return this.phase!=='closed';}
  get revealsGame(): boolean {return this.phase==='opening-game'||this.phase==='opening-back';}
  get description(): string {return `选卷：${this.boardName()}，${MODE_CHOICES.find(m=>m.id===this.choice.mode)!.name}。左右换卷，上下换式，回车入局，B 返回。`;}
  open(choice:SelectionChoice, source:HTMLCanvasElement|null): void {
    if(this.visible||this.disposed)return;
    this.choice={...choice};this.entry=source?surface(Math.min(source.width,1600),Math.max(1,Math.round(source.height*Math.min(source.width,1600)/source.width))):null;
    if(source&&this.entry)this.entry.getContext('2d')!.drawImage(source,0,0,this.entry.width,this.entry.height);
    this.phase='closing-menu';this.started=this.options.now();this.previous=null;this.changeAt=-Infinity;this.cancelQueued=false;this.error='';this.dirty=true;
    this.loadPreview();this.options.announce(this.description);
  }
  stepBoard(delta:number): void {
    if(this.phase!=='browse'||this.choice.mode==='life')return;
    this.change(()=>{this.choice.board=wrappedIndex(this.choice.board+delta,this.options.levels.length);},delta);
  }
  stepMode(delta:number): void {
    if(this.phase!=='browse')return;
    this.change(()=>{const i=MODE_CHOICES.findIndex(m=>m.id===this.choice.mode);this.choice.mode=MODE_CHOICES[wrappedIndex(i+delta,MODE_CHOICES.length)]!.id;},delta);
  }
  private change(update:()=>void,direction:number): void {
    this.previous=copy(this.hero);update();this.changeAt=this.options.now();this.direction=direction;this.error='';this.dirty=true;
    this.loadPreview();this.options.announce(this.description);
  }
  confirm(): void {if(this.phase==='browse'){this.phase='closing-game';this.started=this.options.now();this.dirty=true;}}
  cancel(): void {
    if(this.phase==='browse'){this.phase='closing-back';this.started=this.options.now();this.dirty=true;}
    else if(this.phase==='closing-menu'||this.phase==='opening-menu')this.cancelQueued=true;
  }
  key(event: KeyboardEvent): boolean {
    if(!this.visible)return false;
    const key=event.key.toLowerCase();event.preventDefault();
    if(event.repeat&&!['arrowleft','arrowright','arrowup','arrowdown'].includes(key))return true;
    if(key==='arrowleft'||key==='[')this.stepBoard(-1);
    else if(key==='arrowright'||key===']'||key==='r')this.stepBoard(1);
    else if(key==='arrowup')this.stepMode(-1);
    else if(key==='arrowdown'||key==='m')this.stepMode(1);
    else if(key==='b'||key==='escape')this.cancel();
    else if(key==='enter'||key===' ')this.confirm();
    return true;
  }
  click(x:number,y:number): void {
    if(this.phase!=='browse')return;
    for(const [hit,r] of this.hits)if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h) {
      if(hit==='board-prev')this.stepBoard(-1);else if(hit==='board-next')this.stepBoard(1);
      else if(hit==='mode-prev')this.stepMode(-1);else if(hit==='mode-next')this.stepMode(1);
      else if(hit==='start')this.confirm();else this.cancel();return;
    }
  }
  move(point:Point|null): void {this.pointerPoint=point;this.dirty=true;}
  swipe(from:Point,to:Point): boolean {
    if(!this.visible)return false;
    const dx=to.x-from.x,dy=to.y-from.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))<38)return false;
    if(Math.abs(dy)>Math.abs(dx))this.stepMode(dy<0?1:-1);
    else if(from.y>this.height*.66)this.stepMode(dx<0?1:-1);else this.stepBoard(dx<0?1:-1);
    return true;
  }
  private level(): DrawingLevel {return this.options.levels[this.choice.mode==='life'?0:this.choice.board]!;}
  private boardName(index=this.choice.board): string {return this.choice.mode==='life'?'续流 · 无界':this.options.levels[index]!.name;}
  private loadPreview(): void {
    const level=this.level(),life=this.choice.mode==='life',key=this.previews.key(level,this.choice.seed,life),request=++this.request;
    if(!this.previews.get(level,this.choice.seed,life))void this.previews.request(level,this.choice.seed,life).then(image=>{
      if(!image||this.disposed||request!==this.request||key!==this.previews.key(this.level(),this.choice.seed,this.choice.mode==='life'))return;
      this.previous=copy(this.hero);this.changeAt=this.options.now();this.direction=0;this.dirty=true;
    }).catch(()=>{if(request===this.request){this.error='山河预览未完成，可重试或直接入局';this.dirty=true;}});
    if(!life)for(const delta of [-1,1]){const next=this.options.levels[wrappedIndex(this.choice.board+delta,this.options.levels.length)]!;void this.previews.request(next,this.choice.seed,false).then(image=>{if(image&&!this.disposed)this.dirty=true;}).catch(()=>null);}
  }
  private image(level:DrawingLevel,life:boolean): HTMLCanvasElement {
    const cached=this.previews.get(level,this.choice.seed,life);if(cached)return cached;
    const id=life?'life':level.id;let sketch=this.sketches.get(id);if(sketch)return sketch;
    sketch=surface(720,560);const ctx=sketch.getContext('2d')!,l=life?{...level,...lifeLevel(level),orientation:'pointy' as const}:level;
    const pts=l.cells.map(c=>boardCenter(c.q,c.r,l.hexScreen,l.orientation)),size=boardPlaneSize(l.hexScreen,l.orientation),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2,s=Math.min(660/(Math.max(...xs)-Math.min(...xs)+size.width),510/(Math.max(...ys)-Math.min(...ys)+size.height)),tile=hexPlaneSize(l.hexScreen);
    ctx.translate(360,280);ctx.scale(s,s);ctx.translate(-cx,-cy);
    for(const [i,c] of l.cells.entries()) {
      const p=pts[i]!,wall=l.wallKeys.has(`${c.q},${c.r}`);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(boardAngle(l.orientation));
      ctx.beginPath();for(let k=0;k<6;k++){const a=(-30+k*60)*Math.PI/180,x=Math.cos(a)*tile.width*.45,y=Math.sin(a)*tile.height*.45;if(k)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();
      ctx.fillStyle=wall?'rgba(55,78,66,.75)':`rgba(100,133,116,${.16+inkHash(c.q,c.r,23)*.12})`;ctx.fill();ctx.strokeStyle='rgba(243,232,206,.7)';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    }
    this.sketches.set(id,sketch);return sketch;
  }
  private masked(source:HTMLCanvasElement,progress:number,incoming:boolean): HTMLCanvasElement {
    const pixels=this.maskPixels.data;
    for(let i=0;i<this.noise.length;i++)pixels[i*4+3]=255*previewAlpha(this.noise[i]!,progress,incoming);
    this.mask.getContext('2d')!.putImageData(this.maskPixels,0,0);
    const ctx=this.scratch.getContext('2d')!;ctx.clearRect(0,0,720,560);ctx.globalCompositeOperation='source-over';ctx.drawImage(source,0,0,720,560);
    ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.mask,0,0,720,560);ctx.globalCompositeOperation='source-over';return this.scratch;
  }
  private composeHero(now:number): HTMLCanvasElement {
    const next=this.incoming.getContext('2d')!,image=this.image(this.level(),this.choice.mode==='life');next.clearRect(0,0,720,560);
    if(this.choice.mode==='race'){next.globalAlpha=.85;next.drawImage(image,-28,95,450,350);next.globalAlpha=1;next.drawImage(image,298,95,450,350);}
    else next.drawImage(image,0,0);
    const ctx=this.hero.getContext('2d')!,t=Math.max(0,Math.min(1,(now-this.changeAt)/PREVIEW_CHANGE_MS));ctx.clearRect(0,0,720,560);
    if(this.previous&&t<1){ctx.drawImage(this.masked(this.previous,t,false),-this.direction*t*34,0);ctx.drawImage(this.masked(this.incoming,t,true),this.direction*(1-t)*34,0);}
    else {ctx.drawImage(this.incoming,0,0);this.previous=null;}
    return this.hero;
  }
  private hovered(r:Rect): boolean {const p=this.pointerPoint;return !!p&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;}
  private arrow(ctx:CanvasRenderingContext2D,x:number,y:number,direction:number,hit:Hit,enabled=true): void {
    const r={x:x-24,y:y-27,w:48,h:54};if(enabled)this.hits.set(hit,r);
    ctx.save();ctx.translate(x,y);ctx.scale(direction,1);ctx.globalAlpha=enabled?(this.hovered(r)?1:.68):.18;
    ctx.strokeStyle=INK;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=3.7;
    ctx.beginPath();ctx.moveTo(-8,-13);ctx.lineTo(6,0);ctx.lineTo(-9,13);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-10,-11);ctx.lineTo(4,0);ctx.lineTo(-10,11);ctx.stroke();ctx.restore();
  }
  private drawPage(now:number,w:number,h:number): void {
    const ctx=this.page.getContext('2d')!,dpr=this.page.width/w;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(this.options.art.landscape,0,0,w,h);this.hits.clear();
    const portrait=w/h<.95,compact=!portrait&&h<560,life=this.choice.mode==='life',center=w/2;
    ctx.drawImage(this.options.art.titleImage,portrait?center-75:w*.06,h*(portrait?.115:.12),portrait?150:compact?145:190,portrait?53:compact?51:67);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=INK;ctx.font=`${portrait?21:25}px ${INK_FONT}`;ctx.fillText('择 一 卷 山 河',center,h*(portrait?.235:.16));
    ctx.font=`${portrait?11:14}px ${INK_FONT}`;ctx.globalAlpha=.65;ctx.fillText(`同种山河 · ${this.choice.seed}`,portrait?center:w*.82,h*(portrait?.195:.16));ctx.globalAlpha=1;
    const heroW=Math.min(w*(portrait?.76:.43),h*(portrait?.46:compact?.48:.55)),heroH=heroW*560/720,heroY=h*(portrait?.42:compact?.38:.40);
    if(!life)for(const delta of [-1,1]) {
      const index=wrappedIndex(this.choice.board+delta,this.options.levels.length),image=this.image(this.options.levels[index]!,false),sideW=heroW*(portrait?.42:.44),x=center+delta*w*(portrait?.47:.325);
      ctx.globalAlpha=.27;ctx.drawImage(image,x-sideW/2,heroY-sideW*560/720/2,sideW,sideW*560/720);ctx.globalAlpha=.55;ctx.font=`${portrait?13:19}px ${INK_FONT}`;if(!portrait)ctx.fillText(this.options.levels[index]!.name,x,heroY+sideW*.47);ctx.globalAlpha=1;
      const r={x:Math.max(w*.04,x-sideW/2),y:heroY-sideW*.4,w:sideW,h:sideW*.8};this.hits.set(delta<0?'board-prev':'board-next',r);
    }
    ctx.drawImage(this.composeHero(now),center-heroW/2,heroY-heroH/2,heroW,heroH);
    this.arrow(ctx,w*(portrait?.105:.265),heroY,-1,'board-prev',!life);this.arrow(ctx,w*(portrait?.895:.735),heroY,1,'board-next',!life);
    ctx.fillStyle=INK;ctx.font=`${portrait?28:compact?24:33}px ${INK_FONT}`;ctx.fillText(this.boardName(),center,h*(portrait||compact?.596:.626));
    const lineY=compact?h*.596+17:h*(portrait?.621:.653);
    ctx.save();ctx.globalAlpha=.55;ctx.strokeStyle='#a25843';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(center-45,lineY);ctx.quadraticCurveTo(center,lineY+1.5,center+45,lineY);ctx.stroke();ctx.restore();
    ctx.font=`${portrait||compact?12:15}px ${INK_FONT}`;
    const detail=life?'不设边界，循水续写山河':this.choice.board===0?'六向围合，循水而行':this.choice.board===1?'环山小境，步步回旋':this.choice.board===2?'三岔分野，曲水相逢':'六瓣山河，百转千回';
    if(!compact)ctx.fillText(detail,center,h*(portrait?.651:.686));
    for(let i=0;i<(life?1:this.options.levels.length);i++){ctx.globalAlpha=(life?i===0:i===this.choice.board)?1:.22;ctx.fillStyle='#7c4536';ctx.beginPath();ctx.arc(center+(i-((life?1:this.options.levels.length)-1)/2)*15,h*(portrait||compact?.675:.709),2.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.fillStyle=INK;
    const modeIndex=MODE_CHOICES.findIndex(m=>m.id===this.choice.mode),modeY=h*(portrait?.726:compact?.72:.750);
    ctx.font=`${portrait?23:compact?20:25}px ${INK_FONT}`;ctx.fillText(MODE_CHOICES[modeIndex]!.name,center,modeY);
    this.arrow(ctx,center-(portrait?100:155),modeY,-1,'mode-prev');this.arrow(ctx,center+(portrait?100:155),modeY,1,'mode-next');
    if(!portrait){ctx.font=`15px ${INK_FONT}`;ctx.globalAlpha=.4;ctx.fillText(MODE_CHOICES[wrappedIndex(modeIndex-1,4)]!.name,center-245,modeY);ctx.fillText(MODE_CHOICES[wrappedIndex(modeIndex+1,4)]!.name,center+245,modeY);ctx.globalAlpha=1;}
    ctx.font=`${portrait?11:compact?12:14}px ${INK_FONT}`;ctx.fillText(this.error||MODE_CHOICES[modeIndex]!.description,center,h*(portrait?.772:compact?.774:.788));
    const startH=compact?36:46,start={x:center-(portrait?85:110),y:h*(portrait?.829:.844)-startH/2,w:portrait?170:220,h:startH};this.hits.set('start',start);
    ctx.globalAlpha=this.hovered(start)?1:.91;ctx.drawImage(this.startInk,start.x,start.y,start.w,start.h);ctx.globalAlpha=1;ctx.fillStyle=PAPER;ctx.font=`${portrait?20:compact?18:22}px ${INK_FONT}`;ctx.fillText('展 卷 入 局',center,start.y+start.h/2);
    const back={x:w*(portrait?.05:.84),y:h*(portrait?.123:.11),w:portrait?58:110,h:36};this.hits.set('back',back);ctx.fillStyle=INK;ctx.font=`${portrait?13:16}px ${INK_FONT}`;ctx.fillText('返回此局',back.x+back.w/2,back.y+back.h/2);
    ctx.font=`${portrait?10:12}px ${INK_FONT}`;ctx.fillStyle=PAPER;ctx.globalAlpha=.75;ctx.fillText(portrait?'滑动换卷 · 上下换式 · A 入局 · B 返回':'← → / X、Y 换卷 · ↑ ↓ 换式 · A / 回车入局 · B 返回',center,h*.942);ctx.globalAlpha=1;
  }
  private drawScroll(ctx:CanvasRenderingContext2D,source:HTMLCanvasElement|null,amount:number,w:number,h:number): void {
    const image=this.options.art.landscape,rod=Math.max(12,w*.038),half=(w-rod)/2*amount,left=w/2-half,right=w/2+half;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#1b2927';ctx.beginPath();ctx.rect(0,0,w,h);if(!source)ctx.rect(left,0,right-left,h);ctx.fill('evenodd');
    if(source){ctx.save();ctx.beginPath();ctx.rect(left,0,right-left,h);ctx.clip();ctx.drawImage(source,0,0,w,h);ctx.restore();}
    const sw=image.width*.048;ctx.drawImage(image,0,0,sw,image.height,left-rod/2,0,rod,h);ctx.drawImage(image,image.width-sw,0,sw,image.height,right-rod/2,0,rod,h);
  }
  render(now:number,rect:{width:number;height:number},game?:HTMLCanvasElement): HTMLCanvasElement|null {
    this.redrawn=false;if(!this.visible)return null;
    let elapsed=now-this.started;
    if(this.phase==='closing-menu'&&elapsed>=SCROLL_CLOSE_MS){this.phase='opening-menu';this.started=now;elapsed=0;this.dirty=true;}
    else if(this.phase==='opening-menu'&&elapsed>=SCROLL_OPEN_MS){this.phase='browse';this.dirty=true;if(this.cancelQueued){this.cancel();elapsed=0;}}
    else if(this.phase==='closing-back'&&elapsed>=SCROLL_CLOSE_MS){this.phase='opening-back';this.started=now;elapsed=0;}
    else if(this.phase==='closing-game'&&elapsed>=SCROLL_CLOSE_MS){
      this.phase='waiting';this.started=now;elapsed=0;
      void this.options.apply({...this.choice}).then(()=>{if(!this.disposed){this.phase='opening-game';this.started=this.options.now();this.dirty=true;}})
        .catch(()=>{if(!this.disposed){this.error='山河绘制未完成，请重试';this.phase='opening-menu';this.started=this.options.now();this.dirty=true;}});
    } else if((this.phase==='opening-back'||this.phase==='opening-game')&&elapsed>=SCROLL_OPEN_MS){this.phase='closed';this.options.resumed();return null;}
    const w=Math.max(1,rect.width),h=Math.max(1,rect.height),dpr=Math.min(devicePixelRatio||1,2,2048/w,2048/h),pw=Math.round(w*dpr),ph=Math.round(h*dpr);
    if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=this.page.width=pw;this.canvas.height=this.page.height=ph;this.dirty=true;}
    this.width=w;this.height=h;
    // Draw the final frame too, so composeHero releases the outgoing image before going idle.
    const changing=!!this.previous,frame=Math.floor(now/16);
    if(this.phase==='browse'&&!this.dirty&&!changing)return this.canvas;
    if(this.frame===frame&&!this.dirty)return this.canvas;
    this.frame=frame;this.redrawn=true;this.dirty=false;
    const ctx=this.canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);
    if(this.phase==='browse'){this.drawPage(now,w,h);ctx.clearRect(0,0,w,h);ctx.drawImage(this.page,0,0,w,h);}
    else if(this.phase==='closing-menu')this.drawScroll(ctx,this.entry,scrollAmount(elapsed,false),w,h);
    else if(this.phase==='opening-menu'){this.drawPage(now,w,h);this.drawScroll(ctx,this.page,scrollAmount(elapsed,true),w,h);}
    else if(this.phase==='closing-game'||this.phase==='closing-back'){this.drawPage(now,w,h);this.drawScroll(ctx,this.page,scrollAmount(elapsed,false),w,h);}
    else if(this.phase==='waiting') {this.drawScroll(ctx,null,0,w,h);ctx.fillStyle=PAPER;ctx.font=`15px ${INK_FONT}`;ctx.textAlign='center';ctx.fillText('落墨成山…',w/2,h*.84);}
    else this.drawScroll(ctx,game??null,scrollAmount(elapsed,true),w,h);
    return this.canvas;
  }
  dispose(): void {this.disposed=true;this.phase='closed';this.previews.dispose();this.sketches.clear();this.hits.clear();}
}
