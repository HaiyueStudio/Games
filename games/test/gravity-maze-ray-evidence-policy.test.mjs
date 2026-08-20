import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const mainUrl = new URL('../gravity-maze/main.ts', import.meta.url);
const previewUrl = new URL('../gravity-maze/rayTracingPreview.ts', import.meta.url);

test('Gravity Maze freezes ray evidence before the physics render loop starts', async () => {
  const [main, preview] = await Promise.all([
    readFile(mainUrl, 'utf8'),
    readFile(previewUrl, 'utf8'),
  ]);

  const switchIndex = main.indexOf('engine.switchScene(scene)');
  const evidenceIndex = main.indexOf('await module.startGravityMazeRayTracingPreview(rayContext)');
  const runIndex = main.indexOf('engine.run()');
  assert.ok(switchIndex >= 0 && switchIndex < evidenceIndex);
  assert.ok(evidenceIndex < runIndex);
  assert.match(preview, /export async function startGravityMazeRayTracingPreview/u);
  assert.match(preview, /await renderCandidate\(\)/u);
});
