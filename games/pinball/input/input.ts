import { controlFor, type Control } from '../rules/rules';

/** DOM events accumulate until a simulation frame; no auto-repeat actions. */
export class PinballInput {
  private readonly held = new Set<string>();
  private readonly actions = new Set<Control>();
  private readonly abort = new AbortController();
  releasedCharge = false;
  constructor() {
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', event => {
      const control = controlFor(event.code);
      if (!control || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      if (!this.held.has(event.code) && !event.repeat) this.actions.add(control);
      this.held.add(event.code);
    }, options);
    window.addEventListener('keyup', event => {
      if (!controlFor(event.code)) return;
      event.preventDefault();
      const wasCharging = this.down('charge');
      this.held.delete(event.code);
      if (wasCharging && !this.down('charge')) this.releasedCharge = true;
    }, options);
    window.addEventListener('pointerup', event => this.release(event.pointerId), options);
    window.addEventListener('pointercancel', event => this.release(event.pointerId, true), options);
  }
  press(control: Control, pointerId: number): void {
    this.held.add(`touch:${control}:${pointerId}`); this.actions.add(control);
  }
  release(pointerId: number, cancelled = false): void {
    const wasCharging = this.down('charge');
    for (const key of this.held) if (key.startsWith('touch:') && key.endsWith(`:${pointerId}`)) this.held.delete(key);
    if (!cancelled && wasCharging && !this.down('charge')) this.releasedCharge = true;
  }

  down(control: Control): boolean {
    for (const key of this.held) if (key.startsWith(`touch:${control}:`) || controlFor(key) === control) return true;
    return false;
  }
  take(control: Control): boolean { const value = this.actions.has(control); this.actions.delete(control); return value; }
  clear(): void { this.held.clear(); this.actions.clear(); this.releasedCharge = false; }
  dispose(): void { this.clear(); this.abort.abort(); }
}
