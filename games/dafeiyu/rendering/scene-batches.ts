import { DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS, IndexedSpriteRenderer, type IndexedSpriteDrawCommand,
  type IndexedSpritePlaneDescriptor } from '@haiyue/extensions/experimental/indexed-sprite';
import type { IEngine } from '@haiyue/engine/extension-authoring';

interface Draw {
  pipeline: GPURenderPipeline;
  bindings: GPUBindGroup[];
  vertices: number;
  firstVertex: number;
  firstInstance: number;
  count: number;
}

export class LagoonSpriteBatches {
  private readonly owners = new Map<string, IndexedSpriteRenderer>();
  private readonly pages = new Set<IndexedSpriteRenderer>();
  private readonly prepared = new Map<IndexedSpriteRenderer, {
    commands: IndexedSpriteDrawCommand[]; draws: Draw[]; width: number; height: number;
  }>();

  constructor(private readonly engine: IEngine, private readonly label: string) {}

  add(planes: readonly IndexedSpritePlaneDescriptor[]): IndexedSpriteRenderer {
    const renderer = new IndexedSpriteRenderer(this.engine.device, planes, [], {
      targetFormat: this.engine.format, sampleCount: this.engine.msaaSamples, label: this.label,
      limits: { ...DEFAULT_INDEXED_SPRITE_ATLAS_LIMITS, maxTextureDimension2D: Math.min(3072, this.engine.device.limits.maxTextureDimension2D) },
    });
    try { renderer.uploadAll(); }
    catch (error) { renderer.dispose(); throw error; }
    this.pages.add(renderer);
    for (const plane of planes) this.owners.set(plane.id, renderer);
    return renderer;
  }

  remove(page: IndexedSpriteRenderer): void {
    for (const [id, owner] of this.owners) if (owner === page) this.owners.delete(id);
    this.pages.delete(page);
    this.prepared.delete(page);
    page.dispose();
  }

  prepare(commands: readonly IndexedSpriteDrawCommand[], width: number, height: number): GPURenderBundle {
    const byPage = new Map<IndexedSpriteRenderer, { commands: IndexedSpriteDrawCommand[]; draws: Draw[]; nextDraw: number }>();
    const runs: { page: IndexedSpriteRenderer; start: number; end: number }[] = [];
    for (const command of commands) {
      const page = this.owners.get(command.spriteId)!;
      let batch = byPage.get(page);
      if (!batch) { batch = { commands: [], draws: [], nextDraw: 0 }; byPage.set(page, batch); }
      const index = batch.commands.length;
      batch.commands.push(command);
      const previous = runs.at(-1);
      if (previous?.page === page) previous.end++;
      else runs.push({ page, start: index, end: index + 1 });
    }
    for (const page of this.prepared.keys()) if (!byPage.has(page)) this.prepared.delete(page);
    // Upload once per atlas. Replay ranges in the original scene order so
    // transparent and stacked tiles keep their existing compositing order.
    for (const [page, batch] of byPage) {
      const previous = this.prepared.get(page);
      if (previous?.width === width && previous.height === height && previous.commands.length === batch.commands.length &&
          batch.commands.every((command, index) => command === previous.commands[index])) {
        batch.draws = previous.draws;
        continue;
      }
      let pipeline: GPURenderPipeline | undefined;
      const bindings: GPUBindGroup[] = [];
      const capture: Pick<GPURenderPassEncoder, 'setBindGroup' | 'setPipeline' | 'draw'> = {
        setPipeline: value => { pipeline = value; },
        setBindGroup: (index, binding) => { if (binding) bindings[index] = binding; },
        draw: (vertices, count = 1, firstVertex = 0, firstInstance = 0) => {
          if (!pipeline) throw Error('Sprite draw has no pipeline');
          batch.draws.push({ pipeline, bindings: bindings.slice(), vertices, firstVertex, firstInstance, count });
        },
      };
      page.render(capture as GPURenderPassEncoder, batch.commands, width, height);
      this.prepared.set(page, { commands: batch.commands, draws: batch.draws, width, height });
    }
    const encoder = this.engine.device.createRenderBundleEncoder({ label: this.label,
      colorFormats: [this.engine.format], sampleCount: this.engine.msaaSamples });
    for (const { page, start, end } of runs) {
      const batch = byPage.get(page)!;
      for (let offset = start; offset < end;) {
        const draw = batch.draws[batch.nextDraw];
        if (!draw || offset < draw.firstInstance || offset >= draw.firstInstance + draw.count) {
          throw Error('Sprite batch does not cover its input instances');
        }
        const limit = draw.firstInstance + draw.count;
        const count = Math.min(end, limit) - offset;
        encoder.setPipeline(draw.pipeline);
        draw.bindings.forEach((binding, index) => encoder.setBindGroup(index, binding));
        encoder.draw(draw.vertices, count, draw.firstVertex, offset);
        offset += count;
        if (offset === limit) batch.nextDraw++;
      }
    }
    return encoder.finish({ label: this.label });
  }

  recover(device: GPUDevice): void {
    this.prepared.clear();
    for (const page of this.pages) { page.recover(device); page.uploadAll(); }
  }

  dispose(): void {
    for (const page of this.pages) page.dispose();
    this.pages.clear();
    this.owners.clear();
    this.prepared.clear();
  }
}
