import { failMugen, mugenDiagnostic } from '../diagnostics';
import { checkedProduct, MugenBoundedBinaryReader } from './BinaryReader';

export interface DecodedPcx8 {
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array;
  readonly paletteRgba: Uint8Array | null;
}

export function decodePcx8(block: Uint8Array, canonicalPath: string, blockOffset: number, paletteShared: boolean): DecodedPcx8 {
  const reader = new MugenBoundedBinaryReader(block, canonicalPath);
  if (block.byteLength < 128) invalid(canonicalPath, blockOffset, 'PCX header is truncated.');
  const manufacturer = reader.u8();
  const version = reader.u8();
  const encoding = reader.u8();
  const bitsPerPixel = reader.u8();
  const xMin = reader.u16();
  const yMin = reader.u16();
  const xMax = reader.u16();
  const yMax = reader.u16();
  reader.seek(65);
  const planes = reader.u8();
  const bytesPerLine = reader.u16();
  if (manufacturer !== 10 || ![0, 2, 3, 5].includes(version) || ![0, 1].includes(encoding) || bitsPerPixel !== 8 || planes !== 1) {
    invalid(canonicalPath, blockOffset, `Unsupported PCX header (${manufacturer}/${version}/${encoding}/${bitsPerPixel}/${planes}).`);
  }
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (width <= 0 || height <= 0 || bytesPerLine < width) invalid(canonicalPath, blockOffset, 'PCX dimensions or bytes-per-line are invalid.');
  checkedProduct([width, height], canonicalPath, 'PCX pixel');
  let paletteMarker = -1;
  if (!paletteShared) {
    for (let offset = block.byteLength - 769; offset >= 128; offset--) {
      if (block[offset] === 0x0c) { paletteMarker = offset; break; }
    }
    if (paletteMarker < 0) invalid(canonicalPath, blockOffset, 'PCX 256-color palette marker is missing.');
  }
  const dataEnd = paletteShared ? block.byteLength : paletteMarker;
  let source = 128;
  const indices = new Uint8Array(width * height);
  const scanline = new Uint8Array(bytesPerLine);
  for (let y = 0; y < height; y++) {
    let scanlineOffset = 0;
    while (scanlineOffset < bytesPerLine) {
      if (source >= dataEnd) invalid(canonicalPath, blockOffset + source, 'PCX image data is truncated.');
      let value = block[source++]!;
      let count = 1;
      if (encoding === 1 && (value & 0xc0) === 0xc0) {
        count = value & 0x3f;
        if (count === 0 || source >= dataEnd) invalid(canonicalPath, blockOffset + source - 1, 'PCX RLE packet is invalid or truncated.');
        value = block[source++]!;
      }
      if (count > bytesPerLine - scanlineOffset) invalid(canonicalPath, blockOffset + source, 'PCX RLE packet crosses a scanline boundary.');
      scanline.fill(value, scanlineOffset, scanlineOffset + count);
      scanlineOffset += count;
    }
    indices.set(scanline.subarray(0, width), y * width);
  }
  let paletteRgba: Uint8Array | null = null;
  if (!paletteShared) {
    paletteRgba = new Uint8Array(256 * 4);
    const paletteOffset = paletteMarker + 1;
    for (let index = 0; index < 256; index++) {
      paletteRgba[index * 4] = block[paletteOffset + index * 3]!;
      paletteRgba[index * 4 + 1] = block[paletteOffset + index * 3 + 1]!;
      paletteRgba[index * 4 + 2] = block[paletteOffset + index * 3 + 2]!;
      paletteRgba[index * 4 + 3] = index === 0 ? 0 : 255;
    }
  }
  return Object.freeze({ width, height, indices, paletteRgba });
}

function invalid(canonicalPath: string, byteOffset: number, message: string): never {
  failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', message, { canonicalPath, byteOffset }));
}
