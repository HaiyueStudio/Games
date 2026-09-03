import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { compileMugenExpression, decodeMugenExpressionProgram, encodeMugenExpressionProgram, parseMugenExpressionAst, MUGEN_EXPRESSION_CORE_FUNCTION_LEDGER, MUGEN_EXPRESSION_OPERATOR_LEDGER } = await import('../mugen/import/expression/index.ts');
const { BasicMugenExpressionVmContext, evaluateMugenExpression, MugenSeededRandom, MugenVmFault } = await import('../mugen/runtime/vm/index.ts');

function program(source) { return compileMugenExpression(parseMugenExpressionAst(source), { canonicalPath: 'fixture.cns', line: 1, column: 1 }); }
function run(source, context = new BasicMugenExpressionVmContext()) { return evaluateMugenExpression(program(source), context).value; }

test('G01 grammar follows official precedence, associativity and typed literals', () => {
  assert.deepEqual(run('3+2*5'), { kind: 'int', value: 13 });
  assert.deepEqual(run('5.0*5/6'), { kind: 'float', value: Math.fround(25 / 6) });
  assert.deepEqual(run('5/6*5.0'), { kind: 'float', value: 0 });
  assert.deepEqual(run('-!0'), { kind: 'int', value: -1 });
  assert.deepEqual(run('2**3**2'), { kind: 'int', value: 64 });
  assert.deepEqual(run('1.0 = (2 = (1 > 0) + !(0 > 1))'), { kind: 'int', value: 1 });
  assert.deepEqual(run('S = s'), { kind: 'int', value: 1 });
});

test('G01 VM fixes int32, float32, division, exponent and bitwise semantics', () => {
  assert.deepEqual(run('2147483647 + 1'), { kind: 'int', value: -2147483648 });
  assert.deepEqual(run('7/2'), { kind: 'int', value: 3 });
  assert.deepEqual(run('-7/2'), { kind: 'int', value: -3 });
  assert.deepEqual(run('7.0/2'), { kind: 'float', value: 3.5 });
  assert.deepEqual(run('0**0'), { kind: 'int', value: 1 });
  assert.deepEqual(run('2**31'), { kind: 'int', value: 2147483647 });
  assert.deepEqual(run('~0 & 255'), { kind: 'int', value: 255 });
  assert.equal(run('1.0 % 1').kind, 'bottom');
  assert.equal(run('1/0').kind, 'bottom');
  assert.equal(run('(-1.0)**0.5').kind, 'bottom');
});

test('G01 interval grammar enforces rightmost placement and open/closed membership', () => {
  assert.deepEqual(run('1 = [0,1]'), { kind: 'int', value: 1 });
  assert.deepEqual(run('1 = [0,1)'), { kind: 'int', value: 0 });
  assert.deepEqual(run('1 != (1,2]'), { kind: 'int', value: 1 });
  assert.deepEqual(run('(1 = [0,2]) = (0,1)'), { kind: 'int', value: 0 });
  assert.throws(() => program('1 = [0,2] = (0,1)'), /rightmost/u);
  assert.throws(() => program('5 > [0,2]'), /Expected a MUGEN expression value/u);
});

test('G01 assignment is right associative, typed and observable in the same expression', () => {
  const context = new BasicMugenExpressionVmContext();
  assert.deepEqual(run('var(0) := var(1) := 7.9', context), { kind: 'int', value: 7 });
  assert.equal(context.variables.integer[0], 7); assert.equal(context.variables.integer[1], 7);
  assert.deepEqual(run('fvar(0) := 1/2', context), { kind: 'float', value: 0 });
  assert.deepEqual(run('fvar(1) := 1.0/2', context), { kind: 'float', value: 0.5 });
  assert.throws(() => program('time := 1'), /left side/u);
  assert.equal(run('var(99) := 1', context).kind, 'bottom');
});

test('G01 Cond and logical operators short circuit while IfElse remains eager', () => {
  let calls = 0;
  const context = new BasicMugenExpressionVmContext({ functions: { probe: () => { calls++; return { kind: 'int', value: 1 }; } } });
  assert.deepEqual(run('0 && probe()', context), { kind: 'int', value: 0 }); assert.equal(calls, 0);
  assert.deepEqual(run('1 || probe()', context), { kind: 'int', value: 1 }); assert.equal(calls, 0);
  assert.deepEqual(run('Cond(0, probe(), 9)', context), { kind: 'int', value: 9 }); assert.equal(calls, 0);
  assert.deepEqual(run('IfElse(0, probe(), 9)', context), { kind: 'int', value: 9 }); assert.equal(calls, 1);
  assert.deepEqual(run('Cond(0, 1/0, 2)', context), { kind: 'int', value: 2 });
  assert.deepEqual(run('IfElse(0, 1/0, 2)', context), { kind: 'int', value: 2 });
  assert.equal(run('"x" && probe()', context).kind, 'bottom'); assert.equal(calls, 1);
  assert.equal(run('"x" || probe()', context).kind, 'bottom'); assert.equal(calls, 1);
  assert.equal(run('Cond("x", probe(), 2)', context).kind, 'bottom'); assert.equal(calls, 1);
  assert.equal(run('probe(1/0)', context).kind, 'bottom'); assert.equal(calls, 1);
});

test('G01 seeded Random is deterministic and snapshot-restorable', () => {
  const left = new BasicMugenExpressionVmContext({ seed: 12345 }); const right = new BasicMugenExpressionVmContext({ seed: 12345 });
  const sequence = Array.from({ length: 32 }, () => run('Random', left).value);
  assert.deepEqual(sequence, Array.from({ length: 32 }, () => run('Random', right).value));
  assert.ok(sequence.every(value => Number.isInteger(value) && value >= 0 && value <= 999));
  const generator = new MugenSeededRandom(7); generator.nextUint32(); const saved = generator.state; const expected = generator.nextUint32(); generator.restore(saved); assert.equal(generator.nextUint32(), expected);
});

