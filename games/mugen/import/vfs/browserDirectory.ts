import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import { createMugenVfs, type MugenVfs, type MugenVfsInput } from './MugenVfs';
import { canonicalizeMugenPath, compareMugenStrings } from './path';

type BrowserFileWithRelativePath = File & { readonly webkitRelativePath?: string };

export async function createMugenVfsFromFileList(files: FileList | readonly File[], signal?: AbortSignal): Promise<MugenVfs> {
  return createMugenVfs(await collectMugenInputsFromFileList(files, signal), signal);
}

export async function collectMugenInputsFromFileList(files: FileList | readonly File[], signal?: AbortSignal): Promise<readonly MugenVfsInput[]> {
  const sourceFiles = Array.from(files) as BrowserFileWithRelativePath[];
  if (sourceFiles.length > MUGEN_LIMITS.directoryAndArchive.maxFiles) failFileBudget('files', sourceFiles.length, MUGEN_LIMITS.directoryAndArchive.maxFiles);
  const rawPaths = sourceFiles.map(file => file.webkitRelativePath || file.name);
  const rootPrefix = commonDirectoryPickerRoot(rawPaths);
  const inputs: MugenVfsInput[] = [];
  let totalBytes = 0;
  for (let index = 0; index < sourceFiles.length; index++) {
    throwIfAborted(signal);
    const file = sourceFiles[index];
    const rawPath = rawPaths[index];
    if (!file || rawPath === undefined) continue;
    const path = rootPrefix !== '' && rawPath.replace(/\\/g, '/').startsWith(rootPrefix)
      ? rawPath.replace(/\\/g, '/').slice(rootPrefix.length)
      : rawPath;
    canonicalizeMugenPath(path);
    if (file.size > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) failFileBudget('singleFileBytes', file.size, MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes, path);
    totalBytes = checkedFileBytes(totalBytes, file.size, path);
    inputs.push({ path, bytes: await file.arrayBuffer() });
  }
  return Object.freeze(inputs);
}

export async function createMugenVfsFromDirectoryHandle(handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<MugenVfs> {
  return createMugenVfs(await collectMugenInputsFromDirectoryHandle(handle, signal), signal);
}

export async function collectMugenInputsFromDirectoryHandle(handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<readonly MugenVfsInput[]> {
  const inputs: MugenVfsInput[] = [];
  const totals = { bytes: 0 };
  await collectDirectory(handle, '', inputs, totals, signal);
  return Object.freeze(inputs);
}

async function collectDirectory(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  inputs: MugenVfsInput[],
  totals: { bytes: number },
  signal?: AbortSignal,
): Promise<void> {
  const entries: FileSystemHandle[] = [];
  const iterableDirectory = directory as FileSystemDirectoryHandle & {
    values(): AsyncIterableIterator<FileSystemHandle>;
  };
  for await (const entry of iterableDirectory.values()) entries.push(entry);
  entries.sort((left, right) => compareMugenStrings(left.name, right.name));
  for (const entry of entries) {
    throwIfAborted(signal);
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    canonicalizeMugenPath(path);
    if (entry.kind === 'directory') {
      await collectDirectory(entry as FileSystemDirectoryHandle, path, inputs, totals, signal);
      continue;
    }
    if (inputs.length >= MUGEN_LIMITS.directoryAndArchive.maxFiles) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_LIMIT_EXCEEDED',
        'budget',
        'fatal',
        'release-resource',
        'Selected MUGEN directory contains too many files.',
        {},
        { budget: 'files', observed: inputs.length + 1, limit: MUGEN_LIMITS.directoryAndArchive.maxFiles },
      ));
    }
    const file = await (entry as FileSystemFileHandle).getFile();
    if (file.size > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) failFileBudget('singleFileBytes', file.size, MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes, path);
    totals.bytes = checkedFileBytes(totals.bytes, file.size, path);
    inputs.push({ path, bytes: await file.arrayBuffer() });
  }
}

function checkedFileBytes(current: number, increment: number, path: string): number {
  const result = current + increment;
  if (!Number.isSafeInteger(result) || result > MUGEN_LIMITS.directoryAndArchive.maxRawBytes) {
    failFileBudget('rawBytes', result, MUGEN_LIMITS.directoryAndArchive.maxRawBytes, path);
  }
  return result;
}

function failFileBudget(budget: string, observed: number, limit: number, canonicalPath?: string): never {
  failMugen(mugenDiagnostic(
    'E_MUGEN_LIMIT_EXCEEDED',
    'budget',
    'fatal',
    'release-resource',
    `Selected MUGEN directory exceeds ${budget}.`,
    canonicalPath === undefined ? {} : { canonicalPath },
    { budget, observed, limit },
  ));
}

function commonDirectoryPickerRoot(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  const normalized = paths.map(path => path.replace(/\\/g, '/'));
  const firstSeparator = normalized[0]?.indexOf('/') ?? -1;
  if (firstSeparator <= 0) return '';
  const prefix = normalized[0]!.slice(0, firstSeparator + 1);
  return normalized.every(path => path.startsWith(prefix)) ? prefix : '';
}
