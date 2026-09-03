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

const directory = fileURLToPath(new URL('../mugen/charactors/baiken/', import.meta.url));
const entryDef = 'baiken.def';

test('local baiken package completes the viewer pipeline with damaged State labels and AIR annotations', {
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

  assert.equal(model.actions.length, 526);
  assert.equal(model.sprites.length, 1_991);
  assert.equal(model.sounds.length, 108);
  assert.equal(model.actions.filter(action => action.audioCues.length > 0).length, 47);
  assert.equal(model.diagnostics.filter(item => item.code === 'E_MUGEN_AIR_ANNOTATION_IGNORED').length, 1);
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
