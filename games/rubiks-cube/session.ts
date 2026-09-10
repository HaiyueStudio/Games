import { CubeModel, inverse, scramble } from './model';
import type { Kind, Move } from './model';
export interface Turn {
  move: Move;
  elapsed: number;
  duration: number;
  undo: boolean;
}
/** Serial animation transactions: commit rules/history only when a turn finishes. */
export class CubeSession {
  model: CubeModel;
  active: Turn | null = null;
  private queue: Move[] = [];
  restoring = false;
  constructor(kind: Kind) {
    this.model = new CubeModel(kind);
  }
  get busy(): boolean {
    return !!this.active || this.queue.length > 0 || this.restoring;
  }
  get remaining(): number {
    return this.restoring ? this.model.history.length : this.queue.length + Number(!!this.active);
  }
  turn(move: Move): boolean {
    if (this.busy) return false;
    this.active = { move: { ...move }, elapsed: 0, duration: 0.22, undo: false };
    return true;
  }
  shuffle(seed: number): void {
    if (!this.busy) this.queue = scramble(this.model.order, seed);
  }
  restore(): void {
    if (!this.busy && this.model.history.length) this.restoring = true;
  }
  stop(): void {
    this.queue = [];
    this.restoring = false;
  }
  undo(): void {
    const last = this.model.history[this.model.history.length - 1];
    if (!this.busy && last) this.active = { move: inverse(last), elapsed: 0, duration: 0.22, undo: true };
  }
  update(delta: number): boolean {
    let changed = false;
    if (!this.active) {
      const last = this.model.history[this.model.history.length - 1];
      if (this.restoring && !last) this.restoring = false;
      const move = this.restoring && last ? inverse(last) : this.queue.shift();
      if (move)
        this.active = { move, elapsed: 0, duration: this.restoring ? 0.1 : 0.075, undo: this.restoring };
    }
    if (this.active) {
      this.active.elapsed += Math.max(0, Math.min(delta, 0.05));
      if (this.active.elapsed >= this.active.duration) {
        if (this.active.undo) this.model.undo();
        else this.model.apply(this.active.move);
        this.active = null;
        changed = true;
        if (this.restoring && !this.model.history.length) this.restoring = false;
      }
    }
    return changed;
  }
}
