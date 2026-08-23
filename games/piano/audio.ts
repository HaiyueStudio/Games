const MIN_AUDIBLE_GAIN = 0.0001;

type BrowserAudioScope = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

interface Partial {
  ratio: number;
  level: number;
  detune: number;
}

interface ActiveVoice {
  envelope: GainNode;
  oscillators: OscillatorNode[];
}

const PIANO_PARTIALS: readonly Partial[] = [
  { ratio: 1, level: 1, detune: -0.8 },
  { ratio: 1, level: 0.24, detune: 1.2 },
  { ratio: 2, level: 0.32, detune: 0 },
  { ratio: 3, level: 0.12, detune: 0 },
];

export function midiToFrequency(midi: number): number {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError(`MIDI note must be an integer between 0 and 127; received ${midi}.`);
  }
  return 440 * (2 ** ((midi - 69) / 12));
}

export function pianoVoiceDuration(midi: number): number {
  midiToFrequency(midi);
  return 1.25 + Math.max(0, Math.min(0.75, (72 - midi) / 68));
}

function audioContextConstructor(): typeof AudioContext | null {
  const scope = globalThis as BrowserAudioScope;
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export class PianoSynth {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly activeVoices = new Set<ActiveVoice>();

  get isSupported(): boolean {
    return audioContextConstructor() !== null;
  }

  async activate(): Promise<void> {
    const context = this.getContext();
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') {
      throw new Error(`AudioContext did not start; current state is ${context.state}.`);
    }
  }

  async play(midi: number, velocity = 118): Promise<void> {
    await this.activate();
    const context = this.context;
    if (!context) throw new Error('Piano audio context was not initialized.');

    const master = this.master;
    if (!master) throw new Error('Piano audio output was not initialized.');

    const frequency = midiToFrequency(midi);
    const duration = pianoVoiceDuration(midi);
    const start = context.currentTime;
    const end = start + duration;
    const strength = Math.max(0.05, Math.min(1, velocity / 127));
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const voice: ActiveVoice = { envelope, oscillators: [] };
    let activeOscillators = PIANO_PARTIALS.length;
    this.activeVoices.add(voice);

    envelope.gain.setValueAtTime(MIN_AUDIBLE_GAIN, start);
    envelope.gain.exponentialRampToValueAtTime(0.72 * strength, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.2 * strength, start + 0.13);
    envelope.gain.exponentialRampToValueAtTime(MIN_AUDIBLE_GAIN, end);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12_000, Math.max(1_800, frequency * 14)), start);
    filter.frequency.exponentialRampToValueAtTime(Math.min(7_000, Math.max(1_200, frequency * 8)), end);
    filter.Q.setValueAtTime(0.7, start);
    filter.connect(envelope);
    envelope.connect(master);

    for (const partial of PIANO_PARTIALS) {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      voice.oscillators.push(oscillator);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency * partial.ratio, start);
      oscillator.detune.setValueAtTime(partial.detune, start);
      partialGain.gain.setValueAtTime(partial.level, start);
      oscillator.connect(partialGain);
      partialGain.connect(filter);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        partialGain.disconnect();
        activeOscillators -= 1;
        if (activeOscillators === 0) {
          filter.disconnect();
          envelope.disconnect();
          this.activeVoices.delete(voice);
        }
      }, { once: true });
      oscillator.start(start);
      oscillator.stop(end + 0.03);
    }
  }

  stopAll(): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    for (const voice of this.activeVoices) {
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(MIN_AUDIBLE_GAIN, now, 0.015);
      for (const oscillator of voice.oscillators) {
        try {
          oscillator.stop(now + 0.08);
        } catch {
          // An oscillator that has already ended needs no further cleanup.
        }
      }
    }
  }

  async dispose(): Promise<void> {
    const context = this.context;
    this.stopAll();
    this.context = null;
    this.master = null;
    this.activeVoices.clear();
    if (context && context.state !== 'closed') await context.close();
  }

  private getContext(): AudioContext {
    if (this.context) return this.context;
    const AudioContextType = audioContextConstructor();
    if (!AudioContextType) throw new Error('Web Audio is unavailable in this browser.');

    this.context = new AudioContextType({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0.34;
    this.master.connect(this.context.destination);
    return this.context;
  }
}
