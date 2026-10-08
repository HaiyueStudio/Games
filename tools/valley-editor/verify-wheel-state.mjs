import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {emptyMap,createObject,serializeMap} from '../../games/valley-of-light/map/model.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const map=emptyMap();map.id='wheel-availability';map.name='手轮收放';map.groups=[{id:'bridge',name:'控制组',pivot:[0,0,0]},{id:'nested',name:'子组',pivot:[0,0,0],parentId:'bridge'},{id:'decoration-group',name:'开关目标',pivot:[0,0,0]}];
map.objects=[createObject(9,'start'),createObject(1,'road-1',[1,0,0]),createObject(1,'controlled',[2,0,0]),createObject(1,'road-3',[3,0,0]),createObject(10,'exit',[4,0,0]),createObject(3,'wheel',[-1,0,1]),createObject(8,'switch',[0,0,1]),createObject(1,'decoration',[3,0,-2])];
map.objects[2].groupId='nested';map.objects[5].motion.targetGroup='bridge';map.objects[7].groupId='decoration-group';map.objects[6].trigger.actions=[{groupId:'decoration-group',translation:[0,1,0],rotation:[0,0,0],duration:.8,easing:'smooth'}];const json=serializeMap(map);writeFileSync(resolve(output,'wheel-state-map.json'),json);
for(const editor of [true,false]){
 const label=editor?'wheel-state-editor':'wheel-state-game';let metrics;
 const result=await runChromeWebGpuFixture({root,fixture:editor?'tools/valley-editor/index.html':'games/valley-of-light/index.html',query:editor?{verify:1}:{verify:1,map:'../../artifacts/valley-editor/wheel-state-map.json'},timeoutMs:90000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  const expression=editor?'window.__valleyEditor?.snapshot()':'window.__valleyMapPlayer?.snapshot()';
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const snapshot=()=>evaluate(expression),state=s=>editor?s.runtime:s,wheel=s=>s.wheelStates.wheel,pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function wait(test,label){for(let i=0;i<300;i++){const s=await snapshot();if(test(s))return s;await pause(40);}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function mouse(type,x,y,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'&&!held?'none':'left',buttons:held?1:0,clickCount:1});}
  async function point(x,y){await mouse('mouseMoved',x,y);await mouse('mousePressed',x,y,true);await mouse('mouseReleased',x,y);await pause(50);}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(...p);}
  const canvas=()=>evaluate("(()=>{const r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x,y:r.y}})()");
  async function target(id){const s=await snapshot(),p=s.targets[id],c=await canvas();await point(c.x+p[0],c.y+p[1]);}
  async function turn(degrees,radius=.76){const s=await snapshot(),f=s.wheelFrames.wheel,c=await canvas(),cx=c.x+f.center[0],cy=c.y+f.center[1],r=Math.hypot(...f.right)*radius,angle=Math.atan2(f.right[1],f.right[0]);await mouse('mouseMoved',cx+r*Math.cos(angle),cy+r*Math.sin(angle));await mouse('mousePressed',cx+r*Math.cos(angle),cy+r*Math.sin(angle),true);for(let i=1;i<=40;i++){const a=angle+degrees*Math.PI/180*f.direction*i/40;await mouse('mouseMoved',cx+r*Math.cos(a),cy+r*Math.sin(a),true);await pause(10);}const a=angle+degrees*Math.PI/180*f.direction;await mouse('mouseReleased',cx+r*Math.cos(a),cy+r*Math.sin(a));await pause(70);}
  async function capture(name){const png=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,label+'-'+name+'.png'),Buffer.from(png.result.data,'base64'));}
  await wait(s=>!!s?.map,'ready');if(editor){await click('#json');await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(json)}`);await click('#apply-json');await click('#fit');await click('#play');}
  let s=await wait(s=>s.model==='loaded'&&s.performance.state==='ready'&&wheel(s)?.open===1,'expanded');
  await evaluate(`window.__wheelFrames=[];window.__recordWheel=true;const record=()=>{const s=${expression},r=${editor?'s.runtime':'s'};if(r)window.__wheelFrames.push({wheel:s.wheelStates.wheel,angle:r.poses.mechanisms.wheel??0,walking:r.walking,busy:r.busy,at:r.at.objectId,completed:r.completed});if(window.__recordWheel)requestAnimationFrame(record);};requestAnimationFrame(record)`);
  await capture('expanded');await turn(360);s=await snapshot();assert.equal(state(s).poses.mechanisms.wheel,360,'active wheel turns continuously');
  await target('controlled');await wait(s=>wheel(s).disabled&&wheel(s).open>0&&wheel(s).open<1,'fold animation during walking');s=await wait(s=>!state(s).walking&&state(s).at.objectId==='controlled'&&wheel(s).open===0,'occupied nested target keeps wheel folded');await capture('folded');
  assert.ok(wheel(s).gripPositions.every(p=>Math.abs(Math.hypot(...p)-.26)<1e-6),'rendered grips retract into hub');
  const c=await canvas(),f=s.wheelFrames.wheel;await point(c.x+f.center[0],c.y+f.center[1]);await turn(90,.2);s=await snapshot();assert.equal(state(s).at.objectId,'controlled');assert.equal(state(s).walking,false,'disabled hub cannot create a walking command');assert.equal(state(s).poses.mechanisms.wheel,360);
  await target('start');await wait(s=>!state(s).walking&&!wheel(s).disabled&&wheel(s).open>0&&wheel(s).open<1,'unfold after leaving target');s=await wait(s=>wheel(s).open===1,'fully expanded again');await capture('reopened');assert.ok(wheel(s).gripPositions.every(p=>Math.abs(Math.hypot(...p)-.76)<1e-6));assert.equal(state(s).poses.mechanisms.wheel,360);
  await turn(-360);assert.equal(state(await snapshot()).poses.mechanisms.wheel,0,'reopened wheel is interactive');
  await target('switch');await wait(s=>state(s).busy&&wheel(s).disabled&&wheel(s).open===0,'switch animation disables wheel');await wait(s=>!state(s).busy&&wheel(s).open===1,'switch completion reopens wheel');
  await target('exit');s=await wait(s=>state(s).completed&&wheel(s).open===0,'completion keeps wheel disabled');assert.deepEqual(s.errors,[]);
  const frames=await evaluate('window.__recordWheel=false;window.__wheelFrames');assert.ok(frames.some(f=>f.wheel.disabled&&f.wheel.open>0&&f.wheel.open<1));assert.ok(frames.some(f=>!f.wheel.disabled&&f.wheel.open>0&&f.wheel.open<1));for(let i=1;i<frames.length;i++)assert.ok(Math.abs(frames[i].wheel.open-frames[i-1].wheel.open)<.25,'no one-frame fold/unfold pop');writeFileSync(resolve(output,label+'-frames.json'),JSON.stringify(frames,null,2));metrics={frames:frames.length,checks:['walk folds','occupied nested group remains disabled','disabled hub ignores click and drag','leave group unfolds','rotation preserved','reopened wheel rotates','switch animation locks','completion stays folded']};
  if(editor){await click('#play');s=await snapshot();assert.equal(s.playing,false);assert.equal(wheel(s).open,1,'editor restores fully open handles');}
 }});
 assert.equal(result.status,'passed');delete result.visualCapture.pngBase64;writeFileSync(resolve(output,label+'-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({label,status:result.status,...metrics}));
}
