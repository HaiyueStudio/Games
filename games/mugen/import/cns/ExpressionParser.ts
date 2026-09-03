import { compileMugenRuntimeExpression } from '../trigger/MugenRuntimeExpression';
import { MugenExpressionSyntaxError, parseMugenExpressionAst } from '../expression/MugenExpressionParser';
import type { MugenExpressionAst } from '../expression/types';
import { failMugen, mugenDiagnostic } from '../diagnostics';
import type { MugenAssignmentToken, MugenTextDocument } from '../text/MugenTextParser';
import type { MugenExpression } from './types';
import { findStrictImportFailureTrigger, MUGEN_NATIVE_TRIGGER_CALLS, MUGEN_NATIVE_TRIGGER_REFERENCES } from '../trigger/ledger';

export function parseMugenExpression(source: string, document: MugenTextDocument, assignment: MugenAssignmentToken): MugenExpression {
  const location = Object.freeze({ canonicalPath: document.canonicalPath, line: assignment.valueSpan.line, column: assignment.valueSpan.column });
  try {
    const normalizedSource = lowerLegacyNegatedRedirection(lowerG05OptionalCalls(lowerBareNumTarget(lowerLegacyTimeMod(lowerLegacyAnimElemComparison(lowerLegacyCommandComparison(lowerLegacyHitDefAttr(source))))))); const classifiedFailure = findStrictImportFailureTrigger(normalizedSource); if (classifiedFailure !== null) unsupported(classifiedFailure);
    const ast = lowerG08IrregularTriggers(parseMugenExpressionAst(normalizedSource, location)); validateG08Expression(ast);
    return compileMugenRuntimeExpression(ast, location);
  } catch (error) {
    if (!(error instanceof MugenExpressionSyntaxError) && !(error instanceof RangeError) && !(error instanceof TypeError)) throw error;
    const depth = /depth/iu.test(error.message); const type = /left side|assignment|type/iu.test(error.message); const code = depth ? 'E_MUGEN_EXPRESSION_DEPTH' : type ? 'E_MUGEN_EXPRESSION_TYPE' : /Unsupported MUGEN/iu.test(error.message) ? 'E_MUGEN_UNSUPPORTED_FEATURE' : 'E_MUGEN_CNS_SYNTAX';
    const contract = depth ? ['compiler', 'fatal'] as const : type ? ['compiler', 'error'] as const : code === 'E_MUGEN_UNSUPPORTED_FEATURE' ? ['classification', 'error'] as const : ['cns', 'error'] as const;
    const offset = error instanceof MugenExpressionSyntaxError ? error.offset : 0;
    failMugen(mugenDiagnostic(code, contract[0], contract[1], 'release-resource', error.message, { canonicalPath: document.canonicalPath, sourceSha256: document.sourceSha256, byteOffset: assignment.valueSpan.startByte + offset, line: assignment.valueSpan.line, column: assignment.valueSpan.column + offset, key: assignment.key }));
  }
}

function lowerG08IrregularTriggers(expression: MugenExpressionAst): MugenExpressionAst {
  switch (expression.kind) {
    case 'group': return Object.freeze({ ...expression, expression: lowerG08IrregularTriggers(expression.expression) });
    case 'unary': return Object.freeze({ ...expression, operand: lowerG08IrregularTriggers(expression.operand) });
    case 'binary': {
      const left = lowerG08IrregularTriggers(expression.left); const right = lowerG08IrregularTriggers(expression.right);
      if ((expression.operator === '=' || expression.operator === '!=') && left.kind === 'reference' && (left.name === 'command' || left.name === 'animelem')) {
        const call: MugenExpressionAst = Object.freeze({ kind: 'call', name: left.name, arguments: Object.freeze([right]) });
        return expression.operator === '=' ? call : Object.freeze({ kind: 'unary', operator: '!', operand: call });
      }
      return Object.freeze({ ...expression, left, right });
    }
    case 'call': {
      const arguments_ = expression.arguments.map(lowerG08IrregularTriggers);
      if ((expression.name === 'gethitvar' || expression.name === 'const' || expression.name === 'stagevar') && arguments_.length === 1 && arguments_[0]?.kind === 'reference') return Object.freeze({ ...expression, arguments: Object.freeze([{ kind: 'literal', value: { kind: 'string', value: arguments_[0].name } } as MugenExpressionAst]) });
      return Object.freeze({ ...expression, arguments: Object.freeze(arguments_) });
    }
    case 'interval': return Object.freeze({ ...expression, value: lowerG08IrregularTriggers(expression.value), lower: lowerG08IrregularTriggers(expression.lower), upper: lowerG08IrregularTriggers(expression.upper) });
    case 'assignment': return Object.freeze({ ...expression, index: lowerG08IrregularTriggers(expression.index), value: lowerG08IrregularTriggers(expression.value) });
    case 'redirect': return Object.freeze({ ...expression, selectorArgument: expression.selectorArgument === null ? null : lowerG08IrregularTriggers(expression.selectorArgument), expression: lowerG08IrregularTriggers(expression.expression) });
    default: return expression;
  }
}

