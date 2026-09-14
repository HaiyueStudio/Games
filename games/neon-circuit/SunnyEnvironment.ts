import { BasicMaterial, CartesianTransform3D, Entity, Mesh3D, type World } from '@haiyue/engine';
import { createSphere3D } from '@haiyue/engine/geometry';
import type { NeonRaster } from './NeonRaster';

/** The sunny panorama follows the camera, keeping distant clouds beyond every inverted road section. */
export class SunnyEnvironment {
  private readonly transform = new CartesianTransform3D();
  private constructor(private readonly texture: GPUTexture, world: World) {
    const sky = new Entity('Sunny cloud-sea panorama'); sky.addComponent(this.transform);
    sky.addComponent(new Mesh3D(createSphere3D({radius:42000,widthSegments:96,heightSegments:48}),new BasicMaterial({
      texture, cullMode:'none', sampler:{minFilter:'linear',magFilter:'linear',addressModeU:'repeat',addressModeV:'clamp-to-edge'},
    })));
    world.addEntity(sky);
  }
  static async create(world:World,device:GPUDevice,raster:NeonRaster):Promise<SunnyEnvironment> {
    return new SunnyEnvironment(await raster.loadTexture(device,'sunny-panorama'),world);
  }
  update(eye:ArrayLike<number>):void {this.transform.setPosition(eye[0]!,eye[1]!,eye[2]!);}
  destroy():void {this.texture.destroy();}
}
