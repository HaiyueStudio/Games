import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import { createMugenVfs, type MugenVfs, type MugenVfsInput } from './MugenVfs';
import { canonicalizeMugenPath } from './path';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_535 + 22;

interface ZipEntry {
  readonly path: string;
  readonly flags: number;
  readonly compression: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
  readonly nameBytes: Uint8Array;
  readonly symlink: boolean;
}

export async function createMugenVfsFromZip(source: Uint8Array | ArrayBuffer, signal?: AbortSignal): Promise<MugenVfs> {
  throwIfAborted(signal);
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) {
    failBudget('archiveBytes', bytes.byteLength, MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes);
  }
  const entries = readCentralDirectory(bytes);
  const fileEntries = entries.filter(entry => !entry.path.endsWith('/'));
  const rootPrefix = commonArchiveRoot(fileEntries.map(entry => entry.path));
  const inputs: MugenVfsInput[] = [];
  let expandedBytes = 0;
  for (const entry of entries) {
    throwIfAborted(signal);
    if (entry.path.endsWith('/')) continue;
    if (entry.symlink) {
      failMugen(mugenDiagnostic('E_MUGEN_PATH_SYMLINK', 'vfs', 'fatal', 'release-resource', `ZIP symbolic link is forbidden: ${entry.path}`));
    }
    if (entry.uncompressedSize > MUGEN_LIMITS.directoryAndArchive.maxArchiveEntryBytes) {
      failBudget('archiveEntryBytes', entry.uncompressedSize, MUGEN_LIMITS.directoryAndArchive.maxArchiveEntryBytes, entry.path);
    }
    expandedBytes = checkedAdd(expandedBytes, entry.uncompressedSize, 'archiveExpandedBytes', MUGEN_LIMITS.directoryAndArchive.maxArchiveExpandedBytes);
    const ratio = entry.compressedSize === 0 ? (entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY) : entry.uncompressedSize / entry.compressedSize;
    if (ratio > MUGEN_LIMITS.directoryAndArchive.maxArchiveCompressionRatio) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_COMPRESSION_RATIO',
        'decode',
        'fatal',
        'release-resource',
        `ZIP entry exceeds the compression ratio budget: ${entry.path}`,
        { canonicalPath: entry.path },
        { observed: ratio, limit: MUGEN_LIMITS.directoryAndArchive.maxArchiveCompressionRatio },
      ));
    }
    const output = await decodeEntry(bytes, entry, signal);
    inputs.push({ path: rootPrefix === '' ? entry.path : entry.path.slice(rootPrefix.length), bytes: output });
  }
  return createMugenVfs(inputs, signal);
}

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEocd(view);
  const disk = u16(view, eocdOffset + 4);
  const centralDisk = u16(view, eocdOffset + 6);
  const diskEntryCount = u16(view, eocdOffset + 8);
  const entryCount = u16(view, eocdOffset + 10);
  const centralSize = u32(view, eocdOffset + 12);
  const centralOffset = u32(view, eocdOffset + 16);
  const commentLength = u16(view, eocdOffset + 20);
  requireRange(bytes, eocdOffset + 22, commentLength, 'ZIP comment');
  if (disk !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount) failOutOfProfile('Multi-disk ZIP archives are not supported.');
  if (entryCount === 0xffff || centralSize === 0xffff_ffff || centralOffset === 0xffff_ffff) failOutOfProfile('ZIP64 archives are not supported.');
  if (entryCount > MUGEN_LIMITS.directoryAndArchive.maxFiles) failBudget('archiveEntries', entryCount, MUGEN_LIMITS.directoryAndArchive.maxFiles);
  requireRange(bytes, centralOffset, centralSize, 'ZIP central directory');
  if (centralOffset + centralSize > eocdOffset) failInvalid('ZIP central directory overlaps its end record.');

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    requireRange(bytes, cursor, 46, 'ZIP central entry');
    if (u32(view, cursor) !== CENTRAL_SIGNATURE) failInvalid('ZIP central directory signature is invalid.');
    const madeBy = u16(view, cursor + 4);
    const flags = u16(view, cursor + 8);
    const compression = u16(view, cursor + 10);
    const crc = u32(view, cursor + 16);
    const compressedSize = u32(view, cursor + 20);
    const uncompressedSize = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const entryCommentLength = u16(view, cursor + 32);
    const externalAttributes = u32(view, cursor + 38);
    const localHeaderOffset = u32(view, cursor + 42);
    if ([compressedSize, uncompressedSize, localHeaderOffset].includes(0xffff_ffff)) failOutOfProfile('ZIP64 entry metadata is not supported.');
    if ((flags & 0x0001) !== 0) failOutOfProfile('Encrypted ZIP entries are not supported.');
    if ((flags & ~0x080e) !== 0) failOutOfProfile(`ZIP entry uses unsupported general-purpose flags: 0x${flags.toString(16)}.`);
    if (compression !== 0 && compression !== 8) failOutOfProfile(`ZIP compression method ${compression} is not supported.`);
    const variableLength = checkedSize(nameLength, extraLength, entryCommentLength);
    requireRange(bytes, cursor + 46, variableLength, 'ZIP central entry fields');
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
    const path = decodeZipPath(nameBytes, (flags & 0x0800) !== 0);
    canonicalizeMugenPath(path.replace(/\/$/, '') || path);
    const hostSystem = madeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    const symlink = hostSystem === 3 && (unixMode & 0xf000) === 0xa000;
    entries.push({ path, flags, compression, crc32: crc, compressedSize, uncompressedSize, localHeaderOffset, nameBytes, symlink });
    cursor += 46 + variableLength;
  }
  if (cursor !== centralOffset + centralSize) failInvalid('ZIP central directory size does not match its entries.');
  return entries;
}

