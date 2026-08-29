import { CartesianTransform3D, Entity, Mesh3D, type World } from '@haiyue/engine';
import { createCylinder3D } from '@haiyue/engine/geometry';
import { BlinnPhongMaterial } from '@haiyue/engine/material';

const CUE_LENGTH = 112;
const CUE_TIP_DISTANCE = 19;
const CUE_MAX_PULLBACK = 38;

export class CueStick {
  private readonly entity: Entity;
  private readonly transform: CartesianTransform3D;

  constructor(world: World) {
    this.entity = new Entity('Cue Stick');
    this.transform = new CartesianTransform3D();
    this.entity.addComponent(this.transform);
    this.entity.addComponent(new Mesh3D(
      createCylinder3D({
        radiusTop: 2.2,
        radiusBottom: 5.2,
        height: CUE_LENGTH,
        radialSegments: 24,
      }),
      new BlinnPhongMaterial({
        diffuse: [0.72, 0.38, 0.12, 1],
        ambient: [0.30, 0.14, 0.04, 1],
        specular: [0.48, 0.34, 0.18, 1],
        shininess: 34,
      }),
    ));
    this.entity.disabled = true;
    world.addEntity(this.entity);
  }

  show(
    cueX: number,
    cueY: number,
    cueZ: number,
    direction: readonly [number, number],
    power: number,
  ): void {
    const clampedPower = Math.max(0, Math.min(1, power));
    const distance = CUE_TIP_DISTANCE + CUE_LENGTH * 0.5 + CUE_MAX_PULLBACK * clampedPower;
    const [directionX, directionZ] = direction;
    this.transform
      .setPosition(
        cueX - directionX * distance,
        cueY,
        cueZ - directionZ * distance,
      )
      .setRotation(Math.PI * 0.5, Math.atan2(directionX, directionZ), 0);
    this.entity.disabled = false;
  }

  hide(): void {
    this.entity.disabled = true;
  }
}
