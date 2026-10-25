import { JIGSAW_SOUND_IDS, type JigsawSound } from './sounds';

export interface JigsawAudioBackend {
  unlock(): void;
  play(id: JigsawSound): boolean;
  stop(channel?: JigsawSound): void;
  suspend(): void;
  dispose(): void;
  snapshot(): unknown;
}

/** Short event queue retries gesture unlock, but never replays stale or paused interactions. */
export class JigsawAudio {
  private clock = 0;
  private paused = false;
  private disposed = false;
  private completed = false;
  private readonly pending = new Map<JigsawSound, { at: number; until: number }>();
  private readonly last = new Map<JigsawSound, number>();
  private readonly played = { 'ui-click': 0, 'piece-click': 0, snap: 0, complete: 0 };
  private readonly backend: JigsawAudioBackend;
  constructor(backend: JigsawAudioBackend) { this.backend = backend; }
  unlock(): void { if (!this.disposed && !this.paused) this.backend.unlock(); }
  emit(id: JigsawSound): void {
    if (this.disposed || this.paused || (id === 'complete' && this.completed)
      || this.clock - (this.last.get(id) ?? -Infinity) < .035) return;
    if (id === 'complete') this.completed = true;
    this.last.set(id, this.clock); this.backend.unlock();
    const at = this.clock + (id === 'complete' ? .12 : 0);
    this.pending.set(id, { at, until: at + .25 });
  }
  update(dt: number): void {
    if (this.disposed) return;
    if (Number.isFinite(dt) && dt > 0) this.clock += dt;
    if (this.paused) return;
    for (const [id, cue] of this.pending) {
      if (this.clock > cue.until) this.pending.delete(id);
      else if (this.clock >= cue.at && this.backend.play(id)) { this.played[id]++; this.pending.delete(id); }
    }
  }
  reset(completed: boolean): void {
    if (this.disposed) return;
    this.completed = completed;
    for (const id of JIGSAW_SOUND_IDS) if (id !== 'ui-click') { this.pending.delete(id); this.last.delete(id); this.backend.stop(id); }
  }
  pause(): void {
    if (this.disposed) return;
    this.paused = true; this.pending.clear(); this.last.clear(); this.backend.stop(); this.backend.suspend();
  }
  resume(): void { if (!this.disposed) this.paused = false; }
  snapshot() { return { paused: this.paused, played: { ...this.played }, pending: this.pending.size, backend: this.backend.snapshot() }; }
  dispose(): void { if (this.disposed) return; this.pause(); this.disposed = true; this.backend.dispose(); }
}
