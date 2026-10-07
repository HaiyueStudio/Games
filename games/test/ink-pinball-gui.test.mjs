import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newScroll,turnScroll,advanceScroll} from '../ink-pinball/guiRules.ts';
import {lotusRebound} from '../ink-pinball/gardenRules.ts';
test('help replaces page only when rolled shut; duplicate input cannot interrupt it',()=>{
 const s=newScroll();assert.equal(turnScroll(s,'help',10),true);
 advanceScroll(s,10.2);assert.equal(s.page,'game');assert.ok(s.open>0&&s.open<.5);
 assert.equal(turnScroll(s,'game',10.2),false);
 advanceScroll(s,10.34);assert.equal(s.page,'help');assert.ok(s.open<.001);
 advanceScroll(s,10.9);assert.equal(s.phase,'idle');assert.equal(s.open,1);
 assert.equal(turnScroll(s,'game',11),true);advanceScroll(s,12);assert.equal(s.page,'game');assert.equal(s.open,1);
});
test('lotus reflects incoming momentum, handles exact centre, and caps fast balls',()=>{
 assert.ok(lotusRebound(0,22,0,-3).y>=5.8);
 assert.ok(lotusRebound(0,0,0,0).y>=5.8);
 const p=lotusRebound(1,0,-40,2);assert.ok(p.x>0);assert.ok(Math.hypot(p.x,p.y)<=14.00001);
 const q=lotusRebound(-10,-2,2,1);assert.ok(q.x<0);assert.ok(Number.isFinite(q.y));
});

// Same queued-release boundary used after the native GUI render pass.
test('multi-touch release/capture loss cannot leave a flipper held or launch on cancel',async()=>{
 const {registerHooks}=await import('node:module');
 const hook=registerHooks({resolve(specifier,context,next){return next(/^\.{1,2}\//.test(specifier)&&! /\.[a-z0-9]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
 const previous=globalThis.window;globalThis.window=new EventTarget();
 const {InkInput}=await import('../ink-pinball/InkInput.ts');let enabled=true;const input=new InkInput(()=>enabled);
 const pointer=(type,id)=>{const e=new Event(type);Object.defineProperty(e,'pointerId',{value:id});window.dispatchEvent(e);};
 try {
  input.press('left',10);input.press('right',11);assert.ok(input.down('left')&&input.down('right'));
  pointer('pointerup',10);pointer('pointerup',11);input.flushReleases();assert.ok(!input.down('left')&&!input.down('right'));
  input.press('charge',12);pointer('pointercancel',12);input.flushReleases();assert.equal(input.releasedCharge,false);assert.equal(input.down('charge'),false);
  input.press('charge',13);pointer('pointerup',13);pointer('lostpointercapture',13);input.flushReleases();assert.equal(input.releasedCharge,true);
  input.clear();input.press('left',14);pointer('lostpointercapture',14);input.flushReleases();assert.equal(input.down('left'),false);
  enabled=false;input.press('charge',15);input.release(15);assert.equal(input.down('charge'),false);assert.equal(input.releasedCharge,false);
 } finally {input.dispose();globalThis.window=previous;hook.deregister();}
});
