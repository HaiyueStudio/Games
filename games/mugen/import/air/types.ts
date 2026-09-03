import type { MugenImportDiagnostic } from '../diagnostics';

export type MugenAirInterpolation = 'offset' | 'blend' | 'scale' | 'angle';
export type MugenAirBlendMode = 'opaque' | 'add' | 'subtract';

export interface MugenAirBlend {
  readonly mode: MugenAirBlendMode;
  readonly sourceAlpha: number;
  readonly destinationAlpha: number;
}

export interface MugenAirSourceSpan {
  readonly byteOffset: number;
  readonly line: number;
  readonly column: number;
}

export interface MugenAirCollisionBox extends MugenAirSourceSpan {
  readonly index: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MugenAirElement extends MugenAirSourceSpan {
  readonly index: number;
  readonly spriteGroup: number;
  readonly spriteItem: number;
  readonly spriteId: string | null;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly durationTicks: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly blend: MugenAirBlend;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly angleDegrees: number;
  readonly interpolateToThis: readonly MugenAirInterpolation[];
  readonly clsn1: readonly MugenAirCollisionBox[];
  readonly clsn2: readonly MugenAirCollisionBox[];
}

export interface MugenAirAction extends MugenAirSourceSpan {
  readonly number: number;
  readonly loopStart: number;
  readonly elements: readonly MugenAirElement[];
  readonly totalTicks: number | null;
  readonly preLoopTicks: number;
  readonly loopTicks: number | null;
}

export interface MugenAirBank {
  readonly canonicalPath: string;
  readonly sourceSha256: string;
  readonly actions: readonly MugenAirAction[];
  readonly diagnostics: readonly MugenImportDiagnostic[];
  readonly elementCount: number;
  readonly collisionBoxCount: number;
}

export interface MugenAirSpriteReference {
  readonly id: string;
  readonly axisX: number;
  readonly axisY: number;
}

export type MugenAirSpriteResolver = (group: number, item: number) => MugenAirSpriteReference | null;
