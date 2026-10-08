import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'sea'},timeoutMs:60000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate('window.__valleyEditor?.snapshot()'),pause=()=>new Promise(r=>setTimeout(r,120));
  async function mouse(type,x,y,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:held?1:0,clickCount:1});}
  async function click(selector){const p=await evaluate(`(()=>{const selector=${JSON.stringify(selector)},id=selector.startsWith('[data-object=')?selector.split('"')[1]:null,tree=document.querySelector('#object-list');if(id)tree.reveal(id);const e=id?tree.shadowRoot.querySelector('[data-id="'+id+'"]'):document.querySelector(selector);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await mouse('mouseMoved',...p);await mouse('mousePressed',...p,true);await mouse('mouseReleased',...p);await pause();}
  async function fill(selector,text){await click(selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await cdp.call('Input.insertText',{text});for(const type of ['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await pause();}
  async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
  async function wait(test,label){for(let i=0;i<150;i++){const s=await snapshot();if(test(s))return s;await pause();}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  let s=await wait(s=>s?.grid?.lines>0,'work grid');const json=s.json,origin=s.grid.origin;
  assert.equal(await evaluate("document.querySelectorAll('#labels,.object-label').length"),0);assert.ok(s.grid.visible);await capture('grid-editor.png');
  await click('#grid-tool');assert.equal((await snapshot()).grid.visible,false);await click('#grid-tool');
  await fill('#layer','1.5');s=await snapshot();assert.equal(s.grid.height,1.5);assert.notDeepEqual(s.grid.origin,origin);assert.equal(s.json,json);
  await evaluate("(()=>{const e=document.querySelector('#snap');e.value='0.5';e.dispatchEvent(new Event('change',{bubbles:true}));})()");await pause();assert.equal((await snapshot()).grid.spacing,.5);await fill('#layer','0');checks.push('object labels removed; engine grid follows work height and snap interval without changing the map');
  s=await snapshot();assert.deepEqual(s.errors.slice(0,3),[]);await click('[data-object="wheel"]');const original=s.map.objects.find(o=>o.id==='wheel').position;
  for(const [field,value,axis,name] of [['#rotation-1','90',[1,0,0],'y'],['#rotation-0','90',[0,-1,0],'x'],['#rotation-2','30',[0,0,1],'z']]){
    const before=(await snapshot()).wheelFrames.wheel;await fill(field,value);s=await snapshot();assert.ok(Math.hypot(...s.wheelFrames.wheel.axis.map((v,i)=>v-axis[i]))<1e-8);assert.deepEqual(s.map.objects.find(o=>o.id==='wheel').position,original);
    if(name==='z')assert.notDeepEqual(s.wheelFrames.wheel.right,before.right);else assert.notDeepEqual(s.wheelFrames.wheel.center,before.center);
    await capture(`wheel-orientation-${name}.png`);await click('#undo');
  }
  checks.push('X/Y/Z inspector rotations turn the complete wheel assembly and its local spindle');
  await fill('#rotation-1','90');await click('#play');s=await wait(s=>s.model==='loaded','play');assert.equal(s.grid.visible,false);
  const f=s.wheelFrames.wheel,cx=s.canvas.x+f.center[0],cy=s.canvas.y+f.center[1],radius=Math.hypot(...f.right)*.76,start=Math.atan2(f.right[1],f.right[0]);assert.notEqual(f.direction,0);
  await mouse('mouseMoved',cx+Math.cos(start)*radius,cy+Math.sin(start)*radius);await mouse('mousePressed',cx+Math.cos(start)*radius,cy+Math.sin(start)*radius,true);
  for(let i=1;i<=18;i++){const a=start+f.direction*Math.PI/2*i/18;await mouse('mouseMoved',cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,true);await new Promise(r=>setTimeout(r,25));}
  const end=start+f.direction*Math.PI/2;await mouse('mouseReleased',cx+Math.cos(end)*radius,cy+Math.sin(end)*radius);await pause();s=await snapshot();assert.equal(s.runtime.poses.mechanisms.wheel,90);assert.ok(Math.hypot(...s.wheelFrames.wheel.axis.map((v,i)=>v-[1,0,0][i]))<1e-8);assert.deepEqual(s.errors,[]);await capture('wheel-oriented-play.png');
  await click('#play');assert.ok((await snapshot()).grid.visible);checks.push('oriented spindle remains pickable and draggable in preview; grid automatically hides during play');
}});
if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'grid-orientation-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks,output},null,2));
