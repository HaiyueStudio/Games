import { MUGEN_LIMITS, type MugenSourceEncoding } from '../contract';
import { failMugen, mugenDiagnostic, MugenImportFailure, throwIfAborted, type MugenImportDiagnostic } from '../diagnostics';
import { sha256Hex, type MugenVfs, type MugenVfsFile } from '../vfs/MugenVfs';
import { asciiCaseFold, canonicalizeMugenPath, compareMugenStrings, resolveMugenReference, unquoteMugenValue } from '../vfs/path';
import { assignmentsInSection, parseMugenTextFile, type MugenAssignmentToken, type MugenTextDocument } from './MugenTextParser';

const UTF8 = new TextEncoder();

export type MugenEntryKind = 'character' | 'stage' | 'motif' | 'storyboard';
export type MugenResourceKind = 'def' | 'air' | 'cmd' | 'cns' | 'font' | 'sprite' | 'sound' | 'palette' | 'audio' | 'other';

export interface MugenDependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly section: string;
  readonly key: string;
  readonly byteOffset: number;
  readonly line: number;
  readonly column: number;
}

export interface MugenImportResource {
  readonly canonicalPath: string;
  readonly foldedPath: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly kind: MugenResourceKind;
  readonly document?: MugenTextDocument;
  read(): Uint8Array;
}

export interface MugenImportGraph {
  readonly entryDef: string;
  readonly entryKind: MugenEntryKind;
  readonly selectedEncoding: MugenSourceEncoding;
  readonly sourceSetSha256: string;
  readonly dependencyGraphSha256: string;
  readonly resources: readonly MugenImportResource[];
  readonly edges: readonly MugenDependencyEdge[];
  readonly diagnostics: readonly MugenImportDiagnostic[];
  readonly budgetUsage: Readonly<{
    files: number;
    rawBytes: number;
    dependencyEdges: number;
    dependencyDepth: number;
    textFiles: number;
    textBytes: number;
  }>;
}

export interface BuildMugenImportGraphOptions {
  readonly entryDef?: string;
  readonly entryKind?: MugenEntryKind;
  readonly encoding?: MugenSourceEncoding;
  readonly signal?: AbortSignal;
}

