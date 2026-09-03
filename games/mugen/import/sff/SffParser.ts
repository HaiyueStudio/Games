import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted, type MugenImportDiagnostic } from '../diagnostics';
import type { MugenImportResource } from '../text/DependencyGraph';
import { checkedAdd, checkedProduct, MugenBoundedBinaryReader } from './BinaryReader';
import { decodeLz5, decodeRle5, decodeRle8 } from './compression';
import { decodePcx8 } from './PcxDecoder';
import { decodeMugenPng } from './PngDecoder';
import type { MugenDecodedPalette, MugenDecodedSprite, MugenSffBank, MugenSffVersion, MugenSpriteCompression, MugenSpritePixelFormat } from './types';

const SFF_SIGNATURE = 'ElecbyteSpr\0';
const V1_HEADER_BYTES = 32;
const V1_SPRITE_HEADER_BYTES = 32;
const V2_HEADER_MIN_BYTES = 64;
const V2_SPRITE_HEADER_BYTES = 28;
const V2_PALETTE_HEADER_BYTES = 16;

interface V2Header {
  readonly version: MugenSffVersion;
  readonly versionAlpha: boolean;
  readonly spriteTableOffset: number;
  readonly spriteCount: number;
  readonly paletteTableOffset: number;
  readonly paletteCount: number;
  readonly localDataOffset: number;
  readonly translatedDataOffset: number;
}

interface V2PaletteRecord {
  readonly sourceIndex: number;
  readonly group: number;
  readonly item: number;
  readonly declaredColors: number;
  readonly linkedIndex: number;
  readonly dataOffset: number;
  readonly dataLength: number;
}

interface V2SpriteRecord {
  readonly sourceIndex: number;
  readonly group: number;
  readonly item: number;
  readonly width: number;
  readonly height: number;
  readonly axisX: number;
  readonly axisY: number;
  readonly linkedIndex: number;
  readonly format: number;
  readonly colorDepth: number;
  readonly dataOffset: number;
  readonly dataLength: number;
  readonly paletteIndex: number;
}

export interface ParseMugenSffOptions { readonly signal?: AbortSignal; }

export async function parseMugenSff(resource: MugenImportResource, options: ParseMugenSffOptions = {}): Promise<MugenSffBank> {
  throwIfAborted(options.signal);
  if (resource.kind !== 'sprite') invalid(resource.canonicalPath, 0, 'SFF parser requires a sprite resource.');
  const bytes = resource.read();
  const reader = new MugenBoundedBinaryReader(bytes, resource.canonicalPath);
  if (bytes.byteLength < V1_HEADER_BYTES || reader.ascii(12) !== SFF_SIGNATURE) {
    failMugen(mugenDiagnostic('E_MUGEN_FORMAT_SIGNATURE', 'binary-parse', 'fatal', 'release-resource', 'SFF signature is invalid.', { canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256, byteOffset: 0 }));
  }
  const versionBytes = reader.slice(4);
  const high = versionBytes[3]!;
  if (high === 1) return parseV1(bytes, resource, versionBytes, options.signal);
  if (high === 2) return parseV2(bytes, resource, versionBytes, options.signal);
  failMugen(mugenDiagnostic('E_MUGEN_FORMAT_VERSION', 'binary-parse', 'error', 'release-resource', `Unsupported SFF major version ${high}.`, { canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256, byteOffset: 12 }));
}

