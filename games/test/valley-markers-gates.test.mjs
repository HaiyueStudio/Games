import test from 'node:test';
import assert from 'node:assert/strict';
import {createObject,emptyMap,emptyPoses,pathMarker,markerIndex,setPathMarker,playIssues,parseMap,serializeMap,serializeCompactMap,MapRuntime,worldSamples,walkSurfaces,localSamples,extrusionSamples,splitCube,analyzeStaticPaths,isDecoration,isWalkable,pathPorts} from '../valley-of-light/map/model.ts';
import {decorationMeshes} from '../valley-of-light/map/decorations.ts';
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,`${a} != ${b}`);
const finish=r=>{for(let i=0;i<15000&&r.walking;i++)r.tick(.01);assert.equal(r.walking,false);};
function straight(){const m=emptyMap();m.objects=[createObject(1,'start'),createObject(1,'middle',[1,0,0]),createObject(1,'exit',[2,0,0])];setPathMarker(m,'start','spawn');setPathMarker(m,'exit','exit');return m;}

test('spawn and exit annotate existing road faces, keep the graph intact and work on all six faces',()=>{
 for(const face of walkSurfaces(createObject(1,'block')).map(f=>f.face)){
  const map=straight();if(face===2||face===3)map.objects.forEach((o,i)=>o.position=[0,0,i]);
  setPathMarker(map,'start','spawn',face);setPathMarker(map,'exit','exit',face);assert.equal(map.objects.length,3);assert.ok(map.objects.every(o=>o.type===1));assert.deepEqual(playIssues(map),[]);
  const r=new MapRuntime(map),a=worldSamples(map,map.objects[0],emptyPoses())[markerIndex(map.objects[0])],b=worldSamples(map,map.objects[2],emptyPoses())[markerIndex(map.objects[2])];near(r.position,a.point);near(r.up,a.up);assert.ok(r.walkTo('exit'));finish(r);assert.ok(r.completed);near(r.position,b.point);near(r.up,b.up);
 }
 const map=straight();setPathMarker(map,'exit','exit',1);const r=new MapRuntime(map);assert.equal(r.walkTo('exit'),false);assert.ok(r.walkTo('exit',1));finish(r);assert.equal(r.completed,false,'touching an unmarked face is not an exit');
});

test('markers survive both formats and static planning; moving spawn preserves transforms, pillars and legacy maps',()=>{
 const map=straight();map.groups=[{id:'g',name:'group',pivot:[0,0,0],position:[3,2,1],rotation:[10,30,20],scale:[2,.8,1]}];map.objects.forEach(o=>o.groupId='g');const pillar=createObject(12,'pillar');pillar.attachment={pathId:'start',corner:0};map.objects.push(pillar);
 const before=JSON.stringify(map.objects.map(o=>[o.position,o.rotation,o.colors,o.groupId,o.attachment]));setPathMarker(map,'middle','spawn');assert.equal(pathMarker(map.objects[0]),null);assert.equal(pathMarker(map.objects[1]).kind,'spawn');assert.equal(JSON.stringify(map.objects.map(o=>[o.position,o.rotation,o.colors,o.groupId,o.attachment])),before);
 const runtime=new MapRuntime(map);assert.ok(runtime.walkTo('exit'));finish(runtime);assert.ok(runtime.completed);
 assert.ok(analyzeStaticPaths(map).batches.flat().includes(1));for(const text of [serializeMap(map),serializeCompactMap(map)])assert.equal(serializeMap(parseMap(JSON.parse(text))),serializeMap(map));
 const legacy=emptyMap();legacy.objects=[createObject(9,'start'),createObject(10,'exit',[1,0,0])];const saved=serializeMap(legacy),r=new MapRuntime(parseMap(JSON.parse(saved)));assert.ok(r.walkTo('exit'));finish(r);assert.ok(r.completed);assert.equal(serializeMap(legacy),saved);setPathMarker(legacy,'exit','spawn');assert.equal(legacy.objects[0].type,1);assert.equal(legacy.objects[1].type,1);assert.equal(pathMarker(legacy.objects[0]),null);
 for(const marker of [{kind:'exit',face:6},{kind:'bad',face:0},{kind:'spawn',face:-1},null]){const bad=straight();bad.objects[0].marker=marker;assert.throws(()=>parseMap(bad));}
 const bad=straight();bad.objects.push({...createObject(18,'gate'),marker:{kind:'exit',face:0}});assert.throws(()=>parseMap(bad));
});

