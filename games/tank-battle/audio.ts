import type { GameState } from './rules';
export class ArcadeAudio {
  private context: AudioContext | null = null;
  muted = false;
  unlock(): void {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(kind: GameState['sounds'][number]): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const c = this.context; const oscillator = c.createOscillator(); const gain = c.createGain();
    const settings = { shoot: [650, 120, .055, .022], hit: [110, 65, .05, .018], explode: [80, 25, .23, .07], pickup: [420, 1100, .19, .045], over: [200, 35, .65, .06], clear: [360, 950, .4, .05] }[kind]!;
    oscillator.type = kind === 'explode' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(settings[0]!, c.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(settings[1]!, c.currentTime + settings[2]!);
    gain.gain.setValueAtTime(settings[3]!, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + settings[2]!);
    oscillator.connect(gain); gain.connect(c.destination); oscillator.start(); oscillator.stop(c.currentTime + settings[2]!);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  suspend(): void { void this.context?.suspend().catch(() => {}); }
  dispose(): void { void this.context?.close().catch(() => {}); }
}
