import { OwnerSafeAudioMixer, type AudioMixerPlayRequest } from '@haiyue/engine/experimental/audio';
import type { MugenViewerAction, MugenViewerAudioCue, MugenViewerSound } from './MugenCharacterModel';

const OWNER = 'mugen-viewer';

interface MugenViewerAudioMixer {
  setMasterVolume(value: number): void;
  unlock(): Promise<void>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  stop(owner: string): number;
  removeBuffer(id: string): boolean;
  decodeAndInstall(id: string, bytes: ArrayBuffer): Promise<unknown>;
  play(request: AudioMixerPlayRequest): string | null;
  dispose(): void;
}

export class MugenViewerAudio {
  readonly #mixer: MugenViewerAudioMixer;
  readonly #installed = new Set<string>();
  readonly #decodeJobs = new Map<string, Promise<void>>();
  #activeActionId: string | null = null;
  #generation = 0;
  #modelGeneration = 0;
  #eventSequence = 0;
  #disposed = false;

  constructor(mixer: MugenViewerAudioMixer = new OwnerSafeAudioMixer({ maxVoicesTotal: 12, maxVoicesPerOwner: 12 })) { this.#mixer = mixer; }

  setVolume(value: number): void { this.#mixer.setMasterVolume(Math.max(0, Math.min(1, value))); }

  async unlock(): Promise<void> {
    if (this.#disposed) return;
    try { await this.#mixer.unlock(); } catch { /* A browser without audio support can still use the viewer. */ }
  }

  async setPlaying(value: boolean): Promise<void> {
    if (this.#disposed) return;
    try { if (value) await this.#mixer.resume(); else await this.#mixer.suspend(); } catch { /* Audio is an optional preview side effect. */ }
  }

  reset(): void {
    this.#modelGeneration += 1; this.#generation += 1; this.#activeActionId = null;
    this.#mixer.stop(OWNER);
    for (const id of this.#installed) this.#mixer.removeBuffer(id);
    this.#installed.clear(); this.#decodeJobs.clear();
  }

  select(action: MugenViewerAction, playFromStart: boolean): void {
    this.#generation += 1;
    this.#activeActionId = action.id;
    this.#mixer.stop(OWNER);
    if (playFromStart) this.playAtTick(action, 0);
  }

  stop(): void {
    this.#generation += 1;
    this.#mixer.stop(OWNER);
  }

  playAtTick(action: MugenViewerAction, tick: number): void {
    if (this.#disposed || action.id !== this.#activeActionId) return;
    for (const cue of action.audioCues) if (cue.tick === tick) void this.#play(action.id, cue, tick);
  }

  advance(action: MugenViewerAction, previousTick: number, currentTick: number): void {
    if (this.#disposed || action.id !== this.#activeActionId || currentTick <= previousTick) return;
    for (const cue of action.audioCues) {
      for (const tick of cueOccurrences(action, cue.tick, previousTick, currentTick, cue.repeatOnLoop)) void this.#play(action.id, cue, tick);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation += 1; this.#activeActionId = null;
    this.#mixer.dispose(); this.#installed.clear(); this.#decodeJobs.clear();
  }

  async #play(actionId: string, cue: MugenViewerAudioCue, startTick: number): Promise<void> {
    const generation = this.#generation;
    try { await this.#ensureSound(cue.sound); } catch { return; }
    if (this.#disposed || generation !== this.#generation || actionId !== this.#activeActionId) return;
    const sequence = this.#eventSequence++;
    const request: AudioMixerPlayRequest = Object.freeze({
      eventId: `viewer:${startTick}:${sequence}`,
      bufferId: bufferId(cue.sound), owner: OWNER,
      channel: cue.channel < 0 ? `auto:${sequence}` : `channel:${cue.channel}`,
      bus: 'sfx', priority: 20, loop: cue.loop, volume: cue.volume,
      pan: cue.pan, frequency: cue.frequency, startTick,
    });
    try { this.#mixer.play(request); } catch { /* Preview audio is optional and never affects animation playback. */ }
  }

  #ensureSound(sound: MugenViewerSound): Promise<void> {
    const id = bufferId(sound);
    if (this.#installed.has(id)) return Promise.resolve();
    const existing = this.#decodeJobs.get(id); if (existing) return existing;
    const generation = this.#modelGeneration;
    const job = this.#mixer.decodeAndInstall(id, decodeBase64(sound.encodedBase64)).then(() => {
      if (generation === this.#modelGeneration) this.#installed.add(id); else this.#mixer.removeBuffer(id);
    }).finally(() => { if (this.#decodeJobs.get(id) === job) this.#decodeJobs.delete(id); });
    this.#decodeJobs.set(id, job); return job;
  }
}

export function cueOccurrences(action: MugenViewerAction, cueTick: number, previousTick: number, currentTick: number, repeatOnLoop = true): readonly number[] {
  if (cueTick < 0 || currentTick <= previousTick) return Object.freeze([]);
  const result: number[] = [];
  if (cueTick > previousTick && cueTick <= currentTick) result.push(cueTick);
  if (!repeatOnLoop) return Object.freeze(result);
  const { totalTicks, preLoopTicks, loopTicks } = action.action;
  if (totalTicks === null || loopTicks === null || cueTick < preLoopTicks) return Object.freeze(result);
  const firstCycle = Math.max(1, Math.floor((previousTick - cueTick) / loopTicks) + 1);
  for (let cycle = firstCycle, tick = cueTick + firstCycle * loopTicks; tick <= currentTick; cycle += 1, tick = cueTick + cycle * loopTicks) result.push(tick);
  return Object.freeze(result);
}

function bufferId(sound: MugenViewerSound): string { return `mugen-viewer:snd:${sound.encodedSha256}`; }
function decodeBase64(value: string): ArrayBuffer { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes.buffer; }
