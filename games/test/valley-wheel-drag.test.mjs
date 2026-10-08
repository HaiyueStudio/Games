import test from 'node:test';
import assert from 'node:assert/strict';
import {beginWheelDrag,moveWheelDrag} from '../valley-of-light/map/wheelDrag.ts';
const center=[100,100],point=(degrees,r=40)=>[100+Math.cos(degrees*Math.PI/180)*r,100+Math.sin(degrees*Math.PI/180)*r];
test('wheel uses polar motion, unwraps angles and ignores radial displacement',()=>{
  const d=beginWheelDrag(point(170),center,0,1);assert.equal(moveWheelDrag(d,point(170,80),center),0);
  assert.ok(Math.abs(moveWheelDrag(d,point(-170),center)-20)<1e-8);assert.ok(Math.abs(moveWheelDrag(d,point(-80),center)-110)<1e-8);
  assert.ok(Math.abs(moveWheelDrag(d,point(-170),center)-20)<1e-8);
});
test('center dead zone does not jump and the back-facing wheel reverses direction',()=>{
  const d=beginWheelDrag(center,center,0,-1);assert.equal(moveWheelDrag(d,point(0),center),0);assert.ok(Math.abs(moveWheelDrag(d,point(90),center)+90)<1e-8);
  moveWheelDrag(d,point(140),center);assert.ok(Math.abs(moveWheelDrag(d,point(100),center)+100)<1e-8);
  moveWheelDrag(d,center,center);assert.ok(Math.abs(moveWheelDrag(d,point(-100),center)+100)<1e-8);
});

test('continuous circles accumulate beyond a revolution in either direction and resume after release',()=>{
  const d=beginWheelDrag(point(0),center,0,1);
  for(let angle=15;angle<=1170;angle+=15)assert.ok(Math.abs(moveWheelDrag(d,point(angle),center)-angle)<1e-8);
  for(let angle=1155;angle>=-450;angle-=15)assert.ok(Math.abs(moveWheelDrag(d,point(angle),center)-angle)<1e-8);
  const resumed=beginWheelDrag(point(-450),center,d.value,1);
  assert.ok(Math.abs(moveWheelDrag(resumed,point(-420),center)+420)<1e-8);
});