function parseV1(bytes: Uint8Array, resource: MugenImportResource, versionBytes: Uint8Array, signal?: AbortSignal): MugenSffBank {
  // Elecbyte's MUGEN 1.1 fightfx.sff identifies the same v1 layout with
  // 00.01.00.01, while older character tools commonly emit 00.00.00.01.
  if (versionBytes[0] !== 0 || (versionBytes[1] !== 0 && versionBytes[1] !== 1) || versionBytes[2] !== 0) versionError(resource, versionBytes);
  const reader = new MugenBoundedBinaryReader(bytes, resource.canonicalPath, 16);
  reader.u32();
  const spriteCount = reader.u32();
  const firstHeader = reader.u32();
  reader.u32();
  checkCount(spriteCount, MUGEN_LIMITS.sff.maxSpritesPerFile, 'maxSpritesPerFile', resource.canonicalPath, 20);
  if (firstHeader < V1_HEADER_BYTES) invalid(resource.canonicalPath, 24, 'SFF v1 first sprite header overlaps the file header.');
  const sprites: MugenDecodedSprite[] = [];
  const palettes: MugenDecodedPalette[] = [];
  const diagnostics: MugenImportDiagnostic[] = [];
  const keySources = new Map<string, number>();
  let headerOffset = firstHeader;
  let previousPaletteIndex: number | null = null;
  let decodedSpriteBytes = 0;
  for (let sourceIndex = 0; sourceIndex < spriteCount; sourceIndex++) {
    throwIfAborted(signal);
    const header = new MugenBoundedBinaryReader(bytes, resource.canonicalPath, headerOffset);
    header.requireRange(headerOffset, V1_SPRITE_HEADER_BYTES, 'SFF v1 sprite header');
    const nextHeader = header.u32();
    const dataLength = header.u32();
    const axisX = header.i16();
    const axisY = header.i16();
    const group = header.u16();
    const item = header.u16();
    const linkedIndex = header.u16();
    const paletteShared = header.u8() !== 0;
    checkDuplicateKey(keySources, group, item, sourceIndex, resource.canonicalPath, headerOffset + 12, diagnostics);
    const physicalEnd = nextHeader === 0 && sourceIndex + 1 === spriteCount ? bytes.byteLength : nextHeader;
    if (physicalEnd < headerOffset + V1_SPRITE_HEADER_BYTES || physicalEnd > bytes.byteLength) invalid(resource.canonicalPath, headerOffset, 'SFF v1 next sprite header is outside the file.');
    const physicalDataLength = physicalEnd - headerOffset - V1_SPRITE_HEADER_BYTES;
    if (dataLength === 0) {
      if (physicalDataLength !== 0) invalid(resource.canonicalPath, headerOffset + 4, 'Linked SFF v1 sprite unexpectedly owns physical data.');
      if (linkedIndex >= sourceIndex) linkError(resource.canonicalPath, headerOffset + 16, 'sprite', linkedIndex, sourceIndex);
      const base = sprites[linkedIndex]!;
      sprites.push(Object.freeze({
        sourceIndex, group, item, width: base.width, height: base.height, axisX, axisY,
        colorDepth: base.colorDepth, pixelFormat: base.pixelFormat, compression: 'linked', pixels: null,
        linkedToSourceIndex: linkedIndex, paletteSourceIndex: base.paletteSourceIndex,
      }));
    } else {
      const dataOffset = checkedAdd(headerOffset, V1_SPRITE_HEADER_BYTES, resource.canonicalPath);
      // Elecbyte keeps the omitted 768-byte palette in the declared PCX length
      // when the subfile shares its predecessor's palette. Some older tools
      // instead write the physical length, so both known v1 encodings are
      // accepted while the next-header offset remains the physical authority.
      if (dataLength !== physicalDataLength && (!paletteShared || dataLength !== physicalDataLength + 768)) invalid(resource.canonicalPath, headerOffset + 4, 'SFF v1 declared and physical sprite lengths disagree.');
      const block = new MugenBoundedBinaryReader(bytes, resource.canonicalPath).sliceAt(dataOffset, physicalDataLength);
      const decoded = decodePcx8(block, resource.canonicalPath, dataOffset, paletteShared);
      checkDimensions(decoded.width, decoded.height, decoded.colorDepth === 24 ? 3 : 1, resource.canonicalPath, dataOffset);
      let paletteSourceIndex: number | null;
      if (decoded.pixelFormat !== 'indexed8') {
        paletteSourceIndex = null;
      } else if (decoded.paletteRgba !== null) {
        paletteSourceIndex = palettes.length;
        palettes.push(Object.freeze({ sourceIndex: paletteSourceIndex, group: 0, item: paletteSourceIndex, colorCount: 256, rgba: decoded.paletteRgba, linkedToSourceIndex: null, source: 'sff-v1' }));
        previousPaletteIndex = paletteSourceIndex;
      } else {
        // A shared first sprite is valid when the character DEF supplies ACT
        // palettes. Some old exporters also omit a repeated PCX palette while
        // forgetting to set the shared flag.
        paletteSourceIndex = previousPaletteIndex;
      }
      decodedSpriteBytes = checkedDecodedTotal(decodedSpriteBytes, decoded.pixels.byteLength, resource.canonicalPath);
      sprites.push(Object.freeze({
        sourceIndex, group, item, width: decoded.width, height: decoded.height, axisX, axisY,
        colorDepth: decoded.colorDepth, pixelFormat: decoded.pixelFormat, compression: 'pcx', pixels: decoded.pixels,
        linkedToSourceIndex: null, paletteSourceIndex,
      }));
    }
    if (sourceIndex + 1 < spriteCount) {
      if (nextHeader <= headerOffset) linkError(resource.canonicalPath, headerOffset, 'sprite-header', nextHeader, headerOffset);
      headerOffset = nextHeader;
    }
  }
  const decodedPaletteBytes = palettes.length * 1024;
  checkPaletteTotal(decodedPaletteBytes, resource.canonicalPath);
  return freezeBank(resource, '1.0', sprites, palettes, diagnostics, decodedSpriteBytes, decodedPaletteBytes);
}

