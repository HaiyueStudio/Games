import { GuiScrollView } from '@haiyue/engine/gui';

export class MomentumScrollView extends GuiScrollView {
  private wheelTarget: number | null = null;
  override get animating(): boolean { return this.wheelTarget !== null || super.animating; }
  override scrollBy(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return;
    if (!this.inertia) { super.scrollBy(delta); return; }
    const pending = this.wheelTarget === null ? 0 : this.wheelTarget - this.scrollOffset;
    const origin = pending * delta < 0 ? this.scrollOffset : this.wheelTarget ?? this.scrollOffset;
    this.wheelTarget = Math.max(0, Math.min(this.maxScrollOffset, origin + delta));
    super.stopInertia();
    if (Math.abs(this.wheelTarget - this.scrollOffset) < .1) this.wheelTarget = null;
    this.markDirty();
  }
  override scrollTo(position: number): void { this.wheelTarget = null; super.scrollTo(position); }
  easeTo(position: number): void {
    if (!this.inertia) { this.scrollTo(position); return; }
    super.stopInertia(); this.wheelTarget = Math.max(0, Math.min(this.maxScrollOffset, position)); this.markDirty();
  }
  override stopInertia(): void { this.wheelTarget = null; super.stopInertia(); }
  override fling(velocity: number): void { this.wheelTarget = null; super.fling(velocity); }
  override advanceAnimation(deltaMs: number): void {
    if (this.wheelTarget === null) { super.advanceAnimation(deltaMs); return; }
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const target = Math.max(0, Math.min(this.maxScrollOffset, this.wheelTarget));
    const next = target + (this.scrollOffset - target) * Math.exp(-deltaMs / 145);
    const settled = Math.abs(target - next) < .1;
    super.scrollTo(settled ? target : next);
    if (!settled) this.wheelTarget = target;
  }
}
