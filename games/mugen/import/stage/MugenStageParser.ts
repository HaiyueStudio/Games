import { createMugenPackage } from '../../package/builder';
import { parseMugenAir } from '../air/AirParser';
import type { MugenAirAction } from '../air/types';
import { importMugenSpriteContributions, spriteId } from '../sff/MugenSpritePackage';
import { buildMugenImportGraph } from '../text/DependencyGraph';
import type { MugenTextDocument, MugenTextToken } from '../text/MugenTextParser';
import type { MugenVfs } from '../vfs/MugenVfs';
import { resolveMugenReference, unquoteMugenValue } from '../vfs/path';
import { createMugenCharacterModel, type MugenRenderAssetModel, type MugenViewerPalette, type MugenViewerSprite } from '../../viewer/MugenCharacterModel';

export type MugenStageBackgroundType = 'normal' | 'parallax' | 'anim';
export type MugenStageTransparency = 'none' | 'add' | 'add1' | 'addalpha' | 'sub';

export interface MugenStageMusic {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly volume: number;
}

export interface MugenStageBackground {
  readonly id: string;
  readonly type: MugenStageBackgroundType;
  readonly spriteGroup: number;
  readonly spriteItem: number;
  readonly spriteId: string;
  readonly animation: MugenAirAction | null;
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
  readonly definitionSource: 'authored' | 'inferred';
  readonly sourceSetSha256: string;
  readonly seed: string;
  readonly name: string;
  readonly displayName: string;
  readonly authorName: string;
  readonly mugenVersion: string;
  readonly localCoord: readonly [number, number];
  /** WinMUGEN `hires = 1`: background pixels and BG coordinates use a 640x480 grid while gameplay remains 320x240. */
  readonly legacyHighResolution: boolean;
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
  readonly music: MugenStageMusic | null;
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
  const inferredDefinition = boolean(info, 'haiyue.generated', false);
  const inferredLocalCoord = inferLocalCoord([...spriteByKey.values()]);
  const localCoord = pair(stage, 'localcoord', inferredDefinition ? inferredLocalCoord : [320, 240], positiveInteger, 'StageInfo.localcoord');
  const legacyHighResolution = !stage.has('localcoord') && boolean(stage, 'hires', false);
  const inferredCameraSpan = Math.max(0, ([...spriteByKey.values()].reduce((width, sprite) => Math.max(width, sprite.width), localCoord[0]) - localCoord[0]) / 2);
  const playerBounds = orderedPair([number(player, 'leftbound', -1_000), number(player, 'rightbound', 1_000)], 'PlayerInfo movement bounds');
  const horizontalBounds = orderedPair([number(camera, 'boundleft', inferredDefinition ? -inferredCameraSpan : -160), number(camera, 'boundright', inferredDefinition ? inferredCameraSpan : 160)], 'Camera horizontal bounds');
  const verticalBounds = orderedPair([number(camera, 'boundhigh', -25), number(camera, 'boundlow', 0)], 'Camera vertical bounds');
  const animations = parseStageAnimations(entry, spriteByKey);
  const backgrounds = inferredDefinition ? inferStageBackgrounds([...spriteByKey.values()], localCoord) : parseBackgrounds(entry, spriteByKey, animations);
  const music = parseStageMusic(entry, vfs);
  return Object.freeze({
    id: normalizedId, entryDef: graph.entryDef, definitionSource: inferredDefinition ? 'inferred' : 'authored', sourceSetSha256: graph.sourceSetSha256, seed: `mugen-stage:${graph.sourceSetSha256}`,
    name: text(info, 'name', id), displayName: text(info, 'displayname', text(info, 'name', id)), authorName: text(info, 'author', ''), mugenVersion: text(info, 'mugenversion', ''),
    localCoord, legacyHighResolution, stageScale: Object.freeze([positive(number(stage, 'xscale', 1), 'StageInfo.xscale'), positive(number(stage, 'yscale', 1), 'StageInfo.yscale')]) as readonly [number, number], zOffset: number(stage, 'zoffset', localCoord[1] * .8), autoTurn: boolean(stage, 'autoturn', true), resetBackground: boolean(stage, 'resetbg', true),
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
    backgrounds, music, renderModel, spriteByKey,
  });
}