async function parseV2(bytes: Uint8Array, resource: MugenImportResource, versionBytes: Uint8Array, signal?: AbortSignal): Promise<MugenSffBank> {
  if (bytes.byteLength < V2_HEADER_MIN_BYTES) invalid(resource.canonicalPath, 0, 'SFF v2 header is truncated.');
  const version = parseV2Version(resource, versionBytes);
  const reader = new MugenBoundedBinaryReader(bytes, resource.canonicalPath, 16);
  reader.u32();
  reader.skip(16);
  const spriteTableOffset = reader.u32();
  const spriteCount = reader.u32();
  const paletteTableOffset = reader.u32();
  const paletteCount = reader.u32();
  const localDataOffset = reader.u32();
  reader.u32();
  const translatedDataOffset = reader.u32();
  const header: V2Header = Object.freeze({ version, versionAlpha: version === '2.01', spriteTableOffset, spriteCount, paletteTableOffset, paletteCount, localDataOffset, translatedDataOffset });
  checkCount(spriteCount, MUGEN_LIMITS.sff.maxSpritesPerFile, 'maxSpritesPerFile', resource.canonicalPath, 40);
  checkCount(paletteCount, MUGEN_LIMITS.sff.maxPalettesPerFile, 'maxPalettesPerFile', resource.canonicalPath, 48);
  new MugenBoundedBinaryReader(bytes, resource.canonicalPath).requireRange(spriteTableOffset, checkedProduct([spriteCount, V2_SPRITE_HEADER_BYTES], resource.canonicalPath, 'SFF v2 sprite table'), 'SFF v2 sprite table');
  new MugenBoundedBinaryReader(bytes, resource.canonicalPath).requireRange(paletteTableOffset, checkedProduct([paletteCount, V2_PALETTE_HEADER_BYTES], resource.canonicalPath, 'SFF v2 palette table'), 'SFF v2 palette table');
  const paletteRecords = readV2Palettes(bytes, resource.canonicalPath, header);
  const palettes = resolveV2Palettes(bytes, resource, header, paletteRecords);
  const diagnostics: MugenImportDiagnostic[] = [];
  const spriteRecords = readV2Sprites(bytes, resource.canonicalPath, header, diagnostics);
  const sprites = await resolveV2Sprites(bytes, resource, header, spriteRecords, palettes, signal);
  const decodedSpriteBytes = sprites.reduce((total, sprite) => sprite.pixels === null ? total : checkedDecodedTotal(total, sprite.pixels.byteLength, resource.canonicalPath), 0);
  const decodedPaletteBytes = palettes.reduce((total, palette) => total + (palette.linkedToSourceIndex === null ? palette.rgba.byteLength : 0), 0);
  checkPaletteTotal(decodedPaletteBytes, resource.canonicalPath);
  return freezeBank(resource, version, sprites, palettes, diagnostics, decodedSpriteBytes, decodedPaletteBytes);
}

