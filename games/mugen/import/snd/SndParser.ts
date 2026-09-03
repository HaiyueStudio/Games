import { MUGEN_LIMITS } from '../contract';
import { failMugen, mugenDiagnostic, throwIfAborted } from '../diagnostics';
import type { MugenImportResource } from '../text/DependencyGraph';
import { sha256Hex } from '../vfs/MugenVfs';
import type { MugenSndBank, MugenSndEntry } from './types';

const SIGNATURE = Object.freeze([0x45, 0x6c, 0x65, 0x63, 0x62, 0x79, 0x74, 0x65, 0x53, 0x6e, 0x64, 0x00]);
const HEADER_BYTES = 24; const ENTRY_HEADER_BYTES = 16;

export async function parseMugenSnd(resource: MugenImportResource, signal?: AbortSignal): Promise<MugenSndBank> {
  throwIfAborted(signal); const bytes = resource.read(); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const location = { canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256 };
  if (bytes.byteLength < HEADER_BYTES) fail('MUGEN SND header is truncated.', 0);
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) fail('MUGEN SND signature is invalid.', 0);
  const version = Object.freeze([bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!]) as readonly [number, number, number, number];
  const versionKey = version.join('.');
  // WinMUGEN-era authoring tools commonly emit 1.0.1.0. Fighter Factory
  // Ultimate also writes the byte-reordered 0.1.0.1 variant. MUGEN loads
  // both with the same linked RIFF/WAVE record layout as 4.0.0.0.
  if (versionKey !== '4.0.0.0' && versionKey !== '1.0.1.0' && versionKey !== '0.1.0.1') fail('MUGEN SND version is unsupported.', 12);
  const count = view.getUint32(16, true); const firstOffset = view.getUint32(20, true);
  if (count > MUGEN_LIMITS.snd.maxEntriesPerFile) limit('maxEntriesPerFile', count, MUGEN_LIMITS.snd.maxEntriesPerFile);
  if ((count === 0) !== (firstOffset === 0)) fail('MUGEN SND count and first subheader offset disagree.', 16);
  const mutable: Array<Omit<MugenSndEntry, 'selectedByKey'>> = []; const visited = new Set<number>(); let offset = firstOffset; let encodedBytes = 0; let decodedPcmBytes = 0; let aggregateDurationSeconds = 0;
  for (let index = 0; index < count; index++) {
    throwIfAborted(signal); if (offset < HEADER_BYTES || offset + ENTRY_HEADER_BYTES > bytes.byteLength) fail('MUGEN SND subheader offset is out of range.', offset);
    if (visited.has(offset)) fail('MUGEN SND subheader chain contains a cycle.', offset); visited.add(offset);
    const nextOffset = view.getUint32(offset, true); const length = view.getUint32(offset + 4, true); const group = view.getInt32(offset + 8, true); const item = view.getInt32(offset + 12, true); const payloadOffset = offset + ENTRY_HEADER_BYTES;
    if (length < 44 || payloadOffset + length > bytes.byteLength || payloadOffset + length < payloadOffset) fail('MUGEN SND WAV payload range is invalid.', offset + 4);
    const payload = bytes.slice(payloadOffset, payloadOffset + length); const wave = parseWave(payload, resource, payloadOffset);
    encodedBytes = add(encodedBytes, length, MUGEN_LIMITS.snd.maxEncodedAudioBytesPerPackage, 'maxEncodedAudioBytesPerPackage'); decodedPcmBytes = add(decodedPcmBytes, wave.frameLength * wave.channels * 4, MUGEN_LIMITS.snd.maxDecodedPcmBytesPerPackage, 'maxDecodedPcmBytesPerPackage'); aggregateDurationSeconds += wave.durationSeconds;
    if (!Number.isFinite(aggregateDurationSeconds) || aggregateDurationSeconds > MUGEN_LIMITS.snd.maxAggregateDurationSeconds) limit('maxAggregateDurationSeconds', aggregateDurationSeconds, MUGEN_LIMITS.snd.maxAggregateDurationSeconds);
    mutable.push(Object.freeze({ sourceIndex: index, group, item, byteOffset: offset, nextOffset, encodedBytes: payload, encodedSha256: await sha256Hex(payload), ...wave }));
    if (index + 1 < count && nextOffset === 0) fail('MUGEN SND subheader chain ends before the declared count.', offset);
    if (index + 1 === count && nextOffset !== 0 && nextOffset !== bytes.byteLength) fail('MUGEN SND subheader chain continues beyond the declared count.', offset);
    offset = nextOffset;
  }
  const selected = new Map<string, number>(); for (const entry of mutable) selected.set(`${entry.group},${entry.item}`, entry.sourceIndex);
  const entries = Object.freeze(mutable.map(entry => Object.freeze({ ...entry, selectedByKey: selected.get(`${entry.group},${entry.item}`) === entry.sourceIndex })));
  return Object.freeze({ canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256, version, entries, diagnostics: Object.freeze([]), encodedBytes, decodedPcmBytes, aggregateDurationSeconds });

  function fail(message: string, byteOffset: number): never { failMugen(mugenDiagnostic('E_MUGEN_SND_ENTRY_INVALID', 'snd', 'error', 'release-resource', message, { ...location, byteOffset })); }
  function limit(budget: string, observed: number, maximum: number): never { failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `MUGEN SND exceeds ${budget}.`, location, { budget, observed, limit: maximum })); }
}