function inferLocalCoord(sprites: readonly MugenViewerSprite[]): readonly [number, number] {
  const largest = largestSprite(sprites);
  if (largest === null) return Object.freeze([320, 240]);
  const ratio = largest.width / largest.height;
  if (largest.width >= 1_000 && largest.height >= 600) {
    if (Math.abs(ratio - 16 / 9) < .2) return Object.freeze([1280, 720]);
    return Object.freeze([640, 480]);
  }
  return Object.freeze([320, 240]);
}

function inferStageBackgrounds(sprites: readonly MugenViewerSprite[], localCoord: readonly [number, number]): readonly MugenStageBackground[] {
  const drawable = sprites.filter(sprite => sprite.width > 16 || sprite.height > 16);
  const selected = drawable.length > 0 ? drawable : sprites;
  const base = largestSprite(selected);
  if (base === null) throw new TypeError('MUGEN stage SFF contains no renderable sprites for automatic DEF completion.');
  const baseStartX = base.axisX - base.width / 2;
  const cropTallBase = base.height > localCoord[1] * 1.25 && Math.abs(base.axisY) < base.height * .2;
  const baseStartY = cropTallBase ? base.axisY + localCoord[1] - base.height : base.axisY;
  const oversizedBase = base.width > localCoord[0] * 1.5 && base.height > localCoord[1] * 1.5;
  const groups = new Map<number, MugenViewerSprite[]>();
  for (const sprite of selected) { const values = groups.get(sprite.group) ?? []; values.push(sprite); groups.set(sprite.group, values); }
  const result: MugenStageBackground[] = [];
  let actionNumber = -10_000;
  for (const [group, values] of groups) {
    const groupSprites = [...values].sort((left, right) => left.item - right.item || left.id.localeCompare(right.id, 'en'));
    const animated = coherentAnimationGroup(groupSprites);
    if (animated) {
      const animation = inferredAnimation(actionNumber--, groupSprites);
      const baseGroup = groupSprites.includes(base);
      result.push(inferredBackground(`BG inferred animation ${group}`, groupSprites[0]!, animation, placement(baseGroup ? base : groupSprites[0]!, base, baseStartX, baseStartY, oversizedBase, localCoord), baseGroup));
      continue;
    }
    for (const sprite of groupSprites) result.push(inferredBackground(`BG inferred sprite ${sprite.group},${sprite.item}`, sprite, null, placement(sprite, base, baseStartX, baseStartY, oversizedBase, localCoord), sprite === base));
  }
  return Object.freeze(result);
}

function coherentAnimationGroup(sprites: readonly MugenViewerSprite[]): boolean {
  if (sprites.length < 2 || sprites.length > 256) return false;
  const widths = sprites.map(sprite => sprite.width); const heights = sprites.map(sprite => sprite.height);
  const xAxes = sprites.map(sprite => sprite.axisX); const yAxes = sprites.map(sprite => sprite.axisY);
  const widthRatio = Math.max(...widths) / Math.max(1, Math.min(...widths)); const heightRatio = Math.max(...heights) / Math.max(1, Math.min(...heights));
  const xSpread = Math.max(...xAxes) - Math.min(...xAxes); const ySpread = Math.max(...yAxes) - Math.min(...yAxes);
  return widthRatio <= 2 && heightRatio <= 2
    && xSpread <= Math.max(64, Math.max(...widths) * .35)
    && ySpread <= Math.max(64, Math.max(...heights) * .35);
}

