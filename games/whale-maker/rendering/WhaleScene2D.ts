import { System, type World } from '@haiyue/engine';
import { beginRenderCommandPass, type IEngine, type RenderCommandContext } from '@haiyue/engine/extension-authoring';
import { DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS, IndexedSpriteRenderer, type IndexedSpriteDrawCommand, type IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';
import { actorRect } from './poses';
import { terrainPlanes } from './terrain';
import { tornadoPlanes } from './wind';
import { rescueBubblePlane } from './coop';
import type { SpriteSourceSizes } from '../app/artwork';

export interface SceneRect { x: number; y: number; width: number; height: number }
type Draw = { id: string; rect: SceneRect; flip: boolean; rotation?: number; opacity?: number; tint?: readonly [number, number, number, number] };
type Size = { width: number; height: number };

/** Ordinary textured 2D rendering. No GUI elements, layout callbacks or GUI dirtiness. */
export class WhaleScene2D extends System {
    readonly rendererKind = 'engine-indexed-sprite-2d';
    readonly draws: Draw[] = [];
    private readonly renderCommands: IndexedSpriteDrawCommand[] = [];
    private readonly sources = new Map<string, Size>();
    private readonly textures = new Map<string, Size & { packedId: string }>();
    private readonly renderer: IndexedSpriteRenderer;
    private readonly unregisterRecovery: (() => void) | undefined;
    private disposed = false;
    get stats() { return this.renderer.stats(); }
    get commands(): IndexedSpriteDrawCommand[] {
        return this.renderCommands.map(command => ({ ...command, spriteId: command.spriteId.slice(command.spriteId.indexOf(':') + 1) }));
    }
    readonly recoveryLabel = 'WhaleMaker.Sprite2D';
    readonly recoverySource = { kind: 'render-system', system: 'WhaleScene2D' };
    get renderPipelineOptions() { return { pass: 'isolated' as const, loadOp: 'clear' as const, depth: false, sort: 10 }; }

    constructor(private readonly engine: IEngine, atlases: Record<string, HTMLImageElement>, frames: Record<string, number[][]>, readonly board: SceneRect, sourceSizes: SpriteSourceSizes) {
        super(() => false);
        this.name = 'WhaleScene2D';
        this.priority = 10;
        const planes: IndexedSpritePlaneDescriptor[] = [{ id: 'white', width: 1, height: 1, format: 'rgba8', pixels: new Uint8Array([255, 255, 255, 255]) }];
        this.sources.set('white', { width: 1, height: 1 });
        const bubble=rescueBubblePlane();planes.push(bubble);this.sources.set(bubble.id,{width:bubble.width,height:bubble.height});
        for(const plane of tornadoPlanes()){planes.push(plane);this.sources.set(plane.id,{width:plane.width,height:plane.height});}
        // A soft circular particle material, kept in the same recoverable GPU batch.
        const diameter=32,pixels=new Uint8Array(diameter*diameter*4);
        for(let y=0;y<diameter;y++)for(let x=0;x<diameter;x++){
            const at=(y*diameter+x)*4,d=Math.hypot((x+.5)/diameter*2-1,(y+.5)/diameter*2-1);
            pixels[at]=pixels[at+1]=pixels[at+2]=255;pixels[at+3]=Math.round(Math.max(0,Math.min(1,(1-d)*16))*255);
        }
        planes.push({id:'dust',width:diameter,height:diameter,format:'rgba8',pixels});
        this.sources.set('dust',{width:diameter,height:diameter});
        // Tiny reusable masks keep the desert's flat geometry smooth without
        // submitting dozens of staircase strips for each distant pyramid.
        for(const right of [false,true]){
            const side=128,rgba=new Uint8Array(side*side*4),id=right?'triangle-right':'triangle';
            for(let y=0;y<side;y++)for(let x=0;x<side;x++){
                const u=(x+.5)/side,v=(y+.5)/side,d=right?Math.min(u,v-u,1-v):Math.min(u-(1-v)/2,(1+v)/2-u,1-v),at=(y*side+x)*4;
                rgba[at]=rgba[at+1]=rgba[at+2]=255;rgba[at+3]=Math.round(Math.max(0,Math.min(1,d*side+.5))*255);
            }
            planes.push({id,width:side,height:side,format:'rgba8',pixels:rgba});this.sources.set(id,{width:side,height:side});
        }
        const contexts = new Map<HTMLImageElement, CanvasRenderingContext2D>();
        for (const [name, image] of Object.entries(atlases)) {
            let ctx = contexts.get(image);
            if (!ctx) {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                ctx = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined;
                if (!ctx) throw Error('Unable to decode sprite atlas');
                ctx.drawImage(image, 0, 0);
                contexts.set(image, ctx);
            }
            const { canvas } = ctx;
            for (const [index, frame] of frames[name]!.entries()) {
                const [u, v, w, h] = frame as [number, number, number, number];
                const x = Math.round(u * canvas.width), y = Math.round(v * canvas.height);
                const width = Math.min(canvas.width - x, Math.round(w * canvas.width));
                const height = Math.min(canvas.height - y, Math.round(h * canvas.height));
                if(width<=1&&height<=1)continue; // Removed logical IDs have no GPU plane.
                const id = `${name}:${index}`;
                const plane:IndexedSpritePlaneDescriptor={ id, width, height, format: 'rgba8', pixels: new Uint8Array(ctx.getImageData(x, y, width, height).data) };
                planes.push(plane);
                const original = sourceSizes.get(id);
                this.sources.set(id, original ? { width: original[0], height: original[1] } : { width, height });
                if(name==='world'&&index===0)for(const terrain of terrainPlanes(plane)){planes.push(terrain);this.sources.set(terrain.id,{width:terrain.width,height:terrain.height});}
            }
        }
        // The renderer shelf-packs by ID. Rank taller and wider planes first to reduce unused space.
        const packedPlanes = planes.sort((a, b) => b.height - a.height || b.width - a.width).map((plane, index) => {
            const packedId = `${String(index).padStart(4, '0')}:${plane.id}`;
            this.textures.set(plane.id, { width: plane.width, height: plane.height, packedId });
            return { ...plane, id: packedId };
        });
        const limits = { ...DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS, maxTextureDimension2D: Math.min(4096, engine.device.limits.maxTextureDimension2D) };
        this.renderer = new IndexedSpriteRenderer(engine.device, packedPlanes, [], { limits, targetFormat: engine.format, sampleCount: engine.msaaSamples, label: 'WhaleMaker.Sprite2D' });
        this.renderer.uploadAll();
        this.unregisterRecovery = engine.registerDeviceRecoveryParticipant?.(this);
    }
    sourceSize(atlas: string, frame: number): Size { return this.sources.get(`${atlas}:${frame}`)!; }
    begin(): void { this.draws.length = 0; }
    sprite(atlas: string, frame: number, x: number, y: number, width: number, height: number, flip = false, rotation = 0, opacity = 1, tint?:readonly[number,number,number,number]): void {
        if (x + width <= this.board.x || x >= this.board.x + this.board.width || y + height <= this.board.y || y >= this.board.y + this.board.height) return;
        this.draws.push({ id: `${atlas}:${frame}`, rect: { x, y, width, height }, flip, rotation, opacity, ...(tint?{tint}:{}) });
    }
    actor(atlas: string, frame: number, centerX: number, feetY: number, size: number, flip = false, reference = frame, rotation = 0, opacity = 1, tint?:readonly[number,number,number,number]): SceneRect | undefined {
        const rect = actorRect(this.sources.get(`${atlas}:${frame}`)!, this.sources.get(`${atlas}:${reference}`)!, centerX, feetY, size);
        if (rect.x + rect.width < this.board.x || rect.x > this.board.x + this.board.width || rect.y + rect.height < this.board.y || rect.y > this.board.y + this.board.height) return;
        this.draws.push({ id: `${atlas}:${frame}`, rect, flip, rotation, opacity, ...(tint?{tint}:{}) });
        return rect;
    }
    fill(rect: SceneRect, tint: readonly [number, number, number, number], rotation = 0): void { this.draws.push({ id: 'white', rect, tint, flip: false, rotation }); }
    triangle(rect:SceneRect,tint:readonly[number,number,number,number],right=false):void {this.draws.push({id:right?'triangle-right':'triangle',rect,tint,flip:false});}
    dustParticle(x:number,y:number,radius:number,opacity:number,tint:readonly[number,number,number,number]):void {
        if(radius<=0||opacity<=0)return;
        this.draws.push({id:'dust',rect:{x:x-radius,y:y-radius,width:radius*2,height:radius*2},flip:false,opacity,tint});
    }
    rescueBubble(x:number,y:number,radius:number,opacity=1):void {
        this.draws.push({id:'rescue-bubble',rect:{x:x-radius,y:y-radius,width:radius*2,height:radius*2},flip:false,opacity});
    }
    fitActor(atlas:string,frame:number,centerX:number,feetY:number,width:number,height:number,flip=false,reference=frame):SceneRect|undefined {
        const source=this.sources.get(`${atlas}:${frame}`)!,ref=this.sources.get(`${atlas}:${reference}`)!;
        const scale=Math.min(width/source.width,height/source.height),size=scale*Math.max(ref.width,ref.height);
        return this.actor(atlas,frame,centerX,feetY,size,flip,reference);
    }
    centeredActor(atlas:string,frame:number,centerX:number,centerY:number,size:number,reference=frame,rotation=0,opacity=1,flip=false):SceneRect|undefined{
        const source=this.sources.get(`${atlas}:${frame}`)!,ref=this.sources.get(`${atlas}:${reference}`)!,height=source.height*size/Math.max(ref.width,ref.height);
        return this.actor(atlas,frame,centerX,centerY+height/2,size,flip,reference,rotation,opacity);
    }
    record(_world: World, context: RenderCommandContext): this {
        if (this.disposed || this.disabled) return this;
        const width = context.view?.displayWidth ?? this.engine.displayWidth;
        const height = context.view?.displayHeight ?? this.engine.displayHeight;
        const physicalWidth = context.view?.width ?? this.engine.width;
        const physicalHeight = context.view?.height ?? this.engine.height;
        const scale = Math.min(width / 1280, height / 800);
        const offsetX = (width - 1280 * scale) / 2, offsetY = (height - 800 * scale) / 2;
        this.renderCommands.length = 0;
        for (const [order, draw] of this.draws.entries()) {
            const source = this.textures.get(draw.id)!;
            this.renderCommands.push({ spriteId: source.packedId, x: offsetX + (draw.rect.x + draw.rect.width / 2) * scale, y: offsetY + (draw.rect.y + draw.rect.height / 2) * scale,
                axisX: source.width / 2, axisY: source.height / 2,
                scaleX: draw.rect.width * scale / source.width, scaleY: draw.rect.height * scale / source.height,
                flipX: draw.flip, rotationRadians: draw.rotation ?? 0, opacity: draw.opacity ?? 1, sampling: 'linear', blend: 'alpha', priority: order, ...(draw.tint ? { tint: draw.tint } : {}) });
        }
        const { passEncoder, ownsPass } = beginRenderCommandPass(context);
        const pixelRatioX = physicalWidth / width, pixelRatioY = physicalHeight / height;
        const x = Math.max(0, Math.floor((offsetX + this.board.x * scale) * pixelRatioX));
        const y = Math.max(0, Math.floor((offsetY + this.board.y * scale) * pixelRatioY));
        const right = Math.min(physicalWidth, Math.ceil((offsetX + (this.board.x + this.board.width) * scale) * pixelRatioX));
        const bottom = Math.min(physicalHeight, Math.ceil((offsetY + (this.board.y + this.board.height) * scale) * pixelRatioY));
        passEncoder.setScissorRect(x, y, Math.max(1, right - x), Math.max(1, bottom - y));
        this.renderer.render(passEncoder, this.renderCommands, width, height);
        passEncoder.setScissorRect(0, 0, physicalWidth, physicalHeight);
        if (ownsPass) passEncoder.end();
        return this;
    }
    suspendForDeviceLoss(): void { /* Renderer retains decoded source planes for recovery. */ }
    recoverGpuResource(device: GPUDevice, signal: AbortSignal): void {
        signal.throwIfAborted(); this.renderer.recover(device); this.renderer.uploadAll();
    }
    override destroy(): this {
        if (this.disposed) return this;
        this.disposed = true;
        this.unregisterRecovery?.();
        this.renderer.dispose(); this.draws.length = 0; this.renderCommands.length = 0;
        return super.destroy();
    }
}
