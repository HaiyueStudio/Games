import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {parseMap,serializeMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];let exported;
for(const editor of [true,false]){
 const name=editor?'editor':'player',result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:{verify:1,...(editor?{demo:'rules'}:{map:'../../artifacts/valley-editor/logic-export.json'})},timeoutMs:120000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
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
    await click('#logic');await click('#logic-add-variable');await input('[data-variable="var-1"] hy-input[aria-label="变量名称"]','验证计数');await click('#logic-add-rule');
    await input('#logic-detail hy-input[aria-label="规则名称"]','界面创建的规则');await clickText('#logic-detail','＋ 条件');await choose('#logic-detail .condition hy-select[aria-label="变量"]','var-1');
    await choose('#logic-detail .action hy-select[aria-label="动作类型"]','variable');await choose('#logic-detail .action hy-select[aria-label="变量"]','var-1');await choose('#logic-detail .action hy-select[aria-label="操作"]','add');await input('#logic-detail .action hy-input[aria-label="值"]','2');
    await clickText('#logic-detail','＋ 动作');s=await snapshot();assert.equal(s.map.logic.rules.at(-1).actions.length,2);await click('#logic-undo');assert.equal((await snapshot()).map.logic.rules.at(-1).actions.length,1);await click('#logic-redo');assert.equal((await snapshot()).map.logic.rules.at(-1).actions.length,2);
    await choose('#logic-detail .action[data-action="1"] hy-select[aria-label="动作类型"]','wait');await input('#logic-detail .action[data-action="1"] hy-input[aria-label="等待秒数"]','.1');
    await input('#logic-detail .action[data-action="1"] hy-input[aria-label="等待秒数"]','-1');assert.equal((await snapshot()).map.logic.rules.at(-1).actions[1].duration,.1);assert.ok((await evaluate("document.querySelector('#logic-error').textContent")).includes('关卡逻辑'));await input('#logic-detail .action[data-action="1"] hy-input[aria-label="等待秒数"]','.2');assert.equal(await evaluate("document.querySelector('#logic-error').textContent"),'');
    await choose('#logic-detail hy-select[aria-label="何时触发"]','signal');await input('#logic-detail hy-input[aria-label="信号名称（英文、数字、短横线）"]','ui-signal');assert.equal((await snapshot()).map.logic.rules.at(-1).event.source,'ui-signal');await choose('#logic-detail hy-select[aria-label="何时触发"]','start');
    await capture('logic-editor-panel.png');await click('#close-logic');
    exported=parseMap((await snapshot()).map);const compact=serializeCompactMap(exported);writeFileSync(resolve(output,'logic-export.json'),compact);await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');assert.equal((await snapshot()).json,serializeMap(exported));
    await click('#play');checks.push('UI creates variables, conditional rules, variable actions and waits; changes event type; undo/redo and compact import preserve logic');
   }else assert.equal(serializeMap(s.map),serializeMap(exported));
   s=await wait(s=>s.performance.state==='ready'&&runtime(s)?.logic.rules.variables['var-1']===2,'initial rules and static compilation');
   assert.equal(runtime(s).logic.rules.variables.progress,0);assert.equal(runtime(s).logic.states['gate-a'].enabled,false);assert.equal(s.wheelStates.wheel.disabled,true);
   await target('exit');await pause(250);assert.equal(runtime(await snapshot()).walking,false,'locked portal blocks exit');
   await target('first');await wait(s=>runtime(s).logic.rules.variables.progress===1&&!runtime(s).walking,'first switch');
   await target('second');s=await wait(s=>runtime(s).logic.states['gate-a'].enabled&&!runtime(s).busy&&!runtime(s).walking&&s.wheelStates.wheel.open>.99,'second switch opens gate after parallel actions');
   assert.equal(runtime(s).logic.rules.variables.progress,2);assert.ok(Math.abs(runtime(s).poses.groups.lanterns.translation[1]-1)<1e-6);await capture(`logic-${name}-unlocked.png`);
   if(editor){await click('#logic');assert.equal(await evaluate("[...document.querySelectorAll('#logic-detail hy-input,#logic-detail hy-select')].every(e=>e.disabled)"),true);assert.ok((await evaluate("document.querySelector('#logic-debug').textContent")).includes('点灯进度：2'));await capture('logic-editor-debug.png');await click('#close-logic');}
   await door('gate-a');s=await wait(s=>runtime(s).logic.rules.variables.visits===1&&!runtime(s).walking,'portal completion');assert.equal(runtime(s).logic.states.exit.enabled,true);
   await target('exit');s=await wait(s=>runtime(s).completed,'exit');assert.deepEqual(s.errors,[]);assert.equal(runtime(s).logic.rules.error,null);await capture(`logic-${name}-complete.png`);
   if(editor){await click('#play');assert.equal((await snapshot()).json,serializeMap(exported));await click('#play');}else await point([1480,40]);
   s=await wait(s=>runtime(s).logic.rules.variables.progress===0&&!runtime(s).completed,'restart');assert.equal(runtime(s).logic.states['gate-a'].enabled,false);assert.equal(runtime(s).logic.rules.variables.visits,0);assert.equal(runtime(s).logic.rules.variables['var-1'],2);checks.push(`${name}: locked route, ordered switches, delayed parallel group animation, wheel unfolding, portal arrival event, exit and clean restart`);
  }catch(error){await capture(`logic-${name}-failure.png`);writeFileSync(resolve(output,`logic-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw error;}
 }});if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;assert.equal(result.status,'passed');writeFileSync(resolve(output,`logic-${name}.json`),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({checks,output},null,2));
