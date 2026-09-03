import type { MugenCommandProgram } from '../import/cmd/types';
import type { MugenStateProgram } from '../import/cns/types';
import type { MugenAirBank } from '../import/air/types';
import { decodeMugenPackage } from '../package/codec';
import type { MugenVfsInput } from '../import/vfs/MugenVfs';
import type { MugenImportWorkerClient } from '../import/worker/MugenImportWorkerClient';
import { createMugenCharacterModel, type MugenCharacterModel } from '../viewer/MugenCharacterModel';
import { resolveMugenDrawScale, type MugenDrawScale } from './MugenCharacterScale';

export interface MugenBuiltInGameFixture {
  readonly id: string;
  readonly displayName: string;
  readonly characterName: string;
  readonly authorName: string;
  readonly model: MugenCharacterModel;
  readonly commands: MugenCommandProgram;
  readonly states: MugenStateProgram;
  readonly air: MugenAirBank;
  readonly actionsByNumber: ReadonlyMap<number, MugenAirBank['actions'][number]>;
  readonly sounds: readonly MugenGameSound[];
  readonly packageSha256: string;
  readonly localCoord: readonly [number, number];
  readonly drawScale: MugenDrawScale;
  readonly runtimeProfile: 'm09-native-character-common-v1' | 'g08-basic-fighter-adapter-v1';
  readonly contentLicense: 'elecbyte-local-noncommercial' | 'user-local';
}

export interface MugenGameSound { readonly id: string; readonly group: number; readonly item: number; readonly selectedByKey: boolean; readonly encodedBase64: string; readonly encodedSha256: string; readonly channels: number; readonly sampleRate: number; readonly frameLength: number; }

interface CharacterCatalog { readonly schemaVersion: 2; readonly runtimeProfile: 'm09-native-character-common-v1'; readonly commonState: string; readonly characters: readonly CharacterDescriptor[]; }
interface CharacterDescriptor { readonly id: string; readonly label: string; readonly directory: string; readonly entryDef: string; readonly airPath: string; readonly scriptProfile: 'native-common-v1' | 'adapter-v1'; readonly contentLicense: 'elecbyte-local-noncommercial' | 'user-local'; readonly files: readonly string[]; }
export interface MugenCharacterCatalogEntry { readonly id: string; readonly label: string; }
interface RuntimeAdapter { readonly commands: MugenCommandProgram; readonly states: MugenStateProgram; }
export interface MugenFixtureLoadProgress { readonly completed: number; readonly total: number; readonly label: string; }

const REQUIRED_ACTIONS = Object.freeze([0, 10, 20, 21, 40, 120, 200, 5000, 5020]);

export async function loadMugenBuiltInGameFixtures(worker: MugenImportWorkerClient, signal?: AbortSignal, onProgress?: (progress: MugenFixtureLoadProgress) => void): Promise<readonly MugenBuiltInGameFixture[]> {
  const loader = await MugenBuiltInGameFixtureLoader.create(worker, signal); const result: MugenBuiltInGameFixture[] = [];
  onProgress?.(Object.freeze({ completed: 0, total: loader.entries.length, label: loader.entries[0]?.label ?? '' }));
  for (const [index, descriptor] of loader.entries.entries()) { onProgress?.(Object.freeze({ completed: index, total: loader.entries.length, label: descriptor.label })); result.push(await loader.load(descriptor.id, signal)); onProgress?.(Object.freeze({ completed: index + 1, total: loader.entries.length, label: descriptor.label })); }
  if (result.length < 2) throw new TypeError('MUGEN 角色目录至少需要两个可选角色。');
  return Object.freeze(result);
}

export async function loadMugenBuiltInGameFixture(worker: MugenImportWorkerClient, signal?: AbortSignal): Promise<MugenBuiltInGameFixture> { const loader = await MugenBuiltInGameFixtureLoader.create(worker, signal); return loader.load(loader.entries[0]!.id, signal); }

/** Lightweight catalog plus on-demand character package importer. */
export class MugenBuiltInGameFixtureLoader {
  readonly entries: readonly MugenCharacterCatalogEntry[];
  readonly #worker: MugenImportWorkerClient;
  readonly #commonState: MugenVfsInput;
  readonly #descriptors: ReadonlyMap<string, CharacterDescriptor>;
  readonly #inflight = new Map<string, Promise<MugenBuiltInGameFixture>>();
  #adapter: Promise<RuntimeAdapter> | null = null;

  private constructor(worker: MugenImportWorkerClient, catalog: CharacterCatalog, commonState: MugenVfsInput) {
    this.#worker = worker; this.#commonState = commonState; this.#descriptors = new Map(catalog.characters.map(value => [value.id, value])); this.entries = Object.freeze(catalog.characters.map(value => Object.freeze({ id: value.id, label: value.label })));
  }

