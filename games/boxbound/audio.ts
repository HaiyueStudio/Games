import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { SOUND_NAMES, type SoundCue, type SoundName } from './sound-events';
/** Cached MIDI-rendered samples; the engine owns and retires playback nodes. */
export class BoxboundAudio {
  private mixer = new OwnerSafeAudioMixer({ maxVoicesTotal: 8, maxVoicesPerOwner: 8 });
  private abort = new AbortController();
  private loading?: Promise<void>;
  private queue: (SoundCue & { at: number })[] = [];
  private disposed = false;
  private ready = false;
  muted = false;
  error = '';
  readonly recent: SoundName[] = [];
  constructor(private clock: () => number = () => performance.now()) {
    this.mixer.setMasterVolume(0.65);
  }
  get diagnostics() { return { ...this.mixer.stats, ready: this.ready, muted: this.muted, pending: this.queue.length, recent: [...this.recent], error: this.error }; }
  async unlock(): Promise<void> {
    if (this.disposed || this.muted) return;
    try {
      await this.mixer.unlock();
      if (this.disposed) return;
      this.loading ??= Promise.all(SOUND_NAMES.map(async (name) => {
        const response = await fetch(new URL(`./assets/audio/${name}.wav`, location.href), { signal: this.abort.signal });
        if (!response.ok) throw new Error(`音效加载失败：${name}`);
        const bytes = await response.arrayBuffer();
        if (!this.disposed) await this.mixer.decodeAndInstall(name, bytes);
      })).then(() => { if (!this.disposed) this.ready = true; });
      await this.loading;
    } catch (error) {
      if (!this.disposed) this.error = String(error);
    }
  }
  schedule(cues: SoundCue[]): void {
    if (this.disposed || this.muted || !this.ready) return;
    for (const cue of cues) this.queue.push({ ...cue, at: this.clock() + cue.delay });
    if (this.queue.length > 24) this.queue.splice(0, this.queue.length - 24);
    this.tick();
  }
  tick(): void {
    if (this.disposed || this.muted || !this.queue.length) return;
    const now = this.clock(), due = this.queue.filter((c) => c.at <= now);
    this.queue = this.queue.filter((c) => c.at > now);
    for (const cue of due) {
      const voice = this.mixer.play({ eventId: cue.name, bufferId: cue.name, owner: 'boxbound', channel: cue.name, bus: 'sfx', startTick: Math.floor(now), replaceChannel: true });
      if (voice) {
        this.recent.push(cue.name);
        if (this.recent.length > 32) this.recent.shift();
      }
    }
  }
  stop(): void { this.queue.length = 0; if (!this.disposed) this.mixer.releaseOwner('boxbound'); }
  setMuted(muted: boolean): void { this.muted = muted; if (muted) this.stop(); }
  suspend(): void { this.stop(); if (!this.disposed) void this.mixer.suspend().catch(() => {}); }
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.ready = false;
    this.abort.abort();
    this.mixer.dispose();
    this.recent.length = 0;
  }
}
