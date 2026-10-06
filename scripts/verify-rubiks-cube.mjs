import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.artifacts/rubiks-cube');
mkdirSync(output, { recursive: true });
for (const [name, width, height, kind] of [
  ['portrait', 390, 844, 'mirror'],
  ['landscape', 844, 390, '4'],
]) {
  const result = await runChromeWebGpuFixture({
    root,
    fixture: 'games/rubiks-cube/index.html',
    query: { verify: 1, kind },
    timeoutMs: 120000,
    visualCapture: { viewportWidth: width, viewportHeight: height, sampleWidth: 32, sampleHeight: 24 },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.cases.length, 4);
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  const png = Buffer.from(result.visualCapture.pngBase64, 'base64');
  assert.ok(png.length > 12000, 'Blank screenshot');
  writeFileSync(resolve(output, `${name}.png`), png);
  delete result.visualCapture.pngBase64;
  result.bundleSha256 = createHash('sha256')
    .update(readFileSync(resolve(root, 'games/rubiks-cube/bundle.js')))
    .digest('hex');
  result.generatedAt = new Date().toISOString();
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`${name}: 4 cube types, GUI turn / undo / history restore, WebGPU and screenshot passed`);
}
