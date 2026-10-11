import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {portalGarden,createObject,emptyMap,emptyPoses,bindPortal,portalAnchor,worldSample,worldSamples,walkSurfaces,findRoute,MapRuntime,parseMap,serializeMap,serializeCompactMap,playIssues,pathPorts,setPathMarker,analyzeStaticPaths} from '../valley-of-light/map/model.ts';
import {flowMeshData,flowStreakPositions,flowBounds} from '../valley-of-light/map/water.ts';
import {decorationMeshes} from '../valley-of-light/map/decorations.ts';
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-6,`${a} != ${b}`);
const run=r=>{for(let i=0;i<3000&&r.walking;i++)r.tick(.01);assert.equal(r.walking,false);};

test('both published JSON schemas and catalog accept every new component ID',()=>{
 for(const file of ['map.schema.json','compact-map.schema.json']){const schema=JSON.parse(readFileSync(new URL(`../valley-of-light/maps/${file}`,import.meta.url),'utf8'));for(const id of [20,21,22])assert.ok(schema.$defs.object.properties.type.enum.includes(id));assert.ok(schema.$defs.object.properties.portal);}
 const sample=JSON.parse(readFileSync(new URL('../valley-of-light/maps/portal-garden.json',import.meta.url),'utf8'));assert.deepEqual(playIssues(parseMap(sample)),[]);
});

test('doors join disconnected regions as explicit portal steps, with a disappearance before changing position',()=>{
 const map=portalGarden(),r=new MapRuntime(map),route=findRoute(map,r.poses,r.at,'exit');assert.ok(route.some(p=>p.portalId==='portal-a'));assert.ok(r.walkTo('exit'));
 let entering=false,appearing=false,changes=0,previous=[...r.position];
 for(let i=0;i<3000&&r.walking;i++){r.tick(.01);entering ||= r.portalState?.phase==='entering';appearing ||= r.portalState?.phase==='appearing';if(Math.hypot(...r.position.map((v,j)=>v-previous[j]))>1){changes++;assert.equal(r.portalState.phase,'appearing');assert.ok(r.portalState.scale<.01);}previous=[...r.position];}
 assert.equal(changes,1);assert.ok(entering&&appearing&&r.completed);assert.equal(r.at.objectId,'exit');
 const disconnected=portalGarden();disconnected.objects=disconnected.objects.filter(o=>o.type!==20);const blocked=new MapRuntime(disconnected);assert.equal(blocked.walkTo('exit'),false);
});

test('clicking a door teleports once; return travel is explicit and one-way receiving doors need no return target',()=>{
 const map=portalGarden(),r=new MapRuntime(map);assert.ok(r.walkTo('portal-a'));run(r);assert.equal(r.at.objectId,'door-road-b');assert.equal(r.completed,false);for(let i=0;i<100;i++)r.tick(.05);assert.equal(r.at.objectId,'door-road-b','no ping-pong');assert.ok(r.walkTo('portal-b'));run(r);assert.equal(r.at.objectId,'door-road-a');
 map.objects.find(o=>o.id==='portal-b').portal.targetId=null;assert.deepEqual(playIssues(map),[]);const oneWay=new MapRuntime(map);oneWay.walkTo('portal-a');run(oneWay);assert.equal(oneWay.walkTo('start'),false);
});

test('a new destination during the transition is queued and applied from the arrival surface',()=>{
 const r=new MapRuntime(portalGarden());r.walkTo('portal-a');while(!r.portalState)r.tick(.02);assert.ok(r.busy);assert.ok(r.walkTo('after-door'));assert.ok(r.walkTo('exit'));run(r);assert.equal(r.completed,true);assert.equal(r.at.objectId,'exit');
});

test('portals change the traveler gravity to the destination face before continuing',()=>{
 const map=portalGarden(),gate=map.objects.find(o=>o.id==='portal-b');bindPortal(map,gate.id,'door-road-b',1);setPathMarker(map,'exit','exit',1);
 const r=new MapRuntime(map);r.walkTo('exit');run(r);assert.equal(r.completed,true);near(r.up,[0,-1,0]);near(r.position,[4,1,-2]);
});

test('portal doors share their anchor normal on all six faces, including animated nested groups',()=>{
 for(const face of walkSurfaces(createObject(1,'sample'))){const map=emptyMap(),host=createObject(1,'host'),gate=createObject(20,'gate');map.objects=[host,gate];map.groups=[{id:'g',name:'g',pivot:[0,0,0],rotation:[20,30,40],position:[2,4,5],scale:[2,.8,1.2]}];host.groupId='g';bindPortal(map,'gate','host',face.face);const poses=emptyPoses();poses.groups.g={translation:[1,2,3],rotation:[0,90,0]};const anchor=portalAnchor(map,gate),sample=worldSamples(map,host,poses)[anchor.index],frame=worldSample(map,gate,{point:[0,0,0],up:[0,1,0],roll:0},poses);near(frame.point,sample.point);near(frame.up,sample.up);assert.doesNotThrow(()=>parseMap(map));}
});

test('both formats preserve directed portal references and water colors; invalid bindings fail atomically',()=>{
 const map=portalGarden();for(const text of [serializeMap(map),serializeCompactMap(map)])assert.equal(serializeMap(parseMap(JSON.parse(text))),serializeMap(map));
 const omitted=portalGarden();for(const o of omitted.objects)if([21,22].includes(o.type))delete o.water;assert.equal(serializeMap(parseMap(omitted)),serializeMap(map));
 for(const mutate of [m=>m.objects.find(o=>o.id==='portal-a').portal.targetId='absent',m=>m.objects.find(o=>o.id==='portal-a').portal.targetId='portal-a',m=>m.objects.find(o=>o.id==='portal-a').portal.pathId='stream',m=>m.objects.find(o=>o.id==='portal-a').portal.face=6,m=>m.objects.find(o=>o.id==='portal-a').position[0]=1,m=>m.objects.push({...createObject(20,'duplicate'),portal:{...m.objects.find(o=>o.id==='portal-a').portal}})]){const bad=portalGarden();mutate(bad);assert.throws(()=>parseMap(bad));}
 const plan=analyzeStaticPaths(map);assert.ok(plan.batches.flat().every(i=>![20,21,22].includes(map.objects[i].type)));
 for(const shape of ['arch','square']){const gate=createObject(20,'gate');gate.portal.shape=shape;assert.equal(decorationMeshes(gate).length,4);assert.deepEqual(pathPorts(gate),[]);}
});

test('stream and waterfall meshes are bounded, deterministic, flat faceted and animated in batches',()=>{
 for(const type of [21,22]){const o=createObject(type,'water'),mesh=flowMeshData(o),streaks=flowStreakPositions(o,0),next=flowStreakPositions(o,.4);assert.deepEqual(flowMeshData(o),mesh);assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.normals.every(Number.isFinite));assert.equal(mesh.morphTargets.length,4);assert.equal(mesh.morphUseGpu,true);assert.ok(mesh.positions.length<50000);assert.ok(streaks.length<700);assert.notDeepEqual(streaks,next);assert.equal(flowStreakPositions(o,.5,streaks),streaks,'reuses the same small vertex buffer');
  const ys=Array.from(mesh.positions).filter((_,i)=>i%3===1);if(type===22){near([Math.max(...ys)],[0]);near([Math.min(...ys)],[-o.rise]);}assert.equal(flowBounds(o).length,8);assert.deepEqual(pathPorts(o),[]);o.water.speed=0;assert.deepEqual(flowStreakPositions(o,0),flowStreakPositions(o,100));
 }
});
