import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileControls } from '../tank-battle/input/mobileControls.ts';
const pad={x:80,y:600,radius:64},fire={x:310,y:600,radius:55};
test('joystick dead zone, four directions and clamped knob',()=>{
 const c=new MobileControls();assert.equal(c.down(1,80,600,pad,fire),true);assert.equal(c.input().direction,null);
 for(const [x,y,d] of [[80,550,0],[130,600,1],[80,650,2],[20,600,3]]){c.move(1,x,y,pad);assert.equal(c.direction,d);assert.ok(Math.hypot(c.x,c.y)<=31);}
 c.move(1,83,602,pad);assert.equal(c.direction,null);
});
test('two fingers keep independent ownership, fire persists across joystick release',()=>{
 const c=new MobileControls();c.down(11,80,570,pad,fire);c.down(12,310,600,pad,fire);
 assert.deepEqual(c.input(),{direction:0,fire:true});c.move(12,20,600,pad);assert.equal(c.direction,0);
 assert.equal(c.down(13,80,600,pad,fire),false);c.up(11);assert.deepEqual(c.input(),{direction:null,fire:true});
 c.up(12);assert.equal(c.input().fire,false);c.down(11,80,570,pad,fire);c.clear();assert.deepEqual(c.input(),{direction:null,fire:false});assert.equal(c.x,0);
});
