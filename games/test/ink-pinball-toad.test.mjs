import test from 'node:test';
import assert from 'node:assert/strict';
import { newToadCycle, diveToad, advanceToad, toadGateOpen, toadPose, TOAD_DIVE_SECONDS, TOAD_REST_SECONDS, TOAD_RETURN_SECONDS } from '../ink-pinball/toadRules.ts';
test('toad opens support after its rescue, stays submerged 30 seconds and returns once',()=>{
 const s=newToadCycle(); assert.equal(toadGateOpen(s,0),false); diveToad(s,2);
 assert.equal(toadGateOpen(s,2.2),false); assert.equal(toadGateOpen(s,2.5),true);
 assert.equal(advanceToad(s,2+TOAD_DIVE_SECONDS),'dive');
 assert.equal(advanceToad(s,s.returnAt-.001),null); assert.equal(s.phase,'submerged');
 assert.equal(s.returnAt,2+TOAD_DIVE_SECONDS+TOAD_REST_SECONDS);
 assert.equal(advanceToad(s,s.returnAt),'return');assert.equal(toadGateOpen(s,s.returnAt),true);
 assert.equal(advanceToad(s,s.returnAt+TOAD_RETURN_SECONDS),'perch');
 assert.equal(toadGateOpen(s,s.returnAt+1),false);assert.equal(advanceToad(s,s.returnAt+2),null);
});
test('toad dive and return are continuous at their endpoints',()=>{
 const s=newToadCycle();diveToad(s,0);assert.equal(toadPose(s,0,194).lift,0);
 assert.ok(toadPose(s,.23,194).lift>37);assert.ok(toadPose(s,.8,194).lift<0);
 advanceToad(s,1.1);assert.deepEqual(toadPose(s,1.1,194),{lift:-194,opacity:0,rotation:0});
 advanceToad(s,s.returnAt);assert.equal(toadPose(s,s.returnAt,194).lift,-194);
 advanceToad(s,s.returnAt+.7);assert.deepEqual(toadPose(s,s.returnAt+.7,194),{lift:0,opacity:1,rotation:0});
});
test('two toads keep independent paused simulation deadlines',()=>{
 const a=newToadCycle(),b=newToadCycle();diveToad(a,4);advanceToad(a,5.1);
 for(let i=0;i<100;i++)advanceToad(a,5.1);
 assert.equal(a.phase,'submerged');assert.equal(b.phase,'perched');assert.equal(a.returnAt,35.1);
 diveToad(b,20);assert.notEqual(a.returnAt,b.returnAt);
});
