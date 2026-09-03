import { readFileSync, readdirSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, join, relative, resolve } from 'node:path';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [{ createMugenVfs }, { importMugenCharacter }, { createMugenCharacterModel }] = await Promise.all([
  import('../games/mugen/import/vfs/MugenVfs.ts'),
  import('../games/mugen/import/worker/MugenCharacterImport.ts'),
  import('../games/mugen/viewer/MugenCharacterModel.ts'),
]);

const root = resolve(process.argv[2] ?? '');
if (process.argv[2] === undefined || !statSync(root).isDirectory()) {
  console.error('Usage: node --expose-gc scripts/audit-mugen-character-directory.mjs <chars-directory> [character-directory ...]');
  process.exit(2);
}

const quiet = process.argv.includes('--quiet');
const audioRangeArgument = process.argv.find(value => value.startsWith('--audio-range='));
const audioRangeMatch = /^--audio-range=(-?\d+)-(-?\d+)$/u.exec(audioRangeArgument ?? '');
const audioRange = audioRangeMatch === null ? null : [Number(audioRangeMatch[1]), Number(audioRangeMatch[2])];
const requestedNames = new Set(process.argv.slice(3).filter(value => !value.startsWith('--')).map(value => value.toLocaleLowerCase('en')));
const directories = readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .filter(entry => requestedNames.size === 0 || requestedNames.has(entry.name.toLocaleLowerCase('en')))
  .map(entry => join(root, entry.name))
  .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
const totals = { directories: directories.length, definitions: 0, passed: 0, failed: 0, skipped: 0 };

for (let directoryIndex = 0; directoryIndex < directories.length; directoryIndex++) {
  const directory = directories[directoryIndex];
  const files = readDirectory(directory);
  const definitions = characterDefinitions(files);
  if (definitions.length === 0) {
    totals.skipped++;
    if (!quiet) console.log(`SKIP\t${directoryIndex + 1}/${directories.length}\t${basename(directory)}\tno character DEF`);
    continue;
  }
  totals.definitions += definitions.length;
  if (!quiet) console.log(`SCAN\t${directoryIndex + 1}/${directories.length}\t${basename(directory)}\t${definitions.join(',')}`);
  let vfs;
  try {
    vfs = await createMugenVfs(files.map(file => ({ path: file.path, bytes: new Uint8Array(readFileSync(file.absolutePath)) })));
  } catch (error) {
    for (const entryDef of definitions) reportFailure(directory, entryDef, error);
    totals.failed += definitions.length;
    continue;
  }
  for (const entryDef of definitions) {
    const startedAt = performance.now();
    try {
      const imported = await importMugenCharacter(vfs, {
        contentRole: 'local-content',
        entryDef,
        entryKind: 'character',
        scriptProfile: 'none',
      });
      const model = createMugenCharacterModel(imported.package, imported.metadata, { viewerAudioCues: imported.viewerAudioCues });
      totals.passed++;
      if (!quiet) console.log(`PASS\t${basename(directory)}\t${entryDef}\tactions=${model.actions.length}\tsprites=${model.sprites.length}\tsounds=${model.sounds.length}\taudible=${model.actions.filter(action => action.audioCues.length > 0).length}\tms=${Math.round(performance.now() - startedAt)}`);
      if (audioRange !== null) {
        const ranged = model.actions.filter(action => action.action.number >= audioRange[0] && action.action.number <= audioRange[1]);
        const missing = ranged.filter(action => action.audioCues.length === 0).map(action => action.action.number);
        console.log(`AUDIO_RANGE\t${basename(directory)}\t${entryDef}\trange=${audioRange.join('-')}\tactions=${ranged.length}\taudible=${ranged.length - missing.length}\tmissing=${missing.join(',')}`);
      }
    } catch (error) {
      totals.failed++;
      reportFailure(directory, entryDef, error);
    }
  }
  globalThis.gc?.();
}

console.log(`SUMMARY\t${JSON.stringify(totals)}`);
if (totals.failed > 0) process.exitCode = 1;

function readDirectory(directory) {
  const files = [];
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push({
        absolutePath,
        path: relative(directory, absolutePath).replaceAll('\\', '/'),
      });
    }
  };
  visit(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en', { sensitivity: 'base' }));
}

function characterDefinitions(files) {
  return files
    .filter(file => !file.path.includes('/') && file.path.toLowerCase().endsWith('.def'))
    .filter(file => {
      const source = readFileSync(file.absolutePath).toString('latin1');
      return /^\s*(?:sprite|spr)\s*=/imu.test(source) && /^\s*anim\s*=/imu.test(source);
    })
    .map(file => file.path);
}

function reportFailure(directory, entryDef, error) {
  const diagnostic = error?.diagnostics?.[0];
  const location = diagnostic?.canonicalPath === undefined
    ? ''
    : `${diagnostic.canonicalPath}${diagnostic.line === undefined ? '' : `:${diagnostic.line}`}`;
  const details = diagnostic?.details === undefined ? '' : `\t${JSON.stringify(diagnostic.details)}`;
  console.log(`FAIL\t${basename(directory)}\t${entryDef}\t${diagnostic?.code ?? error?.name ?? 'Error'}\t${location}\t${diagnostic?.message ?? error?.message ?? String(error)}${details}`);
}
