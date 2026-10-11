import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {parseMap,serializeMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];let exported;
for(const editor of [true,false]){
 const name=editor?'editor':'player',result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:{verify:1,...(editor?{demo:'portals'}:{map:'../../artifacts/valley-editor/portal-flow-export.json'})},timeoutMs:120000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
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
    assert.equal(s.portals.length,2);assert.equal(s.flows.length,2);
    await click('[data-type="20"]');await target('after-door',0);s=await snapshot();assert.equal(s.portals.length,3);assert.equal(s.map.objects.at(-1).portal.pathId,'after-door');await click('#undo');assert.equal((await snapshot()).portals.length,2);
    await click('#select-tool');await select('portal-a');await choose('portal-target','');assert.equal((await snapshot()).map.objects.find(o=>o.id==='portal-a').portal.targetId,null);await choose('portal-target','portal-b');await click('#portal-pair');
    await choose('portal-shape','square');assert.equal((await snapshot()).map.objects.find(o=>o.id==='portal-a').portal.shape,'square');await click('#undo');await input('color-spokes','#a8e5eb');
    await select('waterfall');await input('color-surface','#73b8c6');await input('param-rise','2.5');await input('water-speed','0');s=await snapshot();const frozen=s.flows.find(f=>f.id==='waterfall').firstStreak;await pause(300);assert.deepEqual((await snapshot()).flows.find(f=>f.id==='waterfall').firstStreak,frozen);await input('water-speed','0.8');
    await select('stream');assert.equal(await evaluate("[...document.querySelectorAll('#inspector hy-input[type=number]')].every(e=>e.shadowRoot.querySelector('input').validity.valid)"),true,'flow defaults are valid input values');await input('color-hub','#ccede5');await input('water-speed','0.5');s=await snapshot();const before=s.flows.map(f=>f.firstStreak);await pause(350);assert.notDeepEqual((await snapshot()).flows.map(f=>f.firstStreak),before);await click('#grid-tool');await click('#fit');await capture('portal-flow-editor.png');
    exported=parseMap((await snapshot()).map);const compact=serializeCompactMap(exported);writeFileSync(resolve(output,'portal-flow-export.json'),compact);await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');assert.equal((await snapshot()).json,serializeMap(exported));
    checks.push('editor: portal tool binds an existing face, undo restores the map, target/pair/shape/color edits work, water speed zero freezes streaks, compact import preserves all settings');await click('#play');
   }else assert.equal(serializeMap(s.map),serializeMap(exported));
   await wait(s=>s.performance.state==='ready','static compilation');
   async function door(id){const s=await snapshot();await point(screen(s,s.portals.find(p=>p.id===id).screen));}
   await door('portal-a');s=await wait(s=>runtime(s).portal?.phase==='entering','entering door');assert.ok(runtime(s).busy);await capture(`portal-flow-${name}-enter.png`);
   s=await wait(s=>!runtime(s).walking&&runtime(s).at.objectId==='door-road-b','emerged');assert.equal(runtime(s).completed,false);await pause(300);assert.equal(runtime(await snapshot()).at.objectId,'door-road-b');await capture(`portal-flow-${name}-arrived.png`);
   await door('portal-b');await wait(s=>!runtime(s).walking&&runtime(s).at.objectId==='door-road-a','returned');
   await target('exit');s=await wait(s=>runtime(s).completed,'auto route through door to exit');assert.equal(runtime(s).at.objectId,'exit');assert.deepEqual(s.errors,[]);assert.equal(s.flows.length,2);await capture(`portal-flow-${name}-complete.png`);checks.push(`${name}: actual gate clicks enter and emerge, no automatic bounce, reverse door returns, clicking unreachable courtyard routes through its door and completes`);
  }catch(error){await capture(`portal-flow-${name}-failure.png`);writeFileSync(resolve(output,`portal-flow-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw error;}
 }});if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;assert.equal(result.status,'passed');writeFileSync(resolve(output,`portal-flow-${name}.json`),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({checks,output},null,2));
