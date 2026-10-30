import { sessionAudio } from '../../session/audio';
import { SOKOBAN_RATE, SOKOBAN_SOUNDS, synthesizeSokobanSound, type SokobanSound } from './sounds';

/** Short bounded one-shots; session pause owns the same AudioContext as gameplay. */
export class SokobanAudio {
  muted = false;
  private context: AudioContext | null = null;
  private readonly buffers = new Map<SokobanSound, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private readonly played = Object.fromEntries(Object.keys(SOKOBAN_SOUNDS).map(id => [id, 0])) as Record<SokobanSound, number>;
  private disposed = false;
  private error: string | null = null;
  unlock(): void {
    if (this.disposed || this.muted) return;
    try {
      if (!this.context) {
        this.context = sessionAudio(new AudioContext({ latencyHint: 'interactive' }));
        for (const id of Object.keys(SOKOBAN_SOUNDS) as SokobanSound[]) {
          const pcm = synthesizeSokobanSound(id), buffer = this.context.createBuffer(1, pcm.length, SOKOBAN_RATE);
          buffer.getChannelData(0).set(pcm); this.buffers.set(id, buffer);
        }
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(error => { this.error = String(error); });
    } catch (error) { this.error = String(error); }
  }
  play(id: SokobanSound): void {
    if (this.disposed || this.muted) return;
    this.unlock(); const context = this.context;
    if (!context || this.voices.size >= 8 || context.state === 'closed') return;
    const source = context.createBufferSource(), gain = context.createGain(); source.buffer = this.buffers.get(id)!;
    gain.gain.value = id === 'step' ? .2 : id === 'push' ? .35 : .45;
    source.connect(gain); gain.connect(context.destination); this.voices.add(source); this.played[id]++;
    source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(source); };
    source.start();
  }
  toggle(): void { this.muted = !this.muted; if (this.muted) this.stop(); else this.play('step'); }
  stop(): void { for (const source of this.voices) source.stop(); }
  snapshot() { return { muted: this.muted, state: this.context?.state ?? 'locked', voices: this.voices.size, played: { ...this.played }, error: this.error }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stop(); if (this.context) void this.context.close().catch(() => {}); }
}
