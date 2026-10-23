import type { Point } from './model';

export const SWIPE_GAP_MS = 150;
export const SWIPE_MAX_MS = 650;
interface Sample extends Point { time: number; id: number }
/** A short continuous sweep, independent of how many pointer events the device emits. */
export class Swipe {
  private previous: Sample | null = null;
  private started = 0;
  private direction: Point | null = null;
  clear(): void { this.previous = null; this.direction = null; }
  begin(point: Point, time: number, id: number): void {
    this.previous = { ...point, time, id }; this.started = time; this.direction = null;
  }
  move(point: Point, time: number, id: number): { a: Point; b: Point; newStroke: boolean } | null {
    const previous = this.previous;
    if (!previous || previous.id !== id || time - previous.time >= SWIPE_GAP_MS) { this.begin(point, time, id); return null; }
    const dx = point.x - previous.x, dy = point.y - previous.y, length = Math.hypot(dx, dy);
    // Zero-length samples neither cut nor keep an idle gesture alive.
    if (length < .1) return { a: previous, b: point, newStroke: false };
    const direction = { x: dx / length, y: dy / length };
    const reversed = this.direction !== null && direction.x * this.direction.x + direction.y * this.direction.y < -.25;
    const newStroke = reversed || time - this.started >= SWIPE_MAX_MS;
    if (newStroke) this.started = time;
    this.direction = direction; this.previous = { ...point, time, id };
    return { a: previous, b: point, newStroke };
  }
}
