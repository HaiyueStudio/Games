import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root=resolve(import.meta.dirname,'../..'), tag=process.argv[2]??'after';
const output=resolve(root,'artifacts/guobiao-mahjong/performance');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const phases={};
const result=await runChromeWebGpuFixture({root,fixture:'games/guobiao-mahjong/index.html',query:{verify:1,seed:20261105},timeoutMs:90000,
  visualCapture:{viewportWidth:1440,viewportHeight:900},interact:async cdp=>{
    const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
    await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
      const counts=new WeakMap(),bundles=new WeakMap();window.__mahjongDrawPerf={draws:0,passes:0};
      for(const name of ['draw','drawIndexed','drawIndirect','drawIndexedIndirect']){
        const direct=GPURenderPassEncoder.prototype[name];GPURenderPassEncoder.prototype[name]=function(){__mahjongDrawPerf.draws++;return direct.apply(this,arguments)};
        const record=GPURenderBundleEncoder.prototype[name];GPURenderBundleEncoder.prototype[name]=function(){counts.set(this,(counts.get(this)??0)+1);return record.apply(this,arguments)};
      }
      const finish=GPURenderBundleEncoder.prototype.finish;GPURenderBundleEncoder.prototype.finish=function(){const bundle=finish.apply(this,arguments);bundles.set(bundle,counts.get(this)??0);return bundle};
      const execute=GPURenderPassEncoder.prototype.executeBundles;GPURenderPassEncoder.prototype.executeBundles=function(input){const list=Array.from(input);for(const b of list)__mahjongDrawPerf.draws+=bundles.get(b)??0;return execute.call(this,list)};
      const begin=GPUCommandEncoder.prototype.beginRenderPass;GPUCommandEncoder.prototype.beginRenderPass=function(){__mahjongDrawPerf.passes++;return begin.apply(this,arguments)};
    })()`});
    await cdp.call('Page.reload');
    for(let i=0;i<200;i++){if(await evaluate(`!!window.__mahjongDrawPerf&&(!!window.haiyueMahjong||document.body?.dataset.renderStatus==='failed')`))break;await delay(100)}
    assert.equal(await evaluate(`document.body.dataset.renderStatus`),'ready');await delay(700);
    await evaluate(`(()=>{const c=haiyueMahjong.controller;window.__mahjongPerf={calls:0,observationMs:0,queueWrites:0,queueBytes:0,textureCopies:0,textureCopyLabels:{}};const original=c.observation.bind(c);c.observation=(...args)=>{const p=__mahjongPerf,t=performance.now();p.calls++;try{return original(...args)}finally{p.observationMs+=performance.now()-t}};
      const write=GPUQueue.prototype.writeBuffer;GPUQueue.prototype.writeBuffer=function(buffer,offset,data,dataOffset,size){const p=__mahjongPerf,unit=ArrayBuffer.isView(data)?data.BYTES_PER_ELEMENT??1:1;p.queueWrites++;p.queueBytes+=size===undefined?data.byteLength-(dataOffset??0)*unit:size*unit;return write.apply(this,arguments)};
      const copy=GPUQueue.prototype.copyExternalImageToTexture;GPUQueue.prototype.copyExternalImageToTexture=function(source,destination){const p=__mahjongPerf,label=destination.texture.label||'unlabeled';p.textureCopies++;p.textureCopyLabels[label]=(p.textureCopyLabels[label]??0)+1;return copy.apply(this,arguments)};})()`);
    await cdp.call('Performance.enable');await cdp.call('Profiler.enable');await cdp.call('Profiler.setSamplingInterval',{interval:1000});
    const measure=async(name,duration)=>{
      await delay(400);
      const start=await cdp.call('Performance.getMetrics');await cdp.call('Profiler.start');
      phases[name]=await evaluate(`(async()=>{const p=__mahjongPerf,d=__mahjongDrawPerf,revisionStart=haiyueMahjong.controller.revision;p.calls=0;p.observationMs=0;p.queueWrites=0;p.queueBytes=0;p.textureCopies=0;p.textureCopyLabels={};d.draws=0;d.passes=0;const frames=[],tasks=[];let last=0;const begin=performance.now();const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(t=>t.duration)));observer.observe({type:'longtask'});await new Promise(resolve=>{const tick=t=>{if(last)frames.push(t-last);last=t;if(t-begin>=${duration})resolve();else requestAnimationFrame(tick)};requestAnimationFrame(tick)});observer.disconnect();frames.sort((a,b)=>a-b);return {durationMs:performance.now()-begin,frames:frames.length,frameP50:frames[Math.floor(frames.length*.5)]??0,frameP95:frames[Math.floor(frames.length*.95)]??0,framesOver25ms:frames.filter(t=>t>25).length,longTasks:tasks.length,maxLongTask:Math.max(0,...tasks),observationCalls:p.calls,observationMs:p.observationMs,queueWrites:p.queueWrites,queueBytes:p.queueBytes,textureCopies:p.textureCopies,textureCopyLabels:{...p.textureCopyLabels},drawCalls:d.draws,renderPasses:d.passes,revisionStart,revisionEnd:haiyueMahjong.controller.revision}})()`);
      const end=await cdp.call('Performance.getMetrics'), profile=(await cdp.call('Profiler.stop')).result.profile;
      writeFileSync(resolve(output,`${tag}-${name}.cpuprofile`),JSON.stringify(profile));
      const metrics=r=>Object.fromEntries(r.result.metrics.map(m=>[m.name,m.value]));
      const a=metrics(start),b=metrics(end);phases[name].scriptMs=(b.ScriptDuration-a.ScriptDuration)*1000;phases[name].taskMs=(b.TaskDuration-a.TaskDuration)*1000;phases[name].heapMB=b.JSHeapUsedSize/1048576;
      phases[name].scriptMsPerFrame=phases[name].scriptMs/Math.max(1,phases[name].frames);
      phases[name].drawCallsPerFrame=phases[name].drawCalls/Math.max(1,phases[name].frames+1);
      phases[name].geometryWork=await evaluate(`haiyueMahjong.snapshot().presentation.scene.work`);
      phases[name].rendering=await evaluate(`(()=>{const s=haiyueMahjong.snapshot().presentation.scene;return{batches:s.batches,bodies:s.bodies,instances:s.instanceRendering,surface:s.surface,material:s.tileMaterial}})()`);
      phases[name].topFunctions=profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,18).map(n=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber+1,hits:n.hitCount}));
      console.log(name,JSON.stringify(phases[name]));
    };
    await measure('idle',3000);
    await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'h',code:'KeyH'});await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'h',code:'KeyH'});
    for(let i=0;i<100;i++){if(await evaluate(`haiyueMahjong.snapshot().presentation.coachPanel.visible&&!haiyueMahjong.coach.busy`))break;await delay(75)}
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.coachPanel.visible`),true);
    await measure('coachLog',3000);
    phases.coachLog.logRows=await evaluate(`haiyueMahjong.snapshot().presentation.coachPanel.renderedRows`);
    assert.ok(phases.coachLog.logRows<70,'log display must stay virtualized');assert.equal(phases.coachLog.observationCalls,0,'idle analysis must reuse the HUD observation');assert.equal(phases.coachLog.textureCopies,0,'static log must not retransmit textures');
    const close=await evaluate(`(()=>{const r=haiyueMahjong.snapshot().presentation.coachPanel.closeRect;return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,...close,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
    await delay(120);assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.coachPanel.visible`),false);
    await evaluate(`(async()=>{const saved=await(await fetch('../../games/test/fixtures/mahjong-ui-melds.json')).json();await haiyueMahjong.controller.restore(saved)})()`);
    await measure('lateHand',3000);
    await evaluate(`(async()=>{const c=haiyueMahjong.controller,s=await(await fetch('../../games/test/fixtures/mahjong-ui-melds.json')).json(),a=s.replay.actions;await c.restore({...s,human:null,replay:{...s.replay,handIndex:0,actions:[]}});for(let seat=0;seat<4;seat++)c.setAgent(seat,{name:'青竹 AI',decide(o){const r=a.find(r=>r.hand===o.handIndex&&r.revision===o.revision&&r.seat===o.seat);if(!r)throw Error('Recorded actions exhausted');return r.action}});c.setDelay(0);c.autoNext=true;c.start()})()`);
    await measure('autoplay',7000);
    await evaluate(`haiyueMahjong.controller.pause(true)`);
    await evaluate(`haiyueMahjong.dispose();(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.hidden=true;n.textContent=JSON.stringify({status:'passed',checks:['idle','virtualized-coach-log','late-hand','scripted-autoplay']});document.body.append(n)})()`);
  }});
