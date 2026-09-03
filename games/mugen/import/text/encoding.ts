import { MUGEN_EXPLICIT_ENCODINGS, MUGEN_LIMITS, type MugenSourceEncoding } from '../contract';
import { failMugen, mugenDiagnostic } from '../diagnostics';

export interface DecodedMugenText {
  readonly text: string;
  readonly encoding: MugenSourceEncoding;
  readonly hadUtf8Bom: boolean;
  readonly byteBoundaries: Uint32Array;
}

export function decodeMugenText(
  bytes: Uint8Array,
  canonicalPath: string,
  explicitEncoding?: MugenSourceEncoding,
): DecodedMugenText {
  if (bytes.byteLength > MUGEN_LIMITS.text.maxTextFileBytes) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_LIMIT_EXCEEDED',
      'budget',
      'fatal',
      'release-resource',
      `MUGEN text file exceeds the byte budget: ${canonicalPath}`,
      { canonicalPath },
      { budget: 'textFileBytes', observed: bytes.byteLength, limit: MUGEN_LIMITS.text.maxTextFileBytes },
    ));
  }
  if (bytes.byteLength >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    failUnsupportedEncoding(canonicalPath, 'UTF-16 BOM is outside the strict MUGEN text profile.', 0);
  }
  const hadUtf8Bom = bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hadUtf8Bom && explicitEncoding !== undefined && explicitEncoding !== 'utf-8') {
    failUnsupportedEncoding(canonicalPath, `UTF-8 BOM conflicts with explicit ${explicitEncoding} encoding.`, 0);
  }
  if (explicitEncoding !== undefined && explicitEncoding !== 'utf-8' && !MUGEN_EXPLICIT_ENCODINGS.includes(explicitEncoding)) {
    failUnsupportedEncoding(canonicalPath, `Unsupported explicit MUGEN encoding: ${explicitEncoding}`, 0);
  }
  const encoding: MugenSourceEncoding = hadUtf8Bom ? 'utf-8' : explicitEncoding ?? 'windows-1252';
  const offset = hadUtf8Bom ? 3 : 0;
  const decoded = encoding === 'utf-8'
    ? decodeUtf8(bytes, offset, canonicalPath, hadUtf8Bom)
    : encoding === 'windows-1252'
      ? decodeWindows1252(bytes, offset)
      : decodeLegacyStreaming(bytes, offset, canonicalPath, encoding);
  const normalized = normalizeLineEndings(decoded.text, decoded.byteBoundaries);
  const sanitizedText = sanitizeLegacyCommentNuls(normalized.text, normalized.byteBoundaries, bytes, offset, canonicalPath);
  return Object.freeze({
    text: sanitizedText,
    encoding,
    hadUtf8Bom,
    byteBoundaries: normalized.byteBoundaries,
  });
}

