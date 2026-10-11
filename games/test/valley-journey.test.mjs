import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {journeyGarden,parseMap,parseCheckpoint,serializeMap,serializeCompactMap,MapRuntime,createObject,defaultPlatform,setPathMarker,worldSamples,connections,findRoute,analyzeStaticPaths,objectState,emptyPoses,centerIndex} from '../valley-of-light/map/model.ts';
const tick=(r,time)=>{for(let i=0;i<Math.ceil(time/.01);i++)r.tick(.01);};
const walk=(r,id)=>{assert.ok(r.walkTo(id),r.message);for(let i=0;i<3000&&(r.walking||r.busy);i++)r.tick(.01);assert.equal(r.at.objectId,id);};
const base=()=>{const m=journeyGarden();m.objects.find(o=>o.id==='reveal').type=1;m.logic={variables:[{id:'count',name:'count',initial:0}],rules:[]};return m;};
const rule=(id,event,actions,condition={kind:'all',conditions:[]})=>({id,name:id,enabled:true,once:false,event,condition,actions});
const add={kind:'variable',id:'count',operation:'add',value:1};
test('platform/stage authoring survives both formats and invalid stations, cameras and competing controllers are rejected',()=>{
 const m=journeyGarden();assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(m)))),serializeMap(m));
 for(const mutate of [m=>m.groups[0].platform.stations[1].id='station-1',m=>m.groups[0].platform.initialStation='missing',m=>m.groups[0].platform.stations[1].wait=-1,m=>m.stages.items[1].camera.pitch=90,m=>m.stages.items[1].groups=['missing'],m=>m.stages.items[1].entry={objectId:'sea',face:0},m=>m.logic.rules[0].actions=[{kind:'platform',groupId:'lift',command:'go',stationId:'missing'}],m=>m.logic.rules[0].actions=[{kind:'move',groupId:'lift',translation:[0,2,0],rotation:[0,0,0],duration:1,easing:'linear'}],m=>m.groups[1].platform=defaultPlatform(),m=>m.logic.variables.push({id:'ascent',name:'same',initial:0})]){
   const broken=journeyGarden();mutate(broken);if(broken.groups[1].platform)broken.groups[1].parentId='lift';assert.throws(()=>parseMap(broken));
 }
});
test('passengers ride only after boarding, cannot leave in transit, and disembark at the new physical landing',()=>{
 const r=new MapRuntime(base());walk(r,'deck');const token=r.platformCommand('lift','go','station-2');tick(r,.6);assert.ok(r.position[1]>0&&r.position[1]<2);assert.equal(r.walking,false);assert.equal(r.walkTo('upper'),false);assert.ok(r.motionPending(token));assert.equal(findRoute(r.map,r.poses,r.at,'upper'),null);tick(r,2);assert.equal(r.position[1],2);assert.equal(r.motionPending(token),false);walk(r,'upper');assert.equal(r.position[1],2);
});
test('an empty moving platform does not block walking elsewhere or connect at a passing floor',()=>{
 const m=base();m.objects.push(createObject(1,'passing',[1,1,0]));const r=new MapRuntime(m);r.platformCommand('lift','go','station-2');tick(r,1.3);assert.equal(r.busy,false);assert.equal(connections(m,r.poses).some(c=>c.a==='deck'||c.b==='deck'),false);walk(r,'lower');assert.equal(r.position[1],0);
});
test('departure cancels stale future routes at their safe endpoint instead of teleporting across a moved port',()=>{
 const r=new MapRuntime(base());r.walkTo('deck');tick(r,.05);const before=[...r.position];r.platformCommand('lift','go','station-2');tick(r,3);assert.notEqual(r.at.objectId,'deck');assert.equal(r.walking,false);assert.ok(r.position[0]>=before[0]);assert.equal(r.position[1],0);
});
test('calling a platform during a boarding edge waits for its occupied endpoint',()=>{
 const r=new MapRuntime(base());walk(r,'lower');r.walkTo('deck');tick(r,.24);r.platformCommand('lift','go','station-2');r.tick(.01);assert.equal(r.poses.platforms.lift.targetId,null);tick(r,3);assert.equal(r.at.objectId,'deck');assert.equal(r.position[1],2);
});
test('loop/pingpong honor dwell times; pause holds midair and resume continues; queued calls finish in order',()=>{
 const m=base(),p=m.groups[0].platform;p.mode='pingpong';p.autoStart=true;p.stations.forEach(s=>{s.duration=.3;s.wait=.2;});const r=new MapRuntime(m);tick(r,.1);assert.equal(r.poses.platforms.lift.stationId,'station-1');tick(r,.2);const y=r.poses.groups.lift.translation[1];r.platformCommand('lift','pause',null);tick(r,1);assert.equal(r.poses.groups.lift.translation[1],y);r.platformCommand('lift','resume',null);tick(r,.21);assert.equal(r.poses.platforms.lift.stationId,'station-2');tick(r,.51);assert.equal(r.poses.platforms.lift.stationId,'station-1');
 const manual=new MapRuntime(base()),a=manual.platformCommand('lift','go','station-2'),b=manual.platformCommand('lift','go','station-1');tick(manual,2.5);assert.equal(manual.motionPending(a),false);assert.equal(manual.motionPending(b),true);tick(manual,3.2);assert.equal(manual.poses.platforms.lift.stationId,'station-1');assert.equal(manual.motionPending(b),false);
 p.mode='loop';p.stations.push({...structuredClone(p.stations[1]),id:'station-3',name:'Third',translation:[0,4,0]});const loop=new MapRuntime(m);tick(loop,1.55);assert.equal(loop.poses.platforms.lift.stationId,'station-1');
});
test('arrival/departure events support station filters and platform conditions; go actions wait for arrival',()=>{
 const m=base();m.logic.rules=[rule('call',{type:'start',source:null},[{kind:'platform',groupId:'lift',command:'go',stationId:'station-2'},add]),rule('depart',{type:'departure',source:'lift',stationId:'station-2'},[add],{kind:'platform',groupId:'lift',stationId:null}),rule('arrive',{type:'arrival',source:'lift',stationId:'station-2'},[add],{kind:'platform',groupId:'lift',stationId:'station-2'}),rule('wrong',{type:'arrival',source:'lift',stationId:'station-1'},[add])];const r=new MapRuntime(parseMap(m));tick(r,.4);assert.equal(r.logic.variables.count,1);tick(r,2);assert.equal(r.logic.variables.count,3);assert.equal(r.logic.counts.wrong,undefined);
});
test('rotating platforms under scaled parents carry both feet, gravity and facing consistently',()=>{
 const m=base();m.groups.push({id:'parent',name:'parent',pivot:[0,0,0],position:[2,1,3],rotation:[0,30,0],scale:[1.5,1,1.2]});m.groups[0].parentId='parent';m.groups[0].platform.stations[1].rotation=[90,90,0];setPathMarker(m,'deck','spawn');const r=new MapRuntime(m);r.platformCommand('lift','go','station-2');tick(r,3);const sample=worldSamples(m,m.objects.find(o=>o.id==='deck'),r.poses)[centerIndex(m.objects.find(o=>o.id==='deck'))];assert.deepEqual(r.position,sample.point);assert.deepEqual(r.up,sample.up);assert.ok(Math.abs(r.up.reduce((n,v,i)=>n+v*r.direction[i],0))<1e-7);
});
test('checkpoint resumes a midride and queued task; local platform reset discards its trip and keeps the current stage',()=>{
 const m=base();setPathMarker(m,'deck','spawn');m.logic.rules=[rule('call',{type:'start',source:null},[{kind:'platform',groupId:'lift',command:'go',stationId:'station-2'},add])];const r=new MapRuntime(m);tick(r,.8);r.requestCheckpoint('半空');r.tick(0);const saved=r.exportCheckpoint();assert.doesNotThrow(()=>parseCheckpoint(saved,m));const fresh=new MapRuntime(m);assert.ok(fresh.loadCheckpoint(saved));assert.deepEqual(fresh.position,r.position);tick(fresh,2);assert.equal(fresh.logic.variables.count,1);assert.equal(fresh.position[1],2);fresh.resetGroup('lift');assert.equal(fresh.position[1],0);assert.equal(fresh.poses.platforms.lift.targetId,null);assert.equal(fresh.poses.stageId,'ascent');
 const bad=structuredClone(saved);bad.poses.platforms.lift.targetId='missing';assert.equal(fresh.loadCheckpoint(bad),false);
});
test('stages change visibility/navigation and wait for safe movement; entry handles disappearing floors and bad entry refuses atomically',()=>{
 const m=base(),r=new MapRuntime(m);assert.equal(objectState(m,m.objects.find(o=>o.id==='exit'),r.poses).visible,false);r.walkTo('lower');tick(r,.04);r.queueStage('garden');r.tick(.01);assert.equal(r.poses.stageId,'ascent');tick(r,1.5);assert.equal(r.poses.stageId,'garden');assert.equal(r.sceneTransition,false);assert.equal(objectState(m,m.objects.find(o=>o.id==='exit'),r.poses).visible,true);
 const h=base();h.objects.find(o=>o.id==='start').groupId='courtyard';h.stages.initial='garden';const hidden=new MapRuntime(h);hidden.queueStage('ascent');hidden.tick(0);assert.equal(hidden.poses.stageId,'garden');h.stages.items[0].entry={objectId:'lower',face:0};const valid=new MapRuntime(h);valid.queueStage('ascent');valid.tick(0);assert.equal(valid.at.objectId,'lower');assert.equal(valid.poses.stageId,'ascent');
});
test('stage actions wait for ordinary animations and camera completion; hidden platforms freeze and stage progress restores',()=>{
 const m=base();m.logic.rules=[rule('phase',{type:'start',source:null},[{kind:'parallel',actions:[{kind:'move',groupId:'courtyard',translation:[0,0,1],rotation:[0,0,0],duration:.3,easing:'linear'},{kind:'stage',stageId:'garden'}]},add])];const r=new MapRuntime(m);tick(r,.2);assert.equal(r.poses.stageId,'ascent');tick(r,.2);assert.equal(r.poses.stageId,'garden');assert.equal(r.sceneTransition,true);assert.equal(r.logic.variables.count,0);tick(r,1.2);assert.equal(r.logic.variables.count,1);r.requestCheckpoint('花园');r.tick(0);r.queueStage('ascent');tick(r,1.2);assert.equal(r.poses.stageId,'ascent');r.restoreCheckpoint();assert.equal(r.poses.stageId,'garden');assert.ok(r.poses.visitedStages.includes('garden'));
 const hidden=base();hidden.stages.items[1].groups.push('lift');hidden.groups[0].platform.autoStart=true;hidden.groups[0].platform.mode='loop';const frozen=new MapRuntime(hidden);tick(frozen,4);assert.equal(frozen.poses.platforms.lift.stationId,'station-1');assert.deepEqual(frozen.poses.groups.lift.translation,[0,0,0]);
});
test('demonstration rides upstairs, saves checkpoint, reveals garden with stage event, reaches exit and restores the earlier stage',()=>{
 const m=journeyGarden(),r=new MapRuntime(m),original=serializeMap(m);walk(r,'deck');tick(r,3);assert.equal(r.poses.platforms.lift.stationId,'station-2');walk(r,'upper');assert.equal(r.checkpointInfo.name,'云端灯塔');walk(r,'reveal');tick(r,1.5);assert.equal(r.poses.stageId,'garden');walk(r,'exit');assert.ok(r.completed);r.restoreCheckpoint();assert.equal(r.poses.stageId,'ascent');assert.equal(r.at.objectId,'upper');assert.equal(objectState(m,m.objects.find(o=>o.id==='exit'),r.poses).visible,false);assert.equal(serializeMap(m),original);
});
test('static merging excludes every platform and stage-controlled descendant including attached ornaments',()=>{
 const m=base(),pillar=createObject(12,'pillar');pillar.attachment={pathId:'deck',corner:0};m.objects.push(pillar);const batched=analyzeStaticPaths(m).batches.flat().map(i=>m.objects[i].id);for(const id of ['deck','entry','exit','pillar'])assert.equal(batched.includes(id),false);assert.ok(batched.includes('lower'));assert.doesNotThrow(()=>parseMap(JSON.parse(serializeCompactMap(m))));
});

