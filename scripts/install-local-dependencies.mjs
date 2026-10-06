import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidateDescriptors = [
  { packageDirectory: '../Engine/engine', candidateDirectory: '../Engine/.artifacts/packages', packageName: '@haiyue/engine' },
  { packageDirectory: '../Engine/animation-spec', candidateDirectory: '../Engine/.artifacts/packages', packageName: '@haiyue/animation-spec' },
  { packageDirectory: '../Engine/extensions', candidateDirectory: '../Engine/.artifacts/packages', packageName: '@haiyue/extensions' },
  { packageDirectory: '../UI', candidateDirectory: '../UI/.artifacts/packages', packageName: '@haiyue/ui' },
];
const candidates = candidateDescriptors.map(findCandidate);

const missing = candidates.filter(candidate => candidate.path === null);
if (missing.length > 0) {
  throw new Error([
    'Missing local package candidates:',
    ...missing.map(candidate => `- ${candidate.pathTemplate}`),
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

function findCandidate({ packageDirectory, candidateDirectory, packageName }) {
  const version = readPackageVersion(packageDirectory);
  const fileName = `${tarballBasename(packageName)}-${version ?? '<version>'}.tgz`;
  const pathTemplate = `${candidateDirectory}/${fileName}`;
  if (!version) return { packageName, pathTemplate, path: null };
  const path = resolve(repositoryRoot, pathTemplate);
  return { packageName, pathTemplate, path: existsSync(path) ? pathTemplate : null };
}

function readPackageVersion(packageDirectory) {
  const packageJsonPath = resolve(repositoryRoot, packageDirectory, 'package.json');
  if (!existsSync(packageJsonPath)) return null;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return typeof packageJson.version === 'string' && packageJson.version ? packageJson.version : null;
}

function tarballBasename(packageName) {
  return packageName.replace(/^@/, '').replace('/', '-');
}
