import type { MugenPackageContributions } from '../../package/builder';
import type { MugenCanonicalValue } from '../../package/types';
import { parseMugenCommandDocument } from '../cmd/CmdParser';
import type { MugenCommandProgram } from '../cmd/types';
import { parseMugenStateDocuments } from '../cns/CnsParser';
import type { MugenStateProgram } from '../cns/types';
import { failMugen, mugenDiagnostic } from '../diagnostics';
import type { MugenImportGraph } from '../text/DependencyGraph';
import { asciiCaseFold } from '../vfs/path';

export interface MugenCompiledCharacterScripts {
  readonly commands: MugenCommandProgram;
  readonly states: MugenStateProgram;
  readonly contributions: MugenPackageContributions;
}

export function compileMugenCharacterScripts(graph: MugenImportGraph, profile: 'g08-minimal' | 'm09-native-common' = 'g08-minimal'): MugenCompiledCharacterScripts {
  const commandDocuments = graph.resources.filter(resource => resource.kind === 'cmd' && resource.document !== undefined).map(resource => resource.document!);
  if (commandDocuments.length !== 1) failMugen(mugenDiagnostic('E_MUGEN_CMD_SYNTAX', 'cmd', 'error', 'release-resource', `Executable MUGEN script profile requires exactly one CMD document; received ${commandDocuments.length}.`));
  const stateResourcePaths = new Set(graph.edges.filter(edge => asciiCaseFold(edge.section) === 'files' && isStateFileKey(asciiCaseFold(edge.key))).map(edge => asciiCaseFold(edge.to)));
  const stateDocuments = graph.resources.filter(resource => resource.document !== undefined && (resource.kind === 'cmd' || stateResourcePaths.has(resource.foldedPath))).map(resource => resource.document!);
  const commands = parseMugenCommandDocument(commandDocuments[0]!);
  const commonStatePaths = new Set(graph.edges.filter(edge => edge.section.toLowerCase() === 'files' && edge.key.toLowerCase() === 'stcommon').map(edge => edge.to));
  const states = parseMugenStateDocuments(stateDocuments, { commonStatePaths });
  const contributions = Object.freeze({
    commands: Object.freeze([commands as unknown as MugenCanonicalValue]),
    states: Object.freeze([states as unknown as MugenCanonicalValue]),
    featureUsage: Object.freeze(profile === 'm09-native-common'
      ? ['m09.cmd.native-common-v1', 'm09.cns.character-common-override-v1', 'm09.expression.bytecode-v1', 'm09.vm.typed-no-eval-v1']
      : ['g08.cmd.basic-v1', 'g08.cns.minimal-v1', 'g08.vm.typed-no-eval-v1', 'm09.expression.bytecode-v1']),
  });
  return Object.freeze({ commands, states, contributions });
}

function isStateFileKey(key: string): boolean { return key === 'cns' || key === 'st' || key === 'stcommon' || /^st\d+$/u.test(key); }
