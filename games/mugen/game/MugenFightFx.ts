import { MUGEN_LIMITS } from '../import/contract';
import { parseMugenAir } from '../import/air/AirParser';
import type { MugenAirBank } from '../import/air/types';
import { parseMugenSff } from '../import/sff/SffParser';
import type { MugenDecodedPalette, MugenDecodedSprite, MugenSffBank } from '../import/sff/types';
import { parseMugenSnd } from '../import/snd/SndParser';
import { parseMugenTextFile } from '../import/text/MugenTextParser';
import { createMugenVfs, type MugenVfsInput } from '../import/vfs/MugenVfs';
import { asciiCaseFold, compareMugenStrings } from '../import/vfs/path';
import type {
  MugenRenderAssetModel,
  MugenRendererPaletteAsset,
  MugenRendererSpriteAsset,
  MugenViewerPalette,
  MugenViewerSprite,
} from '../viewer/MugenCharacterModel';
import type { MugenGameSound } from './MugenGameFixture';

const AIR_NAME = 'fightfx.air';
const SFF_NAME = 'fightfx.sff';
const SND_NAME = 'fight.snd';
const LOCAL_COORD = Object.freeze([320, 240]) as readonly [number, number];

type BrowserFile = File & { readonly webkitRelativePath?: string };

export interface MugenFightFxModel extends MugenRenderAssetModel {
  readonly air: MugenAirBank;
  readonly sourceSetSha256: string;
  readonly localCoord: readonly [number, number];
  readonly contentLicense: 'user-local';
  readonly soundBankSha256: string | null;
  readonly sounds: readonly MugenGameSound[];
}

export async function loadMugenFightFx(inputs: readonly MugenVfsInput[], signal?: AbortSignal): Promise<MugenFightFxModel> {
  const selected = selectInputs(inputs);
  const vfs = await createMugenVfs(selected, signal);
  const airFile = vfs.require(AIR_NAME);
  const sffFile = vfs.require(SFF_NAME);
  const sndFile = vfs.get(SND_NAME);
  const sffResource = Object.freeze({
    canonicalPath: sffFile.canonicalPath,
    foldedPath: sffFile.foldedPath,
    sha256: sffFile.sha256,
    byteLength: sffFile.byteLength,
    kind: 'sprite' as const,
    read: sffFile.read,
  });
  const sff = await parseMugenSff(sffResource, signal === undefined ? {} : { signal });
  const assets = createFightFxAssets(sff);
  const document = parseMugenTextFile(airFile);
  const air = parseMugenAir(document, {
    ...(signal === undefined ? {} : { signal }),
    spriteResolver: (group, item) => {
      const sprite = assets.spriteByKey.get(`${group}:${item}`);
      return sprite === undefined ? null : Object.freeze({ id: sprite.id, axisX: sprite.axisX, axisY: sprite.axisY });
    },
  });
  const soundBank = sndFile === undefined ? null : await parseMugenSnd(Object.freeze({ canonicalPath: sndFile.canonicalPath, foldedPath: sndFile.foldedPath, sha256: sndFile.sha256, byteLength: sndFile.byteLength, kind: 'sound' as const, read: sndFile.read }), signal);
  const sounds = soundBank === null ? Object.freeze([]) : Object.freeze(soundBank.entries.map(entry => Object.freeze({ id: `${soundBank.sourceSha256}:${entry.sourceIndex}`, group: entry.group, item: entry.item, selectedByKey: entry.selectedByKey, encodedBase64: encodeBase64(entry.encodedBytes), encodedSha256: entry.encodedSha256, channels: entry.channels, sampleRate: entry.sampleRate, frameLength: entry.frameLength })));
  return Object.freeze({
    air,
    sourceSetSha256: vfs.sourceSetSha256,
    localCoord: LOCAL_COORD,
    contentLicense: 'user-local',
    soundBankSha256: soundBank?.sourceSha256 ?? null,
    sounds,
    sprites: assets.sprites,
    palettes: assets.palettes,
    rendererSprites: assets.rendererSprites,
    rendererPalettes: assets.rendererPalettes,
    spriteById: assets.spriteById,
    paletteById: assets.paletteById,
  });
}

export async function loadMugenFightFxFromFileList(files: FileList | readonly File[], signal?: AbortSignal): Promise<MugenFightFxModel> {
  const candidates = Array.from(files) as BrowserFile[];
  const selected = [selectBrowserFile(candidates, AIR_NAME), selectBrowserFile(candidates, SFF_NAME), selectOptionalBrowserFile(candidates, SND_NAME)].filter((value): value is BrowserFile => value !== null);
  const inputs: MugenVfsInput[] = [];
  for (const file of selected) {
    signal?.throwIfAborted();
    if (file.size > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) throw new RangeError(`${file.name} 超过 MUGEN 单文件大小限制。`);
    inputs.push(Object.freeze({ path: asciiCaseFold(file.name), bytes: await file.arrayBuffer() }));
  }
  return loadMugenFightFx(Object.freeze(inputs), signal);
}

