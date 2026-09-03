import { MUGEN_LIMITS } from '../contract';
import type { MugenExpressionAst, MugenExpressionInstruction, MugenExpressionProgram, MugenExpressionSource } from './types';

export function compileMugenExpression(ast: MugenExpressionAst, source: MugenExpressionSource | null = null): MugenExpressionProgram {
  const compiler = new Compiler(); compiler.emitExpression(ast, 1, 0); compiler.emit(Object.freeze({ op: 'return' }));
  const instructions = Object.freeze(compiler.instructions);
  const maxStack = validateExpressionInstructions(instructions);
  const program: MugenExpressionProgram = Object.freeze({ schemaVersion: 1, revision: 'm09-g01-expression-bytecode-v1', instructions, maxStack, source: source === null ? null : Object.freeze({ ...source }) });
  validateExpressionProgram(program); return program;
}

class Compiler {
  readonly instructions: MugenExpressionInstruction[] = [];
  emit(instruction: MugenExpressionInstruction): number { this.instructions.push(instruction); return this.instructions.length - 1; }
  replace(index: number, instruction: MugenExpressionInstruction): void { this.instructions[index] = instruction; }

  emitExpression(expression: MugenExpressionAst, depth: number, callDepth: number): void {
    if (depth > MUGEN_LIMITS.compilerAndVm.maxExpressionDepth) throw new RangeError('MUGEN expression exceeds the compiler depth budget.');
    if (callDepth > MUGEN_LIMITS.compilerAndVm.maxCallDepth) throw new RangeError('MUGEN expression exceeds the function call depth budget.');
    switch (expression.kind) {
      case 'literal':
        if (expression.value.kind === 'int') this.emit(Object.freeze({ op: 'push-int', value: expression.value.value }));
        else if (expression.value.kind === 'float') this.emit(Object.freeze({ op: 'push-float', value: expression.value.value }));
        else if (expression.value.kind === 'string') this.emit(Object.freeze({ op: 'push-string', value: expression.value.value }));
        else throw new TypeError('A source expression cannot contain a bottom literal.');
        return;
      case 'reference': this.emit(Object.freeze({ op: 'load-reference', name: expression.name })); return;
      case 'group': this.emitExpression(expression.expression, depth + 1, callDepth); return;
      case 'call':
        if (expression.name === 'cond' && expression.arguments.length === 3) { this.#emitCond(expression.arguments, depth + 1, callDepth + 1); return; }
        if ((expression.name === 'var' || expression.name === 'fvar') && expression.arguments.length === 1) { this.emitExpression(expression.arguments[0]!, depth + 1, callDepth + 1); this.emit(Object.freeze({ op: 'load-variable', variableType: expression.name === 'var' ? 'integer' : 'float' })); return; }
        if (expression.name === 'const' && expression.arguments.length === 1 && expression.arguments[0]?.kind === 'reference') { this.emit(Object.freeze({ op: 'push-string', value: expression.arguments[0].name })); this.emit(Object.freeze({ op: 'call', name: expression.name, argumentCount: 1 })); return; }
        for (const argument of expression.arguments) this.emitExpression(argument, depth + 1, callDepth + 1);
        this.emit(Object.freeze({ op: 'call', name: expression.name, argumentCount: expression.arguments.length })); return;
      case 'unary': this.emitExpression(expression.operand, depth + 1, callDepth); this.emit(Object.freeze({ op: 'unary', operator: expression.operator })); return;
      case 'binary':
        if (expression.operator === '&&' || expression.operator === '||') { this.#emitLogical(expression, depth + 1, callDepth); return; }
        this.emitExpression(expression.left, depth + 1, callDepth); this.emitExpression(expression.right, depth + 1, callDepth); this.emit(Object.freeze({ op: 'binary', operator: expression.operator })); return;
      case 'interval':
        this.emitExpression(expression.value, depth + 1, callDepth); this.emitExpression(expression.lower, depth + 1, callDepth); this.emitExpression(expression.upper, depth + 1, callDepth);
        this.emit(Object.freeze({ op: 'interval', operator: expression.operator, includeLower: expression.includeLower, includeUpper: expression.includeUpper })); return;
      case 'assignment':
        this.emitExpression(expression.index, depth + 1, callDepth); this.emitExpression(expression.value, depth + 1, callDepth); this.emit(Object.freeze({ op: 'store-variable', variableType: expression.variableType })); return;
      case 'redirect': throw new TypeError('MUGEN trigger redirection must be compiled by the G02 runtime expression compiler.');
    }
  }

  #emitLogical(expression: Extract<MugenExpressionAst, { kind: 'binary' }>, depth: number, callDepth: number): void {
    this.emitExpression(expression.left, depth, callDepth); const branch = this.emit(Object.freeze({ op: expression.operator === '&&' ? 'branch-and' : 'branch-or', target: -1 }) as MugenExpressionInstruction);
    this.emitExpression(expression.right, depth, callDepth); this.emit(Object.freeze({ op: 'truthy' }));
    this.replace(branch, Object.freeze({ op: expression.operator === '&&' ? 'branch-and' : 'branch-or', target: this.instructions.length }) as MugenExpressionInstruction);
  }

  #emitCond(args: readonly MugenExpressionAst[], depth: number, callDepth: number): void {
    this.emitExpression(args[0]!, depth, callDepth); const branch = this.emit(Object.freeze({ op: 'branch-cond', falseTarget: -1, bottomTarget: -1 }));
    this.emitExpression(args[1]!, depth, callDepth); const jump = this.emit(Object.freeze({ op: 'jump', target: -1 }));
    const falseTarget = this.instructions.length; this.emitExpression(args[2]!, depth, callDepth); const end = this.instructions.length;
    this.replace(branch, Object.freeze({ op: 'branch-cond', falseTarget, bottomTarget: end })); this.replace(jump, Object.freeze({ op: 'jump', target: end }));
  }
}

