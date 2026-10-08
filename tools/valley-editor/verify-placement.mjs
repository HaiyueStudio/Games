import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'sea'},timeoutMs:60000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate('window.__valleyEditor?.snapshot()'),pause=()=>new Promise(r=>setTimeout(r,120));
  async function mouse(type,p,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x:p[0],y:p[1],button:type==='mouseMoved'&&!held?'none':'left',buttons:held?1:0,clickCount:1});await pause();}
  async function point(p){await mouse('mouseMoved',p);await mouse('mousePressed',p,true);await mouse('mouseReleased',p);}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  let s;for(let i=0;i<150;i++){s=await snapshot();if(s?.map)break;await pause();}assert.ok(s?.map);
  const initial=s.json,count=s.map.objects.length,w=s.targets.wheel,r=s.targets['road-2'];
  const start=[s.canvas.x+w[0],s.canvas.y+w[1]],end=[s.canvas.x+2*w[0]-r[0],s.canvas.y+2*w[1]-r[1]];
  await click('[data-type="1"]');await mouse('mouseMoved',start);await mouse('mousePressed',start,true);
  assert.equal((await snapshot()).map.objects.length,count,'pressing on the wheel platform must not create an overlapping path');assert.equal(await evaluate("document.querySelector('#placement-guide').classList.contains('blocked')"),true);
  await mouse('mouseMoved',end,true);assert.equal((await snapshot()).map.objects.length,count,'moving a placement is only a preview');assert.equal(await evaluate("document.querySelector('#placement-guide').classList.contains('blocked')"),false);const preview=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'placement-preview.png'),Buffer.from(preview.result.data,'base64'));await mouse('mouseReleased',end);
  s=await snapshot();assert.equal(s.map.objects.length,count+1);assert.deepEqual(s.map.objects.at(-1).position,[4,0,0]);assert.equal(s.map.objects.filter(o=>o.type===1&&o.position.every((v,i)=>v===[3,0,0][i])).length,0);
  const placed=s.json;await point(end);assert.equal((await snapshot()).json,placed,'clicking an occupied cell must not duplicate the path');
  await click('#undo');assert.equal((await snapshot()).json,initial,'placement is one undoable change');await click('#redo');assert.equal((await snapshot()).json,placed);
  await click('#undo');await point(start);assert.equal((await snapshot()).json,initial,'clicking the wheel platform must not create a path on it');
  await mouse('mouseMoved',start);await mouse('mousePressed',start,true);await mouse('mouseMoved',end,true);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await mouse('mouseReleased',end);assert.equal((await snapshot()).json,initial,'Escape cancels placement without a leftover block');
  await click('[data-type="1"]');await mouse('mouseMoved',start);await mouse('mousePressed',start,true);await mouse('mouseMoved',[s.canvas.x-10,start[1]],true);await mouse('mouseReleased',[s.canvas.x-10,start[1]]);assert.equal((await snapshot()).json,initial,'releasing outside the canvas cancels placement');
  await point(end);s=await snapshot();assert.equal(s.map.objects.length,count+1);assert.deepEqual(s.map.objects.at(-1).position,[4,0,0]);assert.deepEqual(s.errors,[]);
  await click('#undo');
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start[0],y:start[1],id:1}]});await pause();assert.equal((await snapshot()).map.objects.length,count);
  for(let i=1;i<=8;i++){await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start[0]+(end[0]-start[0])*i/8,y:start[1]+(end[1]-start[1])*i/8,id:1}]});await pause();}
  await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause();s=await snapshot();assert.equal(s.map.objects.length,count+1);assert.deepEqual(s.map.objects.at(-1).position,[4,0,0]);assert.deepEqual(s.errors,[]);

  // Continue an elevated road while the work plane is still Y=0.
  const unit=s.map.objects.find(o=>o.type===1),floating={...s.map,id:'floating-placement',name:'悬空路径贴邻放置',groups:[],opticalLinks:[],objects:[[0,4.25,0],[4,4.25,0],[0,4.25,4]].map((position,i)=>({...structuredClone(unit),id:['floating','basis-x','basis-z'][i],position,rotation:[0,0,0],groupId:null}))};
  await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(JSON.stringify(floating))}`);await click('#apply-json');await click('[data-type="1"]');s=await snapshot();const floatingJSON=s.json;
  const at=(s,x,z)=>{const a=s.targets.floating,b=s.targets['basis-x'],c=s.targets['basis-z'];return [s.canvas.x+a[0]+(b[0]-a[0])*x/4+(c[0]-a[0])*z/4,s.canvas.y+a[1]+(b[1]-a[1])*x/4+(c[1]-a[1])*z/4];};
  let p=at(s,.42,0);await mouse('mouseMoved',p);s=await snapshot();assert.deepEqual(s.placement.position,[1,4.25,0]);assert.equal(s.placement.mode,'edge');assert.equal(await evaluate('document.querySelector("#layer").value'),'0');
  await mouse('mousePressed',p,true);assert.equal((await snapshot()).map.objects.length,3);const elevated=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'floating-placement-preview.png'),Buffer.from(elevated.result.data,'base64'));await mouse('mouseReleased',p);s=await snapshot();assert.deepEqual(s.map.objects.at(-1).position,[1,4.25,0]);
  await point(p);assert.equal((await snapshot()).map.objects.length,4,'same edge does not add another block');await point(at(s,1.42,0));s=await snapshot();assert.deepEqual(s.map.objects.at(-1).position,[2,4.25,0]);assert.equal(s.map.objects.length,5);
  await click('#undo');assert.equal((await snapshot()).map.objects.length,4);await click('#redo');assert.deepEqual((await snapshot()).map.objects.at(-1).position,[2,4.25,0]);await click('#undo');await click('#undo');assert.equal((await snapshot()).json,floatingJSON);
  s=await snapshot();const from=at(s,0,0),far=at(s,0,-3);await mouse('mouseMoved',from);await mouse('mousePressed',from,true);for(let i=1;i<=6;i++)await mouse('mouseMoved',[from[0]+(far[0]-from[0])*i/6,from[1]+(far[1]-from[1])*i/6],true);assert.equal((await snapshot()).placement.position[1],4.25);await mouse('mouseReleased',far);assert.deepEqual((await snapshot()).map.objects.at(-1).position,[0,4.25,-3]);await click('#undo');
  await click('#orbit-tool');s=await snapshot();const orbitStart=[s.canvas.x+s.canvas.width*.5,s.canvas.y+s.canvas.height*.75];await mouse('mouseMoved',orbitStart);await mouse('mousePressed',orbitStart,true);for(let i=1;i<=6;i++)await mouse('mouseMoved',[orbitStart[0]+110*i/6,orbitStart[1]-25*i/6],true);await mouse('mouseReleased',[orbitStart[0]+110,orbitStart[1]-25]);await click('[data-type="1"]');s=await snapshot();await point(at(s,0,-.42));s=await snapshot();assert.deepEqual(s.map.objects.at(-1).position,[0,4.25,-1]);assert.equal(s.map.objects.at(-1).rotation[1],90);await click('#undo');
  s=await snapshot();p=[s.canvas.x+45,s.canvas.y+s.canvas.height-110];await mouse('mouseMoved',p);assert.equal((await snapshot()).placement.mode,'layer');assert.equal((await snapshot()).placement.position[1],0);await point(p);assert.equal((await snapshot()).map.objects.at(-1).position[1],0);assert.deepEqual((await snapshot()).errors,[]);

}});
writeFileSync(resolve(output,'placement.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'placement-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:['mouse and touch press-drag-release place exactly one path next to the wheel','occupied cells never add overlapping paths','undo, redo, Escape and release outside remain atomic','elevated edge clicks and repeated extension preserve Y=4.25 while the toolbar stays at zero','dragging from an elevated road keeps its height; rotated views attach to the correct edge','empty-space placement still follows the toolbar height'],output},null,2));
