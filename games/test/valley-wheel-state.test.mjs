import test from 'node:test';
import assert from 'node:assert/strict';
import {createWheelState,advanceWheelState,wheelShape,WHEEL_FOLD_DURATION} from '../valley-of-light/map/wheelState.ts';
import {emptyMap,createObject,MapRuntime} from '../valley-of-light/map/model.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('wheel availability animates to a compact hub and restores the original four arms',()=>{
 const s=createWheelState();assert.equal(s.open,1);advanceWheelState(s,true,WHEEL_FOLD_DURATION/2);assert.equal(s.disabled,true);near(s.open,.5);advanceWheelState(s,true,WHEEL_FOLD_DURATION/2);assert.equal(s.open,0);
 const closed=wheelShape(s.open);assert.ok(closed.gripCenter+closed.gripSize/2<.32,'grips retract inside the hub');assert.ok(closed.spokeCenter+closed.spokeLength/2<.32);
 advanceWheelState(s,false,WHEEL_FOLD_DURATION);assert.equal(s.open,1);const open=wheelShape(s.open);near(open.gripCenter,.76);near(open.gripSize,.24);near(open.spokeCenter,.47);near(open.spokeLength,.4);
 assert.equal(advanceWheelState(s,false,.02),false,'settled wheels do not rewrite transforms');
});
test('availability changes can reverse an unfinished animation without a pop',()=>{
 const s=createWheelState();advanceWheelState(s,true,.14);const before=s.open;advanceWheelState(s,false,0);assert.equal(s.open,before);advanceWheelState(s,false,.04);assert.ok(s.open>before&&s.open<1);const next=s.open;advanceWheelState(s,true,0);assert.equal(s.open,next);advanceWheelState(s,true,WHEEL_FOLD_DURATION);assert.equal(s.open,0);
 advanceWheelState(s,false,NaN);assert.equal(s.open,0);advanceWheelState(s,false,-1);assert.equal(s.open,0);advanceWheelState(s,false,5);assert.equal(s.open,1);
});
test('presentation follows runtime walking, nested group occupancy and completion without changing rotation',()=>{
 const map=emptyMap(),start=createObject(9,'start'),road=createObject(1,'road',[1,0,0]),exit=createObject(10,'exit',[2,0,0]),wheel=createObject(3,'wheel',[0,0,2]);
 map.groups=[{id:'outer',name:'outer',pivot:[0,0,0]},{id:'inner',name:'inner',pivot:[0,0,0],parentId:'outer'}];road.groupId='inner';wheel.motion.targetGroup='outer';map.objects=[start,road,exit,wheel];const r=new MapRuntime(map),s=createWheelState();r.dragTo('wheel',360);
 const tick=()=>{r.tick(.02);advanceWheelState(s,!r.canDrag('wheel'),.02);};const settle=()=>{for(let i=0;i<400;i++)tick();};
 assert.ok(r.walkTo('road'));tick();assert.equal(s.disabled,true);settle();assert.equal(r.at.objectId,'road');assert.equal(s.open,0);assert.equal(r.dragTo('wheel',90),false);assert.equal(r.poses.mechanisms.wheel,360);
 assert.ok(r.walkTo('start'));settle();assert.equal(s.disabled,false);assert.equal(s.open,1);assert.equal(r.poses.mechanisms.wheel,360);
 assert.ok(r.walkTo('exit'));settle();assert.ok(r.completed);assert.equal(s.disabled,true);assert.equal(s.open,0);
});
