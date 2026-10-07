import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, MapRuntime, catalogGarden, centerIndex, connections, createObject, emptyMap, emptyPoses, findRoute, localSamples, parseMap, pathPorts, playIssues, prismOutline, project, serializeMap, splitCube, splitGarden, switchGarden, worldSamples } from '../valley-of-light/map/model.ts';

const tickUntil=(runtime,predicate)=>{for(let i=0;i<3000;i++){runtime.tick(.02);if(predicate())return;}assert.fail('runtime did not reach expected state');};
test('stable numbered catalog, JSON round trip, unknown IDs and dangling references',()=>{
  assert.deepEqual(CATALOG.map(x=>x.type),[1,2,3,4,5,6,7,8,9,10]);
  const m=catalogGarden();assert.deepEqual(parseMap(JSON.parse(serializeMap(m))),m);
  for(const mutate of [m=>m.objects[0].type=99,m=>m.version=2,m=>m.objects[1].id=m.objects[0].id,m=>m.objects[0].position[0]=Infinity,m=>m.objects[0].groupId='missing',m=>m.objects[7].trigger.actions[0].duration=0,m=>m.opticalLinks.push({a:'missing',b:'sample-1',aEnd:1,bEnd:0})]){const invalid=structuredClone(m);mutate(invalid);assert.throws(()=>parseMap(invalid));}
  assert.equal(playIssues(emptyMap()).length,2);
  for(const id of ['__proto__','constructor','prototype']){const invalid=structuredClone(m);invalid.groups[0].id=id;assert.throws(()=>parseMap(invalid));}
});
test('stairs have real stepped elevations; twist rotates surface normal; arc follows radius',()=>{
  const stairs=createObject(2,'stairs'),s=localSamples(stairs);assert.equal(s[0].point[1],0);assert.equal(s.at(-1).point[1],stairs.rise);assert.equal(s.length,stairs.steps*2+1);
  const twist=createObject(6,'twist');twist.twist=180;assert.ok(Math.abs(localSamples(twist).at(-1).up[1]+1)<1e-8);
  const arc=createObject(7,'arc');for(const p of localSamples(arc))assert.ok(Math.abs(Math.hypot(p.point[0],p.point[2]-arc.radius)-arc.radius)<1e-8);
});
test('optical connections require authored ports and coincident projection',()=>{
  const m=emptyMap();m.objects=[createObject(1,'a',[0,0,0]),createObject(1,'b',[4,3,3])];
  assert.equal(connections(m,emptyPoses()).length,0);
  m.opticalLinks=[{a:'a',aEnd:1,b:'b',bEnd:0}];assert.equal(connections(m,emptyPoses()).length,1);
  const a=worldSamples(m,m.objects[0],emptyPoses())[2].point,b=worldSamples(m,m.objects[1],emptyPoses())[0].point;assert.deepEqual(project(a),project(b));
  m.objects[1].position[0]+=.2;assert.equal(connections(m,emptyPoses()).length,0);
});
test('pressure plates animate whole groups, rebuild routes and open the exit',()=>{
  const m=switchGarden(),r=new MapRuntime(m);
  assert.equal(r.walkTo('exit'),false);assert.equal(r.walkTo('switch-lift'),true);
  tickUntil(r,()=>r.busy);assert.deepEqual([...r.fired],['switch-lift']);assert.equal(r.walkTo('switch-turn'),false);
  r.tick(.1);assert.ok(r.poses.groups.sliding.translation[2]<0&&r.poses.groups.sliding.translation[2]>-3);
  tickUntil(r,()=>!r.busy);assert.deepEqual(r.poses.groups.sliding.translation,[0,0,-3]);
  assert.equal(findRoute(m,r.poses,r.at,'exit'),null);
  assert.equal(r.walkTo('switch-turn'),true);tickUntil(r,()=>r.busy);tickUntil(r,()=>!r.busy);
  assert.deepEqual(r.poses.groups.turning.rotation,[0,-90,0]);
  assert.ok(connections(m,r.poses).length>=6);assert.equal(r.walkTo('exit'),true);tickUntil(r,()=>r.completed);
  assert.equal(r.at.objectId,'exit');assert.deepEqual(r.position,[4,0,0]);assert.equal(r.fired.size,2);
  assert.deepEqual(m,switchGarden(),'play must not mutate the authored JSON');
});

test('unit paths are cubes and adjacent cells support right-angle turns',()=>{
  const map=emptyMap();map.objects=[createObject(9,'start'),createObject(1,'corner',[1,0,0]),createObject(10,'exit',[1,0,1])];
  for(const o of map.objects)assert.deepEqual([o.length,o.width,o.thickness],[1,1,1]);
  const runtime=new MapRuntime(map);assert.equal(runtime.walkTo('exit'),true);tickUntil(runtime,()=>runtime.completed);assert.deepEqual(runtime.position,[1,0,1]);
});

