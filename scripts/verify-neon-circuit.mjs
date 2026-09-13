import assert from 'node:assert/strict';
import { selectNeonScenes } from './neon-circuit-scenes.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.artifacts/neon-circuit-speed-v13');
mkdirSync(output, { recursive: true });
const sha = file => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
const modelSha = sha('games/neon-circuit/assets/wraith-raider.glb');
for (const [name, track, shot, width, height] of selectNeonScenes(process.argv.slice(2))) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/neon-circuit/index.html',
    query: { verify: 1, track, shot }, timeoutMs: 120_000,
    navigateAwayAfterResult: true,
    visualCapture: { viewportWidth: width, viewportHeight: height, sampleWidth: 32, sampleHeight: 24 },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.errors));
  assert.equal(result.trackId, track);
  assert.equal(result.modelStatus, 'loaded');
  const servedBundle = result.httpProvenance.files.find(file => file.sourcePath === 'games/neon-circuit/bundle.js');
  assert.equal(servedBundle?.sha256, sha('games/neon-circuit/bundle.js'), 'Bundle changed while the browser scenario was running');
  const servedModel = result.httpProvenance.files.find(file => file.sourcePath.endsWith('wraith-raider.glb'));
  assert.equal(servedModel?.sha256, modelSha, 'Browser must receive the real racer asset');
  assert.equal(servedModel?.byteLength, readFileSync(resolve(root, 'games/neon-circuit/assets/wraith-raider.glb')).length);
  assert.equal(result.checks.length, (width < 760 ? 49 : 46) + (track === 'rainbow-road' ? 1 : 0));
  assert.equal(result.gui.renderer, 'engine-gui');
  for (const asset of ['smoke-puff.png', 'boost-chevron.png', 'gui-button.png', 'gui-panel.png', 'gui-dial.png', 'gui-title.png', 'gui-timing.png',
    ...(track === 'rainbow-road' ? ['space-panorama.png', 'planet-azure.png', 'planet-amber.png', 'planet-violet.png', 'meteor-streak.png'] : [])]) {
    const served = result.httpProvenance.files.find(file => file.sourcePath.endsWith(asset));
    assert.equal(served?.sha256, sha(`games/neon-circuit/assets/${asset}`));
  }
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  const png = Buffer.from(result.visualCapture.pngBase64, 'base64');
  assert.ok(png.length > 20_000, 'Unexpectedly empty screenshot');
  writeFileSync(resolve(output, `${name}.png`), png);
  delete result.visualCapture.pngBase64;
  result.provenance = { generatedAt: new Date().toISOString(), modelSha256: modelSha,
    modelBytes: readFileSync(resolve(root, 'games/neon-circuit/assets/wraith-raider.glb')).length,
    bundleSha256: servedBundle.sha256, htmlSha256: sha('games/neon-circuit/index.html'),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
  };
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`${name}: ${result.checks.length} gameplay/UI checks, WebGPU and screenshot passed`);
}
