import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const checks=[];
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'sea'},timeoutMs:90000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate('window.__valleyEditor?.snapshot()'),pause=()=>new Promise(r=>setTimeout(r,120));
  async function mouse(type,p,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x:p[0],y:p[1],button:type==='mouseMoved'&&!held?'none':'left',buttons:held?1:0,clickCount:1});await pause();}
  async function point(p){await mouse('mouseMoved',p);await mouse('mousePressed',p,true);await mouse('mouseReleased',p);}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
  const atFace=(s,id,face=0)=>{const p=s.surfaces[id].find(f=>f.face===face).screen;return [s.canvas.x+p[0],s.canvas.y+p[1]];};
  async function importMap(map){await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(JSON.stringify(map))}`);await click('#apply-json');await click('[data-type="1"]');return snapshot();}
  async function placedAt(p,position){await mouse('mouseMoved',p);const before=await snapshot();assert.deepEqual(before.placement.position,position,JSON.stringify({placement:before.placement,source:before.map.objects.find(o=>o.id===before.placement.sourceId),faces:before.surfaces[before.placement.sourceId]}));assert.equal(await evaluate("document.querySelector('#placement-guide').classList.contains('blocked')"),false);await mouse('mousePressed',p,true);assert.equal((await snapshot()).json,before.json,'pressing is only a preview');await mouse('mouseReleased',p);const after=await snapshot();assert.equal(after.map.objects.length,before.map.objects.length+1);assert.deepEqual(after.map.objects.at(-1).position,position);return after;}
  let s;for(let i=0;i<150;i++){s=await snapshot();if(s?.map)break;await pause();}assert.ok(s?.map);
  const unit=s.map.objects.find(o=>o.type===1),floating={...s.map,id:'floating-placement',name:'悬空路径六面贴邻',groups:[],opticalLinks:[],objects:[
    ['floating',1,[0,4.25,0]],['wheel',3,[4,4.25,-4]],['spawn',9,[-4,4.25,0]],['exit',10,[0,4.25,-4]],['basis-x',1,[4,4.25,0]],['basis-z',1,[0,4.25,4]],
  ].map(([id,type,position])=>({...structuredClone(unit),id,type,position,rotation:[0,0,0],groupId:null}))};
  s=await importMap(floating);const floatingJSON=s.json;
  assert.equal(await evaluate('document.querySelector("#layer").value'),'0');
  await placedAt(atFace(s,'wheel'),[4,5.25,-4]);await click('#undo');s=await snapshot();
  // The flag and gate are ignored when finding the road face underneath.
  await placedAt(atFace(s,'spawn'),[-4,5.25,0]);await click('#undo');s=await snapshot();
  await placedAt(atFace(s,'exit'),[0,5.25,-4]);await click('#undo');s=await snapshot();
  const start=atFace(s,'floating');s=await placedAt(start,[0,5.25,0]);const first=s.map.objects.at(-1).id;
  const placed=s.json;await click('#undo');assert.equal((await snapshot()).json,floatingJSON);await click('#redo');assert.equal((await snapshot()).json,placed);
  s=await snapshot();s=await placedAt(atFace(s,first),[0,6.25,0]);const second=s.map.objects.at(-1).id;
  s=await placedAt(atFace(s,second),[0,7.25,0]);
  // Continue along actual vertical faces at the original elevation.
  s=await placedAt(atFace(s,'floating',3),[1,4.25,0]);const side=s.map.objects.at(-1).id;
  s=await placedAt(atFace(s,side,3),[2,4.25,0]);
  await mouse('mouseMoved',atFace(s,second));await capture('placement-stacked.png');
  assert.equal(new Set(s.map.objects.map(o=>o.position.join(','))).size,s.map.objects.length,'each placed cube occupies a separate 3D anchor');checks.push('top clicks build a three-cube tower; side clicks extend at Y=4.25 with the work plane at zero; wheel, flag and gate do not affect attachment');

  s=await importMap(floating);const sidePoint=atFace(s,'floating',3);
  await mouse('mouseMoved',start);await mouse('mousePressed',start,true);await mouse('mouseMoved',sidePoint,true);assert.equal((await snapshot()).json,floatingJSON);await mouse('mouseReleased',sidePoint);s=await snapshot();assert.deepEqual(s.map.objects.at(-1).position,[1,4.25,0]);await click('#undo');
  await mouse('mouseMoved',start);await mouse('mousePressed',start,true);await mouse('mouseMoved',sidePoint,true);
  await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await mouse('mouseReleased',sidePoint);assert.equal((await snapshot()).json,floatingJSON);
  await click('[data-type="1"]');s=await snapshot();await mouse('mouseMoved',start);await mouse('mousePressed',start,true);const outside=[s.canvas.x-10,start[1]];await mouse('mouseMoved',outside,true);await mouse('mouseReleased',outside);assert.equal((await snapshot()).json,floatingJSON);
  await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start[0],y:start[1],id:1}]});await pause();assert.equal((await snapshot()).json,floatingJSON);
  await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sidePoint[0],y:sidePoint[1],id:1}]});await pause();await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause();s=await snapshot();assert.equal(s.map.objects.length,floating.objects.length+1);assert.deepEqual(s.map.objects.at(-1).position,[1,4.25,0]);await click('#undo');checks.push('mouse and touch gestures place only on release; undo, redo, Escape and releasing outside remain atomic');

  // Drag off a top face into empty space: retain the candidate stack height.
  s=await snapshot();const far=[s.canvas.x+50,s.canvas.y+90];await mouse('mouseMoved',start);await mouse('mousePressed',start,true);await mouse('mouseMoved',far,true);s=await snapshot();assert.equal(s.placement.mode,'layer');assert.equal(s.placement.position[1],5.25);await mouse('mouseReleased',far);assert.equal((await snapshot()).map.objects.at(-1).position[1],5.25);await click('#undo');
  // Actual camera rotation must still pick the visible surface correctly.
  await click('#orbit-tool');s=await snapshot();const orbit=[s.canvas.x+s.canvas.width*.5,s.canvas.y+s.canvas.height*.75];await mouse('mouseMoved',orbit);await mouse('mousePressed',orbit,true);for(let i=1;i<=6;i++)await mouse('mouseMoved',[orbit[0]+150*i/6,orbit[1]],true);await mouse('mouseReleased',[orbit[0]+150,orbit[1]]);await click('[data-type="1"]');s=await snapshot();await placedAt(atFace(s,'floating'),[0,5.25,0]);await click('#undo');
  s=await snapshot();const direction=[Math.sin(s.camera.theta),0,Math.cos(s.camera.theta)],visible=s.surfaces.floating.filter(f=>f.face>=2).sort((a,b)=>b.up.reduce((n,v,i)=>n+v*direction[i],0)-a.up.reduce((n,v,i)=>n+v*direction[i],0))[0];await placedAt(atFace(s,'floating',visible.face),[visible.up[0],4.25,visible.up[2]]);await click('#undo');
  s=await snapshot();const blank=[s.canvas.x+45,s.canvas.y+s.canvas.height-110];await mouse('mouseMoved',blank);assert.equal((await snapshot()).placement.mode,'layer');assert.equal((await snapshot()).placement.position[1],0);await point(blank);assert.equal((await snapshot()).map.objects.at(-1).position[1],0);assert.deepEqual((await snapshot()).errors,[]);checks.push('held placement keeps its preview height; camera rotation preserves face selection; empty space still uses the work plane');
}});
writeFileSync(resolve(output,'placement.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'placement-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks,output},null,2));
