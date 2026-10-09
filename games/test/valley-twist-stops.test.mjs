import test from 'node:test';
import assert from 'node:assert/strict';
import {createObject,emptyMap,emptyPoses,localSamples,extrusionSamples,twistStopIndices,surfaceIndexAt,worldSample,worldSamples,MapRuntime,connections} from '../valley-of-light/map/model.ts';
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,`${a} != ${b}`);
const finish=r=>{for(let i=0;i<3000&&r.walking;i++)r.tick(.01);assert.equal(r.walking,false);};
function garden(){const map=emptyMap(),twist=createObject(6,'twist');twist.length=5;const exit=createObject(10,'exit',[3,-.5,.5]);exit.rotation=[90,0,0];map.objects=[createObject(9,'start',[-3,0,0]),twist,exit];return map;}

test('a five-cell twist exposes five exact unit-spaced stops and keeps a straight extrusion spine',()=>{
 const o=createObject(6,'twist');o.length=5;
 for(const angle of [-360,-90,0,90,270,360]){o.twist=angle;const samples=localSamples(o),stops=twistStopIndices(o),spine=extrusionSamples(o);assert.equal(stops.length,5);near(stops.map(i=>samples[i].point[0]),[-2,-1,0,1,2]);
  stops.forEach((index,cell)=>{const t=(cell+.5)/5,a=angle*Math.PI/180*t;near(samples[index].point,[-2+cell,(Math.cos(a)-1)/2,Math.sin(a)/2]);near(samples[index].up,[0,Math.cos(a),Math.sin(a)]);});
  for(let i=0;i<spine.length;i++)near(spine[i].point,[samples[i].point[0],-.5,0]);
  assert.ok(samples.every((s,i)=>i===0||s.point[0]>samples[i-1].point[0]));assert.ok(samples.length<=54,'unit stops reuse the angular samples');for(let i=1;i<samples.length;i++)assert.ok(Math.abs(samples[i].roll-samples[i-1].roll)<=Math.PI/24+1e-8,'banking steps stay at most 7.5 degrees');
 }
});

test('short paths and a final partial cell select their own centers, including end-cap clicks',()=>{
 const map=emptyMap(),o=createObject(6,'twist');map.objects=[o];const poses=emptyPoses();
 for(const length of [.1,.5,1,2,5.5,50]){o.length=length;const stops=twistStopIndices(o),samples=localSamples(o);assert.equal(stops.length,Math.ceil(length));
  for(let cell=0;cell<stops.length;cell++){const start=cell,end=Math.min(cell+1,length);assert.ok(Math.abs(samples[stops[cell]].point[0]-(start+end-length)/2)<1e-7);
   for(const offset of [.001,.3,.999]){const p=[start+(end-start)*offset-length/2,-.3,.4];assert.equal(surfaceIndexAt(map,o,poses,p),stops[cell]);}
  }
  assert.equal(surfaceIndexAt(map,o,poses,[-length/2-.0075,0,0]),stops[0]);assert.equal(surfaceIndexAt(map,o,poses,[length/2+.0075,0,0]),stops.at(-1));
 }
});

test('picking uses the path local length after rotated, sheared, scaled and animated parent transforms',()=>{
 const map=garden(),o=map.objects[1];o.rotation=[25,70,-40];o.position=[3,4,-2];o.groupId='inner';o.basis=[1,0,0,0,.3,1,0,0,.2,0,1,0,0,0,0,1];
 map.groups=[{id:'outer',name:'outer',pivot:[0,0,0],rotation:[17,31,10],scale:[2,.7,1.3],position:[2,0,-4]},{id:'inner',name:'inner',pivot:[1,2,3],parentId:'outer',rotation:[13,-42,8],scale:[.5,2,1]}];
 const poses=emptyPoses();poses.groups.inner={rotation:[10,23,5],translation:[2,-1,3]};const stops=twistStopIndices(o);
 for(let cell=0;cell<5;cell++)for(const xOffset of [.01,.49,.99])for(const z of [-.48,0,.48]){
  const point=worldSample(map,o,{point:[cell+xOffset-2.5,-.25,z],up:[0,1,0],roll:0},poses).point;
  assert.equal(surfaceIndexAt(map,o,poses,point),stops[cell]);
 }
});

test('every cell is reachable, mid-walk clicks reverse continuously, and both physical ends remain connected',()=>{
 const map=garden(),o=map.objects[1],r=new MapRuntime(map),stops=twistStopIndices(o),samples=worldSamples(map,o,emptyPoses());assert.equal(connections(map,emptyPoses()).filter(c=>!c.illusion).length,2);
 for(const cell of [0,1,4,3,2]){assert.ok(r.walkTo(o.id,stops[cell]));finish(r);assert.equal(r.at.index,stops[cell]);near(r.position,samples[stops[cell]].point);near(r.up,samples[stops[cell]].up);}
 assert.ok(r.walkTo(o.id,stops[4]));r.tick(.15);const before=[...r.position],up=[...r.up];assert.ok(r.walkTo(o.id,stops[0]));near(r.position,before);near(r.up,up);r.tick(.01);assert.ok(r.position[0]<before[0]);finish(r);near(r.position,samples[stops[0]].point);
 assert.ok(r.walkTo('start'));finish(r);near(r.position,[-3,0,0]);assert.ok(r.walkTo('exit'));finish(r);assert.ok(r.completed);near(r.up,[0,0,1]);
});
