import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(root,'artifacts/valley-of-light'); mkdirSync(output,{recursive:true});
const mobile=process.argv.includes('--mobile'), captureOnly=process.argv.includes('--capture-only'), testSave=process.argv.includes('--save');
const checks=[];
const result=await runChromeWebGpuFixture({ root, fixture:'games/valley-of-light/index.html', query:{verify:testSave?'save':1}, timeoutMs:60000,
  visualCapture:{viewportWidth:mobile?390:1440,viewportHeight:mobile?844:900},
  interact: async cdp => {
    if (mobile) await cdp.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    async function evaluate(expression) {
      const response=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});
      if(response.result?.exceptionDetails) throw new Error(JSON.stringify(response.result.exceptionDetails));
      return response.result?.result?.value;
    }
    const snapshot=()=>evaluate('window.__valley?.snapshot()');
    async function wait(predicate,label,timeout=20000) {
      const start=Date.now();
      while(Date.now()-start<timeout) { const value=await snapshot(); if(predicate(value)) return value; await new Promise(r=>setTimeout(r,80)); }
      throw new Error(`Timed out: ${label}; ${JSON.stringify(await snapshot())}`);
    }
    async function capture(name) { const response=await cdp.call('Page.captureScreenshot',{format:'png'}); writeFileSync(resolve(output,name),Buffer.from(response.result.data,'base64')); }
    async function mouse(type,x,y,held=false) { await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:held?1:0,clickCount:1}); }
    async function touch(type,point) { await cdp.call('Input.dispatchTouchEvent',{type,touchPoints:point?[{x:point[0],y:point[1],id:1,radiusX:3,radiusY:3}]:[]}); }
    async function click(point) { if(mobile) { await touch('touchStart',point); await touch('touchEnd'); } else { await mouse('mousePressed',...point,true); await mouse('mouseReleased',...point); } }
    async function drag(point,delta) {
      if(mobile) await touch('touchStart',point); else await mouse('mousePressed',...point,true);
      for(let i=1;i<=12;i++) {
        const next=[point[0]+delta[0]*i/12,point[1]+delta[1]*i/12];
        if(mobile) await touch('touchMove',next); else await mouse('mouseMoved',...next,true);
        await new Promise(r=>setTimeout(r,18));
      }
      if(mobile) await touch('touchEnd'); else await mouse('mouseReleased',point[0]+delta[0],point[1]+delta[1]);
      await new Promise(r=>setTimeout(r,160));
    }
    async function key(code) { await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='Space'?' ':code.replace('Key','').toLowerCase()}); await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',code}); await new Promise(r=>setTimeout(r,150)); }
    let state=await wait(s=>s?.ready,'glTF and engine ready');
    assert.deepEqual(state.clips,['Idle','Walk']); assert.equal(state.animation,'Idle'); checks.push('glTF loaded with Idle and Walk');
    await new Promise(r=>setTimeout(r,300));
    await capture(mobile?'mobile.png':'initial.png');
    if(captureOnly) return;
    await click(state.targets.gate); state=await snapshot(); assert.equal(state.walking,false); checks.push('unconnected destination blocked');
    await drag(state.handles.turn,[-Math.PI/2/.012,0]);
    state=await snapshot(); assert.equal(state.state.angle,0); assert.equal(state.state.moves,1); checks.push('pointer drag rotates and snaps');
    await drag(state.handles.slide,state.slideUnit.map(v=>v*2));
    state=await snapshot(); assert.equal(state.state.offset,0); assert.equal(state.joins.length,4); checks.push('pointer drag slides and joins');
    if(mobile) checks.push('touch drag interaction on 390px viewport');
    await capture(mobile?'mobile-connected.png':'connected.png');
    await click(state.targets.gate);
    state=await wait(s=>s.walking&&s.animation==='Walk','walk animation'); checks.push('click routes traveler and plays Walk');
    await key('KeyQ'); const locked=await snapshot(); assert.equal(locked.state.angle,0); checks.push('mechanisms locked while walking');
    state=await wait(s=>s.state.completed&&!s.walking,'arrival at gate',30000);
    await wait(s=>s.animation==='Idle','idle restored'); assert.equal(state.state.at,'gate'); checks.push('crosses both optical seams and completes');
    await capture(mobile?'mobile-complete.png':'complete.png');
    await click(mobile?[310,82]:[1360,49]);
    state=await wait(s=>s.journalOpen,'GUI journal button'); await capture(mobile?'mobile-journal.png':'journal.png');
    await click(mobile?[280,588]:[692,615]);
    state=await wait(s=>!s.journalOpen,'GUI close button'); checks.push('GUI journal buttons open and close');
    await key('KeyR'); state=await snapshot(); assert.equal(state.state.moves,0); assert.equal(state.state.completed,false); assert.equal(state.state.at,'home');
    // Cancelling a real drag rolls back its preview rather than saving an unsnapped state.
    await mouse('mousePressed',...state.handles.turn,true);
    await mouse('mouseMoved',state.handles.turn[0]+70,state.handles.turn[1],true);
    await key('Escape'); await mouse('mouseReleased',state.handles.turn[0]+70,state.handles.turn[1]);
    state=await snapshot(); assert.equal(state.state.angle,Math.PI/2); assert.equal(state.state.moves,0); checks.push('reset and drag cancellation restore state');
    await key('KeyQ'); for(let i=0;i<4;i++) await key('KeyD');
    state=await snapshot(); assert.equal(state.joins.length,4); checks.push('keyboard equivalents connect both bridges');
    if(testSave) {
      await wait(s=>s.saveStatus==='saved','autosave');
      await cdp.call('Page.reload',{ignoreCache:true});
      await new Promise(r=>setTimeout(r,600));
      state=await wait(s=>s?.ready,'reload and restore');
      assert.equal(state.state.angle,0); assert.equal(state.state.offset,0); assert.equal(state.state.moves,5);
      checks.push('engine autosave restores snapped mechanisms after reload');
    }
    assert.deepEqual(state.errors,[]);
    await evaluate(`document.querySelector('#result').textContent = JSON.stringify({ status:'passed', checks:${JSON.stringify(checks)}, snapshot:window.__valley.snapshot() })`);
  },
});
writeFileSync(resolve(output,mobile?'mobile-final.png':'final.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));
delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,mobile?'mobile.json':'browser.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks,output},null,2));
