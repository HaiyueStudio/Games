import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { deflateSync } from 'node:zlib';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [
  { MugenImportFailure },
  { buildMugenImportGraph },
  { createMugenVfs },
  { parseMugenAct },
  { importMugenSpriteContributions },
  { parseMugenSff },
  { importMugenPackage },
] = await Promise.all([
  import('../mugen/import/diagnostics.ts'),
  import('../mugen/import/text/DependencyGraph.ts'),
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/sff/ActParser.ts'),
  import('../mugen/import/sff/MugenSpritePackage.ts'),
  import('../mugen/import/sff/SffParser.ts'),
  import('../mugen/package/importer.ts'),
]);

const UTF8 = new TextEncoder();

test('ACT decoding reverses Adobe color order and makes MUGEN index zero transparent', async () => {
  const bytes = new Uint8Array(768);
  bytes.set([1, 2, 3], 0);
  bytes.set([4, 5, 6], 765);
  const file = (await createMugenVfs([{ path: 'hero.act', bytes }])).require('hero.act');
  const palette = parseMugenAct(file, 1, 2);
  assert.deepEqual([...palette.rgba.subarray(0, 4)], [4, 5, 6, 0]);
  assert.deepEqual([...palette.rgba.subarray(255 * 4, 256 * 4)], [1, 2, 3, 255]);
  await assertDiagnostic(() => parseMugenAct(fakeVfsFile('short.act', new Uint8Array(767)), 1, 1), 'E_MUGEN_DECODE_INVALID');
});

test('SFF v1 decodes PCX, shared palettes, linked pixels, axes, and stable sprite keys', async () => {
  const bank = await parseMugenSff(fakeResource('hero-v1.sff', buildSffV1()));
  assert.equal(bank.version, '1.0');
  assert.equal(bank.sprites.length, 3);
  assert.equal(bank.palettes.length, 1);
  assert.deepEqual([...bank.sprites[0].pixels], [1, 2]);
  assert.deepEqual([...bank.sprites[1].pixels], [2, 1]);
  assert.equal(bank.sprites[1].paletteSourceIndex, 0);
  assert.equal(bank.sprites[2].linkedToSourceIndex, 0);
  assert.equal(bank.sprites[2].pixels, null);
  assert.deepEqual([bank.sprites[2].axisX, bank.sprites[2].axisY], [7, -8]);
  assert.deepEqual([...bank.palettes[0].rgba.subarray(0, 8)], [0, 0, 0, 0, 1, 2, 3, 255]);
});

test('SFF v1 accepts the Elecbyte 1.1 FightFX header variant and rejects unknown minors', async () => {
  const officialVariant = buildSffV1();
  officialVariant.set([0, 1, 0, 1], 12);
  const view = new DataView(officialVariant.buffer);
  const secondHeader = view.getUint32(view.getUint32(24, true), true);
  view.setUint32(secondHeader + 4, view.getUint32(secondHeader + 4, true) + 768, true);
  assert.equal((await parseMugenSff(fakeResource('fightfx.sff', officialVariant))).version, '1.0');
  const unknownMinor = buildSffV1();
  unknownMinor.set([0, 2, 0, 1], 12);
  await assertDiagnostic(() => parseMugenSff(fakeResource('unknown-v1.sff', unknownMinor)), 'E_MUGEN_FORMAT_VERSION');
});

test('SFF v1 decodes three-plane truecolor PCX sprites', async () => {
  const bank = await parseMugenSff(fakeResource('truecolor.sff', buildSingleSffV1(pcx24(2, 1, Uint8Array.of(10, 20, 30, 40, 50, 60)))));
  assert.equal(bank.sprites[0].pixelFormat, 'rgb8');
  assert.equal(bank.sprites[0].colorDepth, 24);
  assert.deepEqual([...bank.sprites[0].pixels], [10, 20, 30, 40, 50, 60]);
  assert.equal(bank.sprites[0].paletteSourceIndex, null);
});

