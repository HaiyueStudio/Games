import { MUGEN_LIMITS } from '../contract';
import { isAbortError, mugenDiagnostic, MugenImportFailure } from '../diagnostics';
import { createMugenVfs, type MugenVfsInput } from '../vfs/MugenVfs';
import { createMugenVfsFromZip } from '../vfs/zip';
import { importMugenCharacter } from './MugenCharacterImport';
import {
  isMugenWorkerRequest,
  MUGEN_WORKER_CHUNK_BYTES,
  MUGEN_WORKER_PROTOCOL,
  MUGEN_WORKER_PROTOCOL_VERSION,
  type MugenWorkerAbortRequest,
  type MugenWorkerChunkRequest,
  type MugenWorkerCommitRequest,
  type MugenWorkerReply,
  type MugenWorkerStartRequest,
} from './protocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface PendingFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly symlink: boolean;
  received: number;
}

interface PendingImport {
  readonly requestId: number;
  readonly generation: number;
  readonly files: PendingFile[];
  readonly options: MugenWorkerStartRequest['options'];
  readonly abortController: AbortController;
  receivedBytes: number;
  totalBytes: number;
  lastProgressAt: number;
  lastProgressPhase: 'receive' | 'vfs' | 'parse' | 'package' | null;
}

const workerScope = self as unknown as WorkerScope;
const pending = new Map<string, PendingImport>();
let activeCommits = 0;

workerScope.onmessage = event => {
  void dispatch(event.data);
};

async function dispatch(value: unknown): Promise<void> {
  if (!isMugenWorkerRequest(value)) {
    postError(0, 0, [mugenDiagnostic('E_MUGEN_WORKER_PROTOCOL', 'worker', 'fatal', 'terminate-runtime', 'Invalid MUGEN Worker request.')]);
    return;
  }
  try {
    switch (value.kind) {
      case 'start': start(value); break;
      case 'chunk': chunk(value); break;
      case 'commit': await commit(value); break;
      case 'abort': abort(value); break;
    }
  } catch (error) {
    const key = requestKey(value.requestId, value.generation);
    pending.get(key)?.abortController.abort(error);
    pending.delete(key);
    if (isAbortError(error)) {
      post({ ...replyBase(value.requestId, value.generation), kind: 'aborted' });
      return;
    }
    postError(value.requestId, value.generation, error instanceof MugenImportFailure
      ? error.diagnostics
      : [mugenDiagnostic('E_MUGEN_WORKER_PROTOCOL', 'worker', 'fatal', 'terminate-runtime', error instanceof Error ? error.message : String(error))]);
  }
}

function start(request: MugenWorkerStartRequest): void {
  if (pending.size >= MUGEN_LIMITS.worker.maxQueuedRequests) throw protocolFailure('MUGEN Worker request queue is full.', 'E_MUGEN_WORKER_QUEUE', 'error', 'retry');
  if (request.files.length > MUGEN_LIMITS.directoryAndArchive.maxFiles) throw budgetFailure('files', request.files.length, MUGEN_LIMITS.directoryAndArchive.maxFiles);
  let totalBytes = 0;
  for (const file of request.files) {
    if (typeof file.path !== 'string' || !Number.isSafeInteger(file.byteLength) || file.byteLength < 0 || file.byteLength > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) {
      throw protocolFailure('MUGEN Worker file descriptor is invalid.');
    }
    totalBytes += file.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MUGEN_LIMITS.directoryAndArchive.maxRawBytes) throw budgetFailure('rawBytes', totalBytes, MUGEN_LIMITS.directoryAndArchive.maxRawBytes);
    if (typeof file.symlink !== 'boolean') throw protocolFailure('MUGEN Worker symlink descriptor is invalid.');
  }
  const queuedBytes = [...pending.values()].reduce((sum, item) => sum + item.totalBytes, 0);
  if (queuedBytes + totalBytes > MUGEN_LIMITS.directoryAndArchive.maxRawBytes) throw protocolFailure('MUGEN Worker aggregate queue bytes are full.', 'E_MUGEN_WORKER_QUEUE', 'error', 'retry');
  const files: PendingFile[] = request.files.map(file => ({ path: file.path, bytes: new Uint8Array(file.byteLength), symlink: file.symlink, received: 0 }));
  const key = requestKey(request.requestId, request.generation);
  if (pending.has(key)) throw protocolFailure('Duplicate MUGEN Worker start request.');
  pending.set(key, {
    requestId: request.requestId,
    generation: request.generation,
    files,
    options: request.options,
    abortController: new AbortController(),
    receivedBytes: 0,
    totalBytes,
    lastProgressAt: 0,
    lastProgressPhase: null,
  });
  postProgress(pending.get(key)!, 'receive', 0, totalBytes, true);
}

