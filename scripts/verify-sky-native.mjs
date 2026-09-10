import { rollup } from 'rollup';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { haiyuePlugins } from '../config/rollup.shared.js';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root = resolve(import.meta.dirname, '..'); process.chdir(root);
const fixture = 'games/test/fixtures/sky-native';
const bundle = await rollup({ input: `${fixture}/main.ts`, plugins: haiyuePlugins({ declaration: false, tsconfig: `${fixture}/tsconfig.json` }) });
await bundle.write({ file: `${fixture}/bundle.js`, format: 'iife', inlineDynamicImports: true, sourcemap: true }); await bundle.close();
const evidence = resolve(root, '.artifacts/sky-native'); mkdirSync(evidence, { recursive: true });
const cases = [['wide',600,960,{}], ['standard',480,960,{}], ['narrow',360,840,{}], ['menu',430,932,{scene:'menu'}], ['pause',430,932,{scene:'pause'}], ['purple',430,932,{scene:'effects',fixture:'purple-laser'}], ['powerup',430,932,{scene:'effects',fixture:'powerup'}], ...['dreadnought','ion-seraph','void-mantis','star-carrier','helios-prism','iron-serpent'].map(id=>[id,430,932,{scene:`boss:${id}`}])];
for (const [name, width, height, query] of cases) {
  if (process.env.SKY_CASE && !String(name).match(process.env.SKY_CASE)) continue;
  const result = await runChromeWebGpuFixture({ root, fixture: `${fixture}/index.html`, query, timeoutMs: 60000, visualCapture: { viewportWidth: width, viewportHeight: height } });
  writeFileSync(resolve(evidence, `${name}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ name, status: result.status, checks: result.checks }));
}