test('SFF v1 resolves a missing embedded PCX palette through the character ACT palette', async () => {
  const sff = buildSingleSffV1(pcx8(2, 1, Uint8Array.of(1, 2), null));
  const inputs = [
    { path: 'hero.def', bytes: UTF8.encode('[Files]\ncmd=hero.cmd\nsprite=hero.sff\nanim=hero.air\npal1=hero.act\n') },
    { path: 'hero.cmd', bytes: UTF8.encode('[Command]\nname=x\n') },
    { path: 'hero.air', bytes: UTF8.encode('[Begin Action 0]\n0,0,0,0,1\n') },
    { path: 'hero.sff', bytes: sff },
    { path: 'hero.act', bytes: new Uint8Array(768) },
  ];
  const vfs = await createMugenVfs(inputs);
  const graph = await buildMugenImportGraph(vfs, { encoding: 'utf-8' });
  const result = await importMugenSpriteContributions(graph);
  assert.equal(result.banks[0].sprites[0].paletteSourceIndex, null);
  assert.equal(result.contributions.sprites[0].paletteId, 'hero.act#palette:0');
});

test('SFF v2.01 decodes raw, RLE8, RLE5, LZ5, PNG8/24/32, links, palettes and alpha', async () => {
  const bank = await parseMugenSff(fakeResource('hero-v201.sff', buildSffV2Fixture()));
  assert.equal(bank.version, '2.01');
  assert.equal(bank.sprites.length, 10);
  assert.equal(bank.palettes.length, 2);
  assert.deepEqual([...bank.sprites[0].pixels], [0, 1, 2, 3]);
  assert.deepEqual([...bank.sprites[1].pixels], [1, 1, 1, 1]);
  assert.deepEqual([...bank.sprites[2].pixels], [2, 2, 2, 2]);
  assert.deepEqual([...bank.sprites[3].pixels], [3, 3, 3, 3]);
  assert.equal(bank.sprites[4].linkedToSourceIndex, 0);
  assert.deepEqual([...bank.sprites[5].pixels], [10, 20, 30]);
  assert.deepEqual([...bank.sprites[6].pixels], [40, 50, 60, 70]);
  assert.deepEqual([...bank.sprites[7].pixels], [0, 1]);
  assert.deepEqual([...bank.sprites[8].pixels], [9, 8, 7]);
  assert.deepEqual([...bank.sprites[9].pixels], [6, 5, 4, 3]);
  assert.equal(bank.palettes[1].linkedToSourceIndex, 0);
  assert.strictEqual(bank.palettes[1].rgba, bank.palettes[0].rgba);
  assert.deepEqual([...bank.palettes[0].rgba.subarray(0, 8)], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...new Set(bank.sprites.map(sprite => sprite.compression))].sort(), ['linked', 'lz5', 'png24', 'png32', 'png8', 'raw-rgb24', 'raw-rgba32', 'raw-indexed', 'rle5', 'rle8'].sort());
});

test('SFF v2.00 forces indexed palette alpha and rejects v2.01 truecolor formats', async () => {
  const v200 = buildSffV2Fixture({ version: '2.0', includeTruecolor: false });
  const bank = await parseMugenSff(fakeResource('hero-v200.sff', v200));
  assert.equal(bank.version, '2.0');
  assert.deepEqual([...bank.palettes[0].rgba.subarray(0, 8)], [1, 2, 3, 0, 5, 6, 7, 255]);
  const invalid = buildSffV2Fixture({ version: '2.0', includeTruecolor: true });
  await assertDiagnostic(() => parseMugenSff(fakeResource('invalid-v200.sff', invalid)), 'E_MUGEN_FORMAT_VERSION');
});

