import { MUGEN_LIMITS } from '../../import/contract';
import type { MugenExpression, MugenStateController, MugenStateDefinition } from '../../import/cns/types';
import type { MugenExpressionValue } from '../../import/expression/types';

export type MugenStatePass = 'state--3' | 'state--2' | 'state--1' | 'current';
export type MugenTriggerTraceOutcome = 'true' | 'false' | 'bottom' | 'short-circuited' | 'ignored-gap';
export type MugenControllerDisposition = 'paused' | 'hitpause' | 'trigger-false' | 'persistent-wait' | 'fired' | 'transition';

export interface MugenStateExecutionEntitySnapshot {
  readonly entityId: string;
  readonly stateNumber: number;
  readonly stateGeneration: number;
  readonly hitPaused: boolean;
  readonly paused: boolean;
  readonly helper: boolean;
  readonly keyControl: boolean;
  readonly usingOwnStateData: boolean;
}

export interface MugenStateControllerExecutionResult { readonly transitioned: boolean }
export interface MugenStateControllerExecutionContext { readonly pass: MugenStatePass; readonly stateNumber: number; readonly controllerIndex: number }
export interface MugenStateExecutorHost {
  snapshot(): MugenStateExecutionEntitySnapshot;
  state(number: number, owner: 'own' | 'current'): MugenStateDefinition | null;
  evaluate(expression: MugenExpression): MugenExpressionValue;
  execute(controller: MugenStateController, context: MugenStateControllerExecutionContext): MugenStateControllerExecutionResult;
}

export interface MugenTriggerExpressionTrace {
  readonly kind: 'triggerall' | 'group';
  readonly group: number | null;
  readonly index: number;
  readonly outcome: MugenTriggerTraceOutcome;
}
export interface MugenControllerExecutionTrace {
  readonly sequence: number;
  readonly pass: MugenStatePass;
  readonly stateNumber: number;
  readonly controllerIndex: number;
  readonly controllerKey: string;
  readonly disposition: MugenControllerDisposition;
  readonly triggers: readonly MugenTriggerExpressionTrace[];
}
export interface MugenStateExecutionResult {
  readonly evaluatedControllers: number;
  readonly firedControllers: number;
  readonly transitions: number;
  readonly trace: readonly MugenControllerExecutionTrace[];
}
export interface MugenStateExecutorSnapshot {
  readonly schemaVersion: 1;
  readonly revision: 'm09-g02-state-executor-v1';
  readonly entries: readonly Readonly<{ key: string; trueCount: number; firedOnce: boolean }>[];
}

interface PersistentEntry { trueCount: number; firedOnce: boolean }

export class MugenStateExecutor {
  readonly maxControllerEvaluationsPerTick: number;
  readonly maxStateReentriesPerTick: number;
  readonly #persistent = new Map<string, PersistentEntry>();

  constructor(options: Readonly<{ maxControllerEvaluationsPerTick?: number; maxStateReentriesPerTick?: number }> = {}) {
    this.maxControllerEvaluationsPerTick = bounded(options.maxControllerEvaluationsPerTick ?? 4_096, 1, 8_192, 'controller evaluation');
    this.maxStateReentriesPerTick = bounded(options.maxStateReentriesPerTick ?? MUGEN_LIMITS.compilerAndVm.maxStateReentriesPerTick, 1, MUGEN_LIMITS.compilerAndVm.maxStateReentriesPerTick, 'state re-entry');
  }

