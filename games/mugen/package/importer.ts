import type { BuildMugenImportGraphOptions } from '../import/text/DependencyGraph';
import { buildMugenImportGraph } from '../import/text/DependencyGraph';
import type { MugenVfs } from '../import/vfs/MugenVfs';
import { createMugenImportReport, createMugenPackage, type MugenPackageContributions } from './builder';
import { encodeMugenPackage } from './codec';
import type { EncodedMugenPackage, HaiyueMugenPackage, MugenDeterministicImportReport } from './types';

export interface ImportMugenPackageOptions extends BuildMugenImportGraphOptions {
  readonly contentRole: 'formal-fixture' | 'local-content';
  readonly contributions?: MugenPackageContributions;
}

export interface ImportMugenPackageResult {
  readonly package: HaiyueMugenPackage;
  readonly encoded: EncodedMugenPackage;
  readonly report: MugenDeterministicImportReport;
}

export async function importMugenPackage(vfs: MugenVfs, options: ImportMugenPackageOptions): Promise<ImportMugenPackageResult> {
  const graph = await buildMugenImportGraph(vfs, options);
  const packageValue = createMugenPackage(graph, {
    contentRole: options.contentRole,
    ...(options.contributions === undefined ? {} : { contributions: options.contributions }),
  });
  const encoded = await encodeMugenPackage(packageValue);
  const report = createMugenImportReport(packageValue, encoded.packageSha256);
  return Object.freeze({ package: packageValue, encoded, report });
}
