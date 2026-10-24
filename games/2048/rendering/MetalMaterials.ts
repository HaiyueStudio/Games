import { ColorSRGB, PbrMaterial } from '@haiyue/engine';
import type { Game2048Config } from '../rules/config';

interface TileMaps { albedo: ImageBitmap; normal: ImageBitmap; roughness: ImageBitmap }
interface BakeRequest {
  resolve: (maps: TileMaps | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class MetalMaterials {
  private readonly images = new Map<string, ImageBitmap>();
  private readonly tiles = new Map<number, PbrMaterial>();
  private readonly tileMaps = new Map<number, TileMaps>();
  private readonly baking = new Map<number, Promise<void>>();
  private readonly requests = new Map<number, BakeRequest>();
  private baker: Worker | undefined;
  private nextRequest = 0;
  private disposed = false;
  panel: ImageBitmap | undefined;
  title: ImageBitmap | undefined;
  constructor(private readonly config: Game2048Config) {}

  async load(): Promise<void> {
    const results = await Promise.allSettled(['brushed-metal', 'metal-normal', 'metal-roughness', 'metal-panel', 'metal-title'].map(async name => {
      const response = await fetch(`./assets/${name}.png`);
      if (!response.ok) throw new Error(`2048 texture ${name}: ${response.status}`);
      this.images.set(name, await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' }));
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    this.panel = this.images.get('metal-panel');
    this.title = this.images.get('metal-title');
    this.baker = new Worker(new URL('./rendering/TileTexture.worker.js', import.meta.url), { type: 'module', name: '2048 tile texture baker' });
    this.baker.onmessage = event => {
      const response = event.data as { id: number; maps?: TileMaps; error?: string };
      const request = this.requests.get(response.id);
      if (!request) { if (response.maps) for (const map of Object.values(response.maps)) map.close(); return; }
      clearTimeout(request.timer); this.requests.delete(response.id);
      if (response.error) request.reject(new Error(response.error));
      else request.resolve(response.maps ?? null);
    };
    this.baker.onerror = event => this.failRequests(new Error(`2048 texture worker: ${event.message}`));
    const metal = await createImageBitmap(this.images.get('brushed-metal')!);
    await this.request({ type: 'init', metal }, [metal]);
    await this.prepare(Array.from({ length: 11 }, (_, index) => 2 ** (index + 1)));
  }

  private request(payload: Record<string, unknown>, transfer: Transferable[] = []): Promise<TileMaps | null> {
    const id = ++this.nextRequest;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(id); reject(new Error('2048 tile texture bake timed out.')); }, 15000);
      this.requests.set(id, { resolve, reject, timer });
      this.baker!.postMessage({ ...payload, id }, transfer);
    });
  }

  private failRequests(error: Error): void {
    for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(error); }
    this.requests.clear();
  }

  async prepare(values: readonly number[]): Promise<void> {
    for (const value of new Set(values.filter(value => value > 0))) this.tile(value);
    await Promise.all([...new Set(values)].map(value => this.baking.get(value)));
  }

  surface(hex: string, roughness = 0.42, metallic = 0.9): PbrMaterial {
    return new PbrMaterial({
      baseColor: ColorSRGB.fromHex(hex), metallic, roughness,
      baseColorTexture: this.images.get('brushed-metal') ?? null,
      normalTexture: this.images.get('metal-normal') ?? null,
      metallicRoughnessTexture: this.images.get('metal-roughness') ?? null,
      normalScale: 0.32, clearcoatFactor: 0.24, clearcoatRoughnessFactor: 0.25,
    });
  }

  tile(value: number): PbrMaterial {
    let material = this.tiles.get(value);
    if (!material) {
      const palette = this.config.colors.tiles[String(value)] ?? this.config.colors.fallback;
      material = this.surface(palette.bg, value >= 128 ? 0.3 : 0.43);
      this.tiles.set(value, material);
      const target = material;
      const baking = this.request({ type: 'bake', value, tint: palette.bg }).then(maps => {
        if (!maps) throw new Error(`Missing 2048 tile maps for ${value}.`);
        if (this.disposed) { for (const map of Object.values(maps)) map.close(); return; }
        this.tileMaps.set(value, maps);
        target.baseColor = [1, 1, 1, 1];
        target.baseColorTexture = maps.albedo;
        target.normalTexture = maps.normal;
        target.metallicRoughnessTexture = maps.roughness;
        target.normalScale = 1.7;
        target.metallic = 0.95; target.roughness = 1;
        target.clearcoatFactor = 0.12;
      });
      this.baking.set(value, baking);
      // prepare() propagates startup failures; later ranks also report async failures.
      void baking.catch(error => { if (!this.disposed) console.error('[2048 numbered metal]', error); });
    }
    return material;
  }

  diagnostics() {
    return { values: [...this.tileMaps.keys()], size: [256, 512], normalScale: 1.7, worker: !!this.baker, atlas: 'numbered-top/plain-sides' };
  }

  preview(value: number) { return this.tileMaps.get(value); }

  dispose(): void {
    this.disposed = true; this.baker?.terminate(); this.baker = undefined;
    this.failRequests(new Error('2048 texture baker disposed.'));
    for (const maps of this.tileMaps.values()) for (const image of Object.values(maps)) image.close();
    for (const image of this.images.values()) image.close();
    this.images.clear(); this.tiles.clear(); this.tileMaps.clear(); this.baking.clear();
  }
}
