import { hashSimulationState, type SimulationStateValue } from '@haiyue/engine/experimental/simulation';
import type { MugenActiveHitDefinition, MugenFallEnvShake, MugenHitAttributeSlot, MugenHitOverride, MugenMoveContact, MugenResolvedHitDefinition, MugenStunKind } from '../match/MugenMatchState';

export type MugenPlayerEntityKind = 'root' | 'helper';
export type MugenEntityKind = MugenPlayerEntityKind | 'projectile' | 'explod';
export type MugenProjectileContact = 'none' | 'hit' | 'guarded' | 'cancelled';
export type MugenProjectileTerminalReason = 'hit' | 'removed' | 'cancelled';
export type MugenExplodLayer = 'below' | 'above';
export type MugenExplodCoordinateSpace = 'stage' | 'screen';

export interface MugenProjectileContactRecord {
  readonly rootId: string;
  readonly entityId: string;
  readonly projectileId: number;
  readonly contact: Exclude<MugenProjectileContact, 'none'>;
  readonly contactTime: number;
  readonly contactTick: number;
}

export interface MugenEntityTargetLink {
  readonly entityId: string;
  readonly targetId: number;
}

export interface MugenEntityBudgets {
  readonly maxHelpers?: number;
  readonly maxProjectiles?: number;
  readonly maxExplods?: number;
  readonly maxEntities?: number;
  readonly maxCommandsPerTick?: number;
}

export interface MugenNormalizedEntityBudgets {
  readonly maxHelpers: number;
  readonly maxProjectiles: number;
  readonly maxExplods: number;
  readonly maxEntities: number;
  readonly maxCommandsPerTick: number;
}

export interface MugenRootEntitySeed {
  readonly entityId: string;
  readonly playerId?: number;
  readonly team: 0 | 1;
  readonly position?: readonly [number, number];
  readonly facing?: -1 | 1;
}

export interface MugenRootEntitySnapshot {
  readonly kind: 'root';
  readonly entityId: string;
  readonly playerId: number;
  readonly team: 0 | 1;
  readonly rootId: string;
  readonly parentId: null;
  readonly ownerId: string;
  readonly position: readonly [number, number];
  readonly facing: -1 | 1;
  readonly targets: readonly MugenEntityTargetLink[];
  readonly bindTargetId: string | null;
  readonly bindTime: number;
  readonly bindOffset: readonly [number, number];
  readonly createdTick: 0;
  readonly age: number;
}

export interface MugenHelperEntitySnapshot {
  readonly kind: 'helper';
  readonly entityId: string;
  readonly playerId: number;
  readonly helperId: number;
  readonly name: string;
  readonly team: 0 | 1;
  readonly rootId: string;
  readonly parentId: string;
  readonly ownerId: string;
  readonly stateNumber: number;
  readonly previousStateNumber: number;
  readonly stateTime: number;
  readonly stateGeneration: number;
  readonly stateDataOwnerId: string;
  readonly stateDefinitionPending: boolean;
  readonly actionNumber: number;
  readonly actionTime: number;
  readonly position: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly facing: -1 | 1;
  readonly control: boolean;
  readonly stateType: 'S' | 'C' | 'A' | 'L';
  readonly moveType: 'I' | 'A' | 'H';
  readonly physics: 'N' | 'S' | 'C' | 'A';
  readonly life: number;
  readonly maxLife: number;
  readonly spritePriority: number;
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
  readonly hitPauseTicks: number;
  readonly stunTicks: number;
  readonly stunKind: MugenStunKind | null;
  readonly moveContact: MugenMoveContact;
  readonly moveContactTime: number;
  readonly hitCount: number;
  readonly activeHitDefinition: MugenActiveHitDefinition | null;
  readonly hitAttributeSlots: readonly [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null];
  readonly hitOverrides: readonly (MugenHitOverride | null)[];
  readonly integerVariables: readonly number[];
  readonly floatVariables: readonly number[];
  readonly targets: readonly MugenEntityTargetLink[];
  readonly bindTargetId: string | null;
  readonly bindTime: number;
  readonly bindOffset: readonly [number, number];
  readonly keyControl: boolean;
  readonly pauseMoveTime: number;
  readonly superMoveTime: number;
  readonly constantOverrides: Readonly<Record<string, number>>;
  readonly createdTick: number;
  readonly age: number;
}

export interface MugenProjectileEntitySnapshot {
  readonly kind: 'projectile';
  readonly entityId: string;
  readonly projectileId: number;
  readonly team: 0 | 1;
  readonly rootId: string;
  readonly parentId: string;
  readonly ownerId: string;
  readonly animationNumber: number;
  readonly animationOwnerId: string;
  readonly hitAnimationNumber: number;
  readonly hitAnimationOwnerId: string;
  readonly removeAnimationNumber: number;
  readonly removeAnimationOwnerId: string;
  readonly cancelAnimationNumber: number;
  readonly cancelAnimationOwnerId: string;
  readonly hitDefinition: MugenResolvedHitDefinition | null;
  readonly priority: number;
  readonly remainingHits: number;
  readonly missTime: number;
  readonly hitCooldown: number;
  readonly position: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly acceleration: readonly [number, number];
  readonly velocityMultiplier: readonly [number, number];
  readonly removeVelocity: readonly [number, number];
  readonly removeOnHit: boolean;
  readonly removeTime: number;
  readonly spritePriority: number;
  readonly edgeBound: number;
  readonly stageBound: number;
  readonly heightBound: readonly [number, number];
  readonly facing: -1 | 1;
  readonly terminalReason: MugenProjectileTerminalReason | null;
  readonly terminalAge: number;
  readonly pauseMoveTime: number;
  readonly superMoveTime: number;
  readonly contact: MugenProjectileContact;
  readonly contactTime: number;
  readonly hitCount: number;
  readonly createdTick: number;
  readonly age: number;
}

export interface MugenExplodEntitySnapshot {
  readonly kind: 'explod';
  readonly entityId: string;
  readonly explodId: number;
  readonly team: 0 | 1;
  readonly rootId: string;
  readonly parentId: string;
  readonly ownerId: string;
  readonly animationNumber: number;
  readonly animationOwnerId: string;
  readonly position: readonly [number, number];
  readonly velocity: readonly [number, number];
  readonly acceleration: readonly [number, number];
  readonly velocityMultiplier: readonly [number, number];
  readonly facing: -1 | 1;
  readonly verticalFacing: -1 | 1;
  readonly coordinateSpace: MugenExplodCoordinateSpace;
  readonly bindTargetId: string | null;
  readonly bindTime: number;
  readonly bindOffset: readonly [number, number];
  readonly removeTime: number;
  readonly removeOnGetHit: boolean;
  readonly layer: MugenExplodLayer;
  readonly spritePriority: number;
  readonly pauseMoveTime: number;
  readonly superMoveTime: number;
  readonly createdTick: number;
  readonly age: number;
}

export type MugenPlayerEntitySnapshot = MugenRootEntitySnapshot | MugenHelperEntitySnapshot;
export type MugenEntitySnapshot = MugenPlayerEntitySnapshot | MugenProjectileEntitySnapshot | MugenExplodEntitySnapshot;

export interface MugenEntityAuthoritySnapshot {
  readonly schemaVersion: 4;
  readonly revision: 'm09-g08-entity-authority-v4';
  readonly tick: number;
  readonly nextPlayerId: number;
  readonly nextEntitySequence: number;
  readonly budgets: MugenNormalizedEntityBudgets;
  readonly entities: readonly MugenEntitySnapshot[];
  readonly projectileContacts: readonly MugenProjectileContactRecord[];
  readonly hash: string;
}

export type MugenEntityDiagnosticCode = 'entity-budget' | 'command-budget' | 'id-collision' | 'missing-owner' | 'invalid-owner' | 'owner-destroyed';
export interface MugenEntityDiagnostic { readonly code: MugenEntityDiagnosticCode; readonly tick: number; readonly operation: string; readonly entityId: string | null; readonly message: string }
export interface MugenEntityCommitResult { readonly tick: number; readonly spawned: readonly string[]; readonly destroyed: readonly string[]; readonly diagnostics: readonly MugenEntityDiagnostic[]; readonly hash: string }

export interface MugenHelperSpawn {
  readonly ownerId: string;
  readonly helperId?: number;
  readonly name?: string;
  readonly stateNumber?: number;
  readonly position?: readonly [number, number];
  readonly facing?: -1 | 1;
  readonly keyControl?: boolean;
  readonly pauseMoveTime?: number;
  readonly superMoveTime?: number;
  readonly spritePriority?: number;
  readonly playerId?: number;
  readonly maxLife?: number;
  readonly life?: number;
  readonly defenseMultiplier?: number;
  readonly juggleCapacity?: number;
  readonly constantOverrides?: Readonly<Record<string, number>>;
}

export interface MugenHelperHitReceipt {
  readonly damage: number;
  readonly hitPauseTicks: number;
  readonly stunTicks: number;
  readonly stunKind: MugenStunKind;
  readonly velocity: readonly [number, number];
  readonly getHitVelocity: readonly [number, number];
  readonly yAcceleration: number;
  readonly fall: boolean;
  readonly fallVelocity: readonly [number, number];
  readonly fallDamage: number;
  readonly fallKill: boolean;
  readonly fallRecover: boolean;
  readonly fallRecoverTime: number;
  readonly fallEnvShake: MugenFallEnvShake;
  readonly downBounce: boolean;
  readonly hitId: number;
  readonly hitAttribute: string;
  readonly stateNumber: number;
  readonly stateDataOwnerId: string;
  readonly actionNumber: number;
  readonly stateType: 'S' | 'C' | 'A' | 'L';
  readonly physics: 'N' | 'S' | 'C' | 'A';
  readonly spritePriority: number;
}

