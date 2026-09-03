import type { MugenPackageContributions } from '../../package/builder';
import type { MugenCanonicalValue } from '../../package/types';
import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import type { MugenImportGraph, MugenImportResource } from '../text/DependencyGraph';
import { compareMugenStrings } from '../vfs/path';
import { encodeBase64 } from '../sff/MugenSpritePackage';
import { parseMugenSnd } from './SndParser';
import type { MugenSndBank, MugenSndEntry } from './types';

export interface MugenSoundImportResult { readonly banks: readonly MugenSndBank[]; readonly contributions: MugenPackageContributions; readonly encodedBytes: number; readonly decodedPcmBytes: number; readonly aggregateDurationSeconds: number; }

export async function importMugenSoundContributions(graph: MugenImportGraph, signal?: AbortSignal): Promise<MugenSoundImportResult> {
  const resources = graph.resources.filter(resource => resource.kind === 'sound').sort(resourceOrder); if (resources.length > MUGEN_LIMITS.snd.maxSndFilesPerPackage) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', 'MUGEN package contains too many SND files.', {}, { budget: 'maxSndFilesPerPackage', observed: resources.length, limit: MUGEN_LIMITS.snd.maxSndFilesPerPackage }));
  const banks: MugenSndBank[] = []; let encodedBytes = 0; let decodedPcmBytes = 0; let aggregateDurationSeconds = 0;
  for (const resource of resources) { throwIfAborted(signal); const bank = await parseMugenSnd(resource, signal); banks.push(bank); encodedBytes = sum(encodedBytes, bank.encodedBytes, MUGEN_LIMITS.snd.maxEncodedAudioBytesPerPackage, 'maxEncodedAudioBytesPerPackage'); decodedPcmBytes = sum(decodedPcmBytes, bank.decodedPcmBytes, MUGEN_LIMITS.snd.maxDecodedPcmBytesPerPackage, 'maxDecodedPcmBytesPerPackage'); aggregateDurationSeconds += bank.aggregateDurationSeconds; if (aggregateDurationSeconds > MUGEN_LIMITS.snd.maxAggregateDurationSeconds) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', 'MUGEN package audio duration exceeds maxAggregateDurationSeconds.', {}, { budget: 'maxAggregateDurationSeconds', observed: aggregateDurationSeconds, limit: MUGEN_LIMITS.snd.maxAggregateDurationSeconds })); }
  const sounds = banks.flatMap(bank => bank.entries.map(entry => soundValue(bank, entry))).sort((left, right) => compareMugenStrings(String((left as Record<string, MugenCanonicalValue>).id), String((right as Record<string, MugenCanonicalValue>).id)));
  const versions = banks.map(bank => bank.version.join('.'));
  const versionFeatures = [
    ...(versions.includes('4.0.0.0') ? ['g06.snd.elecbyte-v4'] : []),
    ...(versions.includes('1.0.1.0') ? ['g06.snd.elecbyte-v1.0.1.0'] : []),
    ...(versions.includes('0.1.0.1') ? ['g06.snd.fighter-factory-v0.1.0.1'] : []),
  ];
  return Object.freeze({ banks: Object.freeze(banks), contributions: Object.freeze({ sounds: Object.freeze(sounds), featureUsage: Object.freeze(sounds.length === 0 ? [] : [...versionFeatures, 'g06.snd.wav-pcm', 'g06.snd.duplicate-last-wins']) }), encodedBytes, decodedPcmBytes, aggregateDurationSeconds });
}

export function soundId(path: string, sourceIndex: number): string { return `${path}#sound:${sourceIndex}`; }
function soundValue(bank: MugenSndBank, entry: MugenSndEntry): MugenCanonicalValue { return Object.freeze({ id: soundId(bank.canonicalPath, entry.sourceIndex), kind: 'snd-wav-v1', sourcePath: bank.canonicalPath, sourceIndex: entry.sourceIndex, group: entry.group, item: entry.item, selectedByKey: entry.selectedByKey, codec: 'wav', mediaType: 'audio/wav', encodedSha256: entry.encodedSha256, encodedBase64: encodeBase64(entry.encodedBytes), channels: entry.channels, sampleRate: entry.sampleRate, bitsPerSample: entry.bitsPerSample, frameLength: entry.frameLength, durationSeconds: Math.fround(entry.durationSeconds) }); }
function resourceOrder(left: MugenImportResource, right: MugenImportResource): number { return compareMugenStrings(left.canonicalPath, right.canonicalPath); }
function sum(current: number, value: number, limit: number, budget: string): number { const total = current + value; if (!Number.isSafeInteger(total) || total > limit) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `MUGEN SND exceeds ${budget}.`, {}, { budget, observed: total, limit })); return total; }
