import { browserNeonRaster, type NeonRaster } from './NeonRaster';
import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D, World, createPlane3D } from '@haiyue/engine';
import { createSphere3D } from '@haiyue/engine/geometry';

export const SPACE_ASSETS = ['space-panorama', 'planet-azure', 'planet-amber', 'planet-violet', 'meteor-streak'] as const;
type Vec3 = readonly [number, number, number];
interface Sprite { transform: CartesianTransform3D; material: BasicMaterial; position: Vec3; width: number; aspect: number }

/** World-space scenery: the sky follows the eye, planets retain parallax and meteor pools are reused. */
export class SpaceEnvironment {
  private readonly textures: GPUTexture[] = [];
  private readonly planets: Sprite[] = [];
  private readonly meteors: Sprite[] = [];
  private readonly sky = new CartesianTransform3D();
  private readonly quad = createPlane3D();
  private constructor(private readonly world: World, private readonly device: GPUDevice, private readonly scale: number, private readonly raster: NeonRaster) {}

  static async create(world: World, device: GPUDevice, scale: number, raster: NeonRaster = browserNeonRaster): Promise<SpaceEnvironment> {
    const space = new SpaceEnvironment(world, device, scale, raster);
    try { await space.load(); return space; } catch (error) { space.destroy(); throw error; }
  }

  private async load(): Promise<void> {
    // Preserve the panorama's 2:1 projection and each sprite's native aspect/alpha.
    const images = await Promise.allSettled(SPACE_ASSETS.map(async name => {
      const texture = await this.raster.loadTexture(this.device, name);
      this.textures.push(texture);
      return { texture, aspect: texture.width / texture.height };
    }));
    const assets = images.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
    const sky = new Entity('Cosmic panorama'); sky.addComponent(this.sky);
    sky.addComponent(new Mesh3D(createSphere3D({ radius: 22000 * this.scale, widthSegments: 64, heightSegments: 32 }), new BasicMaterial({
      texture: assets[0]!.texture, color: [0.6, 0.6, 0.7, 1], cullMode: 'none',
      sampler: { minFilter: 'linear', magFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' },
    })));
    this.world.addEntity(sky);
    const positions: Vec3[] = [[8500, -1200, -7000], [-7600, 3100, 6500], [-4800, 6000, -9400]];
    for (let i = 0; i < 3; i++) this.planets.push(this.sprite(`Ringed planet ${i}`, assets[i + 1]!.texture,
      assets[i + 1]!.aspect, positions[i]!, [5600, 4200, 3900][i]!, false));
    for (let i = 0; i < 36; i++) this.meteors.push(this.sprite(`Shooting star ${i}`, assets[4]!.texture, assets[4]!.aspect, [0,0,0], 460 + i % 5 * 120, true));
  }

  private sprite(name: string, texture: GPUTexture, aspect: number, position: Vec3, width: number, additive: boolean): Sprite {
    const transform = new CartesianTransform3D(), material = new BasicMaterial({ texture, blending: additive ? 'additive' : 'normal',
      depthWrite: false, cullMode: 'none', sampler: { minFilter: 'linear', magFilter: 'linear' } });
    const entity = new Entity(name); entity.addComponent(transform); entity.addComponent(new Mesh3D(this.quad, material));
    this.world.addEntity(entity); return { transform, material, position, width, aspect };
  }

  update(time: number, eye: ArrayLike<number>): void {
    this.sky.setPosition(eye[0]!, eye[1]!, eye[2]!);
    for (const planet of this.planets) this.face(planet, eye, false);
    for (const [i, meteor] of this.meteors.entries()) {
      const life = (time / (6 + i % 5) + i * 0.618034) % 1, angle = i * 2.399963;
      const travel = life * 2200;
      meteor.position = [Math.sin(angle) * (6700 + i % 3 * 1100) + travel,
        -1200 + i % 9 * 850 - travel * 0.5, Math.cos(angle) * (6700 + i % 3 * 1100) + travel * 0.25];
      meteor.material.color = [0.7, 0.85, 1, Math.sin(Math.min(1, life / 0.65) * Math.PI) * 0.85];
      this.face(meteor, eye, true);
    }
  }

  private face(sprite: Sprite, eye: ArrayLike<number>, moving: boolean): void {
    const [x,y,z] = sprite.position.map(value => value * this.scale) as [number,number,number], dx = eye[0]! - x, dy = eye[1]! - y, dz = eye[2]! - z;
    const yaw = Math.atan2(dx,dz), altitude = Math.atan2(dy, Math.hypot(dx,dz));
    // Project the world velocity into the billboard so the bright head always leads its tail.
    const horizontal = Math.cos(yaw) - 0.25 * Math.sin(yaw);
    const vertical = -Math.sin(yaw) * Math.sin(altitude) - 0.5 * Math.cos(altitude) - 0.25 * Math.cos(yaw) * Math.sin(altitude);
    const roll = moving ? Math.atan2(vertical, horizontal) : 0;
    sprite.transform.setPosition(x,y,z).setRotation(-altitude, yaw, roll)
      .setScale(sprite.width * this.scale, sprite.width / sprite.aspect * this.scale, 1);
  }
  get counts(): { planets: number; meteors: number } { return { planets: this.planets.length, meteors: this.meteors.length }; }
  destroy(): void { for (const texture of this.textures) texture.destroy(); }
}