export function validateExpressionProgram(value: unknown): asserts value is MugenExpressionProgram {
  if (!record(value) || value.schemaVersion !== 1 || value.revision !== 'm09-g01-expression-bytecode-v1' || !Array.isArray(value.instructions) || !Number.isSafeInteger(value.maxStack) || Number(value.maxStack) < 1 || (value.source !== null && (!record(value.source) || !boundedString(value.source.canonicalPath, MUGEN_LIMITS.directoryAndArchive.maxPathUtf8Bytes) || !positiveInteger(value.source.line) || !positiveInteger(value.source.column)))) throw new TypeError('MUGEN expression bytecode envelope is invalid.');
  exactKeys(value, ['schemaVersion', 'revision', 'instructions', 'maxStack', 'source']); if (value.source !== null) exactKeys(value.source, ['canonicalPath', 'line', 'column']);
  const instructions = value.instructions as unknown[];
  if (instructions.length < 2 || instructions.length > MUGEN_LIMITS.compilerAndVm.maxInstructionsPerExpression) throw new RangeError('MUGEN expression bytecode instruction count exceeds its budget.');
  for (const instruction of instructions) validateInstruction(instruction, instructions.length);
  const observed = validateExpressionInstructions(instructions as MugenExpressionInstruction[]);
  if (observed !== value.maxStack) throw new TypeError(`MUGEN expression maxStack mismatch: declared ${value.maxStack}, observed ${observed}.`);
}

function validateExpressionInstructions(instructions: readonly MugenExpressionInstruction[]): number {
  if (instructions.length > MUGEN_LIMITS.compilerAndVm.maxInstructionsPerExpression) throw new RangeError('MUGEN expression exceeds the instruction budget.');
  const depths = new Map<number, number>([[0, 0]]); const queue = [0]; let maximum = 0; let sawReturn = false;
  while (queue.length > 0) {
    const pc = queue.shift()!; const depth = depths.get(pc)!; if (pc === instructions.length) throw new TypeError('MUGEN expression has a reachable path without return.');
    const instruction = instructions[pc]; if (!instruction) throw new TypeError(`MUGEN expression jumps outside bytecode at ${pc}.`);
    const [pop, push] = stackEffect(instruction); if (depth < pop) throw new TypeError(`MUGEN expression stack underflow at ${pc}.`);
    const nextDepth = depth - pop + push; maximum = Math.max(maximum, nextDepth);
    if (maximum > MUGEN_LIMITS.compilerAndVm.maxStackDepth) throw new RangeError('MUGEN expression exceeds the stack budget.');
    const targets = successors(pc, instruction, instructions.length, depth, nextDepth);
    if (instruction.op === 'return') { sawReturn = true; if (depth !== 1) throw new TypeError(`MUGEN return at ${pc} requires exactly one value.`); }
    for (const [target, targetDepth] of targets) { const prior = depths.get(target); if (prior !== undefined && prior !== targetDepth) throw new TypeError(`MUGEN bytecode joins incompatible stack depths at ${target}.`); if (prior === undefined) { depths.set(target, targetDepth); queue.push(target); } }
  }
  if (!sawReturn) throw new TypeError('MUGEN expression bytecode has no reachable return.');
  for (let pc = 0; pc < instructions.length; pc++) if (!depths.has(pc)) throw new TypeError(`MUGEN expression contains unreachable instruction ${pc}.`);
  return maximum;
}

