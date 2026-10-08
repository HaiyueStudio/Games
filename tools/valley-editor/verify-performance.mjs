import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {emptyMap,createObject,serializeMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const map=emptyMap();map.id='static-performance';map.name='静态路径合并验证';
for(let x=0;x<10;x++)for(let z=0;z<10;z++)map.objects.push(createObject(1,`road-${x}-${z}`,[x,0,z]));
map.objects.push(createObject(9,'start',[-1,0,0]),createObject(10,'exit',[10,0,9]));
const compact=serializeCompactMap(map),full=serializeMap(map);writeFileSync(resolve(output,'static-map.json'),compact);
const report={bytes:{formatted:Buffer.byteLength(full),minified:Buffer.byteLength(JSON.stringify(JSON.parse(full))),compact:Buffer.byteLength(compact)},runs:[]};
for(const editor of [true,false])for(const optimize of [false,true]){
 let run;const label=`static-${editor?'editor':'game'}-${optimize?'merged':'original'}`;
 const result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:editor?{verify:1,batch:optimize?1:0}:{verify:1,batch:optimize?1:0,map:'../../artifacts/valley-editor/static-map.json'},timeoutMs:90000,visualCapture:{viewportWidth:1280,viewportHeight:900},interact:async cdp=>{
  const expression=editor?'window.__valleyEditor?.snapshot()':'window.__valleyMapPlayer?.snapshot()';
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(expression),pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(test,label){for(let i=0;i<240;i++){const s=await snapshot();if(test(s))return s;await pause(50);}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function point(x,y){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});await pause(60);}
  async function click(selector){const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  await wait(s=>!!s?.map,'ready');
  if(editor){await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');await click('#fit');await click('#play');}
  let s=await wait(s=>s.model==='loaded'&&(!optimize||s.performance.state==='ready'),'compiled');
  if(optimize){assert.equal(s.performance.stats.sourceMeshes,100);assert.equal(s.performance.stats.sourceTriangles,1200);assert.equal(s.performance.stats.meshes,1);assert.equal(s.performance.stats.triangles,12);}
  await pause(600);const sync=(await snapshot()).performance.syncCount,frames=[];
  for(let i=0;i<16;i++){await pause(40);s=await snapshot();frames.push(s.diagnostics);}assert.equal(s.performance.syncCount,sync,'idle frames do not recalculate all object transforms');
  assert.deepEqual(s.errors,[]);run={surface:editor?'editor':'game',optimize,performance:s.performance,draws:frames.map(f=>f.counters.draws),cpuMs:frames.map(f=>f.cpuMs)};
  // Capture stationary identical views before animation/pointer changes for pixel comparison.
  const png=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,label+'.png'),Buffer.from(png.result.data,'base64'));
  const p=s.targets['road-0-0'],rect=await evaluate("(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y}})()");await point(rect.x+p[0],rect.y+p[1]);
  s=await wait(s=>{const r=editor?s.runtime:s;return r.at.objectId==='road-0-0'&&!r.walking;},'individual merged cube remains selectable and walkable');assert.deepEqual((editor?s.runtime:s).position,[0,0,0]);
  if(editor){await click('#play');s=await snapshot();assert.equal(s.performance.state,'off');assert.equal(s.playing,false);await click('#play');await click('#play');await pause(500);assert.equal((await snapshot()).performance.state,'off','pending results never replace editing meshes');}
 }});
 assert.equal(result.status,'passed');delete result.visualCapture.pngBase64;writeFileSync(resolve(output,label+'-browser.json'),JSON.stringify(result,null,2));report.runs.push(run);console.log(JSON.stringify({label,status:result.status,performance:run.performance,draws:run.draws}));
}
for(const surface of ['editor','game']){const before=report.runs.find(r=>r.surface===surface&&!r.optimize),after=report.runs.find(r=>r.surface===surface&&r.optimize);assert.ok(Math.max(...after.draws)<Math.min(...before.draws),'measured draws must decrease');}
writeFileSync(resolve(output,'static-performance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.bytes));
