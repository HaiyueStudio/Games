import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAUNCHER_AUDIO, renderLauncherAudio } from '../games/launcher/audio/soundscape.ts';

const output = resolve(import.meta.dirname, '../site/audio'), sampleRate = 22050;
mkdirSync(output, { recursive: true });
const assets = [];
for (const [kind, settings] of Object.entries(LAUNCHER_AUDIO)) {
  const channels = renderLauncherAudio(kind, sampleRate), frames = channels[0].length, bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 4, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
  let peak = 0, square = 0;
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) {
    const sample = channels[channel][frame]; peak = Math.max(peak, Math.abs(sample)); square += sample * sample;
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + frame * 4 + channel * 2);
  }
  if (peak >= .9) throw new Error(kind + ' exceeds the authored headroom');
  writeFileSync(resolve(output, settings.file), bytes);
  assets.push({ kind, file: settings.file, seconds: settings.seconds, sampleRate, channels: 2, peak, rms: Math.sqrt(square / (frames * 2)), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(resolve(output, 'generation.json'), JSON.stringify({ schemaVersion: 1, description: 'Original deterministic quiet ambient pads and ethereal glass UI tones; no third-party recordings.', generator: 'scripts/generate-launcher-audio.mjs', assets }, null, 2) + '\n');
console.log('Generated ' + assets.length + ' original launcher audio assets');
