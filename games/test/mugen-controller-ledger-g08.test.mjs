import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });
const { getMugenControllerParameterCensus } = await import('../mugen/import/cns/CnsParser.ts');

test('G08 generated controller ledger exactly closes the frozen official 89-item census', () => {
  const census = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m08-mugen-asset-vertical-slice/g01-contract/feature-census.json', import.meta.url), 'utf8'));
  const ledger = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/official-controller-ledger.json', import.meta.url), 'utf8'));
  const catalog = census.catalogs.find(value => value.id === 'official-state-controllers'); const official = catalog.groups.flatMap(value => value.items).sort(); const classified = [...ledger.controllers].sort();
  assert.equal(official.length, 89); assert.equal(new Set(official).size, 89); assert.deepEqual(classified, official);
  assert.deepEqual({ official: ledger.officialCount, native: ledger.nativeCount, strict: ledger.strictImportFailureCount, unclassified: ledger.unclassifiedCount }, { official: 89, native: 89, strict: 0, unclassified: 0 });
});

test('G08 generated parameter ledger covers every documented MUGEN 1.1b1 controller parameter accepted by strict import', () => {
  const featureCensus = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m08-mugen-asset-vertical-slice/g01-contract/feature-census.json', import.meta.url), 'utf8'));
  const controllerLedger = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/official-controller-ledger.json', import.meta.url), 'utf8'));
  const parameterLedger = JSON.parse(readFileSync(new URL('../../../milestones/milestones/m09-mugen-character-runtime-parity/controller-parameter-ledger.json', import.meta.url), 'utf8'));
  const runtime = getMugenControllerParameterCensus(); const runtimeByName = new Map(runtime.map(entry => [entry.sourceName, entry]));
  const officialNames = controllerLedger.controllers.map(name => normalize(name)).sort(); const artifactNames = parameterLedger.entries.map(entry => entry.sourceName).sort();
  assert.deepEqual(artifactNames, officialNames); assert.equal(new Set(artifactNames).size, 89);
  assert.deepEqual({ controllers: parameterLedger.controllerCount, documented: parameterLedger.documentedControllerCount, rejected: parameterLedger.rejectedParameterCount }, { controllers: 89, documented: 89, rejected: 0 });
  assert.equal(parameterLedger.docsSource.sha256, featureCensus.sourceDocuments['state-controller']);
  for (const entry of parameterLedger.entries) {
    const current = runtimeByName.get(entry.sourceName); assert(current, entry.sourceName);
    assert.deepEqual(entry.acceptedParameters, current.sourceParameters, `${entry.sourceName} accepted parameters drifted`);
    assert.deepEqual(entry.requiredCompiledParameters, current.requiredCompiledParameters, `${entry.sourceName} required parameters drifted`);
    assert.deepEqual(entry.compatibilityIgnoredParameters, current.compatibilityIgnoredParameters, `${entry.sourceName} compatibility parameters drifted`);
    assert.deepEqual(entry.documentedButRejected, [], `${entry.sourceName} rejects an official documented parameter`);
  }
  assert.equal(parameterLedger.documentedParameterCount, parameterLedger.entries.reduce((sum, entry) => sum + entry.documentedParameters.length, 0));
  assert.equal(parameterLedger.acceptedParameterCount, parameterLedger.entries.reduce((sum, entry) => sum + entry.acceptedParameters.length, 0));
});

function normalize(value) { return value.replace(/[\s_-]+/gu, '').toLowerCase(); }
