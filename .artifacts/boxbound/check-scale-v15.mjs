import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { runChromeWebGpuFixture } from '/Users/qingque/Desktop/HaiyueStudio/Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = '/Users/qingque/Desktop/HaiyueStudio/Games';
const output = resolve(root, '.artifacts/boxbound');
mkdirSync(output, { recursive: true });
for (const [view, width, height] of [
  ['outer-context', 1440, 1000],
  ['outer-context', 390, 844],
  ['parabox-nested', 1440, 1000],
  ['box-entry', 1440, 1000],
  ['box-exit', 1440, 1000],
  ['completion-return', 1440, 1000],
]) {
  const result = await runChromeWebGpuFixture({
    root,
    fixture: 'games/boxbound/index.html',
    query: { verify: 1, view },
    timeoutMs: 90000,
    visualCapture: {
      viewportWidth: width,
      viewportHeight: height,
      sampleWidth: 32,
      sampleHeight: 24,
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(
    result.cases.length,
    view === 'completion-return' ? 38
      : view === 'completion-outro' ? 35
      : view === 'outer-context' ? 36
      : view.startsWith('parabox-')
      ? 38
      : view === 'gate-recoil'
      ? 45
      : view === 'decorations'
      ? 35
      : ['undo-step', 'undo-box', 'outer-wall'].includes(view)
      ? 37
      : view.startsWith('pressure-')
        ? 38
        : view.startsWith('box-')
          ? 40
          : ['colors', 'transition', 'jump', 'climb', 'descent'].includes(view)
            ? 30
            : 29,
  );
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  const png = Buffer.from(result.visualCapture.pngBase64, 'base64');
  assert.ok(png.length > 15000, 'Blank screenshot');
  const name = `scale-v15-${view}-${width}`;
  writeFileSync(resolve(output, `${name}.png`), png);
  delete result.visualCapture.pngBase64;
  result.bundleSha256 = createHash('sha256')
    .update(readFileSync(resolve(root, 'games/boxbound/bundle.js')))
    .digest('hex');
  result.generatedAt = new Date().toISOString();
  writeFileSync(
    resolve(output, `${name}.json`),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    `${name}: keyboard, world entry, save/continue, exit, undo, GPU and screenshot passed`,
  );
}