function decodeUtf8(bytes: Uint8Array, offset: number, canonicalPath: string, allowLegacyCommentBytes: boolean): { text: string; byteBoundaries: Uint32Array } {
  const chunks: string[] = [];
  const boundaries: number[] = [offset];
  let cursor = offset;
  while (cursor < bytes.byteLength) {
    const start = cursor;
    const first = bytes[cursor]!;
    let codePoint: number;
    let length: number;
    if (first <= 0x7f) {
      codePoint = first;
      length = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      length = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      length = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      length = 4;
    } else {
      if (allowLegacyCommentBytes && isIgnorableLegacyByte(bytes, start, offset)) {
        appendLegacyByte(chunks, boundaries, first, start);
        cursor++;
        continue;
      }
      failInvalidEncoding(canonicalPath, start);
    }
    if (cursor + length > bytes.byteLength) {
      if (allowLegacyCommentBytes && isIgnorableLegacyByte(bytes, start, offset)) {
        appendLegacyByte(chunks, boundaries, first, start);
        cursor++;
        continue;
      }
      failInvalidEncoding(canonicalPath, start);
    }
    let invalidContinuation = -1;
    for (let index = 1; index < length; index++) {
      const continuation = bytes[cursor + index]!;
      if ((continuation & 0xc0) !== 0x80) {
        invalidContinuation = cursor + index;
        break;
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }
    const invalidScalar = (length === 3 && codePoint < 0x800)
      || (length === 4 && codePoint < 0x1_0000)
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      || codePoint > 0x10_ffff;
    if (invalidContinuation >= 0 || invalidScalar) {
      if (allowLegacyCommentBytes && isIgnorableLegacyByte(bytes, start, offset)) {
        appendLegacyByte(chunks, boundaries, first, start);
        cursor++;
        continue;
      }
      failInvalidEncoding(canonicalPath, invalidContinuation >= 0 ? invalidContinuation : start);
    }
    cursor += length;
    appendMapped(chunks, boundaries, String.fromCodePoint(codePoint), start, cursor);
  }
  return { text: chunks.join(''), byteBoundaries: Uint32Array.from(boundaries) };
}

function isCommentByte(bytes: Uint8Array, byteOffset: number, documentOffset: number): boolean {
  let lineStart = byteOffset;
  while (lineStart > documentOffset && bytes[lineStart - 1] !== 0x0a && bytes[lineStart - 1] !== 0x0d) lineStart--;
  let firstContent = lineStart;
  while (firstContent < byteOffset && (bytes[firstContent] === 0x20 || bytes[firstContent] === 0x09)) firstContent++;
  if (bytes[firstContent] === 0x27) return true;
  let quote = 0;
  for (let cursor = lineStart; cursor < byteOffset; cursor++) {
    const byte = bytes[cursor]!;
    if (quote !== 0) {
      if (byte === quote && bytes[cursor - 1] !== 0x5c) quote = 0;
      continue;
    }
    if (byte === 0x22 || byte === 0x27) quote = byte;
    else if (byte === 0x3b) return true;
  }
  return false;
}

function isIgnorableLegacyByte(bytes: Uint8Array, byteOffset: number, documentOffset: number): boolean {
  if (isCommentByte(bytes, byteOffset, documentOffset)) return true;
  let lineStart = byteOffset;
  while (lineStart > documentOffset && bytes[lineStart - 1] !== 0x0a && bytes[lineStart - 1] !== 0x0d) lineStart--;
  let quote = 0;
  for (let cursor = lineStart; cursor < byteOffset; cursor++) {
    const byte = bytes[cursor]!;
    if (quote !== 0) {
      if (byte === quote && bytes[cursor - 1] !== 0x5c) quote = 0;
    } else if (byte === 0x22 || byte === 0x27) {
      quote = byte;
    } else if (byte === 0x3b) {
      return true;
    }
  }
  return quote !== 0;
}

function sanitizeLegacyCommentNuls(
  text: string,
  boundaries: Uint32Array,
  sourceBytes: Uint8Array,
  documentOffset: number,
  canonicalPath: string,
): string {
  if (!text.includes('\0')) return text;
  const characters = [...text];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '\0') continue;
    const byteOffset = boundaries[index]!;
    if (!isCommentByte(sourceBytes, byteOffset, documentOffset)) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_TEXT_SYNTAX',
        'text-parse',
        'error',
        'release-resource',
        `NUL is forbidden in MUGEN text: ${canonicalPath}`,
        { canonicalPath, byteOffset },
      ));
    }
    characters[index] = ' ';
  }
  return characters.join('');
}

function appendLegacyByte(chunks: string[], boundaries: number[], byte: number, offset: number): void {
  const codePoint = byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_C1[byte - 0x80]! : byte;
  appendMapped(chunks, boundaries, String.fromCodePoint(codePoint), offset, offset + 1);
}