export async function buildMugenImportGraph(vfs: MugenVfs, options: BuildMugenImportGraphOptions = {}): Promise<MugenImportGraph> {
  throwIfAborted(options.signal);
  const entry = chooseEntryDef(vfs, options.entryDef);
  const selectedEncoding = options.encoding ?? 'windows-1252';
  const documents = new Map<string, MugenTextDocument>();
  const resources = new Map<string, MugenImportResource>();
  const edges: MugenDependencyEdge[] = [];
  const visiting: string[] = [];
  const visited = new Set<string>();
  let maxDepth = 0;
  let textBytes = 0;

  const visit = async (file: MugenVfsFile, depth: number, forceText = false): Promise<void> => {
    throwIfAborted(options.signal);
    if (depth > MUGEN_LIMITS.directoryAndArchive.maxDependencyDepth) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_LIMIT_EXCEEDED',
        'budget',
        'fatal',
        'release-resource',
        `MUGEN dependency depth exceeds the strict profile at ${file.canonicalPath}.`,
        { canonicalPath: file.canonicalPath },
        { budget: 'dependencyDepth', observed: depth, limit: MUGEN_LIMITS.directoryAndArchive.maxDependencyDepth },
      ));
    }
    maxDepth = Math.max(maxDepth, depth);
    if (visited.has(file.foldedPath)) return;
    const cycleIndex = visiting.indexOf(file.foldedPath);
    if (cycleIndex >= 0) {
      const cycle = [...visiting.slice(cycleIndex), file.foldedPath].join(' -> ');
      failMugen(mugenDiagnostic('E_MUGEN_DEPENDENCY_CYCLE', 'dependency', 'fatal', 'release-resource', `MUGEN dependency cycle: ${cycle}`, { canonicalPath: file.canonicalPath }));
    }
    visiting.push(file.foldedPath);
    const kind = resourceKind(file.canonicalPath);
    let document: MugenTextDocument | undefined;
    if (isTextResource(kind, file) || forceText) {
      textBytes = checkedBudgetAdd(textBytes, file.byteLength, 'textBytes', MUGEN_LIMITS.directoryAndArchive.maxRawBytes, file.canonicalPath);
      // The selected encoding is the fallback for BOM-less legacy files. A
      // UTF-8 BOM remains authoritative per file unless the caller explicitly
      // forced a conflicting encoding.
      document = parseMugenTextFile(file, options.encoding);
      documents.set(file.foldedPath, document);
    }
    resources.set(file.foldedPath, Object.freeze({
      canonicalPath: file.canonicalPath,
      foldedPath: file.foldedPath,
      sha256: file.sha256,
      byteLength: file.byteLength,
      kind,
      ...(document === undefined ? {} : { document }),
      read: () => file.read(),
    }));

    if (document !== undefined) {
      for (const reference of referencedFiles(document)) {
        if (edges.length >= MUGEN_LIMITS.directoryAndArchive.maxDependencyEdges) {
          failMugen(mugenDiagnostic(
            'E_MUGEN_LIMIT_EXCEEDED',
            'budget',
            'fatal',
            'release-resource',
            'MUGEN dependency graph has too many edges.',
            assignmentLocation(document, reference.assignment),
            { budget: 'dependencyEdges', observed: edges.length + 1, limit: MUGEN_LIMITS.directoryAndArchive.maxDependencyEdges },
          ));
        }
        const targetPath = resolveReferenceWithLocation(document, reference.assignment, reference.path);
        const target = vfs.get(targetPath);
        if (!target) {
          if (isEngineProvidedExternalReference(document, reference.assignment) || isOptionalStageAudioReference(options.entryKind, document, reference.assignment)) continue;
          failMugen(mugenDiagnostic(
            'E_MUGEN_DEPENDENCY_MISSING',
            'dependency',
            'error',
            'release-resource',
            `MUGEN dependency does not exist: ${targetPath}`,
            assignmentLocation(document, reference.assignment),
          ));
        }
        edges.push(Object.freeze({
          from: document.canonicalPath,
          to: target.canonicalPath,
          section: sectionName(document, reference.assignment),
          key: reference.assignment.key,
          byteOffset: reference.assignment.valueSpan.startByte,
          line: reference.assignment.valueSpan.line,
          column: reference.assignment.valueSpan.column,
        }));
        await visit(target, depth + 1, isStateScriptReference(document, reference.assignment));
      }
    }
    visiting.pop();
    visited.add(file.foldedPath);
  };

  await visit(entry, 0);
  const entryDocument = documents.get(entry.foldedPath)!;
  const detectedKind = detectEntryKind(entryDocument);
  if (options.entryKind !== undefined && options.entryKind !== detectedKind) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_OUT_OF_PROFILE',
      'classification',
      'error',
      'release-resource',
      `MUGEN entry kind ${detectedKind} does not match requested ${options.entryKind}.`,
      { canonicalPath: entry.canonicalPath },
    ));
  }
  const orderedResources = [...resources.values()].sort(resourceOrder);
  const orderedEdges = [...edges].sort(edgeOrder);
  const dependencyGraphSha256 = await sha256Hex(concatenate(orderedEdges.map(encodeDependencyEdge)));
  return Object.freeze({
    entryDef: entry.canonicalPath,
    entryKind: detectedKind,
    selectedEncoding,
    sourceSetSha256: vfs.sourceSetSha256,
    dependencyGraphSha256,
    resources: Object.freeze(orderedResources),
    edges: Object.freeze(orderedEdges),
    diagnostics: Object.freeze([]),
    budgetUsage: Object.freeze({
      files: vfs.files.length,
      rawBytes: vfs.totalRawBytes,
      dependencyEdges: edges.length,
      dependencyDepth: maxDepth,
      textFiles: documents.size,
      textBytes,
    }),
  });
}

export function discoverMugenEntryDefs(vfs: MugenVfs): readonly string[] {
  const candidates = vfs.files.filter(file => file.foldedPath.endsWith('.def'));
  const rootCandidates = candidates.filter(file => !file.canonicalPath.includes('/'));
  const selected = rootCandidates.length > 0 ? rootCandidates : candidates;
  return Object.freeze(selected.map(file => file.canonicalPath).sort((left, right) => compareMugenStrings(asciiCaseFold(left), asciiCaseFold(right)) || compareMugenStrings(left, right)));
}

