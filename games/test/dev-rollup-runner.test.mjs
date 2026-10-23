import test from 'node:test';
import assert from 'node:assert/strict';
import { runRollupOnce } from '../../scripts/shared-rollup-runner.mjs';

const quiet = { write() {}, warn() {}, error() {} };
const options = code => ({
  command: process.execPath, args: ['-e', code], expectedOutputs: ['games/test/bundle.js'],
  timeoutMs: 5_000, exitGraceMs: 150, terminateGraceMs: 250, killGraceMs: 250,
  stdout: quiet, stderr: quiet, logger: quiet,
});
const marker = "console.log('created games/test/bundle.js in 1ms');";
function assertClosed(pid) {
  assert.ok(pid > 0);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}

test('one-shot builds close their process before another build can start', async () => {
  const first = await runRollupOnce(options(marker));
  assert.equal(first.exitCode, 0); assertClosed(first.pid);
  const second = await runRollupOnce(options(marker));
  assertClosed(second.pid);
  assert.notEqual(first.pid, second.pid);
});

test('retained compiler handles are closed after a complete output marker', async () => {
  const result = await runRollupOnce(options(`${marker} setInterval(() => {}, 1000);`));
  assert.equal(result.lingeringHandles, true);
  assert.equal(result.markersComplete, true);
  assertClosed(result.pid);
});

test('compiler failures after output are not mistaken for successful builds', async () => {
  await assert.rejects(runRollupOnce(options(`${marker} process.exitCode = 2;`)), error => {
    assert.equal(error.kind, 'nonzero-exit'); assertClosed(error.result.pid); return true;
  });
});

test('abort closes the active child even before it produces output', async () => {
  const abort = new AbortController();
  const settings = options("console.log('started'); setInterval(() => {}, 1000);");
  settings.stdout = { write() { abort.abort(); } };
  await assert.rejects(runRollupOnce({ ...settings, signal: abort.signal }), error => {
    assert.equal(error.kind, 'aborted'); assertClosed(error.result.pid); return true;
  });
});

test('an already aborted signal never starts a compiler', async () => {
  await assert.rejects(runRollupOnce({ ...options(marker), signal: AbortSignal.abort() }), { name: 'AbortError' });
});

test('missing outputs time out and close the child instead of blocking the queue', async () => {
  await assert.rejects(runRollupOnce({ ...options('setInterval(() => {}, 1000);'), timeoutMs: 250 }), error => {
    assert.equal(error.kind, 'marker-timeout'); assertClosed(error.result.pid); return true;
  });
});