export async function loadMugenFightFxFromDirectoryHandle(handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<MugenFightFxModel> {
  const direct = await findFightFxHandles(handle, signal);
  const scope = direct !== null ? direct : await findDataDirectoryHandles(handle, signal);
  if (scope === null) throw new TypeError('所选目录没有同时包含 fightfx.air 与 fightfx.sff。请选择 MUGEN 根目录或 data 目录。');
  const inputs: MugenVfsInput[] = [];
  for (const [name, fileHandle] of [[AIR_NAME, scope.air], [SFF_NAME, scope.sff], [SND_NAME, scope.snd]] as const) {
    if (fileHandle === null) continue;
    signal?.throwIfAborted();
    const file = await fileHandle.getFile();
    if (file.size > MUGEN_LIMITS.directoryAndArchive.maxSingleFileBytes) throw new RangeError(`${name} 超过 MUGEN 单文件大小限制。`);
    inputs.push(Object.freeze({ path: name, bytes: await file.arrayBuffer() }));
  }
  return loadMugenFightFx(Object.freeze(inputs), signal);
}

function selectInputs(inputs: readonly MugenVfsInput[]): readonly MugenVfsInput[] {
  const select = (name: string): MugenVfsInput => {
    const matches = inputs.filter(input => asciiCaseFold(baseName(input.path)) === name);
    if (matches.length !== 1) throw new TypeError(matches.length === 0 ? `FightFX 缺少 ${name}。` : `FightFX 包含多个 ${name}，无法确定资源归属。`);
    const input = matches[0]!;
    return Object.freeze({ path: name, bytes: input.bytes, ...(input.symlink === undefined ? {} : { symlink: input.symlink }) });
  };
  const optional = (name: string): MugenVfsInput | null => { const matches = inputs.filter(input => asciiCaseFold(baseName(input.path)) === name); if (matches.length > 1) throw new TypeError(`FightFX 包含多个 ${name}，无法确定资源归属。`); const input = matches[0]; return input === undefined ? null : Object.freeze({ path: name, bytes: input.bytes, ...(input.symlink === undefined ? {} : { symlink: input.symlink }) }); };
  return Object.freeze([select(AIR_NAME), select(SFF_NAME), optional(SND_NAME)].filter((value): value is MugenVfsInput => value !== null));
}

function selectBrowserFile(files: readonly BrowserFile[], name: string): BrowserFile {
  const matches = files.filter(file => asciiCaseFold(baseName(file.webkitRelativePath || file.name)) === name);
  if (matches.length !== 1) throw new TypeError(matches.length === 0 ? `所选目录缺少 ${name}。` : `所选目录中存在多个 ${name}。`);
  return matches[0]!;
}
function selectOptionalBrowserFile(files: readonly BrowserFile[], name: string): BrowserFile | null { const matches = files.filter(file => asciiCaseFold(baseName(file.webkitRelativePath || file.name)) === name); if (matches.length > 1) throw new TypeError(`所选目录中存在多个 ${name}。`); return matches[0] ?? null; }

async function findFightFxHandles(handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<{ readonly air: FileSystemFileHandle; readonly sff: FileSystemFileHandle; readonly snd: FileSystemFileHandle | null } | null> {
  const entries: FileSystemHandle[] = [];
  const iterable = handle as FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
  for await (const entry of iterable.values()) { signal?.throwIfAborted(); entries.push(entry); }
  const files = (name: string) => entries.filter((entry): entry is FileSystemFileHandle => entry.kind === 'file' && asciiCaseFold(entry.name) === name);
  const air = files(AIR_NAME); const sff = files(SFF_NAME); const snd = files(SND_NAME);
  if (air.length > 1 || sff.length > 1 || snd.length > 1) throw new TypeError('所选目录包含大小写冲突的 FightFX 文件。');
  return air.length === 1 && sff.length === 1 ? Object.freeze({ air: air[0]!, sff: sff[0]!, snd: snd[0] ?? null }) : null;
}

async function findDataDirectoryHandles(handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<{ readonly air: FileSystemFileHandle; readonly sff: FileSystemFileHandle; readonly snd: FileSystemFileHandle | null } | null> {
  const iterable = handle as FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
  const dataDirectories: FileSystemDirectoryHandle[] = [];
  for await (const entry of iterable.values()) if (entry.kind === 'directory' && asciiCaseFold(entry.name) === 'data') dataDirectories.push(entry as FileSystemDirectoryHandle);
  if (dataDirectories.length > 1) throw new TypeError('所选目录包含大小写冲突的 data 目录。');
  return dataDirectories[0] === undefined ? null : findFightFxHandles(dataDirectories[0], signal);
}

function createFightFxAssets(sff: MugenSffBank) {
  const paletteByIndex = new Map<number, MugenViewerPalette>();
  const resolvePalette = (index: number, ancestors = new Set<number>()): MugenViewerPalette => {
    const existing = paletteByIndex.get(index); if (existing) return existing;
    if (ancestors.has(index)) throw new TypeError(`FightFX palette link cycle at ${index}.`);
    const source = sff.palettes[index]; if (!source) throw new TypeError(`FightFX palette ${index} is missing.`);
    ancestors.add(index);
    const root = source.linkedToSourceIndex === null ? null : resolvePalette(source.linkedToSourceIndex, ancestors);
    ancestors.delete(index);
    const id = paletteId(source);
    const palette = Object.freeze({ id, renderPaletteId: root?.renderPaletteId ?? id, sourcePath: sff.canonicalPath, group: source.group, item: source.item, colorCount: root?.colorCount ?? source.colorCount, rgba: root?.rgba ?? source.rgba, source: source.source });
    paletteByIndex.set(index, palette); return palette;
  };
  const palettes = Object.freeze(sff.palettes.map((_, index) => resolvePalette(index)));
  const paletteById = new Map(palettes.map(value => [value.id, value]));

  const spriteByIndex = new Map<number, MugenViewerSprite>();
  const resolveSprite = (index: number, ancestors = new Set<number>()): MugenViewerSprite => {
    const existing = spriteByIndex.get(index); if (existing) return existing;
    if (ancestors.has(index)) throw new TypeError(`FightFX sprite link cycle at ${index}.`);
    const source = sff.sprites[index]; if (!source) throw new TypeError(`FightFX sprite ${index} is missing.`);
    ancestors.add(index);
    const root = source.linkedToSourceIndex === null ? null : resolveSprite(source.linkedToSourceIndex, ancestors);
    ancestors.delete(index);
    const id = spriteId(source);
    const pixels = root?.pixels ?? source.pixels;
    if (pixels === null) throw new TypeError(`FightFX sprite ${source.group},${source.item} has no pixel owner.`);
    const sprite = Object.freeze({ id, renderSpriteId: root?.renderSpriteId ?? id, sourcePath: sff.canonicalPath, group: source.group, item: source.item, width: root?.width ?? source.width, height: root?.height ?? source.height, axisX: source.axisX, axisY: source.axisY, format: root?.format ?? source.pixelFormat, pixels, defaultPaletteId: source.paletteSourceIndex === null ? null : resolvePalette(source.paletteSourceIndex).id });
    spriteByIndex.set(index, sprite); return sprite;
  };
  const sprites = Object.freeze(sff.sprites.map((_, index) => resolveSprite(index)));
  const spriteById = new Map(sprites.map(value => [value.id, value]));
  const spriteByKey = new Map(sprites.map(value => [`${value.group}:${value.item}`, value]));
  const rendererSprites = Object.freeze(uniqueSprites(sprites));
  const rendererPalettes = Object.freeze(uniquePalettes(palettes));
  return Object.freeze({ sprites, palettes, rendererSprites, rendererPalettes, spriteById, paletteById, spriteByKey });
}

function uniqueSprites(sprites: readonly MugenViewerSprite[]): readonly MugenRendererSpriteAsset[] {
  return [...new Map(sprites.map(sprite => [sprite.renderSpriteId, Object.freeze({ id: sprite.renderSpriteId, width: sprite.width, height: sprite.height, format: sprite.format, pixels: sprite.pixels })])).values()].sort((left, right) => compareMugenStrings(left.id, right.id));
}
function uniquePalettes(palettes: readonly MugenViewerPalette[]): readonly MugenRendererPaletteAsset[] {
  return [...new Map(palettes.map(palette => [palette.renderPaletteId, Object.freeze({ id: palette.renderPaletteId, colorCount: palette.colorCount, rgba: palette.rgba })])).values()].sort((left, right) => compareMugenStrings(left.id, right.id));
}
function spriteId(value: MugenDecodedSprite): string { return `fightfx:sprite:${value.group}:${value.item}`; }
function paletteId(value: MugenDecodedPalette): string { return `fightfx:palette:${value.sourceIndex}`; }
function baseName(path: string): string { const normalized = path.replaceAll('\\', '/'); return normalized.slice(normalized.lastIndexOf('/') + 1); }
function encodeBase64(bytes: Uint8Array): string { let result = ''; const chunkSize = 0x8000; for (let offset = 0; offset < bytes.length; offset += chunkSize) result += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize))); return btoa(result); }
