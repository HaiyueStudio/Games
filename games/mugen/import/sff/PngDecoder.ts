import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import { checkedProduct, MugenBoundedBinaryReader } from './BinaryReader';

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const ADAM7 = Object.freeze([
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
  [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
] as const);

export interface DecodedPngPixels {
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: 'indexed8' | 'rgb8' | 'rgba8';
  readonly pixels: Uint8Array;
}

export async function decodeMugenPng(
  source: Uint8Array,
  expectedFormat: 'indexed8' | 'rgb8' | 'rgba8',
  canonicalPath: string,
  blockOffset: number,
  signal?: AbortSignal,
): Promise<DecodedPngPixels> {
  throwIfAborted(signal);
  const reader = new MugenBoundedBinaryReader(source, canonicalPath);
  if (source.byteLength < PNG_SIGNATURE.byteLength || !PNG_SIGNATURE.every((byte, index) => source[index] === byte)) invalid(canonicalPath, blockOffset, 'PNG signature is invalid.');
  reader.seek(PNG_SIGNATURE.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let sawHeader = false;
  let sawEnd = false;
  const idat: Uint8Array[] = [];
  let compressedBytes = 0;
  while (reader.offset < source.byteLength) {
    const chunkOffset = reader.offset;
    const length = readBigEndianU32(reader, canonicalPath, blockOffset);
    if (length > MUGEN_LIMITS.sff.maxCompressedBlockBytes) limit(canonicalPath, blockOffset + chunkOffset, 'maxCompressedBlockBytes', length, MUGEN_LIMITS.sff.maxCompressedBlockBytes);
    const typeBytes = reader.slice(4);
    const type = String.fromCharCode(...typeBytes);
    const data = reader.slice(length);
    const expectedCrc = readBigEndianU32(reader, canonicalPath, blockOffset);
    const crcInput = new Uint8Array(4 + data.byteLength);
    crcInput.set(typeBytes);
    crcInput.set(data, 4);
    if (crc32(crcInput) !== expectedCrc) invalid(canonicalPath, blockOffset + chunkOffset, `PNG ${type} chunk CRC is invalid.`);
    if (!sawHeader && type !== 'IHDR') invalid(canonicalPath, blockOffset + chunkOffset, 'PNG IHDR must be the first chunk.');
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) invalid(canonicalPath, blockOffset + chunkOffset, 'PNG IHDR is duplicated or malformed.');
      const header = new MugenBoundedBinaryReader(data, canonicalPath);
      width = readBigEndianU32(header, canonicalPath, blockOffset + chunkOffset + 8);
      height = readBigEndianU32(header, canonicalPath, blockOffset + chunkOffset + 8);
      bitDepth = header.u8();
      colorType = header.u8();
      const compression = header.u8();
      const filter = header.u8();
      interlace = header.u8();
      if (width < 1 || height < 1 || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) invalid(canonicalPath, blockOffset + chunkOffset, 'PNG IHDR contains invalid dimensions or methods.');
      sawHeader = true;
    } else if (type === 'IDAT') {
      if (sawEnd) invalid(canonicalPath, blockOffset + chunkOffset, 'PNG IDAT appears after IEND.');
      compressedBytes += data.byteLength;
      if (compressedBytes > MUGEN_LIMITS.sff.maxCompressedBlockBytes) limit(canonicalPath, blockOffset + chunkOffset, 'maxCompressedBlockBytes', compressedBytes, MUGEN_LIMITS.sff.maxCompressedBlockBytes);
      idat.push(data.slice());
    } else if (type === 'IEND') {
      if (length !== 0) invalid(canonicalPath, blockOffset + chunkOffset, 'PNG IEND must be empty.');
      sawEnd = true;
      if (reader.offset !== source.byteLength) invalid(canonicalPath, blockOffset + reader.offset, 'PNG has trailing bytes after IEND.');
      break;
    } else if ((typeBytes[0]! & 0x20) === 0 && !['PLTE'].includes(type)) {
      invalid(canonicalPath, blockOffset + chunkOffset, `PNG critical chunk ${type} is unsupported.`);
    }
  }
  if (!sawHeader || !sawEnd || idat.length === 0) invalid(canonicalPath, blockOffset, 'PNG is missing IHDR, IDAT, or IEND.');
  validateColorMode(expectedFormat, colorType, bitDepth, canonicalPath, blockOffset);
  const channels = colorType === 3 ? 1 : colorType === 2 ? 3 : 4;
  const outputBytesPerPixel = expectedFormat === 'indexed8' ? 1 : expectedFormat === 'rgb8' ? 3 : 4;
  const pixelCount = checkedProduct([width, height], canonicalPath, 'PNG pixel');
  const outputBytes = checkedProduct([pixelCount, outputBytesPerPixel], canonicalPath, 'PNG decoded');
  const limitValue = outputBytesPerPixel === 1 ? MUGEN_LIMITS.sff.maxDecodedIndexBytesPerSprite : MUGEN_LIMITS.sff.maxDecodedColorBytesPerSprite;
  if (outputBytes > limitValue) limit(canonicalPath, blockOffset, outputBytesPerPixel === 1 ? 'maxDecodedIndexBytesPerSprite' : 'maxDecodedColorBytesPerSprite', outputBytes, limitValue);
  const inflatedBytes = expectedInflatedBytes(width, height, channels, bitDepth, interlace);
  if (compressedBytes === 0 || inflatedBytes / compressedBytes > MUGEN_LIMITS.sff.maxDecompressionRatio) {
    failMugen(mugenDiagnostic('E_MUGEN_COMPRESSION_RATIO', 'decode', 'fatal', 'release-resource', 'PNG exceeds the decompression ratio budget.', { canonicalPath, byteOffset: blockOffset }, { observed: compressedBytes === 0 ? inflatedBytes : inflatedBytes / compressedBytes, limit: MUGEN_LIMITS.sff.maxDecompressionRatio }));
  }
  const compressed = concatenate(idat, compressedBytes);
  const inflated = await inflateZlibBounded(compressed, inflatedBytes, canonicalPath, blockOffset, signal);
  const pixels = new Uint8Array(outputBytes);
  if (interlace === 0) {
    decodePass(inflated, 0, width, height, 0, 0, 1, 1, channels, bitDepth, pixels, width, outputBytesPerPixel, canonicalPath, blockOffset);
  } else {
    let offset = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const passWidth = passSize(width, x0, dx);
      const passHeight = passSize(height, y0, dy);
      if (passWidth === 0 || passHeight === 0) continue;
      offset = decodePass(inflated, offset, passWidth, passHeight, x0, y0, dx, dy, channels, bitDepth, pixels, width, outputBytesPerPixel, canonicalPath, blockOffset);
    }
    if (offset !== inflated.byteLength) invalid(canonicalPath, blockOffset, 'Adam7 PNG decoded byte count is inconsistent.');
  }
  return Object.freeze({ width, height, pixelFormat: expectedFormat, pixels });
}

