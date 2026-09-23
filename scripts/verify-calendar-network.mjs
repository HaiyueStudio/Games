import { rollup } from 'rollup';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { haiyuePlugins } from '../config/rollup.shared.js';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = resolve(import.meta.dirname, '..');process.chdir(root);
const skins = process.argv.includes('--skins');
const fixture = `games/test/fixtures/calendar-${skins ? 'skins' : 'network'}`;
const bundle = await rollup({ input: `${fixture}/main.ts`, plugins: haiyuePlugins({ declaration: false, tsconfig: `${fixture}/tsconfig.json` }) });
try { await bundle.write({ file: `${fixture}/bundle.js`, format: 'iife', inlineDynamicImports: true, sourcemap: true }); }
finally { await bundle.close(); }
const output = resolve(root, `.artifacts/calendar-${skins ? 'skins' : 'network'}`);mkdirSync(output, { recursive: true });
const cases = skins ? [['white-settings','zh'],['blue-settings','fr'],['purple-settings','ja'],['white-board','zh'],['blue-board','zh'],['purple-board','zh'],['purple-history','zh'],['purple-reward','de'],['purple-purchase','zh']] : [['startup','zh'],['purchase','zh'],['ad','de'],['privacy','ja']];
for (const [mode, language] of cases) {
  const result = await runChromeWebGpuFixture({ root, fixture: `${fixture}/index.html`, query: { mode, language }, timeoutMs: 60000,
    visualCapture: { viewportWidth: 932, viewportHeight: 430 } });
  writeFileSync(resolve(output, `${mode}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));delete result.visualCapture.pngBase64;
  result.revision = execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim();
  result.dirty = execFileSync('git', ['status','--porcelain'], { encoding: 'utf8' }).trim();
  result.engineRevision = execFileSync('git', ['-C', '../Engine', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  result.rendererSha256 = createHash('sha256').update(readFileSync('../Engine/engine/src/renderer/Mesh3DRenderer.ts')).digest('hex');
  result.generatedAt = new Date().toISOString();
  result.bundleSha256 = createHash('sha256').update(readFileSync(`${fixture}/bundle.js`)).digest('hex');
  writeFileSync(resolve(output, `${mode}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, mode, screenshot: resolve(output, `${mode}.png`) }));
}
