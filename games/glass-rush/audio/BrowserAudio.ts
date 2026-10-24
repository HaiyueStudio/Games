import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { sessionAudio } from '../../session/audio';
import type { GlassAudioBackend, GlassSound } from './GlassAudio';

export class GlassBrowserAudio implements GlassAudioBackend {
  private readonly mixer = new OwnerSafeAudioMixer({ contextFactory: () => sessionAudio(new AudioContext({ latencyHint: 'interactive' })), maxVoicesTotal: 5, maxVoicesPerOwner: 5 });
  private disposed = false;
  private error: string | null = null;
  private desired = false;
  private job: Promise<void> | null = null;
  constructor() { this.mixer.setMasterVolume(.7); }
  async load(signal: AbortSignal): Promise<void> {
    const results = await Promise.allSettled((['music', 'impact', 'shatter'] as const).map(async id => {
      const response = await fetch(`./assets/audio/${id}.wav`, { signal });
      if (!response.ok) throw new Error(`Glass Rush audio ${id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!this.disposed && !signal.aborted) await this.mixer.decodeAndInstall(id, bytes);
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (!this.disposed && !signal.aborted && failed?.status === 'rejected') this.error = String(failed.reason);
  }
  private settle(): void {
    if (this.disposed || this.error || this.job) return;
    this.job = (async () => {
      let active: boolean;
      do {
        active = this.desired;
        if (active) await this.mixer.unlock(); else await this.mixer.suspend();
      } while (!this.disposed && active !== this.desired);
    })().catch(error => { if (!this.disposed) this.error = String(error); }).finally(() => { this.job = null; });
  }
  unlock(): void { this.desired = true; this.settle(); }
  suspend(): void { this.desired = false; this.settle(); }
  play(id: GlassSound, loop: boolean): boolean {
    if (this.disposed || this.error || !this.desired || this.mixer.stats.state !== 'running') return false;
    try {
      return !!this.mixer.play({ eventId: id, bufferId: id, owner: 'glass-rush', channel: id, bus: loop ? 'music' : 'sfx', volume: loop ? .38 : id === 'shatter' ? .9 : .72, priority: loop ? 100 : 80, loop, replaceChannel: true, startTick: 0 });
    } catch (error) { this.error = String(error); this.stop(); return false; }
  }
  stop(channel?: GlassSound): void { if (!this.disposed) this.mixer.stop('glass-rush', channel); }
  snapshot() { return { error: this.error, ...this.mixer.stats }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.desired = false; this.mixer.dispose(); }
}
