import { createMugenPackage } from '../../package/builder';
import { importMugenSpriteContributions, spriteId } from '../sff/MugenSpritePackage';
import { buildMugenImportGraph } from '../text/DependencyGraph';
import type { MugenTextDocument } from '../text/MugenTextParser';
import type { MugenVfs } from '../vfs/MugenVfs';
import { unquoteMugenValue } from '../vfs/path';
import { createMugenCharacterModel, type MugenRenderAssetModel, type MugenViewerPalette, type MugenViewerSprite } from '../../viewer/MugenCharacterModel';

export type MugenStageBackgroundType = 'normal' | 'parallax';
export type MugenStageTransparency = 'none' | 'add' | 'add1' | 'addalpha' | 'sub';

export interface MugenStageBackground {
  readonly id: string;
  readonly type: MugenStageBackgroundType;
  readonly spriteGroup: number;
  readonly spriteItem: number;
  readonly spriteId: string;
  readonly layer: 0 | 1;
  readonly start: readonly [number, number];
  readonly delta: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly tile: readonly [number, number];
  readonly tileSpacing: readonly [number, number];
  readonly mask: boolean;
  readonly transparency: MugenStageTransparency;
  readonly alpha: readonly [number, number];
  readonly xScale: readonly [number, number];
  readonly yScaleStart: number;
  readonly yScaleDelta: number;
}

export interface MugenStageModel {
  readonly id: string;
  readonly entryDef: string;
  readonly sourceSetSha256: string;
  readonly seed: string;
  readonly name: string;
  readonly displayName: string;
  readonly authorName: string;
  readonly mugenVersion: string;
  readonly localCoord: readonly [number, number];
  readonly stageScale: readonly [number, number];
  readonly zOffset: number;
  readonly autoTurn: boolean;
  readonly resetBackground: boolean;
  readonly playerBounds: readonly [number, number];
  readonly spawn: readonly [
    Readonly<{ position: readonly [number, number]; facing: -1 | 1 }>,
    Readonly<{ position: readonly [number, number]; facing: -1 | 1 }>,
  ];
  readonly camera: Readonly<{
    start: readonly [number, number];
    horizontalBounds: readonly [number, number];
    verticalBounds: readonly [number, number];
    tension: number;
    verticalFollow: number;
    floorTension: number;
    zoom: readonly [minimum: number, maximum: number];
    screenMargins: readonly [left: number, right: number];
  }>;
  readonly backgrounds: readonly MugenStageBackground[];
  readonly renderModel: MugenRenderAssetModel;
  readonly spriteByKey: ReadonlyMap<string, MugenViewerSprite>;
}

