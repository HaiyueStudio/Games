const MIN_AUDIBLE_GAIN = 0.0001;

type BrowserAudioScope = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

interface Partial {
  ratio: number;
  level: number;
  detune: number;
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

  get isSupported(): boolean {
    return audioContextConstructor() !== null;
  }

  async play(midi: number, velocity = 118): Promise<void> {
    const context = this.getContext();
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') {
      throw new Error(`AudioContext did not start; current state is ${context.state}.`);
    }

    const master = this.master;
    if (!master) throw new Error('Piano audio output was not initialized.');

    const frequency = midiToFrequency(midi);
    const duration = pianoVoiceDuration(midi);
    const start = context.currentTime;
    const end = start + duration;
    const strength = Math.max(0.05, Math.min(1, velocity / 127));
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    let activeOscillators = PIANO_PARTIALS.length;

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
        }
      }, { once: true });
      oscillator.start(start);
      oscillator.stop(end + 0.03);
    }
  }

  async dispose(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.master = null;
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
