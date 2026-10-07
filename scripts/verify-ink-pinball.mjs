import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = resolve(import.meta.dirname, '..');
const evidence = resolve(root, '.artifacts/ink-pinball');
mkdirSync(evidence, { recursive: true });
for (const [name, width, height, pose] of [['desktop', 1440, 1080], ['mobile', 390, 844], ['dragon-bite', 1440, 1080, 'dragon'], ['toad-jump', 1440, 1080, 'toad'], ['koi-leap', 1440, 1080, 'koi'], ['water-entry', 1440, 1080, 'water'], ['koi-landing', 1440, 1080, 'landing'], ['garden', 1440, 1080, 'garden'], ['toad-away', 1440, 1080, 'toad-away'], ['toad-return', 1440, 1080, 'toad-return']]) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/ink-pinball/index.html', query: { verify: 1, ...(pose ? { pose } : {}) }, timeoutMs: 90000, visualCapture: { viewportWidth: width, viewportHeight: height } });
  writeFileSync(resolve(evidence, `${name}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
  delete result.visualCapture.pngBase64;
  result.provenance = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), workload: 'ink pinball keyboard, physics, stable fluid and creature integration', pose: pose ?? 'dragon-spit',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    fingerprints: Object.fromEntries(['InkPinballGame.ts', 'InkEffects.ts', 'FluidInk.ts', 'fluidModel.ts', 'waterModel.ts', 'InkGarden.ts', 'gardenRules.ts', 'BrushScore.ts', 'LivingScene.ts', 'ToadSprings.ts', 'sceneRules.ts', 'toadRules.ts', 'verification.ts', 'index.html', 'style.css', 'assets/landscape-plate.png', 'assets/dragon.png', 'assets/toad.png', 'assets/koi.png', 'assets/brush.png', 'assets/spirit-orb.png', 'assets/lily-pad.png', 'assets/river-lotuses.png', 'assets/crane-poses.png', 'assets/brush-digits.png', 'assets/brush-digits.fnt.json', '../pinball/rules.ts', '../pinball/input.ts', '../pinball/springRules.ts'].map(file => [file, createHash('sha256').update(readFileSync(resolve(root, 'games/ink-pinball', file))).digest('hex')])),
  };
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ profile: name, status: result.status, checks: result.checks, screenshot: resolve(evidence, `${name}.png`) }));
}
