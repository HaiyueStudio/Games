import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidateDescriptors = [
  { directory: '../Engine/.artifacts/packages', prefix: 'haiyue-engine-' },
  { directory: '../Engine/.artifacts/packages', prefix: 'haiyue-animation-spec-' },
  { directory: '../Engine/.artifacts/packages', prefix: 'haiyue-extensions-' },
  { directory: '../UI/.artifacts/packages', prefix: 'haiyue-ui-' },
];
const candidates = candidateDescriptors.map(findCandidate);

const missing = candidates.filter(candidate => candidate.path === null);
if (missing.length > 0) {
  throw new Error([
    'Missing local package candidates:',
    ...missing.map(candidate => `- ${candidate.directory}/${candidate.prefix}<version>.tgz`),
    'Run `npm run pack:candidates` in ../Engine and `npm run pack:candidate` in ../UI first.',
  ].join('\n'));
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this bootstrap through `npm run deps:local`.');
const result = spawnSync(process.execPath, [npmCli, 'install', '--no-save', '--package-lock=false', '--cache=.npm-cache', ...candidates.map(candidate => candidate.path)], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

function findCandidate({ directory, prefix }) {
  const packagesDirectory = resolve(repositoryRoot, directory);
  if (!existsSync(packagesDirectory)) return { directory, prefix, path: null };
  const matches = readdirSync(packagesDirectory)
    .filter(entry => entry.startsWith(prefix) && entry.endsWith('.tgz'))
    .map(entry => ({ entry, modifiedAtMs: statSync(resolve(packagesDirectory, entry)).mtimeMs }))
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || right.entry.localeCompare(left.entry, undefined, { numeric: true }));
  return { directory, prefix, path: matches.length > 0 ? join(directory, matches[0].entry) : null };
}