assert.equal(result.status,'passed');
const fingerprints=Object.fromEntries(['ui/CoachPanel.ts','ui/coachText.ts','ui/coachChars.ts','ai/analysisCache.ts','ai/coaching/types.ts','ai/coaching/publicAnalysis.ts','ai/coaching/forecast.ts','ai/coaching/CoachSystem.ts','ai/coach.worker.ts','ai/coach.worker.js','ui/UiArt.ts','ui/ClaimControls.ts','ui/claimPresentation.ts','ui/MahjongDrawer.ts','../shared/ui/GameHud.ts','assets/ui-backdrop-v1.png','assets/ui-drawer-v1.png','assets/ui-ranking-v1.png','rendering/TableSurface.ts','rendering/RoundedTileBodies.ts','assets/tablecloth-emerald-v1.png','assets/wind-beasts-v1.png','assets/tiles-normal-v1.png','ui/TileAtlas.ts','ui/tileLayout.ts','main.ts','ui/MahjongHud.ts','rendering/MahjongTable3D.ts','rendering/TableBatch.ts','rendering/tableModel.ts','rendering/tileAnimations.ts','../gamepad/sampler.ts','../gamepad/runtime.ts','../gamepad/connectionMonitor.ts','bundle.js'].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,'games/guobiao-mahjong',p))).digest('hex')]));
writeFileSync(resolve(output,`${tag}.json`),JSON.stringify({tag,generatedAt:new Date().toISOString(),viewport:{width:1440,height:900},fingerprints,phases,browser:result.browserEvidence,diagnostics:result.browserDiagnostics},null,2));
