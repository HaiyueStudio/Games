export type MugenExpressionValue =
  | Readonly<{ kind: 'int'; value: number }>
  | Readonly<{ kind: 'float'; value: number }>
  | Readonly<{ kind: 'string'; value: string }>
  | Readonly<{ kind: 'bottom'; reason: string }>;

export type MugenUnaryOperator = '+' | '-' | '!' | '~';
export type MugenBinaryOperator = '+' | '-' | '*' | '/' | '%' | '**' | '>' | '>=' | '<' | '<=' | '=' | '!=' | '&' | '^' | '|' | '&&' | '^^' | '||';
export type MugenRedirectionSelector = 'parent' | 'root' | 'helper' | 'target' | 'partner' | 'enemy' | 'enemynear' | 'playerid';

export type MugenExpressionAst =
  | Readonly<{ kind: 'literal'; value: MugenExpressionValue }>
  | Readonly<{ kind: 'reference'; name: string }>
  | Readonly<{ kind: 'call'; name: string; arguments: readonly MugenExpressionAst[] }>
  | Readonly<{ kind: 'group'; expression: MugenExpressionAst }>
  | Readonly<{ kind: 'unary'; operator: MugenUnaryOperator; operand: MugenExpressionAst }>
  | Readonly<{ kind: 'binary'; operator: MugenBinaryOperator; left: MugenExpressionAst; right: MugenExpressionAst }>
  | Readonly<{ kind: 'interval'; operator: '=' | '!='; value: MugenExpressionAst; lower: MugenExpressionAst; upper: MugenExpressionAst; includeLower: boolean; includeUpper: boolean }>
  | Readonly<{ kind: 'assignment'; variableType: 'integer' | 'float'; index: MugenExpressionAst; value: MugenExpressionAst }>
  | Readonly<{ kind: 'redirect'; selector: MugenRedirectionSelector; selectorArgument: MugenExpressionAst | null; expression: MugenExpressionAst }>;

export type MugenExpressionOpcode =
  | 'push-int' | 'push-float' | 'push-string' | 'load-reference' | 'load-variable'
  | 'call' | 'unary' | 'binary' | 'interval' | 'store-variable'
  | 'branch-and' | 'branch-or' | 'branch-cond' | 'jump' | 'truthy' | 'return';

export type MugenExpressionInstruction =
  | Readonly<{ op: 'push-int'; value: number }>
  | Readonly<{ op: 'push-float'; value: number }>
  | Readonly<{ op: 'push-string'; value: string }>
  | Readonly<{ op: 'load-reference'; name: string }>
  | Readonly<{ op: 'load-variable'; variableType: 'integer' | 'float' }>
  | Readonly<{ op: 'call'; name: string; argumentCount: number }>
  | Readonly<{ op: 'unary'; operator: MugenUnaryOperator }>
  | Readonly<{ op: 'binary'; operator: Exclude<MugenBinaryOperator, '&&' | '||'> }>
  | Readonly<{ op: 'interval'; operator: '=' | '!='; includeLower: boolean; includeUpper: boolean }>
  | Readonly<{ op: 'store-variable'; variableType: 'integer' | 'float' }>
  | Readonly<{ op: 'branch-and'; target: number }>
  | Readonly<{ op: 'branch-or'; target: number }>
  | Readonly<{ op: 'branch-cond'; falseTarget: number; bottomTarget: number }>
  | Readonly<{ op: 'jump'; target: number }>
  | Readonly<{ op: 'truthy' }>
  | Readonly<{ op: 'return' }>;

export interface MugenExpressionProgram {
  readonly schemaVersion: 1;
  readonly revision: 'm09-g01-expression-bytecode-v1';
  readonly instructions: readonly MugenExpressionInstruction[];
  readonly maxStack: number;
  readonly source: Readonly<{ canonicalPath: string; line: number; column: number }> | null;
}

export interface MugenExpressionSource {
  readonly canonicalPath: string;
  readonly line: number;
  readonly column: number;
}

export const MUGEN_BOTTOM = Object.freeze({ kind: 'bottom', reason: 'bottom' }) satisfies MugenExpressionValue;
export function mugenInt(value: number): MugenExpressionValue { return Object.freeze({ kind: 'int', value: value | 0 }); }
export function mugenFloat(value: number): MugenExpressionValue { const result = Math.fround(value); return Number.isFinite(result) ? Object.freeze({ kind: 'float', value: Object.is(result, -0) ? 0 : result }) : mugenBottom('non-finite float'); }
export function mugenString(value: string): MugenExpressionValue { return Object.freeze({ kind: 'string', value }); }
export function mugenBottom(reason: string): MugenExpressionValue { return Object.freeze({ kind: 'bottom', reason }); }
