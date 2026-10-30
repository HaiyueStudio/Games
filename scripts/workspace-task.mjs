import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadWorkspacePlan, packageDirectory, validatePackages } from './workspace-policy.mjs';
import { environmentDuration } from './workspace-policy.mjs';
import { runRollupOnce } from './shared-rollup-runner.mjs';

const root = resolve(import.meta.dirname, '..'), [task, id] = process.argv.slice(2);
const { manifest, plan } = loadWorkspacePlan(root); validatePackages(root, manifest, plan);
if (!['platform', 'tooling', ...plan.games].includes(id)) throw Error(`Unknown workspace ${id}.`);
const run = args => { const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }); if (result.error) throw result.error; if (result.status !== 0) process.exit(result.status ?? 1); };
if (task === 'build') {
  if (id === 'tooling') throw Error('Tooling has no build output.');
  await runRollupOnce({ cwd: root, config: id === 'platform' ? 'rollup.gamepad.config.js' : 'rollup.config.js',
    expectedOutputs: id === 'platform' ? ['site'] : [id === 'gravity-maze' ? 'games/gravity-maze/dist' : `games/${id}/bundle.js`],
    label: id, timeoutMs: environmentDuration(process.env, 'GAME_BUILD_TIMEOUT_MS', id === 'platform' || id === 'gravity-maze' ? 120_000 : 60_000),
    exitGraceMs: environmentDuration(process.env, 'GAME_EXIT_GRACE_MS', 1_500, true),
    terminateGraceMs: environmentDuration(process.env, 'GAME_TERM_GRACE_MS', 1_000),
    killGraceMs: environmentDuration(process.env, 'GAME_KILL_GRACE_MS', 1_000),
    environment: { GAME_FILTER: id === 'platform' ? '' : id },
  });
} else if (task === 'typecheck') run(['node_modules/typescript/bin/tsc', '-p', `${packageDirectory(id)}/tsconfig.json`, '--noEmit']);
else if (task === 'test') {
  const files = plan.testOwners[id]; if (!files?.length) throw Error(`No tests owned by ${id}.`);
  console.log(`[workspace ${id}] ${files.length} test files`); run(['--experimental-strip-types', '--test', ...files]);
} else throw Error(`Unknown task ${task}.`);
