import type { MugenMoveType, MugenPhysicsType, MugenStateType } from '../../runtime/match/MugenMatchState';
import type { MugenRuntimeExpression } from '../trigger/MugenRuntimeExpression';

export type MugenExpression = MugenRuntimeExpression;
export type MugenHitAnimationType = 'light' | 'medium' | 'hard' | 'back' | 'up' | 'diagup';
export interface MugenHitOutputTemplate { readonly sparkNumber: MugenExpression | null; readonly sparkFromPlayer: boolean; readonly guardSparkNumber: MugenExpression | null; readonly guardSparkFromPlayer: boolean; readonly sparkPosition: readonly [MugenExpression, MugenExpression]; readonly hitSound: readonly [MugenExpression, MugenExpression] | null; readonly hitSoundFromPlayer: boolean; readonly guardSound: readonly [MugenExpression, MugenExpression] | null; readonly guardSoundFromPlayer: boolean; readonly envShake: readonly [time: MugenExpression, frequency: MugenExpression, amplitude: MugenExpression, phase: MugenExpression]; readonly fallEnvShake: readonly [time: MugenExpression, frequency: MugenExpression, amplitude: MugenExpression, phase: MugenExpression]; readonly defenderPalette: Readonly<{ time: MugenExpression; multiply: readonly [MugenExpression, MugenExpression, MugenExpression]; add: readonly [MugenExpression, MugenExpression, MugenExpression] }> }

export interface MugenHitDefTemplate {
  readonly attributeState: 'S' | 'C' | 'A';
  readonly attackAttribute: 'NA' | 'SA' | 'HA' | 'NP' | 'SP' | 'HP' | 'NT' | 'ST' | 'HT';
  readonly affectTeam: 'B' | 'E' | 'F';
  readonly damage: readonly [MugenExpression, MugenExpression];
  readonly hitFlags: string;
  readonly guardFlags: string;
  readonly groundHitType: 'high' | 'low' | 'trip' | 'none';
  readonly airHitType: 'high' | 'low' | 'trip' | 'none';
  readonly animationType: MugenHitAnimationType;
  readonly airAnimationType: MugenHitAnimationType;
  readonly fallAnimationType: MugenHitAnimationType;
  readonly priority: readonly [MugenExpression, 'hit' | 'miss' | 'dodge'];
  readonly hitPause: readonly [MugenExpression, MugenExpression];
  readonly guardPause: readonly [MugenExpression, MugenExpression];
  readonly groundHitTime: MugenExpression;
  readonly groundSlideTime: MugenExpression;
  readonly guardSlideTime: MugenExpression;
  readonly guardHitTime: MugenExpression;
  readonly airHitTime: MugenExpression;
  readonly guardControlTime: MugenExpression;
  readonly airGuardControlTime: MugenExpression;
  readonly yAcceleration: MugenExpression;
  readonly groundVelocity: readonly [MugenExpression, MugenExpression];
  readonly airVelocity: readonly [MugenExpression, MugenExpression];
  readonly guardVelocity: readonly [MugenExpression, MugenExpression];
  readonly airGuardVelocity: readonly [MugenExpression, MugenExpression] | null;
  readonly downVelocity: readonly [MugenExpression, MugenExpression];
  readonly downHitTime: MugenExpression;
  readonly groundCornerPush: MugenExpression | null;
  readonly airCornerPush: MugenExpression | null;
  readonly downCornerPush: MugenExpression | null;
  readonly guardCornerPush: MugenExpression | null;
  readonly airGuardCornerPush: MugenExpression | null;
  readonly attackerPower: readonly [MugenExpression, MugenExpression];
  readonly defenderPower: readonly [MugenExpression, MugenExpression];
  readonly guardDistance: MugenExpression;
  readonly attackerSpritePriority: MugenExpression;
  readonly defenderSpritePriority: MugenExpression;
  readonly attackerFacing: MugenExpression;
  readonly attackerGetDefenderFacing: MugenExpression;
  readonly defenderFacing: MugenExpression;
  readonly attackerStateNumber: MugenExpression;
  readonly defenderStateNumber: MugenExpression;
  readonly defenderGetsAttackerState: MugenExpression;
  readonly forceStand: MugenExpression;
  readonly fall: MugenExpression;
  readonly airFall: MugenExpression;
  readonly forceNoFall: MugenExpression;
  readonly airJuggle: MugenExpression;
  readonly snap: readonly [MugenExpression, MugenExpression] | null;
  readonly downBounce: MugenExpression;
  readonly fallVelocity: readonly [MugenExpression | null, MugenExpression];
  readonly fallRecover: MugenExpression;
  readonly fallRecoverTime: MugenExpression;
  readonly fallDamage: MugenExpression;
  readonly fallKill: MugenExpression;
  readonly minimumDistance: readonly [MugenExpression, MugenExpression] | null;
  readonly maximumDistance: readonly [MugenExpression, MugenExpression] | null;
  readonly targetId: MugenExpression;
  readonly chainId: MugenExpression;
  readonly noChainIds: readonly [MugenExpression, MugenExpression];
  readonly hitOnce: MugenExpression;
  readonly hitCount: MugenExpression;
  readonly kill: MugenExpression;
  readonly guardKill: MugenExpression;
  readonly output: MugenHitOutputTemplate;
}

