import { MUGEN_LIMITS, type MugenSourceEncoding } from '../contract';
import type { MugenImportDiagnostic } from '../diagnostics';
import type { MugenEntryKind } from '../text/DependencyGraph';
import type { MugenDeterministicImportReport } from '../../package/types';
import type { MugenCharacterMetadata } from './MugenCharacterImport';
import type { MugenScannedViewerAudioCue } from '../audio/MugenViewerAudioCueScanner';

export const MUGEN_WORKER_PROTOCOL = 'haiyue-mugen-import' as const;
export const MUGEN_WORKER_PROTOCOL_VERSION = MUGEN_LIMITS.worker.protocolVersion;
export const MUGEN_WORKER_CHUNK_BYTES = 16 * 1024 * 1024;

export interface MugenWorkerImportOptions {
  readonly sourceKind?: 'directory' | 'zip';
  readonly entryDef?: string;
  readonly entryKind?: MugenEntryKind;
  readonly encoding?: MugenSourceEncoding;
  readonly contentRole: 'formal-fixture' | 'local-content';
  readonly scriptProfile?: 'none' | 'g08-minimal' | 'm09-native-common';
  readonly assetProfile?: 'full' | 'selection-preview';
}

export interface MugenWorkerFileDescriptor {
  readonly path: string;
  readonly byteLength: number;
  readonly symlink: boolean;
}

interface MugenWorkerRequestBase {
  readonly protocol: typeof MUGEN_WORKER_PROTOCOL;
  readonly version: typeof MUGEN_WORKER_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly generation: number;
}

export interface MugenWorkerStartRequest extends MugenWorkerRequestBase {
  readonly kind: 'start';
  readonly files: readonly MugenWorkerFileDescriptor[];
  readonly options: MugenWorkerImportOptions;
}

export interface MugenWorkerChunkRequest extends MugenWorkerRequestBase {
  readonly kind: 'chunk';
  readonly fileIndex: number;
  readonly offset: number;
  readonly bytes: ArrayBuffer;
}

export interface MugenWorkerCommitRequest extends MugenWorkerRequestBase {
  readonly kind: 'commit';
}

export interface MugenWorkerAbortRequest extends MugenWorkerRequestBase {
  readonly kind: 'abort';
}

export type MugenWorkerRequest = MugenWorkerStartRequest | MugenWorkerChunkRequest | MugenWorkerCommitRequest | MugenWorkerAbortRequest;

type MugenWorkerReplyBase = MugenWorkerRequestBase;

export interface MugenWorkerProgressReply extends MugenWorkerReplyBase {
  readonly kind: 'progress';
  readonly phase: 'receive' | 'vfs' | 'parse' | 'package';
  readonly completed: number;
  readonly total: number;
}

export interface MugenWorkerResultReply extends MugenWorkerReplyBase {
  readonly kind: 'result';
  readonly packageBytes: ArrayBuffer;
  readonly packageSha256: string;
  readonly report: MugenDeterministicImportReport;
  readonly metadata: MugenCharacterMetadata;
  readonly viewerAudioCues: readonly MugenScannedViewerAudioCue[];
}

export interface MugenWorkerErrorReply extends MugenWorkerReplyBase {
  readonly kind: 'error';
  readonly diagnostics: readonly MugenImportDiagnostic[];
}

export interface MugenWorkerAbortedReply extends MugenWorkerReplyBase {
  readonly kind: 'aborted';
}

export type MugenWorkerReply = MugenWorkerProgressReply | MugenWorkerResultReply | MugenWorkerErrorReply | MugenWorkerAbortedReply;

export function isMugenWorkerReply(value: unknown): value is MugenWorkerReply {
  if (!isRecord(value)
    || value.protocol !== MUGEN_WORKER_PROTOCOL
    || value.version !== MUGEN_WORKER_PROTOCOL_VERSION
    || !Number.isSafeInteger(value.requestId)
    || !Number.isSafeInteger(value.generation)
    || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'progress':
      return ['receive', 'vfs', 'parse', 'package'].includes(String(value.phase))
        && Number.isSafeInteger(value.completed)
        && Number.isSafeInteger(value.total);
    case 'result':
      return value.packageBytes instanceof ArrayBuffer
        && typeof value.packageSha256 === 'string'
        && isRecord(value.report)
        && isRecord(value.metadata)
        && Array.isArray(value.viewerAudioCues)
        && value.viewerAudioCues.every(isViewerAudioCue);
    case 'error': return Array.isArray(value.diagnostics);
    case 'aborted': return true;
    default: return false;
  }
}

export function isMugenWorkerRequest(value: unknown): value is MugenWorkerRequest {
  if (!isRecord(value)
    || value.protocol !== MUGEN_WORKER_PROTOCOL
    || value.version !== MUGEN_WORKER_PROTOCOL_VERSION
    || !Number.isSafeInteger(value.requestId)
    || !Number.isSafeInteger(value.generation)
    || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'start': return Array.isArray(value.files) && isWorkerImportOptions(value.options);
    case 'chunk': return Number.isSafeInteger(value.fileIndex) && Number.isSafeInteger(value.offset) && value.bytes instanceof ArrayBuffer;
    case 'commit': case 'abort': return true;
    default: return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isViewerAudioCue(value: unknown): value is MugenScannedViewerAudioCue {
  if (!isRecord(value) || !Number.isSafeInteger(value.actionNumber) || !Number.isSafeInteger(value.group) || !Number.isSafeInteger(value.item)
    || !Number.isSafeInteger(value.channel) || typeof value.volume !== 'number' || !Number.isFinite(value.volume)
    || typeof value.pan !== 'number' || !Number.isFinite(value.pan) || typeof value.frequency !== 'number' || !Number.isFinite(value.frequency)
    || typeof value.loop !== 'boolean' || typeof value.sourcePath !== 'string' || !Number.isSafeInteger(value.sourceLine)
    || !isRecord(value.timing) || (value.timing.kind !== 'tick' && value.timing.kind !== 'element') || !Number.isSafeInteger(value.timing.value)) return false;
  return true;
}

function isWorkerImportOptions(value: unknown): value is MugenWorkerImportOptions {
  if (!isRecord(value) || (value.contentRole !== 'formal-fixture' && value.contentRole !== 'local-content')) return false;
  if (value.sourceKind !== undefined && value.sourceKind !== 'directory' && value.sourceKind !== 'zip') return false;
  if (value.entryDef !== undefined && typeof value.entryDef !== 'string') return false;
  if (value.entryKind !== undefined && !['character', 'stage', 'motif', 'storyboard'].includes(String(value.entryKind))) return false;
  if (value.encoding !== undefined && !['utf-8', 'windows-1252', 'shift_jis', 'gbk', 'big5', 'euc-kr'].includes(String(value.encoding))) return false;
  if (value.assetProfile !== undefined && value.assetProfile !== 'full' && value.assetProfile !== 'selection-preview') return false;
  return value.scriptProfile === undefined || value.scriptProfile === 'none' || value.scriptProfile === 'g08-minimal' || value.scriptProfile === 'm09-native-common';
}