export interface MugenProjectileSpawn {
  readonly ownerId: string;
  readonly projectileId?: number;
  readonly animationNumber?: number;
  readonly animationOwnerId?: string;
  readonly hitAnimationNumber?: number;
  readonly hitAnimationOwnerId?: string;
  readonly removeAnimationNumber?: number;
  readonly removeAnimationOwnerId?: string;
  readonly cancelAnimationNumber?: number;
  readonly cancelAnimationOwnerId?: string;
  readonly hitDefinition?: MugenResolvedHitDefinition;
  readonly priority?: number;
  readonly hitCount?: number;
  readonly missTime?: number;
  readonly position?: readonly [number, number];
  readonly velocity?: readonly [number, number];
  readonly acceleration?: readonly [number, number];
  readonly velocityMultiplier?: readonly [number, number];
  readonly removeVelocity?: readonly [number, number];
  readonly removeOnHit?: boolean;
  readonly removeTime?: number;
  readonly spritePriority?: number;
  readonly edgeBound?: number;
  readonly stageBound?: number;
  readonly heightBound?: readonly [number, number];
  readonly facing?: -1 | 1;
  readonly pauseMoveTime?: number;
  readonly superMoveTime?: number;
}

export interface MugenExplodSpawn {
  readonly ownerId: string;
  readonly explodId?: number;
  readonly animationNumber: number;
  readonly animationOwnerId?: string;
  readonly position?: readonly [number, number];
  readonly velocity?: readonly [number, number];
  readonly acceleration?: readonly [number, number];
  readonly velocityMultiplier?: readonly [number, number];
  readonly facing?: -1 | 1;
  readonly verticalFacing?: -1 | 1;
  readonly coordinateSpace?: MugenExplodCoordinateSpace;
  readonly bindTargetId?: string | null;
  readonly bindTime?: number;
  readonly bindOffset?: readonly [number, number];
  readonly removeTime?: number;
  readonly removeOnGetHit?: boolean;
  readonly layer?: MugenExplodLayer;
  readonly spritePriority?: number;
  readonly pauseMoveTime?: number;
  readonly superMoveTime?: number;
}

type Writable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableEntity = MutableRoot | MutableHelper | MutableProjectile | MutableExplod;
type MutableRoot = Writable<Omit<MugenRootEntitySnapshot, 'position' | 'targets' | 'bindOffset' | 'age'>> & { position: [number, number]; targets: MugenEntityTargetLink[]; bindOffset: [number, number]; age: number };
type MutableHelper = Writable<Omit<MugenHelperEntitySnapshot, 'position' | 'velocity' | 'getHitVelocity' | 'hitFallVelocity' | 'hitFallEnvShake' | 'integerVariables' | 'floatVariables' | 'hitAttributeSlots' | 'hitOverrides' | 'targets' | 'bindOffset' | 'constantOverrides' | 'age'>> & { position: [number, number]; velocity: [number, number]; getHitVelocity: [number, number]; hitFallVelocity: [number, number]; hitFallEnvShake: [number, number, number, number]; integerVariables: number[]; floatVariables: number[]; hitAttributeSlots: [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null]; hitOverrides: (MugenHitOverride | null)[]; targets: MugenEntityTargetLink[]; bindOffset: [number, number]; constantOverrides: Record<string, number>; age: number };
type MutableProjectile = Writable<Omit<MugenProjectileEntitySnapshot, 'position' | 'velocity' | 'acceleration' | 'velocityMultiplier' | 'removeVelocity' | 'heightBound' | 'age'>> & { position: [number, number]; velocity: [number, number]; acceleration: [number, number]; velocityMultiplier: [number, number]; removeVelocity: [number, number]; heightBound: [number, number]; age: number };
type MutableExplod = Writable<Omit<MugenExplodEntitySnapshot, 'position' | 'velocity' | 'acceleration' | 'velocityMultiplier' | 'bindOffset' | 'age'>> & { position: [number, number]; velocity: [number, number]; acceleration: [number, number]; velocityMultiplier: [number, number]; bindOffset: [number, number]; age: number };
type PendingSpawn = Readonly<{ entity: MutableEntity; operation: string }>;
type PendingModify = Readonly<{ entityId: string; operation: string; apply(entity: MutableEntity): void }>;

const DEFAULT_BUDGETS: MugenNormalizedEntityBudgets = Object.freeze({ maxHelpers: 56, maxProjectiles: 256, maxExplods: 256, maxEntities: 570, maxCommandsPerTick: 1_024 });

/** Deterministic lifecycle authority shared by Helper, Projectile and Explod controllers. */
export class MugenEntityAuthority {
  readonly budgets: MugenNormalizedEntityBudgets;
  readonly #entities = new Map<string, MutableEntity>();
  readonly #roots: readonly string[];
  readonly #pendingSpawns: PendingSpawn[] = [];
  readonly #pendingDestroy = new Set<string>();
  readonly #pendingModify: PendingModify[] = [];
  readonly #diagnostics: MugenEntityDiagnostic[] = [];
  readonly #projectileContacts = new Map<string, Writable<MugenProjectileContactRecord>>();
  readonly #positionFrozenHelpers = new Set<string>();
  #tick = 0;
  #open = false;
  #nextPlayerId = 1;
  #nextEntitySequence = 1;
  #commandCount = 0;

