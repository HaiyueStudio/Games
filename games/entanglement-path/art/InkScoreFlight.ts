import type { InkArt } from './InkArt';
import { INK, inkHash, inkNoise } from './inkNoise';

export interface ScorePoint { x: number; y: number }
export interface ScoreLayout { from: ScorePoint; to: ScorePoint; height: number }
export const SCORE_RISE_MS = 640;
export const SCORE_FLY_MS = 840;
export const SCORE_LAND_MS = 420;
export const SCORE_COUNT_MS = 240;
export const SCORE_FLIGHT_MS = SCORE_RISE_MS + SCORE_FLY_MS + SCORE_LAND_MS;
const clamp = (n: number): number => Math.max(0,Math.min(1,n));
const smooth = (n: number): number => { const t=clamp(n);return t*t*(3-2*t); };

/** Keep the readout behind pending ink, then roll each receipt into its final total. */
export function displayedScore(actual: number, receipts: readonly {gain:number;start:number}[], now: number): number {
  const pending=receipts.reduce((sum,r)=>sum+r.gain*(1-smooth((now-r.start-SCORE_RISE_MS-SCORE_FLY_MS)/SCORE_COUNT_MS)),0);
  return Math.max(0,Math.min(actual,Math.round(actual-pending)));
}

export function scorePathPoint({from,to,height}: ScoreLayout, t: number): ScorePoint {
  const p=clamp(t),u=1-p,start={x:from.x,y:from.y-height*1.1},dx=to.x-start.x,dy=to.y-start.y;
  const a={x:start.x+dx*.12,y:start.y-Math.min(110,Math.abs(dy)*.25+35)};
  const b={x:to.x-dx*.20,y:to.y+Math.min(130,Math.abs(dy)*.20+25)};
  return {x:u**3*start.x+3*u*u*p*a.x+3*u*p*p*b.x+p**3*to.x,
    y:u**3*start.y+3*u*u*p*a.y+3*u*p*p*b.y+p**3*to.y};
}
/** Presentation only. The authoritative score is committed by the rules immediately. */
export function scoreFlightFrame(elapsed: number, layout: ScoreLayout) {
  const age=Math.max(0,elapsed),flight=clamp((age-SCORE_RISE_MS)/SCORE_FLY_MS);
  const rise=1-(1-clamp(age/SCORE_RISE_MS))**3,progress=smooth(flight);
  return {stage:age<SCORE_RISE_MS?'rise':age<SCORE_RISE_MS+SCORE_FLY_MS?'flight':age<SCORE_FLIGHT_MS?'land':'done',
    flight,progress,point:age<SCORE_RISE_MS?{x:layout.from.x,y:layout.from.y-layout.height*1.1*rise}:scorePathPoint(layout,progress),
    alpha:smooth(age/230)*(1-clamp(flight/.48)),dissolve:smooth(flight/.46),
    landing:clamp((age-SCORE_RISE_MS-SCORE_FLY_MS)/SCORE_LAND_MS)};
}
interface Fragment { x:number;y:number;alpha:number;seed:number }
interface Glyph { canvas:HTMLCanvasElement;fragments:Fragment[] }
interface Flight { gain:number;key:string;start:number;layout:()=>ScoreLayout;glyph:Glyph;reach:(()=>number)|undefined }

