import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'.artifacts/glass-rush');mkdirSync(output,{recursive:true});
const portrait=process.argv.includes('--portrait');
const scene=process.argv.find(arg=>arg.startsWith('--scene='))?.slice(8);
if(scene&&!['tunnel','impact','impact-center','impact-camera','shatter','shatter-near'].includes(scene))throw Error(`Unknown Glass Rush scene: ${scene}`);
const result=await runChromeWebGpuFixture({root,fixture:'games/glass-rush/index.html',query:{seed:42,verify:1,...(scene?{scene}:{})},timeoutMs:60000,visualCapture:{viewportWidth:portrait?390:1280,viewportHeight:portrait?844:800},interact:async cdp=>{
 if(scene){
  const response=await cdp.call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   for(let i=0;i<200&&!window.__glassRush;i++){
    if(document.body.dataset.renderStatus==='failed')throw Error(document.querySelector('#status').textContent);
    await new Promise(r=>setTimeout(r,100));
   }
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   await new Promise(r=>setTimeout(r,200));
   const snap=window.__glassRush;if(!snap||snap.rendering.ballTriangles<500||snap.rendering.meshes<4)throw Error('Separated geometry missing');
   if(${JSON.stringify(scene)}!=='tunnel'&&snap.rendering.impactCount!==1)throw Error('Impact geometry missing');
   const node=document.createElement('script');node.id='result';node.type='application/json';node.dataset.status='passed';node.textContent=JSON.stringify({status:'passed',scene:${JSON.stringify(scene)},checks:{ready:true,separatedSphere:true,obstacleMeshes:true},snapshot:snap});document.body.append(node);
  })()`});
  if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));
  return;
 }
 const response=await cdp.call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<200&&!window.__glassRush;i++){if(document.body.dataset.renderStatus==='failed')throw Error(document.querySelector('#status').textContent);await wait(100);}
  if(!window.__glassRush)throw Error('Game did not initialize');
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
  key('keydown','Enter');await wait(500);const before=window.__glassRush.round.angle;
  const initialAudio=window.__glassRush.audio;
  if(!initialAudio.musicPlaying||initialAudio.backend.buffers!==3||initialAudio.backend.voices!==1||initialAudio.backend.error)throw Error('Background music did not start');
  key('keydown','ArrowRight');await wait(600);key('keyup','ArrowRight');const after=window.__glassRush.round.angle;
  if(Math.atan2(Math.sin(after-before),Math.cos(after-before))>-.5)throw Error('Right keyboard steering is reversed or inactive');
  key('keydown','KeyP');const paused=window.__glassRush.round.time;await wait(200);if(window.__glassRush.round.time!==paused)throw Error('Pause failed');
  if(window.__glassRush.audio.backend.state!=='suspended')throw Error('Audio did not pause');
  key('keydown','KeyP');await wait(900);
  if(!window.__glassRush.audio.musicPlaying||window.__glassRush.audio.played.music!==1)throw Error('Resume duplicated music');
  key('keydown','KeyM');await wait(150);if(!window.__glassRush.audio.muted||window.__glassRush.audio.backend.voices!==0)throw Error('Mute did not stop voices');
  key('keydown','KeyM');await wait(150);if(!window.__glassRush.audio.musicPlaying||window.__glassRush.audio.backend.voices!==1)throw Error('Unmute duplicated or lost music');
  const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
  const snap=window.__glassRush;
  if(!snap.hud.nodes.some(n=>n.type==='GuiButton'))throw Error('Engine GUI missing');
  const result={status:'passed',checks:{ready:true,heldSteering:true,correctDirection:true,pause:true,engineGui:true,music:true,audioPauseResume:true,mute:true},snapshot:snap,canvas:[rect.width,rect.height]};
  const node=document.createElement('script');node.id='result';node.type='application/json';node.dataset.status='passed';node.textContent=JSON.stringify(result);document.body.append(node);return result;
 })()`});
 if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));
 const evaluate=async expression=>(await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result?.result?.value;
 const before=await evaluate('window.__glassRush.round.angle');
 await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400,id:1}]});
 await evaluate('new Promise(r=>setTimeout(r,450))');
 await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await evaluate('window.__glassRush.round.angle');if(Math.atan2(Math.sin(after-before),Math.cos(after-before))<.4)throw Error('Left half-screen steering is reversed or inactive');
 await evaluate(`(()=>{const node=document.querySelector('#result'),r=JSON.parse(node.textContent);r.checks.heldTouch=true;r.snapshot=window.__glassRush;node.textContent=JSON.stringify(r)})()`);
 if(process.argv.includes('--full')) {
  const complete=await evaluate(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));let held='';
   for(let i=0;i<900 && window.__glassRush.round.phase!=='over';i++){
    const r=window.__glassRush.round,g=r.gates.find(g=>!g.passed);if(!g){await wait(50);continue;}
    const target=g.angle+(g.shape==='diamonds'?g.width*.65:0);
    const d=Math.atan2(Math.sin(target-r.angle),Math.cos(target-r.angle));const next=Math.abs(d)<.07?'':d>0?'ArrowLeft':'ArrowRight';
    if(held!==next){if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:held}));if(next)window.dispatchEvent(new KeyboardEvent('keydown',{code:next}));held=next;}
    await wait(50);
   }
   if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:held}));await wait(150);
   const r=window.__glassRush;if(r.round.phase!=='over'||r.round.hits!==4||r.records.length!==1)throw Error('Fourth collision / record integration failed');
   if(!r.round.impacts.length||!r.round.impacts.every(i=>i.gate.shattered))throw Error('Collided obstacles did not shatter');
   if(r.audio.played.impact!==3||r.audio.played.shatter!==1||r.audio.musicPlaying||r.audio.backend.error)throw Error('Collision sound transitions failed');
   const node=document.querySelector('#result'),out=JSON.parse(node.textContent);out.checks.fourthCollision=true;out.checks.savedRecord=true;out.checks.fractureAudio=true;out.finished=r;node.textContent=JSON.stringify(out);
   await wait(3200);if(window.__glassRush.round.impacts.length)throw Error('Impact resources did not expire');
   if(window.__glassRush.audio.backend.voices!==0)throw Error('Game over retained audio voices');
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter'}));await wait(1500);
   if(window.__glassRush.round.hits||window.__glassRush.round.impacts.length||window.__glassRush.rendering.meshes>32)throw Error('Restart retained effects');
   if(!window.__glassRush.audio.musicPlaying||window.__glassRush.audio.backend.voices!==1)throw Error('Restart duplicated audio');return true;
  })()`);
  if(!complete)throw Error('Full gameplay verification did not finish');
 }
}});
const generation=JSON.parse(readFileSync(resolve(root,'games/glass-rush/assets/audio/generation.json'),'utf8'));
for(const asset of generation.assets){
 const served=result.httpProvenance.files.find(file=>file.sourcePath===`games/glass-rush/assets/audio/${asset.id}.wav`);
 if(!served||served.sha256!==asset.sha256||served.byteLength!==asset.bytes)throw Error(`Audio HTTP provenance mismatch: ${asset.id}`);
}
result.checks.audioAssetProvenance=true;
const stem=(scene??'browser')+(portrait?'-portrait':'');
writeFileSync(resolve(output,stem+'.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,stem+'.json'),JSON.stringify(result,null,2));
if(result.visualCapture.darkRatio>.995)throw Error('Rendered screenshot is blank');
// Promote a thumbnail only after reviewing the captured image.
if(process.argv.includes('--update-thumbnail'))writeFileSync(resolve(root,'site/screenshots/glass-rush.png'),(await import('node:fs')).readFileSync(resolve(output,stem+'.png')));
console.log(JSON.stringify({status:result.status,checks:result.checks,screenshot:resolve(output,stem+'.png'),diagnostics:result.browserDiagnostics}));
