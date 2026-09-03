import { MUGEN_LIMITS } from '../contract';
import { asciiCaseFold } from '../vfs/path';
import { mugenFloat, mugenInt, mugenString, type MugenBinaryOperator, type MugenExpressionAst, type MugenExpressionSource, type MugenRedirectionSelector, type MugenUnaryOperator } from './types';

type TokenKind = 'integer' | 'float' | 'string' | 'identifier' | 'operator' | 'left' | 'right' | 'left-bracket' | 'right-bracket' | 'comma' | 'end';
interface Token { readonly kind: TokenKind; readonly text: string; readonly offset: number }

export class MugenExpressionSyntaxError extends SyntaxError {
  readonly name = 'MugenExpressionSyntaxError';
  readonly offset: number;
  readonly sourceLocation: MugenExpressionSource | null;
  constructor(message: string, offset: number, sourceLocation: MugenExpressionSource | null = null) { super(message); this.offset = offset; this.sourceLocation = sourceLocation; }
}

export function parseMugenExpressionAst(source: string, location: MugenExpressionSource | null = null): MugenExpressionAst {
  if (new TextEncoder().encode(source).byteLength > MUGEN_LIMITS.text.maxLineBytes) throw new MugenExpressionSyntaxError('MUGEN expression exceeds the source byte budget.', 0, location);
  const parser = new Parser(source, location);
  const expression = parser.parse(0, 1);
  if (parser.current.kind !== 'end') parser.fail(`Unexpected token ${parser.current.text || parser.current.kind}.`);
  return expression;
}