/** A bounded canvas effect shared by solo, life and both versus presentations. */
export class InkScoreFlight {
  private readonly art: InkArt;
  private readonly flights: Flight[]=[];
  private readonly glyphs=new Map<number,Glyph>();
  private readonly scratch=document.createElement('canvas');
  private readonly mask=document.createElement('canvas');
  private readonly wash=document.createElement('canvas');
  private readonly noise=new Float32Array(48*18);
  private readonly maskPixels: ImageData;
  private readonly scratchCtx: CanvasRenderingContext2D;
  private readonly maskCtx: CanvasRenderingContext2D;
  constructor(art: InkArt) {
    this.art=art;this.scratch.width=256;this.scratch.height=96;this.mask.width=48;this.mask.height=18;
    this.scratchCtx=this.scratch.getContext('2d')!;this.maskCtx=this.mask.getContext('2d')!;this.maskPixels=this.maskCtx.createImageData(48,18);
    for(let y=0;y<18;y++)for(let x=0;x<48;x++)this.noise[y*48+x]=inkNoise(x/3,y/3,639)*.75+inkHash(x,y,17)*.25;
    this.wash.width=this.wash.height=96;
    const ctx=this.wash.getContext('2d')!,fade=ctx.createRadialGradient(48,48,1,48,48,45);
    fade.addColorStop(0,'rgba(32,56,48,.8)');fade.addColorStop(.25,'rgba(38,65,55,.45)');fade.addColorStop(1,'rgba(42,74,60,0)');
    ctx.fillStyle=fade;ctx.fillRect(0,0,96,96);
  }
  get size(): number { return this.flights.length; }
  busy(now: number): boolean { this.syncStarts(now);return this.flights.some(f=>now-f.start<SCORE_FLIGHT_MS); }
  add(gain: number, key: string, now: number, layout: ()=>ScoreLayout, reach?:()=>number): void {
    if (!Number.isFinite(gain) || gain<=0) return;
    this.prune(now);
    // Covers every channel on both largest built-in boards, including a long combo.
    if(this.flights.length>=1024)this.flights.shift();
    this.flights.push({gain,key,start:reach?.()??now,layout,glyph:this.glyph(gain),reach});
  }
  clear(): void { this.flights.length=0; }
  display(actual: number, key: string, now: number): number {
    this.syncStarts(now);return displayedScore(actual,this.flights.filter(f=>f.key===key),now);
  }
  private syncStarts(now: number): void {
    for(const f of this.flights)if(f.reach) {
      const due=f.reach();
      if(due!==f.start)f.start=Math.max(now,due);
      if(now>=f.start)f.reach=undefined;
    }
  }
  private prune(now: number): void {
    this.syncStarts(now);
    for(let i=this.flights.length-1;i>=0;i--)if(now-this.flights[i]!.start>=SCORE_FLIGHT_MS)this.flights.splice(i,1);
  }
  pulse(key: string, now: number): number {
    this.syncStarts(now);
    let strength=0;
    for(const f of this.flights)if(f.key===key) {
      const elapsed=now-f.start-SCORE_RISE_MS-SCORE_FLY_MS;
      if(elapsed>=0&&elapsed<SCORE_LAND_MS)strength=Math.max(strength,Math.sin(elapsed/SCORE_LAND_MS*Math.PI));
    }
    return strength;
  }
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    this.prune(now);let detailed=0;
    for(const f of this.flights) {
      if(now<f.start)continue;
      const layout=f.layout(),frame=scoreFlightFrame(now-f.start,layout);
      if(frame.stage==='flight')this.drawStream(ctx,layout,frame.flight,frame.progress,detailed++<8?f.glyph.fragments:[]);
      if(frame.alpha>0) {
        const sprite=this.dissolve(f.glyph.canvas,frame.dissolve),scale=layout.height/56;
        ctx.save();ctx.globalAlpha=frame.alpha;ctx.shadowColor='rgba(243,232,206,.9)';ctx.shadowBlur=3;
        ctx.drawImage(sprite,frame.point.x-128*scale,frame.point.y-48*scale,256*scale,96*scale);ctx.restore();
      }
      if(frame.stage==='land')this.drawLanding(ctx,layout.to,layout.height,frame.landing);
    }
  }
  private glyph(gain: number): Glyph {
    let glyph=this.glyphs.get(gain);if(glyph)return glyph;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    this.art.drawNumber(ctx,`+${gain}`,128,20,56,INK,'center');
    const pixels=ctx.getImageData(0,0,256,96).data,fragments:Fragment[]=[];
    for(let y=8;y<88;y+=6)for(let x=8;x<248;x+=6) {
      const alpha=pixels[(y*256+x)*4+3]!/255;
      if(alpha>.12)fragments.push({x:(x-128)/56,y:(y-48)/56,alpha,seed:inkHash(x,y,gain)});
    }
    fragments.sort((a,b)=>a.seed-b.seed);glyph={canvas,fragments:fragments.slice(0,64)};
    if(this.glyphs.size>=16)this.glyphs.delete(this.glyphs.keys().next().value!);
    this.glyphs.set(gain,glyph);return glyph;
  }
  private dissolve(sprite: HTMLCanvasElement, progress: number): HTMLCanvasElement {
    if(progress<=0)return sprite;
    const ctx=this.scratchCtx;ctx.clearRect(0,0,256,96);ctx.globalCompositeOperation='source-over';ctx.drawImage(sprite,0,0);
    for(let i=0;i<this.noise.length;i++)this.maskPixels.data[i*4+3]=255*smooth((this.noise[i]!-progress*1.2+.1)/.22);
    this.maskCtx.putImageData(this.maskPixels,0,0);ctx.globalCompositeOperation='destination-in';ctx.drawImage(this.mask,0,0,256,96);
    ctx.globalCompositeOperation='source-over';return this.scratch;
  }
  private drawStream(ctx: CanvasRenderingContext2D, layout: ScoreLayout, flight: number, progress: number, fragments: Fragment[]): void {
    const opacity=smooth(flight/.14)*(1-smooth((flight-.88)/.12)),tail=Math.max(0,progress-.28),height=layout.height;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    let previous: ScorePoint | null=null;
    for(let i=0;i<=26;i++) {
      const along=i/26,t=tail+(progress-tail)*along,p=scorePathPoint(layout,t),grain=inkHash(i,3,173);
      const wander=Math.sin(i*.85+flight*4)*(1-along)*height*.045,point={x:p.x+wander,y:p.y-wander};
      const r=height*(.10+grain*.15)*(.3+along*.7);
      ctx.globalAlpha=opacity*(.12+along*.30);ctx.drawImage(this.wash,point.x-r*2,point.y-r*2,r*4,r*4);
      if(previous && grain>.18) {
        ctx.globalAlpha=opacity*(.15+along*.40);ctx.strokeStyle='#294b40';ctx.lineWidth=.6+grain*height*.04;
        ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(point.x,point.y);ctx.stroke();
      }
      previous=point;
    }
    const head=scorePathPoint(layout,progress);ctx.globalAlpha=opacity*.5;const radius=height*.24;ctx.drawImage(this.wash,head.x-radius,head.y-radius,radius*2,radius*2);
    for(const dot of fragments) {
      const delay=dot.seed*.26,p=clamp((flight-delay)/(1-delay)),t=smooth(p),point=scorePathPoint(layout,t),spread=(1-t)**2;
      const x=point.x+(dot.x+Math.sin(dot.seed*41+p*8)*p*.65)*height*spread;
      const y=point.y+(dot.y+Math.cos(dot.seed*29+p*6)*p*.65)*height*spread;
      const r=(1.7+dot.seed*2.6)*(height/32)*(1-t*.65);
      ctx.globalAlpha=dot.alpha*opacity*.65;ctx.drawImage(this.wash,x-r*2,y-r*2,r*4,r*4);
    }
    ctx.restore();
  }
  private drawLanding(ctx: CanvasRenderingContext2D, point: ScorePoint, height: number, progress: number): void {
    ctx.save();ctx.globalAlpha=(1-progress)*.30;const r=height*(.4+progress*1.1);ctx.drawImage(this.wash,point.x-r,point.y-r,r*2,r*2);
    ctx.strokeStyle='rgba(42,72,60,.4)';ctx.lineWidth=1;
    for(let i=0;i<7;i++) {const a=i*Math.PI*2/7+.2,n=height*(.15+progress*(.45+inkHash(i,7)*.25));ctx.beginPath();ctx.moveTo(point.x+Math.cos(a)*n*.4,point.y+Math.sin(a)*n*.4);ctx.lineTo(point.x+Math.cos(a)*n,point.y+Math.sin(a)*n);ctx.stroke();}
    ctx.restore();
  }
}
