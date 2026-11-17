import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {runChromeWebGpuFixture} from '../../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {runRollupOnce} from '../../../scripts/shared-rollup-runner.mjs';
import {atomicJson} from './offline-inputs.mjs';
import {readOfflineResult} from './offline-transfer.mjs';
export const game=resolve(import.meta.dirname,'..'),root=resolve(game,'../..'),hash=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(readFileSync(p));
export const write=atomicJson;
export function assetURL(path){const name=relative(root,resolve(path));assert.ok(name&&!name.startsWith('..'));return '/'+name.split('\\').join('/');}
function sourceFiles(){
  const list=['assets/mcr.wasm','model-service/models.lock.json','ai/tfjs/provenance.json','ai/tfjs.worker.js','api/agents.ts','api/tournament.ts'];
  const walk=dir=>{for(const f of readdirSync(resolve(game,dir),{withFileTypes:true})){const name=dir+'/'+f.name;if(f.isDirectory())walk(name);else if(/\.(?:ts|mjs|py)$/.test(f.name))list.push(name)}};walk('rules');walk('ai');walk('benchmarks');
  for(const name of ['offline-runner.mjs','offline-transfer.mjs','offline-inputs.mjs','offline-models.ts','offline-inference.ts','adaptive-values.ts','offline.worker.ts','offline.worker.js','offline-client.mjs','offline.html','rollup.offline.config.mjs','tsconfig.offline.json','ablate-values.mjs','adaptive-value-data.mjs','joint-data.mjs','league-generation.mjs','league-schedule.mjs','statistics.mjs'])list.push('benchmarks/'+name);
  return [...new Set(list)].sort();
}
/** A local offline harness: live game entries do not import this module or its teacher assets. */
export async function runOffline(output,assets,interact){
  mkdirSync(output,{recursive:true});await runRollupOnce({cwd:root,config:'games/guobiao-mahjong/benchmarks/rollup.offline.config.mjs',expectedOutputs:['games/guobiao-mahjong/ai/tfjs.worker.js','games/guobiao-mahjong/benchmarks/offline.worker.js'],label:'Offline Mahjong tools',timeoutMs:60000});
  const fingerprints=Object.fromEntries(sourceFiles().map(p=>[p,hash(readFileSync(resolve(game,p)))]));
  // Archive before a long run. Resuming with changed sources is rejected by each run key.
  for(const [p,sha] of Object.entries(fingerprints)){const path=resolve(output,'source',p);mkdirSync(dirname(path),{recursive:true});if(existsSync(path))assert.equal(hash(readFileSync(path)),sha,'Existing offline archive differs; use a fresh output directory: '+p);else writeFileSync(path,readFileSync(resolve(game,p)));}
  let preparation,details;
  const browser=await runChromeWebGpuFixture({root,fixture:'games/guobiao-mahjong/benchmarks/offline.html',timeoutMs:3600000,crossOriginIsolation:false,visualCapture:{viewportWidth:800,viewportHeight:600},interact:async cdp=>{
    const errors=[];cdp.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description??e.exceptionDetails.text));
    const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value},delay=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<400&&!await evaluate('!!window.mahjongOffline');i++)await delay(50);assert.ok(await evaluate('!!window.mahjongOffline'));
    let printed=0;
    const call=async job=>{await evaluate(`window.__offlinePending={done:false};mahjongOffline.call(${JSON.stringify(job)}).then(result=>__offlinePending={done:true,result},error=>__offlinePending={done:true,error:String(error)});true`);
      for(let i=0;i<35000;i++){const state=await evaluate('({done:__offlinePending.done,error:__offlinePending.error,progress:mahjongOffline.progress.length})');if(state.progress>printed){const rows=await evaluate(`mahjongOffline.progress.slice(${printed})`);rows.forEach(r=>console.log(JSON.stringify(r)));printed=state.progress;}if(state.done){if(state.error)throw Error(state.error);return readOfflineResult(evaluate)}await delay(100)}throw Error('Offline job timeout');};
    preparation=await call({kind:'prepare',backend:'webgpu',assets});assert.equal(preparation.runtime.actualBackend,'webgpu');assert.equal(preparation.referencePositions,12);
    details=await interact({call,fingerprints,preparation});assert.deepEqual(errors,[]);await call({kind:'dispose'});
    await evaluate(`(()=>{const p=document.createElement('pre');p.id='result';p.hidden=true;p.dataset.status='passed';p.textContent=JSON.stringify({status:'passed',checks:['actual-webgpu','numpy-kd-reference','public-only-policy-input','strict-offline-models','worker-disposal']});document.body.append(p)})()`);
  }});
  assert.equal(browser.status,'passed');for(const [p,sha] of Object.entries(fingerprints))assert.equal(hash(readFileSync(resolve(game,p))),sha,'Offline sources changed during run: '+p);
  return {details,fingerprints,preparation,browser};
}
