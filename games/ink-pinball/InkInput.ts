import { controlFor, type Control } from '../pinball/rules';
/** GUI pointer IDs and keyboard codes remain independent; cancelling never launches. */
export class InkInput {
  private held = new Set<string>();
  private pointers = new Map<number, Control>();
  private actions = new Set<Control>();
  private pendingRelease = new Map<number,boolean>();
  private abort = new AbortController();
  releasedCharge = false;
  private readonly enabled: () => boolean;
  constructor(enabled: () => boolean) {
    this.enabled=enabled;
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', event => {
      const c = controlFor(event.code);
      if (!c || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      if (!this.enabled() && c !== 'pause' && c !== 'restart') return;
      if (!this.held.has(event.code) && !event.repeat) this.actions.add(c);
      this.held.add(event.code);
    }, options);
    window.addEventListener('keyup', event => {
      if (!controlFor(event.code)) return;
      event.preventDefault(); const was = this.down('charge'); this.held.delete(event.code);
      if (this.enabled() && was && !this.down('charge')) this.releasedCharge = true;
    }, options);
    // Flush fallback releases after GuiSystem's queued events. This also covers
    // two fingers released in one frame and pointer capture lost outside the canvas.
    window.addEventListener('pointercancel', e => this.pendingRelease.set(e.pointerId,false), options);
    window.addEventListener('pointerup', e => this.pendingRelease.set(e.pointerId,true), options);
    window.addEventListener('lostpointercapture', e => { if(!this.pendingRelease.has(e.pointerId))this.pendingRelease.set(e.pointerId,false); }, options);
    window.addEventListener('blur', () => this.clear(), options);
  }
  press(c: Control, id: number): void { if (this.enabled()) { this.pointers.set(id, c); this.actions.add(c); } }
  release(id: number, launch = true): void {
    const was = this.down('charge'); this.pointers.delete(id);
    if (launch && this.enabled() && was && !this.down('charge')) this.releasedCharge = true;
  }
  flushReleases():void {for(const [id,launch] of this.pendingRelease)this.release(id,launch);this.pendingRelease.clear();}
  down(c: Control): boolean { return [...this.held].some(k => controlFor(k) === c) || [...this.pointers.values()].includes(c); }
  take(c: Control): boolean { const found = this.actions.has(c); this.actions.delete(c); return found; }
  clear(): void { this.held.clear(); this.pointers.clear(); this.pendingRelease.clear(); this.actions.clear(); this.releasedCharge = false; }
  dispose(): void { this.clear(); this.abort.abort(); }
}
