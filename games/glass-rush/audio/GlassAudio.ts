import type { Round } from '../rules/model';
export type GlassSound = 'music' | 'impact' | 'shatter';
export interface GlassAudioBackend {
  unlock(): void;
  suspend(): void;
  play(id: GlassSound, loop: boolean): boolean;
  stop(channel?: GlassSound): void;
  dispose(): void;
  snapshot(): unknown;
}

/** Phase and hit transitions only: audio never consumes gameplay randomness or advances rules. */
export class GlassAudio {
  muted = false;
  private round: Round | null = null;
  private phase = 'ready';
  private hits = 0;
  private music = false;
  private suspended = true;
  private disposed = false;
  private clock = 0;
  private pending: { id: GlassSound; until: number } | null = null;
  private played = { music: 0, impact: 0, shatter: 0 };
  private readonly backend: GlassAudioBackend;
  constructor(backend: GlassAudioBackend) { this.backend = backend; }
  unlock(): void { if (!this.disposed && !this.muted) { this.suspended = false; this.backend.unlock(); } }
  pause(): void { if (this.disposed) return; this.pending = null; this.suspended = true; this.backend.suspend(); }
  toggle(): void {
    if (this.disposed) return;
    this.muted = !this.muted; this.pending = null; this.backend.stop(); this.music = false;
    if (this.muted) this.pause(); else if (this.phase === 'playing') this.unlock();
  }
  sync(round: Round, dt: number): void {
    if (this.disposed) return;
    this.clock += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (round !== this.round) {
      this.backend.stop(); this.music = false; this.pending = null; this.hits = 0; this.round = round;
    }
    if (round.phase !== this.phase) {
      if (round.phase === 'playing') this.unlock();
      else if (round.phase === 'paused' || round.phase === 'ready') this.pause();
      if (round.phase === 'over') { this.backend.stop('music'); this.music = false; }
      this.phase = round.phase;
    }
    if (round.hits > this.hits && !this.muted && !this.suspended) this.pending = { id: round.hits >= 4 ? 'shatter' : 'impact', until: this.clock + .25 };
    this.hits = round.hits;
    if (this.muted || this.suspended) return;
    if (this.pending) {
      if (this.clock > this.pending.until) this.pending = null;
      else if (this.backend.play(this.pending.id, false)) { this.played[this.pending.id]++; this.pending = null; }
    }
    if (round.phase === 'playing' && !this.music && this.backend.play('music', true)) { this.music = true; this.played.music++; }
  }
  snapshot() { return { muted: this.muted, musicPlaying: this.music && !this.suspended && !this.muted && this.phase === 'playing', played: { ...this.played }, pending: !!this.pending, backend: this.backend.snapshot() }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.pending = null; this.backend.dispose(); }
}
