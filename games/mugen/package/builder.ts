import { MUGEN_CONTRACT_REVISION, MUGEN_IMPORTER_REVISION, MUGEN_PROFILE } from '../import/contract';
import { failMugen, mugenDiagnostic, type MugenImportDiagnostic } from '../import/diagnostics';
import type { MugenDependencyEdge, MugenImportGraph } from '../import/text/DependencyGraph';
import { compareMugenStrings } from '../import/vfs/path';
import type {
  HaiyueMugenPackage,
  MugenCanonicalValue,
  MugenDeterministicImportReport,
  MugenPackageResource,
  MugenPackageTables,
} from './types';

export interface MugenPackageContributions {
  readonly strings?: readonly string[];
  readonly palettes?: readonly MugenCanonicalValue[];
  readonly sprites?: readonly MugenCanonicalValue[];
  readonly actions?: readonly MugenCanonicalValue[];
  readonly sounds?: readonly MugenCanonicalValue[];
  readonly commands?: readonly MugenCanonicalValue[];
  readonly states?: readonly MugenCanonicalValue[];
  readonly stage?: MugenCanonicalValue;
  readonly motif?: MugenCanonicalValue;
  readonly featureUsage?: readonly string[];
  readonly diagnostics?: readonly MugenImportDiagnostic[];
}

export interface CreateMugenPackageOptions {
  readonly contentRole: 'formal-fixture' | 'local-content';
  readonly contributions?: MugenPackageContributions;
}

export function createMugenPackage(graph: MugenImportGraph, options: CreateMugenPackageOptions): HaiyueMugenPackage {
  const contributions = options.contributions ?? {};
  const strings = canonicalStrings([
    ...graph.resources.map(resource => resource.canonicalPath),
    ...(contributions.strings ?? []),
  ]);
  const stringIndex = new Map(strings.map((value, index) => [value, index]));
  const edgesBySource = new Map<string, MugenDependencyEdge[]>();
  for (const edge of graph.edges) {
    const list = edgesBySource.get(edge.from) ?? [];
    list.push(edge);
    edgesBySource.set(edge.from, list);
  }
  const resources: MugenPackageResource[] = graph.resources.map(resource => {
    const path = stringIndex.get(resource.canonicalPath);
    if (path === undefined) throw new Error(`Missing canonical string for ${resource.canonicalPath}.`);
    const dependencies = [...new Set((edgesBySource.get(resource.canonicalPath) ?? []).map(edge => {
      const dependencyPath = stringIndex.get(edge.to);
      if (dependencyPath === undefined) throw new Error(`Missing canonical dependency string for ${edge.to}.`);
      return dependencyPath;
    }))].sort((left, right) => left - right);
    return Object.freeze({
      path,
      kind: resource.kind,
      contentSha256: resource.sha256,
      byteLength: resource.byteLength,
      dependencies: Object.freeze(dependencies),
    });
  });
  const diagnostics = sortDiagnostics([...graph.diagnostics, ...(contributions.diagnostics ?? [])]);
  const featureUsage = Object.freeze([...new Set([
    'g02.vfs.canonical-paths',
    'g02.text.loss-aware-parser',
    'g02.dependencies.graph-v1',
    'g02.package.wire-v1',
    ...(contributions.featureUsage ?? []),
  ])].sort(compareMugenStrings));
  const tables: MugenPackageTables = Object.freeze({
    strings,
    resources: Object.freeze(resources),
    palettes: frozenValues(contributions.palettes),
    sprites: frozenValues(contributions.sprites),
    actions: frozenValues(contributions.actions),
    sounds: frozenValues(contributions.sounds),
    commands: frozenValues(contributions.commands),
    states: frozenValues(contributions.states),
    stage: freezeContribution(contributions.stage ?? null),
    motif: freezeContribution(contributions.motif ?? null),
  });
  const budgetUsage = Object.freeze({ ...graph.budgetUsage });
  return Object.freeze({
    format: 'haiyue-mugen-package',
    version: 1,
    contractRevision: MUGEN_CONTRACT_REVISION,
    profile: MUGEN_PROFILE,
    entryKind: graph.entryKind,
    entryDef: graph.entryDef,
    selectedEncoding: graph.selectedEncoding,
    sourceSetSha256: graph.sourceSetSha256,
    dependencyGraphSha256: graph.dependencyGraphSha256,
    featureUsage,
    budgetUsage,
    diagnostics,
    provenance: Object.freeze({
      sourceSetSha256: graph.sourceSetSha256,
      entryDef: graph.entryDef,
      selectedEncoding: graph.selectedEncoding,
      profile: MUGEN_PROFILE,
      contractRevision: MUGEN_CONTRACT_REVISION,
      importerRevision: MUGEN_IMPORTER_REVISION,
      fixtureOrLocalContentRole: options.contentRole,
    }),
    tables,
  });
}

export function createMugenImportReport(packageValue: HaiyueMugenPackage, packageSha256: string): MugenDeterministicImportReport {
  return Object.freeze({
    schemaVersion: 1,
    evidenceRole: 'import-report',
    contractRevision: packageValue.contractRevision,
    profile: packageValue.profile,
    entryDef: packageValue.entryDef,
    selectedEncoding: packageValue.selectedEncoding,
    sourceSetSha256: packageValue.sourceSetSha256,
    dependencyGraphSha256: packageValue.dependencyGraphSha256,
    packageSha256,
    featureUsage: packageValue.featureUsage,
    budgetUsage: packageValue.budgetUsage,
    diagnostics: packageValue.diagnostics,
  });
}

function canonicalStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareMugenStrings));
}

function frozenValues(values?: readonly MugenCanonicalValue[]): readonly MugenCanonicalValue[] {
  return Object.freeze((values ?? []).map(value => freezeContribution(value)));
}

function sortDiagnostics(values: readonly MugenImportDiagnostic[]): readonly MugenImportDiagnostic[] {
  return Object.freeze(values.map(value => Object.freeze({
    ...value,
    ...(value.details === undefined ? {} : { details: Object.freeze({ ...value.details }) }),
  })).sort((left, right) => compareMugenStrings(left.canonicalPath ?? '', right.canonicalPath ?? '')
    || (left.byteOffset ?? -1) - (right.byteOffset ?? -1)
    || compareMugenStrings(left.phase, right.phase)
    || compareMugenStrings(left.code, right.code)
    || compareMugenStrings(left.message, right.message)));
}

function freezeCanonicalValue<T extends MugenCanonicalValue>(value: T, ancestors = new Set<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('MUGEN package contribution cannot contain a cycle.');
  ancestors.add(value);
  let frozen: MugenCanonicalValue;
  if (Array.isArray(value)) {
    frozen = Object.freeze(value.map(item => freezeCanonicalValue(item, ancestors)));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('MUGEN package contribution must use plain records.');
    const record = value as { readonly [key: string]: MugenCanonicalValue };
    const result: Record<string, MugenCanonicalValue> = {};
    for (const key of Object.keys(record).sort(compareMugenStrings)) result[key] = freezeCanonicalValue(record[key]!, ancestors);
    frozen = Object.freeze(result);
  }
  ancestors.delete(value);
  return frozen as T;
}

function freezeContribution<T extends MugenCanonicalValue>(value: T): T {
  try {
    return freezeCanonicalValue(value);
  } catch (error) {
    failMugen(mugenDiagnostic(
      'E_MUGEN_PACKAGE_VERSION',
      'package',
      'error',
      'release-resource',
      `MUGEN package contribution is invalid: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }
}