function validateG08Expression(expression: MugenExpressionAst): void {
  switch (expression.kind) {
    case 'reference': if (!MUGEN_NATIVE_TRIGGER_REFERENCES.includes(expression.name)) unsupported(expression.name); return;
    case 'call': if (!MUGEN_NATIVE_TRIGGER_CALLS.includes(expression.name)) unsupported(expression.name); expression.arguments.forEach(validateG08Expression); return;
    case 'group': validateG08Expression(expression.expression); return;
    case 'unary': validateG08Expression(expression.operand); return;
    case 'binary': validateG08Expression(expression.left); validateG08Expression(expression.right); return;
    case 'interval': validateG08Expression(expression.value); validateG08Expression(expression.lower); validateG08Expression(expression.upper); return;
    case 'assignment': validateG08Expression(expression.index); validateG08Expression(expression.value); return;
    case 'redirect': if (expression.selectorArgument !== null) validateG08Expression(expression.selectorArgument); validateG08Expression(expression.expression); return;
    case 'literal': return;
  }
}

function unsupported(name: string): never { throw new TypeError(`Unsupported MUGEN trigger/reference in the strict runtime profile: ${name}.`); }
function lowerLegacyHitDefAttr(source: string): string { return source.replace(/\bHitDefAttr\s*(=|!=)\s*([SCA]+)\s*,\s*((?:[NSH][ATP]|A[AP])(?:\s*,\s*(?:[NSH][ATP]|A[AP]))*)/giu, (_match, operator: string, states: string, attacks: string) => `${operator === '!=' ? '!' : ''}hitdefattr("${states}","${attacks.replace(/\s+/gu, '')}")`); }
function lowerLegacyCommandComparison(source: string): string { return source.replace(/\bCommand\s*(=|!=)\s*("(?:[^"\\]|\\.)*")/giu, (_match, operator: string, name: string) => `${operator === '!=' ? '!' : ''}command(${name})`); }
/** MUGEN's legacy `AnimElem = n, op t` spelling is an AnimElemTime comparison. */
function lowerLegacyAnimElemComparison(source: string): string { return source.replace(/\bAnimElem\s*=\s*(-?\d+)\s*,\s*(=|!=|<=|>=|<|>)\s*(-?\d+)/giu, 'AnimElemTime($1) $2 $3').replace(/\bAnimElem\s*=\s*(-?\d+)\s*,\s*(-?\d+)/giu, 'AnimElemTime($1) = $2'); }
/** Obsolete `TimeMod op divisor, value` is exactly `(Time % divisor) op value`. */
function lowerLegacyTimeMod(source: string): string { return source.replace(/\bTimeMod\s*(=|!=|<=|>=|<|>)\s*(-?\d+)\s*,\s*(-?\d+)/giu, '((Time % $2) $1 $3)'); }
/** Legacy authors place unary `!` before the redirection selector. */
function lowerLegacyNegatedRedirection(source: string): string {
  const leading = /^\s*!\s*(Parent|Root|Helper|Target|Partner|EnemyNear|Enemy|PlayerID)\b/iu.exec(source); if (leading === null) return source;
  let cursor = leading.index + leading[0].length; while (/\s/u.test(source[cursor] ?? '')) cursor++;
  if (source[cursor] === '(') {
    let depth = 0; let quoted = false;
    for (; cursor < source.length; cursor++) { const character = source[cursor]!; if (character === '"' && source[cursor - 1] !== '\\') quoted = !quoted; if (quoted) continue; if (character === '(') depth++; else if (character === ')' && --depth === 0) { cursor++; break; } }
  }
  while (/\s/u.test(source[cursor] ?? '')) cursor++; if (source[cursor] !== ',') return source;
  const bang = source.indexOf('!'); return `${source.slice(0, bang)}!(${source.slice(bang + 1)})`;
}
function lowerBareNumTarget(source: string): string { return source.replace(/\bNumTarget\b(?!\s*\()/giu, 'NumTarget()'); }
function lowerG05OptionalCalls(source: string): string { return source.replace(/\b(NumExplod|NumHelper)\b(?!\s*\()/giu, '$1()').replace(/\b(ProjContact|ProjGuarded|ProjHit)(\d+)\b/giu, '$1($2)').replace(/\b(ProjContact|ProjGuarded|ProjHit)\b(?!\s*\()/giu, '$1()'); }
