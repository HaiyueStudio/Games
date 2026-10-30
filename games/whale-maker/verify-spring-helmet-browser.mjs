import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(root,'artifacts/whale-maker-spring-helmet');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},timeoutMs:90000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},interact:async cdp=>{
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
 const capture=async name=>{await delay(100);const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));};
 const load=async(setup='',spawn=[32.1,17])=>evaluate(`(()=>{const g=window.__whaleMaker;g.editing=false;g.campaignActive=false;const width=100,height=32,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';const put=(x,y,t)=>cells[y*width+x]=t;put(95,19,'E');${setup}g.level={version:1,name:'横弹簧承托与铁盆顶击',width,height,cells,spawn:${JSON.stringify(spawn)}};g.state.phase='playing';g.restart();g.paused=true;g.notice='';g.clearControls();g.draw();})()`);
 const advance=(n,keys=[])=>evaluate(`(()=>{const g=window.__whaleMaker;g.clearControls();${keys.map(k=>`g.keys.add('${k}');`).join('')}g.paused=false;for(let n=0;n<${n};n++)g.tick(1/120);g.paused=true;g.draw();})()`);
 for(let n=0;n<180;n++){if(await evaluate('document.body?.dataset.renderStatus==="passed"'))break;await delay(200);}assert.equal(await evaluate('document.body?.dataset.renderStatus'),'passed');
 const measurements={};
 await load("put(32,19,'spring-h');");await advance(90);
 measurements.standing=await evaluate('(()=>{const s=window.__whaleMaker.state;return {feet:s.player.y+s.player.h,top:s.items[0].y,grounded:s.grounded,vx:s.player.vx,wallKick:s.wallKick,effects:s.springEffects.length};})()');
 assert.ok(measurements.standing.grounded);assert.ok(Math.abs(measurements.standing.feet-measurements.standing.top)<1e-8);assert.equal(measurements.standing.vx,0);assert.equal(measurements.standing.wallKick,0);assert.equal(measurements.standing.effects,0);await capture('player-standing-on-horizontal-spring.png');
 await advance(10,['ArrowRight']);assert.equal(await evaluate('window.__whaleMaker.state.grounded'),true);assert.equal(await evaluate('window.__whaleMaker.state.wallKick'),0);await capture('player-walking-on-horizontal-spring.png');
 await advance(1,['Space']);assert.ok(await evaluate('window.__whaleMaker.state.player.vy')< -10);await advance(12,['Space']);await capture('player-jumping-off-horizontal-spring.png');
 await load("put(32,19,'spring-h');put(32,17,'J');",[28,19.2]);await evaluate('window.__whaleMaker.state.enemies[0].vx=0');await advance(90);
 measurements.enemy=await evaluate('(()=>{const s=window.__whaleMaker.state,e=s.enemies[0];return {feet:e.y+e.h,top:s.items[0].y,grounded:e.grounded,vx:e.vx,effects:s.springEffects.length};})()');
 assert.ok(measurements.enemy.grounded);assert.ok(Math.abs(measurements.enemy.feet-measurements.enemy.top)<1e-8);assert.equal(measurements.enemy.vx,0);assert.equal(measurements.enemy.effects,0);await capture('enemy-standing-on-horizontal-spring.png');
 await evaluate('window.__whaleMaker.state.enemies[0].vx=1.5');await advance(24);assert.equal(await evaluate('window.__whaleMaker.state.enemies[0].vx'),1.5);assert.equal(await evaluate('window.__whaleMaker.state.enemies[0].grounded'),true);await capture('enemy-walking-on-horizontal-spring.png');
 for(const direction of [-1,1]){
  await load("put(32,19,'spring-h');",[direction<0?31.21:32.89,19.2]);await advance(1);assert.equal(await evaluate('window.__whaleMaker.state.player.vx'),direction*9.6);await advance(3);await capture(direction<0?'spring-side-launch-left.png':'spring-side-launch-right.png');
 }
 for(const tall of [false,true]){
  await load("put(32,15,'J');",[32.1,16.07]);await evaluate(`(()=>{const s=window.__whaleMaker.state;s.helmet=true;s.power=${tall?1:0};s.player.h=${tall?2:.8};s.player.vy=-9;s.grounded=false;s.enemies[0].vx=0;})()`);await capture(tall?'helmet-tall-before-bonk.png':'helmet-small-before-bonk.png');await advance(2,['Space']);
  assert.equal(await evaluate('window.__whaleMaker.state.enemies[0].alive'),false);assert.equal(await evaluate('window.__whaleMaker.state.helmet'),true);assert.equal(await evaluate('window.__whaleMaker.state.phase'),'playing');assert.equal(await evaluate('window.__whaleMaker.state.defeated[0].cause'),'block');await advance(6,['Space']);await capture(tall?'helmet-tall-enemy-flung.png':'helmet-small-enemy-flung.png');
 }
 await load("put(32,19,'J');",[32.1,19.2]);await evaluate('(()=>{const s=window.__whaleMaker.state;s.helmet=true;s.power=1;s.player.h=2;s.player.y=18;s.enemies[0].vx=0;})()');await advance(1);assert.equal(await evaluate('window.__whaleMaker.state.helmet'),false);assert.equal(await evaluate('window.__whaleMaker.state.power'),0);assert.equal(await evaluate('window.__whaleMaker.state.enemies[0].alive'),true);await capture('helmet-side-hit-still-damages.png');
 assert.equal(await evaluate('window.__whaleMaker.scene.draws.every(d=>window.__whaleMaker.scene.sources.has(d.id))'),true);writeFileSync(resolve(output,'measurements.json'),JSON.stringify(measurements,null,2));await evaluate('window.__whaleMaker.destroy()');await evaluate(`(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.textContent=JSON.stringify({status:'passed',checks:['player-spring-top-standing','player-spring-top-walking','player-spring-top-jump','enemy-spring-top-standing','enemy-spring-top-walking','spring-side-launch-both-directions','small-helmet-head-bonk','tall-helmet-head-bonk','helmet-side-damage','native-2d-materials']});n.hidden=true;document.body.append(n);})()`);
}});
writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));assert.equal(result.status,'passed',JSON.stringify(result));console.log(JSON.stringify({status:result.status,checks:result.checks,diagnostics:result.browserDiagnostics}));
