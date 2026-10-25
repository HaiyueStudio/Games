import { sessionAudio } from '../../session/audio';
import { gameSession } from '../../session/SessionPause';
import { SingleSlotGameSave, isRecord } from '../../save/SingleSlotGameSave';

type Cue = 'slide' | 'fracture' | 'forge' | 'new-game' | 'blocked';
const cues: Cue[] = ['slide', 'fracture', 'forge', 'new-game', 'blocked'];

/** One gesture-unlocked context; bounded voices, with session pause and reset ownership. */
export class MetalAudio {
  muted = false;
  private context: AudioContext | undefined;
  private readonly bytes = new Map<Cue, ArrayBuffer>();
  private readonly buffers = new Map<Cue, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private decoding: Promise<void> | undefined;
  private generation = 0;
  private disposed = false;
  private readonly preferences = new SingleSlotGameSave<{ muted: boolean }>({
    gameId: '2048-metal-preferences', name: '2048 sound preference',
    validateData: (value): value is { muted: boolean } => isRecord(value) && typeof value.muted === 'boolean',
  });

  async load(): Promise<void> {
    await Promise.all(cues.map(async cue => {
      try {
        const response = await fetch(`./assets/${cue}.wav`);
        if (!response.ok) throw new Error(`${response.status}`);
        const bytes = await response.arrayBuffer();
        if (!this.disposed) this.bytes.set(cue, bytes);
      } catch (error) { console.warn(`[2048 audio] ${cue} unavailable`, error); }
    }));
    const preference = await this.preferences.load();
    if (!this.disposed && preference) this.muted = preference.muted;
  }

  unlock(): void {
    if (this.disposed || this.muted || gameSession.paused) return;
    try {
      this.context ??= sessionAudio(new AudioContext({ latencyHint: 'interactive' }));
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      this.decoding ??= Promise.all([...this.bytes].map(async ([cue, bytes]) => {
        try {
          const buffer = await this.context!.decodeAudioData(bytes.slice(0));
          if (!this.disposed) this.buffers.set(cue, buffer);
        }
        catch (error) { console.warn(`[2048 audio] Cannot decode ${cue}`, error); }
      })).then(() => {});
    } catch { /* Audio support is optional. */ }
  }

  play(cue: Cue, rank = 1): void {
    this.unlock();
    if (this.muted || !this.context || this.disposed) return;
    const generation = this.generation;
    void this.decoding?.then(() => {
      const buffer = this.buffers.get(cue), context = this.context;
      if (!buffer || !context || context.state !== 'running' || this.muted || this.disposed || generation !== this.generation || gameSession.paused) return;
      if (this.voices.size >= 8) {
        const oldest = this.voices.values().next().value;
        if (oldest) { oldest.stop(); this.voices.delete(oldest); }
      }
      const voice = context.createBufferSource(), gain = context.createGain();
      voice.buffer = buffer;
      voice.playbackRate.value = cue === 'forge' ? Math.min(1.6, 0.92 + rank * 0.035) : 1;
      gain.gain.value = cue === 'slide' ? 0.22 : 0.38;
      voice.connect(gain).connect(context.destination);
      this.voices.add(voice);
      voice.onended = () => { this.voices.delete(voice); voice.disconnect(); gain.disconnect(); };
      voice.start();
    });
  }

  toggle(): void {
    this.muted = !this.muted;
    this.stop();
    this.preferences.save({ muted: this.muted });
    if (!this.muted) this.play('new-game');
  }

  stop(): void {
    this.generation++;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
  }

  diagnostics() { return { loaded: this.bytes.size, decoded: this.buffers.size, voices: this.voices.size, state: this.context?.state ?? 'locked' }; }

  dispose(): void {
    this.disposed = true;
    this.stop();
    void this.context?.close().catch(() => {});
    this.bytes.clear(); this.buffers.clear();
  }
}
