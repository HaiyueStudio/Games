import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { validateBoxboundPerformance } from './boxbound-performance-check.mjs';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const label = process.argv[2] ?? 'after';
assert.ok(['before', 'after'].includes(label));
const result = await runChromeWebGpuFixture({ root, fixture: 'games/boxbound/index.html', query: { verify: 1, view: 'performance' }, timeoutMs: 180000, visualCapture: { viewportWidth: 1440, viewportHeight: 1000, sampleWidth: 32, sampleHeight: 24 } });
assert.equal(result.status, 'passed');
assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
assert.deepEqual(result.errors, []);
const output = resolve(root, '.artifacts/boxbound');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, `performance-${label}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
delete result.visualCapture.pngBase64;
result.bundleSha256 = createHash('sha256').update(readFileSync(resolve(root, 'games/boxbound/bundle.js'))).digest('hex');
result.generatedAt = new Date().toISOString();
result.kind = 'local-browser-diagnostic';
let validationError;
try { result.cases = label === 'after' ? validateBoxboundPerformance(result.profile) : []; }
catch (error) { validationError = error; result.validationFailure = error.message; }
writeFileSync(resolve(output, `performance-${label}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ summary: result.profile.summary, samples: result.profile.samples.map(({ name, resources }) => ({ name, ...resources, gpuTypes: undefined })), teardown: result.profile.teardown.map(({ gpu, entities, parts, geometries, materials }) => ({ gpu, entities, parts, geometries, materials })) }, null, 2));

if (validationError) throw validationError;
