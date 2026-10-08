import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {parseMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
for(const editor of [true,false]){
 const label=editor?'straight-split-editor':'straight-split-game';let metrics;
 const result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:editor?{verify:1,demo:'split'}:{verify:1,map:'../../artifacts/valley-editor/straight-split-map.json'},timeoutMs:90000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  const expression=editor?'window.__valleyEditor?.snapshot()':'window.__valleyMapPlayer?.snapshot()';
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(expression),state=s=>editor?s.runtime:s,pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(test,label){for(let i=0;i<300;i++){const s=await snapshot();if(test(s))return s;await pause(50);}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function point(x,y){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});await pause(60);}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  async function selectStart(){const p=await evaluate(`(()=>{const tree=document.querySelector('#object-list');tree.reveal('start');const e=tree.shadowRoot.querySelector('[data-id="start"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  async function target(id){const s=await snapshot(),p=s.targets[id],c=await evaluate("(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y}})()");await point(c.x+p[0],c.y+p[1]);}
  let s=await wait(s=>!!s?.map,'ready');
  if(editor){
   await selectStart();assert.equal(await evaluate("!!document.querySelector('#split-cube')"),false,'spawn must not expose cube splitting');await evaluate("document.querySelector('#catalog-tabs').value='decorations'");await new Promise(r=>setTimeout(r,100));await click('[data-type="12"]');s=await snapshot();const p=s.corners.find(c=>c.pathId==='start'&&c.corner===0).screen;await point(s.canvas.x+p[0],s.canvas.y+p[1]);
   for(const c of [1,2,3]){await selectStart();await click(`#add-pillar-${c}`);}
   s=await snapshot();const pillars=s.map.objects.filter(o=>o.attachment?.pathId==='start');assert.equal(pillars.length,4);for(const pillar of pillars)assert.deepEqual(pillar.position,[[.1,0,.1],[-.1,0,.1],[-.1,0,-.1],[.1,0,-.1]][pillar.attachment.corner]);
   await click('#undo');assert.equal((await snapshot()).map.objects.filter(o=>o.attachment?.pathId==='start').length,3);await click('#redo');
   const compact=serializeCompactMap(parseMap(JSON.parse((await snapshot()).json)));writeFileSync(resolve(output,'straight-split-map.json'),compact);
   await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');await click('#select-tool');await click('#fit');await click('#play');
  }
  s=await wait(s=>s.model==='loaded'&&s.performance.state==='ready','compiled');assert.equal(s.map.objects.filter(o=>o.attachment?.pathId==='start').length,4);
  const start=s.targets.start,end=s.targets.beyond,dx=end[0]-start[0],dy=end[1]-start[1],lineLength=Math.hypot(dx,dy);
  await evaluate(`window.__straightFrames=[];window.__recordStraight=true;const record=()=>{const s=${expression},r=${editor?'s.runtime':'s'};if(r)window.__straightFrames.push({screen:s.traveler.screen,logicalScreen:s.traveler.logicalScreen,position:r.position,walking:r.walking});if(window.__recordStraight)requestAnimationFrame(record);};requestAnimationFrame(record)`);
  await target('beyond');await wait(s=>state(s).walking&&state(s).position[0]>-.4&&state(s).position[0]<.01,'walk through near triangle');
  const png=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,label+'.png'),Buffer.from(png.result.data,'base64'));
  await wait(s=>!state(s).walking&&state(s).at.objectId==='beyond','cross both halves');await target('start');await wait(s=>!state(s).walking&&state(s).at.objectId==='start','return through both halves');await target('exit');s=await wait(s=>state(s).completed,'exit');assert.deepEqual(s.errors,[]);
  const frames=await evaluate('window.__recordStraight=false;window.__straightFrames'),deviations=frames.filter(f=>f.walking).map(f=>Math.abs((f.screen[0]-start[0])*dy-(f.screen[1]-start[1])*dx)/lineLength);assert.ok(deviations.length>30);const maxDeviation=Math.max(...deviations);assert.ok(maxDeviation<.002,`projected straight line deviation ${maxDeviation}px`);
  assert.ok(frames.some(f=>f.position[1]>2.9)&&frames.some(f=>f.position[1]<.1));for(const f of frames)assert.ok(Math.hypot(f.screen[0]-f.logicalScreen[0],f.screen[1]-f.logicalScreen[1])<.002);
  metrics={frames:frames.length,maxDeviationPixels:maxDeviation,spawnPillars:4};writeFileSync(resolve(output,label+'-frames.json'),JSON.stringify(frames,null,2));
 }});
 assert.equal(result.status,'passed');delete result.visualCapture.pngBase64;writeFileSync(resolve(output,label+'-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({label,status:result.status,...metrics}));
}
