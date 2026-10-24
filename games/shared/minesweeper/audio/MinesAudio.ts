import type { MineSound } from './SoundAssets';

export interface MinesAudioBackend {
  unlock(): void;
  play(id: MineSound, rate: number): boolean;
  stop(id?: MineSound): void;
  dispose(): void;
  snapshot(): unknown;
}

/** One cue per accepted gesture; rules, visual restoration and flood expansion never emit audio. */
export class MinesAudio {
  private readonly backend: MinesAudioBackend;
  private clock = 0;
  private silenced = false;
  private paused = false;
  private disposed = false;
  private readonly pending = new Map<MineSound, { expires: number; rate: number }>();
  private readonly last = new Map<MineSound, number>();
  private readonly played = { click: 0, flag: 0, explosion: 0, button: 0 };
  constructor(backend: MinesAudioBackend) { this.backend = backend; }
  get muted(): boolean { return this.silenced; }
  unlock(): void { if (!this.disposed && !this.paused && !this.silenced) this.backend.unlock(); }
  click(): void { this.request('click'); }
  flag(placing = true): void { this.request('flag', placing ? 1 : .88); }
  explosion(): void {
    if (this.disposed || this.paused || this.silenced) return;
    this.pending.delete('click'); this.pending.delete('flag');
    this.backend.stop('click'); this.backend.stop('flag'); this.request('explosion');
  }
  button(): void { this.request('button'); }

  private request(id: MineSound, rate = 1): void {
    if (this.disposed || this.paused || this.silenced) return;
    if (this.clock - (this.last.get(id) ?? -Infinity) < .025) return;
    this.backend.unlock();
    if (this.backend.play(id, rate)) { this.played[id]++; this.last.set(id, this.clock); this.pending.delete(id); }
    else this.pending.set(id, { expires: this.clock + .24, rate });
  }

  update(seconds: number): void {
    if (this.disposed) return;
    if (Number.isFinite(seconds) && seconds > 0) this.clock += seconds;
    for (const [id, cue] of this.pending) {
      if (this.clock > cue.expires || this.paused || this.silenced) { this.pending.delete(id); continue; }
      if (this.backend.play(id, cue.rate)) {
        this.played[id]++; this.last.set(id, this.clock); this.pending.delete(id);
      }
    }
  }

  reset(): void {
    if (this.disposed) return;
    for (const id of ['click', 'flag', 'explosion'] as const) { this.pending.delete(id); this.last.delete(id); this.backend.stop(id); }
  }
  toggleMute(): boolean {
    if (this.disposed) return this.silenced;
    this.silenced = !this.silenced; this.pending.clear(); this.backend.stop(); this.last.clear();
    if (!this.silenced) this.button();
    return this.silenced;
  }
  pause(): void { if (this.disposed) return; this.paused = true; this.pending.clear(); this.backend.stop(); }
  resume(): void { if (this.disposed) return; this.paused = false; this.unlock(); }
  dispose(): void { if (this.disposed) return; this.pause(); this.disposed = true; this.backend.dispose(); }
  snapshot() { return { muted: this.silenced, paused: this.paused, disposed: this.disposed, pending: this.pending.size, played: { ...this.played }, backend: this.backend.snapshot() }; }
}
