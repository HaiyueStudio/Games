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

const [{ createMugenVfs }, { importMugenCharacter }, { createMugenCharacterModel }] = await Promise.all([
  import('../mugen/import/vfs/MugenVfs.ts'),
  import('../mugen/import/worker/MugenCharacterImport.ts'),
  import('../mugen/viewer/MugenCharacterModel.ts'),
]);

const directory = fileURLToPath(new URL('../mugen/charactors/Luna Himeki/', import.meta.url));
const entryDef = 'Luna Himeki.def';

test('local Luna Himeki package completes the viewer pipeline with mixed comment encoding and legacy RIFF length', {
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

  assert.equal(model.actions.length, 290);
  assert.equal(model.sprites.length, 1_062);
  assert.equal(model.sounds.length, 60);
  assert.equal(model.actions.filter(action => action.audioCues.length > 0).length, 52);
  assert(model.actions.some(action => action.action.number === 0));
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
