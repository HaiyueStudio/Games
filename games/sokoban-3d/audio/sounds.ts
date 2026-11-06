export const SOKOBAN_RATE = 22050;
export const SOKOBAN_SOUNDS = { step: .09, push: .23, blocked: .11, target: .5, undo: .2, restart: .26, win: 1.1 } as const;
export type SokobanSound = keyof typeof SOKOBAN_SOUNDS;

/** Original small wooden percussion and warm bell phrases, deterministic and click-free. */
export function synthesizeSokobanSound(id: SokobanSound): Float32Array {
  const seconds = SOKOBAN_SOUNDS[id], pcm = new Float32Array(Math.round(seconds * SOKOBAN_RATE));
  let seed = 7319, low = 0;
  for (const character of id) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
  for (let i = 0; i < pcm.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const t = i / SOKOBAN_RATE, noise = (seed >>> 0) / 2147483648 - 1;
    low += .13 * (noise - low);
    let value = 0;
    if (id === 'step') value = Math.sin(t * Math.PI * 2 * 190) * Math.exp(-t * 72) * .42 + low * Math.exp(-t * 45) * .7;
    if (id === 'push') value = low * Math.sin(Math.PI * t / seconds) * .65 + Math.sin(t * Math.PI * 2 * 105) * Math.exp(-t * 24) * .35;
    if (id === 'blocked') value = (Math.sin(t * Math.PI * 2 * 145) + Math.sin(t * Math.PI * 2 * 213) * .3) * Math.exp(-t * 38) * .48;
    if (id === 'undo' || id === 'restart') {
      const phase = id === 'undo' ? 700 * t - 850 * t * t : 330 * t + 450 * t * t;
      value = Math.sin(Math.PI * 2 * phase) * Math.exp(-t * 16) * .27;
    }
    if (id === 'target' || id === 'win') {
      const notes = id === 'win' ? [523.25, 659.25, 783.99, 1046.5] : [783.99, 1046.5];
      for (let note = 0; note < notes.length; note++) {
        const age = t - note * (id === 'win' ? .14 : .075);
        if (age >= 0) value += (Math.sin(Math.PI * 2 * notes[note]! * age) + .2 * Math.sin(Math.PI * 2 * notes[note]! * 2.76 * age)) * Math.exp(-age * 8) * Math.min(1, age / .004) * .22;
      }
    }
    const envelope = Math.min(1, t / .003) * Math.max(0, Math.min(1, (seconds - t - 1 / SOKOBAN_RATE) / .018));
    pcm[i] = Math.tanh(value) * envelope;
  }
  return pcm;
}