function chunk(request: MugenWorkerChunkRequest): void {
  const state = requirePending(request.requestId, request.generation);
  const file = state.files[request.fileIndex];
  if (!file || request.offset !== file.received || request.bytes.byteLength === 0 || request.bytes.byteLength > MUGEN_WORKER_CHUNK_BYTES || request.offset + request.bytes.byteLength > file.bytes.byteLength) {
    throw protocolFailure('MUGEN Worker chunk is out of order or outside its file.');
  }
  file.bytes.set(new Uint8Array(request.bytes), request.offset);
  file.received += request.bytes.byteLength;
  state.receivedBytes += request.bytes.byteLength;
  postProgress(state, 'receive', state.receivedBytes, state.totalBytes, state.receivedBytes === state.totalBytes);
}

async function commit(request: MugenWorkerCommitRequest): Promise<void> {
  if (activeCommits >= MUGEN_LIMITS.worker.maxInFlightRequests) throw protocolFailure('MUGEN Worker in-flight request budget is full.', 'E_MUGEN_WORKER_QUEUE', 'error', 'retry');
  const state = requirePending(request.requestId, request.generation);
  const key = requestKey(request.requestId, request.generation);
  if (state.files.some(file => file.received !== file.bytes.byteLength) || state.receivedBytes !== state.totalBytes) throw protocolFailure('MUGEN Worker commit arrived before all file bytes.');
  activeCommits++;
  try {
    postProgress(state, 'vfs', 0, 1, true);
    const inputs: MugenVfsInput[] = state.files.map(file => ({ path: file.path, bytes: file.bytes, symlink: file.symlink }));
    if (state.options.sourceKind === 'zip' && inputs.length !== 1) throw protocolFailure('ZIP import requires exactly one archive input.');
    const vfs = state.options.sourceKind === 'zip'
      ? await createMugenVfsFromZip(inputs[0]!.bytes, state.abortController.signal)
      : await createMugenVfs(inputs, state.abortController.signal);
    if (state.abortController.signal.aborted || pending.get(key) !== state) return;
    postProgress(state, 'parse', 0, 1, true);
    const result = await importMugenCharacter(vfs, state.options, state.abortController.signal);
    if (state.abortController.signal.aborted || pending.get(key) !== state) return;
    postProgress(state, 'package', 1, 1, true);
    const packageBytes = exactArrayBuffer(result.encoded.bytes);
    pending.delete(key);
    post({
      ...replyBase(request.requestId, request.generation),
      kind: 'result',
      packageBytes,
      packageSha256: result.encoded.packageSha256,
      report: result.report,
      metadata: result.metadata,
      viewerAudioCues: result.viewerAudioCues,
    }, [packageBytes]);
  } finally {
    activeCommits--;
  }
}

function abort(request: MugenWorkerAbortRequest): void {
  const key = requestKey(request.requestId, request.generation);
  const state = pending.get(key);
  if (state) {
    state.abortController.abort(new DOMException('The MUGEN import was aborted.', 'AbortError'));
    pending.delete(key);
  }
  post({ ...replyBase(request.requestId, request.generation), kind: 'aborted' });
}

function requirePending(requestId: number, generation: number): PendingImport {
  const state = pending.get(requestKey(requestId, generation));
  if (!state) throw protocolFailure('MUGEN Worker request does not have an active start record.');
  return state;
}

function postProgress(state: PendingImport, phase: 'receive' | 'vfs' | 'parse' | 'package', completed: number, total: number, force: boolean): void {
  const now = performance.now();
  if (!force && state.lastProgressPhase === phase && now - state.lastProgressAt < MUGEN_LIMITS.worker.progressMinimumIntervalMilliseconds) return;
  state.lastProgressAt = now;
  state.lastProgressPhase = phase;
  post({ ...replyBase(state.requestId, state.generation), kind: 'progress', phase, completed, total });
}

function postError(requestId: number, generation: number, diagnostics: readonly ReturnType<typeof mugenDiagnostic>[]): void {
  post({ ...replyBase(requestId, generation), kind: 'error', diagnostics });
}

function post(message: MugenWorkerReply, transfer?: Transferable[]): void {
  if (transfer === undefined) workerScope.postMessage(message);
  else workerScope.postMessage(message, transfer);
}

function replyBase(requestId: number, generation: number) {
  return { protocol: MUGEN_WORKER_PROTOCOL, version: MUGEN_WORKER_PROTOCOL_VERSION, requestId, generation } as const;
}

function requestKey(requestId: number, generation: number): string {
  return `${requestId}:${generation}`;
}

function protocolFailure(message: string, code: 'E_MUGEN_WORKER_PROTOCOL' | 'E_MUGEN_WORKER_QUEUE' = 'E_MUGEN_WORKER_PROTOCOL', severity: 'error' | 'fatal' = 'fatal', recovery: 'retry' | 'terminate-runtime' = 'terminate-runtime'): MugenImportFailure {
  return new MugenImportFailure([mugenDiagnostic(code, 'worker', severity, recovery, message)]);
}

function budgetFailure(budget: string, observed: number, limit: number): MugenImportFailure {
  return new MugenImportFailure([mugenDiagnostic(
    'E_MUGEN_LIMIT_EXCEEDED',
    'budget',
    'fatal',
    'release-resource',
    `MUGEN Worker request exceeds ${budget}.`,
    {},
    { budget, observed, limit },
  )]);
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = Uint8Array.from(bytes);
  return copy.buffer;
}