function readV2Palettes(bytes: Uint8Array, canonicalPath: string, header: V2Header): readonly V2PaletteRecord[] {
  const records: V2PaletteRecord[] = [];
  const keys = new Set<string>();
  for (let sourceIndex = 0; sourceIndex < header.paletteCount; sourceIndex++) {
    const offset = header.paletteTableOffset + sourceIndex * V2_PALETTE_HEADER_BYTES;
    const reader = new MugenBoundedBinaryReader(bytes, canonicalPath, offset);
    const group = reader.u16();
    const item = reader.u16();
    const declaredColors = reader.u16();
    const linkedIndex = reader.u16();
    const relativeOffset = reader.u32();
    const dataLength = reader.u32();
    const key = `${group}:${item}`;
    if (keys.has(key)) invalid(canonicalPath, offset, `Duplicate SFF palette key ${group},${item}.`);
    keys.add(key);
    records.push(Object.freeze({ sourceIndex, group, item, declaredColors, linkedIndex, dataOffset: checkedAdd(header.localDataOffset, relativeOffset, canonicalPath), dataLength }));
  }
  return Object.freeze(records);
}

function resolveV2Palettes(bytes: Uint8Array, resource: MugenImportResource, header: V2Header, records: readonly V2PaletteRecord[]): readonly MugenDecodedPalette[] {
  const resolved = new Array<MugenDecodedPalette | undefined>(records.length);
  const visiting = new Set<number>();
  const visit = (index: number, depth: number): MugenDecodedPalette => {
    const existing = resolved[index];
    if (existing) return existing;
    if (depth > MUGEN_LIMITS.sff.maxLinkedPaletteDepth || visiting.has(index)) linkCycle(resource.canonicalPath, header.paletteTableOffset + index * V2_PALETTE_HEADER_BYTES, 'palette');
    const record = records[index];
    if (!record) missingPalette(resource.canonicalPath, header.paletteTableOffset, 0, index);
    visiting.add(index);
    let rgba: Uint8Array;
    let linkedToSourceIndex: number | null = null;
    let colorCount: number;
    if (record.dataLength === 0) {
      if (record.linkedIndex >= records.length) missingPalette(resource.canonicalPath, header.paletteTableOffset + index * V2_PALETTE_HEADER_BYTES + 6, record.group, record.item);
      const base = visit(record.linkedIndex, depth + 1);
      rgba = base.rgba;
      colorCount = base.colorCount;
      linkedToSourceIndex = record.linkedIndex;
    } else {
      if (record.dataLength % 4 !== 0 || record.dataLength > 256 * 4) invalid(resource.canonicalPath, record.dataOffset, 'SFF v2 palette data length is invalid.');
      new MugenBoundedBinaryReader(bytes, resource.canonicalPath).requireRange(record.dataOffset, record.dataLength, 'SFF v2 palette data');
      colorCount = record.dataLength / 4;
      if (record.declaredColors !== 0 && record.declaredColors !== colorCount) invalid(resource.canonicalPath, header.paletteTableOffset + index * V2_PALETTE_HEADER_BYTES + 4, 'SFF v2 palette declared color count does not match its data length.');
      rgba = new Uint8Array(Math.max(16, nextPowerOfTwo(colorCount)) * 4);
      rgba.set(bytes.subarray(record.dataOffset, record.dataOffset + record.dataLength));
      if (!header.versionAlpha) for (let color = 0; color < rgba.byteLength / 4; color++) rgba[color * 4 + 3] = color === 0 ? 0 : 255;
    }
    visiting.delete(index);
    const palette = Object.freeze({ sourceIndex: index, group: record.group, item: record.item, colorCount, rgba, linkedToSourceIndex, source: 'sff-v2' as const });
    resolved[index] = palette;
    return palette;
  };
  for (let index = 0; index < records.length; index++) visit(index, 0);
  return Object.freeze(resolved as MugenDecodedPalette[]);
}

