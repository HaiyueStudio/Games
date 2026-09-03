import { hashSimulationState, type SimulationStateValue } from '@haiyue/engine/experimental/simulation';
import { evaluateMugenAirAction, type MugenAirSnapshot, type MugenAirWorldCollisionBox } from '../../import/air/MugenAirRuntime';
import type { MugenAirAction, MugenAirBank } from '../../import/air/types';
import type { MugenInputHistory, MugenPlayerInputFrame, MugenTickInput } from '../input/MugenInputRuntime';
import type { MugenHelperEntitySnapshot, MugenProjectileEntitySnapshot } from '../entities/MugenEntityAuthority';
import type { MugenActiveHitDefinition, MugenActiveReversalDefinition, MugenFighterSnapshot, MugenHeadlessMatch, MugenHitOverride, MugenMatchSnapshot } from '../match/MugenMatchState';
import { MugenScriptRuntime, type MugenScriptAnimationContext, type MugenScriptStepContext, type MugenScriptTickTrace } from '../script/MugenScriptRuntime';
import { MugenStageCamera, type MugenStageCameraConfig, type MugenStageCameraSnapshot } from '../stage/MugenStageCamera';

export interface MugenCombatFighterConfig {
  readonly fighterId: string;
  readonly air: MugenAirBank;
  readonly coordinateScale?: number;
  readonly neutralState?: number;
  readonly neutralAction?: number;
  readonly hitState?: number;
  readonly hitAction?: number;
  readonly airHitState?: number;
  readonly airHitAction?: number;
  readonly guardState?: number;
  readonly guardAction?: number;
}

export interface MugenCombatConfig {
  readonly fighters: readonly [MugenCombatFighterConfig, MugenCombatFighterConfig];
  readonly fightAir?: MugenAirBank;
  readonly fightCoordinateScale?: number;
  readonly stageBounds?: readonly [left: number, right: number];
  readonly screenBounds?: readonly [left: number, right: number];
  readonly camera?: MugenStageCameraConfig;
  readonly coordinateScale?: number;
  readonly guardDistance?: number;
  readonly koHoldTicks?: number;
}

export interface MugenCombatContactTrace { readonly attackerId: string; readonly defenderId: string; readonly result: 'hit' | 'guarded' | 'reversed'; readonly damage: number; readonly activationId: string }
export interface MugenCombatTickTrace { readonly tick: number; readonly script: MugenScriptTickTrace; readonly contacts: readonly MugenCombatContactTrace[]; readonly animationHashes: readonly string[]; readonly camera: MugenStageCameraSnapshot; readonly hash: string }

interface NormalizedFighterConfig extends Required<Omit<MugenCombatFighterConfig, 'air'>> { readonly actions: ReadonlyMap<number, MugenAirAction> }
interface PendingContact { readonly attacker: MugenFighterSnapshot; readonly defender: MugenFighterSnapshot; readonly hitDef: MugenActiveHitDefinition; readonly guarded: boolean; readonly hitOverride: MugenHitOverride | null; readonly juggleRemaining: number | null }
interface PendingProjectileContact extends PendingContact { readonly projectileEntityId: string }
interface PendingReversal { readonly reverser: MugenFighterSnapshot; readonly attacker: MugenFighterSnapshot; readonly definition: MugenActiveReversalDefinition }
interface PendingHelperRootContact { readonly helper: MugenHelperEntitySnapshot; readonly defender: MugenFighterSnapshot; readonly hitDef: MugenActiveHitDefinition; readonly guarded: boolean }
interface PendingRootHelperContact { readonly attacker: MugenFighterSnapshot; readonly helper: MugenHelperEntitySnapshot; readonly hitDef: MugenActiveHitDefinition; readonly guarded: boolean; readonly hitOverride: MugenHitOverride | null }
interface PendingHelperHelperContact { readonly attacker: MugenHelperEntitySnapshot; readonly defender: MugenHelperEntitySnapshot; readonly hitDef: MugenActiveHitDefinition; readonly guarded: boolean; readonly hitOverride: MugenHitOverride | null }
interface PendingProjectileHelperContact { readonly projectileEntityId: string; readonly attacker: MugenFighterSnapshot; readonly helper: MugenHelperEntitySnapshot; readonly hitDef: MugenActiveHitDefinition; readonly guarded: boolean; readonly hitOverride: MugenHitOverride | null }
type MugenCombatDefender = Pick<MugenFighterSnapshot, 'stateType' | 'moveType' | 'hitFall' | 'hitAttributeSlots' | 'facing'>;

/** Deterministic G08-C authority for AIR push boxes, HitDef contact and KO flow. */
export class MugenCombatRuntime {
  readonly script: MugenScriptRuntime;
  readonly #fighters: ReadonlyMap<string, NormalizedFighterConfig>;
  readonly #fightActions: ReadonlyMap<number, MugenAirAction>;
  readonly #animationDurationByOwner: ReadonlyMap<string, ReadonlyMap<number, number | null>>;
  readonly #fightCoordinateScale: number;
  readonly #order: readonly [string, string];
  readonly #stageBounds: readonly [number, number];
  readonly #screenBounds: readonly [number, number];
  readonly #camera: MugenStageCamera | null;
  readonly #guardDistance: number;
  readonly #koHoldTicks: number;

