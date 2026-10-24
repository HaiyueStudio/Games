import { OwnerSafeAudioMixer } from '@haiyue/engine/experimental/audio';
import type { World } from '@haiyue/engine';
import { sessionAudio } from '../../../session/audio';
import { gameSession } from '../../../session/SessionPause';
import { MINE_SOUND_IDS, MINE_SOUNDS, type MineSound } from './SoundAssets';
import { MinesAudio, type MinesAudioBackend } from './MinesAudio';

class BrowserAudio implements MinesAudioBackend {
  private readonly mixer = new OwnerSafeAudioMixer({ contextFactory: () => sessionAudio(new AudioContext({ latencyHint: 'interactive' })), maxVoicesTotal: 4, maxVoicesPerOwner: 4 });
  private readonly owner: string;
  private disposed = false;
  private error: string | null = null;
  private unlocking: Promise<void> | null = null;
  constructor(owner: string) { this.owner = owner; this.mixer.setMasterVolume(.65); }
  async load(signal: AbortSignal): Promise<void> {
    const results = await Promise.allSettled(MINE_SOUND_IDS.map(async id => {
      const response = await fetch(`./assets/audio/${id}.wav`, { signal });
      if (!response.ok) throw new Error(`Mines sound ${id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!this.disposed && !signal.aborted) await this.mixer.decodeAndInstall(id, bytes);
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (!this.disposed && !signal.aborted && failure?.status === 'rejected') this.error = String(failure.reason);
  }
  unlock(): void {
    if (this.disposed || this.error || this.unlocking) return;
    this.unlocking = this.mixer.unlock().catch(error => { if (!this.disposed) this.error = String(error); }).finally(() => { this.unlocking = null; });
  }
  play(id: MineSound, rate: number): boolean {
    if (this.disposed || this.error || this.mixer.stats.state !== 'running') return false;
    const definition = MINE_SOUNDS[id];
    try {
      return !!this.mixer.play({ eventId: id, bufferId: id, owner: this.owner, channel: id, bus: id === 'button' ? 'ui' : 'sfx',
        volume: definition.gain, frequency: rate, priority: definition.priority, replaceChannel: true, loop: false, startTick: 0 });
    } catch (error) {
      if (error instanceof RangeError && error.message.includes('voice budget')) return false;
      this.error = String(error); this.stop(); return false;
    }
  }
  stop(id?: MineSound): void { if (!this.disposed) this.mixer.stop(this.owner, id); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.mixer.dispose(); }
  snapshot() { return { error: this.error, ...this.mixer.stats }; }
}

export async function createMinesAudio(world: World, canvas: HTMLCanvasElement, owner: string): Promise<MinesAudio> {
  const backend = new BrowserAudio(owner), audio = new MinesAudio(backend), abort = new AbortController();
  const unlock = () => audio.unlock();
  canvas.addEventListener('pointerdown', unlock, { capture: true, signal: abort.signal });
  window.addEventListener('keydown', unlock, { signal: abort.signal });
  const unregister = gameSession.register({ pause: () => audio.pause(), resume: () => audio.resume() });
  world.addRuntimeIntegration({ onDetach: () => { abort.abort(); unregister(); audio.dispose(); } });
  await backend.load(abort.signal);
  return audio;
}
