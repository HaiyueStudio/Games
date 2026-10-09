import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {createObject,emptyMap,serializeMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const map=emptyMap();map.id='twist-stops';map.name='五格扭转道路';const twist=createObject(6,'twist');twist.length=5;const exit=createObject(10,'exit',[3,-.5,.5]);exit.rotation=[90,0,0];map.objects=[createObject(9,'start',[-3,0,0]),twist,exit];writeFileSync(resolve(output,'twist-stops-map.json'),serializeMap(map));
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-5,`${a} != ${b}`),checks=[];
for(const editor of [true,false]){
 const name=editor?'editor':'player';
 const result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:{verify:1,...(editor?{}:{map:'../../artifacts/valley-editor/twist-stops-map.json'})},timeoutMs:100000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  const pause=(ms=60)=>new Promise(r=>setTimeout(r,ms));
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(`window.${editor?'__valleyEditor':'__valleyMapPlayer'}?.snapshot()`),runtime=s=>editor?s.runtime:s;
  async function wait(test,label){for(let i=0;i<260;i++){const s=await snapshot();if(test(s))return s;await pause();}throw new Error(label+': '+JSON.stringify(await snapshot()));}
  async function point(p){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x:p[0],y:p[1],button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);await pause();}
  const screen=(s,p)=>[p[0]+(s.canvas?.x??0),p[1]+(s.canvas?.y??0)];
  async function cell(n){const s=await snapshot(),p=s.twistTargets.twist[n];await point(screen(s,p.screen));return p;}
  async function target(id){const s=await snapshot();await point(screen(s,s.targets[id]));}
  async function capture(file,clip){const r=await cdp.call('Page.captureScreenshot',{format:'png',...(clip?{clip}:{})});if(file)writeFileSync(resolve(output,file),Buffer.from(r.result.data,'base64'));return r.result.data;}
  try{
   let s=await wait(s=>s?.model==='loaded','ready');
   if(editor){await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(serializeMap(map))}`);await click('#apply-json');await click('#fit');await click('#play');}
   s=await wait(s=>runtime(s)&&s.performance.state==='ready','static batching');assert.equal(s.twistTargets.twist.length,5);assert.equal(s.pathClick.visible,false);
   const p=screen(s,s.twistTargets.twist[4].screen),clip={x:Math.round(p[0])-5,y:Math.round(p[1])-5,width:10,height:10,scale:1},before=await capture(null,clip);
   await cell(4);s=await wait(s=>s.pathClick.visible&&s.pathClick.age>.08,'click glow');assert.equal(s.pathClick.index,s.twistTargets.twist[4].index);near(s.pathClick.position,s.twistTargets.twist[4].point);assert.notEqual(await capture(null,clip),before,'glow visibly changes target pixels');await capture(`twist-stops-${name}-glow.png`);
   // Screenshot capture may outlast a one-second effect; measure a fresh pulse without capture work.
   await cell(4);s=await wait(s=>s.pathClick.visible&&s.pathClick.age>.6,'pulse fading');assert.ok(s.pathClick.opacity<1);await cell(0);s=await snapshot();assert.equal(s.pathClick.index,s.twistTargets.twist[0].index);assert.ok(s.pathClick.age<.2,'a new click restarts the one-second pulse');
   let lastAge=0;for(let i=0;i<40;i++){s=await snapshot();if(!s.pathClick.visible)break;lastAge=s.pathClick.age;await pause(35);}assert.equal(s.pathClick.visible,false);assert.ok(lastAge>.85&&lastAge<1,'animation lives for one second');
   s=await wait(s=>!runtime(s).walking&&runtime(s).at.index===s.twistTargets.twist[0].index,'reverse to first cell');near(runtime(s).position,s.twistTargets.twist[0].point);
   for(const n of [1,3,2,4]){const chosen=await cell(n);s=await wait(s=>!runtime(s).walking&&runtime(s).at.objectId==='twist'&&runtime(s).at.index===chosen.index,`reach cell ${n+1}`);near(runtime(s).position,chosen.point);near(runtime(s).up,chosen.up);}
   await target('start');s=await wait(s=>!runtime(s).walking&&runtime(s).at.objectId==='start','return to start');
   await cell(4);await pause(100);assert.equal((await snapshot()).pathClick.visible,true);
   if(editor){await click('#play');s=await snapshot();assert.equal(s.pathClick.visible,false);await click('#play');}
   else {await point([1464,41]);await pause();s=await snapshot();assert.equal(s.pathClick.visible,false);assert.equal(s.at.objectId,'start');assert.equal(s.walking,false);}
   await target('exit');s=await wait(s=>runtime(s).completed,'exit');near(runtime(s).up,[0,0,1]);assert.deepEqual(s.errors,[]);await capture(`twist-stops-${name}-complete.png`);
   checks.push(`${name}: five physical click destinations, visible one-second glow with restart/fade, mid-walk reversal, return, reset cleanup, batching and exit`);
  }catch(error){await capture(`twist-stops-${name}-failure.png`);writeFileSync(resolve(output,`twist-stops-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw error;}
 }});
 if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;writeFileSync(resolve(output,`twist-stops-${name}.json`),JSON.stringify(result,null,2));assert.equal(result.status,'passed');
}
console.log(JSON.stringify({checks,output},null,2));