function chooseEntryDef(vfs: MugenVfs, requested?: string): MugenVfsFile {
  if (requested !== undefined) {
    const canonicalPath = canonicalizeMugenPath(requested);
    if (!asciiCaseFold(canonicalPath).endsWith('.def')) {
      failMugen(mugenDiagnostic('E_MUGEN_ENTRY_NOT_FOUND', 'dependency', 'error', 'retry', `MUGEN entry must be a DEF file: ${canonicalPath}`, { canonicalPath }));
    }
    const file = vfs.get(canonicalPath);
    if (!file) failMugen(mugenDiagnostic('E_MUGEN_ENTRY_NOT_FOUND', 'dependency', 'error', 'retry', `MUGEN entry DEF does not exist: ${canonicalPath}`, { canonicalPath }));
    return file;
  }
  const candidates = discoverMugenEntryDefs(vfs);
  if (candidates.length === 0) failMugen(mugenDiagnostic('E_MUGEN_ENTRY_NOT_FOUND', 'dependency', 'error', 'retry', 'Selected MUGEN source has no entry DEF file.'));
  if (candidates.length !== 1) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_ENTRY_AMBIGUOUS',
      'dependency',
      'error',
      'retry',
      `Selected MUGEN source has multiple possible entry DEF files: ${candidates.join(', ')}`,
      {},
      { candidateCount: candidates.length },
    ));
  }
  return vfs.require(candidates[0]!);
}

function referencedFiles(document: MugenTextDocument): readonly { assignment: MugenAssignmentToken; path: string }[] {
  const result: Array<{ assignment: MugenAssignmentToken; path: string }> = [];
  for (const token of document.tokens) {
    if (token.kind !== 'assignment') continue;
    const section = sectionName(document, token);
    if (asciiCaseFold(section) === 'files' && !isKnownFilesKey(token.foldedKey)) {
      failMugen(mugenDiagnostic(
        'E_MUGEN_UNSUPPORTED_FEATURE',
        'classification',
        'error',
        'release-resource',
        `Unknown MUGEN [Files] key in strict profile: ${token.key}`,
        assignmentLocation(document, token),
      ));
    }
    const value = firstCommaSeparatedValue(token.value);
    if (value === '' || !isFileReference(section, token.foldedKey, value)) continue;
    result.push({ assignment: token, path: unquoteMugenValue(value) });
  }
  return result;
}

function isFileReference(section: string, key: string, value: string): boolean {
  if (asciiCaseFold(section) === 'files') return isKnownFilesKey(key);
  const extension = extensionOf(unquoteMugenValue(value));
  return (PATH_VALUE_KEYS.has(key) || /^font\d+$/.test(key)) && RESOURCE_EXTENSIONS.has(extension);
}

function isKnownFilesKey(key: string): boolean {
  return FILE_KEYS.has(key) || /^st\d+$/.test(key) || /^pal\d+$/.test(key) || /^font\d+$/.test(key);
}

function isEngineProvidedExternalReference(document: MugenTextDocument, assignment: MugenAssignmentToken): boolean {
  return asciiCaseFold(sectionName(document, assignment)) === 'files'
    && ENGINE_PROVIDED_FILE_KEYS.has(assignment.foldedKey);
}

function isOptionalStageAudioReference(entryKind: MugenEntryKind | undefined, document: MugenTextDocument, assignment: MugenAssignmentToken): boolean {
  return entryKind === 'stage' && asciiCaseFold(sectionName(document, assignment)) === 'music' && assignment.foldedKey === 'bgmusic';
}

function isStateScriptReference(document: MugenTextDocument, assignment: MugenAssignmentToken): boolean {
  if (asciiCaseFold(sectionName(document, assignment)) !== 'files') return false;
  return assignment.foldedKey === 'cmd' || assignment.foldedKey === 'cns' || assignment.foldedKey === 'st' || assignment.foldedKey === 'stcommon' || /^st\d+$/u.test(assignment.foldedKey);
}

