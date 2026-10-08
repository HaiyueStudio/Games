import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {emptyMap,createObject,serializeMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const map=emptyMap();map.id='retarget-walking';map.name='行走途中切换路线';map.objects=Array.from({length:10},(_,i)=>createObject(i===0?9:i===9?10:1,i===0?'start':i===9?'exit':`road-${i}`,[i,0,0]));for(let z=1;z<=3;z++)map.objects.push(createObject(1,`branch-${z}`,[4,0,z]));map.objects.push(createObject(1,'isolated',[8,0,4]));writeFileSync(resolve(output,'retarget-map.json'),serializeMap(map));
for(const editor of [true,false]){
 const result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:editor?{verify:1}:{verify:1,map:'../../artifacts/valley-editor/retarget-map.json'},timeoutMs:60000,visualCapture:{viewportWidth:editor?1536:1280,viewportHeight:editor?960:800},interact:async cdp=>{
  const expression=editor?'window.__valleyEditor?.snapshot()':'window.__valleyMapPlayer?.snapshot()';
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(expression),state=s=>editor?s.runtime:s,pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(test,label){for(let i=0;i<240;i++){const s=await snapshot();if(test(s))return s;await pause(50);}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function point(x,y){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});await pause(60);}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  async function target(id){const s=await snapshot(),p=s.targets[id],c=await evaluate("(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y}})()");await point(c.x+p[0],c.y+p[1]);}
  await wait(s=>!!s?.map,'ready');if(editor){await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(serializeMap(map))}`);await click('#apply-json');await click('#play');}await wait(s=>s.model==='loaded','traveler');
  await evaluate(`window.__motionFrames=[];window.__recordMotion=true;const record=()=>{const s=${expression},r=${editor?'s.runtime':'s'};if(r)window.__motionFrames.push({time:performance.now(),point:r.position,up:r.up,walking:r.walking});if(window.__recordMotion)requestAnimationFrame(record);};requestAnimationFrame(record)`);
  await target('road-8');let s=await wait(s=>state(s).walking&&state(s).position[0]>.5,'start moving');let x=state(s).position[0];await target('start');s=await wait(s=>state(s).position[0]<x-.06,'reverse before reaching old goal');x=state(s).position[0];await target('road-8');await wait(s=>state(s).position[0]>x+.06,'redirect forward again before returning');
  await wait(s=>state(s).position[0]>4.12,'past the junction');await target('branch-3');s=await wait(s=>!state(s).walking&&state(s).at.objectId==='branch-3','turn onto the branch');assert.deepEqual(state(s).position,[4,0,3]);assert.equal(state(s).completed,false);
  await target('start');await wait(s=>state(s).walking&&state(s).position[2]<2.5,'return from branch');await target('isolated');assert.equal(state(await snapshot()).walking,true,'unreachable click must not cancel the valid route');
  if(editor)await target('exit');else await point(1196,742);s=await wait(s=>state(s).completed,'new exit goal replaces the active return route');assert.deepEqual(state(s).position,[9,0,0]);assert.deepEqual(s.errors,[]);
  const frames=await evaluate('window.__recordMotion=false;window.__motionFrames');for(let i=1;i<frames.length;i++){const a=frames[i-1].point,b=frames[i].point;assert.ok(Math.hypot(...a.map((v,j)=>v-b[j]))<.27,'no waypoint teleport');assert.ok(Math.abs(b[2])<1e-6||Math.abs(b[0]-4)<1e-6,'no diagonal shortcut across the corner');}writeFileSync(resolve(output,editor?'retarget-editor-frames.json':'retarget-player-frames.json'),JSON.stringify(frames,null,2));
 }});
 writeFileSync(resolve(output,editor?'retarget-editor.png':'retarget-player.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;writeFileSync(resolve(output,editor?'retarget-editor-browser.json':'retarget-player-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({surface:editor?'editor':'game',status:result.status,checks:['mid-walk reverse and forward clicks','branch without corner cutting','unreachable target preserves current movement','active return route redirected to exit with HUD or scene click','continuous rendered foot positions']}));
}
