import type { MugenSourceEncoding } from '../import/contract';
import type { MugenImportDiagnostic } from '../import/diagnostics';
import type { MugenEntryKind, MugenResourceKind } from '../import/text/DependencyGraph';

export type MugenCanonicalScalar = null | boolean | number | string;
export type MugenCanonicalValue = MugenCanonicalScalar | readonly MugenCanonicalValue[] | { readonly [key: string]: MugenCanonicalValue };

export interface MugenPackageResource {
  readonly path: number;
  readonly kind: MugenResourceKind;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly dependencies: readonly number[];
}

export interface MugenPackageTables {
  readonly strings: readonly string[];
  readonly resources: readonly MugenPackageResource[];
  readonly palettes: readonly MugenCanonicalValue[];
  readonly sprites: readonly MugenCanonicalValue[];
  readonly actions: readonly MugenCanonicalValue[];
  readonly sounds: readonly MugenCanonicalValue[];
  readonly commands: readonly MugenCanonicalValue[];
  readonly states: readonly MugenCanonicalValue[];
  readonly stage: MugenCanonicalValue;
  readonly motif: MugenCanonicalValue;
}

export interface HaiyueMugenPackage {
  readonly format: 'haiyue-mugen-package';
  readonly version: 1;
  readonly contractRevision: string;
  readonly profile: 'mugen-1.1b1-strict';
  readonly entryKind: MugenEntryKind;
  readonly entryDef: string;
  readonly selectedEncoding: MugenSourceEncoding;
  readonly sourceSetSha256: string;
  readonly dependencyGraphSha256: string;
  readonly featureUsage: readonly string[];
  readonly budgetUsage: Readonly<Record<string, number>>;
  readonly diagnostics: readonly MugenImportDiagnostic[];
  readonly provenance: Readonly<{
    sourceSetSha256: string;
    entryDef: string;
    selectedEncoding: MugenSourceEncoding;
    profile: 'mugen-1.1b1-strict';
    contractRevision: string;
    importerRevision: string;
    fixtureOrLocalContentRole: 'formal-fixture' | 'local-content';
  }>;
  readonly tables: MugenPackageTables;
}

export interface EncodedMugenPackage {
  readonly bytes: Uint8Array;
  readonly packageSha256: string;
}

export interface MugenDeterministicImportReport {
  readonly schemaVersion: 1;
  readonly evidenceRole: 'import-report';
  readonly contractRevision: string;
  readonly profile: 'mugen-1.1b1-strict';
  readonly entryDef: string;
  readonly selectedEncoding: MugenSourceEncoding;
  readonly sourceSetSha256: string;
  readonly dependencyGraphSha256: string;
  readonly packageSha256: string;
  readonly featureUsage: readonly string[];
  readonly budgetUsage: Readonly<Record<string, number>>;
  readonly diagnostics: readonly MugenImportDiagnostic[];
}
