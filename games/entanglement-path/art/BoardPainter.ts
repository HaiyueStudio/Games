import { InkArt } from './InkArt';
import { INK, PAPER } from './inkNoise';
import { drawRiverTile, type RiverPaintOptions } from './RiverPainter';
import { cellPigment } from './inkNoise';
import type { RiverWetness } from './riverFlow';
import type { TerrainNode } from './terrainWfc';

interface Tile { id: number; variant: number; pairs: [number, number][] }
export type LifeTileAccent = 'center' | 'special';
/** One terrain/river/fog composition path for solo and versus, with caller-owned reusable canvases. */
export class BoardPainter {
  private readonly lifeMarks = new Map<string,HTMLCanvasElement>();
  private readonly washes = new WeakMap<HTMLCanvasElement,Map<LifeTileAccent,HTMLCanvasElement>>();
  constructor(private readonly art: InkArt) {}
  terrain(node: TerrainNode, tile: Tile, rotation: number, accent?: LifeTileAccent): HTMLCanvasElement {
    const base = this.art.connected.fitted(node, cellPigment(tile.id, tile.variant, 71), tile.pairs, rotation);
    if (!accent) return base;
    let variants=this.washes.get(base);
    if (!variants) { variants=new Map(); this.washes.set(base,variants); }
    let tinted=variants.get(accent);
    if (!tinted) {
      tinted=document.createElement('canvas');tinted.width=tinted.height=256;
      const ctx=tinted.getContext('2d')!;ctx.drawImage(base,0,0);
      // Pigment sits below every river and keeps the original terrain grain and alpha.
      ctx.globalCompositeOperation='color';ctx.fillStyle=accent==='special'?'#b67867':'#b59c69';
      ctx.fillRect(0,0,256,256);ctx.globalCompositeOperation='destination-in';ctx.drawImage(base,0,0);
      ctx.globalCompositeOperation='source-over';variants.set(accent,tinted);
    }
    return tinted;
  }
  preview(tile: Tile, rotation: number, entry: number | null, node?: TerrainNode): HTMLCanvasElement {
    return drawRiverTile(tile, rotation, { activeEntry: entry, baseImage: node ? this.terrain(node, tile, rotation) : null });
  }
  source(node: TerrainNode, exit: number | null, time = 0): HTMLCanvasElement {
    return drawRiverTile(null, 0, { sourceExit: exit, baseImage: this.art.connected.base(node), time });
  }
  lifeMark(center: boolean, lives: number, remaining: number): HTMLCanvasElement {
    const key = center ? `center:${lives}` : `grove:${remaining}`, cached = this.lifeMarks.get(key); if (cached) return cached;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256; const ctx = canvas.getContext('2d')!;
    if (center) {
      const wash = ctx.createRadialGradient(128,128,15,128,128,40);
      wash.addColorStop(0,'rgba(34,61,53,.98)'); wash.addColorStop(.7,'rgba(34,61,53,.92)'); wash.addColorStop(1,'rgba(34,61,53,0)');
      ctx.fillStyle = wash; ctx.beginPath(); ctx.arc(128,128,40,0,Math.PI*2); ctx.fill();
      this.art.drawNumber(ctx,lives,128,109,38,PAPER,'center');
    } else {
      const image = this.art.connected.atlas, w = image.width / 4, h = image.height / 4;
      ctx.globalAlpha = remaining > 0 ? .95 : .45;
      ctx.drawImage(image,3*w,3*h,w,h,101,102,54,49); ctx.globalAlpha = 1;
      ctx.fillStyle = remaining > 0 ? '#a55342' : INK;
      for (let i=0;i<3;i++) { ctx.beginPath(); ctx.arc(118+i*10,123+(i%2)*6,3.3,0,Math.PI*2); ctx.fill(); }
    }
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3-Math.PI/2, filled = center ? i < Math.min(6,lives) : i < remaining;
      ctx.fillStyle = filled ? center ? '#b28745' : '#487664' : 'rgba(77,103,82,.20)';
      ctx.beginPath(); ctx.ellipse(128+Math.cos(a)*43,128+Math.sin(a)*43,4.5,7,a+Math.PI/2,0,Math.PI*2); ctx.fill();
    }
    if(this.lifeMarks.size>=64) this.lifeMarks.delete(this.lifeMarks.keys().next().value!);
    this.lifeMarks.set(key,canvas); return canvas;
  }
  placed(node: TerrainNode, tile: Tile, rotation: number, wetness: RiverWetness[], time: number,
    fog = 0, target?: HTMLCanvasElement, guides: Pick<RiverPaintOptions, 'pulseEntries' | 'pulse'> = {}, accent?: LifeTileAccent): HTMLCanvasElement {
    const canvas = drawRiverTile(tile, rotation, { ...guides, wetness, time, baseImage: this.terrain(node, tile, rotation, accent), ...(target ? { target } : {}) });
    const ctx = canvas.getContext('2d')!;
    this.art.growBank(ctx, cellPigment(tile.id, tile.variant, 71), wetness);
    if (fog > 0) { ctx.globalAlpha = fog; ctx.drawImage(this.art.connected.fog(node), 0, 0); ctx.globalAlpha = 1; }
    return canvas;
  }
}
