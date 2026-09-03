import { failMugen, mugenDiagnostic } from '../diagnostics';

export class MugenBoundedBinaryReader {
  readonly bytes: Uint8Array;
  readonly canonicalPath: string;
  offset: number;

  constructor(bytes: Uint8Array, canonicalPath: string, offset = 0) {
    this.bytes = bytes;
    this.canonicalPath = canonicalPath;
    this.offset = offset;
    this.requireRange(offset, 0, 'reader start');
  }

  requireRange(offset: number, length: number, label: string): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > this.bytes.byteLength - length) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_OFFSET_RANGE', 'binary-parse', 'fatal', 'release-resource',
        `${label} is outside ${this.canonicalPath}.`,
        { canonicalPath: this.canonicalPath, byteOffset: Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0) },
        { offset, length, fileBytes: this.bytes.byteLength },
      ));
    }
  }

  seek(offset: number): void {
    this.requireRange(offset, 0, 'binary seek');
    this.offset = offset;
  }

  skip(length: number): void { this.seek(checkedAdd(this.offset, length, this.canonicalPath)); }

  u8(): number { this.requireRange(this.offset, 1, 'uint8'); return this.bytes[this.offset++]!; }
  u16(): number { const value = this.view(2).getUint16(0, true); this.offset += 2; return value; }
  i16(): number { const value = this.view(2).getInt16(0, true); this.offset += 2; return value; }
  u32(): number { const value = this.view(4).getUint32(0, true); this.offset += 4; return value; }

  slice(length: number): Uint8Array {
    this.requireRange(this.offset, length, 'binary slice');
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  sliceAt(offset: number, length: number): Uint8Array {
    this.requireRange(offset, length, 'binary block');
    return this.bytes.subarray(offset, offset + length);
  }

  ascii(length: number): string { return String.fromCharCode(...this.slice(length)); }

  private view(length: number): DataView {
    this.requireRange(this.offset, length, 'binary scalar');
    return new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, length);
  }
}

export function checkedAdd(left: number, right: number, canonicalPath: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_INTEGER_OVERFLOW', 'binary-parse', 'fatal', 'release-resource',
      `Binary offset arithmetic overflowed in ${canonicalPath}.`, { canonicalPath }, { left, right },
    ));
  }
  return value;
}

export function checkedProduct(values: readonly number[], canonicalPath: string, label: string): number {
  let result = 1;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || (value !== 0 && result > Number.MAX_SAFE_INTEGER / value)) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_INTEGER_OVERFLOW', 'binary-parse', 'fatal', 'release-resource',
        `${label} size overflowed in ${canonicalPath}.`, { canonicalPath }, { factor: value },
      ));
    }
    result *= value;
  }
  return result;
}
