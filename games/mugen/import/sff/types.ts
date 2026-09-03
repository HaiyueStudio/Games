import type { MugenImportDiagnostic } from '../diagnostics';

export type MugenSffVersion = '1.0' | '2.0' | '2.01';
export type MugenSpritePixelFormat = 'indexed8' | 'rgb8' | 'rgba8';
export type MugenSpriteCompression = 'pcx' | 'raw-indexed' | 'raw-rgb24' | 'raw-rgba32' | 'rle8' | 'rle5' | 'lz5' | 'png8' | 'png24' | 'png32' | 'linked';

export interface MugenDecodedPalette {
  readonly sourceIndex: number;
  readonly group: number;
  readonly item: number;
  readonly colorCount: number;
  readonly rgba: Uint8Array;
  readonly linkedToSourceIndex: number | null;
  readonly source: 'sff-v1' | 'sff-v2' | 'act';
}

export interface MugenDecodedSprite {
  readonly sourceIndex: number;
  readonly group: number;
  readonly item: number;
  readonly width: number;
  readonly height: number;
  readonly axisX: number;
  readonly axisY: number;
  readonly colorDepth: 5 | 8 | 24 | 32;
  readonly pixelFormat: MugenSpritePixelFormat;
  readonly compression: MugenSpriteCompression;
  readonly pixels: Uint8Array | null;
  readonly linkedToSourceIndex: number | null;
  readonly paletteSourceIndex: number | null;
}

export interface MugenSffBank {
  readonly canonicalPath: string;
  readonly sourceSha256: string;
  readonly version: MugenSffVersion;
  readonly sprites: readonly MugenDecodedSprite[];
  readonly palettes: readonly MugenDecodedPalette[];
  readonly diagnostics: readonly MugenImportDiagnostic[];
  readonly decodedSpriteBytes: number;
  readonly decodedPaletteBytes: number;
}