function firstCommaSeparatedValue(value: string): string {
  let quote = '';
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (quote !== '') {
      if (character === quote && value[index - 1] !== '\\') quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ',') {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function resolveReferenceWithLocation(document: MugenTextDocument, assignment: MugenAssignmentToken, reference: string): string {
  try {
    return resolveMugenReference(document.canonicalPath, reference);
  } catch (error) {
    if (!(error instanceof MugenImportFailure)) throw error;
    const diagnostics = error.diagnostics.map(diagnostic => Object.freeze({
      ...diagnostic,
      ...assignmentLocation(document, assignment),
      section: sectionName(document, assignment),
      key: assignment.key,
    }));
    throw new MugenImportFailure(diagnostics);
  }
}

function detectEntryKind(document: MugenTextDocument): MugenEntryKind {
  const sections = new Set(document.sections.map(section => section.foldedName));
  if (sections.has('stagedef') || sections.has('camera') || sections.has('playerinfo')) return 'stage';
  if (sections.has('scenedef') || sections.has('scene 0')) return 'storyboard';
  const files = assignmentsInSection(document, 'Files');
  const fileKeys = new Set(files.map(token => token.foldedKey));
  if (fileKeys.has('cmd') || fileKeys.has('cns') || fileKeys.has('sprite') || fileKeys.has('anim')) return 'character';
  if (fileKeys.has('system') || fileKeys.has('fight') || fileKeys.has('select')) return 'motif';
  failMugen(mugenDiagnostic('E_MUGEN_OUT_OF_PROFILE', 'classification', 'error', 'release-resource', `Unable to classify MUGEN entry DEF: ${document.canonicalPath}`, { canonicalPath: document.canonicalPath }));
}

function assignmentLocation(document: MugenTextDocument, assignment: MugenAssignmentToken) {
  return {
    canonicalPath: document.canonicalPath,
    sourceSha256: document.sourceSha256,
    byteOffset: assignment.valueSpan.startByte,
    line: assignment.valueSpan.line,
    column: assignment.valueSpan.column,
    section: sectionName(document, assignment),
    key: assignment.key,
  } as const;
}

function sectionName(document: MugenTextDocument, assignment: MugenAssignmentToken): string {
  return assignment.sectionIndex === null ? '' : document.sections[assignment.sectionIndex]?.name ?? '';
}

function resourceKind(path: string): MugenResourceKind {
  switch (extensionOf(path)) {
    case '.def': return 'def';
    case '.air': return 'air';
    case '.cmd': return 'cmd';
    case '.cns': case '.st': return 'cns';
    case '.fnt': return 'font';
    case '.sff': return 'sprite';
    case '.snd': return 'sound';
    case '.act': return 'palette';
    case '.wav': case '.mp3': case '.ogg': case '.mid': case '.midi': return 'audio';
    default: return 'other';
  }
}

function isTextResource(kind: MugenResourceKind, file: MugenVfsFile): boolean {
  if (kind === 'font') {
    const header = file.read().subarray(0, 11);
    return new TextDecoder('ascii').decode(header) !== 'ElecbyteFnt';
  }
  return kind === 'def' || kind === 'air' || kind === 'cmd' || kind === 'cns';
}

function extensionOf(path: string): string {
  const clean = path.trim().replace(/\\/g, '/');
  const slash = clean.lastIndexOf('/');
  const dot = clean.lastIndexOf('.');
  return dot > slash ? asciiCaseFold(clean.slice(dot)) : '';
}

function checkedBudgetAdd(current: number, increment: number, budget: string, limit: number, canonicalPath: string): number {
  const result = current + increment;
  if (!Number.isSafeInteger(result) || result > limit) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_LIMIT_EXCEEDED',
      'budget',
      'fatal',
      'release-resource',
      `MUGEN import exceeds ${budget} budget.`,
      { canonicalPath },
      { budget, observed: result, limit },
    ));
  }
  return result;
}

function resourceOrder(left: MugenImportResource, right: MugenImportResource): number {
  return compareMugenStrings(left.foldedPath, right.foldedPath) || compareMugenStrings(left.canonicalPath, right.canonicalPath);
}

function edgeOrder(left: MugenDependencyEdge, right: MugenDependencyEdge): number {
  return compareMugenStrings(asciiCaseFold(left.from), asciiCaseFold(right.from))
    || left.byteOffset - right.byteOffset
    || compareMugenStrings(asciiCaseFold(left.to), asciiCaseFold(right.to));
}

function encodeDependencyEdge(edge: MugenDependencyEdge): Uint8Array {
  const strings = [edge.from, edge.to, edge.section, edge.key].map(value => UTF8.encode(value));
  const byteLength = strings.reduce((sum, value) => sum + 4 + value.byteLength, 8);
  const result = new Uint8Array(byteLength);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const value of strings) {
    view.setUint32(offset, value.byteLength, true);
    offset += 4;
    result.set(value, offset);
    offset += value.byteLength;
  }
  view.setBigUint64(offset, BigInt(edge.byteOffset), true);
  return result;
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

const FILE_KEYS = new Set([
  'ai', 'anim', 'cns', 'cmd', 'common', 'credits.storyboard', 'ending.storyboard', 'fight', 'font', 'gameover.storyboard',
  'intro.storyboard', 'logo.storyboard', 'select', 'sff', 'snd', 'sound', 'spr', 'sprite', 'st', 'stcommon', 'system',
]);
const ENGINE_PROVIDED_FILE_KEYS = new Set(['common', 'stcommon']);
const PATH_VALUE_KEYS = new Set(['bgmusic', 'font', 'spr', 'snd', 'storyboard']);
const RESOURCE_EXTENSIONS = new Set(['.act', '.air', '.cns', '.cmd', '.def', '.fnt', '.mid', '.midi', '.mp3', '.ogg', '.sff', '.snd', '.st', '.wav']);