function parseWave(bytes: Uint8Array, resource: MugenImportResource, absoluteOffset: number): Omit<MugenSndEntry, 'sourceIndex' | 'group' | 'item' | 'byteOffset' | 'nextOffset' | 'encodedBytes' | 'encodedSha256' | 'selectedByKey'> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const fail = (message: string, relative: number): never => failMugen(mugenDiagnostic('E_MUGEN_SND_ENTRY_INVALID', 'snd', 'error', 'release-resource', message, { canonicalPath: resource.canonicalPath, sourceSha256: resource.sha256, byteOffset: absoluteOffset + relative }));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') fail('MUGEN SND entry is not a RIFF/WAVE payload.', 0);
  const rawDeclaredEnd = view.getUint32(4, true) + 8;
  // Some Fighter Factory banks write the complete RIFF byte length into the
  // size field instead of the spec-required length-minus-eight. Accept only
  // that exact bounded mismatch and continue with the enclosing SND length.
  const declaredEnd = rawDeclaredEnd === bytes.byteLength + 8 ? bytes.byteLength : rawDeclaredEnd;
  if (declaredEnd > bytes.byteLength || declaredEnd < 12) fail('MUGEN SND RIFF length is out of range.', 4);
  let cursor = 12; let format: { channels: number; sampleRate: number; bitsPerSample: number; blockAlign: number } | null = null; let dataLength = -1;
  while (cursor + 8 <= declaredEnd) { const id = tag(cursor); const length = view.getUint32(cursor + 4, true); const payload = cursor + 8; const end = payload + length; if (end > declaredEnd || end < payload) fail('MUGEN SND WAV chunk is truncated.', cursor + 4);
    if (id === 'fmt ') { if (length < 16) fail('MUGEN SND WAV fmt chunk is too short.', cursor); const codec = view.getUint16(payload, true); const channels = view.getUint16(payload + 2, true); const sampleRate = view.getUint32(payload + 4, true); const blockAlign = view.getUint16(payload + 12, true); const bitsPerSample = view.getUint16(payload + 14, true); if (codec !== 1 || ![8, 16].includes(bitsPerSample)) fail('MUGEN SND supports PCM8/PCM16 WAV only.', payload); if (channels < 1 || channels > MUGEN_LIMITS.snd.maxChannelsPerEntry || sampleRate < 1 || sampleRate > MUGEN_LIMITS.snd.maxSampleRate || blockAlign !== channels * bitsPerSample / 8) fail('MUGEN SND WAV metadata is invalid.', payload); format = { channels, sampleRate, bitsPerSample, blockAlign }; }
    else if (id === 'data' && dataLength < 0) dataLength = length;
    cursor = nextWaveChunkOffset(bytes, view, end, length, declaredEnd);
  }
  const resolvedFormat = format;
  if (resolvedFormat === null) return fail('MUGEN SND WAV requires a fmt chunk.', 12);
  if (dataLength < 0 || dataLength % resolvedFormat.blockAlign !== 0) return fail('MUGEN SND WAV requires an aligned data chunk.', 12);
  const frameLength = dataLength / resolvedFormat.blockAlign; const durationSeconds = frameLength / resolvedFormat.sampleRate; if (durationSeconds > MUGEN_LIMITS.snd.maxDurationSecondsPerEntry) fail('MUGEN SND WAV duration exceeds the strict profile.', 4);
  return Object.freeze({ channels: resolvedFormat.channels, sampleRate: resolvedFormat.sampleRate, bitsPerSample: resolvedFormat.bitsPerSample, frameLength, durationSeconds });
}

function nextWaveChunkOffset(bytes: Uint8Array, view: DataView, end: number, length: number, declaredEnd: number): number {
  if ((length & 1) === 0 || end >= declaredEnd) return end;
  const padded = end + 1;
  // RIFF requires odd-sized chunks to be padded, but Fighter Factory has
  // emitted SND banks whose embedded WAV moves directly to the next chunk.
  // Prefer that unpadded boundary only when it forms a complete, printable
  // chunk header and the nominal padded boundary does not.
  if (isCompleteWaveChunk(bytes, view, end, declaredEnd) && !isCompleteWaveChunk(bytes, view, padded, declaredEnd)) return end;
  return padded;
}

function isCompleteWaveChunk(bytes: Uint8Array, view: DataView, offset: number, declaredEnd: number): boolean {
  if (offset < 0 || offset + 8 > declaredEnd) return false;
  for (let index = 0; index < 4; index++) {
    const value = bytes[offset + index]!;
    if (value < 0x20 || value > 0x7e) return false;
  }
  const length = view.getUint32(offset + 4, true);
  const end = offset + 8 + length;
  return end >= offset + 8 && end <= declaredEnd;
}

function add(current: number, value: number, maximum: number, budget: string): number { const total = current + value; if (!Number.isSafeInteger(total) || total > maximum) failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', `MUGEN SND exceeds ${budget}.`, {}, { budget, observed: total, limit: maximum })); return total; }
