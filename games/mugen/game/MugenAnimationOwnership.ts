import type { MugenAirSnapshot } from '../import/air/MugenAirRuntime';
import type { MugenViewerSprite } from '../viewer/MugenCharacterModel';

/**
 * MUGEN ChangeAnim2 reads AIR timing from the custom-state owner, but keeps
 * drawing sprites from the physical player. Rebind the evaluated frame by its
 * group/item pair so a victim never turns into the attacking character.
 */
export function bindMugenSnapshotToSpriteOwner(
  snapshot: MugenAirSnapshot,
  spritesByGroupItem: ReadonlyMap<string, MugenViewerSprite>,
  spriteScaleRatio = 1,
): MugenAirSnapshot {
  if (!Number.isFinite(spriteScaleRatio) || spriteScaleRatio <= 0) throw new RangeError('MUGEN sprite scale ratio must be positive.');
  const blank = snapshot.render.spriteGroup === -1 || snapshot.render.spriteItem === -1;
  const sprite = blank ? undefined : spritesByGroupItem.get(mugenSpriteKey(snapshot.render.spriteGroup, snapshot.render.spriteItem));
  const render = Object.freeze({
    ...snapshot.render,
    spriteId: blank ? null : sprite?.id ?? null,
    missingSprite: !blank && sprite === undefined,
    axisX: sprite?.axisX ?? 0,
    axisY: sprite?.axisY ?? 0,
    scaleX: Math.fround(snapshot.render.scaleX * spriteScaleRatio),
    scaleY: Math.fround(snapshot.render.scaleY * spriteScaleRatio),
  });
  return Object.freeze({ ...snapshot, render });
}

export function mugenSpriteKey(group: number, item: number): string { return `${group},${item}`; }
