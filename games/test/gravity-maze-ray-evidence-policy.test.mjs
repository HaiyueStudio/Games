import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const mainUrl = new URL('../gravity-maze/main.ts', import.meta.url);
const previewUrl = new URL('../gravity-maze/rayTracingPreview.ts', import.meta.url);

test('Gravity Maze freezes the source snapshot before one deterministic raster evidence frame', async () => {
  const [main, preview] = await Promise.all([
    readFile(mainUrl, 'utf8'),
    readFile(previewUrl, 'utf8'),
  ]);

  const switchIndex = main.indexOf('engine.switchScene(scene)');
  const evidenceIndex = main.indexOf('await module.startGravityMazeRayTracingPreview(rayContext)');
  assert.ok(switchIndex >= 0 && switchIndex < evidenceIndex);
  assert.match(main, /renderRasterEvidenceFrame: \(\) => renderSingleEvidenceFrame\(engine\)/u);
  assert.match(main, /if \(!rayTracingEvidence\) engine\.run\(\)/u);
  assert.match(main, /engine\.once\('after-update',[\s\S]*engine\.stop\(\);[\s\S]*resolve\(\);/u);
  assert.match(preview, /export async function startGravityMazeRayTracingPreview/u);
  assert.match(preview, /await renderCandidate\(\)/u);
  const extractIndex = preview.indexOf('rayScene.extractRayTracingScene(context.scene)');
  const rasterIndex = preview.indexOf('context.renderRasterEvidenceFrame()');
  const awaitRasterIndex = preview.indexOf('await rasterFrame');
  const publishIndex = preview.indexOf('publish(report)');
  assert.ok(extractIndex >= 0 && extractIndex < rasterIndex);
  assert.ok(rasterIndex < awaitRasterIndex && awaitRasterIndex < publishIndex);
});
