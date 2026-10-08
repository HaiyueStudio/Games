import test from 'node:test';
import assert from 'node:assert/strict';
import {createObject,emptyMap,MapRuntime,surfaceGarden,rotatedSeamGarden,switchGarden,walkSurfaces,worldSamples,emptyPoses,project} from '../valley-of-light/map/model.ts';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const near=(a,b)=>assert.ok(distance(a,b)<1e-7,`${a} != ${b}`);
function forkMap(){const map=emptyMap();map.objects=[['start',9,[0,0,0]],['junction',1,[1,0,0]],['road',1,[2,0,0]],['far',1,[3,0,0]],['exit',10,[4,0,0]],['branch',1,[1,0,1]],['branch-end',1,[1,0,2]],['isolated',1,[7,0,7]]].map(([id,type,p])=>createObject(type,id,p));return map;}
function until(r,test,label='movement'){for(let i=0;i<3000&&!test();i++)r.tick(.02);assert.ok(test(),label);}
function retarget(r,id,index){const p=[...r.position],up=[...r.up];assert.ok(r.walkTo(id,index));near(r.position,p);near(r.up,up);}

test('mid-edge clicks reverse immediately and repeated reversal retains both reachable directions',()=>{
 const r=new MapRuntime(forkMap());assert.ok(r.walkTo('far'));r.tick(.1);near(r.position,[.26,0,0]);retarget(r,'start');r.tick(.02);near(r.position,[.208,0,0]);retarget(r,'far');r.tick(.02);near(r.position,[.26,0,0]);
 for(let i=0;i<8;i++){retarget(r,'start');r.tick(.02);near(r.position,[.208,0,0]);retarget(r,'far');r.tick(.02);near(r.position,[.26,0,0]);}
 retarget(r,'start');until(r,()=>!r.walking);near(r.position,[0,0,0]);assert.equal(r.at.objectId,'start');assert.equal(r.completed,false);
});

test('retargeting a branch retraces the current edge and never cuts across a corner',()=>{
 const r=new MapRuntime(forkMap());r.walkTo('far');until(r,()=>r.position[0]>1.12);const x=r.position[0];retarget(r,'branch-end');r.tick(.02);assert.ok(r.position[0]<x);near([r.position[2]],[0]);
 for(let i=0;i<1000&&r.walking;i++){const previous=[...r.position];r.tick(.02);assert.ok(distance(previous,r.position)<=.05200001);assert.ok(Math.abs(r.position[2])<1e-8||Math.abs(r.position[0]-1)<1e-8,'movement stays on the L-shaped route');}
 assert.equal(r.at.objectId,'branch-end');near(r.position,[1,0,2]);
});

test('repeated current targets continue forward; unreachable targets preserve the current route',()=>{
 const r=new MapRuntime(forkMap());r.walkTo('far');for(let i=0;i<30;i++){r.tick(.02);const before=[...r.position];retarget(r,'far');assert.equal(r.walkTo('isolated'),false);near(r.position,before);r.tick(.02);assert.ok(r.position[0]>=before[0]);}
 until(r,()=>!r.walking);near(r.position,[3,0,0]);assert.equal(r.at.objectId,'far');
});

test('twists and banking arcs can be reversed and redirected without changing feet or surface orientation on click',()=>{
 for(const arc of [false,true]){const map=surfaceGarden(arc),r=new MapRuntime(map),face=walkSurfaces(map.objects.find(o=>o.id==='wall-b')).find(f=>f.face===5);r.walkTo('wall-b',face.center);until(r,()=>r.up[1]>.25&&r.up[1]<.75);retarget(r,'start');const before=[...r.position];r.tick(.005);assert.ok(distance(before,r.position)<=.01300001);retarget(r,'wall-b',face.center);assert.equal(r.walkTo('wall-b',1),false);until(r,()=>!r.walking);assert.equal(r.at.objectId,'wall-b');near(r.up,[0,0,1]);}
});

test('retargeting near optical seams keeps screen motion continuous in both directions',()=>{
 const r=new MapRuntime(rotatedSeamGarden());r.walkTo('object-13');until(r,()=>r.position[1]>4.9);retarget(r,'object-10');let crossed=false;
 for(let i=0;i<2000&&r.walking;i++){const previous=[...r.position];r.tick(.02);if(distance(previous,r.position)>3)crossed=true;assert.ok(distance(project(previous),project(r.position))<.12,'no visible jump when returning through the seam');}
 assert.ok(crossed);assert.equal(r.at.objectId,'object-10');near(r.up,[0,1,0]);retarget(r,'object-13');until(r,()=>r.completed);assert.equal(r.walkTo('object-10'),false);
});

test('mid-walk switch targets fire only on arrival and remain locked during animation',()=>{
 const r=new MapRuntime(switchGarden());r.walkTo('switch-lift');r.tick(.1);retarget(r,'start');until(r,()=>!r.walking);assert.equal(r.fired.size,0);r.walkTo('switch-lift');r.tick(.1);retarget(r,'switch-lift');until(r,()=>r.busy);assert.deepEqual([...r.fired],['switch-lift']);const p=[...r.position];assert.equal(r.walkTo('start'),false);near(r.position,p);until(r,()=>!r.busy);assert.ok(r.walkTo('start'));
});