test('rejected stages cancel the requesting action chain; checkpoint-triggered stages finish before saving without duplicate events',()=>{
 const m=base();m.objects.find(o=>o.id==='start').groupId='courtyard';m.stages.initial='garden';m.logic.rules=[rule('unsafe',{type:'start',source:null},[{kind:'stage',stageId:'ascent'},add])];const refused=new MapRuntime(m);tick(refused,2);assert.equal(refused.poses.stageId,'garden');assert.equal(refused.logic.variables.count,0);assert.equal(refused.sceneTransition,false);
 const saving=base();saving.logic.rules=[rule('save-stage',{type:'checkpoint',source:null},[add,{kind:'stage',stageId:'garden'},add])];const r=new MapRuntime(saving);r.requestCheckpoint('展开后的庭院');r.tick(0);assert.equal(r.exportCheckpoint(),null);tick(r,2);const saved=r.exportCheckpoint();assert.equal(saved.poses.stageId,'garden');assert.equal(saved.logic.variables.count,2);assert.equal(r.logic.counts['save-stage'],1);const fresh=new MapRuntime(saving);assert.ok(fresh.loadCheckpoint(saved));assert.equal(fresh.sceneTransition,false);assert.equal(fresh.poses.stageId,'garden');assert.equal(fresh.logic.variables.count,2);
});

