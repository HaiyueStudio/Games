import type { MugenControl, MugenFacingDirection } from '../../runtime/input/MugenInputRuntime';

export type MugenCommandButton = Extract<MugenControl, 'a' | 'b' | 'c' | 'x' | 'y' | 'z' | 'start'>;
export type MugenCommandDirection = Exclude<MugenFacingDirection, 'N'>;
export type MugenCommandTokenMode = 'press' | 'hold' | 'release';

export interface MugenCommandToken {
  readonly target: MugenCommandButton | MugenCommandDirection;
  readonly targetType: 'button' | 'direction';
  readonly mode: MugenCommandTokenMode;
  readonly fourWay: boolean;
  readonly noOtherInput: boolean;
  readonly chargeTicks: number;
}

export interface MugenCommandStep {
  readonly tokens: readonly MugenCommandToken[];
}

export interface MugenCommandDefinition {
  readonly name: string;
  readonly foldedName: string;
  readonly steps: readonly MugenCommandStep[];
  readonly time: number;
  readonly bufferTime: number;
  readonly sourcePath: string;
  readonly sourceLine: number;
}

export interface MugenCommandProgram {
  readonly schemaVersion: 1;
  readonly revision: 'm08-g08b-command-v1';
  readonly commands: readonly MugenCommandDefinition[];
}
