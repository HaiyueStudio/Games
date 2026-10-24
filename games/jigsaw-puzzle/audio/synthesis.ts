import { JIGSAW_SAMPLE_RATE as RATE, JIGSAW_SOUNDS, type JigsawSound } from './sounds';
const TAU = Math.PI * 2;

/** Original offline wooden percussion and a four-note completion chime, with no external samples. */
export function synthesizeJigsawSound(id: JigsawSound): Float32Array {
  const seconds = JIGSAW_SOUNDS[id].seconds, pcm = new Float32Array(Math.round(seconds * RATE));
  let seed = 1042, low = 0, previous = 0, highpass = 0;
  for (const char of id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const wood = (t: number, frequency: number, decay: number): number => t < 0 ? 0 :
    (Math.sin(TAU * frequency * t) * Math.exp(-t * decay)
      + .28 * Math.sin(TAU * frequency * 2.73 * t) * Math.exp(-t * decay * 1.8)) * Math.min(1, t / .0015);
  for (let i = 0; i < pcm.length; i++) {
    const t = i / RATE;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1; low += .18 * (noise - low);
    let value: number;
    if (id === 'ui-click') value = wood(t, 830, 76) * .7 + (noise - low) * Math.exp(-t * 180) * .14;
    else if (id === 'piece-click') value = wood(t, 310, 43) * .65 + wood(t, 760, 84) * .18 + low * Math.exp(-t * 80) * .22;
    else if (id === 'snap') value = wood(t, 1180, 85) * .35 + wood(t - .035, 470, 30) * .7
      + (noise - low) * Math.exp(-t * 120) * .25;
    else {
      value = 0;
      for (const [at, frequency] of [[0, 523.25], [.12, 659.25], [.24, 783.99], [.4, 1046.5]]) {
        value += wood(t - at!, frequency!, 5.5) * .30;
      }
    }
    highpass = value - previous + .995 * highpass; previous = value;
    pcm[i] = Math.tanh(highpass) * Math.min(1, t / .0015) * Math.max(0, Math.min(1, (seconds - t - 1 / RATE) / .025));
  }
  let peak = .001; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < pcm.length; i++) pcm[i] = pcm[i]! * .74 / peak;
  return pcm;
}

export function encodeJigsawWav(pcm: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true));
  return bytes;
}
