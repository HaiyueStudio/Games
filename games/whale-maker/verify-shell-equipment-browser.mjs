import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(root,'artifacts/whale-maker-shell-equipment');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},timeoutMs:180000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},interact:async cdp=>{
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
 const capture=async name=>{await delay(150);const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));};
 const load=async(setup='',spawn=[32.1,19.2])=>evaluate(`(()=>{const g=window.__whaleMaker;g.editing=false;g.campaignActive=false;const width=100,height=32,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';const put=(x,y,t)=>cells[y*width+x]=t;put(95,19,'E');${setup}g.level={version:1,name:'龟壳装备与骨头漂流',width,height,cells,spawn:${JSON.stringify(spawn)}};g.state.phase='playing';g.restart();g.paused=true;g.notice='';g.clearControls();g.draw();})()`);
 const advance=(n,keys=[])=>evaluate(`(()=>{const g=window.__whaleMaker;g.clearControls();${keys.map(k=>`g.keys.add('${k}');`).join('')}g.paused=false;for(let n=0;n<${n};n++)g.tick(1/120);g.paused=true;g.draw();})()`);
 for(let n=0;n<240;n++){if(await evaluate('document.body?.dataset.renderStatus==="passed"'))break;await delay(200);}assert.equal(await evaluate('document.body?.dataset.renderStatus'),'passed');
 const measurements={};
 measurements.helmetDamage=[];
 for(const gear of ['basin','shell-helmet','spike-shell-helmet'])for(const power of [1,2,3,4]){
  await load("put(32,19,'J');",[32.1,18]);await evaluate(`(()=>{const s=window.__whaleMaker.state;s.power=${power};s.player.h=2;s.player.w=${power===3?1.9:.9};s.helmet=${gear==='basin'};s.shellHelmet=${JSON.stringify(gear==='basin'?null:gear)};s.enemies[0].vx=0;})()`);await advance(1);
  const hit=await evaluate('(()=>{const s=window.__whaleMaker.state;return {helmet:s.helmet,shellHelmet:s.shellHelmet,power:s.power,phase:s.phase,protected:s.invincible>0};})()');assert.equal(hit.helmet,false);assert.equal(hit.shellHelmet,null);assert.equal(hit.power,power);assert.equal(hit.phase,'playing');assert.equal(hit.protected,true);measurements.helmetDamage.push({gear,...hit});
  if(gear==='basin')await capture(`helmet-hit-retains-power-${power}.png`);await advance(30);assert.equal(await evaluate('window.__whaleMaker.state.power'),power);
 }
 for(const kind of ['shell-helmet','spike-shell-helmet']){
  await load(`put(32,19,'${kind}');put(35,19,'bone-shell');`);await advance(40);assert.equal(await evaluate('window.__whaleMaker.state.shellHelmet'),kind);await capture(`${kind}-equipped.png`);
 }
 await load("put(32,15,'cannon');put(32,14,'cannon-body');",[32.1,16.02]);await evaluate('(()=>{const s=window.__whaleMaker.state;s.helmet=true;s.player.vy=-9;s.grounded=false;s.turrets[0].wait=99;})()');await advance(2);measurements.turret=await evaluate('(()=>{const s=window.__whaleMaker.state;return {vy:s.turrets[0].vy,y:s.turrets[0].y,helmet:s.helmet,phase:s.phase};})()');assert.ok(measurements.turret.vy<0);assert.ok(measurements.turret.y<14);assert.equal(measurements.turret.helmet,true);await capture('basin-lifts-cannon.png');
 await load("put(32,12,'stone');put(33,12,'stone-body');put(32,13,'stone-body');put(33,13,'stone-body');",[32.5,14.03]);await evaluate('(()=>{const s=window.__whaleMaker.state;s.helmet=true;s.player.vy=-9;s.grounded=false;})()');await advance(2);await evaluate('window.__whaleMaker.state.player.x=26');await advance(110);measurements.stone=await evaluate('(()=>{const r=window.__whaleMaker.state.stones[0];return {y:r.y,home:r.origin,phase:r.phase};})()');assert.ok(measurements.stone.home[1]<12);assert.equal(measurements.stone.y,measurements.stone.home[1]);await capture('stone-new-home.png');
 for(const kind of ['water','lava']){
  await load(`for(let y=17;y<20;y++)for(let x=28;x<48;x++)put(x,y,'${kind}');put(32,15,'bone-shell');`,[32.1,14]);await advance(180);assert.equal(await evaluate('window.__whaleMaker.state.riding?.kind'),'bone-shell');assert.equal(await evaluate('window.__whaleMaker.state.phase'),'playing');await capture(`bone-shell-${kind}.png`);
  await advance(1,['ArrowDown']);assert.equal(await evaluate('window.__whaleMaker.state.boneTime'),5);await capture(`bone-rest-${kind}.png`);await advance(599,['ArrowDown']);assert.ok(await evaluate('window.__whaleMaker.state.boneTime')>0);await advance(1,['ArrowDown']);assert.equal(await evaluate('window.__whaleMaker.state.boneTime'),0);assert.equal(await evaluate('window.__whaleMaker.state.phase'),'playing');await capture(`bone-restored-${kind}.png`);
  measurements[kind]=await evaluate('(()=>{const s=window.__whaleMaker.state;return {phase:s.phase,feet:s.player.y+s.player.h,grounded:s.grounded,swimming:s.swimming,boneTime:s.boneTime};})()');
 }
 assert.equal(await evaluate('window.__whaleMaker.scene.draws.every(d=>window.__whaleMaker.scene.sources.has(d.id))'),true);
 await load("put(32,19,'shell-helmet');put(34,19,'spike-shell-helmet');put(36,19,'bone-shell');");
 measurements.editor=await evaluate(`(()=>{const g=window.__whaleMaker;g.editing=true;g.editCamera=28;g.editY=8;g.paletteCategory=2;g.palettePage=g.paletteNodes.at(-1).page;g.draw();return ['shell-helmet','spike-shell-helmet','bone-shell'].map(kind=>{const [image,uv,frame]=g.editorIcon(kind);return {kind,loaded:image.complete&&image.naturalWidth>0,frame,uv};});})()`);
 assert.ok(measurements.editor.every(i=>i.loaded));assert.deepEqual(measurements.editor.map(i=>i.frame),[0,1,2]);await capture('editor-shell-equipment.png');
 writeFileSync(resolve(output,'measurements.json'),JSON.stringify(measurements,null,2));await evaluate('window.__whaleMaker.destroy()');await evaluate(`(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.textContent=JSON.stringify({status:'passed',checks:['helmet-priority-four-body-powers','shell-helmet-equipped','spike-shell-helmet-equipped','basin-lifts-cannon','stone-new-home','bone-shell-water','bone-shell-lava','five-second-bone-rest','automatic-restoration','native-2d-materials','editor-shell-equipment']});n.hidden=true;document.body.append(n);})()`);
}});
writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));assert.equal(result.status,'passed',JSON.stringify(result));console.log(JSON.stringify({status:result.status,checks:result.checks,diagnostics:result.browserDiagnostics}));