test('SFF duplicate sprite keys remain source-addressable and warn that official MUGEN 1.1 selects the last', async () => {
  const duplicate = buildSffV2Fixture({ mutate(records) { records.sprites[1].group = records.sprites[0].group; records.sprites[1].item = records.sprites[0].item; } });
  const bank = await parseMugenSff(fakeResource('duplicate.sff', duplicate));
  assert.equal(bank.sprites.length, 10);
  assert.deepEqual(bank.sprites.slice(0, 2).map(sprite => [sprite.sourceIndex, sprite.group, sprite.item]), [[0, 0, 0], [1, 0, 0]]);
  assert.deepEqual(bank.diagnostics.map(item => ({ code: item.code, severity: item.severity, recovery: item.recovery, details: item.details })), [{
    code: 'E_MUGEN_SFF_SPRITE_DUPLICATE',
    severity: 'warning',
    recovery: 'ignore',
    details: { firstSourceIndex: 0, duplicateSourceIndex: 1 },
  }]);
});

test('SFF parser fails closed on bad offsets, links, palettes and compression', async () => {
  const badOffset = buildSffV2Fixture({ mutate(records) { records.sprites[0].relativeOffset = 0xfffffff0; } });
  await assertDiagnostic(() => parseMugenSff(fakeResource('offset.sff', badOffset)), 'E_MUGEN_OFFSET_RANGE');
  const linkCycle = buildSffV2Fixture({ mutate(records) { records.sprites[0].data = null; records.sprites[0].link = 4; records.sprites[4].link = 0; } });
  await assertDiagnostic(() => parseMugenSff(fakeResource('cycle.sff', linkCycle)), 'E_MUGEN_LINK_CYCLE');
  const paletteMissing = buildSffV2Fixture({ mutate(records) { records.sprites[0].palette = 99; } });
  await assertDiagnostic(() => parseMugenSff(fakeResource('palette.sff', paletteMissing)), 'E_MUGEN_SFF_PALETTE_MISSING');
  const compression = buildSffV2Fixture({ mutate(records) { records.sprites[0].format = 9; } });
  await assertDiagnostic(() => parseMugenSff(fakeResource('compression.sff', compression)), 'E_MUGEN_SFF_COMPRESSION_UNSUPPORTED');
  await assertDiagnostic(() => parseMugenSff(fakeResource('truncated.sff', buildSffV2Fixture().subarray(0, 80))), 'E_MUGEN_OFFSET_RANGE');
});

test('SFF parser survives deterministic truncation and mutation fuzz without leaking native errors', async () => {
  const original = buildSffV2Fixture();
  let state = 0x4d554745;
  const random = maximum => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % maximum;
  };
  const corpus = [];
  for (let index = 0; index < 64; index++) corpus.push(original.subarray(0, random(original.byteLength + 1)));
  for (let index = 0; index < 128; index++) {
    const mutated = original.slice();
    const changes = 1 + random(8);
    for (let change = 0; change < changes; change++) mutated[random(mutated.byteLength)] ^= 1 << random(8);
    corpus.push(mutated);
  }
  for (let index = 0; index < corpus.length; index++) {
    try {
      await parseMugenSff(fakeResource(`fuzz-${index}.sff`, corpus[index]));
    } catch (error) {
      assert.ok(error instanceof MugenImportFailure, `fuzz case ${index} leaked ${error?.constructor?.name ?? typeof error}: ${error}`);
      assert.ok(error.diagnostics.length > 0);
    }
  }
});

