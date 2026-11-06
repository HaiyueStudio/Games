import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadWorkspacePlan, packageName, validatePackages, readJson, workspaceConcurrency } from './workspace-policy.mjs';

export function runWorkspaces(task, ids = [], extra = []) {
  const root = resolve(import.meta.dirname, '..'), { manifest, plan } = loadWorkspacePlan(root); validatePackages(root, manifest, plan);
  if (!['build', 'test', 'typecheck'].includes(task)) throw Error(`Unknown workspace task ${task}.`);
  if (ids.some(id => ![...plan.games, 'platform', 'tooling'].includes(id))) throw Error(`Unknown workspace selection: ${ids.join(', ')}.`);
  const concurrency = workspaceConcurrency(task, process.env);
  const lernaPackage = resolve(root, 'node_modules/lerna/package.json'), pkg = readJson(lernaPackage);
  const bin = resolve(lernaPackage, '..', typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.lerna);
  const args = [bin, 'run', task, '--concurrency', String(concurrency), ...ids.flatMap(id => ['--scope', packageName(id)]), ...extra];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, NX_DAEMON: 'false', NX_NO_CLOUD: 'true', NX_INTERACTIVE: 'false', NX_TUI: 'false' } });
  if (result.error) throw result.error; if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status ?? 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [task, ...ids] = process.argv.slice(2); runWorkspaces(task, ids);
}