function inferredAnimation(number: number, sprites: readonly MugenViewerSprite[]): MugenAirAction {
  const elements = Object.freeze(sprites.map((sprite, index) => Object.freeze({
    index, spriteGroup: sprite.group, spriteItem: sprite.item, spriteId: sprite.id, offsetX: 0, offsetY: 0, durationTicks: 6,
    flipX: false, flipY: false, blend: Object.freeze({ mode: 'opaque' as const, sourceAlpha: 256, destinationAlpha: 0 }), scaleX: 1, scaleY: 1, angleDegrees: 0,
    interpolateToThis: Object.freeze([]), clsn1: Object.freeze([]), clsn2: Object.freeze([]), byteOffset: 0, line: 0, column: 0,
  })));
  const totalTicks = elements.length * 6;
  return Object.freeze({ number, loopStart: 0, elements, totalTicks, preLoopTicks: 0, loopTicks: totalTicks, byteOffset: 0, line: 0, column: 0 });
}

function inferredBackground(id: string, sprite: MugenViewerSprite, animation: MugenAirAction | null, start: readonly [number, number], base: boolean): MugenStageBackground {
  return Object.freeze({
    id, type: animation === null ? 'normal' : 'anim', spriteGroup: sprite.group, spriteItem: sprite.item, spriteId: sprite.id, animation, layer: 0,
    start, delta: Object.freeze([1, 1]) as readonly [number, number], velocity: Object.freeze([0, 0]) as readonly [number, number], tile: Object.freeze([0, 0]) as readonly [number, number], tileSpacing: Object.freeze([0, 0]) as readonly [number, number], mask: !base,
    transparency: 'none', alpha: Object.freeze([256, 0]) as readonly [number, number], xScale: Object.freeze([1, 1]) as readonly [number, number], yScaleStart: 100, yScaleDelta: 0,
  });
}

function placement(sprite: MugenViewerSprite, base: MugenViewerSprite, baseStartX: number, baseStartY: number, oversizedBase: boolean, localCoord: readonly [number, number]): readonly [number, number] {
  if (sprite === base || !oversizedBase) return Object.freeze([Math.fround(baseStartX), Math.fround(baseStartY)]);
  return Object.freeze([0, Math.fround(localCoord[1] * .82)]);
}

