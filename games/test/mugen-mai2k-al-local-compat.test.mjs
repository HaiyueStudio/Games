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

const maiDirectory = fileURLToPath(new URL('../mugen/charactors/mai2k/', import.meta.url));
const alDirectory = fileURLToPath(new URL('../mugen/charactors/AL/', import.meta.url));

test('local mai2k package completes the viewer pipeline with A3-A7 AIR compatibility', {
  skip: !existsSync(join(maiDirectory, 'mai2k.def')),
  timeout: 120_000,
}, async () => {
  const model = await importModel(maiDirectory, 'mai2k.def');
  assert.equal(model.actions.length, 418);
  assert.equal(model.sprites.length, 1_384);
  assert.equal(model.sounds.length, 97);
  assert(model.actions.some(action => action.audioCues.length > 0));
  const legacyBlend = model.actions.find(action => action.action.number === 242424);
  assert(legacyBlend);
  assert.equal(legacyBlend.action.elements.length, 4);
  assert(legacyBlend.action.elements.every(element => element.blend.mode === 'add'));
});

test('local AL package completes the viewer pipeline with damaged State-header compatibility', {
  skip: !existsSync(join(alDirectory, 'AL.def')),
  timeout: 120_000,
}, async () => {
  const model = await importModel(alDirectory, 'AL.def');
  assert.equal(model.actions.length, 466);
  assert.equal(model.sprites.length, 765);
  assert.equal(model.sounds.length, 134);
  assert(model.actions.some(action => action.audioCues.length > 0));
});

async function importModel(directory, entryDef) {
  const imported = await importMugenCharacter(await createMugenVfs(readDirectory(directory)), {
    contentRole: 'local-content', entryDef, entryKind: 'character', scriptProfile: 'none',
  });
  return createMugenCharacterModel(imported.package, imported.metadata, { viewerAudioCues: imported.viewerAudioCues });
}

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
