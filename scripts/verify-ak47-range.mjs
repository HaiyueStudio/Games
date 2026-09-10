import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.artifacts/ak47-range/survival');
mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['portrait', 430, 860], ['landscape', 932, 430]]) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/ak47-range/index.html', query: { verify: 1 },
    timeoutMs: 120000, visualCapture: { viewportWidth: width, viewportHeight: height, sampleWidth: 32, sampleHeight: 24 } });
  assert.equal(result.status, 'passed'); assert.equal(result.checks.length, name === 'portrait' ? 3 : 15);
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  const png = Buffer.from(result.visualCapture.pngBase64, 'base64'); assert.ok(png.length > 15000);
  writeFileSync(resolve(output, `${name}.png`), png); delete result.visualCapture.pngBase64;
  result.bundleSha256 = createHash('sha256').update(readFileSync(resolve(root, 'games/ak47-range/bundle.js'))).digest('hex');
  result.assetProvenance = JSON.parse(readFileSync(resolve(root, 'games/ak47-range/assets/provenance.json'), 'utf8'));
  result.generatedAt = new Date().toISOString();
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`${name}: ${result.checks.length} gameplay/orientation checks passed; no unclassified GPU/browser errors`);
}
