import { hashSimulationState, type SimulationStateValue } from '@haiyue/engine/experimental/simulation';
import type { MugenExpression, MugenStateController, MugenStateDefinition, MugenStateProgram } from '../../import/cns/types';
import type { MugenAirAction } from '../../import/air/types';
import { evaluateMugenAirAction, type MugenAirSnapshot } from '../../import/air/MugenAirRuntime';
import type { MugenCommandProgram } from '../../import/cmd/types';
import { mugenBottom, mugenFloat, mugenInt, mugenString, type MugenExpressionValue } from '../../import/expression/types';
import type { MugenInputHistory, MugenTickInput } from '../input/MugenInputRuntime';
import type { MugenFighterSnapshot, MugenHeadlessMatch, MugenMatchSnapshot, MugenMoveType, MugenPhysicsType, MugenResolvedHitDefinition, MugenResolvedReversalDefinition, MugenStateType } from '../match/MugenMatchState';
import type { MugenExpressionVmContext } from '../vm/MugenExpressionVm';
import { evaluateMugenRuntimeExpression, type MugenTriggerEvaluationHost } from '../triggers/MugenTriggerEvaluator';
import { isRedirectedExpressionProgram, mugenRuntimeExpressionWritesVariables } from '../../import/trigger/MugenRuntimeExpression';
import { MugenStateExecutor, type MugenControllerExecutionTrace, type MugenStateExecutorSnapshot } from '../state-execution/MugenStateExecutor';
import { MugenCommandMatcher } from './MugenCommandMatcher';
import { commitMugenCoreMutation, type MugenCoreMutationCommand } from '../controllers/core/MugenCoreMutation';
import { commitMugenCombatMutation, type MugenCombatMutationCommand } from '../controllers/combat/MugenCombatMutation';
import { MugenEntityAuthority, type MugenEntityAuthoritySnapshot, type MugenEntityCommitResult, type MugenExplodEntitySnapshot, type MugenHelperEntitySnapshot, type MugenProjectileSpawn } from '../entities/MugenEntityAuthority';
import { MugenOutputAuthority, type MugenAfterImageEffect, type MugenAssertSpecialFlag, type MugenForceFeedbackWaveform, type MugenOutputAuthoritySnapshot, type MugenPaletteEffect, type MugenTransparencyMode } from '../effects/MugenOutputAuthority';

const EMPTY_COMMANDS: ReadonlySet<string> = new Set<string>();
const scriptStructureHashes = new WeakMap<object, WeakMap<object, string>>();

export interface MugenFighterScriptProgram { readonly fighterId: string; readonly name?: string; readonly authorName?: string; readonly sourceHash?: string; readonly commands: MugenCommandProgram; readonly states: MugenStateProgram; readonly localCoord?: readonly [number, number]; readonly paletteNumber?: number; readonly gravity?: number; readonly standFriction?: number; readonly crouchFriction?: number; readonly engineControlTransitions?: boolean }
export interface MugenPauseSnapshot { readonly kind: 'pause' | 'super-pause'; readonly ownerRootId: string; readonly remainingTicks: number; readonly ownerMoveTicks: number; readonly endCommandBufferTicks: number; readonly backgroundPaused: boolean; readonly darken: boolean; readonly opponentDefenseMultiplier: number; readonly ownerUnhittable: boolean; readonly startedTick: number }
export interface MugenScriptTickTrace { readonly tick: number; readonly programHash: string; readonly commandHashes: readonly string[]; readonly executedControllers: readonly string[]; readonly triggerTrace: readonly MugenControllerExecutionTrace[]; readonly entityCommit: MugenEntityCommitResult; readonly entityHash: string; readonly pause: MugenPauseSnapshot | null; readonly output: MugenOutputAuthoritySnapshot; readonly outputHash: string; readonly hash: string }
export interface MugenScriptAnimationContext { readonly action: MugenAirAction; readonly snapshot: MugenAirSnapshot }
export interface MugenStageInfo { readonly name: string; readonly displayName: string; readonly authorName: string }
export interface MugenScriptStepContext { readonly animationByFighter?: ReadonlyMap<string, MugenScriptAnimationContext>; readonly animationExistsByFighter?: ReadonlyMap<string, ReadonlySet<number>>; readonly animationDurationByOwner?: ReadonlyMap<string, ReadonlyMap<number, number | null>>; readonly opponentByFighter?: ReadonlyMap<string, string>; readonly inGuardDistance?: ReadonlySet<string>; readonly stageBounds?: readonly [left: number, right: number]; readonly screenBounds?: readonly [left: number, right: number]; readonly cameraPosition?: readonly [x: number, y: number]; readonly cameraZoom?: number; readonly stageInfo?: MugenStageInfo; readonly matchNumber?: number; readonly homeTeamSide?: 1 | 2; readonly traceTriggers?: boolean }
export interface MugenScriptRuntimeSnapshot { readonly schemaVersion: 8; readonly revision: 'm09-g08-script-character-parity-v8'; readonly programHash: string; readonly lastTick: number; readonly lastRoundNumber: number; readonly pause: MugenPauseSnapshot | null; readonly executors: Readonly<Record<string, MugenStateExecutorSnapshot>>; readonly systemVariables: Readonly<Record<string, readonly number[]>>; readonly systemFloatVariables: Readonly<Record<string, readonly number[]>>; readonly entities: MugenEntityAuthoritySnapshot; readonly outputs: MugenOutputAuthoritySnapshot }

interface EvaluationContext extends MugenScriptStepContext { readonly match: MugenHeadlessMatch; readonly matchSnapshot: MugenMatchSnapshot; readonly entities: MugenEntityAuthority; readonly fighterId: string; readonly commands: ReadonlySet<string>; readonly aiLevelByRoot: ReadonlyMap<string, number>; readonly identityByRoot: ReadonlyMap<string, Readonly<{ name: string | null; authorName: string }>>; readonly constantsByRoot: ReadonlyMap<string, Readonly<Record<string, number>>>; readonly localCoordByRoot: ReadonlyMap<string, readonly [number, number]>; readonly paletteNumberByRoot: ReadonlyMap<string, number>; readonly systemVariablesByRoot: ReadonlyMap<string, Int32Array>; readonly systemFloatVariablesByRoot: ReadonlyMap<string, Float32Array>; readonly evaluationFighters?: Map<string, MugenFighterSnapshot>; readonly evaluationHelpers?: Map<string, MugenHelperEntitySnapshot> }

export class MugenScriptRuntime {
  entities: MugenEntityAuthority;
  readonly outputs = new MugenOutputAuthority();
  readonly #programs: ReadonlyMap<string, Readonly<{ matcher: MugenCommandMatcher; states: ReadonlyMap<number, MugenStateDefinition>; defenseMultiplier: number; airJuggle: number; gravity: number; standFriction: number; crouchFriction: number; engineControlTransitions: boolean }>>;
  readonly #executors = new Map<string, MugenStateExecutor>();
  readonly #identityByRoot = new Map<string, Readonly<{ name: string | null; authorName: string }>>();
  readonly #constantsByRoot = new Map<string, Readonly<Record<string, number>>>();
  readonly #localCoordByRoot = new Map<string, readonly [number, number]>();
  readonly #paletteNumberByRoot = new Map<string, number>();
  readonly #systemVariablesByRoot = new Map<string, Int32Array>();
  readonly #systemFloatVariablesByRoot = new Map<string, Float32Array>();
  readonly maxControllerEvaluationsPerFighterTick: number;
  readonly programHash: string;
  #pause: MugenPauseSnapshot | null = null;
  #lastTick = -1;
  #lastRoundNumber = -1;

  constructor(programs: readonly MugenFighterScriptProgram[], maxControllerEvaluationsPerFighterTick = 4_096) {
    if (!Array.isArray(programs) || programs.length !== 2) throw new TypeError('MUGEN script runtime requires exactly two fighter programs.');
    if (!Number.isSafeInteger(maxControllerEvaluationsPerFighterTick) || maxControllerEvaluationsPerFighterTick < 1 || maxControllerEvaluationsPerFighterTick > 8_192) throw new RangeError('MUGEN controller evaluation budget must be from 1 to 8192.');
    this.maxControllerEvaluationsPerFighterTick = maxControllerEvaluationsPerFighterTick;
    const normalizedPrograms: Array<Readonly<{ fighterId: string; name: string | null; authorName: string; sourceHash: string; localCoord: readonly [number, number]; paletteNumber: number; defenseMultiplier: number; airJuggle: number; gravity: number; standFriction: number; crouchFriction: number; engineControlTransitions: boolean }>> = [];
    const entries = programs.map(program => {
      const states = new Map<number, MugenStateDefinition>(program.states.states.map((state: MugenStateDefinition) => [state.number, state]));
      if (!states.has(0) || !states.has(-1)) throw new TypeError(`MUGEN state program for ${program.fighterId} requires states -1 and 0.`);
      const defenseMultiplier = finitePositiveFloat(program.states.attributes.defense / 100, `${program.fighterId}.defenseMultiplier`);
      const airJuggle = nonNegativeInteger(program.states.attributes.airJuggle, `${program.fighterId}.airJuggle`);
      const gravity = finiteFloat(program.gravity ?? program.states.physics.gravity, `${program.fighterId}.gravity`);
      const standFriction = friction(program.standFriction ?? program.states.physics.standFriction, `${program.fighterId}.standFriction`);
      const crouchFriction = friction(program.crouchFriction ?? program.states.physics.crouchFriction, `${program.fighterId}.crouchFriction`);
      const engineControlTransitions = program.engineControlTransitions === true;
      const name = program.name?.trim() || null; const authorName = program.authorName?.trim() ?? '';
      const localCoord = Object.freeze(program.localCoord === undefined ? [320, 240] : [...program.localCoord]) as readonly [number, number]; const paletteNumber = program.paletteNumber ?? 1;
      const sourceHash = program.sourceHash === undefined ? scriptStructureHash(program.commands, program.states) : sha256(program.sourceHash, `${program.fighterId}.sourceHash`);
      normalizedPrograms.push(Object.freeze({ fighterId: program.fighterId, name, authorName, sourceHash, localCoord, paletteNumber, defenseMultiplier, airJuggle, gravity, standFriction, crouchFriction, engineControlTransitions }));
      this.#identityByRoot.set(program.fighterId, Object.freeze({ name, authorName })); this.#constantsByRoot.set(program.fighterId, program.states.constants); this.#localCoordByRoot.set(program.fighterId, localCoord); this.#paletteNumberByRoot.set(program.fighterId, paletteNumber); this.#systemVariablesByRoot.set(program.fighterId, new Int32Array(5)); this.#systemFloatVariablesByRoot.set(program.fighterId, new Float32Array(5));
      return [program.fighterId, Object.freeze({ matcher: new MugenCommandMatcher(program.commands), states, defenseMultiplier, airJuggle, gravity, standFriction, crouchFriction, engineControlTransitions })] as const;
    });
    if (new Set(entries.map(entry => entry[0])).size !== 2) throw new TypeError('MUGEN fighter script ids must be unique.');
    this.#programs = new Map(entries);
    this.entities = new MugenEntityAuthority(entries.map(([entityId], team) => ({ entityId, playerId: team + 1, team: team as 0 | 1 })));
    for (const [fighterId] of entries) this.#executors.set(fighterId, new MugenStateExecutor({ maxControllerEvaluationsPerTick: maxControllerEvaluationsPerFighterTick }));
    this.programHash = hashSimulationState({ revision: 'm09-g02-trigger-order-v1', maxControllerEvaluationsPerFighterTick, programs: normalizedPrograms } as unknown as SimulationStateValue);
  }

