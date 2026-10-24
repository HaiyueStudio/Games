import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.artifacts/icosahedron-minesweeper');
const asset = 'games/icosahedron-minesweeper/assets/titanium-albedo.png';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function verifyRotationPixels(cdp) {
  const evaluate = async expression => {
    const response = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? 'Pixel probe failed');
    return response.result?.result?.value;
  };
  for (let i = 0; i < 240; i++) {
    const state = await evaluate(`({ status: document.querySelector('#result').dataset.status, ready: Boolean(window.__minesRenderingProbe) })`);
    if (state.status === 'failed') throw new Error(await evaluate(`document.querySelector('#result').textContent`));
    if (state.ready) break;
    if (i === 239) throw new Error('Rotation pixel fixture did not become ready');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const sample = async offset => {
    await evaluate(`(async () => { window.__minesRenderingProbe.orbit(${offset}); for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); })()`);
    const points = await evaluate(`window.__minesRenderingProbe.samples()`);
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    return evaluate(`(async () => {
      const image = new Image(); image.src = 'data:image/png;base64,${shot.result.data}'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return Object.fromEntries(${JSON.stringify(points)}.map(p => {
        const data = context.getImageData(Math.round(p.x)-1, Math.round(p.y)-1, 3, 3).data, rgb = [0,0,0];
        for(let i=0;i<data.length;i+=4) for(let c=0;c<3;c++) rgb[c]+=data[i+c]/9;
        return [p.id, rgb];
      }));
    })()`);
  };
  const delta = (a, b) => Object.entries(a).flatMap(([id, rgb]) => b[id] ? rgb.map((v, i) => Math.abs(v - b[id][i])) : []);
  const initial = await sample(0);
  let previous = await sample(-1), maxStep = 0, comparisons = 0;
  for (let i = -9; i <= 10; i++) {
    const current = await sample(i / 10), differences = delta(previous, current);
    maxStep = Math.max(maxStep, ...differences); comparisons += differences.length / 3;
    previous = current;
  }
  const restored = await sample(0), restoration = delta(initial, restored);
  assert.ok(comparisons > 50, `Insufficient front-facing cell samples: ${comparisons}`);
  assert.ok(maxStep < 36, `Sudden tile lighting/albedo jump during orbit: ${maxStep.toFixed(2)}`);
  assert.ok(restoration.length > 0 && Math.max(...restoration) < 3, 'Returning to the same view must reproduce tile lighting');
  return { frames: 23, cellComparisons: comparisons, maximumChannelStep: maxStep, maximumRestoredChannelError: Math.max(...restoration) };
}

mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
  let rotationPixels;
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/icosahedron-minesweeper/index.html', query: { verify: 1 }, timeoutMs: 60000,
    visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => { rotationPixels = await verifyRotationPixels(cdp); },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  assert.equal(result.checks.length, 24);
  result.rotationPixels = rotationPixels;
  result.checks.push('23 orbit frames have no abrupt cell lighting/albedo jumps', 'Returning to the original view reproduces the same tile lighting');
  const png = Buffer.from(result.visualCapture.pngBase64, 'base64');
  assert.ok(png.byteLength > 20000, 'Screenshot is unexpectedly empty');
  writeFileSync(resolve(output, `${name}.png`), png);
  delete result.visualCapture.pngBase64;
  result.provenance = {
    generatedAt: new Date().toISOString(), profile: name, viewport: [width, height],
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    fingerprints: Object.fromEntries([
      asset, 'games/icosahedron-minesweeper/app/bootstrap.ts', 'games/icosahedron-minesweeper/rendering/CellVisuals.ts',
      'games/icosahedron-minesweeper/verification/verifyMinesweeper.ts', 'games/icosahedron-minesweeper/bundle.js',
      'games/icosahedron-minesweeper/input/BoardGesture.ts', 'games/icosahedron-minesweeper/ui/MinesHud.ts',
      'games/icosahedron-minesweeper/assets/orbit-gui.png',
    ].map(path => [path, sha256(readFileSync(resolve(root, path)))])),
    screenshotSha256: sha256(png),
  };
  const fetched = result.httpProvenance.files.find(resource => resource.sourcePath === asset);
  assert.equal(fetched?.sha256, result.provenance.fingerprints[asset], 'Browser must fetch the exact generated texture');
  assert.equal(fetched?.byteLength, readFileSync(resolve(root, asset)).byteLength);
  const guiPath = 'games/icosahedron-minesweeper/assets/orbit-gui.png';
  assert.equal(result.httpProvenance.files.find(file => file.sourcePath === guiPath)?.sha256,
    result.provenance.fingerprints[guiPath], 'Browser must fetch the exact generated GUI atlas');
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`${name}: ${result.checks.length} WebGPU/pointer/material/flag/restore checks passed; ${resolve(output, `${name}.png`)}`);
}
