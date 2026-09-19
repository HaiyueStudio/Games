import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import { CALENDAR_SOUND_IDS } from './Sounds';
import type { CalendarAudioBackend } from './CalendarAudio';
/** Uses the public Engine mixer; no browser audio globals are touched by the native backend. */
export class CalendarBrowserAudio implements CalendarAudioBackend {
  private readonly mixer = new OwnerSafeAudioMixer({ maxVoicesTotal: 6, maxVoicesPerOwner: 6 });
  private error: string | null = null;
  private disposed = false;
  private active = false;
  private job: Promise<void> | null = null;
  constructor() { this.mixer.setMasterVolume(.40); }
  async load(): Promise<void> {
    try { await Promise.all(CALENDAR_SOUND_IDS.map(async id => {
      const response = await fetch(`./assets/audio/${id}.wav`);
      if (!response.ok) throw new Error(`Missing calendar sound ${id}`);
      await this.mixer.decodeAndInstall(id, await response.arrayBuffer());
    })); } catch (error) { this.error = String(error); }
  }
  unlock(): void {
    if (this.disposed || this.error) return;
    this.active = true; if (this.job) return;
    this.job = this.mixer.unlock().catch(error => { this.error = String(error); }).finally(() => {
      this.job = null;
      if (!this.active && !this.disposed) void this.mixer.suspend().catch(() => {});
    });
  }
  play(id: string, options: Parameters<CalendarAudioBackend['play']>[1]): boolean {
    if (this.disposed || this.error || this.mixer.stats.state !== 'running') return false;
    try { return !!this.mixer.play({ eventId: options.channel, bufferId: id, owner: 'calendar-puzzle', channel: options.channel,
      bus: 'sfx', priority: options.priority, volume: options.gain, pan: 0, loop: false, replaceChannel: true, startTick: 0 });
    } catch (error) {
      if (error instanceof RangeError && error.message.includes('voice budget')) return false;
      this.error = String(error); return false;
    }
  }
  suspend(): void {
    this.active = false; if (this.disposed) return;
    this.mixer.stop('calendar-puzzle');
    void this.mixer.suspend().then(() => { if (this.active && !this.disposed) this.unlock(); }).catch(error => { this.error = String(error); });
  }
  dispose(): void { if (this.disposed) return; this.active = false; this.disposed = true; this.mixer.dispose(); }
  snapshot() { return { kind: 'web-audio', error: this.error, ...this.mixer.stats }; }
}