test('A/B prisms are complementary half-cubes, with matched diagonal projections at distinct depths',()=>{
  const map=splitGarden(),a=map.objects.find(o=>o.id==='half-a'),b=map.objects.find(o=>o.id==='half-b');
  for(const o of [a,b]){const tri=prismOutline(o);const twiceArea=Math.abs(tri.reduce((sum,p,i)=>{const q=tri[(i+1)%3];return sum+p[0]*q[2]-q[0]*p[2];},0));assert.equal(twiceArea/2*o.thickness,.5);}
  const insideA=(x,z)=>x<=z,insideB=(x,z)=>x>=z;
  for(let x=-.45;x<.5;x+=.1)for(let z=-.44;z<.5;z+=.1)assert.notEqual(insideA(x,z),insideB(x,z));
  assert.notDeepEqual(a.position,b.position);
  for(const p of [[-.5,0,-.5],[.5,0,.5],[-.5,-1,-.5],[.5,-1,.5]])assert.deepEqual(project(p),project(p.map((v,i)=>v+b.position[i])));
  assert.deepEqual(pathPorts(a).map(p=>p.port),[0,3,4]);assert.deepEqual(pathPorts(b).map(p=>p.port),[1,2,4]);
  assert.deepEqual(parseMap(JSON.parse(serializeMap(map))),map);
  const runtime=new MapRuntime(map);assert.equal(runtime.walkTo('exit'),true);let depthJump=false;
  for(let i=0;i<1000&&!runtime.completed;i++){const before=[...runtime.position],p=project(before);runtime.tick(.02);const q=project(runtime.position);assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<.053,'screen-space walking must stay continuous');if(Math.hypot(...runtime.position.map((v,j)=>v-before[j]))>4)depthJump=true;}
  assert.equal(depthJump,true);assert.equal(runtime.completed,true);assert.deepEqual(runtime.position,[5,3,3]);
  b.rotation[1]=90;assert.equal(connections(map,emptyPoses()).some(c=>c.illusion),false,'a matching midpoint is insufficient when diagonal faces differ');b.rotation[1]=0;
  b.rotation[1]=180;assert.equal(connections(map,emptyPoses()).some(c=>c.illusion),false,'overlapping the same projected half cannot open a route');b.rotation[1]=0;
  b.prismHalf='a';assert.equal(connections(map,emptyPoses()).some(c=>c.illusion),false,'two identical halves cannot form a cube');b.prismHalf='b';
  map.objects.find(o=>o.id==='half-b').position[0]+=.2;
  assert.equal(connections(map,emptyPoses()).some(c=>c.illusion),false);assert.equal(new MapRuntime(map).walkTo('exit'),false);
});

test('splitting preserves each outer port and transfers existing links to the correct half',()=>{
  const map=emptyMap();map.objects=[createObject(1,'cube'),createObject(1,'far',[4,3,3])];map.opticalLinks=[{a:'cube',aEnd:1,b:'far',bEnd:0}];
  splitCube(map,'cube','half-b',3);assert.equal(map.opticalLinks[0].a,'half-b');assert.deepEqual(map.opticalLinks[1],{a:'cube',aEnd:4,b:'half-b',bEnd:4});assert.doesNotThrow(()=>parseMap(map));
  assert.throws(()=>splitCube(map,'cube','bad',3),/普通方块/);
  const old=createObject(1,'legacy');old.length=2;old.thickness=.4;delete old.prismHalf;
  const legacy=emptyMap();legacy.objects=[old];const imported=parseMap(legacy);assert.equal(imported.objects[0].length,2);assert.equal(imported.objects[0].thickness,.4);assert.equal(imported.objects[0].prismHalf,'a');
});
test('toggle plate fires on re-entry, not every frame while occupied',()=>{
  const m=switchGarden();m.objects.find(o=>o.type===8).trigger.mode='toggle';const r=new MapRuntime(m);
  r.walkTo('switch-lift');tickUntil(r,()=>r.busy);tickUntil(r,()=>!r.busy);
  for(let i=0;i<200;i++)r.tick(.02);assert.equal(r.switches['switch-lift'],true);
  r.walkTo('start');tickUntil(r,()=>!r.walking);r.walkTo('switch-lift');tickUntil(r,()=>r.busy);tickUntil(r,()=>!r.busy);
  assert.equal(r.switches['switch-lift'],false);assert.deepEqual(r.poses.groups.sliding.translation,[0,0,0]);
});
test('drag constraints and occupied-group locks are enforced by the shared runtime',()=>{
  const m=switchGarden();const turn=createObject(3,'drag');turn.motion.targetGroup='sliding';m.objects.push(turn);const r=new MapRuntime(m);
  assert.equal(r.dragTo('drag',132,true),true);assert.equal(r.poses.mechanisms.drag,90);
  assert.equal(r.dragTo('drag',500,true),true);assert.equal(r.poses.mechanisms.drag,180);
  r.at={objectId:'moving-a',index:1};assert.equal(r.canDrag('drag'),false);
});
