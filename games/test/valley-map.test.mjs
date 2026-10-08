import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, MapRuntime, catalogGarden, centerIndex, connections, createObject, emptyMap, emptyPoses, findRoute, localSamples, parseMap, pathPorts, playIssues, prismOutline, project, serializeMap, splitCube, splitGarden, switchGarden, seasideGarden, waterHeight, wheelFrame, groupPoint, detachPillar, worldSample, worldSamples, rotate } from '../valley-of-light/map/model.ts';

const tickUntil=(runtime,predicate)=>{for(let i=0;i<3000;i++){runtime.tick(.02);if(predicate())return;}assert.fail('runtime did not reach expected state');};
test('stable numbered catalog, JSON round trip, unknown IDs and dangling references',()=>{
  assert.deepEqual(CATALOG.map(x=>x.type),[1,2,3,4,5,6,7,8,9,10,11,12]);
  const m=catalogGarden();assert.deepEqual(parseMap(JSON.parse(serializeMap(m))),m);
  for(const mutate of [m=>m.objects[0].type=99,m=>m.version=99,m=>m.objects[1].id=m.objects[0].id,m=>m.objects[0].position[0]=Infinity,m=>m.objects[0].groupId='missing',m=>m.objects[7].trigger.actions[0].duration=0,m=>m.opticalLinks.push({a:'missing',b:'sample-1',aEnd:1,bEnd:0})]){const invalid=structuredClone(m);mutate(invalid);assert.throws(()=>parseMap(invalid));}
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
  assert.equal(r.at.objectId,'exit');assert.deepEqual(r.position,[5,0,0]);assert.equal(r.fired.size,2);
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
  assert.deepEqual(pathPorts(a).filter(p=>p.face===0).map(p=>p.port),[0,3,4]);assert.deepEqual(pathPorts(b).filter(p=>p.face===0).map(p=>p.port),[1,2,4]);
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

test('prism rotations keep both halves inside their original cube and preserve the shared cut',()=>{
  const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8,`${a} != ${b}`);
  const map=emptyMap(),poses=emptyPoses(),position=[3,2,-4];
  const a=createObject(5,'a',[...position]),b=createObject(5,'b',[...position]);b.prismHalf='b';map.objects=[a,b];
  const sample=(o,point)=>worldSample(map,o,{point,up:[0,1,0],roll:0},poses);
  for(const [rotation,top,up] of [
    [[90,0,0],[3,1.5,-3.5],[0,0,1]],
    [[0,90,0],[3,2,-4],[0,1,0]],
    [[0,0,90],[2.5,1.5,-4],[-1,0,0]],
    [[180,0,0],[3,1,-4],[0,-1,0]],
  ]){
    for(const o of [a,b]){
      o.rotation=rotation;near(sample(o,[0,-.5,0]).point,[3,1.5,-4]);near(sample(o,[0,0,0]).point,top);near(sample(o,[0,0,0]).up,up);
      const vertices=[0,-1].flatMap(y=>prismOutline(o).map(p=>sample(o,[p[0],y,p[2]]).point));
      near([0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),[2.5,1,-4.5]);
      near([0,1,2].map(i=>Math.max(...vertices.map(p=>p[i]))),[3.5,2,-3.5]);
      assert.deepEqual(o.position,position);
    }
    assert.ok(connections(map,poses).some(c=>c.aIndex===3&&c.bIndex===3&&!c.illusion),'complementary cut faces remain connected');
  }
  for(const o of [a,b]){
    o.thickness=2;o.rotation=[27,63,-41];near(sample(o,[0,-1,0]).point,[3,1,-4]);
    o.groupId='moving';
  }
  map.groups=[{id:'moving',name:'Moving',pivot:[0,0,0]}];poses.groups.moving={translation:[1,0,2],rotation:[0,90,0]};
  for(const o of [a,b])near(sample(o,[0,-1,0]).point,[-3,1,-1]);
  assert.deepEqual(parseMap(JSON.parse(serializeMap(map))),map);
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
test('wheels rotate continuously while sliders retain their limits and occupied groups stay locked',()=>{
  const m=switchGarden();const turn=createObject(3,'drag');turn.motion.targetGroup='sliding';m.objects.push(turn);const r=new MapRuntime(m);
  assert.equal(r.dragTo('drag',132,true),true);assert.equal(r.poses.mechanisms.drag,90);
  assert.equal(r.dragTo('drag',500,true),true);assert.equal(r.poses.mechanisms.drag,540);
  assert.equal(r.dragTo('drag',-805,true),true);assert.equal(r.poses.mechanisms.drag,-810);
  assert.equal(r.dragTo('drag',Infinity),false);assert.equal(r.poses.mechanisms.drag,-810);
  const slider=createObject(4,'slider');m.objects.push(slider);r.dragTo('slider',20,true);assert.equal(r.poses.mechanisms.slider,slider.motion.max);r.dragTo('slider',-20,true);assert.equal(r.poses.mechanisms.slider,slider.motion.min);
  r.at={objectId:'moving-a',index:1};assert.equal(r.canDrag('drag'),false);
});

test('orbiting breaks optical seams but leaves physical routes connected',()=>{
  const map=splitGarden(),side=p=>[p[0],p[1]];
  assert.equal(connections(map,emptyPoses(),side).filter(c=>c.illusion).length,0);
  const r=new MapRuntime(map,side);assert.equal(r.walkTo('exit'),false);assert.equal(r.walkTo('approach'),true);
  tickUntil(r,()=>!r.walking);assert.deepEqual(r.position,[-1,0,0]);
  assert.equal(new MapRuntime(map,project).walkTo('exit'),true);
  map.objects.find(o=>o.id==='half-b').position=[...map.objects.find(o=>o.id==='half-a').position];
  assert.ok(connections(map,emptyPoses(),side).some(c=>c.a==='half-a'&&c.b==='half-b'&&!c.illusion),'a real shared cut stays connected independently of camera orientation');
});

test('new examples use integer anchors; palettes round-trip and legacy maps receive defaults',()=>{
  for(const map of [catalogGarden(),switchGarden(),splitGarden()])for(const o of map.objects)assert.ok(o.position.every(Number.isInteger),o.id);
  const map=catalogGarden(),wheel=map.objects.find(o=>o.type===3);wheel.colors.hub='#123ABC';
  assert.equal(parseMap(JSON.parse(serializeMap(map))).objects.find(o=>o.type===3).colors.hub,'#123ABC');
  wheel.colors.hub='red';assert.throws(()=>parseMap(map),/配色/);delete wheel.colors;
  assert.equal(parseMap(map).objects.find(o=>o.type===3).colors.hub,'#ed7657');
});


test('wheel shaft follows authored local axes and self rotation keeps the block and spindle centers fixed',()=>{
  for(const axis of ['x','y','z']){
    const map=emptyMap(),wheel=createObject(3,'wheel');wheel.motion.axis=axis;wheel.rotation=[20,35,10];map.objects=[wheel];const poses=emptyPoses(),before=wheelFrame(map,wheel,poses);
    const expected=rotate([axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0],wheel.rotation);assert.ok(Math.hypot(...before.axis.map((v,i)=>v-expected[i]))<1e-8);
    const body=worldSample(map,wheel,{point:[0,-.5,0],up:[0,1,0],roll:0},poses).point;assert.deepEqual(body,[0,-.5,0]);
    poses.mechanisms.wheel=73;const after=wheelFrame(map,wheel,poses);for(let i=0;i<3;i++)assert.ok(Math.abs(before.center[i]-after.center[i])<1e-8);
  }
});

test('water and pillars cannot create routes; sea stays bounded and columns follow their host',()=>{
  const map=seasideGarden(),r=new MapRuntime(map),sea=map.objects.find(o=>o.type===11),pillar=map.objects.find(o=>o.id==='pillar-0'),host=map.objects.find(o=>o.id==='colonnade');
  assert.deepEqual(pathPorts(sea),[]);assert.deepEqual(pathPorts(pillar),[]);assert.equal(r.walkTo('sea'),false);assert.equal(r.walkTo('pillar-0'),false);assert.equal(r.walkTo('exit'),false);
  const start=worldSamples(map,pillar,emptyPoses())[0].point;assert.deepEqual(start,[-.5,0,-.5]);host.position=[2,1,0];host.rotation=[0,90,0];assert.ok(Math.hypot(...worldSamples(map,pillar,emptyPoses())[0].point.map((v,i)=>v-[1.5,1,.5][i]))<1e-8);
  for(let t=0;t<30;t+=.3)assert.ok(Math.abs(waterHeight(1,2,t,sea.water))<=sea.water.amplitude);assert.notEqual(waterHeight(1,2,0,sea.water),waterHeight(1,2,2,sea.water));
  assert.deepEqual(parseMap(JSON.parse(serializeMap(map))),map);
  const playable=new MapRuntime(seasideGarden());assert.equal(playable.dragTo('wheel',-810,true),true);assert.equal(playable.walkTo('exit'),true);tickUntil(playable,()=>playable.completed);
});


test('handwheel group rotation uses its block center even when the group pivot is elsewhere',()=>{
  const map=seasideGarden(),poses=emptyPoses(),wheel=map.objects.find(o=>o.id==='wheel');map.groups[0].pivot=[-40,20,17];poses.mechanisms.wheel=-90;
  const cp=[3,-.5,0],q=groupPoint(map,'bridge',cp,poses);assert.ok(Math.hypot(...q.map((v,i)=>v-cp[i]))<1e-8);
  const road=map.objects.find(o=>o.id==='bridge-1'),end=worldSamples(map,road,poses)[1].point;assert.ok(Math.hypot(...end.map((v,i)=>v-[4,0,0][i]))<1e-8);
  wheel.position=[5,0,0];const moved=groupPoint(map,'bridge',[5,-.5,0],poses);assert.ok(Math.hypot(...moved.map((v,i)=>v-[5,-.5,0][i]))<1e-8);
});

test('detaching a corner pillar preserves its position, tilt and inherited group',()=>{
  for(const rotation of [[28,63,-19],[90,40,0],[-90,0,0]]){
    const map=emptyMap(),host=createObject(1,'host',[3,2,1]),pillar=createObject(12,'pillar');host.rotation=rotation;host.groupId='moving';pillar.rotation=[17,8,-12];pillar.attachment={pathId:'host',corner:2};map.groups=[{id:'moving',name:'Moving',pivot:[0,0,0]}];map.objects=[host,pillar];
    const samples=[[0,0,0],[0,1.8,0],[1,0,0]],before=samples.map(point=>worldSample(map,pillar,{point,up:[0,1,0],roll:0},emptyPoses()).point);
    detachPillar(map,pillar);assert.equal(pillar.attachment,null);assert.equal(pillar.groupId,'moving');
    for(let i=0;i<samples.length;i++){const after=worldSample(map,pillar,{point:samples[i],up:[0,1,0],roll:0},emptyPoses()).point;assert.ok(Math.hypot(...after.map((v,j)=>v-before[i][j]))<1e-8);}
  }
});

test('authored wheel orientation rotates its whole assembly about the block center and drives the oriented axis',()=>{
  const map=seasideGarden(),wheel=map.objects.find(o=>o.id==='wheel'),poses=emptyPoses(),cp=[3,-.5,0],near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8,`${a} != ${b}`);
  for(const [rotation,axis] of [[[0,90,0],[1,0,0]],[[90,0,0],[0,-1,0]],[[0,0,30],[0,0,1]]]){
    wheel.rotation=rotation;const f=wheelFrame(map,wheel,poses);near(f.axis,axis);near(f.center,cp.map((v,i)=>v+axis[i]*1.15));near(worldSample(map,wheel,{point:[0,-.5,0],up:[0,1,0],roll:0},poses).point,cp);
  }
  wheel.rotation=[0,90,0];poses.mechanisms.wheel=90;near(groupPoint(map,'bridge',[3,.5,0],poses),[3,-.5,1]);near(groupPoint(map,'bridge',cp,poses),cp);
  map.groups.push({id:'carrier',name:'Carrier',pivot:[0,0,0]});wheel.groupId='carrier';poses.groups.carrier={rotation:[0,0,90],translation:[1,0,0]};near(wheelFrame(map,wheel,poses).axis,[0,1,0]);near(groupPoint(map,'bridge',[1.5,3,1],poses),[2.5,3,0]);
  wheel.groupId='bridge';delete poses.groups.carrier;poses.mechanisms.wheel=0;const before=wheelFrame(map,wheel,poses);poses.mechanisms.wheel=90;const after=wheelFrame(map,wheel,poses);near(before.center,after.center);near(before.right,after.right);near(before.up,after.up);
});
