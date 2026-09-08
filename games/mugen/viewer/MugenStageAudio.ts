import { OwnerSafeAudioMixer, type AudioMixerPlayRequest } from '@haiyue/engine/experimental/audio';
import type { MugenStageMusic } from '../import/stage/MugenStageParser';

const OWNER = 'mugen-stage-preview';
const CHANNEL = 'bgm';

interface MugenStageAudioMixer {
  unlock(): Promise<void>;
  stop(owner: string, channel?: string): number;
  removeBuffer(id: string): boolean;
  decodeAndInstall(id: string, bytes: ArrayBuffer): Promise<unknown>;
  play(request: AudioMixerPlayRequest): string | null;
  dispose(): void;
}

/** Owns preview-only stage BGM independently from character action sounds. */
export class MugenStageAudio {
  readonly #mixer: MugenStageAudioMixer;
  #installedId: string | null = null;
  #playingId: string | null = null;
  #generation = 0;
  #disposed = false;

  constructor(mixer: MugenStageAudioMixer = new OwnerSafeAudioMixer({ maxVoicesTotal: 2, maxVoicesPerOwner: 2 })) { this.#mixer = mixer; }

  async unlock(): Promise<void> {
    if (this.#disposed) return;
    try { await this.#mixer.unlock(); } catch { /* Stage rendering remains available when browser audio is unavailable. */ }
  }

  async play(music: MugenStageMusic): Promise<void> {
    if (this.#disposed) return;
    const id = `mugen-stage-bgm:${music.sha256}`;
    if (this.#playingId === id) return;
    const generation = ++this.#generation;
    this.#mixer.stop(OWNER, CHANNEL);
    try {
      if (this.#installedId !== id) {
        if (this.#installedId !== null) this.#mixer.removeBuffer(this.#installedId);
        await this.#mixer.decodeAndInstall(id, asArrayBuffer(music.bytes));
        if (this.#disposed || generation !== this.#generation) { this.#mixer.removeBuffer(id); return; }
        this.#installedId = id;
      }
      const request: AudioMixerPlayRequest = Object.freeze({
        eventId: `stage-bgm:${music.sha256}`,
        bufferId: id,
        owner: OWNER,
        channel: CHANNEL,
        bus: 'music',
        priority: 10,
        replaceChannel: true,
        loop: true,
        volume: music.volume,
        pan: 0,
        frequency: 1,
        startTick: 0,
      });
      this.#playingId = this.#mixer.play(request) === null ? null : id;
    } catch (error) {
      this.#playingId = null;
      console.warn('[MUGEN viewer] Stage BGM could not be decoded or played.', { path: music.path, error });
    }
  }

  stop(): void {
    this.#generation += 1;
    this.#playingId = null;
    if (!this.#disposed) this.#mixer.stop(OWNER, CHANNEL);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
    this.#mixer.dispose();
    this.#installedId = null;
  }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
