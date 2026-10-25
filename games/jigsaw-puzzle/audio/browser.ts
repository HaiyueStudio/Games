import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { sessionAudio } from '../../session/audio';
import { JIGSAW_SOUND_IDS, JIGSAW_SOUNDS, type JigsawSound } from './sounds';
import type { JigsawAudioBackend } from './JigsawAudio';

/** Engine owns decoded buffers, bounded voices, audio nodes and context teardown. */
export class JigsawBrowserAudio implements JigsawAudioBackend {
  private readonly mixer = new OwnerSafeAudioMixer({ contextFactory: () => sessionAudio(new AudioContext({ latencyHint: 'interactive' })), maxVoicesTotal: 4, maxVoicesPerOwner: 4 });
  private error: string | null = null;
  private disposed = false;
  private desired = false;
  private transition: Promise<void> | null = null;
  constructor() { this.mixer.setMasterVolume(.65); }
  async load(signal: AbortSignal): Promise<void> {
    const results = await Promise.allSettled(JIGSAW_SOUND_IDS.map(async id => {
      const response = await fetch(`./assets/audio/${id}.wav`, { signal });
      if (!response.ok) throw new Error(`Jigsaw audio ${id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!this.disposed && !signal.aborted) await this.mixer.decodeAndInstall(id, bytes);
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (!this.disposed && !signal.aborted && failed?.status === 'rejected') this.error = String(failed.reason);
  }
  unlock(): void {
    this.desired = true; this.settle();
  }
  private settle(): void {
    if (this.disposed || this.error || this.transition) return;
    this.transition = (async () => {
      let active: boolean;
      do {
        active = this.desired;
        if (active) await this.mixer.unlock(); else await this.mixer.suspend();
      } while (!this.disposed && active !== this.desired);
    })().catch(error => { if (!this.disposed) this.error = String(error); }).finally(() => { this.transition = null; });
  }
  play(id: JigsawSound): boolean {
    if (this.disposed || this.error || !this.desired || this.mixer.stats.state !== 'running') return false;
    try {
      const sound = JIGSAW_SOUNDS[id];
      return !!this.mixer.play({ eventId: id, bufferId: id, owner: 'jigsaw-puzzle', channel: id,
        bus: id === 'ui-click' ? 'ui' : 'sfx', volume: sound.gain, priority: sound.priority, loop: false, replaceChannel: true, startTick: 0 });
    } catch (error) { this.error = String(error); this.stop(); return false; }
  }
  stop(channel?: JigsawSound): void { if (!this.disposed) this.mixer.stop('jigsaw-puzzle', channel); }
  suspend(): void { this.desired = false; this.settle(); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.mixer.dispose(); }
  snapshot() { return { error: this.error, ...this.mixer.stats }; }
}
