import type { Direction, Input } from './rules';
export interface Pad { x: number; y: number; radius: number }
/** Pointer identities remain independent, even when fingers cross the screen. */
export class MobileControls {
  stick: number | null = null;
  trigger: number | null = null;
  x = 0; y = 0;
  direction: Direction | null = null;
  down(id: number, x: number, y: number, stick: Pad, fire: Pad): boolean {
    if (this.stick === null && Math.hypot(x - stick.x, y - stick.y) <= stick.radius) {
      this.stick = id; this.move(id, x, y, stick); return true;
    }
    if (this.trigger === null && Math.hypot(x - fire.x, y - fire.y) <= fire.radius) { this.trigger = id; return true; }
    return false;
  }
  move(id: number, x: number, y: number, pad: Pad): void {
    if (id !== this.stick) return;
    const dx = x - pad.x, dy = y - pad.y, distance = Math.hypot(dx, dy);
    const limit = pad.radius * .48, scale = distance > limit ? limit / distance : 1;
    this.x = dx * scale; this.y = dy * scale;
    this.direction = distance < pad.radius * .18 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  }
  up(id: number): void {
    if (id === this.stick) { this.stick = null; this.x = this.y = 0; this.direction = null; }
    if (id === this.trigger) this.trigger = null;
  }
  clear(): void { this.stick = this.trigger = null; this.x = this.y = 0; this.direction = null; }
  input(): Input { return { direction: this.direction, fire: this.trigger !== null }; }
}
