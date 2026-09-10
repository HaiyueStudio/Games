import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
const dependencyRanges = packageJson.dependencies ?? {};
const candidateDescriptors = [
  { directory: '../Engine/.artifacts/packages', prefix: 'haiyue-engine-', packageName: '@haiyue/engine', range: dependencyRanges['@haiyue/engine'] ?? null },
  { directory: '../Engine/.artifacts/packages', prefix: 'haiyue-animation-spec-', packageName: '@haiyue/animation-spec', range: null },
  { directory: '../Engine/.artifacts/packages', prefix: 'haiyue-extensions-', packageName: '@haiyue/extensions', range: dependencyRanges['@haiyue/extensions'] ?? null },
  { directory: '../UI/.artifacts/packages', prefix: 'haiyue-ui-', packageName: '@haiyue/ui', range: dependencyRanges['@haiyue/ui'] ?? null },
];
const candidates = candidateDescriptors.map(findCandidate);

const missing = candidates.filter(candidate => candidate.path === null);
if (missing.length > 0) {
  throw new Error([
    'Missing local package candidates:',
    ...missing.map(candidate => `- ${candidate.directory}/${candidate.prefix}<version>.tgz${candidate.range ? ` (${candidate.packageName} ${candidate.range})` : ''}`),
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

function findCandidate({ directory, prefix, packageName, range }) {
  const packagesDirectory = resolve(repositoryRoot, directory);
  if (!existsSync(packagesDirectory)) return { directory, prefix, packageName, range, path: null };
  const expression = new RegExp(`^${escapeRegex(prefix)}(.+)\\.tgz$`);
  const matches = readdirSync(packagesDirectory)
    .map(entry => {
      const match = entry.match(expression);
      if (!match) return null;
      const version = parseSemver(match[1]);
      return version && satisfiesRange(version, range) ? { entry, version } : null;
    })
    .filter(Boolean)
    .sort((left, right) => compareSemver(right.version, left.version));
  return { directory, prefix, packageName, range, path: matches.length > 0 ? join(directory, matches[0].entry) : null };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSemver(raw) {
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareSemver(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const result = compareSemverIdentifier(left.prerelease[index], right.prerelease[index]);
    if (result !== 0) return result;
  }
  return 0;
}

function compareSemverIdentifier(left, right) {
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  const leftNumber = /^\d+$/.test(left) ? Number.parseInt(left, 10) : null;
  const rightNumber = /^\d+$/.test(right) ? Number.parseInt(right, 10) : null;
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

function satisfiesRange(version, range) {
  if (!range) return true;
  return range.split(/\s+/).filter(Boolean).every(comparator => satisfiesComparator(version, comparator));
}

function satisfiesComparator(version, comparator) {
  const match = comparator.match(/^(>=|<=|>|<|=)?(.+)$/);
  if (!match) return false;
  const operator = match[1] ?? '=';
  const expected = parseSemver(match[2]);
  if (!expected) return false;
  const comparison = compareSemver(version, expected);
  if (operator === '>=') return comparison >= 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<') return comparison < 0;
  return comparison === 0;
}