test('G01 bytecode codec is canonical, versioned and rejects mutation', () => {
  const original = program('Cond(var(0), abs(-4), floor(2.9))'); const bytes = encodeMugenExpressionProgram(original); const decoded = decodeMugenExpressionProgram(bytes);
  assert.deepEqual(decoded, original); assert.deepEqual(encodeMugenExpressionProgram(decoded), bytes); assert.ok(Object.isFrozen(decoded.instructions));
  const corrupted = bytes.slice(); corrupted[0] ^= 0xff; assert.throws(() => decodeMugenExpressionProgram(corrupted), /signature/u);
  const unknown = structuredClone(original); unknown.instructions[0].unexpected = true; assert.throws(() => encodeMugenExpressionProgram(unknown), /instruction/u);
  const futureVersion = structuredClone(original); futureVersion.schemaVersion = 2; assert.throws(() => encodeMugenExpressionProgram(futureVersion), /envelope/u);
  const falling = { schemaVersion: 1, revision: 'm09-g01-expression-bytecode-v1', instructions: [{ op: 'push-int', value: 1 }, { op: 'branch-or', target: 4 }, { op: 'push-int', value: 2 }, { op: 'return' }, { op: 'truthy' }], maxStack: 1, source: null };
  assert.throws(() => encodeMugenExpressionProgram(falling), /without return/u);
  const deepStack = { schemaVersion: 1, revision: 'm09-g01-expression-bytecode-v1', instructions: [...Array.from({ length: 257 }, () => ({ op: 'push-int', value: 1 })), ...Array.from({ length: 256 }, () => ({ op: 'binary', operator: '+' })), { op: 'return' }], maxStack: 257, source: null };
  assert.throws(() => encodeMugenExpressionProgram(deepStack), /stack budget/u);
  const tooManyInstructions = { schemaVersion: 1, revision: 'm09-g01-expression-bytecode-v1', instructions: Array.from({ length: 4097 }, () => ({ op: 'push-int', value: 1 })), maxStack: 1, source: null };
  assert.throws(() => encodeMugenExpressionProgram(tooManyInstructions), /instruction count/u);
  const oversizedPath = structuredClone(original); oversizedPath.source.canonicalPath = 'a'.repeat(513); assert.throws(() => encodeMugenExpressionProgram(oversizedPath), /envelope/u);
});

test('G01 evaluator enforces fuel and parser/compiler survive deterministic fuzz', () => {
  assert.throws(() => evaluateMugenExpression(program('1+2+3+4'), new BasicMugenExpressionVmContext(), { fuel: 1 }), error => error instanceof MugenVmFault && error.code === 'E_MUGEN_VM_BUDGET');
  let seed = 0x9e3779b9; const alphabet = '0123456789+-*/%()[]=!<>&|^~,. abcdef';
  for (let sample = 0; sample < 1000; sample++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const length = seed % 96; let source = '';
    for (let index = 0; index < length; index++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; source += alphabet[seed % alphabet.length]; }
    try { const bytecode = program(source); evaluateMugenExpression(bytecode, new BasicMugenExpressionVmContext()); } catch (error) { assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /Maximum call stack|heap out of memory/iu); }
  }
});

test('G01 generated operator/function ledger matches the frozen milestone artifact', () => {
  const ledger = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/expression-ledger.json', import.meta.url), 'utf8'));
  assert.equal(ledger.bytecodeRevision, 'm09-g01-expression-bytecode-v1');
  assert.deepEqual(ledger.operatorsByDescendingPrecedence, MUGEN_EXPRESSION_OPERATOR_LEDGER);
  assert.deepEqual(ledger.coreFunctions, MUGEN_EXPRESSION_CORE_FUNCTION_LEDGER);
  assert.deepEqual(ledger.budgets, { sourceBytes: 1_048_576, sourcePathBytes: 512, stringBytes: 16_777_216, encodedBytecodeBytes: 67_108_864, expressionDepth: 128, callDepth: 16, instructions: 4096, stack: 256, functionArguments: 32, fuel: 16_384 });
});

test('G01 official documentation oracle fixtures are bytecode differential green', () => {
  const oracle = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/expression-oracle-fixtures.json', import.meta.url), 'utf8'));
  assert.equal(oracle.fixtures.length, 33);
  for (const fixture of oracle.fixtures) {
    const actual = run(fixture.expression); assert.equal(actual.kind, fixture.expected.kind, fixture.id);
    if (fixture.expected.kind !== 'bottom') assert.equal(actual.value, fixture.expected.value, fixture.id);
  }
});

test('G01 call/depth/argument gates and no-dynamic-code scan are closed', () => {
  assert.throws(() => program(`${'abs('.repeat(18)}1${')'.repeat(18)}`), /call depth/u);
  assert.throws(() => program(`probe(${Array.from({ length: 33 }, () => '1').join(',')})`), /call instruction/u);
  assert.throws(() => program(`${'('.repeat(130)}1${')'.repeat(130)}`), /maximum depth|depth budget/u);
  assert.throws(() => program("'not-an-official-string'"), /Invalid character/u);
  for (const directory of [new URL('../mugen/import/expression/', import.meta.url), new URL('../mugen/runtime/vm/', import.meta.url)]) for (const file of readdirSync(directory).filter(name => name.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, directory), 'utf8'); assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/u, file);
  }
});
