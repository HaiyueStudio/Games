import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAGON, advanceDragon, newDragon, koiPose, toadJump } from '../ink-pinball/sceneRules.ts';
import { InkSources, MAX_SPLATS, fluidQuality } from '../ink-pinball/fluidModel.ts';
test('dragon catches once, holds briefly, spits once and cannot immediately recapture',()=>{
 const s=newDragon();assert.equal(advanceDragon(s,1,true),'capture');
 assert.equal(advanceDragon(s,1.2,true),null);assert.equal(s.phase,'holding');
 assert.equal(advanceDragon(s,1+DRAGON.hold+.001,false),'spit');
 assert.equal(advanceDragon(s,1.6,true),null);assert.equal(s.spits,1);
 assert.equal(advanceDragon(s,4,true),'capture');assert.equal(s.captures,2);
});
test('koi executes a full aerial somersault and lands at water level',()=>{
 assert.equal(koiPose(0).lift,0);assert.equal(koiPose(.5).lift,210);
 assert.equal(koiPose(1).lift,0);assert.equal(koiPose(1).rotation,-360);
 assert.equal(koiPose(0).travel,0);assert.ok(Math.abs(koiPose(1).travel)<1e-10);
 assert.equal(toadJump(0),0);assert.ok(toadJump(.23)>37);assert.equal(toadJump(.5),0);
});
test('ink sources remain bounded under dense collisions and never draw through teleports',()=>{
 const sources=new InkSources();sources.sample(0,0,0,true);sources.sample(.01,20,0,true);
 assert.equal(sources.pending.length,2);sources.sample(.02,235,-321,true);assert.equal(sources.pending.length,2);
 for(let i=0;i<100;i++)sources.impact(0,0);
 assert.equal(sources.pending.length,MAX_SPLATS);assert.equal(sources.impacts,100);
 sources.reset();assert.equal(sources.pending.length,0);assert.equal(sources.emitted,0);
});
test('compact fluid preset has strictly bounded memory, cadence and pressure work',()=>{
 const desktop=fluidQuality(false),mobile=fluidQuality(true);
 assert.ok(mobile.width*mobile.height<desktop.width*desktop.height);
 assert.equal(mobile.hz,30);assert.equal(desktop.hz,60);
 assert.ok(mobile.iterations<desktop.iterations);
 assert.ok(desktop.width*desktop.height*48<3*1024*1024);
});
