import { ColorSRGB, Entity, Geometry3D, Mesh3D, PbrMaterial, CartesianTransform3D, type World } from '@haiyue/engine';
import type { AssetHandle } from '@haiyue/engine/assets';
import type { HaiyueEngine } from '@haiyue/engine';

export type Vec3 = [number, number, number];
export type CellSurface = 'hidden' | 'hover' | 'revealed' | 'flagged' | 'mine' | 'wrong-flag';

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(x: number, y: number, z: number): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function tangentFrame(normal: Vec3): { right: Vec3; up: Vec3 } {
  const seed: Vec3 = Math.abs(normal[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const right = normalize(...cross(seed, normal));
  return { right, up: cross(normal, right) };
}

const NUMBER_COLORS = ['#233b50', '#155ac2', '#14734d', '#c4383c', '#7542a3', '#a45016', '#137c83', '#2f4055', '#765064'];
const SIZE = 256;

/** One shared material per state/count, reused by every tile. Glyphs are baked into albedo, not separate planes. */
export class CellMaterials {
  private textures: AssetHandle<GPUTexture>[] = [];
  readonly surfaces: Record<CellSurface, PbrMaterial>;
  readonly numbers: PbrMaterial[];
  readonly pole = new PbrMaterial({ baseColor: new ColorSRGB(0.91, 0.71, 0.35), metallic: 0.72, roughness: 0.3 });
  readonly cloth = new PbrMaterial({ baseColor: new ColorSRGB(0.95, 0.16, 0.19), metallic: 0, roughness: 0.68, emissiveFactor: [0.12, 0.004, 0.006], doubleSided: true });
  readonly wrongCloth = new PbrMaterial({ baseColor: new ColorSRGB(0.38, 0.21, 0.25), metallic: 0, roughness: 0.8, doubleSided: true });

  private constructor(image: HTMLImageElement) {
    const material = (surface: CellSurface, count = 0) => new PbrMaterial({
      baseColor: [1, 1, 1, 1], baseColorTexture: this.texture(image, surface, count),
      metallic: surface === 'revealed' ? 0.08 : 0.32,
      roughness: surface === 'revealed' ? 0.67 : 0.4,
      clearcoatFactor: surface === 'revealed' ? 0.1 : 0.28, clearcoatRoughnessFactor: 0.3,
      doubleSided: true,
      samplers: { baseColor: { magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' } },
    });
    this.surfaces = {
      hidden: material('hidden'), hover: material('hover'), revealed: material('revealed'),
      flagged: material('flagged'), mine: material('mine'), 'wrong-flag': material('wrong-flag'),
    };
    this.numbers = Array.from({ length: 9 }, (_, count) => count === 0 ? this.surfaces.revealed : material('revealed', count));
  }

  static async load(engine: HaiyueEngine): Promise<CellMaterials> {
    const image = new Image();
    image.src = new URL('./assets/titanium-albedo.png', window.location.href).href;
    await image.decode();
    const materials = new CellMaterials(image);
    const assets = engine.assetManager;
    if (!assets) throw new Error('Tile materials require the initialized asset manager.');
    const states = [...new Set([...Object.values(materials.surfaces), ...materials.numbers])];
    const results = await Promise.allSettled(states.map(material => assets.loadTexture(material.baseColorTexture as HTMLCanvasElement,
      { format: 'rgba8unorm-srgb', mipmaps: 'generate' })));
    materials.textures = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) { materials.dispose(); throw failure.reason; }
    states.forEach((material, index) => {
      const handle = materials.textures[index]!;
      // Immediate GPU sources avoid white placeholder frames when hover/state materials become visible.
      material.baseColorTexture = { get texture() { return handle.value; } };
    });
    return materials;
  }

  dispose(): void { for (const texture of this.textures) texture.release(); this.textures = []; }

  private texture(image: HTMLImageElement, surface: CellSurface, count: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    const light = surface === 'revealed';
    ctx.fillStyle = light ? '#dce8e9' : surface === 'hover' ? '#358f9f' : surface === 'mine' ? '#d97563' : surface === 'wrong-flag' ? '#ae9292' : '#235167';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = light ? 0.5 : 0.7;
    ctx.drawImage(image, 0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // Quiet engraved instrument markings leave the central number unobstructed.
    ctx.strokeStyle = light ? '#58778245' : '#b3edf660'; ctx.lineWidth = 2;
    for (const x of [68, 188]) {
      ctx.beginPath(); ctx.moveTo(x - 7, 67); ctx.lineTo(x + 7, 67); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 7, 189); ctx.lineTo(x + 7, 189); ctx.stroke();
    }
    if (count > 0) {
      ctx.font = 'bold 116px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#f5fcf4'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      ctx.strokeText(String(count), 128, 132);
      ctx.fillStyle = NUMBER_COLORS[count] ?? NUMBER_COLORS[0]!; ctx.fillText(String(count), 128, 132);
    } else if (surface === 'mine') {
      ctx.strokeStyle = '#54222d'; ctx.lineWidth = 10;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(128 + Math.cos(angle) * 22, 128 + Math.sin(angle) * 22);
        ctx.lineTo(128 + Math.cos(angle) * 48, 128 + Math.sin(angle) * 48); ctx.stroke();
      }
      ctx.fillStyle = '#54222d'; ctx.beginPath(); ctx.arc(128, 128, 33, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe9ca'; ctx.beginPath(); ctx.arc(118, 116, 8, 0, Math.PI * 2); ctx.fill();
    } else if (surface === 'wrong-flag') {
      ctx.strokeStyle = '#782739'; ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(97, 97); ctx.lineTo(159, 159); ctx.moveTo(159, 97); ctx.lineTo(97, 159); ctx.stroke();
    } else if (!light) {
      ctx.strokeStyle = '#b3edf645'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(128, 128, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#b3edf660'; ctx.beginPath(); ctx.arc(128, 128, 3, 0, Math.PI * 2); ctx.fill();
    }
    return canvas;
  }
}

export interface CellFlag { root: Entity; pole: Mesh3D; cloth: Mesh3D }

/** A planted collar, eight-sided pole and folded pennant, all in the tile's local tangent frame. */
export function createCellFlag(world: World, normal: Vec3, id: number, materials: CellMaterials, options: { origin: Vec3; scale?: number; right?: Vec3 }): CellFlag {
  const right = options.right ?? tangentFrame(normal).right;
  const up = cross(normal, right), scale = options.scale ?? 1;
  const point = (x: number, y: number, z: number): Vec3 => [
    options.origin[0] + (normal[0] * z + right[0] * x + up[0] * y) * scale,
    options.origin[1] + (normal[1] * z + right[1] * x + up[1] * y) * scale,
    options.origin[2] + (normal[2] * z + right[2] * x + up[2] * y) * scale,
  ];
  const positions: number[] = [], normals: number[] = [];
  const triangle = (a: Vec3, b: Vec3, c: Vec3) => {
    const n = normalize(...cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
    for (const p of [a, b, c]) { positions.push(...p); normals.push(...n); }
  };
  const cylinder = (radius: number, low: number, high: number) => {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, b = (i + 1) * Math.PI / 4;
      const al = point(Math.cos(a) * radius, Math.sin(a) * radius, low), ah = point(Math.cos(a) * radius, Math.sin(a) * radius, high);
      const bl = point(Math.cos(b) * radius, Math.sin(b) * radius, low), bh = point(Math.cos(b) * radius, Math.sin(b) * radius, high);
      triangle(al, bl, bh); triangle(al, bh, ah); triangle(point(0, 0, high), ah, bh);
    }
  };
  cylinder(0.035, -0.008, 0.018); cylinder(0.011, 0.006, 0.3);
  const poleGeometry = new Geometry3D({ positions: new Float32Array(positions), normals: new Float32Array(normals), cullMode: 'none' });
  positions.length = 0; normals.length = 0;
  const a = point(0.009, 0, 0.28), b = point(0.082, 0.038, 0.269), c = point(0.164, -0.028, 0.249);
  const d = point(0.01, 0, 0.173), e = point(0.082, 0.038, 0.18), f = point(0.164, -0.028, 0.196);
  triangle(a, d, e); triangle(a, e, b); triangle(b, e, f); triangle(b, f, c);
  const clothGeometry = new Geometry3D({ positions: new Float32Array(positions), normals: new Float32Array(normals), cullMode: 'none' });
  const pole = new Mesh3D(poleGeometry, materials.pole), cloth = new Mesh3D(clothGeometry, materials.cloth);
  const root = new Entity(`Flag ${id}`).addComponent(new CartesianTransform3D());
  root.addChild(new Entity(`Flag pole ${id}`).addComponent(new CartesianTransform3D()).addComponent(pole));
  root.addChild(new Entity(`Flag pennant ${id}`).addComponent(new CartesianTransform3D()).addComponent(cloth));
  world.addEntity(root);
  return { root, pole, cloth };
}
