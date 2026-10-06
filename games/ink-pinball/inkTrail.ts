/** A bounded, deterministic ink wake. Teleports never paint across the table. */
export const TRAIL_LIMIT = 180;
export const TRAIL_LIFE = 1.45;
export interface InkMark { x: number; y: number; length: number; angle: number; born: number }
export class InkTrail {
  readonly marks: InkMark[] = [];
  private previous: { x: number; y: number } | null = null;
  sample(time: number, x: number, y: number, painting: boolean): void {
    while (this.marks.length && time - this.marks[0]!.born >= TRAIL_LIFE) this.marks.shift();
    if (!painting) { this.previous = null; return; }
    const last = this.previous;
    this.previous = { x, y };
    if (!last) return;
    const distance = Math.hypot(x - last.x, y - last.y);
    if (distance < 0.15 || distance > 45) return;
    if (this.marks.length === TRAIL_LIMIT) this.marks.shift();
    this.marks.push({ x: (x + last.x) / 2, y: (y + last.y) / 2, length: distance, angle: Math.atan2(last.y - y, x - last.x), born: time });
  }
  reset(): void { this.marks.length = 0; this.previous = null; }
}
