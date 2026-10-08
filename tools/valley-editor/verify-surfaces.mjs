import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];
function browser(cdp,expression){
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;};
 const snapshot=()=>evaluate(expression),pause=()=>new Promise(r=>setTimeout(r,100));
 async function point(x,y){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});await pause();}
 async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
 async function wait(test,label){for(let i=0;i<300;i++){const s=await snapshot();if(test(s))return s;await pause();}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
 async function target(id,face){const s=await snapshot(),p=face===undefined?s.targets[id]:s.surfaces[id].find(f=>f.face===face).screen,r=await evaluate("(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y}})()");await point(r.x+p[0],r.y+p[1]);}
 async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
 return {evaluate,snapshot,pause,point,click,wait,target,capture};
}
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'seam'},timeoutMs:90000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
 const {evaluate,snapshot,click,wait,target,capture}=browser(cdp,'window.__valleyEditor?.snapshot()');
 let s=await wait(s=>s?.map?.id==='rotated-seam','user layout');assert.equal(s.map.objects.length,13);assert.deepEqual(s.map.opticalLinks,[]);assert.deepEqual(s.map.objects[10].rotation,[90,0,-90]);assert.deepEqual(s.map.objects[11].rotation,[-90,-90,0]);
 await click('#play');await wait(s=>s.model==='loaded','traveler');await target('object-10');await wait(s=>!s.runtime.walking&&s.runtime.at.objectId==='object-10','stand before the optical seam');await capture('user-seam-lighting.png');
 await evaluate(`window.__depthFrames=[];window.__depthTimer=setInterval(()=>{const s=window.__valleyEditor.snapshot();if(s.runtime)window.__depthFrames.push({logical:s.runtime.position,render:s.traveler.position,offset:s.traveler.depthOffset,screen:s.traveler.screen,logicalScreen:s.traveler.logicalScreen});},20)`);
 s=await snapshot();const farFace=s.surfaces['object-12'].find(f=>f.up[1]>.99).face;await target('object-12',farFace);await wait(s=>s.traveler.depthOffset>.5&&s.runtime.position[1]<1,'early silhouette protection');await capture('user-seam-protected.png');await wait(s=>!s.runtime.walking&&s.runtime.at.objectId==='object-12','stand on far half');
 await target('object-10');await wait(s=>!s.runtime.walking&&s.runtime.at.objectId==='object-10','walk back through seam');await capture('user-seam-return.png');
 const frames=await evaluate('clearInterval(window.__depthTimer);window.__depthFrames');assert.ok(frames.some(f=>f.offset>.5&&f.logical[1]<1),'draw depth advances before the logical foot crosses');for(const f of frames)assert.ok(Math.hypot(f.screen[0]-f.logicalScreen[0],f.screen[1]-f.logicalScreen[1])<.002,'depth correction preserves screen-space feet');writeFileSync(resolve(output,'seam-depth-frames.json'),JSON.stringify(frames,null,2));checks.push('traveler silhouette is protected before crossing and on the return trip; rendered feet stay at the exact logical screen position');
 await target('object-13');s=await wait(s=>s.runtime.completed,'user map exit');assert.deepEqual(s.runtime.position,[7,5,6]);assert.deepEqual(s.runtime.up,[0,1,0]);await capture('user-seam-complete.png');checks.push('the exact user layout with two rotated A halves and no explicit links reaches the exit');await click('#play');
 for(const [button,id,arc] of [['#demo-surfaces','six-surfaces',false],['#demo-arc','arc-surfaces',true]]){
  await click(button);s=await wait(s=>s.map.id===id,'side demo');if(arc)assert.equal(s.map.objects.find(o=>o.id==='connector').arcTwist,90);
  await click('#play');await target('wall-b',0);assert.equal((await snapshot()).runtime.walking,false,'clicking the disconnected top face must not select the side');
  await target('wall-b',5);s=await wait(s=>s.runtime.walking&&s.runtime.up[1]>.2&&s.runtime.up[1]<.8,'smoothly changing up direction');await capture(arc?'arc-bank-walking.png':'twist-side-walking.png');
  s=await wait(s=>!s.runtime.walking&&s.runtime.at.objectId==='wall-b','reach wall side');assert.ok(Math.abs(s.runtime.up[2]-1)<1e-8);assert.equal(s.runtime.at.index,s.surfaces['wall-b'].find(f=>f.face===5).index);assert.equal(s.traveler.depthOffset,0,'ordinary side paths do not receive optical depth correction');await capture(arc?'arc-wall-standing.png':'side-standing.png');
  await target('exit');await wait(s=>s.runtime.completed,'side exit');await click('#play');
 }
 checks.push('click targets retain the chosen cube face; both twists and banking arcs turn the traveler onto connected wall faces');
 await click('#json');const json=await evaluate('document.querySelector("#json-text").value');writeFileSync(resolve(output,'surfaces-export.json'),json);await click('#apply-json');assert.equal((await snapshot()).map.objects.find(o=>o.id==='connector').arcTwist,90);assert.deepEqual((await snapshot()).errors,[]);
}});
if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'surfaces-browser.json'),JSON.stringify(result,null,2));
const player=await runChromeWebGpuFixture({root,fixture:'games/valley-of-light/index.html',query:{verify:1,map:'../../artifacts/valley-editor/surfaces-export.json'},timeoutMs:60000,visualCapture:{viewportWidth:1280,viewportHeight:800},interact:async cdp=>{
 const {snapshot,wait,target,capture,point}=browser(cdp,'window.__valleyMapPlayer?.snapshot()');await wait(s=>s?.model==='loaded','exported arc map');await target('wall-b',5);let s=await wait(s=>!s.walking&&s.at.objectId==='wall-b','player wall');assert.ok(Math.abs(s.up[2]-1)<1e-8);await capture('player-wall-standing.png');await point(1196,742);s=await wait(s=>s.completed,'Engine GUI exit');assert.deepEqual(s.errors,[]);checks.push('exported multi-surface map loads in the standalone game; surface click and Engine GUI exit both work');
}});
if(player.visualCapture?.pngBase64)delete player.visualCapture.pngBase64;writeFileSync(resolve(output,'surfaces-player.json'),JSON.stringify(player,null,2));
const seamPlayer=await runChromeWebGpuFixture({root,fixture:'games/valley-of-light/index.html',query:{verify:1,map:'./maps/rotated-seam.json'},timeoutMs:60000,visualCapture:{viewportWidth:1280,viewportHeight:800},interact:async cdp=>{
 const {snapshot,wait,target,capture,point}=browser(cdp,'window.__valleyMapPlayer?.snapshot()');await wait(s=>s?.model==='loaded','standalone seam map');await target('object-10');const s=await wait(s=>!s.walking&&s.at.objectId==='object-10','stand before seam');assert.ok(s.traveler.depthOffset>.5);assert.equal(s.position[1],0);assert.ok(Math.hypot(s.traveler.screen[0]-s.traveler.logicalScreen[0],s.traveler.screen[1]-s.traveler.logicalScreen[1])<.002);await capture('player-seam-protected.png');await point(1196,742);await wait(s=>s.completed,'standalone seam exit');assert.deepEqual((await snapshot()).errors,[]);checks.push('standalone game protects the traveler before the same seam and completes through the Engine GUI');
}});
if(seamPlayer.visualCapture?.pngBase64)delete seamPlayer.visualCapture.pngBase64;writeFileSync(resolve(output,'seam-player.json'),JSON.stringify(seamPlayer,null,2));console.log(JSON.stringify({status:result.status,player:player.status,seamPlayer:seamPlayer.status,checks,output},null,2));
