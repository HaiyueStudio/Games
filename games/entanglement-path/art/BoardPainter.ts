import { InkArt } from './InkArt';
import { drawRiverTile, type RiverPaintOptions } from './RiverPainter';
import { cellPigment } from './inkNoise';
import type { RiverWetness } from './riverFlow';
import type { TerrainNode } from './terrainWfc';

interface Tile { id: number; variant: number; pairs: [number, number][] }
/** One terrain/river/fog composition path for solo and versus, with caller-owned reusable canvases. */
export class BoardPainter {
  constructor(private readonly art: InkArt) {}
  terrain(node: TerrainNode, tile: Tile, rotation: number): HTMLCanvasElement {
    return this.art.connected.fitted(node, cellPigment(tile.id, tile.variant, 71), tile.pairs, rotation);
  }
  preview(tile: Tile, rotation: number, entry: number | null, node?: TerrainNode): HTMLCanvasElement {
    return drawRiverTile(tile, rotation, { activeEntry: entry, baseImage: node ? this.terrain(node, tile, rotation) : null });
  }
  source(node: TerrainNode, exit: number | null, time = 0): HTMLCanvasElement {
    return drawRiverTile(null, 0, { sourceExit: exit, baseImage: this.art.connected.base(node), time });
  }
  placed(node: TerrainNode, tile: Tile, rotation: number, wetness: RiverWetness[], time: number,
    fog = 0, target?: HTMLCanvasElement, guides: Pick<RiverPaintOptions, 'pulseEntries' | 'pulse'> = {}): HTMLCanvasElement {
    const canvas = drawRiverTile(tile, rotation, { ...guides, wetness, time, baseImage: this.terrain(node, tile, rotation), ...(target ? { target } : {}) });
    const ctx = canvas.getContext('2d')!;
    this.art.growBank(ctx, cellPigment(tile.id, tile.variant, 71), wetness);
    if (fog > 0) { ctx.globalAlpha = fog; ctx.drawImage(this.art.connected.fog(node), 0, 0); ctx.globalAlpha = 1; }
    return canvas;
  }
}