test('G03 package contribution is deterministic, keeps linked data single-copy, and contains no SFF source bytes', async () => {
  const sff = buildSffV2Fixture();
  const act = new Uint8Array(768);
  act[0] = 77;
  const inputs = [
    { path: 'hero.def', bytes: UTF8.encode('[Files]\ncmd=hero.cmd\nsprite=hero.sff\nanim=hero.air\npal1=hero.act\n') },
    { path: 'hero.cmd', bytes: UTF8.encode('[Command]\nname=x\n') },
    { path: 'hero.air', bytes: UTF8.encode('[Begin Action 0]\n0,0,0,0,1\n') },
    { path: 'hero.sff', bytes: sff },
    { path: 'hero.act', bytes: act },
  ];
  const firstVfs = await createMugenVfs(inputs);
  const firstGraph = await buildMugenImportGraph(firstVfs, { encoding: 'utf-8' });
  const firstSprites = await importMugenSpriteContributions(firstGraph);
  const first = await importMugenPackage(firstVfs, { contentRole: 'formal-fixture', encoding: 'utf-8', contributions: firstSprites.contributions });
  const secondVfs = await createMugenVfs([...inputs].reverse());
  const secondGraph = await buildMugenImportGraph(secondVfs, { encoding: 'utf-8' });
  const secondSprites = await importMugenSpriteContributions(secondGraph);
  const second = await importMugenPackage(secondVfs, { contentRole: 'formal-fixture', encoding: 'utf-8', contributions: secondSprites.contributions });
  assert.equal(first.encoded.packageSha256, second.encoded.packageSha256);
  assert.equal(createHash('sha256').update(sff).digest('hex'), '1c6e4997c008f290431155cf1425b6faa8e3f2a8146dc55c5e22afc0d2186a4c');
  assert.equal(first.encoded.packageSha256, '201a0a47197d3e03914b98422d7a829871b7ff266e46dd95c7f991bac5865cf1');
  assert.deepEqual(first.package.tables.sprites, second.package.tables.sprites);
  assert.equal(first.package.tables.sprites.filter(sprite => sprite.pixelsBase64 === null).length, 1);
  assert.equal(first.package.tables.palettes.some(palette => palette.group === 1 && palette.item === 1 && palette.source === 'act'), true);
  assert.equal(new TextDecoder().decode(first.encoded.bytes).includes('ElecbyteSpr'), false);
});

const localKfm = new URL('../../../.g03-reference/official/mugen-1.1b1/chars/kfm/kfm.sff', import.meta.url);
test('local frozen KFM oracle parses with expected SFF inventory', { skip: !existsSync(localKfm) }, async () => {
  const bytes = new Uint8Array(readFileSync(localKfm));
  const bank = await parseMugenSff(fakeResource('kfm.sff', bytes, '48be6f118ce8665ab1b383d877d93efe51c47246c30358f39ec8db62172d3746'));
  assert.deepEqual({ version: bank.version, sprites: bank.sprites.length, palettes: bank.palettes.length, decodedSpriteBytes: bank.decodedSpriteBytes }, { version: '2.01', sprites: 281, palettes: 7, decodedSpriteBytes: 1_389_153 });
  assert.deepEqual([...new Set(bank.sprites.map(sprite => sprite.compression))].sort(), ['linked', 'lz5', 'rle8']);
});

function buildSffV1() {
  const palette = new Uint8Array(768);
  palette.set([1, 2, 3], 3);
  const first = pcx8(2, 1, Uint8Array.of(1, 2), palette);
  const second = pcx8(2, 1, Uint8Array.of(2, 1), null);
  const records = [
    { group: 0, item: 0, axisX: -3, axisY: 4, link: 0, shared: false, data: first },
    { group: 0, item: 1, axisX: 5, axisY: 6, link: 0, shared: true, data: second },
    { group: 1, item: 0, axisX: 7, axisY: -8, link: 0, shared: true, data: null },
  ];
  const output = new Uint8Array(512 + records.reduce((sum, record) => sum + 32 + (record.data?.byteLength ?? 0), 0));
  output.set(UTF8.encode('ElecbyteSpr\0'));
  output.set([0, 0, 0, 1], 12);
  const view = new DataView(output.buffer);
  view.setUint32(20, records.length, true);
  view.setUint32(24, 512, true);
  let offset = 512;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const next = index + 1 < records.length ? offset + 32 + (record.data?.byteLength ?? 0) : 0;
    view.setUint32(offset, next, true);
    view.setUint32(offset + 4, record.data?.byteLength ?? 0, true);
    view.setInt16(offset + 8, record.axisX, true);
    view.setInt16(offset + 10, record.axisY, true);
    view.setUint16(offset + 12, record.group, true);
    view.setUint16(offset + 14, record.item, true);
    view.setUint16(offset + 16, record.link, true);
    output[offset + 18] = record.shared ? 1 : 0;
    if (record.data) output.set(record.data, offset + 32);
    offset = next;
  }
  return output;
}

