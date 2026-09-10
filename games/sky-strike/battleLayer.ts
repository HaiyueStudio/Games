import { System, type World } from '@haiyue/engine/ecs';
import type { HaiyueEngine } from '@haiyue/engine';
import { beginRenderCommandPass, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { IndexedSpriteRenderer, DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS, type IndexedSpritePlaneDescriptor, type IndexedSpriteDrawCommand } from '@haiyue/extensions/experimental/indexed-sprite';
import { skyStrikeViewport } from './viewport';

export interface SkySpriteEntry { id: string; width: number; height: number; offset: number; length: number }
export function unpackSkySprites(entries: SkySpriteEntry[], bytes: Uint8Array): IndexedSpritePlaneDescriptor[] {
  return entries.map(entry => {
    if (entry.length !== entry.width * entry.height * 4 || entry.offset < 0 || entry.offset + entry.length > bytes.length) throw new Error(`Invalid sprite pack: ${entry.id}`);
    return { id: entry.id, width: entry.width, height: entry.height, format: 'rgba8', pixels: bytes.subarray(entry.offset, entry.offset + entry.length) };
  });
}
export async function loadSkySprites(prefix = ''): Promise<IndexedSpritePlaneDescriptor[]> {
  const [index, data] = await Promise.all([fetch(`${prefix}assets/sprites.json`), fetch(`${prefix}assets/sprites.rgba`)]);
  if (!index.ok || !data.ok) throw new Error('Sky Strike sprite pack could not be loaded.');
  return unpackSkySprites(await index.json(), new Uint8Array(await data.arrayBuffer()));
}
const colors = new Map<string, [number, number, number, number]>();
function tint(hex: string): [number, number, number, number] {
  let value = colors.get(hex);
  if (!value) { const n = Number.parseInt(hex.slice(1), 16); value = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; colors.set(hex, value); }
  return value;
}
/** Small immutable masks for Sky Strike's bullets, shields, engine exhaust and nebula. */
function effectSprites(): IndexedSpritePlaneDescriptor[] {
  return ['solid', 'disc', 'glow', 'ring', 'triangle', 'fade'].map(id => {
    const size = id === 'solid' ? 2 : 64, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size, radius = Math.hypot(u - 0.5, v - 0.5) * 2;
      const alpha = id === 'glow' ? Math.max(0, 1 - radius) ** 2 : id === 'disc' ? Math.max(0, Math.min(1, (1 - radius) * 32)) : id === 'ring' ? Math.max(0, 1 - Math.abs(radius - 0.91) * 22) : id === 'triangle' ? Math.max(0, Math.min(1, ((1 - v) * 0.5 - Math.abs(u - 0.5)) * 64)) : id === 'fade' ? 1 - v : 1;
      const i = (y * size + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; pixels[i + 3] = Math.round(alpha * 255);
    }
    return { id: `fx:${id}`, width: size, height: size, format: 'rgba8', pixels };
  });
}
/** Engine-owned batching/shaders; this system only assembles Sky Strike's sprite commands. */
export class SkyStrikeBattleLayer extends System {
  readonly renderPipelineOptions = { pass: 'isolated' as const, depth: false, loadOp: 'clear' as const, sort: 40 };
  private readonly renderer: IndexedSpriteRenderer;
  private readonly commands: IndexedSpriteDrawCommand[] = [];
  private readonly sources = new Map<string, IndexedSpritePlaneDescriptor>();
  private readonly guiTextures = new Map<string, GPUTexture>();
  private guiTextureBytes = 0;
  private view = skyStrikeViewport(480, 960);
  private shakeX = 0; private shakeY = 0;
  constructor(private readonly engine: HaiyueEngine, sprites: readonly IndexedSpritePlaneDescriptor[]) {
    super(() => false); this.priority = 40; this.name = 'SkyStrikeBattleLayer';
    for (const sprite of [...sprites, ...effectSprites()]) this.sources.set(sprite.id, sprite);
    this.renderer = new IndexedSpriteRenderer(engine.device, [...this.sources.values()].filter(source => !source.id.startsWith('assets/gui-') || source.id === 'assets/gui-space.png'), [], {
      targetFormat: engine.format, sampleCount: engine.msaaSamples as 1 | 4, label: 'SkyStrike.sprites',
      limits: { ...DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS, maxTextureDimension2D: 2048, maxDrawCommandsPerFrame: 8192 },
    });
    this.renderer.uploadAll();
  }
  guiImage(id: string): GPUTexture {
    let texture = this.guiTextures.get(id);
    if (!texture) {
      const source = this.sources.get(id); if (!source) throw new Error(`Missing ${id}`);
      texture = this.engine.device.createTexture({ label: id, size: [source.width, source.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      this.engine.device.queue.writeTexture({ texture }, new Uint8Array(source.pixels), { bytesPerRow: source.width * 4 }, [source.width, source.height]);
      this.guiTextures.set(id, texture); this.guiTextureBytes += source.width * source.height * 4;
    }
    return texture;
  }
  begin(playerX: number, shakeX = 0, shakeY = 0): void {
    this.commands.length = 0; this.view = skyStrikeViewport(this.engine.displayWidth, this.engine.displayHeight, playerX);
    this.shakeX = shakeX; this.shakeY = shakeY;
  }
  sprite(id: string, x: number, y: number, width: number, height: number, rotation = 0, opacity = 1, color = '#ffffff', additive = false): void {
    if (opacity <= 0 || width <= 0 || height <= 0) return;
    const source = this.sources.get(id); if (!source) throw new Error(`Missing battle sprite ${id}`);
    const scale = this.view.scale;
    this.commands.push({ spriteId: id, x: this.view.left + (x - this.view.cameraX + this.shakeX) * scale, y: (y + this.shakeY) * scale,
      axisX: source.width / 2, axisY: source.height / 2, scaleX: width / source.width * scale, scaleY: height / source.height * scale,
      rotationRadians: rotation, opacity: Math.min(1, opacity), tint: tint(color), sampling: 'linear', blend: additive ? 'additive' : 'alpha' });
  }
  rect(x: number, y: number, width: number, height: number, color: string, alpha = 1, rotation = 0): void { this.sprite('fx:solid', x, y, width, height, rotation, alpha, color); }
  glow(x: number, y: number, radius: number, color: string, alpha = 1): void { this.sprite('fx:glow', x, y, radius * 2, radius * 2, 0, alpha, color, true); }
  disc(x: number, y: number, radius: number, color: string, alpha = 1): void { this.sprite('fx:disc', x, y, radius * 2, radius * 2, 0, alpha, color); }
  ring(x: number, y: number, radius: number, color: string, alpha = 1, aspect = 1, rotation = 0): void { this.sprite('fx:ring', x, y, radius * 2, radius * 2 * aspect, rotation, alpha, color, true); }
  line(x: number, y: number, endX: number, endY: number, width: number, color: string, alpha = 1): void {
    this.rect((x + endX) / 2, (y + endY) / 2, width, Math.hypot(endX - x, endY - y), color, alpha, Math.atan2(endY - y, endX - x) - Math.PI / 2);
  }
  beam(x: number, y: number, endX: number, endY: number, width: number, color: string, warning = false): void {
    if (warning) { const length = Math.hypot(endX - x, endY - y); for (let d = 0; d < length; d += 28) { const a = d / length, b = Math.min(1, (d + 17) / length); this.line(x + (endX-x)*a,y+(endY-y)*a,x+(endX-x)*b,y+(endY-y)*b,2,color,0.7); } }
    else { this.line(x,y,endX,endY,width*3,color,0.15); this.line(x,y,endX,endY,width,color,0.8); this.line(x,y,endX,endY,Math.max(2,width*0.26),'#f4fdff'); }
  }
  stats() { return { ...this.renderer.stats(), renderer: 'haiyue-gpu-sprites', guiTextureBytes: this.guiTextureBytes, frameTextureUploads: 0 }; }
  record(_world: World, context: RenderCommandContext): this {
    const { passEncoder, ownsPass } = beginRenderCommandPass(context);
    const dpr = this.engine.width / this.engine.displayWidth;
    const left = Math.ceil(this.view.left * dpr), right = Math.floor((this.view.left + this.view.width) * dpr);
    passEncoder.setScissorRect(left, 0, Math.max(1, right - left), this.engine.height);
    this.renderer.render(passEncoder, this.commands, this.engine.displayWidth, this.engine.displayHeight);
    if (ownsPass) passEncoder.end(); return this;
  }
  override destroy(): this { this.renderer.dispose(); for (const texture of this.guiTextures.values()) texture.destroy(); this.guiTextures.clear(); this.guiTextureBytes = 0; this.commands.length = 0; return super.destroy(); }
}
