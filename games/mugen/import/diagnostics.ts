import { MUGEN_PROFILE } from './contract';

export type MugenDiagnosticSeverity = 'info' | 'warning' | 'error' | 'fatal';
export type MugenDiagnosticRecovery = 'ignore' | 'retry' | 'release-resource' | 'terminate-runtime';
export type MugenDiagnosticPhase =
  | 'vfs'
  | 'dependency'
  | 'text-decode'
  | 'text-parse'
  | 'binary-parse'
  | 'budget'
  | 'decode'
  | 'classification'
  | 'sff'
  | 'air'
  | 'cmd'
  | 'cns'
  | 'compiler'
  | 'runtime'
  | 'snd'
  | 'audio-decode'
  | 'worker'
  | 'gpu'
  | 'package'
  | 'evidence';

export const MUGEN_DIAGNOSTIC_CATALOG = Object.freeze({
  E_MUGEN_PATH_ABSOLUTE: ['vfs', 'fatal', 'release-resource'],
  E_MUGEN_PATH_TRAVERSAL: ['vfs', 'fatal', 'release-resource'],
  E_MUGEN_PATH_UNC_OR_DRIVE: ['vfs', 'fatal', 'release-resource'],
  E_MUGEN_PATH_REMOTE_REFERENCE: ['vfs', 'fatal', 'release-resource'],
  E_MUGEN_PATH_SYMLINK: ['vfs', 'fatal', 'release-resource'],
  E_MUGEN_PATH_CASE_COLLISION: ['vfs', 'fatal', 'release-resource'],
  E_MUGEN_ENTRY_NOT_FOUND: ['dependency', 'error', 'retry'],
  E_MUGEN_ENTRY_AMBIGUOUS: ['dependency', 'error', 'retry'],
  E_MUGEN_DEPENDENCY_MISSING: ['dependency', 'error', 'release-resource'],
  E_MUGEN_DEPENDENCY_CYCLE: ['dependency', 'fatal', 'release-resource'],
  E_MUGEN_ENCODING_UNSUPPORTED: ['text-decode', 'error', 'retry'],
  E_MUGEN_ENCODING_INVALID_SEQUENCE: ['text-decode', 'error', 'retry'],
  E_MUGEN_TEXT_SYNTAX: ['text-parse', 'error', 'release-resource'],
  E_MUGEN_FORMAT_SIGNATURE: ['binary-parse', 'fatal', 'release-resource'],
  E_MUGEN_FORMAT_VERSION: ['binary-parse', 'error', 'release-resource'],
  E_MUGEN_TRUNCATED: ['binary-parse', 'fatal', 'release-resource'],
  E_MUGEN_OFFSET_RANGE: ['binary-parse', 'fatal', 'release-resource'],
  E_MUGEN_INTEGER_OVERFLOW: ['binary-parse', 'fatal', 'release-resource'],
  E_MUGEN_LIMIT_EXCEEDED: ['budget', 'fatal', 'release-resource'],
  E_MUGEN_COMPRESSION_RATIO: ['decode', 'fatal', 'release-resource'],
  E_MUGEN_DECODE_INVALID: ['decode', 'error', 'release-resource'],
  E_MUGEN_LINK_CYCLE: ['decode', 'fatal', 'release-resource'],
  E_MUGEN_UNSUPPORTED_FEATURE: ['classification', 'error', 'release-resource'],
  E_MUGEN_OUT_OF_PROFILE: ['classification', 'error', 'release-resource'],
  E_MUGEN_SFF_SPRITE_DUPLICATE: ['sff', 'warning', 'ignore'],
  E_MUGEN_SFF_PALETTE_MISSING: ['sff', 'error', 'release-resource'],
  E_MUGEN_SFF_COMPRESSION_UNSUPPORTED: ['sff', 'error', 'release-resource'],
  E_MUGEN_AIR_ACTION_DUPLICATE: ['air', 'warning', 'ignore'],
  E_MUGEN_AIR_ACTION_EMPTY: ['air', 'warning', 'ignore'],
  E_MUGEN_AIR_ANNOTATION_IGNORED: ['air', 'warning', 'ignore'],
  E_MUGEN_AIR_TIMING_RECOVERED: ['air', 'warning', 'ignore'],
  E_MUGEN_AIR_ELEMENT_INVALID: ['air', 'error', 'release-resource'],
  E_MUGEN_AIR_DURATION_INVALID: ['air', 'error', 'release-resource'],
  E_MUGEN_AIR_SPRITE_MISSING: ['air', 'warning', 'ignore'],
  E_MUGEN_AIR_CLSN_COUNT: ['air', 'error', 'release-resource'],
  E_MUGEN_CMD_SYNTAX: ['cmd', 'error', 'release-resource'],
  E_MUGEN_CNS_SYNTAX: ['cns', 'error', 'release-resource'],
  E_MUGEN_EXPRESSION_DEPTH: ['compiler', 'fatal', 'release-resource'],
  E_MUGEN_EXPRESSION_TYPE: ['compiler', 'error', 'release-resource'],
  E_MUGEN_VM_BUDGET: ['runtime', 'fatal', 'terminate-runtime'],
  E_MUGEN_ENTITY_BUDGET: ['runtime', 'fatal', 'terminate-runtime'],
  E_MUGEN_SND_ENTRY_INVALID: ['snd', 'error', 'release-resource'],
  E_MUGEN_AUDIO_DECODE: ['audio-decode', 'error', 'release-resource'],
  E_MUGEN_WORKER_PROTOCOL: ['worker', 'fatal', 'terminate-runtime'],
  E_MUGEN_WORKER_QUEUE: ['worker', 'error', 'retry'],
  E_MUGEN_WORKER_TIMEOUT: ['worker', 'error', 'retry'],
  I_MUGEN_WORKER_STALE_REPLY: ['worker', 'info', 'ignore'],
  E_MUGEN_GPU_CAPABILITY: ['gpu', 'error', 'release-resource'],
  E_MUGEN_GPU_BUDGET: ['gpu', 'fatal', 'release-resource'],
  E_MUGEN_PACKAGE_VERSION: ['package', 'error', 'release-resource'],
  E_MUGEN_PACKAGE_HASH: ['package', 'fatal', 'release-resource'],
  E_MUGEN_DETERMINISM_MISMATCH: ['evidence', 'fatal', 'terminate-runtime'],
  E_MUGEN_ORACLE_IDENTITY: ['evidence', 'fatal', 'terminate-runtime'],
  E_MUGEN_LICENSE_INELIGIBLE: ['evidence', 'fatal', 'release-resource'],
  E_MUGEN_EVIDENCE_PROVENANCE: ['evidence', 'fatal', 'release-resource'],
} as const satisfies Readonly<Record<string, readonly [MugenDiagnosticPhase, MugenDiagnosticSeverity, MugenDiagnosticRecovery]>>);

