import { OwnerSafeAudioMixer, type AudioMixerPlayRequest } from '@haiyue/engine/experimental/audio';
import type { MugenBuiltInGameFixture, MugenGameSound } from './MugenGameFixture';
import type { MugenMatchEvent } from '../runtime/match/MugenMatchState';
import type { MugenRoundAudioCue } from './MugenRoundAudio';

export interface MugenGameAudioConsumeResult { readonly requested: number; readonly played: number; readonly missing: number }

export class MugenGameAudio {
  readonly #mixer = new OwnerSafeAudioMixer({ maxVoicesTotal: 32, maxVoicesPerOwner: 8 });
  readonly #sounds = new Map<string, MugenGameSound>();
  readonly #ownerPackages = new Map<string, string>();
  #fightSoundCount = 0;
  #ready = false;

  async install(fixtures: readonly MugenBuiltInGameFixture[]): Promise<void> {
    for (const fixture of fixtures) for (const sound of fixture.sounds) if (sound.selectedByKey) { const key = soundKey(fixture.packageSha256, sound.group, sound.item); if (!this.#sounds.has(key)) await this.#mixer.decodeAndInstall(bufferId(sound), decodeBase64(sound.encodedBase64)); this.#sounds.set(key, sound); }
    this.#ready = true; this.#syncEvidence();
  }

  /** Drops decoded character audio that is no longer used by either player. */
  retainFixtures(fixtures: readonly MugenBuiltInGameFixture[]): void {
    const retainedPackages = new Set(fixtures.map(fixture => fixture.packageSha256)); const systemPackage = this.#ownerPackages.get('system'); if (systemPackage !== undefined) retainedPackages.add(systemPackage);
    const removedBufferIds = new Set<string>();
    for (const [key, sound] of this.#sounds) { const separator = key.indexOf(':'); if (separator >= 0 && retainedPackages.has(key.slice(0, separator))) continue; this.#sounds.delete(key); removedBufferIds.add(bufferId(sound)); }
    const retainedBufferIds = new Set([...this.#sounds.values()].map(bufferId)); for (const id of removedBufferIds) if (!retainedBufferIds.has(id)) this.#mixer.removeBuffer(id);
    this.#syncEvidence();
  }

  async installFightSounds(soundBankSha256: string | null, sounds: readonly MugenGameSound[]): Promise<void> {
    this.#ownerPackages.delete('system'); this.#fightSoundCount = 0;
    if (soundBankSha256 !== null) {
      for (const sound of sounds) if (sound.selectedByKey) { await this.#mixer.decodeAndInstall(bufferId(sound), decodeBase64(sound.encodedBase64)); this.#sounds.set(soundKey(soundBankSha256, sound.group, sound.item), sound); }
      this.#ownerPackages.set('system', soundBankSha256); this.#fightSoundCount = sounds.filter(sound => sound.selectedByKey).length;
    }
    this.#syncEvidence();
  }

  configureOwners(value: Readonly<Record<'P1' | 'P2', string>>): void { this.#ownerPackages.set('P1', value.P1); this.#ownerPackages.set('P2', value.P2); }

  async unlock(): Promise<void> { if (!this.#ready) return; await this.#mixer.unlock(); this.#syncEvidence(); }

  async suspend(): Promise<void> { if (!this.#ready) return; await this.#mixer.suspend(); this.#syncEvidence(); }

  async resume(): Promise<void> { if (!this.#ready) return; await this.#mixer.resume(); this.#syncEvidence(); }

  startMusic(): void { this.#syncEvidence(); }

  stopMusic(): void { if (!this.#ready) return; this.#mixer.stop('system', 'bgm'); this.#syncEvidence(); }

  reset(): void {
    if (!this.#ready) return;
    this.#mixer.stop('P1');
    this.#mixer.stop('P2');
    this.#mixer.stop('system');
    this.#syncEvidence();
  }

  consume(events: readonly MugenMatchEvent[]): MugenGameAudioConsumeResult {
    let requested = 0; let played = 0; let missing = 0;
    if (!this.#ready) return Object.freeze({ requested, played, missing });
    for (const event of events) {
      if (event.kind === 'audio') { const owner = event.resourceOwner === 'fight' ? 'system' : event.fighterId; if (event.operation === 'stop') this.#mixer.stop(owner, channel(event.channel)); else if (event.operation === 'pan') this.#mixer.setPan(owner, channel(event.channel), event.pan / 127); else { requested += 1; if (this.#play(event.id, owner, channel(event.channel, event.id), event.group, event.item, event.tick, event.volume / 255, event.pan / 127, event.frequency, event.loop, 20, 'sfx', !event.lowPriority)) played += 1; else missing += 1; } }
    }
    this.#syncEvidence(); return Object.freeze({ requested, played, missing });
  }

  playCues(cues: readonly MugenRoundAudioCue[], tick: number): MugenGameAudioConsumeResult {
    let requested = 0; let played = 0; let missing = 0;
    if (!this.#ready) return Object.freeze({ requested, played, missing });
    for (const [index, cue] of cues.entries()) {
      requested += 1;
      const eventId = `mugen-round-cue-${tick}-${index}-${cue.kind}-${cue.owner}`;
      if (this.#play(eventId, cue.owner, cue.channel, cue.group, cue.item, tick, 1, 0, 1, false, cue.priority)) played += 1; else missing += 1;
    }
    this.#syncEvidence(); return Object.freeze({ requested, played, missing });
  }

  dispose(): void { this.#mixer.dispose(); this.#sounds.clear(); this.#ownerPackages.clear(); this.#ready = false; this.#syncEvidence(); }
  get stats() { return this.#mixer.stats; }

  #play(eventId: string, owner: string, voiceChannel: string, group: number, item: number, startTick: number, volume: number, pan: number, frequency: number, loop: boolean, priority: number, bus: AudioMixerPlayRequest['bus'] = 'sfx', replaceChannel = true): boolean {
    const packageSha256 = this.#ownerPackages.get(owner); if (!packageSha256) return false;
    const sound = this.#sounds.get(soundKey(packageSha256, group, item)); if (!sound) return false;
    const request: AudioMixerPlayRequest = Object.freeze({ eventId, bufferId: bufferId(sound), owner, channel: voiceChannel, bus, priority, loop, volume: Math.max(0, Math.min(1, volume)), pan: Math.max(-1, Math.min(1, pan)), frequency, startTick, replaceChannel });
    try { this.#mixer.play(request); return true; } catch { return false; /* Audio side effects never mutate simulation. */ }
  }

  #syncEvidence(): void { if (typeof document === 'undefined') return; const stats = this.#mixer.stats; document.body.dataset.audioStatus = stats.state; document.body.dataset.audioVoices = String(stats.voices); document.body.dataset.audioNodes = String(stats.audioNodes); document.body.dataset.audioBuffers = String(stats.buffers); document.body.dataset.audioSampleRate = stats.sampleRate === null ? 'unavailable' : String(stats.sampleRate); document.body.dataset.fightSoundBank = this.#ownerPackages.get('system') ?? 'unavailable'; document.body.dataset.fightSoundCount = String(this.#fightSoundCount); }
}

function channel(value: number, eventId?: string): string { return value < 0 ? `auto:${eventId ?? 'none'}` : `channel:${value}`; }
function bufferId(sound: MugenGameSound): string { return `snd:${sound.encodedSha256}`; }
function soundKey(packageSha256: string, group: number, item: number): string { return `${packageSha256}:${group},${item}`; }
function decodeBase64(value: string): ArrayBuffer { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index); return bytes.buffer; }
