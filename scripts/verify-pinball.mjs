import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = resolve(import.meta.dirname, '..');
const evidence = resolve(root, '.artifacts/pinball');
mkdirSync(evidence, { recursive: true });
for (const [name, width, height] of [['desktop', 1440, 1080], ['mobile', 390, 844]]) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/pinball/index.html', query: { verify: 1 }, timeoutMs: 45000, visualCapture: { viewportWidth: width, viewportHeight: height } });
  writeFileSync(resolve(evidence, `${name}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
  delete result.visualCapture.pngBase64;
  result.provenance = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), workload: 'pinball deterministic keyboard and physics integration',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    fingerprints: Object.fromEntries(['PinballGame.ts', 'rules.ts', 'scenery.ts', 'PocketSprings.ts', 'springRules.ts', 'input.ts', 'verification.ts', 'index.html', 'style.css', 'assets/notebook-paper.png', 'assets/star-bumper.png', 'assets/mushroom-bumper.png', 'assets/pinwheel.png'].map(file => [file, createHash('sha256').update(readFileSync(resolve(root, 'games/pinball', file))).digest('hex')])),
  };
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ profile: name, status: result.status, checks: result.checks, screenshot: resolve(evidence, `${name}.png`) }));
}
