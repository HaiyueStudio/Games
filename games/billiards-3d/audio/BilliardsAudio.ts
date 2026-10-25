import type { BilliardsSound } from './sounds';

export interface BilliardsAudioBackend {
  unlock(): void;
  play(id: BilliardsSound, strength: number, pan: number): boolean;
  stop(): void;
  dispose(): void;
  snapshot(): unknown;
}

/** Contact cooldowns use simulation time; no audio callbacks drive game state. */
export class BilliardsAudio {
  private clock = 0;
  private won = false;
  private disposed = false;
  private readonly contacts = new Map<string, number>();
  private readonly played = { cue: 0, collision: 0, cushion: 0, pocket: 0, victory: 0 };
  private readonly backend: BilliardsAudioBackend;
  constructor(backend: BilliardsAudioBackend) { this.backend = backend; }
  unlock(): void { if (!this.disposed) this.backend.unlock(); }
  update(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0 && !this.disposed) this.clock += seconds;
  }
  cue(power: number): void { this.play('cue', 0.25 + power * 0.75, 0); }
  contact(pair: string, cushion: boolean, speed: number, x: number): void {
    if (this.disposed || speed < 0.12 || !Number.isFinite(speed)) return;
    if (this.clock - (this.contacts.get(pair) ?? -Infinity) < 0.065) return;
    if (this.play(cushion ? 'cushion' : 'collision', Math.min(1, 0.12 + speed / 7), x)) {
      this.contacts.set(pair, this.clock);
    }
  }
  pocket(x: number): void { this.play('pocket', 1, x); }
  victory(): void {
    if (this.disposed || this.won) return;
    this.won = true;
    this.play('victory', 1, 0);
  }
  reset(): void {
    if (this.disposed) return;
    this.backend.stop(); this.contacts.clear(); this.won = false;
  }
  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.disposed = true; this.backend.dispose();
  }
  snapshot() { return { played: { ...this.played }, disposed: this.disposed, backend: this.backend.snapshot() }; }
  private play(id: BilliardsSound, strength: number, x: number): boolean {
    if (this.disposed) return false;
    const accepted = this.backend.play(id, Math.max(0, Math.min(1, strength)), Math.max(-0.65, Math.min(0.65, x / 580)));
    if (accepted) this.played[id]++;
    return accepted;
  }
}
