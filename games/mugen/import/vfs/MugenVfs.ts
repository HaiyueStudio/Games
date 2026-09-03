import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import { asciiCaseFold, canonicalizeMugenPath, compareMugenStrings, resolveMugenReference } from './path';

const UTF8 = new TextEncoder();

export interface MugenVfsInput {
  readonly path: string;
  readonly bytes: Uint8Array | ArrayBuffer;
  readonly symlink?: boolean;
}

export interface MugenVfsFile {
  readonly canonicalPath: string;
  readonly foldedPath: string;
  readonly byteLength: number;
  readonly sha256: string;
  read(): Uint8Array;
}

export class MugenVfs {
  readonly files: readonly MugenVfsFile[];
  readonly sourceSetSha256: string;
  readonly totalRawBytes: number;
  readonly #byFoldedPath: ReadonlyMap<string, MugenVfsFile>;

  constructor(files: readonly MugenVfsFile[], sourceSetSha256: string, totalRawBytes: number) {
    this.files = Object.freeze([...files]);
    this.sourceSetSha256 = sourceSetSha256;
    this.totalRawBytes = totalRawBytes;
    this.#byFoldedPath = new Map(files.map(file => [file.foldedPath, file]));
  }

  get(path: string): MugenVfsFile | undefined {
    return this.#byFoldedPath.get(asciiCaseFold(canonicalizeMugenPath(path)));
  }

  require(path: string): MugenVfsFile {
    const canonicalPath = canonicalizeMugenPath(path);
    const file = this.#byFoldedPath.get(asciiCaseFold(canonicalPath));
    if (!file) {
      failMugen(mugenDiagnostic('E_MUGEN_DEPENDENCY_MISSING', 'dependency', 'error', 'release-resource', `MUGEN dependency does not exist: ${canonicalPath}`, { canonicalPath }));
    }
    return file;
  }

  resolve(fromCanonicalPath: string, reference: string): MugenVfsFile {
    return this.require(resolveMugenReference(fromCanonicalPath, reference));
  }
}

export async function createMugenVfs(inputs: readonly MugenVfsInput[], signal?: AbortSignal): Promise<MugenVfs> {
  throwIfAborted(signal);
  if (inputs.length > MUGEN_LIMITS.directoryAndArchive.maxFiles) {
    failBudget('files', inputs.length, MUGEN_LIMITS.directoryAndArchive.maxFiles);
  }

  let totalRawBytes = 0;
  const entries: Array<{ canonicalPath: string; foldedPath: string; bytes: Uint8Array; sha256: string }> = [];
  const sourcePathByFoldedPath = new Map<string, string>();
  for (const input of inputs) {
    throwIfAborted(signal);
    if (input.symlink) {
      failMugen(mugenDiagnostic('E_MUGEN_PATH_SYMLINK', 'vfs', 'fatal', 'release-resource', `Symbolic links are forbidden in a MUGEN source set: ${input.path}`));
    }
    const canonicalPath = canonicalizeMugenPath(input.path);
    const foldedPath = asciiCaseFold(canonicalPath);
    const collidedPath = sourcePathByFoldedPath.get(foldedPath);
    if (collidedPath !== undefined) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_PATH_CASE_COLLISION',
        'vfs',
        'fatal',
        'release-resource',
        `MUGEN source paths collide under ASCII case folding: ${collidedPath} and ${canonicalPath}`,
        { canonicalPath },
      ));
    }
    sourcePathByFoldedPath.set(foldedPath, canonicalPath);

    const sourceBytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    if (sourceBytes.byteLength > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) {
      failBudget('singleFileBytes', sourceBytes.byteLength, MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes, canonicalPath);
    }
    totalRawBytes = checkedAdd(totalRawBytes, sourceBytes.byteLength, 'rawBytes', MUGEN_LIMITS.directoryAndArchive.maxRawBytes);
    const bytes = sourceBytes.slice();
    entries.push({ canonicalPath, foldedPath, bytes, sha256: await sha256Hex(bytes) });
  }

  entries.sort((left, right) => compareMugenStrings(left.foldedPath, right.foldedPath) || compareMugenStrings(left.canonicalPath, right.canonicalPath));
  const sourceSetRecords = entries.map(entry => {
    const pathBytes = UTF8.encode(entry.canonicalPath);
    const record = new Uint8Array(4 + pathBytes.byteLength + 8 + 32);
    const view = new DataView(record.buffer);
    view.setUint32(0, pathBytes.byteLength, true);
    record.set(pathBytes, 4);
    view.setBigUint64(4 + pathBytes.byteLength, BigInt(entry.bytes.byteLength), true);
    record.set(hexToBytes(entry.sha256), 12 + pathBytes.byteLength);
    return record;
  });
  const sourceSetSha256 = await sha256Hex(concatenate(sourceSetRecords));
  const files = entries.map(entry => Object.freeze({
    canonicalPath: entry.canonicalPath,
    foldedPath: entry.foldedPath,
    byteLength: entry.bytes.byteLength,
    sha256: entry.sha256,
    read: () => entry.bytes.slice(),
  }));
  return new MugenVfs(files, sourceSetSha256, totalRawBytes);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const source = new Uint8Array(bytes.byteLength);
  source.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', source.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function checkedAdd(current: number, increment: number, budget: string, limit: number): number {
  const result = current + increment;
  if (!Number.isSafeInteger(result) || result > limit) failBudget(budget, result, limit);
  return result;
}

function failBudget(budget: string, observed: number, limit: number, canonicalPath?: string): never {
  failMugen(mugenDiagnostic(
    'E_MUGEN_LIMIT_EXCEEDED',
    'budget',
    'fatal',
    'release-resource',
    `MUGEN source exceeds ${budget} budget (${observed} > ${limit}).`,
    canonicalPath === undefined ? {} : { canonicalPath },
    { budget, observed, limit },
  ));
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function concatenate(values: readonly Uint8Array[]): Uint8Array {
  const byteLength = values.reduce((sum, value) => sum + value.byteLength, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}
