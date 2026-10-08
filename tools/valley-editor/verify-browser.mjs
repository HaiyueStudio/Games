import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const captureOnly=process.argv.includes('--capture-only'),dragOnly=process.argv.includes('--drag-only');const checks=[];
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1},timeoutMs:60000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate('window.__valleyEditor?.snapshot()');
  async function wait(test,label,ms=20000){const start=Date.now();while(Date.now()-start<ms){const s=await snapshot();if(test(s))return s;await new Promise(r=>setTimeout(r,80));}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function mouse(type,x,y,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:held?1:0,clickCount:1});}
  async function clickPoint(x,y){await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y,true);await mouse('mouseReleased',x,y);await new Promise(r=>setTimeout(r,100));}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await clickPoint(...p);}
  async function fill(selector,text){await click(selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await cdp.call('Input.insertText',{text});await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await new Promise(r=>setTimeout(r,150));}
  async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
  async function clickObject(id){const s=await snapshot(),p=s.targets[id];await clickPoint(s.canvas.x+p[0],s.canvas.y+p[1]);}
  let s=await wait(s=>s?.map,'editor ready');assert.equal(s.platform.documents.activeId,'valley-map-document');assert.ok(s.platform.contributions.panel.length>=4);checks.push('public Editor document, selection, history and plugin contributions active');
  await capture('editor.png');if(captureOnly)return;
  if(!dragOnly){
  await click('[data-object="moving-a"]');await fill('#position-1','1.5');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id==='moving-a').position[1],1.5);
  await click('#undo');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id==='moving-a').position[1],0);
  await click('#redo');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id==='moving-a').position[1],1.5);await click('#undo');checks.push('inspector transform participates in Editor undo/redo');
  await click('[data-type="7"]');s=await snapshot();await clickPoint(s.canvas.x+s.canvas.width*.52,s.canvas.y+s.canvas.height*.75);s=await snapshot();assert.equal(s.map.objects.at(-1).type,7);const added=s.map.objects.at(-1).id;
  await fill('#param-radius','3');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id===added).radius,3);checks.push('palette placement and arc parameters author real map objects');
  await click('#select-tool');s=await snapshot();const position=s.map.objects.find(o=>o.id===added).position,p=s.targets[added],x=s.canvas.x+p[0],y=s.canvas.y+p[1];
  await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y,true);await mouse('mouseMoved',x+40,y+20,true);await mouse('mouseReleased',x+40,y+20);
  s=await snapshot();assert.notDeepEqual(s.map.objects.find(o=>o.id===added).position,position);await click('#undo');s=await snapshot();assert.deepEqual(s.map.objects.find(o=>o.id===added).position,position);checks.push('viewport drag commits one undoable transform');
  await click('#delete');s=await snapshot();assert.ok(!s.map.objects.some(o=>o.id===added));
  await click('[data-object="switch-lift"]');await fill('#action-0-duration','0.8');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id==='switch-lift').trigger.actions[0].duration,.8);checks.push('pressure switch group and animation configuration editable');
  await click('#json');const text=await evaluate('document.querySelector("#json-text").value');assert.equal(JSON.parse(text).objects.length,9);writeFileSync(resolve(output,'exported-map.json'),text);await click('#apply-json');checks.push('exported JSON round-trips through validated import');
  await click('#play');await wait(s=>s.playing&&s.model==='loaded','play mode and glTF');
  await clickObject('exit');s=await snapshot();assert.equal(s.runtime.walking,false);
  await clickObject('switch-lift');await wait(s=>s.runtime.busy,'first pressure plate');await wait(s=>!s.runtime.busy&&!s.runtime.walking,'first group translation');
  s=await snapshot();assert.deepEqual(s.runtime.poses.groups.sliding.translation,[0,0,-3]);checks.push('walking onto first plate translates both grouped bridges');
  await clickObject('switch-turn');await wait(s=>s.runtime.busy,'second pressure plate');await wait(s=>!s.runtime.busy&&!s.runtime.walking,'group rotation');
  s=await snapshot();assert.deepEqual(s.runtime.poses.groups.turning.rotation,[0,-90,0]);checks.push('second plate rotates the group around its authored pivot');
  await clickObject('exit');await wait(s=>s.runtime.completed,'exit');await capture('play-complete.png');checks.push('newly connected route reaches exit');
  await click('#play');s=await snapshot();assert.equal(s.map.objects.find(o=>o.id==='moving-a').position[2],3);assert.equal(s.map.objects.find(o=>o.id==='rotating-a').rotation[1],90);checks.push('stop preview restores authoring transforms');
  }
  await click('#demo-catalog');await evaluate('document.querySelector("#catalog").parentElement.scrollTop=0');await capture('catalog.png');s=await snapshot();assert.deepEqual(s.map.objects.map(o=>o.type),[1,2,3,4,5,6,7,8,9,10,11,12]);assert.deepEqual(s.errors,[]);
  await click('#play');await wait(s=>s.playing,'catalog preview');
  for(const [id,dx,dy,expected] of [['sample-3',120,0,90],['sample-4',50,-29,1]]) {
    s=await snapshot();if(id==='sample-3'){const f=s.wheelFrames[id],cx=s.canvas.x+f.center[0],cy=s.canvas.y+f.center[1],radius=Math.hypot(...f.right)*.76,angle=Math.atan2(f.right[1],f.right[0]);await mouse('mouseMoved',cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius);await mouse('mousePressed',cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius,true);for(let i=1;i<=12;i++){const a=angle+f.direction*Math.PI/2*i/12;await mouse('mouseMoved',cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,true);await new Promise(r=>setTimeout(r,25));}const a=angle+f.direction*Math.PI/2;await mouse('mouseReleased',cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);s=await snapshot();assert.equal(s.runtime.poses.mechanisms[id],expected);continue;}
    const p=s.targets[id],x=s.canvas.x+p[0],y=s.canvas.y+p[1];
    await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y,true);for(let i=1;i<=8;i++){await mouse('mouseMoved',x+dx*i/8,y+dy*i/8,true);await new Promise(r=>setTimeout(r,25));}await mouse('mouseReleased',x+dx,y+dy);
    s=await snapshot();if(id==='sample-3')assert.equal(s.runtime.poses.mechanisms[id],expected);else assert.ok(s.runtime.poses.mechanisms[id]>0);
  }
  checks.push('authored rotation and translation mechanisms respond to real pointer drags');await click('#play');
  await evaluate(`document.querySelector('#result').textContent=JSON.stringify({status:'passed',checks:${JSON.stringify(checks)}})`);
}});
writeFileSync(resolve(output,'final.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks,output},null,2));