export interface MugenHitAttributeFilterTemplate {
  readonly slot: 0 | 1;
  readonly allow: boolean;
  readonly attributes: readonly string[];
  readonly time: MugenExpression;
}

export interface MugenHitOverrideTemplate {
  readonly attributes: readonly string[];
  readonly stateNumber: MugenExpression;
  readonly slot: MugenExpression;
  readonly time: MugenExpression;
  readonly forceAir: MugenExpression;
}

export interface MugenReversalDefTemplate {
  readonly attributes: readonly string[];
  readonly hitPause: readonly [MugenExpression, MugenExpression];
  readonly attackerStateNumber: MugenExpression;
  readonly defenderStateNumber: MugenExpression;
  readonly attackerSpritePriority: MugenExpression;
  readonly defenderSpritePriority: MugenExpression;
  readonly sparkNumber: MugenExpression | null;
  readonly hitSound: readonly [MugenExpression, MugenExpression] | null;
}

export type MugenControllerType = 'change-state' | 'self-state' | 'change-anim' | 'change-anim2' | 'vel-set' | 'vel-add' | 'vel-mul' | 'pos-set' | 'pos-add' | 'pos-freeze' | 'ctrl-set' | 'state-type-set' | 'turn' | 'width' | 'spr-priority' | 'var-set' | 'var-add' | 'var-random' | 'var-range-set' | 'assert-special' | 'after-image' | 'after-image-time' | 'all-pal-fx' | 'angle-add' | 'angle-draw' | 'angle-mul' | 'angle-set' | 'append-to-clipboard' | 'bg-pal-fx' | 'clear-clipboard' | 'display-to-clipboard' | 'env-color' | 'env-shake' | 'fall-env-shake' | 'force-feedback' | 'game-make-anim' | 'make-dust' | 'offset' | 'pal-fx' | 'pause' | 'remap-pal' | 'screen-bound' | 'snd-pan' | 'super-pause' | 'trans' | 'victory-quote' | 'attack-dist' | 'attack-mul-set' | 'defence-mul-set' | 'hit-add' | 'hit-by' | 'not-hit-by' | 'hit-def' | 'hit-fall-damage' | 'hit-fall-set' | 'hit-fall-vel' | 'hit-override' | 'hit-vel-set' | 'reversal-def' | 'player-push' | 'target-bind' | 'target-drop' | 'target-facing' | 'target-life-add' | 'target-power-add' | 'target-state' | 'target-vel-add' | 'target-vel-set' | 'life-add' | 'life-set' | 'power-add' | 'power-set' | 'move-hit-reset' | 'gravity' | 'play-snd' | 'stop-snd' | 'bind-to-parent' | 'bind-to-root' | 'bind-to-target' | 'destroy-self' | 'explod' | 'explod-bind-time' | 'helper' | 'modify-explod' | 'parent-var-add' | 'parent-var-set' | 'projectile' | 'remove-explod' | 'null';

export interface MugenStateController {
  readonly stateNumber: number;
  readonly name: string;
  readonly type: MugenControllerType;
  readonly triggerAll: readonly MugenExpression[];
  readonly triggerGroups: readonly Readonly<{ group: number; expressions: readonly MugenExpression[] }>[];
  readonly persistent: number;
  readonly ignoreHitPause: boolean;
  readonly parameters: Readonly<Record<string, MugenExpression>>;
  /** Validated non-expression tokens such as Helper name and Explod postype. */
  readonly literalParameters?: Readonly<Record<string, string>>;
  readonly hitDefinition: MugenHitDefTemplate | null;
  readonly hitAttributeFilter: MugenHitAttributeFilterTemplate | null;
  readonly hitOverride: MugenHitOverrideTemplate | null;
  readonly reversalDefinition: MugenReversalDefTemplate | null;
  readonly sourcePath: string;
  readonly sourceLine: number;
}

export interface MugenStateDefinition {
  readonly number: number;
  readonly stateType: MugenStateType | 'U';
  readonly moveType: MugenMoveType | 'U';
  readonly physics: MugenPhysicsType | 'U';
  readonly animation: MugenExpression | null;
  readonly velocity: readonly [MugenExpression, MugenExpression] | null;
  readonly control: MugenExpression | null;
  readonly powerAdd: MugenExpression | null;
  readonly juggle: MugenExpression | null;
  readonly faceOpponent: MugenExpression | null;
  readonly hitDefPersist: MugenExpression | null;
  readonly moveHitPersist: MugenExpression | null;
  readonly hitCountPersist: MugenExpression | null;
  readonly spritePriority: MugenExpression | null;
  readonly controllers: readonly MugenStateController[];
  readonly sourcePath: string;
  readonly sourceLine: number;
}

export interface MugenStateProgram {
  readonly schemaVersion: 1;
  readonly revision: 'm09-g03-core-state-v1';
  readonly attributes: Readonly<{ defense: number; airJuggle: number }>;
  readonly physics: Readonly<{ gravity: number; standFriction: number; crouchFriction: number }>;
  readonly constants: Readonly<Record<string, number>>;
  readonly states: readonly MugenStateDefinition[];
}