function readV2Sprites(bytes: Uint8Array, canonicalPath: string, header: V2Header, diagnostics: MugenImportDiagnostic[]): readonly V2SpriteRecord[] {
  const records: V2SpriteRecord[] = [];
  const keySources = new Map<string, number>();
  for (let sourceIndex = 0; sourceIndex < header.spriteCount; sourceIndex++) {
    const offset = header.spriteTableOffset + sourceIndex * V2_SPRITE_HEADER_BYTES;
    const reader = new MugenBoundedBinaryReader(bytes, canonicalPath, offset);
    const group = reader.u16();
    const item = reader.u16();
    const width = reader.u16();
    const height = reader.u16();
    const axisX = reader.i16();
    const axisY = reader.i16();
    const linkedIndex = reader.u16();
    const format = reader.u8();
    const colorDepth = reader.u8();
    const relativeOffset = reader.u32();
    const dataLength = reader.u32();
    const paletteIndex = reader.u16();
    const flags = reader.u16();
    checkDuplicateKey(keySources, group, item, sourceIndex, canonicalPath, offset, diagnostics);
    const base = (flags & 1) === 0 ? header.localDataOffset : header.translatedDataOffset;
    if ((flags & ~1) !== 0) invalid(canonicalPath, offset + 26, `SFF v2 sprite flags ${flags} contain unknown bits.`);
    records.push(Object.freeze({ sourceIndex, group, item, width, height, axisX, axisY, linkedIndex, format, colorDepth, dataOffset: checkedAdd(base, relativeOffset, canonicalPath), dataLength, paletteIndex }));
  }
  return Object.freeze(records);
}

async function resolveV2Sprites(bytes: Uint8Array, resource: MugenImportResource, header: V2Header, records: readonly V2SpriteRecord[], palettes: readonly MugenDecodedPalette[], signal?: AbortSignal): Promise<readonly MugenDecodedSprite[]> {
  const resolved = new Array<MugenDecodedSprite | undefined>(records.length);
  const visiting = new Set<number>();
  const visit = async (index: number, depth: number): Promise<MugenDecodedSprite> => {
    throwIfAborted(signal);
    const existing = resolved[index];
    if (existing) return existing;
    if (depth > MUGEN_LIMITS.sff.maxLinkedSpriteDepth || visiting.has(index)) linkCycle(resource.canonicalPath, header.spriteTableOffset + index * V2_SPRITE_HEADER_BYTES, 'sprite');
    const record = records[index];
    if (!record) invalid(resource.canonicalPath, header.spriteTableOffset, `SFF v2 sprite link ${index} does not exist.`);
    visiting.add(index);
    let sprite: MugenDecodedSprite;
    if (record.dataLength === 0) {
      if (record.linkedIndex >= records.length) linkError(resource.canonicalPath, header.spriteTableOffset + index * V2_SPRITE_HEADER_BYTES + 12, 'sprite', record.linkedIndex, index);
      const base = await visit(record.linkedIndex, depth + 1);
      sprite = Object.freeze({
        sourceIndex: index, group: record.group, item: record.item,
        width: base.width, height: base.height, axisX: record.axisX, axisY: record.axisY,
        colorDepth: base.colorDepth, pixelFormat: base.pixelFormat, compression: 'linked', pixels: null,
        linkedToSourceIndex: record.linkedIndex,
        paletteSourceIndex: record.colorDepth <= 8 && record.paletteIndex < palettes.length ? record.paletteIndex : base.paletteSourceIndex,
      });
    } else {
      const decoded = await decodeV2SpriteData(bytes, resource.canonicalPath, header, record, signal);
      const paletteSourceIndex = decoded.pixelFormat === 'indexed8' ? record.paletteIndex : null;
      if (paletteSourceIndex !== null && paletteSourceIndex >= palettes.length) missingPalette(resource.canonicalPath, header.spriteTableOffset + index * V2_SPRITE_HEADER_BYTES + 24, record.group, record.item);
      sprite = Object.freeze({
        sourceIndex: index, group: record.group, item: record.item, width: record.width, height: record.height,
        axisX: record.axisX, axisY: record.axisY, colorDepth: decoded.colorDepth, pixelFormat: decoded.pixelFormat,
        compression: decoded.compression, pixels: decoded.pixels, linkedToSourceIndex: null, paletteSourceIndex,
      });
    }
    visiting.delete(index);
    resolved[index] = sprite;
    return sprite;
  };
  for (let index = 0; index < records.length; index++) await visit(index, 0);
  return Object.freeze(resolved as MugenDecodedSprite[]);
}

