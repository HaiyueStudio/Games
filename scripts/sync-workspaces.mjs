import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { loadWorkspacePlan, packageName, packageDirectory, readJson, migrationGameIds } from './workspace-policy.mjs';

const root = resolve(import.meta.dirname, '..'), checking = process.argv.includes('--check');
if (checking) { const { manifest, plan } = loadWorkspacePlan(root); const { validatePackages } = await import('./workspace-policy.mjs'); validatePackages(root, manifest, plan); console.log(`Workspace manifest/test coverage: ${plan.games.length} games (${plan.phase}).`); }
else {
  const manifest = readJson(resolve(root, 'games/manifest.json')), rootPackage = readJson(resolve(root, 'package.json')), ids = manifest.entries.map(entry => entry.id);
  const pilot = process.argv.includes('--pilot');
  const previous = existsSync(resolve(root, 'config/workspaces.json')) ? readJson(resolve(root, 'config/workspaces.json')) : null;
  const games = migrationGameIds(manifest, previous, pilot);
  const tests = readdirSync(resolve(root, 'games/test'), { recursive: true }).filter(file => file.endsWith('.test.mjs')).map(file => `games/test/${file.replaceAll('\\', '/')}`).sort();
  const owners = Object.fromEntries([...ids, 'platform', 'tooling'].map(id => [id, []]));
  const aliases = { icosahedron: 'icosahedron-minesweeper', match3: 'match-3', entanglement: 'entanglement-path', valley: 'valley-of-light', tank: 'tank-battle', jigsaw: 'jigsaw-puzzle', wfc: 'wfc-map' };
  const importOwners = (text, directory) => [...text.matchAll(/(?:from\s*|import\s*\(|new URL\()\s*['"]([^'"]+)['"]/g)].flatMap(match => {
    if (!match[1].startsWith('.')) return [];
    const own = relative(resolve(root, 'games'), resolve(directory, match[1])).replaceAll('\\', '/').split('/')[0];
    return ids.includes(own) ? [own] : [];
  });
  for (const file of tests) {
    const text = readFileSync(resolve(root, file), 'utf8'), name = file.split('/').at(-1);
    const prefix = ids.find(id => name.startsWith(`${id}.`) || name.startsWith(`${id}-`)) ?? Object.entries(aliases).find(([prefix]) => name.startsWith(`${prefix}-`))?.[1];
    const imports = importOwners(text, resolve(root, file, '..'));
    const owner = prefix ?? imports.sort()[0] ?? (['../gamepad/', '../session/', '../host/', '../launcher/', '../shared/', '../save/', '../simulator/', 'site/state/library', 'site/catalog/paths'].some(value => text.includes(value)) ? 'platform' : 'tooling');
    owners[owner].push(file);
  }
  const plan = { schemaVersion: 1, phase: pilot ? 'pilot' : 'full', games, testOwners: owners };
  const write = (file, value) => { const path = resolve(root, file); mkdirSync(resolve(path, '..'), { recursive: true }); const text = `${JSON.stringify(value, null, 2)}\n`; if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeFileSync(path, text); };
  write('config/workspaces.json', plan);
  // Runtime packages are supplied by the repository. A local candidate overlay
  // must not leave games resolving a second, older copy inside their workspace.
  const external = Object.fromEntries(Object.keys(rootPackage.dependencies).map(name => [name, '*']));
  const scanGameDependencies = id => {
    const found = new Set();
    for (const file of readdirSync(resolve(root, 'games', id), { recursive: true }).filter(file => file.endsWith('.ts') && !file.startsWith('dist/'))) {
      const path = resolve(root, 'games', id, file);
      for (const owner of importOwners(readFileSync(path, 'utf8'), resolve(path, '..'))) if (owner !== id && games.includes(owner)) found.add(owner);
    }
    return [...found].sort();
  };
  for (const id of [...games, 'platform', 'tooling']) {
    const directory = packageDirectory(id), command = task => `node ../../scripts/workspace-task.mjs ${task} ${id}`;
    const dependencies = {};
    if (id !== 'platform') dependencies[packageName('platform')] = '0.1.0';
    if (id !== 'tooling' && id !== 'platform') for (const dep of scanGameDependencies(id)) dependencies[packageName(dep)] = '0.1.0';
    const buildOutputs = id === 'platform' ? ['{workspaceRoot}/site/game-host.js', '{workspaceRoot}/site/game-host.js.map', '{workspaceRoot}/site/gamepad.js', '{workspaceRoot}/site/gamepad.js.map', '{workspaceRoot}/site/simulator.js', '{workspaceRoot}/site/simulator.js.map', '{workspaceRoot}/site/core'] : id === 'gravity-maze' ? ['{projectRoot}/dist'] : id === 'entanglement-path' ? ['{projectRoot}/bundle.js', '{projectRoot}/bundle.js.map', '{projectRoot}/terrain-raster.worker.js', '{projectRoot}/terrain-raster.worker.js.map'] : ['{projectRoot}/bundle.js', '{projectRoot}/bundle.js.map'];
    write(`${directory}/package.json`, {
      name: packageName(id), version: '0.1.0', private: true, type: 'module',
      scripts: { ...(id === 'tooling' ? {} : { build: command('build') }), test: command('test'), typecheck: command('typecheck') }, dependencies, peerDependencies: external,
      nx: { targets: {
        ...(id === 'tooling' ? {} : { build: { outputs: buildOutputs } }),
        test: { inputs: ['production', '^production', 'testGlobals', ...(id === 'platform' || id === 'tooling' ? ['allGameSources'] : []), ...owners[id].map(file => `{workspaceRoot}/${file}`)] },
        ...(id === 'tooling' ? { typecheck: { inputs: ['production', 'allGameSources'] } } : {}),
      } },
    });
    const include = id === 'platform' ? ['./**/*.ts', '../gamepad/**/*.ts', '../host/**/*.ts', '../session/**/*.ts', '../save/**/*.ts', '../shared/**/*.ts', '../simulator/**/*.ts'] : id === 'tooling' ? ['../../games/test/fixtures/**/*.ts'] : ['./**/*.ts'];
    write(`${directory}/tsconfig.json`, { extends: '../../tsconfig.base.json', compilerOptions: { noEmit: true, declaration: false, types: ['@webgpu/types'] }, include, exclude: ['node_modules', 'dist', 'assets/masters'] });
    if (id !== 'tooling' && id !== 'platform') write(`${directory}/tsconfig.build.json`, { extends: './tsconfig.json', compilerOptions: { noEmit: false, declaration: false, rootDir: '../..' }, include: ['./**/*.ts', '../../node_modules/@haiyue/engine/src/**/*', '../../node_modules/@haiyue/extensions/src/**/*'], exclude: ['node_modules', 'dist'] });
  }
  console.log(`Synchronized ${games.length} game workspaces, platform and tooling; ${tests.length} uniquely owned test files.`);
}
