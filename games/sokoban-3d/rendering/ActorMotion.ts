import type { CartesianTransform3D } from '@haiyue/engine';
import { Easing, TweenManager } from '@haiyue/engine/tween';

type Position = readonly [number, number, number];

/** Presentation only: board coordinates and save data never contain interpolated positions. */
export class ActorMotion {
  private readonly tweens = new TweenManager();
  get busy(): boolean { return this.tweens.count > 0; }
  slide(transform: CartesianTransform3D, to: Position, player: boolean, reduced: boolean): void {
    const from = [...transform.position], dx = to[0] - from[0]!, dz = to[2] - from[2]!;
    const distance = Math.hypot(dx, dz), yaw = transform.rotation[1]!, heading = player && distance >= .01 ? Math.atan2(dx, dz) : yaw;
    const turn = ((heading - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (reduced || distance < .01) { transform.setPosition(...to); transform.setRotation(0, heading, 0); return; }
    const target = { progress: 0 }, duration = player ? 150 : 180;
    const tween = this.tweens.create(target, { duration, easing: Easing.sineInOut });
    tween.onUpdate = state => {
      const p = state.progress, lift = Math.sin(Math.PI * p);
      transform.setPosition(from[0]! + dx * p, from[1]! + (to[1] - from[1]!) * p + lift * (player ? 3.2 : .7), from[2]! + dz * p);
      transform.setRotation(lift * dz / 42 * (player ? .12 : .025), yaw + turn * p, -lift * dx / 42 * (player ? .12 : .025));
    };
    tween.onComplete = () => { transform.setPosition(...to); transform.setRotation(0, heading, 0); };
    tween.to({ progress: 1 });
  }
  bump(transform: CartesianTransform3D, dx: number, dz: number, reduced: boolean): void {
    if (reduced) return;
    const from = [...transform.position], target = { progress: 0 };
    const tween = this.tweens.create(target, { duration: 105, easing: Easing.linear });
    tween.onUpdate = state => { const p = Math.sin(Math.PI * state.progress); transform.setPosition(from[0]! + dx * p * 2.2, from[1]!, from[2]! + dz * p * 2.2); };
    tween.onComplete = () => { transform.setPosition(from[0]!, from[1]!, from[2]!); };
    tween.to({ progress: 1 });
  }
  update(time: number, delta: number): void { this.tweens.update(time, Math.max(0, Number.isFinite(delta) ? delta : 0)); }
  clear(): void { this.tweens.clear(); }
}
