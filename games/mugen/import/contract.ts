export const MUGEN_CONTRACT_REVISION = 'm08-g01-2026-08-30.2' as const;
export const MUGEN_PROFILE = 'mugen-1.1b1-strict' as const;
export const MUGEN_IMPORTER_REVISION = 'm08-g02-importer-v1' as const;

export const MUGEN_LIMITS = Object.freeze({
  directoryAndArchive: Object.freeze({
    maxFiles: 4_096,
    maxPathUtf8Bytes: 512,
    maxPathSegments: 32,
    maxDependencyDepth: 32,
    maxDependencyEdges: 32_768,
    maxRawBytes: 536_870_912,
    maxSingleFileBytes: 268_435_456,
    maxArchiveExpandedBytes: 536_870_912,
    maxArchiveCompressionRatio: 100,
    maxArchiveEntryBytes: 268_435_456,
    maxConcurrentFileReads: 4,
  }),
  text: Object.freeze({
    maxTextFileBytes: 16_777_216,
    maxLineBytes: 1_048_576,
    maxSectionsPerFile: 65_536,
    maxKeysPerFile: 1_048_576,
    maxTokensPerFile: 4_194_304,
    maxQuotedStringBytes: 1_048_576,
    maxDiagnosticCount: 10_000,
  }),
  sff: Object.freeze({
    maxSffFilesPerPackage: 16,
    maxSpritesPerFile: 65_536,
    maxPalettesPerFile: 4_096,
    maxSpriteDimension: 8_192,
    maxSpritePixels: 16_777_216,
    maxDecodedIndexBytesPerSprite: 16_777_216,
    maxDecodedColorBytesPerSprite: 67_108_864,
    maxDecodedSpriteBytesPerPackage: 536_870_912,
    maxDecodedPaletteBytesPerPackage: 16_777_216,
    maxLinkedSpriteDepth: 64,
    maxLinkedPaletteDepth: 64,
    maxCompressedBlockBytes: 268_435_456,
    maxDecompressionRatio: 200,
  }),
  air: Object.freeze({
    maxActions: 16_384,
    maxElementsPerAction: 4_096,
    maxElementsPerPackage: 262_144,
    maxCollisionBoxesPerElement: 256,
    maxCollisionBoxesPerPackage: 1_048_576,
    maxInterpolationDirectivesPerElement: 4,
    maxAbsoluteOffset: 1_048_576,
    // Legacy characters use +/-9,999,999 as a practical all-stage collision
    // sentinel. Keep element offsets tightly bounded, but accept collision
    // coordinates through the exactly representable float32 integer range.
    maxAbsoluteCollisionCoordinate: 16_777_216,
    maxAbsoluteScale: 1_024,
    maxAbsoluteAngleDegrees: 1_000_000,
    maxFiniteElementTicks: 2_147_483_647,
  }),
  snd: Object.freeze({
    maxSndFilesPerPackage: 16,
    maxEntriesPerFile: 4_096,
    maxEncodedAudioBytesPerPackage: 268_435_456,
    maxDecodedPcmBytesPerPackage: 536_870_912,
    maxChannelsPerEntry: 2,
    maxSampleRate: 192_000,
    maxDurationSecondsPerEntry: 600,
    maxAggregateDurationSeconds: 3_600,
  }),
  compilerAndVm: Object.freeze({
    maxExpressionDepth: 128,
    maxStringBytes: 16_777_216,
    maxInstructionsPerExpression: 4_096,
    maxStackDepth: 256,
    maxFunctionArguments: 32,
    maxFuelPerEvaluation: 16_384,
    maxCallDepth: 16,
    maxRedirectionsPerExpression: 32,
    maxStateReentriesPerTick: 64,
    maxTriggerTraceEntriesPerTick: 65_536,
  }),
  worker: Object.freeze({
    protocolVersion: 1,
    maxWorkersPerImport: 2,
    maxQueuedRequests: 8,
    maxInFlightRequests: 2,
    // Large Fighter Factory characters can legitimately encode to more than
    // 64 MiB after sprites and sounds enter the deterministic viewer package.
    // Keep the Worker transfer bounded at 256 MiB, below the 512 MiB decoded
    // asset budgets enforced by the SFF and SND parsers.
    maxMessageBytes: 268_435_456,
    maxImportWallMilliseconds: 120_000,
    progressMinimumIntervalMilliseconds: 50,
    abortAcknowledgementMilliseconds: 1_000,
  }),
});

export type MugenSourceEncoding = 'utf-8' | 'windows-1252' | 'shift_jis' | 'gbk' | 'big5' | 'euc-kr';

export const MUGEN_EXPLICIT_ENCODINGS: readonly MugenSourceEncoding[] = Object.freeze([
  'windows-1252',
  'shift_jis',
  'gbk',
  'big5',
  'euc-kr',
]);