function decodePass(
  inflated: Uint8Array, start: number, passWidth: number, passHeight: number,
  x0: number, y0: number, dx: number, dy: number, channels: number, bitDepth: number,
  output: Uint8Array, outputWidth: number, outputBytesPerPixel: number,
  canonicalPath: string, blockOffset: number,
): number {
  const rowBytes = Math.ceil(passWidth * channels * bitDepth / 8);
  const filterBytesPerPixel = Math.max(1, Math.ceil(channels * bitDepth / 8));
  let offset = start;
  let previous = new Uint8Array(rowBytes);
  for (let passY = 0; passY < passHeight; passY++) {
    if (offset >= inflated.byteLength) invalid(canonicalPath, blockOffset, 'PNG scanline filter byte is truncated.');
    const filter = inflated[offset++]!;
    if (offset > inflated.byteLength - rowBytes) invalid(canonicalPath, blockOffset, 'PNG scanline data is truncated.');
    const row = inflated.slice(offset, offset + rowBytes);
    offset += rowBytes;
    unfilter(row, previous, filter, filterBytesPerPixel, canonicalPath, blockOffset);
    for (let passX = 0; passX < passWidth; passX++) {
      const outputPixel = ((y0 + passY * dy) * outputWidth + x0 + passX * dx) * outputBytesPerPixel;
      if (bitDepth === 8) {
        const sourcePixel = passX * channels;
        output.set(row.subarray(sourcePixel, sourcePixel + outputBytesPerPixel), outputPixel);
      } else {
        const perByte = 8 / bitDepth;
        const shift = (perByte - 1 - (passX % perByte)) * bitDepth;
        output[outputPixel] = (row[Math.floor(passX / perByte)]! >>> shift) & ((1 << bitDepth) - 1);
      }
    }
    previous = row;
  }
  return offset;
}

