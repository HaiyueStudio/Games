import { DeterministicRandom, hashSimulationState, type SimulationStateValue } from '@haiyue/engine/experimental/simulation';
import type { MugenFacing, MugenTickInput } from '../input/MugenInputRuntime';

export type MugenRoundPhase = 'ready' | 'fight' | 'ko' | 'round-over' | 'match-over';
export type MugenRoundResultReason = 'ko' | 'time-over' | 'draw';
export type MugenStateType = 'S' | 'C' | 'A' | 'L';
export type MugenMoveType = 'I' | 'A' | 'H';
export type MugenPhysicsType = 'N' | 'S' | 'C' | 'A';
export type MugenMoveContact = 'none' | 'hit' | 'guarded' | 'reversed';
export type MugenStunKind = 'hit' | 'guard';
export type MugenAttackAttribute = 'NA' | 'SA' | 'HA' | 'NP' | 'SP' | 'HP' | 'NT' | 'ST' | 'HT';
export type MugenGroundHitType = 'high' | 'low' | 'trip' | 'none';
export type MugenHitAnimationType = 'light' | 'medium' | 'hard' | 'back' | 'up' | 'diagup';
export type MugenFallEnvShake = readonly [time: number, frequency: number, amplitude: number, phase: number];
export interface MugenWidthOverride { readonly edge: readonly [front: number, back: number]; readonly player: readonly [front: number, back: number] }
export interface MugenHitAttributeSlot { readonly allowedAttributes: readonly string[]; readonly remainingTicks: number }
export interface MugenTargetLink { readonly fighterId: string; readonly targetId: number }
export interface MugenTargetBinding { readonly ownerId: string; readonly targetId: number; readonly offset: readonly [number, number]; readonly remainingTicks: number }
export interface MugenHitOverride { readonly attributes: readonly string[]; readonly stateNumber: number; readonly stateDataOwnerId: string; readonly forceAir: boolean; readonly remainingTicks: number }
export interface MugenResolvedReversalDefinition { readonly key: string; readonly stateDataOwnerId: string; readonly attributes: readonly string[]; readonly hitPause: readonly [number, number]; readonly attackerStateNumber: number; readonly defenderStateNumber: number; readonly attackerSpritePriority: number; readonly defenderSpritePriority: number; readonly sparkNumber: number | null; readonly hitSound: readonly [number, number] | null }
export interface MugenActiveReversalDefinition extends MugenResolvedReversalDefinition { readonly activationId: string }
export interface MugenResolvedHitOutput {
  readonly sparkNumber: number | null;
  readonly sparkFromPlayer: boolean;
  readonly guardSparkNumber: number | null;
  readonly guardSparkFromPlayer: boolean;
  readonly sparkPosition: readonly [number, number];
  readonly hitSound: readonly [number, number] | null;
  readonly hitSoundFromPlayer: boolean;
  readonly guardSound: readonly [number, number] | null;
  readonly guardSoundFromPlayer: boolean;
  readonly envShake: readonly [time: number, frequency: number, amplitude: number, phase: number];
  readonly fallEnvShake: readonly [time: number, frequency: number, amplitude: number, phase: number];
  readonly defenderPalette: Readonly<{ time: number; multiply: readonly [number, number, number]; add: readonly [number, number, number] }>;
}

export interface MugenResolvedHitDefinition {
  readonly key: string;
  readonly attributeState: 'S' | 'C' | 'A';
  readonly attackAttribute: MugenAttackAttribute;
  readonly affectTeam: 'B' | 'E' | 'F';
  readonly damage: number;
  readonly guardDamage: number;
  readonly hitFlags: string;
  readonly guardFlags: string;
  readonly groundHitType: MugenGroundHitType;
  readonly airHitType: MugenGroundHitType;
  readonly animationType: MugenHitAnimationType;
  readonly airAnimationType: MugenHitAnimationType;
  readonly fallAnimationType: MugenHitAnimationType;
  readonly priority: number;
  readonly priorityClass: 'hit' | 'miss' | 'dodge';
  readonly hitPause: readonly [attacker: number, defender: number];
  readonly guardPause: readonly [attacker: number, defender: number];
  readonly groundHitTime: number;
  readonly groundSlideTime: number;
  readonly guardSlideTime: number;
  readonly guardHitTime: number;
  readonly airHitTime: number;
  readonly guardControlTime: number;
  readonly airGuardControlTime: number;
  readonly yAcceleration: number;
  readonly groundVelocity: readonly [x: number, y: number];
  readonly airVelocity: readonly [x: number, y: number];
  readonly guardVelocity: readonly [x: number, y: number];
  readonly airGuardVelocity: readonly [x: number, y: number];
  readonly downVelocity: readonly [x: number, y: number];
  readonly downHitTime: number;
  readonly groundCornerPush: number;
  readonly airCornerPush: number;
  readonly downCornerPush: number;
  readonly guardCornerPush: number;
  readonly airGuardCornerPush: number;
  readonly attackerPowerOnHit: number;
  readonly attackerPowerOnGuard: number;
  readonly defenderPowerOnHit: number;
  readonly defenderPowerOnGuard: number;
  readonly guardDistance: number;
  readonly attackerSpritePriority: number;
  readonly defenderSpritePriority: number;
  readonly attackerFacing: number;
  readonly attackerGetDefenderFacing: number;
  readonly defenderFacing: number;
  readonly attackerStateNumber: number;
  readonly defenderStateNumber: number;
  readonly defenderGetsAttackerState: boolean;
  readonly forceStand: boolean;
  readonly fall: boolean;
  readonly airFall: boolean;
  readonly forceNoFall: boolean;
  readonly airJuggle: number;
  readonly snap: readonly [x: number, y: number] | null;
  readonly downBounce: boolean;
  readonly fallVelocity: readonly [x: number, y: number];
  readonly fallRecover: boolean;
  readonly fallRecoverTime: number;
  readonly fallDamage: number;
  readonly fallKill: boolean;
  readonly minimumDistance: readonly [x: number, y: number] | null;
  readonly maximumDistance: readonly [x: number, y: number] | null;
  readonly targetId: number;
  readonly chainId: number;
  readonly noChainIds: readonly [number, number];
  readonly hitOnce: boolean;
  readonly hitCount: number;
  readonly kill: boolean;
  readonly guardKill: boolean;
  readonly output: MugenResolvedHitOutput;
}

export interface MugenActiveHitDefinition extends MugenResolvedHitDefinition {
  readonly activationId: string;
  readonly hitTargets: readonly string[];
}

export interface MugenFighterDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly packageSha256: string;
  readonly maxLife?: number;
  readonly maxPower?: number;
  readonly initialPower?: number;
  readonly spawn: readonly [x: number, y: number];
  readonly facing: MugenFacing;
  readonly initialStateNumber?: number;
  readonly initialActionNumber?: number;
  readonly initialControl?: boolean;
  readonly initialStateType?: MugenStateType;
  readonly initialMoveType?: MugenMoveType;
  readonly initialPhysics?: MugenPhysicsType;
}

export interface MugenMatchConfig {
  readonly seed: string | number;
  readonly roundsToWin?: number;
  readonly roundTimeTicks?: number | null;
  readonly maxEventsPerTick?: number;
  readonly fighters: readonly [MugenFighterDefinition, MugenFighterDefinition];
}

export interface MugenNormalizedFighterDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly packageSha256: string;
  readonly maxLife: number;
  readonly maxPower: number;
  readonly initialPower: number;
  readonly spawn: readonly [x: number, y: number];
  readonly facing: MugenFacing;
  readonly initialStateNumber: number;
  readonly initialActionNumber: number;
  readonly initialControl: boolean;
  readonly initialStateType: MugenStateType;
  readonly initialMoveType: MugenMoveType;
  readonly initialPhysics: MugenPhysicsType;
}

export interface MugenNormalizedMatchConfig {
  readonly schemaVersion: 1;
  readonly tickRateHz: 60;
  readonly seed: string | number;
  readonly roundsToWin: number;
  readonly roundTimeTicks: number | null;
  readonly maxEventsPerTick: number;
  readonly fighters: readonly [MugenNormalizedFighterDefinition, MugenNormalizedFighterDefinition];
}

export interface MugenFighterSnapshot {
  readonly slot: 0 | 1;
  readonly id: string;
  readonly displayName: string;
  readonly packageSha256: string;
  readonly position: readonly [x: number, y: number];
  readonly velocity: readonly [x: number, y: number];
  readonly facing: MugenFacing;
  readonly life: number;
  readonly maxLife: number;
  readonly power: number;
  readonly maxPower: number;
  readonly control: boolean;
  readonly stateNumber: number;
  readonly previousStateNumber: number;
  readonly stateTime: number;
  readonly stateType: MugenStateType;
  readonly moveType: MugenMoveType;
  readonly physics: MugenPhysicsType;
  readonly actionNumber: number;
  readonly actionTime: number;
  readonly stateGeneration: number;
  readonly stateDataOwnerId: string;
  readonly animationOwnerId: string;
  readonly animationElement: number;
  readonly spritePriority: number;
  readonly positionFrozen: boolean;
  readonly widthOverride: MugenWidthOverride;
  readonly juggleCost: number;
  readonly juggleCapacity: number;
  readonly juggleRemaining: number;
  readonly attackMultiplier: number;
  readonly defenseMultiplier: number;
  readonly playerPushEnabled: boolean;
  readonly getHitVelocity: readonly [number, number];
  readonly getHitYAcceleration: number;
  readonly hitFall: boolean;
  readonly hitFallVelocity: readonly [number, number];
  readonly hitFallDamage: number;
  readonly hitFallKill: boolean;
  readonly hitFallRecover: boolean;
  readonly hitFallRecoverTime: number;
  readonly hitFallEnvShake: MugenFallEnvShake;
  readonly hitDownBounce: boolean;
  readonly hitElapsedTicks: number;
  readonly lastHitId: number;
  readonly lastHitAttribute: string;
  readonly integerVariables: readonly number[];
  readonly floatVariables: readonly number[];
  readonly hitPauseTicks: number;
  readonly stunTicks: number;
  readonly stunKind: MugenStunKind | null;
  readonly moveContact: MugenMoveContact;
  readonly moveContactTime: number;
  readonly hitCount: number;
  readonly activeHitDefinition: MugenActiveHitDefinition | null;
  readonly hitAttributeSlots: readonly [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null];
  readonly targets: readonly MugenTargetLink[];
  readonly targetBinding: MugenTargetBinding | null;
  readonly hitOverrides: readonly (MugenHitOverride | null)[];
  readonly activeReversalDefinition: MugenActiveReversalDefinition | null;
  readonly roundsWon: number;
  readonly ko: boolean;
}

export interface MugenMatchSnapshot {
  readonly schemaVersion: 1;
  readonly configHash: string;
  readonly tickRateHz: 60;
  readonly tick: number;
  readonly seed: string | number;
  readonly phase: MugenRoundPhase;
  readonly phaseTime: number;
  readonly roundNumber: number;
  readonly roundsToWin: number;
  readonly roundTimeRemainingTicks: number | null;
  readonly roundWinnerId: string | null;
  readonly roundResultReason: MugenRoundResultReason | null;
  readonly matchWinnerId: string | null;
  readonly randomState: number;
  readonly nextEventSequence: number;
  readonly fighters: readonly [MugenFighterSnapshot, MugenFighterSnapshot];
  readonly hash: string;
}

interface MugenMatchEventBase {
  readonly id: string;
  readonly tick: number;
  readonly sequence: number;
}

export type MugenMatchEventPayload =
  | Readonly<{ kind: 'round-phase'; from: MugenRoundPhase; to: MugenRoundPhase; roundNumber: number }>
  | Readonly<{ kind: 'round-timer-expired'; roundNumber: number }>
  | Readonly<{ kind: 'round-awarded'; roundNumber: number; winnerId: string | null; reason: MugenRoundResultReason; wins: number | null }>
  | Readonly<{ kind: 'round-started'; roundNumber: number }>
  | Readonly<{ kind: 'fighter-kinematics'; fighterId: string; position: readonly [number, number]; velocity: readonly [number, number]; facing: MugenFacing }>
  | Readonly<{ kind: 'fighter-state'; fighterId: string; previousStateNumber: number; stateNumber: number; control: boolean }>
  | Readonly<{ kind: 'fighter-state-metadata'; fighterId: string; stateType: MugenStateType; moveType: MugenMoveType; physics: MugenPhysicsType }>
  | Readonly<{ kind: 'fighter-action'; fighterId: string; previousActionNumber: number; actionNumber: number }>
  | Readonly<{ kind: 'fighter-hitdef'; fighterId: string; activationId: string; active: boolean }>
  | Readonly<{ kind: 'fighter-contact'; fighterId: string; targetId: string; contact: Exclude<MugenMoveContact, 'none'>; hitCount: number }>
  | Readonly<{ kind: 'fighter-hitpause'; fighterId: string; previous: number; current: number }>
  | Readonly<{ kind: 'fighter-stun'; fighterId: string; stunKind: MugenStunKind | null; previous: number; current: number }>
  | Readonly<{ kind: 'fighter-variable'; fighterId: string; variableType: 'integer' | 'float'; index: number; previous: number; current: number }>
  | Readonly<{ kind: 'fighter-life'; fighterId: string; previous: number; current: number; delta: number }>
  | Readonly<{ kind: 'fighter-power'; fighterId: string; previous: number; current: number; delta: number }>
  | Readonly<{ kind: 'audio'; fighterId: string; resourceOwner: 'self' | 'fight'; operation: 'play' | 'stop' | 'pan'; group: number; item: number; channel: number; volume: number; pan: number; frequency: number; loop: boolean; lowPriority: boolean }>;

