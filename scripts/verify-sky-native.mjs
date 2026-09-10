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
const cases = [['hud-full',430,932,{scene:'hud'}],['hud-low',360,840,{scene:'hud',health:'25',lives:'1',boss:'dreadnought'}],['hud-zero',430,932,{scene:'hud',health:'0',lives:'0',boss:'helios-prism'}],['hud-ja',280,900,{scene:'hud',health:'50',lives:'2',boss:'star-carrier',lang:'ja'}], ...['zh','en','ja'].map(lang=>['home-'+lang,360,840,{scene:'home',lang}]), ...['zh','en','ja'].flatMap(lang=>[['options-'+lang,360,840,{scene:'options',lang}],['menu-'+lang,360,840,{scene:'menu',lang}],['pause-'+lang,360,840,{scene:'pause',lang}]]), ...['boss-explosion','elite','red-fire','blue-fire'].map(scene=>[scene,430,932,{scene}]), ['wide',600,960,{}], ['standard',480,960,{}], ['narrow',360,840,{}], ['menu',430,932,{scene:'menu'}], ['pause',430,932,{scene:'pause'}], ['purple',430,932,{scene:'effects',fixture:'purple-laser'}], ['powerup',430,932,{scene:'effects',fixture:'powerup'}], ...['dreadnought','ion-seraph','void-mantis','star-carrier','helios-prism','iron-serpent'].map(id=>[id,430,932,{scene:`boss:${id}`}])];
for (const [name, width, height, query] of cases) {
  if (process.env.SKY_CASE && !String(name).match(process.env.SKY_CASE)) continue;
  const result = await runChromeWebGpuFixture({ root, fixture: `${fixture}/index.html`, query, timeoutMs: 60000, visualCapture: { viewportWidth: width, viewportHeight: height } });
  writeFileSync(resolve(evidence, `${name}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ name, status: result.status, checks: result.checks }));
}
