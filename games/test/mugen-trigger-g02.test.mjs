import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { parseMugenExpressionAst } = await import('../mugen/import/expression/MugenExpressionParser.ts');
const { mugenBottom, mugenInt } = await import('../mugen/import/expression/types.ts');
const { compileMugenRuntimeExpression } = await import('../mugen/import/trigger/MugenRuntimeExpression.ts');
const { findStrictImportFailureTrigger, MUGEN_STRICT_IMPORT_FAILURE_TRIGGERS, MUGEN_TRIGGER_DISPATCH, MUGEN_TRIGGER_LEDGER } = await import('../mugen/import/trigger/ledger.ts');
const { evaluateMugenRuntimeExpression } = await import('../mugen/runtime/triggers/MugenTriggerEvaluator.ts');
const { MugenVmFault } = await import('../mugen/runtime/vm/MugenExpressionVm.ts');

function program(source) { return compileMugenRuntimeExpression(parseMugenExpressionAst(source), { canonicalPath: 'g02.cns', line: 1, column: 1 }); }
function fixture() {
  const entities = new Map([
    ['p1', entity(10, 1)], ['p2', entity(20, 2)], ['parent', entity(30, 3)], ['helper', entity(40, 4)], ['target', entity(50, 5)], ['partner', entity(60, 6)],
  ]);
  const routes = new Map([['parent', 'parent'], ['root', 'p1'], ['helper', 'helper'], ['target', 'target'], ['partner', 'partner'], ['enemy', 'p2'], ['enemynear', 'p2'], ['playerid', 'p2']]);
  return {
    entities,
    host: {
      contextFor(id) { return entities.get(id)?.context ?? null; },
      redirect(_origin, selector, argument) {
        if ((selector === 'helper' && argument !== null && argument !== 123) || (selector === 'target' && argument !== null && argument !== 7) || ((selector === 'enemy' || selector === 'enemynear') && argument !== null && argument !== 0) || (selector === 'playerid' && argument !== 2)) return null;
        return routes.get(selector) ?? null;
      },
    },
  };
}
function entity(time, variable) {
  const integer = new Int32Array(60); integer[0] = variable;
  return { integer, context: { variables: { integer, float: new Float32Array(40) }, random: { nextMugenRandom: () => 123 }, resolve: name => name === 'time' ? mugenInt(time) : mugenBottom(`unknown ${name}`), call: name => mugenBottom(`unknown ${name}`) } };
}
function run(source, value = fixture(), fuel) { return { value, result: evaluateMugenRuntimeExpression(program(source), 'p1', value.host, fuel === undefined ? {} : { fuel }) }; }

test('G02 parses every MUGEN redirection selector and evaluates in the selected entity context', () => {
  for (const [source, expected] of [['parent, time', 30], ['root, time', 10], ['helper, time', 40], ['helper(123), time', 40], ['target, time', 50], ['target(7), time', 50], ['partner, time', 60], ['enemy, time', 20], ['enemy(0), time', 20], ['enemyNear, time', 20], ['enemyNear(0), time', 20], ['playerID(2), time', 20]]) assert.deepEqual(run(source).result.value, { kind: 'int', value: expected }, source);
  assert.deepEqual(run('5 + (enemy, time)').result.value, { kind: 'int', value: 25 });
});

test('G02 redirection is lazy, assignments target the redirected variable bank, and missing targets produce bottom', () => {
  const value = fixture();
  assert.deepEqual(run('enemy, var(0) := 7', value).result.value, { kind: 'int', value: 7 }); assert.equal(value.entities.get('p2').integer[0], 7);
  assert.deepEqual(run('0 && (enemy, var(0) := 9)', value).result.value, { kind: 'int', value: 0 }); assert.equal(value.entities.get('p2').integer[0], 7);
  assert.equal(run('helper(999), time', value).result.value.kind, 'bottom');
});

test('G02 rejects recursive/invalid redirection and shares one fuel meter across selector, body and parent bytecode', () => {
  assert.throws(() => program('root, target, time'), /Recursive/u);
  assert.throws(() => program('parent(1), time'), /does not accept/u);
  assert.throws(() => program('playerID, time'), /requires an argument/u);
  assert.throws(() => run('enemy(0), time + 1', fixture(), 2), error => error instanceof MugenVmFault && error.code === 'E_MUGEN_VM_BUDGET');
});

test('G07-B evaluates legal sibling redirections and redirected selector arguments relative to their active entity', () => {
  assert.deepEqual(run('root, var(0) = 1 || root, var(0) = 2').result.value, { kind: 'int', value: 1 });
  assert.deepEqual(run('enemyNear(root, var(0) - 1), time').result.value, { kind: 'int', value: 20 });
});

test('G02 generated trigger ledger classifies the complete frozen 127-item census without duplicates', () => {
  const frozen = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m08-mugen-asset-vertical-slice/g01-contract/feature-census.json', import.meta.url), 'utf8'));
  const artifact = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/trigger-ledger.json', import.meta.url), 'utf8'));
  const official = frozen.catalogs.find(catalog => catalog.id === 'official-triggers').groups.flatMap(group => group.items).sort();
  const classified = artifact.classifications.flatMap(group => group.items.map(name => ({ name, implementation: group.implementation, owner: group.owner })));
  assert.equal(MUGEN_TRIGGER_LEDGER.length, 127); assert.equal(new Set(MUGEN_TRIGGER_LEDGER.map(entry => entry.name)).size, 127);
  assert.deepEqual(MUGEN_TRIGGER_LEDGER.map(entry => entry.name).sort(), official);
  assert.deepEqual(classified, MUGEN_TRIGGER_LEDGER);
  assert.deepEqual(MUGEN_TRIGGER_DISPATCH.map(entry => entry.name).sort(), MUGEN_TRIGGER_LEDGER.filter(entry => entry.implementation === 'native').map(entry => entry.name).sort());
  assert.equal(new Set(MUGEN_TRIGGER_DISPATCH.flatMap(entry => entry.tokens)).size, MUGEN_TRIGGER_DISPATCH.flatMap(entry => entry.tokens).length);
  assert.deepEqual(artifact.closure, { native: 127, strictImportFailure: 0, unclassified: 0, m09FinalRequiredStrictImportFailure: 0 });
  for (const name of MUGEN_STRICT_IMPORT_FAILURE_TRIGGERS) assert.equal(findStrictImportFailureTrigger(`${name}(1) + "${name}"`), name);
  for (const entry of MUGEN_TRIGGER_DISPATCH) for (const token of entry.tokens) assert.equal(findStrictImportFailureTrigger(`${token} + "AILevel"`), null, token);
});

test('G02 official executable oracle evidence is content-addressed to the committed fixture', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/g02-official-oracle-evidence.json', import.meta.url), 'utf8'));
  assert.equal(evidence.result, 'pass'); assert.equal(evidence.protocol.orderedValue, 1234); assert.equal(evidence.protocol.persistentTwoAtTime60, 30);
  for (const source of evidence.sources.filter(value => value.path.startsWith('Games/'))) {
    const relative = source.path.slice('Games/'.length); const bytes = readFileSync(new URL(`../../${relative}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path);
  }
  assert.deepEqual(evidence.officialLoadEvidence.terminalLines.slice(-3), ['Character kfm.def loaded OK', 'Match assets initialized OK', 'Match loop init']);
});