  constructor(script: MugenScriptRuntime, config: MugenCombatConfig) {
    this.script = script;
    if (config.fighters.length !== 2 || config.fighters[0].fighterId === config.fighters[1].fighterId) throw new TypeError('MUGEN combat requires two unique fighter configs.');
    const defaultCoordinateScale = positive(config.coordinateScale ?? 1, 'coordinateScale');
    const normalized = config.fighters.map(value => normalizeFighter(value, defaultCoordinateScale)) as [NormalizedFighterConfig, NormalizedFighterConfig];
    this.#fighters = new Map(normalized.map(value => [value.fighterId, value]));
    this.#fightActions = new Map((config.fightAir?.actions ?? []).map(action => [action.number, action]));
    const durationEntries: Array<readonly [string, ReadonlyMap<number, number | null>]> = normalized.map(value => [value.fighterId, new Map([...value.actions].map(([number, action]) => [number, action.totalTicks]))] as const); if (this.#fightActions.size > 0) durationEntries.push(['fight', new Map([...this.#fightActions].map(([number, action]) => [number, action.totalTicks]))]); this.#animationDurationByOwner = new Map(durationEntries);
    this.#fightCoordinateScale = positive(config.fightCoordinateScale ?? defaultCoordinateScale, 'fightCoordinateScale');
    this.#order = Object.freeze([normalized[0].fighterId, normalized[1].fighterId]);
    this.#stageBounds = vectorRange(config.stageBounds ?? [-320, 320], 'stageBounds');
    this.#screenBounds = vectorRange(config.screenBounds ?? this.#stageBounds, 'screenBounds');
    this.#camera = config.camera === undefined ? null : new MugenStageCamera(config.camera);
    this.#guardDistance = positive(config.guardDistance ?? 90, 'guardDistance');
    this.#koHoldTicks = boundedInteger(config.koHoldTicks ?? 60, 1, 600, 'koHoldTicks');
  }

  get camera(): MugenStageCameraSnapshot {
    if (this.#camera !== null) return this.#camera.snapshot();
    const center = Math.fround((this.#screenBounds[0] + this.#screenBounds[1]) / 2);
    return Object.freeze({ position: Object.freeze([center, 0]) as readonly [number, number], screenBounds: this.#screenBounds, visibleBounds: this.#screenBounds });
  }

  step(match: MugenHeadlessMatch, input: MugenTickInput, history: MugenInputHistory): MugenCombatTickTrace {
    if (!match.transactionOpen || match.tick !== input.tick) throw new Error('MUGEN combat runtime requires a matching open match tick.');
    const openingSnapshot = match.snapshot();
    this.#validateFighters(openingSnapshot);
    if (match.phase === 'fight' && openingSnapshot.roundTimeRemainingTicks === 0) this.#resolveTimeOver(match);
    if (match.phase === 'fight') this.#faceOpponents(match);
    let animations = this.#animations(match);
    const opponentByFighter = new Map([[this.#order[0], this.#order[1]], [this.#order[1], this.#order[0]]]);
    const inGuardDistance = this.#guardDistanceSet(match, animations);
    const animationExistsByFighter = new Map(this.#order.map(id => [id, new Set(this.#fighters.get(id)!.actions.keys())]));
    for (const helper of this.script.entities.helpers()) animationExistsByFighter.set(helper.entityId, new Set(this.#fighters.get(helper.rootId)!.actions.keys()));
    const cameraBefore = this.camera;
    const scriptContext = Object.freeze({ animationByFighter: animations, animationExistsByFighter, animationDurationByOwner: this.#animationDurationByOwner, opponentByFighter, inGuardDistance, stageBounds: this.#stageBounds, screenBounds: cameraBefore.screenBounds, cameraPosition: cameraBefore.position });
    const script = this.script.step(match, input, history, scriptContext);
    this.#constrainFighters(match, true);
    const screenBounds = this.camera.screenBounds;
    this.script.entities.removeProjectilesOutsideBounds(this.#stageBounds[0], this.#stageBounds[1], screenBounds[0], screenBounds[1]);
    this.#resolveProjectileTerminalAnimations();
    if (match.phase === 'fight') { this.#recoverHitStates(match); this.#faceOpponents(match); }
    this.#applyTargetBindings(match);
    this.#constrainFighters(match, false);
    const contacts: MugenCombatContactTrace[] = [];
    if (match.phase === 'fight' && !this.#order.some(id => match.fighter(id).hitPauseTicks > 0)) {
      animations = this.#animations(match);
      this.#resolvePush(match, animations);
      animations = this.#animations(match);
      const reversals = this.#collectReversals(match, animations);
      if (reversals.length > 0) for (const reversal of reversals) contacts.push(this.#applyReversal(match, reversal, scriptContext));
      else { const pending = resolveContactPriority(this.#collectContacts(match, input, animations)); for (const contact of pending) if (!contact.guarded) match.markHitTarget(contact.attacker.id, contact.defender.id); for (const contact of pending) contacts.push(this.#applyContact(match, contact, scriptContext)); }
      for (const contact of this.#collectHelperRootContacts(match, input, animations)) contacts.push(this.#applyHelperRootContact(match, contact, scriptContext));
      for (const contact of this.#collectRootHelperContacts(match, input, animations)) contacts.push(this.#applyRootHelperContact(match, contact, scriptContext));
      for (const contact of this.#collectHelperHelperContacts(match, input)) contacts.push(this.#applyHelperHelperContact(match, contact));
      this.#resolveProjectileCancellations();
      for (const contact of this.#collectProjectileContacts(match, input, animations)) { contacts.push(this.#applyContact(match, contact, scriptContext)); this.script.entities.recordProjectileContact(contact.projectileEntityId, contact.guarded ? 'guarded' : 'hit', contact.hitDef.hitCount); }
      for (const contact of this.#collectProjectileHelperContacts(match, input)) { contacts.push(this.#applyProjectileHelperContact(match, contact)); this.script.entities.recordProjectileContact(contact.projectileEntityId, contact.guarded ? 'guarded' : 'hit', contact.hitDef.hitCount); }
      this.#resolveKo(match);
    } else if (match.phase === 'ko' && openingSnapshot.phaseTime >= this.#koHoldTicks) match.completeKo();
    this.#constrainFighters(match, false);
    animations = this.#animations(match);
    const animationHashes = Object.freeze(this.#order.map(id => hashAnimation(animations.get(id)!)));
    const base = Object.freeze({ tick: input.tick, script, contacts: Object.freeze(contacts), animationHashes, camera: this.camera });
    return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }

  #validateFighters(snapshot: MugenMatchSnapshot): void { const ids = snapshot.fighters.map(value => value.id); if (ids[0] !== this.#order[0] || ids[1] !== this.#order[1]) throw new TypeError('MUGEN combat fighter order does not match the match authority.'); }

  #applyTargetBindings(match: MugenHeadlessMatch): void { for (const id of this.#order) { const fighter = match.fighter(id); const binding = fighter.targetBinding; if (binding !== null) { const owner = match.fighter(binding.ownerId); match.setKinematics(id, { position: [owner.position[0] + binding.offset[0] * owner.facing, owner.position[1] + binding.offset[1]], velocity: [0, 0] }); continue; } const entity = this.script.entities.entity(id); if (entity?.kind === 'root' && entity.bindTargetId !== null) match.setKinematics(id, { position: entity.position, velocity: [0, 0] }); } }

  #recoverHitStates(match: MugenHeadlessMatch): void {
    for (const fighter of this.#order.map(id => match.fighter(id))) {
      if (fighter.moveType === 'H' && !fighter.hitFall && fighter.stunTicks === 0 && fighter.hitPauseTicks === 0 && fighter.life > 0) {
        const config = this.#fighters.get(fighter.id)!; this.script.enterFighterState(match, fighter.id, config.neutralState, fighter.id, {}, true); match.setFighterStateMetadata(fighter.id, { stateType: 'S', moveType: 'I', physics: 'S' }); match.setFighterAction(fighter.id, config.neutralAction, 1, fighter.id); match.setKinematics(fighter.id, { velocity: [0, 0] });
      }
    }
  }

  #faceOpponents(match: MugenHeadlessMatch): void {
    const currentFirst = match.fighter(this.#order[0]); const currentSecond = match.fighter(this.#order[1]);
    if (currentFirst.control && currentFirst.moveType === 'I' && currentFirst.hitPauseTicks === 0 && !this.script.outputs.findEntity(currentFirst.id)?.assertions.includes('noautoturn')) match.setKinematics(currentFirst.id, { facing: currentFirst.position[0] <= currentSecond.position[0] ? 1 : -1 });
    if (currentSecond.control && currentSecond.moveType === 'I' && currentSecond.hitPauseTicks === 0 && !this.script.outputs.findEntity(currentSecond.id)?.assertions.includes('noautoturn')) match.setKinematics(currentSecond.id, { facing: currentSecond.position[0] <= currentFirst.position[0] ? 1 : -1 });
  }

  #constrainFighters(match: MugenHeadlessMatch, updateCamera: boolean): void {
    if (updateCamera && this.#camera !== null) this.#camera.update(this.#order.map(id => { const fighter = match.fighter(id); const screen = this.script.outputs.findEntity(id)?.screenBound; return Object.freeze({ id, position: fighter.position, moveCamera: screen?.moveCamera ?? Object.freeze([true, true]) as readonly [boolean, boolean] }); }));
    const bounds = this.camera.screenBounds;
    for (const id of this.#order) {
      const fighter = match.fighter(id); const screenBound = this.script.outputs.findEntity(id)?.screenBound?.bound !== false; const x = this.#camera?.constrainX(fighter.position[0], screenBound) ?? Math.max(this.#stageBounds[0], Math.min(this.#stageBounds[1], screenBound ? Math.max(bounds[0], Math.min(bounds[1], fighter.position[0])) : fighter.position[0]));
      if (x === fighter.position[0]) continue;
      const velocityX = (x === bounds[0] && fighter.velocity[0] < 0) || (x === bounds[1] && fighter.velocity[0] > 0) || (x === this.#stageBounds[0] && fighter.velocity[0] < 0) || (x === this.#stageBounds[1] && fighter.velocity[0] > 0) ? 0 : fighter.velocity[0];
      match.setKinematics(id, { position: [x, fighter.position[1]], velocity: [velocityX, fighter.velocity[1]] });
    }
  }

  #animations(match: MugenHeadlessMatch): ReadonlyMap<string, MugenScriptAnimationContext> {
    const result = new Map<string, MugenScriptAnimationContext>();
    for (const id of this.#order) { const fighter = match.fighter(id); const config = this.#fighters.get(fighter.animationOwnerId); if (!config) throw new RangeError(`MUGEN AIR owner ${fighter.animationOwnerId} is missing for ${id}.`); const action = config.actions.get(fighter.actionNumber); if (!action) throw new RangeError(`MUGEN AIR action ${fighter.actionNumber} is missing for ${id} from owner ${fighter.animationOwnerId}.`); const snapshot = evaluateMugenAirAction(action, fighter.actionTime, { x: fighter.position[0], y: fighter.position[1], facing: fighter.facing, coordinateScale: config.coordinateScale }); result.set(id, Object.freeze({ action, snapshot })); }
    for (const helper of this.script.entities.helpers()) { const config = this.#fighters.get(helper.rootId); const action = config?.actions.get(helper.actionNumber); if (!config || !action) continue; const snapshot = evaluateMugenAirAction(action, helper.actionTime, { x: helper.position[0], y: helper.position[1], facing: helper.facing, coordinateScale: config.coordinateScale }); result.set(helper.entityId, Object.freeze({ action, snapshot })); }
    return result;
  }

  #guardDistanceSet(match: MugenHeadlessMatch, animations: ReadonlyMap<string, MugenScriptAnimationContext>): ReadonlySet<string> { const result = new Set<string>(); for (const attackerId of this.#order) { const defenderId = other(this.#order, attackerId); const attacker = match.fighter(attackerId); if (attacker.activeHitDefinition === null) continue; const attackBoxes = animations.get(attackerId)!.snapshot.clsn1; const defenseBoxes = animations.get(defenderId)!.snapshot.clsn2; const distance = attacker.activeHitDefinition.guardDistance < 0 ? this.#guardDistance : attacker.activeHitDefinition.guardDistance; if (minimumHorizontalGap(attackBoxes, defenseBoxes) <= distance) result.add(defenderId); } return result; }

  #resolvePush(match: MugenHeadlessMatch, animations: ReadonlyMap<string, MugenScriptAnimationContext>): void {
    const first = match.fighter(this.#order[0]); const second = match.fighter(this.#order[1]); if (!first.playerPushEnabled || !second.playerPushEnabled || first.stateType === 'A' || second.stateType === 'A' || first.targetBinding !== null || second.targetBinding !== null) return;
    const overlap = maximumHorizontalOverlap(animations.get(first.id)!.snapshot.clsn2, animations.get(second.id)!.snapshot.clsn2); if (overlap <= 0) return;
    const firstOnLeft = first.position[0] < second.position[0] || (first.position[0] === second.position[0] && first.slot < second.slot); const left = firstOnLeft ? first : second; const right = firstOnLeft ? second : first;
    let leftX = Math.max(this.#stageBounds[0], left.position[0] - overlap / 2); let rightX = Math.min(this.#stageBounds[1], right.position[0] + overlap / 2); const remaining = overlap - ((left.position[0] - leftX) + (rightX - right.position[0]));
    if (remaining > 0) { if (leftX === this.#stageBounds[0]) rightX = Math.min(this.#stageBounds[1], rightX + remaining); else leftX = Math.max(this.#stageBounds[0], leftX - remaining); }
    match.setKinematics(left.id, { position: [Math.fround(leftX), left.position[1]] }); match.setKinematics(right.id, { position: [Math.fround(rightX), right.position[1]] });
  }

  #collectContacts(match: MugenHeadlessMatch, input: MugenTickInput, animations: ReadonlyMap<string, MugenScriptAnimationContext>): readonly PendingContact[] {
    const result: PendingContact[] = [];
    for (const attackerId of this.#order) { const defenderId = other(this.#order, attackerId); const attacker = match.fighter(attackerId); const defender = match.fighter(defenderId); const hitDef = attacker.activeHitDefinition; if (hitDef === null || hitDef.affectTeam === 'F' || hitDef.hitTargets.includes(defenderId) || defender.life === 0 || !targetFlagMatches(hitDef, defender) || !hitAttributeSlotsAllow(hitDef, defender) || (hitDef.chainId !== -1 && defender.lastHitId !== hitDef.chainId) || hitDef.noChainIds.includes(defender.lastHitId)) continue; const attack = animations.get(attackerId)!.snapshot.clsn1; const defense = animations.get(defenderId)!.snapshot.clsn2; if (!boxesOverlap(attack, defense)) continue; const player = input.players.find(value => value.playerId === defenderId); if (!player) throw new TypeError(`MUGEN input is missing ${defenderId}.`); const guarded = canGuard(hitDef, defender, player); const causesFall = !guarded && !hitDef.forceNoFall && (defender.stateType === 'A' ? hitDef.airFall : hitDef.fall); const juggleActive = !guarded && (defender.hitFall || defender.stateType === 'L' || causesFall); const availableJuggle = defender.hitFall || defender.stateType === 'L' ? defender.juggleRemaining : defender.juggleCapacity; const juggleCost = Math.max(0, attacker.juggleCost) + hitDef.airJuggle; if (juggleActive && juggleCost > availableJuggle) continue; const attribute = `${hitDef.attributeState}:${hitDef.attackAttribute}`; const hitOverride = hitDef.attackerStateNumber === -1 && !(hitDef.defenderStateNumber !== -1 && hitDef.defenderGetsAttackerState) ? defender.hitOverrides.find(value => value !== null && value.attributes.includes(attribute)) ?? null : null; result.push({ attacker, defender, hitDef, guarded, hitOverride, juggleRemaining: juggleActive ? availableJuggle - juggleCost : null }); }
    return Object.freeze(result);
  }

  #collectReversals(match: MugenHeadlessMatch, animations: ReadonlyMap<string, MugenScriptAnimationContext>): readonly PendingReversal[] { const result: PendingReversal[] = []; for (const reverserId of this.#order) { const attackerId = other(this.#order, reverserId); const reverser = match.fighter(reverserId); const attacker = match.fighter(attackerId); const definition = reverser.activeReversalDefinition; const hitDef = attacker.activeHitDefinition; if (definition === null || hitDef === null || !definition.attributes.includes(`${hitDef.attributeState}:${hitDef.attackAttribute}`)) continue; if (boxesOverlap(animations.get(reverserId)!.snapshot.clsn1, animations.get(attackerId)!.snapshot.clsn1)) result.push({ reverser, attacker, definition }); } return Object.freeze(result.slice(0, 1)); }

  #helperAnimation(match: MugenHeadlessMatch, helper: MugenHelperEntitySnapshot): MugenAirSnapshot | null { const config = this.#fighters.get(helper.rootId); const action = config?.actions.get(helper.actionNumber); if (!config || !action) return null; return evaluateMugenAirAction(action, helper.actionTime, { x: helper.position[0], y: helper.position[1], facing: helper.facing, coordinateScale: config.coordinateScale }); }

  #collectHelperRootContacts(match: MugenHeadlessMatch, input: MugenTickInput, animations: ReadonlyMap<string, MugenScriptAnimationContext>): readonly PendingHelperRootContact[] {
    const result: PendingHelperRootContact[] = [];
    for (const helper of this.script.entities.helpers()) { const hitDef = helper.activeHitDefinition; if (helper.life === 0 || hitDef === null || hitDef.affectTeam === 'F') continue; const defender = match.fighter(other(this.#order, helper.rootId)); if (defender.life === 0 || hitDef.hitTargets.includes(defender.id) || !targetFlagMatches(hitDef, defender) || !hitAttributeSlotsAllow(hitDef, defender)) continue; const animation = this.#helperAnimation(match, helper); if (animation === null || !boxesOverlap(animation.clsn1, animations.get(defender.id)!.snapshot.clsn2)) continue; const player = input.players.find(value => value.playerId === defender.id); if (!player) continue; result.push(Object.freeze({ helper, defender, hitDef, guarded: canGuard(hitDef, defender, player) })); }
    return Object.freeze(result);
  }

  #collectRootHelperContacts(match: MugenHeadlessMatch, input: MugenTickInput, animations: ReadonlyMap<string, MugenScriptAnimationContext>): readonly PendingRootHelperContact[] {
    const result: PendingRootHelperContact[] = [];
    for (const attackerId of this.#order) { const attacker = match.fighter(attackerId); const hitDef = attacker.activeHitDefinition; if (hitDef === null || hitDef.affectTeam === 'F') continue; for (const helper of this.script.entities.helpers().filter(value => value.team !== this.script.entities.entity(attackerId)!.team)) { if (helper.life === 0 || hitDef.hitTargets.includes(helper.entityId) || !targetFlagMatches(hitDef, helper) || !hitAttributeSlotsAllow(hitDef, helper)) continue; const animation = this.#helperAnimation(match, helper); if (animation === null || !boxesOverlap(animations.get(attackerId)!.snapshot.clsn1, animation.clsn2)) continue; const player = input.players.find(value => value.playerId === helper.rootId); if (!player) continue; const guarded = helper.keyControl && canGuard(hitDef, helper, player); result.push(Object.freeze({ attacker, helper, hitDef, guarded, hitOverride: matchingHelperHitOverride(helper, hitDef, guarded) })); } }
    return Object.freeze(result);
  }

  #collectHelperHelperContacts(match: MugenHeadlessMatch, input: MugenTickInput): readonly PendingHelperHelperContact[] { const result: PendingHelperHelperContact[] = []; const helpers = this.script.entities.helpers(); for (const attacker of helpers) { const hitDef = attacker.activeHitDefinition; if (attacker.life === 0 || hitDef === null || hitDef.affectTeam === 'F') continue; const attackAnimation = this.#helperAnimation(match, attacker); if (attackAnimation === null) continue; for (const defender of helpers) { if (defender.team === attacker.team || defender.life === 0 || hitDef.hitTargets.includes(defender.entityId) || !targetFlagMatches(hitDef, defender) || !hitAttributeSlotsAllow(hitDef, defender)) continue; const defenseAnimation = this.#helperAnimation(match, defender); if (defenseAnimation === null || !boxesOverlap(attackAnimation.clsn1, defenseAnimation.clsn2)) continue; const player = input.players.find(value => value.playerId === defender.rootId); if (!player) continue; const guarded = defender.keyControl && canGuard(hitDef, defender, player); result.push(Object.freeze({ attacker, defender, hitDef, guarded, hitOverride: matchingHelperHitOverride(defender, hitDef, guarded) })); } } return Object.freeze(result); }

  #collectProjectileHelperContacts(match: MugenHeadlessMatch, input: MugenTickInput): readonly PendingProjectileHelperContact[] { const result: PendingProjectileHelperContact[] = []; for (const projectile of this.script.entities.projectiles()) { if (projectile.hitDefinition === null || projectile.remainingHits < 1 || projectile.hitCooldown > 0) continue; const projectileAnimation = this.#projectileAnimation(projectile); if (projectileAnimation === null) continue; const attacker = match.fighter(projectile.rootId); for (const helper of this.script.entities.helpers().filter(value => value.team !== projectile.team && value.life > 0)) { const helperAnimation = this.#helperAnimation(match, helper); if (helperAnimation === null || !boxesOverlap(projectileAnimation.clsn1, helperAnimation.clsn2)) continue; const hitDef: MugenActiveHitDefinition = Object.freeze({ ...projectile.hitDefinition, activationId: projectile.entityId, hitTargets: Object.freeze([]) }); if (!targetFlagMatches(hitDef, helper) || !hitAttributeSlotsAllow(hitDef, helper)) continue; const player = input.players.find(value => value.playerId === helper.rootId); if (!player) continue; const guarded = helper.keyControl && canGuard(hitDef, helper, player); result.push(Object.freeze({ projectileEntityId: projectile.entityId, attacker, helper, hitDef, guarded, hitOverride: matchingHelperHitOverride(helper, hitDef, guarded) })); } } return Object.freeze(result); }

  #applyHelperRootContact(match: MugenHeadlessMatch, contact: PendingHelperRootContact, scriptContext: MugenScriptStepContext): MugenCombatContactTrace {
    const { helper, defender, hitDef, guarded } = contact; const result = guarded ? 'guarded' : 'hit'; const rawDamage = guarded ? hitDef.guardDamage : hitDef.damage; const canKill = guarded ? hitDef.guardKill : hitDef.kill; const scaledDamage = rawDamage === 0 ? 0 : Math.max(1, Math.round(rawDamage * helper.attackMultiplier * defender.defenseMultiplier)); const damage = Math.min(scaledDamage, Math.max(0, defender.life - (canKill ? 0 : 1)));
    match.setLife(defender.id, defender.life - damage); match.addPower(helper.rootId, guarded ? hitDef.attackerPowerOnGuard : hitDef.attackerPowerOnHit); match.addPower(defender.id, guarded ? hitDef.defenderPowerOnGuard : hitDef.defenderPowerOnHit);
    this.#applyHitOutput(match, helper.rootId, helper.entityId, helper.position, helper.facing, defender.id, defender.position, guarded, hitDef);
    const attackerPause = guarded ? hitDef.guardPause[0] : hitDef.hitPause[0]; const defenderPause = guarded ? hitDef.guardPause[1] : hitDef.hitPause[1]; this.script.entities.recordHelperAttackContact(helper.entityId, defender.id, hitDef, result, guarded ? 0 : hitDef.hitCount, attackerPause, hitDef.attackerSpritePriority); match.setHitPause(defender.id, defenderPause); match.setSpritePriority(defender.id, hitDef.defenderSpritePriority);
    if (hitDef.defenderFacing !== 0) match.setKinematics(defender.id, { facing: hitDef.defenderFacing > 0 ? helper.facing : helper.facing === 1 ? -1 : 1 });
    const airborne = defender.stateType === 'A'; const downed = defender.stateType === 'L'; const hitVelocity = guarded ? (airborne ? hitDef.airGuardVelocity : hitDef.guardVelocity) : downed ? hitDef.downVelocity : airborne ? hitDef.airVelocity : hitDef.groundVelocity; const falling = !guarded && !hitDef.forceNoFall && (airborne ? hitDef.airFall : hitDef.fall); const launched = !guarded && !airborne && !downed && hitVelocity[1] !== 0; const reactionAirborne = airborne || launched || falling; const config = this.#fighters.get(defender.id)!; const state = guarded ? config.guardState : reactionAirborne ? config.airHitState : config.hitState; const action = guarded ? config.guardAction : reactionAirborne ? config.airHitAction : config.hitAction; const stun = guarded ? (airborne ? hitDef.airGuardControlTime : hitDef.guardHitTime) : downed && hitVelocity[1] === 0 ? hitDef.downHitTime : airborne || launched ? hitDef.airHitTime : hitDef.groundHitTime;
    match.setGetHitData(defender.id, { velocity: [Math.fround(-hitVelocity[0]), hitVelocity[1]], yAcceleration: hitDef.yAcceleration, fall: falling, fallVelocity: hitDef.fallVelocity, fallDamage: hitDef.fallDamage, fallKill: hitDef.fallKill, fallRecover: hitDef.fallRecover, fallRecoverTime: hitDef.fallRecoverTime, fallEnvShake: hitDef.output.fallEnvShake, downBounce: hitDef.downBounce, hitId: hitDef.targetId, attribute: `${hitDef.attributeState}:${hitDef.attackAttribute}` });
    if (!guarded && hitDef.defenderStateNumber !== -1) { const ownerId = hitDef.defenderGetsAttackerState ? helper.rootId : defender.id; this.script.enterFighterState(match, defender.id, hitDef.defenderStateNumber, ownerId, scriptContext, false); }
    else { match.setFighterState(defender.id, state, false); match.setFighterStateMetadata(defender.id, { stateType: reactionAirborne ? 'A' : 'S', moveType: 'H', physics: reactionAirborne ? 'A' : 'N' }); match.setFighterAction(defender.id, action); }
    match.setKinematics(defender.id, { velocity: [Math.fround(hitVelocity[0] * defender.facing), hitVelocity[1]] }); match.setStun(defender.id, guarded ? 'guard' : 'hit', Math.max(1, stun)); return Object.freeze({ attackerId: helper.entityId, defenderId: defender.id, result, damage, activationId: hitDef.activationId });
  }

  #applyRootHelperContact(match: MugenHeadlessMatch, contact: PendingRootHelperContact, scriptContext: MugenScriptStepContext): MugenCombatContactTrace {
    const { attacker, helper, hitDef, guarded, hitOverride } = contact; const result = guarded ? 'guarded' : 'hit'; const rawDamage = guarded ? hitDef.guardDamage : hitDef.damage; const canKill = guarded ? hitDef.guardKill : hitDef.kill; const scaledDamage = rawDamage === 0 ? 0 : Math.max(1, Math.round(rawDamage * attacker.attackMultiplier * helper.defenseMultiplier)); const damage = Math.min(scaledDamage, Math.max(0, helper.life - (canKill ? 0 : 1)));
    match.addPower(attacker.id, guarded ? hitDef.attackerPowerOnGuard : hitDef.attackerPowerOnHit); match.addPower(helper.rootId, guarded ? hitDef.defenderPowerOnGuard : hitDef.defenderPowerOnHit); this.#applyHitOutput(match, attacker.id, attacker.id, attacker.position, attacker.facing, helper.entityId, helper.position, guarded, hitDef); const attackerPause = guarded ? hitDef.guardPause[0] : hitDef.hitPause[0]; const defenderPause = guarded ? hitDef.guardPause[1] : hitDef.hitPause[1]; match.setHitPause(attacker.id, attackerPause); match.setSpritePriority(attacker.id, hitDef.attackerSpritePriority);
    const airborne = helper.stateType === 'A'; const downed = helper.stateType === 'L'; const hitVelocity = guarded ? (airborne ? hitDef.airGuardVelocity : hitDef.guardVelocity) : downed ? hitDef.downVelocity : airborne ? hitDef.airVelocity : hitDef.groundVelocity; const falling = !guarded && !hitDef.forceNoFall && (airborne ? hitDef.airFall : hitDef.fall); const launched = !guarded && !airborne && !downed && hitVelocity[1] !== 0; const reactionAirborne = airborne || launched || falling; const config = this.#fighters.get(helper.rootId)!; const state = !guarded && hitDef.defenderStateNumber !== -1 ? hitDef.defenderStateNumber : hitOverride?.stateNumber ?? (guarded ? config.guardState : reactionAirborne ? config.airHitState : config.hitState); const stateDataOwnerId = !guarded && hitDef.defenderStateNumber !== -1 && hitDef.defenderGetsAttackerState ? attacker.id : hitOverride?.stateDataOwnerId ?? helper.rootId; const action = guarded ? config.guardAction : reactionAirborne ? config.airHitAction : config.hitAction; const stun = guarded ? (airborne ? hitDef.airGuardControlTime : hitDef.guardHitTime) : downed && hitVelocity[1] === 0 ? hitDef.downHitTime : airborne || launched ? hitDef.airHitTime : hitDef.groundHitTime;
    this.script.entities.recordHelperReceivedHit(helper.entityId, { damage, hitPauseTicks: defenderPause, stunTicks: Math.max(1, stun), stunKind: guarded ? 'guard' : 'hit', velocity: [Math.fround(hitVelocity[0] * helper.facing), hitVelocity[1]], getHitVelocity: [Math.fround(-hitVelocity[0]), hitVelocity[1]], yAcceleration: hitDef.yAcceleration, fall: falling, fallVelocity: hitDef.fallVelocity, fallDamage: hitDef.fallDamage, fallKill: hitDef.fallKill, fallRecover: hitDef.fallRecover, fallRecoverTime: hitDef.fallRecoverTime, fallEnvShake: hitDef.output.fallEnvShake, downBounce: hitDef.downBounce, hitId: hitDef.targetId, hitAttribute: `${hitDef.attributeState}:${hitDef.attackAttribute}`, stateNumber: state, stateDataOwnerId, actionNumber: action, stateType: hitOverride?.forceAir ? 'A' : reactionAirborne ? 'A' : 'S', physics: hitOverride?.forceAir ? 'A' : reactionAirborne ? 'A' : 'N', spritePriority: hitDef.defenderSpritePriority });
    match.markExternalHitTarget(attacker.id, helper.entityId); match.setExternalMoveContact(attacker.id, helper.entityId, result, guarded ? 0 : hitDef.hitCount); this.script.entities.recordTarget(attacker.id, helper.entityId, hitDef.targetId); if (!guarded && hitDef.attackerStateNumber !== -1) this.script.enterFighterState(match, attacker.id, hitDef.attackerStateNumber, attacker.id, scriptContext); return Object.freeze({ attackerId: attacker.id, defenderId: helper.entityId, result, damage, activationId: hitDef.activationId });
  }

  #applyHelperHelperContact(match: MugenHeadlessMatch, contact: PendingHelperHelperContact): MugenCombatContactTrace { const { attacker, defender, hitDef, guarded, hitOverride } = contact; const result = guarded ? 'guarded' : 'hit'; const rawDamage = guarded ? hitDef.guardDamage : hitDef.damage; const canKill = guarded ? hitDef.guardKill : hitDef.kill; const scaledDamage = rawDamage === 0 ? 0 : Math.max(1, Math.round(rawDamage * attacker.attackMultiplier * defender.defenseMultiplier)); const damage = Math.min(scaledDamage, Math.max(0, defender.life - (canKill ? 0 : 1))); match.addPower(attacker.rootId, guarded ? hitDef.attackerPowerOnGuard : hitDef.attackerPowerOnHit); match.addPower(defender.rootId, guarded ? hitDef.defenderPowerOnGuard : hitDef.defenderPowerOnHit); this.#applyHitOutput(match, attacker.rootId, attacker.entityId, attacker.position, attacker.facing, defender.entityId, defender.position, guarded, hitDef); this.script.entities.recordHelperAttackContact(attacker.entityId, defender.entityId, hitDef, result, guarded ? 0 : hitDef.hitCount, guarded ? hitDef.guardPause[0] : hitDef.hitPause[0], hitDef.attackerSpritePriority); this.#recordHelperDefenderHit(defender, hitDef, guarded, damage, attacker.rootId, hitOverride); return Object.freeze({ attackerId: attacker.entityId, defenderId: defender.entityId, result, damage, activationId: hitDef.activationId }); }

  #applyProjectileHelperContact(match: MugenHeadlessMatch, contact: PendingProjectileHelperContact): MugenCombatContactTrace { const { attacker, helper, hitDef, guarded, hitOverride } = contact; const result = guarded ? 'guarded' : 'hit'; const rawDamage = guarded ? hitDef.guardDamage : hitDef.damage; const canKill = guarded ? hitDef.guardKill : hitDef.kill; const scaledDamage = rawDamage === 0 ? 0 : Math.max(1, Math.round(rawDamage * attacker.attackMultiplier * helper.defenseMultiplier)); const damage = Math.min(scaledDamage, Math.max(0, helper.life - (canKill ? 0 : 1))); match.addPower(attacker.id, guarded ? hitDef.attackerPowerOnGuard : hitDef.attackerPowerOnHit); match.addPower(helper.rootId, guarded ? hitDef.defenderPowerOnGuard : hitDef.defenderPowerOnHit); const projectile = this.script.entities.entity(contact.projectileEntityId); this.#applyHitOutput(match, attacker.id, contact.projectileEntityId, projectile?.kind === 'projectile' ? projectile.position : attacker.position, projectile?.kind === 'projectile' ? projectile.facing : attacker.facing, helper.entityId, helper.position, guarded, hitDef); this.#recordHelperDefenderHit(helper, hitDef, guarded, damage, attacker.id, hitOverride); this.script.entities.recordTarget(attacker.id, helper.entityId, hitDef.targetId); return Object.freeze({ attackerId: attacker.id, defenderId: helper.entityId, result, damage, activationId: hitDef.activationId }); }

  #recordHelperDefenderHit(helper: MugenHelperEntitySnapshot, hitDef: MugenActiveHitDefinition, guarded: boolean, damage: number, attackerRootId: string, hitOverride: MugenHitOverride | null): void { const airborne = helper.stateType === 'A'; const downed = helper.stateType === 'L'; const hitVelocity = guarded ? (airborne ? hitDef.airGuardVelocity : hitDef.guardVelocity) : downed ? hitDef.downVelocity : airborne ? hitDef.airVelocity : hitDef.groundVelocity; const falling = !guarded && !hitDef.forceNoFall && (airborne ? hitDef.airFall : hitDef.fall); const launched = !guarded && !airborne && !downed && hitVelocity[1] !== 0; const reactionAirborne = airborne || launched || falling; const config = this.#fighters.get(helper.rootId)!; const state = !guarded && hitDef.defenderStateNumber !== -1 ? hitDef.defenderStateNumber : hitOverride?.stateNumber ?? (guarded ? config.guardState : reactionAirborne ? config.airHitState : config.hitState); const stateDataOwnerId = !guarded && hitDef.defenderStateNumber !== -1 && hitDef.defenderGetsAttackerState ? attackerRootId : hitOverride?.stateDataOwnerId ?? helper.rootId; const action = guarded ? config.guardAction : reactionAirborne ? config.airHitAction : config.hitAction; const stun = guarded ? (airborne ? hitDef.airGuardControlTime : hitDef.guardHitTime) : downed && hitVelocity[1] === 0 ? hitDef.downHitTime : airborne || launched ? hitDef.airHitTime : hitDef.groundHitTime; this.script.entities.recordHelperReceivedHit(helper.entityId, { damage, hitPauseTicks: guarded ? hitDef.guardPause[1] : hitDef.hitPause[1], stunTicks: Math.max(1, stun), stunKind: guarded ? 'guard' : 'hit', velocity: [Math.fround(hitVelocity[0] * helper.facing), hitVelocity[1]], getHitVelocity: [Math.fround(-hitVelocity[0]), hitVelocity[1]], yAcceleration: hitDef.yAcceleration, fall: falling, fallVelocity: hitDef.fallVelocity, fallDamage: hitDef.fallDamage, fallKill: hitDef.fallKill, fallRecover: hitDef.fallRecover, fallRecoverTime: hitDef.fallRecoverTime, fallEnvShake: hitDef.output.fallEnvShake, downBounce: hitDef.downBounce, hitId: hitDef.targetId, hitAttribute: `${hitDef.attributeState}:${hitDef.attackAttribute}`, stateNumber: state, stateDataOwnerId, actionNumber: action, stateType: hitOverride?.forceAir ? 'A' : reactionAirborne ? 'A' : 'S', physics: hitOverride?.forceAir ? 'A' : reactionAirborne ? 'A' : 'N', spritePriority: hitDef.defenderSpritePriority }); }

  #resolveProjectileCancellations(): void {
    const ordered = this.script.entities.projectiles().filter(projectile => projectile.remainingHits > 0);
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = this.script.entities.entity(ordered[leftIndex]!.entityId); const right = this.script.entities.entity(ordered[rightIndex]!.entityId);
      if (left?.kind !== 'projectile' || right?.kind !== 'projectile' || left.team === right.team || left.remainingHits < 1 || right.remainingHits < 1) continue;
      const leftAnimation = this.#projectileAnimation(left); const rightAnimation = this.#projectileAnimation(right);
      if (leftAnimation !== null && rightAnimation !== null && boxesOverlap(leftAnimation.clsn1, rightAnimation.clsn1)) this.script.entities.recordProjectileCollision(left.entityId, right.entityId);
    }
  }

  #projectileAnimation(projectile: MugenProjectileEntitySnapshot): MugenAirSnapshot | null {
    if (projectile.animationOwnerId === 'fight') { const action = this.#fightActions.get(projectile.animationNumber); return action === undefined ? null : evaluateMugenAirAction(action, projectile.age, { x: projectile.position[0], y: projectile.position[1], facing: projectile.facing, coordinateScale: this.#fightCoordinateScale }); }
    const config = this.#fighters.get(projectile.animationOwnerId); const action = config?.actions.get(projectile.animationNumber); if (!config || !action) return null;
    return evaluateMugenAirAction(action, projectile.age, { x: projectile.position[0], y: projectile.position[1], facing: projectile.facing, coordinateScale: config.coordinateScale });
  }

  #resolveProjectileTerminalAnimations(): void { for (const projectile of this.script.entities.projectiles().filter(value => value.terminalReason !== null)) { if (projectile.terminalAge >= 600) { this.script.entities.completeProjectileTerminal(projectile.entityId); continue; } const action = projectile.animationOwnerId === 'fight' ? this.#fightActions.get(projectile.animationNumber) : this.#fighters.get(projectile.animationOwnerId)?.actions.get(projectile.animationNumber); if (action !== undefined && action.totalTicks !== null && projectile.terminalAge >= action.totalTicks) this.script.entities.completeProjectileTerminal(projectile.entityId); } }

  #collectProjectileContacts(match: MugenHeadlessMatch, input: MugenTickInput, animations: ReadonlyMap<string, MugenScriptAnimationContext>): readonly PendingProjectileContact[] {
    const result: PendingProjectileContact[] = [];
    for (const projectile of this.script.entities.projectiles()) {
      if (projectile.hitDefinition === null || projectile.remainingHits < 1 || projectile.hitCooldown > 0) continue;
      const owner = match.fighter(projectile.rootId); const defender = match.fighter(other(this.#order, owner.id)); if (defender.life === 0) continue;
      const projectileAnimation = this.#projectileAnimation(projectile); if (projectileAnimation === null) continue;
      if (!boxesOverlap(projectileAnimation.clsn1, animations.get(defender.id)!.snapshot.clsn2)) continue;
      const hitDef: MugenActiveHitDefinition = Object.freeze({ ...projectile.hitDefinition, activationId: projectile.entityId, hitTargets: Object.freeze([]) });
      if (!targetFlagMatches(hitDef, defender) || !hitAttributeSlotsAllow(hitDef, defender)) continue;
      const player = input.players.find(value => value.playerId === defender.id); if (!player) continue;
      result.push(Object.freeze({ projectileEntityId: projectile.entityId, attacker: owner, defender, hitDef, guarded: canGuard(hitDef, defender, player), hitOverride: null, juggleRemaining: null }));
    }
    return Object.freeze(result);
  }

  #applyReversal(match: MugenHeadlessMatch, reversal: PendingReversal, scriptContext: MugenScriptStepContext): MugenCombatContactTrace { const { reverser, attacker, definition } = reversal; match.registerTarget(reverser.id, attacker.id, 0); match.setHitPause(reverser.id, definition.hitPause[0]); match.setHitPause(attacker.id, definition.hitPause[1]); match.setSpritePriority(reverser.id, definition.attackerSpritePriority); match.setSpritePriority(attacker.id, definition.defenderSpritePriority); match.clearHitDefinition(attacker.id); if (definition.attackerStateNumber !== -1) this.script.enterFighterState(match, reverser.id, definition.attackerStateNumber, definition.stateDataOwnerId, scriptContext); if (definition.defenderStateNumber !== -1) this.script.enterFighterState(match, attacker.id, definition.defenderStateNumber, definition.stateDataOwnerId, scriptContext, false); match.setMoveContact(reverser.id, attacker.id, 'reversed', 0); return Object.freeze({ attackerId: reverser.id, defenderId: attacker.id, result: 'reversed', damage: 0, activationId: definition.activationId }); }

  #applyContact(match: MugenHeadlessMatch, contact: PendingContact, scriptContext: MugenScriptStepContext): MugenCombatContactTrace {
    const { attacker, defender, hitDef, guarded } = contact; const result = guarded ? 'guarded' : 'hit'; const inert = !guarded && defender.stateType !== 'A' && hitDef.groundHitType === 'none'; const rawDamage = inert ? 0 : guarded ? hitDef.guardDamage : hitDef.damage; const canKill = guarded ? hitDef.guardKill : hitDef.kill; const scaledDamage = rawDamage === 0 ? 0 : Math.max(1, Math.round(rawDamage * attacker.attackMultiplier * defender.defenseMultiplier)); const damage = Math.min(scaledDamage, Math.max(0, defender.life - (canKill ? 0 : 1)));
    if (contact.juggleRemaining !== null) match.setJuggleRemaining(defender.id, contact.juggleRemaining);
    match.setLife(defender.id, defender.life - damage); match.addPower(attacker.id, guarded ? hitDef.attackerPowerOnGuard : hitDef.attackerPowerOnHit); match.addPower(defender.id, guarded ? hitDef.defenderPowerOnGuard : hitDef.defenderPowerOnHit);
    const projectileId = (contact as Partial<PendingProjectileContact>).projectileEntityId; const projectile = projectileId === undefined ? null : this.script.entities.entity(projectileId); this.#applyHitOutput(match, attacker.id, projectile?.kind === 'projectile' ? projectile.entityId : attacker.id, projectile?.kind === 'projectile' ? projectile.position : attacker.position, projectile?.kind === 'projectile' ? projectile.facing : attacker.facing, defender.id, defender.position, guarded, hitDef);
    const attackerPause = guarded ? hitDef.guardPause[0] : hitDef.hitPause[0]; const defenderPause = guarded ? hitDef.guardPause[1] : hitDef.hitPause[1]; match.setHitPause(attacker.id, attackerPause); match.setHitPause(defender.id, defenderPause);
    match.setSpritePriority(attacker.id, hitDef.attackerSpritePriority); match.setSpritePriority(defender.id, hitDef.defenderSpritePriority);
    if (hitDef.attackerGetDefenderFacing !== 0) match.setKinematics(attacker.id, { facing: hitDef.attackerGetDefenderFacing > 0 ? defender.facing : defender.facing === 1 ? -1 : 1 }); else if (hitDef.attackerFacing < 0) match.setKinematics(attacker.id, { facing: attacker.facing === 1 ? -1 : 1 });
    if (hitDef.defenderFacing !== 0) match.setKinematics(defender.id, { facing: hitDef.defenderFacing > 0 ? match.fighter(attacker.id).facing : match.fighter(attacker.id).facing === 1 ? -1 : 1 });
    const airborne = defender.stateType === 'A'; const downed = defender.stateType === 'L'; const hitVelocity = guarded ? (airborne ? hitDef.airGuardVelocity : hitDef.guardVelocity) : downed ? hitDef.downVelocity : airborne ? hitDef.airVelocity : hitDef.groundVelocity; const falling = !guarded && !hitDef.forceNoFall && (airborne ? hitDef.airFall : hitDef.fall);
    const config = this.#fighters.get(defender.id)!; const launched = !guarded && !airborne && !downed && hitVelocity[1] !== 0; const reactionAirborne = airborne || launched || falling; const state = guarded ? config.guardState : reactionAirborne ? config.airHitState : config.hitState; const action = guarded ? config.guardAction : reactionAirborne ? config.airHitAction : config.hitAction; const velocity = hitVelocity; const stun = guarded ? (airborne ? hitDef.airGuardControlTime : hitDef.guardHitTime) : downed && hitVelocity[1] === 0 ? hitDef.downHitTime : airborne || launched ? hitDef.airHitTime : hitDef.groundHitTime;
    match.setGetHitData(defender.id, { velocity: [Math.fround(-hitVelocity[0]), hitVelocity[1]], yAcceleration: hitDef.yAcceleration, fall: falling, fallVelocity: hitDef.fallVelocity, fallDamage: hitDef.fallDamage, fallKill: hitDef.fallKill, fallRecover: hitDef.fallRecover, fallRecoverTime: hitDef.fallRecoverTime, fallEnvShake: hitDef.output.fallEnvShake, downBounce: hitDef.downBounce, hitId: hitDef.targetId, attribute: `${hitDef.attributeState}:${hitDef.attackAttribute}` });
    if (!guarded && hitDef.forceStand && defender.stateType === 'C') match.setFighterStateMetadata(defender.id, { stateType: 'S' });
    if (hitDef.snap !== null) match.setKinematics(defender.id, { position: [attacker.position[0] + hitDef.snap[0] * attacker.facing, attacker.position[1] + hitDef.snap[1]] }); else applyDistanceConstraints(match, attacker, defender, hitDef.minimumDistance, hitDef.maximumDistance);
    const cornerPush = guarded ? (airborne ? hitDef.airGuardCornerPush : hitDef.guardCornerPush) : downed ? hitDef.downCornerPush : airborne ? hitDef.airCornerPush : hitDef.groundCornerPush; const constrainedDefender = match.fighter(defender.id); if ((constrainedDefender.position[0] <= this.#stageBounds[0] || constrainedDefender.position[0] >= this.#stageBounds[1]) && cornerPush !== 0) match.setKinematics(attacker.id, { velocity: [Math.fround(cornerPush * attacker.facing), attacker.velocity[1]] });
    if (!guarded && hitDef.attackerStateNumber !== -1) this.script.enterFighterState(match, attacker.id, hitDef.attackerStateNumber, attacker.id, scriptContext);
    if (!guarded && hitDef.defenderStateNumber !== -1) { const ownerId = hitDef.defenderGetsAttackerState ? attacker.id : defender.id; match.setFighterState(defender.id, state, false); this.script.enterFighterState(match, defender.id, hitDef.defenderStateNumber, ownerId, scriptContext, false); match.setStun(defender.id, 'hit', Math.max(1, hitDef.airHitTime)); match.setMoveContact(attacker.id, defender.id, result, hitDef.hitCount); return Object.freeze({ attackerId: attacker.id, defenderId: defender.id, result, damage, activationId: hitDef.activationId }); }
    if (!guarded && contact.hitOverride !== null) { this.script.enterFighterState(match, defender.id, contact.hitOverride.stateNumber, contact.hitOverride.stateDataOwnerId, scriptContext, false); if (contact.hitOverride.forceAir) match.setFighterStateMetadata(defender.id, { stateType: 'A' }); match.setStun(defender.id, 'hit', Math.max(1, hitDef.airHitTime)); match.setMoveContact(attacker.id, defender.id, result, hitDef.hitCount); return Object.freeze({ attackerId: attacker.id, defenderId: defender.id, result, damage, activationId: hitDef.activationId }); }
    if (inert) { match.setMoveContact(attacker.id, defender.id, result, 0); return Object.freeze({ attackerId: attacker.id, defenderId: defender.id, result, damage, activationId: hitDef.activationId }); }
    match.setFighterState(defender.id, state, false); match.setFighterStateMetadata(defender.id, { stateType: reactionAirborne ? 'A' : 'S', moveType: 'H', physics: reactionAirborne ? 'A' : 'N' }); match.setFighterAction(defender.id, action); match.setKinematics(defender.id, { velocity: [Math.fround(velocity[0] * match.fighter(defender.id).facing), velocity[1]] }); match.setStun(defender.id, guarded ? 'guard' : 'hit', Math.max(1, stun));
    match.setMoveContact(attacker.id, defender.id, result, guarded ? 0 : hitDef.hitCount); return Object.freeze({ attackerId: attacker.id, defenderId: defender.id, result, damage, activationId: hitDef.activationId });
  }

  #applyHitOutput(match: MugenHeadlessMatch, attackerRootId: string, attackerEntityId: string, attackerPosition: readonly [number, number], attackerFacing: -1 | 1, defenderEntityId: string, defenderPosition: readonly [number, number], guarded: boolean, hitDef: MugenActiveHitDefinition): void {
    const output = hitDef.output; const sound = guarded ? output.guardSound : output.hitSound; const soundFromPlayer = guarded ? output.guardSoundFromPlayer : output.hitSoundFromPlayer;
    if (sound !== null) match.emitAudio(attackerRootId, 'play', { group: sound[0], item: sound[1], channel: -1, resourceOwner: soundFromPlayer ? 'self' : 'fight' });
    const sparkNumber = guarded ? output.guardSparkNumber : output.sparkNumber; const sparkFromPlayer = guarded ? output.guardSparkFromPlayer : output.sparkFromPlayer;
    if (sparkNumber !== null && sparkNumber >= 0) { const towardAttacker = attackerPosition[0] === defenderPosition[0] ? -attackerFacing : attackerPosition[0] < defenderPosition[0] ? -1 : 1; this.script.outputs.emit({ kind: 'hit-spark', policy: 'character-or-fightfx-render-event', entityId: attackerEntityId, animationOwnerId: sparkFromPlayer ? attackerRootId : 'fight', animationNumber: sparkNumber, position: [Math.fround(defenderPosition[0] + output.sparkPosition[0] * towardAttacker), Math.fround(attackerPosition[1] + output.sparkPosition[1])], facing: attackerFacing, layer: 'above' }); }
    if (guarded) return;
    const palette = output.defenderPalette; if (palette.time !== 0) this.script.outputs.setPalette(defenderEntityId, { remainingTicks: palette.time, elapsedTicks: 0, add: palette.add, multiply: palette.multiply, sineAdd: [0, 0, 0, 1], invertAll: false, color: 256 });
    const shake = output.envShake; if (shake[0] > 0) this.script.outputs.setCameraShake({ remainingTicks: shake[0], elapsedTicks: 0, frequency: shake[1], amplitude: shake[2], phase: shake[3] });
  }

  #resolveKo(match: MugenHeadlessMatch): void { const first = match.fighter(this.#order[0]); const second = match.fighter(this.#order[1]); if (first.life > 0 && second.life > 0) return; match.declareKo(first.life === 0 && second.life === 0 ? null : first.life > 0 ? first.id : second.id); }
  #resolveTimeOver(match: MugenHeadlessMatch): void { const first = match.fighter(this.#order[0]); const second = match.fighter(this.#order[1]); if (first.life === second.life) match.resolveRound(null, 'draw'); else match.resolveRound(first.life > second.life ? first.id : second.id, 'time-over'); }
}

function normalizeFighter(value: MugenCombatFighterConfig, defaultCoordinateScale: number): NormalizedFighterConfig { if (!value.fighterId || value.air.actions.length === 0) throw new TypeError('MUGEN combat fighter requires an id and AIR actions.'); const actions = new Map(value.air.actions.map(action => [action.number, action])); const normalized = Object.freeze({ fighterId: value.fighterId, actions, coordinateScale: positive(value.coordinateScale ?? defaultCoordinateScale, `${value.fighterId}.coordinateScale`), neutralState: value.neutralState ?? 0, neutralAction: value.neutralAction ?? 0, hitState: value.hitState ?? 5000, hitAction: value.hitAction ?? 5000, airHitState: value.airHitState ?? 5020, airHitAction: value.airHitAction ?? 5020, guardState: value.guardState ?? 120, guardAction: value.guardAction ?? 120 }); for (const action of [normalized.neutralAction, normalized.hitAction, normalized.airHitAction, normalized.guardAction]) if (!actions.has(action)) throw new RangeError(`MUGEN AIR action ${action} is missing for ${value.fighterId}.`); return normalized; }
function other(order: readonly [string, string], id: string): string { return order[0] === id ? order[1] : order[0]; }
function targetFlagMatches(hitDef: MugenActiveHitDefinition, defender: MugenCombatDefender): boolean { if (hitDef.hitFlags.includes('+') && defender.moveType !== 'H') return false; if (hitDef.hitFlags.includes('-') && defender.moveType === 'H') return false; if (defender.stateType === 'A') return defender.hitFall ? hitDef.hitFlags.includes('F') : hitDef.hitFlags.includes('A'); if (defender.stateType === 'L') return hitDef.hitFlags.includes('D'); if (defender.stateType === 'C') return hitDef.hitFlags.includes('L') || hitDef.hitFlags.includes('M'); return hitDef.hitFlags.includes('H') || hitDef.hitFlags.includes('M'); }
function hitAttributeSlotsAllow(hitDef: MugenActiveHitDefinition, defender: Pick<MugenCombatDefender, 'hitAttributeSlots'>): boolean { const key = `${hitDef.attributeState}:${hitDef.attackAttribute}`; return defender.hitAttributeSlots.every(slot => slot === null || slot.allowedAttributes.includes(key)); }
function matchingHelperHitOverride(helper: MugenHelperEntitySnapshot, hitDef: MugenActiveHitDefinition, guarded: boolean): MugenHitOverride | null { if (guarded || hitDef.attackerStateNumber !== -1 || hitDef.defenderStateNumber !== -1 && hitDef.defenderGetsAttackerState) return null; const key = `${hitDef.attributeState}:${hitDef.attackAttribute}`; return helper.hitOverrides.find(value => value !== null && value.attributes.includes(key)) ?? null; }
function resolveContactPriority(contacts: readonly PendingContact[]): readonly PendingContact[] { if (contacts.length !== 2 || contacts[0]!.attacker.id !== contacts[1]!.defender.id || contacts[1]!.attacker.id !== contacts[0]!.defender.id) return contacts; const first = contacts[0]!; const second = contacts[1]!; if (first.hitDef.priority !== second.hitDef.priority) return Object.freeze([first.hitDef.priority > second.hitDef.priority ? first : second]); const left = first.hitDef.priorityClass; const right = second.hitDef.priorityClass; if (left === 'hit' && right === 'hit') return contacts; if (left === 'hit' && right === 'miss') return Object.freeze([first]); if (left === 'miss' && right === 'hit') return Object.freeze([second]); return Object.freeze([]); }
function canGuard(hitDef: MugenActiveHitDefinition, defender: Pick<MugenCombatDefender, 'facing' | 'stateType'>, input: MugenPlayerInputFrame): boolean { const holdingBack = input.held.includes(defender.facing === 1 ? 'left' : 'right'); if (hitDef.guardFlags === '' || !holdingBack) return false; if (defender.stateType === 'A') return hitDef.guardFlags.includes('A'); if (defender.stateType === 'C') return hitDef.guardFlags.includes('L') || hitDef.guardFlags.includes('M'); return hitDef.guardFlags.includes('H') || hitDef.guardFlags.includes('M'); }
function boxesOverlap(left: readonly MugenAirWorldCollisionBox[], right: readonly MugenAirWorldCollisionBox[]): boolean { return left.some(a => right.some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)); }
function maximumHorizontalOverlap(left: readonly MugenAirWorldCollisionBox[], right: readonly MugenAirWorldCollisionBox[]): number { let result = 0; for (const a of left) for (const b of right) if (a.top < b.bottom && a.bottom > b.top) result = Math.max(result, Math.min(a.right, b.right) - Math.max(a.left, b.left)); return Math.max(0, Math.fround(result)); }
function minimumHorizontalGap(left: readonly MugenAirWorldCollisionBox[], right: readonly MugenAirWorldCollisionBox[]): number { let result = Number.POSITIVE_INFINITY; for (const a of left) for (const b of right) if (a.top < b.bottom && a.bottom > b.top) result = Math.min(result, Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))); return result; }
function applyDistanceConstraints(match: MugenHeadlessMatch, attacker: MugenFighterSnapshot, defender: MugenFighterSnapshot, minimum: readonly [number, number] | null, maximum: readonly [number, number] | null): void { if (minimum === null && maximum === null) return; let relativeX = (defender.position[0] - attacker.position[0]) * attacker.facing; let relativeY = defender.position[1] - attacker.position[1]; if (minimum !== null) { relativeX = Math.max(relativeX, minimum[0]); relativeY = Math.max(relativeY, minimum[1]); } if (maximum !== null) { relativeX = Math.min(relativeX, maximum[0]); relativeY = Math.min(relativeY, maximum[1]); } match.setKinematics(defender.id, { position: [attacker.position[0] + relativeX * attacker.facing, attacker.position[1] + relativeY] }); }
function hashAnimation(value: MugenScriptAnimationContext): string { return hashSimulationState({ actionNumber: value.snapshot.actionNumber, actionTick: value.snapshot.actionTick, frameIndex: value.snapshot.frameIndex, frameTick: value.snapshot.frameTick, clsn1: value.snapshot.clsn1, clsn2: value.snapshot.clsn2 } as unknown as SimulationStateValue); }
function positive(value: number, label: string): number { if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) throw new RangeError(`MUGEN ${label} must be finite and positive.`); return Math.fround(value); }
function boundedInteger(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`MUGEN ${label} must be from ${minimum} to ${maximum}.`); return value; }
function vectorRange(value: readonly [number, number], label: string): readonly [number, number] { if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || value[0] >= value[1]) throw new RangeError(`MUGEN ${label} is invalid.`); return Object.freeze([Math.fround(value[0]), Math.fround(value[1])]); }
