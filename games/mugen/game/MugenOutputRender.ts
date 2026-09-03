import type { MugenAirSnapshot } from '../import/air/MugenAirRuntime';
import type { MugenEntityOutputState } from '../runtime/effects/MugenOutputAuthority';

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