export type MugenDiagnosticCode = keyof typeof MUGEN_DIAGNOSTIC_CATALOG;

export interface MugenSourceLocation {
  readonly canonicalPath?: string;
  readonly sourceSha256?: string;
  readonly byteOffset?: number;
  readonly line?: number;
  readonly column?: number;
  readonly section?: string;
  readonly key?: string;
  readonly group?: number;
  readonly item?: number;
}

export interface MugenImportDiagnostic extends MugenSourceLocation {
  readonly code: MugenDiagnosticCode;
  readonly severity: MugenDiagnosticSeverity;
  readonly profile: typeof MUGEN_PROFILE;
  readonly phase: MugenDiagnosticPhase;
  readonly message: string;
  readonly recovery: MugenDiagnosticRecovery;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export class MugenImportFailure extends Error {
  readonly name = 'MugenImportFailure';
  readonly diagnostics: readonly MugenImportDiagnostic[];

  constructor(diagnostics: readonly MugenImportDiagnostic[]) {
    super(diagnostics.map(item => `${item.code}: ${item.message}`).join('\n'));
    this.diagnostics = diagnostics;
  }
}

export function mugenDiagnostic(
  code: MugenDiagnosticCode,
  phase: MugenDiagnosticPhase,
  severity: MugenDiagnosticSeverity,
  recovery: MugenDiagnosticRecovery,
  message: string,
  location: MugenSourceLocation = {},
  details?: Readonly<Record<string, string | number | boolean>>,
): MugenImportDiagnostic {
  const contract = MUGEN_DIAGNOSTIC_CATALOG[code];
  if (contract[0] !== phase || contract[1] !== severity || contract[2] !== recovery) {
    throw new TypeError(`MUGEN diagnostic ${code} does not match its frozen phase/severity/recovery contract.`);
  }
  return Object.freeze({
    code,
    severity,
    profile: MUGEN_PROFILE,
    phase,
    message,
    recovery,
    ...location,
    ...(details === undefined ? {} : { details: Object.freeze({ ...details }) }),
  });
}

export function failMugen(diagnostic: MugenImportDiagnostic): never {
  throw new MugenImportFailure([diagnostic]);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The MUGEN import was aborted.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
