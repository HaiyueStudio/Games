import type { MugenHeadlessMatch, MugenResolvedReversalDefinition } from '../../match/MugenMatchState';

export type MugenCombatMutationCommand =
  | Readonly<{ kind: 'attack-distance'; fighterId: string; value: number }>
  | Readonly<{ kind: 'damage-multiplier'; fighterId: string; attack?: number; defense?: number }>
  | Readonly<{ kind: 'hit-add'; fighterId: string; value: number }>
  | Readonly<{ kind: 'juggle-pool'; fighterId: string; capacity: number }>
  | Readonly<{ kind: 'hit-fall'; fighterId: string; fall?: boolean; xVelocity?: number; yVelocity?: number }>
  | Readonly<{ kind: 'player-push'; fighterId: string; value: boolean }>
  | Readonly<{ kind: 'hit-attribute-slot'; fighterId: string; slot: 0 | 1; allowedAttributes: readonly string[]; remainingTicks: number }>
  | Readonly<{ kind: 'target-bind'; ownerId: string; fighterId: string; targetId: number; offset: readonly [number, number]; remainingTicks: number }>
  | Readonly<{ kind: 'target-drop'; fighterId: string; excludeTargetId: number; keepOne: boolean }>
  | Readonly<{ kind: 'target-release'; fighterId: string }>
  | Readonly<{ kind: 'hit-override'; fighterId: string; slot: number; attributes: readonly string[]; stateNumber: number; stateDataOwnerId: string; forceAir: boolean; remainingTicks: number }>
  | Readonly<{ kind: 'reversal-def'; fighterId: string; definition: MugenResolvedReversalDefinition | null }>;

export function commitMugenCombatMutation(match: MugenHeadlessMatch, command: MugenCombatMutationCommand): void {
  switch (command.kind) {
    case 'attack-distance': match.setAttackDistance(command.fighterId, command.value); return;
    case 'damage-multiplier': match.setDamageMultipliers(command.fighterId, command); return;
    case 'hit-add': match.addHitCount(command.fighterId, command.value); return;
    case 'juggle-pool': match.setJugglePool(command.fighterId, command.capacity); return;
    case 'hit-fall': match.setHitFall(command.fighterId, command); return;
    case 'player-push': match.setPlayerPushEnabled(command.fighterId, command.value); return;
    case 'hit-attribute-slot': match.setHitAttributeSlot(command.fighterId, command.slot, command.allowedAttributes, command.remainingTicks); return;
    case 'target-bind': match.setTargetBinding(command.ownerId, command.fighterId, command.targetId, command.offset, command.remainingTicks); return;
    case 'target-drop': match.dropTargets(command.fighterId, command.excludeTargetId, command.keepOne); return;
    case 'target-release': match.releaseTarget(command.fighterId); return;
    case 'hit-override': match.setHitOverride(command.fighterId, command.slot, command); return;
    case 'reversal-def': match.activateReversalDefinition(command.fighterId, command.definition); return;
  }
}
