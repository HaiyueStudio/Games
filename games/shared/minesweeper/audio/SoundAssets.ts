export const MINE_SAMPLE_RATE = 44100;
export const MINE_SOUNDS = {
  click: { seconds: .095, gain: .5, priority: 10 },
  flag: { seconds: .23, gain: .62, priority: 20 },
  explosion: { seconds: 1.1, gain: .85, priority: 100 },
  button: { seconds: .11, gain: .48, priority: 30 },
} as const;
export type MineSound = keyof typeof MINE_SOUNDS;
export const MINE_SOUND_IDS = Object.keys(MINE_SOUNDS) as MineSound[];

/** Original deterministic PCM synthesis used by the asset generator, never during gameplay. */
export function synthesizeMineSound(id: MineSound): Float32Array {
  const rate = MINE_SAMPLE_RATE, seconds = MINE_SOUNDS[id].seconds;
  const pcm = new Float32Array(Math.round(rate * seconds)), tau = Math.PI * 2;
  let seed = 0x4d494e45, low = 0, bass = 0, previous = 0, highpass = 0;
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate, noise = random() * 2 - 1;
    low += .075 * (noise - low); bass += .012 * (noise - bass);
    let value = 0;
    if (id === 'click') {
      value = .55 * Math.sin(tau * 1350 * t) * Math.exp(-t * 72)
        + .24 * Math.sin(tau * 2470 * t) * Math.exp(-t * 112)
        + .18 * Math.sin(tau * 380 * t) * Math.exp(-t * 88)
        + .1 * (noise - low) * Math.exp(-t * 180);
    } else if (id === 'flag') {
      // A soft fabric swish followed by a seated brass pin and two inharmonic resonances.
      const clink = Math.max(0, t - .025);
      value = (low - bass) * Math.sin(Math.PI * Math.min(1, t / .16)) ** 2 * .45;
      if (t >= .025) value += .5 * Math.sin(tau * (360 * clink + 2 * (1 - Math.exp(-clink * 60)))) * Math.exp(-clink * 28)
        + .18 * Math.sin(tau * 1850 * clink) * Math.exp(-clink * 54)
        + .08 * Math.sin(tau * 3210 * clink) * Math.exp(-clink * 75);
    } else if (id === 'explosion') {
      value = noise * Math.exp(-t * 95) * .45
        + Math.sin(tau * (55 * t + 80 * (1 - Math.exp(-t * 18)) / 18)) * Math.exp(-t * 6) * .7
        + (low * 1.9 + bass * 2.1) * Math.exp(-t * 4.5)
        + Math.sin(tau * 420 * t) * Math.exp(-t * 20) * .1;
      for (const [start, frequency] of [[.08, 1780], [.13, 1220], [.21, 860], [.33, 610]] as const) {
        const dt = t - start;
        if (dt >= 0) value += Math.sin(tau * frequency * dt) * Math.exp(-dt * 48) * .085;
      }
    } else {
      value = Math.sin(tau * 720 * t) * Math.exp(-t * 65) * .6;
      if (t > .022) value += Math.sin(tau * 1280 * (t - .022)) * Math.exp(-(t - .022) * 82) * .3;
    }
    highpass = value - previous + .995 * highpass; previous = value;
    const end = Math.max(0, Math.min(1, (pcm.length - 1 - i) / (rate * .018)));
    pcm[i] = Math.tanh(highpass * 1.1) * Math.min(1, t / .002) * end;
  }
  let peak = 0; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  const gain = .74 / Math.max(.001, peak);
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! * gain;
  return pcm;
}

export function encodeMineWav(pcm: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, MINE_SAMPLE_RATE, true);
  view.setUint32(28, MINE_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i]!)) * 32767), true);
  return bytes;
}
