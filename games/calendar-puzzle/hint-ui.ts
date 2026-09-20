import { GuiImage, type GuiImageSource, type GuiRoot } from '@haiyue/engine/gui';
import { CALENDAR_PIECES } from './model';
import { calendarOrientedCells } from './tray';
import type { CalendarPlacement } from './solver';
import { calendarLayout } from './viewport';
import { CalendarRasterSurface } from './raster-surface';
export type CalendarIcon = 'rotate' | 'flip' | 'shuffle' | 'hint' | 'settings';
export interface CalendarRaster {
  canvas: (w: number, h: number) => HTMLCanvasElement;
  texture: ((canvas: HTMLCanvasElement, key: string) => unknown) | undefined;
}
export function calendarIconSource(name: CalendarIcon, raster: CalendarRaster): GuiImageSource {
  const canvas = raster.canvas(128,128); canvas.width=128; canvas.height=128;
  const c = canvas.getContext('2d')!; c.scale(2,2); c.strokeStyle='#17847b'; c.fillStyle='#17847b'; c.lineWidth=3.6; c.lineCap='round'; c.lineJoin='round';
  const path=(points:number[][])=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x!,y!):c.moveTo(x!,y!));c.stroke();};
  if(name==='settings') {
    // Draw inside a padded texture, independent of Android font glyph bearings.
    c.beginPath();
    for(let i=0;i<64;i++) { const angle=i*Math.PI/32-Math.PI/2,r=[20,20,25,25,25,25,20,20][i%8]!; const x=32+Math.cos(angle)*r,y=32+Math.sin(angle)*r; if(i)c.lineTo(x,y);else c.moveTo(x,y); }
    c.closePath();c.stroke();c.beginPath();c.arc(32,32,8,0,Math.PI*2);c.stroke();
  }
  if(name==='rotate') {
    // Counterclockwise arc ends on a horizontal tangent; use a single, balanced arrowhead.
    c.beginPath(); c.arc(33,34,18,Math.PI*.9,-Math.PI/2,true); c.stroke();
    c.beginPath(); c.moveTo(24,16); c.lineTo(35,9); c.lineTo(35,23); c.closePath(); c.fill();
  }
  if(name==='flip') { path([[13,21],[25,14],[25,48],[13,41],[13,21]]);path([[51,21],[39,14],[39,48],[51,41],[51,21]]);c.lineWidth=2;path([[32,12],[32,52]]); }
  if(name==='shuffle') { path([[12,17],[20,17],[44,47],[53,47]]);path([[12,47],[20,47],[44,17],[53,17]]);path([[47,11],[53,17],[47,23]]);path([[47,41],[53,47],[47,53]]); }
  if(name==='hint') { c.beginPath();c.moveTo(25,44);c.lineTo(25,40);c.bezierCurveTo(9,29,18,13,32,13);c.bezierCurveTo(46,13,55,29,39,40);c.lineTo(39,44);c.closePath();c.stroke();path([[26,50],[38,50]]);path([[29,55],[35,55]]);for(const [x,y,u,v] of [[32,3,32,7],[9,14,13,17],[51,17,55,14],[6,33,11,33],[53,33,58,33]])path([[x!,y!],[u!,v!]]); }
  return (raster.texture?.(canvas,`calendar-icon-${name}`) ?? canvas) as GuiImageSource;
}
export class CalendarHintOverlay {
  private readonly images: GuiImage[] = [];
  private readonly surface: CalendarRasterSurface;
  private lastPiece = -1;
  private source: GuiImageSource | undefined;
  private pulseUntil = 0;
  get isAnimating(): boolean { return !!this.placement && performance.now() < this.pulseUntil; }
  placement: CalendarPlacement | null = null;
  private cells: Array<{x:number;y:number}> = [];
  constructor(private readonly root: GuiRoot, private readonly layout: () => ReturnType<typeof calendarLayout>, private readonly raster: CalendarRaster) {
    this.surface = new CalendarRasterSurface(raster.canvas, !!raster.texture);
    for(let i=0;i<5;i++) {
      const image=new GuiImage({disabled:true,visible:false});
      image.layout=()=>{const board=layout().board,c=this.cells[i]??{x:0,y:0},p=this.placement;
        image.rect={x:board.x+((p?.col??0)+c.x)*74,y:board.y+((p?.row??0)+c.y)*74,width:64,height:64};};
      this.images.push(image);root.add(image);
    }
  }
  show(p:CalendarPlacement):void {
    this.pulseUntil = performance.now() + 1200;
    this.placement=p;const piece=CALENDAR_PIECES[p.piece]!;
    this.cells=calendarOrientedCells(piece.cells,p.rotation,p.flipped);
    if (this.lastPiece !== p.piece || !this.source) {
    const canvas=this.surface.acquire(128,128);const c=canvas.getContext('2d')!;
    c.scale(2,2);c.fillStyle=piece.color;c.globalAlpha=.16;c.fillRect(2,2,60,60);c.globalAlpha=1;c.strokeStyle=piece.color;c.lineWidth=5;c.lineCap='round';
    for(const [x,y,sx,sy] of [[4,4,1,1],[60,4,-1,1],[4,60,1,-1],[60,60,-1,-1]]){c.beginPath();c.moveTo(x!+sx!*16,y!);c.lineTo(x!,y!);c.lineTo(x!,y!+sy!*16);c.stroke();}
    this.source=(this.raster.texture?.(canvas,'calendar-hint-target')??canvas) as GuiImageSource;
    this.lastPiece=p.piece;
    }
    this.images.forEach((image,i)=>{image.setSource(this.source!);image.setVisible(i<this.cells.length);});this.root.root.markDirty();
  }
  hide():void {this.placement=null;this.images.forEach(image=>image.setVisible(false));}
  dispose():void {this.hide();this.surface.dispose();this.source=undefined;this.lastPiece=-1;}
  update(time:number):void {if(this.placement)this.images.forEach(image=>image.setTint(`rgba(255,255,255,${time < this.pulseUntil ? .72+.28*Math.sin(time*.006)**2 : 1})`));}
}
