import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {parseMap,serializeMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];let exported;
for(const editor of [true,false]){
 const name=editor?'editor':'player',result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:{verify:1,...(editor?{demo:'checkpoints'}:{map:'../../artifacts/valley-editor/checkpoint-export.json'})},timeoutMs:120000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  const pause=(ms=80)=>new Promise(r=>setTimeout(r,ms));
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(`window.${editor?'__valleyEditor':'__valleyMapPlayer'}?.snapshot()`),runtime=s=>editor?s.runtime:s;
  async function wait(test,label){for(let i=0;i<200;i++){const s=await snapshot();if(test(s))return s;await pause();}throw new Error(label+': '+JSON.stringify(await snapshot()));}
  async function point(p){for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x:p[0],y:p[1],button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});await pause();}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  async function clickText(parent,text){const p=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(parent+' hy-button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw new Error('missing button '+${JSON.stringify(text)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  async function input(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});e.focus();e.select()})()`);await cdp.call('Input.insertText',{text:String(value)});for(const type of ['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await pause();}
  async function choose(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}).shadowRoot.querySelector('select');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause();}
  const screen=(s,p)=>[p[0]+(s.canvas?.x??0),p[1]+(s.canvas?.y??0)];
  async function target(id){const s=await snapshot();await point(screen(s,s.targets[id]));}
  async function door(id){const s=await snapshot();await point(screen(s,s.portals.find(p=>p.id===id).screen));}
  async function capture(file){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,file),Buffer.from(r.result.data,'base64'));}
  try{
   let s=await wait(s=>s?.model==='loaded','loaded');
   if(editor){
    await evaluate("document.querySelector('#object-list').reveal('beacon')");
    const p=await evaluate("(()=>{const e=document.querySelector('#object-list').shadowRoot.querySelector('[data-id=beacon]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()");await point(p);
    await input('#checkpoint-name','归途之光');assert.equal((await snapshot()).map.objects.find(o=>o.id==='beacon').checkpoint.name,'归途之光');
    await choose('#checkpoint-face','');assert.equal((await snapshot()).map.objects.find(o=>o.id==='beacon').checkpoint,undefined);await click('#undo');assert.equal((await snapshot()).map.objects.find(o=>o.id==='beacon').checkpoint.name,'归途之光');
    await click('#logic');await choose('[data-variable="west-lit"] hy-select[aria-label="重置归属"]','');assert.equal((await snapshot()).map.logic.variables[0].resetGroup,undefined);await click('#logic-undo');assert.equal((await snapshot()).map.logic.variables[0].resetGroup,'west');
    await click('#logic-add-rule');await input('#logic-detail hy-input[aria-label="规则名称"]','恢复流程示例');await choose('#logic-detail hy-select[aria-label="重置归属"]','west');await choose('#logic-detail hy-select[aria-label="何时触发"]','restore');await choose('#logic-detail hy-select[aria-label="事件来源"]','beacon');
    await choose('#logic-detail .action hy-select[aria-label="动作类型"]','checkpoint');await input('#logic-detail .action hy-input[aria-label="检查点名称"]','阶段存档');
    await choose('#logic-detail .action hy-select[aria-label="动作类型"]','restore');await choose('#logic-detail .action hy-select[aria-label="动作类型"]','reset');await choose('#logic-detail .action hy-select[aria-label="重置区域（父节点）"]','east');
    s=await snapshot();assert.equal(s.map.logic.rules.at(-1).actions[0].groupId,'east');await capture('checkpoint-editor-panel.png');
    await choose('#logic-detail hy-select[aria-label="启用规则"]','false');await click('#close-logic');
    exported=parseMap((await snapshot()).map);const compact=serializeCompactMap(exported);writeFileSync(resolve(output,'checkpoint-export.json'),compact);await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');assert.equal((await snapshot()).json,serializeMap(exported));await click('#play');
    checks.push('Editor configures checkpoint face/name, scoped variables/rules, recovery event and three recovery actions; undo and compact import preserve the configuration');
   }else assert.equal(serializeMap(s.map),serializeMap(exported));
   await wait(s=>runtime(s)&&s.performance.state==='ready','runtime ready');
   const variables=s=>runtime(s).logic.rules.variables;
   const restore=async()=>{if(editor)await click('#return-checkpoint');else{const r=(await snapshot()).recoveryControls.restore;await point([r.x+r.width/2,r.y+r.height/2]);}};
   const reset=async()=>{if(editor)await click('#reset-region-button');else{const r=(await snapshot()).recoveryControls.reset;await point([r.x+r.width/2,r.y+r.height/2]);}};
   await target('west-switch');s=await wait(s=>variables(s)['west-lit']&&!runtime(s).walking,'west switch');assert.equal(runtime(s).logic.checkpoint.name,'归途之光');
   await target('east-switch');s=await wait(s=>variables(s)['east-lit']&&!runtime(s).walking,'east switch');assert.equal(runtime(s).logic.states.exit.enabled,true);
   await reset();s=await wait(s=>!variables(s)['west-lit']&&variables(s)['east-lit']&&runtime(s).at.objectId==='beacon','local reset');assert.equal(runtime(s).logic.states.exit.enabled,false);await capture(`checkpoint-${name}-local-reset.png`);
   await target('west-switch');await wait(s=>variables(s)['west-lit']&&!runtime(s).walking,'repeat west');
   await restore();s=await wait(s=>!variables(s)['west-lit']&&!variables(s)['east-lit']&&runtime(s).at.objectId==='beacon','full checkpoint restore');assert.equal(runtime(s).walking,false);assert.deepEqual(runtime(s).fired,[]);
   if(!editor){
    await target('west-switch');await wait(s=>variables(s)['west-lit']&&!runtime(s).walking,'mutate after saved checkpoint');await cdp.call('Page.reload',{});
    s=await wait(s=>s?.model==='loaded'&&runtime(s)?.at.objectId==='beacon','reload continues checkpoint');assert.equal(variables(s)['west-lit'],false);assert.equal(runtime(s).logic.checkpoint.name,'归途之光');await capture('checkpoint-player-reloaded.png');checks.push('Independent player persists the exact checkpoint and resumes it after browser reload');
   }
   await target('west-switch');await wait(s=>variables(s)['west-lit']&&!runtime(s).walking,'west restored');await target('east-switch');await wait(s=>variables(s)['east-lit']&&!runtime(s).walking,'east restored');await target('exit');s=await wait(s=>runtime(s).completed,'complete');assert.deepEqual(s.errors,[]);assert.equal(runtime(s).logic.rules.error,null);
   await restore();await wait(s=>!runtime(s).completed&&runtime(s).at.objectId==='beacon','restore after completion');
   if(editor){await click('#play');assert.equal((await snapshot()).json,serializeMap(exported));await click('#play');}else await point([1480,40]);
   s=await wait(s=>runtime(s)?.at.objectId==='start','restart');assert.equal(runtime(s).logic.checkpoint,null);if(!editor)assert.equal(await evaluate("localStorage.getItem('haiyue-valley-checkpoint:checkpoint-garden')"),null);
   checks.push(`${name}: checkpoint on traversal, scoped retry keeps other switch progress, full restore resets both, switches can replay, completion can restore, restart is clean`);
  }catch(error){await capture(`checkpoint-${name}-failure.png`);writeFileSync(resolve(output,`checkpoint-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw error;}
 }});if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;assert.equal(result.status,'passed');writeFileSync(resolve(output,`checkpoint-${name}.json`),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({checks,output},null,2));
