import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOpaqueBend,verifyBallHueShift} from '../../scripts/glass-rush-visual-policy.mjs';
const pixels=(value=0)=>({width:100,height:100,data:new Uint8Array(100*100*4).fill(value)});
test('opaque bend rejects even a small hidden-object leak and ignores unrelated HUD pixels',()=>{
 const a=pixels(),b=pixels();assert.equal(verifyOpaqueBend(a,b),0);
 b.data[0]=100;assert.equal(verifyOpaqueBend(a,b),0);
 const offset=(35*100+66)*4;b.data[offset]=2;assert.throws(()=>verifyOpaqueBend(a,b),/leaked/);
 b.data[offset]=1;assert.equal(verifyOpaqueBend(a,b),0);
});
test('ball color gate requires a visible change inside the ball, not elsewhere in the scene',()=>{
 const a=pixels(30),b=pixels(54);assert.throws(()=>verifyBallHueShift(a,b),/too subtle/);
 assert.equal(verifyBallHueShift(a,pixels(60)),30);
 const c=pixels(30);c.data[0]=255;assert.throws(()=>verifyBallHueShift(a,c),/too subtle/);
 assert.throws(()=>verifyBallHueShift(a,{...b,width:99}),/viewports differ/);
});
