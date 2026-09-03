export const MUGEN_EXPRESSION_OPERATOR_LEDGER = Object.freeze([
  Object.freeze({ symbols: Object.freeze(['!', '~', '-', '+']), precedence: 13, associativity: 'right', family: 'unary' }),
  Object.freeze({ symbols: Object.freeze(['**']), precedence: 12, associativity: 'left', family: 'arithmetic' }),
  Object.freeze({ symbols: Object.freeze(['*', '/', '%']), precedence: 11, associativity: 'left', family: 'arithmetic' }),
  Object.freeze({ symbols: Object.freeze(['+', '-']), precedence: 10, associativity: 'left', family: 'arithmetic' }),
  Object.freeze({ symbols: Object.freeze(['>', '>=', '<', '<=']), precedence: 9, associativity: 'left', family: 'relational' }),
  Object.freeze({ symbols: Object.freeze(['=', '!=', 'interval']), precedence: 8, associativity: 'left', family: 'equality' }),
  Object.freeze({ symbols: Object.freeze([':=']), precedence: 7, associativity: 'right', family: 'assignment' }),
  Object.freeze({ symbols: Object.freeze(['&']), precedence: 6, associativity: 'left', family: 'bitwise' }),
  Object.freeze({ symbols: Object.freeze(['^']), precedence: 5, associativity: 'left', family: 'bitwise' }),
  Object.freeze({ symbols: Object.freeze(['|']), precedence: 4, associativity: 'left', family: 'bitwise' }),
  Object.freeze({ symbols: Object.freeze(['&&']), precedence: 3, associativity: 'left', family: 'logical-short-circuit' }),
  Object.freeze({ symbols: Object.freeze(['^^']), precedence: 2, associativity: 'left', family: 'logical' }),
  Object.freeze({ symbols: Object.freeze(['||']), precedence: 1, associativity: 'left', family: 'logical-short-circuit' }),
] as const);

export const MUGEN_EXPRESSION_CORE_FUNCTION_LEDGER = Object.freeze([
  Object.freeze({ name: 'abs', arguments: 1, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'acos', arguments: 1, evaluation: 'eager', owner: 'g01' }),
  Object.freeze({ name: 'asin', arguments: 1, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'atan', arguments: 1, evaluation: 'eager', owner: 'g01' }),
  Object.freeze({ name: 'ceil', arguments: 1, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'cond', arguments: 3, evaluation: 'lazy-selected-branch', owner: 'g01' }),
  Object.freeze({ name: 'cos', arguments: 1, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'exp', arguments: 1, evaluation: 'eager', owner: 'g01' }),
  Object.freeze({ name: 'floor', arguments: 1, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'fvar', arguments: 1, evaluation: 'eager', owner: 'g01' }),
  Object.freeze({ name: 'ifelse', arguments: 3, evaluation: 'eager-all-branches', owner: 'g01' }), Object.freeze({ name: 'ln', arguments: 1, evaluation: 'eager', owner: 'g01' }),
  Object.freeze({ name: 'log', arguments: 2, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'sin', arguments: 1, evaluation: 'eager', owner: 'g01' }),
  Object.freeze({ name: 'tan', arguments: 1, evaluation: 'eager', owner: 'g01' }), Object.freeze({ name: 'var', arguments: 1, evaluation: 'eager', owner: 'g01' }),
] as const);

export const MUGEN_EXPRESSION_CONTEXT_LEDGER = Object.freeze({
  constants: Object.freeze(['e', 'pi', 'random']),
  resolution: 'typed-context',
  unknownReference: 'bottom',
  unknownFunction: 'bottom',
  downstreamOwner: 'g02-trigger-redirection-order',
} as const);