export async function importMugenStage(vfs: MugenVfs, id: string, entryDef: string, signal?: AbortSignal): Promise<MugenStageModel> {
  const normalizedId = identifier(id);
  const graph = await buildMugenImportGraph(vfs, { entryDef, entryKind: 'stage', ...(signal === undefined ? {} : { signal }) });
  const entry = graph.resources.find(resource => resource.canonicalPath === graph.entryDef)?.document;
  if (entry === undefined) throw new TypeError('MUGEN stage DEF did not produce a text document.');
  const sprites = await importMugenSpriteContributions(graph, signal);
  if (sprites.banks.length !== 1) throw new RangeError(`MUGEN stage must declare exactly one SFF bank; observed ${sprites.banks.length}.`);
  const packageValue = createMugenPackage(graph, { contentRole: 'local-content', contributions: sprites.contributions });
  const baseRenderModel = createMugenCharacterModel(packageValue, { name: null, displayName: null, author: null, mugenVersion: null, localCoord: null, entryDef: graph.entryDef, dependencies: Object.freeze(graph.resources.map(value => value.canonicalPath)) });
  const renderModel = namespaceRenderModel(baseRenderModel, `stage:${normalizedId}:`);
  const spriteByKey = new Map<string, MugenViewerSprite>();
  for (const sprite of sprites.banks[0]!.sprites) {
    const modelSprite = renderModel.spriteById.get(`stage:${normalizedId}:${spriteId(sprites.banks[0]!.canonicalPath, sprite.sourceIndex)}`);
    if (modelSprite !== undefined) spriteByKey.set(`${sprite.group},${sprite.item}`, modelSprite);
  }
  const info = section(entry, 'info'); const camera = section(entry, 'camera'); const player = section(entry, 'playerinfo'); const bound = section(entry, 'bound'); const stage = section(entry, 'stageinfo');
  const localCoord = pair(stage, 'localcoord', [320, 240], positiveInteger, 'StageInfo.localcoord');
  const playerBounds = orderedPair([number(player, 'leftbound', -1_000), number(player, 'rightbound', 1_000)], 'PlayerInfo movement bounds');
  const horizontalBounds = orderedPair([number(camera, 'boundleft', -160), number(camera, 'boundright', 160)], 'Camera horizontal bounds');
  const verticalBounds = orderedPair([number(camera, 'boundhigh', -25), number(camera, 'boundlow', 0)], 'Camera vertical bounds');
  const backgrounds = parseBackgrounds(entry, spriteByKey);
  return Object.freeze({
    id: normalizedId, entryDef: graph.entryDef, sourceSetSha256: graph.sourceSetSha256, seed: `mugen-stage:${graph.sourceSetSha256}`,
    name: text(info, 'name', id), displayName: text(info, 'displayname', text(info, 'name', id)), authorName: text(info, 'author', ''), mugenVersion: text(info, 'mugenversion', ''),
    localCoord, stageScale: Object.freeze([positive(number(stage, 'xscale', 1), 'StageInfo.xscale'), positive(number(stage, 'yscale', 1), 'StageInfo.yscale')]) as readonly [number, number], zOffset: number(stage, 'zoffset', localCoord[1] * .8), autoTurn: boolean(stage, 'autoturn', true), resetBackground: boolean(stage, 'resetbg', true),
    playerBounds,
    spawn: Object.freeze([
      Object.freeze({ position: Object.freeze([number(player, 'p1startx', -70), number(player, 'p1starty', 0)]) as readonly [number, number], facing: facing(player, 'p1facing', 1) }),
      Object.freeze({ position: Object.freeze([number(player, 'p2startx', 70), number(player, 'p2starty', 0)]) as readonly [number, number], facing: facing(player, 'p2facing', -1) }),
    ]) as MugenStageModel['spawn'],
    camera: Object.freeze({
      start: Object.freeze([number(camera, 'startx', 0), number(camera, 'starty', 0)]) as readonly [number, number], horizontalBounds, verticalBounds,
      tension: nonNegative(number(camera, 'tension', 50), 'Camera.tension'), verticalFollow: range(number(camera, 'verticalfollow', .2), 0, 1, 'Camera.verticalfollow'), floorTension: nonNegative(number(camera, 'floortension', 0), 'Camera.floortension'),
      zoom: Object.freeze([positive(number(camera, 'zoomout', 1), 'Camera.zoomout'), positive(number(camera, 'zoomin', 1), 'Camera.zoomin')]) as readonly [number, number],
      screenMargins: Object.freeze([nonNegative(number(bound, 'screenleft', 15), 'Bound.screenleft'), nonNegative(number(bound, 'screenright', 15), 'Bound.screenright')]) as readonly [number, number],
    }),
    backgrounds, renderModel, spriteByKey,
  });
}

function namespaceRenderModel(model: MugenRenderAssetModel, prefix: string): MugenRenderAssetModel {
  const palettes = Object.freeze(model.palettes.map(palette => Object.freeze({ ...palette, id: `${prefix}${palette.id}`, renderPaletteId: `${prefix}${palette.renderPaletteId}` }) satisfies MugenViewerPalette));
  const paletteById = new Map(palettes.map(palette => [palette.id, palette]));
  const sprites = Object.freeze(model.sprites.map(sprite => Object.freeze({ ...sprite, id: `${prefix}${sprite.id}`, renderSpriteId: `${prefix}${sprite.renderSpriteId}`, defaultPaletteId: sprite.defaultPaletteId === null ? null : `${prefix}${sprite.defaultPaletteId}` }) satisfies MugenViewerSprite));
  return Object.freeze({
    sprites, palettes,
    rendererSprites: Object.freeze(model.rendererSprites.map(sprite => Object.freeze({ ...sprite, id: `${prefix}${sprite.id}` }))),
    rendererPalettes: Object.freeze(model.rendererPalettes.map(palette => Object.freeze({ ...palette, id: `${prefix}${palette.id}` }))),
    spriteById: new Map(sprites.map(sprite => [sprite.id, sprite])), paletteById,
  });
}

