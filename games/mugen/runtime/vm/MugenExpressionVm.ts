import { MUGEN_LIMITS } from '../../import/contract';
import { validateExpressionProgram } from '../../import/expression/MugenExpressionCompiler';
import { mugenBottom, mugenFloat, mugenInt, mugenString, type MugenBinaryOperator, type MugenExpressionInstruction, type MugenExpressionProgram, type MugenExpressionValue, type MugenUnaryOperator } from '../../import/expression/types';

const INT_MIN = -2_147_483_648;
const INT_MAX = 2_147_483_647;

export interface MugenExpressionVmVariables {
  readonly integer: Int32Array | readonly number[];
  readonly float: Float32Array | readonly number[];
}

export interface MugenExpressionVmContext {
  readonly variables: MugenExpressionVmVariables;
  readonly random: Readonly<{ nextMugenRandom(): number }>;
  resolve(name: string): MugenExpressionValue;
  call(name: string, arguments_: readonly MugenExpressionValue[]): MugenExpressionValue;
}

export interface MugenExpressionVmResult {
  readonly value: MugenExpressionValue;
  readonly fuelUsed: number;
  readonly bottomReasons: readonly string[];
}

export class MugenVmFault extends Error {
  readonly name = 'MugenVmFault';
  readonly code: 'E_MUGEN_VM_BUDGET' | 'E_MUGEN_VM_BYTECODE';
  readonly pc: number;
  constructor(code: 'E_MUGEN_VM_BUDGET' | 'E_MUGEN_VM_BYTECODE', message: string, pc: number) { super(message); this.code = code; this.pc = pc; }
}