function largestSprite(sprites: readonly MugenViewerSprite[]): MugenViewerSprite | null {
  return sprites.reduce<MugenViewerSprite | null>((largest, sprite) => largest === null || sprite.width * sprite.height > largest.width * largest.height ? sprite : largest, null);
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

function parseBackgrounds(document: MugenTextDocument, sprites: ReadonlyMap<string, MugenViewerSprite>, animations: ReadonlyMap<number, MugenAirAction>): readonly MugenStageBackground[] {
  const result: MugenStageBackground[] = [];
  for (const [sectionIndex, source] of document.sections.entries()) {
    if (!source.foldedName.startsWith('bg ') || source.foldedName === 'bgdef') continue;
    const values = sectionAt(document, sectionIndex);
    const rawType = text(values, 'type', 'normal').toLowerCase(); if (rawType !== 'normal' && rawType !== 'parallax' && rawType !== 'anim') throw new TypeError(`Unsupported MUGEN stage background type ${rawType}.`);
    const animationNumber = rawType === 'anim' ? integer(number(values, 'actionno', Number.NaN), `${source.name}.actionno`) : null;
    const animation = animationNumber === null ? null : animations.get(animationNumber);
    if (animationNumber !== null && animation === undefined) throw new RangeError(`MUGEN stage ${source.name} references missing action ${animationNumber}.`);
    const spriteKey = rawType === 'anim'
      ? firstDrawableSprite(animation!)
      : pair(values, 'spriteno', null, integer, `${source.name}.spriteno`);
    if (spriteKey === null) continue;
    const sprite = sprites.get(`${spriteKey[0]},${spriteKey[1]}`);
    if (sprite === undefined) throw new RangeError(`MUGEN stage ${source.name} references missing sprite ${spriteKey[0]},${spriteKey[1]}.`);
    const rawTrans = text(values, 'trans', 'none').toLowerCase(); if (!['none', 'add', 'add1', 'addalpha', 'sub'].includes(rawTrans)) throw new TypeError(`Unsupported MUGEN stage transparency ${rawTrans}.`);
    const rawLayer = integer(number(values, 'layerno', 0), `${source.name}.layerno`); if (rawLayer !== 0 && rawLayer !== 1) throw new RangeError(`${source.name}.layerno must be 0 or 1.`);
    const xScale = pair(values, 'xscale', [1, 1], positive, `${source.name}.xscale`);
    result.push(Object.freeze({
      id: `${source.name}:${sectionIndex}`, type: rawType, spriteGroup: spriteKey[0], spriteItem: spriteKey[1], spriteId: sprite.id, animation: animation ?? null, layer: rawLayer,
      start: pair(values, 'start', [0, 0], finite, `${source.name}.start`), delta: pair(values, 'delta', [1, 1], finite, `${source.name}.delta`), velocity: pairWithOptionalY(values, 'velocity', [0, 0], finite, `${source.name}.velocity`),
      tile: pair(values, 'tile', [0, 0], integer, `${source.name}.tile`), tileSpacing: pair(values, 'tilespacing', [0, 0], finite, `${source.name}.tilespacing`), mask: boolean(values, 'mask', false),
      transparency: rawTrans as MugenStageTransparency, alpha: pair(values, 'alpha', [256, 0], value => range(value, 0, 256, `${source.name}.alpha`), `${source.name}.alpha`), xScale,
      yScaleStart: positive(number(values, 'yscalestart', 100), `${source.name}.yscalestart`), yScaleDelta: number(values, 'yscaledelta', 0),
    }));
  }
  if (result.length === 0) throw new TypeError('MUGEN stage contains no renderable [BG ...] elements.');
  return Object.freeze(result);
}

function parseStageAnimations(document: MugenTextDocument, sprites: ReadonlyMap<string, MugenViewerSprite>): ReadonlyMap<number, MugenAirAction> {
  const selected = document.sections
    .map((section, index) => ({ section, index }))
    .filter(value => /^begin\s+action\s+[+-]?\d+$/iu.test(value.section.name.trim()));
  if (selected.length === 0) return new Map();
  const remapped = new Map(selected.map((value, index) => [value.index, index]));
  const sections = Object.freeze(selected.map(value => Object.freeze({ ...value.section, tokenStart: 0, tokenEnd: 0 })));
  const tokens: MugenTextToken[] = [];
  for (const token of document.tokens) {
    if (token.kind !== 'assignment' && token.kind !== 'directive') continue;
    const sectionIndex = token.sectionIndex === null ? undefined : remapped.get(token.sectionIndex);
    if (sectionIndex === undefined) continue;
    tokens.push(Object.freeze({ ...token, sectionIndex }));
  }
  const bank = parseMugenAir(Object.freeze({ ...document, sections, tokens: Object.freeze(tokens) }), {
    spriteResolver: (group, item) => {
      const sprite = sprites.get(`${group},${item}`);
      return sprite === undefined ? null : Object.freeze({ id: sprite.id, axisX: sprite.axisX, axisY: sprite.axisY });
    },
  });
  return new Map(bank.actions.map(action => [action.number, action]));
}

function firstDrawableSprite(action: MugenAirAction): readonly [number, number] | null {
  const element = action.elements.find(value => value.spriteId !== null && value.spriteGroup >= 0 && value.spriteItem >= 0);
  return element === undefined ? null : Object.freeze([element.spriteGroup, element.spriteItem]);
}

function parseStageMusic(document: MugenTextDocument, vfs: MugenVfs): MugenStageMusic | null {
  const music = section(document, 'music');
  const rawPath = text(music, 'bgmusic', '');
  if (rawPath === '') return null;
  const normalized = unquoteMugenValue(rawPath).trim().replace(/\\/gu, '/');
  const relative = (() => { try { return resolveMugenReference(document.canonicalPath, normalized); } catch { return ''; } })();
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
  const file = (relative === '' ? undefined : vfs.get(relative))
    ?? vfs.get(normalized)
    ?? vfs.files.find(value => value.foldedPath === basename || value.foldedPath.endsWith(`/${basename}`));
  if (file === undefined) return null;
  return Object.freeze({
    path: file.canonicalPath,
    sha256: file.sha256,
    bytes: file.read(),
    volume: Math.fround(range(number(music, 'bgvolume', 255), 0, 255, 'Music.bgvolume') / 255),
  });
}

type Values = ReadonlyMap<string, string>;
function section(document: MugenTextDocument, name: string): Values { const index = document.sections.findIndex(value => value.foldedName === name); return index < 0 ? new Map() : sectionAt(document, index); }
function sectionAt(document: MugenTextDocument, index: number): Values { const values = new Map<string, string>(); for (const token of document.tokens) if (token.kind === 'assignment' && token.sectionIndex === index) values.set(token.foldedKey, unquoteMugenValue(token.value).trim()); return values; }
function text(values: Values, key: string, fallback: string): string { const value = values.get(key); return value === undefined || value.trim() === '' ? fallback : value.trim(); }
function number(values: Values, key: string, fallback: number): number { const source = values.get(key); if (source === undefined || source.trim() === '') return fallback; const value = Number(source.trim()); return finite(value, key); }
function boolean(values: Values, key: string, fallback: boolean): boolean { const value = number(values, key, fallback ? 1 : 0); if (value !== 0 && value !== 1) throw new RangeError(`${key} must be 0 or 1.`); return value === 1; }
function pair<T extends readonly [number, number] | null>(values: Values, key: string, fallback: T, validate: (value: number, label: string) => number, label: string): T extends null ? readonly [number, number] | null : readonly [number, number] { const source = values.get(key); if (source === undefined || source.trim() === '') return fallback as never; const parts = source.split(',').map(value => value.trim()); if (parts.length !== 2) throw new TypeError(`${label} must contain two values.`); return Object.freeze([validate(Number(parts[0]), `${label}.x`), validate(Number(parts[1]), `${label}.y`)]) as never; }
function pairWithOptionalY(values: Values, key: string, fallback: readonly [number, number], validate: (value: number, label: string) => number, label: string): readonly [number, number] { const source = values.get(key); if (source === undefined || source.trim() === '') return fallback; const parts = source.split(',').map(value => value.trim()); if (parts.length < 1 || parts.length > 2) throw new TypeError(`${label} must contain one or two values.`); return Object.freeze([validate(Number(parts[0]), `${label}.x`), parts.length === 1 ? fallback[1] : validate(Number(parts[1]), `${label}.y`)]); }
function finite(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new RangeError(`${label} must be finite and bounded.`); return Math.fround(value); }
function integer(value: number, label: string): number { const normalized = finite(value, label); if (!Number.isSafeInteger(normalized)) throw new TypeError(`${label} must be an integer.`); return normalized; }
function positive(value: number, label: string): number { const normalized = finite(value, label); if (normalized <= 0) throw new RangeError(`${label} must be positive.`); return normalized; }
function positiveInteger(value: number, label: string): number { return integer(positive(value, label), label); }
function nonNegative(value: number, label: string): number { const normalized = finite(value, label); if (normalized < 0) throw new RangeError(`${label} cannot be negative.`); return normalized; }
function range(value: number, minimum: number, maximum: number, label: string): number { const normalized = finite(value, label); if (normalized < minimum || normalized > maximum) throw new RangeError(`${label} must be from ${minimum} to ${maximum}.`); return normalized; }
function orderedPair(value: readonly [number, number], label: string): readonly [number, number] { if (value[0] > value[1]) throw new RangeError(`${label} must be ordered.`); return Object.freeze([Math.fround(value[0]), Math.fround(value[1])]); }
function facing(values: Values, key: string, fallback: -1 | 1): -1 | 1 { const value = number(values, key, fallback); if (value !== -1 && value !== 1) throw new RangeError(`${key} must be -1 or 1.`); return value; }
function identifier(value: string): string { if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(value)) throw new TypeError('MUGEN stage id is invalid.'); return value; }