function pcx8(width, height, pixels, palette) {
  const output = new Uint8Array(128 + pixels.byteLength + (palette ? 769 : 0));
  const view = new DataView(output.buffer);
  output.set([10, 5, 0, 8], 0);
  view.setUint16(8, width - 1, true);
  view.setUint16(10, height - 1, true);
  output[65] = 1;
  view.setUint16(66, width, true);
  output.set(pixels, 128);
  if (palette) { output[128 + pixels.byteLength] = 0x0c; output.set(palette, 129 + pixels.byteLength); }
  return output;
}

function pcx24(width, height, pixels) {
  const output = new Uint8Array(128 + width * height * 3);
  const view = new DataView(output.buffer);
  output.set([10, 5, 0, 8], 0);
  view.setUint16(8, width - 1, true);
  view.setUint16(10, height - 1, true);
  output[65] = 3;
  view.setUint16(66, width, true);
  let destination = 128;
  for (let y = 0; y < height; y++) {
    for (let channel = 0; channel < 3; channel++) {
      for (let x = 0; x < width; x++) output[destination++] = pixels[(y * width + x) * 3 + channel];
    }
  }
  return output;
}

function buildSingleSffV1(data) {
  const output = new Uint8Array(512 + 32 + data.byteLength);
  output.set(UTF8.encode('ElecbyteSpr\0'));
  output.set([0, 0, 0, 1], 12);
  const view = new DataView(output.buffer);
  view.setUint32(20, 1, true);
  view.setUint32(24, 512, true);
  view.setUint32(516, data.byteLength, true);
  output.set(data, 544);
  return output;
}

function buildSffV2Fixture(options = {}) {
  const includeTruecolor = options.includeTruecolor ?? true;
  const palettes = [
    { group: 1, item: 1, colors: 2, link: 0, data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) },
    { group: 1, item: 2, colors: 2, link: 0, data: null },
  ];
  const sprites = [
    sprite(0, 0, 2, 2, 8, 0, Uint8Array.of(0, 1, 2, 3)),
    sprite(0, 1, 2, 2, 8, 2, prefixed(4, Uint8Array.of(0x44, 1))),
    sprite(0, 2, 2, 2, 5, 3, prefixed(4, Uint8Array.of(3, 0x80, 2))),
    sprite(0, 3, 2, 2, 5, 4, prefixed(4, Uint8Array.of(0, 0x83))),
    { ...sprite(0, 4, 0, 0, 8, 0, null), link: 0 },
  ];
  if (includeTruecolor) {
    sprites.push(
      sprite(1, 0, 1, 1, 24, 0, Uint8Array.of(10, 20, 30)),
      sprite(1, 1, 1, 1, 32, 0, Uint8Array.of(40, 50, 60, 70)),
      sprite(1, 2, 2, 1, 8, 10, prefixed(2, png(2, 1, 3, 8, Uint8Array.of(0, 1)))),
      sprite(1, 3, 1, 1, 24, 11, prefixed(3, png(1, 1, 2, 8, Uint8Array.of(9, 8, 7)))),
      sprite(1, 4, 1, 1, 32, 12, prefixed(4, png(1, 1, 6, 8, Uint8Array.of(6, 5, 4, 3)))),
    );
  }
  const records = { sprites, palettes };
  options.mutate?.(records);
  const headerBytes = 512;
  const spriteTableOffset = headerBytes;
  const paletteTableOffset = spriteTableOffset + sprites.length * 28;
  const localDataOffset = paletteTableOffset + palettes.length * 16;
  let dataBytes = 0;
  for (const palette of palettes) { palette.relativeOffset = dataBytes; if (palette.data) dataBytes += palette.data.byteLength; }
  for (const entry of sprites) { if (entry.relativeOffset === undefined) entry.relativeOffset = dataBytes; if (entry.data) dataBytes += entry.data.byteLength; }
  const output = new Uint8Array(localDataOffset + dataBytes);
  output.set(UTF8.encode('ElecbyteSpr\0'));
  output.set(options.version === '2.0' ? [0, 0, 0, 2] : [0, 1, 0, 2], 12);
  const view = new DataView(output.buffer);
  view.setUint32(36, spriteTableOffset, true);
  view.setUint32(40, sprites.length, true);
  view.setUint32(44, paletteTableOffset, true);
  view.setUint32(48, palettes.length, true);
  view.setUint32(52, localDataOffset, true);
  view.setUint32(56, dataBytes, true);
  view.setUint32(60, localDataOffset, true);
  for (let index = 0; index < palettes.length; index++) {
    const palette = palettes[index];
    const offset = paletteTableOffset + index * 16;
    view.setUint16(offset, palette.group, true); view.setUint16(offset + 2, palette.item, true);
    view.setUint16(offset + 4, palette.colors, true); view.setUint16(offset + 6, palette.link, true);
    view.setUint32(offset + 8, palette.relativeOffset, true); view.setUint32(offset + 12, palette.data?.byteLength ?? 0, true);
    if (palette.data) output.set(palette.data, localDataOffset + palette.relativeOffset);
  }
  for (let index = 0; index < sprites.length; index++) {
    const entry = sprites[index];
    const offset = spriteTableOffset + index * 28;
    view.setUint16(offset, entry.group, true); view.setUint16(offset + 2, entry.item, true);
    view.setUint16(offset + 4, entry.width, true); view.setUint16(offset + 6, entry.height, true);
    view.setInt16(offset + 8, entry.axisX, true); view.setInt16(offset + 10, entry.axisY, true);
    view.setUint16(offset + 12, entry.link, true); output[offset + 14] = entry.format; output[offset + 15] = entry.depth;
    view.setUint32(offset + 16, entry.relativeOffset, true); view.setUint32(offset + 20, entry.data?.byteLength ?? 0, true);
    view.setUint16(offset + 24, entry.palette, true); view.setUint16(offset + 26, 0, true);
    if (entry.data && entry.relativeOffset < dataBytes) output.set(entry.data, localDataOffset + entry.relativeOffset);
  }
  return output;
}