test('splitting a marked cube retains exactly one marker on the matching half face',()=>{
 for(const face of [0,1,2,3,4,5]){const map=straight();setPathMarker(map,'middle','spawn',face);splitCube(map,'middle','half-b',3);assert.equal(map.objects.filter(o=>pathMarker(o)?.kind==='spawn').length,1);const marked=map.objects.find(o=>pathMarker(o)?.kind==='spawn');assert.ok(walkSurfaces(marked).some(f=>f.face===face));assert.doesNotThrow(()=>parseMap(map));}
});

test('multi-turn twists preserve exact angles in both formats and stay smooth while traversing every turn',()=>{
 for(const angle of [450,720,1080,-720,-1080]){
  const map=emptyMap(),twist=createObject(6,'twist');twist.length=5;twist.twist=angle;const samples=localSamples(twist),end=samples.at(-1),exit=createObject(1,'exit',[3,end.point[1],end.point[2]]);exit.rotation=[angle%360,0,0];map.objects=[createObject(1,'start',[-3,0,0]),twist,exit];setPathMarker(map,'start','spawn');setPathMarker(map,'exit','exit');assert.doesNotThrow(()=>parseMap(map));
  for(const text of [serializeMap(map),serializeCompactMap(map)])assert.equal(parseMap(JSON.parse(text)).objects[1].twist,angle);
  near(extrusionSamples(twist).at(-1).point,[2.5,-.5,0]);assert.ok(Math.abs(samples.at(-1).roll-angle*Math.PI/180)<1e-8);for(let i=1;i<samples.length;i++)assert.ok(Math.abs(samples[i].roll-samples[i-1].roll)<.132,'at most 7.5 degrees between samples');
  const r=new MapRuntime(map);assert.ok(r.walkTo('exit'));let underside=false;for(let i=0;i<5000&&r.walking;i++){r.tick(.01);underside ||= r.up[1]<-.95;}assert.ok(underside&&r.completed);near(r.up,end.up);
 }
 for(const angle of [36000,-36000]){const map=straight();map.objects.push({...createObject(6,'twist'),twist:angle});assert.doesNotThrow(()=>parseMap(map));}
 for(const angle of [Infinity,NaN,36001]){const map=straight();map.objects.push({...createObject(6,'twist'),twist:angle});assert.throws(()=>parseMap(map));}
});

test('arch and square gates have open holes, distinct color batches and no walk ports',()=>{
 for(const type of [18,19]){
  const o=createObject(type,'gate'),meshes=decorationMeshes(o);assert.equal(isDecoration(type),true);assert.equal(isWalkable(o),false);assert.deepEqual(pathPorts(o),[]);assert.equal(meshes.length,3);assert.deepEqual(decorationMeshes(o),meshes);
  const covered=(x,y)=>meshes.some(m=>{for(let i=0;i<m.positions.length;i+=9){if(Math.abs(m.normals[i+2])<.99)continue;const pts=[0,3,6].map(j=>[m.positions[i+j],m.positions[i+j+1]]),cross=pts.map((a,j)=>{const b=pts[(j+1)%3];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);});if(cross.every(v=>v>=-1e-7)||cross.every(v=>v<=1e-7))return true;}return false;});
  assert.equal(covered(0,o.rise*.4),false,'doorway is actually open');assert.equal(covered(.4,o.rise*.3),true,'solid jamb');assert.equal(covered(0,o.rise*.97),true,'solid arch crown / lintel');
  const map=straight();map.objects.push(o);assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(map)))),serializeMap(map));
 }
});
