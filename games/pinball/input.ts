import { controlFor, type Control } from './rules';

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
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      const control = button.dataset.control as Control;
      button.addEventListener('pointerdown', event => {
        event.preventDefault(); button.setPointerCapture(event.pointerId);
        this.held.add(`touch:${control}:${event.pointerId}`); this.actions.add(control);
      }, options);
      const release = (event: PointerEvent) => {
        const wasCharging = this.down('charge');
        this.held.delete(`touch:${control}:${event.pointerId}`);
        if (event.type === 'pointerup' && wasCharging && !this.down('charge')) this.releasedCharge = true;
      };
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
      // Keyboard activation of the accessible touch controls.
      button.addEventListener('click', event => {
        if (event.detail === 0) this.actions.add(control === 'charge' ? 'launch' : control);
      }, options);
    }
  }
  down(control: Control): boolean {
    return [...this.held].some(key => key.startsWith(`touch:${control}:`) || controlFor(key) === control);
  }
  take(control: Control): boolean { const value = this.actions.has(control); this.actions.delete(control); return value; }
  clear(): void { this.held.clear(); this.actions.clear(); this.releasedCharge = false; }
  dispose(): void { this.clear(); this.abort.abort(); }
}
