import { importMugenActionContributions } from '../air/MugenActionPackage';
import { scanMugenViewerAudioCues, type MugenScannedViewerAudioCue } from '../audio/MugenViewerAudioCueScanner';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import { importMugenSpriteContributions } from '../sff/MugenSpritePackage';
import { importMugenSoundContributions } from '../snd/MugenSoundPackage';
import { compileMugenCharacterScripts } from '../script/MugenScriptPackage';
import { buildMugenImportGraph, type MugenImportGraph } from '../text/DependencyGraph';
import { assignmentsInSection } from '../text/MugenTextParser';
import type { MugenVfs } from '../vfs/MugenVfs';
import { compareMugenStrings, unquoteMugenValue } from '../vfs/path';
import { createMugenImportReport, createMugenPackage, type MugenPackageContributions } from '../../package/builder';
import { encodeMugenPackage } from '../../package/codec';
import type { EncodedMugenPackage, HaiyueMugenPackage, MugenDeterministicImportReport } from '../../package/types';
import type { MugenWorkerImportOptions } from './protocol';

export interface MugenCharacterMetadata {
  readonly name: string | null;
  readonly displayName: string | null;
  readonly author: string | null;
  readonly mugenVersion: string | null;
  readonly localCoord: readonly [number, number] | null;
  readonly entryDef: string;
  readonly dependencies: readonly string[];
}

export interface MugenCharacterImportResult {
  readonly package: HaiyueMugenPackage;
  readonly encoded: EncodedMugenPackage;
  readonly report: MugenDeterministicImportReport;
  readonly metadata: MugenCharacterMetadata;
  readonly viewerAudioCues: readonly MugenScannedViewerAudioCue[];
}

export async function importMugenCharacter(
  vfs: MugenVfs,
  options: Omit<MugenWorkerImportOptions, 'sourceKind'>,
  signal?: AbortSignal,
): Promise<MugenCharacterImportResult> {
  throwIfAborted(signal);
  if (options.scriptProfile !== undefined && options.scriptProfile !== 'none' && options.scriptProfile !== 'g08-minimal' && options.scriptProfile !== 'm09-native-common') failMugen(mugenDiagnostic('E_MUGEN_OUT_OF_PROFILE', 'classification', 'error', 'release-resource', `Unknown MUGEN executable script profile: ${String(options.scriptProfile)}.`));
  const graph = await buildMugenImportGraph(vfs, {
    ...(options.entryDef === undefined ? {} : { entryDef: options.entryDef }),
    entryKind: options.entryKind ?? 'character',
    ...(options.encoding === undefined ? {} : { encoding: options.encoding }),
    ...(signal === undefined ? {} : { signal }),
  });
  const viewerAudioCues = scanMugenViewerAudioCues(graph);
  const sprites = await importMugenSpriteContributions(graph, signal);
  throwIfAborted(signal);
  const actions = importMugenActionContributions(graph, {
    spriteBanks: sprites.banks,
    ...(signal === undefined ? {} : { signal }),
  });
  const sounds = await importMugenSoundContributions(graph, signal);
  const scripts = options.scriptProfile === 'g08-minimal' || options.scriptProfile === 'm09-native-common' ? compileMugenCharacterScripts(graph, options.scriptProfile).contributions : undefined;
  const contributions = mergeContributions(sprites.contributions, actions.contributions, sounds.contributions, ...(scripts === undefined ? [] : [scripts]));
  const packageValue = createMugenPackage(graph, { contentRole: options.contentRole, contributions });
  const encoded = await encodeMugenPackage(packageValue);
  const report = createMugenImportReport(packageValue, encoded.packageSha256);
  return Object.freeze({ package: packageValue, encoded, report, metadata: characterMetadata(graph), viewerAudioCues });
}

function mergeContributions(...values: readonly MugenPackageContributions[]): MugenPackageContributions {
  return Object.freeze({
    strings: merged(values, 'strings'),
    palettes: merged(values, 'palettes'),
    sprites: merged(values, 'sprites'),
    actions: merged(values, 'actions'),
    sounds: merged(values, 'sounds'),
    commands: merged(values, 'commands'),
    states: merged(values, 'states'),
    featureUsage: Object.freeze([...new Set(values.flatMap(value => value.featureUsage ?? []))].sort(compareMugenStrings)),
    diagnostics: Object.freeze(values.flatMap(value => value.diagnostics ?? [])),
  });
}

function merged<K extends 'strings' | 'palettes' | 'sprites' | 'actions' | 'sounds' | 'commands' | 'states'>(
  values: readonly MugenPackageContributions[],
  key: K,
): NonNullable<MugenPackageContributions[K]> {
  return Object.freeze(values.flatMap(value => value[key] ?? [])) as NonNullable<MugenPackageContributions[K]>;
}

function characterMetadata(graph: MugenImportGraph): MugenCharacterMetadata {
  const resource = graph.resources.find(value => value.canonicalPath === graph.entryDef);
  const document = resource?.document;
  const info = new Map<string, string>();
  if (document !== undefined) {
    for (const assignment of assignmentsInSection(document, 'Info')) info.set(assignment.foldedKey, unquoteMugenValue(assignment.value));
  }
  return Object.freeze({
    name: optionalText(info.get('name')),
    displayName: optionalText(info.get('displayname')),
    author: optionalText(info.get('author')),
    mugenVersion: optionalText(info.get('mugenversion')),
    localCoord: parseLocalCoord(info.get('localcoord')),
    entryDef: graph.entryDef,
    dependencies: Object.freeze(graph.resources.map(value => value.canonicalPath)),
  });
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

function parseLocalCoord(value: string | undefined): readonly [number, number] | null {
  if (value === undefined) return null;
  const fields = value.split(',').map(field => Number(field.trim()));
  if (fields.length < 2 || !Number.isFinite(fields[0]) || !Number.isFinite(fields[1]) || fields[0]! <= 0 || fields[1]! <= 0) return null;
  return Object.freeze([Math.fround(fields[0]!), Math.fround(fields[1]!)]) as readonly [number, number];
}
