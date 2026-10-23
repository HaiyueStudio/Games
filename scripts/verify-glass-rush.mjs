import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'.artifacts/glass-rush');mkdirSync(output,{recursive:true});
const portrait=process.argv.includes('--portrait');
const result=await runChromeWebGpuFixture({root,fixture:'games/glass-rush/index.html',query:{seed:42,verify:1},timeoutMs:45000,visualCapture:{viewportWidth:portrait?390:1280,viewportHeight:portrait?844:800},interact:async cdp=>{
 const response=await cdp.call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<200&&!window.__glassRush;i++){if(document.body.dataset.renderStatus==='failed')throw Error(document.querySelector('#status').textContent);await wait(100);}
  if(!window.__glassRush)throw Error('Game did not initialize');
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
  key('keydown','Enter');await wait(500);const before=window.__glassRush.round.angle;
  key('keydown','ArrowRight');await wait(600);key('keyup','ArrowRight');const after=window.__glassRush.round.angle;
  if(Math.abs(after-before)<.5)throw Error('Held keyboard steering failed');
  key('keydown','KeyP');const paused=window.__glassRush.round.time;await wait(200);if(window.__glassRush.round.time!==paused)throw Error('Pause failed');
  key('keydown','KeyP');await wait(900);
  const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
  const snap=window.__glassRush;
  if(!snap.hud.nodes.some(n=>n.type==='GuiButton'))throw Error('Engine GUI missing');
  const result={status:'passed',checks:{ready:true,heldSteering:true,pause:true,engineGui:true},snapshot:snap,canvas:[rect.width,rect.height]};
  const node=document.createElement('script');node.id='result';node.type='application/json';node.dataset.status='passed';node.textContent=JSON.stringify(result);document.body.append(node);return result;
 })()`});
 if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));
 const evaluate=async expression=>(await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result?.result?.value;
 const before=await evaluate('window.__glassRush.round.angle');
 await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400,id:1}]});
 await evaluate('new Promise(r=>setTimeout(r,450))');
 await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await evaluate('window.__glassRush.round.angle');if(Math.abs(after-before)<.4)throw Error('Held half-screen touch failed');
 await evaluate(`(()=>{const node=document.querySelector('#result'),r=JSON.parse(node.textContent);r.checks.heldTouch=true;r.snapshot=window.__glassRush;node.textContent=JSON.stringify(r)})()`);
 if(process.argv.includes('--full')) {
  const complete=await evaluate(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));let held='';
   for(let i=0;i<900 && window.__glassRush.round.phase!=='over';i++){
    const r=window.__glassRush.round,g=r.gates.find(g=>!g.passed);if(!g){await wait(50);continue;}
    const d=Math.atan2(Math.sin(g.angle-r.angle),Math.cos(g.angle-r.angle));const next=Math.abs(d)<.07?'':d>0?'ArrowRight':'ArrowLeft';
    if(held!==next){if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:held}));if(next)window.dispatchEvent(new KeyboardEvent('keydown',{code:next}));held=next;}
    await wait(50);
   }
   if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:held}));await wait(150);
   const r=window.__glassRush;if(r.round.phase!=='over'||r.round.hits!==4||r.records.length!==1)throw Error('Fourth collision / record integration failed');
   const node=document.querySelector('#result'),out=JSON.parse(node.textContent);out.checks.fourthCollision=true;out.checks.savedRecord=true;out.finished=r;node.textContent=JSON.stringify(out);
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter'}));await wait(1500);return true;
  })()`);
  if(!complete)throw Error('Full gameplay verification did not finish');
 }
}});
const stem=portrait?'portrait':'browser';
writeFileSync(resolve(output,stem+'.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,stem+'.json'),JSON.stringify(result,null,2));
if(result.visualCapture.darkRatio>.995)throw Error('Rendered screenshot is blank');
if(!portrait)writeFileSync(resolve(root,'site/screenshots/glass-rush.png'),Buffer.from((await import('node:fs')).readFileSync(resolve(output,'browser.png'))));
console.log(JSON.stringify({status:result.status,checks:result.checks,screenshot:resolve(output,stem+'.png'),diagnostics:result.browserDiagnostics}));
