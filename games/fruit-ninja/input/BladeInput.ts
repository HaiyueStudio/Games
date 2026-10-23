import type { Point } from '../rules/model';
import { Swipe } from '../rules/swipe';

/** Pointer samples are swept segments, never frame-local point hits. */
export class BladeInput {
  private readonly lifetime = new AbortController();
  private readonly swipe = new Swipe();
  constructor(canvas: HTMLCanvasElement, canSlice: (p: Point) => boolean, slice: (a: Point, b: Point) => void, action: (action: 'start' | 'pause') => void, private readonly endStroke: () => void) {
    const options = { signal: this.lifetime.signal };
    canvas.addEventListener('pointerdown', e => {
      const rect = canvas.getBoundingClientRect(), point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.clear();
      if (e.button === 0 && canSlice(point)) this.swipe.begin(point, performance.now(), e.pointerId);
    }, options);
    canvas.addEventListener('pointermove', e => {
      const rect = canvas.getBoundingClientRect(), p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!canSlice(p) || (e.pointerType !== 'mouse' && e.buttons === 0)) { this.clear(); return; }
      const segment = this.swipe.move(p, performance.now(), e.pointerId);
      if (!segment || segment.newStroke) this.endStroke();
      if (segment) slice(segment.a, segment.b);
    }, options);
    for (const type of ['pointerleave', 'pointercancel', 'pointerup']) canvas.addEventListener(type, () => this.clear(), options);
    window.addEventListener('blur', () => this.clear(), options);
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.code === 'KeyP' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.clear(); action(e.code === 'KeyP' ? 'pause' : 'start'); }
    }, options);
  }
  clear(): void { this.swipe.clear(); this.endStroke(); }
  destroy(): void { this.lifetime.abort(); this.clear(); }
}