async function decodeV2SpriteData(bytes: Uint8Array, canonicalPath: string, header: V2Header, record: V2SpriteRecord, signal?: AbortSignal): Promise<{ readonly colorDepth: 5 | 8 | 24 | 32; readonly pixelFormat: MugenSpritePixelFormat; readonly compression: MugenSpriteCompression; readonly pixels: Uint8Array }> {
  const bytesPerPixel = record.colorDepth <= 8 ? 1 : record.colorDepth === 24 ? 3 : record.colorDepth === 32 ? 4 : 0;
  checkDimensions(record.width, record.height, bytesPerPixel, canonicalPath, record.dataOffset);
  if (![5, 8, 24, 32].includes(record.colorDepth)) invalid(canonicalPath, record.dataOffset, `SFF v2 color depth ${record.colorDepth} is unsupported.`);
  const expectedBytes = checkedProduct([record.width, record.height, bytesPerPixel], canonicalPath, 'SFF v2 sprite');
  new MugenBoundedBinaryReader(bytes, canonicalPath).requireRange(record.dataOffset, record.dataLength, 'SFF v2 sprite data');
  const block = bytes.subarray(record.dataOffset, record.dataOffset + record.dataLength);
  const pixelFormat: MugenSpritePixelFormat = record.colorDepth === 8 ? 'indexed8' : record.colorDepth === 24 ? 'rgb8' : 'rgba8';
  if (record.format === 0) {
    if (block.byteLength !== expectedBytes) invalid(canonicalPath, record.dataOffset, `Raw SFF v2 sprite has ${block.byteLength} bytes; expected ${expectedBytes}.`);
    return Object.freeze({ colorDepth: record.colorDepth as 5 | 8 | 24 | 32, pixelFormat, compression: record.colorDepth <= 8 ? 'raw-indexed' : record.colorDepth === 24 ? 'raw-rgb24' : 'raw-rgba32', pixels: block.slice() });
  }
  if (![2, 3, 4, 10, 11, 12].includes(record.format)) unsupportedCompression(canonicalPath, record.dataOffset, record.format);
  if (block.byteLength < 4) invalid(canonicalPath, record.dataOffset, 'Compressed SFF v2 sprite is missing its decoded-length prefix.');
  const declaredBytes = new DataView(block.buffer, block.byteOffset, 4).getUint32(0, true);
  if (declaredBytes !== expectedBytes) invalid(canonicalPath, record.dataOffset, `SFF v2 decoded-length prefix ${declaredBytes} does not match ${expectedBytes}.`);
  const payload = block.subarray(4);
  if (record.format >= 2 && record.format <= 4) {
    if ((record.format === 2 && record.colorDepth !== 8) || ((record.format === 3 || record.format === 4) && record.colorDepth !== 5)) unsupportedCompression(canonicalPath, record.dataOffset, record.format);
    const pixels = record.format === 2 ? decodeRle8(payload, expectedBytes, canonicalPath, record.dataOffset + 4)
      : record.format === 3 ? decodeRle5(payload, expectedBytes, canonicalPath, record.dataOffset + 4)
        : decodeLz5(payload, expectedBytes, canonicalPath, record.dataOffset + 4);
    return Object.freeze({ colorDepth: 8, pixelFormat: 'indexed8', compression: record.format === 2 ? 'rle8' : record.format === 3 ? 'rle5' : 'lz5', pixels });
  }
  if (!header.versionAlpha && (record.format === 11 || record.format === 12 || record.colorDepth > 8)) versionErrorRaw(canonicalPath, record.dataOffset, 'Truecolor PNG sprites require SFF v2.01.');
  const expectedPngFormat = record.format === 10 ? 'indexed8' : record.format === 11 ? 'rgb8' : 'rgba8';
  const expectedDepth = record.format === 10 ? 8 : record.format === 11 ? 24 : 32;
  if (record.colorDepth !== expectedDepth) invalid(canonicalPath, record.dataOffset, 'SFF v2 PNG format and color depth disagree.');
  const png = await decodeMugenPng(payload, expectedPngFormat, canonicalPath, record.dataOffset + 4, signal);
  if (png.width !== record.width || png.height !== record.height) invalid(canonicalPath, record.dataOffset + 4, 'SFF v2 PNG dimensions disagree with the sprite table.');
  return Object.freeze({ colorDepth: expectedDepth, pixelFormat: expectedPngFormat, compression: record.format === 10 ? 'png8' : record.format === 11 ? 'png24' : 'png32', pixels: png.pixels });
}

