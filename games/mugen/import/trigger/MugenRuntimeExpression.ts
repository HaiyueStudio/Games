import { MUGEN_LIMITS } from '../contract';
import { compileMugenExpression, validateExpressionProgram } from '../expression/MugenExpressionCompiler';
import type { MugenExpressionAst, MugenExpressionProgram, MugenExpressionSource, MugenRedirectionSelector } from '../expression/types';

export interface MugenRedirectionProgram {
  readonly slot: string;
  readonly selector: MugenRedirectionSelector;
  readonly selectorArgument: MugenExpressionProgram | null;
  readonly expression: MugenExpressionProgram;
}

export interface MugenRedirectedExpressionProgram {
  readonly schemaVersion: 1;
  readonly revision: 'm09-g02-runtime-expression-v1';
  readonly expression: MugenExpressionProgram;
  readonly redirections: readonly MugenRedirectionProgram[];
}

export type MugenRuntimeExpression = MugenExpressionProgram | MugenRedirectedExpressionProgram;

const validatedFrozenRuntimeExpressions = new WeakSet<object>();
const frozenVariableWriteCache = new WeakMap<object, boolean>();

export function compileMugenRuntimeExpression(ast: MugenExpressionAst, source: MugenExpressionSource | null = null): MugenRuntimeExpression {
  const redirections: MugenRedirectionProgram[] = [];
  const expression = compileMugenExpression(lower(ast, source, redirections, false), source);
  if (redirections.length === 0) return expression;
  const program: MugenRedirectedExpressionProgram = Object.freeze({ schemaVersion: 1, revision: 'm09-g02-runtime-expression-v1', expression, redirections: Object.freeze(redirections) });
  validateMugenRuntimeExpression(program); return program;
}

export function validateMugenRuntimeExpression(value: unknown): asserts value is MugenRuntimeExpression {
  if (record(value) && validatedFrozenRuntimeExpressions.has(value)) return;
  if (isG01Program(value)) { validateExpressionProgram(value); return; }
  if (!record(value) || value.schemaVersion !== 1 || value.revision !== 'm09-g02-runtime-expression-v1' || !Array.isArray(value.redirections)) throw new TypeError('MUGEN redirected expression envelope is invalid.');
  exactKeys(value, ['schemaVersion', 'revision', 'expression', 'redirections']); validateExpressionProgram(value.expression);
  if (value.redirections.length < 1 || value.redirections.length > MUGEN_LIMITS.compilerAndVm.maxRedirectionsPerExpression) throw new RangeError('MUGEN expression exceeds the redirection budget.');
  const slots = new Set<string>();
  for (let index = 0; index < value.redirections.length; index += 1) {
    const redirection = value.redirections[index]; if (!record(redirection)) throw new TypeError('MUGEN redirection entry is invalid.');
    exactKeys(redirection, ['slot', 'selector', 'selectorArgument', 'expression']);
    if (redirection.slot !== `_g02.redirect.${index}` || slots.has(redirection.slot) || !REDIRECTION_SELECTORS.has(String(redirection.selector) as MugenRedirectionSelector)) throw new TypeError('MUGEN redirection selector is invalid.');
    slots.add(redirection.slot); validateExpressionProgram(redirection.expression);
    if (redirection.selectorArgument !== null) validateExpressionProgram(redirection.selectorArgument);
    validateSelectorArity(redirection.selector as MugenRedirectionSelector, redirection.selectorArgument);
  }
  if (isDeepFrozenRedirectedProgram(value as unknown as MugenRedirectedExpressionProgram)) validatedFrozenRuntimeExpressions.add(value);
}

function isDeepFrozenRedirectedProgram(value: MugenRedirectedExpressionProgram): boolean {
  return Object.isFrozen(value)
    && Object.isFrozen(value.redirections)
    && value.redirections.every(redirection => Object.isFrozen(redirection));
}

export function isRedirectedExpressionProgram(value: MugenRuntimeExpression): value is MugenRedirectedExpressionProgram { return value.revision === 'm09-g02-runtime-expression-v1'; }

