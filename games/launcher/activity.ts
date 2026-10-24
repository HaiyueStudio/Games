/** The launcher must release its animation loop while another game owns the screen. */
export class LauncherActivity {
  ready = false;
  playing = false;
  hidden = false;
  suspended = false;
  disposed = false;
  running = false;
  private readonly loop: { start(): void; stop(): void };
  constructor(loop: { start(): void; stop(): void }) { this.loop = loop; }
  update(state: Partial<Pick<LauncherActivity, 'ready' | 'playing' | 'hidden' | 'suspended'>>): void {
    Object.assign(this, state);
    const next = this.ready && !this.playing && !this.hidden && !this.suspended && !this.disposed;
    if (next === this.running) return;
    this.running = next;
    if (next) this.loop.start(); else this.loop.stop();
  }
  destroy(): void { this.disposed = true; this.update({ ready: false }); }
}