test('published schemas expose stage/platform configuration and all new rule extensions',()=>{
 const full=JSON.parse(readFileSync(new URL('../valley-of-light/maps/map.schema.json',import.meta.url))),compact=JSON.parse(readFileSync(new URL('../valley-of-light/maps/compact-map.schema.json',import.meta.url)));
 assert.equal(full.properties.stages.$ref,'#/$defs/stages');assert.equal(compact.properties.stages.$ref,'map.schema.json#/$defs/stages');assert.equal(full.$defs.group.properties.platform.$ref,'#/$defs/platform');
 for(const event of ['departure','arrival','stage'])assert.ok(full.$defs.logicEvent.properties.type.enum.includes(event));
 for(const kind of ['platform','stage'])for(const def of ['logicCondition','logicAction'])assert.ok(full.$defs[def].oneOf.some(a=>a.properties.kind.const===kind));
});

test('returning to the initial fallback also restores stage commands queued by start events',()=>{
 const m=base();m.logic.rules=[rule('intro',{type:'start',source:null},[{kind:'stage',stageId:'garden'},add])];const r=new MapRuntime(m);tick(r,2);assert.equal(r.poses.stageId,'garden');assert.equal(r.logic.variables.count,1);r.restoreCheckpoint();assert.equal(r.poses.stageId,'ascent');assert.equal(r.sceneTransition,true);tick(r,2);assert.equal(r.poses.stageId,'garden');assert.equal(r.logic.variables.count,1);assert.equal(r.logic.counts.intro,1);
});