function sprite(group, item, width, height, depth, format, data) { return { group, item, width, height, depth, format, data, axisX: -2, axisY: 3, link: 0, palette: 0 }; }
function prefixed(length, data) { const output = new Uint8Array(4 + data.byteLength); new DataView(output.buffer).setUint32(0, length, true); output.set(data, 4); return output; }

function png(width, height, colorType, bitDepth, pixels) {
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width, false); view.setUint32(4, height, false); header[8] = bitDepth; header[9] = colorType;
  const channels = colorType === 3 ? 1 : colorType === 2 ? 3 : 4;
  const scanlines = new Uint8Array(height * (1 + width * channels));
  for (let y = 0; y < height; y++) scanlines.set(pixels.subarray(y * width * channels, (y + 1) * width * channels), y * (1 + width * channels) + 1);
  const chunks = [pngChunk('IHDR', header)];
  if (colorType === 3) chunks.push(pngChunk('PLTE', Uint8Array.of(0, 0, 0, 255, 255, 255)));
  chunks.push(pngChunk('IDAT', new Uint8Array(deflateSync(scanlines))), pngChunk('IEND', new Uint8Array(0)));
  return concatenate([signature, ...chunks]);
}

function pngChunk(type, data) {
  const typeBytes = UTF8.encode(type);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false); output.set(typeBytes, 4); output.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(concatenate([typeBytes, data])), false);
  return output;
}

function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); } return (value ^ 0xffffffff) >>> 0; }
function concatenate(chunks) { const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; } return output; }
function fakeVfsFile(path, bytes, sha256 = '0'.repeat(64)) { return { canonicalPath: path, foldedPath: path.toLowerCase(), byteLength: bytes.byteLength, sha256, read: () => bytes.slice() }; }
function fakeResource(path, bytes, sha256) { return { ...fakeVfsFile(path, bytes, sha256), kind: 'sprite' }; }

async function assertDiagnostic(action, code) {
  await assert.rejects(Promise.resolve().then(action), error => {
    assert.ok(error instanceof MugenImportFailure, `expected MugenImportFailure, got ${error}`);
    assert.equal(error.diagnostics[0]?.code, code);
    return true;
  });
}
