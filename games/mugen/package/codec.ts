import { MUGEN_CONTRACT_REVISION, MUGEN_LIMITS, MUGEN_PROFILE } from '../import/contract';
import { failMugen, MUGEN_DIAGNOSTIC_CATALOG, mugenDiagnostic, MugenImportFailure } from '../import/diagnostics';
import { sha256Hex } from '../import/vfs/MugenVfs';
import { asciiCaseFold, canonicalizeMugenPath, compareMugenStrings } from '../import/vfs/path';
import type { EncodedMugenPackage, HaiyueMugenPackage, MugenCanonicalValue } from './types';

const MAGIC = Uint8Array.of(0x48, 0x59, 0x4d, 0x55, 0x47, 0x45, 0x4e, 0x00);
const WIRE_VERSION = 1;
const HEADER_BYTES = 48;
const HASH_OFFSET = 16;
const HASH_BYTES = 32;
const MAX_COLLECTION_ENTRIES = MUGEN_LIMITS.text.maxTokensPerFile;
const UTF8 = new TextEncoder();
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });

const VALUE_TAG = Object.freeze({
  null: 0,
  false: 1,
  true: 2,
  integer: 3,
  float32: 4,
  string: 5,
  array: 6,
  object: 7,
});

export async function encodeMugenPackage(packageValue: HaiyueMugenPackage): Promise<EncodedMugenPackage> {
  validatePackage(packageValue);
  let payload: Uint8Array;
  try {
    payload = encodeCanonicalBinary(packageValue);
  } catch (error) {
    if (error instanceof MugenImportFailure) throw error;
    failPackageVersion(`HYMUGEN value is not canonically encodable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const totalBytes = HEADER_BYTES + payload.byteLength;
  if (totalBytes > MUGEN_LIMITS.worker.maxMessageBytes) failPackageBudget(totalBytes);
  const bytes = new Uint8Array(totalBytes);
  bytes.set(MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(8, WIRE_VERSION, true);
  view.setUint16(10, 0, true);
  view.setUint32(12, payload.byteLength, true);
  bytes.set(payload, HEADER_BYTES);
  const packageSha256 = await hashWithoutEmbeddedHash(bytes);
  bytes.set(hexToBytes(packageSha256), HASH_OFFSET);
  return Object.freeze({ bytes, packageSha256 });
}

export async function decodeMugenPackage(source: Uint8Array | ArrayBuffer): Promise<EncodedMugenPackage & { readonly package: HaiyueMugenPackage }> {
  const bytes = source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
  if (bytes.byteLength < HEADER_BYTES) failMugen(mugenDiagnostic('E_MUGEN_TRUNCATED', 'binary-parse', 'fatal', 'release-resource', 'HYMUGEN package header is truncated.'));
  if (!MAGIC.every((byte, index) => bytes[index] === byte)) failMugen(mugenDiagnostic('E_MUGEN_FORMAT_SIGNATURE', 'binary-parse', 'fatal', 'release-resource', 'HYMUGEN package signature is invalid.'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  const flags = view.getUint16(10, true);
  const payloadLength = view.getUint32(12, true);
  if (version !== WIRE_VERSION || flags !== 0) failMugen(mugenDiagnostic('E_MUGEN_PACKAGE_VERSION', 'package', 'error', 'release-resource', `Unsupported HYMUGEN wire version or flags: ${version}/${flags}.`));
  if (payloadLength !== bytes.byteLength - HEADER_BYTES) failMugen(mugenDiagnostic('E_MUGEN_TRUNCATED', 'binary-parse', 'fatal', 'release-resource', 'HYMUGEN payload length does not match the file.'));
  if (bytes.byteLength > MUGEN_LIMITS.worker.maxMessageBytes) failPackageBudget(bytes.byteLength);
  const embeddedHash = bytesToHex(bytes.subarray(HASH_OFFSET, HASH_OFFSET + HASH_BYTES));
  const packageSha256 = await hashWithoutEmbeddedHash(bytes);
  if (embeddedHash !== packageSha256) failMugen(mugenDiagnostic('E_MUGEN_PACKAGE_HASH', 'package', 'fatal', 'release-resource', 'HYMUGEN package hash does not match its bytes.'));
  const payload = bytes.subarray(HEADER_BYTES);
  const reader = new CanonicalReader(payload);
  let value: unknown;
  try {
    value = reader.readValue(0);
    reader.assertFinished();
  } catch (error) {
    if (error instanceof MugenImportFailure) throw error;
    failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', `HYMUGEN binary payload is invalid: ${error instanceof Error ? error.message : String(error)}`));
  }
  validatePackage(value);
  if (!equalBytes(encodeCanonicalBinary(value), payload)) failMugen(mugenDiagnostic('E_MUGEN_DECODE_INVALID', 'decode', 'error', 'release-resource', 'HYMUGEN payload is not in canonical binary form.'));
  return Object.freeze({ bytes, packageSha256, package: deepFreeze(value) });
}

export function canonicalJson(value: MugenCanonicalValue | HaiyueMugenPackage): string {
  return encodeCanonicalJson(value, new Set<object>());
}

function encodeCanonicalBinary(value: MugenCanonicalValue | HaiyueMugenPackage): Uint8Array {
  const writer = new CanonicalWriter();
  writer.writeValue(value, 0, new Set<object>());
  return writer.finish();
}

class CanonicalWriter {
  readonly #chunks: Uint8Array[] = [];
  #byteLength = 0;

  writeValue(value: unknown, depth: number, ancestors: Set<object>): void {
    if (depth > MUGEN_LIMITS.compilerAndVm.maxExpressionDepth) throw new TypeError('Canonical HYMUGEN value exceeds the frozen depth budget.');
    if (value === null) { this.#writeByte(VALUE_TAG.null); return; }
    if (value === false) { this.#writeByte(VALUE_TAG.false); return; }
    if (value === true) { this.#writeByte(VALUE_TAG.true); return; }
    if (typeof value === 'string') {
      this.#writeByte(VALUE_TAG.string);
      this.#writeString(value);
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Canonical HYMUGEN values cannot contain non-finite numbers.');
      if (Number.isSafeInteger(value)) {
        this.#writeByte(VALUE_TAG.integer);
        const bytes = new Uint8Array(8);
        new DataView(bytes.buffer).setBigInt64(0, BigInt(Object.is(value, -0) ? 0 : value), true);
        this.#write(bytes);
        return;
      }
      if (!Object.is(Math.fround(value), value)) throw new TypeError(`Canonical HYMUGEN float is not exactly float32: ${value}`);
      this.#writeByte(VALUE_TAG.float32);
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setFloat32(0, value, true);
      this.#write(bytes);
      return;
    }
    if (typeof value !== 'object') throw new TypeError(`Canonical HYMUGEN value cannot contain ${typeof value}.`);
    if (ancestors.has(value)) throw new TypeError('Canonical HYMUGEN value cannot contain a cycle.');
    ancestors.add(value);
    if (Array.isArray(value)) {
      if (value.length > MAX_COLLECTION_ENTRIES) throw new TypeError('Canonical HYMUGEN array exceeds the frozen collection budget.');
      this.#writeByte(VALUE_TAG.array);
      this.#writeU32(value.length);
      for (const item of value) this.writeValue(item, depth + 1, ancestors);
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Canonical HYMUGEN objects must be plain records.');
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object).sort(compareMugenStrings);
      if (keys.length > MAX_COLLECTION_ENTRIES) throw new TypeError('Canonical HYMUGEN object exceeds the frozen collection budget.');
      this.#writeByte(VALUE_TAG.object);
      this.#writeU32(keys.length);
      for (const key of keys) {
        this.#writeString(key);
        this.writeValue(object[key], depth + 1, ancestors);
      }
    }
    ancestors.delete(value);
  }

  finish(): Uint8Array {
    const result = new Uint8Array(this.#byteLength);
    let offset = 0;
    for (const chunk of this.#chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  #writeString(value: string): void {
    if (hasUnpairedSurrogate(value)) throw new TypeError('Canonical HYMUGEN string contains an unpaired surrogate.');
    const bytes = UTF8.encode(value);
    if (bytes.byteLength > MUGEN_LIMITS.compilerAndVm.maxStringBytes) throw new TypeError('Canonical HYMUGEN string exceeds the frozen byte budget.');
    this.#writeU32(bytes.byteLength);
    this.#write(bytes);
  }

  #writeU32(value: number): void {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    this.#write(bytes);
  }

  #writeByte(value: number): void { this.#write(Uint8Array.of(value)); }

  #write(bytes: Uint8Array): void {
    this.#byteLength += bytes.byteLength;
    if (!Number.isSafeInteger(this.#byteLength) || this.#byteLength + HEADER_BYTES > MUGEN_LIMITS.directoryAndArchive.maxRawBytes) failPackageBudget(this.#byteLength + HEADER_BYTES);
    this.#chunks.push(bytes);
  }
}

class CanonicalReader {
  readonly bytes: Uint8Array;
  #offset = 0;

  constructor(bytes: Uint8Array) { this.bytes = bytes; }

  readValue(depth: number): MugenCanonicalValue {
    if (depth > MUGEN_LIMITS.compilerAndVm.maxExpressionDepth) throw new RangeError('Canonical value depth exceeds the frozen budget.');
    const tag = this.#readByte();
    switch (tag) {
      case VALUE_TAG.null: return null;
      case VALUE_TAG.false: return false;
      case VALUE_TAG.true: return true;
      case VALUE_TAG.integer: {
        const value = this.#readI64();
        if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Canonical integer is outside the JavaScript safe range.');
        return Number(value);
      }
      case VALUE_TAG.float32: {
        const value = this.#readF32();
        if (!Number.isFinite(value) || Object.is(value, -0)) throw new RangeError('Canonical float32 is non-finite or negative zero.');
        return value;
      }
      case VALUE_TAG.string: return this.#readString();
      case VALUE_TAG.array: {
        const count = this.#readCollectionCount(1);
        const result: MugenCanonicalValue[] = [];
        for (let index = 0; index < count; index++) result.push(this.readValue(depth + 1));
        return result;
      }
      case VALUE_TAG.object: {
        const count = this.#readCollectionCount(5);
        const result: Record<string, MugenCanonicalValue> = {};
        let previousKey: string | null = null;
        for (let index = 0; index < count; index++) {
          const key = this.#readString();
          if (previousKey !== null && compareMugenStrings(previousKey, key) >= 0) throw new TypeError('Canonical object keys are duplicated or unsorted.');
          previousKey = key;
          Object.defineProperty(result, key, { value: this.readValue(depth + 1), enumerable: true, configurable: true, writable: true });
        }
        return result;
      }
      default: throw new TypeError(`Unknown canonical value tag ${tag}.`);
    }
  }

  assertFinished(): void {
    if (this.#offset !== this.bytes.byteLength) throw new RangeError('Canonical payload contains trailing bytes.');
  }

  #readString(): string {
    const byteLength = this.#readU32();
    if (byteLength > MUGEN_LIMITS.compilerAndVm.maxStringBytes) throw new RangeError('Canonical string exceeds the frozen byte budget.');
    const value = UTF8_FATAL.decode(this.#readBytes(byteLength));
    if (hasUnpairedSurrogate(value)) throw new TypeError('Canonical string contains an unpaired surrogate.');
    return value;
  }

  #readCollectionCount(minimumBytesPerEntry: number): number {
    const count = this.#readU32();
    if (count > MAX_COLLECTION_ENTRIES || count > Math.floor((this.bytes.byteLength - this.#offset) / minimumBytesPerEntry)) throw new RangeError('Canonical collection count exceeds its bytes or frozen budget.');
    return count;
  }

  #readByte(): number { return this.#readBytes(1)[0]!; }

  #readU32(): number {
    const bytes = this.#readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  }

  #readI64(): bigint {
    const bytes = this.#readBytes(8);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigInt64(0, true);
  }

  #readF32(): number {
    const bytes = this.#readBytes(4);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(0, true);
  }

  #readBytes(byteLength: number): Uint8Array {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0 || this.#offset + byteLength > this.bytes.byteLength) throw new RangeError('Canonical payload is truncated.');
    const result = this.bytes.subarray(this.#offset, this.#offset + byteLength);
    this.#offset += byteLength;
    return result;
  }
}

function encodeCanonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical HYMUGEN values cannot contain non-finite numbers.');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError(`Canonical HYMUGEN value cannot contain ${typeof value}.`);
  if (ancestors.has(value)) throw new TypeError('Canonical HYMUGEN value cannot contain a cycle.');
  ancestors.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map(item => encodeCanonicalJson(item, ancestors)).join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Canonical HYMUGEN objects must be plain records.');
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort(compareMugenStrings);
    result = `{${keys.map(key => `${JSON.stringify(key)}:${encodeCanonicalJson(object[key], ancestors)}`).join(',')}}`;
  }
  ancestors.delete(value);
  return result;
}

function validatePackage(value: unknown): asserts value is HaiyueMugenPackage {
  if (!isRecord(value)) failPackageVersion('HYMUGEN payload must be an object.');
  const envelopeKeys = [
    'budgetUsage', 'contractRevision', 'dependencyGraphSha256', 'diagnostics', 'entryDef', 'entryKind', 'featureUsage',
    'format', 'profile', 'provenance', 'selectedEncoding', 'sourceSetSha256', 'tables', 'version',
  ];
  assertExactKeys(value, envelopeKeys, 'HYMUGEN envelope');
  if (value.format !== 'haiyue-mugen-package' || value.version !== 1 || value.contractRevision !== MUGEN_CONTRACT_REVISION || value.profile !== MUGEN_PROFILE) failPackageVersion('HYMUGEN envelope identity does not match the frozen contract.');
  if (!['character', 'stage', 'motif', 'storyboard'].includes(String(value.entryKind))) failPackageVersion('HYMUGEN entryKind is invalid.');
  requireString(value.entryDef, 'entryDef');
  if (canonicalizeMugenPath(value.entryDef) !== value.entryDef) failPackageVersion('HYMUGEN entryDef is not canonical.');
  requireSha256(value.sourceSetSha256, 'sourceSetSha256');
  requireSha256(value.dependencyGraphSha256, 'dependencyGraphSha256');
  if (!['utf-8', 'windows-1252', 'shift_jis', 'gbk', 'big5', 'euc-kr'].includes(String(value.selectedEncoding))) failPackageVersion('HYMUGEN selectedEncoding is invalid.');
  if (!Array.isArray(value.featureUsage) || !value.featureUsage.every(item => typeof item === 'string')) failPackageVersion('HYMUGEN featureUsage is invalid.');
  const featureUsage = value.featureUsage as string[];
  if (new Set(featureUsage).size !== featureUsage.length || [...featureUsage].sort(compareMugenStrings).some((item, index) => item !== featureUsage[index])) failPackageVersion('HYMUGEN featureUsage is not unique and sorted.');
  if (!isRecord(value.budgetUsage) || !Object.values(value.budgetUsage).every(item => Number.isSafeInteger(item) && Number(item) >= 0)) failPackageVersion('HYMUGEN budgetUsage is invalid.');
  if (!Array.isArray(value.diagnostics)) failPackageVersion('HYMUGEN diagnostics must be an array.');
  validateDiagnostics(value.diagnostics);
  validateProvenance(value.provenance, value);
  validateTables(value.tables, value.entryDef);
}

function validateDiagnostics(diagnostics: unknown[]): void {
  if (diagnostics.length > MUGEN_LIMITS.text.maxDiagnosticCount) failPackageVersion('HYMUGEN diagnostic table exceeds the frozen count budget.');
  for (const diagnostic of diagnostics) {
    if (!isRecord(diagnostic)) failPackageVersion('HYMUGEN diagnostic must be an object.');
    const requiredKeys = ['code', 'message', 'phase', 'profile', 'recovery', 'severity'];
    const optionalKeys = ['byteOffset', 'canonicalPath', 'column', 'details', 'group', 'item', 'key', 'line', 'section', 'sourceSha256'];
    const actualKeys = Object.keys(diagnostic);
    if (requiredKeys.some(key => !actualKeys.includes(key)) || actualKeys.some(key => !requiredKeys.includes(key) && !optionalKeys.includes(key))) {
      failPackageVersion('HYMUGEN diagnostic has unknown or missing fields.');
    }
    for (const key of ['code', 'severity', 'profile', 'phase', 'message', 'recovery']) requireString(diagnostic[key], `diagnostic.${key}`);
    const contract = MUGEN_DIAGNOSTIC_CATALOG[diagnostic.code as keyof typeof MUGEN_DIAGNOSTIC_CATALOG];
    if (contract === undefined || contract[0] !== diagnostic.phase || contract[1] !== diagnostic.severity || contract[2] !== diagnostic.recovery) {
      failPackageVersion('HYMUGEN diagnostic does not match the frozen code/phase/severity/recovery catalog.');
    }
    if (diagnostic.profile !== MUGEN_PROFILE) failPackageVersion('HYMUGEN diagnostic profile is invalid.');
    if (diagnostic.canonicalPath !== undefined) {
      requireString(diagnostic.canonicalPath, 'diagnostic.canonicalPath');
      if (canonicalizeMugenPath(diagnostic.canonicalPath) !== diagnostic.canonicalPath) failPackageVersion('HYMUGEN diagnostic path is not canonical.');
    }
    if (diagnostic.sourceSha256 !== undefined) requireSha256(diagnostic.sourceSha256, 'diagnostic.sourceSha256');
    for (const key of ['byteOffset', 'line', 'column']) {
      if (diagnostic[key] !== undefined && (!Number.isSafeInteger(diagnostic[key]) || Number(diagnostic[key]) < (key === 'byteOffset' ? 0 : 1))) {
        failPackageVersion(`HYMUGEN diagnostic.${key} is invalid.`);
      }
    }
    for (const key of ['group', 'item']) if (diagnostic[key] !== undefined && !Number.isSafeInteger(diagnostic[key])) failPackageVersion(`HYMUGEN diagnostic.${key} is invalid.`);
    for (const key of ['section', 'key']) if (diagnostic[key] !== undefined && typeof diagnostic[key] !== 'string') failPackageVersion(`HYMUGEN diagnostic.${key} is invalid.`);
    if (diagnostic.details !== undefined && (!isRecord(diagnostic.details)
      || !Object.values(diagnostic.details).every(item => typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))))) {
      failPackageVersion('HYMUGEN diagnostic.details is invalid.');
    }
  }
}

function validateProvenance(provenance: unknown, envelope: Record<string, unknown>): void {
  if (!isRecord(provenance)) failPackageVersion('HYMUGEN provenance must be an object.');
  assertExactKeys(provenance, ['contractRevision', 'entryDef', 'fixtureOrLocalContentRole', 'importerRevision', 'profile', 'selectedEncoding', 'sourceSetSha256'], 'HYMUGEN provenance');
  if (provenance.sourceSetSha256 !== envelope.sourceSetSha256
    || provenance.entryDef !== envelope.entryDef
    || provenance.selectedEncoding !== envelope.selectedEncoding
    || provenance.profile !== envelope.profile
    || provenance.contractRevision !== envelope.contractRevision
    || typeof provenance.importerRevision !== 'string'
    || !['formal-fixture', 'local-content'].includes(String(provenance.fixtureOrLocalContentRole))) failPackageVersion('HYMUGEN provenance does not match its envelope.');
}

function validateTables(tables: unknown, entryDef: string): void {
  if (!isRecord(tables)) failPackageVersion('HYMUGEN tables must be an object.');
  const tableKeys = ['actions', 'commands', 'motif', 'palettes', 'resources', 'sounds', 'sprites', 'stage', 'states', 'strings'];
  assertExactKeys(tables, tableKeys, 'HYMUGEN tables');
  if (!Array.isArray(tables.strings) || !tables.strings.every(item => typeof item === 'string')) failPackageVersion('HYMUGEN string table is invalid.');
  const strings = tables.strings as string[];
  if (new Set(strings).size !== strings.length || [...strings].sort(compareMugenStrings).some((item, index) => item !== strings[index])) failPackageVersion('HYMUGEN string table is not unique and sorted.');
  if (!Array.isArray(tables.resources)) failPackageVersion('HYMUGEN resource table is invalid.');
  const seenPathIndexes = new Set<number>();
  const dependencyIndexes: number[][] = [];
  let previousResourcePath: string | null = null;
  let entryDefKind: unknown;
  for (const resource of tables.resources) {
    if (!isRecord(resource)) failPackageVersion('HYMUGEN resource must be an object.');
    assertExactKeys(resource, ['byteLength', 'contentSha256', 'dependencies', 'kind', 'path'], 'HYMUGEN resource');
    if (!Number.isSafeInteger(resource.path) || Number(resource.path) < 0 || Number(resource.path) >= strings.length || seenPathIndexes.has(Number(resource.path))) failPackageVersion('HYMUGEN resource path index is invalid or duplicated.');
    seenPathIndexes.add(Number(resource.path));
    const resourcePath = strings[Number(resource.path)]!;
    if (canonicalizeMugenPath(resourcePath) !== resourcePath) failPackageVersion('HYMUGEN resource path string is not canonical.');
    if (previousResourcePath !== null && (compareMugenStrings(asciiCaseFold(previousResourcePath), asciiCaseFold(resourcePath)) > 0
      || (asciiCaseFold(previousResourcePath) === asciiCaseFold(resourcePath) && compareMugenStrings(previousResourcePath, resourcePath) >= 0))) failPackageVersion('HYMUGEN resource table is not in canonical path order.');
    previousResourcePath = resourcePath;
    requireSha256(resource.contentSha256, 'resource.contentSha256');
    if (!Number.isSafeInteger(resource.byteLength) || Number(resource.byteLength) < 0) failPackageVersion('HYMUGEN resource byteLength is invalid.');
    if (!Array.isArray(resource.dependencies) || !resource.dependencies.every(index => Number.isSafeInteger(index) && Number(index) >= 0 && Number(index) < strings.length)) failPackageVersion('HYMUGEN resource dependencies are invalid.');
    const dependencies = resource.dependencies as number[];
    if (new Set(dependencies).size !== dependencies.length || dependencies.some((item, index) => index > 0 && item <= dependencies[index - 1]!)) failPackageVersion('HYMUGEN resource dependencies are duplicated or unsorted.');
    if (!['def', 'air', 'cmd', 'cns', 'font', 'sprite', 'sound', 'palette', 'audio', 'other'].includes(String(resource.kind))) failPackageVersion('HYMUGEN resource kind is invalid.');
    if (resourcePath === entryDef) entryDefKind = resource.kind;
    dependencyIndexes.push(dependencies);
  }
  const entryDefIndex = strings.indexOf(entryDef);
  if (entryDefIndex < 0 || !seenPathIndexes.has(entryDefIndex)) failPackageVersion('HYMUGEN entryDef is not present in the resource table.');
  if (entryDefKind !== 'def') failPackageVersion('HYMUGEN entryDef resource is not a DEF file.');
  for (const dependencies of dependencyIndexes) {
    if (dependencies.some(index => !seenPathIndexes.has(index))) failPackageVersion('HYMUGEN resource dependency does not point to a resource path.');
  }
  assertAcyclicResourceGraph([...seenPathIndexes], dependencyIndexes);
  for (const key of ['palettes', 'sprites', 'actions', 'sounds', 'commands', 'states']) if (!Array.isArray(tables[key])) failPackageVersion(`HYMUGEN ${key} table must be an array.`);
}

function assertAcyclicResourceGraph(pathIndexes: readonly number[], dependencyIndexes: readonly number[][]): void {
  const tableIndexByPath = new Map(pathIndexes.map((pathIndex, tableIndex) => [pathIndex, tableIndex]));
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (tableIndex: number, depth: number): void => {
    if (depth > MUGEN_LIMITS.directoryAndArchive.maxDependencyDepth) failPackageVersion('HYMUGEN resource dependency depth exceeds the frozen budget.');
    if (visited.has(tableIndex)) return;
    if (visiting.has(tableIndex)) failPackageVersion('HYMUGEN resource dependency graph contains a cycle.');
    visiting.add(tableIndex);
    for (const pathIndex of dependencyIndexes[tableIndex] ?? []) {
      const dependencyTableIndex = tableIndexByPath.get(pathIndex);
      if (dependencyTableIndex === undefined) failPackageVersion('HYMUGEN resource dependency does not resolve.');
      visit(dependencyTableIndex, depth + 1);
    }
    visiting.delete(tableIndex);
    visited.add(tableIndex);
  };
  for (let index = 0; index < pathIndexes.length; index++) visit(index, 0);
}

async function hashWithoutEmbeddedHash(bytes: Uint8Array): Promise<string> {
  const hashInput = new Uint8Array(bytes.byteLength - HASH_BYTES);
  hashInput.set(bytes.subarray(0, HASH_OFFSET), 0);
  hashInput.set(bytes.subarray(HASH_OFFSET + HASH_BYTES), HASH_OFFSET);
  return sha256Hex(hashInput);
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareMugenStrings);
  const sortedExpected = [...expected].sort(compareMugenStrings);
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) failPackageVersion(`${label} has unknown or missing fields: ${actual.join(', ')}.`);
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) failPackageVersion(`HYMUGEN ${label} must be a non-empty string.`);
}

function requireSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) failPackageVersion(`HYMUGEN ${label} must be a lowercase SHA-256.`);
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function failPackageVersion(message: string): never { failMugen(mugenDiagnostic('E_MUGEN_PACKAGE_VERSION', 'package', 'error', 'release-resource', message)); }

function failPackageBudget(observed: number): never {
  failMugen(mugenDiagnostic('E_MUGEN_LIMIT_EXCEEDED', 'budget', 'fatal', 'release-resource', 'HYMUGEN package exceeds the Worker message byte budget.', {}, { budget: 'maxMessageBytes', observed, limit: MUGEN_LIMITS.worker.maxMessageBytes }));
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function hexToBytes(value: string): Uint8Array { return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)); }
function bytesToHex(value: Uint8Array): string { return [...value].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function equalBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]); }

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
