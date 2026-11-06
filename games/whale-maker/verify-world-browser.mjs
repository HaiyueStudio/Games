import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(root,'artifacts/whale-maker-world');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},timeoutMs:90000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},interact:async cdp=>{
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
 const capture=async name=>{const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));};
 for(let n=0;n<180;n++){if(await evaluate('document.body?.dataset.renderStatus==="passed"'))break;await delay(200);}assert.equal(await evaluate('document.body?.dataset.renderStatus'),'passed');
 const reads=await evaluate(`(()=>{
  const g=window.__whaleMaker;g.engine.stop();const width=240,height=40,cells=Array(width*height).fill('.');for(const y of [30,31])for(let x=0;x<8;x++)cells[y*width+x]='#';cells[29*width+235]='E';
  g.level={version:1,name:'远景刷新校验',width,height,cells,spawn:[2,29.2],properties:{},contents:{},backdrop:'castle'};g.editing=false;g.state.phase='playing';g.restart();g.paused=true;g.camera=0;g.cameraY=22;
  let far=0;g.state.level.cells=new Proxy(g.state.level.cells,{get(target,key){if(typeof key==='string'&&/^\\d+$/.test(key)&&Number(key)%width>=100)far++;return Reflect.get(target,key);}});
  g.draw();const initial=far;far=0;for(let n=0;n<20;n++)g.draw();return {initial,cached:far};
 })()`);
 assert.ok(reads.initial>1000,'the first query reads the whole map');assert.equal(reads.cached,0,'subsequent frames never scan offscreen terrain');
 await evaluate('window.__whaleMaker.engine.run()');await delay(100);await capture('play-cached-horizon.png');
 await evaluate(`(()=>{const g=window.__whaleMaker;g.editing=true;g.editY=24;g.editCamera=0;g.selected='#';g.editorTool='paint';g.history=[];g.redo=[];g.selection.clear();g.draw();})()`);await delay(90);
 const groundY=async()=>await evaluate(`(()=>{const g=window.__whaleMaker;g.draw();return g.scene.draws.find(d=>d.id==='backdrops:0')?.rect.y;})()`);
 const initialY=await groundY();assert.ok(Number.isFinite(initialY));
 // A single drag records one undo item but spans multiple rendered frames.
 // Its ninth coral tile makes the new platform the dominant ground row.
 const y=166+(28-24+.5)*36+30;
 await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:228,y});await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:228,y,button:'left',buttons:1,clickCount:1});
 for(let x=1;x<9;x++){await delay(30);await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:210+(x+.5)*36,y,button:'left',buttons:1});}
 await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:516,y,button:'left',clickCount:1});await delay(90);
 assert.equal(await evaluate('window.__whaleMaker.level.cells.slice(28*240,28*240+9).every(t=>t==="#")'),true);assert.equal(await evaluate('window.__whaleMaker.history.length'),1);
 assert.equal(await groundY(),initialY-72,'continuous paint invalidates the cache after each terrain change');await capture('editor-painted-horizon.png');
 await evaluate('window.__whaleMaker.selection=new Set(Array.from({length:9},(_,n)=>28*240+n));window.__whaleMaker.deleteSelection()');assert.equal(await groundY(),initialY);
 await evaluate('window.__whaleMaker.undo()');assert.equal(await groundY(),initialY-72);await evaluate('window.__whaleMaker.undo()');assert.equal(await groundY(),initialY);
 await evaluate('window.__whaleMaker.redoEdit()');assert.equal(await groundY(),initialY-72);await evaluate('window.__whaleMaker.redoEdit()');assert.equal(await groundY(),initialY);await capture('editor-restored-horizon.png');
 await evaluate('window.__whaleMaker.toggle();window.__whaleMaker.paused=true;window.__whaleMaker.cameraY=22');await delay(100);assert.equal(await evaluate('window.__whaleMaker.editing'),false);await capture('playtest-restored-horizon.png');
 writeFileSync(resolve(output,'measurements.json'),JSON.stringify({reads,initialY,paintedY:initialY-72},null,2));
 await evaluate('window.__whaleMaker.destroy()');await evaluate(`(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.textContent=JSON.stringify({status:'passed',checks:['cached-offscreen-terrain','continuous-paint-refresh','erase-refresh','undo-redo-horizon','playtest-fresh-level']});n.hidden=true;document.body.append(n);})()`);
}});
writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));assert.equal(result.status,'passed',JSON.stringify(result));console.log(JSON.stringify({status:result.status,checks:result.checks,diagnostics:result.browserDiagnostics}));
