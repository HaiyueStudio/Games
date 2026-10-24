import type { DeviceOrientation } from './layout';

const quarterTurn = Math.PI / 2;
export function cameraQuarter(heading: number, current: number): number {
  const angle = current * quarterTurn + Math.atan2(Math.sin(heading - current * quarterTurn), Math.cos(heading - current * quarterTurn));
  return Math.abs(angle - current * quarterTurn) > Math.PI / 4 + .13 ? Math.round(angle / quarterTurn) : current;
}
export function quarterOrientation(quarter: number): DeviceOrientation { return Math.abs(quarter % 2) === 1 ? 'landscape' : 'portrait'; }
export function screenFit(angle: number, physical: { width: number; height: number }, logical: { width: number; height: number }): number {
  const cosine = Math.abs(Math.cos(angle)), sine = Math.abs(Math.sin(angle));
  return Math.max((cosine * logical.width + sine * logical.height) / physical.width, (sine * logical.width + cosine * logical.height) / physical.height);
}
export function screenPoint(horizontal: number, vertical: number, angle: number, physical: { width: number; height: number }, logical: { width: number; height: number }, inverse = false) {
  const size = inverse ? logical : physical, target = inverse ? physical : logical, scale = screenFit(angle, physical, logical);
  const rotation = inverse ? -angle : angle, cosine = Math.cos(rotation), sine = Math.sin(rotation), factor = inverse ? 1 / scale : scale;
  const centeredX = (horizontal - .5) * size.width, centeredY = (vertical - .5) * size.height;
  return { x: .5 + (cosine * centeredX - sine * centeredY) * factor / target.width, y: .5 + (sine * centeredX + cosine * centeredY) * factor / target.height };
}
export class ScreenOrientation {
  quarter = 0;
  angle = 0;
  private candidate = 0;
  private stable = 0;
  private start = 0;
  private elapsed = .44;
  get rotating(): boolean { return this.elapsed < .44; }
  update(heading: number, delta: number, reducedMotion = false): boolean {
    const candidate = cameraQuarter(heading, this.quarter);
    if (candidate !== this.candidate) { this.candidate = candidate; this.stable = 0; }
    this.stable += delta;
    let changed = false;
    if (candidate !== this.quarter && this.stable >= .1) { this.start = this.angle; this.quarter = candidate; this.elapsed = 0; changed = true; }
    this.elapsed = reducedMotion ? .44 : Math.min(.44, this.elapsed + delta);
    const fraction = this.elapsed / .44, eased = fraction * fraction * (3 - 2 * fraction);
    this.angle = this.start + (this.quarter * quarterTurn - this.start) * eased;
    return changed;
  }
}