function validateInstruction(value: unknown, length: number): asserts value is MugenExpressionInstruction {
  if (!record(value) || typeof value.op !== 'string') throw new TypeError('MUGEN expression instruction is invalid.');
  const target = (key: string): void => { if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) >= length) throw new TypeError(`MUGEN expression ${key} is invalid.`); };
  switch (value.op) {
    case 'push-int': exactKeys(value, ['op', 'value']); if (!int32(value.value)) throw new TypeError('push-int value is invalid.'); return;
    case 'push-float': exactKeys(value, ['op', 'value']); if (typeof value.value !== 'number' || !Number.isFinite(value.value) || !Object.is(Math.fround(value.value), value.value)) throw new TypeError('push-float value is invalid.'); return;
    case 'push-string': exactKeys(value, ['op', 'value']); if (!boundedString(value.value, MUGEN_LIMITS.compilerAndVm.maxStringBytes)) throw new TypeError('push-string payload is invalid.'); return;
    case 'load-reference': exactKeys(value, ['op', 'name']); if (!expressionName(value.name)) throw new TypeError('load-reference payload is invalid.'); return;
    case 'load-variable': case 'store-variable': exactKeys(value, ['op', 'variableType']); if (value.variableType !== 'integer' && value.variableType !== 'float') throw new TypeError(`${value.op} type is invalid.`); return;
    case 'call': exactKeys(value, ['op', 'name', 'argumentCount']); if (!expressionName(value.name) || !Number.isSafeInteger(value.argumentCount) || Number(value.argumentCount) < 0 || Number(value.argumentCount) > MUGEN_LIMITS.compilerAndVm.maxFunctionArguments) throw new TypeError('call instruction is invalid.'); return;
    case 'unary': exactKeys(value, ['op', 'operator']); if (!['+', '-', '!', '~'].includes(String(value.operator))) throw new TypeError('unary instruction is invalid.'); return;
    case 'binary': exactKeys(value, ['op', 'operator']); if (!['+', '-', '*', '/', '%', '**', '>', '>=', '<', '<=', '=', '!=', '&', '^', '|', '^^'].includes(String(value.operator))) throw new TypeError('binary instruction is invalid.'); return;
    case 'interval': exactKeys(value, ['op', 'operator', 'includeLower', 'includeUpper']); if ((value.operator !== '=' && value.operator !== '!=') || typeof value.includeLower !== 'boolean' || typeof value.includeUpper !== 'boolean') throw new TypeError('interval instruction is invalid.'); return;
    case 'branch-and': case 'branch-or': case 'jump': exactKeys(value, ['op', 'target']); target('target'); return;
    case 'branch-cond': exactKeys(value, ['op', 'falseTarget', 'bottomTarget']); target('falseTarget'); target('bottomTarget'); return;
    case 'truthy': case 'return': exactKeys(value, ['op']); return;
    default: throw new TypeError(`Unknown MUGEN expression opcode ${value.op}.`);
  }
}

function stackEffect(instruction: MugenExpressionInstruction): readonly [number, number] {
  switch (instruction.op) {
    case 'push-int': case 'push-float': case 'push-string': case 'load-reference': return [0, 1];
    case 'load-variable': return [1, 1]; case 'call': return [instruction.argumentCount, 1]; case 'unary': case 'truthy': return [1, 1];
    case 'binary': return [2, 1]; case 'interval': return [3, 1]; case 'store-variable': return [2, 1];
    case 'branch-and': case 'branch-or': case 'branch-cond': return [1, 1]; case 'jump': return [0, 0]; case 'return': return [1, 0];
  }
}
function successors(pc: number, instruction: MugenExpressionInstruction, length: number, depth: number, nextDepth: number): readonly (readonly [number, number])[] { if (instruction.op === 'return') return []; if (instruction.op === 'jump') return [[instruction.target, nextDepth]]; if (instruction.op === 'branch-and' || instruction.op === 'branch-or') return [[pc + 1, depth - 1], [instruction.target, depth]]; if (instruction.op === 'branch-cond') return [[pc + 1, depth - 1], [instruction.falseTarget, depth - 1], [instruction.bottomTarget, depth]]; return [[Math.min(pc + 1, length), nextDepth]]; }
function positiveInteger(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) >= 1; }
function int32(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) >= -2_147_483_648 && Number(value) <= 2_147_483_647; }
function boundedString(value: unknown, maximumBytes: number): value is string { return typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maximumBytes; }
function expressionName(value: unknown): value is string { return typeof value === 'string' && /^[a-z_][a-z0-9_.]*$/u.test(value); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`MUGEN expression instruction has unknown or missing fields: ${actual.join(',')}.`); }