  executeTick(host: MugenStateExecutorHost, options: Readonly<{ trace?: boolean }> = {}): MugenStateExecutionResult {
    const trace: MugenControllerExecutionTrace[] = []; const counters = { evaluated: 0, fired: 0, transitions: 0, sequence: 0 };
    const initial = host.snapshot();
    const special: Array<readonly [number, MugenStatePass]> = [];
    if (!initial.helper) {
      if (initial.usingOwnStateData) special.push([-3, 'state--3']);
      special.push([-2, 'state--2']);
      if (initial.keyControl) special.push([-1, 'state--1']);
    } else if (initial.keyControl) special.push([-1, 'state--1']);
    for (const [number, pass] of special) { const state = host.state(number, 'own'); if (state) this.#executeState(host, state, pass, 'special', trace, counters, options.trace === true); }
    for (let reentry = 0; ; reentry += 1) {
      if (reentry >= this.maxStateReentriesPerTick) throw new RangeError(`MUGEN entity ${host.snapshot().entityId} exceeds the state re-entry budget.`);
      const snapshot = host.snapshot(); const state = host.state(snapshot.stateNumber, 'current'); if (!state) throw new RangeError(`MUGEN entity ${snapshot.entityId} entered missing state ${snapshot.stateNumber}.`);
      const transitioned = this.#executeState(host, state, 'current', `current:${snapshot.stateGeneration}`, trace, counters, options.trace === true);
      if (!transitioned) break;
    }
    return Object.freeze({ evaluatedControllers: counters.evaluated, firedControllers: counters.fired, transitions: counters.transitions, trace: Object.freeze(trace) });
  }

  snapshot(): MugenStateExecutorSnapshot { return Object.freeze({ schemaVersion: 1, revision: 'm09-g02-state-executor-v1', entries: Object.freeze([...this.#persistent.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => Object.freeze({ key, trueCount: value.trueCount, firedOnce: value.firedOnce }))) }); }
  restore(value: MugenStateExecutorSnapshot): void {
    if (!value || value.schemaVersion !== 1 || value.revision !== 'm09-g02-state-executor-v1' || !Array.isArray(value.entries) || value.entries.length > 65_536) throw new TypeError('MUGEN state executor snapshot is invalid.');
    const next = new Map<string, PersistentEntry>();
    for (const entry of value.entries) { if (!entry || typeof entry.key !== 'string' || entry.key.length < 1 || entry.key.length > 1_024 || next.has(entry.key) || !Number.isSafeInteger(entry.trueCount) || entry.trueCount < 0 || typeof entry.firedOnce !== 'boolean') throw new TypeError('MUGEN state executor persistent entry is invalid.'); next.set(entry.key, { trueCount: entry.trueCount, firedOnce: entry.firedOnce }); }
    this.#persistent.clear(); for (const [key, entry] of next) this.#persistent.set(key, entry);
  }
  reset(): void { this.#persistent.clear(); }

  #executeState(host: MugenStateExecutorHost, state: MugenStateDefinition, pass: MugenStatePass, epoch: string, trace: MugenControllerExecutionTrace[], counters: { evaluated: number; fired: number; transitions: number; sequence: number }, traceEnabled: boolean): boolean {
    for (let controllerIndex = 0; controllerIndex < state.controllers.length; controllerIndex += 1) {
      counters.evaluated += 1; if (counters.evaluated > this.maxControllerEvaluationsPerTick) throw new RangeError(`MUGEN entity ${host.snapshot().entityId} exceeds the controller evaluation budget.`);
      const controller = state.controllers[controllerIndex]!; const snapshot = host.snapshot(); const controllerKey = `${snapshot.entityId}|${epoch}|${state.number}|${controllerIndex}|${controller.sourcePath}:${controller.sourceLine}`;
      if (snapshot.paused) { addTrace(trace, traceEnabled, counters, pass, state.number, controllerIndex, controllerKey, 'paused', []); continue; }
      if (snapshot.hitPaused && !controller.ignoreHitPause) { addTrace(trace, traceEnabled, counters, pass, state.number, controllerIndex, controllerKey, 'hitpause', []); continue; }
      const triggerTrace: MugenTriggerExpressionTrace[] = []; const passed = evaluateTriggers(controller, host, triggerTrace);
      if (!passed) { addTrace(trace, traceEnabled, counters, pass, state.number, controllerIndex, controllerKey, 'trigger-false', triggerTrace); continue; }
      const entry = this.#persistent.get(controllerKey) ?? { trueCount: 0, firedOnce: false }; entry.trueCount = controller.persistent === 0 ? 1 : entry.trueCount + 1; this.#persistent.set(controllerKey, entry);
      const fires = controller.persistent === 0 ? !entry.firedOnce : entry.trueCount === controller.persistent;
      if (!fires) { addTrace(trace, traceEnabled, counters, pass, state.number, controllerIndex, controllerKey, 'persistent-wait', triggerTrace); continue; }
      entry.firedOnce = true; if (controller.persistent > 0) entry.trueCount = 0; counters.fired += 1; const beforeExecution = host.snapshot(); const result = host.execute(controller, Object.freeze({ pass, stateNumber: state.number, controllerIndex }));
      if (result.transitioned) { const afterExecution = host.snapshot(); if (afterExecution.stateGeneration <= beforeExecution.stateGeneration) throw new Error('MUGEN state transition must advance stateGeneration.'); counters.transitions += 1; addTrace(trace, traceEnabled, counters, pass, state.number, controllerIndex, controllerKey, 'transition', triggerTrace); return true; }
      addTrace(trace, traceEnabled, counters, pass, state.number, controllerIndex, controllerKey, 'fired', triggerTrace);
    }
    return false;
  }
}

function evaluateTriggers(controller: MugenStateController, host: MugenStateExecutorHost, trace: MugenTriggerExpressionTrace[]): boolean {
  for (let index = 0; index < controller.triggerAll.length; index += 1) {
    const outcome = condition(host.evaluate(controller.triggerAll[index]!)); trace.push(Object.freeze({ kind: 'triggerall', group: null, index, outcome }));
    if (outcome !== 'true') { for (let rest = index + 1; rest < controller.triggerAll.length; rest += 1) trace.push(Object.freeze({ kind: 'triggerall', group: null, index: rest, outcome: 'short-circuited' })); appendGroups(controller, trace, 'short-circuited'); return false; }
  }
  let expectedGroup = 1;
  for (let groupIndex = 0; groupIndex < controller.triggerGroups.length; groupIndex += 1) {
    const group = controller.triggerGroups[groupIndex]!;
    if (group.group !== expectedGroup) { for (let rest = groupIndex; rest < controller.triggerGroups.length; rest += 1) for (let index = 0; index < controller.triggerGroups[rest]!.expressions.length; index += 1) trace.push(Object.freeze({ kind: 'group', group: controller.triggerGroups[rest]!.group, index, outcome: 'ignored-gap' })); return false; }
    let groupPassed = true;
    for (let index = 0; index < group.expressions.length; index += 1) { const outcome = condition(host.evaluate(group.expressions[index]!)); trace.push(Object.freeze({ kind: 'group', group: group.group, index, outcome })); if (outcome !== 'true') { groupPassed = false; for (let rest = index + 1; rest < group.expressions.length; rest += 1) trace.push(Object.freeze({ kind: 'group', group: group.group, index: rest, outcome: 'short-circuited' })); break; } }
    if (groupPassed) { for (let rest = groupIndex + 1; rest < controller.triggerGroups.length; rest += 1) for (let index = 0; index < controller.triggerGroups[rest]!.expressions.length; index += 1) trace.push(Object.freeze({ kind: 'group', group: controller.triggerGroups[rest]!.group, index, outcome: 'short-circuited' })); return true; }
    expectedGroup += 1;
  }
  return false;
}
function appendGroups(controller: MugenStateController, trace: MugenTriggerExpressionTrace[], outcome: MugenTriggerTraceOutcome): void { for (const group of controller.triggerGroups) for (let index = 0; index < group.expressions.length; index += 1) trace.push(Object.freeze({ kind: 'group', group: group.group, index, outcome })); }
function condition(value: MugenExpressionValue): 'true' | 'false' | 'bottom' { if (value.kind === 'bottom') return 'bottom'; if (value.kind === 'int' || value.kind === 'float') return value.value === 0 ? 'false' : 'true'; return 'bottom'; }
function addTrace(trace: MugenControllerExecutionTrace[], enabled: boolean, counters: { sequence: number }, pass: MugenStatePass, stateNumber: number, controllerIndex: number, controllerKey: string, disposition: MugenControllerDisposition, triggers: readonly MugenTriggerExpressionTrace[]): void { if (!enabled) return; if (trace.length >= MUGEN_LIMITS.compilerAndVm.maxTriggerTraceEntriesPerTick) throw new RangeError('MUGEN trigger trace exceeds its entry budget.'); trace.push(Object.freeze({ sequence: counters.sequence++, pass, stateNumber, controllerIndex, controllerKey, disposition, triggers: Object.freeze([...triggers]) })); }
function bounded(value: number, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`MUGEN ${label} budget must be from ${minimum} to ${maximum}.`); return value; }
