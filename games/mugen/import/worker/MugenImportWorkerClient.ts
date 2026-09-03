import { MUGEN_LIMITS } from '../contract';
import { isAbortError, mugenDiagnostic, MugenImportFailure, throwIfAborted } from '../diagnostics';
import type { MugenVfsInput } from '../vfs/MugenVfs';
import {
  isMugenWorkerReply,
  MUGEN_WORKER_CHUNK_BYTES,
  MUGEN_WORKER_PROTOCOL,
  MUGEN_WORKER_PROTOCOL_VERSION,
  type MugenWorkerImportOptions,
  type MugenWorkerProgressReply,
  type MugenWorkerRequest,
  type MugenWorkerResultReply,
} from './protocol';

export interface MugenWorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  terminate?(): void;
}

export interface MugenWorkerImportResult {
  readonly packageBytes: Uint8Array;
  readonly packageSha256: string;
  readonly report: MugenWorkerResultReply['report'];
  readonly metadata: MugenWorkerResultReply['metadata'];
  readonly viewerAudioCues: MugenWorkerResultReply['viewerAudioCues'];
}

export interface MugenWorkerClientOptions {
  readonly onProgress?: (progress: MugenWorkerProgressReply) => void;
  readonly timeoutMilliseconds?: number;
  readonly terminateOnDispose?: boolean;
  readonly workerUrl?: string | URL;
}

