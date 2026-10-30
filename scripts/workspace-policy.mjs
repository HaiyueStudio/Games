import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const PLATFORM_NAME = '@haiyue/games-platform';
export const TOOLING_NAME = '@haiyue/games-tooling';
export const gamePackageName = id => `@haiyue/game-${id}`;
export const packageName = id => id === 'platform' ? PLATFORM_NAME : id === 'tooling' ? TOOLING_NAME : gamePackageName(id);
export const packageDirectory = id => id === 'platform' ? 'games/launcher' : id === 'tooling' ? 'packages/tooling' : `games/${id}`;
export function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
export function loadWorkspacePlan(root) {
  const manifest = readJson(resolve(root, 'games/manifest.json'));
  const plan = readJson(resolve(root, 'config/workspaces.json'));
  const tests = readdirSync(resolve(root, 'games/test'), { recursive: true }).filter(name => name.endsWith('.test.mjs')).map(name => `games/test/${name.replaceAll('\\', '/')}`);
  validatePlan(plan, manifest, tests);
  return { manifest, plan, tests };
}
/** A disjoint test partition prevents both omitted suites and duplicate execution. */
export function validatePlan(plan, manifest, tests) {
  const registered = new Set(manifest.entries.map(entry => entry.id));
  if (plan.schemaVersion !== 1 || !['pilot', 'full'].includes(plan.phase) || !Array.isArray(plan.games) || new Set(plan.games).size !== plan.games.length || plan.games.some(id => !registered.has(id))) throw Error('Invalid workspace game selection.');
  if (plan.phase === 'full' && (plan.games.length !== registered.size || [...registered].some(id => !plan.games.includes(id)))) throw Error('Every manifest game must own a workspace. Run npm run workspaces:sync.');
  const owners = new Set([...registered, 'platform', 'tooling']), seen = new Set();
  if (!plan.testOwners || typeof plan.testOwners !== 'object') throw Error('Missing test ownership map.');
  if ([...owners].some(owner => !Object.hasOwn(plan.testOwners, owner))) throw Error('Missing test owner. Run npm run workspaces:sync.');
  for (const [owner, files] of Object.entries(plan.testOwners)) {
    if (!owners.has(owner) || !Array.isArray(files)) throw Error(`Unknown test owner ${owner}.`);
    for (const file of files) { if (!tests.includes(file) || seen.has(file)) throw Error(`Unknown or duplicated test: ${file}.`); seen.add(file); }
  }
  if (tests.some(file => !seen.has(file))) throw Error('Unowned tests. Run npm run workspaces:sync.');
  for (const id of plan.games) if (!plan.testOwners[id]?.length) throw Error(`Workspace ${id} needs an existing test suite.`);
}
export function validatePackages(root, manifest, plan) {
  const rootPackage = readJson(resolve(root, 'package.json'));
  const expectedNames = new Set([...plan.games, 'platform', 'tooling'].map(packageName));
  const actualNames = [];
  for (const parent of ['games', 'packages']) for (const directory of readdirSync(resolve(root, parent), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const file = resolve(root, parent, directory.name, 'package.json');
    if (existsSync(file)) actualNames.push(readJson(file).name);
  }
  if (actualNames.length !== expectedNames.size || new Set(actualNames).size !== actualNames.length || actualNames.some(name => !expectedNames.has(name))) throw Error('Workspace package discovery differs from the migration plan.');
  for (const id of [...plan.games, 'platform', 'tooling']) {
    const file = resolve(root, packageDirectory(id), 'package.json');
    if (!existsSync(file)) throw Error(`Missing workspace ${file}.`);
    const pkg = readJson(file);
    if (pkg.name !== packageName(id) || pkg.private !== true || !pkg.scripts?.test || !pkg.scripts?.typecheck || id !== 'tooling' && !pkg.scripts?.build) throw Error(`Incomplete workspace ${id}.`);
    for (const task of ['test', 'typecheck', ...(id === 'tooling' ? [] : ['build'])]) if (pkg.scripts[task] !== `node ../../scripts/workspace-task.mjs ${task} ${id}`) throw Error(`Workspace task ${id}:${task} differs from the shared runner.`);
    if (!['platform', 'tooling'].includes(id) && pkg.dependencies?.[PLATFORM_NAME] !== '0.1.0') throw Error(`Missing platform dependency for ${id}.`);
    for (const name of Object.keys(rootPackage.dependencies)) if (pkg.peerDependencies?.[name] !== '*' || pkg.dependencies?.[name]) throw Error(`Workspace ${id} must share root runtime dependency ${name}.`);
    if (id !== 'tooling' && !pkg.nx?.targets?.build?.outputs?.length) throw Error(`Missing cache outputs for ${id}.`);
    for (const file of plan.testOwners[id]) if (!pkg.nx?.targets?.test?.inputs?.includes(`{workspaceRoot}/${file}`)) throw Error(`Test ${file} is missing from cache inputs for ${id}.`);
    if (!['platform', 'tooling'].includes(id) && !manifest.entries.some(entry => entry.id === id && existsSync(resolve(root, 'games', entry.entry)))) throw Error(`Missing game entry for ${id}.`);
  }
}
export function selectedGameIds(manifest, filter = '') {
  const requested = [...new Set(filter.split(',').map(value => value.trim().replace(/^game:/, '')).filter(Boolean))];
  if (requested.some(id => !manifest.entries.some(entry => entry.id === id))) throw Error(`Unknown game target: ${requested.join(', ')}.`);
  return requested.length ? requested : manifest.entries.map(entry => entry.id);
}
export function environmentDuration(environment, name, fallback, allowZero = false) {
  if (environment[name] === undefined) return fallback;
  const value = Number(environment[name]);
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw Error(`${name} must be ${allowZero ? 'zero or a positive integer' : 'a positive integer'}.`);
  return value;
}
export function workspaceConcurrency(task, environment = {}) {
  return environmentDuration(environment, 'GAME_WORKSPACE_CONCURRENCY', task === 'build' ? 1 : 2);
}
export function migrationGameIds(manifest, previous, pilot) {
  if (pilot && previous?.phase === 'full') throw Error('Full rollout already exists. Select pilot games with scoped tasks instead of rewriting the workspace plan.');
  return pilot ? ['2048', 'whale-maker'] : manifest.entries.map(entry => entry.id);
}
export function cacheSummary(log) {
  const clean = log.replace(/\u001b\[[0-9;]*m/g, '');
  const match = /Cache:\s+(\d+)\/(\d+) hit/.exec(clean) ?? /Nx read the output from the cache instead of running the command for (\d+) out of (\d+) tasks/.exec(clean);
  if (!match) throw Error('Lerna did not report a cache summary.');
  return { hits: Number(match[1]), tasks: Number(match[2]) };
}
