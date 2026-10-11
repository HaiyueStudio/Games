import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {parseMap,serializeMap,serializeCompactMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];let exported;
for(const editor of [true,false]){
 const name=editor?'editor':'player',result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:{verify:1,...(editor?{demo:'story'}:{map:'../../artifacts/valley-editor/story-export.json'})},timeoutMs:150000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
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
  async function capture(file){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,file),Buffer.from(r.result.data,'base64'));}
  async function answer(text){const s=await snapshot(),b=s.story.choices.find(b=>b.text===text);assert.ok(b,'missing story answer '+text);assert.equal(b.disabled,false);await point(screen(s,[b.rect.x+b.rect.width/2,b.rect.y+b.rect.height/2]));}
  async function finish(choice){for(let i=0;i<34;i++){const s=await snapshot(),d=s.story?.dialogue;if(!d)return;if(d.line<d.total-1)await answer('继续');else{await answer(choice??'结束');return;}}throw new Error('dialogue did not end');}
  try{
   let s=await wait(s=>s?.model==='loaded','loaded');
   if(editor){
    await click('#story');await input('#story-detail hy-input[aria-label="说话者"]','旅人微');await clickText('#story-detail','＋ 台词');assert.equal((await snapshot()).map.story.dialogues[0].lines.length,4);await click('#story-undo');assert.equal((await snapshot()).map.story.dialogues[0].lines.length,3);await click('#story-redo');assert.equal((await snapshot()).map.story.dialogues[0].lines.length,4);await click('#story-undo');
    await capture('story-editor-authoring.png');await click('#close-story');
    exported=parseMap((await snapshot()).map);const compact=serializeCompactMap(exported);writeFileSync(resolve(output,'story-export.json'),compact);await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(compact)}`);await click('#apply-json');assert.equal((await snapshot()).json,serializeMap(exported));await click('#play');
   }else assert.equal(serializeMap(s.map),serializeMap(exported));
   s=await wait(s=>s.story?.dialogue?.id==='homecoming','opening dialogue');const at=runtime(s).at.objectId;await target('lamp');assert.equal(runtime(await snapshot()).at.objectId,at);await capture(`story-${name}-opening.png`);
   await finish('先听听他害怕什么。');await wait(s=>s.story?.dialogue?.id==='fear','choice branch');await finish();await wait(s=>!s.story?.dialogue,'dialogue ended');assert.equal(runtime(await snapshot()).logic.rules.variables['keeper-trust'],1);
   if(editor){
    await click('#debug');await click('#debug-pause');let time=(await snapshot()).debug.rules.time;await pause(220);assert.equal((await snapshot()).debug.rules.time,time);await input('#debug-controls hy-input[aria-label="调试变量值"]','0');await clickText('#debug-controls','应用变量');await input('#debug-controls hy-input[aria-label="调试信号"]','open-gate');await clickText('#debug-controls','发送信号');await click('#debug-step');s=await snapshot();assert.ok(s.debug.rules.time>time);assert.equal(s.debug.paused,true);const gate=s.debug.rules.rules.find(r=>r.id==='opening-gate');assert.equal(gate.last.passed,false);assert.equal(runtime(s).logic.states.exit.enabled,false);
    await input('#debug-controls hy-input[aria-label="调试变量值"]','1');await clickText('#debug-controls','应用变量');await click('#debug-step');await click('#debug-overlay-toggle');await capture('story-editor-debug.png');await click('#debug-pause');await click('#close-debug');await capture('story-editor-connectivity.png');
   }
   await target('beacon');await wait(s=>runtime(s).at.objectId==='beacon'&&!runtime(s).walking&&runtime(s).logic.checkpoint,'beacon');await target('lamp');await wait(s=>s.story?.dialogue?.id==='witness','witness');await finish('把新的地图留给大家。');await wait(s=>runtime(s).logic.states.exit.enabled,'gate unlocked');
   await target('road');await wait(s=>s.story?.dialogue?.id==='outro','ending');await finish();s=await wait(s=>runtime(s).logic.story.objectives['open-valley']==='done','objective complete');
   const j=s.story.button;await point(screen(s,[j.x+j.width/2,j.y+j.height/2]));await wait(s=>s.story.journal,'journal');await capture(`story-${name}-journal.png`);await answer('关闭');await target('exit');await wait(s=>runtime(s).completed,'complete');
   if(editor)await click('#return-checkpoint');else{const s=await snapshot(),r=s.recoveryControls.restore;await point([r.x+r.width/2,r.y+r.height/2]);}
   s=await wait(s=>!runtime(s).completed&&runtime(s).at.objectId==='beacon','restored');assert.equal(runtime(s).logic.story.objectives['show-light'],'active');assert.equal(runtime(s).logic.story.seen.includes('witness'),false);
   if(!editor){await cdp.call('Page.reload',{});s=await wait(s=>s?.model==='loaded'&&s.at.objectId==='beacon','reload checkpoint');assert.ok(s.logic.story.seen.includes('homecoming'));assert.equal(s.logic.story.choices.homecoming,'listen');}
   if(editor){await click('#play');assert.equal((await snapshot()).json,serializeMap(exported));await click('#play');await wait(s=>s.story?.dialogue?.id==='homecoming','restart no duplicate HUD');await click('#play');}
   assert.deepEqual(s.errors,[]);assert.equal(runtime(s).logic.rules.error,null);checks.push(`${name}: story branch, blocked movement, goals, gate, journal, checkpoint and restart verified`);
  }catch(error){await capture(`story-${name}-failure.png`);writeFileSync(resolve(output,`story-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw error;}
 }});if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;assert.equal(result.status,'passed');writeFileSync(resolve(output,`story-${name}.json`),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({checks,output},null,2));