  static async create(worker: MugenImportWorkerClient, signal?: AbortSignal): Promise<MugenBuiltInGameFixtureLoader> {
    const catalog = await loadCatalog(signal); const commonState = Object.freeze({ path: catalog.commonState, bytes: await fetchBytes(`../common/${catalog.commonState}`, `公共状态 ${catalog.commonState}`, signal) }); return new MugenBuiltInGameFixtureLoader(worker, catalog, commonState);
  }

  load(id: string, signal?: AbortSignal): Promise<MugenBuiltInGameFixture> {
    const existing = this.#inflight.get(id); if (existing !== undefined) return existing;
    const descriptor = this.#descriptors.get(id); if (descriptor === undefined) return Promise.reject(new RangeError(`未知 MUGEN 内置角色：${id}。`));
    const pending = (async () => { if (descriptor.scriptProfile === 'adapter-v1') this.#adapter ??= loadRuntimeAdapter(this.#worker, signal); const adapter = descriptor.scriptProfile === 'adapter-v1' ? await this.#adapter : null; return loadCharacter(this.#worker, descriptor, this.#commonState, adapter, signal); })();
    this.#inflight.set(id, pending); void pending.finally(() => { if (this.#inflight.get(id) === pending) this.#inflight.delete(id); }).catch(() => undefined); return pending;
  }
}

async function loadCharacter(worker: MugenImportWorkerClient, descriptor: CharacterDescriptor, commonState: MugenVfsInput, adapter: RuntimeAdapter | null, signal?: AbortSignal): Promise<MugenBuiltInGameFixture> {
  const characterInputs = await Promise.all(descriptor.files.map(async path => Object.freeze({ path, bytes: await fetchBytes(`../charactors/${descriptor.directory}/${path}`, `角色文件 ${descriptor.directory}/${path}`, signal) }))) satisfies readonly MugenVfsInput[];
  const inputs = Object.freeze([...characterInputs, commonState]);
  const imported = await worker.import(inputs, { contentRole: 'local-content', entryDef: descriptor.entryDef, entryKind: 'character', scriptProfile: descriptor.scriptProfile === 'native-common-v1' ? 'm09-native-common' : 'none' }, signal);
  const decoded = await decodeMugenPackage(imported.packageBytes); const model = createMugenCharacterModel(decoded.package, imported.metadata); const actions = new Set(model.actions.map(value => value.action.number));
  for (const action of REQUIRED_ACTIONS) if (!actions.has(action)) throw new TypeError(`${descriptor.label} 缺少游戏运行所需的 AIR action ${action}。`);
  const commands = descriptor.scriptProfile === 'native-common-v1' ? requireCommandProgram(decoded.package.tables.commands[0], descriptor.label) : adapter?.commands;
  const states = descriptor.scriptProfile === 'native-common-v1' ? requireStateProgram(decoded.package.tables.states[0], descriptor.label) : adapter?.states;
  if (commands === undefined || states === undefined) throw new TypeError(`${descriptor.label} 没有可执行的角色脚本。`);
  const sounds = Object.freeze(decoded.package.tables.sounds.map(requireSound));
  const air: MugenAirBank = Object.freeze({
    canonicalPath: descriptor.airPath, sourceSha256: decoded.package.sourceSetSha256,
    actions: Object.freeze(model.actions.map(value => value.action)), diagnostics: model.diagnostics,
    elementCount: model.actions.reduce((total, value) => total + value.action.elements.length, 0),
    collisionBoxCount: model.actions.reduce((total, value) => total + value.action.elements.reduce((sum, element) => sum + element.clsn1.length + element.clsn2.length, 0), 0),
  });
  const actionsByNumber = new Map(air.actions.map(action => [action.number, action]));
  return Object.freeze({
    id: descriptor.id, displayName: descriptor.label, characterName: imported.metadata.name ?? descriptor.label, authorName: imported.metadata.author ?? '', model, commands, states, air, actionsByNumber, sounds,
    packageSha256: imported.packageSha256, localCoord: imported.metadata.localCoord ?? Object.freeze([320, 240]), drawScale: resolveMugenDrawScale(states.constants), runtimeProfile: descriptor.scriptProfile === 'native-common-v1' ? 'm09-native-character-common-v1' : 'g08-basic-fighter-adapter-v1',
    contentLicense: descriptor.contentLicense,
  });
}

async function loadRuntimeAdapter(worker: MugenImportWorkerClient, signal?: AbortSignal): Promise<RuntimeAdapter> {
  const definition = new TextEncoder().encode('[Info]\nname = Haiyue G08 runtime adapter\n[Files]\ncmd = adapter.cmd\ncns = adapter.cns\n');
  const inputs = Object.freeze([
    Object.freeze({ path: 'adapter.def', bytes: definition }),
    Object.freeze({ path: 'adapter.cmd', bytes: await fetchBytes('../game/g08-runtime-adapter.cmd', '基础战斗 CMD 适配器', signal) }),
    Object.freeze({ path: 'adapter.cns', bytes: await fetchBytes('../fixtures/g08-game-v1/hero.cns', '基础战斗 CNS 适配器', signal) }),
  ]);
  const imported = await worker.import(inputs, { contentRole: 'formal-fixture', entryDef: 'adapter.def', entryKind: 'character', encoding: 'utf-8', scriptProfile: 'g08-minimal' }, signal); const decoded = await decodeMugenPackage(imported.packageBytes);
  return Object.freeze({ commands: requireCommandProgram(decoded.package.tables.commands[0]), states: requireStateProgram(decoded.package.tables.states[0]) });
}

async function loadCatalog(signal?: AbortSignal): Promise<CharacterCatalog> {
  const bytes = await fetchBytes('../charactors/catalog.json', '角色目录 catalog.json', signal); let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new TypeError('MUGEN 角色目录 catalog.json 不是有效 JSON。'); }
  if (!isRecord(value) || value.schemaVersion !== 2 || value.runtimeProfile !== 'm09-native-character-common-v1' || !fileName(value.commonState, '.cns') || !Array.isArray(value.characters) || value.characters.length < 2 || value.characters.length > 32) throw new TypeError('MUGEN 角色目录 catalog.json 结构无效。');
  const ids = new Set<string>(); const characters = value.characters.map((entry, index) => validateDescriptor(entry, index, ids));
  return Object.freeze({ schemaVersion: 2, runtimeProfile: value.runtimeProfile, commonState: value.commonState, characters: Object.freeze(characters) });
}

function validateDescriptor(value: unknown, index: number, ids: Set<string>): CharacterDescriptor {
  if (!isRecord(value) || !identifier(value.id) || !text(value.label) || !directoryName(value.directory) || !fileName(value.entryDef, '.def') || !fileName(value.airPath, '.air') || (value.scriptProfile !== 'native-common-v1' && value.scriptProfile !== 'adapter-v1') || (value.contentLicense !== 'elecbyte-local-noncommercial' && value.contentLicense !== 'user-local') || !Array.isArray(value.files) || value.files.length < 5 || value.files.length > 32 || !value.files.every(file => relativeFilePath(file))) throw new TypeError(`MUGEN 角色目录第 ${index + 1} 项无效。`);
  if (ids.has(value.id)) throw new TypeError(`MUGEN 角色 id 重复：${value.id}。`); ids.add(value.id);
  if (!value.files.includes(value.entryDef) || !value.files.includes(value.airPath)) throw new TypeError(`MUGEN 角色 ${value.id} 的入口文件未列入 files。`);
  return Object.freeze({ id: value.id, label: value.label, directory: value.directory, entryDef: value.entryDef, airPath: value.airPath, scriptProfile: value.scriptProfile, contentLicense: value.contentLicense, files: Object.freeze([...value.files]) });
}

async function fetchBytes(relativeUrl: string, label: string, signal?: AbortSignal): Promise<Uint8Array> { const response = await fetch(new URL(relativeUrl, import.meta.url), signal === undefined ? {} : { signal }); if (!response.ok) throw new Error(`无法载入${label}（HTTP ${response.status}）。`); return new Uint8Array(await response.arrayBuffer()); }
function requireCommandProgram(value: unknown, label = '基础战斗适配器'): MugenCommandProgram { if (!isRecord(value) || value.schemaVersion !== 1 || value.revision !== 'm08-g08b-command-v1' || !Array.isArray(value.commands)) throw new TypeError(`${label} 缺少兼容的 CMD program。`); return value as unknown as MugenCommandProgram; }
function requireStateProgram(value: unknown, label = '基础战斗适配器'): MugenStateProgram { if (!isRecord(value) || value.schemaVersion !== 1 || value.revision !== 'm09-g03-core-state-v1' || !Array.isArray(value.states) || !isRecord(value.constants)) throw new TypeError(`${label} 缺少兼容的 CNS program。`); return value as unknown as MugenStateProgram; }
function requireSound(value: unknown): MugenGameSound { if (!isRecord(value) || value.kind !== 'snd-wav-v1' || typeof value.id !== 'string' || !Number.isSafeInteger(value.group) || !Number.isSafeInteger(value.item) || typeof value.selectedByKey !== 'boolean' || typeof value.encodedBase64 !== 'string' || typeof value.encodedSha256 !== 'string' || !Number.isSafeInteger(value.channels) || !Number.isSafeInteger(value.sampleRate) || !Number.isSafeInteger(value.frameLength)) throw new TypeError('角色包含无效的声音描述。'); return value as unknown as MugenGameSound; }
function identifier(value: unknown): value is string { return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value); }
function directoryName(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.&-]{0,127}$/u.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 128; }
function fileName(value: unknown, extension?: string): value is string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(value) && (extension === undefined || value.toLowerCase().endsWith(extension)); }
function relativeFilePath(value: unknown): value is string { return typeof value === 'string' && value.length <= 384 && value.split('/').length <= 8 && value.split('/').every(segment => /^[A-Za-z0-9_-][A-Za-z0-9_.&-]{0,127}$/u.test(segment)); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
