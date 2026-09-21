import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '.artifacts/boxbound');
mkdirSync(output, { recursive: true });
for (const [view, width, height] of [
  ['exit-hub', 1440, 1000],
  ['exit-chapter', 1440, 1000],
  ['exit-chapter', 390, 844],
  ['completion-return', 1440, 1000],
  ['completion-outro', 1440, 1000],
  ['outer-context', 1440, 1000],
  ['outer-context', 390, 844],
  ['parabox-hub', 1440, 1000],
  ['parabox-hub', 390, 844],
  ['parabox-intro', 1440, 1000],
  ['parabox-chapter', 1440, 1000],
  ['parabox-chapter', 390, 844],
  ['parabox-zoom', 1440, 1000],
  ['parabox-nested', 1440, 1000],
  ['parabox-recursive', 1440, 1000],
  ['gate-recoil', 1440, 1000],
  ['undo-step', 1440, 1000],
  ['undo-box', 1440, 1000],
  ['outer-wall', 1440, 1000],
  ['pressure-open', 1440, 1000],
  ['pressure-closed', 1440, 1000],
  ['actor-entry', 1440, 1000],
  ['actor-exit', 1440, 1000],
  ['box-identity', 1440, 1000],
  ['box-entry', 1440, 1000],
  ['box-exit', 1440, 1000],
  ['box-outside', 1440, 1000],
  ['home', 1440, 1000],
  ['world', 1440, 1000],
  ['decorations', 1440, 1000],
  ['level', 1440, 1000],
  ['level', 390, 844],
  ['colors', 1440, 1000],
  ['celebration', 1440, 1000],
  ['transition', 1440, 1000],
  ['jump', 1440, 1000],
  ['climb', 1440, 1000],
  ['descent', 1440, 1000],
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
    view.startsWith('exit-') ? 41
      : view.startsWith('actor-') ? 36
      : view === 'box-identity' ? 45
      : view === 'completion-return' ? 38
      : view === 'completion-outro' ? 35
      : view === 'outer-context' ? 36
      : ['parabox-nested','parabox-recursive'].includes(view) ? 43
      : view.startsWith('parabox-')
      ? 42
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
  const name = `${view}-${width}`;
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
