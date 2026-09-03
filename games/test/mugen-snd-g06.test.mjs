import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });
const [{ parseMugenSnd }, { createMugenVfs }, { importMugenCharacter }] = await Promise.all([import('../mugen/import/snd/index.ts'), import('../mugen/import/vfs/MugenVfs.ts'), import('../mugen/import/worker/MugenCharacterImport.ts')]);
const fixture = readBytes('../mugen/fixtures/g06-generated-snd-v1/vertical.snd'); const manifest = JSON.parse(read('../mugen/fixtures/g06-generated-snd-v1.fixture.json'));

test('G06 SND v4 parser preserves WAV metadata and freezes duplicate group/item as last-source-order-wins', async () => {
  assert.deepEqual({ bytes: fixture.byteLength, sha256: hash(fixture) }, manifest.files['vertical.snd']); const bank = await parseMugenSnd(resource(fixture));
  assert.deepEqual(bank.version, [4, 0, 0, 0]); assert.equal(bank.entries.length, 6); assert.equal(bank.entries.filter(value => value.selectedByKey).length, 5); assert.deepEqual(bank.entries.filter(value => value.group === 0 && value.item === 0).map(value => value.selectedByKey), [false, true]);
  assert.deepEqual([...new Set(bank.entries.map(value => value.channels))], [1, 2]); assert.deepEqual([...new Set(bank.entries.map(value => value.bitsPerSample))], [8, 16]); assert(bank.entries.every(value => value.encodedBytes[0] === 0x52 && value.durationSeconds > 0));
});

test('SND parser accepts the Elecbyte final-subheader EOF sentinel', async () => {
  const bytes = fixture.slice(); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = view.getUint32(20, true); const count = view.getUint32(16, true); for (let index = 1; index < count; index += 1) offset = view.getUint32(offset, true); view.setUint32(offset, bytes.byteLength, true);
  const bank = await parseMugenSnd(resource(bytes)); assert.equal(bank.entries.length, count); assert.equal(bank.entries.at(-1).nextOffset, bytes.byteLength);
});

test('SND parser accepts the WinMUGEN 1.0.1.0 header used by MUGEN 1.1-compatible characters', async () => {
  const bytes = fixture.slice(); bytes.set([1, 0, 1, 0], 12);
  const bank = await parseMugenSnd(resource(bytes));
  assert.deepEqual(bank.version, [1, 0, 1, 0]);
  assert.equal(bank.entries.length, 6);
});

test('SND parser accepts the Fighter Factory 0.1.0.1 header variant', async () => {
  const bytes = fixture.slice(); bytes.set([0, 1, 0, 1], 12);
  const bank = await parseMugenSnd(resource(bytes));
  assert.deepEqual(bank.version, [0, 1, 0, 1]);
  assert.equal(bank.entries.length, 6);
});

test('SND parser accepts Fighter Factory WAV chunks without the required odd-byte padding', async () => {
  const bank = await parseMugenSnd(resource(unpaddedLegacySnd()));
  assert.deepEqual(bank.version, [0, 1, 0, 1]);
  assert.equal(bank.entries.length, 1);
  assert.equal(bank.entries[0].frameLength, 1);
  assert.equal(bank.entries[0].bitsPerSample, 8);
});

test('SND parser accepts Fighter Factory RIFF sizes that include the eight-byte header', async () => {
  const bytes = fixture.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryOffset = view.getUint32(20, true);
  const payloadLength = view.getUint32(entryOffset + 4, true);
  view.setUint32(entryOffset + 16 + 4, payloadLength, true);
  const bank = await parseMugenSnd(resource(bytes));
  assert.equal(bank.entries.length, 6);
});

test('G06 SND contribution enters deterministic HYMUGEN sound table without raw bank bytes', async () => {
  const def = new TextEncoder().encode('[Info]\nname = sound fixture\n[Files]\ncmd = hero.cmd\nsound = vertical.snd\n'); const cmd = new TextEncoder().encode('[Defaults]\ncommand.time = 15\n'); const vfs = await createMugenVfs([{ path: 'hero.def', bytes: def }, { path: 'hero.cmd', bytes: cmd }, { path: 'vertical.snd', bytes: fixture }]); const first = await importMugenCharacter(vfs, { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' }); const second = await importMugenCharacter(vfs, { contentRole: 'formal-fixture', entryDef: 'hero.def', entryKind: 'character', encoding: 'utf-8' });
  assert.equal(first.package.tables.sounds.length, 6); assert.equal(first.encoded.packageSha256, second.encoded.packageSha256); assert(first.package.featureUsage.includes('g06.snd.elecbyte-v4')); assert(first.package.tables.sounds.every(value => value.kind === 'snd-wav-v1' && /^[0-9a-f]{64}$/u.test(value.encodedSha256))); assert.equal(Buffer.from(first.encoded.bytes).includes(Buffer.from('ElecbyteSnd')), false);
});

test('SND parser rejects signature, chain, count and WAV corruption with precise diagnostics', async () => {
  const cases = [mutate(0, 0), mutate(16, 0xff), mutate(512, 0), mutate(528, 0), fixture.slice(0, 540)];
  for (const bytes of cases) await assert.rejects(parseMugenSnd(resource(bytes)), error => error.name === 'MugenImportFailure' && error.diagnostics.length === 1 && ['E_MUGEN_SND_ENTRY_INVALID', 'E_MUGEN_LIMIT_EXCEEDED'].includes(error.diagnostics[0].code));
});

function resource(bytes) { return { canonicalPath: 'vertical.snd', foldedPath: 'vertical.snd', sha256: hash(bytes), byteLength: bytes.byteLength, kind: 'sound', read: () => bytes.slice() }; }
function mutate(offset, value) { const bytes = fixture.slice(); bytes[offset] = value; return bytes; }
function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
function readBytes(path) { return new Uint8Array(readFileSync(new URL(path, import.meta.url))); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function unpaddedLegacySnd() {
  const wave = Buffer.alloc(57);
  wave.write('RIFF', 0); wave.writeUInt32LE(49, 4); wave.write('WAVE', 8);
  wave.write('fmt ', 12); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(8_000, 24); wave.writeUInt32LE(8_000, 28); wave.writeUInt16LE(1, 32); wave.writeUInt16LE(8, 34);
  wave.write('data', 36); wave.writeUInt32LE(1, 40); wave[44] = 128;
  wave.write('LIST', 45); wave.writeUInt32LE(4, 49); wave.write('INFO', 53);

  const snd = Buffer.alloc(24 + 16 + wave.length);
  snd.write('ElecbyteSnd\0', 0); snd.set([0, 1, 0, 1], 12); snd.writeUInt32LE(1, 16); snd.writeUInt32LE(24, 20);
  snd.writeUInt32LE(0, 24); snd.writeUInt32LE(wave.length, 28); snd.writeInt32LE(0, 32); snd.writeInt32LE(0, 36); wave.copy(snd, 40);
  return new Uint8Array(snd);
}
