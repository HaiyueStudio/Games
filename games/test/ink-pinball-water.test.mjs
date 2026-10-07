import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WaterEvents, entersRiver, WATER_LEVEL} from '../ink-pinball/waterModel.ts';

test('river entry excludes the shooter lane and rising balls',()=>{
 assert.equal(entersRiver(0,WATER_LEVEL,-4),true);
 assert.equal(entersRiver(235,-390,-4),false);
 assert.equal(entersRiver(0,-360,-4),false);
 assert.equal(entersRiver(0,-390,4),false);
});
test('splash and ripple lifetimes, strength and event counts stay bounded',()=>{
 const water=new WaterEvents();
 for(let i=0;i<100;i++)water.splash(i,-365,1,9,'ball');
 assert.equal(water.splashes.length,4);assert.equal(water.ripples.length,8);
 assert.equal(water.splashes[0].strength,1.4);assert.equal(water.counts.ball,100);
 water.advance(1);assert.equal(water.splashes.length,4);
 water.advance(2);assert.equal(water.splashes.length,0);assert.equal(water.ripples.length,8);
 water.advance(3.3);assert.equal(water.ripples.length,0);
 water.splash(0,-370,4,1,'fish');water.reset();
 assert.equal(water.splashes.length,0);assert.deepEqual(water.counts,{ball:0,fish:0,leap:0});
});
