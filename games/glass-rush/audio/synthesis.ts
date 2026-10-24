export const GLASS_SAMPLE_RATE = 24000;
export const GLASS_BPM = 128;
export const GLASS_SOUND_IDS = ['music', 'impact', 'shatter'] as const;
export type GlassSound = typeof GLASS_SOUND_IDS[number];
const TAU = Math.PI * 2;
const beat = 60 / GLASS_BPM;
const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** Original eight-bar score and glass percussion, synthesized without external samples. */
export function synthesizeGlassSound(id: GlassSound): Float32Array[] {
  const duration = id === 'music' ? beat * 32 : id === 'impact' ? .85 : 1.45;
  const length = Math.round(duration * GLASS_SAMPLE_RATE);
  const left = new Float32Array(length), right = new Float32Array(length);
  let seed = 71623;
  const noise = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const add = (at: number, seconds: number, pan: number, voice: (t: number) => number): void => {
    const start = Math.round(at * GLASS_SAMPLE_RATE), count = Math.round(seconds * GLASS_SAMPLE_RATE);
    for (let i = 0; i < count; i++) {
      let index = start + i;
      if (id === 'music') index %= length; else if (index >= length) break;
      const sample = voice(i / GLASS_SAMPLE_RATE) * Math.min(1, (count - 1 - i) / (GLASS_SAMPLE_RATE * .005));
      left[index] = left[index]! + sample * Math.sqrt((1 - pan) / 2);
      right[index] = right[index]! + sample * Math.sqrt((1 + pan) / 2);
    }
  };
  if (id === 'music') {
    const roots = [48, 44, 51, 46];
    for (let b = 0; b < 32; b++) {
      // Four-on-the-floor kick; the integral of the falling pitch keeps phase continuous.
      add(b * beat, .32, 0, t => Math.sin(TAU * (47 * t + 7 * (1 - Math.exp(-t * 34)))) * Math.exp(-t * 16) * .65);
      if (b % 4 === 1 || b % 4 === 3) add(b * beat, .19, .05, t => (noise() * .32 + Math.sin(TAU * 182 * t) * .16) * Math.exp(-t * 24) * (1 - Math.exp(-t * 1800)));
      for (let h = 0; h < 4; h++) {
        let previous = 0;
        const open = h === 2 && b % 2 === 1;
        add((b + h / 4) * beat, open ? .16 : .055, h % 2 ? .35 : -.35, t => {
          const n = noise(), high = n - previous; previous = n;
          return high * Math.exp(-t * (open ? 32 : 105)) * (h % 2 ? .047 : .07) * (1 - Math.exp(-t * 2200));
        });
      }
      const root = roots[Math.floor(b / 8)]!;
      for (const off of [0, .5, .75]) {
        const f = hz(root - 12);
        add((b + off) * beat, .23, 0, t => (Math.sin(TAU * f * t) + .22 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t * 12) * Math.min(1, t * 300) * .23);
      }
      for (let s = 0; s < 4; s++) {
        const steps = [12, 19, 15, 22, 24, 19, 27, 22];
        const f = hz(root + steps[(b * 4 + s) % steps.length]!);
        const pluck = (t: number): number => Math.sin(TAU * f * t + Math.sin(TAU * f * 2 * t) * 1.2 * Math.exp(-t * 25)) * Math.exp(-t * 13) * Math.min(1, t * 400);
        add((b + s / 4) * beat, .65, s % 2 ? .55 : -.55, t => pluck(t) * .085);
        add((b + s / 4 + .75) * beat, .65, s % 2 ? -.65 : .65, t => pluck(t) * .024);
      }
      if (b % 8 === 0) for (const interval of [0, 3, 7, 14]) {
        const f = hz(root + interval);
        add(b * beat, beat * 8, interval % 2 ? .6 : -.6, t => {
          const envelope = Math.sin(Math.PI * t / (beat * 8)) ** 2;
          const pump = .32 + .68 * (1 - Math.exp(-(t % beat) * 16));
          return (Math.sin(TAU * f * t) + .35 * Math.sin(TAU * f * 1.003 * t)) * envelope * pump * .038;
        });
      }
    }
  } else {
    const final = id === 'shatter';
    add(0, .28, 0, t => (Math.sin(TAU * (55 * t + 5 * (1 - Math.exp(-t * 42)))) * .4 + noise() * .23) * Math.exp(-t * 30) * Math.min(1, t * 1600));
    // A sharp noisy fracture, then independently timed, inharmonic glass resonances.
    for (let i = 0; i < (final ? 40 : 23); i++) {
      const start = .006 + (i / 40) ** 1.7 * (final ? .8 : .32);
      const f = 950 + (noise() + 1) * 2700, pan = noise() * .8;
      const gain = (final ? .085 : .07) / (1 + i * .045);
      add(start, final ? .6 : .32, pan, t => {
        const envelope = Math.min(1, t * 2800) * Math.exp(-t * (13 + i % 7));
        const ring = Math.sin(TAU * f * t * (1 - .06 * t)) + .4 * Math.sin(TAU * f * 1.417 * t);
        return (ring + noise() * Math.exp(-t * 90) * .8) * envelope * gain;
      });
    }
    if (final) add(.015, .7, 0, t => Math.sin(TAU * (36 * t + 3 * (1 - Math.exp(-t * 12)))) * Math.exp(-t * 8) * Math.min(1, t * 200) * .24);
    for (const channel of [left, right]) for (let i = 0; i < length; i++) channel[i] = channel[i]! * Math.min(1, (length - 1 - i) / 160);
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  const gain = .88 / Math.max(.001, peak);
  for (const channel of [left, right]) for (let i = 0; i < length; i++) channel[i] = channel[i]! * gain;
  return [left, right];
}

export function encodeGlassWav(channels: Float32Array[]): Uint8Array {
  const frames = channels[0]!.length, data = new Uint8Array(44 + frames * channels.length * 2), view = new DataView(data.buffer);
  const word = (offset: number, text: string): void => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, data.length - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true);
  view.setUint32(24, GLASS_SAMPLE_RATE, true); view.setUint32(28, GLASS_SAMPLE_RATE * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, data.length - 44, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels.length; c++) view.setInt16(44 + (i * channels.length + c) * 2, Math.round(Math.max(-1, Math.min(1, channels[c]![i]!)) * 32767), true);
  return data;
}