function parseBackgrounds(document: MugenTextDocument, sprites: ReadonlyMap<string, MugenViewerSprite>): readonly MugenStageBackground[] {
  const result: MugenStageBackground[] = [];
  for (const [sectionIndex, source] of document.sections.entries()) {
    if (!source.foldedName.startsWith('bg ') || source.foldedName === 'bgdef') continue;
    const values = sectionAt(document, sectionIndex); const spriteKey = pair(values, 'spriteno', null, integer, `${source.name}.spriteno`);
    if (spriteKey === null) continue;
    const sprite = sprites.get(`${spriteKey[0]},${spriteKey[1]}`);
    if (sprite === undefined) throw new RangeError(`MUGEN stage ${source.name} references missing sprite ${spriteKey[0]},${spriteKey[1]}.`);
    const rawType = text(values, 'type', 'normal').toLowerCase(); if (rawType !== 'normal' && rawType !== 'parallax') throw new TypeError(`Unsupported MUGEN stage background type ${rawType}.`);
    const rawTrans = text(values, 'trans', 'none').toLowerCase(); if (!['none', 'add', 'add1', 'addalpha', 'sub'].includes(rawTrans)) throw new TypeError(`Unsupported MUGEN stage transparency ${rawTrans}.`);
    const rawLayer = integer(number(values, 'layerno', 0), `${source.name}.layerno`); if (rawLayer !== 0 && rawLayer !== 1) throw new RangeError(`${source.name}.layerno must be 0 or 1.`);
    const xScale = pair(values, 'xscale', [1, 1], positive, `${source.name}.xscale`);
    result.push(Object.freeze({
      id: `${source.name}:${sectionIndex}`, type: rawType, spriteGroup: spriteKey[0], spriteItem: spriteKey[1], spriteId: sprite.id, layer: rawLayer,
      start: pair(values, 'start', [0, 0], finite, `${source.name}.start`), delta: pair(values, 'delta', [1, 1], finite, `${source.name}.delta`), velocity: pair(values, 'velocity', [0, 0], finite, `${source.name}.velocity`),
      tile: pair(values, 'tile', [0, 0], integer, `${source.name}.tile`), tileSpacing: pair(values, 'tilespacing', [0, 0], finite, `${source.name}.tilespacing`), mask: boolean(values, 'mask', false),
      transparency: rawTrans as MugenStageTransparency, alpha: pair(values, 'alpha', [256, 0], value => range(value, 0, 256, `${source.name}.alpha`), `${source.name}.alpha`), xScale,
      yScaleStart: positive(number(values, 'yscalestart', 100), `${source.name}.yscalestart`), yScaleDelta: number(values, 'yscaledelta', 0),
    }));
  }
  if (result.length === 0) throw new TypeError('MUGEN stage contains no renderable [BG ...] elements.');
  return Object.freeze(result);
}

type Values = ReadonlyMap<string, string>;
function section(document: MugenTextDocument, name: string): Values { const index = document.sections.findIndex(value => value.foldedName === name); return index < 0 ? new Map() : sectionAt(document, index); }
function sectionAt(document: MugenTextDocument, index: number): Values { const values = new Map<string, string>(); for (const token of document.tokens) if (token.kind === 'assignment' && token.sectionIndex === index) values.set(token.foldedKey, unquoteMugenValue(token.value).trim()); return values; }
function text(values: Values, key: string, fallback: string): string { const value = values.get(key); return value === undefined || value.trim() === '' ? fallback : value.trim(); }
function number(values: Values, key: string, fallback: number): number { const source = values.get(key); if (source === undefined || source.trim() === '') return fallback; const value = Number(source.trim()); return finite(value, key); }
function boolean(values: Values, key: string, fallback: boolean): boolean { const value = number(values, key, fallback ? 1 : 0); if (value !== 0 && value !== 1) throw new RangeError(`${key} must be 0 or 1.`); return value === 1; }
function pair<T extends readonly [number, number] | null>(values: Values, key: string, fallback: T, validate: (value: number, label: string) => number, label: string): T extends null ? readonly [number, number] | null : readonly [number, number] { const source = values.get(key); if (source === undefined || source.trim() === '') return fallback as never; const parts = source.split(',').map(value => value.trim()); if (parts.length !== 2) throw new TypeError(`${label} must contain two values.`); return Object.freeze([validate(Number(parts[0]), `${label}.x`), validate(Number(parts[1]), `${label}.y`)]) as never; }
function finite(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new RangeError(`${label} must be finite and bounded.`); return Math.fround(value); }
function integer(value: number, label: string): number { const normalized = finite(value, label); if (!Number.isSafeInteger(normalized)) throw new TypeError(`${label} must be an integer.`); return normalized; }
function positive(value: number, label: string): number { const normalized = finite(value, label); if (normalized <= 0) throw new RangeError(`${label} must be positive.`); return normalized; }
function positiveInteger(value: number, label: string): number { return integer(positive(value, label), label); }
function nonNegative(value: number, label: string): number { const normalized = finite(value, label); if (normalized < 0) throw new RangeError(`${label} cannot be negative.`); return normalized; }
function range(value: number, minimum: number, maximum: number, label: string): number { const normalized = finite(value, label); if (normalized < minimum || normalized > maximum) throw new RangeError(`${label} must be from ${minimum} to ${maximum}.`); return normalized; }
function orderedPair(value: readonly [number, number], label: string): readonly [number, number] { if (value[0] > value[1]) throw new RangeError(`${label} must be ordered.`); return Object.freeze([Math.fround(value[0]), Math.fround(value[1])]); }
function facing(values: Values, key: string, fallback: -1 | 1): -1 | 1 { const value = number(values, key, fallback); if (value !== -1 && value !== 1) throw new RangeError(`${key} must be -1 or 1.`); return value; }
function identifier(value: string): string { if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value)) throw new TypeError('MUGEN stage id is invalid.'); return value; }