function decodeWindows1252(bytes: Uint8Array, offset: number): { text: string; byteBoundaries: Uint32Array } {
  const chunks: string[] = [];
  const boundaries: number[] = [offset];
  for (let cursor = offset; cursor < bytes.byteLength; cursor++) {
    const byte = bytes[cursor]!;
    const codePoint = byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_C1[byte - 0x80]! : byte;
    appendMapped(chunks, boundaries, String.fromCodePoint(codePoint), cursor, cursor + 1);
  }
  return { text: chunks.join(''), byteBoundaries: Uint32Array.from(boundaries) };
}

function decodeLegacyStreaming(
  bytes: Uint8Array,
  offset: number,
  canonicalPath: string,
  encoding: Exclude<MugenSourceEncoding, 'utf-8' | 'windows-1252'>,
): { text: string; byteBoundaries: Uint32Array } {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(encoding, { fatal: true });
  } catch {
    failUnsupportedEncoding(canonicalPath, `Browser does not support explicit MUGEN encoding: ${encoding}`, offset);
  }
  const chunks: string[] = [];
  const boundaries: number[] = [offset];
  let pendingStart = -1;
  for (let cursor = offset; cursor < bytes.byteLength; cursor++) {
    const byte = bytes[cursor]!;
    if (pendingStart < 0 && byte <= 0x7f) {
      appendMapped(chunks, boundaries, String.fromCharCode(byte), cursor, cursor + 1);
      continue;
    }
    if (pendingStart < 0) pendingStart = cursor;
    let output: string;
    try {
      output = decoder.decode(Uint8Array.of(byte), { stream: true });
    } catch {
      failInvalidEncoding(canonicalPath, cursor);
    }
    if (output !== '') {
      appendMapped(chunks, boundaries, output, pendingStart, cursor + 1);
      pendingStart = -1;
    }
  }
  try {
    const output = decoder.decode();
    if (output !== '') appendMapped(chunks, boundaries, output, pendingStart < 0 ? bytes.byteLength : pendingStart, bytes.byteLength);
  } catch {
    failInvalidEncoding(canonicalPath, pendingStart < 0 ? bytes.byteLength : pendingStart);
  }
  if (pendingStart >= 0) failInvalidEncoding(canonicalPath, pendingStart);
  return { text: chunks.join(''), byteBoundaries: Uint32Array.from(boundaries) };
}

function normalizeLineEndings(text: string, sourceBoundaries: Uint32Array): { text: string; byteBoundaries: Uint32Array } {
  const chunks: string[] = [];
  const boundaries: number[] = [sourceBoundaries[0] ?? 0];
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '\r') {
      const isCrLf = text[index + 1] === '\n';
      const endIndex = isCrLf ? index + 2 : index + 1;
      appendMapped(chunks, boundaries, '\n', sourceBoundaries[index]!, sourceBoundaries[endIndex]!);
      if (isCrLf) index++;
      continue;
    }
    appendMapped(chunks, boundaries, character, sourceBoundaries[index]!, sourceBoundaries[index + 1]!);
  }
  return { text: chunks.join(''), byteBoundaries: Uint32Array.from(boundaries) };
}

function appendMapped(chunks: string[], boundaries: number[], value: string, startByte: number, endByte: number): void {
  chunks.push(value);
  for (let index = 0; index < value.length; index++) boundaries.push(index === value.length - 1 ? endByte : startByte);
}

function failInvalidEncoding(canonicalPath: string, byteOffset: number): never {
  failMugen(mugenDiagnostic(
    'E_MUGEN_ENCODING_INVALID_SEQUENCE',
    'text-decode',
    'error',
    'retry',
    `Invalid encoded byte sequence in ${canonicalPath} at byte ${byteOffset}.`,
    { canonicalPath, byteOffset },
  ));
}

function failUnsupportedEncoding(canonicalPath: string, message: string, byteOffset: number): never {
  failMugen(mugenDiagnostic('E_MUGEN_ENCODING_UNSUPPORTED', 'text-decode', 'error', 'retry', message, { canonicalPath, byteOffset }));
}

const WINDOWS_1252_C1: readonly number[] = Object.freeze([
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]);
