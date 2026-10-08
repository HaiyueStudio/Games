import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'split'},timeoutMs:60000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate('window.__valleyEditor?.snapshot()');
  async function wait(test,label){const start=Date.now();while(Date.now()-start<15000){const s=await snapshot();if(test(s))return s;await new Promise(r=>setTimeout(r,60));}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function point(x,y){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});await new Promise(r=>setTimeout(r,100));}
  async function click(selector){const p=await evaluate(`(()=>{const selector=${JSON.stringify(selector)},id=selector.startsWith('[data-object=')?selector.split('"')[1]:null,tree=document.querySelector('#object-list');if(id)tree.reveal(id);const e=id?tree.shadowRoot.querySelector('[data-id="'+id+'"]'):document.querySelector(selector);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  async function fill(selector,text){await click(selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await cdp.call('Input.insertText',{text});await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await new Promise(r=>setTimeout(r,120));}
  async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
  async function target(id){const s=await snapshot(),p=s.targets[id];await point(s.canvas.x+p[0],s.canvas.y+p[1]);}
  let s=await wait(s=>s?.map,'ready');assert.equal(s.map.id,'split-cube');assert.equal(s.map.objects.filter(o=>o.type===5).length,2);await click('[data-object="half-b"]');await capture('split-aligned.png');
  const alongX=s.targets.approach.map((v,i)=>v-s.targets.start[i]);
  for(const [id,deltas] of [['half-a',[[-1/3,5/3],[1/3,1/3],[-1/3,1]]],['half-b',[[-2/3,4/3],[-1/3,-1/3],[-2/3,0]]]]){
    await click(`[data-object="${id}"]`);const before=await snapshot(),position=before.map.objects.find(o=>o.id===id).position;
    for(let axis=0;axis<3;axis++){
      await fill(`#rotation-${axis}`,'90');s=await snapshot();assert.deepEqual(s.map.objects.find(o=>o.id===id).position,position);
      const expected=before.targets[id].map((v,i)=>v+deltas[axis][i]*alongX[i]);
      assert.ok(Math.hypot(...s.targets[id].map((v,i)=>v-expected[i]))<.01,`${id} axis ${axis} must rotate within the original cube`);
      if(id==='half-a')await capture(`split-rotation-${['x','y','z'][axis]}.png`);
      await click('#undo');s=await snapshot();assert.deepEqual(s.targets[id],before.targets[id]);
    }
  }
  checks.push('A/B prism X/Y/Z rotations stay centered on their containing cube; undo restores the original location');
  await click('[data-object="half-b"]');await fill('#position-0','6');await capture('split-separated.png');
  await click('#play');await wait(s=>s.model==='loaded','traveler');await target('exit');s=await snapshot();assert.equal(s.runtime.walking,false);checks.push('moving one half away breaks the diagonal connection');
  await click('#play');await click('#undo');await click('#play');await target('exit');s=await wait(s=>s.runtime.completed,'cross diagonal seam');assert.deepEqual(s.runtime.position,[5,3,3]);await capture('split-complete.png');checks.push('aligned A/B halves let the traveler cross between different world depths');
  await click('#play');await click('#new');await click('[data-type="1"]');s=await snapshot();await point(s.canvas.x+s.canvas.width/2,s.canvas.y+s.canvas.height/2);s=await snapshot();assert.deepEqual([s.map.objects[0].length,s.map.objects[0].width,s.map.objects[0].thickness],[1,1,1]);
  await fill('#split-depth','3');await click('#split-cube');s=await snapshot();assert.equal(s.map.objects.length,2);assert.deepEqual(s.map.objects.map(o=>o.prismHalf),['a','b']);assert.deepEqual(s.map.objects[1].position,s.map.objects[0].position.map(v=>v+3));assert.deepEqual(s.map.opticalLinks.map(l=>[l.aEnd,l.bEnd]),[[4,4]]);
  await click('#undo');s=await snapshot();assert.equal(s.map.objects.length,1);assert.equal(s.map.objects[0].type,1);await click('#redo');s=await snapshot();assert.equal(s.map.objects.length,2);checks.push('one-click unit cube split, undo and redo operate through Editor history');
  await click('#json');const json=await evaluate('document.querySelector("#json-text").value');assert.equal(JSON.parse(json).objects[1].prismHalf,'b');writeFileSync(resolve(output,'split-export.json'),json);await click('#apply-json');checks.push('exported JSON retains half identity, separate positions and diagonal ports');
  await click('#demo-split');s=await snapshot();assert.deepEqual(s.errors,[]);await evaluate(`document.querySelector('#result').textContent=JSON.stringify({status:'passed',checks:${JSON.stringify(checks)}})`);
}});
writeFileSync(resolve(output,'split-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks,output},null,2));