export class MugenVmFuelMeter {
  readonly limit: number;
  #remaining: number;
  constructor(limit: number = MUGEN_LIMITS.compilerAndVm.maxFuelPerEvaluation) { if (!Number.isSafeInteger(limit) || limit < 1 || limit > MUGEN_LIMITS.compilerAndVm.maxFuelPerEvaluation) throw new RangeError('MUGEN expression fuel is outside the frozen budget.'); this.limit = limit; this.#remaining = limit; }
  get remaining(): number { return this.#remaining; }
  consume(pc: number): void { if (this.#remaining === 0) throw new MugenVmFault('E_MUGEN_VM_BUDGET', `MUGEN expression exhausted fuel at instruction ${pc}.`, pc); this.#remaining -= 1; }
}

export class MugenSeededRandom {
  #state: number;
  constructor(seed: number) { if (!Number.isSafeInteger(seed)) throw new TypeError('MUGEN random seed must be an integer.'); this.#state = seed >>> 0 || 0x6d2b79f5; }
  get state(): number { return this.#state >>> 0; }
  restore(state: number): void { if (!Number.isSafeInteger(state) || state < 0 || state > 0xffff_ffff) throw new RangeError('MUGEN random state must be uint32.'); this.#state = state >>> 0 || 0x6d2b79f5; }
  nextUint32(): number { let value = this.#state >>> 0; value ^= value << 13; value ^= value >>> 17; value ^= value << 5; this.#state = value >>> 0 || 0x6d2b79f5; return this.#state; }
  nextMugenRandom(): number { return this.nextUint32() % 1000; }
}

export class BasicMugenExpressionVmContext implements MugenExpressionVmContext {
  readonly variables: MugenExpressionVmVariables;
  readonly random: MugenSeededRandom;
  readonly #references: Readonly<Record<string, MugenExpressionValue>>;
  readonly #functions: Readonly<Record<string, (arguments_: readonly MugenExpressionValue[]) => MugenExpressionValue>>;
  constructor(options: Readonly<{ integerVariables?: Int32Array; floatVariables?: Float32Array; seed?: number; references?: Readonly<Record<string, MugenExpressionValue>>; functions?: Readonly<Record<string, (arguments_: readonly MugenExpressionValue[]) => MugenExpressionValue>> }> = {}) {
    this.variables = Object.freeze({ integer: options.integerVariables ?? new Int32Array(60), float: options.floatVariables ?? new Float32Array(40) });
    this.random = new MugenSeededRandom(options.seed ?? 1); this.#references = options.references ?? Object.freeze({}); this.#functions = options.functions ?? Object.freeze({});
  }
  resolve(name: string): MugenExpressionValue { if (name === 'random') return mugenInt(this.random.nextMugenRandom()); if (name === 'pi') return mugenFloat(Math.PI); if (name === 'e') return mugenFloat(Math.E); return this.#references[name] ?? mugenBottom(`unknown reference ${name}`); }
  call(name: string, arguments_: readonly MugenExpressionValue[]): MugenExpressionValue { return this.#functions[name]?.(arguments_) ?? mugenBottom(`unknown function ${name}`); }
}

export function evaluateMugenExpression(program: MugenExpressionProgram, context: MugenExpressionVmContext, options: Readonly<{ fuel?: number; meter?: MugenVmFuelMeter }> = {}): MugenExpressionVmResult {
  validateExpressionProgram(program);
  if (options.fuel !== undefined && options.meter !== undefined) throw new TypeError('MUGEN expression accepts either fuel or a shared meter, not both.');
  const meter = options.meter ?? new MugenVmFuelMeter(options.fuel); const initialFuel = meter.remaining; const stack: MugenExpressionValue[] = []; const bottomReasons: string[] = []; let pc = 0;
  const push = (value: MugenExpressionValue): void => { if (value.kind === 'bottom') bottomReasons.push(value.reason); stack.push(value); if (stack.length > program.maxStack) throw new MugenVmFault('E_MUGEN_VM_BYTECODE', 'MUGEN expression exceeded its declared stack.', pc); };
  const pop = (): MugenExpressionValue => { const value = stack.pop(); if (!value) throw new MugenVmFault('E_MUGEN_VM_BYTECODE', 'MUGEN expression stack underflow.', pc); return value; };
  const replaceTop = (value: MugenExpressionValue): void => { if (value.kind === 'bottom') bottomReasons.push(value.reason); stack[stack.length - 1] = value; };
  while (pc < program.instructions.length) {
    meter.consume(pc);
    const instruction = program.instructions[pc]!;
    switch (instruction.op) {
      case 'push-int': push(mugenInt(instruction.value)); pc++; break;
      case 'push-float': push(mugenFloat(instruction.value)); pc++; break;
      case 'push-string': push(mugenString(instruction.value)); pc++; break;
      case 'load-reference': push(context.resolve(instruction.name)); pc++; break;
      case 'load-variable': { const index = pop(); push(loadVariable(context.variables, instruction.variableType, index)); pc++; break; }
      case 'call': { const args = stack.splice(stack.length - instruction.argumentCount, instruction.argumentCount); if (args.length !== instruction.argumentCount) throw new MugenVmFault('E_MUGEN_VM_BYTECODE', 'MUGEN call stack underflow.', pc); push(callValue(instruction.name, args, context)); pc++; break; }
      case 'unary': push(unaryValue(instruction.operator, pop())); pc++; break;
      case 'binary': { const right = pop(); const left = pop(); push(binaryValue(instruction.operator, left, right)); pc++; break; }
      case 'interval': { const upper = pop(); const lower = pop(); const value = pop(); push(intervalValue(instruction, value, lower, upper)); pc++; break; }
      case 'store-variable': { const value = pop(); const index = pop(); push(storeVariable(context.variables, instruction.variableType, index, value)); pc++; break; }
      case 'branch-and': { const value = stack[stack.length - 1]!; if (value.kind === 'bottom') pc = instruction.target; else if (!numeric(value)) { replaceTop(mugenBottom('logical and requires numeric operands')); pc = instruction.target; } else if (!truthy(value)) { replaceTop(mugenInt(0)); pc = instruction.target; } else { stack.pop(); pc++; } break; }
      case 'branch-or': { const value = stack[stack.length - 1]!; if (value.kind === 'bottom') pc = instruction.target; else if (!numeric(value)) { replaceTop(mugenBottom('logical or requires numeric operands')); pc = instruction.target; } else if (truthy(value)) { replaceTop(mugenInt(1)); pc = instruction.target; } else { stack.pop(); pc++; } break; }
      case 'branch-cond': { const condition = stack[stack.length - 1]!; if (condition.kind === 'bottom') pc = instruction.bottomTarget; else if (!numeric(condition)) { replaceTop(mugenBottom('Cond condition requires numeric value')); pc = instruction.bottomTarget; } else { stack.pop(); pc = truthy(condition) ? pc + 1 : instruction.falseTarget; } break; }
      case 'jump': pc = instruction.target; break;
      case 'truthy': { const value = pop(); push(value.kind === 'bottom' ? value : numeric(value) ? mugenInt(truthy(value) ? 1 : 0) : mugenBottom('logical operator requires numeric operands')); pc++; break; }
      case 'return': { const value = pop(); if (stack.length !== 0) throw new MugenVmFault('E_MUGEN_VM_BYTECODE', 'MUGEN expression returned with residual stack values.', pc); return Object.freeze({ value, fuelUsed: initialFuel - meter.remaining, bottomReasons: Object.freeze([...bottomReasons]) }); }
    }
  }
  throw new MugenVmFault('E_MUGEN_VM_BYTECODE', 'MUGEN expression reached the end without return.', pc);
}

function unaryValue(operator: MugenUnaryOperator, value: MugenExpressionValue): MugenExpressionValue {
  if (value.kind === 'bottom') return value;
  if (operator === '!') return numeric(value) ? mugenInt(truthy(value) ? 0 : 1) : mugenBottom('logical not requires numeric value');
  if (operator === '~') return value.kind === 'int' ? mugenInt(~value.value) : mugenBottom('bitwise not requires int');
  if (!numeric(value)) return mugenBottom(`unary ${operator} requires numeric value`);
  if (operator === '+') return value;
  return value.kind === 'int' ? mugenInt(-value.value) : mugenFloat(-value.value);
}

function binaryValue(operator: Exclude<MugenBinaryOperator, '&&' | '||'>, left: MugenExpressionValue, right: MugenExpressionValue): MugenExpressionValue {
  if (left.kind === 'bottom') return left; if (right.kind === 'bottom') return right;
  if (operator === '=' || operator === '!=') { const equal = equality(left, right); return equal === null ? mugenBottom('equality operands are incompatible') : mugenInt((operator === '=' ? equal : !equal) ? 1 : 0); }
  if (operator === '^^') return numeric(left) && numeric(right) ? mugenInt(truthy(left) !== truthy(right) ? 1 : 0) : mugenBottom('logical xor requires numeric operands');
  if (operator === '&' || operator === '^' || operator === '|') {
    if (left.kind !== 'int' || right.kind !== 'int') return mugenBottom(`bitwise ${operator} requires int operands`);
    return mugenInt(operator === '&' ? left.value & right.value : operator === '^' ? left.value ^ right.value : left.value | right.value);
  }
  if (!numeric(left) || !numeric(right)) return mugenBottom(`${operator} requires numeric operands`);
  if (operator === '>' || operator === '>=' || operator === '<' || operator === '<=') { const [a, b] = promote(left, right); return mugenInt(operator === '>' ? +(a > b) : operator === '>=' ? +(a >= b) : operator === '<' ? +(a < b) : +(a <= b)); }
  if (operator === '%') { if (left.kind !== 'int' || right.kind !== 'int' || right.value === 0) return mugenBottom('remainder requires int operands and nonzero divisor'); return mugenInt(left.value % right.value); }
  if (operator === '/') {
    if (right.value === 0) return mugenBottom('division by zero');
    if (left.kind === 'int' && right.kind === 'int') return mugenInt(Math.trunc(left.value / right.value));
    const [a, b] = promote(left, right); return mugenFloat(a / b);
  }
  if (operator === '**') return power(left, right);
  if (left.kind === 'int' && right.kind === 'int') return operator === '+' ? mugenInt(left.value + right.value) : operator === '-' ? mugenInt(left.value - right.value) : mugenInt(Math.imul(left.value, right.value));
  const [a, b] = promote(left, right); return operator === '+' ? mugenFloat(a + b) : operator === '-' ? mugenFloat(a - b) : mugenFloat(a * b);
}

function intervalValue(instruction: Extract<MugenExpressionInstruction, { op: 'interval' }>, value: MugenExpressionValue, lower: MugenExpressionValue, upper: MugenExpressionValue): MugenExpressionValue {
  if (value.kind === 'bottom') return value; if (lower.kind === 'bottom') return lower; if (upper.kind === 'bottom') return upper;
  if (!numeric(value) || !numeric(lower) || !numeric(upper)) return mugenBottom('interval requires numeric operands');
  const useFloat = value.kind === 'float' || lower.kind === 'float' || upper.kind === 'float';
  const a = useFloat ? Math.fround(value.value) : value.value; const low = useFloat ? Math.fround(lower.value) : lower.value; const high = useFloat ? Math.fround(upper.value) : upper.value;
  const inside = (instruction.includeLower ? a >= low : a > low) && (instruction.includeUpper ? a <= high : a < high);
  return mugenInt((instruction.operator === '=' ? inside : !inside) ? 1 : 0);
}

function callValue(name: string, args: readonly MugenExpressionValue[], context: MugenExpressionVmContext): MugenExpressionValue {
  if (name === 'var' || name === 'fvar') return args.length === 1 ? loadVariable(context.variables, name === 'var' ? 'integer' : 'float', args[0]!) : mugenBottom(`${name} requires one argument`);
  if (name === 'ifelse') { if (args.length !== 3) return mugenBottom('IfElse requires three arguments'); const condition = args[0]!; return condition.kind === 'bottom' ? condition : numeric(condition) ? (truthy(condition) ? args[1]! : args[2]!) : mugenBottom('IfElse condition requires numeric value'); }
  const bottom = args.find(value => value.kind === 'bottom'); if (bottom) return bottom;
  const math = mathFunction(name, args); return math ?? context.call(name, args);
}

function mathFunction(name: string, args: readonly MugenExpressionValue[]): MugenExpressionValue | null {
  const one = (): MugenExpressionValue | null => args.length === 1 ? args[0]! : null; const value = one();
  if (['abs', 'acos', 'asin', 'atan', 'ceil', 'cos', 'exp', 'floor', 'ln', 'sin', 'tan'].includes(name)) {
    if (value === null) return mugenBottom(`${name} requires one argument`); if (value.kind === 'bottom') return value; if (!numeric(value)) return mugenBottom(`${name} requires numeric argument`);
    if (name === 'abs') return value.kind === 'int' ? (value.value === INT_MIN ? mugenInt(INT_MAX) : mugenInt(Math.abs(value.value))) : mugenFloat(Math.abs(value.value));
    if (name === 'floor' || name === 'ceil') { const result = name === 'floor' ? Math.floor(value.value) : Math.ceil(value.value); return result < INT_MIN || result > INT_MAX ? mugenBottom(`${name} result exceeds int32`) : mugenInt(result); }
    if ((name === 'acos' || name === 'asin') && (value.value < -1 || value.value > 1)) return mugenBottom(`${name} domain error`);
    if (name === 'ln' && value.value <= 0) return mugenBottom('ln domain error');
    const fn = ({ acos: Math.acos, asin: Math.asin, atan: Math.atan, cos: Math.cos, exp: Math.exp, ln: Math.log, sin: Math.sin, tan: Math.tan } as const)[name as 'acos'];
    return mugenFloat(fn(value.value));
  }
  if (name === 'log') {
    if (args.length !== 2 || args.some(item => item.kind === 'bottom')) return args.find(item => item.kind === 'bottom') ?? mugenBottom('Log requires two arguments');
    const base = args[0]!, value_ = args[1]!; if (!numeric(base) || !numeric(value_) || base.value <= 0 || base.value === 1 || value_.value <= 0) return mugenBottom('log domain error');
    return mugenFloat(Math.log(value_.value) / Math.log(base.value));
  }
  return null;
}

function loadVariable(variables: MugenExpressionVmVariables, type: 'integer' | 'float', index: MugenExpressionValue): MugenExpressionValue { if (index.kind === 'bottom') return index; if (index.kind !== 'int') return mugenBottom(`${type} variable index must be int`); const array = type === 'integer' ? variables.integer : variables.float; if (index.value < 0 || index.value >= array.length) return mugenBottom(`${type} variable index ${index.value} is out of range`); return type === 'integer' ? mugenInt(array[index.value]!) : mugenFloat(array[index.value]!); }
function storeVariable(variables: MugenExpressionVmVariables, type: 'integer' | 'float', index: MugenExpressionValue, value: MugenExpressionValue): MugenExpressionValue { if (index.kind === 'bottom') return index; if (value.kind === 'bottom') return value; if (index.kind !== 'int' || !numeric(value)) return mugenBottom(`invalid ${type} variable assignment`); const array = type === 'integer' ? variables.integer : variables.float; if (index.value < 0 || index.value >= array.length) return mugenBottom(`${type} variable index ${index.value} is out of range`); if (type === 'integer') { if (!(variables.integer instanceof Int32Array)) return mugenBottom('integer variable storage is read-only'); const assigned = Math.trunc(value.value) | 0; variables.integer[index.value] = assigned; return mugenInt(assigned); } if (!(variables.float instanceof Float32Array)) return mugenBottom('float variable storage is read-only'); const assigned = Math.fround(value.value); variables.float[index.value] = assigned; return mugenFloat(assigned); }
function equality(left: MugenExpressionValue, right: MugenExpressionValue): boolean | null { if (numeric(left) && numeric(right)) { const [a, b] = promote(left, right); return a === b; } if (left.kind === 'string' && right.kind === 'string') return left.value.toLowerCase() === right.value.toLowerCase(); return null; }
function promote(left: Extract<MugenExpressionValue, { kind: 'int' | 'float' }>, right: Extract<MugenExpressionValue, { kind: 'int' | 'float' }>): readonly [number, number] { return left.kind === 'float' || right.kind === 'float' ? [Math.fround(left.value), Math.fround(right.value)] : [left.value, right.value]; }
function numeric(value: MugenExpressionValue): value is Extract<MugenExpressionValue, { kind: 'int' | 'float' }> { return value.kind === 'int' || value.kind === 'float'; }
function truthy(value: MugenExpressionValue): boolean { return numeric(value) && value.value !== 0; }
function power(left: Extract<MugenExpressionValue, { kind: 'int' | 'float' }>, right: Extract<MugenExpressionValue, { kind: 'int' | 'float' }>): MugenExpressionValue { if (left.kind === 'int' && right.kind === 'int' && left.value >= 0 && right.value >= 0) { let base = BigInt(left.value); let exponent = right.value; let result = 1n; while (exponent > 0) { if ((exponent & 1) !== 0) result *= base; exponent >>>= 1; if (exponent > 0) base *= base; if (result > BigInt(INT_MAX) || base > BigInt(INT_MAX) && exponent > 0) return mugenInt(INT_MAX); } return mugenInt(Number(result)); } const result = Math.pow(Math.fround(left.value), Math.fround(right.value)); return Number.isFinite(result) ? mugenFloat(result) : mugenBottom('exponentiation domain or range error'); }
