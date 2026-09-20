import { CALENDAR_SOUNDS, type CalendarSound } from './Sounds';
export interface CalendarAudioBackend {
  load?(): Promise<void>;
  unlock(): void;
  play(id: string, options: { channel: string; loop: boolean; gain: number; pan: number; priority: number }): boolean;
  suspend(): void;
  dispose(): void;
  snapshot(): unknown;
}
/** Short bounded cues: await gesture unlock briefly, never replay old input after a resume. */
export class CalendarAudio {
  private readonly backend: CalendarAudioBackend;
  private readonly pending = new Map<CalendarSound, number>();
  private readonly last = new Map<CalendarSound, number>();
  private readonly played: Partial<Record<CalendarSound, number>> = {};
  private disposed = false;
  constructor(backend: CalendarAudioBackend) { this.backend = backend; }
  async load(): Promise<void> { await this.backend.load?.(); }
  get hasPending(): boolean { return this.pending.size > 0; }
  unlock(): void { if (!this.disposed) this.backend.unlock(); }
  cue(id: CalendarSound, now = performance.now()): void {
    if (this.disposed || now - (this.last.get(id) ?? -Infinity) < 65) return;
    this.unlock(); this.last.set(id, now); this.pending.set(id, now + 250); this.update(now);
  }
  update(now = performance.now()): void {
    if (this.disposed) return;
    for (const [id, until] of this.pending) {
      if (now > until) { this.pending.delete(id); continue; }
      if (this.backend.play(id, { channel: id, loop: false, gain: CALENDAR_SOUNDS[id].gain, pan: 0, priority: id === 'win' ? 100 : 20 })) {
        this.pending.delete(id); this.played[id] = (this.played[id] ?? 0) + 1;
      }
    }
  }
  suspend(): void { this.pending.clear(); this.last.clear(); if (!this.disposed) this.backend.suspend(); }
  dispose(): void { if (this.disposed) return; this.suspend(); this.disposed = true; this.backend.dispose(); }
  snapshot() { return { played: { ...this.played }, pending: this.pending.size, backend: this.backend.snapshot() }; }
}
