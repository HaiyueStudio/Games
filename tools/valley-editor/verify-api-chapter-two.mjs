import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const recipe=JSON.parse(readFileSync(new URL('./recipes/chapter-two.commands.json',import.meta.url)));const checks=[];
for(const editor of [true,false]){
 const name=editor?'editor':'player';
 const result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:editor?{verify:1}:{verify:1,map:'./maps/chapter-two-garden.json'},timeoutMs:150000,visualCapture:{viewportWidth:1536,viewportHeight:1080},interact:async cdp=>{
  const pause=(ms=70)=>new Promise(r=>setTimeout(r,ms));
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(`window.${editor?'__valleyEditor':'__valleyMapPlayer'}?.snapshot()`),state=s=>editor?s.runtime:s;
  async function wait(test,label){for(let i=0;i<350;i++){const s=await snapshot();if(test(s))return s;await pause();}throw new Error(label+': '+JSON.stringify(state(await snapshot())));}
  async function mouse(type,x,y,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!held?'none':'left',buttons:held?1:0,clickCount:1});}
  async function point(x,y){await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y,true);await mouse('mouseReleased',x,y);await pause();}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  async function target(id){const s=await snapshot(),p=s.targets[id];await point(p[0]+(s.canvas?.x??0),p[1]+(s.canvas?.y??0));}
  async function capture(suffix){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,`chapter-two-${name}-${suffix}.png`),Buffer.from(r.result.data,'base64'));}
  async function turn(degrees){const s=await wait(s=>s.wheelStates.wheel.open===1,'wheel expands'),f=s.wheelFrames.wheel,cx=(s.canvas?.x??0)+f.center[0],cy=(s.canvas?.y??0)+f.center[1],r=Math.hypot(...f.right)*.76,a=Math.atan2(f.right[1],f.right[0]);await mouse('mouseMoved',cx+r*Math.cos(a),cy+r*Math.sin(a));await mouse('mousePressed',cx+r*Math.cos(a),cy+r*Math.sin(a),true);for(let i=1;i<=40;i++){const t=a+degrees*Math.PI/180*f.direction*i/40;await mouse('mouseMoved',cx+r*Math.cos(t),cy+r*Math.sin(t),true);await pause(12);}const end=a+degrees*Math.PI/180*f.direction;await mouse('mouseReleased',cx+r*Math.cos(end),cy+r*Math.sin(end));await pause(120);}
  try{
   await wait(s=>s?.model==='loaded','loaded');
   if(editor){
    const original=await evaluate('valleyEditor.exportJSON(false)');assert.equal(await evaluate('valleyEditor.apiVersion'),1);
    await evaluate(`window.recipe=${JSON.stringify(recipe)};valleyEditor.validate(window.recipe)`);assert.equal(await evaluate('valleyEditor.exportJSON(false)'),original);
    await evaluate('valleyEditor.apply(window.recipe);valleyEditor.fit()');assert.equal((await snapshot()).map.objects.length,139);await evaluate('valleyEditor.undo()');assert.equal(await evaluate('valleyEditor.exportJSON(false)'),original);await evaluate('valleyEditor.redo();valleyEditor.fit()');
    const unchanged=await evaluate('valleyEditor.exportJSON(false)');const error=await evaluate(`(()=>{try{valleyEditor.apply({apiVersion:1,label:'坏请求',commands:[{op:'object.create',object:{id:'bad',type:1,position:[NaN,0,0]}}]});return false}catch{return true}})()`);assert.equal(error,true);assert.equal(await evaluate('valleyEditor.exportJSON(false)'),unchanged);
    await click('#api');await click('#api-chapter-two');await click('#api-validate');assert.ok((await evaluate("document.querySelector('#api-report').textContent")).includes('校验通过'));await capture('api');await click('#close-api');await click('#grid-tool');await capture('authoring');await evaluate('valleyEditor.play(true)');
    assert.equal(await evaluate(`(()=>{try{valleyEditor.apply(window.recipe);return false}catch{return true}})()`),true);
   }
   await wait(s=>!!state(s)&&s.performance.state==='ready','static geometry merged');await capture('start');
   await target('entry');await wait(s=>s.traveler.animation==='Climb','first ladder');await capture('climbing');await wait(s=>state(s).at.objectId==='entry'&&!state(s).walking,'entry landing');
   await target('garden-switch');assert.equal(state(await snapshot()).walking,false,'initial bridge disconnected');await turn(90);assert.equal(state(await snapshot()).poses.mechanisms.wheel,90);await capture('lower-open');
   await target('garden-switch');await wait(s=>state(s).fired.includes('garden-switch')&&!state(s).walking,'switch');await target('west-pavilion');await wait(s=>s.traveler.animation==='Climb','second ladder');await wait(s=>state(s).at.objectId==='west-pavilion'&&!state(s).walking,'upper landing');
   await target('exit');assert.equal(state(await snapshot()).walking,false,'upper bridge still disconnected');await turn(-90);assert.equal(state(await snapshot()).poses.mechanisms.wheel,0);await capture('upper-open');
   await target('exit');const s=await wait(s=>state(s).completed,'completed');assert.deepEqual(s.errors,[]);assert.equal(state(s).logic.rules.error,null);await capture('complete');
   if(editor){await evaluate('valleyEditor.play(false)');assert.equal((await snapshot()).playing,false);assert.equal(await evaluate('valleyEditor.status().editable'),true);}
   checks.push(`${name}: API/JSON map, ladder ascent, two actual wheel drags, lower switch, upper route and completion`);
  }catch(e){await capture('failure');writeFileSync(resolve(output,`chapter-two-${name}-failure.json`),JSON.stringify(await snapshot(),null,2));throw e;}
 }});assert.equal(result.status,'passed');if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;writeFileSync(resolve(output,`chapter-two-${name}-browser.json`),JSON.stringify(result,null,2));
}
console.log(JSON.stringify({checks,output},null,2));
