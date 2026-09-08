import type { MugenAirSnapshot } from '../import/air/MugenAirRuntime';
import type { MugenHelperEntitySnapshot } from '../runtime/entities/MugenEntityAuthority';
import type { MugenEntityOutputState } from '../runtime/effects/MugenOutputAuthority';
import type { MugenRenderAssetModel } from '../viewer/MugenCharacterModel';

const basePaletteByModel = new WeakMap<MugenRenderAssetModel, string | null>();

export interface MugenScreenExplodLayoutRule {
  readonly explodId: number;
  readonly sourceY?: number;
  readonly positionScale: readonly [number, number];
  readonly positionOffset: readonly [number, number];
}

/** Applies an opt-in package layout transform around the screen center. */
export function placeMugenScreenExplod(position: readonly [number, number], explodId: number, localCoord: readonly [number, number], rules: readonly MugenScreenExplodLayoutRule[]): readonly [number, number] {
  const rule = rules.find(value => value.explodId === explodId && value.sourceY === position[1]) ?? rules.find(value => value.explodId === explodId && value.sourceY === undefined);
  if (rule === undefined) return position;
  const centerX = localCoord[0] / 2;
  return Object.freeze([
    centerX + (position[0] - centerX) * rule.positionScale[0] + rule.positionOffset[0],
    position[1] * rule.positionScale[1] + rule.positionOffset[1],
  ]);
}

/** Maps MUGEN screen coordinates without applying character [Size] sprite scale or camera movement. */
export function projectMugenScreenExplod(
  position: readonly [number, number],
  characterLocalCoord: readonly [number, number],
  stageLocalCoord: readonly [number, number],
  viewport: Readonly<{ scale: number; offsetX: number; offsetY: number }>,
): readonly [number, number] {
  const coordinateScale = viewport.scale * stageLocalCoord[0] / characterLocalCoord[0];
  return Object.freeze([
    viewport.offsetX + stageLocalCoord[0] * viewport.scale / 2 + (position[0] - characterLocalCoord[0] / 2) * coordinateScale,
    viewport.offsetY + position[1] * coordinateScale,
  ]);
}

/** Returns a selectable costume palette without treating embedded effect palettes as costumes. */
export function selectMugenCharacterPaletteId(model: MugenRenderAssetModel, requestedSlot: number): string | null {
  const candidates = model.palettes
    .filter(palette => palette.source === 'act' || palette.group === 1 && palette.item >= 1)
    .sort((left, right) => left.item - right.item || Number(right.source === 'act') - Number(left.source === 'act') || left.id.localeCompare(right.id, 'en'));
  const unique = candidates.filter((palette, index) => candidates.findIndex(candidate => candidate.renderPaletteId === palette.renderPaletteId) === index);
  return (unique[requestedSlot] ?? unique[0])?.id ?? baseCharacterPaletteId(model);
}

/** Keeps a sprite's embedded effect palette unless it actually uses the character base palette. */
export function resolveMugenSpritePaletteId(model: MugenRenderAssetModel, spriteId: string | null, selectedPaletteId: string | null, remap: Readonly<{ destination: readonly [number, number] }> | null = null): string | null {
  if (remap !== null) return model.palettes.find(palette => palette.group === remap.destination[0] && palette.item === remap.destination[1])?.id ?? null;
  if (spriteId === null || selectedPaletteId === null) return null;
  const spritePaletteId = model.spriteById.get(spriteId)?.defaultPaletteId ?? null;
  return spritePaletteId !== null && spritePaletteId === baseCharacterPaletteId(model) ? selectedPaletteId : null;
}

function baseCharacterPaletteId(model: MugenRenderAssetModel): string | null {
  if (basePaletteByModel.has(model)) return basePaletteByModel.get(model) ?? null;
  const value = model.sprites.find(sprite => sprite.group === 0 && sprite.item === 0)?.defaultPaletteId ?? null;
  basePaletteByModel.set(model, value);
  return value;
}

/** A Helper must finish StateDef and either declare anim=0 or select a non-default action. */
export function isMugenHelperAnimationReady(helper: Pick<MugenHelperEntitySnapshot, 'stateDefinitionPending' | 'actionNumber'>, stateDefinesAnimation = false): boolean {
  return !helper.stateDefinitionPending && (helper.actionNumber !== 0 || stateDefinesAnimation);
}

/** Applies draw-only MUGEN controllers without moving collision authority. */
export function applyMugenOutputTransform(snapshot: MugenAirSnapshot, output: MugenEntityOutputState | undefined, coordinateScale: number, facing: -1 | 1, verticalFacing: -1 | 1 = 1): MugenAirSnapshot {
  if (output === undefined) return snapshot;
  if (!Number.isFinite(coordinateScale) || coordinateScale <= 0) throw new RangeError('MUGEN output coordinate scale must be finite and positive.');
  const transform = output.drawingTransform;
  const base = output.baseDrawingTransform;
  const render = Object.freeze({
    ...snapshot.render,
    positionX: Math.fround(snapshot.render.positionX + output.displayOffset[0] * coordinateScale),
    positionY: Math.fround(snapshot.render.positionY + output.displayOffset[1] * coordinateScale),
    flipY: verticalFacing === -1 ? !snapshot.render.flipY : snapshot.render.flipY,
    scaleX: Math.fround(snapshot.render.scaleX * (base?.scale[0] ?? 1) * (transform?.scale[0] ?? 1)),
    scaleY: Math.fround(snapshot.render.scaleY * (base?.scale[1] ?? 1) * (transform?.scale[1] ?? 1)),
    rotationRadians: Math.fround(snapshot.render.rotationRadians + ((base?.angle ?? 0) + (transform?.angle ?? 0)) * Math.PI / 180 * facing),
  });
  return Object.freeze({ ...snapshot, render });
}
