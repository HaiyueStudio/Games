export type MugenDrawScale = readonly [number, number];

export interface MugenStageViewportTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Reads the standard MUGEN [Size] drawing scale from a compiled CNS program. */
export function resolveMugenDrawScale(constants: Readonly<Record<string, number>>): MugenDrawScale {
  return Object.freeze([positive(constants['size.xscale'] ?? 1), positive(constants['size.yscale'] ?? 1)]);
}

/** Converts one character coordinate into the active stage coordinate system. */
export function mugenCharacterToStageScale(stageLocalCoord: readonly [number, number], characterLocalCoord: readonly [number, number], drawScale: MugenDrawScale): MugenDrawScale {
  return Object.freeze([
    positive(stageLocalCoord[0]) / positive(characterLocalCoord[0]) * positive(drawScale[0]),
    positive(stageLocalCoord[1]) / positive(characterLocalCoord[1]) * positive(drawScale[1]),
  ]);
}

/** Letterboxes a MUGEN stage without stretching its declared localcoord aspect ratio. */
export function mugenStageViewportTransform(viewport: Readonly<{ width: number; height: number }>, localCoord: readonly [number, number]): MugenStageViewportTransform {
  const width = positive(viewport.width); const height = positive(viewport.height); const localWidth = positive(localCoord[0]); const localHeight = positive(localCoord[1]);
  const scale = Math.min(width / localWidth, height / localHeight);
  return Object.freeze({ scale, offsetX: (width - localWidth * scale) / 2, offsetY: (height - localHeight * scale) / 2 });
}

function positive(value: number): number { if (!Number.isFinite(value) || value <= 0 || value > 64_000) throw new RangeError('MUGEN scale and coordinate values must be finite and positive.'); return value; }
