import type { MugenImportDiagnostic } from '../diagnostics';

export interface MugenSndEntry {
  readonly sourceIndex: number;
  readonly group: number;
  readonly item: number;
  readonly byteOffset: number;
  readonly nextOffset: number;
  readonly encodedBytes: Uint8Array;
  readonly encodedSha256: string;
  readonly channels: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly frameLength: number;
  readonly durationSeconds: number;
  readonly selectedByKey: boolean;
}

export interface MugenSndBank {
  readonly canonicalPath: string;
  readonly sourceSha256: string;
  readonly version: readonly [number, number, number, number];
  readonly entries: readonly MugenSndEntry[];
  readonly diagnostics: readonly MugenImportDiagnostic[];
  readonly encodedBytes: number;
  readonly decodedPcmBytes: number;
  readonly aggregateDurationSeconds: number;
}
