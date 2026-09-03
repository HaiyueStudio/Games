import type { MugenFacing } from '../../input/MugenInputRuntime';
import type { MugenHeadlessMatch, MugenMoveType, MugenPhysicsType, MugenStateType } from '../../match/MugenMatchState';

/** The closed mutation ABI owned by M09-G03. Script evaluation cannot write match fields directly. */
export type MugenCoreMutationCommand =
  | Readonly<{ kind: 'change-state'; fighterId: string; stateNumber: number; control?: boolean; stateDataOwnerId: string; preserveHitDefinition: boolean; preserveMoveContact: boolean; preserveHitCount: boolean }>
  | Readonly<{ kind: 'state-entry-resets'; fighterId: string; preserveHitDefinition: boolean; preserveMoveContact: boolean; preserveHitCount: boolean }>
  | Readonly<{ kind: 'change-action'; fighterId: string; actionNumber: number; element: number; ownerId: string }>
  | Readonly<{ kind: 'kinematics'; fighterId: string; position?: readonly [number, number]; velocity?: readonly [number, number]; facing?: MugenFacing }>
  | Readonly<{ kind: 'control'; fighterId: string; value: boolean }>
  | Readonly<{ kind: 'state-metadata'; fighterId: string; stateType?: MugenStateType; moveType?: MugenMoveType; physics?: MugenPhysicsType }>
  | Readonly<{ kind: 'integer-variable'; fighterId: string; operation: 'set' | 'add'; index: number; value: number }>
  | Readonly<{ kind: 'float-variable'; fighterId: string; operation: 'set' | 'add'; index: number; value: number }>
  | Readonly<{ kind: 'life-set'; fighterId: string; value: number }>
  | Readonly<{ kind: 'life-add'; fighterId: string; delta: number; kill: boolean; absolute: boolean; defenseMultiplier: number }>
  | Readonly<{ kind: 'power'; fighterId: string; value: number }>
  | Readonly<{ kind: 'move-hit-reset'; fighterId: string }>
  | Readonly<{ kind: 'position-freeze'; fighterId: string; value: boolean }>
  | Readonly<{ kind: 'width'; fighterId: string; edge: readonly [number, number]; player: readonly [number, number] }>
  | Readonly<{ kind: 'sprite-priority'; fighterId: string; value: number }>
  | Readonly<{ kind: 'juggle-cost'; fighterId: string; value: number }>;

export function commitMugenCoreMutation(match: MugenHeadlessMatch, command: MugenCoreMutationCommand): void {
  switch (command.kind) {
    case 'change-state': match.changeFighterState(command.fighterId, command.stateNumber, command.control, command); return;
    case 'state-entry-resets': match.applyStateEntryResets(command.fighterId, command.preserveHitDefinition, command.preserveMoveContact, command.preserveHitCount); return;
    case 'change-action': match.setFighterAction(command.fighterId, command.actionNumber, command.element, command.ownerId); return;
    case 'kinematics': match.setKinematics(command.fighterId, command); return;
    case 'control': { const fighter = match.fighter(command.fighterId); match.setFighterState(command.fighterId, fighter.stateNumber, command.value); return; }
    case 'state-metadata': match.setFighterStateMetadata(command.fighterId, command); return;
    case 'integer-variable': if (command.operation === 'set') match.setIntegerVariable(command.fighterId, command.index, command.value); else match.addIntegerVariable(command.fighterId, command.index, command.value); return;
    case 'float-variable': if (command.operation === 'set') match.setFloatVariable(command.fighterId, command.index, command.value); else match.addFloatVariable(command.fighterId, command.index, command.value); return;
    case 'life-set': match.setLife(command.fighterId, command.value); return;
    case 'life-add': {
      if (!Number.isFinite(command.defenseMultiplier) || command.defenseMultiplier <= 0) throw new RangeError('MUGEN LifeAdd defense multiplier must be positive and finite.');
      const fighter = match.fighter(command.fighterId);
      let delta = command.absolute ? command.delta : command.delta / command.defenseMultiplier;
      if (!command.absolute && delta < 0 && delta > -1) delta = -1;
      delta = delta < 0 ? -Math.round(-delta) : Math.round(delta);
      match.setLife(command.fighterId, Math.max(command.kill ? 0 : 1, Math.min(fighter.maxLife, fighter.life + delta)));
      return;
    }
    case 'power': match.setPower(command.fighterId, command.value); return;
    case 'move-hit-reset': match.resetMoveContact(command.fighterId); return;
    case 'position-freeze': match.setPositionFrozen(command.fighterId, command.value); return;
    case 'width': match.setWidthOverride(command.fighterId, command.edge, command.player); return;
    case 'sprite-priority': match.setSpritePriority(command.fighterId, command.value); return;
    case 'juggle-cost': match.setJuggleCost(command.fighterId, command.value); return;
  }
}
