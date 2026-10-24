import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'artifacts/game-host');mkdirSync(output,{recursive:true});
const cases=(process.env.GAME_HOST_CASE??'2048,fruit-ninja').split(','),records=[];
const inputs=['rollup.config.js','scripts/rollup-plugin-game-module.mjs','site/game-host.js',...readdirSync(resolve(root,'games/host')).filter(file=>file.endsWith('.ts')).map(file=>'games/host/'+file),'games/session/GameEngine.ts'];
for(const id of cases)inputs.push(...readdirSync(resolve(root,'games',id),{recursive:true}).filter(file=>/\.(?:ts|html|css|js)$/.test(file)).map(file=>'games/'+id+'/'+file));
const fingerprints=Object.fromEntries(inputs.map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')]));
const result=await runChromeWebGpuFixture({root,fixture:'games/test/fixtures/game-host/index.html',timeoutMs:240000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1040,viewportHeight:760},interact:async cdp=>{
  const evaluate=async expression=>{const result=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.result?.exceptionDetails)throw new Error(result.result.exceptionDetails.exception?.description??result.result.exceptionDetails.text);return result.result?.result?.value;};
  for(let attempt=0;attempt<100;attempt++){if(await evaluate('!!window.__host'))break;await new Promise(resolve=>setTimeout(resolve,100));}
  for(const id of cases)for(const mode of ['screen','texture']){
    await evaluate(`__host.mount(${JSON.stringify(id)},${JSON.stringify(mode)}).then(()=>true)`);
    const state=await evaluate('({id:__host.router.instance.id,state:__host.router.instance.engine.state,canvas:!!__host.router.instance.canvas,progress:__host.progress})');
    assert.equal(state.id,id);assert.equal(state.state,'ready');assert.equal(state.canvas,true);assert.ok(state.progress.some(progress=>progress.phase==='ready'));
    const texture=mode==='texture'?await evaluate('__host.texture()'):null;
    if(texture)assert.ok(texture.colors>20,`${id} actual RTT contains rendered game pixels, not only a clear color`);
    await evaluate('window.__lastEngine=__host.router.instance.engine;__host.dispose();true');
    assert.equal(await evaluate('__lastEngine.state'),'destroyed',`${id} releases its Engine on unmount`);
    assert.equal(await evaluate('document.querySelectorAll("iframe").length'),0);
    records.push({id,mode,texture,resources:state.progress.at(-1)});console.log(`${id} ${mode}: mounted, rendered, disposed`);
  }
  await evaluate(`document.querySelector('#result').dataset.status='passed';document.querySelector('#result').textContent=JSON.stringify({status:'passed'})`);
}});
writeFileSync(resolve(output,'modules.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,'modules.json'),JSON.stringify({...result,generatedAt:new Date().toISOString(),cases,records,fingerprints,revision:execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirtyWorkingTree:!!execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()},null,2));
