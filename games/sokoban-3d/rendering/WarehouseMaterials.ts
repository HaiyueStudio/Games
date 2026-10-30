import { ColorSRGB, PbrMaterial } from '@haiyue/engine';

const TEXTURES = { floor: 'limestone-floor', wall: 'sandstone-wall', crate: 'oak-crate' } as const;

/** Three shared material images, irrespective of the level's number of tiles. */
export class WarehouseMaterials {
  private readonly images = new Map<string, ImageBitmap>();
  private readonly cache = new Map<string, PbrMaterial>();
  private disposed = false;
  async load(): Promise<void> {
    const results = await Promise.allSettled(Object.entries(TEXTURES).map(async ([kind, name]) => {
      const response = await fetch(`./assets/textures/${name}.jpg`);
      if (!response.ok) throw new Error(`Sokoban ${kind} texture: HTTP ${response.status}`);
      const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' });
      if (this.disposed) image.close(); else this.images.set(kind, image);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') { this.dispose(); throw failure.reason; }
  }
  get(kind: 'floor' | 'floorAlt' | 'wall' | 'cap' | 'crate' | 'crateDone' | 'base' | 'trim' | 'target' | 'targetDone' | 'body' | 'helmet' | 'visor' | 'boots'): PbrMaterial {
    let material = this.cache.get(kind);
    if (material) return material;
    const palette = { floor: '#e0e8e1', floorAlt: '#c9d8d0', wall: '#f5e8cd', cap: '#d2b88b', crate: '#ffffff', crateDone: '#a8edc1', base: '#23484e', trim: '#ae7f4e', target: '#f4c45e', targetDone: '#6fe0b2', body: '#279b96', helmet: '#ffcf70', visor: '#173f53', boots: '#17383f' };
    const texture = kind === 'floorAlt' ? 'floor' : kind === 'crateDone' ? 'crate' : kind;
    material = new PbrMaterial({
      baseColor: ColorSRGB.fromHex(palette[kind]), baseColorTexture: this.images.get(texture) ?? null,
      metallic: ['target', 'targetDone', 'visor'].includes(kind) ? .35 : .02,
      roughness: kind === 'visor' ? .22 : kind === 'helmet' ? .38 : .8,
      ...(kind === 'target' || kind === 'targetDone' ? { emissiveFactor: kind === 'target' ? [.12, .065, .008] : [.015, .22, .12] } : {}),
    });
    this.cache.set(kind, material); return material;
  }
  /** Stable per-crate instances retain their uploaded wood texture when the target tint changes. */
  crate(index: number): PbrMaterial {
    const key = `crate:${index}`;
    let material = this.cache.get(key);
    if (!material) { material = this.get('crate').clone(); this.cache.set(key, material); }
    return material;
  }
  snapshot() { return { images: this.images.size, materials: this.cache.size, dimensions: [...this.images].map(([kind, image]) => ({ kind, width: image.width, height: image.height })) }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const image of this.images.values()) image.close(); this.images.clear(); this.cache.clear(); }
}
