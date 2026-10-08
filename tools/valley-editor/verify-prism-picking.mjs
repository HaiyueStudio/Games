import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {createObject,emptyMap,emptyPoses,localSamples,prismOutline,rotate,worldSample} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});const checks=[];
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'split'},timeoutMs:90000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate('window.__valleyEditor?.snapshot()'),pause=()=>new Promise(r=>setTimeout(r,100));
  async function mouse(type,x,y,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!held?'none':'left',buttons:held?1:0,clickCount:1});}
  async function point(x,y){await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y,true);await mouse('mouseReleased',x,y);await pause();}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  async function fill(selector,text){await click(selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await cdp.call('Input.insertText',{text});for(const type of ['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await pause();}
  async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
  for(let i=0;i<150&&!(await snapshot())?.map;i++)await pause();
  const refs=[createObject(1,'ref-o',[-5,0,-2]),createObject(1,'ref-x',[-4,0,-2]),createObject(1,'ref-y',[-5,1,-2]),createObject(1,'ref-z',[-5,0,-1])];
  async function load(objects){const map=emptyMap();map.objects=[...refs,...objects];await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(JSON.stringify(map))}`);await click('#apply-json');await click('#select-tool');}
  // Read three independent projected unit vectors from visible reference blocks.
  function screen(s,p){const o=s.targets['ref-o'],d=[p[0]+5,p[1],p[2]+2];return o.map((v,j)=>v+d.reduce((sum,x,i)=>sum+x*(s.targets[['ref-x','ref-y','ref-z'][i]][j]-o[j]),0));}
  async function pickWorld(p,expected,label){await click('[data-object="ref-o"]');const s=await snapshot(),q=screen(s,p);await point(s.canvas.x+q[0],s.canvas.y+q[1]);assert.deepEqual((await snapshot()).selected,expected?[expected]:[],label);}
  async function visibleFaces(id){
    const s=await snapshot(),o=s.map.objects.find(o=>o.id===id),t=s.camera.theta,f=s.camera.phi,toward=[Math.sin(f)*Math.sin(t),Math.cos(f),Math.sin(f)*Math.cos(t)],outline=prismOutline(o),center=localSamples(o)[1].point;
    const faces=[{point:center,normal:[0,1,0]},{point:[center[0],-1,center[2]],normal:[0,-1,0]}];
    for(let i=0;i<3;i++){const a=outline[i],b=outline[(i+1)%3];faces.push({point:[(a[0]+b[0])/2,-.82,(a[2]+b[2])/2],normal:[b[2]-a[2],0,a[0]-b[0]]});}
    let count=0;for(const face of faces){const normal=rotate(face.normal,o.rotation);if(normal.reduce((n,v,i)=>n+v*toward[i],0)<.1)continue;const p=worldSample(s.map,o,{point:face.point,up:[0,1,0],roll:0},emptyPoses()).point;await pickWorld(p,id,`${o.prismHalf} ${o.rotation}: visible face ${face.normal}`);count++;}assert.ok(count>=1);
  }
  for(const half of ['a','b']){
    const prism=createObject(5,'prism');prism.prismHalf=half;await load([prism]);
    await visibleFaces('prism');const sign=half==='a'?1:-1;await pickWorld([sign*.32,-.3,-sign*.32],null,'the missing half of a prism must not be selectable');
    for(const rotation of [[90,0,0],[0,90,0],[0,0,90],[25,40,-20]]){
      await click('[data-object="prism"]');for(let axis=0;axis<3;axis++)await fill(`#rotation-${axis}`,String(rotation[axis]));await visibleFaces('prism');
    }
    await capture(`prism-picking-${half}.png`);
  }
  checks.push('A/B top, bottom and low side faces remain pickable after X/Y/Z and combined rotations; empty half is not a hit');
  await click('#orbit-tool');let s=await snapshot();const theta=s.camera.theta,x=s.canvas.x+s.canvas.width*.75,y=s.canvas.y+s.canvas.height*.3;await mouse('mousePressed',x,y,true);for(let i=1;i<=8;i++)await mouse('mouseMoved',x+80*i/8,y+25*i/8,true);await mouse('mouseReleased',x+80,y+25);await pause();await click('#select-tool');s=await snapshot();assert.notEqual(s.camera.theta,theta);await visibleFaces('prism');await capture('prism-picking-orbit.png');checks.push('mesh hits follow camera orbit and the current model transform');
  await click('#reset-view');
  const back=createObject(5,'back'),front=createObject(5,'front',[3,3,3]);
  await load([back,front]);await pickWorld([2.83,3,3.17],'front','front prism wins even when the rear prism is listed first');
  await load([front,back]);await pickWorld([2.83,3,3.17],'front','depth selection is independent of object order');
  await load([createObject(1,'back'),front]);await pickWorld([2.83,3,3.17],'front','visible triangular face wins over the cube behind');await pickWorld([3.32,2.7,2.68],'back','ray passes through the empty half to the cube behind');await capture('prism-picking-depth.png');checks.push('overlapping objects select the nearest real surface; the absent prism half exposes the object behind');
  assert.deepEqual((await snapshot()).errors,[]);
}});
if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'prism-picking-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks,output},null,2));
