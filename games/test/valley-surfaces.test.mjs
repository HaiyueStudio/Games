import test from 'node:test';
import assert from 'node:assert/strict';
import {createObject,emptyMap,emptyPoses,localSamples,pathPorts,pathEdges,walkSurfaces,worldSamples,connections,findRoute,MapRuntime,splitGarden,project,centerIndex,rotatedSeamGarden,surfaceGarden,parseMap,serializeMap,surfaceIndexAt,add,mul,sub} from '../valley-of-light/map/model.ts';
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,`${a} != ${b}`);
const finish=r=>{for(let i=0;i<4000&&r.walking;i++)r.tick(.02);assert.ok(r.completed);};
test('the user map connects its two rotated A halves automatically without changing authored JSON',()=>{
 const map=rotatedSeamGarden(),json=serializeMap(map),r=new MapRuntime(map);assert.deepEqual(map.opticalLinks,[]);assert.equal(r.walkTo('object-13'),true);
 let jump=false;for(let i=0;i<4000&&r.walking;i++){const previous=[...r.position];r.tick(.02);near(r.up,[0,1,0]);if(Math.hypot(...sub(r.position,previous))>4)jump=true;}
 assert.ok(r.completed&&jump);near(r.position,[7,5,6]);assert.equal(serializeMap(map),json);
 const rotated=new MapRuntime(map,p=>[p[0],p[1]]);assert.equal(rotated.walkTo('object-13'),false,'rotating the view breaks the optical seam');
 map.objects[11].position[0]+=.2;assert.equal(new MapRuntime(map).walkTo('object-13'),false,'a visibly separated seam stays closed');
});
test('every cube face is a separate path that connects only to the same surface orientation',()=>{
 for(const [face,rotation,tangent] of [[0,[0,0,0],[1,0,0]],[1,[180,0,0],[1,0,0]],[2,[0,0,90],[0,1,0]],[3,[0,0,-90],[0,-1,0]],[4,[-90,0,0],[1,0,0]],[5,[90,0,0],[1,0,0]]]){
  const map=emptyMap(),cube=createObject(1,'cube'),f=walkSurfaces(cube).find(f=>f.face===face),samples=localSamples(cube),center=samples[f.center].point;
  const start=createObject(9,'start',sub(center,tangent)),exit=createObject(10,'exit',add(center,tangent));start.rotation=rotation;exit.rotation=rotation;map.objects=[start,cube,exit];
  const r=new MapRuntime(map);assert.ok(r.walkTo('cube',f.center),`face ${face}`);for(let i=0;i<500&&r.walking;i++)r.tick(.02);near(r.position,center);near(r.up,f.up);
  for(const other of walkSurfaces(cube).filter(other=>other.face!==face))assert.equal(r.walkTo('cube',other.center),false,'no instant corner or through-body shortcut');
  assert.ok(r.walkTo('exit'));finish(r);near(r.up,f.up);
 }
});
test('twist and banking arc let the traveler enter a wall and continue across adjacent side faces',()=>{
 for(const arc of [false,true]){
  const map=surfaceGarden(arc),r=new MapRuntime(map),wall=map.objects.find(o=>o.id==='wall-b'),face=walkSurfaces(wall).find(f=>f.face===5);
  assert.equal(r.walkTo('wall-b',1),false,'the top face has no incoming route');assert.ok(r.walkTo('wall-b',face.center));
  let leaned=false;for(let i=0;i<2000&&r.walking;i++){r.tick(.02);if(r.up[1]>.2&&r.up[1]<.8)leaned=true;}assert.ok(leaned);near(r.up,[0,0,1]);
  assert.equal(r.at.index,face.center);assert.ok(r.walkTo('exit'));finish(r);near(r.up,[0,0,1]);
 }
});
test('extended ports and arc bank angles round-trip while old maps keep flat arcs',()=>{
 const map=surfaceGarden(true);map.opticalLinks=[{a:'wall-a',aEnd:50,b:'wall-b',bEnd:51}];assert.deepEqual(parseMap(JSON.parse(serializeMap(map))),map);
 const old=JSON.parse(serializeMap(map));for(const o of old.objects)delete o.arcTwist;assert.ok(parseMap(old).objects.every(o=>o.arcTwist===0));
 old.opticalLinks[0].aEnd=64;assert.throws(()=>parseMap(old),/端口/);
});
test('hit points resolve the correct face and all prism faces have independent internal edges',()=>{
 const map=emptyMap(),o=createObject(5,'prism');o.rotation=[90,0,-90];map.objects=[o];const samples=worldSamples(map,o,emptyPoses()),faces=walkSurfaces(o);assert.equal(faces.length,5);
 for(const f of faces){assert.equal(surfaceIndexAt(map,o,emptyPoses(),samples[f.center].point),f.center);for(const [a,b] of pathEdges(o).filter(([a])=>a===f.center))assert.ok(f.indices.includes(b));}
 assert.ok(pathPorts(o).some(p=>p.port>4));
});


test('a complete projected split-cube road is walked in a straight line in both directions',()=>{
 for(const physical of [false,true]){
  const map=splitGarden();if(physical)for(const o of map.objects.filter(o=>['half-b','beyond','exit'].includes(o.id)))o.position=o.position.map(v=>v-3);
  const r=new MapRuntime(map),start=project(r.position),destination=project(worldSamples(map,map.objects.find(o=>o.id==='beyond'),emptyPoses())[1].point),axis=sub([...destination,0],[...start,0]);
  const check=()=>{const p=project(r.position),cross=(p[0]-start[0])*axis[1]-(p[1]-start[1])*axis[0];assert.ok(Math.abs(cross)<1e-7,`centroid detour at ${r.position}`);};
  assert.ok(r.walkTo('beyond'));for(let i=0;i<2000&&r.walking;i++){r.tick(.02);check();}assert.equal(r.at.objectId,'beyond');
  assert.ok(r.walkTo('start'));for(let i=0;i<2000&&r.walking;i++){r.tick(.02);check();}assert.equal(r.at.objectId,'start');
  const half=map.objects.find(o=>o.id==='half-a');assert.ok(r.walkTo(half.id,centerIndex(half)));for(let i=0;i<2000&&r.walking;i++)r.tick(.02);near(r.position,worldSamples(map,half,emptyPoses())[centerIndex(half)].point);
 }
});

test('repeated retargeting inside a split triangular face preserves its straight occupied segment',()=>{
 const r=new MapRuntime(splitGarden()),check=()=>near([r.position[1],r.position[2]],r.position[1]>1?[3,3]:[0,0]);
 r.walkTo('beyond');for(let i=0;i<1000&&r.position[0]<-.35;i++)r.tick(.01);check();
 for(let i=0;i<5;i++){const before=[...r.position];assert.ok(r.walkTo('start'));near(r.position,before);r.tick(.01);check();assert.ok(r.walkTo('beyond'));r.tick(.01);check();}
 for(let i=0;i<2000&&r.walking;i++){r.tick(.02);check();}assert.equal(r.at.objectId,'beyond');
});
