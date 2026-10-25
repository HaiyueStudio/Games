import { FRUIT_SAMPLE_RATE as RATE, FRUIT_SOUNDS, type FruitSound } from './sounds';
const TAU = Math.PI * 2;

/** Original modal percussion, filtered air and liquid droplets; rendered offline only. */
export function synthesizeFruitSound(id: FruitSound): Float32Array {
  const seconds = FRUIT_SOUNDS[id].seconds, pcm = new Float32Array(Math.round(seconds * RATE));
  let seed = 0x46525549;
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const variation = id.endsWith('-b') ? 1 : id.endsWith('-c') ? 2 : 0;
  const drops = Array.from({ length: 12 + variation * 3 }, () => ({
    start: .022 + random() ** 1.5 * .26, frequency: 650 + random() * 1700, decay: 35 + random() * 65, gain: .08 + random() * .13,
  }));
  let low = 0, bass = 0, previous = 0, highpass = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / RATE, p = i / (pcm.length - 1), noise = random() * 2 - 1;
    low += (id === 'bomb-explosion' ? .065 : .2) * (noise - low); bass += .018 * (noise - bass);
    let value = 0;
    if (id === 'ui-click') {
      // Short bamboo/wood block, with a tiny dry contact transient.
      value = Math.sin(TAU * 720 * t) * Math.exp(-t * 55) * .65
        + Math.sin(TAU * 1910 * t) * Math.exp(-t * 105) * .22 + (noise - low) * Math.exp(-t * 150) * .18;
    } else if (id === 'bomb-explosion') {
      const bodyPhase = TAU * (43 * t + 135 * (1 - Math.exp(-t * 19)) / 19);
      const aftershock = Math.max(0, t - .12);
      value = noise * Math.exp(-t * 85) * .55 + Math.sin(bodyPhase) * Math.exp(-t * 5.4) * .72
        + (low * 1.8 + bass * 1.5) * Math.exp(-t * 3.2)
        + (t > .12 ? Math.sin(TAU * 58 * aftershock) * Math.exp(-aftershock * 14) * .25 : 0);
    } else if (id.startsWith('fruit-throw')) {
      const air = (low - bass) * 1.7 + (noise - low) * .12;
      const envelope = Math.sin(Math.PI * p) ** 1.65 * Math.exp(-p * .9);
      value = air * envelope + Math.sin(TAU * (180 * t + (300 + variation * 90) * t * t)) * .025 * envelope;
    } else if (id.startsWith('fruit-splash')) {
      // A wet low squelch, a broad splash and many asynchronous pitched droplets.
      const squelch = Math.sin(TAU * (110 * t + (32 + variation * 6) * (1 - Math.exp(-t * 32))));
      value = squelch * Math.exp(-t * 25) * .38 + (low - bass) * Math.exp(-t * 12) * 1.5
        + (noise - low) * Math.exp(-t * 45) * .22;
      for (const drop of drops) {
        const time = t - drop.start;
        if (time >= 0) value += Math.sin(TAU * drop.frequency * (1 - Math.exp(-time * 18)) / 18)
          * Math.exp(-time * drop.decay) * Math.min(1, time / .0015) * drop.gain;
      }
    } else {
      // Three descending wooden bell notes and a soft taiko-style final thump.
      for (const [start, frequency] of [[0, 659.25], [.19, 523.25], [.40, 440]] as const) {
        const time = t - start;
        if (time < 0) continue;
        value += (Math.sin(TAU * frequency * time) * Math.exp(-time * 5)
          + Math.sin(TAU * frequency * 2.76 * time) * Math.exp(-time * 14) * .2)
          * Math.min(1, time / .003) * .28;
      }
      if (t > .42) { const time = t - .42; value += Math.sin(TAU * (68 * time + 2 * (1 - Math.exp(-time * 25)))) * Math.exp(-time * 9) * .28; }
    }
    // Remove DC and taper both ends to avoid playback clicks.
    highpass = value - previous + .995 * highpass; previous = value;
    pcm[i] = Math.tanh(highpass * 1.15) * Math.min(1, t / .0025) * Math.min(1, (seconds - t - 1 / RATE) / .018);
  }
  let peak = 0; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  const gain = .78 / Math.max(.001, peak);
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! * gain;
  return pcm;
}

export function encodeFruitWav(pcm: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true));
  return bytes;
}
