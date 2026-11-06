import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(root,'artifacts/whale-maker-goal-camera');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},timeoutMs:90000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},interact:async cdp=>{
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
 const capture=async name=>{await delay(100);const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));};
 for(let n=0;n<180;n++){if(await evaluate('document.body?.dataset.renderStatus==="passed"'))break;await delay(200);}assert.equal(await evaluate('document.body?.dataset.renderStatus'),'passed');
 const measurements=[];
 for(const power of [0,1,3]){
  await evaluate(`(()=>{const g=window.__whaleMaker;g.startClassic();g.campaignActive=false;g.paused=true;
   ${power?`const width=80,height=40,cells=Array(width*height).fill('.');for(let y=34;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[33*width+40]='E';g.level={version:1,name:'深层旗杆镜头校验',width,height,cells,spawn:[2,32.2]};g.restart();g.paused=true;`:''}
   const s=g.state,id=s.level.cells.indexOf('E'),base=Math.floor(id/s.level.width);s.power=${power};s.player.w=${power===3?2:power?1:.65};s.player.h=${power?2:.8};Object.assign(s.player,{x:id%s.level.width+.2,y:base-8.5,vx:0,vy:0});s.grounded=false;s.invincible=0;g.camera=id%s.level.width-16;g.cameraY=base-14;g.clearControls();window.__goalCameraSamples=[];
  })()`);
  const advanceUntil=async stop=>evaluate(`(()=>{const g=window.__whaleMaker;g.paused=false;for(let n=0;n<900;n++){
   g.tick(1/120);const s=g.state,p=s.player,v=s.victory;if(!v)continue;
   const top=p.y-g.cameraY,bottom=p.y+p.h-g.cameraY;
   if(v.stage!=='done'&&(top<-.001||bottom>12.001))throw Error('Character outside viewport: '+JSON.stringify({power:s.power,stage:v.stage,top,bottom,cameraY:g.cameraY}));
   window.__goalCameraSamples.push({stage:v.stage,cameraY:g.cameraY,cameraX:g.camera,top,bottom});
   if(${stop})break;
  }g.paused=true;g.draw();return {stage:g.state.victory?.stage,cameraY:g.cameraY,feet:g.state.player.y+g.state.player.h};})()`);
  await advanceUntil("v.stage==='slide'&&v.flagProgress>0.1");assert.equal(await evaluate('window.__whaleMaker.state.victory.stage'),'slide');await capture(`power-${power}-slide-high.png`);
  await advanceUntil("v.stage==='slide'&&v.flagProgress>0.75");await capture(`power-${power}-slide-low.png`);
  const landed=await advanceUntil("v.stage==='cheer'");assert.equal(landed.stage,'cheer');assert.ok(landed.cameraY>=landed.feet-11-.001);await capture(`power-${power}-flag-foot.png`);
  const end=await advanceUntil("v.stage==='done'");assert.equal(end.stage,'done');await capture(`power-${power}-castle-entry.png`);
  const samples=await evaluate('window.__goalCameraSamples');assert.ok(new Set(samples.map(s=>s.stage)).has('walk'));assert.ok(samples.at(-1).cameraY>samples[0].cameraY+2);assert.ok(samples.filter(s=>s.stage==='slide').every(s=>s.bottom<=11.001));measurements.push({power,start:samples[0],end:samples.at(-1),frames:samples.length});
 }
 writeFileSync(resolve(output,'measurements.json'),JSON.stringify(measurements,null,2));
 await evaluate('window.__whaleMaker.destroy()');await evaluate(`(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.textContent=JSON.stringify({status:'passed',checks:['high-flag-slide-camera','slide-foot-visible','celebration-visible','castle-walk-camera','small-tall-giant','deep-level-camera-bounds']});n.hidden=true;document.body.append(n);})()`);
}});
writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));assert.equal(result.status,'passed',JSON.stringify(result));console.log(JSON.stringify({status:result.status,checks:result.checks,diagnostics:result.browserDiagnostics}));
