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
const cases = [...Array.from({length:7},(_,i)=>['space-'+(i+1),430,932,{scene:'space',theme:String(i)}]), ['space-transition',430,932,{scene:'space',theme:'0',next:'1',fade:'4500'}], ['space-transition-end',430,932,{scene:'space',theme:'0',next:'1',fade:'9000'}], ['space-wrap-before',430,932,{scene:'space',age:String(680/7*1000-1)}], ['space-wrap-after',430,932,{scene:'space',age:String(680/7*1000+1)}], ['space-wide',600,960,{scene:'space',theme:'3'}], ['space-narrow',280,900,{scene:'space',theme:'4',playerX:'456'}], ['twins-live',430,932,{scene:'boss:twin-red'}], ...['twins-rules','twins-down','bubble-blast','fission'].map(scene=>[scene,430,932,{scene}]), ...['zh','en','ja'].map(lang=>['twins-menu-'+lang,360,840,{scene:'menu',mission:'7',lang}]), ['twins-narrow',280,900,{scene:'twins-down',lang:'ja'}], ['balance',430,932,{scene:'balance'}],['hud-full',430,932,{scene:'hud'}],['hud-low',360,840,{scene:'hud',health:'25',lives:'1',boss:'dreadnought'}],['hud-zero',430,932,{scene:'hud',health:'0',lives:'0',boss:'helios-prism'}],['hud-ja',280,900,{scene:'hud',health:'50',lives:'2',boss:'star-carrier',lang:'ja'}], ...['zh','en','ja'].map(lang=>['home-'+lang,360,840,{scene:'home',lang}]), ...['zh','en','ja'].flatMap(lang=>[['options-'+lang,360,840,{scene:'options',lang}],['menu-'+lang,360,840,{scene:'menu',lang}],['pause-'+lang,360,840,{scene:'pause',lang}]]), ...['boss-explosion','elite','red-fire','blue-fire'].map(scene=>[scene,430,932,{scene}]), ['wide',600,960,{}], ['standard',480,960,{}], ['narrow',360,840,{}], ['menu',430,932,{scene:'menu'}], ['pause',430,932,{scene:'pause'}], ['purple',430,932,{scene:'effects',fixture:'purple-laser'}], ['powerup',430,932,{scene:'effects',fixture:'powerup'}], ...['dreadnought','ion-seraph','void-mantis','star-carrier','helios-prism','iron-serpent'].map(id=>[id,430,932,{scene:`boss:${id}`}])];
for (const [name, width, height, query] of cases) {
  if (process.env.SKY_CASE && !String(name).match(process.env.SKY_CASE)) continue;
  const result = await runChromeWebGpuFixture({ root, fixture: `${fixture}/index.html`, query, timeoutMs: 60000, visualCapture: { viewportWidth: width, viewportHeight: height } });
  writeFileSync(resolve(evidence, `${name}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(evidence, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ name, status: result.status, checks: result.checks }));
}