function unfilter(row: Uint8Array, previous: Uint8Array, filter: number, bpp: number, canonicalPath: string, blockOffset: number): void {
  if (filter > 4) invalid(canonicalPath, blockOffset, `PNG scanline filter ${filter} is invalid.`);
  for (let index = 0; index < row.length; index++) {
    const left = index >= bpp ? row[index - bpp]! : 0;
    const above = previous[index] ?? 0;
    const upperLeft = index >= bpp ? previous[index - bpp]! : 0;
    if (filter === 1) row[index] = (row[index]! + left) & 0xff;
    else if (filter === 2) row[index] = (row[index]! + above) & 0xff;
    else if (filter === 3) row[index] = (row[index]! + Math.floor((left + above) / 2)) & 0xff;
    else if (filter === 4) row[index] = (row[index]! + paeth(left, above, upperLeft)) & 0xff;
  }
}

async function inflateZlibBounded(input: Uint8Array, expectedBytes: number, canonicalPath: string, byteOffset: number, signal?: AbortSignal): Promise<Uint8Array> {
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new Blob([Uint8Array.from(input).buffer]).stream().pipeThrough(new DecompressionStream('deflate')) as ReadableStream<Uint8Array>;
  } catch (error) {
    invalid(canonicalPath, byteOffset, `PNG zlib stream could not be created: ${error instanceof Error ? error.message : String(error)}`);
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > expectedBytes) invalid(canonicalPath, byteOffset, 'PNG zlib stream expands beyond its exact scanline size.');
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    invalid(canonicalPath, byteOffset, `PNG zlib stream is invalid: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedBytes) invalid(canonicalPath, byteOffset, `PNG zlib stream decoded ${total} bytes; expected ${expectedBytes}.`);
  return concatenate(chunks, total);
}

function expectedInflatedBytes(width: number, height: number, channels: number, bitDepth: number, interlace: number): number {
  if (interlace === 0) return height * (1 + Math.ceil(width * channels * bitDepth / 8));
  return ADAM7.reduce((total, [x0, y0, dx, dy]) => {
    const passWidth = passSize(width, x0, dx);
    const passHeight = passSize(height, y0, dy);
    return total + (passWidth === 0 ? 0 : passHeight * (1 + Math.ceil(passWidth * channels * bitDepth / 8)));
  }, 0);
}

function validateColorMode(expected: DecodedPngPixels['pixelFormat'], colorType: number, bitDepth: number, canonicalPath: string, blockOffset: number): void {
  const valid = expected === 'indexed8'
    ? colorType === 3 && [1, 2, 4, 8].includes(bitDepth)
    : expected === 'rgb8' ? colorType === 2 && bitDepth === 8 : colorType === 6 && bitDepth === 8;
  if (!valid) invalid(canonicalPath, blockOffset, `PNG color type/bit depth ${colorType}/${bitDepth} does not match ${expected}.`);
}

function readBigEndianU32(reader: MugenBoundedBinaryReader, canonicalPath: string, blockOffset: number): number {
  const bytes = reader.slice(4);
  const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
  if (!Number.isSafeInteger(value)) invalid(canonicalPath, blockOffset + reader.offset - 4, 'PNG uint32 is invalid.');
  return value;
}

function passSize(size: number, start: number, step: number): number { return size <= start ? 0 : Math.ceil((size - start) / step); }
function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
}
function concatenate(chunks: readonly Uint8Array[], total: number): Uint8Array { const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; } return output; }
function limit(canonicalPath: string, byteOffset: number, budget: string, observed: number, maximum: number): never { failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `PNG exceeds ${budget}.`, { canonicalPath, byteOffset }, { budget, observed, limit: maximum })); }
function invalid(canonicalPath: string, byteOffset: number, message: string): never { failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', message, { canonicalPath, byteOffset })); }

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}