function parseV2Version(resource: MugenImportResource, bytes: Uint8Array): MugenSffVersion {
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0) return '2.0';
  if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0) return '2.01';
  versionError(resource, bytes);
}

function versionError(resource: MugenImportResource, bytes: Uint8Array): never { versionErrorRaw(resource.canonicalPath, 12, `Unsupported SFF version bytes ${[...bytes].join('.')}.`); }
function versionErrorRaw(canonicalPath: string, byteOffset: number, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_FORMAT_VERSION', 'binary-parse', 'error', 'release-resource', message, { canonicalPath, byteOffset })); }
function checkDimensions(width: number, height: number, bytesPerPixel: number, canonicalPath: string, byteOffset: number): void {
  if (width < 1 || height < 1 || width > MUGEN_LIMITS.sff.maxSpriteDimension || height > MUGEN_LIMITS.sff.maxSpriteDimension || bytesPerPixel < 1) limit(canonicalPath, byteOffset, 'maxSpriteDimension', Math.max(width, height), MUGEN_LIMITS.sff.maxSpriteDimension);
  const pixels = checkedProduct([width, height], canonicalPath, 'sprite pixel');
  if (pixels > MUGEN_LIMITS.sff.maxSpritePixels) limit(canonicalPath, byteOffset, 'maxSpritePixels', pixels, MUGEN_LIMITS.sff.maxSpritePixels);
  const decodedBytes = checkedProduct([pixels, bytesPerPixel], canonicalPath, 'sprite decoded');
  const maximum = bytesPerPixel === 1 ? MUGEN_LIMITS.sff.maxDecodedIndexBytesPerSprite : MUGEN_LIMITS.sff.maxDecodedColorBytesPerSprite;
  if (decodedBytes > maximum) limit(canonicalPath, byteOffset, bytesPerPixel === 1 ? 'maxDecodedIndexBytesPerSprite' : 'maxDecodedColorBytesPerSprite', decodedBytes, maximum);
}
function checkCount(observed: number, maximum: number, budget: string, canonicalPath: string, byteOffset: number): void { if (observed > maximum) limit(canonicalPath, byteOffset, budget, observed, maximum); }
function checkedDecodedTotal(current: number, added: number, canonicalPath: string): number { const total = checkedAdd(current, added, canonicalPath); if (total > MUGEN_LIMITS.sff.maxDecodedSpriteBytesPerPackage) limit(canonicalPath, 0, 'maxDecodedSpriteBytesPerPackage', total, MUGEN_LIMITS.sff.maxDecodedSpriteBytesPerPackage); return total; }
function checkPaletteTotal(total: number, canonicalPath: string): void { if (total > MUGEN_LIMITS.sff.maxDecodedPaletteBytesPerPackage) limit(canonicalPath, 0, 'maxDecodedPaletteBytesPerPackage', total, MUGEN_LIMITS.sff.maxDecodedPaletteBytesPerPackage); }
function checkDuplicateKey(keys: Map<string, number>, group: number, item: number, sourceIndex: number, canonicalPath: string, byteOffset: number, diagnostics: MugenImportDiagnostic[]): void {
  const key = `${group}:${item}`;
  const firstSourceIndex = keys.get(key);
  if (firstSourceIndex !== undefined) diagnostics.push(mugenDiagnostic(
    'E_MUGEN_SFF_SPRITE_DUPLICATE',
    'sff',
    'warning',
    'ignore',
    `Duplicate SFF sprite key ${group},${item} selects the later source record, matching MUGEN 1.1.`,
    { canonicalPath, byteOffset, group, item },
    { firstSourceIndex, duplicateSourceIndex: sourceIndex },
  ));
  else keys.set(key, sourceIndex);
}
function missingPalette(canonicalPath: string, byteOffset: number, group: number, item: number): never { failMugen(mugenDiagnostic('E_MUGEN_SFF_PALETTE_MISSING', 'sff', 'error', 'release-resource', `Sprite or palette ${group},${item} does not resolve a palette.`, { canonicalPath, byteOffset, group, item })); }
function unsupportedCompression(canonicalPath: string, byteOffset: number, format: number): never { failMugen(mugenDiagnostic('E_MUGEN_SFF_COMPRESSION_UNSUPPORTED', 'sff', 'error', 'release-resource', `SFF compression format ${format} is unsupported.`, { canonicalPath, byteOffset }, { format })); }
function linkCycle(canonicalPath: string, byteOffset: number, kind: string): never { failMugen(mugenDiagnostic('E_MUGEN_LINK_CYCLE', 'decode', 'fatal', 'release-resource', `SFF linked ${kind} graph contains a cycle or exceeds its depth budget.`, { canonicalPath, byteOffset })); }
function linkError(canonicalPath: string, byteOffset: number, kind: string, linked: number, current: number): never { failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', `SFF ${kind} link ${linked} is invalid at record ${current}.`, { canonicalPath, byteOffset }, { linked, current })); }
function invalid(canonicalPath: string, byteOffset: number, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', message, { canonicalPath, byteOffset })); }
function limit(canonicalPath: string, byteOffset: number, budget: string, observed: number, maximum: number): never { failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `SFF exceeds ${budget}.`, { canonicalPath, byteOffset }, { budget, observed, limit: maximum })); }
function nextPowerOfTwo(value: number): number { let result = 1; while (result < value) result *= 2; return Math.min(256, result); }
function freezeBank(resource: MugenImportResource, version: MugenSffVersion, sprites: readonly MugenDecodedSprite[], palettes: readonly MugenDecodedPalette[], diagnostics: readonly MugenImportDiagnostic[], decodedSpriteBytes: number, decodedPaletteBytes: number): MugenSffBank { return Object.freeze({ canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256, version, sprites: Object.freeze([...sprites]), palettes: Object.freeze([...palettes]), diagnostics: Object.freeze([...diagnostics]), decodedSpriteBytes, decodedPaletteBytes }); }