export type MugenMatchEvent = Readonly<MugenMatchEventBase & MugenMatchEventPayload>;

export interface MugenMatchTickResult {
  readonly tick: number;
  readonly inputHash: string;
  readonly state: MugenMatchSnapshot;
  readonly events: readonly MugenMatchEvent[];
  readonly stateHash: string;
  readonly eventHash: string;
  readonly traceHash: string;
}

interface MutableFighterState {
  readonly definition: MugenNormalizedFighterDefinition;
  readonly slot: 0 | 1;
  positionX: number;
  positionY: number;
  velocityX: number;
  velocityY: number;
  facing: MugenFacing;
  life: number;
  power: number;
  control: boolean;
  stateNumber: number;
  previousStateNumber: number;
  stateTime: number;
  stateType: MugenStateType;
  moveType: MugenMoveType;
  physics: MugenPhysicsType;
  actionNumber: number;
  actionTime: number;
  stateGeneration: number;
  stateDataOwnerId: string;
  animationOwnerId: string;
  animationElement: number;
  spritePriority: number;
  positionFrozen: boolean;
  widthEdgeFront: number;
  widthEdgeBack: number;
  widthPlayerFront: number;
  widthPlayerBack: number;
  juggleCost: number;
  juggleCapacity: number;
  juggleRemaining: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  playerPushEnabled: boolean;
  getHitVelocityX: number;
  getHitVelocityY: number;
  getHitYAcceleration: number;
  hitFall: boolean;
  hitFallVelocityX: number;
  hitFallVelocityY: number;
  hitFallDamage: number;
  hitFallKill: boolean;
  hitFallRecover: boolean;
  hitFallRecoverTime: number;
  hitFallEnvShakeTime: number;
  hitFallEnvShakeFrequency: number;
  hitFallEnvShakeAmplitude: number;
  hitFallEnvShakePhase: number;
  hitDownBounce: boolean;
  hitElapsedTicks: number;
  lastHitId: number;
  lastHitAttribute: string;
  readonly integerVariables: number[];
  readonly floatVariables: number[];
  hitPauseTicks: number;
  stunTicks: number;
  stunKind: MugenStunKind | null;
  moveContact: MugenMoveContact;
  moveContactTime: number;
  hitCount: number;
  activeHitDefinition: MugenActiveHitDefinition | null;
  hitAttributeSlots: [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null];
  targets: MugenTargetLink[];
  targetBinding: MugenTargetBinding | null;
  hitOverrides: (MugenHitOverride | null)[];
  activeReversalDefinition: MugenActiveReversalDefinition | null;
  roundsWon: number;
}

/** Pure-data authoritative owner for a two-fighter 60 Hz match. */
export class MugenHeadlessMatch {
  readonly config: MugenNormalizedMatchConfig;
  readonly configHash: string;
  readonly #events: DeterministicEventQueue;
  readonly #random: DeterministicRandom;
  readonly #fighterById = new Map<string, MutableFighterState>();
  #fighters: [MutableFighterState, MutableFighterState];
  #tick = 0;
  #phase: MugenRoundPhase = 'ready';
  #phaseTime = 0;
  #roundNumber = 1;
  #roundTimeRemainingTicks: number | null;
  #timerFrozen = false;
  #roundWinnerId: string | null = null;
  #roundResultReason: MugenRoundResultReason | null = null;
  #matchWinnerId: string | null = null;
  #openTick = false;
  #inputHash = '';
  readonly #stateChanged = new Set<string>();
  readonly #actionChanged = new Set<string>();
  readonly #stateProcessedAfterChange = new Set<string>();
  readonly #actionProcessedAfterChange = new Set<string>();
  readonly #stunChanged = new Set<string>();
  readonly #contactChanged = new Set<string>();
  #phaseChanged = false;

  constructor(config: MugenMatchConfig) {
    this.config = normalizeMatchConfig(config);
    this.configHash = hashSimulationState(this.config as unknown as SimulationStateValue);
    this.#events = new DeterministicEventQueue(this.config.maxEventsPerTick);
    this.#random = new DeterministicRandom(this.config.seed);
    this.#fighters = this.#createFighters();
    this.#roundTimeRemainingTicks = this.config.roundTimeTicks;
    this.#indexFighters();
  }

  static restore(config: MugenMatchConfig, snapshot: MugenMatchSnapshot): MugenHeadlessMatch {
    const match = new MugenHeadlessMatch(config);
    validateSnapshot(snapshot, match.config);
    if (snapshot.configHash !== match.configHash) throw new TypeError('MUGEN match snapshot config hash does not match the supplied config.');
    if (snapshot.hash !== hashSnapshot(snapshot)) throw new TypeError('MUGEN match snapshot hash is invalid.');
    match.#tick = snapshot.tick;
    match.#phase = snapshot.phase;
    match.#phaseTime = snapshot.phaseTime;
    match.#roundNumber = snapshot.roundNumber;
    match.#roundTimeRemainingTicks = snapshot.roundTimeRemainingTicks;
    match.#roundWinnerId = snapshot.roundWinnerId;
    match.#roundResultReason = snapshot.roundResultReason;
    match.#matchWinnerId = snapshot.matchWinnerId;
    match.#random.restore(snapshot.randomState);
    for (let index = 0; index < 2; index += 1) match.#restoreFighter(match.#fighters[index]!, snapshot.fighters[index]!);
    match.#events.restoreNextSequence(snapshot.nextEventSequence);
    return match;
  }