  constructor(roots: readonly MugenRootEntitySeed[], budgets: MugenEntityBudgets = {}) {
    if (roots.length < 1) throw new TypeError('MUGEN entity authority requires at least one root player.');
    this.budgets = normalizeBudgets(budgets, roots.length);
    const rootIds: string[] = [];
    const playerIds = new Set<number>();
    for (const [index, seed] of roots.entries()) {
      const entityId = nonEmpty(seed.entityId, `roots[${index}].entityId`);
      if (this.#entities.has(entityId)) throw new TypeError(`Duplicate MUGEN root entity id: ${entityId}.`);
      const playerId = boundedInteger(seed.playerId ?? index + 1, 1, 2_147_483_647, `roots[${index}].playerId`);
      if (playerIds.has(playerId)) throw new TypeError(`Duplicate MUGEN root player ID: ${playerId}.`);
      if (seed.team !== 0 && seed.team !== 1) throw new TypeError(`MUGEN root ${entityId} has an invalid team.`);
      const root: MutableRoot = { kind: 'root', entityId, playerId, team: seed.team, rootId: entityId, parentId: null, ownerId: entityId, position: vector(seed.position ?? [0, 0], `roots[${index}].position`), facing: facing(seed.facing ?? (index === 0 ? 1 : -1), `roots[${index}].facing`), targets: [], bindTargetId: null, bindTime: 0, bindOffset: [0, 0], createdTick: 0, age: 0 };
      this.#entities.set(entityId, root); rootIds.push(entityId); playerIds.add(playerId); this.#nextPlayerId = Math.max(this.#nextPlayerId, playerId + 1);
    }
    this.#roots = Object.freeze(rootIds);
  }

  static restore(snapshot: MugenEntityAuthoritySnapshot): MugenEntityAuthority {
    validateSnapshot(snapshot);
    const roots = snapshot.entities.filter((entity): entity is MugenRootEntitySnapshot => entity.kind === 'root').map(entity => ({ entityId: entity.entityId, playerId: entity.playerId, team: entity.team, position: entity.position, facing: entity.facing }));
    const authority = new MugenEntityAuthority(roots, snapshot.budgets);
    authority.#entities.clear();
    for (const entity of snapshot.entities) authority.#entities.set(entity.entityId, mutableEntity(entity));
    for (const contact of snapshot.projectileContacts) authority.#projectileContacts.set(contact.rootId, { ...contact });
    authority.#tick = snapshot.tick; authority.#nextPlayerId = snapshot.nextPlayerId; authority.#nextEntitySequence = snapshot.nextEntitySequence;
    return authority;
  }

  get tick(): number { return this.#tick; }
  get transactionOpen(): boolean { return this.#open; }
  entity(entityId: string): MugenEntitySnapshot | null { const entity = this.#entities.get(entityId); return entity === undefined ? null : freezeEntity(entity); }
  playerById(playerId: number): MugenPlayerEntitySnapshot | null { for (const entity of this.#entities.values()) if ((entity.kind === 'root' || entity.kind === 'helper') && entity.playerId === playerId) return freezeEntity(entity); return null; }
  children(parentId: string): readonly MugenEntitySnapshot[] { return Object.freeze(this.#orderedEntities().filter(entity => entity.parentId === parentId).map(freezeEntity)); }
  helpers(rootId?: string, helperId?: number): readonly MugenHelperEntitySnapshot[] { return Object.freeze(this.#orderedEntities().filter((entity): entity is MutableHelper => entity.kind === 'helper' && (rootId === undefined || entity.rootId === rootId) && (helperId === undefined || entity.helperId === helperId)).map(freezeEntity)); }
  projectiles(rootId?: string, projectileId?: number): readonly MugenProjectileEntitySnapshot[] { return Object.freeze(this.#orderedEntities().filter((entity): entity is MutableProjectile => entity.kind === 'projectile' && (rootId === undefined || entity.rootId === rootId) && (projectileId === undefined || entity.projectileId === projectileId)).map(freezeEntity)); }
  latestProjectileContact(rootId: string): MugenProjectileContactRecord | null { const contact = this.#projectileContacts.get(rootId); return contact === undefined ? null : Object.freeze({ ...contact }); }
  explods(rootId?: string, explodId?: number): readonly MugenExplodEntitySnapshot[] { return Object.freeze(this.#orderedEntities().filter((entity): entity is MutableExplod => entity.kind === 'explod' && (rootId === undefined || entity.rootId === rootId) && (explodId === undefined || entity.explodId === explodId)).map(freezeEntity)); }
  targets(entityId: string, targetId?: number): readonly MugenEntityTargetLink[] { const entity = this.#entities.get(entityId); if (entity?.kind !== 'root' && entity?.kind !== 'helper') return Object.freeze([]); return Object.freeze(entity.targets.filter(target => targetId === undefined || target.targetId === targetId).map(target => Object.freeze({ ...target }))); }

  beginTick(tick: number): this {
    if (this.#open) throw new Error('MUGEN entity tick is already open.');
    if (!Number.isSafeInteger(tick) || tick !== this.#tick + 1) throw new RangeError(`MUGEN entity tick must advance from ${this.#tick} to ${this.#tick + 1}.`);
    this.#tick = tick; this.#open = true; this.#commandCount = 0; this.#diagnostics.length = 0; this.#positionFrozenHelpers.clear(); return this;
  }

  spawnHelper(value: MugenHelperSpawn): string | null {
    if (!this.#acceptCommand('Helper', value.ownerId)) return null;
    const owner = this.#playerOwner(value.ownerId, 'Helper'); if (owner === null) return null;
    const playerId = value.playerId === undefined ? this.#allocatePlayerId() : boundedInteger(value.playerId, 1, 2_147_483_647, 'Helper.playerId');
    if (this.#playerIdExists(playerId)) { this.#diagnose('id-collision', 'Helper', value.ownerId, `MUGEN player ID ${playerId} already exists or is pending.`); return null; }
    const entityId = this.#allocateEntityId('helper');
    const stateNumber = int32(value.stateNumber ?? 0, 'Helper.stateno');
    const maxLife = positiveInteger(value.maxLife ?? (owner.kind === 'helper' ? owner.maxLife : 1_000), 'Helper.maxLife');
    const life = boundedInteger(value.life ?? maxLife, 0, maxLife, 'Helper.life');
    const juggleCapacity = nonNegative(value.juggleCapacity ?? (owner.kind === 'helper' ? owner.juggleCapacity : 15), 'Helper.juggleCapacity');
    const helper: MutableHelper = { kind: 'helper', entityId, playerId, helperId: int32(value.helperId ?? 0, 'Helper.id'), name: value.name?.trim() || 'helper', team: owner.team, rootId: owner.rootId, parentId: owner.entityId, ownerId: owner.entityId, stateNumber, previousStateNumber: stateNumber, stateTime: 0, stateGeneration: 0, stateDataOwnerId: owner.rootId, stateDefinitionPending: true, actionNumber: 0, actionTime: 0, position: vector(value.position ?? [0, 0], 'Helper.pos'), velocity: [0, 0], facing: facing(value.facing ?? 1, 'Helper.facing'), control: false, stateType: 'S', moveType: 'I', physics: 'N', life, maxLife, spritePriority: int32(value.spritePriority ?? 0, 'Helper.sprpriority'), juggleCost: 0, juggleCapacity, juggleRemaining: juggleCapacity, attackMultiplier: 1, defenseMultiplier: multiplier(value.defenseMultiplier ?? (owner.kind === 'helper' ? owner.defenseMultiplier : 1), 'Helper.defenseMultiplier'), playerPushEnabled: true, getHitVelocity: [0, 0], getHitYAcceleration: 0, hitFall: false, hitFallVelocity: [0, -4.5], hitFallDamage: 0, hitFallKill: true, hitFallRecover: true, hitFallRecoverTime: 4, hitFallEnvShake: [0, 60, -4, 0], hitDownBounce: false, hitElapsedTicks: 0, lastHitId: 0, lastHitAttribute: '', hitPauseTicks: 0, stunTicks: 0, stunKind: null, moveContact: 'none', moveContactTime: 0, hitCount: 0, activeHitDefinition: null, hitAttributeSlots: [null, null], hitOverrides: Array.from({ length: 8 }, () => null), integerVariables: Array.from({ length: 60 }, () => 0), floatVariables: Array.from({ length: 40 }, () => 0), targets: [], bindTargetId: null, bindTime: 0, bindOffset: [0, 0], keyControl: value.keyControl ?? false, pauseMoveTime: nonNegative(value.pauseMoveTime ?? 0, 'Helper.pausemovetime'), superMoveTime: nonNegative(value.superMoveTime ?? 0, 'Helper.supermovetime'), constantOverrides: constantOverrides(value.constantOverrides ?? {}), createdTick: this.#tick, age: 0 };
    this.#pendingSpawns.push({ entity: helper, operation: 'Helper' }); return entityId;
  }

  spawnProjectile(value: MugenProjectileSpawn): string | null {
    if (!this.#acceptCommand('Projectile', value.ownerId)) return null;
    const owner = this.#playerOwner(value.ownerId, 'Projectile'); if (owner === null) return null;
    const entityId = this.#allocateEntityId('projectile');
    const animationNumber = int32(value.animationNumber ?? 0, 'Projectile.projanim'); const animationOwnerId = nonEmpty(value.animationOwnerId ?? owner.rootId, 'Projectile.animationOwnerId'); const hitAnimationNumber = int32(value.hitAnimationNumber ?? -1, 'Projectile.projhitanim'); const hitAnimationOwnerId = nonEmpty(value.hitAnimationOwnerId ?? animationOwnerId, 'Projectile.hitAnimationOwnerId'); const removeAnimationNumber = int32(value.removeAnimationNumber ?? hitAnimationNumber, 'Projectile.projremanim'); const removeAnimationOwnerId = nonEmpty(value.removeAnimationOwnerId ?? hitAnimationOwnerId, 'Projectile.removeAnimationOwnerId'); const cancelAnimationNumber = int32(value.cancelAnimationNumber ?? removeAnimationNumber, 'Projectile.projcancelanim'); const cancelAnimationOwnerId = nonEmpty(value.cancelAnimationOwnerId ?? removeAnimationOwnerId, 'Projectile.cancelAnimationOwnerId');
    const heightBound = vector(value.heightBound ?? [-240, 1], 'Projectile.projheightbound'); if (heightBound[0] > heightBound[1]) throw new RangeError('MUGEN Projectile height bounds must be ordered.');
    const projectile: MutableProjectile = { kind: 'projectile', entityId, projectileId: int32(value.projectileId ?? 0, 'Projectile.projid'), team: owner.team, rootId: owner.rootId, parentId: owner.entityId, ownerId: owner.entityId, animationNumber, animationOwnerId, hitAnimationNumber, hitAnimationOwnerId, removeAnimationNumber, removeAnimationOwnerId, cancelAnimationNumber, cancelAnimationOwnerId, hitDefinition: value.hitDefinition === undefined ? null : Object.freeze({ ...value.hitDefinition }), priority: nonNegative(value.priority ?? 1, 'Projectile.projpriority'), remainingHits: nonNegative(value.hitCount ?? 1, 'Projectile.projhits'), missTime: nonNegative(value.missTime ?? 0, 'Projectile.projmisstime'), hitCooldown: 0, position: vector(value.position ?? [0, 0], 'Projectile.offset'), velocity: vector(value.velocity ?? [0, 0], 'Projectile.velocity'), acceleration: vector(value.acceleration ?? [0, 0], 'Projectile.accel'), velocityMultiplier: vector(value.velocityMultiplier ?? [1, 1], 'Projectile.velmul'), removeVelocity: vector(value.removeVelocity ?? [0, 0], 'Projectile.remvelocity'), removeOnHit: value.removeOnHit ?? true, removeTime: lifetime(value.removeTime ?? -1, 'Projectile.projremovetime'), spritePriority: int32(value.spritePriority ?? 3, 'Projectile.projsprpriority'), edgeBound: nonNegative(value.edgeBound ?? 40, 'Projectile.projedgebound'), stageBound: nonNegative(value.stageBound ?? 40, 'Projectile.projstagebound'), heightBound, facing: facing(value.facing ?? owner.facing, 'Projectile.facing'), terminalReason: null, terminalAge: 0, pauseMoveTime: nonNegative(value.pauseMoveTime ?? 0, 'Projectile.pausemovetime'), superMoveTime: nonNegative(value.superMoveTime ?? 0, 'Projectile.supermovetime'), contact: 'none', contactTime: -1, hitCount: 0, createdTick: this.#tick, age: 0 };
    this.#pendingSpawns.push({ entity: projectile, operation: 'Projectile' }); return entityId;
  }

  spawnExplod(value: MugenExplodSpawn): string | null {
    if (!this.#acceptCommand('Explod', value.ownerId)) return null;
    const owner = this.#playerOwner(value.ownerId, 'Explod'); if (owner === null) return null;
    const bindTargetId = value.bindTargetId === undefined ? owner.entityId : value.bindTargetId;
    const entityId = this.#allocateEntityId('explod');
    const explod: MutableExplod = { kind: 'explod', entityId, explodId: int32(value.explodId ?? 0, 'Explod.id'), team: owner.team, rootId: owner.rootId, parentId: owner.entityId, ownerId: owner.entityId, animationNumber: int32(value.animationNumber, 'Explod.anim'), animationOwnerId: nonEmpty(value.animationOwnerId ?? owner.rootId, 'Explod.animationOwnerId'), position: vector(value.position ?? [0, 0], 'Explod.pos'), velocity: vector(value.velocity ?? [0, 0], 'Explod.vel'), acceleration: vector(value.acceleration ?? [0, 0], 'Explod.accel'), velocityMultiplier: vector(value.velocityMultiplier ?? [1, 1], 'Explod.velmul'), facing: facing(value.facing ?? owner.facing, 'Explod.facing'), verticalFacing: facing(value.verticalFacing ?? 1, 'Explod.vfacing'), coordinateSpace: coordinateSpace(value.coordinateSpace ?? 'stage'), bindTargetId, bindTime: lifetime(value.bindTime ?? 1, 'Explod.bindtime'), bindOffset: vector(value.bindOffset ?? [0, 0], 'Explod.bindOffset'), removeTime: lifetime(value.removeTime ?? -2, 'Explod.removetime'), removeOnGetHit: value.removeOnGetHit ?? false, layer: layer(value.layer ?? 'below'), spritePriority: int32(value.spritePriority ?? 0, 'Explod.sprpriority'), pauseMoveTime: nonNegative(value.pauseMoveTime ?? 0, 'Explod.pausemovetime'), superMoveTime: nonNegative(value.superMoveTime ?? 0, 'Explod.supermovetime'), createdTick: this.#tick, age: 0 };
    this.#pendingSpawns.push({ entity: explod, operation: 'Explod' }); return entityId;
  }

  destroy(entityId: string): this { if (this.#acceptCommand('Destroy', entityId)) this.#pendingDestroy.add(nonEmpty(entityId, 'Destroy.entityId')); return this; }
  destroyOwned(ownerId: string, kind?: Exclude<MugenEntityKind, 'root'>, controllerId?: number): this {
    if (!this.#acceptCommand('RemoveOwned', ownerId)) return this;
    for (const entity of this.#entities.values()) if (entity.kind !== 'root' && entity.ownerId === ownerId && (kind === undefined || entity.kind === kind) && (controllerId === undefined || entity.kind === 'helper' && entity.helperId === controllerId || entity.kind === 'projectile' && entity.projectileId === controllerId || entity.kind === 'explod' && entity.explodId === controllerId)) this.#pendingDestroy.add(entity.entityId);
    return this;
  }
  removeExplodsOnOwnerGetHit(ownerId: string): this { this.#assertOpen(); for (const entity of this.#entities.values()) if (entity.kind === 'explod' && entity.ownerId === ownerId && entity.removeOnGetHit) this.#pendingDestroy.add(entity.entityId); return this; }

  setHelperPositionFrozen(entityId: string, value: boolean): this {
    this.#assertOpen(); this.#requireHelper(entityId);
    if (value) this.#positionFrozenHelpers.add(entityId); else this.#positionFrozenHelpers.delete(entityId);
    return this;
  }

  registerTarget(ownerId: string, targetEntityId: string, targetId: number): this { this.#assertOpen(); this.#registerTarget(ownerId, targetEntityId, targetId); return this; }
  recordTarget(ownerId: string, targetEntityId: string, targetId: number): this { if (this.#open) throw new Error('MUGEN committed target registration requires a closed entity transaction.'); this.#registerTarget(ownerId, targetEntityId, targetId); return this; }
  dropTargets(ownerId: string, excludeTargetId = -1, keepOne = true): this { this.#assertOpen(); const owner = this.#playerEntity(ownerId, 'TargetDrop'); if (owner === null) return this; const normalizedId = int32(excludeTargetId, 'TargetDrop.excludeid'); const eligible = normalizedId === -1 ? [] : owner.targets.filter(target => target.targetId === normalizedId); const retained = keepOne && eligible.length > 0 ? [eligible[0]!] : eligible; owner.targets.splice(0, owner.targets.length, ...retained); return this; }

  bind(entityId: string, targetId: string | null, time: number, offset: readonly [number, number] = [0, 0]): this { return this.#modify(entityId, 'Bind', entity => { if (entity.kind !== 'explod' && entity.kind !== 'helper') return; entity.bindTargetId = targetId; entity.bindTime = lifetime(time, 'Bind.time'); entity.bindOffset = vector(offset, 'Bind.offset'); }); }
  bindRoot(entityId: string, targetId: string, time: number, offset: readonly [number, number] = [0, 0]): this { this.#assertOpen(); const root = this.#entities.get(entityId); const target = this.#entities.get(targetId); if (root?.kind !== 'root' || target?.kind !== 'helper') throw new TypeError('MUGEN external root binding requires a root target and Helper owner.'); root.bindTargetId = target.entityId; root.bindTime = lifetime(time, 'TargetBind.time'); root.bindOffset = vector(offset, 'TargetBind.offset'); return this; }
  syncRoot(entityId: string, position: readonly [number, number], rootFacing: -1 | 1, targets?: readonly Readonly<{ fighterId: string; targetId: number }>[] ): this { this.#assertOpen(); const entity = this.#entities.get(entityId); if (entity?.kind !== 'root') throw new TypeError(`Unknown MUGEN root entity: ${entityId}.`); entity.position = vector(position, `${entityId}.position`); entity.facing = facing(rootFacing, `${entityId}.facing`); if (targets !== undefined) { const external = entity.targets.filter(target => this.#entities.get(target.entityId)?.kind === 'helper'); const roots = targets.map(target => Object.freeze({ entityId: target.fighterId, targetId: int32(target.targetId, `${entityId}.targetId`) })); entity.targets.splice(0, entity.targets.length, ...[...external, ...roots].sort((left, right) => left.entityId.localeCompare(right.entityId, 'en'))); } return this; }
  updateHelper(entityId: string, value: Partial<Pick<MugenHelperEntitySnapshot, 'stateNumber' | 'previousStateNumber' | 'stateTime' | 'stateGeneration' | 'stateDataOwnerId' | 'stateDefinitionPending' | 'actionNumber' | 'actionTime' | 'position' | 'velocity' | 'facing' | 'control' | 'stateType' | 'moveType' | 'physics'>>): this { this.#assertOpen(); const entity = this.#entities.get(entityId); if (entity?.kind !== 'helper') throw new TypeError(`Unknown MUGEN helper entity: ${entityId}.`); if (value.stateNumber !== undefined) entity.stateNumber = int32(value.stateNumber, 'Helper.stateNumber'); if (value.previousStateNumber !== undefined) entity.previousStateNumber = int32(value.previousStateNumber, 'Helper.previousStateNumber'); if (value.stateTime !== undefined) entity.stateTime = nonNegative(value.stateTime, 'Helper.stateTime'); if (value.stateGeneration !== undefined) entity.stateGeneration = nonNegative(value.stateGeneration, 'Helper.stateGeneration'); if (value.stateDataOwnerId !== undefined) entity.stateDataOwnerId = nonEmpty(value.stateDataOwnerId, 'Helper.stateDataOwnerId'); if (value.stateDefinitionPending !== undefined) entity.stateDefinitionPending = value.stateDefinitionPending; if (value.actionNumber !== undefined) entity.actionNumber = int32(value.actionNumber, 'Helper.actionNumber'); if (value.actionTime !== undefined) entity.actionTime = nonNegative(value.actionTime, 'Helper.actionTime'); if (value.position !== undefined) entity.position = vector(value.position, 'Helper.position'); if (value.velocity !== undefined) entity.velocity = vector(value.velocity, 'Helper.velocity'); if (value.facing !== undefined) entity.facing = facing(value.facing, 'Helper.facing'); if (value.control !== undefined) entity.control = value.control; if (value.stateType !== undefined) entity.stateType = value.stateType; if (value.moveType !== undefined) entity.moveType = value.moveType; if (value.physics !== undefined) entity.physics = value.physics; return this; }
  updateHelperCombat(entityId: string, value: Partial<Pick<MugenHelperEntitySnapshot, 'life' | 'spritePriority' | 'juggleCost' | 'juggleRemaining' | 'attackMultiplier' | 'defenseMultiplier' | 'playerPushEnabled' | 'hitFall' | 'hitFallDamage' | 'hitFallKill' | 'hitFallRecover' | 'hitFallRecoverTime' | 'hitDownBounce' | 'hitPauseTicks' | 'stunTicks' | 'stunKind' | 'moveContact' | 'moveContactTime' | 'hitCount'>>): this { this.#assertOpen(); const entity = this.#requireHelper(entityId); if (value.life !== undefined) entity.life = boundedInteger(value.life, 0, entity.maxLife, 'Helper.life'); if (value.spritePriority !== undefined) entity.spritePriority = int32(value.spritePriority, 'Helper.spritePriority'); if (value.juggleCost !== undefined) entity.juggleCost = int32(value.juggleCost, 'Helper.juggleCost'); if (value.juggleRemaining !== undefined) entity.juggleRemaining = boundedInteger(value.juggleRemaining, 0, entity.juggleCapacity, 'Helper.juggleRemaining'); if (value.attackMultiplier !== undefined) entity.attackMultiplier = multiplier(value.attackMultiplier, 'Helper.attackMultiplier'); if (value.defenseMultiplier !== undefined) entity.defenseMultiplier = multiplier(value.defenseMultiplier, 'Helper.defenseMultiplier'); if (value.playerPushEnabled !== undefined) entity.playerPushEnabled = value.playerPushEnabled; if (value.hitFall !== undefined) entity.hitFall = value.hitFall; if (value.hitFallDamage !== undefined) entity.hitFallDamage = nonNegative(value.hitFallDamage, 'Helper.hitFallDamage'); if (value.hitFallKill !== undefined) entity.hitFallKill = value.hitFallKill; if (value.hitFallRecover !== undefined) entity.hitFallRecover = value.hitFallRecover; if (value.hitFallRecoverTime !== undefined) entity.hitFallRecoverTime = nonNegative(value.hitFallRecoverTime, 'Helper.hitFallRecoverTime'); if (value.hitDownBounce !== undefined) entity.hitDownBounce = value.hitDownBounce; if (value.hitPauseTicks !== undefined) entity.hitPauseTicks = boundedInteger(value.hitPauseTicks, 0, 600, 'Helper.hitPauseTicks'); if (value.stunTicks !== undefined) entity.stunTicks = boundedInteger(value.stunTicks, 0, 3_600, 'Helper.stunTicks'); if (value.stunKind !== undefined) entity.stunKind = value.stunKind; if (value.moveContact !== undefined) entity.moveContact = value.moveContact; if (value.moveContactTime !== undefined) entity.moveContactTime = nonNegative(value.moveContactTime, 'Helper.moveContactTime'); if (value.hitCount !== undefined) entity.hitCount = nonNegative(value.hitCount, 'Helper.hitCount'); return this; }
  setHelperHitAttributeSlot(entityId: string, slot: 0 | 1, allowedAttributes: readonly string[], remainingTicks: number): this { this.#assertOpen(); const helper = this.#requireHelper(entityId); const normalizedTicks = boundedInteger(remainingTicks, -1, 3_600, 'Helper.HitBy.time'); if (!Array.isArray(allowedAttributes) || new Set(allowedAttributes).size !== allowedAttributes.length || allowedAttributes.some(value => typeof value !== 'string' || !/^[SCA]:(?:NA|SA|HA|NP|SP|HP|NT|ST|HT)$/u.test(value))) throw new TypeError('MUGEN Helper HitBy attributes are invalid.'); helper.hitAttributeSlots[slot] = normalizedTicks === 0 ? null : Object.freeze({ allowedAttributes: Object.freeze([...allowedAttributes].sort()), remainingTicks: normalizedTicks }); return this; }
  setHelperHitOverride(entityId: string, slot: number, value: Omit<MugenHitOverride, 'remainingTicks'> & Readonly<{ remainingTicks: number }>): this { this.#assertOpen(); const helper = this.#requireHelper(entityId); const normalizedSlot = boundedInteger(slot, 0, 7, 'Helper.HitOverride.slot'); const remainingTicks = boundedInteger(value.remainingTicks, -1, 3_600, 'Helper.HitOverride.time'); helper.hitOverrides[normalizedSlot] = remainingTicks === 0 ? null : Object.freeze({ attributes: Object.freeze([...value.attributes].sort()), stateNumber: int32(value.stateNumber, 'Helper.HitOverride.stateno'), stateDataOwnerId: nonEmpty(value.stateDataOwnerId, 'Helper.HitOverride.owner'), forceAir: value.forceAir, remainingTicks }); return this; }
  activateHelperHitDefinition(entityId: string, definition: MugenResolvedHitDefinition): this { this.#assertOpen(); const helper = this.#requireHelper(entityId); const activationId = `${entityId}:${helper.stateGeneration}:${definition.key}`; if (helper.activeHitDefinition?.activationId !== activationId) helper.activeHitDefinition = Object.freeze({ ...definition, activationId, hitTargets: Object.freeze([]) }); return this; }
  resetHelperStateEntry(entityId: string, preserveHitDefinition = false, preserveMoveContact = false, preserveHitCount = false): this { this.#assertOpen(); const helper = this.#requireHelper(entityId); if (!preserveHitDefinition) helper.activeHitDefinition = null; if (!preserveMoveContact) { helper.moveContact = 'none'; helper.moveContactTime = 0; } if (!preserveHitCount) helper.hitCount = 0; return this; }
  recordHelperAttackContact(entityId: string, targetEntityId: string, definition: MugenActiveHitDefinition, result: Exclude<MugenMoveContact, 'none' | 'reversed'>, hitCount: number, hitPauseTicks: number, spritePriority: number): this { if (this.#open) throw new Error('MUGEN committed Helper attack contact requires a closed entity transaction.'); const helper = this.#requireHelper(entityId); helper.moveContact = result; helper.moveContactTime = 0; if (result === 'hit') helper.hitCount = boundedInteger(helper.hitCount + nonNegative(hitCount, 'Helper.hitCount'), 0, Number.MAX_SAFE_INTEGER, 'Helper.hitCount'); helper.hitPauseTicks = boundedInteger(hitPauseTicks, 0, 600, 'Helper.hitPauseTicks'); helper.spritePriority = int32(spritePriority, 'Helper.spritePriority'); const active = helper.activeHitDefinition; if (active !== null && !active.hitTargets.includes(targetEntityId)) helper.activeHitDefinition = Object.freeze({ ...active, hitTargets: Object.freeze([...active.hitTargets, targetEntityId].sort(compareEntityIds)) }); this.#registerTarget(entityId, targetEntityId, definition.targetId); return this; }
  recordHelperReceivedHit(entityId: string, value: MugenHelperHitReceipt): this { if (this.#open) throw new Error('MUGEN committed Helper hit requires a closed entity transaction.'); const helper = this.#requireHelper(entityId); helper.life = Math.max(0, helper.life - nonNegative(value.damage, 'Helper.damage')); helper.hitPauseTicks = boundedInteger(value.hitPauseTicks, 0, 600, 'Helper.hitPauseTicks'); helper.stunTicks = boundedInteger(value.stunTicks, 1, 3_600, 'Helper.stunTicks'); helper.stunKind = value.stunKind; helper.getHitVelocity = vector(value.getHitVelocity, 'Helper.getHitVelocity'); helper.getHitYAcceleration = finite(value.yAcceleration, 'Helper.getHitYAcceleration'); helper.hitFall = value.fall; helper.hitFallVelocity = vector(value.fallVelocity, 'Helper.hitFallVelocity'); helper.hitFallDamage = nonNegative(value.fallDamage, 'Helper.hitFallDamage'); helper.hitFallKill = value.fallKill; helper.hitFallRecover = value.fallRecover; helper.hitFallRecoverTime = nonNegative(value.fallRecoverTime, 'Helper.hitFallRecoverTime'); helper.hitFallEnvShake = fallEnvShake(value.fallEnvShake, 'Helper.hitFallEnvShake'); helper.hitDownBounce = value.downBounce; helper.hitElapsedTicks = 0; helper.lastHitId = int32(value.hitId, 'Helper.lastHitId'); helper.lastHitAttribute = nonEmpty(value.hitAttribute, 'Helper.lastHitAttribute'); helper.previousStateNumber = helper.stateNumber; helper.stateNumber = int32(value.stateNumber, 'Helper.hitState'); helper.stateTime = 0; helper.stateGeneration = boundedInteger(helper.stateGeneration + 1, 0, Number.MAX_SAFE_INTEGER, 'Helper.stateGeneration'); helper.stateDataOwnerId = nonEmpty(value.stateDataOwnerId, 'Helper.hitStateOwner'); helper.stateDefinitionPending = true; helper.actionNumber = int32(value.actionNumber, 'Helper.hitAction'); helper.actionTime = 0; helper.stateType = value.stateType; helper.moveType = 'H'; helper.physics = value.physics; helper.velocity = vector(value.velocity, 'Helper.hitVelocity'); helper.control = false; helper.spritePriority = int32(value.spritePriority, 'Helper.spritePriority'); helper.activeHitDefinition = null; return this; }
  setHelperVariable(entityId: string, kind: 'integer' | 'float', index: number, value: number): this { this.#assertOpen(); const entity = this.#entities.get(entityId); if (entity?.kind !== 'helper') throw new TypeError(`Unknown MUGEN helper entity: ${entityId}.`); const values = kind === 'integer' ? entity.integerVariables : entity.floatVariables; const maximum = kind === 'integer' ? 59 : 39; values[boundedInteger(index, 0, maximum, `Helper.${kind}Variable.index`)] = kind === 'integer' ? int32(value, 'Helper.variable') : finite(value, 'Helper.floatVariable'); return this; }
  modifyExplod(entityId: string, value: Partial<Pick<MugenExplodSpawn, 'animationNumber' | 'animationOwnerId' | 'position' | 'velocity' | 'acceleration' | 'velocityMultiplier' | 'facing' | 'verticalFacing' | 'coordinateSpace' | 'removeTime' | 'removeOnGetHit' | 'bindTime' | 'layer' | 'spritePriority' | 'pauseMoveTime' | 'superMoveTime'>>): this { return this.#modify(entityId, 'ModifyExplod', entity => { if (entity.kind !== 'explod') return; if (value.animationNumber !== undefined) { entity.animationNumber = int32(value.animationNumber, 'ModifyExplod.anim'); entity.age = 0; } if (value.animationOwnerId !== undefined) entity.animationOwnerId = nonEmpty(value.animationOwnerId, 'ModifyExplod.animationOwnerId'); if (value.position !== undefined) entity.position = vector(value.position, 'ModifyExplod.pos'); if (value.velocity !== undefined) entity.velocity = vector(value.velocity, 'ModifyExplod.vel'); if (value.acceleration !== undefined) entity.acceleration = vector(value.acceleration, 'ModifyExplod.accel'); if (value.velocityMultiplier !== undefined) entity.velocityMultiplier = vector(value.velocityMultiplier, 'ModifyExplod.velmul'); if (value.facing !== undefined) entity.facing = facing(value.facing, 'ModifyExplod.facing'); if (value.verticalFacing !== undefined) entity.verticalFacing = facing(value.verticalFacing, 'ModifyExplod.vfacing'); if (value.coordinateSpace !== undefined) entity.coordinateSpace = coordinateSpace(value.coordinateSpace); if (value.removeTime !== undefined) entity.removeTime = lifetime(value.removeTime, 'ModifyExplod.removetime'); if (value.removeOnGetHit !== undefined) entity.removeOnGetHit = value.removeOnGetHit; if (value.bindTime !== undefined) entity.bindTime = lifetime(value.bindTime, 'ModifyExplod.bindtime'); if (value.layer !== undefined) entity.layer = layer(value.layer); if (value.spritePriority !== undefined) entity.spritePriority = int32(value.spritePriority, 'ModifyExplod.sprpriority'); if (value.pauseMoveTime !== undefined) entity.pauseMoveTime = nonNegative(value.pauseMoveTime, 'ModifyExplod.pausemovetime'); if (value.superMoveTime !== undefined) entity.superMoveTime = nonNegative(value.superMoveTime, 'ModifyExplod.supermovetime'); }); }
  markProjectileContact(entityId: string, contact: Exclude<MugenProjectileContact, 'none'>, hitCount = 1): this { return this.#modify(entityId, 'ProjectileContact', entity => { if (entity.kind !== 'projectile') return; entity.contact = contact; entity.contactTime = 0; this.#recordProjectileContact(entity, contact); if (contact === 'hit') entity.hitCount = boundedInteger(entity.hitCount + nonNegative(hitCount, 'Projectile.hitCount'), 0, Number.MAX_SAFE_INTEGER, 'Projectile.hitCount'); }); }

  /** Combat-phase contact is committed after script controllers have closed their queue. */
  recordProjectileContact(entityId: string, contact: Exclude<MugenProjectileContact, 'none'>, hitCount = 1): this { if (this.#open) throw new Error('MUGEN committed projectile contact requires a closed entity transaction.'); const entity = this.#entities.get(entityId); if (entity?.kind !== 'projectile' || entity.terminalReason !== null) return this; entity.contact = contact; entity.contactTime = 0; this.#recordProjectileContact(entity, contact); if (contact === 'hit') entity.hitCount = boundedInteger(entity.hitCount + nonNegative(hitCount, 'Projectile.hitCount'), 0, Number.MAX_SAFE_INTEGER, 'Projectile.hitCount'); if (contact === 'hit' || contact === 'guarded') { entity.remainingHits = Math.max(0, entity.remainingHits - 1); entity.hitCooldown = entity.remainingHits > 0 && entity.missTime > 0 ? Math.min(2_147_483_647, entity.missTime + 1) : 0; } if (entity.removeOnHit && entity.remainingHits === 0) this.#enterProjectileTerminal(entity, 'hit'); return this; }

  /** Resolve one already-detected enemy projectile collision using MUGEN priority rules. */
  recordProjectileCollision(leftId: string, rightId: string): this {
    if (this.#open) throw new Error('MUGEN committed projectile collision requires a closed entity transaction.');
    const left = this.#entities.get(leftId); const right = this.#entities.get(rightId);
    if (left?.kind !== 'projectile' || right?.kind !== 'projectile' || left.team === right.team || left.remainingHits < 1 || right.remainingHits < 1) return this;
    const cancel = (entity: MutableProjectile): void => { entity.contact = 'cancelled'; entity.contactTime = 0; entity.remainingHits = 0; entity.priority = 0; this.#recordProjectileContact(entity, 'cancelled'); this.#enterProjectileTerminal(entity, 'cancelled'); };
    if (left.priority === right.priority) { cancel(left); cancel(right); }
    else if (left.priority > right.priority) { cancel(right); left.priority -= 1; }
    else { cancel(left); right.priority -= 1; }
    return this;
  }

  removeProjectilesOutsideBounds(stageLeft: number, stageRight: number, screenLeft = stageLeft, screenRight = stageRight): this { if (this.#open) throw new Error('MUGEN committed projectile bounds require a closed entity transaction.'); const left = finite(stageLeft, 'Projectile.stageLeft'); const right = finite(stageRight, 'Projectile.stageRight'); const viewportLeft = finite(screenLeft, 'Projectile.screenLeft'); const viewportRight = finite(screenRight, 'Projectile.screenRight'); if (left > right || viewportLeft > viewportRight) throw new RangeError('MUGEN projectile stage/screen bounds must be ordered.'); for (const entity of this.#entities.values()) if (entity.kind === 'projectile' && entity.terminalReason === null && (entity.position[0] < left - entity.stageBound || entity.position[0] > right + entity.stageBound || entity.position[0] < viewportLeft - entity.edgeBound || entity.position[0] > viewportRight + entity.edgeBound || entity.position[1] < entity.heightBound[0] || entity.position[1] > entity.heightBound[1])) this.#enterProjectileTerminal(entity, 'removed'); return this; }
  completeProjectileTerminal(entityId: string): this { if (this.#open) throw new Error('MUGEN committed projectile removal requires a closed entity transaction.'); const entity = this.#entities.get(entityId); if (entity?.kind === 'projectile' && entity.terminalReason !== null) this.#entities.delete(entityId); return this; }

  commit(): MugenEntityCommitResult {
    this.#assertOpen();
    const destroyed = new Set<string>();
    for (const id of this.#pendingDestroy) this.#collectDestruction(id, destroyed);
    for (const id of [...destroyed].sort(compareEntityIds)) if (this.#entities.get(id)?.kind !== 'root') this.#entities.delete(id);
    for (const entity of this.#entities.values()) if (entity.kind === 'root' || entity.kind === 'helper') entity.targets.splice(0, entity.targets.length, ...entity.targets.filter(target => !destroyed.has(target.entityId)));
    for (const modification of this.#pendingModify) { const entity = this.#entities.get(modification.entityId); if (entity !== undefined && !destroyed.has(entity.entityId)) modification.apply(entity); }
    const spawned: string[] = [];
    for (const pending of this.#pendingSpawns) {
      const entity = pending.entity;
      if (destroyed.has(entity.ownerId) || !this.#entities.has(entity.ownerId)) { this.#diagnose('owner-destroyed', pending.operation, entity.entityId, `MUGEN ${pending.operation} owner ${entity.ownerId} was destroyed before spawn commit.`); continue; }
      const budget = this.#budgetAllows(entity.kind);
      if (budget !== null) { this.#diagnose('entity-budget', pending.operation, entity.entityId, budget); continue; }
      this.#entities.set(entity.entityId, entity); spawned.push(entity.entityId);
    }
    this.#pendingDestroy.clear(); this.#pendingModify.length = 0; this.#pendingSpawns.length = 0; this.#open = false;
    const diagnostics = Object.freeze(this.#diagnostics.map(value => Object.freeze({ ...value })));
    const base = Object.freeze({ tick: this.#tick, spawned: Object.freeze(spawned), destroyed: Object.freeze([...destroyed].filter(id => !this.#roots.includes(id)).sort(compareEntityIds)), diagnostics });
    return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }

  advance(paused = false, superPaused = false): this {
    if (this.#open) throw new Error('MUGEN entities cannot advance during an open transaction.');
    for (const contact of this.#projectileContacts.values()) contact.contactTime = boundedInteger(contact.contactTime + 1, 0, Number.MAX_SAFE_INTEGER, `${contact.rootId}.projectileContactTime`);
    for (const entity of this.#orderedEntities()) {
      if (entity.kind === 'helper' && entity.createdTick === this.#tick) continue;
      const helperHitPaused = entity.kind === 'helper' && entity.hitPauseTicks > 0;
      if (entity.kind === 'helper' && entity.hitPauseTicks > 0) entity.hitPauseTicks -= 1;
      const canMove = !helperHitPaused && (!superPaused ? (!paused || entity.kind === 'root' || entity.pauseMoveTime > 0) : entity.kind === 'root' || entity.superMoveTime > 0);
      if ('pauseMoveTime' in entity && paused && entity.pauseMoveTime > 0) entity.pauseMoveTime -= 1;
      if ('superMoveTime' in entity && superPaused && entity.superMoveTime > 0) entity.superMoveTime -= 1;
      if (!canMove) continue;
      entity.age = boundedInteger(entity.age + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.age`);
      if (entity.kind === 'root' && entity.bindTargetId !== null) { if (entity.bindTime === 0) entity.bindTargetId = null; else { const target = this.#entities.get(entity.bindTargetId); if (target?.kind === 'helper') { entity.position = [finite(target.position[0] + entity.bindOffset[0] * target.facing, `${entity.entityId}.bind.x`), finite(target.position[1] + entity.bindOffset[1], `${entity.entityId}.bind.y`)]; if (entity.bindTime > 0) entity.bindTime -= 1; } else { entity.bindTargetId = null; entity.bindTime = 0; } } }
      if (entity.kind === 'helper') { if (entity.bindTargetId !== null && entity.bindTime !== 0) { const target = this.#entities.get(entity.bindTargetId); if (target !== undefined && 'position' in target) { const targetFacing = 'facing' in target ? target.facing : 1; entity.position = [finite(target.position[0] + entity.bindOffset[0] * targetFacing, `${entity.entityId}.bind.x`), finite(target.position[1] + entity.bindOffset[1], `${entity.entityId}.bind.y`)]; } else { entity.bindTargetId = null; entity.bindTime = 0; } if (entity.bindTime > 0 && --entity.bindTime === 0) entity.bindTargetId = null; } else { entity.bindTargetId = null; if (!this.#positionFrozenHelpers.has(entity.entityId)) { entity.position[0] = finite(entity.position[0] + entity.velocity[0], `${entity.entityId}.position.x`); entity.position[1] = finite(entity.position[1] + entity.velocity[1], `${entity.entityId}.position.y`); } } if (entity.stunTicks > 0) { entity.stunTicks -= 1; if (entity.stunTicks === 0) entity.stunKind = null; } decrementHelperCombatTimers(entity); if (entity.moveContact !== 'none') entity.moveContactTime = boundedInteger(entity.moveContactTime + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.moveContactTime`); if (entity.moveType === 'H') entity.hitElapsedTicks = boundedInteger(entity.hitElapsedTicks + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.hitElapsedTicks`); entity.stateTime = boundedInteger(entity.stateTime + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.stateTime`); entity.actionTime = boundedInteger(entity.actionTime + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.actionTime`); }
      if (entity.kind === 'projectile' || entity.kind === 'explod') {
        if (entity.kind === 'explod' && entity.bindTargetId !== null && entity.bindTime !== 0) { const target = this.#entities.get(entity.bindTargetId); if (target !== undefined && 'position' in target) { const targetFacing = 'facing' in target ? target.facing : 1; entity.position = [finite(target.position[0] + entity.bindOffset[0] * targetFacing, `${entity.entityId}.bind.x`), finite(target.position[1] + entity.bindOffset[1], `${entity.entityId}.bind.y`)]; } else { entity.bindTargetId = null; entity.bindTime = 0; } if (entity.bindTime > 0 && --entity.bindTime === 0) entity.bindTargetId = null; }
        else { entity.velocity[0] = finite(entity.velocity[0] * entity.velocityMultiplier[0] + entity.acceleration[0], `${entity.entityId}.velocity.x`); entity.velocity[1] = finite(entity.velocity[1] * entity.velocityMultiplier[1] + entity.acceleration[1], `${entity.entityId}.velocity.y`); entity.position[0] = finite(entity.position[0] + entity.velocity[0], `${entity.entityId}.position.x`); entity.position[1] = finite(entity.position[1] + entity.velocity[1], `${entity.entityId}.position.y`); }
        if (entity.kind === 'projectile' && entity.terminalReason !== null) entity.terminalAge = boundedInteger(entity.terminalAge + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.terminalAge`);
        if (entity.kind === 'projectile' && entity.hitCooldown > 0) entity.hitCooldown -= 1;
        if (entity.removeTime > 0) { entity.removeTime -= 1; if (entity.kind === 'projectile' && entity.removeTime === 0) this.#enterProjectileTerminal(entity, 'removed'); }
        if (entity.kind === 'projectile' && entity.contact !== 'none') entity.contactTime = boundedInteger(entity.contactTime + 1, 0, Number.MAX_SAFE_INTEGER, `${entity.entityId}.contactTime`);
      }
    }
    for (const entity of this.#orderedEntities()) if (entity.kind === 'explod' && entity.removeTime === 0) this.#entities.delete(entity.entityId);
    this.#positionFrozenHelpers.clear();
    return this;
  }

  removeCompletedExplods(animationDurationByOwner?: ReadonlyMap<string, ReadonlyMap<number, number | null>>): this { if (this.#open) throw new Error('MUGEN completed Explod removal requires a closed entity transaction.'); if (animationDurationByOwner === undefined) return this; for (const entity of this.#orderedEntities()) { if (entity.kind !== 'explod' || entity.removeTime !== -2) continue; const duration = animationDurationByOwner.get(entity.animationOwnerId)?.get(entity.animationNumber); if (duration !== undefined && duration !== null && entity.age >= duration) this.#entities.delete(entity.entityId); } return this; }

  clearRoundEntities(): this { if (this.#open) throw new Error('MUGEN round entities cannot clear during an open transaction.'); for (const entity of this.#orderedEntities()) if (entity.kind !== 'root') this.#entities.delete(entity.entityId); for (const rootId of this.#roots) { const root = this.#entities.get(rootId) as MutableRoot; root.targets.length = 0; root.bindTargetId = null; root.bindTime = 0; root.bindOffset = [0, 0]; } this.#projectileContacts.clear(); return this; }

  snapshot(): MugenEntityAuthoritySnapshot {
    if (this.#open) throw new Error('MUGEN entity snapshot requires a committed transaction.');
    const entities = Object.freeze(this.#orderedEntities().map(freezeEntity));
    const projectileContacts = Object.freeze([...this.#projectileContacts.values()].sort((left, right) => left.rootId.localeCompare(right.rootId, 'en')).map(contact => Object.freeze({ ...contact })));
    const base = Object.freeze({ schemaVersion: 4 as const, revision: 'm09-g08-entity-authority-v4' as const, tick: this.#tick, nextPlayerId: this.#nextPlayerId, nextEntitySequence: this.#nextEntitySequence, budgets: this.budgets, entities, projectileContacts });
    return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }

  #modify(entityId: string, operation: string, apply: PendingModify['apply']): this { if (this.#acceptCommand(operation, entityId)) this.#pendingModify.push(Object.freeze({ entityId: nonEmpty(entityId, `${operation}.entityId`), operation, apply })); return this; }
  #enterProjectileTerminal(entity: MutableProjectile, reason: MugenProjectileTerminalReason): void { if (entity.terminalReason !== null) return; const animationNumber = reason === 'hit' ? entity.hitAnimationNumber : reason === 'cancelled' ? entity.cancelAnimationNumber : entity.removeAnimationNumber; const animationOwnerId = reason === 'hit' ? entity.hitAnimationOwnerId : reason === 'cancelled' ? entity.cancelAnimationOwnerId : entity.removeAnimationOwnerId; entity.terminalReason = reason; entity.terminalAge = 0; entity.animationNumber = animationNumber < 0 ? entity.animationNumber : animationNumber; entity.animationOwnerId = animationNumber < 0 ? entity.animationOwnerId : animationOwnerId; entity.age = 0; entity.velocity = [...entity.removeVelocity]; entity.acceleration = [0, 0]; entity.velocityMultiplier = [1, 1]; entity.hitDefinition = null; entity.remainingHits = 0; entity.hitCooldown = 0; entity.removeTime = -1; }
  #recordProjectileContact(entity: MutableProjectile, contact: Exclude<MugenProjectileContact, 'none'>): void { this.#projectileContacts.set(entity.rootId, { rootId: entity.rootId, entityId: entity.entityId, projectileId: entity.projectileId, contact, contactTime: 0, contactTick: this.#tick }); }
  #registerTarget(ownerId: string, targetEntityId: string, targetId: number): void { const owner = this.#playerEntity(ownerId, 'Target'); const target = this.#playerEntity(targetEntityId, 'Target'); if (owner === null || target === null) throw new TypeError('MUGEN target registration requires two existing player entities.'); if (owner.entityId === target.entityId || owner.team === target.team) throw new TypeError('MUGEN target must be a different enemy player entity.'); const link = Object.freeze({ entityId: target.entityId, targetId: int32(targetId, 'Target.id') }); owner.targets.splice(0, owner.targets.length, ...[...owner.targets.filter(value => value.entityId !== target.entityId), link].sort((left, right) => left.entityId.localeCompare(right.entityId, 'en')).slice(0, 8)); }
  #playerEntity(entityId: string, operation: string): MutableRoot | MutableHelper | null { const entity = this.#entities.get(entityId); if (entity === undefined) return null; if (entity.kind !== 'root' && entity.kind !== 'helper') throw new TypeError(`MUGEN ${operation} entity ${entityId} is not a player entity.`); return entity; }
  #requireHelper(entityId: string): MutableHelper { const entity = this.#entities.get(entityId); if (entity?.kind !== 'helper') throw new TypeError(`Unknown MUGEN Helper entity: ${entityId}.`); return entity; }
  #acceptCommand(operation: string, entityId: string | null): boolean { this.#assertOpen(); this.#commandCount += 1; if (this.#commandCount <= this.budgets.maxCommandsPerTick) return true; this.#diagnose('command-budget', operation, entityId, `MUGEN entity command budget ${this.budgets.maxCommandsPerTick} exceeded.`); return false; }
  #playerOwner(entityId: string, operation: string): MutableRoot | MutableHelper | null { const owner = this.#entities.get(entityId) ?? this.#pendingSpawns.find(value => value.entity.entityId === entityId)?.entity; if (owner === undefined) { this.#diagnose('missing-owner', operation, entityId, `MUGEN ${operation} owner ${entityId} does not exist.`); return null; } if (owner.kind !== 'root' && owner.kind !== 'helper') { this.#diagnose('invalid-owner', operation, entityId, `MUGEN ${operation} owner ${entityId} is not a player entity.`); return null; } return owner; }
  #allocatePlayerId(): number { while (this.#playerIdExists(this.#nextPlayerId)) this.#nextPlayerId += 1; return this.#nextPlayerId++; }
  #playerIdExists(playerId: number): boolean { for (const entity of this.#entities.values()) if ((entity.kind === 'root' || entity.kind === 'helper') && entity.playerId === playerId) return true; return this.#pendingSpawns.some(value => (value.entity.kind === 'root' || value.entity.kind === 'helper') && value.entity.playerId === playerId); }
  #allocateEntityId(kind: Exclude<MugenEntityKind, 'root'>): string { let id = ''; do { id = `${kind}:${this.#nextEntitySequence.toString().padStart(10, '0')}`; this.#nextEntitySequence += 1; } while (this.#entities.has(id) || this.#pendingSpawns.some(value => value.entity.entityId === id)); return id; }
  #collectDestruction(entityId: string, result: Set<string>): void { if (result.has(entityId)) return; const entity = this.#entities.get(entityId); if (entity === undefined || entity.kind === 'root') return; result.add(entityId); for (const child of this.#entities.values()) if (child.parentId === entityId || child.ownerId === entityId) this.#collectDestruction(child.entityId, result); }
  #budgetAllows(kind: MugenEntityKind): string | null { const count = (target: MugenEntityKind): number => [...this.#entities.values()].filter(entity => entity.kind === target).length; if (this.#entities.size >= this.budgets.maxEntities) return `MUGEN total entity budget ${this.budgets.maxEntities} exceeded.`; if (kind === 'helper' && count(kind) >= this.budgets.maxHelpers) return `MUGEN Helper budget ${this.budgets.maxHelpers} exceeded.`; if (kind === 'projectile' && count(kind) >= this.budgets.maxProjectiles) return `MUGEN Projectile budget ${this.budgets.maxProjectiles} exceeded.`; if (kind === 'explod' && count(kind) >= this.budgets.maxExplods) return `MUGEN Explod budget ${this.budgets.maxExplods} exceeded.`; return null; }
  #diagnose(code: MugenEntityDiagnosticCode, operation: string, entityId: string | null, message: string): void { this.#diagnostics.push(Object.freeze({ code, tick: this.#tick, operation, entityId, message })); }
  #orderedEntities(): MutableEntity[] { return [...this.#entities.values()].sort((left, right) => left.kind === 'root' && right.kind !== 'root' ? -1 : right.kind === 'root' && left.kind !== 'root' ? 1 : left.createdTick - right.createdTick || compareEntityIds(left.entityId, right.entityId)); }
  #assertOpen(): void { if (!this.#open) throw new Error('MUGEN entity mutation requires an open tick transaction.'); }
}

function freezeEntity<T extends MutableEntity>(entity: T): T extends MutableRoot ? MugenRootEntitySnapshot : T extends MutableHelper ? MugenHelperEntitySnapshot : T extends MutableProjectile ? MugenProjectileEntitySnapshot : MugenExplodEntitySnapshot { const copy = { ...entity, ...('position' in entity ? { position: Object.freeze([...entity.position]) } : {}), ...(entity.kind === 'root' ? { targets: Object.freeze(entity.targets.map(target => Object.freeze({ ...target }))), bindOffset: Object.freeze([...entity.bindOffset]) } : {}), ...(entity.kind === 'helper' ? { velocity: Object.freeze([...entity.velocity]), getHitVelocity: Object.freeze([...entity.getHitVelocity]), hitFallVelocity: Object.freeze([...entity.hitFallVelocity]), hitFallEnvShake: Object.freeze([...entity.hitFallEnvShake]), activeHitDefinition: entity.activeHitDefinition === null ? null : Object.freeze({ ...entity.activeHitDefinition, hitTargets: Object.freeze([...entity.activeHitDefinition.hitTargets]) }), hitAttributeSlots: Object.freeze(entity.hitAttributeSlots.map(slot => slot === null ? null : Object.freeze({ ...slot, allowedAttributes: Object.freeze([...slot.allowedAttributes]) }))), hitOverrides: Object.freeze(entity.hitOverrides.map(override => override === null ? null : Object.freeze({ ...override, attributes: Object.freeze([...override.attributes]) }))), integerVariables: Object.freeze([...entity.integerVariables]), floatVariables: Object.freeze([...entity.floatVariables]), targets: Object.freeze(entity.targets.map(target => Object.freeze({ ...target }))), bindOffset: Object.freeze([...entity.bindOffset]), constantOverrides: Object.freeze({ ...entity.constantOverrides }) } : {}), ...(entity.kind === 'projectile' ? { velocity: Object.freeze([...entity.velocity]), acceleration: Object.freeze([...entity.acceleration]), velocityMultiplier: Object.freeze([...entity.velocityMultiplier]), removeVelocity: Object.freeze([...entity.removeVelocity]), heightBound: Object.freeze([...entity.heightBound]) } : entity.kind === 'explod' ? { velocity: Object.freeze([...entity.velocity]), acceleration: Object.freeze([...entity.acceleration]), velocityMultiplier: Object.freeze([...entity.velocityMultiplier]), bindOffset: Object.freeze([...entity.bindOffset]) } : {}) }; return Object.freeze(copy) as never; }
function mutableEntity(entity: MugenEntitySnapshot): MutableEntity { if (entity.kind === 'root') return { ...entity, position: [...entity.position], targets: entity.targets.map(target => ({ ...target })), bindOffset: [...entity.bindOffset] }; if (entity.kind === 'helper') return { ...entity, position: [...entity.position], velocity: [...entity.velocity], getHitVelocity: [...entity.getHitVelocity], hitFallVelocity: [...entity.hitFallVelocity], hitFallEnvShake: fallEnvShake(entity.hitFallEnvShake, 'Helper.hitFallEnvShake'), activeHitDefinition: entity.activeHitDefinition === null ? null : Object.freeze({ ...entity.activeHitDefinition, hitTargets: Object.freeze([...entity.activeHitDefinition.hitTargets]) }), hitAttributeSlots: entity.hitAttributeSlots.map(slot => slot === null ? null : Object.freeze({ ...slot, allowedAttributes: Object.freeze([...slot.allowedAttributes]) })) as [MugenHitAttributeSlot | null, MugenHitAttributeSlot | null], hitOverrides: entity.hitOverrides.map(override => override === null ? null : Object.freeze({ ...override, attributes: Object.freeze([...override.attributes]) })), integerVariables: [...entity.integerVariables], floatVariables: [...entity.floatVariables], targets: entity.targets.map(target => ({ ...target })), bindOffset: [...entity.bindOffset], constantOverrides: constantOverrides(entity.constantOverrides) }; if (entity.kind === 'projectile') return { ...entity, position: [...entity.position], velocity: [...entity.velocity], acceleration: [...entity.acceleration], velocityMultiplier: [...entity.velocityMultiplier], removeVelocity: [...entity.removeVelocity], heightBound: [...entity.heightBound] }; return { ...entity, position: [...entity.position], velocity: [...entity.velocity], acceleration: [...entity.acceleration], velocityMultiplier: [...entity.velocityMultiplier], bindOffset: [...entity.bindOffset] }; }
function decrementHelperCombatTimers(helper: MutableHelper): void { helper.hitAttributeSlots.forEach((value, slot) => { if (value !== null && value.remainingTicks > 0) helper.hitAttributeSlots[slot] = value.remainingTicks === 1 ? null : Object.freeze({ allowedAttributes: value.allowedAttributes, remainingTicks: value.remainingTicks - 1 }); }); helper.hitOverrides.forEach((value, slot) => { if (value !== null && value.remainingTicks > 0) helper.hitOverrides[slot] = value.remainingTicks === 1 ? null : Object.freeze({ attributes: value.attributes, stateNumber: value.stateNumber, stateDataOwnerId: value.stateDataOwnerId, forceAir: value.forceAir, remainingTicks: value.remainingTicks - 1 }); }); }
function validateSnapshot(snapshot: MugenEntityAuthoritySnapshot): void { if (!snapshot || snapshot.schemaVersion !== 4 || snapshot.revision !== 'm09-g08-entity-authority-v4') throw new TypeError('MUGEN entity snapshot is invalid.'); const { hash: _hash, ...base } = snapshot; if (snapshot.hash !== hashSimulationState(base as unknown as SimulationStateValue)) throw new TypeError('MUGEN entity snapshot hash is invalid.'); if (!Array.isArray(snapshot.entities) || snapshot.entities.filter(entity => entity.kind === 'root').length < 1) throw new TypeError('MUGEN entity snapshot has no roots.'); if (!Array.isArray(snapshot.projectileContacts)) throw new TypeError('MUGEN entity snapshot has invalid projectile contact history.'); }
function normalizeBudgets(input: MugenEntityBudgets, rootCount: number): MugenNormalizedEntityBudgets { const maxHelpers = boundedInteger(input.maxHelpers ?? DEFAULT_BUDGETS.maxHelpers, 0, 4_096, 'maxHelpers'); const maxProjectiles = boundedInteger(input.maxProjectiles ?? DEFAULT_BUDGETS.maxProjectiles, 0, 16_384, 'maxProjectiles'); const maxExplods = boundedInteger(input.maxExplods ?? DEFAULT_BUDGETS.maxExplods, 0, 16_384, 'maxExplods'); const maximum = rootCount + maxHelpers + maxProjectiles + maxExplods; const maxEntities = boundedInteger(input.maxEntities ?? Math.min(DEFAULT_BUDGETS.maxEntities, maximum), rootCount, maximum, 'maxEntities'); return Object.freeze({ maxHelpers, maxProjectiles, maxExplods, maxEntities, maxCommandsPerTick: boundedInteger(input.maxCommandsPerTick ?? DEFAULT_BUDGETS.maxCommandsPerTick, 1, 65_536, 'maxCommandsPerTick') }); }
function compareEntityIds(left: string, right: string): number { return left.localeCompare(right, 'en'); }
function nonEmpty(value: string, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`MUGEN ${label} must be non-empty.`); return value; }
function boundedInteger(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`MUGEN ${label} must be an integer from ${minimum} to ${maximum}.`); return value; }
function int32(value: number, label: string): number { return boundedInteger(value, -2_147_483_648, 2_147_483_647, label); }
function nonNegative(value: number, label: string): number { return boundedInteger(value, 0, 2_147_483_647, label); }
function positiveInteger(value: number, label: string): number { return boundedInteger(value, 1, 2_147_483_647, label); }
function lifetime(value: number, label: string): number { return boundedInteger(value, -2, 2_147_483_647, label); }
function finite(value: number, label: string): number { if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000_000) throw new RangeError(`MUGEN ${label} exceeds the finite float budget.`); const result = Math.fround(value); return Object.is(result, -0) ? 0 : result; }
function constantOverrides(value: Readonly<Record<string, number>>): Record<string, number> { const result: Record<string, number> = {}; for (const [rawKey, rawValue] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right, 'en'))) { const key = rawKey.trim().toLowerCase(); if (key === '') throw new TypeError('MUGEN Helper constant override key must be non-empty.'); result[key] = finite(rawValue, `Helper constant ${key}`); } return result; }
function multiplier(value: number, label: string): number { const result = finite(value, label); if (result < 0 || result > 100) throw new RangeError(`MUGEN ${label} must be from 0 to 100.`); return result; }
function vector(value: readonly [number, number], label: string): [number, number] { if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`MUGEN ${label} must be a pair.`); return [finite(value[0], `${label}.x`), finite(value[1], `${label}.y`)]; }
function fallEnvShake(value: MugenFallEnvShake, label: string): [number, number, number, number] { if (!Array.isArray(value) || value.length !== 4) throw new TypeError(`MUGEN ${label} must contain four values.`); const frequency = finite(value[1], `${label}.frequency`); if (frequency < 0 || frequency > 180) throw new RangeError(`MUGEN ${label}.frequency must be from 0 to 180.`); return [boundedInteger(value[0], 0, 1_000_000, `${label}.time`), frequency, finite(value[2], `${label}.amplitude`), finite(value[3], `${label}.phase`)]; }
function facing(value: number, label: string): -1 | 1 { if (value !== -1 && value !== 1) throw new TypeError(`MUGEN ${label} must be -1 or 1.`); return value; }
function layer(value: string): MugenExplodLayer { if (value !== 'below' && value !== 'above') throw new TypeError('MUGEN Explod layer must be below or above.'); return value; }
function coordinateSpace(value: string): MugenExplodCoordinateSpace { if (value !== 'stage' && value !== 'screen') throw new TypeError('MUGEN Explod coordinate space must be stage or screen.'); return value; }
