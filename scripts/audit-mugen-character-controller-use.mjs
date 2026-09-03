import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, join, relative, resolve } from 'node:path';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier);
    return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context);
  },
});

const [{ createMugenVfs }, { importMugenCharacter }] = await Promise.all([
  import('../games/mugen/import/vfs/MugenVfs.ts'),
  import('../games/mugen/import/worker/MugenCharacterImport.ts'),
]);

const directory = resolve(process.argv[2] ?? 'games/mugen/charactors/Petra_Johanna_Lagerkvist');
const entryDef = process.argv[3] ?? `${basename(directory)}.def`;
const files = [];
const visit = current => {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.isFile()) files.push(path);
  }
};
visit(directory);

const vfs = await createMugenVfs(files.map(path => ({
  path: relative(directory, path).replaceAll('\\', '/'),
  bytes: new Uint8Array(readFileSync(path)),
})));
const imported = await importMugenCharacter(vfs, {
  contentRole: 'local-content',
  entryDef,
  entryKind: 'character',
  scriptProfile: 'm09-native-common',
});

const entries = new Map();
for (const state of imported.package.tables.states[0]?.states ?? []) {
  for (const controller of state.controllers) {
    let entry = entries.get(controller.type);
    if (entry === undefined) {
      entry = { type: controller.type, count: 0, parameterCounts: new Map(), literalParameterCounts: new Map(), literalValues: new Map(), samples: new Map() };
      entries.set(controller.type, entry);
    }
    entry.count += 1;
    for (const [key] of Object.entries(controller.parameters)) {
      entry.parameterCounts.set(key, (entry.parameterCounts.get(key) ?? 0) + 1);
      if (!entry.samples.has(key)) entry.samples.set(key, `${controller.sourcePath}:${controller.sourceLine}`);
    }
    for (const [key, value] of Object.entries(controller.literalParameters ?? {})) {
      entry.literalParameterCounts.set(key, (entry.literalParameterCounts.get(key) ?? 0) + 1);
      let values = entry.literalValues.get(key);
      if (values === undefined) { values = new Map(); entry.literalValues.set(key, values); }
      values.set(value, (values.get(value) ?? 0) + 1);
      if (!entry.samples.has(key)) entry.samples.set(key, `${controller.sourcePath}:${controller.sourceLine}`);
    }
  }
}

const orderedCounts = values => Object.fromEntries([...values].sort(([left], [right]) => left.localeCompare(right, 'en')));
const result = {
  schemaVersion: 1,
  character: basename(directory),
  entryDef,
  stateCount: imported.package.tables.states[0]?.states.length ?? 0,
  controllerCount: [...entries.values()].reduce((total, entry) => total + entry.count, 0),
  entries: [...entries.values()].sort((left, right) => left.type.localeCompare(right.type, 'en')).map(entry => ({
    type: entry.type,
    count: entry.count,
    parameterCounts: orderedCounts(entry.parameterCounts),
    literalParameterCounts: orderedCounts(entry.literalParameterCounts),
    literalValues: Object.fromEntries([...entry.literalValues].sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, values]) => [key, orderedCounts(values)])),
    samples: Object.fromEntries([...entry.samples].sort(([left], [right]) => left.localeCompare(right, 'en'))),
  })),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
