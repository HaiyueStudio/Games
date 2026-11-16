import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyMap,createObject,setPathMarker,MapRuntime,parseMap,serializeCompactMap,worldSamples,centerIndex} from '../valley-of-light/map/model.ts';
function fixture(carryRider,axis='y'){
 const m=emptyMap();m.groups=[{id:'rider',name:'载人组',pivot:[0,0,0]},{id:'child',name:'子组',pivot:[0,0,0],parentId:'rider'}];
 const deck=createObject(1,'deck',[2,0,0]);deck.groupId='child';const wheel=createObject(3,'wheel',[0,0,0]);wheel.motion={...wheel.motion,axis,targetGroup:'rider',...(carryRider===undefined?{}:{carryRider})};const exit=createObject(1,'exit',[3,0,0]);m.objects=[deck,wheel,exit];setPathMarker(m,'deck','spawn');setPathMarker(m,'exit','exit');return m;
}
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-7,`${a} != ${b}`));
test('carry opt-in preserves default lock and serialization, rejects invalid values',()=>{
 assert.equal(new MapRuntime(fixture()).canDrag('wheel'),false);assert.equal(new MapRuntime(fixture(false)).canDrag('wheel'),false);
 const m=fixture(true);assert.equal(parseMap(JSON.parse(serializeCompactMap(m))).objects[1].motion.carryRider,true);
 m.objects[1].motion.carryRider='true';assert.throws(()=>parseMap(m),/拖拽/);
});
test('idle nested rider position, surface normal and heading follow arbitrary-axis multi-turn drag and checkpoint restore',()=>{
 for(const axis of ['x','y','z']){
  const m=fixture(true,axis),r=new MapRuntime(m);r.requestCheckpoint('登台');r.tick(0);const initial=r.position.slice(),heading=r.direction.slice();
  assert.ok(r.dragTo('wheel',45));const s=worldSamples(m,m.objects[0],r.poses)[centerIndex(m.objects[0])];near(r.position,s.point);near(r.up,s.up);
  assert.ok(r.dragTo('wheel',802,true));assert.equal(r.poses.mechanisms.wheel,810);near(r.position,worldSamples(m,m.objects[0],r.poses)[centerIndex(m.objects[0])].point);
  assert.equal(r.at.objectId,'deck');assert.ok(r.restoreCheckpoint());near(r.position,initial);near(r.direction,heading);assert.equal(r.poses.mechanisms.wheel??0,0);
 }
});
test('carry cannot bypass walking, disabled wheel or completion locks',()=>{
 const m=fixture(true),r=new MapRuntime(m);assert.ok(r.walkTo('exit'));assert.equal(r.dragTo('wheel',90),false);
 const disabled=fixture(true);disabled.objects[1].state={enabled:false};assert.equal(new MapRuntime(disabled).canDrag('wheel'),false);
 for(let i=0;i<200&&!r.completed;i++)r.tick(.02);assert.ok(r.completed);assert.equal(r.canDrag('wheel'),false);
});