interface ActiveRequest {
  readonly requestId: number;
  readonly generation: number;
  readonly reject: (reason: unknown) => void;
  readonly resolve: (result: MugenWorkerImportResult) => void;
  readonly abortCleanup: () => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export class MugenImportWorkerClient {
  readonly #worker: MugenWorkerPort;
  readonly #options: MugenWorkerClientOptions;
  readonly #onMessage: (event: MessageEvent<unknown>) => void;
  #requestSequence = 0;
  #generation = 0;
  #active: ActiveRequest | null = null;
  #disposed = false;

  constructor(worker: MugenWorkerPort, options: MugenWorkerClientOptions = {}) {
    this.#worker = worker;
    this.#options = options;
    this.#onMessage = event => this.#handleMessage(event.data);
    worker.addEventListener('message', this.#onMessage);
  }

  async import(inputs: readonly MugenVfsInput[], options: MugenWorkerImportOptions, signal?: AbortSignal): Promise<MugenWorkerImportResult> {
    if (this.#disposed) throw new Error('MugenImportWorkerClient is disposed.');
    throwIfAborted(signal);
    this.#cancelActive(new DOMException('Superseded by a newer MUGEN import.', 'AbortError'));
    const requestId = ++this.#requestSequence;
    const generation = ++this.#generation;
    const timeoutMilliseconds = this.#options.timeoutMilliseconds ?? MUGEN_LIMITS.worker.maxImportWallMilliseconds;
    const promise = new Promise<MugenWorkerImportResult>((resolve, reject) => {
      const onAbort = () => {
        this.#post({ ...base(requestId, generation), kind: 'abort' });
        this.#settleActive(new DOMException('The MUGEN import was aborted.', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const timeout = setTimeout(() => {
        this.#post({ ...base(requestId, generation), kind: 'abort' });
        this.#settleActive(new MugenImportFailure([mugenDiagnostic(
          'E_MUGEN_WORKER_TIMEOUT',
          'worker',
          'error',
          'retry',
          `MUGEN import exceeded ${timeoutMilliseconds} ms.`,
          {},
          { observed: timeoutMilliseconds, limit: timeoutMilliseconds },
        )]));
      }, timeoutMilliseconds);
      this.#active = {
        requestId,
        generation,
        resolve,
        reject,
        abortCleanup: () => signal?.removeEventListener('abort', onAbort),
        timeout,
      };
    });

    try {
      const descriptors = inputs.map(input => ({
        path: input.path,
        byteLength: input.bytes instanceof Uint8Array ? input.bytes.byteLength : input.bytes.byteLength,
        symlink: input.symlink === true,
      }));
      this.#post({ ...base(requestId, generation), kind: 'start', files: descriptors, options });
      for (let fileIndex = 0; fileIndex < inputs.length; fileIndex++) {
        throwIfAborted(signal);
        const input = inputs[fileIndex]!;
        const source = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
        for (let offset = 0; offset < source.byteLength; offset += MUGEN_WORKER_CHUNK_BYTES) {
          throwIfAborted(signal);
          const chunk = source.slice(offset, Math.min(source.byteLength, offset + MUGEN_WORKER_CHUNK_BYTES));
          const bytes = exactArrayBuffer(chunk);
          this.#post({ ...base(requestId, generation), kind: 'chunk', fileIndex, offset, bytes }, [bytes]);
        }
      }
      this.#post({ ...base(requestId, generation), kind: 'commit' });
    } catch (error) {
      this.#post({ ...base(requestId, generation), kind: 'abort' });
      this.#settleActive(error);
    }
    return promise;
  }

  importZip(source: Uint8Array | ArrayBuffer, options: Omit<MugenWorkerImportOptions, 'sourceKind'>, signal?: AbortSignal): Promise<MugenWorkerImportResult> {
    return this.import([{ path: 'selected-mugen-source.zip', bytes: source }], { ...options, sourceKind: 'zip' }, signal);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelActive(new DOMException('MugenImportWorkerClient was disposed.', 'AbortError'));
    this.#worker.removeEventListener('message', this.#onMessage);
    if (this.#options.terminateOnDispose) this.#worker.terminate?.();
  }

  #handleMessage(value: unknown): void {
    if (!isMugenWorkerReply(value)) {
      if (this.#active) this.#settleActive(new MugenImportFailure([mugenDiagnostic('E_MUGEN_WORKER_PROTOCOL', 'worker', 'fatal', 'terminate-runtime', 'MUGEN Worker returned an invalid message.') ]));
      return;
    }
    const active = this.#active;
    if (!active || value.requestId !== active.requestId || value.generation !== active.generation) return;
    if (value.kind === 'progress') {
      this.#options.onProgress?.(value);
      return;
    }
    if (value.kind === 'result') {
      const result = Object.freeze({
        packageBytes: new Uint8Array(value.packageBytes),
        packageSha256: value.packageSha256,
        report: value.report,
        metadata: value.metadata,
        viewerAudioCues: value.viewerAudioCues,
      });
      this.#settleActive(undefined, result);
    } else if (value.kind === 'error') {
      this.#settleActive(new MugenImportFailure(value.diagnostics));
    } else {
      this.#settleActive(new DOMException('The MUGEN import was aborted.', 'AbortError'));
    }
  }

  #cancelActive(reason: unknown): void {
    const active = this.#active;
    if (!active) return;
    this.#post({ ...base(active.requestId, active.generation), kind: 'abort' });
    this.#settleActive(reason);
  }

  #settleActive(error?: unknown, result?: MugenWorkerImportResult): void {
    const active = this.#active;
    if (!active) return;
    this.#active = null;
    clearTimeout(active.timeout);
    active.abortCleanup();
    if (error === undefined && result !== undefined) active.resolve(result);
    else active.reject(error ?? new Error('MUGEN Worker request settled without a result.'));
  }

  #post(message: MugenWorkerRequest, transfer?: Transferable[]): void {
    if (transfer === undefined) this.#worker.postMessage(message);
    else this.#worker.postMessage(message, transfer);
  }
}

export function createMugenImportWorkerClient(options: MugenWorkerClientOptions = {}): MugenImportWorkerClient {
  const worker = new Worker(options.workerUrl ?? new URL('./mugenImport.worker.js', import.meta.url), { type: 'module', name: 'haiyue-mugen-import' });
  return new MugenImportWorkerClient(worker, { ...options, terminateOnDispose: true });
}

function base(requestId: number, generation: number) {
  return { protocol: MUGEN_WORKER_PROTOCOL, version: MUGEN_WORKER_PROTOCOL_VERSION, requestId, generation } as const;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = Uint8Array.from(bytes);
  return copy.buffer;
}

export function isMugenWorkerAbort(error: unknown): boolean {
  return isAbortError(error);
}
