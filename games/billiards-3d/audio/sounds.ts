export const BILLIARDS_SAMPLE_RATE = 22050;
export const BILLIARDS_SOUNDS = {
  cue: { seconds: 0.09, gain: 0.55, priority: 20 },
  collision: { seconds: 0.075, gain: 0.6, priority: 10 },
  cushion: { seconds: 0.12, gain: 0.45, priority: 10 },
  pocket: { seconds: 0.36, gain: 0.65, priority: 30 },
  victory: { seconds: 1.15, gain: 0.45, priority: 100 },
} as const;
export type BilliardsSound = keyof typeof BILLIARDS_SOUNDS;

/** Original, seeded effects, synthesized once when audio is first unlocked. */
export function synthesizeBilliardsSound(id: BilliardsSound): Float32Array {
  const seconds = BILLIARDS_SOUNDS[id].seconds;
  const samples = new Float32Array(Math.round(seconds * BILLIARDS_SAMPLE_RATE));
  const tau = Math.PI * 2;
  let seed = 0x504f4f4c;
  let low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / BILLIARDS_SAMPLE_RATE;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 0x80000000 - 1;
    low += 0.12 * (noise - low);
    let value = 0;
    if (id === 'collision') {
      value = 0.65 * Math.sin(tau * 1850 * t) * Math.exp(-t * 125)
        + 0.22 * Math.sin(tau * 3270 * t) * Math.exp(-t * 170)
        + 0.35 * noise * Math.exp(-t * 310);
    } else if (id === 'cue') {
      value = 0.7 * Math.sin(tau * 780 * t) * Math.exp(-t * 105)
        + 0.3 * noise * Math.exp(-t * 220);
    } else if (id === 'cushion') {
      value = Math.sin(tau * 160 * t) * Math.exp(-t * 50)
        + 0.35 * low * Math.exp(-t * 75);
    } else if (id === 'pocket') {
      // A leather-lined drop followed by the lower return-channel knock.
      value = 0.7 * Math.sin(tau * 215 * t) * Math.exp(-t * 26)
        + 0.45 * low * Math.exp(-t * 19);
      const knock = t - 0.09;
      if (knock >= 0) value += 0.55 * Math.sin(tau * 120 * knock) * Math.exp(-knock * 35)
        * Math.min(1, knock / 0.002);
    } else {
      for (const [index, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) {
        const note = t - index * 0.14;
        if (note >= 0) value += (Math.sin(tau * frequency * note)
          + 0.22 * Math.sin(tau * frequency * 2 * note))
          * Math.exp(-note * 6) * Math.min(1, note / 0.008) * 0.4;
      }
    }
    const envelope = Math.min(1, t / 0.0008) * Math.min(1, (samples.length - 1 - i) / (BILLIARDS_SAMPLE_RATE * 0.008));
    samples[i] = value * envelope;
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * 0.8 / peak;
  return samples;
}
