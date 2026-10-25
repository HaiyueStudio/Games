import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { sessionAudio } from '../../session/audio';
import { BilliardsAudio, type BilliardsAudioBackend } from './BilliardsAudio';
import { BILLIARDS_SAMPLE_RATE, BILLIARDS_SOUNDS, synthesizeBilliardsSound, type BilliardsSound } from './sounds';

class BrowserAudio implements BilliardsAudioBackend {
  private context: AudioContext | null = null;
  private readonly mixer = new OwnerSafeAudioMixer({
    contextFactory: () => (this.context = sessionAudio(new AudioContext({ latencyHint: 'interactive' }))),
    maxVoicesTotal: 8, maxVoicesPerOwner: 8,
  });
  private job: Promise<void> | null = null;
  private loaded = false;
  private disposed = false;
  private voice = 0;
  private error: string | null = null;
  constructor() { this.mixer.setMasterVolume(0.7); }
  unlock(): void {
    if (this.disposed || this.job) return;
    this.job = this.mixer.unlock().then(() => {
      if (this.disposed || this.loaded || !this.context) return;
      for (const id of Object.keys(BILLIARDS_SOUNDS) as BilliardsSound[]) {
        const samples = synthesizeBilliardsSound(id);
        const buffer = this.context.createBuffer(1, samples.length, BILLIARDS_SAMPLE_RATE);
        buffer.getChannelData(0).set(samples);
        this.mixer.installBuffer(id, buffer);
      }
      this.loaded = true;
    }).catch(error => { this.error = String(error); }).finally(() => { this.job = null; });
  }
  play(id: BilliardsSound, strength: number, pan: number): boolean {
    if (this.disposed || !this.loaded || this.mixer.stats.state !== 'running') return false;
    const sound = BILLIARDS_SOUNDS[id];
    try {
      return !!this.mixer.play({ eventId: id, bufferId: id, owner: 'billiards-3d',
        channel: id === 'victory' ? 'victory' : `effect-${this.voice++ % 7}`,
        bus: 'sfx', volume: sound.gain * strength, pan, priority: sound.priority,
        replaceChannel: true, loop: false, startTick: 0 });
    } catch (error) {
      if (error instanceof RangeError && error.message.includes('voice budget')) return false;
      this.error = String(error); return false;
    }
  }
  stop(): void { if (!this.disposed) this.mixer.stop('billiards-3d'); }
  dispose(): void { if (!this.disposed) { this.disposed = true; this.mixer.dispose(); } }
  snapshot() { return { error: this.error, ...this.mixer.stats }; }
}

export function createBilliardsAudio(): BilliardsAudio { return new BilliardsAudio(new BrowserAudio()); }
