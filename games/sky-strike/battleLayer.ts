import {quantumPixels} from './quantum';
import {SkyStrikeFlamePass,type LavaCore} from './flamePass';
import type {FlameCone,FlameNozzle} from './flames';
import {mirrorSprites} from './mirrorSprites';
import {SkyStrikeBlackHolePass,blackHolePortrait,type HoleVisual} from './blackHolePass';
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
const EMPTY_FLAMES: readonly FlameCone[] = [];
const EMPTY_NOZZLES: readonly FlameNozzle[] = [];
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
  private readonly commandPool: { -readonly [K in keyof IndexedSpriteDrawCommand]: IndexedSpriteDrawCommand[K] }[] = [];
  private composingPreview = false;
  private readonly sources = new Map<string, IndexedSpritePlaneDescriptor>();
  private readonly guiTextures = new Map<string, GPUTexture>();
  private guiTextureBytes = 0;
  private readonly previews = new Map<string,{source:GPUTexture;sourceKey:string;aspect:number}>();
  private view = skyStrikeViewport(480, 960);
  private hole:HoleVisual|null=null;
  private lens:SkyStrikeBlackHolePass|null=null;
  private flamePass:SkyStrikeFlamePass|null=null;
  private flames:readonly FlameCone[]=[];private nozzles:readonly FlameNozzle[]=[];private flameTime=0;
  private cores:LavaCore[]=[];
  private shakeX = 0; private shakeY = 0;
  constructor(private readonly engine: HaiyueEngine, sprites: readonly IndexedSpritePlaneDescriptor[]) {
    super(() => false); this.priority = 40; this.name = 'SkyStrikeBattleLayer';
    for (const sprite of [...sprites, ...effectSprites(),blackHolePortrait(),...mirrorSprites()]) this.sources.set(sprite.id, sprite);
    for(const source of sprites){
      if(source.id.startsWith('assets/enemy-')||source.id.startsWith('assets/elite-')||source.id==='assets/boss-quantum-dreadnought.png'||source.id==='assets/fx-quantum-turret.png')
        this.sources.set(`quantum:${source.id}`,{...source,id:`quantum:${source.id}`,pixels:quantumPixels(new Uint8Array(source.pixels))});
    }
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
  /** Bake the existing GPU sprite commands once per hull; no Canvas 2D or per-frame uploads. */
  guiComposition(key:string,draw:(layer:SkyStrikeBattleLayer)=>void):{source:GPUTexture;sourceKey:string;aspect:number} {
    const cached=this.previews.get(key);if(cached)return cached;
    const saved=this.commands.splice(0),view=this.view,sx=this.shakeX,sy=this.shakeY,composing=this.composingPreview;this.composingPreview=true;
    let commands:IndexedSpriteDrawCommand[];
    try {this.view={scale:1,left:0,width:480,visibleWidth:480,cameraX:0};this.shakeX=this.shakeY=0;draw(this);commands=this.commands.splice(0);}
    finally {this.composingPreview=composing;this.commands.length=0;this.commands.push(...saved);this.view=view;this.shakeX=sx;this.shakeY=sy;}
    if(!commands.length)throw new Error(`Empty boss preview: ${key}`);
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const c of commands){const s=this.sources.get(c.spriteId)!,a=c.rotationRadians??0;
      const w=s.width*(c.scaleX??1)/2,h=s.height*(c.scaleY??1)/2,dx=Math.abs(Math.cos(a)*w)+Math.abs(Math.sin(a)*h),dy=Math.abs(Math.sin(a)*w)+Math.abs(Math.cos(a)*h);
      left=Math.min(left,c.x-dx);right=Math.max(right,c.x+dx);top=Math.min(top,c.y-dy);bottom=Math.max(bottom,c.y+dy);}
    const pad=4,width=right-left,height=bottom-top,scale=(384-pad*2)/Math.max(width,height);
    const tw=Math.ceil(width*scale)+pad*2,th=Math.ceil(height*scale)+pad*2;
    commands=commands.map(c=>({...c,x:(c.x-left)*scale+pad,y:(c.y-top)*scale+pad,scaleX:(c.scaleX??1)*scale,scaleY:(c.scaleY??1)*scale}));
    const device=this.engine.device,format=this.engine.format,sampleCount=this.engine.msaaSamples as 1|4;
    const texture=device.createTexture({label:key,size:[tw,th],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
    const msaa=sampleCount===4?device.createTexture({label:key+'.msaa',size:[tw,th],format,sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT}):null;
    // A GUI click can run after the battle pass is encoded. Never overwrite that
    // renderer's instance/viewport buffers before the pending frame is submitted.
    // Upload only this portrait's assets; release temporary resources after submission.
    let previewRenderer:IndexedSpriteRenderer|null=null;
    try {
      const sources=[...new Set(commands.map(c=>c.spriteId))].map(id=>this.sources.get(id)!);
      previewRenderer=new IndexedSpriteRenderer(device,sources,[],{targetFormat:format,sampleCount,label:key,
        limits:{...DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS,maxTextureDimension2D:2048,maxDrawCommandsPerFrame:Math.max(1,commands.length)}});
      previewRenderer.uploadAll();
      const encoder=device.createCommandEncoder({label:key}),pass=encoder.beginRenderPass({colorAttachments:[{
      view:(msaa??texture).createView(),...(msaa?{resolveTarget:texture.createView()}:{}),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
      previewRenderer.render(pass,commands,tw,th);pass.end();device.queue.submit([encoder.finish()]);
    }catch(error){texture.destroy();throw error;}finally{previewRenderer?.dispose();msaa?.destroy();}
    const result={source:texture,sourceKey:key,aspect:th/tw};this.previews.set(key,result);this.guiTextures.set(key,texture);this.guiTextureBytes+=tw*th*4;return result;
  }
  begin(playerX: number, shakeX = 0, shakeY = 0): void {
    this.flames=EMPTY_FLAMES;this.nozzles=EMPTY_NOZZLES;this.cores.length=0;
    this.commands.length = 0; this.view = skyStrikeViewport(this.engine.displayWidth, this.engine.displayHeight, playerX);
    this.shakeX = shakeX; this.shakeY = shakeY;
  }
  sprite(id: string, x: number, y: number, width: number, height: number, rotation = 0, opacity = 1, color = '#ffffff', additive = false, flipY = false): void {
    if (opacity <= 0 || width <= 0 || height <= 0) return;
    const source = this.sources.get(id); if (!source) throw new Error(`Missing battle sprite ${id}`);
    const scale = this.view.scale;
    const index = this.commands.length;
    const command = this.composingPreview ? { spriteId: id, x: 0, y: 0 } as typeof this.commandPool[number]
      : this.commandPool[index] ??= { spriteId: id, x: 0, y: 0 };
    command.spriteId=id;command.x=this.view.left+(x-this.view.cameraX+this.shakeX)*scale;command.y=(y+this.shakeY)*scale;
    command.axisX=source.width/2;command.axisY=source.height/2;command.scaleX=width/source.width*scale;command.scaleY=height/source.height*scale;
    command.rotationRadians=rotation;command.flipY=flipY;command.opacity=Math.min(1,opacity);command.tint=tint(color);
    command.sampling='linear';command.blend=additive?'additive':'alpha';this.commands.push(command);
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
  setBlackHole(visual:HoleVisual|null):void {this.hole=visual; if(!visual)this.lens?.releaseTargets();}
  setFlames(cones:readonly FlameCone[],nozzles:readonly FlameNozzle[],time:number):void{this.flames=cones;this.nozzles=nozzles;this.flameTime=time;}
  lava(core:LavaCore):void{this.cores.push(core);}
  stats() { return { fire:this.flamePass?.stats()??null,lens:this.lens?.stats()??null, ...this.renderer.stats(), renderer: 'haiyue-gpu-sprites', guiTextureBytes: this.guiTextureBytes, frameTextureUploads: 0 }; }
  record(_world: World, context: RenderCommandContext): this {
    const draw=(pass:GPURenderPassEncoder)=>{
      const dpr=this.engine.width/this.engine.displayWidth;
      const left=Math.ceil(this.view.left*dpr),right=Math.floor((this.view.left+this.view.width)*dpr);
      pass.setScissorRect(left,0,Math.max(1,right-left),this.engine.height);
      this.renderer.render(pass,this.commands,this.engine.displayWidth,this.engine.displayHeight);
      if(this.flames.length||this.nozzles.length||this.cores.length)this.flamePass??=new SkyStrikeFlamePass(this.engine);
      this.flamePass?.draw(pass,this.flames,this.nozzles,this.flameTime,this.view,this.shakeX,this.shakeY,this.cores);
    };
    if(this.hole){this.lens??=new SkyStrikeBlackHolePass(this.engine);this.lens.record(context,this.hole,this.view,draw);}
    else {const {passEncoder,ownsPass}=beginRenderCommandPass(context);draw(passEncoder);if(ownsPass)passEncoder.end();}
    return this;
  }
  override destroy(): this { this.flamePass?.destroy();this.lens?.destroy(); this.renderer.dispose(); for (const texture of this.guiTextures.values()) texture.destroy(); this.guiTextures.clear(); this.previews.clear(); this.guiTextureBytes = 0; this.commands.length = 0; this.commandPool.length = 0; return super.destroy(); }
}