async function decodeEntry(archive: Uint8Array, entry: ZipEntry, signal?: AbortSignal): Promise<Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  requireRange(archive, entry.localHeaderOffset, 30, 'ZIP local header');
  if (u32(view, entry.localHeaderOffset) !== LOCAL_SIGNATURE) failInvalid(`ZIP local header is invalid for ${entry.path}.`);
  const localFlags = u16(view, entry.localHeaderOffset + 6);
  const localCompression = u16(view, entry.localHeaderOffset + 8);
  const nameLength = u16(view, entry.localHeaderOffset + 26);
  const extraLength = u16(view, entry.localHeaderOffset + 28);
  if (localFlags !== entry.flags || localCompression !== entry.compression) failInvalid(`ZIP local metadata disagrees with the central directory for ${entry.path}.`);
  requireRange(archive, entry.localHeaderOffset + 30, checkedSize(nameLength, extraLength), 'ZIP local fields');
  const localName = archive.subarray(entry.localHeaderOffset + 30, entry.localHeaderOffset + 30 + nameLength);
  if (!equalBytes(localName, entry.nameBytes)) failInvalid(`ZIP local filename disagrees with the central directory for ${entry.path}.`);
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  requireRange(archive, dataOffset, entry.compressedSize, 'ZIP entry payload');
  const compressed = archive.slice(dataOffset, dataOffset + entry.compressedSize);
  const output = entry.compression === 0
    ? compressed
    : await inflateRawBounded(compressed, entry.uncompressedSize, signal);
  if (output.byteLength !== entry.uncompressedSize) failInvalid(`ZIP entry decoded length is invalid for ${entry.path}.`);
  if (crc32(output) !== entry.crc32) failInvalid(`ZIP entry CRC-32 is invalid for ${entry.path}.`);
  return output;
}

async function inflateRawBounded(compressed: Uint8Array, expectedBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') failOutOfProfile('This browser does not provide bounded ZIP deflate decoding.');
  let stream: ReadableStream<Uint8Array>;
  try {
    const compressedCopy = Uint8Array.from(compressed);
    stream = new Blob([compressedCopy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  } catch (error) {
    failInvalid(`ZIP deflate decoder could not start: ${error instanceof Error ? error.message : String(error)}`);
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const result = await reader.read();
      if (result.done) break;
      total = checkedAdd(total, result.value.byteLength, 'archiveEntryBytes', Math.min(expectedBytes, MUGEN_LIMITS.directoryAndArchive.maxArchiveEntryBytes));
      chunks.push(result.value.slice());
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function decodeZipPath(bytes: Uint8Array, utf8: boolean): string {
  if (!utf8 && bytes.some(byte => byte >= 0x80)) failOutOfProfile('Non-ASCII ZIP filenames must use the UTF-8 flag.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\\/g, '/');
  } catch {
    failMugen(mugenDiagnostic('E_MUGEN_ENCODING_INVALID_SEQUENCE', 'text-decode', 'error', 'retry', 'ZIP filename is not valid UTF-8.'));
  }
}

function findEocd(view: DataView): number {
  const start = Math.max(0, view.byteLength - MAX_EOCD_SEARCH);
  for (let offset = view.byteLength - 22; offset >= start; offset--) {
    if (u32(view, offset) === EOCD_SIGNATURE) {
      const commentLength = u16(view, offset + 20);
      if (offset + 22 + commentLength === view.byteLength) return offset;
    }
  }
  failInvalid('ZIP end-of-central-directory record was not found.');
}

function requireRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    failMugen(mugenDiagnostic('E_MUGEN_TRUNCATED', 'binary-parse', 'fatal', 'release-resource', `${label} is outside the archive.`));
  }
}

function checkedSize(...values: number[]): number {
  let result = 0;
  for (const value of values) {
    result += value;
    if (!Number.isSafeInteger(result)) failMugen(mugenDiagnostic('E_MUGEN_INTEGER_OVERFLOW', 'binary-parse', 'fatal', 'release-resource', 'ZIP metadata size overflowed.'));
  }
  return result;
}

function checkedAdd(current: number, increment: number, budget: string, limit: number): number {
  const result = current + increment;
  if (!Number.isSafeInteger(result) || result > limit) failBudget(budget, result, limit);
  return result;
}

function failBudget(budget: string, observed: number, limit: number, canonicalPath?: string): never {
  failMugen(mugenDiagnostic(
    'E_MUGEN_LIMIT_EXCEEDED',
    'budget',
    'fatal',
    'release-resource',
    `ZIP exceeds ${budget} budget (${observed} > ${limit}).`,
    canonicalPath === undefined ? {} : { canonicalPath },
    { budget, observed, limit },
  ));
}

function failInvalid(message: string): never {
  failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', message));
}

function failOutOfProfile(message: string): never {
  failMugen(mugenDiagnostic('E_MUGEN_OUT_OF_PROFILE', 'classification', 'error', 'release-resource', message));
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function commonArchiveRoot(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  const firstSeparator = paths[0]?.indexOf('/') ?? -1;
  if (firstSeparator <= 0) return '';
  const prefix = paths[0]!.slice(0, firstSeparator + 1);
  return paths.every(path => path.startsWith(prefix)) ? prefix : '';
}

const CRC_TABLE = createCrcTable();

function crc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffff_ffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) !== 0 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}
