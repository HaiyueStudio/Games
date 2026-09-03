import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic } from '../diagnostics';

export function decodeRle8(input: Uint8Array, expectedBytes: number, canonicalPath: string, byteOffset: number): Uint8Array {
  preflightCompressed(input, expectedBytes, canonicalPath, byteOffset, 'RLE8');
  const output = new Uint8Array(expectedBytes);
  let source = 0;
  let target = 0;
  while (target < output.length) {
    const control = requireByte(input, source++, canonicalPath, byteOffset, 'RLE8 control');
    if ((control & 0xc0) === 0x40) {
      const count = control & 0x3f;
      if (count === 0) invalid(canonicalPath, byteOffset + source - 1, 'RLE8 contains a zero-length run.');
      const value = requireByte(input, source++, canonicalPath, byteOffset, 'RLE8 run value');
      if (count > output.length - target) invalid(canonicalPath, byteOffset + source - 2, 'RLE8 run exceeds the declared sprite size.');
      output.fill(value, target, target + count);
      target += count;
    } else {
      output[target++] = control;
    }
  }
  return output;
}

export function decodeRle5(input: Uint8Array, expectedBytes: number, canonicalPath: string, byteOffset: number): Uint8Array {
  preflightCompressed(input, expectedBytes, canonicalPath, byteOffset, 'RLE5');
  const output = new Uint8Array(expectedBytes);
  let source = 0;
  let target = 0;
  while (target < output.length) {
    let runLength = requireByte(input, source++, canonicalPath, byteOffset, 'RLE5 run length');
    const packet = requireByte(input, source++, canonicalPath, byteOffset, 'RLE5 packet');
    let dataLength = packet & 0x7f;
    let color = 0;
    if ((packet & 0x80) !== 0) color = requireByte(input, source++, canonicalPath, byteOffset, 'RLE5 initial color');
    while (true) {
      const count = runLength + 1;
      if (count > output.length - target) invalid(canonicalPath, byteOffset + source, 'RLE5 run exceeds the declared sprite size.');
      output.fill(color, target, target + count);
      target += count;
      if (target === output.length) return output;
      if (dataLength-- === 0) break;
      const value = requireByte(input, source++, canonicalPath, byteOffset, 'RLE5 packed color');
      color = value & 0x1f;
      runLength = value >>> 5;
    }
  }
  return output;
}

export function decodeLz5(input: Uint8Array, expectedBytes: number, canonicalPath: string, byteOffset: number): Uint8Array {
  preflightCompressed(input, expectedBytes, canonicalPath, byteOffset, 'LZ5');
  const output = new Uint8Array(expectedBytes);
  let source = 0;
  let target = 0;
  let control = requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 control');
  let controlBit = 0;
  let recycledDistances = 0;
  let recycledBitCount = 0;
  while (target < output.length) {
    let value = requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 packet');
    if ((control & (1 << controlBit)) !== 0) {
      let distance: number;
      let length: number;
      if ((value & 0x3f) === 0) {
        distance = ((value << 2) | requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 long distance')) + 1;
        length = requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 long length') + 3;
      } else {
        recycledDistances |= ((value & 0xc0) >>> recycledBitCount);
        recycledBitCount += 2;
        length = (value & 0x3f) + 1;
        if (recycledBitCount < 8) {
          distance = requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 short distance') + 1;
        } else {
          distance = recycledDistances + 1;
          recycledDistances = 0;
          recycledBitCount = 0;
        }
      }
      if (distance > target || length > output.length - target) invalid(canonicalPath, byteOffset + source, 'LZ5 back-reference is outside the decoded prefix or sprite size.');
      for (let index = 0; index < length; index++) {
        output[target] = output[target - distance]!;
        target++;
      }
    } else {
      let length: number;
      if ((value & 0xe0) === 0) {
        length = requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 long RLE length') + 8;
      } else {
        length = value >>> 5;
        value &= 0x1f;
      }
      if (length > output.length - target) invalid(canonicalPath, byteOffset + source, 'LZ5 RLE packet exceeds the declared sprite size.');
      output.fill(value, target, target + length);
      target += length;
    }
    controlBit++;
    if (controlBit === 8 && target < output.length) {
      control = requireByte(input, source++, canonicalPath, byteOffset, 'LZ5 control');
      controlBit = 0;
    }
  }
  return output;
}

function preflightCompressed(input: Uint8Array, expectedBytes: number, canonicalPath: string, byteOffset: number, label: string): void {
  if (input.byteLength === 0 && expectedBytes > 0) invalid(canonicalPath, byteOffset, `${label} payload is empty.`);
  if (input.byteLength > MUGEN_LIMITS.sff.maxCompressedBlockBytes) {
    failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `${label} block exceeds the compressed byte budget.`, { canonicalPath, byteOffset }, { budget: 'maxCompressedBlockBytes', observed: input.byteLength, limit: MUGEN_LIMITS.sff.maxCompressedBlockBytes }));
  }
  const ratio = input.byteLength === 0 ? Number.POSITIVE_INFINITY : expectedBytes / input.byteLength;
  if (ratio > MUGEN_LIMITS.sff.maxDecompressionRatio) {
    failMugen(mugenDiagnostic('E_MUGEN_COMPRESSION_RATIO', 'decode', 'fatal', 'release-resource', `${label} block exceeds the decompression ratio budget.`, { canonicalPath, byteOffset }, { observed: ratio, limit: MUGEN_LIMITS.sff.maxDecompressionRatio }));
  }
}

function requireByte(input: Uint8Array, index: number, canonicalPath: string, byteOffset: number, label: string): number {
  if (index < 0 || index >= input.byteLength) invalid(canonicalPath, byteOffset + Math.max(0, index), `${label} is truncated.`);
  return input[index]!;
}

function invalid(canonicalPath: string, byteOffset: number, message: string): never {
  failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', message, { canonicalPath, byteOffset }));
}