  get tick(): number { return this.#tick; }
  get phase(): MugenRoundPhase { return this.#phase; }
  get transactionOpen(): boolean { return this.#openTick; }

  beginTick(input: MugenTickInput): this {
    if (this.#openTick) throw new Error('MUGEN match tick transaction is already open.');
    if (!Number.isSafeInteger(input.tick) || input.tick !== this.#tick + 1) throw new RangeError(`MUGEN match tick must advance exactly from ${this.#tick} to ${this.#tick + 1}.`);
    if (!INPUT_HASH.test(input.hash)) throw new TypeError('MUGEN match input hash is invalid.');
    if (input.players.length !== 2 || input.players.some((player, index) => player.playerId !== this.#fighters[index]!.definition.id || player.tick !== input.tick)) {
      throw new TypeError('MUGEN match input players do not match the configured fighter order.');
    }
    this.#tick = input.tick;
    this.#inputHash = input.hash;
    this.#openTick = true;
    this.#stateChanged.clear();
    this.#actionChanged.clear();
    this.#stateProcessedAfterChange.clear();
    this.#actionProcessedAfterChange.clear();
    this.#stunChanged.clear();
    this.#contactChanged.clear();
    this.#phaseChanged = false;
    this.#timerFrozen = false;
    for (const fighter of this.#fighters) {
      fighter.positionFrozen = false;
      fighter.playerPushEnabled = true;
      fighter.widthEdgeFront = 0; fighter.widthEdgeBack = 0; fighter.widthPlayerFront = 0; fighter.widthPlayerBack = 0;
      for (const slot of [0, 1] as const) { const value = fighter.hitAttributeSlots[slot]; if (value !== null && value.remainingTicks > 0) fighter.hitAttributeSlots[slot] = value.remainingTicks === 1 ? null : Object.freeze({ allowedAttributes: value.allowedAttributes, remainingTicks: value.remainingTicks - 1 }); }
      if (fighter.targetBinding !== null && fighter.targetBinding.remainingTicks > 0) fighter.targetBinding = fighter.targetBinding.remainingTicks === 1 ? null : Object.freeze({ ...fighter.targetBinding, remainingTicks: fighter.targetBinding.remainingTicks - 1 });
      for (let slot = 0; slot < fighter.hitOverrides.length; slot += 1) { const value = fighter.hitOverrides[slot]; if (value !== null && value !== undefined && value.remainingTicks > 0) fighter.hitOverrides[slot] = value.remainingTicks === 1 ? null : Object.freeze({ ...value, remainingTicks: value.remainingTicks - 1 }); }
    }
    this.#events.beginTick(input.tick);
    return this;
  }

  endTick(): MugenMatchTickResult {
    this.#assertOpen();
    const paused = this.#timerFrozen || this.#fighters.some(fighter => fighter.hitPauseTicks > 0);
    if (this.#phase === 'fight' && !paused && this.#roundTimeRemainingTicks !== null && this.#roundTimeRemainingTicks > 0) {
      this.#roundTimeRemainingTicks -= 1;
      if (this.#roundTimeRemainingTicks === 0) this.#events.emit({ kind: 'round-timer-expired', roundNumber: this.#roundNumber });
    }
    for (const fighter of this.#fighters) {
      const id = fighter.definition.id;
      if (fighter.hitPauseTicks > 0) fighter.hitPauseTicks -= 1;
      else {
        if (!this.#stateChanged.has(id) || this.#stateProcessedAfterChange.has(id)) fighter.stateTime = incrementTickCounter(fighter.stateTime, 'fighter stateTime');
        if (!this.#actionChanged.has(id) || this.#actionProcessedAfterChange.has(id)) fighter.actionTime = incrementTickCounter(fighter.actionTime, 'fighter actionTime');
        if (fighter.stunTicks > 0 && !this.#stunChanged.has(id)) { fighter.stunTicks -= 1; if (fighter.stunTicks === 0) fighter.stunKind = null; }
        if (fighter.moveContact !== 'none' && !this.#contactChanged.has(id)) fighter.moveContactTime = incrementTickCounter(fighter.moveContactTime, 'fighter moveContactTime');
        if (fighter.moveType === 'H' && fighter.lastHitAttribute !== '') fighter.hitElapsedTicks = incrementTickCounter(fighter.hitElapsedTicks, 'fighter hitElapsedTicks');
      }
    }
    if (!this.#phaseChanged) this.#phaseTime = incrementTickCounter(this.#phaseTime, 'round phaseTime');
    const state = this.snapshot();
    const events = this.#events.endTick();
    const eventHash = hashSimulationState(events as unknown as SimulationStateValue);
    const traceHash = hashSimulationState({ tick: this.#tick, inputHash: this.#inputHash, stateHash: state.hash, eventHash });
    this.#openTick = false;
    const result = Object.freeze({ tick: this.#tick, inputHash: this.#inputHash, state, events, stateHash: state.hash, eventHash, traceHash });
    this.#inputHash = '';
    return result;
  }

  setTimerFrozen(value: boolean): this { this.#assertOpen(); this.#timerFrozen = Boolean(value); return this; }

  snapshot(): MugenMatchSnapshot {
    const fighters = Object.freeze(this.#fighters.map(fighterSnapshot)) as unknown as readonly [MugenFighterSnapshot, MugenFighterSnapshot];
    const base = Object.freeze({
      schemaVersion: 1 as const,
      configHash: this.configHash,
      tickRateHz: 60 as const,
      tick: this.#tick,
      seed: this.config.seed,
      phase: this.#phase,
      phaseTime: this.#phaseTime,
      roundNumber: this.#roundNumber,
      roundsToWin: this.config.roundsToWin,
      roundTimeRemainingTicks: this.#roundTimeRemainingTicks,
      roundWinnerId: this.#roundWinnerId,
      roundResultReason: this.#roundResultReason,
      matchWinnerId: this.#matchWinnerId,
      randomState: this.#random.state,
      nextEventSequence: this.#events.nextSequence,
      fighters,
    });
    return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }

  fighter(id: string): MugenFighterSnapshot { return fighterSnapshot(this.#requireFighter(id)); }

  nextRandomUint32(): number { this.#assertOpen(); return this.#random.nextUint32(); }

  setKinematics(id: string, value: Readonly<{ position?: readonly [number, number]; velocity?: readonly [number, number]; facing?: MugenFacing }>): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const position = value.position === undefined ? [fighter.positionX, fighter.positionY] as const : normalizeVector(value.position, `${id}.position`);
    const velocity = value.velocity === undefined ? [fighter.velocityX, fighter.velocityY] as const : normalizeVector(value.velocity, `${id}.velocity`);
    const facing = value.facing ?? fighter.facing;
    if (facing !== -1 && facing !== 1) throw new TypeError(`${id}.facing must be -1 or 1.`);
    if (position[0] === fighter.positionX && position[1] === fighter.positionY && velocity[0] === fighter.velocityX && velocity[1] === fighter.velocityY && facing === fighter.facing) return this;
    fighter.positionX = position[0]; fighter.positionY = position[1]; fighter.velocityX = velocity[0]; fighter.velocityY = velocity[1]; fighter.facing = facing;
    this.#events.emit({ kind: 'fighter-kinematics', fighterId: id, position: Object.freeze([...position]) as readonly [number, number], velocity: Object.freeze([...velocity]) as readonly [number, number], facing });
    return this;
  }

  setFighterState(id: string, stateNumber: number, control?: boolean): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const normalizedState = int32(stateNumber, `${id}.stateNumber`);
    const normalizedControl = control ?? fighter.control;
    if (typeof normalizedControl !== 'boolean') throw new TypeError(`${id}.control must be boolean.`);
    if (fighter.stateNumber === normalizedState && fighter.control === normalizedControl) return this;
    const previousStateNumber = fighter.stateNumber;
    if (fighter.stateNumber !== normalizedState) {
      fighter.previousStateNumber = previousStateNumber; fighter.stateNumber = normalizedState; fighter.stateTime = 0; fighter.stateGeneration = incrementTickCounter(fighter.stateGeneration, `${id}.stateGeneration`); this.#stateChanged.add(id); this.#stateProcessedAfterChange.delete(id);
      this.#clearHitDefinition(fighter); fighter.activeReversalDefinition = null; fighter.moveContact = 'none'; fighter.moveContactTime = 0; fighter.hitCount = 0; this.#contactChanged.add(id);
    }
    fighter.control = normalizedControl;
    this.#events.emit({ kind: 'fighter-state', fighterId: id, previousStateNumber, stateNumber: normalizedState, control: normalizedControl });
    return this;
  }

  changeFighterState(id: string, stateNumber: number, control?: boolean, options: Readonly<{ stateDataOwnerId?: string; preserveHitDefinition?: boolean; preserveMoveContact?: boolean; preserveHitCount?: boolean }> = {}): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id); const normalizedState = int32(stateNumber, `${id}.stateNumber`); const normalizedControl = control ?? fighter.control;
    if (typeof normalizedControl !== 'boolean') throw new TypeError(`${id}.control must be boolean.`);
    const owner = options.stateDataOwnerId ?? fighter.stateDataOwnerId; this.#requireFighter(owner);
    const previousStateNumber = fighter.stateNumber; fighter.previousStateNumber = previousStateNumber; fighter.stateNumber = normalizedState; fighter.stateTime = 0; fighter.stateGeneration = incrementTickCounter(fighter.stateGeneration, `${id}.stateGeneration`); this.#stateChanged.add(id); this.#stateProcessedAfterChange.delete(id);
    fighter.stateDataOwnerId = owner;
    if (!options.preserveHitDefinition) this.#clearHitDefinition(fighter);
    fighter.activeReversalDefinition = null;
    if (!options.preserveMoveContact) { fighter.moveContact = 'none'; fighter.moveContactTime = 0; this.#contactChanged.add(id); }
    if (!options.preserveHitCount) fighter.hitCount = 0;
    fighter.control = normalizedControl;
    this.#events.emit({ kind: 'fighter-state', fighterId: id, previousStateNumber, stateNumber: normalizedState, control: normalizedControl }); return this;
  }

  applyStateEntryResets(id: string, preserveHitDefinition: boolean, preserveMoveContact: boolean, preserveHitCount: boolean): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id);
    if (!preserveHitDefinition) this.#clearHitDefinition(fighter);
    if (!preserveMoveContact) { fighter.moveContact = 'none'; fighter.moveContactTime = 0; this.#contactChanged.add(id); }
    if (!preserveHitCount) fighter.hitCount = 0;
    return this;
  }

  markFighterStateProcessed(id: string): this { this.#assertOpen(); this.#requireFighter(id); this.#stateProcessedAfterChange.add(id); this.#actionProcessedAfterChange.add(id); return this; }

  setFighterStateMetadata(id: string, value: Readonly<{ stateType?: MugenStateType; moveType?: MugenMoveType; physics?: MugenPhysicsType }>): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const stateType = value.stateType ?? fighter.stateType;
    const moveType = value.moveType ?? fighter.moveType;
    const physics = value.physics ?? fighter.physics;
    if (!STATE_TYPES.has(stateType) || !MOVE_TYPES.has(moveType) || !PHYSICS_TYPES.has(physics)) throw new TypeError(`${id} state metadata is invalid.`);
    if (stateType === fighter.stateType && moveType === fighter.moveType && physics === fighter.physics) return this;
    fighter.stateType = stateType; fighter.moveType = moveType; fighter.physics = physics;
    this.#events.emit({ kind: 'fighter-state-metadata', fighterId: id, stateType, moveType, physics });
    return this;
  }

  setFighterAction(id: string, actionNumber: number, element = 1, ownerId = id): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const normalized = int32(actionNumber, `${id}.actionNumber`);
    const normalizedElement = integerRange(element, 1, INT32_MAX, `${id}.animationElement`); this.#requireFighter(ownerId);
    if (fighter.actionNumber === normalized && fighter.animationElement === normalizedElement && fighter.animationOwnerId === ownerId) return this;
    const previousActionNumber = fighter.actionNumber;
    fighter.actionNumber = normalized; fighter.animationElement = normalizedElement; fighter.animationOwnerId = ownerId;
    fighter.actionTime = 0;
    this.#actionChanged.add(id); this.#actionProcessedAfterChange.delete(id);
    this.#events.emit({ kind: 'fighter-action', fighterId: id, previousActionNumber, actionNumber: normalized });
    return this;
  }

  setSpritePriority(id: string, value: number): this { this.#assertOpen(); this.#requireFighter(id).spritePriority = integerRange(value, -5, 5, `${id}.spritePriority`); return this; }
  setPositionFrozen(id: string, value: boolean): this { this.#assertOpen(); this.#requireFighter(id).positionFrozen = booleanValue(value, `${id}.positionFrozen`); return this; }
  setWidthOverride(id: string, edge: readonly [number, number], player: readonly [number, number]): this { this.#assertOpen(); const fighter = this.#requireFighter(id); const normalizedEdge = normalizeNonNegativePair(edge, `${id}.width.edge`); const normalizedPlayer = normalizeNonNegativePair(player, `${id}.width.player`); fighter.widthEdgeFront = normalizedEdge[0]; fighter.widthEdgeBack = normalizedEdge[1]; fighter.widthPlayerFront = normalizedPlayer[0]; fighter.widthPlayerBack = normalizedPlayer[1]; return this; }
  setJuggleCost(id: string, value: number): this { this.#assertOpen(); this.#requireFighter(id).juggleCost = int32(value, `${id}.juggleCost`); return this; }
  setJugglePool(id: string, capacity: number, remaining = capacity): this { this.#assertOpen(); const fighter = this.#requireFighter(id); fighter.juggleCapacity = integerRange(capacity, 0, 1_000_000, `${id}.juggleCapacity`); fighter.juggleRemaining = integerRange(remaining, 0, fighter.juggleCapacity, `${id}.juggleRemaining`); return this; }
  setJuggleRemaining(id: string, value: number): this { this.#assertOpen(); const fighter = this.#requireFighter(id); fighter.juggleRemaining = integerRange(value, 0, fighter.juggleCapacity, `${id}.juggleRemaining`); return this; }
  setAttackDistance(id: string, value: number): this { this.#assertOpen(); const fighter = this.#requireFighter(id); if (fighter.activeHitDefinition === null) return this; const guardDistance = integerRange(value, -1, INT32_MAX, `${id}.attackDistance`); fighter.activeHitDefinition = Object.freeze({ ...fighter.activeHitDefinition, guardDistance }); return this; }
  setDamageMultipliers(id: string, value: Readonly<{ attack?: number; defense?: number }>): this { this.#assertOpen(); const fighter = this.#requireFighter(id); if (value.attack !== undefined) fighter.attackMultiplier = multiplier(value.attack, `${id}.attackMultiplier`); if (value.defense !== undefined) fighter.defenseMultiplier = multiplier(value.defense, `${id}.defenseMultiplier`); return this; }
  addHitCount(id: string, value: number): this { this.#assertOpen(); const fighter = this.#requireFighter(id); fighter.hitCount = integerRange(fighter.hitCount + int32(value, `${id}.hitAdd`), 0, Number.MAX_SAFE_INTEGER, `${id}.hitCount`); return this; }
  setPlayerPushEnabled(id: string, value: boolean): this { this.#assertOpen(); this.#requireFighter(id).playerPushEnabled = booleanValue(value, `${id}.playerPushEnabled`); return this; }
  setGetHitData(id: string, value: Readonly<{ velocity: readonly [number, number]; yAcceleration: number; fall: boolean; fallVelocity: readonly [number, number]; fallDamage: number; fallKill: boolean; fallRecover: boolean; fallRecoverTime: number; fallEnvShake: MugenFallEnvShake; downBounce: boolean; hitId: number; attribute: string }>): this { this.#assertOpen(); const fighter = this.#requireFighter(id); const velocity = normalizeVector(value.velocity, `${id}.getHitVelocity`); const fallVelocity = normalizeVector(value.fallVelocity, `${id}.hitFallVelocity`); const fallEnvShake = normalizeFallEnvShake(value.fallEnvShake, `${id}.hitFallEnvShake`); fighter.getHitVelocityX = velocity[0]; fighter.getHitVelocityY = velocity[1]; fighter.getHitYAcceleration = finiteF32(value.yAcceleration, `${id}.getHitYAcceleration`); fighter.hitFall = booleanValue(value.fall, `${id}.hitFall`); fighter.hitFallVelocityX = fallVelocity[0]; fighter.hitFallVelocityY = fallVelocity[1]; fighter.hitFallDamage = integerRange(value.fallDamage, 0, INT32_MAX, `${id}.hitFallDamage`); fighter.hitFallKill = booleanValue(value.fallKill, `${id}.hitFallKill`); fighter.hitFallRecover = booleanValue(value.fallRecover, `${id}.hitFallRecover`); fighter.hitFallRecoverTime = integerRange(value.fallRecoverTime, 0, 3_600, `${id}.hitFallRecoverTime`); [fighter.hitFallEnvShakeTime, fighter.hitFallEnvShakeFrequency, fighter.hitFallEnvShakeAmplitude, fighter.hitFallEnvShakePhase] = fallEnvShake; fighter.hitDownBounce = booleanValue(value.downBounce, `${id}.hitDownBounce`); fighter.hitElapsedTicks = 0; fighter.lastHitId = int32(value.hitId, `${id}.lastHitId`); if (!HIT_ATTRIBUTE_KEYS.has(value.attribute)) throw new TypeError(`${id}.lastHitAttribute is invalid.`); fighter.lastHitAttribute = value.attribute; return this; }
  setHitFall(id: string, value: Readonly<{ fall?: boolean; xVelocity?: number; yVelocity?: number }>): this { this.#assertOpen(); const fighter = this.#requireFighter(id); if (value.fall !== undefined) fighter.hitFall = booleanValue(value.fall, `${id}.hitFall`); if (value.xVelocity !== undefined) fighter.hitFallVelocityX = finiteF32(value.xVelocity, `${id}.hitFallVelocity.x`); if (value.yVelocity !== undefined) fighter.hitFallVelocityY = finiteF32(value.yVelocity, `${id}.hitFallVelocity.y`); return this; }

  activateHitDefinition(id: string, definition: MugenResolvedHitDefinition): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const normalized = normalizeHitDefinition(definition, `${id}.hitDefinition`);
    const activationId = `${id}:${fighter.stateGeneration}:${normalized.key}`;
    if (fighter.activeHitDefinition?.activationId === activationId) return this;
    fighter.activeHitDefinition = Object.freeze({ ...normalized, activationId, hitTargets: Object.freeze([]) });
    this.#events.emit({ kind: 'fighter-hitdef', fighterId: id, activationId, active: true });
    return this;
  }

  clearHitDefinition(id: string): this { this.#assertOpen(); this.#clearHitDefinition(this.#requireFighter(id)); return this; }

  markHitTarget(id: string, targetId: string): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id); this.#requireFighter(targetId);
    const active = fighter.activeHitDefinition;
    if (!active) throw new Error(`${id} has no active MUGEN HitDef.`);
    if (!active.hitTargets.includes(targetId)) fighter.activeHitDefinition = Object.freeze({ ...active, hitTargets: Object.freeze([...active.hitTargets, targetId].sort()) });
    this.registerTarget(id, targetId, active.targetId);
    return this;
  }

  markExternalHitTarget(id: string, targetEntityId: string): this { this.#assertOpen(); const fighter = this.#requireFighter(id); const active = fighter.activeHitDefinition; if (!active) throw new Error(`${id} has no active MUGEN HitDef.`); if (typeof targetEntityId !== 'string' || targetEntityId === '' || targetEntityId === id) throw new TypeError('MUGEN external hit target id is invalid.'); if (!active.hitTargets.includes(targetEntityId)) fighter.activeHitDefinition = Object.freeze({ ...active, hitTargets: Object.freeze([...active.hitTargets, targetEntityId].sort()) }); return this; }

  registerTarget(id: string, targetFighterId: string, targetId: number): this { this.#assertOpen(); const fighter = this.#requireFighter(id); this.#requireFighter(targetFighterId); if (id === targetFighterId) throw new TypeError('MUGEN fighter cannot target itself.'); const link = normalizeTargetLink({ fighterId: targetFighterId, targetId }, `${id}.target`); fighter.targets.splice(0, fighter.targets.length, ...[...fighter.targets.filter(value => value.fighterId !== targetFighterId), link].sort((left, right) => left.fighterId.localeCompare(right.fighterId))); return this; }

  dropTargets(id: string, excludeTargetId = -1, keepOne = true): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id); const normalizedId = int32(excludeTargetId, `${id}.excludeTargetId`); booleanValue(keepOne, `${id}.keepOne`);
    const eligible = normalizedId === -1 ? [] : fighter.targets.filter(value => value.targetId === normalizedId);
    const kept = keepOne && eligible.length > 1 ? [eligible[this.nextRandomUint32() % eligible.length]!] : eligible;
    const keptIds = new Set(kept.map(value => value.fighterId)); for (const target of fighter.targets) if (!keptIds.has(target.fighterId)) { const targetState = this.#requireFighter(target.fighterId); if (targetState.targetBinding?.ownerId === id) targetState.targetBinding = null; }
    fighter.targets.splice(0, fighter.targets.length, ...kept); return this;
  }

  releaseTarget(id: string): this {
    this.#assertOpen(); const target = this.#requireFighter(id);
    for (const owner of this.#fighters) {
      const retained = owner.targets.filter(value => value.fighterId !== id);
      if (retained.length !== owner.targets.length) owner.targets.splice(0, owner.targets.length, ...retained);
      if (target.targetBinding?.ownerId === owner.definition.id) target.targetBinding = null;
    }
    return this;
  }

  setTargetBinding(ownerId: string, fighterId: string, targetId: number, offset: readonly [number, number], remainingTicks: number): this {
    this.#assertOpen(); this.#requireFighter(ownerId); const fighter = this.#requireFighter(fighterId); const normalizedTicks = integerRange(remainingTicks, -1, 3_600, `${fighterId}.targetBinding.remainingTicks`);
    fighter.targetBinding = normalizedTicks === 0 ? null : Object.freeze({ ownerId, targetId: int32(targetId, `${fighterId}.targetBinding.targetId`), offset: normalizeVector(offset, `${fighterId}.targetBinding.offset`), remainingTicks: normalizedTicks }); return this;
  }

  setHitAttributeSlot(id: string, slot: 0 | 1, allowedAttributes: readonly string[], remainingTicks: number): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id); const normalizedSlot = integerRange(slot, 0, 1, `${id}.hitAttributeSlot`) as 0 | 1;
    fighter.hitAttributeSlots[normalizedSlot] = remainingTicks === 0 ? null : normalizeHitAttributeSlot({ allowedAttributes, remainingTicks }, `${id}.hitAttributeSlots[${slot}]`);
    return this;
  }

  setHitOverride(id: string, slot: number, value: Readonly<{ attributes: readonly string[]; stateNumber: number; stateDataOwnerId: string; forceAir: boolean; remainingTicks: number }>): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id); const normalizedSlot = integerRange(slot, 0, 7, `${id}.hitOverride.slot`); this.#requireFighter(value.stateDataOwnerId);
    fighter.hitOverrides[normalizedSlot] = value.remainingTicks === 0 || value.attributes.length === 0 ? null : normalizeHitOverride(value, `${id}.hitOverrides[${slot}]`); return this;
  }

  activateReversalDefinition(id: string, definition: MugenResolvedReversalDefinition | null): this { this.#assertOpen(); const fighter = this.#requireFighter(id); if (definition === null || definition.attributes.length === 0) { fighter.activeReversalDefinition = null; return this; } const normalized = normalizeReversalDefinition(definition, `${id}.reversalDefinition`); this.#requireFighter(normalized.stateDataOwnerId); fighter.activeReversalDefinition = Object.freeze({ ...normalized, activationId: `${id}:${fighter.stateGeneration}:${normalized.key}` }); return this; }

  setMoveContact(id: string, targetId: string, contact: Exclude<MugenMoveContact, 'none'>, hitCount = 1): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id); this.#requireFighter(targetId);
    if (contact !== 'hit' && contact !== 'guarded' && contact !== 'reversed') throw new TypeError('MUGEN move contact must be hit, guarded or reversed.');
    fighter.moveContact = contact; fighter.moveContactTime = 0; if (contact === 'hit') fighter.hitCount = integerRange(fighter.hitCount + integerRange(hitCount, 0, INT32_MAX, `${id}.contactHitCount`), 0, Number.MAX_SAFE_INTEGER, `${id}.hitCount`);
    this.#contactChanged.add(id); this.#events.emit({ kind: 'fighter-contact', fighterId: id, targetId, contact, hitCount: fighter.hitCount });
    return this;
  }

  setExternalMoveContact(id: string, targetEntityId: string, contact: Exclude<MugenMoveContact, 'none'>, hitCount = 1): this { this.#assertOpen(); const fighter = this.#requireFighter(id); if (typeof targetEntityId !== 'string' || targetEntityId === '' || targetEntityId === id) throw new TypeError('MUGEN external contact target id is invalid.'); if (contact !== 'hit' && contact !== 'guarded' && contact !== 'reversed') throw new TypeError('MUGEN move contact must be hit, guarded or reversed.'); fighter.moveContact = contact; fighter.moveContactTime = 0; if (contact === 'hit') fighter.hitCount = integerRange(fighter.hitCount + integerRange(hitCount, 0, INT32_MAX, `${id}.contactHitCount`), 0, Number.MAX_SAFE_INTEGER, `${id}.hitCount`); this.#contactChanged.add(id); this.#events.emit({ kind: 'fighter-contact', fighterId: id, targetId: targetEntityId, contact, hitCount: fighter.hitCount }); return this; }

  resetMoveContact(id: string): this { this.#assertOpen(); const fighter = this.#requireFighter(id); fighter.moveContact = 'none'; fighter.moveContactTime = 0; this.#contactChanged.add(id); return this; }

  setHitPause(id: string, ticks: number): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id); const current = integerRange(ticks, 0, 600, `${id}.hitPauseTicks`); const previous = fighter.hitPauseTicks;
    if (previous === current) return this; fighter.hitPauseTicks = current; this.#events.emit({ kind: 'fighter-hitpause', fighterId: id, previous, current }); return this;
  }

  setStun(id: string, stunKind: MugenStunKind | null, ticks: number): this {
    this.#assertOpen(); const fighter = this.#requireFighter(id); const current = integerRange(ticks, 0, 3_600, `${id}.stunTicks`); if (current === 0) stunKind = null;
    if (stunKind !== null && stunKind !== 'hit' && stunKind !== 'guard') throw new TypeError(`${id}.stunKind is invalid.`);
    const previous = fighter.stunTicks; if (previous === current && fighter.stunKind === stunKind) return this;
    fighter.stunTicks = current; fighter.stunKind = stunKind; this.#stunChanged.add(id); this.#events.emit({ kind: 'fighter-stun', fighterId: id, stunKind, previous, current }); return this;
  }

  setLife(id: string, life: number): this { return this.#setGauge(id, 'life', integerRange(life, 0, this.#requireFighter(id).definition.maxLife, `${id}.life`)); }
  addLife(id: string, delta: number): this { const fighter = this.#requireFighter(id); return this.#setGauge(id, 'life', clamp(fighter.life + int32(delta, `${id}.lifeDelta`), 0, fighter.definition.maxLife)); }
  setPower(id: string, power: number): this { return this.#setGauge(id, 'power', integerRange(power, 0, this.#requireFighter(id).definition.maxPower, `${id}.power`)); }

  emitAudio(id: string, operation: 'play' | 'stop' | 'pan', value: Readonly<{ group?: number; item?: number; channel: number; volume?: number; pan?: number; frequency?: number; loop?: boolean; lowPriority?: boolean; resourceOwner?: 'self' | 'fight' }>): this {
    this.#assertOpen(); this.#requireFighter(id); const channel = integerRange(value.channel, -1, 255, 'audio.channel'); const group = integerRange(value.group ?? -1, -1, 32_767, 'audio.group'); const item = integerRange(value.item ?? -1, -1, 32_767, 'audio.item'); const volume = finiteRange(value.volume ?? 255, 0, 255, 'audio.volume'); const rawPan = value.pan ?? 0; if (!Number.isFinite(rawPan)) throw new RangeError('audio.pan must be finite.'); const pan = clamp(rawPan, -127, 127); const frequency = finiteRange(value.frequency ?? 1, 0.125, 8, 'audio.frequency');
    if (operation === 'play' && (group < 0 || item < 0)) throw new RangeError('MUGEN PlaySnd requires a non-negative group/item key.');
    this.#events.emit({ kind: 'audio', fighterId: id, resourceOwner: value.resourceOwner ?? 'self', operation, group, item, channel, volume: Math.fround(volume), pan: Math.fround(pan), frequency: Math.fround(frequency), loop: value.loop ?? false, lowPriority: value.lowPriority ?? false }); return this;
  }
  addPower(id: string, delta: number): this { const fighter = this.#requireFighter(id); return this.#setGauge(id, 'power', clamp(fighter.power + int32(delta, `${id}.powerDelta`), 0, fighter.definition.maxPower)); }
  setIntegerVariable(id: string, index: number, value: number): this { return this.#setVariable(id, 'integer', integerRange(index, 0, INTEGER_VARIABLE_COUNT - 1, `${id}.varIndex`), int32(value, `${id}.var(${index})`)); }
  addIntegerVariable(id: string, index: number, delta: number): this { const fighter = this.#requireFighter(id); const normalizedIndex = integerRange(index, 0, INTEGER_VARIABLE_COUNT - 1, `${id}.varIndex`); return this.#setVariable(id, 'integer', normalizedIndex, checkedInt32Add(fighter.integerVariables[normalizedIndex]!, delta, `${id}.var(${index})`)); }
  setFloatVariable(id: string, index: number, value: number): this { return this.#setVariable(id, 'float', integerRange(index, 0, FLOAT_VARIABLE_COUNT - 1, `${id}.fvarIndex`), finiteScriptFloat(value, `${id}.fvar(${index})`)); }
  addFloatVariable(id: string, index: number, delta: number): this { const fighter = this.#requireFighter(id); const normalizedIndex = integerRange(index, 0, FLOAT_VARIABLE_COUNT - 1, `${id}.fvarIndex`); return this.#setVariable(id, 'float', normalizedIndex, finiteScriptFloat(fighter.floatVariables[normalizedIndex]! + finiteScriptFloat(delta, `${id}.fvarDelta`), `${id}.fvar(${index})`)); }

  startFight(): this {
    this.#assertOpen();
    if (this.#phase !== 'ready') throw new Error(`MUGEN match cannot start fight from ${this.#phase}.`);
    return this.#transitionPhase('fight');
  }

  declareKo(winnerId: string | null): this {
    this.#assertOpen();
    if (this.#phase !== 'fight') throw new Error(`MUGEN match cannot declare KO from ${this.#phase}.`);
    this.#roundWinnerId = this.#normalizeWinner(winnerId);
    this.#roundResultReason = 'ko';
    return this.#transitionPhase('ko');
  }

  completeKo(): this {
    this.#assertOpen();
    if (this.#phase !== 'ko' || this.#roundResultReason !== 'ko') throw new Error('MUGEN match has no KO result to complete.');
    return this.#awardRoundAndFinishPhase();
  }

  resolveRound(winnerId: string | null, reason: 'time-over' | 'draw'): this {
    this.#assertOpen();
    if (this.#phase !== 'fight') throw new Error(`MUGEN match cannot resolve round from ${this.#phase}.`);
    if (reason !== 'time-over' && reason !== 'draw') throw new TypeError(`MUGEN round result reason ${String(reason)} is invalid.`);
    const winner = this.#normalizeWinner(winnerId);
    if (reason === 'draw' && winner !== null) throw new TypeError('MUGEN draw result cannot name a winner.');
    this.#roundWinnerId = winner;
    this.#roundResultReason = reason;
    return this.#awardRoundAndFinishPhase();
  }

  startNextRound(): this {
    this.#assertOpen();
    if (this.#phase !== 'round-over') throw new Error(`MUGEN match cannot start next round from ${this.#phase}.`);
    this.#roundNumber = incrementTickCounter(this.#roundNumber, 'roundNumber');
    this.#roundWinnerId = null;
    this.#roundResultReason = null;
    this.#roundTimeRemainingTicks = this.config.roundTimeTicks;
    for (const fighter of this.#fighters) this.#resetFighterForRound(fighter);
    this.#transitionPhase('ready');
    this.#events.emit({ kind: 'round-started', roundNumber: this.#roundNumber });
    return this;
  }

  reset(): this {
    this.#fighters = this.#createFighters();
    this.#fighterById.clear(); this.#indexFighters();
    this.#tick = 0; this.#phase = 'ready'; this.#phaseTime = 0; this.#roundNumber = 1;
    this.#roundTimeRemainingTicks = this.config.roundTimeTicks;
    this.#roundWinnerId = null; this.#roundResultReason = null; this.#matchWinnerId = null;
    this.#openTick = false; this.#inputHash = ''; this.#stateChanged.clear(); this.#actionChanged.clear(); this.#stateProcessedAfterChange.clear(); this.#actionProcessedAfterChange.clear(); this.#stunChanged.clear(); this.#contactChanged.clear(); this.#phaseChanged = false;
    this.#events.reset(); this.#random.reset();
    return this;
  }

  #setGauge(id: string, gauge: 'life' | 'power', current: number): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const previous = fighter[gauge];
    if (previous === current) return this;
    fighter[gauge] = current;
    this.#events.emit({ kind: gauge === 'life' ? 'fighter-life' : 'fighter-power', fighterId: id, previous, current, delta: current - previous } as MugenMatchEventPayload);
    return this;
  }

  #setVariable(id: string, variableType: 'integer' | 'float', index: number, current: number): this {
    this.#assertOpen();
    const fighter = this.#requireFighter(id);
    const variables = variableType === 'integer' ? fighter.integerVariables : fighter.floatVariables;
    const previous = variables[index]!;
    if (previous === current) return this;
    variables[index] = current;
    this.#events.emit({ kind: 'fighter-variable', fighterId: id, variableType, index, previous, current });
    return this;
  }

  #clearHitDefinition(fighter: MutableFighterState): void { const active = fighter.activeHitDefinition; if (!active) return; fighter.activeHitDefinition = null; this.#events.emit({ kind: 'fighter-hitdef', fighterId: fighter.definition.id, activationId: active.activationId, active: false }); }

  #awardRoundAndFinishPhase(): this {
    const winner = this.#roundWinnerId === null ? null : this.#requireFighter(this.#roundWinnerId);
    if (winner !== null) winner.roundsWon = integerRange(winner.roundsWon + 1, 0, this.config.roundsToWin, `${winner.definition.id}.roundsWon`);
    this.#events.emit({ kind: 'round-awarded', roundNumber: this.#roundNumber, winnerId: winner?.definition.id ?? null, reason: this.#roundResultReason!, wins: winner?.roundsWon ?? null });
    if (winner !== null && winner.roundsWon >= this.config.roundsToWin) { this.#matchWinnerId = winner.definition.id; return this.#transitionPhase('match-over'); }
    return this.#transitionPhase('round-over');
  }

  #transitionPhase(to: MugenRoundPhase): this {
    const from = this.#phase;
    if (from === to) return this;
    this.#phase = to;
    this.#phaseTime = 0;
    this.#phaseChanged = true;
    this.#events.emit({ kind: 'round-phase', from, to, roundNumber: this.#roundNumber });
    return this;
  }

  #normalizeWinner(id: string | null): string | null { if (id === null) return null; return this.#requireFighter(id).definition.id; }
  #assertOpen(): void { if (!this.#openTick) throw new Error('MUGEN match mutation requires an open tick transaction.'); }
  #requireFighter(id: string): MutableFighterState { const fighter = this.#fighterById.get(id); if (!fighter) throw new TypeError(`Unknown MUGEN fighter id: ${id}.`); return fighter; }
  #indexFighters(): void { for (const fighter of this.#fighters) this.#fighterById.set(fighter.definition.id, fighter); }
  #createFighters(): [MutableFighterState, MutableFighterState] { return [createMutableFighter(this.config.fighters[0], 0), createMutableFighter(this.config.fighters[1], 1)]; }
  #resetFighterForRound(fighter: MutableFighterState): void {
    fighter.positionX = fighter.definition.spawn[0]; fighter.positionY = fighter.definition.spawn[1]; fighter.velocityX = 0; fighter.velocityY = 0;
    fighter.facing = fighter.definition.facing; fighter.life = fighter.definition.maxLife; fighter.control = fighter.definition.initialControl;
    fighter.stateNumber = fighter.definition.initialStateNumber; fighter.previousStateNumber = fighter.definition.initialStateNumber; fighter.stateTime = 0; fighter.actionNumber = fighter.definition.initialActionNumber; fighter.actionTime = 0;
    fighter.stateType = fighter.definition.initialStateType; fighter.moveType = fighter.definition.initialMoveType; fighter.physics = fighter.definition.initialPhysics;
    fighter.stateGeneration = 0; fighter.stateDataOwnerId = fighter.definition.id; fighter.animationOwnerId = fighter.definition.id; fighter.animationElement = 1; fighter.spritePriority = 0; fighter.positionFrozen = false; fighter.widthEdgeFront = 0; fighter.widthEdgeBack = 0; fighter.widthPlayerFront = 0; fighter.widthPlayerBack = 0; fighter.juggleCost = 0; fighter.juggleCapacity = 15; fighter.juggleRemaining = 15; fighter.attackMultiplier = 1; fighter.defenseMultiplier = 1; fighter.playerPushEnabled = true; fighter.getHitVelocityX = 0; fighter.getHitVelocityY = 0; fighter.getHitYAcceleration = 0; fighter.hitFall = false; fighter.hitFallVelocityX = 0; fighter.hitFallVelocityY = -4.5; fighter.hitFallDamage = 0; fighter.hitFallKill = true; fighter.hitFallRecover = true; fighter.hitFallRecoverTime = 4; fighter.hitFallEnvShakeTime = 0; fighter.hitFallEnvShakeFrequency = 60; fighter.hitFallEnvShakeAmplitude = -4; fighter.hitFallEnvShakePhase = 0; fighter.hitDownBounce = false; fighter.hitElapsedTicks = 0; fighter.lastHitId = 0; fighter.lastHitAttribute = ''; fighter.hitPauseTicks = 0; fighter.stunTicks = 0; fighter.stunKind = null; fighter.moveContact = 'none'; fighter.moveContactTime = 0; fighter.hitCount = 0; fighter.activeHitDefinition = null; fighter.hitAttributeSlots = [null, null]; fighter.targets = []; fighter.targetBinding = null; fighter.hitOverrides = Array.from({ length: 8 }, () => null); fighter.activeReversalDefinition = null;
    this.#stateChanged.add(fighter.definition.id); this.#actionChanged.add(fighter.definition.id);
  }
  #restoreFighter(target: MutableFighterState, source: MugenFighterSnapshot): void {
    target.positionX = source.position[0]; target.positionY = source.position[1]; target.velocityX = source.velocity[0]; target.velocityY = source.velocity[1];
    target.facing = source.facing; target.life = source.life; target.power = source.power; target.control = source.control;
    target.stateNumber = source.stateNumber; target.previousStateNumber = source.previousStateNumber; target.stateTime = source.stateTime; target.stateType = source.stateType; target.moveType = source.moveType; target.physics = source.physics;
    target.actionNumber = source.actionNumber; target.actionTime = source.actionTime; target.stateGeneration = source.stateGeneration; target.stateDataOwnerId = source.stateDataOwnerId; target.animationOwnerId = source.animationOwnerId; target.animationElement = source.animationElement; target.spritePriority = source.spritePriority; target.positionFrozen = source.positionFrozen; target.widthEdgeFront = source.widthOverride.edge[0]; target.widthEdgeBack = source.widthOverride.edge[1]; target.widthPlayerFront = source.widthOverride.player[0]; target.widthPlayerBack = source.widthOverride.player[1]; target.juggleCost = source.juggleCost; target.juggleCapacity = source.juggleCapacity; target.juggleRemaining = source.juggleRemaining; target.attackMultiplier = multiplier(source.attackMultiplier, `${source.id}.attackMultiplier`); target.defenseMultiplier = multiplier(source.defenseMultiplier, `${source.id}.defenseMultiplier`); target.playerPushEnabled = booleanValue(source.playerPushEnabled, `${source.id}.playerPushEnabled`); target.getHitVelocityX = source.getHitVelocity[0]; target.getHitVelocityY = source.getHitVelocity[1]; target.getHitYAcceleration = finiteF32(source.getHitYAcceleration, `${source.id}.getHitYAcceleration`); target.hitFall = booleanValue(source.hitFall, `${source.id}.hitFall`); target.hitFallVelocityX = source.hitFallVelocity[0]; target.hitFallVelocityY = source.hitFallVelocity[1]; target.hitFallDamage = source.hitFallDamage; target.hitFallKill = booleanValue(source.hitFallKill, `${source.id}.hitFallKill`); target.hitFallRecover = booleanValue(source.hitFallRecover, `${source.id}.hitFallRecover`); target.hitFallRecoverTime = source.hitFallRecoverTime; [target.hitFallEnvShakeTime, target.hitFallEnvShakeFrequency, target.hitFallEnvShakeAmplitude, target.hitFallEnvShakePhase] = source.hitFallEnvShake; target.hitDownBounce = booleanValue(source.hitDownBounce, `${source.id}.hitDownBounce`); target.hitElapsedTicks = source.hitElapsedTicks; target.lastHitId = source.lastHitId; target.lastHitAttribute = source.lastHitAttribute; target.roundsWon = source.roundsWon;
    target.hitPauseTicks = source.hitPauseTicks; target.stunTicks = source.stunTicks; target.stunKind = source.stunKind; target.moveContact = source.moveContact; target.moveContactTime = source.moveContactTime; target.hitCount = source.hitCount; target.activeHitDefinition = source.activeHitDefinition === null ? null : normalizeActiveHitDefinition(source.activeHitDefinition, `${source.id}.activeHitDefinition`); target.hitAttributeSlots = source.hitAttributeSlots.map((value, slot) => value === null ? null : normalizeHitAttributeSlot(value, `${source.id}.hitAttributeSlots[${slot}]`)) as [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null]; target.targets = source.targets.map((value, index) => normalizeTargetLink(value, `${source.id}.targets[${index}]`)); target.targetBinding = source.targetBinding === null ? null : normalizeTargetBinding(source.targetBinding, `${source.id}.targetBinding`); target.hitOverrides = source.hitOverrides.map((value, slot) => value === null ? null : normalizeHitOverride(value, `${source.id}.hitOverrides[${slot}]`)); target.activeReversalDefinition = source.activeReversalDefinition === null ? null : normalizeActiveReversalDefinition(source.activeReversalDefinition, `${source.id}.activeReversalDefinition`);
    target.integerVariables.splice(0, target.integerVariables.length, ...source.integerVariables);
    target.floatVariables.splice(0, target.floatVariables.length, ...source.floatVariables);
  }
}

class DeterministicEventQueue {
  readonly maxEventsPerTick: number;
  readonly #events: MugenMatchEvent[] = [];
  #tick: number | null = null;
  #nextSequence = 1;
  constructor(maxEventsPerTick: number) { this.maxEventsPerTick = maxEventsPerTick; }
  get nextSequence(): number { return this.#nextSequence; }
  beginTick(tick: number): void { if (this.#tick !== null) throw new Error('MUGEN event queue tick is already open.'); this.#tick = tick; this.#events.length = 0; }
  emit(payload: MugenMatchEventPayload): void {
    if (this.#tick === null) throw new Error('MUGEN event emission requires an open tick.');
    if (this.#events.length >= this.maxEventsPerTick) throw new RangeError(`MUGEN match tick exceeds ${this.maxEventsPerTick} events.`);
    const sequence = this.#nextSequence++;
    this.#events.push(Object.freeze({ id: `mugen-event-${sequence.toString().padStart(10, '0')}`, tick: this.#tick, sequence, ...payload }) as MugenMatchEvent);
  }
  endTick(): readonly MugenMatchEvent[] { if (this.#tick === null) throw new Error('MUGEN event queue tick is not open.'); const result = Object.freeze([...this.#events]); this.#events.length = 0; this.#tick = null; return result; }
  reset(): void { this.#events.length = 0; this.#tick = null; this.#nextSequence = 1; }
  restoreNextSequence(value: number): void { this.#nextSequence = integerRange(value, 1, Number.MAX_SAFE_INTEGER, 'nextEventSequence'); }
}

function normalizeMatchConfig(config: MugenMatchConfig): MugenNormalizedMatchConfig {
  if (!config || !Array.isArray(config.fighters) || config.fighters.length !== 2) throw new TypeError('MUGEN match requires exactly two fighter definitions.');
  const seed = normalizeSeed(config.seed);
  const fighters = Object.freeze(config.fighters.map(normalizeFighterDefinition)) as unknown as readonly [MugenNormalizedFighterDefinition, MugenNormalizedFighterDefinition];
  if (fighters[0].id === fighters[1].id) throw new TypeError(`MUGEN fighter id is duplicated: ${fighters[0].id}.`);
  return Object.freeze({
    schemaVersion: 1,
    tickRateHz: 60,
    seed,
    roundsToWin: integerRange(config.roundsToWin ?? 2, 1, 10, 'roundsToWin'),
    roundTimeTicks: config.roundTimeTicks === null ? null : integerRange(config.roundTimeTicks ?? 99 * 60, 1, 60 * 60 * 60, 'roundTimeTicks'),
    maxEventsPerTick: integerRange(config.maxEventsPerTick ?? 256, 1, 4_096, 'maxEventsPerTick'),
    fighters,
  });
}

function normalizeFighterDefinition(value: MugenFighterDefinition): MugenNormalizedFighterDefinition {
  if (!value || typeof value !== 'object') throw new TypeError('MUGEN fighter definition must be an object.');
  const id = playerId(value.id);
  if (typeof value.displayName !== 'string' || value.displayName.length < 1 || value.displayName.length > 128) throw new TypeError(`${id}.displayName is invalid.`);
  if (!SHA256.test(value.packageSha256)) throw new TypeError(`${id}.packageSha256 is invalid.`);
  if (value.facing !== -1 && value.facing !== 1) throw new TypeError(`${id}.facing must be -1 or 1.`);
  const maxLife = integerRange(value.maxLife ?? 1_000, 1, INT32_MAX, `${id}.maxLife`);
  const maxPower = integerRange(value.maxPower ?? 3_000, 0, INT32_MAX, `${id}.maxPower`);
  return Object.freeze({
    id,
    displayName: value.displayName,
    packageSha256: value.packageSha256,
    maxLife,
    maxPower,
    initialPower: integerRange(value.initialPower ?? 0, 0, maxPower, `${id}.initialPower`),
    spawn: normalizeVector(value.spawn, `${id}.spawn`),
    facing: value.facing,
    initialStateNumber: int32(value.initialStateNumber ?? 0, `${id}.initialStateNumber`),
    initialActionNumber: int32(value.initialActionNumber ?? 0, `${id}.initialActionNumber`),
    initialControl: booleanValue(value.initialControl ?? false, `${id}.initialControl`),
    initialStateType: enumValue(value.initialStateType ?? 'S', STATE_TYPES, `${id}.initialStateType`),
    initialMoveType: enumValue(value.initialMoveType ?? 'I', MOVE_TYPES, `${id}.initialMoveType`),
    initialPhysics: enumValue(value.initialPhysics ?? 'S', PHYSICS_TYPES, `${id}.initialPhysics`),
  });
}

function createMutableFighter(definition: MugenNormalizedFighterDefinition, slot: 0 | 1): MutableFighterState {
  return { definition, slot, positionX: definition.spawn[0], positionY: definition.spawn[1], velocityX: 0, velocityY: 0, facing: definition.facing, life: definition.maxLife, power: definition.initialPower, control: definition.initialControl, stateNumber: definition.initialStateNumber, previousStateNumber: definition.initialStateNumber, stateTime: 0, stateType: definition.initialStateType, moveType: definition.initialMoveType, physics: definition.initialPhysics, actionNumber: definition.initialActionNumber, actionTime: 0, stateGeneration: 0, stateDataOwnerId: definition.id, animationOwnerId: definition.id, animationElement: 1, spritePriority: 0, positionFrozen: false, widthEdgeFront: 0, widthEdgeBack: 0, widthPlayerFront: 0, widthPlayerBack: 0, juggleCost: 0, juggleCapacity: 15, juggleRemaining: 15, attackMultiplier: 1, defenseMultiplier: 1, playerPushEnabled: true, getHitVelocityX: 0, getHitVelocityY: 0, getHitYAcceleration: 0, hitFall: false, hitFallVelocityX: 0, hitFallVelocityY: -4.5, hitFallDamage: 0, hitFallKill: true, hitFallRecover: true, hitFallRecoverTime: 4, hitFallEnvShakeTime: 0, hitFallEnvShakeFrequency: 60, hitFallEnvShakeAmplitude: -4, hitFallEnvShakePhase: 0, hitDownBounce: false, hitElapsedTicks: 0, lastHitId: 0, lastHitAttribute: '', integerVariables: Array.from({ length: INTEGER_VARIABLE_COUNT }, () => 0), floatVariables: Array.from({ length: FLOAT_VARIABLE_COUNT }, () => 0), hitPauseTicks: 0, stunTicks: 0, stunKind: null, moveContact: 'none', moveContactTime: 0, hitCount: 0, activeHitDefinition: null, hitAttributeSlots: [null, null], targets: [], targetBinding: null, hitOverrides: Array.from({ length: 8 }, () => null), activeReversalDefinition: null, roundsWon: 0 };
}

function fighterSnapshot(fighter: MutableFighterState): MugenFighterSnapshot {
  return Object.freeze({ slot: fighter.slot, id: fighter.definition.id, displayName: fighter.definition.displayName, packageSha256: fighter.definition.packageSha256, position: Object.freeze([fighter.positionX, fighter.positionY]) as readonly [number, number], velocity: Object.freeze([fighter.velocityX, fighter.velocityY]) as readonly [number, number], facing: fighter.facing, life: fighter.life, maxLife: fighter.definition.maxLife, power: fighter.power, maxPower: fighter.definition.maxPower, control: fighter.control, stateNumber: fighter.stateNumber, previousStateNumber: fighter.previousStateNumber, stateTime: fighter.stateTime, stateType: fighter.stateType, moveType: fighter.moveType, physics: fighter.physics, actionNumber: fighter.actionNumber, actionTime: fighter.actionTime, stateGeneration: fighter.stateGeneration, stateDataOwnerId: fighter.stateDataOwnerId, animationOwnerId: fighter.animationOwnerId, animationElement: fighter.animationElement, spritePriority: fighter.spritePriority, positionFrozen: fighter.positionFrozen, widthOverride: Object.freeze({ edge: Object.freeze([fighter.widthEdgeFront, fighter.widthEdgeBack]) as readonly [number, number], player: Object.freeze([fighter.widthPlayerFront, fighter.widthPlayerBack]) as readonly [number, number] }), juggleCost: fighter.juggleCost, juggleCapacity: fighter.juggleCapacity, juggleRemaining: fighter.juggleRemaining, attackMultiplier: fighter.attackMultiplier, defenseMultiplier: fighter.defenseMultiplier, playerPushEnabled: fighter.playerPushEnabled, getHitVelocity: Object.freeze([fighter.getHitVelocityX, fighter.getHitVelocityY]) as readonly [number, number], getHitYAcceleration: fighter.getHitYAcceleration, hitFall: fighter.hitFall, hitFallVelocity: Object.freeze([fighter.hitFallVelocityX, fighter.hitFallVelocityY]) as readonly [number, number], hitFallDamage: fighter.hitFallDamage, hitFallKill: fighter.hitFallKill, hitFallRecover: fighter.hitFallRecover, hitFallRecoverTime: fighter.hitFallRecoverTime, hitFallEnvShake: Object.freeze([fighter.hitFallEnvShakeTime, fighter.hitFallEnvShakeFrequency, fighter.hitFallEnvShakeAmplitude, fighter.hitFallEnvShakePhase]) as MugenFallEnvShake, hitDownBounce: fighter.hitDownBounce, hitElapsedTicks: fighter.hitElapsedTicks, lastHitId: fighter.lastHitId, lastHitAttribute: fighter.lastHitAttribute, integerVariables: Object.freeze([...fighter.integerVariables]), floatVariables: Object.freeze([...fighter.floatVariables]), hitPauseTicks: fighter.hitPauseTicks, stunTicks: fighter.stunTicks, stunKind: fighter.stunKind, moveContact: fighter.moveContact, moveContactTime: fighter.moveContactTime, hitCount: fighter.hitCount, activeHitDefinition: fighter.activeHitDefinition, hitAttributeSlots: Object.freeze(fighter.hitAttributeSlots.map(value => value === null ? null : Object.freeze({ allowedAttributes: Object.freeze([...value.allowedAttributes]), remainingTicks: value.remainingTicks }))) as readonly [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null], targets: Object.freeze(fighter.targets.map(value => Object.freeze({ ...value }))), targetBinding: fighter.targetBinding === null ? null : Object.freeze({ ...fighter.targetBinding, offset: Object.freeze([...fighter.targetBinding.offset]) as readonly [number, number] }), hitOverrides: Object.freeze(fighter.hitOverrides.map(value => value === null ? null : Object.freeze({ ...value, attributes: Object.freeze([...value.attributes]) }))), activeReversalDefinition: fighter.activeReversalDefinition, roundsWon: fighter.roundsWon, ko: fighter.life === 0 });
}

function validateSnapshot(snapshot: MugenMatchSnapshot, config: MugenNormalizedMatchConfig): void {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.tickRateHz !== 60 || snapshot.seed !== config.seed || snapshot.roundsToWin !== config.roundsToWin) throw new TypeError('MUGEN match snapshot header is incompatible.');
  integerRange(snapshot.tick, 0, Number.MAX_SAFE_INTEGER, 'snapshot.tick'); integerRange(snapshot.phaseTime, 0, Number.MAX_SAFE_INTEGER, 'snapshot.phaseTime'); integerRange(snapshot.roundNumber, 1, Number.MAX_SAFE_INTEGER, 'snapshot.roundNumber');
  if (!ROUND_PHASES.has(snapshot.phase)) throw new TypeError('MUGEN match snapshot phase is invalid.');
  if (config.roundTimeTicks === null ? snapshot.roundTimeRemainingTicks !== null : snapshot.roundTimeRemainingTicks === null) throw new TypeError('MUGEN match snapshot timer mode is incompatible.');
  if (snapshot.roundTimeRemainingTicks !== null) integerRange(snapshot.roundTimeRemainingTicks, 0, config.roundTimeTicks!, 'snapshot.roundTimeRemainingTicks');
  if (snapshot.roundWinnerId !== null && !config.fighters.some(fighter => fighter.id === snapshot.roundWinnerId)) throw new TypeError('MUGEN match snapshot round winner is invalid.');
  if (snapshot.matchWinnerId !== null && !config.fighters.some(fighter => fighter.id === snapshot.matchWinnerId)) throw new TypeError('MUGEN match snapshot match winner is invalid.');
  if (snapshot.roundResultReason !== null && !ROUND_REASONS.has(snapshot.roundResultReason)) throw new TypeError('MUGEN match snapshot result reason is invalid.');
  if ((snapshot.phase === 'ready' || snapshot.phase === 'fight') && (snapshot.roundWinnerId !== null || snapshot.roundResultReason !== null || snapshot.matchWinnerId !== null)) throw new TypeError('MUGEN active round snapshot cannot already contain a result.');
  if ((snapshot.phase === 'ko' || snapshot.phase === 'round-over' || snapshot.phase === 'match-over') && snapshot.roundResultReason === null) throw new TypeError('MUGEN completed round snapshot is missing its result reason.');
  if (snapshot.phase === 'ko' && snapshot.roundResultReason !== 'ko') throw new TypeError('MUGEN KO phase requires a KO result.');
  if (snapshot.phase === 'match-over' ? snapshot.matchWinnerId === null : snapshot.matchWinnerId !== null) throw new TypeError('MUGEN match winner does not agree with the round phase.');
  if (snapshot.phase === 'match-over' && snapshot.matchWinnerId !== snapshot.roundWinnerId) throw new TypeError('MUGEN match winner must be the final round winner.');
  if (snapshot.roundResultReason === 'draw' && snapshot.roundWinnerId !== null) throw new TypeError('MUGEN draw snapshot cannot name a round winner.');
  integerRange(snapshot.nextEventSequence, 1, Number.MAX_SAFE_INTEGER, 'snapshot.nextEventSequence');
  integerRange(snapshot.randomState, 0, 0xffff_ffff, 'snapshot.randomState');
  if (!Array.isArray(snapshot.fighters) || snapshot.fighters.length !== 2) throw new TypeError('MUGEN match snapshot fighter inventory is invalid.');
  const ownerIds = new Set(config.fighters.map(fighter => fighter.id));
  for (let index = 0; index < 2; index += 1) validateFighterSnapshot(snapshot.fighters[index]!, config.fighters[index]!, index as 0 | 1, config.roundsToWin, ownerIds);
}

function validateFighterSnapshot(value: MugenFighterSnapshot, definition: MugenNormalizedFighterDefinition, slot: 0 | 1, roundsToWin: number, ownerIds: ReadonlySet<string>): void {
  if (value.id !== definition.id || value.slot !== slot || value.displayName !== definition.displayName || value.packageSha256 !== definition.packageSha256 || value.maxLife !== definition.maxLife || value.maxPower !== definition.maxPower) throw new TypeError(`MUGEN fighter snapshot identity is invalid for ${definition.id}.`);
  validateCanonicalVector(value.position, `${value.id}.position`); validateCanonicalVector(value.velocity, `${value.id}.velocity`);
  if (value.facing !== -1 && value.facing !== 1) throw new TypeError(`${value.id}.facing is invalid.`);
  integerRange(value.life, 0, definition.maxLife, `${value.id}.life`); integerRange(value.power, 0, definition.maxPower, `${value.id}.power`);
  if (typeof value.control !== 'boolean' || value.ko !== (value.life === 0)) throw new TypeError(`${value.id} control/KO state is invalid.`);
  int32(value.stateNumber, `${value.id}.stateNumber`); int32(value.previousStateNumber, `${value.id}.previousStateNumber`); int32(value.actionNumber, `${value.id}.actionNumber`);
  if (!ownerIds.has(value.stateDataOwnerId) || !ownerIds.has(value.animationOwnerId)) throw new TypeError(`${value.id} state/animation owner is invalid.`);
  integerRange(value.animationElement, 1, INT32_MAX, `${value.id}.animationElement`); integerRange(value.spritePriority, -5, 5, `${value.id}.spritePriority`); int32(value.juggleCost, `${value.id}.juggleCost`); integerRange(value.juggleCapacity, 0, 1_000_000, `${value.id}.juggleCapacity`); integerRange(value.juggleRemaining, 0, value.juggleCapacity, `${value.id}.juggleRemaining`);
  multiplier(value.attackMultiplier, `${value.id}.attackMultiplier`); multiplier(value.defenseMultiplier, `${value.id}.defenseMultiplier`); booleanValue(value.playerPushEnabled, `${value.id}.playerPushEnabled`); validateCanonicalVector(value.getHitVelocity, `${value.id}.getHitVelocity`); finiteF32(value.getHitYAcceleration, `${value.id}.getHitYAcceleration`); booleanValue(value.hitFall, `${value.id}.hitFall`); validateCanonicalVector(value.hitFallVelocity, `${value.id}.hitFallVelocity`); integerRange(value.hitFallDamage, 0, INT32_MAX, `${value.id}.hitFallDamage`); booleanValue(value.hitFallKill, `${value.id}.hitFallKill`); booleanValue(value.hitFallRecover, `${value.id}.hitFallRecover`); integerRange(value.hitFallRecoverTime, 0, 3_600, `${value.id}.hitFallRecoverTime`); validateCanonicalFallEnvShake(value.hitFallEnvShake, `${value.id}.hitFallEnvShake`); booleanValue(value.hitDownBounce, `${value.id}.hitDownBounce`); integerRange(value.hitElapsedTicks, 0, Number.MAX_SAFE_INTEGER, `${value.id}.hitElapsedTicks`); int32(value.lastHitId, `${value.id}.lastHitId`); if (value.lastHitAttribute !== '' && !HIT_ATTRIBUTE_KEYS.has(value.lastHitAttribute)) throw new TypeError(`${value.id}.lastHitAttribute is invalid.`);
  booleanValue(value.positionFrozen, `${value.id}.positionFrozen`); normalizeNonNegativePair(value.widthOverride.edge, `${value.id}.width.edge`); normalizeNonNegativePair(value.widthOverride.player, `${value.id}.width.player`);
  enumValue(value.stateType, STATE_TYPES, `${value.id}.stateType`); enumValue(value.moveType, MOVE_TYPES, `${value.id}.moveType`); enumValue(value.physics, PHYSICS_TYPES, `${value.id}.physics`);
  integerRange(value.stateTime, 0, Number.MAX_SAFE_INTEGER, `${value.id}.stateTime`); integerRange(value.actionTime, 0, Number.MAX_SAFE_INTEGER, `${value.id}.actionTime`); integerRange(value.stateGeneration, 0, Number.MAX_SAFE_INTEGER, `${value.id}.stateGeneration`); integerRange(value.roundsWon, 0, roundsToWin, `${value.id}.roundsWon`);
  integerRange(value.hitPauseTicks, 0, 600, `${value.id}.hitPauseTicks`); integerRange(value.stunTicks, 0, 3_600, `${value.id}.stunTicks`);
  if (value.stunKind !== null && value.stunKind !== 'hit' && value.stunKind !== 'guard') throw new TypeError(`${value.id}.stunKind is invalid.`);
  if ((value.stunTicks === 0) !== (value.stunKind === null)) throw new TypeError(`${value.id} stun kind/ticks are inconsistent.`);
  if (!MOVE_CONTACTS.has(value.moveContact)) throw new TypeError(`${value.id}.moveContact is invalid.`);
  integerRange(value.moveContactTime, 0, Number.MAX_SAFE_INTEGER, `${value.id}.moveContactTime`); integerRange(value.hitCount, 0, Number.MAX_SAFE_INTEGER, `${value.id}.hitCount`);
  if (value.moveContact === 'none' && (value.moveContactTime !== 0 || value.hitCount !== 0)) throw new TypeError(`${value.id} move contact counters are inconsistent.`);
  if (value.activeHitDefinition !== null) normalizeActiveHitDefinition(value.activeHitDefinition, `${value.id}.activeHitDefinition`);
  if (!Array.isArray(value.hitAttributeSlots) || value.hitAttributeSlots.length !== 2) throw new TypeError(`${value.id}.hitAttributeSlots is invalid.`);
  value.hitAttributeSlots.forEach((slot, index) => { if (slot !== null) normalizeHitAttributeSlot(slot, `${value.id}.hitAttributeSlots[${index}]`); });
  if (!Array.isArray(value.targets) || value.targets.length > 8 || new Set(value.targets.map(target => target.fighterId)).size !== value.targets.length) throw new TypeError(`${value.id}.targets is invalid.`);
  value.targets.forEach((target, index) => { const normalized = normalizeTargetLink(target, `${value.id}.targets[${index}]`); if (!ownerIds.has(normalized.fighterId) || normalized.fighterId === value.id || (index > 0 && value.targets[index - 1]!.fighterId > normalized.fighterId)) throw new TypeError(`${value.id}.targets is invalid.`); });
  if (value.targetBinding !== null) { const binding = normalizeTargetBinding(value.targetBinding, `${value.id}.targetBinding`); if (!ownerIds.has(binding.ownerId) || binding.ownerId === value.id) throw new TypeError(`${value.id}.targetBinding owner is invalid.`); }
  if (!Array.isArray(value.hitOverrides) || value.hitOverrides.length !== 8) throw new TypeError(`${value.id}.hitOverrides is invalid.`); value.hitOverrides.forEach((override, index) => { if (override !== null) { const normalized = normalizeHitOverride(override, `${value.id}.hitOverrides[${index}]`); if (!ownerIds.has(normalized.stateDataOwnerId)) throw new TypeError(`${value.id}.hitOverrides owner is invalid.`); } });
  if (value.activeReversalDefinition !== null) { const reversal = normalizeActiveReversalDefinition(value.activeReversalDefinition, `${value.id}.activeReversalDefinition`); if (!ownerIds.has(reversal.stateDataOwnerId)) throw new TypeError(`${value.id}.activeReversalDefinition owner is invalid.`); }
  validateVariables(value.integerVariables, INTEGER_VARIABLE_COUNT, false, `${value.id}.integerVariables`);
  validateVariables(value.floatVariables, FLOAT_VARIABLE_COUNT, true, `${value.id}.floatVariables`);
}

function hashSnapshot(snapshot: MugenMatchSnapshot): string { const { hash: _hash, ...base } = snapshot; return hashSimulationState(base as unknown as SimulationStateValue); }
function normalizeVector(value: readonly [number, number], label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${label} must contain two values.`); return Object.freeze([finiteF32(value[0], `${label}[0]`), finiteF32(value[1], `${label}[1]`)]); }
function validateCanonicalVector(value: readonly [number, number], label: string): void { const normalized = normalizeVector(value, label); if (value[0] !== normalized[0] || value[1] !== normalized[1] || Object.is(value[0], -0) || Object.is(value[1], -0)) throw new TypeError(`${label} is not canonical float32 data.`); }
function normalizeFallEnvShake(value: MugenFallEnvShake, label: string): MugenFallEnvShake { if (!Array.isArray(value) || value.length !== 4) throw new TypeError(`${label} must contain four values.`); return Object.freeze([integerRange(value[0], 0, 1_000_000, `${label}.time`), finiteRange(value[1], 0, 180, `${label}.frequency`), finiteF32(value[2], `${label}.amplitude`), finiteF32(value[3], `${label}.phase`)]); }
function validateCanonicalFallEnvShake(value: MugenFallEnvShake, label: string): void { const normalized = normalizeFallEnvShake(value, label); if (value.some((item, index) => item !== normalized[index] || Object.is(item, -0))) throw new TypeError(`${label} is not canonical data.`); }
function finiteF32(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_COORDINATE) throw new RangeError(`${label} must be finite and within ${MAX_ABSOLUTE_COORDINATE}.`); const normalized = Math.fround(value); return Object.is(normalized, -0) ? 0 : normalized; }
function normalizeSeed(value: string | number): string | number { if (typeof value === 'number' && Number.isSafeInteger(value)) return Object.is(value, -0) ? 0 : value; if (typeof value === 'string' && value.length >= 1 && value.length <= 128) return value; throw new TypeError('MUGEN match seed is invalid.'); }
function booleanValue(value: boolean, label: string): boolean { if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`); return value; }
function enumValue<T extends string>(value: T, allowed: ReadonlySet<string>, label: string): T { if (!allowed.has(value)) throw new TypeError(`${label} is invalid.`); return value; }
function playerId(value: string): string { if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(value)) throw new TypeError('MUGEN fighter id is invalid.'); return value; }
function int32(value: number, label: string): number { return integerRange(value, INT32_MIN, INT32_MAX, label); }
function checkedInt32Add(value: number, delta: number, label: string): number { return int32(value + int32(delta, `${label}.delta`), label); }
function integerRange(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`); return value; }
function finiteRange(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be finite from ${minimum} to ${maximum}.`); return value; }
function incrementTickCounter(value: number, label: string): number { return integerRange(value + 1, 0, Number.MAX_SAFE_INTEGER, label); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function finiteScriptFloat(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > MAX_SCRIPT_FLOAT) throw new RangeError(`${label} must be a finite bounded number.`); const normalized = Math.fround(value); return Object.is(normalized, -0) ? 0 : normalized; }
function multiplier(value: number, label: string): number { return finiteRange(finiteScriptFloat(value, label), 0, 1_000, label); }
function validateVariables(values: readonly number[], expected: number, floats: boolean, label: string): void { if (!Array.isArray(values) || values.length !== expected) throw new TypeError(`${label} must contain ${expected} values.`); for (let index = 0; index < values.length; index += 1) { if (floats) finiteScriptFloat(values[index]!, `${label}[${index}]`); else int32(values[index]!, `${label}[${index}]`); } }
function normalizeHitDefinition(value: MugenResolvedHitDefinition, label: string): MugenResolvedHitDefinition {
  if (!value || typeof value !== 'object' || typeof value.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.key)) throw new TypeError(`${label}.key is invalid.`);
  if (!HIT_ATTRIBUTE_STATES.has(value.attributeState) || !ATTACK_ATTRIBUTES.has(value.attackAttribute)) throw new TypeError(`${label}.attr is invalid.`);
  const hitFlags = flagString(value.hitFlags, HIT_FLAGS, `${label}.hitFlags`); const guardFlags = flagString(value.guardFlags, GUARD_FLAGS, `${label}.guardFlags`, true);
  return Object.freeze({
    key: value.key, attributeState: value.attributeState, attackAttribute: value.attackAttribute, affectTeam: enumValue(value.affectTeam, AFFECT_TEAMS, `${label}.affectTeam`),
    damage: integerRange(value.damage, 0, INT32_MAX, `${label}.damage`), guardDamage: integerRange(value.guardDamage, 0, INT32_MAX, `${label}.guardDamage`), hitFlags, guardFlags,
    groundHitType: enumValue(value.groundHitType, GROUND_HIT_TYPES, `${label}.groundHitType`), airHitType: enumValue(value.airHitType, GROUND_HIT_TYPES, `${label}.airHitType`), animationType: enumValue(value.animationType, HIT_ANIMATION_TYPES, `${label}.animationType`), airAnimationType: enumValue(value.airAnimationType, HIT_ANIMATION_TYPES, `${label}.airAnimationType`), fallAnimationType: enumValue(value.fallAnimationType, HIT_ANIMATION_TYPES, `${label}.fallAnimationType`), priority: integerRange(value.priority, 1, 7, `${label}.priority`), priorityClass: enumValue(value.priorityClass, PRIORITY_CLASSES, `${label}.priorityClass`),
    hitPause: normalizeCounterPair(value.hitPause, 600, `${label}.hitPause`), guardPause: normalizeCounterPair(value.guardPause, 600, `${label}.guardPause`),
    groundHitTime: integerRange(value.groundHitTime, 0, 3_600, `${label}.groundHitTime`), groundSlideTime: integerRange(value.groundSlideTime, 0, 3_600, `${label}.groundSlideTime`), guardSlideTime: integerRange(value.guardSlideTime, 0, 3_600, `${label}.guardSlideTime`), guardHitTime: integerRange(value.guardHitTime, 0, 3_600, `${label}.guardHitTime`), airHitTime: integerRange(value.airHitTime, 0, 3_600, `${label}.airHitTime`), guardControlTime: integerRange(value.guardControlTime, 0, 3_600, `${label}.guardControlTime`), airGuardControlTime: integerRange(value.airGuardControlTime, 0, 3_600, `${label}.airGuardControlTime`), yAcceleration: finiteF32(value.yAcceleration, `${label}.yAcceleration`),
    groundVelocity: normalizeVector(value.groundVelocity, `${label}.groundVelocity`), airVelocity: normalizeVector(value.airVelocity, `${label}.airVelocity`), guardVelocity: normalizeVector(value.guardVelocity, `${label}.guardVelocity`), airGuardVelocity: normalizeVector(value.airGuardVelocity, `${label}.airGuardVelocity`), downVelocity: normalizeVector(value.downVelocity, `${label}.downVelocity`), downHitTime: integerRange(value.downHitTime, 0, 3_600, `${label}.downHitTime`), groundCornerPush: finiteF32(value.groundCornerPush, `${label}.groundCornerPush`), airCornerPush: finiteF32(value.airCornerPush, `${label}.airCornerPush`), downCornerPush: finiteF32(value.downCornerPush, `${label}.downCornerPush`), guardCornerPush: finiteF32(value.guardCornerPush, `${label}.guardCornerPush`), airGuardCornerPush: finiteF32(value.airGuardCornerPush, `${label}.airGuardCornerPush`),
    attackerPowerOnHit: int32(value.attackerPowerOnHit, `${label}.attackerPowerOnHit`), attackerPowerOnGuard: int32(value.attackerPowerOnGuard, `${label}.attackerPowerOnGuard`), defenderPowerOnHit: int32(value.defenderPowerOnHit, `${label}.defenderPowerOnHit`), defenderPowerOnGuard: int32(value.defenderPowerOnGuard, `${label}.defenderPowerOnGuard`),
    guardDistance: integerRange(value.guardDistance, -1, INT32_MAX, `${label}.guardDistance`), attackerSpritePriority: integerRange(value.attackerSpritePriority, -5, 5, `${label}.attackerSpritePriority`), defenderSpritePriority: integerRange(value.defenderSpritePriority, -5, 5, `${label}.defenderSpritePriority`),
    attackerFacing: integerRange(value.attackerFacing, -1, 1, `${label}.attackerFacing`), attackerGetDefenderFacing: integerRange(value.attackerGetDefenderFacing, -1, 1, `${label}.attackerGetDefenderFacing`), defenderFacing: integerRange(value.defenderFacing, -1, 1, `${label}.defenderFacing`),
    attackerStateNumber: int32(value.attackerStateNumber, `${label}.attackerStateNumber`), defenderStateNumber: int32(value.defenderStateNumber, `${label}.defenderStateNumber`), defenderGetsAttackerState: booleanValue(value.defenderGetsAttackerState, `${label}.defenderGetsAttackerState`), forceStand: booleanValue(value.forceStand, `${label}.forceStand`), fall: booleanValue(value.fall, `${label}.fall`), airFall: booleanValue(value.airFall, `${label}.airFall`), forceNoFall: booleanValue(value.forceNoFall, `${label}.forceNoFall`), airJuggle: integerRange(value.airJuggle, 0, 1_000_000, `${label}.airJuggle`), snap: value.snap === null ? null : normalizeVector(value.snap, `${label}.snap`), downBounce: booleanValue(value.downBounce, `${label}.downBounce`), fallVelocity: normalizeVector(value.fallVelocity, `${label}.fallVelocity`), fallRecover: booleanValue(value.fallRecover, `${label}.fallRecover`), fallRecoverTime: integerRange(value.fallRecoverTime, 0, 3_600, `${label}.fallRecoverTime`), fallDamage: integerRange(value.fallDamage, 0, INT32_MAX, `${label}.fallDamage`), fallKill: booleanValue(value.fallKill, `${label}.fallKill`), minimumDistance: value.minimumDistance === null ? null : normalizeVector(value.minimumDistance, `${label}.minimumDistance`), maximumDistance: value.maximumDistance === null ? null : normalizeVector(value.maximumDistance, `${label}.maximumDistance`), targetId: int32(value.targetId, `${label}.targetId`), chainId: int32(value.chainId, `${label}.chainId`), noChainIds: Object.freeze([int32(value.noChainIds[0], `${label}.noChainIds[0]`), int32(value.noChainIds[1], `${label}.noChainIds[1]`)]) as readonly [number, number], hitOnce: booleanValue(value.hitOnce, `${label}.hitOnce`), hitCount: integerRange(value.hitCount, 0, INT32_MAX, `${label}.hitCount`),
    kill: booleanValue(value.kill, `${label}.kill`), guardKill: booleanValue(value.guardKill, `${label}.guardKill`), output: normalizeHitOutput(value.output, `${label}.output`),
  });
}
function normalizeHitOutput(value: MugenResolvedHitOutput, label: string): MugenResolvedHitOutput {
  if (!value || typeof value !== 'object') throw new TypeError(`${label} is invalid.`);
  const optionalResource = (input: number | null, resourceLabel: string): number | null => input === null ? null : integerRange(input, -1, 32_767, resourceLabel);
  const optionalSound = (input: readonly [number, number] | null, soundLabel: string): readonly [number, number] | null => input === null ? null : Object.freeze([integerRange(input[0], 0, 32_767, `${soundLabel}[0]`), integerRange(input[1], 0, 32_767, `${soundLabel}[1]`)]) as readonly [number, number];
  const shake = (input: readonly [number, number, number, number], shakeLabel: string): readonly [number, number, number, number] => Object.freeze([integerRange(input[0], 0, 1_000_000, `${shakeLabel}.time`), finiteRange(input[1], 0, 180, `${shakeLabel}.frequency`), finiteF32(input[2], `${shakeLabel}.amplitude`), finiteF32(input[3], `${shakeLabel}.phase`)]) as readonly [number, number, number, number];
  const triple = (input: readonly [number, number, number], tripleLabel: string, nonNegative = false): readonly [number, number, number] => { if (!Array.isArray(input) || input.length !== 3) throw new TypeError(`${tripleLabel} must contain three values.`); const result = Object.freeze(input.map((component, index) => finiteF32(component, `${tripleLabel}[${index}]`))) as readonly [number, number, number]; if (nonNegative && result.some(component => component < 0)) throw new RangeError(`${tripleLabel} cannot be negative.`); return result; };
  return Object.freeze({ sparkNumber: optionalResource(value.sparkNumber, `${label}.sparkNumber`), sparkFromPlayer: booleanValue(value.sparkFromPlayer, `${label}.sparkFromPlayer`), guardSparkNumber: optionalResource(value.guardSparkNumber, `${label}.guardSparkNumber`), guardSparkFromPlayer: booleanValue(value.guardSparkFromPlayer, `${label}.guardSparkFromPlayer`), sparkPosition: normalizeVector(value.sparkPosition, `${label}.sparkPosition`), hitSound: optionalSound(value.hitSound, `${label}.hitSound`), hitSoundFromPlayer: booleanValue(value.hitSoundFromPlayer, `${label}.hitSoundFromPlayer`), guardSound: optionalSound(value.guardSound, `${label}.guardSound`), guardSoundFromPlayer: booleanValue(value.guardSoundFromPlayer, `${label}.guardSoundFromPlayer`), envShake: shake(value.envShake, `${label}.envShake`), fallEnvShake: shake(value.fallEnvShake, `${label}.fallEnvShake`), defenderPalette: Object.freeze({ time: integerRange(value.defenderPalette.time, -1, 1_000_000, `${label}.defenderPalette.time`), multiply: triple(value.defenderPalette.multiply, `${label}.defenderPalette.multiply`, true), add: triple(value.defenderPalette.add, `${label}.defenderPalette.add`) }) });
}
function normalizeActiveHitDefinition(value: MugenActiveHitDefinition, label: string): MugenActiveHitDefinition { const base = normalizeHitDefinition(value, label); if (typeof value.activationId !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/u.test(value.activationId)) throw new TypeError(`${label}.activationId is invalid.`); if (!Array.isArray(value.hitTargets) || value.hitTargets.length > 8 || new Set(value.hitTargets).size !== value.hitTargets.length || value.hitTargets.some(target => typeof target !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(target)) || value.hitTargets.some((target, index) => index > 0 && value.hitTargets[index - 1]! > target)) throw new TypeError(`${label}.hitTargets is invalid.`); return Object.freeze({ ...base, activationId: value.activationId, hitTargets: Object.freeze([...value.hitTargets]) }); }
function normalizeHitAttributeSlot(value: MugenHitAttributeSlot, label: string): MugenHitAttributeSlot { if (!value || !Array.isArray(value.allowedAttributes) || value.allowedAttributes.length > HIT_ATTRIBUTE_KEYS.size || new Set(value.allowedAttributes).size !== value.allowedAttributes.length || value.allowedAttributes.some((attribute, index) => !HIT_ATTRIBUTE_KEYS.has(attribute) || (index > 0 && value.allowedAttributes[index - 1]! > attribute))) throw new TypeError(`${label}.allowedAttributes is invalid.`); return Object.freeze({ allowedAttributes: Object.freeze([...value.allowedAttributes]), remainingTicks: integerRange(value.remainingTicks, -1, 3_600, `${label}.remainingTicks`) }); }
function normalizeTargetLink(value: MugenTargetLink, label: string): MugenTargetLink { if (!value || typeof value.fighterId !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(value.fighterId)) throw new TypeError(`${label}.fighterId is invalid.`); return Object.freeze({ fighterId: value.fighterId, targetId: int32(value.targetId, `${label}.targetId`) }); }
function normalizeTargetBinding(value: MugenTargetBinding, label: string): MugenTargetBinding { if (!value || typeof value.ownerId !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(value.ownerId)) throw new TypeError(`${label}.ownerId is invalid.`); return Object.freeze({ ownerId: value.ownerId, targetId: int32(value.targetId, `${label}.targetId`), offset: normalizeVector(value.offset, `${label}.offset`), remainingTicks: integerRange(value.remainingTicks, -1, 3_600, `${label}.remainingTicks`) }); }
function normalizeHitOverride(value: MugenHitOverride, label: string): MugenHitOverride { if (!value || !Array.isArray(value.attributes) || value.attributes.length < 1 || value.attributes.length > HIT_ATTRIBUTE_KEYS.size || new Set(value.attributes).size !== value.attributes.length || value.attributes.some((attribute, index) => !HIT_ATTRIBUTE_KEYS.has(attribute) || (index > 0 && value.attributes[index - 1]! > attribute))) throw new TypeError(`${label}.attributes is invalid.`); if (typeof value.stateDataOwnerId !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(value.stateDataOwnerId)) throw new TypeError(`${label}.stateDataOwnerId is invalid.`); return Object.freeze({ attributes: Object.freeze([...value.attributes]), stateNumber: int32(value.stateNumber, `${label}.stateNumber`), stateDataOwnerId: value.stateDataOwnerId, forceAir: booleanValue(value.forceAir, `${label}.forceAir`), remainingTicks: integerRange(value.remainingTicks, -1, 3_600, `${label}.remainingTicks`) }); }
function normalizeReversalDefinition(value: MugenResolvedReversalDefinition, label: string): MugenResolvedReversalDefinition { if (!value || typeof value.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.key) || typeof value.stateDataOwnerId !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(value.stateDataOwnerId) || !Array.isArray(value.attributes) || value.attributes.length < 1 || value.attributes.some((attribute, index) => !HIT_ATTRIBUTE_KEYS.has(attribute) || (index > 0 && value.attributes[index - 1]! > attribute))) throw new TypeError(`${label} is invalid.`); const hitSound = value.hitSound === null ? null : Object.freeze([integerRange(value.hitSound[0], 0, 32_767, `${label}.hitSound[0]`), integerRange(value.hitSound[1], 0, 32_767, `${label}.hitSound[1]`)]) as readonly [number, number]; return Object.freeze({ key: value.key, stateDataOwnerId: value.stateDataOwnerId, attributes: Object.freeze([...value.attributes]), hitPause: normalizeCounterPair(value.hitPause, 600, `${label}.hitPause`), attackerStateNumber: int32(value.attackerStateNumber, `${label}.attackerStateNumber`), defenderStateNumber: int32(value.defenderStateNumber, `${label}.defenderStateNumber`), attackerSpritePriority: integerRange(value.attackerSpritePriority, -5, 5, `${label}.attackerSpritePriority`), defenderSpritePriority: integerRange(value.defenderSpritePriority, -5, 5, `${label}.defenderSpritePriority`), sparkNumber: value.sparkNumber === null ? null : int32(value.sparkNumber, `${label}.sparkNumber`), hitSound }); }
function normalizeActiveReversalDefinition(value: MugenActiveReversalDefinition, label: string): MugenActiveReversalDefinition { const base = normalizeReversalDefinition(value, label); if (typeof value.activationId !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/u.test(value.activationId)) throw new TypeError(`${label}.activationId is invalid.`); return Object.freeze({ ...base, activationId: value.activationId }); }
function normalizeCounterPair(value: readonly [number, number], maximum: number, label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${label} must contain two values.`); return Object.freeze([integerRange(value[0], 0, maximum, `${label}[0]`), integerRange(value[1], 0, maximum, `${label}[1]`)]); }
function normalizeNonNegativePair(value: readonly [number, number], label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${label} must contain two values.`); return Object.freeze([finiteRange(value[0], 0, MAX_ABSOLUTE_COORDINATE, `${label}[0]`), finiteRange(value[1], 0, MAX_ABSOLUTE_COORDINATE, `${label}[1]`)]); }
function flagString(value: string, allowed: ReadonlySet<string>, label: string, allowEmpty = false): string { if (typeof value !== 'string' || (!allowEmpty && value.length < 1) || value.length > 8) throw new TypeError(`${label} is invalid.`); const normalized = [...new Set(value.toUpperCase())].sort().join(''); if ([...normalized].some(flag => !allowed.has(flag))) throw new TypeError(`${label} contains an unsupported flag.`); return normalized; }

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const MAX_ABSOLUTE_COORDINATE = 1_048_576;
const MAX_SCRIPT_FLOAT = 1_000_000_000_000;
const INTEGER_VARIABLE_COUNT = 60;
const FLOAT_VARIABLE_COUNT = 40;
const SHA256 = /^[a-f0-9]{64}$/u;
const INPUT_HASH = /^fnv1a64:[a-f0-9]{16}$/u;
const ROUND_PHASES = new Set<MugenRoundPhase>(['ready', 'fight', 'ko', 'round-over', 'match-over']);
const ROUND_REASONS = new Set<MugenRoundResultReason>(['ko', 'time-over', 'draw']);
const STATE_TYPES = new Set<MugenStateType>(['S', 'C', 'A', 'L']);
const MOVE_TYPES = new Set<MugenMoveType>(['I', 'A', 'H']);
const PHYSICS_TYPES = new Set<MugenPhysicsType>(['N', 'S', 'C', 'A']);
const MOVE_CONTACTS = new Set<MugenMoveContact>(['none', 'hit', 'guarded', 'reversed']);
const HIT_ATTRIBUTE_STATES = new Set<string>(['S', 'C', 'A']);
const ATTACK_ATTRIBUTES = new Set<MugenAttackAttribute>(['NA', 'SA', 'HA', 'NP', 'SP', 'HP', 'NT', 'ST', 'HT']);
const AFFECT_TEAMS = new Set<'B' | 'E' | 'F'>(['B', 'E', 'F']);
const HIT_ATTRIBUTE_KEYS = new Set([...HIT_ATTRIBUTE_STATES].flatMap(state => [...ATTACK_ATTRIBUTES].map(attack => `${state}:${attack}`)));
const GROUND_HIT_TYPES = new Set<MugenGroundHitType>(['high', 'low', 'trip', 'none']);
const HIT_ANIMATION_TYPES = new Set<MugenHitAnimationType>(['light', 'medium', 'hard', 'back', 'up', 'diagup']);
const PRIORITY_CLASSES = new Set<string>(['hit', 'miss', 'dodge']);
const HIT_FLAGS = new Set<string>(['H', 'L', 'M', 'A', 'F', 'D', '+', '-']);
const GUARD_FLAGS = new Set<string>(['M', 'H', 'L', 'A']);
