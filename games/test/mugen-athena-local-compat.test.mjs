import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [{ MUGEN_LIMITS }, { createMugenVfs }, { importMugenCharacter }, { createMugenCharacterModel }] = await Promise.all([
  import('../mugen/import/contract.ts'),
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/worker/MugenCharacterImport.ts'),
  import('../mugen/viewer/MugenCharacterModel.ts'),
]);

const directory = fileURLToPath(new URL('../mugen/charactors/Athena_XIII/', import.meta.url));
const entryDef = 'Athena_XIII.def';

test('local Athena XIII package completes the viewer pipeline with Fighter Factory compatibility', {
  skip: !existsSync(join(directory, entryDef)),
  timeout: 120_000,
}, async () => {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content',
    entryDef,
    entryKind: 'character',
    scriptProfile: 'none',
  });
  const model = createMugenCharacterModel(imported.package, imported.metadata, { viewerAudioCues: imported.viewerAudioCues });

  assert.equal(model.actions.length, 629);
  assert.equal(model.sprites.length, 3_171);
  assert.equal(imported.package.tables.sounds.length, 97);
  assert.equal(model.diagnostics.filter(item => item.code === 'E_MUGEN_AIR_ACTION_DUPLICATE').length, 5);
  assert.equal(imported.package.featureUsage.includes('g06.snd.fighter-factory-v0.1.0.1'), true);
  assert(imported.viewerAudioCues.length > 0);
  assert(model.actions.filter(action => action.audioCues.length > 0).length > 0);
  for (const actionNumber of [5000, 5010, 5020]) {
    assert(model.actions.find(action => action.action.number === actionNumber)?.audioCues.some(cue => cue.sound.group === 5000));
  }
  assert(imported.encoded.bytes.byteLength > 64 * 1024 * 1024);
  assert(imported.encoded.bytes.byteLength <= MUGEN_LIMITS.worker.maxMessageBytes);
});

function readDirectory(root) {
  const files = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files.map(path => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: new Uint8Array(readFileSync(path)) }));
}
