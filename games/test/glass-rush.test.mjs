import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRound,advance,rank,isRecords,speed} from '../glass-rush/rules/model.ts';
test('fourth collision shatters; each gate only hits once',()=>{
 const r=createRound();r.phase='playing';
 for(let i=1;i<=4;i++){r.gates=[{z:3.01,angle:r.angle,width:1,spin:0,passed:false},{z:180,angle:0,width:1,spin:0,passed:false}];advance(r,.02);assert.equal(r.hits,i);assert.equal(r.phase,i===4?'over':'playing');}
});
test('safe arc, seeded generation, acceleration and pause',()=>{
 const a=createRound(42),b=createRound(42);a.phase=b.phase='playing';advance(a,.1,1);advance(b,.1,1);assert.deepEqual(a,b);assert.ok(speed(a)>18);assert.ok(a.angle> -Math.PI/2);
 a.phase='paused';const before=structuredClone(a);advance(a,.2,-1);assert.deepEqual(a,before);
 b.gates=[{z:3.01,angle:b.angle+Math.PI,width:.8,spin:0,passed:false},{z:180,angle:0,width:1,spin:0,passed:false}];advance(b,.1);assert.equal(b.hits,0);
});
test('leaderboard holds five descending finite survival times',()=>{assert.deepEqual(rank([10,9,8,7,6],12),[12,10,9,8,7]);assert.ok(isRecords({times:[12,10,9,8,7]}));for(const times of [[1,2],[NaN],[-1],Array(6).fill(2)])assert.equal(isRecords({times}),false);});
