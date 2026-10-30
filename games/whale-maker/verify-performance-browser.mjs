import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'../..'),tag=process.argv[2]??'after',output=resolve(root,'artifacts/whale-maker-performance');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},timeoutMs:90000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},interact:async cdp=>{
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
 for(let n=0;n<180;n++){if(await evaluate('document.body?.dataset.renderStatus==="passed"'))break;await delay(200);}
 assert.equal(await evaluate('document.body?.dataset.renderStatus'),'passed');
 const stats=await evaluate(`(()=>{
 const g=window.__whaleMaker;g.engine.stop();g.paused=true;g.state.time=12;g.state.invincible=100;g.editTime=12;
 const nodes=g.ui.root.children,counts={visibility:0,style:0,dirty:0};
 for(const n of nodes){const visible=n.setVisible,style=n.setStyle,dirty=n.markDirty;n.setVisible=function(v){if(v!==this.visible)counts.visibility++;return visible.call(this,v);};n.setStyle=function(v){counts.style++;return style.call(this,v);};n.markDirty=function(...args){counts.dirty++;return dirty.apply(this,args);};}
 const bench=()=>{for(let n=0;n<5;n++)g.draw();counts.visibility=counts.style=counts.dirty=0;const samples=[];for(let k=0;k<5;k++){const start=performance.now();for(let n=0;n<20;n++)g.draw();samples.push((performance.now()-start)/20);}samples.sort((a,b)=>a-b);return {medianMs:samples[2],counts:{...counts},draws:g.scene.draws.length};};
 const play=bench();g.editing=true;const editor=bench();g.contentPage=2;g.paletteCategory=1;g.palettePage=1;g.selection=new Set([g.level.cells.findIndex(t=>t==='?')]);const inspector=bench();
 g.selection=new Set([g.level.cells.findIndex(t=>t==='P')]);const pipeInspector=bench();
 return {play,editor,inspector,pipeInspector};})()`);
 writeFileSync(resolve(output,tag+'.json'),JSON.stringify(stats,null,2));
 // Exercise real GUI layout and render after measurement; preserve a visual record.
 await evaluate('window.__whaleMaker.engine.run()');await delay(250);
 const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,tag+'.png'),Buffer.from(shot.result.data,'base64'));
 console.log(JSON.stringify(stats));
 if(!tag.includes('before')){for(const mode of Object.values(stats)){assert.equal(mode.counts.visibility,0,'unchanged controls do not toggle visibility');assert.equal(mode.counts.style,0,'unchanged controls do not submit style changes');}}
 if(process.argv[3]){const ref=JSON.parse(readFileSync(process.argv[3],'utf8'));for(const [mode,data]of Object.entries(stats))assert.equal(data.draws,ref[mode].draws,'render command count changed: '+mode);}
 await evaluate('window.__whaleMaker.destroy()');
 await evaluate(`(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.textContent=JSON.stringify({status:'passed',checks:['cpu-draw-benchmark','stable-control-visibility','stable-control-styles']});n.hidden=true;document.body.append(n);})()`);
}});
assert.equal(result.status,'passed',JSON.stringify(result));console.log(JSON.stringify(result,null,2));
