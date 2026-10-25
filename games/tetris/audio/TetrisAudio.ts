import { sessionAudio } from '../../session/audio';

interface ClearNote { midi: number; at: number; duration: number; volume: number; wave?: OscillatorType }

// Separate phrases, rather than progressively longer slices of the same scale.
const CLEAR_CUES: readonly (readonly ClearNote[])[] = [
  // Single: one clean crystal chime with a brief upper partial.
  [{ midi: 84, at: 0, duration: .18, volume: .075 }, { midi: 96, at: 0, duration: .075, volume: .02 }],
  // Double: a clearly spaced, rising perfect fourth.
  [{ midi: 79, at: 0, duration: .095, volume: .075 }, { midi: 84, at: .095, duration: .23, volume: .075 }, { midi: 96, at: .095, duration: .11, volume: .02 }],
  // Triple: a quick three-note flourish ending on a brighter ninth.
  [{ midi: 76, at: 0, duration: .13, volume: .07 }, { midi: 79, at: .06, duration: .13, volume: .07 }, { midi: 86, at: .12, duration: .28, volume: .075 }, { midi: 98, at: .12, duration: .15, volume: .018 }],
  // Tetris: a broad arpeggio, a resolving chord and a final sparkle.
  [{ midi: 72, at: 0, duration: .14, volume: .06, wave: 'triangle' }, { midi: 76, at: .045, duration: .14, volume: .06, wave: 'triangle' },
    { midi: 79, at: .09, duration: .14, volume: .06, wave: 'triangle' }, { midi: 84, at: .135, duration: .25, volume: .07 },
    { midi: 60, at: .2, duration: .38, volume: .035 }, { midi: 64, at: .2, duration: .42, volume: .03 }, { midi: 67, at: .2, duration: .46, volume: .03 },
    { midi: 96, at: .24, duration: .26, volume: .022 }],
];

/** Short original synth cues; no downloads, timers, or looping sources. */
export class TetrisAudio {
  muted = false;
  private context: AudioContext | null = null;
  private readonly voices = new Set<OscillatorNode>();
  private readonly played = { button: 0, clear: 0, drop: 0 };
  private readonly clearsByLines = [0, 0, 0, 0];
  private disposed = false;
  private error: string | null = null;
  unlock(): void {
    if (this.disposed || this.muted) return;
    try {
      this.context ??= sessionAudio(new AudioContext({ latencyHint: 'interactive' }));
      if (this.context.state === 'suspended') void this.context.resume().catch(error => { this.error = String(error); });
    } catch (error) { this.error = String(error); }
  }
  private tone(hz: number, at: number, duration: number, volume: number, endHz = hz, attack = .004, wave: OscillatorType = 'sine'): void {
    const ctx = this.context;
    if (!ctx || this.muted || this.disposed || this.voices.size >= 16) return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = wave; oscillator.frequency.setValueAtTime(hz, at); oscillator.frequency.exponentialRampToValueAtTime(endHz, at + duration);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + attack); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(ctx.destination); this.voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(oscillator); };
    oscillator.start(at); oscillator.stop(at + duration + .01);
  }
  play(id: 'button' | 'clear' | 'drop', lines = 1): void {
    this.unlock();
    if (!this.context || this.muted || this.disposed || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    this.played[id]++;
    if (id === 'button') { this.tone(740, now, .08, .065, 1120); return; }
    if (id === 'drop') {
      // A quick glassy tick: bright fundamental and a shorter, quiet upper partial.
      this.tone(1320, now, .065, .07, 1080, .0015);
      this.tone(2640, now, .03, .022, 2420, .001);
      return;
    }
    const variant = Number.isFinite(lines) ? Math.max(1, Math.min(4, Math.floor(lines))) - 1 : 0;
    this.clearsByLines[variant] = this.clearsByLines[variant]! + 1;
    for (const note of CLEAR_CUES[variant]!) {
      const hz = 440 * 2 ** ((note.midi - 69) / 12);
      this.tone(hz, now + note.at, note.duration, note.volume, hz, .002, note.wave);
    }
  }
  stop(): void { for (const voice of this.voices) voice.stop(); }
  toggle(): void { this.muted = !this.muted; if (this.muted) this.stop(); else this.play('button'); }
  snapshot() { return { muted: this.muted, voices: this.voices.size, state: this.context?.state ?? 'locked', error: this.error, played: { ...this.played }, clearsByLines: [...this.clearsByLines] }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stop(); if (this.context) void this.context.close().catch(() => {}); }
}
