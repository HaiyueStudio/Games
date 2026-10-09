import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {parseMap,serializeMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];let exported;
for(const editor of [true,false]){
 const name=editor?'editor':'player',result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:{verify:1,...(editor?{demo:'gates'}:{map:'../../artifacts/valley-editor/markers-gates-export.json'})},timeoutMs:120000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  const pause=(ms=90)=>new Promise(r=>setTimeout(r,ms));
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(`window.${editor?'__valleyEditor':'__valleyMapPlayer'}?.snapshot()`),runtime=s=>editor?s.runtime:s;
  async function wait(test,label){for(let i=0;i<200;i++){const s=await snapshot();if(test(s))return s;await pause();}throw new Error(label+': '+JSON.stringify(await snapshot()));}
  async function point(p,modifiers=0){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x:p[0],y:p[1],button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1,modifiers});await pause();}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  async function tab(label){const p=await evaluate(`(()=>{const e=[...document.querySelector('#catalog-tabs').shadowRoot.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  async function select(id){const p=await evaluate(`(()=>{const tree=document.querySelector('#object-list');tree.reveal(${JSON.stringify(id)});const e=tree.shadowRoot.querySelector('[data-id="'+${JSON.stringify(id)}+'"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width*.6,r.y+r.height/2]})()`);await point(p);}
  async function input(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'nearest'});e.focus();e.select()})()`);await cdp.call('Input.insertText',{text:value});for(const type of ['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await pause();}
  async function choose(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)}).shadowRoot.querySelector('select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause();}
  const screen=(s,p)=>[p[0]+(s.canvas?.x??0),p[1]+(s.canvas?.y??0)];
  async function target(id,face){const s=await snapshot(),p=face===undefined?s.targets[id]:s.surfaces[id].find(f=>f.face===face).screen;await point(screen(s,p));}
  async function capture(file){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,file),Buffer.from(r.result.data,'base64'));}
  try{
   let s=await wait(s=>s?.model==='loaded','loaded');
   if(editor){
    assert.equal(s.map.objects.filter(o=>[9,10].includes(o.type)).length,0);assert.equal(s.markers.start.kind,'spawn');assert.equal(s.markers.exit.kind,'exit');const count=s.map.objects.length,original=s.json;
    await click('[data-type="9"]');await target('exit',0);s=await snapshot();assert.equal(s.map.objects.length,count);assert.equal(s.markers.start,undefined);assert.equal(s.markers.exit.kind,'spawn');assert.ok(s.map.objects.filter(o=>o.id==='start'||o.id==='exit').every(o=>o.type===1));
    await click('#undo');assert.equal((await snapshot()).json,original);await click('#redo');assert.equal((await snapshot()).markers.exit.kind,'spawn');await target('start',0);await click('[data-type="10"]');await target('exit',0);
    s=await snapshot();const marked=s.json;await point([s.canvas.x+35,s.canvas.y+s.canvas.height*.8]);assert.equal((await snapshot()).json,marked,'empty-space marker placement cannot create a road');
    await click('#select-tool');await select('start');await choose('marker-face','5');s=await snapshot();assert.deepEqual(s.markers.start.up,[0,0,1]);await click('#play');s=await snapshot();assert.deepEqual(s.runtime.up,[0,0,1]);await capture('markers-side-spawn.png');await click('#play');await choose('marker-face','0');
    await choose('path-marker','');assert.equal((await snapshot()).markers.start,undefined);await click('#undo');assert.equal((await snapshot()).markers.start.kind,'spawn');
    checks.push('marker tools paint existing faces without new objects, spawn moves uniquely, empty clicks do nothing, face selection/removal/undo changes the actual spawn');
    await select('twist');await input('param-twist','1080');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id==='twist').twist,1080);await click('#undo');assert.equal((await snapshot()).map.objects.find(o=>o.id==='twist').twist,720);await click('#redo');
    await tab('装饰物');assert.equal(await evaluate("document.querySelectorAll('#catalog-decorations [data-type]').length"),8);
    for(const type of [18,19]){await click(`[data-type="${type}"]`);await target('start',0);s=await snapshot();const placed=s.map.objects.at(-1);assert.equal(s.map.objects.length,count+1);assert.equal(placed.type,type);assert.deepEqual(placed.position,[-3,0,0]);await click('#undo');}
    await click('#select-tool');await select('arch');await input('color-surface','#e8c9ba');await input('color-hub','#aa7896');await input('color-base','#ab8e8c');await input('param-rise','2');await select('square');await input('color-surface','#99bbbd');await input('color-hub','#5e9298');await input('rotation-1','90');assert.equal(await evaluate("document.querySelector('#param-width').shadowRoot.querySelector('input').validity.valid"),true,'default door depth is a valid editor value');await click('#fit');await click('#grid-tool');await capture('markers-gates-editor.png');
    s=await snapshot();exported=parseMap(s.map);const compact=serializeCompactMap(exported);assert.equal(serializeMap(parseMap(JSON.parse(compact))),s.json);writeFileSync(resolve(output,'markers-gates-export.json'),compact);
    await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');assert.equal((await snapshot()).json,serializeMap(exported));checks.push('1080-degree edit supports undo/redo; both gate tools attach to the road top; size, per-part color and compact import preserve the map');
    await click('#play');
   }else assert.equal(serializeMap(s.map),serializeMap(exported));
   s=await wait(s=>s.performance.state==='ready','static road batches');assert.equal(s.markers.start.kind,'spawn');assert.equal(s.markers.exit.kind,'exit');assert.ok(s.performance.stats.meshes<s.performance.stats.sourceMeshes);
   // Gates are decoration: clicking their center hole still reaches the marked road below.
   await target('exit');await wait(s=>runtime(s).walking,'walking to exit');let upsideDown=false;for(let i=0;i<200;i++){s=await snapshot();upsideDown ||= runtime(s).up[1]<-.7;if(runtime(s).completed)break;await pause(35);}assert.ok(upsideDown,'the traveler follows all the turns');assert.equal(runtime(s).completed,true);assert.equal(runtime(s).at.objectId,'exit');assert.ok(runtime(s).up[1]>.999);assert.deepEqual(s.errors,[]);await capture(`markers-gates-${name}-complete.png`);checks.push(`${name}: markers stay visible after static batching, 1080-degree travel reaches the marked ordinary road and gates add no route nodes`);
  }catch(error){await capture(`markers-gates-${name}-failure.png`);writeFileSync(resolve(output,`markers-gates-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw error;}
 }});if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;assert.equal(result.status,'passed');writeFileSync(resolve(output,`markers-gates-${name}.json`),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({checks,output},null,2));
