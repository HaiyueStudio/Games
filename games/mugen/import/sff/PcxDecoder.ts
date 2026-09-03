import { failMugen, mugenDiagnostic } from '../diagnostics';
import { checkedProduct, MugenBoundedBinaryReader } from './BinaryReader';

export interface DecodedPcx8 {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly pixelFormat: 'indexed8' | 'rgb8';
  readonly colorDepth: 8 | 24;
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
  if (manufacturer !== 10 || ![0, 2, 3, 5].includes(version) || ![0, 1].includes(encoding) || bitsPerPixel !== 8 || (planes !== 1 && planes !== 3)) {
    invalid(canonicalPath, blockOffset, `Unsupported PCX header (${manufacturer}/${version}/${encoding}/${bitsPerPixel}/${planes}).`);
  }
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (width <= 0 || height <= 0 || bytesPerLine < width) invalid(canonicalPath, blockOffset, 'PCX dimensions or bytes-per-line are invalid.');
  checkedProduct([width, height], canonicalPath, 'PCX pixel');
  // Several WinMUGEN tools disagree with the SFF palette-shared bit. Trust an
  // actual terminal PCX palette when present, and otherwise let the SFF layer
  // resolve an earlier or external ACT palette.
  const paletteMarker = !paletteShared && planes === 1 && block.byteLength >= 897 && block[block.byteLength - 769] === 0x0c
    ? block.byteLength - 769
    : -1;
  const dataEnd = paletteMarker >= 0 ? paletteMarker : block.byteLength;
  let source = 128;
  const pixels = new Uint8Array(width * height * planes);
  const scanlineLength = checkedProduct([bytesPerLine, planes], canonicalPath, 'PCX scanline');
  const scanline = new Uint8Array(scanlineLength);
  for (let y = 0; y < height; y++) {
    let scanlineOffset = 0;
    while (scanlineOffset < scanlineLength) {
      if (source >= dataEnd) invalid(canonicalPath, blockOffset + source, 'PCX image data is truncated.');
      let value = block[source++]!;
      let count = 1;
      if (encoding === 1 && (value & 0xc0) === 0xc0) {
        count = value & 0x3f;
        if (count === 0 || source >= dataEnd) invalid(canonicalPath, blockOffset + source - 1, 'PCX RLE packet is invalid or truncated.');
        value = block[source++]!;
      }
      if (count > scanlineLength - scanlineOffset) invalid(canonicalPath, blockOffset + source, 'PCX RLE packet crosses a scanline boundary.');
      scanline.fill(value, scanlineOffset, scanlineOffset + count);
      scanlineOffset += count;
    }
    if (planes === 1) {
      pixels.set(scanline.subarray(0, width), y * width);
    } else {
      for (let x = 0; x < width; x++) {
        const destination = (y * width + x) * 3;
        pixels[destination] = scanline[x]!;
        pixels[destination + 1] = scanline[bytesPerLine + x]!;
        pixels[destination + 2] = scanline[bytesPerLine * 2 + x]!;
      }
    }
  }
  let paletteRgba: Uint8Array | null = null;
  if (paletteMarker >= 0) {
    paletteRgba = new Uint8Array(256 * 4);
    const paletteOffset = paletteMarker + 1;
    for (let index = 0; index < 256; index++) {
      paletteRgba[index * 4] = block[paletteOffset + index * 3]!;
      paletteRgba[index * 4 + 1] = block[paletteOffset + index * 3 + 1]!;
      paletteRgba[index * 4 + 2] = block[paletteOffset + index * 3 + 2]!;
      paletteRgba[index * 4 + 3] = index === 0 ? 0 : 255;
    }
  }
  return Object.freeze({ width, height, pixels, pixelFormat: planes === 1 ? 'indexed8' : 'rgb8', colorDepth: planes === 1 ? 8 : 24, paletteRgba });
}

function invalid(canonicalPath: string, byteOffset: number, message: string): never {
  failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', message, { canonicalPath, byteOffset }));
}