class Parser {
  #offset = 0;
  current: Token;
  readonly source: string;
  readonly location: MugenExpressionSource | null;
  constructor(source: string, location: MugenExpressionSource | null) { this.source = source; this.location = location; this.current = this.#next(); }

  parse(minimumPrecedence: number, depth: number): MugenExpressionAst {
    if (depth > MUGEN_LIMITS.compilerAndVm.maxExpressionDepth) this.fail('MUGEN expression exceeds the maximum depth.');
    let left = this.#prefix(depth);
    while (this.current.kind === 'operator') {
      const operator = this.current.text as keyof typeof PRECEDENCE;
      const precedence = PRECEDENCE[operator];
      if (precedence === undefined || precedence < minimumPrecedence) break;
      if (left.kind === 'interval') this.fail('A MUGEN interval must be the rightmost operator in its subexpression.');
      this.#advance();
      const afterOperator = this.current as Token;
      if ((operator === '=' || operator === '!=') && (afterOperator.kind === 'left-bracket' || (afterOperator.kind === 'left' && this.#isOpenInterval(afterOperator.offset)))) {
        left = this.#interval(operator, left, depth + 1);
        continue;
      }
      const right = this.parse(precedence + (operator === ':=' ? 0 : 1), depth + 1);
      if (operator === ':=') {
        const target = ungroup(left);
        if (target.kind !== 'call' || (target.name !== 'var' && target.name !== 'fvar') || target.arguments.length !== 1) this.fail('The left side of := must be an unredirected Var(index) or FVar(index).');
        left = Object.freeze({ kind: 'assignment', variableType: target.name === 'var' ? 'integer' : 'float', index: target.arguments[0]!, value: right });
      } else {
        left = Object.freeze({ kind: 'binary', operator: operator as MugenBinaryOperator, left, right });
      }
    }
    return left;
  }

  fail(message: string): never { throw new MugenExpressionSyntaxError(message, this.current?.offset ?? this.#offset, this.location); }

  #prefix(depth: number): MugenExpressionAst {
    const token = this.current;
    if (token.kind === 'operator' && UNARY.has(token.text as MugenUnaryOperator)) { this.#advance(); return Object.freeze({ kind: 'unary', operator: token.text as MugenUnaryOperator, operand: this.parse(UNARY_PRECEDENCE, depth + 1) }); }
    if (token.kind === 'left') {
      this.#advance(); const expression = this.parse(0, depth + 1);
      if (this.current.kind !== 'right') this.fail('MUGEN expression is missing a closing parenthesis.');
      this.#advance(); return Object.freeze({ kind: 'group', expression });
    }
    if (token.kind === 'integer') { this.#advance(); const value = Number(token.text); if (!Number.isSafeInteger(value)) this.fail('MUGEN integer literal exceeds the safe numeric range.'); if (value >= -2_147_483_648 && value <= 2_147_483_647) return Object.freeze({ kind: 'literal', value: mugenInt(value) }); const literal = mugenFloat(value); if (literal.kind === 'bottom') this.fail('MUGEN oversized integer literal is not finite float32.'); return Object.freeze({ kind: 'literal', value: literal }); }
    if (token.kind === 'float') { this.#advance(); const value = Number(token.text); const literal = mugenFloat(value); if (literal.kind === 'bottom') this.fail('MUGEN float literal is not finite float32.'); return Object.freeze({ kind: 'literal', value: literal }); }
    if (token.kind === 'string') { this.#advance(); return Object.freeze({ kind: 'literal', value: mugenString(token.text) }); }
    if (token.kind !== 'identifier') this.fail(`Expected a MUGEN expression value, received ${token.text || token.kind}.`);
    let name = asciiCaseFold(token.text); this.#advance();
    if (COMPONENT_REFERENCES.has(name) && (this.current as Token).kind === 'identifier') { const component = asciiCaseFold(this.current.text); if (component === 'x' || component === 'y') { name = `${name}.${component}`; this.#advance(); } }
    if (this.current.kind !== 'left') {
      if (STATE_LITERALS.has(name)) return Object.freeze({ kind: 'literal', value: mugenString(name.toUpperCase()) });
      return this.#redirect(Object.freeze({ kind: 'reference', name }), depth);
    }
    this.#advance(); const args: MugenExpressionAst[] = [];
    if ((this.current as Token).kind !== 'right') {
      for (;;) {
        args.push(this.parse(0, depth + 1));
        if ((this.current as Token).kind !== 'comma') break;
        this.#advance();
      }
    }
    if ((this.current as Token).kind !== 'right') this.fail(`${token.text} argument list is missing a closing parenthesis.`);
    this.#advance();
    return this.#redirect(Object.freeze({ kind: 'call', name, arguments: Object.freeze(args) }), depth);
  }

  #redirect(base: Extract<MugenExpressionAst, { kind: 'reference' | 'call' }>, depth: number): MugenExpressionAst {
    if (this.current.kind !== 'comma' || !REDIRECTION_SELECTORS.has(base.name as MugenRedirectionSelector)) return base;
    this.#advance();
    const selectorArgument = base.kind === 'call' && base.arguments.length === 1 ? base.arguments[0]! : null;
    if (base.kind === 'call' && base.arguments.length !== 1) this.fail(`MUGEN redirection ${base.name} requires exactly one selector argument.`);
    const expression = this.parse(0, depth + 1);
    return Object.freeze({ kind: 'redirect', selector: base.name as MugenRedirectionSelector, selectorArgument, expression });
  }

  #interval(operator: '=' | '!=', value: MugenExpressionAst, depth: number): MugenExpressionAst {
    const includeLower = this.current.kind === 'left-bracket'; this.#advance();
    const lower = this.parse(0, depth + 1);
    if (this.current.kind !== 'comma') this.fail('MUGEN interval requires two comma-separated bounds.');
    this.#advance(); const upper = this.parse(0, depth + 1);
    const ending = this.current as Token; const includeUpper = ending.kind === 'right-bracket';
    if (!includeUpper && ending.kind !== 'right') this.fail('MUGEN interval is missing a closing bracket or parenthesis.');
    this.#advance();
    return Object.freeze({ kind: 'interval', operator, value, lower, upper, includeLower, includeUpper });
  }

  #advance(): void { this.current = this.#next(); }
  #isOpenInterval(offset: number): boolean {
    let depth = 0; let quote = ''; for (let index = offset; index < this.source.length; index++) {
      const character = this.source[index]!;
      if (quote) { if (character === quote) quote = ''; continue; }
      if (character === '"') { quote = character; continue; }
      if (character === '(' || character === '[') { depth++; continue; }
      if (character === ')' || character === ']') { depth--; if (depth === 0) return false; continue; }
      if (character === ',' && depth === 1) return true;
    }
    return false;
  }
  #next(): Token {
    while (this.#offset < this.source.length && /\s/u.test(this.source[this.#offset]!)) this.#offset++;
    const offset = this.#offset; if (offset >= this.source.length) return { kind: 'end', text: '', offset };
    const character = this.source[offset]!;
    if (character === '(') { this.#offset++; return { kind: 'left', text: character, offset }; }
    if (character === ')') { this.#offset++; return { kind: 'right', text: character, offset }; }
    if (character === '[') { this.#offset++; return { kind: 'left-bracket', text: character, offset }; }
    if (character === ']') { this.#offset++; return { kind: 'right-bracket', text: character, offset }; }
    if (character === ',') { this.#offset++; return { kind: 'comma', text: character, offset }; }
    const operator = /^(?:\*\*|:=|!=|<=|>=|&&|\|\||\^\^|[+*/%=<>!~&|^-])/u.exec(this.source.slice(offset));
    if (operator) { this.#offset += operator[0].length; return { kind: 'operator', text: operator[0], offset }; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/iu.exec(this.source.slice(offset));
    if (number) { this.#offset += number[0].length; return { kind: number[0].includes('.') || /e/iu.test(number[0]) ? 'float' : 'integer', text: number[0], offset }; }
    if (character === '"') {
      let end = offset + 1; while (end < this.source.length && this.source[end] !== character) end++;
      if (end >= this.source.length) this.fail('Unterminated string in MUGEN expression.');
      const text = this.source.slice(offset + 1, end); if (new TextEncoder().encode(text).byteLength > MUGEN_LIMITS.compilerAndVm.maxStringBytes) this.fail('MUGEN expression string exceeds the byte budget.'); this.#offset = end + 1; return { kind: 'string', text, offset };
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_.]*/u.exec(this.source.slice(offset));
    if (identifier) { this.#offset += identifier[0].length; return { kind: 'identifier', text: identifier[0], offset }; }
    this.fail(`Invalid character in MUGEN expression: ${character}.`);
  }
}

function ungroup(value: MugenExpressionAst): MugenExpressionAst { return value.kind === 'group' ? ungroup(value.expression) : value; }
const STATE_LITERALS = new Set(['s', 'c', 'a', 'l', 'i', 'h', 'n', 'single', 'simul', 'turns']);
const COMPONENT_REFERENCES = new Set(['vel', 'pos', 'hitvel', 'p2dist', 'p2bodydist', 'parentdist', 'rootdist', 'screenpos', 'camerapos']);
const REDIRECTION_SELECTORS = new Set<MugenRedirectionSelector>(['parent', 'root', 'helper', 'target', 'partner', 'enemy', 'enemynear', 'playerid']);
const UNARY = new Set<MugenUnaryOperator>(['+', '-', '!', '~']);
const UNARY_PRECEDENCE = 13;
const PRECEDENCE = Object.freeze({ '||': 1, '^^': 2, '&&': 3, '|': 4, '^': 5, '&': 6, ':=': 7, '=': 8, '!=': 8, '>': 9, '>=': 9, '<': 9, '<=': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12 });