  step(match: MugenHeadlessMatch, input: MugenTickInput, history: MugenInputHistory, stepContext: MugenScriptStepContext = {}): MugenScriptTickTrace {
    if (!match.transactionOpen || match.tick !== input.tick || history.tick !== input.tick) throw new Error('MUGEN script runtime requires matching open match/input/history ticks.');
    const matchSnapshot = match.snapshot(); const roundNumber = matchSnapshot.roundNumber; const enteringRound = input.tick <= this.#lastTick || roundNumber !== this.#lastRoundNumber; if (enteringRound) { for (const executor of this.#executors.values()) executor.reset(); for (const variables of this.#systemVariablesByRoot.values()) variables.fill(0); for (const variables of this.#systemFloatVariablesByRoot.values()) variables.fill(0); this.entities.clearRoundEntities(); this.outputs.clearRound(); this.#pause = null; } this.#lastTick = input.tick; this.#lastRoundNumber = roundNumber;
    this.entities.beginTick(input.tick); this.outputs.beginTick(input.tick);
    for (const fighter of matchSnapshot.fighters) this.entities.syncRoot(fighter.id, fighter.position, fighter.facing, fighter.targets);
    const commandHashes: string[] = []; const commandsByRoot = new Map<string, ReadonlySet<string>>(); const aiLevelByRoot = new Map(input.players.map(player => [player.playerId, player.aiLevel] as const)); const executedControllers: string[] = []; const triggerTrace: MugenControllerExecutionTrace[] = [];
    for (const player of input.players) {
      const program = this.#programs.get(player.playerId);
      if (!program) throw new TypeError(`MUGEN script program is missing fighter ${player.playerId}.`);
      const matched = program.matcher.match(history, player.playerId); commandHashes.push(matched.hash);
      const commands = new Set(matched.names); commandsByRoot.set(player.playerId, commands);
      if (match.phase === 'ready') continue;
      const paused = this.#pausedFor(player.playerId);
      const evaluationFighters = new Map<string, MugenFighterSnapshot>();
      const context: EvaluationContext = { match, matchSnapshot, entities: this.entities, fighterId: player.playerId, commands, aiLevelByRoot, identityByRoot: this.#identityByRoot, constantsByRoot: this.#constantsByRoot, localCoordByRoot: this.#localCoordByRoot, paletteNumberByRoot: this.#paletteNumberByRoot, systemVariablesByRoot: this.#systemVariablesByRoot, systemFloatVariablesByRoot: this.#systemFloatVariablesByRoot, evaluationFighters, ...stepContext };
      if (match.fighter(player.playerId).moveType === 'H') this.entities.removeExplodsOnOwnerGetHit(player.playerId);
      if (enteringRound) { match.setDamageMultipliers(player.playerId, { attack: 1, defense: program.defenseMultiplier }); commitCombat(match, { kind: 'juggle-pool', fighterId: player.playerId, capacity: program.airJuggle }); const fighter = match.fighter(player.playerId); const definition = this.#programs.get(fighter.stateDataOwnerId)?.states.get(fighter.stateNumber); if (!definition) throw new RangeError(`MUGEN initial state ${fighter.stateNumber} does not exist for state owner ${fighter.stateDataOwnerId}.`); this.#applyStateDefinition(definition, context, undefined, undefined, fighter.stateDataOwnerId); }
      if (match.phase === 'fight' && !paused && program.engineControlTransitions) this.#applyEngineControlTransition(program, context);
      const executor = this.#executors.get(player.playerId)!;
      let fighterSnapshotCache: MugenFighterSnapshot | null = null;
      const currentFighter = (): MugenFighterSnapshot => { if (fighterSnapshotCache === null) { fighterSnapshotCache = match.fighter(player.playerId); evaluationFighters.set(player.playerId, fighterSnapshotCache); } return fighterSnapshotCache; };
      let executorSnapshot: Readonly<{ entityId: string; stateNumber: number; stateGeneration: number; hitPaused: boolean; paused: boolean; helper: boolean; keyControl: boolean; usingOwnStateData: boolean }> | null = null;
      const result = executor.executeTick({
        snapshot: () => { if (executorSnapshot !== null) return executorSnapshot; const fighter = currentFighter(); executorSnapshot = Object.freeze({ entityId: fighter.id, stateNumber: fighter.stateNumber, stateGeneration: fighter.stateGeneration, hitPaused: fighter.hitPauseTicks > 0, paused, helper: false, keyControl: true, usingOwnStateData: fighter.stateDataOwnerId === fighter.id }); return executorSnapshot; },
        state: (number, owner) => { const fighter = currentFighter(); const ownerId = owner === 'own' ? fighter.id : fighter.stateDataOwnerId; return this.#programs.get(ownerId)?.states.get(number) ?? null; },
        evaluate: expression => tryEvaluateVariableGate(expression, currentFighter(), context) ?? evaluateValue(expression, context),
        execute: (controller, execution) => { executedControllers.push(`${context.fighterId}:${execution.stateNumber}:${execution.controllerIndex}:${controller.type}`); const transitioned = this.#execute(controller, program, context); executorSnapshot = null; fighterSnapshotCache = null; evaluationFighters.delete(player.playerId); return Object.freeze({ transitioned }); },
      }, { trace: stepContext.traceTriggers === true });
      triggerTrace.push(...result.trace);
      if (paused) continue;
      match.markFighterStateProcessed(player.playerId);
      if (match.fighter(player.playerId).hitPauseTicks > 0) continue;
      applyPhysics(match, match.fighter(player.playerId), program);
      const fighter = match.fighter(player.playerId);
      if (!fighter.positionFrozen) {
        commit(match, { kind: 'kinematics', fighterId: player.playerId, position: [fighter.position[0] + fighter.velocity[0], fighter.position[1] + fighter.velocity[1]] });
        if (program.engineControlTransitions) this.#applyEngineLandingTransition(program, context);
      }
      if (program.engineControlTransitions) this.#applyEngineLiedownTransition(context);
    }
    if (match.phase !== 'ready') this.#stepHelpers(match, commandsByRoot, aiLevelByRoot, stepContext, executedControllers, triggerTrace);
    if (this.#pause !== null) match.setTimerFrozen(true);
    const entityCommit = this.entities.commit(); for (const fighterId of [...this.#executors.keys()]) if (!this.#programs.has(fighterId) && this.entities.entity(fighterId) === null) this.#executors.delete(fighterId); this.entities.advance(this.#pause?.kind === 'pause' || this.#rootHitPaused(match), this.#pause?.kind === 'super-pause').removeCompletedExplods(stepContext.animationDurationByOwner); const entitySnapshot = this.entities.snapshot(); this.outputs.pruneEntities(new Set(entitySnapshot.entities.map(entity => entity.entityId))); const entityHash = entitySnapshot.hash;
    this.#advancePause(input.tick); const output = this.outputs.snapshot(); const base = Object.freeze({ tick: input.tick, programHash: this.programHash, commandHashes: Object.freeze(commandHashes), executedControllers: Object.freeze(executedControllers), entityCommit, entityHash, pause: this.#pause, output, outputHash: output.hash });
    return Object.freeze({ ...base, triggerTrace: Object.freeze(triggerTrace), hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }

  #execute(controller: MugenStateController, program: Readonly<{ states: ReadonlyMap<number, MugenStateDefinition>; gravity: number }>, context: EvaluationContext): boolean {
    const match = context.match; const id = context.fighterId; const fighter = match.fighter(id); const p = controller.parameters;
    if (this.#executeOutputController(controller, context, id, id, fighter.position, fighter.facing)) return false;
    switch (controller.type) {
      case 'change-state': case 'self-state': {
        const label = controller.type === 'self-state' ? 'SelfState' : 'ChangeState';
        const target = integer(evaluate(p.value!, context), `${label}.value`);
        const control = p.ctrl === undefined ? undefined : truthy(evaluate(p.ctrl, context));
        const animation = p.anim === undefined ? undefined : integer(evaluate(p.anim, context), `${label}.anim`);
        const ownerId = controller.type === 'self-state' ? id : fighter.stateDataOwnerId;
        const definition = this.#programs.get(ownerId)?.states.get(target); if (!definition) throw new RangeError(`MUGEN ${label} target ${target} does not exist for state owner ${ownerId}.`);
        if (controller.type === 'self-state') commitCombat(match, { kind: 'target-release', fighterId: id });
        commit(match, { kind: 'change-state', fighterId: id, stateNumber: target, ...(control === undefined ? {} : { control }), stateDataOwnerId: ownerId, preserveHitDefinition: true, preserveMoveContact: true, preserveHitCount: true });
        this.#applyStateDefinition(definition, context, control, animation, ownerId); return true;
      }
      case 'change-anim': case 'change-anim2': { const label = controller.type === 'change-anim2' ? 'ChangeAnim2' : 'ChangeAnim'; const actionNumber = integer(evaluate(p.value!, context), `${label}.value`); const element = p.elem === undefined ? 1 : Math.max(1, integer(evaluate(p.elem, context), `${label}.elem`)); const ownerId = controller.type === 'change-anim2' ? fighter.stateDataOwnerId : id; commit(match, { kind: 'change-action', fighterId: id, actionNumber, element, ownerId }); return false; }
      case 'vel-set': return setVelocity(match, fighter, p, context, 'set');
      case 'vel-add': return setVelocity(match, fighter, p, context, 'add');
      case 'vel-mul': return setVelocity(match, fighter, p, context, 'multiply');
      case 'pos-set': return setPosition(match, fighter, p, context, 'set');
      case 'pos-add': return setPosition(match, fighter, p, context, 'add');
      case 'pos-freeze': commit(match, { kind: 'position-freeze', fighterId: id, value: positionFreezeValue(p, context) }); return false;
      case 'ctrl-set': commit(match, { kind: 'control', fighterId: id, value: truthy(evaluate(p.value!, context)) }); return false;
      case 'state-type-set': commit(match, { kind: 'state-metadata', fighterId: id, ...(p.statetype === undefined ? {} : { stateType: stateType(evaluate(p.statetype, context)) }), ...(p.movetype === undefined ? {} : { moveType: moveType(evaluate(p.movetype, context)) }), ...(p.physics === undefined ? {} : { physics: physicsType(evaluate(p.physics, context)) }) }); return false;
      case 'turn': commit(match, { kind: 'kinematics', fighterId: id, facing: fighter.facing === 1 ? -1 : 1 }); return false;
      case 'spr-priority': commit(match, { kind: 'sprite-priority', fighterId: id, value: integer(evaluate(p.value!, context), 'SprPriority.value') }); return false;
      case 'width': return setWidth(match, id, p, context);
      case 'var-set': return setVariable(match, id, p, context, false);
      case 'var-add': return setVariable(match, id, p, context, true);
      case 'var-random': return setRandomVariable(match, id, p, context);
      case 'var-range-set': return setVariableRange(match, id, p, context);
      case 'attack-dist': commitCombat(match, { kind: 'attack-distance', fighterId: id, value: integer(evaluate(p.value!, context), 'AttackDist.value') }); return false;
      case 'attack-mul-set': commitCombat(match, { kind: 'damage-multiplier', fighterId: id, attack: numeric(evaluate(p.value!, context), 'AttackMulSet.value') }); return false;
      case 'defence-mul-set': commitCombat(match, { kind: 'damage-multiplier', fighterId: id, defense: numeric(evaluate(p.value!, context), 'DefenceMulSet.value') }); return false;
      case 'hit-add': commitCombat(match, { kind: 'hit-add', fighterId: id, value: integer(evaluate(p.value!, context), 'HitAdd.value') }); return false;
      case 'hit-by': case 'not-hit-by': { const filter = controller.hitAttributeFilter; if (filter === null) throw new TypeError(`MUGEN ${controller.type} controller is missing typed data.`); const remainingTicks = integer(evaluate(filter.time, context), `${controller.type}.time`); if (remainingTicks < -1 || remainingTicks > 3_600) throw new RangeError(`MUGEN ${controller.type}.time must be from -1 to 3600.`); const allowedAttributes = filter.allow ? filter.attributes : ALL_HIT_ATTRIBUTE_KEYS.filter(value => !filter.attributes.includes(value)); commitCombat(match, { kind: 'hit-attribute-slot', fighterId: id, slot: filter.slot, allowedAttributes, remainingTicks }); return false; }
      case 'hit-override': { const override = controller.hitOverride; if (override === null) throw new TypeError('MUGEN HitOverride controller is missing typed data.'); const stateNumber = integer(evaluate(override.stateNumber, context), 'HitOverride.stateno'); const slot = integer(evaluate(override.slot, context), 'HitOverride.slot'); const remainingTicks = integer(evaluate(override.time, context), 'HitOverride.time'); const forceAir = truthy(evaluate(override.forceAir, context)); commitCombat(match, { kind: 'hit-override', fighterId: id, slot, attributes: override.attributes, stateNumber, stateDataOwnerId: fighter.stateDataOwnerId, forceAir, remainingTicks }); return false; }
      case 'reversal-def': { const reversal = controller.reversalDefinition; if (reversal === null) throw new TypeError('MUGEN ReversalDef controller is missing typed data.'); commitCombat(match, { kind: 'reversal-def', fighterId: id, definition: reversal.attributes.length === 0 ? null : resolveReversalDefinition(controller, fighter.stateDataOwnerId, context) }); return false; }
      case 'hit-def': match.activateHitDefinition(id, resolveHitDefinition(controller, context)); return false;
      case 'hit-fall-damage': { if (fighter.hitFall && fighter.hitFallDamage > 0) commit(match, { kind: 'life-set', fighterId: id, value: Math.max(fighter.hitFallKill ? 0 : 1, fighter.life - fighter.hitFallDamage) }); return false; }
      case 'hit-fall-set': { const flag = p.value === undefined ? -1 : integer(evaluate(p.value, context), 'HitFallSet.value'); if (flag < -1 || flag > 1) throw new RangeError('MUGEN HitFallSet.value must be -1, 0 or 1.'); commitCombat(match, { kind: 'hit-fall', fighterId: id, ...(flag === -1 ? {} : { fall: flag === 1 }), ...(p.xvel === undefined ? {} : { xVelocity: numeric(evaluate(p.xvel, context), 'HitFallSet.xvel') }), ...(p.yvel === undefined ? {} : { yVelocity: numeric(evaluate(p.yvel, context), 'HitFallSet.yvel') }) }); return false; }
      case 'hit-fall-vel': { if (fighter.hitFall) commit(match, { kind: 'kinematics', fighterId: id, velocity: [fighter.hitFallVelocity[0] * fighter.facing, fighter.hitFallVelocity[1]] }); return false; }
      case 'hit-vel-set': { const x = p.x !== undefined && truthy(evaluate(p.x, context)); const y = p.y !== undefined && truthy(evaluate(p.y, context)); commit(match, { kind: 'kinematics', fighterId: id, velocity: [x ? -fighter.getHitVelocity[0] * fighter.facing : fighter.velocity[0], y ? fighter.getHitVelocity[1] : fighter.velocity[1]] }); return false; }
      case 'target-bind': return this.#targetBind(id, p, context);
      case 'target-drop': return this.#targetDrop(id, p, context);
      case 'target-facing': return this.#targetFacing(id, fighter.facing, p, context);
      case 'target-life-add': return this.#targetLifeAdd(id, p, context);
      case 'target-power-add': return this.#targetPowerAdd(id, p, context);
      case 'target-state': return this.#targetState(id, p, context);
      case 'target-vel-add': return this.#targetVelocity(id, p, context, 'add');
      case 'target-vel-set': return this.#targetVelocity(id, p, context, 'set');
      case 'player-push': commitCombat(match, { kind: 'player-push', fighterId: id, value: truthy(evaluate(p.value!, context)) }); return false;
      case 'life-add': { const delta = integer(evaluate(p.value!, context), 'LifeAdd.value'); const kill = p.kill === undefined || truthy(evaluate(p.kill, context)); const absolute = p.absolute !== undefined && truthy(evaluate(p.absolute, context)); const defenseMultiplier = this.#programs.get(id)!.defenseMultiplier; commit(match, { kind: 'life-add', fighterId: id, delta, kill, absolute, defenseMultiplier }); return false; }
      case 'life-set': commit(match, { kind: 'life-set', fighterId: id, value: Math.max(0, Math.min(fighter.maxLife, integer(evaluate(p.value!, context), 'LifeSet.value'))) }); return false;
      case 'power-add': commit(match, { kind: 'power', fighterId: id, value: Math.max(0, Math.min(fighter.maxPower, fighter.power + integer(evaluate(p.value!, context), 'PowerAdd.value'))) }); return false;
      case 'power-set': commit(match, { kind: 'power', fighterId: id, value: Math.max(0, Math.min(fighter.maxPower, integer(evaluate(p.value!, context), 'PowerSet.value'))) }); return false;
      case 'move-hit-reset': commit(match, { kind: 'move-hit-reset', fighterId: id }); return false;
      case 'gravity': commit(match, { kind: 'kinematics', fighterId: id, velocity: [fighter.velocity[0], fighter.velocity[1] + program.gravity] }); return false;
      case 'play-snd': match.emitAudio(id, 'play', { group: integer(evaluate(p.group!, context), 'PlaySnd.group'), item: integer(evaluate(p.item!, context), 'PlaySnd.item'), channel: p.channel === undefined ? -1 : integer(evaluate(p.channel, context), 'PlaySnd.channel'), volume: p.volumescale !== undefined ? numeric(evaluate(p.volumescale, context), 'PlaySnd.volumescale') * 2.55 : p.volume === undefined ? 255 : numeric(evaluate(p.volume, context), 'PlaySnd.volume'), pan: p.pan === undefined && p.abspan === undefined ? 0 : soundPan(p, fighter.position[0], fighter.facing, context, id), frequency: p.freqmul === undefined ? 1 : numeric(evaluate(p.freqmul, context), 'PlaySnd.freqmul'), loop: p.loop !== undefined && truthy(evaluate(p.loop, context)), lowPriority: p.lowpriority !== undefined && truthy(evaluate(p.lowpriority, context)) }); return false;
      case 'snd-pan': match.emitAudio(id, 'pan', { channel: integer(evaluate(p.channel!, context), 'SndPan.channel'), pan: soundPan(p, fighter.position[0], fighter.facing, context, id) }); return false;
      case 'stop-snd': match.emitAudio(id, 'stop', { channel: integer(evaluate(p.channel!, context), 'StopSnd.channel') }); return false;
      case 'helper': { spawnHelperController(this.entities, this.outputs, id, fighter.position, fighter.facing, fighter.maxLife, fighter.defenseMultiplier, fighter.juggleCapacity, controller, context); return false; }
      case 'projectile': { spawnProjectileController(this.entities, this.outputs, id, fighter.position, fighter.facing, fighter.actionNumber, fighter.animationOwnerId, controller, context); return false; }
      case 'explod': { spawnExplodController(this.entities, this.outputs, id, id, fighter.position, fighter.facing, fighter.animationOwnerId, controller, context); return false; }
      case 'modify-explod': { modifyExplodController(this.entities, this.outputs, this.entities.explods(fighter.id), fighter.position, fighter.facing, controller, context); return false; }
      case 'remove-explod': { const explodId = optionalInteger(p.id, context, -1, 'RemoveExplod.id'); for (const explod of this.entities.explods(fighter.id, explodId === -1 ? undefined : explodId)) this.entities.destroy(explod.entityId); return false; }
      case 'explod-bind-time': { const explodId = optionalInteger(p.id, context, -1, 'ExplodBindTime.id'); const time = optionalInteger(p.time, context, 1, 'ExplodBindTime.time'); for (const explod of this.entities.explods(fighter.id, explodId === -1 ? undefined : explodId)) this.entities.bind(explod.entityId, id, time); return false; }
      case 'destroy-self': this.entities.destroy(id); return false;
      case 'bind-to-target': { const targetId = optionalInteger(p.id, context, -1, 'BindToTarget.id'); const target = selectedTargets(match, id, targetId)[0]; if (target) commitCombat(match, { kind: 'target-bind', ownerId: target.fighterId, fighterId: id, targetId: target.targetId, offset: [optionalNumber(p['pos.0'], context, 0, 'BindToTarget.pos.x'), optionalNumber(p['pos.1'], context, 0, 'BindToTarget.pos.y')], remainingTicks: optionalInteger(p.time, context, 1, 'BindToTarget.time') }); return false; }
      case 'bind-to-parent': case 'bind-to-root': return false;
      case 'parent-var-add': case 'parent-var-set': case 'assert-special': return false;
      case 'null': return false;
    }
    throw new TypeError(`Unsupported MUGEN controller at runtime: ${String(controller.type)}.`);
  }

  #applyEngineControlTransition(program: Readonly<{ states: ReadonlyMap<number, MugenStateDefinition> }>, context: EvaluationContext): void {
    const fighter = context.match.fighter(context.fighterId); if (!fighter.control || fighter.moveType === 'H' || fighter.hitPauseTicks > 0) return;
    let target: number | null = null;
    if (fighter.stateType === 'S') {
      if (context.commands.has('holdup')) target = 40;
      else if (context.commands.has('holddown')) target = 10;
      else if (context.commands.has('holdfwd') || context.commands.has('holdback')) target = 20;
      else if (fighter.stateNumber === 20) target = 0;
    } else if (fighter.stateType === 'C' && !context.commands.has('holddown')) target = 12;
    if (target === null || target === fighter.stateNumber) return;
    const definition = program.states.get(target); if (!definition) throw new RangeError(`MUGEN engine control transition target ${target} does not exist for ${fighter.id}.`);
    commit(context.match, { kind: 'change-state', fighterId: fighter.id, stateNumber: target, stateDataOwnerId: fighter.id, preserveHitDefinition: false, preserveMoveContact: false, preserveHitCount: false });
    this.#applyStateDefinition(definition, context, undefined, undefined, fighter.id);
  }

  #applyEngineLandingTransition(program: Readonly<{ states: ReadonlyMap<number, MugenStateDefinition> }>, context: EvaluationContext): void {
    const fighter = context.match.fighter(context.fighterId);
    if (fighter.physics !== 'A' || fighter.stateType !== 'A' || fighter.position[1] < 0 || fighter.velocity[1] <= 0) return;
    const definition = program.states.get(52);
    if (!definition) throw new RangeError(`MUGEN engine landing transition target 52 does not exist for ${fighter.id}.`);
    commit(context.match, { kind: 'change-state', fighterId: fighter.id, stateNumber: 52, stateDataOwnerId: fighter.id, preserveHitDefinition: false, preserveMoveContact: false, preserveHitCount: false });
    this.#applyStateDefinition(definition, context, false, undefined, fighter.id);
    commit(context.match, { kind: 'kinematics', fighterId: fighter.id, position: [fighter.position[0], 0], velocity: [fighter.velocity[0], 0] });
  }

  #applyEngineLiedownTransition(context: EvaluationContext): void {
    const fighter = context.match.fighter(context.fighterId); if (fighter.ko || fighter.stateNumber !== 5110 || fighter.hitPauseTicks > 0) return;
    const configured = context.constantsByRoot.get(fighter.id)?.['data.liedown.time']; const liedownTicks = Math.max(0, Math.min(3_600, Math.trunc(configured ?? 60))); if (fighter.stateTime < liedownTicks) return;
    const ownerId = fighter.stateDataOwnerId; const definition = this.#programs.get(ownerId)?.states.get(5120); if (!definition) throw new RangeError(`MUGEN engine liedown transition target 5120 does not exist for ${fighter.id}.`);
    commit(context.match, { kind: 'change-state', fighterId: fighter.id, stateNumber: 5120, stateDataOwnerId: ownerId, preserveHitDefinition: false, preserveMoveContact: false, preserveHitCount: false });
    this.#applyStateDefinition(definition, context, false, undefined, ownerId);
  }

  enterFighterState(match: MugenHeadlessMatch, fighterId: string, stateNumber: number, stateDataOwnerId: string, stepContext: MugenScriptStepContext = {}, control?: boolean): void {
    if (!match.transactionOpen) throw new Error('MUGEN external state transition requires an open match tick.');
    const definition = this.#programs.get(stateDataOwnerId)?.states.get(stateNumber); if (!definition) throw new RangeError(`MUGEN external state ${stateNumber} does not exist for state owner ${stateDataOwnerId}.`);
    const context: EvaluationContext = { ...stepContext, match, matchSnapshot: match.snapshot(), entities: this.entities, fighterId, commands: new Set<string>(), aiLevelByRoot: new Map<string, number>(), identityByRoot: this.#identityByRoot, constantsByRoot: this.#constantsByRoot, localCoordByRoot: this.#localCoordByRoot, paletteNumberByRoot: this.#paletteNumberByRoot, systemVariablesByRoot: this.#systemVariablesByRoot, systemFloatVariablesByRoot: this.#systemFloatVariablesByRoot };
    commit(match, { kind: 'change-state', fighterId, stateNumber, ...(control === undefined ? {} : { control }), stateDataOwnerId, preserveHitDefinition: true, preserveMoveContact: true, preserveHitCount: true });
    this.#applyStateDefinition(definition, context, control, undefined, stateDataOwnerId);
  }

  executionSnapshot(): MugenScriptRuntimeSnapshot { return Object.freeze({ schemaVersion: 8, revision: 'm09-g08-script-character-parity-v8', programHash: this.programHash, lastTick: this.#lastTick, lastRoundNumber: this.#lastRoundNumber, pause: this.#pause, executors: Object.freeze(Object.fromEntries([...this.#executors.entries()].map(([fighterId, executor]) => [fighterId, executor.snapshot()]))), systemVariables: Object.freeze(Object.fromEntries([...this.#systemVariablesByRoot].map(([fighterId, variables]) => [fighterId, Object.freeze([...variables])]))), systemFloatVariables: Object.freeze(Object.fromEntries([...this.#systemFloatVariablesByRoot].map(([fighterId, variables]) => [fighterId, Object.freeze([...variables])]))), entities: this.entities.snapshot(), outputs: this.outputs.snapshot() }); }
  restoreExecution(value: MugenScriptRuntimeSnapshot): void {
    if (!value || value.schemaVersion !== 8 || value.revision !== 'm09-g08-script-character-parity-v8' || value.programHash !== this.programHash || !Number.isSafeInteger(value.lastTick) || value.lastTick < -1 || !Number.isSafeInteger(value.lastRoundNumber) || value.lastRoundNumber < -1 || !value.executors || typeof value.executors !== 'object' || !value.systemVariables || typeof value.systemVariables !== 'object' || !value.systemFloatVariables || typeof value.systemFloatVariables !== 'object') throw new TypeError('MUGEN script execution snapshot is invalid.');
    this.entities = MugenEntityAuthority.restore(value.entities); this.#pause = value.pause === null ? null : normalizePause(value.pause);
    this.outputs.restore(value.outputs);
    const entityIds = new Set([...this.#programs.keys(), ...this.entities.helpers().map(helper => helper.entityId)]); const snapshotIds = Object.keys(value.executors); if (snapshotIds.some(id => !entityIds.has(id)) || [...this.#programs.keys()].some(id => !snapshotIds.includes(id))) throw new TypeError('MUGEN script execution snapshot fighter set is invalid.');
    for (const fighterId of [...this.#executors.keys()]) if (!this.#programs.has(fighterId)) this.#executors.delete(fighterId);
    for (const fighterId of snapshotIds) { const snapshot = value.executors[fighterId]; if (!snapshot) throw new TypeError(`MUGEN execution snapshot is missing ${fighterId}.`); let executor = this.#executors.get(fighterId); if (!executor) { executor = new MugenStateExecutor({ maxControllerEvaluationsPerTick: this.maxControllerEvaluationsPerFighterTick }); this.#executors.set(fighterId, executor); } executor.restore(snapshot); }
    for (const [fighterId, variables] of this.#systemVariablesByRoot) { const restored = value.systemVariables[fighterId]; if (!Array.isArray(restored) || restored.length !== 5 || restored.some(item => !Number.isSafeInteger(item) || item < -2_147_483_648 || item > 2_147_483_647)) throw new TypeError(`MUGEN execution snapshot system variables are invalid for ${fighterId}.`); variables.set(restored); }
    for (const [fighterId, variables] of this.#systemFloatVariablesByRoot) { const restored = value.systemFloatVariables[fighterId]; if (!Array.isArray(restored) || restored.length !== 5 || restored.some(item => typeof item !== 'number' || !Number.isFinite(item) || Math.fround(item) !== item)) throw new TypeError(`MUGEN execution snapshot system float variables are invalid for ${fighterId}.`); variables.set(restored); }
    this.#lastTick = value.lastTick; this.#lastRoundNumber = value.lastRoundNumber;
  }
  resetExecution(): void { for (const executor of this.#executors.values()) executor.reset(); for (const variables of this.#systemVariablesByRoot.values()) variables.fill(0); for (const variables of this.#systemFloatVariablesByRoot.values()) variables.fill(0); this.entities.clearRoundEntities(); this.#pause = null; this.#lastTick = -1; this.#lastRoundNumber = -1; }

  setSystemVariable(rootId: string, index: number, value: number): void { const variables = this.#systemVariablesByRoot.get(rootId); if (variables === undefined || !Number.isSafeInteger(index) || index < 0 || index >= variables.length || !Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) throw new RangeError('MUGEN SysVar mutation is out of range.'); variables[index] = value; }
  setSystemFloatVariable(rootId: string, index: number, value: number): void { const variables = this.#systemFloatVariablesByRoot.get(rootId); const normalized = Math.fround(value); if (variables === undefined || !Number.isSafeInteger(index) || index < 0 || index >= variables.length || !Number.isFinite(value) || !Number.isFinite(normalized)) throw new RangeError('MUGEN SysFVar mutation is out of range.'); variables[index] = normalized; }

  #startPause(value: MugenPauseSnapshot): void { const normalized = normalizePause(value); this.#pause = normalized.remainingTicks === 0 ? null : normalized; }
  #pausedFor(rootId: string): boolean { return this.#pause !== null && (this.#pause.ownerRootId !== rootId || this.#pause.ownerMoveTicks <= 0); }
  #helperPaused(helper: MugenHelperEntitySnapshot): boolean { if (this.#pause === null) return false; return (this.#pause.kind === 'super-pause' ? helper.superMoveTime : helper.pauseMoveTime) <= 0; }
  #advancePause(tick: number): void { if (this.#pause === null || tick <= this.#pause.startedTick) return; const remainingTicks = Math.max(0, this.#pause.remainingTicks - 1); const ownerMoveTicks = Math.max(0, this.#pause.ownerMoveTicks - 1); this.#pause = remainingTicks === 0 ? null : Object.freeze({ ...this.#pause, remainingTicks, ownerMoveTicks }); }

  #rootHitPaused(match: MugenHeadlessMatch): boolean { for (const fighterId of this.#programs.keys()) if (match.fighter(fighterId).hitPauseTicks > 0) return true; return false; }

  #stepHelpers(match: MugenHeadlessMatch, commandsByRoot: ReadonlyMap<string, ReadonlySet<string>>, aiLevelByRoot: ReadonlyMap<string, number>, stepContext: MugenScriptStepContext, executedControllers: string[], triggerTrace: MugenControllerExecutionTrace[]): void {
    const matchSnapshot = match.snapshot();
    for (const initial of this.entities.helpers()) {
      const program = this.#programs.get(initial.rootId); if (!program) continue;
      let helper = this.entities.entity(initial.entityId) as MugenHelperEntitySnapshot;
      if (helper.moveType === 'H') this.entities.removeExplodsOnOwnerGetHit(helper.entityId);
      const evaluationHelpers = new Map<string, MugenHelperEntitySnapshot>([[helper.entityId, helper]]);
      const context: EvaluationContext = { match, matchSnapshot, entities: this.entities, fighterId: helper.entityId, commands: helper.keyControl ? commandsByRoot.get(helper.rootId) ?? EMPTY_COMMANDS : EMPTY_COMMANDS, aiLevelByRoot, identityByRoot: this.#identityByRoot, constantsByRoot: this.#constantsByRoot, localCoordByRoot: this.#localCoordByRoot, paletteNumberByRoot: this.#paletteNumberByRoot, systemVariablesByRoot: this.#systemVariablesByRoot, systemFloatVariablesByRoot: this.#systemFloatVariablesByRoot, evaluationHelpers, ...stepContext };
      if (helper.stateDefinitionPending) { const definition = this.#programs.get(helper.stateDataOwnerId)?.states.get(helper.stateNumber); if (!definition) throw new RangeError(`MUGEN Helper pending state ${helper.stateNumber} does not exist for ${helper.stateDataOwnerId}.`); this.#applyHelperStateDefinition(helper, definition, context); this.entities.updateHelper(helper.entityId, { stateGeneration: helper.stateGeneration === 0 ? 1 : helper.stateGeneration, stateDefinitionPending: false }); helper = this.entities.entity(helper.entityId) as MugenHelperEntitySnapshot; }
      let executor = this.#executors.get(helper.entityId); if (!executor) { executor = new MugenStateExecutor({ maxControllerEvaluationsPerTick: this.maxControllerEvaluationsPerFighterTick }); this.#executors.set(helper.entityId, executor); }
      const result = executor.executeTick({
        snapshot: () => Object.freeze({ entityId: helper.entityId, stateNumber: helper.stateNumber, stateGeneration: helper.stateGeneration, hitPaused: helper.hitPauseTicks > 0, paused: this.#helperPaused(helper), helper: true, keyControl: helper.keyControl, usingOwnStateData: helper.stateDataOwnerId === helper.rootId }),
        state: (number, owner) => this.#programs.get(owner === 'own' ? helper.rootId : helper.stateDataOwnerId)?.states.get(number) ?? null,
        evaluate: expression => tryEvaluateVariableGate(expression, helper, context) ?? evaluateValue(expression, context),
        execute: (controller, execution) => { executedControllers.push(`${helper.entityId}:${execution.stateNumber}:${execution.controllerIndex}:${controller.type}`); const transitioned = this.#executeHelper(controller, context); const current = this.entities.entity(helper.entityId); if (current?.kind === 'helper') { helper = current; evaluationHelpers.set(helper.entityId, helper); } else evaluationHelpers.delete(helper.entityId); return Object.freeze({ transitioned }); },
      }, { trace: stepContext.traceTriggers === true });
      triggerTrace.push(...result.trace);
      const current = this.entities.entity(helper.entityId);
      if (current?.kind === 'helper' && current.hitPauseTicks === 0) applyHelperPhysics(this.entities, current, program);
    }
  }

  #executeHelper(controller: MugenStateController, context: EvaluationContext): boolean {
    const helper = this.entities.entity(context.fighterId); if (helper?.kind !== 'helper') return false; const p = controller.parameters;
    if (this.#executeOutputController(controller, context, helper.entityId, helper.rootId, helper.position, helper.facing)) return false;
    switch (controller.type) {
      case 'change-state': case 'self-state': { const target = integer(evaluate(p.value!, context), 'Helper.ChangeState.value'); const ownerId = controller.type === 'self-state' ? helper.rootId : helper.stateDataOwnerId; this.#enterHelperState(helper.entityId, target, ownerId, context, p.ctrl === undefined ? undefined : truthy(evaluate(p.ctrl, context))); return true; }
      case 'change-anim': case 'change-anim2': this.entities.updateHelper(helper.entityId, { actionNumber: integer(evaluate(p.value!, context), 'Helper.ChangeAnim.value'), actionTime: 0 }); return false;
      case 'vel-set': case 'vel-add': { let x = helper.velocity[0]; let y = helper.velocity[1]; if (p.x !== undefined) { const value = numeric(evaluate(p.x, context), 'Helper.velocity.x'); x = controller.type === 'vel-add' ? x + value * helper.facing : value * helper.facing; } if (p.y !== undefined) { const value = numeric(evaluate(p.y, context), 'Helper.velocity.y'); y = controller.type === 'vel-add' ? y + value : value; } this.entities.updateHelper(helper.entityId, { velocity: [x, y] }); return false; }
      case 'vel-mul': { const x = p.x === undefined ? 1 : numeric(evaluate(p.x, context), 'Helper.VelMul.x'); const y = p.y === undefined ? 1 : numeric(evaluate(p.y, context), 'Helper.VelMul.y'); this.entities.updateHelper(helper.entityId, { velocity: [helper.velocity[0] * x, helper.velocity[1] * y] }); return false; }
      case 'pos-set': case 'pos-add': { const x = optionalNumber(p.x, context, controller.type === 'pos-set' ? helper.position[0] : 0, 'Helper.position.x'); const y = optionalNumber(p.y, context, controller.type === 'pos-set' ? helper.position[1] : 0, 'Helper.position.y'); this.entities.updateHelper(helper.entityId, { position: controller.type === 'pos-add' ? [helper.position[0] + x * helper.facing, helper.position[1] + y] : [x, y] }); return false; }
      case 'pos-freeze': this.entities.setHelperPositionFrozen(helper.entityId, positionFreezeValue(p, context)); return false;
      case 'ctrl-set': this.entities.updateHelper(helper.entityId, { control: truthy(evaluate(p.value!, context)) }); return false;
      case 'state-type-set': this.entities.updateHelper(helper.entityId, { ...(p.statetype === undefined ? {} : { stateType: stateType(evaluate(p.statetype, context)) }), ...(p.movetype === undefined ? {} : { moveType: moveType(evaluate(p.movetype, context)) }), ...(p.physics === undefined ? {} : { physics: physicsType(evaluate(p.physics, context)) }) }); return false;
      case 'turn': this.entities.updateHelper(helper.entityId, { facing: helper.facing === 1 ? -1 : 1 }); return false;
      case 'gravity': { const program = this.#programs.get(helper.rootId)!; this.entities.updateHelper(helper.entityId, { velocity: [helper.velocity[0], helper.velocity[1] + program.gravity] }); return false; }
      case 'hit-def': this.entities.activateHelperHitDefinition(helper.entityId, resolveHitDefinition(controller, context)); return false;
      case 'hit-by': case 'not-hit-by': { const filter = controller.hitAttributeFilter; if (filter === null) throw new TypeError(`MUGEN Helper ${controller.type} controller is missing typed data.`); const remainingTicks = integer(evaluate(filter.time, context), `Helper.${controller.type}.time`); const allowedAttributes = filter.allow ? filter.attributes : ALL_HIT_ATTRIBUTE_KEYS.filter(value => !filter.attributes.includes(value)); this.entities.setHelperHitAttributeSlot(helper.entityId, filter.slot, allowedAttributes, remainingTicks); return false; }
      case 'hit-override': { const override = controller.hitOverride; if (override === null) throw new TypeError('MUGEN Helper HitOverride controller is missing typed data.'); this.entities.setHelperHitOverride(helper.entityId, integer(evaluate(override.slot, context), 'Helper.HitOverride.slot'), { attributes: override.attributes, stateNumber: integer(evaluate(override.stateNumber, context), 'Helper.HitOverride.stateno'), stateDataOwnerId: helper.stateDataOwnerId, forceAir: truthy(evaluate(override.forceAir, context)), remainingTicks: integer(evaluate(override.time, context), 'Helper.HitOverride.time') }); return false; }
      case 'attack-mul-set': this.entities.updateHelperCombat(helper.entityId, { attackMultiplier: numeric(evaluate(p.value!, context), 'Helper.AttackMulSet.value') }); return false;
      case 'defence-mul-set': this.entities.updateHelperCombat(helper.entityId, { defenseMultiplier: numeric(evaluate(p.value!, context), 'Helper.DefenceMulSet.value') }); return false;
      case 'hit-add': this.entities.updateHelperCombat(helper.entityId, { hitCount: Math.max(0, helper.hitCount + integer(evaluate(p.value!, context), 'Helper.HitAdd.value')) }); return false;
      case 'hit-vel-set': { const x = p.x !== undefined && truthy(evaluate(p.x, context)); const y = p.y !== undefined && truthy(evaluate(p.y, context)); this.entities.updateHelper(helper.entityId, { velocity: [x ? -helper.getHitVelocity[0] * helper.facing : helper.velocity[0], y ? helper.getHitVelocity[1] : helper.velocity[1]] }); return false; }
      case 'player-push': this.entities.updateHelperCombat(helper.entityId, { playerPushEnabled: p.value === undefined || truthy(evaluate(p.value, context)) }); return false;
      case 'spr-priority': this.entities.updateHelperCombat(helper.entityId, { spritePriority: integer(evaluate(p.value!, context), 'Helper.SprPriority.value') }); return false;
      case 'target-bind': return this.#targetBind(helper.entityId, p, context);
      case 'target-drop': return this.#targetDrop(helper.entityId, p, context);
      case 'target-facing': return this.#targetFacing(helper.entityId, helper.facing, p, context);
      case 'target-life-add': return this.#targetLifeAdd(helper.entityId, p, context);
      case 'target-power-add': return this.#targetPowerAdd(helper.entityId, p, context);
      case 'target-state': return this.#targetState(helper.entityId, p, context);
      case 'target-vel-add': return this.#targetVelocity(helper.entityId, p, context, 'add');
      case 'target-vel-set': return this.#targetVelocity(helper.entityId, p, context, 'set');
      case 'var-set': case 'var-add': { if (p.sv !== undefined) { setSystemVariableValue(context, helper.rootId, integer(evaluate(p.sv, context), 'Helper SysVar index'), integer(evaluate(p.value!, context), 'Helper SysVar value'), controller.type === 'var-add'); return false; } const floats = p.fv !== undefined; const index = integer(evaluate((floats ? p.fv : p.v)!, context), 'Helper variable index'); const current = floats ? helper.floatVariables[index] ?? 0 : helper.integerVariables[index] ?? 0; const value = numeric(evaluate(p.value!, context), 'Helper variable value'); this.entities.setHelperVariable(helper.entityId, floats ? 'float' : 'integer', index, controller.type === 'var-add' ? current + value : value); return false; }
      case 'var-random': { const [index, value] = randomVariableAssignment(context.match, p, context, 'Helper VarRandom'); this.entities.setHelperVariable(helper.entityId, 'integer', index, value); return false; }
      case 'var-range-set': { const range = variableRangeAssignment(p, context, 'Helper VarRangeSet'); for (let index = range.first; index <= range.last; index += 1) this.entities.setHelperVariable(helper.entityId, range.floats ? 'float' : 'integer', index, range.value); return false; }
      case 'parent-var-set': case 'parent-var-add': { const parent = this.entities.entity(helper.parentId); if (parent?.kind === 'helper') { const floats = p.fv !== undefined; const index = integer(evaluate((floats ? p.fv : p.v)!, context), 'ParentVar index'); const current = floats ? parent.floatVariables[index] ?? 0 : parent.integerVariables[index] ?? 0; const value = numeric(evaluate(p.value!, context), 'ParentVar value'); this.entities.setHelperVariable(parent.entityId, floats ? 'float' : 'integer', index, controller.type === 'parent-var-add' ? current + value : value); } else if (parent?.kind === 'root') setVariable(context.match, parent.entityId, p, context, controller.type === 'parent-var-add'); return false; }
      case 'assert-special': return false;
      case 'bind-to-parent': case 'bind-to-root': { const target = controller.type === 'bind-to-parent' ? helper.parentId : helper.rootId; this.entities.bind(helper.entityId, target, optionalInteger(p.time, context, 1, 'Helper.Bind.time'), [optionalNumber(p['pos.0'], context, 0, 'Helper.Bind.pos.x'), optionalNumber(p['pos.1'], context, 0, 'Helper.Bind.pos.y')]); return false; }
      case 'bind-to-target': { const targetId = optionalInteger(p.id, context, -1, 'Helper.BindToTarget.id'); const target = this.entities.targets(helper.entityId, targetId === -1 ? undefined : targetId)[0]; if (target) this.entities.bind(helper.entityId, target.entityId, optionalInteger(p.time, context, 1, 'Helper.BindToTarget.time'), [optionalNumber(p['pos.0'], context, 0, 'Helper.BindToTarget.pos.x'), optionalNumber(p['pos.1'], context, 0, 'Helper.BindToTarget.pos.y')]); return false; }
      case 'destroy-self': this.entities.destroy(helper.entityId); return false;
      case 'helper': { spawnHelperController(this.entities, this.outputs, helper.entityId, helper.position, helper.facing, helper.maxLife, helper.defenseMultiplier, helper.juggleCapacity, controller, context); return false; }
      case 'explod': { spawnExplodController(this.entities, this.outputs, helper.entityId, helper.rootId, helper.position, helper.facing, helper.rootId, controller, context); return false; }
      case 'modify-explod': { modifyExplodController(this.entities, this.outputs, this.entities.explods().filter(value => value.ownerId === helper.entityId), helper.position, helper.facing, controller, context); return false; }
      case 'remove-explod': { const explodId = optionalInteger(p.id, context, -1, 'RemoveExplod.id'); for (const explod of this.entities.explods().filter(value => value.ownerId === helper.entityId && (explodId === -1 || value.explodId === explodId))) this.entities.destroy(explod.entityId); return false; }
      case 'explod-bind-time': { const explodId = optionalInteger(p.id, context, -1, 'ExplodBindTime.id'); for (const explod of this.entities.explods().filter(value => value.ownerId === helper.entityId && (explodId === -1 || value.explodId === explodId))) this.entities.bind(explod.entityId, helper.entityId, optionalInteger(p.time, context, 1, 'ExplodBindTime.time')); return false; }
      case 'projectile': { spawnProjectileController(this.entities, this.outputs, helper.entityId, helper.position, helper.facing, helper.actionNumber, helper.rootId, controller, context); return false; }
      case 'play-snd': context.match.emitAudio(helper.rootId, 'play', { group: integer(evaluate(p.group!, context), 'PlaySnd.group'), item: integer(evaluate(p.item!, context), 'PlaySnd.item'), channel: p.channel === undefined ? -1 : integer(evaluate(p.channel, context), 'PlaySnd.channel'), volume: p.volumescale !== undefined ? numeric(evaluate(p.volumescale, context), 'PlaySnd.volumescale') * 2.55 : p.volume === undefined ? 255 : numeric(evaluate(p.volume, context), 'PlaySnd.volume'), pan: p.pan === undefined && p.abspan === undefined ? 0 : soundPan(p, helper.position[0], helper.facing, context, helper.rootId), frequency: p.freqmul === undefined ? 1 : numeric(evaluate(p.freqmul, context), 'PlaySnd.freqmul'), loop: p.loop !== undefined && truthy(evaluate(p.loop, context)), lowPriority: p.lowpriority !== undefined && truthy(evaluate(p.lowpriority, context)) }); return false;
      case 'snd-pan': context.match.emitAudio(helper.rootId, 'pan', { channel: integer(evaluate(p.channel!, context), 'SndPan.channel'), pan: soundPan(p, helper.position[0], helper.facing, context, helper.rootId) }); return false;
      case 'stop-snd': context.match.emitAudio(helper.rootId, 'stop', { channel: integer(evaluate(p.channel!, context), 'StopSnd.channel') }); return false;
      case 'null': return false;
      default: throw new TypeError(`MUGEN ${controller.type} is not yet valid for Helper execution.`);
    }
  }

  #executeOutputController(controller: MugenStateController, context: EvaluationContext, entityId: string, rootId: string, position: readonly [number, number], facing: -1 | 1): boolean {
    const p = controller.parameters; const literal = controller.literalParameters ?? {};
    const value = (key: string, fallback: number, label: string): number => optionalNumber(p[key], context, fallback, label);
    const integerValue = (key: string, fallback: number, label: string): number => optionalInteger(p[key], context, fallback, label);
    const triple = (key: string, fallback: readonly [number, number, number], label: string): readonly [number, number, number] => Object.freeze([value(`${key}.0`, fallback[0], `${label}.r`), value(`${key}.1`, fallback[1], `${label}.g`), value(`${key}.2`, fallback[2], `${label}.b`)]);
    const palette = (label: string): MugenPaletteEffect => Object.freeze({ remainingTicks: integerValue('time', 1, `${label}.time`), elapsedTicks: 0, add: triple('add', [0, 0, 0], `${label}.add`), multiply: triple('mul', [256, 256, 256], `${label}.mul`), sineAdd: Object.freeze([value('sinadd.0', 0, `${label}.sinadd.r`), value('sinadd.1', 0, `${label}.sinadd.g`), value('sinadd.2', 0, `${label}.sinadd.b`), integerValue('sinadd.3', 1, `${label}.sinadd.period`)]) as readonly [number, number, number, number], invertAll: p.invertall !== undefined && truthy(evaluate(p.invertall, context)), color: integerValue('color', 256, `${label}.color`) });
    switch (controller.type) {
      case 'assert-special': { const flags = ['flag', 'flag2', 'flag3'].flatMap(key => literal[key] === undefined ? [] : [literal[key] as MugenAssertSpecialFlag]); this.outputs.assert(entityId, flags); if (flags.includes('timerfreeze')) context.match.setTimerFrozen(true); return true; }
      case 'trans': {
        const mode = (literal.trans ?? 'default').toLowerCase() as MugenTransparencyMode; const defaults: readonly [number, number] = mode === 'addalpha' ? [256, 0] : mode === 'add1' ? [256, 128] : [256, 256];
        const alpha = (key: string, fallback: number, label: string): number => Math.max(0, Math.min(256, value(key, fallback, label)));
        this.outputs.setTransparency(entityId, mode, [alpha('alpha.0', defaults[0], 'Trans.alpha.source'), alpha('alpha.1', defaults[1], 'Trans.alpha.destination')]); return true;
      }
      case 'screen-bound': this.outputs.setScreenBound(entityId, p.value !== undefined && truthy(evaluate(p.value, context)), [p['movecamera.0'] !== undefined && truthy(evaluate(p['movecamera.0'], context)), p['movecamera.1'] !== undefined && truthy(evaluate(p['movecamera.1'], context))]); return true;
      case 'pal-fx': this.outputs.setPalette(entityId, palette('PalFX')); return true;
      case 'all-pal-fx': this.outputs.setAllPalette(palette('AllPalFX')); return true;
      case 'angle-add': this.outputs.addDrawingAngle(entityId, value('value', 0, 'AngleAdd.value')); return true;
      case 'angle-mul': this.outputs.multiplyDrawingAngle(entityId, value('value', 1, 'AngleMul.value')); return true;
      case 'angle-set': this.outputs.setDrawingAngle(entityId, value('value', 0, 'AngleSet.value')); return true;
      case 'angle-draw': this.outputs.drawAngle(entityId, p.value === undefined ? null : value('value', 0, 'AngleDraw.value'), [value('scale.0', 1, 'AngleDraw.scale.x'), value('scale.1', 1, 'AngleDraw.scale.y')]); return true;
      case 'offset': this.outputs.setDisplayOffset(entityId, [value('x', 0, 'Offset.x'), value('y', 0, 'Offset.y')]); return true;
      case 'remap-pal': this.outputs.setPaletteRemap(entityId, [integerValue('source.0', 0, 'RemapPal.source.group'), integerValue('source.1', 0, 'RemapPal.source.item')], [integerValue('dest.0', 0, 'RemapPal.dest.group'), integerValue('dest.1', 0, 'RemapPal.dest.item')]); return true;
      case 'pause':
        this.#startPause(Object.freeze({ kind: 'pause', ownerRootId: rootId, remainingTicks: integerValue('time', 1, 'Pause.time'), ownerMoveTicks: integerValue('movetime', 1, 'Pause.movetime'), endCommandBufferTicks: integerValue('endcmdbuftime', 0, 'Pause.endcmdbuftime'), backgroundPaused: p.pausebg === undefined || truthy(evaluate(p.pausebg, context)), darken: false, opponentDefenseMultiplier: 1, ownerUnhittable: false, startedTick: context.match.tick })); return true;
      case 'super-pause': {
        this.#startPause(Object.freeze({ kind: 'super-pause', ownerRootId: rootId, remainingTicks: integerValue('time', 30, 'SuperPause.time'), ownerMoveTicks: integerValue('movetime', 0, 'SuperPause.movetime'), endCommandBufferTicks: 0, backgroundPaused: true, darken: p.darken === undefined || truthy(evaluate(p.darken, context)), opponentDefenseMultiplier: value('p2defmul', 1, 'SuperPause.p2defmul'), ownerUnhittable: p.unhittable === undefined || truthy(evaluate(p.unhittable, context)), startedTick: context.match.tick }));
        if (p.poweradd !== undefined) { const fighter = context.match.fighter(rootId); commit(context.match, { kind: 'power', fighterId: rootId, value: Math.max(0, Math.min(fighter.maxPower, fighter.power + integer(evaluate(p.poweradd, context), 'SuperPause.poweradd'))) }); }
        if (p.anim !== undefined) this.outputs.emit({ kind: 'legacy-animation', policy: 'fightfx-render-event', entityId, animationNumber: integer(evaluate(p.anim, context), 'SuperPause.anim'), position: [position[0] + value('pos.0', 0, 'SuperPause.pos.x') * facing, position[1] + value('pos.1', 0, 'SuperPause.pos.y')], facing, layer: 'above' });
        if (p['sound.0'] !== undefined) context.match.emitAudio(rootId, 'play', { group: integer(evaluate(p['sound.0'], context), 'SuperPause.sound.group'), item: integer(evaluate(p['sound.1']!, context), 'SuperPause.sound.item'), channel: -1 });
        return true;
      }
      case 'bg-pal-fx': this.outputs.setBackgroundPalette(palette('BGPalFX')); return true;
      case 'env-color': this.outputs.setEnvironmentColor({ remainingTicks: integerValue('time', 1, 'EnvColor.time'), color: [integerValue('value.0', 255, 'EnvColor.value.r'), integerValue('value.1', 255, 'EnvColor.value.g'), integerValue('value.2', 255, 'EnvColor.value.b')], under: p.under !== undefined && truthy(evaluate(p.under, context)) }); return true;
      case 'after-image': {
        const effect: MugenAfterImageEffect = Object.freeze({ remainingTicks: integerValue('time', 1, 'AfterImage.time'), length: integerValue('length', 20, 'AfterImage.length'), paletteColor: integerValue('palcolor', 256, 'AfterImage.palcolor'), paletteInvertAll: p.palinvertall !== undefined && truthy(evaluate(p.palinvertall, context)), paletteBright: triple('palbright', [30, 30, 30], 'AfterImage.palbright'), paletteContrast: triple('palcontrast', [120, 120, 220], 'AfterImage.palcontrast'), palettePostBright: triple('palpostbright', [0, 0, 0], 'AfterImage.palpostbright'), paletteAdd: triple('paladd', [10, 10, 25], 'AfterImage.paladd'), paletteMultiply: triple('palmul', [.65, .65, .75], 'AfterImage.palmul'), timeGap: integerValue('timegap', 1, 'AfterImage.timegap'), frameGap: integerValue('framegap', 4, 'AfterImage.framegap'), transparency: (literal.trans ?? 'none').toLowerCase() as MugenAfterImageEffect['transparency'] });
        this.outputs.setAfterImage(entityId, effect); return true;
      }
      case 'after-image-time': this.outputs.setAfterImageTime(entityId, integerValue(p.time === undefined ? 'value' : 'time', 0, 'AfterImageTime.time')); return true;
      case 'env-shake': { const frequency = value('freq', 60, 'EnvShake.freq'); this.outputs.setCameraShake({ remainingTicks: integerValue('time', 0, 'EnvShake.time'), elapsedTicks: 0, frequency, amplitude: value('ampl', -4, 'EnvShake.ampl'), phase: value('phase', frequency >= 90 ? 90 : 0, 'EnvShake.phase') }); return true; }
      case 'fall-env-shake': {
        const entity = entityId === rootId ? null : this.entities.entity(entityId);
        const effect = entity?.kind === 'helper' ? entity.hitFallEnvShake : context.match.fighter(rootId).hitFallEnvShake;
        if (effect[0] > 0) this.outputs.setCameraShake({ remainingTicks: effect[0], elapsedTicks: 0, frequency: effect[1], amplitude: effect[2], phase: effect[3] });
        return true;
      }
      case 'force-feedback': {
        const polynomial = (key: 'frequency' | 'amplitude', source: 'freq' | 'ampl'): readonly [number, number, number, number] => Object.freeze([value(`${source}.0`, 128, `ForceFeedback.${source}.start`), value(`${source}.1`, 0, `ForceFeedback.${source}.d1`), value(`${source}.2`, 0, `ForceFeedback.${source}.d2`), value(`${source}.3`, 0, `ForceFeedback.${source}.d3`)]);
        this.outputs.emit({ kind: 'force-feedback', policy: 'browser-gamepad-best-effort', entityId, rootId, target: p.self === undefined || truthy(evaluate(p.self, context)) ? 'self' : 'opponent', waveform: (literal.waveform ?? 'sine').toLowerCase() as MugenForceFeedbackWaveform, time: integerValue('time', 60, 'ForceFeedback.time'), frequency: polynomial('frequency', 'freq'), amplitude: polynomial('amplitude', 'ampl') }); return true;
      }
      case 'display-to-clipboard': case 'append-to-clipboard': this.outputs.emit({ kind: 'clipboard-debug', policy: 'internal-debug-buffer', entityId, mode: controller.type === 'display-to-clipboard' ? 'replace' : 'append', text: literal.text ?? '', paramsSource: literal.params ?? '' }); return true;
      case 'clear-clipboard': this.outputs.emit({ kind: 'clipboard-debug', policy: 'internal-debug-buffer', entityId, mode: 'clear', text: '', paramsSource: '' }); return true;
      case 'victory-quote': if (entityId === rootId) this.outputs.setVictoryQuote(rootId, integerValue('value', -1, 'VictoryQuote.value')); return true;
      case 'game-make-anim': {
        const random = Math.max(0, integerValue('random', 0, 'GameMakeAnim.random')); const displacement = (): number => random === 0 ? 0 : (context.match.nextRandomUint32() % (random + 1)) - Math.floor(random / 2);
        this.outputs.emit({ kind: 'legacy-animation', policy: 'fightfx-render-event', entityId, animationNumber: integerValue('value', 0, 'GameMakeAnim.value'), position: [position[0] + (value('pos.0', 0, 'GameMakeAnim.pos.x') + displacement()) * facing, position[1] + value('pos.1', 0, 'GameMakeAnim.pos.y') + displacement()], facing, layer: p.under !== undefined && truthy(evaluate(p.under, context)) ? 'below' : 'above' }); return true;
      }
      case 'make-dust': {
        const first: readonly [number, number] = [position[0] + value('pos.0', 0, 'MakeDust.pos.x') * facing, position[1] + value('pos.1', 0, 'MakeDust.pos.y')]; const positions = p['pos2.0'] === undefined ? [first] : [first, [position[0] + value('pos2.0', 0, 'MakeDust.pos2.x') * facing, position[1] + value('pos2.1', 0, 'MakeDust.pos2.y')] as const];
        const spacing = integerValue('spacing', 3, 'MakeDust.spacing'); if (spacing < 1) throw new RangeError('MUGEN MakeDust.spacing must be positive.'); this.outputs.emit({ kind: 'dust', policy: 'fightfx-render-event', entityId, positions: Object.freeze(positions), spacing }); return true;
      }
      default: return false;
    }
  }

  #targetBind(ownerId: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const remainingTicks = optionalInteger(parameters.time, context, 1, 'TargetBind.time'); const targetId = optionalInteger(parameters.id, context, -1, 'TargetBind.id'); const offset: readonly [number, number] = [optionalNumber(parameters['pos.0'], context, 0, 'TargetBind.pos.x'), optionalNumber(parameters['pos.1'], context, 0, 'TargetBind.pos.y')]; const owner = this.entities.entity(ownerId); for (const link of this.entities.targets(ownerId, targetId === -1 ? undefined : targetId)) { const target = this.entities.entity(link.entityId); if (target?.kind === 'helper') this.entities.bind(target.entityId, ownerId, remainingTicks, offset); else if (target?.kind === 'root' && owner?.kind === 'root') commitCombat(context.match, { kind: 'target-bind', ownerId, fighterId: target.entityId, targetId: link.targetId, offset, remainingTicks }); else if (target?.kind === 'root' && owner?.kind === 'helper') this.entities.bindRoot(target.entityId, owner.entityId, remainingTicks, offset); } return false; }
  #targetDrop(ownerId: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const excludeTargetId = optionalInteger(parameters.excludeid, context, -1, 'TargetDrop.excludeID'); const keepOne = parameters.keepone === undefined || truthy(evaluate(parameters.keepone, context)); this.entities.dropTargets(ownerId, excludeTargetId, keepOne); if (this.entities.entity(ownerId)?.kind === 'root') commitCombat(context.match, { kind: 'target-drop', fighterId: ownerId, excludeTargetId, keepOne }); return false; }
  #targetFacing(ownerId: string, ownerFacing: -1 | 1, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const value = integer(evaluate(parameters.value!, context), 'TargetFacing.value'); const targetId = optionalInteger(parameters.id, context, -1, 'TargetFacing.id'); const targetFacing = value >= 0 ? ownerFacing : ownerFacing === 1 ? -1 : 1; for (const link of this.entities.targets(ownerId, targetId === -1 ? undefined : targetId)) { const target = this.entities.entity(link.entityId); if (target?.kind === 'root') commit(context.match, { kind: 'kinematics', fighterId: target.entityId, facing: targetFacing }); else if (target?.kind === 'helper') this.entities.updateHelper(target.entityId, { facing: targetFacing }); } return false; }
  #targetLifeAdd(ownerId: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const delta = integer(evaluate(parameters.value!, context), 'TargetLifeAdd.value'); const targetId = optionalInteger(parameters.id, context, -1, 'TargetLifeAdd.id'); const kill = parameters.kill === undefined || truthy(evaluate(parameters.kill, context)); const absolute = parameters.absolute !== undefined && truthy(evaluate(parameters.absolute, context)); for (const link of this.entities.targets(ownerId, targetId === -1 ? undefined : targetId)) { const target = this.entities.entity(link.entityId); if (target?.kind === 'root') commit(context.match, { kind: 'life-add', fighterId: target.entityId, delta, kill, absolute, defenseMultiplier: this.#programs.get(target.entityId)!.defenseMultiplier }); else if (target?.kind === 'helper') { if (!absolute && target.defenseMultiplier <= 0) throw new RangeError('MUGEN Helper TargetLifeAdd defense multiplier must be positive.'); let applied = absolute ? delta : delta / target.defenseMultiplier; if (!absolute && applied < 0 && applied > -1) applied = -1; applied = applied < 0 ? -Math.round(-applied) : Math.round(applied); this.entities.updateHelperCombat(target.entityId, { life: Math.max(kill ? 0 : 1, Math.min(target.maxLife, target.life + applied)) }); } } return false; }
  #targetPowerAdd(ownerId: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const delta = integer(evaluate(parameters.value!, context), 'TargetPowerAdd.value'); const targetId = optionalInteger(parameters.id, context, -1, 'TargetPowerAdd.id'); for (const link of this.entities.targets(ownerId, targetId === -1 ? undefined : targetId)) { const target = this.entities.entity(link.entityId); if (target?.kind !== 'root' && target?.kind !== 'helper') continue; const rootId = target.rootId; const fighter = context.match.fighter(rootId); commit(context.match, { kind: 'power', fighterId: rootId, value: Math.max(0, Math.min(fighter.maxPower, fighter.power + delta)) }); } return false; }
  #targetState(ownerId: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const stateNumber = integer(evaluate(parameters.value!, context), 'TargetState.value'); const targetId = optionalInteger(parameters.id, context, -1, 'TargetState.id'); const stateDataOwnerId = this.entities.entity(ownerId)?.rootId ?? ownerId; for (const link of this.entities.targets(ownerId, targetId === -1 ? undefined : targetId)) { const target = this.entities.entity(link.entityId); if (target?.kind === 'root') this.enterFighterState(context.match, target.entityId, stateNumber, stateDataOwnerId, context); else if (target?.kind === 'helper') this.#enterHelperState(target.entityId, stateNumber, stateDataOwnerId, context); } return false; }
  #targetVelocity(ownerId: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext, mode: 'set' | 'add'): false { const x = parameters.x === undefined ? null : numeric(evaluate(parameters.x, context), `TargetVel${mode === 'set' ? 'Set' : 'Add'}.x`); const y = parameters.y === undefined ? null : numeric(evaluate(parameters.y, context), `TargetVel${mode === 'set' ? 'Set' : 'Add'}.y`); const targetId = optionalInteger(parameters.id, context, -1, `TargetVel${mode === 'set' ? 'Set' : 'Add'}.id`); for (const link of this.entities.targets(ownerId, targetId === -1 ? undefined : targetId)) { const target = this.entities.entity(link.entityId); if (target?.kind === 'root') { const fighter = context.match.fighter(target.entityId); commit(context.match, { kind: 'kinematics', fighterId: fighter.id, velocity: [x === null ? fighter.velocity[0] : mode === 'set' ? x * fighter.facing : fighter.velocity[0] + x * fighter.facing, y === null ? fighter.velocity[1] : mode === 'set' ? y : fighter.velocity[1] + y] }); } else if (target?.kind === 'helper') this.entities.updateHelper(target.entityId, { velocity: [x === null ? target.velocity[0] : mode === 'set' ? x * target.facing : target.velocity[0] + x * target.facing, y === null ? target.velocity[1] : mode === 'set' ? y : target.velocity[1] + y] }); } return false; }

  #enterHelperState(entityId: string, stateNumber: number, stateDataOwnerId: string, context: EvaluationContext, control?: boolean): void { const helper = this.entities.entity(entityId); if (helper?.kind !== 'helper') throw new TypeError(`Unknown MUGEN Helper ${entityId}.`); const definition = this.#programs.get(stateDataOwnerId)?.states.get(stateNumber); if (!definition) throw new RangeError(`MUGEN Helper state ${stateNumber} does not exist for ${stateDataOwnerId}.`); this.entities.updateHelper(entityId, { previousStateNumber: helper.stateNumber, stateNumber, stateTime: 0, stateGeneration: helper.stateGeneration + 1, stateDataOwnerId, stateDefinitionPending: false, ...(control === undefined ? {} : { control }) }); this.#applyHelperStateDefinition(this.entities.entity(entityId) as MugenHelperEntitySnapshot, definition, { ...context, fighterId: entityId }); }

  #applyHelperStateDefinition(helper: MugenHelperEntitySnapshot, state: MugenStateDefinition, context: EvaluationContext): void { const preserveHitDefinition = state.hitDefPersist !== null && truthy(evaluate(state.hitDefPersist, context)); const preserveMoveContact = state.moveHitPersist !== null && truthy(evaluate(state.moveHitPersist, context)); const preserveHitCount = state.hitCountPersist !== null && truthy(evaluate(state.hitCountPersist, context)); this.entities.resetHelperStateEntry(helper.entityId, preserveHitDefinition, preserveMoveContact, preserveHitCount); this.entities.updateHelper(helper.entityId, { ...(state.stateType === 'U' ? {} : { stateType: state.stateType }), ...(state.moveType === 'U' ? {} : { moveType: state.moveType }), ...(state.physics === 'U' ? {} : { physics: state.physics }), ...(state.animation === null ? {} : { actionNumber: integer(evaluate(state.animation, context), 'Helper.StateDef.anim'), actionTime: 0 }), ...(state.velocity === null ? {} : { velocity: [numeric(evaluate(state.velocity[0], context), 'Helper.StateDef.vel.x') * helper.facing, numeric(evaluate(state.velocity[1], context), 'Helper.StateDef.vel.y')] }), ...(state.control === null ? {} : { control: truthy(evaluate(state.control, context)) }) }); if (state.juggle !== null) this.entities.updateHelperCombat(helper.entityId, { juggleCost: integer(evaluate(state.juggle, context), 'Helper.StateDef.juggle') }); if (state.spritePriority !== null) this.entities.updateHelperCombat(helper.entityId, { spritePriority: integer(evaluate(state.spritePriority, context), 'Helper.StateDef.sprpriority') }); }

  #applyStateDefinition(state: MugenStateDefinition, context: EvaluationContext, controlOverride: boolean | undefined, animationOverride: number | undefined, ownerId: string): void {
    const match = context.match; const id = context.fighterId;
    if (state.stateType !== 'U' || state.moveType !== 'U' || state.physics !== 'U') commit(match, { kind: 'state-metadata', fighterId: id, ...(state.stateType === 'U' ? {} : { stateType: state.stateType }), ...(state.moveType === 'U' ? {} : { moveType: state.moveType }), ...(state.physics === 'U' ? {} : { physics: state.physics }) });
    if (state.animation !== null) commit(match, { kind: 'change-action', fighterId: id, actionNumber: integer(evaluate(state.animation, context), 'StateDef.anim'), element: 1, ownerId });
    if (state.velocity !== null) { const fighter = match.fighter(id); const x = numeric(evaluate(state.velocity[0], context), 'StateDef.velset.x'); const y = numeric(evaluate(state.velocity[1], context), 'StateDef.velset.y'); commit(match, { kind: 'kinematics', fighterId: id, velocity: [x * fighter.facing, y] }); }
    const stateControl = state.control === null ? undefined : truthy(evaluate(state.control, context));
    if (state.powerAdd !== null) { const fighter = match.fighter(id); commit(match, { kind: 'power', fighterId: id, value: Math.max(0, Math.min(fighter.maxPower, fighter.power + integer(evaluate(state.powerAdd, context), 'StateDef.poweradd'))) }); }
    if (state.juggle !== null) commit(match, { kind: 'juggle-cost', fighterId: id, value: integer(evaluate(state.juggle, context), 'StateDef.juggle') });
    if (state.faceOpponent !== null && truthy(evaluate(state.faceOpponent, context))) { const opponentId = context.opponentByFighter?.get(id); if (opponentId !== undefined) { const fighter = match.fighter(id); const opponent = match.fighter(opponentId); const facing = opponent.position[0] < fighter.position[0] ? -1 : 1; commit(match, { kind: 'kinematics', fighterId: id, facing }); } }
    const preserveHitDefinition = state.hitDefPersist !== null && truthy(evaluate(state.hitDefPersist, context));
    const preserveMoveContact = state.moveHitPersist !== null && truthy(evaluate(state.moveHitPersist, context));
    const preserveHitCount = state.hitCountPersist !== null && truthy(evaluate(state.hitCountPersist, context));
    commit(match, { kind: 'state-entry-resets', fighterId: id, preserveHitDefinition, preserveMoveContact, preserveHitCount });
    if (state.spritePriority !== null) commit(match, { kind: 'sprite-priority', fighterId: id, value: integer(evaluate(state.spritePriority, context), 'StateDef.sprpriority') });
    const control = controlOverride ?? stateControl; if (control !== undefined) commit(match, { kind: 'control', fighterId: id, value: control });
    if (animationOverride !== undefined) commit(match, { kind: 'change-action', fighterId: id, actionNumber: animationOverride, element: 1, ownerId });
  }
}

function evaluate(expression: MugenExpression, context: EvaluationContext): unknown {
  const value = evaluateValue(expression, context);
  return value.kind === 'bottom' ? 0 : value.value;
}

const variableGateCache = new WeakMap<object, boolean>();

/**
 * Petra's EmanonAI places the same `var(53) / var(54)` gate in front of
 * hundreds of controllers. Running those tiny, pure gates through the full
 * redirected-expression host dominated a frame. This restricted interpreter
 * covers only immutable, variable-only boolean bytecode; everything else
 * falls through to the authoritative VM.
 */
function tryEvaluateVariableGate(expression: MugenExpression, fighter: MugenFighterSnapshot | MugenHelperEntitySnapshot, context: EvaluationContext): MugenExpressionValue | null {
  if (isRedirectedExpressionProgram(expression)) return null;
  let eligible = variableGateCache.get(expression);
  if (eligible === undefined) {
    eligible = expression.instructions.every(instruction => instruction.op === 'push-int' || instruction.op === 'push-float' || instruction.op === 'push-string' || instruction.op === 'load-reference' || instruction.op === 'load-variable' || instruction.op === 'binary' || instruction.op === 'unary' || instruction.op === 'interval' || instruction.op === 'branch-and' || instruction.op === 'branch-or' || instruction.op === 'truthy' || instruction.op === 'return');
    if (Object.isFrozen(expression)) variableGateCache.set(expression, eligible);
  }
  if (!eligible) return null;
  const stack: Array<Readonly<{ kind: 'int' | 'float'; value: number } | { kind: 'string'; value: string }>> = []; let pc = 0;
  while (pc < expression.instructions.length) {
    const instruction = expression.instructions[pc]!;
    if (instruction.op === 'push-int' || instruction.op === 'push-float') { stack.push({ kind: instruction.op === 'push-int' ? 'int' : 'float', value: instruction.value }); pc += 1; continue; }
    if (instruction.op === 'push-string') { stack.push({ kind: 'string', value: instruction.value }); pc += 1; continue; }
    if (instruction.op === 'load-reference') { const value = simpleReference(instruction.name, fighter, context); if (value === null) return null; stack.push(value); pc += 1; continue; }
    if (instruction.op === 'load-variable') {
      const index = stack.pop(); if (index?.kind !== 'int') return null;
      const variables = instruction.variableType === 'integer' ? fighter.integerVariables : fighter.floatVariables;
      if (index.value < 0 || index.value >= variables.length) return null;
      stack.push({ kind: instruction.variableType === 'integer' ? 'int' : 'float', value: variables[index.value]! }); pc += 1; continue;
    }
    if (instruction.op === 'binary') {
      const right = stack.pop(); const left = stack.pop(); if (left === undefined || right === undefined) return null;
      const comparable = typeof left.value === typeof right.value; const numericPair = typeof left.value === 'number' && typeof right.value === 'number'; const value = instruction.operator === '=' ? comparable && left.value === right.value : instruction.operator === '!=' ? !comparable || left.value !== right.value : !numericPair ? null : instruction.operator === '>' ? left.value > right.value : instruction.operator === '>=' ? left.value >= right.value : instruction.operator === '<' ? left.value < right.value : instruction.operator === '<=' ? left.value <= right.value : null;
      if (value === null) return null; stack.push({ kind: 'int', value: value ? 1 : 0 }); pc += 1; continue;
    }
    if (instruction.op === 'unary') {
      const operand = stack.pop(); if (operand === undefined || operand.kind === 'string') return null;
      if (instruction.operator === '!') stack.push({ kind: 'int', value: operand.value === 0 ? 1 : 0 });
      else if (instruction.operator === '~') { if (operand.kind !== 'int') return null; stack.push({ kind: 'int', value: ~operand.value }); }
      else stack.push({ kind: operand.kind, value: instruction.operator === '-' ? -operand.value : operand.value });
      pc += 1; continue;
    }
    if (instruction.op === 'interval') {
      const upper = stack.pop(); const lower = stack.pop(); const value = stack.pop(); if (upper === undefined || lower === undefined || value === undefined || upper.kind === 'string' || lower.kind === 'string' || value.kind === 'string') return null;
      const inside = (instruction.includeLower ? value.value >= lower.value : value.value > lower.value) && (instruction.includeUpper ? value.value <= upper.value : value.value < upper.value); stack.push({ kind: 'int', value: (instruction.operator === '=' ? inside : !inside) ? 1 : 0 }); pc += 1; continue;
    }
    if (instruction.op === 'branch-and' || instruction.op === 'branch-or') {
      const value = stack[stack.length - 1]; if (value === undefined || value.kind === 'string') return null; const truth = value.value !== 0;
      if ((instruction.op === 'branch-and' && !truth) || (instruction.op === 'branch-or' && truth)) { stack[stack.length - 1] = { kind: 'int', value: truth ? 1 : 0 }; pc = instruction.target; } else { stack.pop(); pc += 1; }
      continue;
    }
    if (instruction.op === 'truthy') { const value = stack.pop(); if (value === undefined || value.kind === 'string') return null; stack.push({ kind: 'int', value: value.value === 0 ? 0 : 1 }); pc += 1; continue; }
    if (instruction.op === 'return') { const value = stack.pop(); return value === undefined || stack.length !== 0 ? null : value.kind === 'int' ? mugenInt(Number(value.value)) : value.kind === 'float' ? mugenFloat(Number(value.value)) : mugenString(String(value.value)); }
    return null;
  }
  return null;
}

function simpleReference(name: string, entity: MugenFighterSnapshot | MugenHelperEntitySnapshot, context: EvaluationContext): Readonly<{ kind: 'int' | 'float'; value: number } | { kind: 'string'; value: string }> | null {
  const helper = 'kind' in entity && entity.kind === 'helper';
  switch (name) {
    case 'ailevel': return { kind: 'int', value: context.aiLevelByRoot.get(helper ? (entity as MugenHelperEntitySnapshot).rootId : (entity as MugenFighterSnapshot).id) ?? 0 };
    case 'alive': return { kind: 'int', value: entity.life > 0 ? 1 : 0 };
    case 'anim': return { kind: 'int', value: entity.actionNumber };
    case 'ctrl': return { kind: 'int', value: entity.control ? 1 : 0 };
    case 'facing': return { kind: 'int', value: entity.facing };
    case 'ishelper': return { kind: 'int', value: helper ? 1 : 0 };
    case 'movetype': return { kind: 'string', value: entity.moveType };
    case 'pos.x': return { kind: 'float', value: entity.position[0] };
    case 'pos.y': return { kind: 'float', value: entity.position[1] };
    case 'prevstateno': return { kind: 'int', value: entity.previousStateNumber };
    case 'roundstate': return { kind: 'int', value: context.match.phase === 'fight' ? 2 : context.match.phase === 'ready' ? 1 : 3 };
    case 'stateno': return { kind: 'int', value: entity.stateNumber };
    case 'statetype': return { kind: 'string', value: entity.stateType };
    case 'time': case 'statetime': return { kind: 'int', value: entity.stateTime };
    case 'vel.x': return { kind: 'float', value: entity.velocity[0] * entity.facing };
    case 'vel.y': return { kind: 'float', value: entity.velocity[1] };
    default: return null;
  }
}

function evaluateValue(expression: MugenExpression, context: EvaluationContext): MugenExpressionValue {
  const writesVariables = mugenRuntimeExpressionWritesVariables(expression);
  const evaluationFighters = new Map<string, MugenFighterSnapshot>();
  const entries = new Map<string, { before: MugenFighterSnapshot | MugenHelperEntitySnapshot; helper: boolean; integer: Int32Array | readonly number[]; float: Float32Array | readonly number[]; context: MugenExpressionVmContext }>();
  const contextFor = (fighterId: string): MugenExpressionVmContext | null => {
    const existing = entries.get(fighterId); if (existing) return existing.context;
    let before: MugenFighterSnapshot | MugenHelperEntitySnapshot; let helper = false; const cachedFighter = context.evaluationFighters?.get(fighterId); const cachedHelper = context.evaluationHelpers?.get(fighterId); if (cachedFighter !== undefined) before = cachedFighter; else if (cachedHelper !== undefined) { before = cachedHelper; helper = true; } else try { before = context.match.fighter(fighterId); } catch { const entity = context.entities.entity(fighterId); if (entity?.kind !== 'helper') return null; before = entity; helper = true; }
    if (!helper) evaluationFighters.set(fighterId, before as MugenFighterSnapshot);
    const integer = writesVariables ? Int32Array.from(before.integerVariables) : before.integerVariables; const float = writesVariables ? Float32Array.from(before.floatVariables) : before.floatVariables; const entityContext: EvaluationContext = { ...context, fighterId, commands: fighterId === context.fighterId ? context.commands : EMPTY_COMMANDS, evaluationFighters };
    const vmContext: MugenExpressionVmContext = { variables: Object.freeze({ integer, float }), random: Object.freeze({ nextMugenRandom: () => context.match.nextRandomUint32() % 1000 }), resolve: name => referenceValue(name, entityContext), call: (name, arguments_) => callValue(name, arguments_, entityContext) };
    entries.set(fighterId, { before, helper, integer, float, context: vmContext }); return vmContext;
  };
  const playerId = (argument: number | null): string | null => { if (argument === null) return null; return context.entities.playerById(argument)?.entityId ?? null; };
  const host: MugenTriggerEvaluationHost = {
    contextFor,
    redirect(origin, selector, argument) {
      if (selector === 'root') return context.entities.entity(origin)?.rootId ?? origin;
      if (selector === 'parent') { const entity = context.entities.entity(origin); return entity?.kind === 'helper' ? entity.parentId : null; }
      if (selector === 'helper') { const entity = context.entities.entity(origin); const helpers = context.entities.helpers(entity?.rootId ?? origin, argument ?? undefined); return helpers[0]?.entityId ?? null; }
      if (selector === 'enemy' || selector === 'enemynear') { const rootId = context.entities.entity(origin)?.rootId ?? origin; return argument === null || argument === 0 ? context.opponentByFighter?.get(rootId) ?? null : null; }
      if (selector === 'target') { const targets = context.entities.targets(origin, argument === null ? undefined : argument); return targets[0]?.entityId ?? null; }
      if (selector === 'playerid') return playerId(argument);
      return null;
    },
  };
  const value = evaluateMugenRuntimeExpression(expression, context.fighterId, host).value;
  if (writesVariables) for (const [fighterId, entry] of entries) {
    for (let index = 0; index < entry.integer.length; index++) if (entry.integer[index] !== entry.before.integerVariables[index]) { if (entry.helper) context.entities.setHelperVariable(fighterId, 'integer', index, entry.integer[index]!); else commit(context.match, { kind: 'integer-variable', fighterId, operation: 'set', index, value: entry.integer[index]! }); }
    for (let index = 0; index < entry.float.length; index++) if (entry.float[index] !== entry.before.floatVariables[index]) { if (entry.helper) context.entities.setHelperVariable(fighterId, 'float', index, entry.float[index]!); else commit(context.match, { kind: 'float-variable', fighterId, operation: 'set', index, value: entry.float[index]! }); }
  }
  return value;
}

function referenceValue(name: string, context: EvaluationContext): MugenExpressionValue {
  const helper = context.evaluationHelpers?.get(context.fighterId) ?? context.entities.entity(context.fighterId); if (helper?.kind === 'helper') return helperReferenceValue(name, helper, context);
  const fighter = context.evaluationFighters?.get(context.fighterId) ?? context.match.fighter(context.fighterId);
  const entity = context.entities.entity(context.fighterId);
  const animation = context.animationByFighter?.get(fighter.id);
  const opponentId = context.opponentByFighter?.get(fighter.id) ?? context.matchSnapshot.fighters.find(value => value.id !== fighter.id)?.id;
  const opponent = opponentId === undefined ? null : context.evaluationFighters?.get(opponentId) ?? context.match.fighter(opponentId);
  const identity = context.identityByRoot.get(fighter.id); const opponentIdentity = opponent === null ? undefined : context.identityByRoot.get(opponent.id); const geometry = screenGeometry(context, fighter.id); const edges = edgeDistances(fighter.position[0], fighter.facing, fighter.widthOverride.edge, [geometry.left, geometry.right]); const snapshot = context.matchSnapshot;
  if (name === 'canrecover') return mugenInt(fighter.hitFall && fighter.hitFallRecover && fighter.hitElapsedTicks >= fighter.hitFallRecoverTime ? 1 : 0);
  if (name === 'hitfall') return mugenInt(fighter.hitFall ? 1 : 0);
  if (name === 'hitover') return mugenInt(fighter.moveType === 'H' && fighter.stunTicks === 0 ? 1 : 0);
  if (name === 'uniqhitcount') return mugenInt(fighter.hitCount);
  if (name === 'name') return mugenString(identity?.name ?? fighter.displayName);
  if (name === 'authorname') return mugenString(identity?.authorName ?? '');
  if (name === 'teamside') return mugenInt((entity?.kind === 'root' ? entity.team : fighter.slot) + 1);
  if (name === 'teammode') return mugenString('SINGLE');
  if (name === 'gametime') return mugenInt(context.match.tick);
  if (name === 'roundsexisted') return mugenInt(Math.max(0, context.matchSnapshot.roundNumber - 1));
  if (name === 'matchover') return mugenInt(context.match.phase === 'match-over' ? 1 : 0);
  if (name === 'win') return mugenInt(snapshot.roundWinnerId === fighter.id ? 1 : 0);
  if (name === 'winko') return mugenInt(snapshot.roundWinnerId === fighter.id && snapshot.roundResultReason === 'ko' ? 1 : 0);
  if (name === 'wintime') return mugenInt(snapshot.roundWinnerId === fighter.id && snapshot.roundResultReason === 'time-over' ? 1 : 0);
  if (name === 'winperfect') return mugenInt(snapshot.roundWinnerId === fighter.id && fighter.life === fighter.maxLife ? 1 : 0);
  if (name === 'drawgame') return mugenInt(snapshot.roundResultReason === 'draw' ? 1 : 0);
  if (name === 'lose') return mugenInt(lostRound(snapshot.roundWinnerId, snapshot.roundResultReason, fighter.id) ? 1 : 0);
  if (name === 'loseko') return mugenInt(lostRound(snapshot.roundWinnerId, snapshot.roundResultReason, fighter.id) && snapshot.roundResultReason === 'ko' ? 1 : 0);
  if (name === 'losetime') return mugenInt(lostRound(snapshot.roundWinnerId, snapshot.roundResultReason, fighter.id) && snapshot.roundResultReason === 'time-over' ? 1 : 0);
  if (name === 'numenemy') return mugenInt(snapshot.fighters.filter(value => value.slot !== fighter.slot).length);
  if (name === 'numpartner') return mugenInt(0);
  if (name === 'p1name') return mugenString(identity?.name ?? fighter.displayName);
  if (name === 'p3name') return mugenString('');
  if (name === 'p2name') return mugenString(opponent === null ? '' : opponentIdentity?.name ?? opponent.displayName);
  if (name === 'p4name') return mugenString('');
  if (name === 'p2movetype') return opponent === null ? mugenString('I') : mugenString(opponent.moveType);
  if (name === 'p2life') return opponent === null ? mugenBottom('MUGEN P2Life opponent does not exist') : mugenInt(opponent.life);
  if (name === 'p2stateno') return mugenInt(opponent?.stateNumber ?? 0);
  if (name === 'p2statetype') return opponent === null ? mugenString('S') : mugenString(opponent.stateType);
  if (name === 'backedgedist') return mugenFloat(edges.back);
  if (name === 'frontedgedist') return mugenFloat(edges.front);
  if (name === 'backedgebodydist') return mugenFloat(edges.backBody);
  if (name === 'frontedgebodydist') return mugenFloat(edges.frontBody);
  if (name === 'palno') return mugenInt(context.paletteNumberByRoot.get(fighter.id) ?? 1);
  if (name === 'camerapos.x') return mugenFloat(context.cameraPosition?.[0] ?? 0);
  if (name === 'camerapos.y') return mugenFloat(context.cameraPosition?.[1] ?? 0);
  if (name === 'camerazoom') return mugenFloat(geometry.zoom);
  if (name === 'screenwidth') return mugenFloat(geometry.screenWidth);
  if (name === 'screenheight') return mugenFloat(geometry.screenHeight);
  if (name === 'gamewidth') return mugenFloat(geometry.gameWidth);
  if (name === 'gameheight') return mugenFloat(geometry.gameHeight);
  if (name === 'leftedge') return mugenFloat(geometry.left);
  if (name === 'rightedge') return mugenFloat(geometry.right);
  if (name === 'topedge') return mugenFloat(geometry.top);
  if (name === 'bottomedge') return mugenFloat(geometry.bottom);
  if (name === 'backedge') return mugenFloat(fighter.facing === 1 ? geometry.left : geometry.right);
  if (name === 'frontedge') return mugenFloat(fighter.facing === 1 ? geometry.right : geometry.left);
  if (name === 'ishometeam') return mugenInt((fighter.slot + 1) === (context.homeTeamSide ?? 1) ? 1 : 0);
  if (name === 'matchno') return mugenInt(matchNumber(context.matchNumber));
  if (name === 'tickspersecond') return mugenInt(snapshot.tickRateHz);
  switch (name) {
    case 'ailevel': return mugenInt(context.aiLevelByRoot.get(fighter.id) ?? 0);
    case 'id': return mugenInt(entity?.kind === 'root' || entity?.kind === 'helper' ? entity.playerId : 0); case 'ishelper': return mugenInt(0); case 'numexplod': return mugenInt(context.entities.explods(entity?.rootId ?? fighter.id).length); case 'numhelper': return mugenInt(context.entities.helpers(entity?.rootId ?? fighter.id).length); case 'numproj': return mugenInt(context.entities.projectiles(entity?.rootId ?? fighter.id).length); case 'parentdist.x': case 'parentdist.y': case 'rootdist.x': case 'rootdist.y': return mugenFloat(0); case 'screenpos.x': return mugenFloat(fighter.position[0] - geometry.left); case 'screenpos.y': return mugenFloat(fighter.position[1] - geometry.top); case 'projcontact': return mugenInt(projectileContact(context, undefined, ['hit', 'guarded']) ? 1 : 0); case 'projguarded': return mugenInt(projectileContact(context, undefined, ['guarded']) ? 1 : 0); case 'projhit': return mugenInt(projectileContact(context, undefined, ['hit']) ? 1 : 0);
    case 'alive': return mugenInt(fighter.ko ? 0 : 1); case 'anim': return mugenInt(fighter.actionNumber); case 'animtime': return mugenInt(animationTime(animation)); case 'ctrl': return mugenInt(fighter.control ? 1 : 0); case 'e': return mugenFloat(Math.E); case 'facing': return mugenInt(fighter.facing); case 'hitcount': return mugenInt(fighter.hitCount); case 'hitpausetime': return mugenInt(fighter.hitPauseTicks); case 'hitshakeover': return mugenInt(fighter.hitPauseTicks === 0 ? 1 : 0); case 'hitvel.x': return mugenFloat(fighter.getHitVelocity[0]); case 'hitvel.y': return mugenFloat(fighter.getHitVelocity[1]); case 'inguarddist': return mugenInt(context.inGuardDistance?.has(fighter.id) ? 1 : 0); case 'life': return mugenInt(fighter.life); case 'lifemax': return mugenInt(fighter.maxLife); case 'movecontact': return mugenInt(fighter.moveContact === 'none' ? 0 : fighter.moveContactTime + 1); case 'moveguarded': return mugenInt(fighter.moveContact === 'guarded' ? fighter.moveContactTime + 1 : 0); case 'movehit': return mugenInt(fighter.moveContact === 'hit' ? fighter.moveContactTime + 1 : 0); case 'movereversed': return mugenInt(fighter.moveContact === 'reversed' ? fighter.moveContactTime + 1 : 0); case 'movetype': return mugenString(fighter.moveType); case 'p2bodydist.x': case 'p2dist.x': return mugenFloat(opponent === null ? 0 : (opponent.position[0] - fighter.position[0]) * fighter.facing); case 'p2bodydist.y': case 'p2dist.y': return mugenFloat(opponent === null ? 0 : opponent.position[1] - fighter.position[1]); case 'pi': return mugenFloat(Math.PI); case 'pos.x': return mugenFloat(fighter.position[0]); case 'pos.y': return mugenFloat(fighter.position[1]); case 'power': return mugenInt(fighter.power); case 'powermax': return mugenInt(fighter.maxPower); case 'prevstateno': return mugenInt(fighter.previousStateNumber); case 'random': return mugenInt(context.match.nextRandomUint32() % 1000); case 'roundno': return mugenInt(context.matchSnapshot.roundNumber); case 'roundstate': return mugenInt(context.match.phase === 'fight' ? 2 : context.match.phase === 'ready' ? 1 : 3); case 'stateno': return mugenInt(fighter.stateNumber); case 'statetype': return mugenString(fighter.stateType); case 'time': case 'statetime': return mugenInt(fighter.stateTime); case 'vel.x': return mugenFloat(fighter.velocity[0] * fighter.facing); case 'vel.y': return mugenFloat(fighter.velocity[1]); default: return mugenBottom(`unsupported MUGEN reference ${name}`);
  }
}

function callValue(name: string, arguments_: readonly MugenExpressionValue[], context: EvaluationContext): MugenExpressionValue {
  if (name === 'command' && arguments_.length === 1 && arguments_[0]?.kind === 'string') return mugenInt(context.commands.has(arguments_[0].value.toLowerCase()) ? 1 : 0);
  const playerEntity = context.evaluationHelpers?.get(context.fighterId) ?? context.entities.entity(context.fighterId); const rootId = playerEntity?.rootId ?? context.fighterId;
  if (name === 'const' && arguments_.length === 1 && arguments_[0]?.kind === 'string') { const key = arguments_[0].value.toLowerCase(); const value = playerEntity?.kind === 'helper' ? playerEntity.constantOverrides[key] ?? context.constantsByRoot.get(rootId)?.[key] : context.constantsByRoot.get(rootId)?.[key]; return value === undefined ? mugenBottom(`unknown MUGEN character constant ${arguments_[0].value}`) : mugenFloat(value); }
  if ((name === 'const240p' || name === 'const480p' || name === 'const720p') && arguments_.length === 1 && (arguments_[0]?.kind === 'int' || arguments_[0]?.kind === 'float')) { const baseline = name === 'const240p' ? 240 : name === 'const480p' ? 480 : 720; const height = context.localCoordByRoot.get(rootId)?.[1] ?? 240; return mugenFloat(arguments_[0].value * height / baseline); }
  if (name === 'stagevar' && arguments_.length === 1 && arguments_[0]?.kind === 'string') return stageVariable(context, arguments_[0].value);
  if (name === 'sysfvar' && arguments_.length === 1 && arguments_[0]?.kind === 'int') return systemFloatVariable(context, rootId, arguments_[0].value);
  if (playerEntity?.kind === 'helper') return helperCallValue(name, arguments_, playerEntity, context);
  if (name === 'animelem' && arguments_.length === 1 && arguments_[0]?.kind === 'int') { const animation = context.animationByFighter?.get(context.fighterId); return mugenInt(animation !== undefined && animation.snapshot.frameIndex + 1 === arguments_[0].value && animation.snapshot.frameTick === 0 ? 1 : 0); }
  if (name === 'animelemtime' && arguments_.length === 1 && arguments_[0]?.kind === 'int') { const value = animationElementTime(context, arguments_[0].value); return value === null ? mugenBottom('MUGEN AnimElemTime element does not exist') : mugenInt(value); }
  if (name === 'animelemno' && arguments_.length === 1 && arguments_[0]?.kind === 'int') { const value = animationElementNumber(context.animationByFighter?.get(context.fighterId), arguments_[0].value); return value === null ? mugenBottom('MUGEN AnimElemNo time precedes the action') : mugenInt(value); }
  const fighter = context.evaluationFighters?.get(context.fighterId) ?? context.match.fighter(context.fighterId);
  const integerArgument = arguments_.length === 1 && arguments_[0]?.kind === 'int' ? arguments_[0].value : null;
  if (name === 'ishelper' && integerArgument !== null) return mugenInt(0);
  if (name === 'sysvar' && integerArgument !== null) return systemVariable(context, fighter.id, integerArgument);
  if (name === 'numexplod' && (arguments_.length === 0 || integerArgument !== null)) return mugenInt(context.entities.explods(fighter.id, integerArgument ?? undefined).length);
  if (name === 'numhelper' && (arguments_.length === 0 || integerArgument !== null)) return mugenInt(context.entities.helpers(fighter.id, integerArgument ?? undefined).length);
  if (name === 'numprojid' && integerArgument !== null) return mugenInt(context.entities.projectiles(fighter.id, Math.max(0, integerArgument)).length);
  if (name === 'playeridexist' && integerArgument !== null) return mugenInt(context.entities.playerById(integerArgument) === null ? 0 : 1);
  if ((name === 'projcontact' || name === 'projguarded' || name === 'projhit') && (arguments_.length === 0 || integerArgument !== null)) { const contacts = name === 'projcontact' ? ['hit', 'guarded'] : name === 'projguarded' ? ['guarded'] : ['hit']; return mugenInt(projectileContact(context, integerArgument ?? undefined, contacts) ? 1 : 0); }
  if ((name === 'projcanceltime' || name === 'projcontacttime' || name === 'projguardedtime' || name === 'projhittime') && integerArgument !== null) { const contacts = name === 'projcanceltime' ? ['cancelled'] : name === 'projcontacttime' ? ['hit', 'guarded'] : name === 'projguardedtime' ? ['guarded'] : ['hit']; return mugenInt(projectileContactTime(context, integerArgument, contacts)); }
  if (name === 'selfanimexist' && integerArgument !== null) return mugenInt(context.animationExistsByFighter?.get(fighter.id)?.has(integerArgument) ? 1 : 0);
  if (name === 'animexist' && integerArgument !== null) return mugenInt(context.animationExistsByFighter?.get(fighter.animationOwnerId)?.has(integerArgument) ? 1 : 0);
  if (name === 'numtarget' && arguments_.length === 0) return mugenInt(fighter.targets.length);
  if (name === 'numtarget' && arguments_.length === 1 && arguments_[0]?.kind === 'int') { const targetId = arguments_[0].value; return mugenInt(fighter.targets.filter(value => value.targetId === targetId).length); }
  if (name === 'hitdefattr' && arguments_.length === 2 && arguments_[0]?.kind === 'string' && arguments_[1]?.kind === 'string') { const definition = fighter.activeHitDefinition; if (definition === null) return mugenInt(0); const states = arguments_[0].value.toUpperCase(); const attacks = arguments_[1].value.toUpperCase().split(','); return mugenInt(states.includes(definition.attributeState) && attacks.some(value => attackAttributeMatches(value, definition.attackAttribute)) ? 1 : 0); }
  if (name === 'gethitvar' && arguments_.length === 1 && arguments_[0]?.kind === 'string') return getHitVariable(fighter, arguments_[0].value);
  return mugenBottom(`unsupported MUGEN function ${name}`);
}

function projectileContact(context: EvaluationContext, projectileId: number | undefined, contacts: readonly string[]): boolean { return context.entities.projectiles(context.entities.entity(context.fighterId)?.rootId ?? context.fighterId, projectileId).some(projectile => projectile.contactTime === 0 && contacts.includes(projectile.contact)); }
function projectileContactTime(context: EvaluationContext, projectileId: number, contacts: readonly string[]): number { const rootId = context.entities.entity(context.fighterId)?.rootId ?? context.fighterId; const contact = context.entities.latestProjectileContact(rootId); return contact !== null && (projectileId === 0 || contact.projectileId === projectileId) && contacts.includes(contact.contact) ? contact.contactTime : -1; }
function helperReferenceValue(name: string, helper: MugenHelperEntitySnapshot, context: EvaluationContext): MugenExpressionValue {
  const parent = context.entities.entity(helper.parentId); const root = context.entities.entity(helper.rootId); const rootFighter = context.match.fighter(helper.rootId); const snapshot = context.matchSnapshot; const opponentId = context.opponentByFighter?.get(helper.rootId) ?? snapshot.fighters.find(value => value.id !== helper.rootId)?.id; const opponent = opponentId === undefined ? null : context.match.fighter(opponentId); const identity = context.identityByRoot.get(helper.rootId); const opponentIdentity = opponent === null ? undefined : context.identityByRoot.get(opponent.id); const geometry = screenGeometry(context, helper.rootId); const edges = edgeDistances(helper.position[0], helper.facing, [0, 0], [geometry.left, geometry.right]); const animation = context.animationByFighter?.get(helper.entityId);
  if (name === 'canrecover') return mugenInt(helper.hitFall && helper.hitFallRecover && helper.hitElapsedTicks >= helper.hitFallRecoverTime ? 1 : 0);
  if (name === 'hitfall') return mugenInt(helper.hitFall ? 1 : 0);
  if (name === 'hitover') return mugenInt(helper.moveType === 'H' && helper.stunTicks === 0 ? 1 : 0);
  if (name === 'uniqhitcount') return mugenInt(helper.hitCount);
  if (name === 'name') return mugenString(helper.name || identity?.name || rootFighter.displayName);
  if (name === 'authorname') return mugenString(identity?.authorName ?? '');
  if (name === 'teamside') return mugenInt(helper.team + 1);
  if (name === 'teammode') return mugenString('SINGLE');
  if (name === 'gametime') return mugenInt(context.match.tick);
  if (name === 'roundsexisted') return mugenInt(0);
  if (name === 'matchover') return mugenInt(context.match.phase === 'match-over' ? 1 : 0);
  if (name === 'win') return mugenInt(context.matchSnapshot.roundWinnerId === helper.rootId ? 1 : 0);
  if (name === 'winko') return mugenInt(context.matchSnapshot.roundWinnerId === helper.rootId && context.matchSnapshot.roundResultReason === 'ko' ? 1 : 0);
  if (name === 'wintime') return mugenInt(context.matchSnapshot.roundWinnerId === helper.rootId && context.matchSnapshot.roundResultReason === 'time-over' ? 1 : 0);
  if (name === 'winperfect') return mugenInt(context.matchSnapshot.roundWinnerId === helper.rootId && rootFighter.life === rootFighter.maxLife ? 1 : 0);
  if (name === 'drawgame') return mugenInt(snapshot.roundResultReason === 'draw' ? 1 : 0);
  if (name === 'lose') return mugenInt(lostRound(snapshot.roundWinnerId, snapshot.roundResultReason, helper.rootId) ? 1 : 0);
  if (name === 'loseko') return mugenInt(lostRound(snapshot.roundWinnerId, snapshot.roundResultReason, helper.rootId) && snapshot.roundResultReason === 'ko' ? 1 : 0);
  if (name === 'losetime') return mugenInt(lostRound(snapshot.roundWinnerId, snapshot.roundResultReason, helper.rootId) && snapshot.roundResultReason === 'time-over' ? 1 : 0);
  if (name === 'numenemy') return mugenInt(snapshot.fighters.filter(value => value.slot !== rootFighter.slot).length);
  if (name === 'numpartner') return mugenInt(0);
  if (name === 'p1name') return mugenString(identity?.name ?? rootFighter.displayName);
  if (name === 'p3name') return mugenString('');
  if (name === 'p2name') return mugenString(opponent === null ? '' : opponentIdentity?.name ?? opponent.displayName);
  if (name === 'p4name') return mugenString('');
  if (name === 'p2movetype') return opponent === null ? mugenString('I') : mugenString(opponent.moveType);
  if (name === 'p2life') return opponent === null ? mugenBottom('MUGEN P2Life opponent does not exist') : mugenInt(opponent.life);
  if (name === 'p2stateno') return mugenInt(opponent?.stateNumber ?? 0);
  if (name === 'p2statetype') return opponent === null ? mugenString('S') : mugenString(opponent.stateType);
  if (name === 'backedgedist') return mugenFloat(edges.back);
  if (name === 'frontedgedist') return mugenFloat(edges.front);
  if (name === 'backedgebodydist') return mugenFloat(edges.backBody);
  if (name === 'frontedgebodydist') return mugenFloat(edges.frontBody);
  if (name === 'palno') return mugenInt(context.paletteNumberByRoot.get(helper.rootId) ?? 1);
  if (name === 'camerapos.x') return mugenFloat(context.cameraPosition?.[0] ?? 0);
  if (name === 'camerapos.y') return mugenFloat(context.cameraPosition?.[1] ?? 0);
  if (name === 'camerazoom') return mugenFloat(geometry.zoom);
  if (name === 'screenwidth') return mugenFloat(geometry.screenWidth);
  if (name === 'screenheight') return mugenFloat(geometry.screenHeight);
  if (name === 'gamewidth') return mugenFloat(geometry.gameWidth);
  if (name === 'gameheight') return mugenFloat(geometry.gameHeight);
  if (name === 'leftedge') return mugenFloat(geometry.left);
  if (name === 'rightedge') return mugenFloat(geometry.right);
  if (name === 'topedge') return mugenFloat(geometry.top);
  if (name === 'bottomedge') return mugenFloat(geometry.bottom);
  if (name === 'backedge') return mugenFloat(helper.facing === 1 ? geometry.left : geometry.right);
  if (name === 'frontedge') return mugenFloat(helper.facing === 1 ? geometry.right : geometry.left);
  if (name === 'ishometeam') return mugenInt((helper.team + 1) === (context.homeTeamSide ?? 1) ? 1 : 0);
  if (name === 'matchno') return mugenInt(matchNumber(context.matchNumber));
  if (name === 'tickspersecond') return mugenInt(snapshot.tickRateHz);
  switch (name) {
    case 'ailevel': return mugenInt(context.aiLevelByRoot.get(helper.rootId) ?? 0);
    case 'id': return mugenInt(helper.playerId); case 'ishelper': return mugenInt(1); case 'alive': return mugenInt(helper.life > 0 ? 1 : 0); case 'anim': return mugenInt(helper.actionNumber); case 'animtime': return mugenInt(animationTime(animation)); case 'time': case 'statetime': return mugenInt(helper.stateTime); case 'stateno': return mugenInt(helper.stateNumber); case 'prevstateno': return mugenInt(helper.previousStateNumber); case 'statetype': return mugenString(helper.stateType); case 'movetype': return mugenString(helper.moveType); case 'pos.x': return mugenFloat(helper.position[0]); case 'screenpos.x': return mugenFloat(helper.position[0] - geometry.left); case 'pos.y': return mugenFloat(helper.position[1]); case 'screenpos.y': return mugenFloat(helper.position[1] - geometry.top); case 'vel.x': return mugenFloat(helper.velocity[0] * helper.facing); case 'vel.y': return mugenFloat(helper.velocity[1]); case 'facing': return mugenInt(helper.facing); case 'ctrl': return mugenInt(helper.control ? 1 : 0);
    case 'life': return mugenInt(helper.life); case 'lifemax': return mugenInt(helper.maxLife); case 'power': return mugenInt(rootFighter.power); case 'powermax': return mugenInt(rootFighter.maxPower); case 'hitcount': return mugenInt(helper.hitCount); case 'hitpausetime': return mugenInt(helper.hitPauseTicks); case 'hitshakeover': return mugenInt(helper.hitPauseTicks === 0 ? 1 : 0); case 'hitvel.x': return mugenFloat(helper.getHitVelocity[0]); case 'hitvel.y': return mugenFloat(helper.getHitVelocity[1]); case 'movecontact': return mugenInt(helper.moveContact === 'none' ? 0 : helper.moveContactTime + 1); case 'moveguarded': return mugenInt(helper.moveContact === 'guarded' ? helper.moveContactTime + 1 : 0); case 'movehit': return mugenInt(helper.moveContact === 'hit' ? helper.moveContactTime + 1 : 0); case 'movereversed': return mugenInt(helper.moveContact === 'reversed' ? helper.moveContactTime + 1 : 0);
    case 'numhelper': return mugenInt(context.entities.helpers(helper.rootId).length); case 'numproj': return mugenInt(context.entities.projectiles(helper.rootId).length); case 'numexplod': return mugenInt(context.entities.explods(helper.rootId).length); case 'parentdist.x': return mugenFloat(parent && 'position' in parent ? (parent.position[0] - helper.position[0]) * helper.facing : 0); case 'parentdist.y': return mugenFloat(parent && 'position' in parent ? parent.position[1] - helper.position[1] : 0); case 'rootdist.x': return mugenFloat(root && 'position' in root ? (root.position[0] - helper.position[0]) * helper.facing : 0); case 'rootdist.y': return mugenFloat(root && 'position' in root ? root.position[1] - helper.position[1] : 0); case 'p2bodydist.x': case 'p2dist.x': return mugenFloat(opponent === null ? 0 : (opponent.position[0] - helper.position[0]) * helper.facing); case 'p2bodydist.y': case 'p2dist.y': return mugenFloat(opponent === null ? 0 : opponent.position[1] - helper.position[1]);
    case 'projcontact': return mugenInt(projectileContact(context, undefined, ['hit', 'guarded']) ? 1 : 0); case 'projguarded': return mugenInt(projectileContact(context, undefined, ['guarded']) ? 1 : 0); case 'projhit': return mugenInt(projectileContact(context, undefined, ['hit']) ? 1 : 0); case 'random': return mugenInt(context.match.nextRandomUint32() % 1000); case 'roundno': return mugenInt(context.matchSnapshot.roundNumber); case 'roundstate': return mugenInt(context.match.phase === 'fight' ? 2 : context.match.phase === 'ready' ? 1 : 3); default: return mugenBottom(`unsupported MUGEN Helper reference ${name}`);
  }
}
function helperCallValue(name: string, arguments_: readonly MugenExpressionValue[], helper: MugenHelperEntitySnapshot, context: EvaluationContext): MugenExpressionValue {
  const argument = arguments_.length === 1 && arguments_[0]?.kind === 'int' ? arguments_[0].value : null;
  if (name === 'animelem' && argument !== null) { const animation = context.animationByFighter?.get(helper.entityId); return mugenInt(animation !== undefined && animation.snapshot.frameIndex + 1 === argument && animation.snapshot.frameTick === 0 ? 1 : 0); }
  if (name === 'animelemtime' && argument !== null) { const value = animationElementTime(context, argument); return value === null ? mugenBottom('MUGEN Helper AnimElemTime element does not exist') : mugenInt(value); }
  if (name === 'animelemno' && argument !== null) { const value = animationElementNumber(context.animationByFighter?.get(helper.entityId), argument); return value === null ? mugenBottom('MUGEN Helper AnimElemNo time precedes the action') : mugenInt(value); }
  if (name === 'ishelper' && argument !== null) return mugenInt(helper.helperId === argument ? 1 : 0); if (name === 'sysvar' && argument !== null) return systemVariable(context, helper.rootId, argument); if (name === 'sysfvar' && argument !== null) return systemFloatVariable(context, helper.rootId, argument); if (name === 'stagevar' && arguments_.length === 1 && arguments_[0]?.kind === 'string') return stageVariable(context, arguments_[0].value);
  if (name === 'numhelper' && (arguments_.length === 0 || argument !== null)) return mugenInt(context.entities.helpers(helper.rootId, argument ?? undefined).length); if (name === 'numexplod' && (arguments_.length === 0 || argument !== null)) return mugenInt(context.entities.explods(helper.rootId, argument ?? undefined).length); if (name === 'numprojid' && argument !== null) return mugenInt(context.entities.projectiles(helper.rootId, argument).length); if (name === 'playeridexist' && argument !== null) return mugenInt(context.entities.playerById(argument) === null ? 0 : 1); if (name === 'numtarget' && (arguments_.length === 0 || argument !== null)) return mugenInt(context.entities.targets(helper.entityId, argument ?? undefined).length); if ((name === 'selfanimexist' || name === 'animexist') && argument !== null) return mugenInt(context.animationExistsByFighter?.get(helper.entityId)?.has(argument) ? 1 : 0);
  if ((name === 'projcontact' || name === 'projguarded' || name === 'projhit') && (arguments_.length === 0 || argument !== null)) { const contacts = name === 'projcontact' ? ['hit', 'guarded'] : name === 'projguarded' ? ['guarded'] : ['hit']; return mugenInt(projectileContact(context, argument ?? undefined, contacts) ? 1 : 0); } if ((name === 'projcanceltime' || name === 'projcontacttime' || name === 'projguardedtime' || name === 'projhittime') && argument !== null) { const contacts = name === 'projcanceltime' ? ['cancelled'] : name === 'projcontacttime' ? ['hit', 'guarded'] : name === 'projguardedtime' ? ['guarded'] : ['hit']; return mugenInt(projectileContactTime(context, argument, contacts)); } if (name === 'selfanimexist' && argument !== null) return mugenInt(context.animationExistsByFighter?.get(helper.rootId)?.has(argument) ? 1 : 0); if (name === 'hitdefattr' && arguments_.length === 2 && arguments_[0]?.kind === 'string' && arguments_[1]?.kind === 'string') { const definition = helper.activeHitDefinition; return mugenInt(definition !== null && arguments_[0].value.toUpperCase().includes(definition.attributeState) && arguments_[1].value.toUpperCase().split(',').some(value => attackAttributeMatches(value, definition.attackAttribute)) ? 1 : 0); } if (name === 'gethitvar' && arguments_.length === 1 && arguments_[0]?.kind === 'string') return getHelperHitVariable(helper, arguments_[0].value); return mugenBottom(`unsupported MUGEN Helper function ${name}`);
}

function systemVariable(context: EvaluationContext, rootId: string, index: number): MugenExpressionValue { const variables = context.systemVariablesByRoot.get(rootId); return variables !== undefined && index >= 0 && index < variables.length ? mugenInt(variables[index]!) : mugenBottom(`MUGEN SysVar index ${index} is out of range`); }
function systemFloatVariable(context: EvaluationContext, rootId: string, index: number): MugenExpressionValue { const variables = context.systemFloatVariablesByRoot.get(rootId); return variables !== undefined && index >= 0 && index < variables.length ? mugenFloat(variables[index]!) : mugenBottom(`MUGEN SysFVar index ${index} is out of range`); }
function stageVariable(context: EvaluationContext, name: string): MugenExpressionValue { const key = name.toLowerCase(); if (key === 'info.name') return mugenString(context.stageInfo?.name ?? ''); if (key === 'info.displayname') return mugenString(context.stageInfo?.displayName ?? ''); if (key === 'info.authorname' || key === 'info.author') return mugenString(context.stageInfo?.authorName ?? ''); return mugenBottom(`unsupported MUGEN StageVar parameter ${name}`); }
function lostRound(winnerId: string | null, reason: 'ko' | 'time-over' | 'draw' | null, rootId: string): boolean { return reason !== null && reason !== 'draw' && winnerId !== null && winnerId !== rootId; }
function matchNumber(value: number | undefined): number { const result = value ?? 1; if (!Number.isSafeInteger(result) || result < 1) throw new RangeError('MUGEN matchNumber must be a positive safe integer.'); return result; }
function screenGeometry(context: EvaluationContext, rootId: string): Readonly<{ zoom: number; screenWidth: number; screenHeight: number; gameWidth: number; gameHeight: number; left: number; right: number; top: number; bottom: number }> {
  const localCoord = context.localCoordByRoot.get(rootId) ?? [320, 240]; const zoom = context.cameraZoom ?? 1;
  if (!Number.isFinite(zoom) || zoom <= 0) throw new RangeError('MUGEN cameraZoom must be finite and positive.');
  const screenWidth = localCoord[0]; const screenHeight = localCoord[1];
  const gameWidth = context.screenBounds === undefined ? screenWidth / zoom : context.screenBounds[1] - context.screenBounds[0]; const gameHeight = screenHeight / zoom;
  if (!Number.isFinite(gameWidth) || gameWidth <= 0 || !Number.isFinite(gameHeight) || gameHeight <= 0) throw new RangeError('MUGEN screen geometry is invalid.');
  const cameraX = context.cameraPosition?.[0] ?? 0; const cameraY = context.cameraPosition?.[1] ?? 0;
  if (!Number.isFinite(cameraX) || !Number.isFinite(cameraY)) throw new RangeError('MUGEN cameraPosition must contain finite values.');
  const left = context.screenBounds?.[0] ?? cameraX - gameWidth / 2; const right = context.screenBounds?.[1] ?? cameraX + gameWidth / 2; const bottom = cameraY; const top = bottom - gameHeight;
  return Object.freeze({ zoom, screenWidth, screenHeight, gameWidth, gameHeight, left, right, top, bottom });
}
function soundPan(parameters: Readonly<Record<string, MugenExpression>>, positionX: number, facing: -1 | 1, context: EvaluationContext, rootId: string): number { if (parameters.abspan !== undefined) return numeric(evaluate(parameters.abspan, context), 'SndPan.abspan'); const geometry = screenGeometry(context, rootId); return Math.fround(positionX - (geometry.left + geometry.right) / 2 + numeric(evaluate(parameters.pan!, context), 'SndPan.pan') * facing); }
function setSystemVariableValue(context: EvaluationContext, rootId: string, index: number, value: number, add: boolean): void { const variables = context.systemVariablesByRoot.get(rootId); if (variables === undefined || index < 0 || index >= variables.length) throw new RangeError(`MUGEN SysVar index ${index} is out of range.`); variables[index] = add ? checkedScriptInt32(variables[index]! + value, `SysVar(${index})`) : value; }
function checkedScriptInt32(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) throw new RangeError(`MUGEN ${label} exceeds int32.`); return value; }
function attackAttributeMatches(pattern: string, actual: string): boolean { return pattern.length === 2 && actual.length === 2 && (pattern[0] === 'A' || pattern[0] === actual[0]) && (pattern[1] === 'A' || pattern[1] === actual[1]); }
function edgeDistances(positionX: number, facing: -1 | 1, width: readonly [front: number, back: number], bounds: readonly [number, number] | undefined): Readonly<{ front: number; back: number; frontBody: number; backBody: number }> { const [left, right] = bounds ?? [-320, 320]; const front = facing === 1 ? right - positionX : positionX - left; const back = facing === 1 ? positionX - left : right - positionX; return Object.freeze({ front, back, frontBody: front - width[0], backBody: back - width[1] }); }

function getHelperHitVariable(helper: MugenHelperEntitySnapshot, name: string): MugenExpressionValue { switch (name.toLowerCase()) { case 'xvel': return mugenFloat(helper.getHitVelocity[0]); case 'yvel': return mugenFloat(helper.getHitVelocity[1]); case 'yaccel': return mugenFloat(helper.getHitYAcceleration); case 'hitid': return mugenInt(helper.lastHitId); case 'hitshaketime': return mugenInt(helper.hitPauseTicks); case 'hittime': case 'ctrltime': return mugenInt(helper.stunTicks); case 'fall': return mugenInt(helper.hitFall ? 1 : 0); case 'fall.damage': return mugenInt(helper.hitFallDamage); case 'fall.xvel': return mugenFloat(helper.hitFallVelocity[0]); case 'fall.yvel': return mugenFloat(helper.hitFallVelocity[1]); case 'fall.recover': return mugenInt(helper.hitFallRecover ? 1 : 0); case 'fall.time': return mugenInt(helper.hitElapsedTicks); case 'fall.recovertime': return mugenInt(helper.hitFallRecoverTime); case 'fall.envshake.time': return mugenInt(helper.hitFallEnvShake[0]); case 'fall.envshake.freq': return mugenFloat(helper.hitFallEnvShake[1]); case 'fall.envshake.ampl': return mugenFloat(helper.hitFallEnvShake[2]); case 'fall.envshake.phase': return mugenFloat(helper.hitFallEnvShake[3]); case 'isbound': return mugenInt(helper.bindTargetId === null ? 0 : 1); default: return mugenBottom(`unsupported MUGEN Helper GetHitVar ${name}`); } }

function getHitVariable(fighter: MugenFighterSnapshot, name: string): MugenExpressionValue { switch (name.toLowerCase()) { case 'xvel': return mugenFloat(fighter.getHitVelocity[0]); case 'yvel': return mugenFloat(fighter.getHitVelocity[1]); case 'yaccel': return mugenFloat(fighter.getHitYAcceleration); case 'hitid': return mugenInt(fighter.lastHitId); case 'hitshaketime': return mugenInt(fighter.hitPauseTicks); case 'hittime': case 'ctrltime': return mugenInt(fighter.stunTicks); case 'fall': return mugenInt(fighter.hitFall ? 1 : 0); case 'fall.damage': return mugenInt(fighter.hitFallDamage); case 'fall.xvel': return mugenFloat(fighter.hitFallVelocity[0]); case 'fall.yvel': return mugenFloat(fighter.hitFallVelocity[1]); case 'fall.recover': return mugenInt(fighter.hitFallRecover ? 1 : 0); case 'fall.time': return mugenInt(fighter.hitElapsedTicks); case 'fall.recovertime': return mugenInt(fighter.hitFallRecoverTime); case 'fall.envshake.time': return mugenInt(fighter.hitFallEnvShake[0]); case 'fall.envshake.freq': return mugenFloat(fighter.hitFallEnvShake[1]); case 'fall.envshake.ampl': return mugenFloat(fighter.hitFallEnvShake[2]); case 'fall.envshake.phase': return mugenFloat(fighter.hitFallEnvShake[3]); case 'isbound': return mugenInt(fighter.targetBinding === null ? 0 : 1); default: return mugenBottom(`unsupported MUGEN GetHitVar ${name}`); } }

function resolveHitDefinition(controller: MugenStateController, context: EvaluationContext): MugenResolvedHitDefinition {
  const value = controller.hitDefinition; if (value === null) throw new TypeError('MUGEN HitDef controller is missing typed data.');
  const pair = (input: readonly [MugenExpression, MugenExpression], label: string): readonly [number, number] => Object.freeze([finiteFloat(numeric(evaluate(input[0], context), `${label}.x`), `${label}.x`), finiteFloat(numeric(evaluate(input[1], context), `${label}.y`), `${label}.y`)]);
  const optionalPair = (input: readonly [MugenExpression, MugenExpression] | null, label: string): readonly [number, number] | null => input === null ? null : pair(input, label);
  const integerPair = (input: readonly [MugenExpression, MugenExpression], label: string): readonly [number, number] => Object.freeze([integer(evaluate(input[0], context), `${label}.x`), integer(evaluate(input[1], context), `${label}.y`)]);
  const nonNegativePair = (input: readonly [MugenExpression, MugenExpression], label: string): readonly [number, number] => Object.freeze([nonNegativeInteger(evaluate(input[0], context), `${label}.x`), nonNegativeInteger(evaluate(input[1], context), `${label}.y`)]);
  const triple = (input: readonly [MugenExpression, MugenExpression, MugenExpression], label: string): readonly [number, number, number] => Object.freeze(input.map((expression, index) => finiteFloat(numeric(evaluate(expression, context), `${label}[${index}]`), `${label}[${index}]`))) as readonly [number, number, number];
  const damage = nonNegativePair(value.damage, 'HitDef.damage'); const attackerPower = integerPair(value.attackerPower, 'HitDef.getpower'); const defenderPower = integerPair(value.defenderPower, 'HitDef.givepower'); const priority = integer(evaluate(value.priority[0], context), 'HitDef.priority'); const groundVelocity = pair(value.groundVelocity, 'HitDef.ground.velocity'); const airVelocity = pair(value.airVelocity, 'HitDef.air.velocity'); const guardVelocity = pair(value.guardVelocity, 'HitDef.guard.velocity'); const fallX = value.fallVelocity[0] === null ? 0 : numeric(evaluate(value.fallVelocity[0], context), 'HitDef.fall.xvelocity');
  const airGuardVelocity = value.airGuardVelocity === null ? Object.freeze([Math.fround(airVelocity[0] * 1.5), Math.fround(airVelocity[1] / 2)]) as readonly [number, number] : pair(value.airGuardVelocity, 'HitDef.airguard.velocity'); const fallVelocity = Object.freeze([Math.fround(fallX), finiteFloat(numeric(evaluate(value.fallVelocity[1], context), 'HitDef.fall.yvelocity'), 'HitDef.fall.yvelocity')]) as readonly [number, number];
  const optionalFloat = (input: MugenExpression | null, fallback: number, label: string): number => input === null ? fallback : finiteFloat(numeric(evaluate(input, context), label), label); const groundCornerPush = optionalFloat(value.groundCornerPush, value.attributeState === 'A' ? 0 : Math.fround(guardVelocity[0] * 1.3), 'HitDef.ground.cornerpush.veloff'); const guardCornerPush = optionalFloat(value.guardCornerPush, groundCornerPush, 'HitDef.guard.cornerpush.veloff');
  const shake = (input: readonly [MugenExpression, MugenExpression, MugenExpression, MugenExpression], label: string): readonly [number, number, number, number] => Object.freeze([nonNegativeInteger(evaluate(input[0], context), `${label}.time`), finiteFloat(numeric(evaluate(input[1], context), `${label}.freq`), `${label}.freq`), finiteFloat(numeric(evaluate(input[2], context), `${label}.ampl`), `${label}.ampl`), finiteFloat(numeric(evaluate(input[3], context), `${label}.phase`), `${label}.phase`)]) as readonly [number, number, number, number];
  const output = Object.freeze({ sparkNumber: value.output.sparkNumber === null ? null : integer(evaluate(value.output.sparkNumber, context), 'HitDef.sparkno'), sparkFromPlayer: value.output.sparkFromPlayer, guardSparkNumber: value.output.guardSparkNumber === null ? null : integer(evaluate(value.output.guardSparkNumber, context), 'HitDef.guard.sparkno'), guardSparkFromPlayer: value.output.guardSparkFromPlayer, sparkPosition: pair(value.output.sparkPosition, 'HitDef.sparkxy'), hitSound: value.output.hitSound === null ? null : integerPair(value.output.hitSound, 'HitDef.hitsound'), hitSoundFromPlayer: value.output.hitSoundFromPlayer, guardSound: value.output.guardSound === null ? null : integerPair(value.output.guardSound, 'HitDef.guardsound'), guardSoundFromPlayer: value.output.guardSoundFromPlayer, envShake: shake(value.output.envShake, 'HitDef.envshake'), fallEnvShake: shake(value.output.fallEnvShake, 'HitDef.fall.envshake'), defenderPalette: Object.freeze({ time: integer(evaluate(value.output.defenderPalette.time, context), 'HitDef.palfx.time'), multiply: triple(value.output.defenderPalette.multiply, 'HitDef.palfx.mul'), add: triple(value.output.defenderPalette.add, 'HitDef.palfx.add') }) });
  return Object.freeze({ key: `s${controller.stateNumber}:l${controller.sourceLine}`, attributeState: value.attributeState, attackAttribute: value.attackAttribute, affectTeam: value.affectTeam, damage: damage[0], guardDamage: damage[1], hitFlags: value.hitFlags, guardFlags: value.guardFlags, groundHitType: value.groundHitType, airHitType: value.airHitType, animationType: value.animationType, airAnimationType: value.airAnimationType, fallAnimationType: value.fallAnimationType, priority, priorityClass: value.priority[1], hitPause: nonNegativePair(value.hitPause, 'HitDef.pausetime'), guardPause: nonNegativePair(value.guardPause, 'HitDef.guard.pausetime'), groundHitTime: nonNegativeInteger(evaluate(value.groundHitTime, context), 'HitDef.ground.hittime'), groundSlideTime: nonNegativeInteger(evaluate(value.groundSlideTime, context), 'HitDef.ground.slidetime'), guardSlideTime: nonNegativeInteger(evaluate(value.guardSlideTime, context), 'HitDef.guard.slidetime'), guardHitTime: nonNegativeInteger(evaluate(value.guardHitTime, context), 'HitDef.guard.hittime'), airHitTime: nonNegativeInteger(evaluate(value.airHitTime, context), 'HitDef.air.hittime'), guardControlTime: nonNegativeInteger(evaluate(value.guardControlTime, context), 'HitDef.guard.ctrltime'), airGuardControlTime: nonNegativeInteger(evaluate(value.airGuardControlTime, context), 'HitDef.airguard.ctrltime'), yAcceleration: finiteFloat(numeric(evaluate(value.yAcceleration, context), 'HitDef.yaccel'), 'HitDef.yaccel'), groundVelocity, airVelocity, guardVelocity, airGuardVelocity, downVelocity: pair(value.downVelocity, 'HitDef.down.velocity'), downHitTime: nonNegativeInteger(evaluate(value.downHitTime, context), 'HitDef.down.hittime'), groundCornerPush, airCornerPush: optionalFloat(value.airCornerPush, groundCornerPush, 'HitDef.air.cornerpush.veloff'), downCornerPush: optionalFloat(value.downCornerPush, groundCornerPush, 'HitDef.down.cornerpush.veloff'), guardCornerPush, airGuardCornerPush: optionalFloat(value.airGuardCornerPush, guardCornerPush, 'HitDef.airguard.cornerpush.veloff'), attackerPowerOnHit: attackerPower[0], attackerPowerOnGuard: attackerPower[1], defenderPowerOnHit: defenderPower[0], defenderPowerOnGuard: defenderPower[1], guardDistance: integer(evaluate(value.guardDistance, context), 'HitDef.guard.dist'), attackerSpritePriority: integer(evaluate(value.attackerSpritePriority, context), 'HitDef.p1sprpriority'), defenderSpritePriority: integer(evaluate(value.defenderSpritePriority, context), 'HitDef.p2sprpriority'), attackerFacing: integer(evaluate(value.attackerFacing, context), 'HitDef.p1facing'), attackerGetDefenderFacing: integer(evaluate(value.attackerGetDefenderFacing, context), 'HitDef.p1getp2facing'), defenderFacing: integer(evaluate(value.defenderFacing, context), 'HitDef.p2facing'), attackerStateNumber: integer(evaluate(value.attackerStateNumber, context), 'HitDef.p1stateno'), defenderStateNumber: integer(evaluate(value.defenderStateNumber, context), 'HitDef.p2stateno'), defenderGetsAttackerState: truthy(evaluate(value.defenderGetsAttackerState, context)), forceStand: truthy(evaluate(value.forceStand, context)) || groundVelocity[1] !== 0, fall: truthy(evaluate(value.fall, context)), airFall: truthy(evaluate(value.airFall, context)), forceNoFall: truthy(evaluate(value.forceNoFall, context)), airJuggle: nonNegativeInteger(evaluate(value.airJuggle, context), 'HitDef.air.juggle'), snap: optionalPair(value.snap, 'HitDef.snap'), downBounce: truthy(evaluate(value.downBounce, context)), fallVelocity, fallRecover: truthy(evaluate(value.fallRecover, context)), fallRecoverTime: nonNegativeInteger(evaluate(value.fallRecoverTime, context), 'HitDef.fall.recovertime'), fallDamage: nonNegativeInteger(evaluate(value.fallDamage, context), 'HitDef.fall.damage'), fallKill: truthy(evaluate(value.fallKill, context)), minimumDistance: optionalPair(value.minimumDistance, 'HitDef.mindist'), maximumDistance: optionalPair(value.maximumDistance, 'HitDef.maxdist'), targetId: integer(evaluate(value.targetId, context), 'HitDef.id'), chainId: integer(evaluate(value.chainId, context), 'HitDef.chainid'), noChainIds: integerPair(value.noChainIds, 'HitDef.nochainid'), hitOnce: truthy(evaluate(value.hitOnce, context)), hitCount: nonNegativeInteger(evaluate(value.hitCount, context), 'HitDef.numhits'), kill: truthy(evaluate(value.kill, context)), guardKill: truthy(evaluate(value.guardKill, context)), output });
}
function resolveReversalDefinition(controller: MugenStateController, stateDataOwnerId: string, context: EvaluationContext): MugenResolvedReversalDefinition { const value = controller.reversalDefinition; if (value === null) throw new TypeError('MUGEN ReversalDef controller is missing typed data.'); const pair = (input: readonly [MugenExpression, MugenExpression], label: string): readonly [number, number] => Object.freeze([nonNegativeInteger(evaluate(input[0], context), `${label}[0]`), nonNegativeInteger(evaluate(input[1], context), `${label}[1]`)]); return Object.freeze({ key: `s${controller.stateNumber}:l${controller.sourceLine}`, stateDataOwnerId, attributes: value.attributes, hitPause: pair(value.hitPause, 'ReversalDef.pausetime'), attackerStateNumber: integer(evaluate(value.attackerStateNumber, context), 'ReversalDef.p1stateno'), defenderStateNumber: integer(evaluate(value.defenderStateNumber, context), 'ReversalDef.p2stateno'), attackerSpritePriority: integer(evaluate(value.attackerSpritePriority, context), 'ReversalDef.p1sprpriority'), defenderSpritePriority: integer(evaluate(value.defenderSpritePriority, context), 'ReversalDef.p2sprpriority'), sparkNumber: value.sparkNumber === null ? null : integer(evaluate(value.sparkNumber, context), 'ReversalDef.sparkno'), hitSound: value.hitSound === null ? null : pair(value.hitSound, 'ReversalDef.hitsound') }); }
function animationElementTime(context: EvaluationContext, index: number): number | null { const animation = context.animationByFighter?.get(context.fighterId); if (animation === undefined || index < 1 || index > animation.action.elements.length) return null; let start = 0; for (let current = 0; current < index - 1; current += 1) { const duration = animation.action.elements[current]!.durationTicks; if (duration < 0) return null; start += Math.max(0, duration); } return animation.snapshot.actionTick - start; }
function animationElementNumber(animation: MugenScriptAnimationContext | undefined, offset: number): number | null { if (animation === undefined) return null; let tick = animation.snapshot.actionTick + offset; if (tick < 0) { const action = animation.action; if (action.totalTicks === null || action.loopTicks === null || action.loopTicks <= 0 || animation.snapshot.frameIndex < action.loopStart) return null; tick = action.preLoopTicks + modulo(tick - action.preLoopTicks, action.loopTicks); } return evaluateMugenAirAction(animation.action, tick, { x: 0, y: 0 }).frameIndex + 1; }
function animationTime(animation: MugenScriptAnimationContext | undefined): number { if (animation === undefined || animation.action.totalTicks === null) return -1; return animation.snapshot.actionTick - animation.action.totalTicks; }
function modulo(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }

function commit(match: MugenHeadlessMatch, command: MugenCoreMutationCommand): void { commitMugenCoreMutation(match, Object.freeze(command)); }
function commitCombat(match: MugenHeadlessMatch, command: MugenCombatMutationCommand): void { commitMugenCombatMutation(match, Object.freeze(command)); }
function setVelocity(match: MugenHeadlessMatch, fighter: MugenFighterSnapshot, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext, mode: 'set' | 'add' | 'multiply'): false { let x = fighter.velocity[0]; let y = fighter.velocity[1]; if (parameters.x !== undefined) { const value = numeric(evaluate(parameters.x, context), 'velocity x'); x = mode === 'set' ? value * fighter.facing : mode === 'add' ? x + value * fighter.facing : x * value; } if (parameters.y !== undefined) { const value = numeric(evaluate(parameters.y, context), 'velocity y'); y = mode === 'set' ? value : mode === 'add' ? y + value : y * value; } commit(match, { kind: 'kinematics', fighterId: fighter.id, velocity: [x, y] }); return false; }
function setPosition(match: MugenHeadlessMatch, fighter: MugenFighterSnapshot, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext, mode: 'set' | 'add'): false { let x = fighter.position[0]; let y = fighter.position[1]; if (parameters.x !== undefined) { const value = numeric(evaluate(parameters.x, context), 'position x'); x = mode === 'set' ? value : x + value * fighter.facing; } if (parameters.y !== undefined) { const value = numeric(evaluate(parameters.y, context), 'position y'); y = mode === 'set' ? value : y + value; } commit(match, { kind: 'kinematics', fighterId: fighter.id, position: [x, y] }); return false; }
function positionFreezeValue(parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): boolean { return parameters.value !== undefined ? truthy(evaluate(parameters.value, context)) : (parameters.x === undefined || truthy(evaluate(parameters.x, context))) || (parameters.y === undefined || truthy(evaluate(parameters.y, context))); }
function setVariable(match: MugenHeadlessMatch, id: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext, add: boolean): false { if (parameters.sv !== undefined) { setSystemVariableValue(context, id, integer(evaluate(parameters.sv, context), 'SysVar index'), integer(evaluate(parameters.value!, context), add ? 'SysVarAdd value' : 'SysVarSet value'), add); } else if (parameters.v !== undefined) { const index = integer(evaluate(parameters.v, context), 'Var index'); const value = integer(evaluate(parameters.value!, context), add ? 'VarAdd value' : 'VarSet value'); commit(match, { kind: 'integer-variable', fighterId: id, operation: add ? 'add' : 'set', index, value }); } else { const index = integer(evaluate(parameters.fv!, context), 'FVar index'); const value = numeric(evaluate(parameters.value!, context), add ? 'FVarAdd value' : 'FVarSet value'); commit(match, { kind: 'float-variable', fighterId: id, operation: add ? 'add' : 'set', index, value }); } return false; }
function setRandomVariable(match: MugenHeadlessMatch, id: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const [index, value] = randomVariableAssignment(match, parameters, context, 'VarRandom'); commit(match, { kind: 'integer-variable', fighterId: id, operation: 'set', index, value }); return false; }
function randomVariableAssignment(match: MugenHeadlessMatch, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext, label: string): readonly [number, number] { const index = integer(evaluate(parameters.v!, context), `${label}.v`); const firstValue = parameters['range.0'] === undefined ? 0 : integer(evaluate(parameters['range.0'], context), `${label}.range.first`); const secondValue = parameters['range.1'] === undefined ? (parameters['range.0'] === undefined ? 1000 : firstValue) : integer(evaluate(parameters['range.1'], context), `${label}.range.last`); const minimum = parameters['range.1'] === undefined && parameters['range.0'] !== undefined ? 0 : Math.min(firstValue, secondValue); const maximum = Math.max(firstValue, secondValue); const span = maximum - minimum + 1; if (!Number.isSafeInteger(span) || span < 1 || span > 0x1_0000_0000) throw new RangeError(`MUGEN ${label} range is too large.`); return Object.freeze([index, minimum + (match.nextRandomUint32() % span)]); }
function setVariableRange(match: MugenHeadlessMatch, id: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const range = variableRangeAssignment(parameters, context, 'VarRangeSet'); for (let index = range.first; index <= range.last; index += 1) commit(match, range.floats ? { kind: 'float-variable', fighterId: id, operation: 'set', index, value: range.value } : { kind: 'integer-variable', fighterId: id, operation: 'set', index, value: range.value }); return false; }
function variableRangeAssignment(parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext, label: string): Readonly<{ floats: boolean; first: number; last: number; value: number }> { const floats = parameters.fvalue !== undefined; const maximumIndex = floats ? 39 : 59; const first = parameters.first === undefined ? 0 : integer(evaluate(parameters.first, context), `${label}.first`); const last = parameters.last === undefined ? maximumIndex : integer(evaluate(parameters.last, context), `${label}.last`); if (first < 0 || last > maximumIndex || first > last) throw new RangeError(`MUGEN ${label} range must be within 0..${maximumIndex}.`); const value = floats ? numeric(evaluate(parameters.fvalue!, context), `${label}.fvalue`) : integer(evaluate(parameters.value!, context), `${label}.value`); return Object.freeze({ floats, first, last, value }); }
function setWidth(match: MugenHeadlessMatch, id: string, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): false { const pair = (key: 'value' | 'edge' | 'player'): readonly [number, number] => { const first = parameters[`${key}.0`] === undefined ? 0 : numeric(evaluate(parameters[`${key}.0`]!, context), `Width.${key}.front`); const back = parameters[`${key}.1`] === undefined ? 0 : numeric(evaluate(parameters[`${key}.1`]!, context), `Width.${key}.back`); if (first < 0 || back < 0) throw new RangeError(`MUGEN Width.${key} cannot be negative.`); return [first, back]; }; if (parameters['value.0'] !== undefined) { const value = pair('value'); commit(match, { kind: 'width', fighterId: id, edge: value, player: value }); } else commit(match, { kind: 'width', fighterId: id, edge: pair('edge'), player: pair('player') }); return false; }

function spawnHelperController(entities: MugenEntityAuthority, outputs: MugenOutputAuthority, ownerId: string, ownerPosition: readonly [number, number], ownerFacing: -1 | 1, maxLife: number, defenseMultiplier: number, juggleCapacity: number, controller: MugenStateController, context: EvaluationContext): string | null {
  const p = controller.parameters; const literal = controller.literalParameters ?? {};
  const transform = controllerSpawnTransform('helper', ownerId, ownerPosition, ownerFacing, optionalNumber(p['pos.0'], context, 0, 'Helper.pos.x'), optionalNumber(p['pos.1'], context, 0, 'Helper.pos.y'), literal.postype, context);
  const relativeFacing = controllerFacing(p.facing, context, 'Helper.facing');
  const entityId = entities.spawnHelper({ ownerId, helperId: optionalInteger(p.id, context, 0, 'Helper.id'), name: literal.name ?? controller.name, stateNumber: optionalInteger(p.stateno, context, 0, 'Helper.stateno'), position: transform.position, facing: multiplyFacing(transform.facing, relativeFacing), keyControl: p.keyctrl !== undefined && truthy(evaluate(p.keyctrl, context)), pauseMoveTime: optionalMoveTime(p.pausemovetime, context, 0, 'Helper.pausemovetime'), superMoveTime: optionalMoveTime(p.supermovetime, context, 0, 'Helper.supermovetime'), spritePriority: optionalInteger(p.sprpriority, context, 0, 'Helper.sprpriority'), maxLife, defenseMultiplier, juggleCapacity, constantOverrides: helperConstantOverrides(p, context) });
  configureEntitySpawnOutput(outputs, entityId, p, literal, context, ownerId, 'Helper');
  return entityId;
}

function helperConstantOverrides(parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  const scalarKeys = ['size.xscale', 'size.yscale', 'size.ground.back', 'size.ground.front', 'size.air.back', 'size.air.front', 'size.height', 'size.proj.doscale', 'size.shadowoffset'] as const;
  for (const key of scalarKeys) if (parameters[key] !== undefined) result[key] = numeric(evaluate(parameters[key]!, context), `Helper.${key}`);
  for (const key of ['size.head.pos', 'size.mid.pos'] as const) {
    if (parameters[`${key}.0`] !== undefined) { const value = numeric(evaluate(parameters[`${key}.0`]!, context), `Helper.${key}.x`); result[key] = value; result[`${key}.x`] = value; }
    if (parameters[`${key}.1`] !== undefined) result[`${key}.y`] = numeric(evaluate(parameters[`${key}.1`]!, context), `Helper.${key}.y`);
  }
  return Object.freeze(result);
}

function spawnProjectileController(entities: MugenEntityAuthority, outputs: MugenOutputAuthority, ownerId: string, ownerPosition: readonly [number, number], ownerFacing: -1 | 1, defaultAnimation: number, animationOwnerId: string, controller: MugenStateController, context: EvaluationContext): string | null {
  const p = controller.parameters; const literal = controller.literalParameters ?? {};
  const transform = controllerSpawnTransform('projectile', ownerId, ownerPosition, ownerFacing, optionalNumber(p['offset.0'], context, 0, 'Projectile.offset.x'), optionalNumber(p['offset.1'], context, 0, 'Projectile.offset.y'), literal.postype, context);
  const entityId = entities.spawnProjectile({ ownerId, projectileId: optionalInteger(p.projid, context, 0, 'Projectile.projid'), animationNumber: optionalInteger(p.projanim, context, defaultAnimation, 'Projectile.projanim'), ...projectileLifecycleParameters(p, literal, context, animationOwnerId, transform.facing), hitDefinition: resolveHitDefinition(controller, context), priority: optionalNonNegative(p.projpriority, context, 1, 'Projectile.projpriority'), hitCount: optionalNonNegative(p.projhits, context, 1, 'Projectile.projhits'), missTime: optionalNonNegative(p.projmisstime, context, 0, 'Projectile.projmisstime'), position: transform.position, velocity: [optionalNumber(p['velocity.0'], context, 0, 'Projectile.velocity.x') * transform.facing, optionalNumber(p['velocity.1'], context, 0, 'Projectile.velocity.y')], acceleration: [optionalNumber(p['accel.0'], context, 0, 'Projectile.accel.x') * transform.facing, optionalNumber(p['accel.1'], context, 0, 'Projectile.accel.y')], velocityMultiplier: [optionalNumber(p['velmul.0'], context, 1, 'Projectile.velmul.x'), optionalNumber(p['velmul.1'], context, 1, 'Projectile.velmul.y')], removeTime: optionalInteger(p.projremovetime, context, -1, 'Projectile.projremovetime'), pauseMoveTime: optionalMoveTime(p.pausemovetime, context, 0, 'Projectile.pausemovetime'), superMoveTime: optionalMoveTime(p.supermovetime, context, 0, 'Projectile.supermovetime') });
  configureEntitySpawnOutput(outputs, entityId, p, literal, context, ownerId, 'Projectile');
  setProjectileAfterImage(outputs, entityId, p, literal, context);
  return entityId;
}

function spawnExplodController(entities: MugenEntityAuthority, outputs: MugenOutputAuthority, ownerId: string, rootId: string, ownerPosition: readonly [number, number], ownerFacing: -1 | 1, defaultAnimationOwnerId: string, controller: MugenStateController, context: EvaluationContext): string | null {
  const p = controller.parameters; const literal = controller.literalParameters ?? {};
  const randomX = explodRandomOffset(p['random.0'], context, 'Explod.random.x'); const randomY = explodRandomOffset(p['random.1'], context, 'Explod.random.y');
  const x = optionalNumber(p['pos.0'], context, 0, 'Explod.pos.x') + randomX; const y = optionalNumber(p['pos.1'], context, 0, 'Explod.pos.y') + randomY;
  const transform = controllerSpawnTransform('explod', ownerId, ownerPosition, ownerFacing, x, y, literal.postype, context, literal.space);
  const finalFacing = multiplyFacing(transform.facing, controllerFacing(p.facing, context, 'Explod.facing'));
  const bind = explodBinding(entities, ownerId, rootId, transform, p, context);
  const entityId = entities.spawnExplod({ ownerId, explodId: optionalInteger(p.id, context, 0, 'Explod.id'), animationNumber: integer(evaluate(p.anim!, context), 'Explod.anim'), animationOwnerId: literal['anim.owner'] === 'fight' ? 'fight' : defaultAnimationOwnerId, position: transform.position, velocity: [optionalNumber(p['vel.0'] ?? p['velocity.0'], context, 0, 'Explod.vel.x') * finalFacing, optionalNumber(p['vel.1'] ?? p['velocity.1'], context, 0, 'Explod.vel.y')], acceleration: [optionalNumber(p['accel.0'], context, 0, 'Explod.accel.x') * finalFacing, optionalNumber(p['accel.1'], context, 0, 'Explod.accel.y')], facing: finalFacing, verticalFacing: controllerFacing(p.vfacing, context, 'Explod.vfacing'), coordinateSpace: transform.coordinateSpace, bindTargetId: bind.targetId, bindOffset: bind.offset, bindTime: optionalInteger(p.bindtime, context, bind.targetId === null ? 0 : 1, 'Explod.bindtime'), removeTime: optionalInteger(p.removetime, context, -2, 'Explod.removetime'), removeOnGetHit: p.removeongethit !== undefined && truthy(evaluate(p.removeongethit, context)), layer: p.ontop !== undefined && truthy(evaluate(p.ontop, context)) ? 'above' : 'below', spritePriority: optionalInteger(p.sprpriority, context, 0, 'Explod.sprpriority'), pauseMoveTime: optionalMoveTime(p.pausemovetime, context, 0, 'Explod.pausemovetime'), superMoveTime: p.supermovetime === undefined && p.supermove !== undefined && truthy(evaluate(p.supermove, context)) ? 2_147_483_647 : optionalMoveTime(p.supermovetime, context, 0, 'Explod.supermovetime') });
  configureEntitySpawnOutput(outputs, entityId, p, literal, context, rootId, 'Explod', literal['anim.owner'] === 'fight');
  return entityId;
}

function modifyExplodController(entities: MugenEntityAuthority, outputs: MugenOutputAuthority, candidates: readonly MugenExplodEntitySnapshot[], ownerPosition: readonly [number, number], ownerFacing: -1 | 1, controller: MugenStateController, context: EvaluationContext): void {
  const p = controller.parameters; const literal = controller.literalParameters ?? {}; const selectedId = optionalInteger(p.id, context, -1, 'ModifyExplod.id');
  for (const explod of candidates) {
    if (selectedId !== -1 && explod.explodId !== selectedId) continue;
    let transform: ControllerSpawnTransform | undefined;
    if (p['pos.0'] !== undefined || p['pos.1'] !== undefined || p['random.0'] !== undefined || p['random.1'] !== undefined || literal.postype !== undefined || literal.space !== undefined) { const x = optionalNumber(p['pos.0'], context, 0, 'ModifyExplod.pos.x') + explodRandomOffset(p['random.0'], context, 'ModifyExplod.random.x'); const y = optionalNumber(p['pos.1'], context, 0, 'ModifyExplod.pos.y') + explodRandomOffset(p['random.1'], context, 'ModifyExplod.random.y'); transform = controllerSpawnTransform('explod', explod.ownerId, ownerPosition, ownerFacing, x, y, literal.postype, context, literal.space); }
    const facing = p.facing === undefined ? transform?.facing : multiplyFacing(transform?.facing ?? explod.facing, controllerFacing(p.facing, context, 'ModifyExplod.facing'));
    entities.modifyExplod(explod.entityId, { ...(p.anim === undefined ? {} : { animationNumber: integer(evaluate(p.anim, context), 'ModifyExplod.anim'), animationOwnerId: literal['anim.owner'] === 'fight' ? 'fight' : explod.rootId }), ...(transform === undefined ? {} : { position: transform.position, coordinateSpace: transform.coordinateSpace }), ...(facing === undefined ? {} : { facing }), ...(p.vfacing === undefined ? {} : { verticalFacing: controllerFacing(p.vfacing, context, 'ModifyExplod.vfacing') }), ...(p['vel.0'] === undefined && p['vel.1'] === undefined && p['velocity.0'] === undefined && p['velocity.1'] === undefined ? {} : { velocity: [optionalNumber(p['vel.0'] ?? p['velocity.0'], context, explod.velocity[0] * explod.facing, 'ModifyExplod.vel.x') * explod.facing, optionalNumber(p['vel.1'] ?? p['velocity.1'], context, explod.velocity[1], 'ModifyExplod.vel.y')] as const }), ...(p['accel.0'] === undefined && p['accel.1'] === undefined ? {} : { acceleration: [optionalNumber(p['accel.0'], context, explod.acceleration[0] * explod.facing, 'ModifyExplod.accel.x') * explod.facing, optionalNumber(p['accel.1'], context, explod.acceleration[1], 'ModifyExplod.accel.y')] as const }), ...(p.removetime === undefined ? {} : { removeTime: integer(evaluate(p.removetime, context), 'ModifyExplod.removetime') }), ...(p.removeongethit === undefined ? {} : { removeOnGetHit: truthy(evaluate(p.removeongethit, context)) }), ...(p.bindtime === undefined ? {} : { bindTime: integer(evaluate(p.bindtime, context), 'ModifyExplod.bindtime') }), ...(p.sprpriority === undefined ? {} : { spritePriority: integer(evaluate(p.sprpriority, context), 'ModifyExplod.sprpriority') }), ...(p.ontop === undefined ? {} : { layer: truthy(evaluate(p.ontop, context)) ? 'above' as const : 'below' as const }), ...(p.pausemovetime === undefined ? {} : { pauseMoveTime: optionalMoveTime(p.pausemovetime, context, 0, 'ModifyExplod.pausemovetime') }), ...(p.supermovetime === undefined && p.supermove === undefined ? {} : { superMoveTime: p.supermovetime === undefined && truthy(evaluate(p.supermove!, context)) ? 2_147_483_647 : optionalMoveTime(p.supermovetime, context, 0, 'ModifyExplod.supermovetime') }) });
    if (p.bindid !== undefined || transform !== undefined && p.bindtime !== undefined) { const binding = explodBinding(entities, explod.ownerId, explod.rootId, transform ?? Object.freeze({ position: explod.position, facing: explod.facing, coordinateSpace: explod.coordinateSpace, relativeOffset: explod.bindOffset, anchorId: explod.bindTargetId }), p, context); entities.bind(explod.entityId, binding.targetId, optionalInteger(p.bindtime, context, 1, 'ModifyExplod.bindtime'), binding.offset); }
    modifyExplodOutput(outputs, explod.entityId, p, literal, context, explod.rootId);
  }
}

function modifyExplodOutput(outputs: MugenOutputAuthority, entityId: string, parameters: Readonly<Record<string, MugenExpression>>, literal: Readonly<Record<string, string>>, context: EvaluationContext, rootId: string): void {
  const current = outputs.entity(entityId); const base = current.baseDrawingTransform ?? Object.freeze({ angle: 0, scale: spawnPair(1, 1) });
  if (parameters['scale.0'] !== undefined || parameters['scale.1'] !== undefined || parameters.angle !== undefined || parameters.xangle !== undefined || parameters.yangle !== undefined) { const xAngle = optionalNumber(parameters.xangle, context, 0, 'ModifyExplod.xangle'); const yAngle = optionalNumber(parameters.yangle, context, 0, 'ModifyExplod.yangle'); const xScale = optionalNumber(parameters['scale.0'], context, base.scale[0], 'ModifyExplod.scale.x') * Math.abs(Math.cos(yAngle * Math.PI / 180)); const yScale = optionalNumber(parameters['scale.1'], context, base.scale[1], 'ModifyExplod.scale.y') * Math.abs(Math.cos(xAngle * Math.PI / 180)); outputs.setBaseDrawingTransform(entityId, optionalNumber(parameters.angle, context, base.angle, 'ModifyExplod.angle'), [xScale, yScale]); }
  if (parameters.ownpal !== undefined) outputs.setPaletteIsolation(entityId, truthy(evaluate(parameters.ownpal, context)));
  if (parameters['remappal.0'] !== undefined) { const destination: readonly [number, number] = Object.freeze([integer(evaluate(parameters['remappal.0'], context), 'ModifyExplod.remappal.group'), optionalInteger(parameters['remappal.1'], context, 0, 'ModifyExplod.remappal.item')]); if (destination[0] >= 0) outputs.setPaletteRemap(entityId, [1, context.paletteNumberByRoot.get(rootId) ?? 1], destination); }
  if (literal.trans !== undefined) { const mode = literal.trans.toLowerCase() as MugenTransparencyMode; const defaults: readonly [number, number] = mode === 'addalpha' ? [256, 0] : mode === 'add1' ? [256, 128] : [256, 256]; outputs.setBaseTransparency(entityId, mode, [optionalInteger(parameters['alpha.0'], context, defaults[0], 'ModifyExplod.alpha.source'), optionalInteger(parameters['alpha.1'], context, defaults[1], 'ModifyExplod.alpha.destination')]); }
}

type ControllerSpawnKind = 'helper' | 'projectile' | 'explod';
interface ControllerSpawnTransform { readonly position: readonly [number, number]; readonly facing: -1 | 1; readonly coordinateSpace: 'stage' | 'screen'; readonly relativeOffset: readonly [number, number]; readonly anchorId: string | null }
function controllerSpawnTransform(kind: ControllerSpawnKind, ownerId: string, ownerPosition: readonly [number, number], ownerFacing: -1 | 1, x: number, y: number, postypeValue: string | undefined, context: EvaluationContext, spaceValue?: string): ControllerSpawnTransform {
  const rootId = context.entities.entity(ownerId)?.rootId ?? context.fighterId; const geometry = screenGeometry(context, rootId); const postype = (postypeValue ?? '').toLowerCase(); const relativeOffset = spawnPair(x, y);
  const opponentId = context.opponentByFighter?.get(rootId); const opponent = opponentId === undefined ? null : context.match.fighter(opponentId); const screenExplod = kind === 'explod';
  if (postype === 'p2' && opponent !== null) return Object.freeze({ position: spawnPair(opponent.position[0] + x * opponent.facing, opponent.position[1] + y), facing: opponent.facing, coordinateSpace: 'stage', relativeOffset, anchorId: opponent.id });
  if (postype === 'left' || postype === 'right') { const right = postype === 'right'; if (screenExplod) return Object.freeze({ position: spawnPair((right ? geometry.screenWidth : 0) + x, y), facing: 1, coordinateSpace: 'screen', relativeOffset, anchorId: null }); return Object.freeze({ position: spawnPair((right ? geometry.right : geometry.left) + x, ownerPosition[1] + y), facing: 1, coordinateSpace: 'stage', relativeOffset, anchorId: null }); }
  if (postype === 'front') { if (screenExplod) return Object.freeze({ position: spawnPair((ownerFacing === 1 ? geometry.screenWidth : 0) + x, y), facing: 1, coordinateSpace: 'screen', relativeOffset, anchorId: null }); return Object.freeze({ position: spawnPair((ownerFacing === 1 ? geometry.right : geometry.left) + x * ownerFacing, ownerPosition[1] + y), facing: ownerFacing, coordinateSpace: 'stage', relativeOffset, anchorId: null }); }
  if (postype === 'back') { if (screenExplod) return Object.freeze({ position: spawnPair((ownerFacing === 1 ? 0 : geometry.screenWidth) + x * ownerFacing, y), facing: ownerFacing, coordinateSpace: 'screen', relativeOffset, anchorId: null }); return Object.freeze({ position: spawnPair((ownerFacing === 1 ? geometry.left : geometry.right) + x * ownerFacing, ownerPosition[1] + y), facing: ownerFacing, coordinateSpace: 'stage', relativeOffset, anchorId: null }); }
  if (postype === 'none' || postype === '' && spaceValue?.toLowerCase() === 'stage') return Object.freeze({ position: relativeOffset, facing: 1, coordinateSpace: 'stage', relativeOffset, anchorId: null });
  if (postype === '' && spaceValue?.toLowerCase() === 'screen') return Object.freeze({ position: relativeOffset, facing: 1, coordinateSpace: 'screen', relativeOffset, anchorId: null });
  return Object.freeze({ position: spawnPair(ownerPosition[0] + x * ownerFacing, ownerPosition[1] + y), facing: ownerFacing, coordinateSpace: 'stage', relativeOffset, anchorId: ownerId });
}

function explodBinding(entities: MugenEntityAuthority, ownerId: string, rootId: string, transform: ControllerSpawnTransform, parameters: Readonly<Record<string, MugenExpression>>, context: EvaluationContext): Readonly<{ targetId: string | null; offset: readonly [number, number] }> {
  if (transform.coordinateSpace === 'screen') return Object.freeze({ targetId: null, offset: spawnPair(0, 0) });
  if (parameters.bindid === undefined) return Object.freeze({ targetId: transform.anchorId, offset: transform.relativeOffset });
  const bindId = integer(evaluate(parameters.bindid, context), 'Explod.bindid'); if (bindId === -2) return Object.freeze({ targetId: null, offset: spawnPair(0, 0) });
  if (bindId === -1) return Object.freeze({ targetId: ownerId, offset: transform.relativeOffset });
  const target = entities.playerById(bindId); return Object.freeze({ targetId: target?.rootId === rootId ? target.entityId : null, offset: transform.relativeOffset });
}

function configureEntitySpawnOutput(outputs: MugenOutputAuthority, entityId: string | null, parameters: Readonly<Record<string, MugenExpression>>, literal: Readonly<Record<string, string>>, context: EvaluationContext, rootId: string, label: 'Helper' | 'Projectile' | 'Explod', defaultOwnPalette = false): void {
  if (entityId === null) return;
  const scalePrefix = label === 'Projectile' ? 'projscale' : 'scale'; const xScale = optionalNumber(parameters[`${scalePrefix}.0`] ?? (label === 'Helper' ? parameters['size.xscale'] : undefined), context, 1, `${label}.scale.x`); const yScale = optionalNumber(parameters[`${scalePrefix}.1`] ?? (label === 'Helper' ? parameters['size.yscale'] : undefined), context, 1, `${label}.scale.y`);
  const xAngle = optionalNumber(parameters.xangle, context, 0, `${label}.xangle`); const yAngle = optionalNumber(parameters.yangle, context, 0, `${label}.yangle`); const projectedScale: readonly [number, number] = Object.freeze([Math.abs(Math.cos(yAngle * Math.PI / 180)) * xScale, Math.abs(Math.cos(xAngle * Math.PI / 180)) * yScale]);
  outputs.setBaseDrawingTransform(entityId, optionalNumber(parameters.angle, context, 0, `${label}.angle`), projectedScale);
  const ownPalette = parameters.ownpal === undefined ? defaultOwnPalette : truthy(evaluate(parameters.ownpal, context)); outputs.setPaletteIsolation(entityId, ownPalette);
  if (ownPalette && parameters['remappal.0'] !== undefined) { const destination: readonly [number, number] = Object.freeze([integer(evaluate(parameters['remappal.0'], context), `${label}.remappal.group`), optionalInteger(parameters['remappal.1'], context, 0, `${label}.remappal.item`)]); if (destination[0] >= 0) outputs.setPaletteRemap(entityId, [1, context.paletteNumberByRoot.get(rootId) ?? 1], destination); }
  if (literal.trans !== undefined) { const mode = literal.trans.toLowerCase() as MugenTransparencyMode; const defaults: readonly [number, number] = mode === 'addalpha' ? [256, 0] : mode === 'add1' ? [256, 128] : [256, 256]; outputs.setBaseTransparency(entityId, mode, [optionalInteger(parameters['alpha.0'], context, defaults[0], `${label}.alpha.source`), optionalInteger(parameters['alpha.1'], context, defaults[1], `${label}.alpha.destination`)]); }
}

function controllerFacing(expression: MugenExpression | undefined, context: EvaluationContext, label: string): -1 | 1 { const value = optionalInteger(expression, context, 1, label); if (value !== -1 && value !== 1) throw new RangeError(`MUGEN ${label} must be -1 or 1.`); return value; }
function multiplyFacing(left: -1 | 1, right: -1 | 1): -1 | 1 { return left === right ? 1 : -1; }
function spawnPair(x: number, y: number): readonly [number, number] { return Object.freeze([x, y]); }
function explodRandomOffset(expression: MugenExpression | undefined, context: EvaluationContext, label: string): number { const amount = optionalNonNegative(expression, context, 0, label); if (amount === 0) return 0; return context.match.nextRandomUint32() % amount - Math.floor(amount / 2); }

function projectileLifecycleParameters(parameters: Readonly<Record<string, MugenExpression>>, literalParameters: Readonly<Record<string, string>> | undefined, context: EvaluationContext, defaultOwnerId: string, projectileFacing: -1 | 1): Pick<MugenProjectileSpawn, 'animationOwnerId' | 'hitAnimationNumber' | 'hitAnimationOwnerId' | 'removeAnimationNumber' | 'removeAnimationOwnerId' | 'cancelAnimationNumber' | 'cancelAnimationOwnerId' | 'removeVelocity' | 'removeOnHit' | 'spritePriority' | 'edgeBound' | 'stageBound' | 'heightBound' | 'facing'> { const animationOwnerId = literalParameters?.['projanim.owner'] === 'fight' ? 'fight' : defaultOwnerId; const hitAnimationNumber = optionalInteger(parameters.projhitanim, context, -1, 'Projectile.projhitanim'); const hitAnimationOwnerId = literalParameters?.['projhitanim.owner'] === 'fight' ? 'fight' : animationOwnerId; const removeAnimationNumber = optionalInteger(parameters.projremanim, context, hitAnimationNumber, 'Projectile.projremanim'); const removeAnimationOwnerId = literalParameters?.['projremanim.owner'] === 'fight' ? 'fight' : hitAnimationOwnerId; const cancelAnimationNumber = optionalInteger(parameters.projcancelanim, context, removeAnimationNumber, 'Projectile.projcancelanim'); const cancelAnimationOwnerId = literalParameters?.['projcancelanim.owner'] === 'fight' ? 'fight' : removeAnimationOwnerId; return { animationOwnerId, hitAnimationNumber, hitAnimationOwnerId, removeAnimationNumber, removeAnimationOwnerId, cancelAnimationNumber, cancelAnimationOwnerId, removeVelocity: [optionalNumber(parameters['remvelocity.0'], context, 0, 'Projectile.remvelocity.x') * projectileFacing, optionalNumber(parameters['remvelocity.1'], context, 0, 'Projectile.remvelocity.y')], removeOnHit: parameters.projremove === undefined || truthy(evaluate(parameters.projremove, context)), spritePriority: optionalInteger(parameters.projsprpriority, context, 3, 'Projectile.projsprpriority'), edgeBound: optionalNonNegative(parameters.projedgebound, context, 40, 'Projectile.projedgebound'), stageBound: optionalNonNegative(parameters.projstagebound, context, 40, 'Projectile.projstagebound'), heightBound: [optionalNumber(parameters['projheightbound.0'], context, -240, 'Projectile.projheightbound.low'), optionalNumber(parameters['projheightbound.1'], context, 1, 'Projectile.projheightbound.high')], facing: projectileFacing }; }
function setProjectileAfterImage(outputs: MugenOutputAuthority, entityId: string | null, parameters: Readonly<Record<string, MugenExpression>>, literalParameters: Readonly<Record<string, string>> | undefined, context: EvaluationContext): void {
  if (entityId === null || !Object.keys(parameters).some(key => key.startsWith('afterimage.')) && literalParameters?.['afterimage.trans'] === undefined) return;
  const triple = (key: string, fallback: readonly [number, number, number]): readonly [number, number, number] => Object.freeze([optionalNumber(parameters[`afterimage.${key}.0`], context, fallback[0], `Projectile.afterimage.${key}[0]`), optionalNumber(parameters[`afterimage.${key}.1`], context, fallback[1], `Projectile.afterimage.${key}[1]`), optionalNumber(parameters[`afterimage.${key}.2`], context, fallback[2], `Projectile.afterimage.${key}[2]`)]);
  outputs.setAfterImage(entityId, { remainingTicks: optionalInteger(parameters['afterimage.time'], context, 1, 'Projectile.afterimage.time'), length: optionalInteger(parameters['afterimage.length'], context, 20, 'Projectile.afterimage.length'), paletteColor: optionalInteger(parameters['afterimage.palcolor'], context, 256, 'Projectile.afterimage.palcolor'), paletteInvertAll: parameters['afterimage.palinvertall'] !== undefined && truthy(evaluate(parameters['afterimage.palinvertall'], context)), paletteBright: triple('palbright', [30, 30, 30]), paletteContrast: triple('palcontrast', [120, 120, 220]), palettePostBright: triple('palpostbright', [0, 0, 0]), paletteAdd: triple('paladd', [10, 10, 25]), paletteMultiply: triple('palmul', [.65, .65, .75]), timeGap: optionalInteger(parameters['afterimage.timegap'], context, 1, 'Projectile.afterimage.timegap'), frameGap: optionalInteger(parameters['afterimage.framegap'], context, 4, 'Projectile.afterimage.framegap'), transparency: (literalParameters?.['afterimage.trans']?.toLowerCase() ?? 'none') as MugenAfterImageEffect['transparency'] });
}
function selectedTargets(match: MugenHeadlessMatch, fighterId: string, targetId: number): MugenFighterSnapshot['targets'] { return match.fighter(fighterId).targets.filter(target => targetId === -1 || target.targetId === targetId); }
function numeric(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`MUGEN ${label} must be numeric.`); return finiteFloat(value, label); }
function integer(value: unknown, label: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`MUGEN ${label} must be numeric.`); if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) throw new RangeError(`MUGEN ${label} must be int32.`); return Object.is(value, -0) ? 0 : value; }
function nonNegativeInteger(value: unknown, label: string): number { const result = integer(value, label); if (result < 0) throw new RangeError(`MUGEN ${label} must be non-negative.`); return result; }
function normalizePause(value: MugenPauseSnapshot): MugenPauseSnapshot { if (!value || (value.kind !== 'pause' && value.kind !== 'super-pause') || typeof value.ownerRootId !== 'string' || value.ownerRootId.length === 0 || typeof value.backgroundPaused !== 'boolean' || typeof value.darken !== 'boolean' || typeof value.ownerUnhittable !== 'boolean') throw new TypeError('MUGEN pause snapshot is invalid.'); const remainingTicks = nonNegativeInteger(value.remainingTicks, 'pause.remainingTicks'); const ownerMoveTicks = nonNegativeInteger(value.ownerMoveTicks, 'pause.ownerMoveTicks'); const endCommandBufferTicks = nonNegativeInteger(value.endCommandBufferTicks, 'pause.endCommandBufferTicks'); const opponentDefenseMultiplier = finiteFloat(value.opponentDefenseMultiplier, 'pause.opponentDefenseMultiplier'); if (opponentDefenseMultiplier < 0) throw new RangeError('MUGEN pause opponent defense multiplier cannot be negative.'); const startedTick = nonNegativeInteger(value.startedTick, 'pause.startedTick'); return Object.freeze({ kind: value.kind, ownerRootId: value.ownerRootId, remainingTicks, ownerMoveTicks, endCommandBufferTicks, backgroundPaused: value.backgroundPaused, darken: value.darken, opponentDefenseMultiplier, ownerUnhittable: value.ownerUnhittable, startedTick }); }
function optionalInteger(expression: MugenExpression | undefined, context: EvaluationContext, fallback: number, label: string): number { return expression === undefined ? fallback : integer(evaluate(expression, context), label); }
function optionalNonNegative(expression: MugenExpression | undefined, context: EvaluationContext, fallback: number, label: string): number { return expression === undefined ? fallback : nonNegativeInteger(evaluate(expression, context), label); }
function optionalMoveTime(expression: MugenExpression | undefined, context: EvaluationContext, fallback: number, label: string): number {
  if (expression === undefined) return fallback;
  const value = evaluate(expression, context);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`MUGEN ${label} must be numeric.`);
  if (!Number.isSafeInteger(value)) throw new RangeError(`MUGEN ${label} must be an integer.`);
  if (value < 0) throw new RangeError(`MUGEN ${label} must be non-negative.`);
  return Math.min(value, 2_147_483_647);
}
function optionalNumber(expression: MugenExpression | undefined, context: EvaluationContext, fallback: number, label: string): number { return expression === undefined ? fallback : numeric(evaluate(expression, context), label); }
function truthy(value: unknown): boolean { if (typeof value === 'boolean') return value; if (typeof value === 'number') return value !== 0; throw new TypeError('MUGEN trigger result must be boolean or numeric.'); }
function finiteFloat(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) throw new RangeError(`MUGEN ${label} exceeds the finite float budget.`); const result = Math.fround(value); return Object.is(result, -0) ? 0 : result; }
function finitePositiveFloat(value: number, label: string): number { const result = finiteFloat(value, label); if (result <= 0) throw new RangeError(`MUGEN ${label} must be positive.`); return result; }
function sha256(value: string, label: string): string { if (!/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`MUGEN ${label} must be a lowercase SHA-256 digest.`); return value; }
function scriptStructureHash(commands: MugenCommandProgram, states: MugenStateProgram): string { let byCommands = scriptStructureHashes.get(states); if (byCommands === undefined) { byCommands = new WeakMap<object, string>(); scriptStructureHashes.set(states, byCommands); } const cached = byCommands.get(commands); if (cached !== undefined) return cached; const hash = hashSimulationState({ commands, states } as unknown as SimulationStateValue); if (Object.isFrozen(states) && Object.isFrozen(commands)) byCommands.set(commands, hash); return hash; }
function friction(value: number, label: string): number { const result = finiteFloat(value, label); if (result < 0 || result > 1) throw new RangeError(`MUGEN ${label} must be from 0 to 1.`); return result; }
function applyPhysics(match: MugenHeadlessMatch, fighter: MugenFighterSnapshot, program: Readonly<{ gravity: number; standFriction: number; crouchFriction: number }>): void { if (fighter.physics === 'A') commit(match, { kind: 'kinematics', fighterId: fighter.id, velocity: [fighter.velocity[0], fighter.velocity[1] + program.gravity] }); else if (fighter.physics === 'S' || fighter.physics === 'C') { const coefficient = fighter.physics === 'S' ? program.standFriction : program.crouchFriction; const x = Math.abs(fighter.velocity[0] * coefficient) < 0.01 ? 0 : fighter.velocity[0] * coefficient; commit(match, { kind: 'kinematics', fighterId: fighter.id, velocity: [x, fighter.velocity[1]] }); } }
function applyHelperPhysics(entities: MugenEntityAuthority, helper: MugenHelperEntitySnapshot, program: Readonly<{ gravity: number; standFriction: number; crouchFriction: number }>): void { if (helper.physics === 'A') entities.updateHelper(helper.entityId, { velocity: [helper.velocity[0], helper.velocity[1] + program.gravity] }); else if (helper.physics === 'S' || helper.physics === 'C') { const coefficient = helper.physics === 'S' ? program.standFriction : program.crouchFriction; const x = Math.abs(helper.velocity[0] * coefficient) < 0.01 ? 0 : helper.velocity[0] * coefficient; entities.updateHelper(helper.entityId, { velocity: [x, helper.velocity[1]] }); } }
function stateType(value: unknown): MugenStateType { if (value === 'S' || value === 'C' || value === 'A' || value === 'L') return value; throw new TypeError('MUGEN StateTypeSet statetype is invalid.'); }
function moveType(value: unknown): MugenMoveType { if (value === 'I' || value === 'A' || value === 'H') return value; throw new TypeError('MUGEN StateTypeSet movetype is invalid.'); }
function physicsType(value: unknown): MugenPhysicsType { if (value === 'N' || value === 'S' || value === 'C' || value === 'A') return value; throw new TypeError('MUGEN StateTypeSet physics is invalid.'); }
const ALL_HIT_ATTRIBUTE_KEYS = Object.freeze(['S', 'C', 'A'].flatMap(state => ['NA', 'SA', 'HA', 'NP', 'SP', 'HP', 'NT', 'ST', 'HT'].map(attack => `${state}:${attack}`)).sort());
