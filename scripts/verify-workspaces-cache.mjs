import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadWorkspacePlan, cacheSummary } from './workspace-policy.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/workspaces-cache');
mkdirSync(output, { recursive: true });
const { plan } = loadWorkspacePlan(root), ids = ['2048', 'whale-maker'];
assert.ok(ids.every(id => plan.games.includes(id)), 'both pilot workspaces must be migrated');
const runs = [], fingerprint = file => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
const run = (task, stage, expected) => {
  const started = Date.now();
  const r = spawnSync(process.execPath, ['scripts/run-workspaces.mjs', task, ...ids], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`; writeFileSync(resolve(output, `${stage}.log`), log);
  if (r.error) throw r.error; assert.equal(r.status, 0, `${stage} failed; see ${output}`);
  const cache = cacheSummary(log); if (expected) assert.deepEqual(cache, expected, `${stage} cache behavior`);
  runs.push({ task, stage, milliseconds: Date.now() - started, ...cache }); console.log(`${stage}: ${cache.hits}/${cache.tasks} cache hits`);
};
// Warm the real tasks; do not synthesize cache entries or reuse stale output logs.
for (const task of ['build', 'typecheck', 'test']) run(task, `warm-${task}`);
for (const task of ['build', 'typecheck', 'test']) run(task, `repeat-${task}`, { hits: task === 'test' ? 2 : 3, tasks: task === 'test' ? 2 : 3 });
const files = ids.flatMap(id => [`games/${id}/bundle.js`, `games/${id}/bundle.js.map`]);
const original = new Map(files.map(file => [file, readFileSync(resolve(root, file))]));
const hashes = Object.fromEntries(files.map(file => [file, fingerprint(file)]));
try {
  for (const file of files) {
    const target = resolve(root, file); assert.equal(target, resolve(root, 'games', file.split('/')[1], file.split('/')[2]));
    unlinkSync(target);
  }
  run('build', 'restore-deleted-outputs', { hits: 3, tasks: 3 });
  for (const file of files) assert.equal(fingerprint(file), hashes[file], `${file} restored byte for byte`);
} finally {
  for (const [file, bytes] of original) if (!existsSync(resolve(root, file))) writeFileSync(resolve(root, file), bytes);
}
const source = resolve(root, 'games/2048/main.ts'), bytes = readFileSync(source);
try {
  writeFileSync(source, Buffer.concat([bytes, Buffer.from(`\n// Cache invalidation probe ${Date.now()}\n`)]));
  run('build', 'isolated-source-change', { hits: 2, tasks: 3 });
} finally { writeFileSync(source, bytes); }
run('build', 'restore-original-source', { hits: 3, tasks: 3 });
for (const file of files) assert.equal(fingerprint(file), hashes[file]);
const ownedTest = resolve(root, 'games/test/2048-rules.test.mjs'), testBytes = readFileSync(ownedTest);
try {
  writeFileSync(ownedTest, Buffer.concat([testBytes, Buffer.from(`\n// Owned test cache probe ${Date.now()}\n`)]));
  run('test', 'isolated-test-change', { hits: 1, tasks: 2 });
} finally { writeFileSync(ownedTest, testBytes); }
run('test', 'restore-original-test', { hits: 2, tasks: 2 });
const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(resolve(output, 'result.json'), JSON.stringify({ schemaVersion: 1, status: 'passed', generatedAt: new Date().toISOString(), phase: plan.phase, node: process.version,
  revision: git(['rev-parse', 'HEAD']), dirty: !!git(['status', '--porcelain']),
  inputs: Object.fromEntries(['config/workspaces.json', 'nx.json', 'package-lock.json', 'scripts/verify-workspaces-cache.mjs'].map(file => [file, fingerprint(file)])), outputs: hashes, runs }, null, 2));
console.log('Cache verification passed: replay, artifact restoration, isolated source and test invalidation.');
