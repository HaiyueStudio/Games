// Reproducible, original modal-synthesis SFX and linear PBR data maps. No downloads.
// Run: node games/2048/assets/generate-assets.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const root = new URL('./', import.meta.url);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]), header = Buffer.alloc(4), tail = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc32(data));
  return Buffer.concat([header, data, tail]);
}
function png(name, pixel) {
  const size = 256, data = Buffer.alloc(size * (size * 4 + 1)), header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const rgba = pixel(x, y);
    for (let c = 0; c < 4; c++) data[offset + c] = Math.round(rgba[c]);
  }
  writeFileSync(new URL(name, root), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]));
}
const tau = Math.PI * 2;
// Periodic machining grooves; encode tangent normal and glTF G=roughness, B=metalness.
png('metal-normal.png', (x, y) => {
  const dx = 0.015 * Math.cos(tau * x / 256), dy = 0.14 * Math.cos(tau * y * 43 / 256) + 0.045 * Math.cos(tau * y * 97 / 256);
  const length = Math.hypot(dx, dy, 1);
  return [(dx / length + 1) * 127.5, (dy / length + 1) * 127.5, (1 / length + 1) * 127.5, 255];
});
png('metal-roughness.png', (x, y) => [255, 185 + 22 * Math.sin(tau * y * 43 / 256) + 7 * Math.sin(tau * x * 3 / 256), 250, 255]);

let seed = 2048;
function noise() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; }
function wav(name, duration, sample) {
  const rate = 44100, frames = Math.ceil(rate * duration), samples = new Float64Array(frames);
  let peak = 0;
  for (let i = 0; i < frames; i++) { const t = i / rate; samples[i] = sample(t) * Math.min(1, t / 0.002) * Math.min(1, (duration - t) / 0.025); peak = Math.max(peak, Math.abs(samples[i])); }
  const data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) data.writeInt16LE(Math.round(samples[i] / Math.max(1, peak) * 24000), 44 + i * 2);
  writeFileSync(new URL(name, root), data);
}
// Inharmonic modes mimic metal plates, with a short broadband contact transient.
const modes = (t, f, decay) => [1, 1.47, 2.09, 2.56, 3.91, 5.43].reduce((v, ratio, i) => v + Math.sin(tau * f * ratio * t) * Math.exp(-t * decay * (1 + i * 0.35)) / (i + 2), 0);
wav('slide.wav', 0.16, t => noise() * Math.exp(-t * 27) * 0.3 + modes(t, 180, 35) * 0.15);
wav('fracture.wav', 0.34, t => modes(t, 620, 16) * 0.6 + noise() * Math.exp(-t * 65) * 0.38);
wav('forge.wav', 0.58, t => modes(t, 270, 8) * 0.8 + modes(Math.max(0, t - 0.045), 810, 14) * 0.2 + noise() * Math.exp(-t * 90) * 0.3);
wav('new-game.wav', 0.4, t => modes(t, 410, 16) * 0.4 + (t > 0.09 ? modes(t - 0.09, 615, 18) * 0.3 : 0));
wav('blocked.wav', 0.14, t => modes(t, 105, 40) * 0.4);
console.log('2048: generated 2 linear PBR maps and 5 mono PCM metal SFX.');
