import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)); const target = resolve(root, 'g06-generated-snd-v1'); mkdirSync(target, { recursive: true });
const definitions = [
  [0, 0, wave({ frequency: 330, seconds: 0.07, sampleRate: 8_000, channels: 1, bits: 8 })],
  [0, 1, wave({ frequency: 180, seconds: 0.09, sampleRate: 8_000, channels: 1, bits: 8 })],
  [1, 0, wave({ frequency: 523.25, seconds: 0.12, sampleRate: 11_025, channels: 2, bits: 16 })],
  [1, 1, wave({ frequency: 110, seconds: 0.18, sampleRate: 11_025, channels: 1, bits: 16 })],
  [2, 0, wave({ frequency: 440, seconds: 0.10, sampleRate: 8_000, channels: 1, bits: 8 })],
  [0, 0, wave({ frequency: 392, seconds: 0.07, sampleRate: 8_000, channels: 1, bits: 8 })],
];
const snd = soundBank(definitions); const path = resolve(target, 'vertical.snd'); writeFileSync(path, snd);
const manifest = { schemaVersion: 1, id: 'hy-mugen-g01-snd-v1', generator: 'games/mugen/fixtures/generate-g06-snd-v1.mjs', seed: 'm08-g06-sine-v1', copyrightHolder: 'Haiyue Engine contributors', license: 'MIT', files: { 'vertical.snd': { bytes: snd.byteLength, sha256: sha(snd) } }, expected: { version: [4, 0, 0, 0], entries: definitions.length, selectedKeys: 5, duplicatePolicy: 'last-source-order-wins' } };
writeFileSync(resolve(root, 'g06-generated-snd-v1.fixture.json'), `${JSON.stringify(manifest, null, 2)}\n`);

function soundBank(entries) { const headerSize = 512; const total = headerSize + entries.reduce((sum, entry) => sum + 16 + entry[2].byteLength, 0); const out = new Uint8Array(total); const view = new DataView(out.buffer); out.set(Buffer.from('ElecbyteSnd\0', 'ascii'), 0); out.set([4, 0, 0, 0], 12); view.setUint32(16, entries.length, true); view.setUint32(20, entries.length ? headerSize : 0, true); let offset = headerSize; entries.forEach(([group, item, payload], index) => { const next = index + 1 < entries.length ? offset + 16 + payload.byteLength : 0; view.setUint32(offset, next, true); view.setUint32(offset + 4, payload.byteLength, true); view.setInt32(offset + 8, group, true); view.setInt32(offset + 12, item, true); out.set(payload, offset + 16); offset = next; }); return out; }
function wave({ frequency, seconds, sampleRate, channels, bits }) { const frames = Math.floor(seconds * sampleRate); const blockAlign = channels * bits / 8; const dataBytes = frames * blockAlign; const out = new Uint8Array(44 + dataBytes); const view = new DataView(out.buffer); tag(out, 0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); tag(out, 8, 'WAVE'); tag(out, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bits, true); tag(out, 36, 'data'); view.setUint32(40, dataBytes, true); for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) { const envelope = Math.max(0, 1 - frame / frames); const sample = Math.sin(2 * Math.PI * frequency * frame / sampleRate + channel * 0.2) * envelope * 0.55; const offset = 44 + (frame * channels + channel) * bits / 8; if (bits === 8) out[offset] = Math.max(0, Math.min(255, Math.round(128 + sample * 127))); else view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true); } return out; }
function tag(bytes, offset, value) { bytes.set(Buffer.from(value, 'ascii'), offset); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
