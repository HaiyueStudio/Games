import { OwnerSafeAudioMixer, type AudioMixerPlayRequest } from '@haiyue/engine/experimental/audio';
import type { MugenCharacterModel, MugenViewerAction, MugenViewerAudioCue, MugenViewerSound } from './MugenCharacterModel';

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
  #selectedCues: readonly MugenViewerAudioCue[] | null = null;
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
    this.#modelGeneration += 1; this.#generation += 1; this.#activeActionId = null; this.#selectedCues = null;
    this.#mixer.stop(OWNER);
    for (const id of this.#installed) this.#mixer.removeBuffer(id);
    this.#installed.clear(); this.#decodeJobs.clear();
  }

  select(action: MugenViewerAction, playFromStart: boolean, selectedCue?: MugenViewerAudioCue | null): void {
    this.#generation += 1;
    this.#activeActionId = action.id;
    this.#selectedCues = selectedCue === undefined ? null : selectedCue === null ? Object.freeze([]) : Object.freeze([selectedCue]);
    this.#mixer.stop(OWNER);
    if (playFromStart) this.playAtTick(action, 0);
  }

  stop(): void {
    this.#generation += 1;
    this.#mixer.stop(OWNER);
  }

  playAtTick(action: MugenViewerAction, tick: number): void {
    if (this.#disposed || action.id !== this.#activeActionId) return;
    for (const cue of this.#activeCues(action)) if (cue.tick === tick) void this.#play(action.id, cue, tick);
  }

  advance(action: MugenViewerAction, previousTick: number, currentTick: number): void {
    if (this.#disposed || action.id !== this.#activeActionId || currentTick <= previousTick) return;
    for (const cue of this.#activeCues(action)) {
      for (const tick of cueOccurrences(action, cue.tick, previousTick, currentTick, cue.repeatOnLoop)) void this.#play(action.id, cue, tick);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation += 1; this.#activeActionId = null; this.#selectedCues = null;
    this.#mixer.dispose(); this.#installed.clear(); this.#decodeJobs.clear();
  }

  #activeCues(action: MugenViewerAction): readonly MugenViewerAudioCue[] {
    return this.#selectedCues ?? action.audioCues;
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

export interface MugenViewerInferredHitAudio {
  readonly cue: MugenViewerAudioCue;
  readonly sourceActionNumber: number | null;
  readonly candidateCount: number;
}

export function listMugenViewerHitAudioCandidates(model: MugenCharacterModel): readonly MugenViewerInferredHitAudio[] {
  const globalCandidates = model.inferredHitAudioCues ?? [];
  if (globalCandidates.length > 0) return Object.freeze(globalCandidates.map(cue => Object.freeze({
    cue,
    sourceActionNumber: null,
    candidateCount: globalCandidates.length,
  })));
  const candidates = new Map<string, { cue: MugenViewerAudioCue; sourceActionNumber: number; occurrences: number }>();
  for (const source of model.actions) {
    if (source.action.number < 5_000 || source.action.number > 5_199) continue;
    for (const cue of source.audioCues) {
      if (cue.loop) continue;
      const key = `${cue.sound.group},${cue.sound.item}`;
      const existing = candidates.get(key);
      if (existing) existing.occurrences += 1;
      else candidates.set(key, { cue, sourceActionNumber: source.action.number, occurrences: 1 });
    }
  }
  const ranked = [...candidates.values()].sort((left, right) => right.occurrences - left.occurrences
    || left.cue.sound.group - right.cue.sound.group || left.cue.sound.item - right.cue.sound.item
    || left.sourceActionNumber - right.sourceActionNumber);
  if (ranked.length === 0) return Object.freeze([]);
  const strongestCoverage = ranked[0]!.occurrences;
  const pool = ranked.filter(value => value.occurrences >= Math.max(1, strongestCoverage - 1));
  return Object.freeze(pool.map(value => Object.freeze({
    cue: Object.freeze({ ...value.cue, tick: 0, loop: false, repeatOnLoop: false }),
    sourceActionNumber: value.sourceActionNumber,
    candidateCount: pool.length,
  })));
}

/**
 * Selects a deterministic preview-only hurt voice from cues that the character
 * already binds to MUGEN's standard get-hit actions. This never mutates or
 * masquerades as an authored PlaySnd association on the selected action.
 */
export function inferMugenViewerHitAudio(model: MugenCharacterModel, action: MugenViewerAction): MugenViewerInferredHitAudio | null {
  if (action.audioCues.length > 0) return null;
  const candidates = listMugenViewerHitAudioCandidates(model);
  return candidates[Math.abs(action.action.number) % candidates.length] ?? null;
}

export function cueOccurrences(action: MugenViewerAction, cueTick: number, previousTick: number, currentTick: number, repeatOnLoop = true): readonly number[] {
  if (cueTick < 0 || currentTick <= previousTick) return Object.freeze([]);
  const result: number[] = [];
  if (cueTick > previousTick && cueTick <= currentTick) result.push(cueTick);
  if (!repeatOnLoop) return Object.freeze(result);
  const { totalTicks, preLoopTicks, loopTicks } = action.action;
  if (totalTicks === null || loopTicks === null || loopTicks <= 0) return Object.freeze(result);
  if (cueTick < preLoopTicks) {
    const firstCycle = Math.max(0, Math.floor((previousTick - totalTicks) / loopTicks) + 1);
    for (let cycle = firstCycle, tick = totalTicks + firstCycle * loopTicks; tick <= currentTick; cycle += 1, tick = totalTicks + cycle * loopTicks) {
      if (tick > previousTick) result.push(tick);
    }
    return Object.freeze(result);
  }
  const firstCycle = Math.max(1, Math.floor((previousTick - cueTick) / loopTicks) + 1);
  for (let cycle = firstCycle, tick = cueTick + firstCycle * loopTicks; tick <= currentTick; cycle += 1, tick = cueTick + cycle * loopTicks) result.push(tick);
  return Object.freeze(result);
}

function bufferId(sound: MugenViewerSound): string { return `mugen-viewer:snd:${sound.encodedSha256}`; }
function decodeBase64(value: string): ArrayBuffer { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes.buffer; }
