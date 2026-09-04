import type { MugenGameSound } from './MugenGameFixture';

export const MUGEN_DEFAULT_FIGHT_SOUND_PACKAGE = 'haiyue-default-fight-sounds-v1';

const SPECS = Object.freeze([
  Object.freeze({ group: 5, item: 0, frequency: 105, duration: .09, noise: .82 }),
  Object.freeze({ group: 5, item: 1, frequency: 88, duration: .11, noise: .76 }),
  Object.freeze({ group: 5, item: 2, frequency: 72, duration: .14, noise: .7 }),
  Object.freeze({ group: 5, item: 3, frequency: 58, duration: .17, noise: .64 }),
  Object.freeze({ group: 5, item: 4, frequency: 46, duration: .2, noise: .58 }),
  Object.freeze({ group: 6, item: 0, frequency: 520, duration: .1, noise: .32 }),
  Object.freeze({ group: 6, item: 1, frequency: 390, duration: .14, noise: .38 }),
]);

let cached: Promise<readonly MugenGameSound[]> | null = null;

/** Small deterministic, generated fallback cues for characters that reference MUGEN's external fight.snd. */
export function createMugenDefaultFightSounds(): Promise<readonly MugenGameSound[]> {
  cached ??= Promise.all(SPECS.map(async spec => {
    const bytes = synthesizeWave(spec.frequency, spec.duration, spec.noise, spec.group * 100 + spec.item); const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return Object.freeze({ id: `default-fight:${spec.group},${spec.item}`, group: spec.group, item: spec.item, selectedByKey: true, encodedBase64: encodeBase64(bytes), encodedSha256: hex(new Uint8Array(digest)), channels: 1, sampleRate: 22_050, frameLength: (bytes.byteLength - 44) / 2 });
  })).then(values => Object.freeze(values));
  return cached;
}

function synthesizeWave(frequency: number, duration: number, noiseAmount: number, seed: number): Uint8Array {
  const sampleRate = 22_050; const frames = Math.round(sampleRate * duration); const bytes = new Uint8Array(44 + frames * 2); const view = new DataView(bytes.buffer);
  ascii(bytes, 0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(bytes, 8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(bytes, 36, 'data'); view.setUint32(40, frames * 2, true);
  let random = seed >>> 0;
  for (let frame = 0; frame < frames; frame += 1) { const progress = frame / frames; const envelope = (1 - progress) ** 3; random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0; const noise = random / 0xffff_ffff * 2 - 1; const tone = Math.sin(2 * Math.PI * frequency * frame / sampleRate) + .35 * Math.sin(2 * Math.PI * frequency * 2.13 * frame / sampleRate); const sample = Math.max(-1, Math.min(1, (tone * (1 - noiseAmount) + noise * noiseAmount) * envelope * .9)); view.setInt16(44 + frame * 2, Math.round(sample * 32_767), true); }
  return bytes;
}

function ascii(bytes: Uint8Array, offset: number, value: string): void { for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index); }
function encodeBase64(bytes: Uint8Array): string { let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8_192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192)); return btoa(binary); }
function hex(bytes: Uint8Array): string { return [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''); }
