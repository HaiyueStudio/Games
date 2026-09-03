import { hashSimulationState, type SimulationStateValue } from '@haiyue/engine/experimental/simulation';
import type { MugenCommandButton, MugenCommandDefinition, MugenCommandDirection, MugenCommandProgram, MugenCommandToken } from '../../import/cmd/types';
import type { MugenInputHistory, MugenPlayerInputFrame } from '../input/MugenInputRuntime';

export interface MugenCommandMatchResult {
  readonly tick: number;
  readonly playerId: string;
  readonly names: readonly string[];
  readonly hash: string;
}

export class MugenCommandMatcher {
  readonly program: MugenCommandProgram;

  constructor(program: MugenCommandProgram) { this.program = validateProgram(program); }

  match(history: MugenInputHistory, playerId: string): MugenCommandMatchResult {
    const frames = history.snapshot().map(tick => tick.players.find(player => player.playerId === playerId)).filter((value): value is MugenPlayerInputFrame => value !== undefined);
    if (frames.length === 0) throw new RangeError(`MUGEN command matcher has no input for ${playerId}.`);
    const names: string[] = [];
    const seen = new Set<string>();
    for (const command of this.program.commands) {
      if (seen.has(command.foldedName) || !matchesBuffered(command, frames)) continue;
      seen.add(command.foldedName); names.push(command.foldedName);
    }
    const base = Object.freeze({ tick: frames.at(-1)!.tick, playerId, names: Object.freeze(names) });
    return Object.freeze({ ...base, hash: hashSimulationState(base as unknown as SimulationStateValue) });
  }
}

function matchesBuffered(command: MugenCommandDefinition, frames: readonly MugenPlayerInputFrame[]): boolean {
  const last = frames.length - 1;
  const earliestEnd = Math.max(0, last - command.bufferTime + 1);
  for (let end = last; end >= earliestEnd; end -= 1) {
    const frame = frames[end]!;
    if (frame.aiLevel > 0 && frame.aiCommands.includes(command.foldedName)) return true;
    if (matchesAt(command, frames, end)) return true;
  }
  return false;
}

function matchesAt(command: MugenCommandDefinition, frames: readonly MugenPlayerInputFrame[], end: number): boolean {
  // Official 1.1 accepts a one-step time=0 command on the current input edge,
  // while a multi-step sequence has no earlier tick available in that window.
  const minimum = command.time === 0 ? end : Math.max(0, end - command.time + 1);
  const indices = Array.from({ length: command.steps.length }, () => -1);
  let cursor = end;
  for (let step = command.steps.length - 1; step >= 0; step -= 1) {
    let matched = -1;
    const searchMinimum = step === command.steps.length - 1 ? cursor : minimum;
    for (let index = cursor; index >= searchMinimum; index -= 1) if (matchesStep(command.steps[step]!.tokens, frames, index)) { matched = index; break; }
    if (matched < 0) return false;
    indices[step] = matched; cursor = matched - 1;
  }
  for (let step = 1; step < command.steps.length; step += 1) {
    if (!command.steps[step]!.tokens.some(token => token.noOtherInput)) continue;
    for (let index = indices[step - 1]! + 1; index < indices[step]!; index += 1) if (hasInputEdge(frames, index)) return false;
  }
  return true;
}

function matchesStep(tokens: readonly MugenCommandToken[], frames: readonly MugenPlayerInputFrame[], index: number): boolean { return tokens.every(token => matchesToken(token, frames, index)); }

function matchesToken(token: MugenCommandToken, frames: readonly MugenPlayerInputFrame[], index: number): boolean {
  const frame = frames[index]!;
  const previous = frames[index - 1];
  if (token.targetType === 'button') {
    const target = token.target as MugenCommandButton;
    if (token.mode === 'hold') return frame.held.includes(target);
    if (token.mode === 'press') return frame.pressed.includes(target);
    if (!frame.released.includes(target)) return false;
    return token.chargeTicks === 0 || heldFor(frames, index - 1, token, token.chargeTicks);
  }
  const currentMatches = directionMatches(frame.facingDirection, token.target as MugenCommandDirection, token.fourWay);
  const previousMatches = previous !== undefined && directionMatches(previous.facingDirection, token.target as MugenCommandDirection, token.fourWay);
  if (token.mode === 'hold') return currentMatches;
  if (token.mode === 'press') return currentMatches && !previousMatches;
  if (currentMatches || !previousMatches) return false;
  return token.chargeTicks === 0 || heldFor(frames, index - 1, token, token.chargeTicks);
}

function heldFor(frames: readonly MugenPlayerInputFrame[], end: number, token: MugenCommandToken, ticks: number): boolean {
  if (end - ticks + 1 < 0) return false;
  for (let index = end; index > end - ticks; index -= 1) {
    const frame = frames[index]!;
    if (token.targetType === 'button' ? !frame.held.includes(token.target as never) : !directionMatches(frame.facingDirection, token.target as MugenCommandDirection, token.fourWay)) return false;
  }
  return true;
}

function directionMatches(actual: string, expected: MugenCommandDirection, fourWay: boolean): boolean {
  if (!fourWay) return actual === expected;
  if (expected === 'D') return actual === 'D' || actual === 'DF' || actual === 'DB';
  if (expected === 'U') return actual === 'U' || actual === 'UF' || actual === 'UB';
  if (expected === 'F') return actual === 'F' || actual === 'DF' || actual === 'UF';
  if (expected === 'B') return actual === 'B' || actual === 'DB' || actual === 'UB';
  return actual === expected;
}

function hasInputEdge(frames: readonly MugenPlayerInputFrame[], index: number): boolean { const frame = frames[index]!; const previous = frames[index - 1]; return frame.pressed.length > 0 || frame.released.length > 0 || (previous !== undefined && frame.facingDirection !== previous.facingDirection); }
function validateProgram(program: MugenCommandProgram): MugenCommandProgram { if (!program || program.schemaVersion !== 1 || program.revision !== 'm08-g08b-command-v1' || !Array.isArray(program.commands) || program.commands.length === 0) throw new TypeError('MUGEN command program is invalid.'); return program; }