/** Returns whether evaluating the expression can write var/fvar state. */
export function mugenRuntimeExpressionWritesVariables(value: MugenRuntimeExpression): boolean {
  const cached = frozenVariableWriteCache.get(value); if (cached !== undefined) return cached;
  const programs = isRedirectedExpressionProgram(value)
    ? [value.expression, ...value.redirections.flatMap(entry => entry.selectorArgument === null ? [entry.expression] : [entry.selectorArgument, entry.expression])]
    : [value];
  const writes = programs.some(program => program.instructions.some(instruction => instruction.op === 'store-variable'));
  if (Object.isFrozen(value)) frozenVariableWriteCache.set(value, writes);
  return writes;
}

function lower(ast: MugenExpressionAst, source: MugenExpressionSource | null, redirections: MugenRedirectionProgram[], insideSelectorArgument: boolean): MugenExpressionAst {
  switch (ast.kind) {
    case 'redirect': {
      if (directRedirect(ast.expression)) throw new TypeError('Recursive MUGEN trigger redirection is not supported by MUGEN 1.1.');
      if (redirections.length >= MUGEN_LIMITS.compilerAndVm.maxRedirectionsPerExpression) throw new RangeError('MUGEN expression exceeds the redirection budget.');
      const selectorArgument = ast.selectorArgument === null ? null : compileMugenExpression(lower(ast.selectorArgument, source, redirections, true), source);
      validateSelectorArity(ast.selector, selectorArgument);
      // A redirected expression may contain sibling redirections in a logical or
      // arithmetic body (for example `root,var(0)=1 || root,var(0)=2`). These
      // are not selector chains and are legal in MUGEN 1.1.
      const expression = compileMugenExpression(lower(ast.expression, source, redirections, false), source);
      const slot = `_g02.redirect.${redirections.length}`;
      redirections.push(Object.freeze({ slot, selector: ast.selector, selectorArgument, expression }));
      return Object.freeze({ kind: 'reference', name: slot });
    }
    case 'group': return Object.freeze({ ...ast, expression: lower(ast.expression, source, redirections, insideSelectorArgument) });
    case 'unary': return Object.freeze({ ...ast, operand: lower(ast.operand, source, redirections, insideSelectorArgument) });
    case 'binary': return Object.freeze({ ...ast, left: lower(ast.left, source, redirections, insideSelectorArgument), right: lower(ast.right, source, redirections, insideSelectorArgument) });
    case 'call': return Object.freeze({ ...ast, arguments: Object.freeze(ast.arguments.map(value => lower(value, source, redirections, insideSelectorArgument))) });
    case 'interval': return Object.freeze({ ...ast, value: lower(ast.value, source, redirections, insideSelectorArgument), lower: lower(ast.lower, source, redirections, insideSelectorArgument), upper: lower(ast.upper, source, redirections, insideSelectorArgument) });
    case 'assignment': return Object.freeze({ ...ast, index: lower(ast.index, source, redirections, insideSelectorArgument), value: lower(ast.value, source, redirections, insideSelectorArgument) });
    default: return ast;
  }
}

function directRedirect(ast: MugenExpressionAst): boolean { return ast.kind === 'redirect' || (ast.kind === 'group' && directRedirect(ast.expression)); }

function validateSelectorArity(selector: MugenRedirectionSelector, argument: MugenExpressionProgram | null): void {
  if ((selector === 'parent' || selector === 'root' || selector === 'partner') && argument !== null) throw new TypeError(`MUGEN ${selector} redirection does not accept an argument.`);
  if (selector === 'playerid' && argument === null) throw new TypeError('MUGEN playerID redirection requires an argument.');
}
function isG01Program(value: unknown): value is MugenExpressionProgram { return record(value) && value.revision === 'm09-g01-expression-bytecode-v1'; }
function record(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`MUGEN redirected expression has unknown or missing fields: ${actual.join(',')}.`); }
const REDIRECTION_SELECTORS = new Set<MugenRedirectionSelector>(['parent', 'root', 'helper', 'target', 'partner', 'enemy', 'enemynear', 'playerid']);
