import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { sessionAudio } from '../../session/audio';
import { FRUIT_SOUND_IDS, fruitSoundPath, type FruitSound } from './sounds';
import type { FruitAudioBackend, FruitAudioPlay } from './FruitAudio';

/** Public Engine mixer owns decoding, voice budgets, node teardown and context disposal. */
export class FruitBrowserAudio implements FruitAudioBackend {
  private readonly mixer = new OwnerSafeAudioMixer({ contextFactory: () => sessionAudio(new AudioContext()), maxVoicesTotal: 12, maxVoicesPerOwner: 12 });
  private error: string | null = null;
  private disposed = false;
  private unlockJob: Promise<void> | null = null;
  constructor() { this.mixer.setMasterVolume(.62); }
  async load(signal: AbortSignal): Promise<void> {
    const results = await Promise.allSettled(FRUIT_SOUND_IDS.map(async id => {
      const response = await fetch(fruitSoundPath(id), { signal });
      if (!response.ok) throw new Error(`Fruit sound ${id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!this.disposed && !signal.aborted) await this.mixer.decodeAndInstall(id, bytes);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (!this.disposed && !signal.aborted && failure?.status === 'rejected') this.error = String(failure.reason);
  }
  unlock(): void {
    if (this.disposed || this.error || this.unlockJob) return;
    this.unlockJob = this.mixer.unlock().catch(error => { if (!this.disposed) this.error = String(error); }).finally(() => { this.unlockJob = null; });
  }
  play(id: FruitSound, options: FruitAudioPlay): boolean {
    if (this.disposed || this.error || this.mixer.stats.state !== 'running') return false;
    try {
      return !!this.mixer.play({ eventId: id, bufferId: id, owner: 'fruit-ninja', channel: options.channel,
        bus: id === 'ui-click' ? 'ui' : 'sfx', volume: options.gain, pan: options.pan, priority: options.priority,
        frequency: options.rate, loop: false, replaceChannel: true, startTick: 0 });
    } catch (error) {
      if (error instanceof RangeError && error.message.includes('voice budget')) return false;
      this.error = String(error); this.stop(); return false;
    }
  }
  stop(channel?: string): void { if (!this.disposed) this.mixer.stop('fruit-ninja', channel); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.mixer.dispose(); }
  snapshot() { return { error: this.error, ...this.mixer.stats }; }
}
